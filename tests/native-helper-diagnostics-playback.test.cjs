'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const diagnostics = require('../src/electronapp/enhanced/diagnostics');
const nativeHelperClient = require('../src/electronapp/native-helper/client');

const {makeDeferred, waitFor, makeEventTarget, makeDom, FakeIpc, makeContext, makePlayOptions, getHttp, startupFixture} = require('./helpers/startup-route-fixture.cjs');

test('loading EOF rejects without normal stopped and start is owned before loadfile', async () => {
    const ipc = new FakeIpc();
    ipc.suppressCorePlaying = true;
    const target = makeEventTarget();
    Object.assign(target, {ipc, platform: 'win32', PlayerWindowId: 1});
    const resolver = {isStrm: () => false, resolveAsync: async info => ({type: 'native', source: info.nativeSource})};
    const {player, eventCalls} = makeContext(target, makeDom(), nativeHelperClient, resolver);
    const options = makePlayOptions('https://fixture.invalid/media');
    options.playerStartPositionTicks = 800000000;
    const play = player.play(options);
    play.catch(() => {});
    await waitFor(() => ipc.loadCalls.length === 1);
    const loadIndex = ipc.calls.findIndex(c => c.request.operation === 'command' && c.request.payload.data[0] === 'loadfile');
    const startWrites = ipc.calls.slice(0, loadIndex).filter(c => c.request.operation === 'set-properties')
        .flatMap(c => c.request.payload.entries).filter(e => e.name === 'start');
    assert.equal(startWrites.at(-1)?.value, '80');
    ipc.emit(nativeHelperClient.EVENT_CHANNEL, {}, {type: 'property_change', generationId: ipc.generationId,
        data: {name: 'eof-reached', value: true}});
    const result = await Promise.race([play.then(() => 'resolved', e => e), new Promise(r => setTimeout(() => r('pending'), 100))]);
    assert.equal(result.unexpectedEof, true);
    assert.equal(eventCalls.filter(c => c[1] === 'stopped').length, 0);
    await player.stop(true);
});

for (const seconds of [0, 246, 1471]) test(`current EOF after core-playing reports normal completion once at start ${seconds}`, async () => {
    const ipc = new FakeIpc(), target = makeEventTarget();
    Object.assign(target, {ipc, platform: 'win32', PlayerWindowId: 1});
    let started = 0;
    const resolver = {isStrm: () => false, resolveAsync: async info => ({type: 'native', source: info.nativeSource})};
    const {player, eventCalls} = makeContext(target, makeDom(), nativeHelperClient, resolver, undefined,
        {begin: async () => ({config: {}, lease: 'lease', release() {}, started() {started++;}})});
    const options = makePlayOptions('https://fixture.invalid/media');
    options.playerStartPositionTicks = seconds * 10000000;
    await player.play(options);
    assert.equal(started, 1);
    const eof = generationId => ipc.emit(nativeHelperClient.EVENT_CHANNEL, {}, {type: 'property_change', generationId,
        data: {name: 'eof-reached', value: true}});
    eof(ipc.generationId - 1);
    assert.equal(eventCalls.filter(c => c[1] === 'stopped').length, 0);
    eof(ipc.generationId); eof(ipc.generationId);
    assert.equal(eventCalls.filter(c => c[1] === 'stopped').length, 1);
    await player.stop(true);
});

for (const hit of [true, false]) test('unavailable configuration preserves local-download priority: ' + hit, async () => {
    const ipc = new FakeIpc(), target = makeEventTarget();
    Object.assign(target, {ipc, platform: 'win32', PlayerWindowId: 1});
    let resolves = 0;
    const resolver = {isStrm: () => true, resolveAsync: async () => {resolves++; throw Error('unowned resolver');}};
    const downloads = {localSource: async () => hit ? {source: 'C:\\SyntheticDownloads\\movie.mkv'} : null};
    const {player} = makeContext(target, makeDom(), nativeHelperClient, resolver, downloads, {begin: async () => null});
    const options = makePlayOptions('https://fixture.invalid/original');
    await player.play(options);
    assert.equal(resolves, 0);
    assert.equal(ipc.loadCalls[0].data[1], hit ? 'C:\\SyntheticDownloads\\movie.mkv' : options.url);
    await player.stop(true);
});

test('ready diagnostics fail open before generation while delayed STRM/CD2 play reaches current-generation core-playing', async () => {
    const server = http.createServer((request, response) => {
        response.writeHead(200, {'content-type': 'video/x-fixture'});
        response.end('fixture');
    });
    let cd2Hits = 0;
    server.on('request', () => { cd2Hits++; });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    const cd2Url = `http://127.0.0.1:${address.port}/fixture/diagnostics-delayed.mkv`;
    const resolverGate = makeDeferred();
    const resolverEntered = makeDeferred();
    const resolverCalls = [];
    const resolver = {
        isStrm(info) { return !!(info && info.sidecarPath && info.sidecarPath.endsWith('.strm')); },
        resolveAsync(info) {
            resolverCalls.push(info);
            resolverEntered.resolve();
            return resolverGate.promise.then(async () => {
                await getHttp(cd2Url);
                return {
                    type: 'url',
                    source: cd2Url,
                    sourceKind: 'cd2-url',
                    reason: 'cd2_hit',
                    isStrm: true,
                    localExists: false
                };
            });
        },
        routeForResult(result) { return result && result.sourceKind === 'cd2-url' ? 'cd2-http' : 'native'; }
    };
    const ipc = new FakeIpc();
    const windowTarget = makeEventTarget();
    windowTarget.ipc = ipc;
    windowTarget.platform = 'win32';
    windowTarget.PlayerWindowId = 1;
    const readyDiagnostics = makeDeferred();
    const readyRecords = [];
    const bridgeErrors = [];
    const manager = {currentPlayer: null, diagnosticsCleanupCount: 0};
    windowTarget.addEventListener('native-helper-error', event => {
        bridgeErrors.push(event && event.detail && event.detail.reason);
        manager.currentPlayer = null;
        manager.diagnosticsCleanupCount++;
    });
    windowTarget.enhancedDiagnostics = function (bridge, stage) {
        if (stage !== 'ready') return;
        const optional = bridge.getOptionalDiagnosticCacheBytes();
        const snapshot = diagnostics.collect(bridge, windowTarget, stage, 250);
        Promise.all([optional, snapshot]).then(function (values) {
            readyRecords.push({optional: values[0], snapshot: values[1]});
            readyDiagnostics.resolve(values[0]);
        }, readyDiagnostics.reject);
    };

    try {
        const dom = makeDom();
        const loaded = makeContext(windowTarget, dom, nativeHelperClient, resolver);
        const player = loaded.player;
        manager.play = function (options) {
            manager.currentPlayer = player;
            const pending = player.play(options);
            pending.catch(error => {
                if (!error || !error.playbackSuperseded) manager.currentPlayer = null;
            });
            return pending;
        };
        ipc.on(nativeHelperClient.EVENT_CHANNEL, (_event, message) => {
            if (message && message.type === 'bridge_error') bridgeErrors.push(message.reason);
        });
        const playPromise = manager.play(makePlayOptions(cd2Url));

        await resolverEntered.promise;
        const optionalResult = await readyDiagnostics.promise;

        // A-D: diagnostics ran while the endpoint had no playback generation.
        assert.deepEqual(optionalResult, {status: 'unavailable', reason: 'generation-unavailable'});
        assert.equal(readyRecords.length, 1);
        assert.equal(readyRecords[0].snapshot.stage, 'ready');
        assert.equal(ipc.generationId, null, 'the delayed resolver must still precede beginGeneration');
        assert.equal(ipc.mutationsBeforeGeneration.length, 0, 'ready diagnostics must not submit generation-dependent mutations');
        assert.equal(ipc.generationRequiredErrors.length, 0, 'optional diagnostics must not hit generation-required controller paths');
        assert.equal(bridgeErrors.length, 0, 'optional diagnostics must not produce bridge_error');
        assert.equal(manager.diagnosticsCleanupCount, 0, 'diagnostics must not run playback error cleanup');
        assert.strictEqual(manager.currentPlayer, player, 'manager ownership must survive ready diagnostics');

        // E-F: releasing the delayed resolver is the only gate to generation creation and load.
        resolverGate.resolve();
        await playPromise;
        assert.equal(resolverCalls.length, 1);
        assert.equal(cd2Hits, 1, 'the fake CD2 HTTP source must be hit exactly once');
        assert.equal(ipc.calls.filter(call => call.request.operation === 'begin-generation').length, 1);
        assert.equal(ipc.loadCalls.length, 1);
        assert.equal(ipc.loadCalls[0].data[1], cd2Url);
        assert.equal(ipc.loadCalls[0].generationId, ipc.generationId);
        assert.equal(ipc.corePlayingEvents.length, 1);
        assert.deepEqual(ipc.corePlayingEvents[0], {generationId: ipc.generationId, name: 'core-idle', value: false});
        assert.equal(bridgeErrors.length, 0);
        assert.equal(manager.diagnosticsCleanupCount, 0);
        assert.strictEqual(manager.currentPlayer, player, 'diagnostics must not clear currentPlayer after core-playing');
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

for (const phase of ['loading', 'playing']) {
    test(`synthetic native error reaches playback diagnostics during ${phase} without leaking identity or reloading`, async () => {
        const ipc = new FakeIpc();
        ipc.suppressCorePlaying = phase === 'loading';
        const windowTarget = makeEventTarget();
        Object.assign(windowTarget, {ipc, platform: 'win32', PlayerWindowId: 1});
        const resolver = {isStrm: () => false, resolveAsync: async info => ({type: 'native', source: info.nativeSource})};
        const {player} = makeContext(windowTarget, makeDom(), nativeHelperClient, resolver);
        const options = makePlayOptions('https://SYNTHETIC_URL_CANARY/?token=SYNTHETIC_TOKEN_CANARY');
        Object.assign(options.item, {Id: 'SYNTHETIC_ITEM_CANARY', ServerId: 'SYNTHETIC_SERVER_CANARY'});
        options.mediaSource.Id = 'SYNTHETIC_SOURCE_CANARY';
        const play = player.play(options);
        play.catch(() => {});
        await waitFor(() => ipc.loadCalls.length === 1);
        if (phase === 'playing') await play;
        const begin = ipc.calls.find(call => call.request.operation === 'begin-generation').request.payload;
        assert.deepEqual(JSON.parse(JSON.stringify(begin.diagnosticIdentity)), {
            serverId: options.item.ServerId, itemId: options.item.Id, mediaSourceId: options.mediaSource.Id
        });
        ipc.emit(nativeHelperClient.EVENT_CHANNEL, {}, {type: 'bridge_error', reason: 'load-failed',
            endReason: 4, mpvErrorCode: -13, log: 'RAW_LOG_CANARY'});
        if (phase === 'loading') await assert.rejects(play);
        const errors = ipc.notifications.filter(row => row.channel === 'enhanced-diagnostics-log' &&
            row.request.event === 'playback-error' && row.request.details.stage === 'player-event');
        assert.equal(errors.length, 1);
        assert.equal(errors[0].request.details.mpvErrorCode, -13);
        assert.equal(errors[0].request.details.endReason, 4);
        assert.equal(errors[0].request.details.playbackPhase, phase);
        assert.equal(errors[0].request.details.requestId, begin.label);
        const diagnostics = () => ipc.notifications.filter(row => row.channel === 'enhanced-diagnostics-log');
        assert.doesNotMatch(JSON.stringify(diagnostics()), /CANARY/);
        assert.equal(ipc.loadCalls.length, 1, 'diagnostics must not retry or change playback policy');
        if (phase === 'playing') {
            ipc.emit(nativeHelperClient.EVENT_CHANNEL, {}, {type: 'property_change', data: {name: 'eof-reached', value: true}});
            assert.equal(diagnostics().filter(row => row.request.event === 'stop').length, 0,
                'EOF after an error cannot also report normal completion');
        }
        await player.stop(true);
        assert.equal(diagnostics().filter(row => row.request.event === 'stop').at(-1).request.details.stopSource, 'adapter-stop-destroy');
    });
}

for (const mode of ['download-hit', 'download-miss', 'transcode']) {
    test('download source selection preserves native lifecycle for ' + mode, async () => {
        const ipc = new FakeIpc(), windowTarget = makeEventTarget();
        Object.assign(windowTarget, {ipc, platform: 'win32', PlayerWindowId: 1});
        let lookups = 0, resolves = 0;
        const resolver = {isStrm: () => true, resolveAsync: async info => {resolves++; return {type: 'native', source: info.nativeSource, reason: 'native_fallback'};}};
        const downloads = {async localSource() {lookups++; return mode === 'download-hit' ? {status: 'hit', source: 'C:\\SyntheticDownloads\\movie.mkv'} : null;}};
        const {player} = makeContext(windowTarget, makeDom(), nativeHelperClient, resolver, downloads);
        const options = makePlayOptions('https://synthetic.invalid/original');
        options.item.Id = 'item'; options.item.ServerId = 'server'; options.mediaSource.Id = 'source';
        if (mode === 'transcode') options.playMethod = 'Transcode';
        await player.play(options);
        assert.equal(ipc.loadCalls.length, 1);
        assert.equal(ipc.loadCalls[0].data[1], mode === 'download-hit' ? 'C:\\SyntheticDownloads\\movie.mkv' : options.url);
        assert.equal(lookups, mode === 'transcode' ? 0 : 1);
        assert.equal(resolves, mode === 'download-hit' ? 0 : 1);
        assert.equal(ipc.calls.filter(call => call.request.operation === 'begin-generation').length, 1);
        assert.equal(ipc.corePlayingEvents.length, 1);
        const route = player.getRoutes().filter(value => value.path === 'mpvplayer/downloads.html');
        assert.equal(route.length, 1); assert.equal(route[0].category, 'General');
        await player.stop(true);
    });
}

test('a superseded download lookup cannot load an old file into the replacement native generation', async () => {
    const ipc = new FakeIpc(), windowTarget = makeEventTarget(), gate = makeDeferred();
    Object.assign(windowTarget, {ipc, platform: 'win32', PlayerWindowId: 1});
    let entered = false, firstSignal;
    const resolver = {isStrm: () => true, resolveAsync: async info => ({type: 'native', source: info.nativeSource, reason: 'native_fallback'})};
    const downloads = {localSource(_api, item, _source, signal) {if (item.Id === 'old') {entered = true; firstSignal = signal; return gate.promise;} return Promise.resolve(null);}};
    const {player} = makeContext(windowTarget, makeDom(), nativeHelperClient, resolver, downloads);
    const old = makePlayOptions('https://synthetic.invalid/old'); old.item.Id = 'old';
    const first = player.play(old); first.catch(() => {});
    await waitFor(() => entered);
    const next = makePlayOptions('https://synthetic.invalid/current'); next._etePlayRequestId = 2; next.item.Id = 'current';
    const second = player.play(next);
    gate.resolve({status: 'hit', source: 'C:\\SyntheticDownloads\\retired.mkv'});
    await assert.rejects(first); await second;
    assert.equal(firstSignal.aborted, true);
    assert.equal(ipc.loadCalls.length, 1);
    assert.equal(ipc.loadCalls[0].data[1], next.url);
    await player.stop(true);
});


test('real resolver and renderer advance only after media failure; same Play resolves once with original offset and tracks', async () => {
    const f = startupFixture();
    const play = f.player.play(f.options);
    await waitFor(() => f.ipc.loadCalls.length === 1);
    const old = f.ipc.generationId;
    assert.match(f.ipc.loadCalls[0].data.join(','), /user-agent=Synthetic-Agent/);
    f.failure();
    await waitFor(() => f.ipc.loadCalls.length === 2);
    f.failure(old); f.property('core-idle', false, old); f.property('eof-reached', true, old);
    assert.equal(f.counts().started, 0);
    assert.equal(f.ipc.loadCalls.length, 2);
    assert.equal(f.ipc.loadCalls[1].data.length, 2, 'same-origin must not inherit direct UA');
    f.property('core-idle', false);
    await play;
    assert.deepEqual(f.counts(), {released: 0, started: 1});
    assert.equal(f.cancellations.length, 0, 'media rotation must not cancel the configuration lease');
    assert.equal(new Set(f.resolves.map(r => r.requestId)).size, 1);
    assert.equal(new Set(f.resolves.map(r => r.configLease)).size, 1);
    const writes = f.ipc.calls.filter(c => c.request.operation === 'set-properties');
    for (const generation of f.ipc.loadCalls.map(c => c.generationId)) {
        const entries = writes.filter(c => c.request.payload.generationId === generation).flatMap(c => c.request.payload.entries);
        assert.ok(entries.some(e => e.name === 'start' && e.value === '246'));
        assert.ok(entries.some(e => e.name === 'aid' && e.value === 1));
        assert.ok(entries.some(e => e.name === 'sid' && e.value === 'no'));
    }
    assert.equal(f.eventCalls.filter(c => c[1] === 'error' || c[1] === 'stopped').length, 0);
    f.failure();
    assert.equal(f.eventCalls.filter(c => c[1] === 'error').length, 1, 'failure after core-playing is terminal');
    assert.equal(f.ipc.loadCalls.length, 2);
    await f.player.stop(true);
});

test('exhausted startup returns one failure to original manager promise and never emits stopped', async () => {
    const f = startupFixture();
    const play = f.player.play(f.options); play.catch(() => {});
    for (let count = 1; count <= 3; count++) {
        await waitFor(() => f.ipc.loadCalls.length === count);
        f.failure();
    }
    await assert.rejects(play, {name: 'NativeHelperError'});
    assert.equal(f.ipc.loadCalls.length, 3);
    assert.deepEqual(f.counts(), {released: 1, started: 0});
    assert.equal(f.eventCalls.filter(c => c[1] === 'error' || c[1] === 'stopped').length, 0);
    await f.player.stop(true);
});

for (const kind of ['bridge-operation', 'helper-terminal']) test(`startup does not rotate for ${kind}`, async () => {
    const f = startupFixture();
    const play = f.player.play(f.options); play.catch(() => {});
    await waitFor(() => f.ipc.loadCalls.length === 1);
    f.failure(f.ipc.generationId, kind);
    await assert.rejects(play);
    assert.equal(f.ipc.loadCalls.length, 1);
    assert.equal(f.resolves.length, 1);
    await f.player.stop(true);
});

test('absolute startup deadline rejects late core-playing even before timeout callback dispatch', async () => {
    let now = 10000, expire;
    const f = startupFixture({Date: {now: () => now}, setTimeout(callback, ms) {
        if (ms === 15000) { expire = callback; return 'startup-timer'; }
        return setTimeout(callback, ms);
    }, clearTimeout(id) {if (id !== 'startup-timer') clearTimeout(id);}});
    const play = f.player.play(f.options); play.catch(() => {});
    await waitFor(() => f.ipc.loadCalls.length === 1);
    now += 15001;
    f.property('core-idle', false);
    assert.equal(f.counts().started, 0);
    expire();
    await assert.rejects(play, /startup-route-deadline/);
    const lastRoute = f.ipc.notifications.filter(row => row.channel === 'enhanced-diagnostics-log' && row.request.event === 'startup-route').at(-1).request.details;
    assert.equal(lastRoute.reason, 'total-deadline');
    assert.equal(lastRoute.remainingMs, 0);
    assert.equal(lastRoute.elapsedMs, 15001);
    f.property('core-idle', false); f.failure();
    assert.equal(f.ipc.loadCalls.length, 1);
    assert.equal(f.counts().released, 1);
    await f.player.stop(true);
});

test('failure during awaited audio tail drains before next generation; Stop cancels old startup', async () => {
    const f = startupFixture(), gate = makeDeferred();
    const invoke = f.ipc.invoke.bind(f.ipc);
    let audioPending = false;
    f.ipc.invoke = function (channel, request) {
        if (!audioPending && request.operation === 'set-properties' && request.payload.entries.some(e => e.name === 'aid')) {
            audioPending = true; return gate.promise;
        }
        return invoke(channel, request);
    };
    const play = f.player.play(f.options); play.catch(() => {});
    await waitFor(() => audioPending);
    f.failure();
    await new Promise(r => setImmediate(r));
    assert.equal(f.ipc.loadCalls.length, 1, 'cannot begin next generation while previous tail owns writes');
    gate.resolve({status: 'ok'});
    await waitFor(() => f.ipc.loadCalls.length === 2);
    await f.player.stop(true);
    await assert.rejects(play, {name: 'PlaybackSuperseded'});
    f.property('core-idle', false);
    assert.equal(f.counts().started, 0);
});

for (const phase of ['begin-generation', 'loadfile', 'audio', 'subtitle', 'unpause']) {
    for (const action of ['stop', 'play', 'next']) test(`${action} supersedes a startup awaiting ${phase} without old tail writes`, async () => {
        const f = startupFixture(), gate = makeDeferred();
        const invoke = f.ipc.invoke.bind(f.ipc);
        let waiting = false;
        f.ipc.invoke = function (channel, request) {
            const result = invoke(channel, request), payload = request.payload || {};
            const matches = phase === 'begin-generation' ? request.operation === 'begin-generation' :
                phase === 'loadfile' ? request.operation === 'command' && payload.data[0] === 'loadfile' :
                request.operation === 'set-properties' && payload.entries.some(e => e.name ===
                    (phase === 'audio' ? 'aid' : phase === 'subtitle' ? 'sid' : 'pause'));
            if (!waiting && matches) {waiting = true; return gate.promise.then(() => result);}
            return result;
        };
        const old = f.player.play(f.options); old.catch(() => {});
        await waitFor(() => waiting);
        const oldGeneration = f.ipc.generationId;
        if (action === 'stop') await f.player.stop(true);
        else {
            f.ipc.suppressCorePlaying = false;
            await f.player.play({...f.options, _etePlayRequestId: 2, command: action === 'next' ? 'nextTrack' : undefined});
        }
        const countBeforeRelease = f.ipc.calls.length;
        gate.resolve();
        await assert.rejects(old, {name: 'PlaybackSuperseded'});
        await new Promise(resolve => setImmediate(resolve));
        f.failure(oldGeneration); f.property('core-idle', false, oldGeneration); f.property('eof-reached', true, oldGeneration);
        const lateWrites = f.ipc.calls.slice(countBeforeRelease).filter(c => ['command', 'set-properties', 'begin-generation'].includes(c.request.operation));
        assert.equal(lateWrites.length, 0);
        assert.equal(f.ipc.loadCalls.length, action === 'stop' && phase === 'begin-generation' ? 0 :
            action === 'stop' ? 1 : phase === 'begin-generation' ? 1 : 2);
        await f.player.stop(true);
    });
}

test('delayed external subtitles belong to the load attempt as well as the Play request', async () => {
    const callbacks = [];
    const f = startupFixture({setTimeout(callback, ms) {
        if (ms === 700) {callbacks.push(callback); return 'subtitle-delay';}
        return setTimeout(callback, ms);
    }});
    f.options.mediaSource.MediaStreams.push({Type: 'Subtitle', Index: 1, DeliveryMethod: 'External', DeliveryUrl: 'https://synthetic.invalid/sub'});
    f.options.mediaSource.DefaultSubtitleStreamIndex = 1;
    const play = f.player.play(f.options); play.catch(() => {});
    await waitFor(() => callbacks.length === 1);
    f.failure();
    await waitFor(() => callbacks.length === 2);
    callbacks[0]();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.ipc.calls.filter(c => c.request.operation === 'command' && c.request.payload.data[0] === 'sub-add').length, 0);
    callbacks[1]();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.ipc.calls.filter(c => c.request.operation === 'command' && c.request.payload.data[0] === 'sub-add').length, 1);
    f.property('core-idle', false);
    await play;
    await f.player.stop(true);
});

for (const action of ['stop', 'play', 'next', 'helper-error']) test(`${action} during next route resolution cannot load a late URL`, async () => {
    const f = startupFixture(), gate = makeDeferred();
    f.controls.resolve = request => request.mode === 'same-origin' ? gate.promise : Promise.resolve();
    const old = f.player.play(f.options); old.catch(() => {});
    await waitFor(() => f.ipc.loadCalls.length === 1);
    f.failure();
    await waitFor(() => f.resolves.length === 2);
    if (action === 'stop') await f.player.stop(true);
    else if (action === 'helper-error') {
        f.ipc.emit(nativeHelperClient.EVENT_CHANNEL, {}, {type: 'bridge_error', reason: 'protocol-failure'});
    } else {
        f.ipc.suppressCorePlaying = false;
        await f.player.play({...f.options, _etePlayRequestId: 2, command: action === 'next' ? 'nextTrack' : undefined});
    }
    await assert.rejects(old, {name: action === 'helper-error' ? 'NativeHelperError' : 'PlaybackSuperseded'});
    const loaded = f.ipc.loadCalls.length;
    gate.resolve();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.ipc.loadCalls.length, loaded);
    await f.player.stop(true);
});

for (const action of ['deadline', 'stop', 'play', 'next', 'selection', 'route', 'valid']) {
    test(`internal teletext sid continuation preserves selection and generation ownership: ${action}`, async () => {
        let now = 10000;
        const timers = [];
        const f = startupFixture({Date: {now: () => now}, setTimeout(fn, ms) {
            if (ms === 15000) {timers.push(fn); return 'startup-' + timers.length;}
            return setTimeout(fn, ms);
        }, clearTimeout(id) {if (typeof id !== 'string') clearTimeout(id);}});
        f.options.mediaSource.MediaStreams.push({Type: 'Subtitle', Index: 1, Codec: 'dvb_teletext',
            Extradata: '00000000000123', DeliveryMethod: 'Embed'});
        f.options.mediaSource.DefaultSubtitleStreamIndex = 1;
        // Keep this pre-core-playing continuation test on the legacy remux
        // path. DirectPlay default mapping now waits for media readiness.
        f.options.playMethod = 'DirectStream';
        f.controls.transformResult = result => ({...result, sourceKind: 'synthetic-remux', fallback: true});
        const gate = makeDeferred(), invoke = f.ipc.invoke.bind(f.ipc);
        let waiting = false;
        f.ipc.invoke = (channel, request) => {
            if (request.operation === 'get-property' && request.payload.name === 'track-list') {
                return Promise.resolve({status: 'ok', value: [{type: 'sub', external: false, id: 1, 'ff-index': 1}]});
            }
            const result = invoke(channel, request);
            if (!waiting && request.operation === 'set-properties' && request.payload.entries.some(e => e.name === 'sid' && e.value === 1)) {
                waiting = true; return gate.promise.then(() => result);
            }
            return result;
        };
        const old = f.player.play(f.options); old.catch(() => {});
        await waitFor(() => waiting);
        const oldGeneration = f.ipc.generationId;
        if (action === 'deadline') {
            now += 15001; timers[0](); await assert.rejects(old, /startup-route-deadline/);
        } else if (action === 'stop') await f.player.stop(true);
        else if (action === 'selection') f.player.setSubtitleStreamIndex(-1);
        else if (action === 'route') f.failure();
        if (['deadline', 'play', 'next'].includes(action)) {
            f.ipc.suppressCorePlaying = false;
            await f.player.play({...f.options, _etePlayRequestId: 2, command: action === 'next' ? 'nextTrack' : undefined,
                mediaSource: {...f.options.mediaSource, MediaStreams: [{Type: 'Audio', Index: 0}], DefaultSubtitleStreamIndex: -1}});
            assert.notEqual(f.ipc.generationId, oldGeneration);
        }
        const before = f.ipc.calls.length;
        gate.resolve();
        if (action === 'route') {await waitFor(() => f.ipc.loadCalls.length === 2); f.property('core-idle', false); await old;}
        else if (action === 'valid' || action === 'selection') {f.property('core-idle', false); await old;}
        else await assert.rejects(old);
        await new Promise(resolve => setImmediate(resolve));
        const pages = f.ipc.calls.slice(before).filter(c => c.request.operation === 'set-properties' &&
            c.request.payload.entries.some(e => e.name === 'teletext-page'));
        assert.equal(pages.length, action === 'valid' || action === 'route' ? 1 : 0);
        if (action === 'route') {assert.notEqual(pages[0].request.payload.generationId, oldGeneration); assert.equal(pages[0].request.payload.generationId, f.ipc.generationId);}
        if (action === 'valid') {
            assert.equal(pages[0].request.payload.generationId, oldGeneration);
            assert.equal(pages[0].request.payload.entries.find(e => e.name === 'teletext-page').value, 123);
        }
        await f.player.stop(true);
    });
}

test('DirectStream raw to native route rotation clears container mapping eligibility',async()=>{
    const f=startupFixture();f.options.playMethod='DirectStream';
    f.options.mediaSource.MediaStreams.push(
        {Type:'Subtitle',Index:0,DeliveryMethod:'External',DeliveryUrl:'opaque:sub'},
        {Type:'Subtitle',Index:8,DeliveryMethod:'Embed',Codec:'srt'});
    f.options.mediaSource.DefaultSubtitleStreamIndex=8;
    let results=0;
    f.controls.transformResult=result=>++results===1?result:{...result,type:'native',sourceKind:'native',fallback:true};
    const invoke=f.ipc.invoke.bind(f.ipc);let trackReads=0;
    f.ipc.invoke=(channel,request)=>{
        if(request.operation==='get-property'&&request.payload.name==='track-list'){
            trackReads++;return Promise.resolve({status:'ok',value:[{type:'sub',external:false,id:17,'ff-index':1}]});
        }
        return invoke(channel,request);
    };
    const playing=f.player.play(f.options);playing.catch(()=>{});
    await waitFor(()=>f.ipc.loadCalls.length===1);f.failure();
    await waitFor(()=>f.ipc.loadCalls.length===2);
    f.property('core-idle',false);await playing;
    await waitFor(()=>f.ipc.calls.some(c=>c.request.operation==='set-properties'&&c.request.payload.entries.some(e=>e.name==='sid'&&e.value===17)));
    assert.equal(trackReads,2,'retired raw default cannot query; native maps and observes actual output ID');
    await f.player.stop(true);
});
