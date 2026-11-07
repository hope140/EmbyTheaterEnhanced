'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {PassThrough} = require('node:stream');
const http = require('node:http');
const {createBridge} = require('../src/electronapp/enhanced/fn-connect/core/bridge.cjs');
const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve};};
for (const failed of [false, true]) test('real Native bridge revoke waits for owned response drain and retains failure: ' + failed, {timeout: 3000}, async t => {
    const gate = deferred(), entered = deferred(), body = new PassThrough(); let drained = false;
    const bridge = await createBridge({assertReady: () => ({generation: 1}), onState: () => () => {},
        request: async (_id, input) => {
            input.signal.addEventListener('abort', () => body.destroy(), {once: true});
            entered.resolve();
            return {statusCode: 200, headers: {'content-type': 'video/mp4'}, body,
                dispose() {body.destroy();}, async drain() {await gate.promise; drained = true; if (failed) throw Error('synthetic-drain-failure');}};
        }}, {enabled: true});
    t.after(() => bridge.close()); t.after(() => {gate.resolve(); body.destroy();});
    const lease = bridge.lease('synthetic', {path: '/media'});
    const request = http.get(lease.url); request.on('error', () => {}); t.after(() => request.destroy());
    await entered.promise; await new Promise(resolve => setImmediate(resolve));
    let settled = false;
    const retiring = lease.revoke(); retiring.then(() => {settled = true;}, () => {settled = true;});
    assert.equal(lease.revoke(), retiring);
    await new Promise(resolve => setImmediate(resolve)); assert.equal(settled, false); assert.equal(drained, false);
    const gone = await fetch(lease.url); assert.equal(gone.status, 410); await gone.text();
    gate.resolve();
    if (failed) await assert.rejects(retiring, e => e.code === 'ANONYMOUS_MEDIA_CLOSE_UNCONFIRMED'); else await retiring;
    assert.equal(drained, true); assert.equal(lease.revoke(), retiring);
});
