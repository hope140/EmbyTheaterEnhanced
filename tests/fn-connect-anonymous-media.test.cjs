'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {once} = require('node:events');
const {createAnonymousMedia} = require('../prototypes/fn-connect/client/anonymous-media.cjs');
const {createController} = require('../prototypes/fn-connect/client/controller.cjs');
const {createBridge} = require('../prototypes/fn-connect/client/bridge.cjs');
const {createFixture, createFixtureIO} = require('../prototypes/fn-connect/client/fixture.cjs');
const fail = expected => error => error.code === expected && error.message === expected;
async function server(t, handler) {
    const seen = [], sockets = new Set();
    const value = http.createServer((req, res) => { seen.push({method: req.method, path: req.url, headers: {...req.headers}}); handler(req, res); });
    value.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
    await new Promise(resolve => value.listen(0, '127.0.0.1', resolve));
    t.after(async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => value.close(resolve)); });
    return {seen, origin: 'http://127.0.0.1:' + value.address().port};
}
const make = options => createAnonymousMedia({enabled: true, mode: 'fixture', environment: {}, resolveProxy: async () => 'DIRECT', ...options});
const headers = {'User-Agent': 'ActualSyntheticMedia/1.0 (a, b)', Range: 'bytes=11-97', Cookie: 'FN-secret',
    Authorization: 'Bearer Emby-secret', 'X-Emby-Token': 'Emby-secret', Referer: 'https://nas.invalid/private', Origin: 'https://nas.invalid'};
async function bytes(response) { const chunks = []; for await (const chunk of response.body) chunks.push(chunk); return Buffer.concat(chunks); }
function noCredentials(seen) {
    for (const item of seen) for (const name of ['cookie', 'authorization', 'x-emby-token', 'x-mediabrowser-token', 'x-emby-authorization', 'referer', 'origin']) assert.equal(item.headers[name], undefined);
}
test('every approved CDN hop uses only actual UA/Range, never browser auth or CDN Set-Cookie, and streams exact partial bytes', async t => {
    const data = Buffer.alloc(87, 42);
    const last = await server(t, (_req, res) => { res.writeHead(206, {'Content-Type': 'video/mp4', 'Content-Range': 'bytes 11-97/1000',
        'Content-Length': data.length, 'Set-Cookie': 'must-not-leave=external-cookie'}); res.end(data); });
    const first = await server(t, (_req, res) => { res.writeHead(307, {location: last.origin + '/signed?sig=public-media-signature', 'Set-Cookie': 'cdn-cookie=not-reused'}); res.end('discard'); });
    const transport = make();
    for (let round = 0; round < 2; round++) {
        const response = await transport.open({url: first.origin + '/start', allowedOrigins: [first.origin, last.origin], headers,
            knownSecrets: ['FN-secret', 'Emby-secret']});
        assert.equal(response.statusCode, 206); assert.equal(response.headers['content-range'], 'bytes 11-97/1000');
        assert.equal(response.headers['set-cookie'], undefined); assert.equal(response.headers.location, undefined);
        assert.deepEqual(await bytes(response), data);
    }
    noCredentials([...first.seen, ...last.seen]);
    for (const item of [...first.seen, ...last.seen]) {
        assert.equal(item.headers['user-agent'], headers['User-Agent']); assert.equal(item.headers.range, headers.Range);
        assert.equal(item.headers['accept-encoding'], 'identity');
    }
    assert.equal(first.seen.length, 2); assert.equal(last.seen.length, 2);
});
test('an unapproved second origin stops before any request to that origin', async t => {
    const denied = await server(t, (_req, res) => res.end('must not load'));
    const first = await server(t, (_req, res) => { res.writeHead(302, {location: denied.origin + '/secret'}); res.end(); });
    await assert.rejects(make().open({url: first.origin + '/start', allowedOrigins: [first.origin], headers}), fail('EXTERNAL_REDIRECT_REVIEW_REQUIRED'));
    assert.equal(first.seen.length, 1); assert.equal(denied.seen.length, 0);
});
test('HEAD stays HEAD across redirects instead of creating a hidden body GET', async t => {
    const last = await server(t, (_req, res) => { res.writeHead(200, {'Content-Length': 1000, 'Content-Type': 'video/mp4'}); res.end(); });
    const first = await server(t, (_req, res) => { res.writeHead(303, {location: last.origin + '/file'}); res.end(); });
    const response = await make().open({url: first.origin + '/start', method: 'HEAD', allowedOrigins: [first.origin, last.origin], headers});
    assert.equal((await bytes(response)).length, 0); assert.equal(response.headers['content-length'], '1000');
    assert.deepEqual([...first.seen, ...last.seen].map(value => value.method), ['HEAD', 'HEAD']);
    noCredentials([...first.seen, ...last.seen]);
});
test('known authentication values in a later Location are rejected before the next approved hop', async t => {
    const denied = await server(t, (_req, res) => res.end('never'));
    const first = await server(t, (_req, res) => { res.writeHead(302, {location: denied.origin + '/file?opaque=' + encodeURIComponent('FN-secret')}); res.end(); });
    await assert.rejects(make().open({url: first.origin + '/start', allowedOrigins: [first.origin, denied.origin],
        headers, knownSecrets: ['FN-secret']}), fail('CREDENTIAL_REDIRECT_BLOCKED'));
    assert.equal(denied.seen.length, 0); noCredentials(first.seen);
});
test('authorization origins cannot also be external media origins', async t => {
    const endpoint = await server(t, (_req, res) => res.end());
    await assert.rejects(make().open({url: endpoint.origin + '/file', allowedOrigins: [endpoint.origin],
        forbiddenOrigins: [endpoint.origin], headers}), fail('ANONYMOUS_MEDIA_SCOPE_INVALID'));
    const controller = createController({enabled: true, io: createFixtureIO()});
    assert.throws(() => controller.add({bootstrapUrl: 'https://nas.example.test/', embyUrl: 'https://emby.example.test/',
        externalMediaOrigins: ['https://nas.example.test']}), fail('INVALID_MEDIA_ORIGIN'));
    assert.equal(endpoint.seen.length, 0);
});
test('redirect loops, redirect budget and conditional requests do not cause retries or URL refreshes', async t => {
    const endpoint = await server(t, (req, res) => { res.writeHead(302, {location: req.url.startsWith('/loop') ? '/loop' : '/hop' + (Number(req.url.slice(4)) + 1)}); res.end(); });
    await assert.rejects(make().open({url: endpoint.origin + '/loop', allowedOrigins: [endpoint.origin], headers}), fail('REDIRECT_LOOP'));
    assert.equal(endpoint.seen.length, 1);
    await assert.rejects(make({maxRedirects: 1}).open({url: endpoint.origin + '/hop0', allowedOrigins: [endpoint.origin], headers}), fail('REDIRECT_REJECTED'));
    assert.equal(endpoint.seen.length, 3);
    await assert.rejects(make().open({url: endpoint.origin + '/file', allowedOrigins: [endpoint.origin],
        headers: {...headers, 'If-Range': 'opaque-etag'}}), fail('ANONYMOUS_MEDIA_IF_RANGE_UNSUPPORTED'));
    assert.equal(endpoint.seen.length, 3);
});
test('disabled, proxy and already-cancelled requests never dispatch external HTTP', async t => {
    const endpoint = await server(t, (_req, res) => res.end());
    const input = {url: endpoint.origin + '/file', allowedOrigins: [endpoint.origin], headers};
    await assert.rejects(createAnonymousMedia().open(input), fail('ANONYMOUS_MEDIA_DISABLED'));
    await assert.rejects(make({resolveProxy: async () => 'PROXY unavailable:8080'}).open(input), fail('ANONYMOUS_MEDIA_PROXY_UNSUPPORTED'));
    const cancel = new AbortController(); cancel.abort();
    await assert.rejects(make().open({...input, signal: cancel.signal}), fail('CANCELLED'));
    await assert.rejects(make({mode: 'live', environment: {HTTPS_PROXY: 'configured'}}).open({url: 'https://media.example.test/file',
        allowedOrigins: ['https://media.example.test'], headers}), fail('ANONYMOUS_MEDIA_PROXY_UNSUPPORTED'));
    assert.equal(endpoint.seen.length, 0);
});
test('the absolute deadline is checked after asynchronous proxy resolution', async t => {
    const endpoint = await server(t, (_req, res) => res.end());
    let time = 0;
    await assert.rejects(make({now: () => time, timeoutMs: 10, resolveProxy: async () => { time = 11; return 'DIRECT'; }}).open({
        url: endpoint.origin + '/file', allowedOrigins: [endpoint.origin], headers}), fail('ANONYMOUS_MEDIA_TIMEOUT'));
    assert.equal(endpoint.seen.length, 0);
});
test('stream cancellation retires the anonymous upstream without exposing raw network errors', async t => {
    let retired;
    const closed = new Promise(resolve => { retired = resolve; });
    const endpoint = await server(t, (_req, res) => {
        res.writeHead(200, {'Content-Type': 'video/mp4'}); res.write(Buffer.alloc(1024));
        res.once('close', retired);
    });
    const cancel = new AbortController();
    const response = await make().open({url: endpoint.origin + '/slow', allowedOrigins: [endpoint.origin], headers, signal: cancel.signal});
    const first = once(response.body, 'data'); response.body.resume(); await first;
    cancel.abort();
    await Promise.race([closed, new Promise((_, reject) => setTimeout(() => reject(new Error('UPSTREAM_NOT_RETIRED')), 1000).unref())]);
    assert.equal(response.body.destroyed, true);
});
test('a truncated response after header handoff terminates the body with a fixed error and drains its socket', async t => {
    let interrupt;
    const endpoint = await server(t, (_req, res) => {
        res.writeHead(200, {'Content-Type': 'video/mp4', 'Content-Length': 1000}); res.write('abc');
        interrupt = () => res.socket.destroy();
    });
    const response = await make().open({url: endpoint.origin + '/truncated', allowedOrigins: [endpoint.origin], headers});
    const rejected = assert.rejects(bytes(response), fail('ANONYMOUS_MEDIA_STREAM_FAILED'));
    interrupt(); await rejected; await response.drain();
});
test('existing authenticated bridge relays external partial bytes and one profile cannot use another profile capability', async t => {
    const fixture = await createFixture(), io = createFixtureIO();
    io.openAnonymousMedia = (_ses, input) => make().open(input);
    const controller = createController({enabled: true, mode: 'fixture', io, relayExternalMedia: true});
    const bridge = await createBridge(controller, {enabled: true});
    t.after(async () => { await bridge.close(); await controller.closeAll(); await fixture.close(); });
    async function profile() {
        const id = controller.add(fixture.profile); await controller.start(id); await io.authorize(id, fixture.profile); await controller.verify(id); return id;
    }
    const first = await profile(), second = await profile();
    const lease = bridge.lease(first, {path: 'direct', headers: {'User-Agent': headers['User-Agent'], Authorization: 'Bearer Emby-secret'}});
    const other = bridge.lease(second, {path: 'direct', headers: {'User-Agent': headers['User-Agent'], 'X-Emby-Token': 'other-account-secret'}});
    const response = await fetch(lease.url, {headers: {Range: 'bytes=11-97'}});
    assert.equal(response.status, 206); assert.equal(response.headers.get('location'), null);
    assert.equal(response.headers.get('set-cookie'), null); assert.deepEqual(Buffer.from(await response.arrayBuffer()), fixture.bytes.subarray(11, 98));
    noCredentials(fixture.state.externalRequests.map(value => ({headers: value})));
    await controller.close(first);
    assert.equal((await fetch(lease.url)).status, 410);
    const next = await fetch(other.url, {headers: {Range: 'bytes=0-7'}});
    assert.equal(next.status, 206); assert.deepEqual(Buffer.from(await next.arrayBuffer()), fixture.bytes.subarray(0, 8));
    noCredentials(fixture.state.externalRequests.map(value => ({headers: value})));
    const head = await fetch(other.url, {method: 'HEAD', headers: {Range: 'bytes=0-7'}});
    assert.equal(head.status, 206); assert.equal(head.headers.get('content-length'), '8'); assert.equal((await head.arrayBuffer()).byteLength, 0);
    const pastEnd = await fetch(other.url, {headers: {Range: 'bytes=9999999-'}});
    assert.equal(pastEnd.status, 416); assert.equal(pastEnd.headers.get('content-range'), 'bytes */' + fixture.bytes.length);
    assert.equal((await pastEnd.arrayBuffer()).byteLength, 0);
});
