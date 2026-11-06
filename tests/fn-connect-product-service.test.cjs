'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {Readable} = require('node:stream');
const http = require('node:http');
const {createService} = require('../src/electronapp/enhanced/fn-connect/service.cjs');
const {createFixture, createFixtureIO} = require('../prototypes/fn-connect/client/fixture.cjs');
const {createAnonymousMedia} = require('../src/electronapp/enhanced/fn-connect/core/anonymous-media.cjs');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {resolve, promise}; };
const code = value => error => error.code === value;
async function fixture(t, options = {}) {
    const f = await createFixture(), io = createFixtureIO(), requests = [];
    io.requestUserAgent = () => 'Synthetic/1.0';
    const original = io.request;
    io.request = async (session, input) => {
        requests.push(input);
        const address = new URL(input.url);
        if (address.pathname.startsWith('/emby/Users/')) {
            if (options.beforeUser) await options.beforeUser();
            const account = decodeURIComponent(address.pathname.slice('/emby/Users/'.length));
            const token = input.headers['x-emby-token'];
            const statusCode = token === 'synthetic-' + account || token === 'synthetic-rotated-' + account ? 200 : 401;
            return {statusCode, headers: {'content-type': 'application/json'}, body: Readable.from([Buffer.from(JSON.stringify({
                Id: options.userId || account, ServerId: 'synthetic-emby'
            }))])};
        }
        return original(session, input);
    };
    io.openAnonymousMedia = (_session, input) => createAnonymousMedia({enabled: true, mode: 'fixture',
        environment: {}, resolveProxy: async () => 'DIRECT'}).open(input);
    const service = createService({enabled: true, mode: 'fixture', io, ...options});
    const config = {...f.profile, embyUrl: new URL('..', f.profile.embyUrl).href};
    t.after(async () => { await service.close(); await f.close(); });
    async function add(account) {
        const {id} = await service.open(config); await io.authorize(id, config); await service.verify(id);
        const context = {serverId: 'synthetic-emby', accountId: account, serverAddress: config.embyUrl, token: 'synthetic-' + account};
        await service.bind(id, context); return {id, context};
    }
    async function route(id) { const r = await service.route(id); return {...r, apiBase: r.apiBase + 'emby/'}; }
    return {service, f, io, requests, add, config, route};
}
test('disabled production service creates no Session, window or listener and cannot open a profile', async () => {
    const service = createService({io: new Proxy({}, {get() { throw new Error('UNEXPECTED_IO'); }})});
    assert.deepEqual(service.capabilities(), {enabled: false, persistentLogin: false});
    await assert.rejects(service.open({}), code('FN_CONNECT_DISABLED'));
    await service.close();
});
test('official gateway profile binds only the verified Emby server and server-authorized account', async t => {
    const x = await fixture(t), {id} = await x.service.open(x.config);
    await x.io.authorize(id, x.config); await x.service.verify(id);
    const value = {serverId: 'wrong-server', accountId: 'a', serverAddress: x.config.embyUrl, token: 'synthetic-a'};
    const before = x.requests.length;
    await assert.rejects(x.service.bind(id, value), code('FN_SERVER_MISMATCH'));
    assert.equal(x.requests.length, before);
    value.serverId = 'synthetic-emby'; value.token = 'wrong-account-token';
    await assert.rejects(x.service.bind(id, value), code('FN_ACCOUNT_UNVERIFIED'));
    value.token = 'synthetic-a'; await x.service.bind(id, value);
    await assert.rejects(x.service.bind(id, {...value, accountId: 'b', token: 'synthetic-b'}), code('FN_ACCOUNT_PROFILE_MISMATCH'));
    await assert.rejects(x.service.source({context: value, source: x.f.profile.embyUrl + 'media.bin', requestId: 1}), code('FN_ACCOUNT_NOT_BOUND'));
});
test('mismatching user DTO is not accepted as current Emby identity', async t => {
    const x = await fixture(t, {userId: 'other-account'});
    await assert.rejects(x.add('a'), code('FN_ACCOUNT_UNVERIFIED'));
});
test('final Native source traverses the existing authenticated route and anonymous Range consumer', async t => {
    const x = await fixture(t), a = await x.add('a');
    const result = await x.service.source({context: a.context, source: x.f.profile.embyUrl + 'direct', requestId: 1});
    assert.equal(result.matched, true); assert.match(result.url, /^http:\/\/127\.0\.0\.1:[0-9]+\/r\/[a-f0-9]{48}$/);
    const response = await fetch(result.url, {headers: {range: 'bytes=11-97'}});
    assert.equal(response.status, 206); assert.equal((await response.arrayBuffer()).byteLength, 87);
    const hit = x.f.state.externalRequests.at(-1);
    assert.equal(hit.cookie, undefined); assert.equal(hit.authorization, undefined); assert.equal(hit['x-emby-token'], undefined);
    assert.equal(hit['user-agent'], 'Synthetic/1.0');
    x.service.release(result.leaseId); assert.equal((await fetch(result.url)).status, 410);
});
test('profile close and account switch revoke owned capabilities without retiring another independent profile', async t => {
    const x = await fixture(t), a = await x.add('a'), b = await x.add('b');
    const first = await x.service.source({context: a.context, source: x.f.profile.embyUrl + 'media.bin', requestId: 1});
    const second = await x.service.source({context: b.context, source: x.f.profile.embyUrl + 'media.bin', requestId: 2});
    await x.service.remove(a.id);
    assert.equal((await fetch(first.url)).status, 410);
    const response = await fetch(second.url); assert.equal(response.status, 200); await response.arrayBuffer();
    x.service.observeIdentity(null); assert.equal((await fetch(second.url)).status, 410);
    await assert.rejects(x.service.source({context: b.context, source: x.f.profile.embyUrl + 'media.bin', requestId: 3}), code('FN_ACCOUNT_NOT_BOUND'));
});
test('token replacement retires old playback and requires a fresh server account check', async t => {
    const x = await fixture(t), a = await x.add('a');
    const first = await x.service.source({context: a.context, source: x.f.profile.embyUrl + 'media.bin', requestId: 1});
    const next = {...a.context, token: 'synthetic-rotated-a'};
    x.service.observeIdentity(next);
    assert.equal((await fetch(first.url)).status, 410);
    await assert.rejects(x.service.source({context: next, source: x.f.profile.embyUrl + 'media.bin', requestId: 2}), code('FN_ACCOUNT_NOT_BOUND'));
    await x.service.bind(a.id, next);
    const second = await x.service.source({context: next, source: x.f.profile.embyUrl + 'media.bin', requestId: 2});
    assert.equal(second.matched, true);
});
test('logout during account verification prevents the late response from binding a source', async t => {
    const gate = deferred(), x = await fixture(t, {beforeUser: () => gate.promise});
    const {id} = await x.service.open(x.config); await x.io.authorize(id, x.config); await x.service.verify(id);
    const context = {serverId: 'synthetic-emby', accountId: 'a', serverAddress: x.config.embyUrl, token: 'synthetic-a'};
    const pending = x.service.bind(id, context), rejected = assert.rejects(pending, code('CANCELLED'));
    await new Promise(resolve => setImmediate(resolve));
    x.service.observeIdentity(null); gate.resolve(); await rejected;
    await assert.rejects(x.service.source({context, source: x.f.profile.embyUrl + 'media.bin', requestId: 1}), code('FN_ACCOUNT_NOT_BOUND'));
});
test('abort while bridge setup is pending never creates a late capability', async t => {
    const gate = deferred(); let made = 0, closed = false;
    const x = await fixture(t, {bridgeFactory: async () => {
        await gate.promise; return {lease() { made++; throw new Error('UNEXPECTED_LEASE'); }, async close() { closed = true; }};
    }}), a = await x.add('a');
    const pending = x.service.source({context: a.context, source: x.f.profile.embyUrl + 'media.bin', requestId: 42});
    const rejected = assert.rejects(pending, code('CANCELLED'));
    x.service.cancel(42); gate.resolve(); await rejected; assert.equal(made, 0);
    await x.service.close(); assert.equal(closed, true);
});
test('configured but unbound FN cannot silently use the unproxied Native fallback; unrelated server is unchanged', async t => {
    const x = await fixture(t), a = await x.add('a');
    x.service.observeIdentity(null);
    await assert.rejects(x.service.source({context: a.context, source: x.f.profile.embyUrl + 'media.bin', requestId: 1}), code('FN_ACCOUNT_NOT_BOUND'));
    assert.deepEqual(await x.service.source({context: {...a.context, serverAddress: 'http://127.0.0.1:1/'}, source: 'http://127.0.0.1:1/a', requestId: 2}), {matched: false});
});
test('a stale token in a same-server source cannot override the account-bound token header', async t => {
    const x = await fixture(t), a = await x.add('a'), before = x.requests.length;
    await assert.rejects(x.service.source({context: a.context, source: x.f.profile.embyUrl + 'media.bin?api_key=synthetic-b', requestId: 1}), code('FN_IDENTITY_CARRIER_MISMATCH'));
    assert.equal(x.requests.length, before);
});
test('every forwarded authorization carrier must match the bound account before API dispatch', async t => {
    const x = await fixture(t), a = await x.add('a'), route = await x.route(a.id);
    for (const headers of [
        {authorization: 'Bearer synthetic-b'}, {'X-Emby-Authorization': 'MediaBrowser Client="Synthetic", Token="synthetic-b"'},
        {'X-Emby-Token': 'synthetic-a', authorization: 'Bearer synthetic-b'},
        {'X-Emby-Authorization': 'MediaBrowser Token=synthetic-b'}, {authorization: 'Basic synthetic'}
        ,{authorization: 'MediaBrowser Token="synthetic-a", Token=synthetic-b'}
    ]) {
        const before = x.requests.length, response = await fetch(route.apiBase + 'System/Info/Public', {headers});
        assert.equal(response.status, 502); await response.text(); assert.equal(x.requests.length, before);
    }
    const ok = await fetch(route.apiBase + 'System/Info/Public', {headers: {authorization: 'MediaBrowser Token="synthetic-a"'}});
    assert.equal(ok.status, 200); await ok.json();
});
test('document retirement invalidates a pre-bind route, including future requests without credentials', async t => {
    const x = await fixture(t), {id} = await x.service.open(x.config);
    await x.io.authorize(id, x.config); await x.service.verify(id);
    const route = await x.route(id); x.service.documentRetired(); const before = x.requests.length;
    const response = await fetch(route.apiBase + 'System/Info/Public'); assert.equal(response.status, 502); await response.text();
    assert.equal(x.requests.length, before);
    await assert.rejects(x.service.verify(id), code('FN_PROFILE_UNKNOWN'));
});
test('normal API POST and image requests use only their owned FN Session; media stays on the Native route', async t => {
    const x = await fixture(t), a = await x.add('a'), route = await x.route(a.id);
    const write = await fetch(route.apiBase + 'fixture-write', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Emby-Token': a.context.token},
        body: JSON.stringify({syntheticPassword: 'NOT_A_REAL_PASSWORD'})});
    assert.equal(write.status, 200); assert.deepEqual(await write.json(), {fixtureWrite: true});
    assert.equal(x.f.state.lastWrite.method, 'POST'); assert.match(x.f.state.lastWrite.body, /NOT_A_REAL_PASSWORD/);
    assert.match(x.f.state.lastWrite.cookie, /FNFixture=/);
    const image = await fetch(route.apiBase + 'fixture-image'); assert.equal(image.status, 200);
    assert.equal(await image.text(), 'synthetic-image'); assert.equal(image.headers.get('set-cookie'), null);
    const media = await fetch(route.apiBase + 'media.bin'); assert.equal(media.status, 502); await media.text();
    const native = await x.service.source({context: a.context, source: route.apiBase + 'media.bin', requestId: 1});
    const partial = await fetch(native.url, {headers: {range: 'bytes=0-10'}}); assert.equal(partial.status, 206);
    assert.equal((await partial.arrayBuffer()).byteLength, 11);
});
test('API cannot relay external redirects or replay a credential-bearing POST on an internal redirect', async t => {
    const x = await fixture(t), a = await x.add('a'), route = await x.route(a.id);
    const direct = await fetch(route.apiBase + 'direct'); assert.equal(direct.status, 502); await direct.text();
    assert.equal(direct.headers.get('location'), null); assert.equal(x.f.state.externalRequests.length, 0);
    const write = await fetch(route.apiBase + 'fixture-write-redirect', {method: 'POST', body: 'SYNTHETIC_PRIVATE_BODY'});
    assert.equal(write.status, 502); await write.text(); assert.equal(x.f.state.lastWrite, undefined);
});
test('logout retires Native and API capabilities before returning the normal logout response', async t => {
    const x = await fixture(t), a = await x.add('a'), route = await x.route(a.id);
    const native = await x.service.source({context: a.context, source: route.apiBase + 'media.bin', requestId: 1});
    const logout = await fetch(route.apiBase + 'Sessions/Logout', {method: 'POST', headers: {'X-Emby-Token': a.context.token}});
    assert.equal(logout.status, 200); await logout.json();
    assert.equal((await fetch(native.url)).status, 410);
    const after = x.requests.length, stale = await fetch(route.apiBase + 'System/Info/Public');
    assert.equal(stale.status, 502); await stale.text(); assert.equal(x.requests.length, after);
});
test('normal Emby WebSocket uses the same owned FN Session and rejects a conflicting query token', {timeout: 5000}, async t => {
    const x = await fixture(t), a = await x.add('a'), route = await x.route(a.id);
    function socket(token) {
        return new Promise((resolve, reject) => {
            const req = http.request(route.apiBase + 'ws?api_key=' + token, {headers: {Connection: 'Upgrade', Upgrade: 'websocket',
                'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ=='}});
            req.on('error', reject); req.on('upgrade', (response, socket) => resolve({status: response.statusCode, socket}));
            req.on('response', response => { response.resume(); resolve({status: response.statusCode}); }); req.end();
        });
    }
    const allowed = await socket(a.context.token); assert.equal(allowed.status, 101);
    const echoed = new Promise((resolve, reject) => { allowed.socket.once('data', resolve); allowed.socket.once('error', reject); });
    allowed.socket.write(Buffer.from([0x82, 1, 42])); assert.deepEqual(await echoed, Buffer.from([0x82, 1, 42]));
    const denied = await socket('synthetic-b'); assert.equal(denied.status, 502);
    const stopped = new Promise(resolve => allowed.socket.once('close', resolve)); x.service.documentRetired(); await stopped;
});
test('a retired FN registration and a malformed same-origin base never select unproxied Native fallback', async t => {
    const x = await fixture(t), a = await x.add('a');
    await assert.rejects(x.service.source({context: {...a.context, serverAddress: a.context.serverAddress + '?api_key=synthetic-b'},
        source: a.context.serverAddress + 'media.bin', requestId: 1}), code('FN_SERVER_MISMATCH'));
    await x.service.remove(a.id);
    await assert.rejects(x.service.source({context: a.context, source: a.context.serverAddress + 'media.bin', requestId: 2}), code('FN_SERVER_MISMATCH'));
});
test('an explicitly selected new FN profile retires an old profile even if Emby reuses the same account token', async t => {
    const x = await fixture(t), a = await x.add('a');
    const old = await x.service.source({context: a.context, source: x.f.profile.embyUrl + 'media.bin', requestId: 1});
    const b = await x.service.open(x.config); await x.io.authorize(b.id, x.config); await x.service.verify(b.id);
    await x.service.switchIdentity(a.context, b.id); await x.service.bind(b.id, a.context);
    assert.equal((await fetch(old.url)).status, 410);
    const next = await x.service.source({context: a.context, source: x.f.profile.embyUrl + 'media.bin', requestId: 2});
    assert.equal(next.matched, true);
});
test('same-token preferred ownership permanently retires an old provisional API route before first bind', async t => {
    const x = await fixture(t), a = await x.service.open(x.config);
    await x.io.authorize(a.id, x.config); await x.service.verify(a.id);
    const route = await x.route(a.id), token = 'synthetic-a';
    const pin = await fetch(route.apiBase + 'System/Info/Public', {headers: {'X-Emby-Token': token}});
    assert.equal(pin.status, 200); await pin.json();
    const b = await x.service.open(x.config); await x.io.authorize(b.id, x.config); await x.service.verify(b.id);
    const context = {serverId: 'synthetic-emby', accountId: 'a', serverAddress: x.config.embyUrl, token};
    await x.service.switchIdentity(context, b.id); const before = x.requests.length;
    for (const headers of [{}, {'X-Emby-Token': token}]) {
        const stale = await fetch(route.apiBase + 'System/Info/Public', {headers});
        assert.equal(stale.status, 502); await stale.text();
    }
    assert.equal(x.requests.length, before);
    await assert.rejects(x.service.bind(a.id, context), code('FN_ACCOUNT_PROFILE_MISMATCH'));
    await x.service.bind(b.id, context);
});
