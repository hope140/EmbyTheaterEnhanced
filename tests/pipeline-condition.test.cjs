'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {create} = require('./pipeline-condition.js');

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
        get pendingTimerCount() { return timers.size; },
        async advance(ms) {
            const end = now + ms;
            for (;;) {
                const timer = Array.from(timers.values()).filter(item => item.at <= end)
                    .sort((a, b) => a.at - b.at || a.id - b.id)[0];
                if (!timer) break;
                now = timer.at;
                timers.delete(timer.id);
                timer.callback();
                await Promise.resolve();
                await Promise.resolve();
            }
            now = end;
            await Promise.resolve();
            await Promise.resolve();
        }
    };
}

function gate(clock, options = {}) {
    return create({now: clock.now, setTimeout: clock.setTimeout.bind(clock),
        clearTimeout: clock.clearTimeout.bind(clock), ...options});
}
async function fixedReject(promise, message) {
    await assert.rejects(promise, error => error instanceof Error && error.message === message);
}

test('CommonJS and browser-global UMD exports expose the same create API', async () => {
    const source = fs.readFileSync(path.join(__dirname, 'pipeline-condition.js'), 'utf8');
    const context = {setTimeout, clearTimeout, Date};
    vm.runInNewContext(source, context);
    assert.equal(typeof context.etePipelineCondition.create, 'function');
    assert.deepEqual(Object.keys(create({timeoutMs: 0})).sort(), ['dispose', 'notify', 'snapshot', 'wait']);
    context.etePipelineCondition.create({timeoutMs: 0}).dispose();
});

test('wait immediately checks the predicate and notification resolves a pending condition', async () => {
    const clock = fakeClock();
    const condition = gate(clock);
    let ready = true;
    assert.equal(await condition.wait('ready-now', () => ready), true);
    ready = false;
    const waiting = condition.wait('ready-later', () => ready);
    assert.equal(condition.snapshot().liveWaiterCount, 1);
    ready = 'loaded';
    condition.notify();
    assert.equal(await waiting, 'loaded');
    assert.equal(condition.snapshot().liveWaiterCount, 0);
    assert.deepEqual(condition.snapshot().history.map(item => ({name: item.name, status: item.status})), [
        {name: 'ready-now', status: 'resolved'}, {name: 'ready-later', status: 'resolved'}
    ]);
    assert.equal(clock.pendingTimerCount, 0);
    condition.dispose();
});

test('each missing condition gets an independent fixed timeout', async () => {
    const clock = fakeClock();
    const condition = gate(clock, {timeoutMs: 100});
    const first = condition.wait('first-missing', () => false).then(() => null, error => error);
    await clock.advance(50);
    const second = condition.wait('second-missing', () => false).then(() => null, error => error);
    await clock.advance(50);
    assert.equal((await first).message, 'pipeline-condition-timeout:first-missing');
    assert.equal(condition.snapshot().liveWaiterCount, 1);
    await clock.advance(49);
    assert.equal(condition.snapshot().liveWaiterCount, 1);
    await clock.advance(1);
    assert.equal((await second).message, 'pipeline-condition-timeout:second-missing');
    assert.deepEqual(condition.snapshot().history.map(item => item.elapsedMs), [100, 100]);
    assert.equal(clock.pendingTimerCount, 0);
    condition.dispose();
});

test('predicate errors reject the waiter and history stores no arbitrary error text', async () => {
    const clock = fakeClock();
    const condition = gate(clock);
    const immediateError = new Error('secret-immediate-detail');
    await assert.rejects(condition.wait('predicate-error', () => { throw immediateError; }), error => error === immediateError);
    let throwLater = false;
    const laterError = new Error('secret-later-detail');
    const waiting = condition.wait('later-error', () => {
        if (throwLater) throw laterError;
        return false;
    });
    throwLater = true;
    condition.notify();
    await assert.rejects(waiting, error => error === laterError);
    const report = condition.snapshot();
    assert.deepEqual(report.history.map(item => ({name: item.name, status: item.status})), [
        {name: 'predicate-error', status: 'predicate-error'}, {name: 'later-error', status: 'predicate-error'}
    ]);
    assert.equal(JSON.stringify(report).includes('secret-'), false);
    condition.dispose();
});

test('reentrant notification rechecks the current predicate and does not lose a newly added waiter', async () => {
    const clock = fakeClock();
    const condition = gate(clock);
    let firstReady = false;
    let secondReady = false;
    let secondWait;
    let firstPass = true;
    const firstWait = condition.wait('outer-condition', () => {
        if (firstPass) {
            firstPass = false;
            secondWait = condition.wait('nested-condition', () => secondReady);
            secondReady = true;
            condition.notify();
            firstReady = true;
            return false;
        }
        return firstReady;
    });
    assert.equal(await firstWait, true);
    assert.equal(await secondWait, true);
    assert.equal(condition.snapshot().liveWaiterCount, 0);
    assert.deepEqual(condition.snapshot().history.map(item => item.status), ['resolved', 'resolved']);
    assert.equal(clock.pendingTimerCount, 0);
    condition.dispose();
});

test('waiter and history caps are fixed and disposal clears timers and rejects pending waits', async () => {
    const clock = fakeClock();
    const condition = gate(clock, {timeoutMs: 1000});
    const waits = Array.from({length: 32}, (_, index) => condition.wait('pending-' + index, () => false)
        .then(() => null, error => error));
    await fixedReject(condition.wait('overflow', () => false), 'pipeline-condition-waiter-limit');
    const disposed = condition.dispose();
    assert.equal(disposed.disposed, true);
    assert.equal(disposed.liveWaiterCount, 0);
    assert.equal((await Promise.all(waits)).every(error => error.message === 'pipeline-condition-disposed'), true);
    assert.equal(clock.pendingTimerCount, 0);
    await fixedReject(condition.wait('after-dispose', () => true), 'pipeline-condition-disposed');
    condition.notify();

    const historyClock = fakeClock();
    const historyCondition = gate(historyClock, {timeoutMs: 0});
    for (let index = 0; index < 70; index++) assert.equal(await historyCondition.wait('done-' + index, () => true), true);
    const history = historyCondition.snapshot().history;
    assert.equal(history.length, 64);
    assert.equal(history[0].name, 'done-6');
    assert.ok(history.every(item => Object.keys(item).sort().join(',') === 'elapsedMs,name,status'));
    historyCondition.dispose();
});

test('invalid names, predicates and timeout options reject with fixed errors', async () => {
    const clock = fakeClock();
    const condition = gate(clock);
    await fixedReject(condition.wait('private label/path', () => true), 'pipeline-condition-invalid-name');
    await fixedReject(condition.wait('valid-name', null), 'pipeline-condition-invalid-predicate');
    assert.throws(() => create({timeoutMs: -1}), error => error.message === 'pipeline-condition-invalid-options');
    assert.throws(() => create({timeoutMs: 2147483648}), error => error.message === 'pipeline-condition-invalid-options');
    assert.equal(JSON.stringify(condition.snapshot()).includes('private label/path'), false);
    condition.dispose();
});
