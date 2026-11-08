'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {create} = require('../src/electronapp/enhanced/strm-playback-config');
const client = require('../src/electronapp/resolvers/strm-config-client');
const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve};};
function fixture() {
    const contents = new EventEmitter(), services = [];
    let config = {version: 1, enabled: true, cd2: {enabled: true, origin: 'https://a.invalid'}, rules: [{id: 'a'}]};
    let token = 'synthetic-a';
    const store = {getPublicConfig: () => structuredClone(config), getRuntimeConfig: () => ({...structuredClone(config), token})};
    const owner = create({store, createService(runtime, scope) {
        const service = {runtime, scope, closed: 0, cancelled: [], jobs: [],
            resolve(request, principal) {const job = deferred(); service.jobs.push({request, principal, ...job}); return job.promise;},
            cancel(id) {service.cancelled.push(id);}, close() {++service.closed;}};
        services.push(service); return service;
    }});
    return {owner, contents, services, change(next, secret = token) {config = structuredClone(next); token = secret; owner.saved();}, config: () => structuredClone(config)};
}
test('save B leaves A and its refresh service stable; the next play owns all of B', async () => {
    const f = fixture(), a = f.owner.begin({requestId: 'play-a'}, f.contents);
    const scopeA = f.owner.scopeFor('play-a');
    const next = f.config(); next.cd2.origin = 'https://b.invalid'; next.rules[0].id = 'b';
    f.change(next, 'synthetic-b');
    assert.equal(f.owner.status().savedRevision, 2);
    assert.equal(f.owner.status().playbackRevision, 1);
    assert.equal(f.services[0].closed, 0);
    assert.equal(a.config.cd2.origin, 'https://a.invalid');
    const pending = f.owner.resolve({requestId: 'a-next', configLease: a.lease}, 'principal', f.contents);
    assert.equal(f.services[0].runtime.token, 'synthetic-a');
    const b = f.owner.begin({requestId: 'play-b'}, f.contents);
    assert.equal(f.services[0].closed, 1);
    assert.equal(f.services[1].runtime.token, 'synthetic-b');
    assert.equal(b.config.cd2.origin, 'https://b.invalid');
    assert.notEqual(f.owner.scopeFor('play-b'), scopeA);
    f.services[0].jobs[0].resolve({status: 'hit', source: 'https://late.invalid'});
    assert.equal((await pending).status, 'cancelled');
    assert.equal((await f.owner.resolve({requestId: 'late', configLease: a.lease}, null, f.contents)).status, 'cancelled');
    f.owner.release({lease: a.lease}, f.contents);
    assert.equal(f.services[1].closed, 0, 'late release cannot close B');
    assert.equal(f.owner.status().playbackRevision, 2);
    f.owner.close();
});
test('rapid saves use the latest complete snapshot and isolate address, token and rules', () => {
    const f = fixture();
    let previous = f.owner.begin({requestId: 'p0'}, f.contents), scope = f.owner.scopeFor('p0');
    for (const [i, change] of [
        c => {c.cd2.origin = 'https://other.invalid';},
        c => {c.rules[0].id = 'new-rule';},
        c => {c.enabled = false;}
    ].entries()) {
        const config = f.config(); change(config); f.change(config);
        previous = f.owner.begin({requestId: 'p' + (i + 1)}, f.contents);
        const nextScope = f.owner.scopeFor('p' + (i + 1)); assert.notEqual(nextScope, scope); scope = nextScope;
        assert.deepEqual(previous.config, config);
    }
    f.change(f.config(), 'synthetic-secret-changed'); f.change(f.config(), 'synthetic-latest');
    const latest = f.owner.begin({requestId: 'latest'}, f.contents);
    assert.equal(latest.revision, 6);
    assert.equal(f.services.at(-1).runtime.token, 'synthetic-latest');
    assert.notEqual(f.owner.scopeFor('latest'), scope);
    assert(!JSON.stringify(latest).includes('synthetic-'));
    f.owner.close();
});
test('cancellation is routed to the exact lease and ignores a late success', async () => {
    const f = fixture(), a = f.owner.begin({requestId: 'play'}, f.contents);
    const result = f.owner.resolve({requestId: 'resolve', configLease: a.lease}, 'principal', f.contents);
    f.owner.cancel('resolve', f.contents, 'foreign');
    assert.deepEqual(f.services[0].cancelled, []);
    f.owner.cancel('resolve', f.contents, a.lease);
    assert.deepEqual(f.services[0].cancelled, ['resolve']);
    assert.equal(f.services[0].jobs[0].request.configLease, undefined, 'private routing metadata is not CD2 request input');
    f.services[0].jobs[0].resolve({status: 'hit'});
    assert.equal((await result).status, 'cancelled'); f.owner.close();
});
test('foreign document, navigation, renderer crash and shutdown retire services and listeners', async () => {
    for (const event of ['destroyed', 'render-process-gone', 'navigation', 'close']) {
        const f = fixture(), a = f.owner.begin({requestId: 'play'}, f.contents);
        assert.equal((await f.owner.resolve({requestId: 'x', configLease: a.lease}, null, new EventEmitter())).status, 'cancelled');
        f.owner.release({lease: a.lease}, new EventEmitter()); assert.equal(f.services[0].closed, 0);
        f.contents.emit('did-start-navigation', {isMainFrame: true, isSameDocument: true}); assert.equal(f.services[0].closed, 0);
        if (event === 'navigation') f.contents.emit('did-start-navigation', {isMainFrame: true, isSameDocument: false});
        else if (event === 'close') f.owner.close(); else f.contents.emit(event);
        assert.equal(f.services[0].closed, 1);
        assert.equal(f.contents.listenerCount('destroyed'), 0);
        assert.equal(f.owner.scopeFor('play'), null);
        f.owner.close(); assert.equal(f.services[0].closed, 1);
    }
});
test('cancel arriving before resolve is remembered only by its lease with a bounded budget', async () => {
    const f = fixture(), a = f.owner.begin({requestId: 'play-a'}, f.contents);
    f.owner.cancel('next-early', f.contents, a.lease);
    assert.equal((await f.owner.resolve({requestId: 'next-early', configLease: a.lease}, null, f.contents)).status, 'cancelled');
    assert.equal(f.services[0].jobs.length, 0);
    for (let i = 0; i < 257; ++i) f.owner.cancel('early-' + i, f.contents, a.lease);
    assert.equal((await f.owner.resolve({requestId: 'after-budget', configLease: a.lease}, null, f.contents)).status, 'cancelled');
    assert.equal(f.services[0].closed, 0, 'exhaustion must not interrupt the active source refresh service');
    const b = f.owner.begin({requestId: 'play-b'}, f.contents);
    f.owner.cancel('next-early', f.contents, a.lease);
    const result = f.owner.resolve({requestId: 'next-early', configLease: b.lease}, null, f.contents);
    assert.equal(f.services[1].jobs.length, 1);
    f.services[1].jobs[0].resolve({status: 'hit'}); assert.equal((await result).status, 'hit'); f.owner.close();
});
test('renderer obtains a fresh snapshot per play and releases cancelled late replies', async () => {
    const responses = [deferred(), deferred()], calls = [], controller = new AbortController();
    const ipc = {invoke(channel, request) {calls.push({channel, request}); return channel.endsWith('-begin') ? responses.shift().promise : Promise.resolve({status: 'ok'});}};
    const firstReply = responses[0], secondReply = responses[1];
    const first = client.begin({ipc, requestId: 'a', signal: controller.signal}); await Promise.resolve();
    controller.abort();
    firstReply.resolve({status: 'ok', lease: 'old', revision: 1, config: {version: 1, cd2: {}, rules: []}});
    assert.equal(await first, null);
    assert(calls.some(v => v.channel.endsWith('-end') && v.request.lease === 'old'));
    const second = client.begin({ipc, requestId: 'b'}); await Promise.resolve();
    secondReply.resolve({status: 'ok', lease: 'new', revision: 2, config: {version: 1, cd2: {enabled: true}, rules: []}});
    const snapshot = await second; assert.equal(snapshot.revision, 2); assert.equal(snapshot.config.cd2.enabled, true);
    snapshot.release(); snapshot.release();
    assert.equal(calls.filter(v => v.channel.endsWith('-end') && v.request.lease === 'new').length, 1);
});
test('renderer timeout fails open without an old config and releases a subsequently acquired lease', async () => {
    const reply = deferred(), calls = [];
    const ipc = {invoke(channel, request) {calls.push({channel, request}); return channel.endsWith('-begin') ? reply.promise : Promise.resolve();}};
    assert.equal(await client.begin({ipc, requestId: 'timeout', timeoutMs: 5}), null);
    reply.resolve({status: 'ok', lease: 'late-timeout', config: {version: 1, cd2: {}, rules: []}});
    await Promise.resolve(); await Promise.resolve();
    assert(calls.some(call => call.channel.endsWith('-end') && call.request.lease === 'late-timeout'));
});
test('renderer cancellation settles even when main never replies, and destroyed IPC cannot throw from abort', async () => {
    const controller = new AbortController();
    const waiting = client.begin({ipc: {invoke() {return new Promise(() => {});}}, requestId: 'waiting', signal: controller.signal});
    controller.abort(); assert.equal(await waiting, null);
    const active = new AbortController();
    const snapshot = await client.begin({ipc: {invoke(channel) {if (channel.endsWith('-end')) throw Error('destroyed'); return Promise.resolve({status: 'ok', lease: 'lease', config: {version: 1, cd2: {}, rules: []}});}}, requestId: 'active', signal: active.signal});
    assert(snapshot); assert.doesNotThrow(() => active.abort());
});
test('cache invalidation cannot be undone by an older pending config reply', async () => {
    client.clearCache(); const old = deferred(), fresh = deferred(); let calls = 0;
    const ipc = {invoke() {return ++calls === 1 ? old.promise : fresh.promise;}};
    const first = client.get({ipc}); await Promise.resolve(); client.clearCache();
    const second = client.get({ipc}); await Promise.resolve();
    fresh.resolve({version: 1, cd2: {enabled: true}, rules: []}); await second;
    old.resolve({version: 1, cd2: {enabled: false}, rules: []}); await first;
    assert.equal((await client.get({ipc})).cd2.enabled, true); client.clearCache();
});

test('trusted save and independent Token mutations advance saved state, never the active play or test connection', async t => {
    const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
    const configIpc = require('../src/electronapp/enhanced/strm-config-ipc');
    const cd2Ipc = require('../src/electronapp/enhanced/cd2-ipc');
    const {eventFor} = require('./helpers/trusted-renderer.cjs');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-config-play-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const store = require('../src/electronapp/enhanced/strm-config-store').createStore({rootDir: root, environment: {}});
    const web = new EventEmitter(), handlers = new Map(), services = [];
    const ipcMain = Object.assign(new EventEmitter(), {handle: (name, handler) => handlers.set(name, handler), removeHandler: name => handlers.delete(name)});
    const playback = create({store, createService(runtime) {const service = {runtime, close() {}, async resolve() {return {status: 'hit'};}, cancel() {}}; services.push(service); return service;}});
    const unregister = configIpc.register({ipcMain, store, playback, getWebContents: () => web,
        createTestService: () => ({async testConnection() {return {status: 'ok'};}, close() {}})});
    const unregisterCd2 = cd2Ipc.register({ipcMain, playback, getWebContents: () => web});
    t.after(() => {unregisterCd2(); unregister();});
    const call = (key, request) => handlers.get(configIpc.CHANNELS[key])(eventFor(web), request);
    for (const key of ['PLAYBACK_BEGIN', 'PLAYBACK_END', 'PLAYBACK_STATUS', 'PLAYBACK_STARTED']) assert.equal((await handlers.get(configIpc.CHANNELS[key])({sender: web}, {})).reason, 'untrusted_sender');
    const a = await call('PLAYBACK_BEGIN', {requestId: 'play-a'});
    assert.equal((await call('PLAYBACK_STARTED', {lease: 'wrong'})).playbackRevision, null);
    assert.equal((await call('PLAYBACK_STARTED', {lease: a.lease})).playbackRevision, 1);
    const next = store.getPublicConfig(); next.enabled = true; next.cd2.origin = 'https://saved.invalid';
    const saved = await call('SAVE', {config: next});
    assert.equal(saved.requiresRestart, false); assert.equal(saved.playbackStatus.savedRevision, 2); assert.equal(saved.playbackStatus.playbackRevision, 1);
    const token = await call('SET_TOKEN', {token: 'synthetic-only-test'});
    assert.equal(token.requiresRestart, false); assert.equal(token.playbackStatus.savedRevision, 3);
    assert.equal(services[0].runtime.token, '');
    const beforeTest = playback.status(); assert.equal((await call('TEST_CONNECTION')).status, 'ok'); assert.deepEqual(playback.status(), beforeTest);
    const reentered = await call('GET'); assert.equal(reentered.playbackStatus.savedRevision, 3); assert.equal(reentered.playbackStatus.playbackRevision, 1);
    assert(!JSON.stringify(reentered).includes('synthetic-only-test'));
    const b = await call('PLAYBACK_BEGIN', {requestId: 'play-b'}); assert.equal(b.revision, 3);
    assert.equal((await call('PLAYBACK_STARTED', {lease: a.lease})).playbackRevision, null);
    assert.equal((await call('PLAYBACK_STARTED', {lease: b.lease})).playbackRevision, 3);
    assert.equal(b.config.enabled, true); assert.equal(services[1].runtime.token, 'synthetic-only-test');
    assert.equal(services[1].runtime.origin.url, 'https://saved.invalid');
    assert.equal((await handlers.get(cd2Ipc.RESOLVE_CHANNEL)(eventFor(web), {requestId: 'old', configLease: a.lease})).status, 'cancelled');
    const cleared = await call('CLEAR_TOKEN'); assert.equal(cleared.playbackStatus.savedRevision, 4); assert.equal(cleared.requiresRestart, false);
    await call('PLAYBACK_END', {lease: b.lease});
    const c = await call('PLAYBACK_BEGIN', {requestId: 'play-c'}); assert.equal(c.config.cd2.tokenConfigured, false); assert.equal(services[2].runtime.token, '');
});

test('config begin emits one bounded outcome and elapsed time, never exception text or leases', async () => {
    for (const [reason, invoke] of [
        ['ready', () => Promise.resolve({status: 'ok', lease: 'PRIVATE_LEASE', config: {version: 1, cd2: {}, rules: []}})],
        ['invalid-response', () => Promise.resolve({status: 'bad', error: 'PRIVATE_ERROR'})],
        ['ipc-error', () => Promise.reject(Error('PRIVATE_ERROR token=PRIVATE_TOKEN'))],
        ['timeout', () => new Promise(() => {})]
    ]) {
        const events = [];
        const snapshot = await client.begin({ipc: {invoke}, requestId: 'diagnostic', timeoutMs: 5, onDiagnostic: v => events.push(v)});
        if (snapshot) snapshot.release();
        assert.equal(events.length, 1);
        assert.equal(events[0].reason, reason);
        assert(events[0].elapsedMs >= 0);
        assert.equal(events[0].timeoutMs, 5);
        assert(!JSON.stringify(events).includes('PRIVATE'));
    }
    const events = [], controller = new AbortController();
    const result = client.begin({ipc: {invoke: () => new Promise(() => {})}, signal: controller.signal, onDiagnostic: v => events.push(v)});
    controller.abort();
    assert.equal(await result, null);
    assert.equal(events[0].reason, 'aborted');
    assert.equal(events.length, 1);
});

test('config observation failure cannot fail acquisition or change the default timeout', async () => {
    const ipc = {invoke: () => Promise.resolve({status: 'ok', lease: 'valid', config: {version: 1, cd2: {}, rules: []}})};
    for (const sink of [() => {throw Error('logger');}, () => Promise.reject(Error('logger'))]) {
        const snapshot = await client.begin({ipc, onDiagnostic: sink});
        assert(snapshot);
        snapshot.release();
    }
    let event;
    const snapshot = await client.begin({ipc, onDiagnostic: v => {event = v;}});
    assert.equal(event.timeoutMs, 1000);
    snapshot.release();
});
