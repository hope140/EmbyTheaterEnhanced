'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const {temporaryRoot} = require('./helpers/range-fixture-root.cjs');
const {EventEmitter} = require('node:events');
const {createAuthority} = require('../src/electronapp/enhanced/preload-source-authority');
const {createCache} = require('../src/electronapp/enhanced/shared-playback-cache/adapter');
const {createDeferredStore} = require('../src/electronapp/enhanced/shared-playback-cache/deferred-store');
const {createStore} = require('../src/electronapp/enhanced/shared-playback-cache/store');
const {get, hash, delay} = require('../tools/shared-playback-cache/fixture.cjs');
const gate = () => {let release; const wait = new Promise(resolve => {release = resolve;}); return {wait, release};};
const identity = item => ({serverOrigin: 'http://owned-server.invalid', serverId: 'server', accountId: 'account',
    itemId: item, mediaSourceId: 'media-' + item, representation: 'representation-' + item});
async function cleanup(actions, remove) {
    const results = await Promise.allSettled(actions.map(action => Promise.resolve().then(action)));
    results.push(...await Promise.allSettled([Promise.resolve().then(remove)]));
    const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
    if (errors.length) throw new AggregateError(errors, 'owned-adapter-fixture-cleanup-failed');
}

async function fixture(t, {etag = '"owned-v1"'} = {}) {
    const parent = temporaryRoot('ete-app-shared-', ['cache']);
    const root = path.join(parent, 'cache'), data = Buffer.alloc(64 * 1024, 0x5a), requests = [];
    const caches = [];
    let server, authority;
    t.after(() => cleanup([...caches.map(value => () => value.close()), () => authority?.close(), () => {
        if (!server?.listening) return;
        server.closeAllConnections();
        return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }], () => fs.rm(parent, {recursive: true, force: true})));
    let mode = 'normal', clock = 10000;
    server = http.createServer((req, res) => {
        const row = {url: req.url, range: req.headers.range, cookie: req.headers.cookie,
            authorization: req.headers.authorization, agent: req.headers['user-agent'], closed: false};
        requests.push(row); res.once('close', () => {row.closed = true;});
        if (mode === 'hang') return;
        if (mode === 'denied') {res.writeHead(403); res.end(); return;}
        if (mode === 'redirect') {res.writeHead(302, {Location: 'http://127.0.0.1:1/never-follow'}); res.end(); return;}
        const range = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || '');
        if (!range) {res.writeHead(416); res.end(); return;}
        const start = Number(range[1]), end = Number(range[2]);
        const headers = {'Content-Range': `bytes ${start}-${end}/${data.length + (mode === 'total' ? 1 : 0)}`,
            'Content-Length': end - start + 1, 'Set-Cookie': 'owned-probe-cookie=must-not-replay'};
        if (etag !== null) headers.ETag = etag;
        res.writeHead(206, headers);
        if (req.url.includes('hold=1') && end > start) {res.write(data.subarray(start, start + 1)); return;}
        res.end(mode === 'short' ? Buffer.alloc(0) : data.subarray(start, end + 1));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/owned`;
    authority = createAuthority({now: () => clock});
    const web = new EventEmitter();
    web.isDestroyed = () => false;
    const principal = authority.principalFor(web);
    function source(item = 'A', extra = {}) {
        const owner = new AbortController(), requestId = 'play-' + item;
        const descriptor = {source: url, expectedSize: data.length, ...extra};
        const proof = authority.issue({principal, requestId, sourceKind: 'direct-url', resourceKey: 'owned-file-' + item, ...descriptor});
        const transport = authority.bind({sourceProof: proof, source: descriptor.source, principal, requestId, signal: owner.signal});
        return {owner, source: descriptor.source, transport, identity: {...identity(item), representation: transport.representation}, isCurrent: () => true,
            signal: owner.signal, currentBytes: 2 * 1024 * 1024};
    }
    const config = {kind: 'shared-byte-trial', root, preloadMB: 100, progressPercent: 70, timeoutMs: 1000};
    async function cache(dependencies) {const value = await createCache(config, dependencies); caches.push(value); return value;}
    return {root, data, requests, source, cache, config, web,
        mode: value => {mode = value;}, time: value => {clock = value;}, url};
}

test('deferred store never exposes hits or admits payload before recovery and rechecks queued ownership', async t => {
    const parent = temporaryRoot('ete-deferred-unit-', ['cache']), blocked = gate();
    let store, backend, live = true;
    t.after(async () => {blocked.release(); await cleanup([() => store?.close()], () => fs.rm(parent, {recursive: true, force: true}));});
    store = createDeferredStore({root: path.join(parent, 'cache'), currentBytes: 1024, nextBytes: 1024}, {
        create: async options => {await blocked.wait; backend = await createStore(options); return backend;}
    });
    const id = {server: 'server', account: 'account', item: 'item', mediaSource: 'source', resource: 'resource', representation: 'original'};
    const opening = store.open(id, {total: 1024}, 'next', {isCurrent: () => live}).catch(error => error);
    assert.equal(await store.put('unknown', 0, Buffer.from('late')), false);
    assert.equal(await store.read('unknown', 0, 1), null);
    assert.equal(await store.span('unknown', 0), null);
    assert.equal(store.status().initializing, true);
    live = false; blocked.release();
    assert.ok(await opening instanceof Error);
    assert.equal(backend.status().entries, 0);
    await store.close();
    assert.equal(backend.status().closed, true);
});

test('branded known-size source forwards while disk recovery is pending, then marks actual and reuses bytes', async t => {
    const blocked = gate();
    t.after(blocked.release);
    const f = await fixture(t);
    let backend;
    const cache = await f.cache({createStore: async options => {
        await blocked.wait; backend = await createStore(options); return backend;
    }});
    const handle = await cache.open(f.source());
    assert.equal(backend, undefined);
    assert.equal(cache.status().initializing, true);
    const cold = await get(handle.source, 0, f.data.length);
    assert.equal(cold.hash, hash(f.data));
    assert.equal(backend, undefined, 'network cannot wait for metadata initialization');
    blocked.release();
    assert.equal(await handle.markPlaying(), true);
    const warmed = await handle.prefetch({maxBytes: f.data.length, signal: new AbortController().signal});
    assert.equal(warmed.bytes, f.data.length);
    const before = f.requests.length;
    assert.equal((await get(handle.source, 0, f.data.length)).hash, cold.hash);
    assert.equal(f.requests.length, before);
    assert.ok(backend.status().currentKey);
    assert.equal(backend.status().recoveryMode, 'on-demand');
    assert.equal(f.requests[0].range, 'bytes=0-0');
    assert.equal(f.requests.filter(row => row.range === 'bytes=0-0').length, 1, 'the real adapter probe is not duplicated');
    assert.ok(f.requests.every(row => row.cookie === undefined && row.authorization === undefined));
    await handle.stop();
});

test('next preparation preserves actual bytes and discardNext only clears its candidate', async t => {
    const f = await fixture(t), cache = await f.cache();
    const a = await cache.open(f.source('A'));
    await a.prefetch({maxBytes: f.data.length, signal: new AbortController().signal});
    await a.markPlaying();
    const b = await cache.open(f.source('B'));
    const prepared = await b.prefetch({maxBytes: 32768, signal: new AbortController().signal});
    assert.equal(prepared.bytes, 32768);
    assert.equal(cache.status().currentBytes, f.data.length);
    assert.equal(cache.status().nextBytes, 32768);
    await cache.discardNext();
    assert.equal(cache.status().currentBytes, f.data.length);
    assert.equal(cache.status().nextBytes, 0);
    const before = f.requests.length;
    assert.equal((await get(a.source, 0, f.data.length)).hash, hash(f.data));
    assert.equal(f.requests.length, before);
});

test('an already recovered backend publishes a reopened preloaded route only after its first-hit metadata is ready', async t => {
    const blocked = gate(); t.after(blocked.release);
    const f = await fixture(t);
    let hold = false, enter, failGate;
    const entered = new Promise((resolve, reject) => {enter = resolve; failGate = reject;});
    entered.catch(() => {});
    const cache = await f.cache({createStore: async options => {
        try {
            const backend = await createStore(options);
            return {...backend, async open(...args) {
                // Readiness belongs to the store operation, not a checkpoint:
                // an unchanged prepared entry now legitimately needs no write.
                try {if (hold) {enter(); await blocked.wait;} return await backend.open(...args);}
                catch (error) {failGate(error); throw error;}
            }};
        } catch (error) {failGate(error); throw error;}
    }});
    const a = await cache.open(f.source('A'));
    await a.prefetch({maxBytes: f.data.length, signal: new AbortController().signal});
    await a.markPlaying();
    const b = await cache.open(f.source('B'));
    assert.equal((await b.prefetch({maxBytes: 40, signal: new AbortController().signal})).bytes, 40);
    await b.stop();

    hold = true;
    let published = false;
    const before = f.requests.length;
    const reopening = cache.open(f.source('B')).then(value => {published = true; return value;});
    let timer;
    try {
        await Promise.race([entered, reopening.then(() => {throw Error('route-published-before-metadata-gate');}),
            new Promise((_resolve, reject) => {timer = setTimeout(() => reject(Error('metadata-gate-timeout')), 2000);})]);
    } finally {clearTimeout(timer);}
    assert.equal(published, false, 'a ready backend must establish existing coverage before publishing the URL');
    hold = false; blocked.release();
    const currentB = await reopening;
    const first = await get(currentB.source, 0, 8);
    assert.equal(first.status, 206);
    assert.equal(first.hash, hash(f.data.subarray(0, 8)));
    assert.equal(f.requests.length - before, 1, 'only the authorized metadata byte may reach origin');
    assert.equal(f.requests.at(-1).range, 'bytes=0-0');
});

test('failed deferred disk initialization leaves authorized foreground bytes playable', async t => {
    const f = await fixture(t), cache = await f.cache({createStore: async () => {throw Error('owned-injected-disk-failure');}});
    const handle = await cache.open(f.source());
    const body = await get(handle.source, 0, f.data.length);
    assert.equal(body.status, 206);
    assert.equal(body.hash, hash(f.data));
    assert.equal(cache.status().unavailable, true);
    assert.equal(cache.status().bytes, 0);
    await handle.stop();
});

for (const etag of [null, 'W/"ordinary-library"']) {
    test('ordinary branded source can use weak metadata without inventing strong validation: ' + etag, async t => {
        const f = await fixture(t, {etag}), cache = await f.cache();
        const handle = await cache.open(f.source());
        const result = await get(handle.source, 0, 1024);
        assert.equal(result.hash, hash(f.data.subarray(0, 1024)));
        assert.match(cache.status().confidence, /metadata-assumed/);
    });
}

for (const mode of ['redirect', 'denied', 'total', 'short']) {
    test('metadata probe refuses ' + mode + ' before publishing a route', async t => {
        const f = await fixture(t), cache = await f.cache(); f.mode(mode);
        await assert.rejects(cache.open(f.source()));
        assert.equal(f.requests.length, 1);
        assert.equal(cache.status().routes, 0);
        assert.ok(f.requests[0].closed);
    });
}

test('forged proof and unknown expected size never reach the source', async t => {
    const f = await fixture(t), cache = await f.cache(), valid = f.source();
    await assert.rejects(cache.open({...valid, transport: {...valid.transport}}), /source-proof-invalid/);
    await assert.rejects(cache.open(f.source('B', {expectedSize: undefined})), /file-size-unavailable/);
    assert.equal(f.requests.length, 0);
});

test('fresh original-source probe restores strong cached identity and access refusal cannot bypass it', async t => {
    const f = await fixture(t), first = await f.cache();
    const a = await first.open(f.source());
    await a.prefetch({maxBytes: f.data.length, signal: new AbortController().signal});
    await a.markPlaying(); await first.close();
    const reopened = await f.cache(), before = f.requests.length;
    const route = await reopened.open(f.source());
    assert.equal((await route.prefetch({maxBytes: f.data.length, signal: new AbortController().signal})).bytes, f.data.length);
    assert.equal(f.requests.length - before, 1);
    assert.equal((await get(route.source, 0, f.data.length)).hash, hash(f.data));
    assert.equal(f.requests.length - before, 1);
    await route.stop();
    f.mode('denied');
    await assert.rejects(reopened.open(f.source()), /auth-required/);
    assert.equal(reopened.status().routes, 0);
});

test('each origin fetch resolves fresh branded access while preserving original load options', async t => {
    const f = await fixture(t), cache = await f.cache();
    const options = f.source('A', {source: f.url + '?ticket=first', acquiredAt: 9000, expiresAt: 13000,
        requestOptions: {userAgent: 'OwnedAgent'}, refresh: async () => ({source: f.url + '?ticket=fresh',
            sourceKind: 'direct-url', acquiredAt: 13000, expiresAt: 30000, expectedSize: f.data.length,
            requestOptions: {userAgent: 'OwnedAgent'}})});
    const handle = await cache.open(options);
    f.time(13000);
    assert.equal((await get(handle.source, 0, 1024)).hash, hash(f.data.subarray(0, 1024)));
    assert.match(f.requests[0].url, /ticket=first/);
    assert.match(f.requests[1].url, /ticket=fresh/);
    assert.ok(f.requests.every(row => row.agent === 'OwnedAgent'));
    assert.equal(options.transport.matchesLoadOptions(['loadfile', options.source, 'replace', '-1', 'user-agent=OwnedAgent']), true);
    options.owner.abort();
    await handle.stop();
    assert.equal((await get(handle.source, 0, 1)).status, 403);
});

test('changing M with active routes falls back and an idle owner can reopen without restart', async t => {
    const f = await fixture(t), cache = await f.cache();
    const a = await cache.open(f.source('A'));
    await assert.rejects(cache.open({...f.source('B'), currentBytes: 3 * 1024 * 1024}), /cache-unavailable/);
    await a.stop();
    await assert.rejects(cache.open({...f.source('B'), currentBytes: 3 * 1024 * 1024}), /cache-unavailable/);
    const deadline = Date.now() + 1000;
    while (cache.status().unavailable && Date.now() < deadline) await delay(1);
    const b = await cache.open({...f.source('B'), currentBytes: 3 * 1024 * 1024});
    assert.equal((await get(b.source, 0, 1024)).hash, hash(f.data.subarray(0, 1024)));
    assert.equal(cache.status().maxBytes, 3 * 1024 * 1024 + (100 * 1024 * 1024));
});

test('uncached actual intent is deferred without granting access and same media alone preserves recovered bytes', async t => {
    const f = await fixture(t), initial = await f.cache();
    const a = await initial.open(f.source('A'));
    await a.prefetch({maxBytes: f.data.length, signal: new AbortController().signal});
    await a.markPlaying(); await initial.close();
    const cache = await f.cache(), before = f.requests.length;
    await cache.markUncachedPlaying(identity('B'));
    assert.equal(f.requests.length, before);
    const b = await cache.open(f.source('B'));
    await b.prefetch({maxBytes: f.data.length, signal: new AbortController().signal});
    assert.equal(cache.status().currentBytes, 0, 'the pending uncached actual must retire recovered A');
    await b.markPlaying();
    await cache.markUncachedPlaying(identity('B'));
    assert.equal(cache.status().currentBytes, f.data.length);
    await cache.markUncachedPlaying(identity('C'));
    assert.equal(cache.status().currentBytes, 0);
    const c = await cache.open(f.source('C'));
    await c.prefetch({maxBytes: f.data.length, signal: new AbortController().signal});
    await c.markPlaying();
    assert.equal(cache.status().currentBytes, f.data.length);
    await cache.markUncachedPlaying(null);
    assert.equal(cache.status().currentBytes, 0);
});

test('preload reports retained coverage rather than successful network spend when writes are skipped', async t => {
    const f = await fixture(t), cache = await f.cache({createStore: async options => {
        const store = await createStore(options);
        return {...store, put: async () => false};
    }});
    const handle = await cache.open(f.source());
    const result = await handle.prefetch({maxBytes: f.data.length, signal: new AbortController().signal});
    assert.equal(result.bytes, 0);
    assert.equal(handle.status().bytes, 0);
    assert.ok(f.requests.some(row => row.range === `bytes=0-${f.data.length - 1}`));
});

test('retiring an owner aborts a pending metadata probe and publishes no route', async t => {
    const f = await fixture(t), cache = await f.cache(), options = f.source(); f.mode('hang');
    const opening = cache.open(options).catch(error => error);
    const deadline = Date.now() + 1000;
    while (!f.requests.length && Date.now() < deadline) await delay(1);
    assert.equal(f.requests.length, 1);
    options.owner.abort();
    assert.match((await opening).message, /request-cancelled/);
    assert.equal(cache.status().routes, 0);
});

test('stopping a next route does not join an unrelated active current response', async t => {
    const f = await fixture(t), cache = await f.cache();
    const a = await cache.open(f.source('A', {source: f.url + '?hold=1'}));
    await a.markPlaying();
    let first;
    const seen = new Promise(resolve => {first = resolve;});
    const reading = get(a.source, 0, f.data.length, {onFirst: first}).catch(error => error);
    await seen;
    const b = await cache.open(f.source('B'));
    let stopped = false;
    const stopping = b.stop().then(() => {stopped = true;});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(stopped, true);
    assert.ok(f.requests.some(row => row.url.includes('hold=1') && row.range !== 'bytes=0-0' && !row.closed));
    await stopping; await a.stop();
    assert.ok(await reading instanceof Error);
});

test('retired uncached intent waiting for initialization cannot clear recovered or newly actual B', async t => {
    const blocked = gate(); t.after(blocked.release);
    const f = await fixture(t), seeded = await f.cache();
    const original = await seeded.open(f.source('B'));
    await original.prefetch({maxBytes: f.data.length, signal: new AbortController().signal});
    await original.markPlaying(); await seeded.close();
    const cache = await f.cache({createStore: async options => {await blocked.wait; return createStore(options);}});
    let oldOwner = true;
    await cache.markUncachedPlaying(identity('A'), () => oldOwner);
    const before = f.requests.length;
    const b = await cache.open(f.source('B'));
    oldOwner = false;
    blocked.release();
    assert.equal((await b.prefetch({maxBytes: f.data.length, signal: new AbortController().signal})).bytes, f.data.length);
    assert.equal(cache.status().currentBytes, f.data.length, 'queued stale intent cannot retire recovered B');
    assert.equal(f.requests.length - before, 1, 'B needs only its fresh metadata probe, without a payload refill');
    assert.equal(await b.markPlaying(), true);
    assert.equal(await cache.markUncachedPlaying(identity('A'), () => oldOwner), false);
    assert.equal(cache.status().currentBytes, f.data.length, 'late stale cleanup cannot retire newly actual B');
});

test('deferred close joins resource release and preserves an actual cleanup failure', async t => {
    const parent = temporaryRoot('ete-deferred-close-', ['cache']);
    const options = {root: path.join(parent, 'cache'), currentBytes: 1024, nextBytes: 1024};
    let backend, reopened;
    t.after(() => cleanup([() => backend?.close(), () => reopened?.close()], () => fs.rm(parent, {recursive: true, force: true})));
    backend = await createStore(options);
    const store = createDeferredStore(options, {create: async () => {
        return {...backend, async close() {await backend.close(); throw Error('owned-close-failure');}};
    }});
    await assert.rejects(store.close(), /owned-close-failure/);
    assert.equal(backend.status().closed, true);
    reopened = await createStore(options);
    await reopened.close();
});
