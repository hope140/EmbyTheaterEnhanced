'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {createExternalHeaderProbe} = require('../prototypes/fn-connect/client/external-header-probe.cjs');
const code = expected => error => error.code === expected;
async function server(t, handle) {
    const sockets = new Set(), seen = [];
    const listener = http.createServer((req, res) => { seen.push(req); handle(req, res); });
    listener.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
    await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
    t.after(async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => listener.close(resolve)); });
    return {origin: 'http://127.0.0.1:' + listener.address().port, seen};
}
function probe(origin, options = {}) {
    return createExternalHeaderProbe({enabled: true, mode: 'fixture', approvedOrigin: origin,
        resolveProxy: async () => 'DIRECT', environment: {}, ...options});
}
test('external probe is disabled by default and accesses neither source nor network', async () => {
    const input = {}; Object.defineProperty(input, 'sourceUrl', {get() { throw new Error('SOURCE_READ'); }});
    await assert.rejects(createExternalHeaderProbe().run(input), code('EXTERNAL_PROBE_DISABLED'));
});
test('one loopback request preserves the synthetic signature and Range/UA but sends no browser authentication', async t => {
    const x = await server(t, (_req, res) => {
        res.writeHead(206, {'Content-Type': 'video/mp4; ignored=private-canary', 'Content-Range': 'bytes 0-0/1000',
            'Content-Length': '1', 'Set-Cookie': 'ignored=private-canary'}); res.end('x');
    });
    const p = probe(x.origin);
    const result = await p.run({sourceUrl: x.origin + '/signed?signature=private-canary', userAgent: 'SyntheticMediaUA/1.0',
        knownSecrets: ['synthetic-fn-cookie', 'synthetic-emby-token']});
    assert.equal(x.seen.length, 1); assert.equal(new URL(x.seen[0].url, x.origin).searchParams.get('signature'), 'private-canary');
    assert.equal(x.seen[0].headers.range, 'bytes=0-0'); assert.equal(x.seen[0].headers['user-agent'], 'SyntheticMediaUA/1.0');
    for (const key of ['cookie', 'authorization', 'x-emby-token', 'x-mediabrowser-token', 'referer', 'origin']) assert.equal(x.seen[0].headers[key], undefined);
    assert.equal(result.status, 206); assert.deepEqual(result.contentRange, {start: 0, end: 0, total: 1000});
    assert.equal(result.bodyRead, false); assert.equal(result.requestCount, 1);
    assert.equal(JSON.stringify(result).includes('private-canary'), false);
    await assert.rejects(p.run({sourceUrl: x.origin, userAgent: 'SyntheticMediaUA/1.0'}), code('EXTERNAL_PROBE_ALREADY_USED'));
    assert.equal(x.seen.length, 1);
});
test('a 302 ends the trial without requesting even another explicitly owned loopback server', async t => {
    const destination = await server(t, (_req, res) => { res.end('must not be reached'); });
    const source = await server(t, (_req, res) => { res.writeHead(302, {Location: destination.origin + '/private-canary?signature=private-canary'}); res.end(); });
    const result = await probe(source.origin).run({sourceUrl: source.origin + '/signed', userAgent: 'SyntheticMediaUA/1.0'});
    assert.equal(result.result, 'EXTERNAL_PROBE_REDIRECT_STOPPED'); assert.equal(result.redirectOrigin, destination.origin);
    assert.equal(source.seen.length, 1); assert.equal(destination.seen.length, 0);
    assert.equal(JSON.stringify(result).includes('private-canary'), false);
});
test('missing Location does not invent a redirect target', async t => {
    const x = await server(t, (_req, res) => { res.writeHead(302); res.end(); });
    const result = await probe(x.origin).run({sourceUrl: x.origin, userAgent: 'SyntheticMediaUA/1.0'});
    assert.equal(result.redirectOrigin, null); assert.equal(x.seen.length, 1);
});
test('origin, known credentials, UA, Range and known expiry failures all stop before a request', async t => {
    const x = await server(t, (_req, res) => res.end());
    const good = {sourceUrl: x.origin + '/signed', userAgent: 'SyntheticMediaUA/1.0'};
    for (const [change, expected] of [
        [{sourceUrl: 'https://outside.example.test/signed'}, 'EXTERNAL_PROBE_ORIGIN_REJECTED'],
        [{sourceUrl: x.origin + '/signed?opaque=synthetic-fn-cookie', knownSecrets: ['synthetic-fn-cookie']}, 'CREDENTIAL_REDIRECT_BLOCKED'],
        [{sourceUrl: x.origin + '/signed?api_key=synthetic'}, 'CREDENTIAL_REDIRECT_BLOCKED'],
        [{userAgent: undefined}, 'EXTERNAL_PROBE_UA_UNCONFIRMED'], [{userAgent: 'synthetic\r\nCookie: forbidden'}, 'EXTERNAL_PROBE_UA_UNCONFIRMED'],
        [{userAgent: 'synthetic-fn-cookie', knownSecrets: ['synthetic-fn-cookie']}, 'EXTERNAL_PROBE_UA_REJECTED'],
        [{range: 'bytes=0-'}, 'EXTERNAL_PROBE_RANGE_INVALID'], [{range: 'bytes=0-999999'}, 'EXTERNAL_PROBE_RANGE_INVALID'],
        [{expiresAt: 1}, 'EXTERNAL_PROBE_SOURCE_EXPIRED']
    ]) await assert.rejects(probe(x.origin).run({...good, ...change}), code(expected));
    assert.equal(x.seen.length, 0);
    assert.throws(() => createExternalHeaderProbe({enabled: true, approvedOrigin: 'https://*.example.test', resolveProxy() {}}), code('EXTERNAL_PROBE_ORIGIN_INVALID'));
});
test('proxy setup and resolver errors cannot cause direct fallback or expose a signature', async t => {
    const x = await server(t, (_req, res) => res.end());
    const input = {sourceUrl: x.origin + '/signed?signature=private-canary', userAgent: 'SyntheticMediaUA/1.0'};
    await assert.rejects(probe(x.origin, {environment: {HTTPS_PROXY: 'http://synthetic.invalid'}}).run(input), code('EXTERNAL_PROBE_PROXY_UNSUPPORTED'));
    await assert.rejects(probe(x.origin, {resolveProxy: async () => 'PROXY synthetic.invalid:80'}).run(input), code('EXTERNAL_PROBE_PROXY_UNSUPPORTED'));
    await assert.rejects(probe(x.origin, {resolveProxy: async () => { throw new Error('private-canary'); }}).run(input), error =>
        error.code === 'EXTERNAL_PROBE_PROXY_UNVERIFIED' && !error.message.includes('private-canary'));
    assert.equal(x.seen.length, 0);
});
test('cancel during stalled proxy resolution forbids a late request', async t => {
    const x = await server(t, (_req, res) => res.end());
    let release; const signal = new AbortController();
    const p = probe(x.origin, {resolveProxy: () => new Promise(resolve => { release = resolve; })});
    const result = p.run({sourceUrl: x.origin, userAgent: 'SyntheticMediaUA/1.0', signal: signal.signal});
    const rejected = assert.rejects(result, code('CANCELLED'));
    await Promise.resolve(); signal.abort(); await rejected; release('DIRECT');
    await new Promise(resolve => setImmediate(resolve)); assert.equal(x.seen.length, 0);
});
test('header timeout consumes the sole request without retries', async t => {
    const x = await server(t, () => {});
    const p = probe(x.origin, {timeoutMs: 50});
    await assert.rejects(p.run({sourceUrl: x.origin, userAgent: 'SyntheticMediaUA/1.0'}), code('EXTERNAL_PROBE_TIMEOUT'));
    assert.equal(x.seen.length, 1);
    await assert.rejects(p.run({sourceUrl: x.origin, userAgent: 'SyntheticMediaUA/1.0'}), code('EXTERNAL_PROBE_ALREADY_USED'));
    assert.equal(x.seen.length, 1);
});
test('active request cancellation closes the owned loopback socket without a second request', async t => {
    let arrived, closed;
    const arrival = new Promise(resolve => { arrived = resolve; });
    const closure = new Promise(resolve => { closed = resolve; });
    const x = await server(t, req => { req.socket.once('close', closed); arrived(); });
    const controller = new AbortController(), p = probe(x.origin);
    const pending = p.run({sourceUrl: x.origin, userAgent: 'SyntheticMediaUA/1.0', signal: controller.signal});
    const rejected = assert.rejects(pending, code('CANCELLED'));
    await arrival; controller.abort(); await rejected; await closure;
    assert.equal(x.seen.length, 1);
    await assert.rejects(p.run({}), code('EXTERNAL_PROBE_ALREADY_USED'));
});
test('a source expiring during proxy resolution cannot reach the loopback server', async t => {
    const x = await server(t, (_req, res) => res.end());
    let clock = 1000;
    const p = probe(x.origin, {now: () => clock, resolveProxy: async () => { clock = 2000; return 'DIRECT'; }});
    await assert.rejects(p.run({sourceUrl: x.origin, userAgent: 'SyntheticMediaUA/1.0', expiresAt: 1500}), code('EXTERNAL_PROBE_SOURCE_EXPIRED'));
    assert.equal(x.seen.length, 0);
});
