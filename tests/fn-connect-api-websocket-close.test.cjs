'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const {Duplex} = require('node:stream');
const {once} = require('node:events');
const {createApiBridge} = require('../src/electronapp/enhanced/fn-connect/api-bridge.cjs');
const policy = require('../src/electronapp/enhanced/fn-connect/core/policy.cjs');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };

for (const late of [true, false]) test('API WebSocket FIN retires ' + (late ? 'a late upgrade' : 'an established upstream'), {timeout: 3000}, async t => {
    const pending = deferred(), called = deferred(); let signal;
    const upstream = new Duplex({read() {}, write(_chunk, _encoding, done) { done(); }});
    const response = {headers: {'sec-websocket-accept': 's3pPLMBiTxaQ9kYGzzhZRbK+xOo='}, socket: upstream};
    const bridge = await createApiBridge({webSocket: async (_id, input) => {
        signal = input.signal; called.resolve(); return late ? pending.promise : response;
    }}, {id: 'synthetic-profile', mode: 'fixture', authorize: () => true,
        config: policy.config({bootstrapUrl: 'http://127.0.0.1:1/', embyUrl: 'http://127.0.0.1:2/'}, 'fixture')});
    t.after(() => bridge.close()); t.after(() => upstream.destroy());
    const url = new URL(bridge.base), client = net.connect(Number(url.port), url.hostname);
    client.on('error', () => {}); t.after(() => client.destroy()); await once(client, 'connect');
    const received = new Promise(resolve => client.once('data', resolve));
    client.write('GET ' + url.pathname + 'ws HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n');
    await called.promise;
    if (!late) assert.match((await received).toString(), /^HTTP\/1.1 101/);
    const closed = once(client, 'close'); client.end(); await closed;
    assert.equal(signal.aborted, true);
    if (late) pending.resolve(response);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(upstream.destroyed, true);
});
