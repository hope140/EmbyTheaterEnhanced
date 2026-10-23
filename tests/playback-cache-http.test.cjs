'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createFixtureClient} = require('../tools/prototypes/playback-cache/fixture-http.cjs');
const {createStore} = require('../tools/prototypes/playback-cache/store.cjs');

const body = Buffer.from('abcdefgh');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };
function reply(res, change = {}, bytes = body.subarray(0, 4)) {
    res.writeHead(206, {'Content-Range': 'bytes 0-3/8', 'Content-Length': bytes.length, ETag: '"version-one"', ...change});
    res.end(bytes);
}
async function fixture(t, handler, options = {}) {
    const requests = [], sockets = new Set();
    let current = {};
    const server = http.createServer((req, res) => { requests.push({url: req.url, headers: req.headers}); handler(req, res); });
    server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const client = createFixtureClient({enabled: true, origin, maxObjectBytes: 64, timeoutMs: 1000,
        isCurrent: scope => scope === current, ...options});
    t.after(async () => {
        await client.close();
        const socketExits = [...sockets].map(socket => new Promise(resolve => socket.once('close', resolve)));
        const closing = new Promise(resolve => server.close(resolve)); server.closeAllConnections(); await closing;
        await Promise.all(socketExits);
        assert.equal(client.status().activeRequests, 0); assert.equal(sockets.size, 0);
    });
    return {client, origin, requests, sockets, get scope() { return current; }, rotate() { current = {}; },
        plan(change = {}) { return {url: origin + '/fixture?signature=one', offset: 0, length: 4, total: 8,
            strongETag: '"version-one"', scope: current, authorization: 'Bearer synthetic-fixture-only',
            signal: new AbortController().signal, ...change}; }};
}
const rejects = (promise, code) => assert.rejects(promise, error => error.code === code && error.message === code);

test('fixture client is disabled by default and refuses non-loopback origins and URLs', async t => {
    assert.deepEqual(createFixtureClient(), {enabled: false});
    for (const origin of ['http://0.0.0.0:1234', 'http://localhost:1234', 'https://127.0.0.1:1234', 'http://127.0.0.1:1234/path']) {
        assert.throws(() => createFixtureClient({enabled: true, origin}), {code: 'fixture-origin-invalid'});
    }
    const f = await fixture(t, (_req, res) => reply(res));
    await rejects(f.client.readRange(f.plan({url: 'http://192.0.2.1/never-requested'})), 'fixture-url-invalid');
    assert.equal(f.requests.length, 0);
});

test('actual 206 bytes, exact ranges and stable strong validators populate an authorized complete store', async t => {
    const f = await fixture(t, (req, res) => {
        const start = req.headers.range === 'bytes=4-7' ? 4 : 0;
        reply(res, {'Content-Range': `bytes ${start}-${start + 3}/8`}, body.subarray(start, start + 4));
    });
    const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-http-cache-')));
    const store = createStore({enabled: true, parent, policy: {maxBytes: 16, maxEntries: 2, ttlMs: 10000, minFreeBytes: 0}});
    t.after(() => { store.close(); fs.rmSync(parent, {recursive: true, force: true}); });
    const first = await f.client.readRange(f.plan({strongETag: null, total: null}));
    const identity = {serverId: 'fixture-server', accountId: 'fixture-user', itemId: 'episode', mediaSourceId: 'source', versionId: 'v1', representationId: 'identity'};
    const proof = {authorized: true, mode: 'direct-file', rangeSupported: true, contentLength: first.total,
        strongETag: first.strongETag, validUntil: Date.now() + 5000};
    const writer = store.begin(identity, proof);
    try {
        writer.append(0, first.bytes);
        // A renewed URL is not the identity; same object proof and account permit reuse.
        const second = await f.client.readRange(f.plan({offset: 4, url: f.origin + '/fixture?signature=renewed'}));
        writer.append(4, second.bytes);
    } finally { writer.release(); }
    const reader = store.acquireComplete(identity, proof);
    assert.equal(reader.read(0, 8).toString(), body.toString()); reader.release();
    assert.equal(store.acquireComplete({...identity, accountId: 'other-user'}, proof), null);
    assert.equal(f.requests[0].headers['if-range'], undefined);
    assert.equal(f.requests[1].headers['if-range'], '"version-one"');
    assert.equal(f.requests[1].headers['accept-encoding'], 'identity');
    for (const name of fs.readdirSync(path.join(parent, 'playback-cache-prototype-v1')).filter(name => name.endsWith('.json'))) {
        assert.equal(/signature|Bearer|synthetic|fixture-user/.test(fs.readFileSync(path.join(parent, 'playback-cache-prototype-v1', name), 'utf8')), false);
    }
});

test('a changed ETag or object length is never appended to an old representation', async t => {
    const f = await fixture(t, (req, res) => reply(res, req.url === '/etag' ? {ETag: '"version-two"'} : {'Content-Range': 'bytes 0-3/9'}));
    await rejects(f.client.readRange(f.plan({url: f.origin + '/etag'})), 'fixture-validator-changed');
    await rejects(f.client.readRange(f.plan({url: f.origin + '/length'})), 'fixture-range-mismatch');
});

test('weak ETag and Last-Modified-only responses are deliberately ineligible for this subset', async t => {
    const f = await fixture(t, (req, res) => {
        const headers = {'Content-Range': 'bytes 0-3/8', 'Content-Length': 4};
        if (req.url === '/weak') headers.ETag = 'W/"version-one"';
        else headers['Last-Modified'] = 'Wed, 21 Oct 2015 07:28:00 GMT';
        res.writeHead(206, headers); res.end(body.subarray(0, 4));
    });
    for (const url of ['/weak', '/date']) await rejects(f.client.readRange(f.plan({url: f.origin + url})), 'fixture-strong-validator-required');
});

test('ignored Range/If-Range (200) and unsatisfiable Range (416) cannot become prefix data', async t => {
    const f = await fixture(t, (req, res) => { res.writeHead(req.url === '/ignored' ? 200 : 416); res.end(body); });
    await rejects(f.client.readRange(f.plan({url: f.origin + '/ignored', offset: 4})), 'fixture-range-unconfirmed');
    await rejects(f.client.readRange(f.plan({url: f.origin + '/invalid'})), 'fixture-range-unsatisfiable');
});

test('wrong Content-Range, encoded representation and mismatched declared length fail before data is exposed', async t => {
    const changes = {'/offset': {'Content-Range': 'bytes 1-4/8'}, '/encoding': {'Content-Encoding': 'gzip'},
        '/length': {'Content-Length': 3}};
    const f = await fixture(t, (req, res) => reply(res, changes[req.url]));
    for (const suffix of Object.keys(changes)) await rejects(f.client.readRange(f.plan({url: f.origin + suffix})), 'fixture-range-mismatch');
});

test('401/403 stop without retries; retired authorization contexts cannot start another request', async t => {
    const f = await fixture(t, (req, res) => { res.writeHead(Number(req.url.slice(1))); res.end(); });
    for (const status of [401, 403]) await rejects(f.client.readRange(f.plan({url: f.origin + '/' + status})), 'fixture-authorization-rejected');
    assert.equal(f.requests.length, 2);
    const old = f.plan(); f.rotate();
    await rejects(f.client.readRange(old), 'fixture-context-retired'); assert.equal(f.requests.length, 2);
});

test('redirects are rejected without following or forwarding the synthetic authorization', async t => {
    const f = await fixture(t, (_req, res) => { res.writeHead(302, {Location: '/must-not-follow'}); res.end(); });
    await rejects(f.client.readRange(f.plan()), 'fixture-redirect-rejected'); assert.equal(f.requests.length, 1);
});

test('an interrupted response cannot commit a partial chunk, and the prior checkpoint resumes safely', async t => {
    let interrupt = true;
    const f = await fixture(t, (_req, res) => {
        res.writeHead(206, {'Content-Range': 'bytes 4-7/8', 'Content-Length': 4, ETag: '"version-one"'});
        if (interrupt) { res.write('ef'); setImmediate(() => res.destroy()); } else res.end('efgh');
    });
    const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-http-interrupt-')));
    const store = createStore({enabled: true, parent, policy: {maxBytes: 8, maxEntries: 1, ttlMs: 10000, minFreeBytes: 0}});
    t.after(() => { store.close(); fs.rmSync(parent, {recursive: true, force: true}); });
    const identity = {serverId: 'server', accountId: 'user', itemId: 'episode', mediaSourceId: 'source', versionId: 'version', representationId: 'identity'};
    const proof = {authorized: true, mode: 'direct-file', rangeSupported: true, contentLength: 8, strongETag: '"version-one"', validUntil: Date.now() + 5000};
    const writer = store.begin(identity, proof);
    try {
        writer.append(0, body.subarray(0, 4));
        await rejects(f.client.readRange(f.plan({offset: 4})).then(result => writer.append(4, result.bytes)), 'fixture-body-interrupted');
        assert.equal(store.inspect(identity, proof).committed, 4);
        interrupt = false;
        const result = await f.client.readRange(f.plan({offset: 4})); writer.append(4, result.bytes);
        assert.equal(store.inspect(identity, proof).complete, true);
    } finally { writer.release(); }
});

test('authentication generation changing during a response rejects it even with identical ETag', async t => {
    const entered = deferred(), release = deferred();
    const f = await fixture(t, (_req, res) => {
        res.writeHead(206, {'Content-Range': 'bytes 0-3/8', 'Content-Length': 4, ETag: '"version-one"'});
        res.write('ab'); entered.resolve(); release.promise.then(() => res.end('cd'));
    });
    const reading = f.client.readRange(f.plan()); await entered.promise; f.rotate(); release.resolve();
    await rejects(reading, 'fixture-context-retired'); assert.equal(f.client.status().activeRequests, 0);
});

test('abort and close retire only fixture-owned sockets and leave zero active requests', async t => {
    const entered = deferred();
    const f = await fixture(t, (_req, res) => { res.writeHead(206); res.flushHeaders(); entered.resolve(); });
    const controller = new AbortController();
    const reading = f.client.readRange(f.plan({signal: controller.signal})); await entered.promise; controller.abort();
    await rejects(reading, 'fixture-cancelled');
    const second = f.client.readRange(f.plan()); await f.client.close();
    await rejects(second, 'fixture-cancelled'); assert.equal(f.client.status().activeRequests, 0);
});

test('an unresponsive fixture has an overall deadline and releases its request resources', async t => {
    const f = await fixture(t, () => {}, {timeoutMs: 50});
    await rejects(f.client.readRange(f.plan()), 'fixture-timeout'); assert.equal(f.client.status().activeRequests, 0);
});
