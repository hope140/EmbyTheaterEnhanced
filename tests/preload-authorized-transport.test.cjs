'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const {EventEmitter} = require('node:events');
const {temporaryRoot} = require('./helpers/range-fixture-root.cjs');
const {createAuthority, isTransport} = require('../src/electronapp/enhanced/preload-source-authority');
const {createCache} = require('../src/electronapp/enhanced/playback-range-cache');
const {createReader} = require('../src/electronapp/enhanced/playback-range-http');
const deferred = () => {let resolve; const promise = new Promise(done => {resolve = done;}); return {promise, resolve};};
async function fixture(t, settings = {}) {
    const root = temporaryRoot('ete-authorized-transport-', ['']), body = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyzABCD');
    const rows = [], embyRows = [], handles = [], sockets = new Set(), mode = {value: 'direct', etag: '"representation"'};
    const held = deferred(), heldClosed = deferred(); let heldResponse;
    function connect(server) {server.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});}
    const emby = http.createServer((req, res) => {embyRows.push({url: req.url, headers: req.headers}); res.writeHead(500).end();});
    const target = http.createServer((req, res) => {
        const row = {url: req.url, headers: req.headers, closed: false, lateBytes: 0}; rows.push(row); res.once('close', () => {row.closed = true;});
        if (mode.value === 'redirect') {res.writeHead(302, {Location: embyOrigin + '/must-not-follow'}).end(); return;}
        if (mode.value === 'auth') {res.writeHead(401).end(); return;}
        if (settings.userAgent && req.headers['user-agent'] !== settings.userAgent) {res.writeHead(403).end(); return;}
        const match = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || '');
        if (!match) {res.writeHead(400).end(); return;}
        const start = Number(match[1]), end = Number(match[2]);
        if (end >= body.length) {res.writeHead(416).end(); return;}
        const headers = {'Content-Range': `bytes ${start}-${end}/${body.length}`, 'Content-Length': end - start + 1};
        if (mode.value !== 'no-etag' && !mode.value.startsWith('date')) headers.ETag = mode.etag;
        if (mode.value.startsWith('date')) headers['Last-Modified'] = mode.lastModified || 'Tue, 15 Nov 1994 12:45:26 GMT';
        res.writeHead(206, headers);
        if (mode.value === 'hold' && end > start) {
            heldResponse = res; res.write(body.subarray(start, start + 1));
            row.release = () => {if (!res.destroyed) {row.lateBytes += end - start; res.end(body.subarray(start + 1, end + 1));}};
            res.once('close', () => heldClosed.resolve(row)); held.resolve(row); return;
        }
        res.end(body.subarray(start, end + 1));
    });
    connect(emby); connect(target);
    await Promise.all([emby, target].map(server => new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);} )));
    const embyOrigin = 'http://127.0.0.1:' + emby.address().port, origin = 'http://127.0.0.1:' + target.address().port;
    let clock = 100000;
    const authority = createAuthority({now: () => clock}), wc = new EventEmitter(); wc.isDestroyed = () => false;
    const principal = authority.principalFor(wc), controller = new AbortController();
    const identity = {serverOrigin: embyOrigin, serverId: 'emby-server', accountId: 'account', itemId: 'episode', mediaSourceId: 'media', representation: 'emby-stream-identity'};
    const cache = await createCache({kind: 'next-prefix', root, preloadMB: 100, timeoutMs: 1000, blockBytes: 8});
    t.after(async () => {
        controller.abort(); authority.close(); await Promise.allSettled(handles.map(handle => handle.stop())); await cache.close();
        if (heldResponse) heldResponse.destroy();
        await Promise.all([emby, target].map(server => new Promise(resolve => {server.close(resolve); server.closeAllConnections();})));
        for (const socket of sockets) socket.destroy();
        await fs.rm(root, {recursive: true, force: true});
    });
    function transport(options = {}) {
        const source = options.source || origin + '/media?signature=initial', requestId = options.requestId || 'play-A';
        const issue = {principal, requestId, source, sourceKind: settings.userAgent ? 'direct-url' : 'cd2-url', resourceKey: 'synthetic:episode',
            ...(settings.userAgent ? {requestOptions: {userAgent: settings.userAgent}} : {}), ...options};
        const sourceProof = authority.issue(issue);
        const value = authority.bind({sourceProof, principal, source, requestId, signal: controller.signal});
        assert.equal(isTransport(value), true); return value;
    }
    async function open(value, options = {}) {
        const handle = await cache.open({source: origin + '/media?signature=initial', identity, isCurrent: () => true, transport: value, ...options});
        handles.push(handle); return handle;
    }
    return {root, cache, authority, wc, principal, controller, identity, origin, embyOrigin, body, rows, embyRows, mode, held, heldClosed, transport, open,
        now: () => clock, advance: delta => {clock += delta;}};
}
async function range(handle, start, end, headers = {}) {
    const response = await fetch(handle.source, {headers: {Range: `bytes=${start}-${end}`, ...headers}});
    return {status: response.status, bytes: Buffer.from(await response.arrayBuffer())};
}
function anonymous(rows) {
    for (const row of rows) for (const header of ['authorization', 'cookie', 'x-emby-token']) assert.equal(row.headers[header], undefined);
}

test('real private transport permits an external origin with validated UA while retaining anonymous strict range proof and prefix hits', async t => {
    const f = await fixture(t, {userAgent: 'TrustedPlayer/1.0'}), transport = f.transport(), next = await f.open(transport, {role: 'next'});
    await next.prefetch({maxBytes: 16, signal: new AbortController().signal});
    assert.equal(f.cache.status().bytes, 16); const before = f.rows.length;
    const hit = await range(next, 0, 15, {Authorization: 'PRIVATE_CANARY', Cookie: 'PRIVATE_CANARY', 'X-Emby-Token': 'PRIVATE_CANARY', 'User-Agent': 'UntrustedProxyAgent'});
    assert.equal(hit.status, 206); assert.deepEqual(hit.bytes, f.body.subarray(0, 16)); assert.equal(f.rows.length, before);
    const miss = await range(next, 24, 31); assert.equal(miss.status, 206); assert.deepEqual(miss.bytes, f.body.subarray(24, 32));
    assert.equal(f.cache.status().bytes, 16); assert.equal(f.embyRows.length, 0);
    assert.ok(f.rows.every(row => row.headers['user-agent'] === 'TrustedPlayer/1.0'));
    assert.ok(f.rows.slice(1).every(row => row.headers['if-match'] === '"representation"')); anonymous(f.rows);
});

test('unbranded external source and forged transport are rejected before any origin request', async t => {
    const f = await fixture(t);
    await assert.rejects(f.cache.open({source: f.origin + '/media', identity: f.identity, isCurrent: () => true}), error => error.preloadReason === 'source-cross-origin');
    for (const transport of [null, {}, {representation: 'pretend', signal: new AbortController().signal, access: async () => ({source: f.origin + '/media', origin: f.origin})}]) {
        await assert.rejects(f.open(transport), error => error.preloadReason === 'source-proof-invalid');
    }
    assert.equal(f.rows.length, 0); assert.equal(f.embyRows.length, 0);
});

test('direct cache userAgent and arbitrary proxy headers never become an upstream header provider', async t => {
    const f = await fixture(t), transport = f.transport(), handle = await f.open(transport, {userAgent: 'UntrustedCacheAgent', headers: {Authorization: 'PRIVATE_CANARY'}});
    const result = await range(handle, 8, 15, {Authorization: 'PRIVATE_CANARY', Cookie: 'PRIVATE_CANARY', 'X-Emby-Token': 'PRIVATE_CANARY', 'User-Agent': 'UntrustedProxyAgent'});
    assert.equal(result.status, 206); anonymous(f.rows); assert.ok(f.rows.every(row => row.headers['user-agent'] === undefined));
});

test('prefix reuse follows the authorized resource representation and a fresh probe, while another resource cannot reuse its bytes', async t => {
    const f = await fixture(t), first = await f.open(f.transport(), {role: 'next'});
    await first.prefetch({maxBytes: 16, signal: new AbortController().signal}); await first.stop();
    const before = f.rows.length;
    const refreshed = await f.open(f.transport({source: f.origin + '/media?signature=another'}));
    const hit = await range(refreshed, 0, 15); assert.equal(hit.status, 206); assert.deepEqual(hit.bytes, f.body.subarray(0, 16));
    assert.equal(f.rows.length, before + 1, 'fresh authorization probe precedes an existing prefix hit');
    await refreshed.stop();
    const count = f.rows.length, unrelated = await f.open(f.transport({resourceKey: 'synthetic:another-resource'}));
    assert.equal((await range(unrelated, 0, 7)).status, 206);
    assert.equal(f.rows.length, count + 2, 'same Emby identity cannot override a different private resource representation');
});

for (const [mode, reason] of [['redirect', 'redirect'], ['auth', 'auth-required'], ['no-etag', 'file-size-unavailable']]) test('authorized source still declines redirect/auth/missing strong ETag: ' + mode, async t => {
    const f = await fixture(t); f.mode.value = mode;
    await assert.rejects(f.open(f.transport()), error => error.preloadReason === reason);
    assert.equal(f.rows.length, 1); assert.equal(f.embyRows.length, 0); assert.equal(f.cache.status().bytes, 0); assert.equal(f.cache.status().upstream, 0); anonymous(f.rows);
});

test('a refreshed signed source is reacquired before each origin miss while strong ETag and size stay authoritative', async t => {
    const f = await fixture(t); let refreshes = 0;
    const transport = f.transport({acquiredAt: f.now(), expiresAt: f.now() + 10000, refresh: async () => {
        refreshes++; return {source: f.origin + '/media?signature=refreshed', sourceKind: 'cd2-url', resourceKey: 'synthetic:episode', acquiredAt: f.now(), expiresAt: f.now() + 10000};
    }});
    const handle = await f.open(transport); f.advance(10001);
    const result = await range(handle, 8, 15); assert.equal(result.status, 206); assert.equal(refreshes, 1);
    assert.equal(f.rows.length, 2); assert.match(f.rows[1].url, /signature=refreshed/); assert.equal(f.rows[1].headers['if-match'], '"representation"'); anonymous(f.rows);
    f.mode.etag = '"changed"';
    const changed = await range(handle, 16, 23); assert.equal(changed.status, 502); assert.equal(f.cache.status().bytes, 0);
});

test('expired source without refresh stops a missing-block read before any additional origin request', async t => {
    const f = await fixture(t), handle = await f.open(f.transport({acquiredAt: f.now(), expiresAt: f.now() + 10000}));
    f.advance(10001); assert.equal((await range(handle, 8, 15)).status, 502); assert.equal(f.rows.length, 1);
});

test('document revocation retires a route including already cached prefix bytes', async t => {
    const f = await fixture(t), transport = f.transport(), handle = await f.open(transport, {role: 'next'});
    await handle.prefetch({maxBytes: 16, signal: new AbortController().signal});
    const count = f.rows.length; f.wc.emit('render-process-gone');
    assert.equal(transport.signal.aborted, true);
    const result = await range(handle, 0, 7); assert.ok(result.status === 403 || result.status === 410);
    assert.equal(f.rows.length, count); assert.equal(f.cache.status().upstream, 0);
});

test('transport revocation cancels held physical origin reads and prevents late prefix writes', {timeout: 5000}, async t => {
    const f = await fixture(t), handle = await f.open(f.transport(), {role: 'next'}); f.mode.value = 'hold';
    const pending = handle.prefetch({maxBytes: 16, signal: new AbortController().signal}); pending.catch(() => {});
    const held = await f.held.promise; f.wc.emit('render-process-gone');
    await assert.rejects(pending, {name: 'AbortError'}); await f.heldClosed.promise; held.release();
    assert.equal(held.lateBytes, 0); assert.equal(f.cache.status().bytes, 0); assert.equal(f.cache.status().upstream, 0);
});

for (const userAgent of ['', 'line\nPRIVATE_CANARY', 'tab\tvalue', 'comma,value', 'back\\slash', '非ASCII', 'x'.repeat(1025), 42]) test('reader rejects an invalid explicit UA without opening HTTP: ' + JSON.stringify(userAgent).slice(0, 60), async t => {
    const f = await fixture(t), reader = createReader({timeoutMs: 1000}); t.after(() => reader.close());
    await assert.rejects(reader.read({source: f.origin + '/media', origin: f.origin, start: 0, length: 1, userAgent}), error => {
        assert.equal(error.preloadReason, 'source-options-changed'); assert.doesNotMatch(error.message, /PRIVATE_CANARY/); return true;
    });
    assert.equal(f.rows.length, 0);
});


test('authorized no-ETag date prefix is conditional, reused only after fresh proof, and never emits a synthetic ETag', async t => {
    const f = await fixture(t); f.mode.value = 'date';
    const next = await f.open(f.transport({expectedSize: f.body.length}), {role: 'next'});
    await next.prefetch({maxBytes: 16, signal: new AbortController().signal});
    assert.equal(f.cache.status().bytes, 16);
    const conditional = f.rows.slice(1);
    assert(conditional.length > 0);
    for (const row of conditional) {
        assert.equal(row.headers['if-match'], undefined);
        assert.equal(row.headers['if-range'], 'Tue, 15 Nov 1994 12:45:26 GMT');
        assert.equal(row.headers['if-unmodified-since'], row.headers['if-range']);
    }
    const before = f.rows.length, response = await fetch(next.source, {headers: {Range: 'bytes=0-15'}});
    assert.equal(response.headers.get('etag'), null);
    assert.equal(response.headers.get('last-modified'), 'Tue, 15 Nov 1994 12:45:26 GMT');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), f.body.subarray(0, 16));
    assert.equal(f.rows.length, before);
    assert.equal((await range(next, 24, 31)).status, 206);
    assert.equal(f.cache.status().bytes, 16);
    await next.stop();
    const count = f.rows.length;
    const actual = await f.open(f.transport({source: f.origin + '/media?signature=fresh', expectedSize: f.body.length}));
    assert.equal((await range(actual, 0, 15)).status, 206);
    assert.equal(f.rows.length, count + 1, 'fresh real date proof, no prefix refetch');
    anonymous(f.rows);
});

test('changed Last-Modified rejects an existing date prefix before another block commits', async t => {
    const f = await fixture(t); f.mode.value = 'date';
    const handle = await f.open(f.transport({expectedSize: f.body.length}), {role: 'next'});
    await handle.prefetch({maxBytes: 8, signal: new AbortController().signal});
    const before = f.cache.status().bytes; f.mode.lastModified = 'Wed, 16 Nov 1994 12:45:26 GMT';
    await assert.rejects(handle.prefetch({maxBytes: 16, signal: new AbortController().signal}), error => error.preloadReason === 'validator-changed');
    assert.equal(f.cache.status().bytes, before);
});

test('no ETag with no Last-Modified remains fail-closed even with an authorized matching file size', async t => {
    const f = await fixture(t); f.mode.value = 'no-etag';
    await assert.rejects(f.open(f.transport({expectedSize: f.body.length})), error => error.preloadReason === 'last-modified-missing');
    assert.equal(f.cache.status().bytes, 0);
});

for (const renewedSize of [undefined, 41]) test('known file size cannot disappear or change during signed URL refresh: ' + renewedSize, async t => {
    const f = await fixture(t); f.mode.value = 'date'; let refreshes = 0;
    const transport = f.transport({expectedSize: f.body.length, acquiredAt: f.now(), expiresAt: f.now() + 10000, refresh: async () => {
        refreshes++; return {source: f.origin + '/media?signature=renewed', sourceKind: 'cd2-url', resourceKey: 'synthetic:episode',
            acquiredAt: f.now(), expiresAt: f.now() + 10000, ...(renewedSize === undefined ? {} : {expectedSize: renewedSize})};
    }});
    const handle = await f.open(transport); const count = f.rows.length; f.advance(10001);
    assert.equal((await range(handle, 8, 15)).status, 502); assert.equal(refreshes, 1);
    assert.equal(f.rows.length, count, 'changed metadata rejects renewal before HTTP');
    assert.equal(f.cache.status().bytes, 0);
});
