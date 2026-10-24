'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {EventEmitter} = require('node:events');
const {createReader} = require('../src/electronapp/enhanced/playback-range-http');
const {createCache} = require('../src/electronapp/enhanced/playback-range-cache');
const {createService} = require('../src/electronapp/native-helper/service');
const {parseContext} = require('../src/electronapp/enhanced/playback-range-session');
const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve};};
const canary = {authorization: 'Bearer fixture-authorization-only', cookie: 'fixture-session=synthetic-cookie', token: 'fixture-token-header', query: 'fixture-url-grant'};
async function fixture(t) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ete-range-matrix-'));
    const body = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+-');
    const rows = [], targetRows = [], peers = new Set(), held = deferred(), heldClosed = deferred();
    const mode = {value: 'direct', header: 'none', changed: false};
    function record(req, list) {list.push({url: req.url, headers: req.headers});}
    function reply(req, res) {
        const match = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || '');
        if (!match) {res.writeHead(400); res.end(); return;}
        const start = +match[1], end = +match[2], n = end - start + 1;
        if (mode.value === 'drag-hold' && start === 4) {res.on('close', heldClosed.resolve); held.resolve(); return;}
        const headers = {'Content-Length': n, 'Content-Range': `bytes ${start}-${end}/${body.length}`, ETag: mode.changed ? '"v2"' : '"v1"'};
        if (mode.value === 'no-etag') delete headers.ETag;
        if (mode.value === 'weak-etag') headers.ETag = 'W/"weak"';
        if (mode.value === 'date-only') {delete headers.ETag; headers['Last-Modified'] = 'Wed, 01 Jan 2020 00:00:00 GMT';}
        if (mode.value === 'set-cookie') headers['Set-Cookie'] = canary.cookie;
        if (mode.value === 'range-200') {res.writeHead(200, {'Content-Length': body.length, ETag: headers.ETag}); res.end(body); return;}
        if (mode.value === 'precondition-412') {res.writeHead(412, {'Content-Length': 0}); res.end(); return;}
        if (mode.value === 'range-416') {res.writeHead(416, {'Content-Range': 'bytes */' + body.length, 'Content-Length': 0}); res.end(); return;}
        res.writeHead(206, headers);
        if (mode.value === 'short') res.end(body.subarray(start, Math.max(start, end)));
        else res.end(body.subarray(start, end + 1));
    }
    const target = http.createServer((req, res) => {record(req, targetRows); reply(req, res);});
    const source = http.createServer((req, res) => {
        record(req, rows);
        const url = new URL(req.url, 'http://fixture.invalid');
        if (mode.header !== 'none' && (mode.header.includes('authorization') && req.headers.authorization !== canary.authorization || mode.header.includes('cookie') && req.headers.cookie !== canary.cookie || mode.header.includes('token') && req.headers['x-emby-token'] !== canary.token)) {res.writeHead(401); res.end(); return;}
        if (url.searchParams.get('api_key') !== canary.query) {res.writeHead(403); res.end(); return;}
        if (url.pathname === '/media' && mode.value.startsWith('redirect-')) {
            const location = mode.value === 'redirect-same' ? '/bytes?grant=synthetic-signed' : targetOrigin + '/bytes?grant=synthetic-signed';
            res.writeHead(302, {Location: location, 'Set-Cookie': canary.cookie}); res.end(); return;
        }
        reply(req, res);
    });
    for (const server of [source, target]) {
        server.on('connection', socket => {peers.add(socket); socket.on('close', () => peers.delete(socket));});
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    }
    const origin = 'http://127.0.0.1:' + source.address().port, targetOrigin = 'http://127.0.0.1:' + target.address().port;
    const config = {root: path.join(root, 'cache'), maxBytes: 128, blockBytes: 4, minFreeBytes: 0, timeoutMs: 500, bytesPerSecond: 1000000};
    const url = origin + '/media?Static=true&api_key=' + canary.query;
    const context = {source: url, serverOrigin: origin, serverId: 'fixture-server', accountId: 'fixture-user', itemId: 'fixture-video',
        mediaSourceId: 'fixture-source', playSessionId: 'fixture-play', mediaType: 'Video', container: 'mp4', mode: 'DirectStream', live: false};
    const cleanups = [];
    t.after(async () => {
        try {for (const close of cleanups.reverse()) await close();}
        finally {
            for (const server of [source, target]) server.closeAllConnections();
            await Promise.all([source, target].map(server => new Promise(resolve => server.close(resolve))));
            await fs.rm(root, {recursive: true, force: true});
        }
        assert.equal(peers.size, 0, 'both explicitly owned fixture servers released their sockets');
    });
    return {root, config, context, mode, origin, targetOrigin, url, body, rows, targetRows, held, heldClosed,
        reader() {const reader = createReader(config); cleanups.push(() => reader.close()); return reader;},
        async cache() {const cache = await createCache(config); cleanups.push(() => cache.close()); return cache;},
        addCleanup: close => cleanups.push(close)};
}
class FakeWindow extends EventEmitter {
    constructor() {super(); this.webContents = {isDestroyed: () => false, send() {}};}
    getBounds() {return {x: 0, y: 0, width: 320, height: 180};} setBounds() {} getNativeWindowHandle() {return Buffer.from([1, 0, 0, 0]);}
    isDestroyed() {return false;} isVisible() {return false;} isMinimized() {return false;} setMenu() {} loadURL() {} hide() {} showInactive() {} destroy() {this.emit('closed');}
}
async function serviceFixture(t, f) {
    let helper;
    class Client {
        constructor(options) {helper = this; this.options = options; this.handshake = {helperVersion: 'mock', libmpvVersion: 'mock'}; this.currentGenerationId = null; this.state = {playing: false}; this.args = [];}
        async start() {return this;} beginGeneration() {return this.currentGenerationId = 1;} retireGeneration() {this.currentGenerationId = null;}
        command() {} setProperty() {} submitCommand() {} async getProperty() {return 0;} allocateGenerationId() {return 2;}
        load(args) {this.args.push(args); return {generationId: this.currentGenerationId, promise: Promise.resolve({})};}
        async stop() {this.currentGenerationId = null;} async kill() {this.exited = true;}
    }
    const main = new FakeWindow(), service = createService({electron: {BrowserWindow: FakeWindow}, NativeHelperClient: Client,
        fs: {existsSync: () => true}, getMainWindow: () => main, getWebContents: () => main.webContents, runtimeRoot: f.root, rangeCache: f.config});
    f.addCleanup(() => service.destroy());
    const metadata = await service.call('create'), endpoint = metadata.endpointId;
    const {generationId} = await service.call('begin-generation', {requestEpoch: 1}, endpoint);
    await service.call('range-context', {generationId, context: f.context}, endpoint);
    await service.call('command', {generationId, data: ['loadfile', f.url]}, endpoint);
    return {service, helper, endpoint, generationId};
}

for (const mode of ['direct', 'redirect-same', 'redirect-cross', 'no-etag', 'weak-etag', 'date-only', 'range-200', 'range-416', 'short']) {
    test('actual source-dispatch matrix: ' + mode, {timeout: 5000}, async t => {
        const f = await fixture(t); f.mode.value = mode;
        const {helper} = await serviceFixture(t, f);
        assert.equal(helper.args.length, 1);
        if (mode === 'direct') {
            assert.notEqual(helper.args[0][1], f.url);
            const response = await fetch(helper.args[0][1], {headers: {Range: 'bytes=4-11'}});
            assert.equal(response.status, 206); assert.deepEqual(Buffer.from(await response.arrayBuffer()), f.body.subarray(4, 12));
        } else assert.equal(helper.args[0][1], f.url, 'maintained service dispatches the original source on ineligibility');
        assert.equal(f.targetRows.length, 0, 'no cross-origin request or credential forwarding');
        if (mode.startsWith('redirect-')) assert.equal(f.rows.length, 1, 'not even the same-origin Location is followed');
        assert(f.rows.every(row => row.headers.authorization === undefined && row.headers.cookie === undefined && row.headers['x-emby-token'] === undefined));
    });
}
for (const header of ['authorization', 'cookie', 'token', 'authorization cookie token']) {
    test('header-dependent origin is not silently authenticated: ' + header, async t => {
        const f = await fixture(t); f.mode.header = header;
        const {helper} = await serviceFixture(t, f); assert.equal(helper.args[0][1], f.url);
        assert.equal(f.rows.length, 1); assert.equal(f.targetRows.length, 0);
        assert.equal(f.rows[0].headers.authorization, undefined); assert.equal(f.rows[0].headers.cookie, undefined); assert.equal(f.rows[0].headers['x-emby-token'], undefined);
    });
}
test('ad-hoc sensitive reader options and response Set-Cookie never become a header provider or cookie jar', async t => {
    const f = await fixture(t); f.mode.value = 'set-cookie'; const reader = f.reader();
    const options = {source: f.url, origin: f.origin, start: 0, length: 1, headers: {Authorization: canary.authorization, Cookie: canary.cookie, 'X-Emby-Token': canary.token}};
    const probe = await reader.read(options); await reader.read({...options, start: 4, length: 4, expected: probe});
    assert.equal(f.rows.length, 2); assert.equal(reader.status().requests, 0);
    for (const row of f.rows) for (const key of ['authorization', 'cookie', 'x-emby-token']) assert.equal(row.headers[key], undefined);
});
for (const change of ['etag', 'precondition-412', 'range-416', 'range-200', 'short']) test('after a successful probe, an incompatible miss commits no new block: ' + change, {timeout: 5000}, async t => {
    const f = await fixture(t), cache = await f.cache(), handle = await cache.open({source: f.url, identity: parseContext(f.context).identity, isCurrent: () => true});
    f.addCleanup(() => handle.stop());
    const before = await fetch(handle.source, {headers: {Range: 'bytes=0-3'}}); await before.arrayBuffer(); assert.equal(cache.status().bytes, 4);
    if (change === 'etag') f.mode.changed = true; else f.mode.value = change;
    const response = await fetch(handle.source, {headers: {Range: 'bytes=8-11'}}); assert.equal(response.status, 502); await response.arrayBuffer();
    assert.equal(cache.status().bytes, 4); assert.equal(cache.status().upstream, 0); assert.equal(f.targetRows.length, 0);
});
test('dragging cancels only the held old Range; the new seek reads correct bytes and waits for physical origin close', {timeout: 5000}, async t => {
    const f = await fixture(t), cache = await f.cache(), handle = await cache.open({source: f.url, identity: parseContext(f.context).identity, isCurrent: () => true});
    f.addCleanup(() => handle.stop()); f.mode.value = 'drag-hold';
    const controller = new AbortController(), old = fetch(handle.source, {headers: {Range: 'bytes=4-7'}, signal: controller.signal}); old.catch(() => {});
    await f.held.promise; controller.abort(); await assert.rejects(old, {name: 'AbortError'}); await f.heldClosed.promise;
    const next = await fetch(handle.source, {headers: {Range: 'bytes=16-19'}}); assert.equal(next.status, 206); assert.deepEqual(Buffer.from(await next.arrayBuffer()), f.body.subarray(16, 20));
    assert.equal(cache.status().bytes, 4, 'the cancelled old block was not committed'); assert.equal(cache.status().upstream, 0);
});

for (const redirect of ['redirect-same', 'redirect-cross']) for (const header of ['authorization', 'cookie', 'token', 'authorization cookie token']) {
    test('authenticated redirect fixture is declined without inventing a provider: ' + redirect + ' / ' + header, async t => {
        const f = await fixture(t); f.mode.value = redirect; f.mode.header = header;
        const control = await new Promise((resolve, reject) => {
            const request = http.get(f.url, {headers: {Authorization: canary.authorization, Cookie: canary.cookie, 'X-Emby-Token': canary.token}, agent: false}, response => {
                const result = {status: response.statusCode, location: response.headers.location}; response.resume(); response.on('end', () => resolve(result));
            }); request.on('error', reject);
        });
        assert.equal(control.status, 302); assert(control.location);
        const {helper} = await serviceFixture(t, f); assert.equal(helper.args[0][1], f.url);
        assert.equal(f.rows.length, 2); assert.equal(f.rows[1].headers.authorization, undefined); assert.equal(f.rows[1].headers.cookie, undefined); assert.equal(f.rows[1].headers['x-emby-token'], undefined);
        assert.equal(f.targetRows.length, 0);
    });
}
test('an already cross-origin final URL is left to the original source without a cache-origin probe', async t => {
    const f = await fixture(t); f.url = f.targetOrigin + '/bytes?Static=true&grant=synthetic-signed'; f.context.source = f.url;
    const {helper} = await serviceFixture(t, f); assert.equal(helper.args[0][1], f.url); assert.equal(f.rows.length, 0); assert.equal(f.targetRows.length, 0);
});
