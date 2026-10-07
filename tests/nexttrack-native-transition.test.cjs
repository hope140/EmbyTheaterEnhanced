'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const transitionModule = require('../src/electronapp/enhanced/nexttrack-transition.js');

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return {promise,resolve,reject};
}

async function flushMicrotasks() {
    await Promise.resolve();
    await Promise.resolve();
}

function makeEndpoint() {
    const endpoint = {
        prepareCalls:[],
        cancelCalls:[],
        preparations:new Map(),
        preparePresentation(token) {
            this.prepareCalls.push(token);
            const pending = deferred();
            this.preparations.set(token, pending);
            return pending.promise;
        },
        cancelPresentation(token) {
            this.cancelCalls.push(token);
            return Promise.resolve({cancelled:true});
        }
    };
    return endpoint;
}

function makeHarness() {
    const endpoints = [];
    const transition = transitionModule.createNative({
        getEndpoint() { return endpoints.shift() || null; }
    });
    return {
        transition,
        addEndpoint() {
            const endpoint = makeEndpoint();
            endpoints.push(endpoint);
            return endpoint;
        }
    };
}

async function beginPending(harness) {
    const endpoint = harness.addEndpoint();
    const token = harness.transition.show();
    const stopping = harness.transition.beforeTeardown();
    await flushMicrotasks();
    assert.deepEqual(endpoint.prepareCalls, [token]);
    return {endpoint,token,stopping,pending:endpoint.preparations.get(token)};
}

test('native show uses no DOM and each deferred beforeTeardown stays bound to its own record', async function () {
    const endpointA = makeEndpoint();
    let endpoint = endpointA;
    const options = {getEndpoint() { return endpoint; }};
    Object.defineProperty(options, 'document', {get() { throw new Error('native transition must not access DOM'); }});
    const transition = transitionModule.createNative(options);
    const tokenA = transition.show();
    const stopA = transition.beforeTeardown();
    await flushMicrotasks();
    const prepA = endpointA.preparations.get(tokenA);

    const endpointB = makeEndpoint();
    endpoint = endpointB;
    const tokenB = transition.show();
    const stopB = transition.beforeTeardown();
    await flushMicrotasks();
    const prepB = endpointB.preparations.get(tokenB);

    assert.notEqual(tokenA, tokenB);
    assert.deepEqual(endpointA.cancelCalls, [], 'show/acquire must not cancel the old hold');
    assert.deepEqual(endpointB.prepareCalls, [tokenB]);

    prepB.resolve({ready:true});
    assert.equal(await stopB, tokenB);
    assert.deepEqual(endpointA.cancelCalls, [tokenA], 'successful B preparation releases only the old A token');
    assert.deepEqual(endpointB.cancelCalls, [], 'B owns its own endpoint and remains prepared');
    prepA.resolve({ready:true});
    assert.equal(await stopA, null, 'late A success cannot be returned as B token or keep A acquired');
    assert.equal(transition.isActive(), true, 'late A settle cannot clear active B');
    assert.deepEqual(endpointB.cancelCalls, []);
});

test('B acquisition cancels only the superseded A token after B prepares successfully', async function () {
    const harness = makeHarness();
    const a = await beginPending(harness);
    const endpointA = a.endpoint;
    const endpointB = harness.addEndpoint();
    const tokenB = harness.transition.show();
    const stopB = harness.transition.beforeTeardown();
    await flushMicrotasks();

    assert.deepEqual(endpointA.cancelCalls, [], 'A remains held while B is acquiring');
    assert.deepEqual(endpointB.prepareCalls, [tokenB]);
    endpointB.preparations.get(tokenB).resolve({ready:true});
    assert.equal(await stopB, tokenB);
    assert.deepEqual(endpointA.cancelCalls, [a.token]);
    assert.deepEqual(endpointB.cancelCalls, []);

    a.pending.reject(new Error('late A prepare failure'));
    assert.equal(await a.stopping, null);
    assert.equal(harness.transition.isActive(), true);
    assert.deepEqual(endpointB.cancelCalls, [], 'late failure from A cannot cancel B');
});

test('late A success cannot clear or cancel B after B has acquired its presentation hold', async function () {
    const harness = makeHarness();
    const a = await beginPending(harness);
    const endpointB = harness.addEndpoint();
    const tokenB = harness.transition.show();
    const stopB = harness.transition.beforeTeardown();
    await flushMicrotasks();
    endpointB.preparations.get(tokenB).resolve({ready:true});
    assert.equal(await stopB, tokenB);

    a.pending.resolve({ready:true});
    assert.equal(await a.stopping, null);
    assert.equal(harness.transition.isActive(), true);
    assert.deepEqual(endpointB.cancelCalls, []);
    assert.deepEqual(a.endpoint.cancelCalls, [a.token]);
});

test('current prepare rejection releases its own record and any older deferred hold', async function () {
    const harness = makeHarness();
    const a = await beginPending(harness);
    const b = await beginPending(harness);

    b.pending.reject(new Error('current prepare failed'));
    assert.equal(await b.stopping, null);
    a.pending.resolve({ready:true});
    assert.equal(await a.stopping, null);
    assert.equal(harness.transition.isActive(), false);
    assert.deepEqual(b.endpoint.cancelCalls, [b.token]);
    assert.deepEqual(a.endpoint.cancelCalls, [a.token]);
});

for (const scenario of [
    ['manager playback failure', function (transition, token) { transition.markLoading(token, 73); transition.playbackFailed(73); }],
    ['manager fail callback', function (transition, token) { transition.fail(token); }],
    ['settled request', function (transition, token) { transition.settled(token); }],
    ['invalid request id', function (transition, token) { transition.markLoading(token, 0); }]
]) {
    test(scenario[0] + ' releases the current record and older deferred holds', async function () {
        const harness = makeHarness();
        const a = await beginPending(harness);
        const b = await beginPending(harness);

        scenario[1](harness.transition, b.token);
        assert.equal(harness.transition.isActive(), false);
        assert.deepEqual(b.endpoint.cancelCalls, [b.token]);
        assert.deepEqual(a.endpoint.cancelCalls, [a.token]);
        b.pending.resolve({ready:true});
        a.pending.resolve({ready:true});
        assert.equal(await b.stopping, null);
        assert.equal(await a.stopping, null);
        assert.deepEqual(b.endpoint.cancelCalls, [b.token], 'late B settle cannot double cancel');
        assert.deepEqual(a.endpoint.cancelCalls, [a.token], 'late A settle cannot double cancel');
    });
}

test('user stop cancel releases every retained record even while preparation is deferred', async function () {
    const harness = makeHarness();
    const a = await beginPending(harness);
    const b = await beginPending(harness);

    harness.transition.cancel();
    assert.equal(harness.transition.isActive(), false);
    assert.deepEqual(a.endpoint.cancelCalls, [a.token]);
    assert.deepEqual(b.endpoint.cancelCalls, [b.token]);
    a.pending.resolve({ready:true});
    b.pending.resolve({ready:true});
    assert.equal(await a.stopping, null);
    assert.equal(await b.stopping, null);
    assert.deepEqual(a.endpoint.cancelCalls, [a.token]);
    assert.deepEqual(b.endpoint.cancelCalls, [b.token]);
});

test('loadingToken requires matching request id and successful prepare; playbackReady leaves reveal to native', async function () {
    const harness = makeHarness();
    const endpoint = harness.addEndpoint();
    const token = harness.transition.show();
    harness.transition.markLoading(token, 91);
    const stop = harness.transition.beforeTeardown();
    await flushMicrotasks();

    assert.equal(harness.transition.loadingToken(91), null, 'a matching request is insufficient before prepare succeeds');
    assert.equal(harness.transition.loadingToken(90), null, 'a different request never receives this token');
    endpoint.preparations.get(token).resolve({ready:true});
    assert.equal(await stop, token);
    assert.equal(harness.transition.loadingToken(90), null);
    assert.equal(harness.transition.loadingToken(91), token);

    harness.transition.playbackReady(90);
    assert.equal(harness.transition.isActive(), true, 'stale playbackReady does not consume the active record');
    harness.transition.playbackReady(91);
    assert.equal(harness.transition.isActive(), false);
    assert.equal(harness.transition.loadingToken(91), null);
    assert.deepEqual(endpoint.cancelCalls, [], 'playbackReady transfers reveal to native without manual cancellation');
});

test('loadingToken stays unavailable when prepare resolves not ready', async function () {
    const harness = makeHarness();
    const endpoint = harness.addEndpoint();
    const token = harness.transition.show();
    harness.transition.markLoading(token, 92);
    const stop = harness.transition.beforeTeardown();
    await flushMicrotasks();
    endpoint.preparations.get(token).resolve({ready:false});
    assert.equal(await stop, null);
    assert.equal(harness.transition.loadingToken(92), null);
});
