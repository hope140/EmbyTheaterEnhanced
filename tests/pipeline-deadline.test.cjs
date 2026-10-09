'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {createPipelineDeadline, MAX_DURATION_MS, STAGES} = require('./pipeline-deadline.cjs');

function fakeClock() {
    let current = 0;
    let nextId = 1;
    const timers = new Map();
    return {
        now: () => current,
        setTimeout(callback, delay) {
            const id = nextId++;
            timers.set(id, {at: current + delay, callback});
            return id;
        },
        clearTimeout(id) { timers.delete(id); },
        advance(amount) {
            const target = current + amount;
            while (true) {
                let candidateId = null;
                let candidate = null;
                for (const [id, timer] of timers) {
                    if (timer.at <= target && (!candidate || timer.at < candidate.at ||
                        (timer.at === candidate.at && id < candidateId))) {
                        candidateId = id;
                        candidate = timer;
                    }
                }
                if (!candidate) break;
                timers.delete(candidateId);
                current = candidate.at;
                candidate.callback();
            }
            current = target;
        },
        get pendingCount() { return timers.size; }
    };
}

function deadline(clock, options = {}) {
    return createPipelineDeadline(Object.assign({
        now: clock.now,
        setTimeout: clock.setTimeout.bind(clock),
        clearTimeout: clock.clearTimeout.bind(clock)
    }, options));
}

test('validates positive bounded durations and total coverage', () => {
    for (const value of [0, -1, 1.5, MAX_DURATION_MS + 1, '15']) {
        assert.throws(() => createPipelineDeadline({startupMs: value}), /duration is invalid/);
        assert.throws(() => createPipelineDeadline({stageMs: value}), /duration is invalid/);
        assert.throws(() => createPipelineDeadline({totalMs: value}), /duration is invalid/);
    }
    assert.throws(() => createPipelineDeadline({startupMs: 20, stageMs: 10, totalMs: 19}), /must cover/);
    assert.throws(() => createPipelineDeadline({startupMs: 10, stageMs: 20, totalMs: 19}), /must cover/);
});

test('default startup watchdog records a fixed timeout and ignores later stages', () => {
    const clock = fakeClock();
    const notifications = [];
    const timer = deadline(clock, {onTimeout: value => notifications.push(value)});
    clock.advance(14999);
    assert.equal(timer.snapshot().timedOut, false);
    clock.advance(1);
    assert.deepEqual(notifications, [{kind: 'startup', stage: null, elapsedMs: 15000, stageElapsedMs: null}]);
    const before = timer.snapshot();
    assert.equal(timer.enter('modules-loaded').timedOut, true);
    clock.advance(200000);
    assert.deepEqual(timer.snapshot(), before);
    assert.equal(notifications.length, 1);
    assert.equal(clock.pendingCount, 0);
});

test('same-stage repeats do not extend the stage deadline', () => {
    const clock = fakeClock();
    const notifications = [];
    const timer = deadline(clock, {startupMs: 50, stageMs: 10, totalMs: 50, onTimeout: value => notifications.push(value)});
    timer.enter('modules-loading');
    clock.advance(9);
    timer.enter('modules-loading');
    clock.advance(1);
    assert.deepEqual(notifications, [{kind: 'stage', stage: 'modules-loading', elapsedMs: 10, stageElapsedMs: 10}]);
    assert.equal(timer.snapshot().history.length, 1);
});

test('a different stage resets only the stage watchdog and records relative history', () => {
    const clock = fakeClock();
    const notifications = [];
    const timer = deadline(clock, {startupMs: 50, stageMs: 10, totalMs: 50, onTimeout: value => notifications.push(value)});
    timer.enter('modules-loading');
    clock.advance(8);
    timer.enter('modules-loaded');
    clock.advance(9);
    assert.equal(timer.snapshot().timedOut, false);
    clock.advance(1);
    assert.deepEqual(notifications, [{kind: 'stage', stage: 'modules-loaded', elapsedMs: 18, stageElapsedMs: 10}]);
    assert.deepEqual(timer.snapshot().history, [
        {stage: 'modules-loading', elapsedMs: 0},
        {stage: 'modules-loaded', elapsedMs: 8}
    ]);
});

test('stage progress does not extend the total watchdog', () => {
    const clock = fakeClock();
    const notifications = [];
    const timer = deadline(clock, {startupMs: 25, stageMs: 10, totalMs: 25, onTimeout: value => notifications.push(value)});
    timer.enter('modules-loading');
    clock.advance(8);
    timer.enter('modules-loaded');
    clock.advance(8);
    timer.enter('ordinary-play');
    clock.advance(8);
    timer.enter('ordinary-core-playing');
    clock.advance(1);
    assert.deepEqual(notifications, [{kind: 'total', stage: 'ordinary-core-playing', elapsedMs: 25, stageElapsedMs: 1}]);
});

test('pipeline-complete stops watchdogs and dispose is idempotent', () => {
    const clock = fakeClock();
    const notifications = [];
    const timer = deadline(clock, {startupMs: 10, stageMs: 10, totalMs: 20, onTimeout: value => notifications.push(value)});
    timer.enter('modules-loaded');
    const completed = timer.enter('pipeline-complete');
    assert.equal(completed.completed, true);
    assert.equal(completed.history.at(-1).stage, 'pipeline-complete');
    assert.equal(clock.pendingCount, 0);
    clock.advance(100);
    assert.equal(timer.snapshot().timedOut, false);
    assert.equal(notifications.length, 0);
    assert.equal(timer.dispose().disposed, true);
    assert.equal(timer.dispose().disposed, true);
    assert.equal(timer.enter('queue-play').completed, true);
    assert.equal(clock.pendingCount, 0);
});

test('dispose before start cancels timers and later enter cannot restart them', () => {
    const clock = fakeClock();
    const notifications = [];
    const timer = deadline(clock, {onTimeout: value => notifications.push(value)});
    const disposed = timer.dispose();
    assert.equal(disposed.disposed, true);
    const elapsed = disposed.elapsedMs;
    assert.equal(timer.enter('modules-loaded').stage, null);
    clock.advance(200000);
    assert.equal(timer.snapshot().disposed, true);
    assert.equal(timer.snapshot().elapsedMs, elapsed);
    assert.equal(notifications.length, 0);
    assert.equal(clock.pendingCount, 0);
});

test('timeout callback exceptions are isolated and timeout cannot be upgraded to completion', () => {
    const clock = fakeClock();
    let callbackCount = 0;
    const timer = deadline(clock, {
        startupMs: 20,
        stageMs: 10,
        totalMs: 20,
        onTimeout() { callbackCount += 1; throw new Error('untrusted detail'); }
    });
    timer.enter('ordinary-play');
    clock.advance(10);
    assert.equal(timer.snapshot().timedOut, true);
    assert.equal(timer.snapshot().timeout.kind, 'stage');
    assert.equal(timer.enter('pipeline-complete').completed, false);
    clock.advance(100);
    assert.equal(callbackCount, 1);
    assert.equal(timer.snapshot().timedOut, true);
    assert.equal(timer.snapshot().completed, false);
    assert.equal(clock.pendingCount, 0);
});

test('unknown labels do not echo caller data and history remains capped at 32', () => {
    const clock = fakeClock();
    const timer = deadline(clock, {startupMs: 1000, stageMs: 100, totalMs: 1000});
    const hostileLabel = 'outside-path-and-secret';
    assert.throws(() => timer.enter(hostileLabel), error => {
        assert.equal(error.message, 'Pipeline deadline stage is invalid.');
        assert.equal(error.message.includes(hostileLabel), false);
        return true;
    });
    const stages = STAGES.filter(stage => stage !== 'pipeline-complete');
    for (let index = 0; index < 40; index += 1) {
        timer.enter(stages[index % stages.length]);
        clock.advance(1);
    }
    const state = timer.snapshot();
    assert.equal(state.history.length, 32);
    assert.ok(state.history.every(entry => stages.includes(entry.stage) && Number.isFinite(entry.elapsedMs)));
    assert.equal(Object.keys(state).some(key => /path|error|secret/i.test(key)), false);
});