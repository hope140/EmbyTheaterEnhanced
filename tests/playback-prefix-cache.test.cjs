'use strict';
const {temporaryRoot} = require('./helpers/range-fixture-root.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), sync = require('node:fs'), http = require('node:http');
const path = require('node:path'), os = require('node:os'), vm = require('node:vm'), {createRequire} = require('node:module');
function load(file, replacements) {
    const filename = path.resolve(__dirname, '../src/electronapp/enhanced', file), real = createRequire(filename), module = {exports: {}};
    vm.runInNewContext(sync.readFileSync(filename, 'utf8'), {module, exports: module.exports, Buffer, URL, AbortController, AbortSignal,
        setTimeout, clearTimeout, process, require: name => Object.hasOwn(replacements, name) ? replacements[name] : real(name)}, {filename});
    return module.exports;
}
// Substitute only the policy result to exercise the unchanged storage/HTTP code
// at 17 bytes. Product settings tests separately enforce 100/300/500 MB only.
function smallCache(fileSystem = fs) {
    const store = load('playback-prefix-store.js', {'./playback-range-policy': {selection: () => ({prefetchBytes: 17})}, 'node:fs/promises': fileSystem});
    return load('playback-range-cache.js', {'./playback-prefix-store': store});
}
async function fixture(t, hold = false, fileSystem = fs) {
    const root = temporaryRoot('ete-prefix-', ['']), body = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyzABCD');
    const requests = [], cacheReads = [], handles = [], controls = [], caches = [], sockets = new Set(); let held, resolveHeld;
    const entered = new Promise(r => {resolveHeld = r;});
    const server = http.createServer((req, res) => {
        const m = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || ''), start = +(m && m[1]), end = +(m && m[2]);
        if (!m || end >= body.length) {res.writeHead(416).end(); return;}
        const row = {url: req.url, start, end, closed: false, lateBytes: 0}; requests.push(row);
        res.once('close', () => {row.closed = true;});
        res.writeHead(206, {ETag: '"fixed"', 'Content-Range': `bytes ${start}-${end}/${body.length}`, 'Content-Length': end - start + 1});
        if (hold && req.url === '/next' && end > start && !held) {
            held = row; res.write(body.subarray(start, start + 1));
            row.release = () => {if (!res.destroyed) {row.lateBytes += end - start; res.end(body.subarray(start + 1, end + 1));}};
            resolveHeld(row);
        } else res.end(body.subarray(start, end + 1));
    });
    server.on('connection', s => {sockets.add(s); s.once('close', () => sockets.delete(s));});
    t.after(async () => {
        controls.forEach(c => c.abort()); await Promise.allSettled(handles.map(h => h.stop()));
        try {for (const cache of caches) await cache.close();} finally {
            const closed = new Promise(r => server.close(r));
            const ended = [...sockets].map(s => new Promise(r => {s.once('close', r); s.destroy();})); await Promise.all([closed, ...ended]);
            await fs.rm(root, {recursive: true, force: true});
        }
    });
    await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
    const origin = 'http://127.0.0.1:' + server.address().port, {createCache} = smallCache(fileSystem);
    async function create() {const cache = await createCache({kind: 'next-prefix', root, preloadMB: 100, timeoutMs: 1000, blockBytes: 8,
        onPrefixRead: row => cacheReads.push(row)}); caches.push(cache); return cache;}
    const cache = await create();
    return {cache, root, requests, cacheReads, body, entered, create,
        control() {const c = new AbortController(); controls.push(c); return c;},
        async open(name, role, selected = cache, accountId = 'a') {
            const handle = await selected.open({source: origin + '/' + name, role, isCurrent: () => true,
                identity: {serverOrigin: origin, serverId: 's', accountId, itemId: name, mediaSourceId: name, representation: 'static'}});
            handles.push(handle); return handle;
        },
        async physical() {let n = 0; for (const name of await fs.readdir(root)) if (/\.(bytes|pending)$/.test(name)) n += (await fs.stat(path.join(root, name))).size; return n;}
    };
}
async function read(handle, start, end) {
    const response = await fetch(handle.source, {headers: {Range: `bytes=${start}-${end}`}});
    assert.equal(response.status, 206); return Buffer.from(await response.arrayBuffer());
}
test('current reads never accumulate; exact bounded next prefix includes a partial final block', async t => {
    const f = await fixture(t), current = await f.open('current');
    assert.deepEqual(await read(current, 0, 31), f.body.subarray(0, 32)); assert.equal(f.cache.status().bytes, 0);
    assert.equal(f.cacheReads.length, 0, 'origin bytes never produce hit observations');
    const next = await f.open('next', 'next'), c = f.control();
    assert.equal((await next.prefetch({maxBytes: 17, signal: c.signal})).bytes, 17);
    assert.equal(f.cache.status().bytes, 17); assert.equal(await f.physical(), 17);
    assert.deepEqual(f.requests.filter(r => r.url === '/next').map(r => [r.start, r.end]), [[0, 0], [0, 7], [8, 15], [16, 16]]);
    await next.stop(); await current.stop();
    const before = f.requests.length, promoted = await f.open('next'); await promoted.markPlaying();
    assert.deepEqual(await read(promoted, 0, 16), f.body.subarray(0, 17));
    assert.deepEqual(f.cacheReads.map(r => [r.itemId, r.start, r.end]), [['next', 0, 7], ['next', 8, 15], ['next', 16, 16]]);
    assert.equal(f.requests.length, before + 1, 'only fresh eligibility probe, no prefix refetch');
    assert.deepEqual(await read(promoted, 12, 31), f.body.subarray(12, 32));
    assert.equal(f.cache.status().bytes, 17, 'tail misses are passthrough and never extend prefix');
    assert.equal(await f.physical(), 17); assert.equal((await fs.readdir(f.root)).includes('index.json'), false);
});
test('promoted and next payload share P; a live route safely refetches its evicted prefix', async t => {
    const f = await fixture(t), next = await f.open('next', 'next');
    await next.prefetch({maxBytes: 17, signal: f.control().signal}); await next.stop();
    const playing = await f.open('next'); await playing.markPlaying();
    const later = await f.open('later', 'next');
    assert.equal(f.cache.status().bytes, 0, 'new candidate reuses disposable playing-prefix space');
    await later.prefetch({maxBytes: 17, signal: f.control().signal});
    assert.equal(await f.physical(), 17); assert.deepEqual(await read(playing, 0, 7), f.body.subarray(0, 8));
    assert.equal(f.cache.status().bytes, 17, 'playing refetch does not steal or extend next budget');
    await assert.rejects(f.open('third', 'next'), /prefix-next-still-retiring/);
    assert.equal(await f.physical(), 17);
});
test('exit and subsequent process-store open discard prefixes rather than restore last-play data', async t => {
    const f = await fixture(t), next = await f.open('next', 'next');
    await next.prefetch({maxBytes: 17, signal: f.control().signal}); await next.stop(); await f.cache.close();
    assert.deepEqual(await fs.readdir(f.root), ['owner']);
    // An interrupted predecessor's payload is equally disposable after ownership is acquired.
    await fs.writeFile(path.join(f.root, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.pending'), 'unfinished');
    const reopened = await f.create(); assert.equal(reopened.status().bytes, 0); assert.deepEqual(await fs.readdir(f.root), ['owner']);
});
test('same source under another account cannot reuse the prefix', async t => {
    const f = await fixture(t), next = await f.open('next', 'next');
    await next.prefetch({maxBytes: 17, signal: f.control().signal}); await next.stop();
    const count = f.requests.length, other = await f.open('next', undefined, f.cache, 'other-account'); await other.markPlaying();
    assert.deepEqual(await read(other, 0, 7), f.body.subarray(0, 8));
    assert.equal(f.requests.length, count + 2, 'new probe and data request; no cross-account hit');
});
test('foreground preemption and cancellation close a held next response without committing late bytes', {timeout: 5000}, async t => {
    const f = await fixture(t, true), current = await f.open('current'), next = await f.open('next', 'next'), c = f.control();
    const warming = next.prefetch({maxBytes: 17, signal: c.signal}); warming.catch(() => {});
    const held = await f.entered;
    assert.deepEqual(await read(current, 8, 15), f.body.subarray(8, 16)); assert(held.closed);
    c.abort(); await Promise.allSettled([warming]); await next.stop(); await f.cache.discardNext(); held.release();
    assert.equal(held.lateBytes, 0); assert.equal(f.cache.status().bytes, 0); assert.equal(f.cache.status().upstream, 0);
    assert.equal(await f.physical(), 0);
});
test('a mid-cleanup removal failure never double-decrements shared occupancy', async t => {
    let armed = false, deletes = 0;
    const fileSystem = {...fs, async rm(file, options) {
        if (armed && file.endsWith('.bytes') && ++deletes === 2) throw Error('synthetic-remove-failure');
        return fs.rm(file, options);
    }};
    const f = await fixture(t, false, fileSystem), next = await f.open('next', 'next');
    await next.prefetch({maxBytes: 17, signal: f.control().signal}); await next.markPlaying(); armed = true;
    await assert.rejects(f.open('later', 'next'), /synthetic-remove-failure/);
    assert.equal(f.cache.status().bytes, 9); assert.equal(await f.physical(), 9);
    const later = await f.open('later', 'next');
    assert.equal(f.cache.status().bytes, 0); await later.prefetch({maxBytes: 17, signal: f.control().signal});
    assert.equal(f.cache.status().bytes, 17); assert.equal(await f.physical(), 17);
});
test('an unremoved partial write remains reserved and disables further writes', async t => {
    let failWrite = true, failRemove = true;
    const fileSystem = {...fs,
        async open(file, ...args) {
            const handle = await fs.open(file, ...args);
            if (!file.endsWith('.pending') || !failWrite) return handle;
            return {async writeFile(data) {failWrite = false; await handle.writeFile(data.subarray(0, 2)); throw Error('synthetic-write-failure');}, close: () => handle.close(), sync: () => handle.sync()};
        },
        async rm(file, options) {
            if (file.endsWith('.pending') && failRemove) {failRemove = false; throw Error('synthetic-pending-remove-failure');}
            return fs.rm(file, options);
        }};
    const f = await fixture(t, false, fileSystem), next = await f.open('next', 'next');
    await assert.rejects(next.prefetch({maxBytes: 17, signal: f.control().signal}));
    assert.equal(await f.physical(), 2); assert.equal(f.cache.status().bytes, 8, 'full attempted block remains conservatively reserved');
    await assert.rejects(next.prefetch({maxBytes: 17, signal: f.control().signal}));
    assert.equal(await f.physical(), 2); assert.equal(f.cache.status().bytes, 8);
    await next.stop(); await f.cache.close(); assert.deepEqual(await fs.readdir(f.root), ['owner']);
});
