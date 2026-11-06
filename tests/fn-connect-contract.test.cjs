'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {createTransport} = require('../prototypes/fn-connect/transport-contract.cjs');

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return {promise, resolve, reject};
}

function fixture(overrides = {}) {
    const state = {time: 10, opened: [], requests: [], closes: 0};
    const lease = {
        expiresAt: 100,
        capabilities: {http: true, range: true, websocket: true},
        async exchange(kind, message, options) {
            state.requests.push({kind, message, ...options});
            return message;
        },
        async close() { state.closes++; },
        ...overrides
    };
    const transport = createTransport({mode: 'mock', now: () => state.time,
        provider: {async open(options) { state.opened.push(options); return lease; }}});
    return {state, lease, transport};
}

const code = expected => error => {
    assert.equal(error.code, expected);
    assert.equal(error.message, expected);
    return true;
};

test('default is disabled even when a provider is supplied', async () => {
    let opens = 0;
    const transport = createTransport({provider: {open() { opens++; }}});
    await assert.rejects(transport.connect({deviceRef: 'synthetic-device'}), code('TRANSPORT_DISABLED'));
    assert.equal(opens, 0);
});

test('production mode and a missing provider cannot imply a working protocol', async () => {
    assert.throws(() => createTransport({mode: 'production'}), code('PROTOCOL_UNAVAILABLE'));
    await assert.rejects(createTransport({mode: 'mock'}).connect({deviceRef: 'device'}), code('PROTOCOL_UNAVAILABLE'));
});

test('open receives device reference and signal only; Emby identity stays with caller', async () => {
    const {transport, state} = fixture();
    const connection = await transport.connect({deviceRef: 'opaque-device',
        embyUser: 'synthetic-user', embyToken: 'synthetic-marker'});
    assert.deepEqual(Object.keys(state.opened[0]).sort(), ['deviceRef', 'signal']);
    assert.equal(state.opened[0].deviceRef, 'opaque-device');
    await connection.close();
});

test('invalid device reference and already canceled open do no provider work', async () => {
    const {transport, state} = fixture();
    await assert.rejects(transport.connect({deviceRef: ''}), code('INVALID_DEVICE_REF'));
    await assert.rejects(transport.connect({deviceRef: 'device', signal: AbortSignal.abort()}), code('CONNECTION_ABORTED'));
    assert.equal(state.opened.length, 0);
});

test('unknown or denied capabilities fail closed without exchanging data', async () => {
    const {transport, state} = fixture({capabilities: {http: true, range: false, websocket: 'yes'}});
    const connection = await transport.connect({deviceRef: 'device'});
    assert.deepEqual(connection.capabilities, {http: true, range: false, websocket: 'unknown'});
    for (const kind of ['range', 'websocket', 'renew']) {
        await assert.rejects(connection.exchange(kind, {}), code('CAPABILITY_UNVERIFIED'));
    }
    assert.equal(state.requests.length, 0);
    await connection.close();
});

test('Range/206, content range, bytes and 416 are opaque and unchanged', async () => {
    const bytes = Buffer.from('0123456789');
    const responses = [];
    const requests = [];
    const {transport} = fixture({async exchange(kind, message) {
        assert.equal(kind, 'range');
        requests.push(message);
        const response = message.headers.Range === 'bytes=4-7'
            ? {status: 206, headers: {'Content-Range': 'bytes 4-7/10', 'Accept-Ranges': 'bytes'}, body: bytes.subarray(4, 8)}
            : {status: 416, headers: {'Content-Range': 'bytes */10'}, body: Buffer.alloc(0)};
        responses.push(response);
        return response;
    }});
    const connection = await transport.connect({deviceRef: 'device'});
    const request = {method: 'GET', path: '/synthetic-media', headers: {Range: 'bytes=4-7', 'If-Range': 'synthetic-etag'}};
    const partial = await connection.exchange('range', request);
    assert.equal(requests[0], request);
    assert.equal(partial, responses[0]);
    assert.equal(partial.status, 206);
    assert.equal(partial.body.toString(), '4567');
    const invalid = await connection.exchange('range', {headers: {Range: 'bytes=99-100'}});
    assert.equal(invalid, responses[1]);
    assert.equal(invalid.status, 416);
    await connection.close();
});

test('transcode/subtitle messages and WebSocket frame objects pass through without replay', async () => {
    const {transport, state} = fixture();
    const connection = await transport.connect({deviceRef: 'device'});
    const transcode = {method: 'POST', path: '/synthetic-transcode', body: {playSession: 'caller-owned'}};
    const subtitle = {method: 'GET', path: '/synthetic-subtitle.vtt'};
    const frame = {type: 'message', data: Buffer.from('synthetic-frame')};
    assert.equal(await connection.exchange('http', transcode), transcode);
    assert.equal(await connection.exchange('http', subtitle), subtitle);
    assert.equal(await connection.exchange('websocket', frame), frame);
    assert.equal(state.requests.length, 3);
    await connection.close();
});

test('concurrent connections keep independent invalidation and provider signals', async () => {
    const opens = [];
    const closes = [];
    const transport = createTransport({mode: 'mock', now: () => 0, provider: {async open(options) {
        opens.push(options);
        return {expiresAt: 100, capabilities: {http: true},
            async exchange(kind, message) { return message; },
            close() { closes.push(options.deviceRef); }};
    }}});
    const [first, second] = await Promise.all([
        transport.connect({deviceRef: 'first-device'}), transport.connect({deviceRef: 'other-device'})]);
    await first.invalidate();
    assert.equal(opens[0].signal.aborted, true);
    assert.equal(opens[1].signal.aborted, false);
    assert.deepEqual(closes, ['first-device']);
    await assert.rejects(first.exchange('http', {}), code('CONNECTION_CLOSED'));
    const message = {body: 'independent'};
    assert.equal(await second.exchange('http', message), message);
    await second.close();
});

test('expiry at the absolute boundary closes once and blocks subsequent work', async () => {
    const {transport, state} = fixture();
    const connection = await transport.connect({deviceRef: 'device'});
    state.time = 100;
    await assert.rejects(connection.exchange('http', {}), code('LEASE_EXPIRED'));
    await connection.close();
    await connection.close();
    assert.equal(state.closes, 1);
    assert.equal(state.requests.length, 0);
});

test('canceling one request leaves the connection and a concurrent request usable', async () => {
    const gates = [deferred(), deferred()];
    const signals = [];
    const {transport} = fixture({exchange(kind, message, {signal}) {
        signals.push(signal);
        return gates[signals.length - 1].promise;
    }});
    const connection = await transport.connect({deviceRef: 'device'});
    await assert.rejects(connection.exchange('http', {}, {signal: AbortSignal.abort()}), code('REQUEST_ABORTED'));
    assert.equal(signals.length, 0);
    const controller = new AbortController();
    const canceled = connection.exchange('http', {}, {signal: controller.signal});
    const active = connection.exchange('http', {});
    controller.abort();
    assert.equal(signals[0].aborted, true);
    assert.equal(signals[1].aborted, false);
    gates[0].resolve('late');
    gates[1].resolve('active');
    await assert.rejects(canceled, code('REQUEST_ABORTED'));
    assert.equal(await active, 'active');
    await connection.close();
});

test('missing, invalid and already expired leases never become usable', async () => {
    for (const expiresAt of [undefined, NaN, Infinity, 10]) {
        const {transport, state} = fixture({expiresAt});
        await assert.rejects(transport.connect({deviceRef: 'device'}), code(expiresAt === 10 ? 'LEASE_EXPIRED' : 'UNVERIFIED_LEASE'));
        assert.equal(state.closes, 1);
    }
    const transport = createTransport({mode: 'mock', provider: {async open() { return {}; }}});
    await assert.rejects(transport.connect({deviceRef: 'device'}), code('INVALID_LEASE'));
});

test('canceled open closes a late lease and cannot publish it', async () => {
    const gate = deferred();
    const controller = new AbortController();
    let closes = 0;
    let providerSignal;
    const transport = createTransport({mode: 'mock', provider: {open({signal}) {
        providerSignal = signal;
        return gate.promise;
    }}});
    const pending = transport.connect({deviceRef: 'device', signal: controller.signal});
    controller.abort();
    assert.equal(providerSignal.aborted, true);
    gate.resolve({close() { closes++; }});
    await assert.rejects(pending, code('CONNECTION_ABORTED'));
    assert.equal(closes, 1);
});

for (const reason of ['request-abort', 'connection-close', 'expiry']) {
    test('pending exchange rejects stale success after ' + reason, async () => {
        const gate = deferred();
        let requestSignal;
        const {transport, state} = fixture({exchange(kind, message, {signal}) {
            requestSignal = signal;
            return gate.promise;
        }});
        const connection = await transport.connect({deviceRef: 'device'});
        const controller = new AbortController();
        const pending = connection.exchange('http', {}, {signal: controller.signal});
        if (reason === 'request-abort') controller.abort();
        if (reason === 'connection-close') await connection.close();
        if (reason === 'expiry') state.time = 100;
        gate.resolve({status: 200});
        await assert.rejects(pending, code(reason === 'request-abort' ? 'REQUEST_ABORTED' :
            reason === 'expiry' ? 'LEASE_EXPIRED' : 'CONNECTION_CLOSED'));
        assert.equal(requestSignal.aborted, true);
        await connection.close();
    });
}

test('provider faults expose fixed errors, do not replay, and close failures remain observable', async () => {
    let attempts = 0;
    const {transport} = fixture({exchange() { attempts++; throw new Error('synthetic-private-marker'); },
        close() { throw new Error('synthetic-private-marker'); }});
    const connection = await transport.connect({deviceRef: 'device'});
    await assert.rejects(connection.exchange('http', {}), code('EXCHANGE_FAILED'));
    assert.equal(attempts, 1);
    await assert.rejects(connection.close(), code('CLOSE_FAILED'));
    await assert.rejects(connection.close(), code('CLOSE_FAILED'));
    const unavailable = createTransport({mode: 'mock', provider: {open() { throw new Error('synthetic-private-marker'); }}});
    await assert.rejects(unavailable.connect({deviceRef: 'device'}), code('OPEN_FAILED'));
});
