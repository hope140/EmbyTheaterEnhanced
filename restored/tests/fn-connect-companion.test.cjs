'use strict';

const assert = require('node:assert/strict');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');
const test = require('node:test');
const config = require('../prototypes/fn-connect/companion/config.mock.json');
const {createMockBridge, validateConfig} = require('../prototypes/fn-connect/companion/bridge-mock.cjs');
const {prepareReview} = require('../prototypes/fn-connect/companion/prepare-review.cjs');
const prefix = config.mapping.prefix;
const valid = {gatewayAuthorized: true, method: 'GET', path: prefix + '/emby/System/Info/Public'};
const expected = code => error => error.code === code && error.message === code;

function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return {promise, resolve, reject};
}

test('configuration stays disabled and rejects production endpoints, permissions or credentials', () => {
    assert.equal(validateConfig().enabled, false);
    for (const mutate of [value => { value.enabled = true; }, value => { value.mode = 'production'; },
        value => { value.upstream.url = 'http://127.0.0.1:8096'; },
        value => { value.upstream.role = 'direct-emby'; },
        value => { value.responsePolicy.directEmbyFallback = true; },
        value => { value.permissions.tcpListener = true; },
        value => { value.token = 'synthetic-never-package-marker'; }]) {
        const input = structuredClone(config);
        mutate(input);
        assert.throws(() => validateConfig(input), expected('MOCK_CONFIG_REQUIRED'));
        assert.throws(() => prepareReview({config: input}), expected('MOCK_CONFIG_REQUIRED'));
    }
    assert.throws(() => { config.enabled = true; }, TypeError);
});

test('default bridge and unauthorized mock gateway do no upstream work', async () => {
    let calls = 0;
    const upstream = async () => { calls++; };
    await assert.rejects(createMockBridge({upstream}).forward(valid), expected('BRIDGE_DISABLED'));
    await assert.rejects(createMockBridge({activateMock: true, upstream}).forward({...valid, gatewayAuthorized: false}),
        expected('MOCK_GATEWAY_AUTH_REQUIRED'));
    assert.equal(calls, 0);
});

test('prefix and query mapping preserve original Emby identity, method, body and exact response', async () => {
    const body = Buffer.from('synthetic-request-body');
    const response = {status: 401, headers: {'Content-Type': 'application/json'}, body: {error: 'emby-denied'}};
    let received;
    const bridge = createMockBridge({activateMock: true, upstream: async request => { received = request; return response; }});
    const result = await bridge.forward({...valid, method: 'POST', path: prefix + '/emby/Users/AuthenticateByName?deviceId=a%20b',
        headers: {Authorization: 'synthetic-emby-auth', 'X-Emby-Token': 'synthetic-emby-token',
            Cookie: 'fnos-token=synthetic-gateway-session', 'x-access-code': 'synthetic-access-code',
            'X-Fnos-Session': 'synthetic-session', Host: 'untrusted.test', Connection: 'keep-alive, X-Remove',
            'X-Remove': 'strip', 'X-Forwarded-Host': 'untrusted.test'}, body});
    assert.equal(received.path, '/emby/Users/AuthenticateByName?deviceId=a%20b');
    assert.equal(received.method, 'POST');
    assert.equal(received.body, body);
    assert.deepEqual({...received.headers}, {Authorization: 'synthetic-emby-auth', 'X-Emby-Token': 'synthetic-emby-token'});
    assert.equal(result, response);
    assert.equal(result.status, 401, 'Emby denial cannot become authenticated success');
    bridge.close();
});

test('Range and partial response byte objects stay unchanged; requests are never replayed', async () => {
    let calls = 0;
    const payload = Buffer.from('4567');
    const response = {status: 206, headers: {'Content-Range': 'bytes 4-7/10'}, body: payload};
    const bridge = createMockBridge({activateMock: true, upstream: async request => {
        calls++;
        assert.deepEqual({...request.headers}, {Range: 'bytes=4-7', 'If-Range': 'synthetic-etag'});
        return response;
    }});
    assert.equal(await bridge.forward({...valid, headers: {Range: 'bytes=4-7', 'If-Range': 'synthetic-etag'}}), response);
    assert.equal(calls, 1);
    bridge.close();
});

test('mapping rejects prefix collisions, absolute URLs, traversal and encoded delimiters before forwarding', async () => {
    let calls = 0;
    const bridge = createMockBridge({activateMock: true, upstream: async () => { calls++; }});
    for (const outside of [prefix + '-other/emby', '/emby', 'https://other.test' + prefix]) {
        await assert.rejects(bridge.forward({...valid, path: outside}), expected('OUTSIDE_MAPPING'));
    }
    for (const suffix of ['/../admin', '/%2e%2e/admin', '/%252e%252e/admin', '/%2Fadmin', '/%5cadmin', '/%00',
        '/%0D', '/a//b', '/a#fragment', '/a\r\nHost: bad', '/%ZZ', '/%3Ftoken']) {
        await assert.rejects(bridge.forward({...valid, path: prefix + suffix}), expected('INVALID_PATH'));
    }
    assert.equal(calls, 0);
    bridge.close();
});

test('header injection, unknown methods and WebSocket upgrade remain unsupported', async () => {
    const bridge = createMockBridge({activateMock: true, upstream: async () => assert.fail('upstream must not run')});
    await assert.rejects(bridge.forward({...valid, headers: {Authorization: 'x\r\ny'}}), expected('INVALID_HEADERS'));
    await assert.rejects(bridge.forward({...valid, method: 'CONNECT'}), expected('METHOD_UNSUPPORTED'));
    assert.throws(() => bridge.upgrade(), expected('WEBSOCKET_NOT_IMPLEMENTED'));
    bridge.close();
});

for (const action of ['cancel', 'close']) {
    test('pending response after ' + action + ' cannot commit, while another bridge stays usable', async () => {
        const gate = deferred();
        const controller = new AbortController();
        let upstreamSignal;
        const bridge = createMockBridge({activateMock: true, upstream: (request, {signal}) => {
            upstreamSignal = signal; return gate.promise;
        }});
        const other = createMockBridge({activateMock: true, upstream: async () => ({status: 200})});
        const pending = bridge.forward(valid, {signal: controller.signal});
        if (action === 'cancel') controller.abort(); else bridge.close();
        assert.equal(upstreamSignal.aborted, true);
        gate.resolve({status: 200});
        await assert.rejects(pending, expected(action === 'cancel' ? 'REQUEST_ABORTED' : 'BRIDGE_CLOSED'));
        assert.equal((await other.forward(valid)).status, 200);
        bridge.close(); other.close();
    });
}

test('upstream failures remain fixed errors without exposing secrets or retrying', async () => {
    let calls = 0;
    const bridge = createMockBridge({activateMock: true, upstream: () => { calls++; throw new Error('synthetic-private-marker'); }});
    await assert.rejects(bridge.forward(valid), expected('MOCK_UPSTREAM_FAILED'));
    assert.equal(calls, 1);
    bridge.close();
    await assert.rejects(bridge.forward(valid), expected('BRIDGE_CLOSED'));
});

test('review package is reproducible, binds every entry and retains unresolved deployment gates', () => {
    const one = prepareReview();
    assert.deepEqual(one, prepareReview());
    assert.equal(one.artifactType, 'NON_INSTALLABLE_MOCK_REVIEW');
    assert.equal(one.productionReady, false);
    assert.equal(one.credentialStorage, false);
    assert.equal(one.containsThirdPartyImplementation, false);
    for (const entry of one.entries) {
        assert.equal(entry.sha256, crypto.createHash('sha256').update(entry.content).digest('hex'));
    }
    const files = new Map(one.entries.map(entry => [entry.path, entry.content]));
    assert.ok(files.get('fpk-templates/ui-config.json.in').includes('{{REVIEWED_GATEWAY_ACCESS_POLICY}}'));
    assert.ok(files.get('fpk-templates/main.sh.in').endsWith('exit 78\n'));
    assert.equal(JSON.parse(files.get('config.mock.json')).enabled, false);
    assert.equal(JSON.parse(files.get('config.mock.json')).upstream.role, 'dian115-emby-proxy');
    assert.equal(JSON.parse(files.get('config.mock.json')).responsePolicy.directEmbyFallback, false);
    assert.equal(files.has('manifest'), false);
    assert.throws(() => prepareReview({target: 'fpk'}), /INSTALLABLE_PACKAGE_NOT_AVAILABLE/);
});

test('review CLI emits JSON only and refuses install/build arguments', () => {
    const file = path.resolve(__dirname, '../prototypes/fn-connect/companion/prepare-review.cjs');
    const result = cp.spawnSync(process.execPath, [file], {encoding: 'utf8'});
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).productionReady, false);
    const denied = cp.spawnSync(process.execPath, [file, '--target', 'fpk'], {encoding: 'utf8'});
    assert.equal(denied.status, 1);
    assert.equal(denied.stdout, '');
    assert.equal(denied.stderr, 'MOCK_REVIEW_ONLY\n');
});
