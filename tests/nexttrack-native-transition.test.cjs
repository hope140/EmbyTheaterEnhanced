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

function makeFakeClock() {
    let now = 0;
    let nextId = 1;
    const timers = new Map();
    return {
        setTimeout(callback, delay) {
            const id = nextId++;
            timers.set(id, {at: now + delay, callback});
            return id;
        },
        clearTimeout(id) { timers.delete(id); },
        advance(milliseconds) {
            const target = now + milliseconds;
            while (true) {
                let next = null;
                for (const [id, timer] of timers) {
                    if (timer.at <= target && (!next || timer.at < next.timer.at)) next = {id, timer};
                }
                if (!next) break;
                now = next.timer.at;
                timers.delete(next.id);
                next.timer.callback();
            }
            now = target;
        },
        get pendingCount() { return timers.size; }
    };
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

function makeHarness(clock) {
    const endpoints = [];
    const options = {getEndpoint() { return endpoints.shift() || null; }};
    if (clock) {
        options.setTimeout = clock.setTimeout;
        options.clearTimeout = clock.clearTimeout;
    }
    const transition = transitionModule.createNative(options);
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

test('replacement reuses the matching local request token without preparing twice', async function () {
    const clock = makeFakeClock();
    const harness = makeHarness(clock);
    const endpoint = harness.addEndpoint();
    const token = harness.transition.show();
    harness.transition.markLoading(token, 101);

    harness.transition.replacement(101);
    assert.equal(harness.transition.isActive(), true);
    assert.deepEqual(endpoint.prepareCalls, [], 'replacement does not start a second preparation');
    assert.equal(clock.pendingCount, 1, 'the existing token keeps its single deadline');

    const stop = harness.transition.beforeTeardown();
    await flushMicrotasks();
    assert.deepEqual(endpoint.prepareCalls, [token]);
    endpoint.preparations.get(token).resolve({ready:true});
    assert.equal(await stop, token);
    assert.equal(harness.transition.loadingToken(101), token);
    assert.equal(clock.pendingCount, 1);
});

test('replacement creates a remote request token and exposes it only after prepare succeeds', async function () {
    const clock = makeFakeClock();
    const harness = makeHarness(clock);
    const endpoint = harness.addEndpoint();
    harness.transition.replacement(102);

    assert.equal(harness.transition.isActive(), true);
    assert.equal(harness.transition.loadingToken(102), null);
    const stop = harness.transition.beforeTeardown();
    await flushMicrotasks();
    assert.deepEqual(endpoint.prepareCalls, [1]);
    assert.equal(harness.transition.loadingToken(102), null);

    endpoint.preparations.get(1).resolve({ready:true});
    assert.equal(await stop, 1);
    assert.equal(harness.transition.loadingToken(102), 1);
});

test('prepared but unarmed presentation is released at its own 15 second deadline', async function () {
    const clock = makeFakeClock();
    const harness = makeHarness(clock);
    const endpoint = harness.addEndpoint();
    const token = harness.transition.show();
    harness.transition.markLoading(token, 103);
    const stop = harness.transition.beforeTeardown();
    await flushMicrotasks();
    endpoint.preparations.get(token).resolve({ready:true});
    assert.equal(await stop, token);
    assert.equal(harness.transition.loadingToken(103), token);

    clock.advance(14999);
    assert.equal(harness.transition.isActive(), true);
    assert.deepEqual(endpoint.cancelCalls, []);
    clock.advance(1);
    assert.equal(harness.transition.isActive(), false);
    assert.deepEqual(endpoint.cancelCalls, [token]);
    assert.equal(clock.pendingCount, 0);
});

test('deadline bounds a deferred prepare and a late success cannot revive its token', async function () {
    const clock = makeFakeClock();
    const harness = makeHarness(clock);
    const {endpoint, token, stopping, pending} = await beginPending(harness);
    harness.transition.markLoading(token, 104);

    clock.advance(15000);
    assert.equal(harness.transition.isActive(), false);
    assert.equal(harness.transition.loadingToken(104), null);
    assert.deepEqual(endpoint.cancelCalls, [token]);
    assert.equal(clock.pendingCount, 0);

    pending.resolve({ready:true});
    assert.equal(await stopping, null);
    assert.equal(harness.transition.isActive(), false);
    assert.equal(harness.transition.loadingToken(104), null);
    assert.deepEqual(endpoint.cancelCalls, [token], 'late success cannot release twice');
});

test('older A and B deadlines release only their own tokens after C becomes active', async function () {
    const clock = makeFakeClock();
    const harness = makeHarness(clock);
    const a = harness.addEndpoint();
    const tokenA = harness.transition.show();
    clock.advance(1000);
    const b = harness.addEndpoint();
    const tokenB = harness.transition.show();
    clock.advance(1000);
    const c = harness.addEndpoint();
    const tokenC = harness.transition.show();

    clock.advance(14000); // A and then B reach their own deadlines; C is still within its lease.
    assert.equal(harness.transition.isActive(), true);
    assert.deepEqual(a.cancelCalls, [tokenA]);
    assert.deepEqual(b.cancelCalls, [tokenB]);
    assert.deepEqual(c.cancelCalls, []);
    assert.equal(clock.pendingCount, 1);

    clock.advance(1000);
    assert.equal(harness.transition.isActive(), false);
    assert.deepEqual(c.cancelCalls, [tokenC]);
    assert.equal(clock.pendingCount, 0);
});

test('playbackReady clears the deadline and transfers the token without cancelling it', async function () {
    const clock = makeFakeClock();
    const harness = makeHarness(clock);
    const endpoint = harness.addEndpoint();
    const token = harness.transition.show();
    harness.transition.markLoading(token, 105);
    const stop = harness.transition.beforeTeardown();
    await flushMicrotasks();
    endpoint.preparations.get(token).resolve({ready:true});
    assert.equal(await stop, token);

    harness.transition.playbackReady(105);
    assert.equal(harness.transition.isActive(), false);
    assert.equal(clock.pendingCount, 0);
    clock.advance(15000);
    assert.deepEqual(endpoint.cancelCalls, [], 'native owns the transferred presentation token');
});

test('unavailable prepare and rejected prepare leave no live deadline', async function () {
    const unavailableClock = makeFakeClock();
    const unavailable = transitionModule.createNative({
        getEndpoint() { return null; },
        setTimeout:unavailableClock.setTimeout,
        clearTimeout:unavailableClock.clearTimeout
    });
    assert.equal(unavailable.show(), null);
    assert.equal(unavailableClock.pendingCount, 0);

    const clock = makeFakeClock();
    const harness = makeHarness(clock);
    const {endpoint, token, stopping, pending} = await beginPending(harness);
    assert.equal(clock.pendingCount, 1);
    pending.reject(new Error('prepare rejected'));
    assert.equal(await stopping, null);
    assert.equal(harness.transition.isActive(), false);
    assert.deepEqual(endpoint.cancelCalls, [token]);
    assert.equal(clock.pendingCount, 0);
});

test('terminal cancel clears all outstanding deadlines', function () {
    const clock = makeFakeClock();
    const harness = makeHarness(clock);
    const endpointA = harness.addEndpoint();
    const tokenA = harness.transition.show();
    const endpointB = harness.addEndpoint();
    const tokenB = harness.transition.show();

    assert.equal(clock.pendingCount, 2);
    harness.transition.cancel();
    assert.equal(harness.transition.isActive(), false);
    assert.equal(clock.pendingCount, 0);
    assert.deepEqual(endpointA.cancelCalls, [tokenA]);
    assert.deepEqual(endpointB.cancelCalls, [tokenB]);
    assert.deepEqual(harness.transition.loadingToken(106), null);
});
