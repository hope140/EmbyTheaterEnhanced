'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const net = require('node:net');
const {PassThrough, Readable, Writable} = require('node:stream');
const {EventEmitter} = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createElectronIO} = require('../prototypes/fn-connect/client/electron-io.cjs');
const {createController} = require('../prototypes/fn-connect/client/controller.cjs');
const {createBridge} = require('../prototypes/fn-connect/client/bridge.cjs');
const {createFixture, createFixtureIO} = require('../prototypes/fn-connect/client/fixture.cjs');
const code = expected => error => error.code === expected && error.message === expected;
async function setup(t, options = {}) {
    const fixture = await createFixture(), io = createFixtureIO();
    const controller = createController({enabled: true, mode: 'fixture', io, ...options});
    const bridge = await createBridge(controller, {enabled: true});
    t.after(async () => { await bridge.close(); await controller.closeAll(); await fixture.close(); });
    const id = controller.add(fixture.profile);
    async function login(profileId = id) {
        await controller.start(profileId);
        await io.authorize(profileId, fixture.profile);
        await controller.verify(profileId);
    }
    return {fixture, io, controller, bridge, id, login};
}
async function bytes(response) {
    const parts = [];
    for await (const part of response.body) parts.push(part);
    return Buffer.concat(parts);
}
function rawWs(address) {
    return new Promise((resolve, reject) => {
        const u = new URL(address), socket = net.connect(Number(u.port), u.hostname);
        socket.once('error', reject);
        socket.on('connect', () => socket.write('GET ' + u.pathname + ' HTTP/1.1\r\nHost: ' + u.host +
            '\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n'));
        let data = Buffer.alloc(0);
        function receive(chunk) {
            data = Buffer.concat([data, chunk]);
            const end = data.indexOf('\r\n\r\n');
            if (end >= 0) { socket.removeListener('data', receive); resolve({socket, headers: data.subarray(0, end).toString(), head: data.subarray(end + 4)}); }
        }
        socket.on('data', receive);
    });
}

test('default-disabled controller creates no session, window, request or listener', async () => {
    let calls = 0;
    const controller = createController({io: new Proxy({}, {get() { calls++; return () => {}; }})});
    assert.throws(() => controller.add({}), code('FEATURE_DISABLED'));
    await assert.rejects(createBridge(controller), code('FEATURE_DISABLED'));
    assert.equal(calls, 0);
});

test('Electron 44 Writable finish/close before URLLoader response is not a network error', async () => {
    class ElectronUpload extends Writable {
        constructor() { super({autoDestroy: true}); }
        _write(_chunk, _encoding, callback) { callback(); }
        _final(callback) {
            callback();
            setImmediate(() => {
                const response = Readable.from(['{"fixture":true}']);
                Object.assign(response, {statusCode: 200, headers: {'content-type': 'application/json'}});
                this.emit('response', response);
            });
        }
        setHeader() {}
        abort() { this.emit('abort'); }
    }
    const req = new ElectronUpload(), lifecycle = [], diagnostics = [];
    for (const event of ['finish', 'close', 'response']) req.on(event, () => lifecycle.push(event));
    const io = createElectronIO({net: {request: () => req}}, {onDiagnostic: value => diagnostics.push(value)});
    const response = await io.request({}, {url: 'http://127.0.0.1/synthetic-not-contacted', method: 'GET', headers: {}, signal: new AbortController().signal});
    assert.deepEqual(JSON.parse((await bytes(response)).toString()), {fixture: true});
    assert.deepEqual(lifecycle, ['finish', 'close', 'response']);
    assert.equal(diagnostics.some(e => e.event === 'REQUEST_CLOSE_BEFORE_RESPONSE'), true);
});

test('cancellation after early upload close still aborts and destroys a late response', async () => {
    class ElectronUpload extends Writable {
        constructor() { super({autoDestroy: true}); this.aborted = false; }
        _write(_chunk, _encoding, callback) { callback(); }
        _final(callback) { callback(); }
        setHeader() {}
        abort() { this.aborted = true; this.emit('abort'); }
    }
    const req = new ElectronUpload(), signal = new AbortController();
    const closed = new Promise(resolve => req.once('close', resolve));
    const io = createElectronIO({net: {request: () => req}});
    const pending = io.request({}, {url: 'http://127.0.0.1/synthetic-not-contacted', method: 'GET', headers: {}, signal: signal.signal});
    const rejected = assert.rejects(pending, code('CANCELLED'));
    await closed;
    assert.equal(require('node:events').getEventListeners(signal.signal, 'abort').length, 1);
    signal.abort(); await rejected;
    assert.equal(req.aborted, true);
    const response = new PassThrough(); Object.assign(response, {statusCode: 200, headers: {}});
    req.emit('response', response);
    assert.equal(response.destroyed, true);
    assert.equal(require('node:events').getEventListeners(signal.signal, 'abort').length, 0);
});

for (const phase of ['setup', 'network']) test('a ' + phase + ' failure destroys late response and refuses late redirect', async () => {
    const req = new EventEmitter(), diagnostics = [], cancel = new AbortController();
    let aborts = 0;
    req.abort = () => { aborts++; req.emit('abort'); };
    req.setHeader = () => { if (phase === 'setup') throw Object.assign(new Error('private-message-canary'), {code: 'ERR_INVALID_ARG_VALUE'}); };
    req.end = () => queueMicrotask(() => req.emit('error', new Error('net::ERR_CONNECTION_REFUSED')));
    const io = createElectronIO({net: {request: () => req}}, {onDiagnostic: value => diagnostics.push(value)});
    await assert.rejects(io.request({}, {url: 'http://127.0.0.1/synthetic-not-contacted', method: 'GET',
        headers: {accept: 'application/json'}, signal: cancel.signal}), code('NETWORK_ERROR'));
    const late = new PassThrough(); Object.assign(late, {statusCode: 200, headers: {}});
    req.emit('response', late);
    assert.equal(late.destroyed, true);
    req.emit('redirect', 302, 'GET', 'https://synthetic.example.test/?token=private-message-canary', {});
    assert.ok(aborts > 0);
    cancel.abort();
    assert.equal(require('node:events').getEventListeners(cancel.signal, 'abort').length, 0);
    assert.equal(JSON.stringify(diagnostics).includes('private-message-canary'), false);
    assert.equal(diagnostics.some(value => value.errorCode === (phase === 'setup' ? 'ERR_INVALID_ARG_VALUE' : 'ERR_CONNECTION_REFUSED')), true);
});

test('live profiles require HTTPS, explicit addresses and separate non-secret configuration', () => {
    const io = createFixtureIO(), controller = createController({enabled: true, io});
    for (const profile of [
        {bootstrapUrl: 'http://nas.example.test', embyUrl: 'https://media.example.test'},
        {bootstrapUrl: 'https://user:secret@nas.example.test', embyUrl: 'https://media.example.test'},
        {bootstrapUrl: 'https://nas.example.test/?token=private', embyUrl: 'https://media.example.test'},
        {bootstrapUrl: 'https://nas.example.test', embyUrl: 'https://media.example.test', password: 'private'}
    ]) assert.throws(() => controller.add(profile));
    assert.equal(io.sessions.size, 0);
});

test('bootstrap is explicit and unauthenticated probe does not create a fake ready state', async t => {
    const x = await setup(t), events = [];
    x.controller.onState(value => events.push(value));
    await assert.rejects(x.controller.verify(x.id), code('AUTH_NOT_STARTED'));
    assert.equal(x.fixture.state.seen.length, 0);
    await x.controller.start(x.id);
    assert.deepEqual(x.io.sessions.get(x.id).visits, [x.fixture.profile.bootstrapUrl]);
    await assert.rejects(x.controller.verify(x.id), code('FN_AUTH_REQUIRED'));
    assert.equal(x.controller.snapshot(x.id).state, 'needs-auth');
    await x.io.authorize(x.id, x.fixture.profile);
    assert.deepEqual(await x.controller.verify(x.id), {id: x.id, state: 'ready', expectedServerMatch: true});
    assert.equal(JSON.stringify(events).includes(x.fixture.cookie), false);
});

test('synthetic browser sessions stay isolated across identical NAS addresses and clear on close', async t => {
    const x = await setup(t), other = x.controller.add(x.fixture.profile);
    await x.login();
    await x.controller.start(other);
    await assert.rejects(x.controller.verify(other), code('FN_AUTH_REQUIRED'));
    const session = x.io.sessions.get(x.id);
    await x.controller.close(x.id);
    assert.equal(session.cleared, true);
    assert.equal(session.cookies.size, 0);
    assert.equal(x.controller.snapshot(other).state, 'needs-auth');
});

test('HTML 200, plain HTTP denial and network errors remain distinguishable from a known FN challenge', async t => {
    const x = await setup(t);
    await x.controller.start(x.id);
    x.fixture.state.ambiguous = true;
    await assert.rejects(x.controller.verify(x.id), code('AUTH_UNVERIFIED'));
    assert.equal(x.controller.snapshot(x.id).state, 'authorizing');
    await x.io.authorize(x.id, x.fixture.profile);
    await x.controller.verify(x.id);
    const response = await x.controller.request(x.id, {path: 'deny'});
    assert.equal(response.statusCode, 403); response.dispose();
    assert.equal(x.controller.snapshot(x.id).state, 'ready');
    x.fixture.state.networkError = true;
    await assert.rejects(x.controller.request(x.id, {path: 'anything'}), code('NETWORK_ERROR'));
    assert.equal(x.controller.snapshot(x.id).state, 'ready');
});

test('API transport keeps Emby auth separate, disallows caller cookies, and rejects an out-of-scope target', async t => {
    const x = await setup(t); await x.login();
    const response = await x.controller.request(x.id, {path: 'api', headers: {'X-Emby-Token': 'synthetic-emby-canary'}});
    assert.deepEqual(JSON.parse((await bytes(response)).toString()), {fixture: true});
    const seen = x.fixture.state.seen.at(-1);
    assert.equal(seen.headers['x-emby-token'], 'synthetic-emby-canary');
    assert.equal(seen.headers.cookie, 'FNFixture=' + x.fixture.cookie);
    await assert.rejects(x.controller.request(x.id, {path: 'api', headers: {Cookie: 'forged'}}), code('HEADER_NOT_ALLOWED'));
    assert.throws(() => x.controller.request(x.id, {path: '../nas/authorize'}));
    assert.throws(() => x.controller.request(x.id, {path: 'https://outside.example.test/'}), code('TARGET_OUT_OF_SCOPE'));
});

test('real loopback native lease streams exact 206 bytes and content-range with no cookie exposed to player', async t => {
    const x = await setup(t); await x.login();
    const lease = x.bridge.lease(x.id, {path: 'media.bin', headers: {'X-Emby-Token': 'synthetic-emby-canary'}});
    const response = await fetch(lease.url, {headers: {Range: 'bytes=317-2039'}});
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), 'bytes 317-2039/' + x.fixture.bytes.length);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), x.fixture.bytes.subarray(317, 2040));
    assert.equal(response.headers.get('set-cookie'), null);
    const unsatisfied = await fetch(lease.url, {headers: {Range: 'bytes=99999999-'}});
    assert.equal(unsatisfied.status, 416); await unsatisfied.text();
    lease.revoke();
    assert.equal((await fetch(lease.url)).status, 410);
});

test('external 302 is followed by the player without NAS/Emby cookies, authorization or referrer', async t => {
    const x = await setup(t); await x.login();
    const lease = x.bridge.lease(x.id, {path: 'direct', headers: {Authorization: 'Bearer synthetic-emby-canary'}});
    const response = await fetch(lease.url);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), x.fixture.bytes);
    assert.equal(x.fixture.state.externalRequests.length, 1);
    for (const key of ['cookie', 'authorization', 'x-emby-token', 'referer']) assert.equal(x.fixture.state.externalRequests[0][key], undefined);
});

test('a redirect containing a known credential is blocked before external I/O, including encoded values', async t => {
    const x = await setup(t); await x.login();
    for (const secret of [x.fixture.cookie, 'synthetic-emby-canary']) {
        x.fixture.state.redirectSecret = secret;
        await assert.rejects(x.controller.request(x.id, {path: 'direct', kind: 'media',
            headers: {Authorization: 'Bearer synthetic-emby-canary'}}), code('CREDENTIAL_REDIRECT_BLOCKED'));
    }
    assert.equal(x.fixture.state.externalRequests.length, 0);
});

test('API redirects never follow an external address; redirect loops are bounded', async t => {
    const x = await setup(t); await x.login();
    await assert.rejects(x.controller.request(x.id, {path: 'direct'}), code('EXTERNAL_REDIRECT_REVIEW_REQUIRED'));
    await assert.rejects(x.controller.request(x.id, {path: 'loop'}), code('REDIRECT_LOOP'));
    assert.equal(x.fixture.state.externalRequests.length, 0);
});

test('HLS is explicitly unsupported rather than handing the player unauthenticated segment URLs', async t => {
    const x = await setup(t); await x.login();
    const lease = x.bridge.lease(x.id, {path: 'hls/playlist.m3u8'});
    const response = await fetch(lease.url);
    assert.equal(response.status, 502);
    assert.equal((await response.text()).includes('#EXTM3U'), false);
});

test('explicit expiry challenge retires local leases without treating an Emby 403 as NAS expiry', async t => {
    const x = await setup(t); await x.login();
    const lease = x.bridge.lease(x.id, {path: 'media.bin'});
    x.fixture.state.expired = true;
    await assert.rejects(x.controller.request(x.id, {path: 'api'}), code('FN_AUTH_REQUIRED'));
    assert.equal(x.controller.snapshot(x.id).state, 'needs-auth');
    assert.equal((await fetch(lease.url)).status, 410);
});

test('closing a profile cancels an in-flight header request and does not submit late readiness', async t => {
    const x = await setup(t); await x.login();
    const pending = x.controller.request(x.id, {path: 'headers-slow'});
    const rejection = assert.rejects(pending, code('CANCELLED'));
    await new Promise(resolve => setTimeout(resolve, 20));
    await x.controller.close(x.id);
    await rejection;
});

test('header timeouts remain network failures and preserve a valid session', async t => {
    const x = await setup(t, {headerTimeoutMs: 30}); await x.login();
    await assert.rejects(x.controller.request(x.id, {path: 'headers-slow'}), code('NETWORK_TIMEOUT'));
    assert.equal(x.controller.snapshot(x.id).state, 'ready');
});

test('native consumer cancellation closes the upstream stream', async t => {
    const x = await setup(t); await x.login();
    const lease = x.bridge.lease(x.id, {path: 'slow'});
    const response = await fetch(lease.url), reader = response.body.getReader();
    assert.equal((await reader.read()).done, false);
    await reader.cancel();
    for (let i = 0; i < 30 && !x.fixture.state.slowClosed; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(x.fixture.state.slowClosed, true);
});

test('actual loopback WebSocket handshake and byte tunnel carry scoped synthetic auth', async t => {
    const x = await setup(t); await x.login();
    const lease = x.bridge.lease(x.id, {kind: 'websocket', path: 'ws', headers: {'X-Emby-Token': 'synthetic-ws-canary'}});
    const result = await rawWs(lease.url);
    t.after(() => result.socket.destroy());
    assert.match(result.headers, /^HTTP\/1.1 101/);
    const payload = Buffer.from([0x81, 0x02, 0x4f, 0x4b]);
    const echoed = new Promise(resolve => result.socket.once('data', resolve));
    result.socket.write(payload);
    assert.deepEqual(await echoed, payload);
    const upstream = x.fixture.state.seen.at(-1);
    assert.equal(upstream.headers.cookie, 'FNFixture=' + x.fixture.cookie);
    assert.equal(upstream.headers['x-emby-token'], 'synthetic-ws-canary');
    await x.controller.close(x.id);
    await new Promise(resolve => { if (result.socket.destroyed) resolve(); else result.socket.once('close', resolve); });
});

test('loopback capabilities reject website origins and WS caller cookies cannot bypass policy', async t => {
    const x = await setup(t); await x.login();
    const lease = x.bridge.lease(x.id, {path: 'media.bin'});
    assert.equal((await fetch(lease.url, {headers: {Origin: 'https://untrusted.example.test'}})).status, 502);
    await assert.rejects(x.controller.webSocket(x.id, {path: 'ws', headers: {Cookie: 'forged'}}), code('HEADER_NOT_ALLOWED'));
});

test('Electron abort+close without error settles a pending header request', async () => {
    class Request extends EventEmitter {
        setHeader() {} end() {}
        abort() { this.emit('abort'); this.emit('close'); }
    }
    const request = new Request(), signal = new AbortController();
    const io = createElectronIO({net: {request: () => request}});
    const pending = io.request({}, {url: 'https://synthetic.example.test/', method: 'GET', headers: {}, signal: signal.signal});
    const rejection = assert.rejects(pending, code('CANCELLED'));
    signal.abort();
    await rejection;
});

test('credential accumulation covers query values removed by an intermediate same-origin redirect', async t => {
    const x = await setup(t); await x.login();
    x.fixture.state.redirectSecret = 'initial-query-secret-canary';
    await assert.rejects(x.controller.request(x.id, {path: 'strip?api_key=initial-query-secret-canary', kind: 'media'}), code('CREDENTIAL_REDIRECT_BLOCKED'));
    assert.equal(x.fixture.state.externalRequests.length, 0);
});

function memoryIO(handler) {
    return {createSession: () => ({}), openLogin: async () => ({close() {}}), clearSession: async () => {},
        cookieValues: async () => [], request: handler};
}
const memoryProfile = {bootstrapUrl: 'https://nas.example.test/', embyUrl: 'https://emby.example.test/'};
function infoBody() { return Readable.from([Buffer.from('{"Id":"synthetic","Version":"4.10"}')]); }

test('a stalled JSON body has a bounded verification deadline even if the adapter does not abort it', async t => {
    const body = new PassThrough();
    const controller = createController({enabled: true, verificationTimeoutMs: 25,
        io: memoryIO(async () => ({statusCode: 200, headers: {'content-type': 'application/json'}, body}))});
    t.after(() => controller.closeAll());
    const id = controller.add(memoryProfile); await controller.start(id);
    await assert.rejects(controller.verify(id), code('NETWORK_TIMEOUT'));
    assert.equal(body.destroyed, true);
});

test('an explicit expiry retires a pending verify; late JSON cannot restore ready', async t => {
    const delayed = new PassThrough();
    let calls = 0;
    const io = memoryIO(async () => ++calls === 1 ? {statusCode: 200,
        headers: {'content-type': 'application/json'}, body: infoBody()} : calls === 2 ?
        {statusCode: 200, headers: {'content-type': 'application/json'}, body: delayed} :
        {statusCode: 302, headers: {location: memoryProfile.bootstrapUrl}, body: Readable.from([])});
    const controller = createController({enabled: true, io});
    t.after(() => controller.closeAll());
    const id = controller.add(memoryProfile); await controller.start(id); await controller.verify(id);
    const stale = controller.verify(id), rejected = assert.rejects(stale, code('CANCELLED'));
    await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(controller.request(id, {path: 'api'}), code('FN_AUTH_REQUIRED'));
    delayed.end('{"Id":"synthetic","Version":"4.10"}');
    await rejected;
    assert.equal(controller.snapshot(id).state, 'needs-auth');
});

test('closing waits for the owned header operation before clearing its session', async () => {
    let release, started = false, cleared = false;
    const io = memoryIO(() => { started = true; return new Promise(resolve => { release = resolve; }); });
    io.clearSession = async () => { cleared = true; };
    const controller = createController({enabled: true, io});
    const id = controller.add(memoryProfile); await controller.start(id);
    const verifying = controller.verify(id), rejected = assert.rejects(verifying, code('CANCELLED'));
    while (!started) await new Promise(resolve => setImmediate(resolve));
    const closing = controller.close(id);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(cleared, false);
    release({statusCode: 200, headers: {'content-type': 'application/json'}, body: infoBody()});
    await Promise.all([closing, rejected]);
    assert.equal(cleared, true);
});

test('a client that disconnects during pending WS upgrade cancels the upstream handshake', async t => {
    const x = await setup(t); await x.login();
    const lease = x.bridge.lease(x.id, {path: 'ws-pending', kind: 'websocket'}), u = new URL(lease.url);
    const socket = net.connect(Number(u.port), u.hostname);
    t.after(() => socket.destroy());
    socket.on('error', () => {});
    await new Promise(resolve => socket.once('connect', resolve));
    socket.write('GET ' + u.pathname + ' HTTP/1.1\r\nHost: ' + u.host + '\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n');
    for (let i = 0; i < 30 && !x.fixture.state.wsPendingEntered; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(x.fixture.state.wsPendingEntered, true);
    socket.destroy();
    for (let i = 0; i < 30 && !x.fixture.state.wsPendingClosed; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(x.fixture.state.wsPendingClosed, true);
});

test('WS expiry reports the FN challenge, while a late canceled upgrade socket is destroyed', async t => {
    const x = await setup(t); await x.login();
    x.fixture.state.expired = true;
    await assert.rejects(x.controller.webSocket(x.id, {path: 'ws', headers: {
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==', 'sec-websocket-version': '13'
    }}), code('FN_AUTH_REQUIRED'));
    let release;
    const io = memoryIO(async () => ({statusCode: 200, headers: {'content-type': 'application/json'}, body: infoBody()}));
    io.openWebSocket = async () => new Promise(resolve => { release = resolve; });
    const controller = createController({enabled: true, io});
    const id = controller.add(memoryProfile); await controller.start(id); await controller.verify(id);
    const pending = controller.webSocket(id, {path: 'ws', headers: {}}), rejected = assert.rejects(pending, code('CANCELLED'));
    const closing = controller.close(id), socket = new PassThrough();
    release({statusCode: 101, headers: {}, socket});
    await Promise.all([rejected, closing]);
    assert.equal(socket.destroyed, true);
});

test('latest verification owns readiness and a replaced verification cannot commit late', async t => {
    let calls = 0;
    const delayed = new PassThrough();
    const io = memoryIO(async () => ({statusCode: 200, headers: {'content-type': 'application/json'}, body: ++calls === 1 ? delayed : infoBody()}));
    const controller = createController({enabled: true, io}); t.after(() => controller.closeAll());
    const id = controller.add(memoryProfile); await controller.start(id);
    const old = controller.verify(id), rejected = assert.rejects(old, code('CANCELLED'));
    await new Promise(resolve => setImmediate(resolve));
    await controller.verify(id);
    delayed.end('{"Id":"synthetic","Version":"4.10"}');
    await rejected;
    assert.equal(controller.snapshot(id).state, 'ready');
});

test('new redirect cookies scoped only to an old path cannot escape in a later Location', async t => {
    const x = await setup(t); await x.login();
    x.fixture.state.redirectSecret = 'NEW_PATH_COOKIE_SECRET';
    await assert.rejects(x.controller.request(x.id, {path: 'path-cookie', kind: 'media'}), code('CREDENTIAL_REDIRECT_BLOCKED'));
    assert.equal(x.fixture.state.externalRequests.length, 0);
});

test('a body closed during cookie metadata retrieval retires the request and cannot stall profile close', async () => {
    const body = new PassThrough();
    let reads = 0;
    const io = memoryIO(async () => ({statusCode: 200, headers: {'content-type': 'application/json'}, body}));
    io.cookieValues = () => {
        if (++reads === 1) return Promise.resolve([]);
        return new Promise(resolve => setImmediate(() => { body.destroy(); resolve([]); }));
    };
    const controller = createController({enabled: true, io});
    const id = controller.add(memoryProfile); await controller.start(id);
    await assert.rejects(controller.verify(id), code('INFO_STREAM_FAILED'));
    await controller.close(id);
    assert.throws(() => controller.snapshot(id), code('PROFILE_CLOSED'));
});

test('live WS never falls back to direct when an environment or session proxy is configured', async () => {
    let reads = 0;
    const ses = {resolveProxy: async () => 'DIRECT', cookies: {get: async () => { reads++; throw new Error('Unexpected cookie read'); }}};
    const io = createElectronIO({}, {environment: {HTTPS_PROXY: 'http://proxy.example.test:8080'}});
    await assert.rejects(io.openWebSocket(ses, {url: 'https://media.example.test/ws', headers: {}, signal: new AbortController().signal}), code('WS_PROXY_UNSUPPORTED'));
    ses.resolveProxy = async () => 'PROXY proxy.example.test:8080';
    await assert.rejects(createElectronIO({}, {environment: {}}).openWebSocket(ses, {url: 'https://media.example.test/ws', headers: {}, signal: new AbortController().signal}), code('WS_PROXY_UNSUPPORTED'));
    assert.equal(reads, 0);
});

test('cancellation retires a stalled cookie read without dispatching any request or leaking late results', async () => {
    let release, requests = 0, cleared = false;
    const io = memoryIO(async () => { requests++; return {statusCode: 200, headers: {'content-type': 'application/json'}, body: infoBody()}; });
    io.cookieValues = () => new Promise(resolve => { release = resolve; });
    io.clearSession = async () => { cleared = true; };
    const controller = createController({enabled: true, io});
    const id = controller.add(memoryProfile); await controller.start(id);
    const pending = controller.verify(id), rejected = assert.rejects(pending, code('CANCELLED'));
    await controller.close(id);
    await rejected;
    assert.equal(cleared, true);
    release(['late-cookie-canary']);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests, 0);
});

for (const stage of ['fixture', 'bridge']) test('Electron shutdown owns late ' + stage + ' initialization and creates no window', async () => {
    const app = new EventEmitter();
    let release, entered = false, windows = 0, fixtureClosed = 0, bridgeClosed = 0, controllerClosed = 0, quit;
    const quitting = new Promise(resolve => { quit = resolve; });
    const fixture = {profile: memoryProfile, async close() { fixtureClosed++; }};
    const bridge = {async close() { bridgeClosed++; }};
    app.setPath = () => {};
    app.whenReady = () => Promise.resolve();
    app.quit = () => {
        let prevented = false;
        app.emit('before-quit', {preventDefault() { prevented = true; }});
        if (!prevented) { app.emit('quit'); quit(); }
    };
    const main = path.join(__dirname, '../prototypes/fn-connect/client/electron-main.cjs');
    const electron = {app, BrowserWindow: class { constructor() { windows++; throw new Error('Unexpected window'); } }, ipcMain: {}};
    const replacement = {
        electron,
        './controller.cjs': {createController: () => ({async closeAll() { controllerClosed++; }, onState() {}})},
        './bridge.cjs': {createBridge: () => stage === 'bridge' ? new Promise(resolve => { entered = true; release = () => resolve(bridge); }) : Promise.resolve(bridge)},
        './fixture.cjs': {createFixture: () => stage === 'fixture' ? new Promise(resolve => { entered = true; release = () => resolve(fixture); }) : Promise.resolve(fixture)},
        './electron-io.cjs': {createElectronIO: () => ({})},
        './policy.cjs': {config() {}}
    };
    vm.runInNewContext(fs.readFileSync(main, 'utf8'), {require: key => Object.hasOwn(replacement, key) ? replacement[key] : require(key),
        __dirname: path.dirname(main), process: {argv: ['electron', main, '--fn-connect-prototype', '--fixture'], stdout: {write() {}}, stderr: {write() {}}},
        setTimeout, clearTimeout, URL}, {filename: main});
    while (!entered) await new Promise(resolve => setImmediate(resolve));
    app.quit(); release();
    await quitting;
    assert.equal(windows, 0);
    assert.equal(fixtureClosed, 1);
    assert.equal(bridgeClosed, stage === 'bridge' ? 1 : 0);
    assert.equal(controllerClosed, stage === 'bridge' ? 1 : 0);
});
