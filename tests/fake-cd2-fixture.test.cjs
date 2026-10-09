'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createFakeCd2Fixture} = require('./fake-cd2-fixture.cjs');

const LOOPBACK = 'http://127.0.0.1:32123/fixture.y4m';
const requestId = n => 'play-' + n + '-1';

function fakeClock() {
    let now = 0;
    let nextId = 0;
    const timers = new Map();
    return {
        now: () => now,
        setTimeout(callback, delay) {
            const id = ++nextId;
            timers.set(id, {id, at: now + delay, callback});
            return id;
        },
        clearTimeout(id) { timers.delete(id); },
        get pendingTimers() { return timers.size; },
        async advance(milliseconds) {
            const end = now + milliseconds;
            for (;;) {
                const next = Array.from(timers.values()).filter(timer => timer.at <= end)
                    .sort((a, b) => a.at - b.at || a.id - b.id)[0];
                if (!next) break;
                now = next.at;
                timers.delete(next.id);
                next.callback();
                await Promise.resolve();
                await Promise.resolve();
            }
            now = end;
            await Promise.resolve();
            await Promise.resolve();
        }
    };
}

function create(options = {}, clock = fakeClock()) {
    return {clock, fixture: createFakeCd2Fixture({getSource: () => LOOPBACK, now: clock.now,
        setTimeout: clock.setTimeout.bind(clock), clearTimeout: clock.clearTimeout.bind(clock), ...options})};
}
async function rejection(promise, code) {
    await assert.rejects(promise, error => error instanceof Error && error.message === code && error.code === code);
}

test('delay 0, 400 and 800 completes exactly once with each legacy mode response', async () => {
    for (const delayMs of [0, 400, 800]) {
        for (const mode of ['hit', 'direct', 'miss']) {
            const {clock, fixture} = create({delayMs, mode});
            let settled = false;
            const result = fixture.service.resolve({requestId: requestId(1), candidates: ['candidate-secret']})
                .then(value => { settled = true; return value; });
            await Promise.resolve();
            assert.equal(settled, false);
            if (delayMs > 0) {
                await clock.advance(delayMs - 1);
                assert.equal(settled, false);
                await clock.advance(1);
            } else {
                await clock.advance(0);
            }
            const value = await result;
            if (mode === 'hit') assert.deepEqual(value, {status: 'hit', type: 'url', source: LOOPBACK + '?cd2=' + requestId(1)});
            if (mode === 'direct') assert.deepEqual(value, {status: 'hit', type: 'url', sourceKind: 'direct-url', reason: 'direct_hit',
                source: LOOPBACK + '?cd2=' + requestId(1), requestOptions: {userAgent: 'ETE-Direct-' + requestId(1)}});
            if (mode === 'miss') assert.deepEqual(value, {status: 'miss', reason: 'unavailable'});
            assert.deepEqual(fixture.snapshot(), {
                resolveCount: 1, cancelCount: 0, completedCount: 1, activeCount: 0, gateWaiterCount: 0,
                requests: [{requestId: requestId(1), sequence: 1, armId: null, status: 'completed', enteredAtMs: 0, finishedAtMs: delayMs}],
                events: [
                    {event: 'resolve-entered', atMs: 0, sequence: 1, requestId: requestId(1), armId: null, label: null},
                    {event: 'resolve-completed', atMs: delayMs, sequence: 1, requestId: requestId(1), armId: null, label: null}
                ]
            });
            fixture.dispose();
            assert.equal(clock.pendingTimers, 0);
        }
    }
});

test('wait-pending can be registered before resolve; held requests ignore delay until release', async () => {
    const {clock, fixture} = create({mode: 'hit', delayMs: 400});
    const {armId} = await fixture.control({action: 'arm-next', label: 'rapid-next'});
    const pendingGate = fixture.control({action: 'wait-pending', armId});
    const resolvePromise = fixture.service.resolve({requestId: requestId(1), candidates: ['unused']});
    assert.deepEqual(await pendingGate, {requestId: requestId(1), pending: true, held: true, armId});
    await clock.advance(800);
    assert.equal(fixture.snapshot().activeCount, 1);
    assert.equal(fixture.snapshot().completedCount, 0);
    assert.equal(fixture.snapshot().requests[0].status, 'held');
    assert.deepEqual(await fixture.control({action: 'release', armId}), {requestId: requestId(1), released: true, armId});
    assert.equal((await resolvePromise).status, 'hit');
    assert.equal(fixture.snapshot().completedCount, 1);
    assert.equal(fixture.snapshot().activeCount, 0);
    fixture.dispose();
    assert.equal(clock.pendingTimers, 0);
});

test('wait-pending also returns immediately when resolve entered before the wait', async () => {
    const {fixture} = create({delayMs: 0});
    const {armId} = await fixture.control({action: 'arm-next', label: 'stop-before-load'});
    const pending = fixture.service.resolve({requestId: requestId(2)});
    assert.deepEqual(await fixture.control({action: 'wait-pending', armId}), {requestId: requestId(2), pending: true, held: true, armId});
    assert.equal(fixture.snapshot().requests[0].status, 'held');
    assert.equal(fixture.snapshot().completedCount, 0);
    fixture.service.cancel(requestId(2));
    assert.deepEqual(await pending, {status: 'cancelled', reason: 'cancelled'});
    fixture.dispose();
});

test('cancel gate is tied to its armed request, not a different completed request', async () => {
    const {clock, fixture} = create({delayMs: 0});
    const {armId} = await fixture.control({action: 'arm-next', label: 'rapid-next'});
    const held = fixture.service.resolve({requestId: requestId(3)});
    await fixture.control({action: 'wait-pending', armId});
    const cancelGate = fixture.control({action: 'wait-cancelled', armId});
    const other = fixture.service.resolve({requestId: requestId(4)});
    await clock.advance(0);
    assert.equal((await other).status, 'hit');
    assert.equal(fixture.service.cancel(requestId(4)), false);
    assert.equal(fixture.snapshot().cancelCount, 0);
    let gateSettled = false;
    cancelGate.then(() => { gateSettled = true; }, () => { gateSettled = true; });
    await Promise.resolve();
    assert.equal(gateSettled, false);
    assert.equal(fixture.service.cancel(requestId(3)), true);
    assert.deepEqual(await cancelGate, {requestId: requestId(3), cancelled: true, armId});
    assert.deepEqual(await held, {status: 'cancelled', reason: 'cancelled'});
    assert.equal(fixture.snapshot().cancelCount, 1);
    assert.equal(fixture.service.cancel(requestId(3)), false);
    assert.equal(fixture.snapshot().cancelCount, 1);
    fixture.dispose();
    assert.equal(clock.pendingTimers, 0);
});

test('terminal completion rejects a later cancellation gate; release settles a held result', async () => {
    const {fixture} = create({mode: 'miss'});
    const {armId} = await fixture.control({action: 'arm-next', label: 'rapid-next'});
    const pending = fixture.service.resolve({requestId: requestId(5)});
    await fixture.control({action: 'wait-pending', armId});
    await fixture.control({action: 'release', armId});
    assert.deepEqual(await pending, {status: 'miss', reason: 'unavailable'});
    await rejection(fixture.control({action: 'wait-cancelled', armId}), 'REQUEST_COMPLETED');
    fixture.dispose();
});

test('gate timeout and timer scheduling failure reject with fixed errors', async () => {
    const clock = fakeClock();
    const {fixture} = create({delayMs: 0, gateTimeoutMs: 100}, clock);
    const {armId} = await fixture.control({action: 'arm-next', label: 'rapid-next'});
    const wait = fixture.control({action: 'wait-pending', armId}).then(() => null, error => error);
    await clock.advance(100);
    assert.equal((await wait).code, 'GATE_TIMEOUT');
    const afterExpiredArm = fixture.service.resolve({requestId: requestId(68)});
    await clock.advance(0);
    assert.equal((await afterExpiredArm).status, 'hit');
    fixture.dispose();
    assert.equal(clock.pendingTimers, 0);

    const broken = createFakeCd2Fixture({mode: 'hit', getSource: () => LOOPBACK, now: () => 0,
        setTimeout: () => { throw new Error('private timer detail'); }, clearTimeout: () => {}});
    await rejection(broken.service.resolve({requestId: requestId(6)}), 'TIMER_FAILURE');
    const report = broken.snapshot();
    assert.equal(report.requests[0].status, 'failed');
    assert.equal(report.activeCount, 0);
    assert.equal(JSON.stringify(report).includes('private timer detail'), false);
    broken.dispose();
});

test('arm uniqueness, request uniqueness and hard bounds reject safely', async () => {
    const {fixture} = create({delayMs: 1000});
    const first = await fixture.control({action: 'arm-next', label: 'rapid-next'});
    await rejection(fixture.control({action: 'arm-next', label: 'stop-before-load'}), 'ARM_ALREADY_PENDING');
    const p = fixture.service.resolve({requestId: requestId(7)});
    await fixture.control({action: 'wait-pending', armId: first.armId});
    await rejection(fixture.service.resolve({requestId: requestId(7)}), 'DUPLICATE_REQUEST_ID');
    for (let index = 0; index < 7; index++) {
        const arm = await fixture.control({action: 'arm-next', label: index % 2 ? 'rapid-next' : 'stop-before-load'});
        const current = fixture.service.resolve({requestId: requestId(index + 8)});
        await fixture.control({action: 'wait-pending', armId: arm.armId});
        fixture.service.cancel(requestId(index + 8));
        await current;
    }
    await rejection(fixture.control({action: 'arm-next', label: 'rapid-next'}), 'ARM_LIMIT');
    fixture.dispose();
    await p;
});

test('request limit is bounded and dispose cancels active work and rejects all gates', async () => {
    const clock = fakeClock();
    const {fixture} = create({delayMs: 1000}, clock);
    const pending = [];
    for (let index = 1; index <= 64; index++) pending.push(fixture.service.resolve({requestId: requestId(index)}));
    await rejection(fixture.service.resolve({requestId: requestId(65)}), 'REQUEST_LIMIT');
    assert.equal(fixture.snapshot().activeCount, 64);
    fixture.dispose();
    const results = await Promise.all(pending);
    assert.equal(results.every(value => value.status === 'cancelled'), true);
    const snapshot = fixture.snapshot();
    assert.equal(snapshot.activeCount, 0);
    assert.equal(snapshot.cancelCount, 0);
    assert.equal(snapshot.requests.every(request => request.status === 'closed'), true);
    assert.equal(clock.pendingTimers, 0);
});

test('service close settles active work but cannot satisfy service-cancel gates or count as cancel', async () => {
    const {fixture} = create();
    const {armId} = await fixture.control({action: 'arm-next', label: 'rapid-next'});
    const request = fixture.service.resolve({requestId: requestId(70)});
    await fixture.control({action: 'wait-pending', armId});
    const cancelGate = fixture.control({action: 'wait-cancelled', armId}).then(() => null, error => error);
    fixture.service.close();
    assert.equal((await cancelGate).code, 'SERVICE_CLOSED');
    assert.deepEqual(await request, {status: 'cancelled', reason: 'cancelled'});
    const snapshot = fixture.snapshot();
    assert.equal(snapshot.cancelCount, 0);
    assert.equal(snapshot.activeCount, 0);
    assert.equal(snapshot.requests[0].status, 'closed');
    fixture.dispose();
});

test('gate waiters are bounded and all timer handles are cleared on dispose', async () => {
    const clock = fakeClock();
    const {fixture} = create({gateTimeoutMs: 1000}, clock);
    const {armId} = await fixture.control({action: 'arm-next', label: 'rapid-next'});
    const waiters = Array.from({length: 64}, () => fixture.control({action: 'wait-pending', armId}).then(() => null, error => error));
    await rejection(fixture.control({action: 'wait-pending', armId}), 'GATE_WAITER_LIMIT');
    fixture.dispose();
    const results = await Promise.all(waiters);
    assert.equal(results.every(error => error && error.code === 'FIXTURE_DISPOSED'), true);
    assert.equal(fixture.snapshot().gateWaiterCount, 0);
    assert.equal(clock.pendingTimers, 0);
});

test('dispose rejects pending gates and leaves a bounded, sanitized snapshot', async () => {
    const {clock, fixture} = create({delayMs: 400});
    const arm = await fixture.control({action: 'arm-next', label: 'stop-before-load'});
    const request = fixture.service.resolve({requestId: requestId(66), candidates: ['SECRET_CANDIDATE'], token: 'SECRET_TOKEN'});
    await fixture.control({action: 'wait-pending', armId: arm.armId});
    const gate = fixture.control({action: 'wait-cancelled', armId: arm.armId}).then(() => null, error => error);
    const unboundArm = await fixture.control({action: 'arm-next', label: 'rapid-next'});
    const unboundGate = fixture.control({action: 'wait-pending', armId: unboundArm.armId}).then(() => null, error => error);
    const before = fixture.snapshot();
    assert.equal(JSON.stringify(before).includes(LOOPBACK), false);
    assert.equal(JSON.stringify(before).includes('SECRET_CANDIDATE'), false);
    assert.equal(JSON.stringify(before).includes('SECRET_TOKEN'), false);
    const final = fixture.dispose();
    assert.equal((await gate).code, 'FIXTURE_DISPOSED');
    assert.equal((await unboundGate).code, 'FIXTURE_DISPOSED');
    assert.deepEqual(await request, {status: 'cancelled', reason: 'cancelled'});
    assert.equal(final.activeCount, 0);
    assert.equal(final.cancelCount, 0);
    assert.equal(final.requests[0].status, 'closed');
    assert.equal(final.gateWaiterCount, 0);
    assert.equal(clock.pendingTimers, 0);
    assert.deepEqual(await fixture.control({action: 'snapshot'}), final);
    await rejection(fixture.control({action: 'arm-next', label: 'rapid-next'}), 'FIXTURE_DISPOSED');
});

test('invalid source and malformed control never echo inputs', async () => {
    assert.throws(() => createFakeCd2Fixture({mode: 'hit', getSource: () => 'https://private.invalid/secret?token=secret'}),
        error => error && error.code === 'INVALID_SOURCE' && error.message === 'INVALID_SOURCE');
    const {fixture} = create();
    await rejection(fixture.control({action: 'arm-next', label: 'SECRET_LABEL', token: 'SECRET_TOKEN'}), 'INVALID_CONTROL');
    await rejection(fixture.control({action: 'wait-pending', armId: 'SECRET_ARM'}), 'INVALID_CONTROL');
    const report = fixture.snapshot();
    assert.equal(JSON.stringify(report).includes('SECRET_LABEL'), false);
    assert.equal(JSON.stringify(report).includes('SECRET_TOKEN'), false);
    assert.equal(JSON.stringify(report).includes('SECRET_ARM'), false);
    fixture.dispose();
});
