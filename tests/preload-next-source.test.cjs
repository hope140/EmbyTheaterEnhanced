'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {prepare} = require('../src/electronapp/enhanced/preload-next-source');
const diagnostics = require('../src/electronapp/enhanced/playback-range-diagnostics');
const identityRecovery = require('../src/electronapp/resolvers/strm-identity-recovery');
const ORIGIN = 'https://emby.invalid';
const native = ORIGIN + '/media/next.mkv?signature=one%2Btwo&expires=7';
const source = overrides => ({Id: 'source-next', Protocol: 'Http', Path: native, Container: 'mkv', SupportsDirectPlay: true, SupportsDirectStream: true, ...overrides});
function response(value, options = {}) {
    const chunks = options.chunks || [new TextEncoder().encode(JSON.stringify(value))];
    let index = 0;
    const state = {cancelled: false, released: false, reads: 0};
    return {status: options.status || 200, url: options.url || ORIGIN + '/response', state,
        body: {async cancel() {state.cancelled = true;}, getReader() {return {async read() {
            state.reads++; if (options.onRead) options.onRead(state.reads);
            return index < chunks.length ? {value: chunks[index++], done: false} : {done: true};
        }, async cancel() {state.cancelled = true;}, releaseLock() {state.released = true;}};}}};
}
function fixture(overrides = {}) {
    const calls = [], urls = [], authorizations = [], profiles = [], contexts = [];
    const item = {Id: 'next', ServerId: 'server', MediaType: 'Video', Type: 'Episode', SeriesId: 'series', Path: '/sidecars/next.strm', MediaSources: [source()]};
    const options = {
        api: {serverAddress: () => ORIGIN, getCurrentUserId: () => 'user', deviceId: () => 'device', accessToken: () => 'secret-token',
            getUrl(route, params) {
                urls.push({route, params}); const url = new URL(route, ORIGIN + '/');
                for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, String(value));
                return url.href;
            },
            setAuthorizationInfoIntoRequest(request) {authorizations.push(request.url); request.headers['X-Emby-Token'] = 'secret-token';},
            getPlaybackInfo() {throw Error('shared-unbounded-playback-info-must-not-run');},
            reportPlaybackStart() {throw Error('must-not-report');}, reportPlaybackProgress() {throw Error('must-not-report');}
        },
        player: {getDeviceProfile: async value => {profiles.push(value); return {DirectPlayProfiles: [{Container: 'mkv'}]};}, getDirectPlayProtocols: () => ['File', 'Http']},
        item, currentSessionId: 'current-owner', requestId: 'preload-request', signal: new AbortController().signal,
        fetch: async (url, request) => {calls.push({url, request}); return response({MediaSources: [source()], PlaySessionId: 'new-unowned-session'});},
        recoverIdentity: identityRecovery.recover,
        resolveSource: async (context, controls) => {contexts.push({context, controls}); return {type: 'native', source: context.nativeSource};},
        ...overrides
    };
    return {options, calls, urls, authorizations, profiles, contexts, item};
}
async function refused(options, reason) {
    await assert.rejects(prepare(options), error => {
        assert.equal(error.preloadReason, reason);
        assert.doesNotMatch(error.message, /PRIVATE_CANARY|secret-token|outside\.invalid/);
        return true;
    });
}

test('UMD AMD declares only the maintained diagnostics dependency', () => {
    let exported;
    const define = (deps, factory) => {assert.deepEqual(Array.from(deps), ['./playback-range-diagnostics.js']); exported = factory(diagnostics);};
    define.amd = {};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/electronapp/enhanced/preload-next-source.js'), 'utf8'), {define});
    assert.equal(typeof exported.prepare, 'function');
});

test('non-playing POST mirrors PlaybackInfo endpoint/options/profile and keeps the current session owner', async () => {
    const f = fixture(), before = JSON.stringify(f.item); const result = await prepare(f.options);
    const request = f.calls[0].request, url = new URL(f.calls[0].url);
    assert.equal(url.pathname, '/Items/next/PlaybackInfo');
    assert.deepEqual(Object.fromEntries(url.searchParams), {UserId: 'user', StartTimeTicks: '0', IsPlayback: 'false', AutoOpenLiveStream: 'false', DirectPlayProtocols: 'File,Http'});
    assert.equal(request.method, 'POST'); assert.equal(request.redirect, 'error'); assert.equal(request.credentials, 'same-origin'); assert.equal(request.signal, f.options.signal);
    assert.equal(request.headers['content-type'], 'application/json'); assert.equal(request.headers['X-Emby-Token'], 'secret-token');
    assert.deepEqual(JSON.parse(request.body), {DeviceProfile: {DirectPlayProfiles: [{Container: 'mkv'}]}});
    assert.notEqual(f.profiles[0], f.item); assert.equal(f.calls.length, 1);
    assert.equal(f.contexts[0].context.streamInfo.playSessionId, 'current-owner');
    assert.equal(JSON.stringify(f.item), before); assert.doesNotMatch(JSON.stringify(result), /new-unowned-session/);
    assert.deepEqual(result, {source: native, mediaSourceId: 'source-next', mode: 'DirectPlay', container: 'mkv', live: false, type: 'native'});
});

test('probe suppression uses the original player capability and resolver context keeps sidecar/source identities distinct', async () => {
    const f = fixture(); f.options.player.enableMediaProbe = () => false;
    f.options.resolveSource = async (context, controls) => {
        assert.equal(context.sidecarPath, '/sidecars/next.strm'); assert.equal(context.sourcePath, native); assert.equal(context.nativeSource, native);
        assert.equal(context.playMethod, 'DirectPlay'); assert.equal(context.streamInfo.url, native);
        assert.equal(controls.signal, f.options.signal); assert.equal(controls.requestId, 'preload-request');
        context.item.MediaSources[0].Path = 'changed'; context.mediaSource.Path = 'resolver-change';
        return {source: native, type: 'native'};
    };
    const before = JSON.stringify(f.item); await prepare(f.options);
    assert.equal(f.urls[0].params.EnableMediaProbe, false); assert.equal(JSON.stringify(f.item), before);
});

test('missing Item.Path reuses original identity recovery through a bounded Fields:Path facade', async () => {
    const f = fixture(); delete f.item.Path;
    f.options.fetch = async (url, request) => {
        f.calls.push({url, request});
        return request.method === 'POST' ? response({MediaSources: [source()]}) : response({Id: 'next', Path: '/recovered/next.strm'});
    };
    f.options.api.getItem = () => {throw Error('shared-unbounded-getItem-must-not-run');};
    f.options.resolveSource = async context => {
        assert.equal(context.sidecarPath, '/recovered/next.strm'); assert.equal(context.item.Path, undefined); assert.equal(context.sourcePath, native);
        return {source: native};
    };
    await prepare(f.options);
    assert.equal(f.calls.length, 2); const recovery = f.calls[1];
    assert.equal(new URL(recovery.url).pathname, '/Users/user/Items/next'); assert.equal(new URL(recovery.url).searchParams.get('Fields'), 'Path');
    assert.equal(recovery.request.method, 'GET'); assert.equal(recovery.request.redirect, 'error'); assert.equal(recovery.request.credentials, 'same-origin');
    assert.ok(recovery.request.signal instanceof AbortSignal); assert.equal(f.item.Path, undefined);
});

test('recovery facade honors the fourth signal and cannot fetch another item or account', async () => {
    const f = fixture(), recoverySignal = new AbortController().signal; delete f.item.Path;
    f.options.fetch = async (url, request) => {f.calls.push({url, request}); return request.method === 'POST' ? response({MediaSources: [source()]}) : response({Path: '/recovered.strm'});};
    f.options.recoverIdentity = async ({item, connectionManager}) => {
        assert.throws(() => connectionManager.getApiClient('other'), /preload-next-source/);
        const api = connectionManager.getApiClient(item.ServerId);
        await assert.rejects(api.getItem('other-user', item.Id, {Fields: 'Path'}, recoverySignal));
        await assert.rejects(api.getItem('user', 'other-item', {Fields: 'Path'}, recoverySignal));
        await assert.rejects(api.getItem('user', item.Id, {Fields: 'MediaSources'}, recoverySignal));
        const recovered = await api.getItem('user', item.Id, {Fields: 'Path'}, recoverySignal);
        return {recoveredPath: recovered.Path};
    };
    await prepare(f.options); assert.equal(f.calls.length, 2); assert.equal(f.calls[1].request.signal, recoverySignal);
});

test('original resolver final source and validated metadata take precedence without fetching it or stripping signatures', async () => {
    const target = 'https://outside.invalid/signed?sig=a%2Fb&token=PRIVATE_CANARY';
    const f = fixture({resolveSource: async () => ({type: 'url', source: target, sourceKind: 'direct-url', requestOptions: {userAgent: 'OriginalAgent'}, acquiredAt: 12, expiresAt: 34})});
    const result = await prepare(f.options);
    assert.equal(result.source, target); assert.equal(result.type, 'url'); assert.equal(result.sourceKind, 'direct-url');
    assert.deepEqual(result.requestOptions, {userAgent: 'OriginalAgent'}); assert.equal(result.acquiredAt, 12); assert.equal(result.expiresAt, 34);
    assert.equal(f.calls.length, 1); assert.ok(f.calls.every(call => new URL(call.url).origin === ORIGIN));
    assert.equal(f.calls[0].request.headers['user-agent'], undefined);
});

test('local Mount results remain local and incomplete resolver results retain the negotiated native source', async () => {
    const local = fixture({resolveSource: async () => ({type: 'local', source: 'Z:\\media\\next.mkv'})});
    assert.equal((await prepare(local.options)).source, 'Z:\\media\\next.mkv'); assert.equal(local.calls.length, 1);
    const fallback = fixture({resolveSource: async () => ({type: 'url', sourceKind: 'unused'})});
    assert.equal((await prepare(fallback.options)).source, native);
    assert.equal(Object.hasOwn(await prepare(fallback.options), 'sourceKind'), false);
});

for (const [name, value, expected] of [
    ['file DirectPlay', source({Protocol: 'File', Path: '/mounted/next.mkv'}), {mode: 'DirectPlay', source: '/mounted/next.mkv'}],
    ['negotiated DirectStream', source({SupportsDirectPlay: false, DirectStreamUrl: '/Videos/next/stream.mkv?Static=true&sig=a%2Bb'}), {mode: 'DirectStream', source: ORIGIN + '/Videos/next/stream.mkv?Static=true&sig=a%2Bb'}],
    ['protocol restricted to stream', source({Protocol: 'Ftp'}), {mode: 'DirectStream'}],
    ['static m4v fallback', source({SupportsDirectPlay: false, Container: 'm4v', ETag: 'tag'}), {mode: 'DirectStream'}]
]) test('ordinary negotiated source selection: ' + name, async () => {
    const f = fixture({fetch: async () => response({MediaSources: [value]})}); const result = await prepare(f.options);
    assert.equal(result.mode, expected.mode); if (expected.source) assert.equal(result.source, expected.source);
    if (!expected.source) {const url = new URL(result.source); assert.equal(url.origin, ORIGIN); assert.equal(url.searchParams.get('Static'), 'true'); assert.equal(url.searchParams.get('mediaSourceId'), 'source-next');}
    if (name === 'static m4v fallback') {assert.equal(new URL(result.source).pathname, '/Videos/next/stream.mp4'); assert.equal(new URL(result.source).searchParams.get('Tag'), 'tag');}
});

for (const [name, sources, reason] of [
    ['absent', undefined, 'source-count'], ['none', [], 'source-count'], ['multiple', [source(), source({Id: 'second'})], 'source-count'],
    ['invalid', [null], 'metadata-shape'], ['missing Id', [source({Id: ''})], 'metadata-shape'],
    ['live', [source({LiveStreamId: 'live'})], 'live-unsupported'], ['infinite', [source({IsInfiniteStream: true})], 'live-unsupported'],
    ['opening required', [source({RequiresOpening: true})], 'live-unsupported'],
    ['transcode only', [source({SupportsDirectPlay: false, SupportsDirectStream: false, SupportsTranscoding: true, TranscodingUrl: '/transcode'})], 'directstream-required'],
    ['unsupported protocol only', [source({Protocol: 'Ftp', SupportsDirectStream: false})], 'directstream-required'],
    ['invalid container', [source({Container: '../../secret'})], 'container-unsupported']
]) test('refuses unsupported negotiation: ' + name, async () => {
    const f = fixture({fetch: async () => response({MediaSources: sources})}); await refused(f.options, reason); assert.equal(f.contexts.length, 0);
});

for (const [status, reason] of [[302, 'metadata-redirect'], [401, 'metadata-auth'], [403, 'metadata-auth'], [500, 'metadata-http-status']]) test('metadata HTTP status is fixed and sanitized: ' + status, async () => {
    const reply = response({}, {status}), f = fixture({fetch: async () => reply}); await refused(f.options, reason);
    assert.equal(reply.state.cancelled, true); assert.equal(reply.state.reads, 0);
});

test('POST and recovery response bodies enforce streamed byte cap, strict JSON, and reader release', async () => {
    for (const [chunks, reason] of [[[new Uint8Array(262145)], 'metadata-size'], [[new TextEncoder().encode('PRIVATE_CANARY')], 'metadata-json'], [[new Uint8Array([0xff])], 'metadata-json']]) {
        const reply = response(null, {chunks}), f = fixture({fetch: async () => reply});
        await refused(f.options, reason); assert.equal(reply.state.cancelled, true); assert.equal(reply.state.released, true);
    }
    const f = fixture(); delete f.item.Path; let reply;
    f.options.fetch = async (_url, request) => request.method === 'POST' ? response({MediaSources: [source()]}) : (reply = response(null, {chunks: [new Uint8Array(262145)]}));
    f.options.recoverIdentity = async ({item, connectionManager, signal}) => connectionManager.getApiClient(item.ServerId).getItem('user', item.Id, {Fields: 'Path'}, signal);
    await refused(f.options, 'metadata-size'); assert.equal(reply.state.cancelled, true); assert.equal(reply.state.released, true);
});

test('origin checks reject metadata redirection and reject credentialed metadata URLs before authorizing or fetching', async () => {
    const reply = response({MediaSources: [source()]}, {url: 'https://outside.invalid/PRIVATE_CANARY'});
    const cross = fixture({fetch: async () => reply});
    await refused(cross.options, 'metadata-origin'); assert.equal(reply.state.cancelled, true);
    for (const url of ['https://outside.invalid/PRIVATE_CANARY', 'https://name:PRIVATE_CANARY@emby.invalid/metadata']) {
        const f = fixture(); f.options.api.getUrl = () => url;
        await refused(f.options, 'metadata-origin'); assert.equal(f.calls.length, 0); assert.equal(f.authorizations.length, 0);
    }
    const rewritten = fixture(); rewritten.options.api.setAuthorizationInfoIntoRequest = request => {request.url = 'https://outside.invalid/?token=PRIVATE_CANARY';};
    await refused(rewritten.options, 'metadata-origin'); assert.equal(rewritten.calls.length, 0);
});

for (const phase of ['before', 'profile', 'fetch', 'body', 'recovery', 'resolver']) test('abort retires the preparation at ' + phase, async () => {
    const controller = new AbortController(), f = fixture({signal: controller.signal});
    if (phase === 'before') controller.abort();
    if (phase === 'profile') f.options.player.getDeviceProfile = async () => {controller.abort(); return {};};
    if (phase === 'fetch') f.options.fetch = async () => {controller.abort(); return response({MediaSources: [source()]});};
    if (phase === 'body') f.options.fetch = async () => response({MediaSources: [source()]}, {onRead() {controller.abort();}});
    if (phase === 'recovery') {delete f.item.Path; f.options.recoverIdentity = async () => {controller.abort(); return {recoveredPath: '/next.strm'};};}
    if (phase === 'resolver') f.options.resolveSource = async () => {controller.abort(); return {source: native};};
    await refused(f.options, 'request-cancelled');
    if (phase === 'before' || phase === 'profile') assert.equal(f.calls.length, 0);
});

test('unknown profile/fetch/recovery/resolver exceptions expose no private error text', async () => {
    for (const phase of ['profile', 'fetch', 'recovery', 'resolver']) {
        const f = fixture(), rejected = async () => {throw Error('PRIVATE_CANARY https://outside.invalid?secret-token');};
        if (phase === 'profile') f.options.player.getDeviceProfile = rejected;
        if (phase === 'fetch') f.options.fetch = rejected;
        if (phase === 'recovery') {delete f.item.Path; f.options.recoverIdentity = rejected;}
        if (phase === 'resolver') f.options.resolveSource = rejected;
        await refused(f.options, phase === 'fetch' ? 'network-failed' : 'unexpected');
    }
});

// Browser streams may originate from a different realm than this AMD module.
test('bounded PlaybackInfo reader accepts genuine byte views from another realm', async () => {
    const f = fixture();
    const bytes = new TextEncoder().encode(JSON.stringify({MediaSources: [source()]}));
    const foreign = vm.runInNewContext('Uint8Array.from(values)', {values: [...bytes]});
    f.options.fetch = async () => response(null, {chunks: [foreign]});
    assert.equal((await prepare(f.options)).source, native);
});
