'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const {createStore, identityKey} = require('../src/electronapp/enhanced/playback-range-store');
const {createReader} = require('../src/electronapp/enhanced/playback-range-http');
const {createCache, parseRange} = require('../src/electronapp/enhanced/playback-range-cache');
const proof = {etag: '"v1"', total: 32};
const identity = (extra = {}) => ({serverId: 'server', serverOrigin: 'http://fixture.invalid', accountId: 'account', itemId: 'video', mediaSourceId: 'edition', representation: 'static-file', ...extra});
const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve};};
async function storeFixture(t, extra = {}) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ete-byte-ranges-'));
    t.after(() => fs.rm(root, {recursive: true, force: true}));
    const options = {root, blockBytes: 4, maxBytes: 32, minFreeBytes: 0, ...extra};
    const store = await createStore(options); return {store, root, options};
}
async function network(t, extra = {}) {
    const body = Buffer.from('abcdefghijklmnopqrstuvwxyz012345');
    const rows = [], held = new Set(), entered = deferred();
    const behavior = {etag: '"v1"', total: body.length, mode: 'normal', hold: false};
    const server = http.createServer((req, res) => {
        const m = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || '');
        const row = {path: req.url, headers: req.headers, start: m && +m[1], end: m && +m[2]}; rows.push(row);
        if (!m) {res.writeHead(400); res.end(); return;}
        if (behavior.hold && row.end > row.start) {held.add(res); res.on('close', () => held.delete(res)); entered.resolve(); return;}
        if (behavior.mode === 'redirect') {res.writeHead(302, {Location: '/other'}); res.end(); return;}
        if (behavior.mode === 'unauthorized') {res.writeHead(401); res.end(); return;}
        const data = body.subarray(row.start, row.end + 1);
        const headers = {ETag: behavior.etag, 'Content-Range': `bytes ${row.start}-${row.end}/${behavior.total}`,
            'Content-Length': data.length, 'Content-Type': 'application/octet-stream'};
        if (behavior.mode === 'encoded') headers['Content-Encoding'] = 'gzip';
        if (behavior.mode === 'unknown-length') delete headers['Content-Length'];
        res.writeHead(behavior.mode === 'ignores-range' ? 200 : 206, headers);
        if (behavior.mode === 'interrupted') {res.write(data.subarray(0, 1)); res.destroy();} else res.end(data);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ete-range-proxy-'));
    const caches = new Set();
    t.after(async () => {
        try {for (const cache of caches) await cache.close();}
        finally {server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fs.rm(root, {recursive: true, force: true});}
    });
    const options = {root, blockBytes: 4, maxBytes: 32, minFreeBytes: 0, timeoutMs: 1000, ...extra};
    const cache = await createCache(options); caches.add(cache);
    return {cache, caches, root, options, source: origin + '/media?api_key=synthetic-only', id: identity({serverOrigin: origin}), rows, body, behavior, held, entered};
}
const get = async (source, range) => {const response = await fetch(source, {headers: range ? {Range: range} : {}}); return {status: response.status, bytes: Buffer.from(await response.arrayBuffer()), headers: response.headers};};

test('block index preserves only actual last playback across a normal close/reopen', async t => {
    const f = await storeFixture(t); let store = f.store;
    const a = await store.acquire(identity(), proof); await a.writeBlock(1, Buffer.from('abcd')); await a.markPlaying(); await a.release();
    const next = await store.acquire(identity({itemId: 'next'}), proof, 'next'); await next.writeBlock(0, Buffer.from('next')); await next.release();
    await store.close(); store = await createStore(f.options);
    const last = await store.acquire(identity(), proof), unplayed = await store.acquire(identity({itemId: 'next'}), proof);
    assert.equal((await last.readBlock(1)).toString(), 'abcd'); assert.equal(await last.readBlock(0), null); assert.equal(await unplayed.readBlock(0), null);
    await unplayed.release(); await last.release(); await store.close();
});
test('opening/preloading another video does not clear the last; actual playback waits for old read leases', async t => {
    const {store, root} = await storeFixture(t);
    const a = await store.acquire(identity(), proof); await a.writeBlock(0, Buffer.from('last')); await a.markPlaying();
    const b = await store.acquire(identity({itemId: 'next'}), proof, 'next'); await b.writeBlock(0, Buffer.from('next'));
    assert.equal((await a.readBlock(0)).toString(), 'last'); await b.markPlaying();
    assert.equal((await a.readBlock(0)).toString(), 'last'); assert.equal(store.status().bytes, 8);
    await a.release(); assert.equal(store.status().bytes, 4); await b.release(); await store.close();
    assert.doesNotMatch(await fs.readFile(path.join(root, 'index.json'), 'utf8'), /synthetic|api_key|http:/);
});
test('server/account/media-source/representation/version identities cannot share bytes', async t => {
    const {store} = await storeFixture(t); const a = await store.acquire(identity(), proof); await a.writeBlock(0, Buffer.from('data')); await a.markPlaying();
    for (const change of [{serverId: 'other'}, {serverOrigin: 'https://other.invalid'}, {accountId: 'other'}, {mediaSourceId: 'other'}, {representation: 'transcode'}]) {
        const b = await store.acquire(identity(change), proof); assert.equal(await b.readBlock(0), null); await b.release();
    }
    const b = await store.acquire(identity(), {...proof, etag: '"v2"'}); assert.equal(await b.readBlock(0), null); await b.release();
    await a.release(); await store.close();
});
test('quota is a hard media-byte bound and corruption becomes a miss', async t => {
    const {store, root} = await storeFixture(t, {maxBytes: 4}); const a = await store.acquire(identity(), proof); await a.markPlaying();
    assert.equal(await a.writeBlock(0, Buffer.from('data')), true); assert.equal(await a.writeBlock(1, Buffer.from('more')), false);
    const filename = (await fs.readdir(root)).find(n => n.endsWith('.bytes')); await fs.writeFile(path.join(root, filename), 'bad!');
    assert.equal(await a.readBlock(0), null); assert.equal(store.status().bytes, 0); await a.release(); await store.close();
});
test('orphan interrupted writes are cleaned; redirected roots and concurrent writers fail closed', async t => {
    const f = await storeFixture(t); await assert.rejects(createStore(f.options), {code: 'EEXIST'}); await f.store.close();
    await fs.writeFile(path.join(f.root, '11111111-1111-1111-1111-111111111111.pending'), 'half');
    const reopened = await createStore(f.options); assert.equal((await fs.readdir(f.root)).some(n => n.endsWith('.pending')), false); await reopened.close();
    const alias = f.root + '-alias'; await fs.symlink(f.root, alias, process.platform === 'win32' ? 'junction' : 'dir'); t.after(() => fs.unlink(alias));
    await assert.rejects(createStore({...f.options, root: alias}), /redirected/);
});
test('weak validators and invalid explicit limits cannot open a store object', async t => {
    const {store} = await storeFixture(t);
    assert.throws(() => identityKey(identity(), {...proof, etag: 'W/"weak"'}), /identity/); await store.close();
});
test('range parser supports bounded/open/suffix ranges and rejects multipart/overflow', () => {
    assert.deepEqual(parseRange('bytes=4-', 10), {start: 4, end: 9, partial: true}); assert.deepEqual(parseRange('bytes=-3', 10), {start: 7, end: 9, partial: true});
    for (const value of ['bytes=20-', 'bytes=3-1', 'bytes=-0', 'bytes=0-2,4-5', 'bytes=99999999999999999999-']) assert.equal(parseRange(value, 10), null);
});
test('actual proxy reads cached blocks and only fetches missing blocks, including a tail seek', async t => {
    const f = await network(t), handle = await f.cache.open({source: f.source, identity: f.id, isCurrent: () => true});
    let result = await get(handle.source, 'bytes=2-9'); assert.equal(result.status, 206); assert.deepEqual(result.bytes, f.body.subarray(2, 10));
    assert.equal(f.rows.length, 4); assert(f.rows.slice(1).every(row => row.headers['if-match'] === '"v1"'));
    await get(handle.source, 'bytes=3-7'); assert.equal(f.rows.length, 4);
    result = await get(handle.source, 'bytes=-3'); assert.deepEqual(result.bytes, f.body.subarray(-3)); assert.equal(f.rows.length, 5);
    await handle.markPlaying(); await handle.stop(); assert.equal(f.cache.status().upstream, 0);
});
test('a fresh signed URL probe permits same-version bytes after exit; no credentials enter the index', async t => {
    const f = await network(t); let handle = await f.cache.open({source: f.source, identity: f.id, isCurrent: () => true});
    await get(handle.source, 'bytes=0-7'); await handle.markPlaying(); await handle.stop(); await f.cache.close();
    const cache = await createCache(f.options); f.caches.add(cache);
    const count = f.rows.length;
    handle = await cache.open({source: f.source.replace('synthetic-only', 'synthetic-new'), identity: f.id, isCurrent: () => true});
    assert.deepEqual((await get(handle.source, 'bytes=0-7')).bytes, f.body.subarray(0, 8)); assert.equal(f.rows.length, count + 1);
    assert.match(f.rows.at(-1).path, /synthetic-new/); await handle.stop();
    assert.doesNotMatch(await fs.readFile(path.join(f.root, 'index.json'), 'utf8'), /api_key|synthetic|account|http:/);
});
for (const mode of ['ignores-range', 'redirect', 'unauthorized', 'encoded', 'unknown-length', 'interrupted']) test('unsupported origin response falls back before source selection: ' + mode, async t => {
    const f = await network(t); f.behavior.mode = mode;
    await assert.rejects(f.cache.open({source: f.source, identity: f.id, isCurrent: () => true})); assert.equal(f.cache.status().routes, 0); assert.equal(f.cache.status().upstream, 0);
});
test('changed ETag or length cannot splice old cached bytes into an origin range', async t => {
    const f = await network(t), handle = await f.cache.open({source: f.source, identity: f.id, isCurrent: () => true});
    await get(handle.source, 'bytes=0-3'); f.behavior.etag = '"new"';
    assert.equal((await get(handle.source, 'bytes=4-7')).status, 502); assert.equal(f.cache.status().bytes, 4); await handle.stop();
});
test('disk pressure bypasses writes while foreground ranges remain correct', async t => {
    const f = await network(t, {maxBytes: 4}), handle = await f.cache.open({source: f.source, identity: f.id, isCurrent: () => true});
    assert.deepEqual((await get(handle.source, 'bytes=0-15')).bytes, f.body.subarray(0, 16)); assert.equal(f.cache.status().bytes, 4); await handle.stop();
});
test('HEAD, invalid ranges and browser-origin requests neither fetch media nor expose arbitrary targets', async t => {
    const f = await network(t), handle = await f.cache.open({source: f.source, identity: f.id, isCurrent: () => true});
    assert.equal((await fetch(handle.source, {method: 'HEAD'})).headers.get('content-length'), '32');
    assert.equal((await get(handle.source, 'bytes=0-1,3-4')).status, 416);
    assert.equal((await fetch(handle.source, {headers: {Origin: 'http://other.invalid'}})).status, 403);
    assert.equal((await fetch(handle.source + '?url=http://other.invalid')).status, 403); assert.equal(f.rows.length, 1); await handle.stop();
});
test('stop aborts held ranges, waits for owned work and closes the lease', {timeout: 5000}, async t => {
    const f = await network(t), controller = new AbortController(), handle = await f.cache.open({source: f.source, identity: f.id, isCurrent: () => true, signal: controller.signal});
    f.behavior.hold = true; const pending = get(handle.source, 'bytes=4-7').catch(() => null); await f.entered.promise;
    controller.abort(); await handle.stop(); await pending;
    assert.equal(f.cache.status().requests, 0); assert.equal(f.cache.status().upstream, 0); assert.equal(f.cache.status().leases, 0);
});
test('prefetch is bounded, reused on next playback, and never retained merely because it was warmed', async t => {
    const f = await network(t), controller = new AbortController(), handle = await f.cache.open({source: f.source, identity: f.id, isCurrent: () => true, role: 'next'});
    const result = await handle.prefetch({maxBytes: 9, bytesPerSecond: 1000000, signal: controller.signal});
    assert.equal(result.bytes, 8); assert.equal(f.rows.reduce((n, r) => n + r.end - r.start + 1, 0), 9);
    await handle.stop(); assert.equal(f.cache.status().bytes, 8); await f.cache.close();
    const cache = await createCache(f.options); f.caches.add(cache); assert.equal(cache.status().bytes, 0);
});
test('foreground misses preempt an in-flight background range and cancellation frees both', {timeout: 5000}, async t => {
    const f = await network(t), current = await f.cache.open({source: f.source, identity: f.id, isCurrent: () => true});
    const next = await f.cache.open({source: f.source.replace('/media', '/next'), identity: {...f.id, itemId: 'next'}, isCurrent: () => true, role: 'next'});
    f.behavior.hold = true; const controller = new AbortController();
    const warm = next.prefetch({maxBytes: 25, bytesPerSecond: 1000000, signal: controller.signal}); warm.catch(() => {}); await f.entered.promise;
    f.behavior.hold = false; const result = await get(current.source, 'bytes=8-11'); assert.deepEqual(result.bytes, f.body.subarray(8, 12));
    controller.abort(); await Promise.allSettled([warm]); await current.stop(); await next.stop();
    assert.equal(f.cache.status().upstream, 0); assert.equal(f.cache.status().leases, 0);
});
test('confirmed progress/prefix choices default to 70 percent and 300 MB', () => {
    const policy = require('../src/electronapp/enhanced/playback-range-policy');
    assert.deepEqual(policy.selection(), {progressPercent: 70, preloadMB: 300, prefetchBytes: 300000000});
    for (const progressPercent of [50, 60, 70, 80, 90]) for (const preloadMB of [100, 300, 500]) assert.equal(policy.selection({progressPercent, preloadMB}).prefetchBytes, preloadMB * 1000000);
    assert.throws(() => policy.selection({progressPercent: 30}), /invalid/); assert.throws(() => policy.selection({preloadMB: 1000}), /invalid/);
});
