'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createOwner} = require('../src/electronapp/enhanced/playback-power-owner');

function fakePowerSaveBlocker(startIds) {
    const active = new Set();
    const actions = [];
    let nextId = 0;
    return {
        actions,
        active,
        start(reason) {
            const id = startIds ? startIds.shift() : ++nextId;
            active.add(id);
            actions.push(['start', reason, id]);
            return id;
        },
        isStarted(id) {
            actions.push(['isStarted', id]);
            return active.has(id);
        },
        stop(id) {
            actions.push(['stop', id]);
            active.delete(id);
        }
    };
}

test('starts and stops the separate video and audio reasons', () => {
    const blocker = fakePowerSaveBlocker();
    const owner = createOwner(blocker);

    owner.setActive('video', true);
    owner.setActive('video', false);
    owner.setActive('audio', true);
    owner.setActive('audio', false);

    assert.deepEqual(blocker.actions.filter(([action]) => action === 'start' || action === 'stop'), [
        ['start', 'prevent-display-sleep', 1], ['stop', 1],
        ['start', 'prevent-app-suspension', 2], ['stop', 2]
    ]);
    assert.deepEqual([...blocker.active], []);
});

test('repeated on and off calls are idempotent', () => {
    const blocker = fakePowerSaveBlocker();
    const owner = createOwner(blocker);

    owner.setActive('video', true);
    owner.setActive('video', true);
    owner.setActive('video', false);
    owner.setActive('video', false);

    assert.deepEqual(blocker.actions, [
        ['start', 'prevent-display-sleep', 1], ['isStarted', 1],
        ['isStarted', 1], ['stop', 1]
    ]);
    assert.deepEqual([...blocker.active], []);
});

test('video and audio interleavings release only their own handles', () => {
    const blocker = fakePowerSaveBlocker();
    const owner = createOwner(blocker);

    owner.setActive('video', true);
    owner.setActive('audio', true);
    owner.setActive('video', false);
    assert.deepEqual([...blocker.active], [2]);
    owner.setActive('audio', false);

    assert.deepEqual([...blocker.active], []);
    assert.deepEqual(blocker.actions.filter(([action]) => action === 'stop'), [
        ['stop', 1], ['stop', 2]
    ]);
});

test('a stale handle is reacquired and the inactive id is never stopped', () => {
    const blocker = fakePowerSaveBlocker();
    const owner = createOwner(blocker);
    owner.setActive('video', true);
    blocker.active.delete(1);

    owner.setActive('video', true);
    owner.setActive('video', false);

    assert.deepEqual(blocker.actions, [
        ['start', 'prevent-display-sleep', 1], ['isStarted', 1],
        ['start', 'prevent-display-sleep', 2], ['isStarted', 2], ['stop', 2]
    ]);
});

test('start id zero is a valid owned handle', () => {
    const blocker = fakePowerSaveBlocker([0]);
    const owner = createOwner(blocker);

    owner.setActive('video', true);
    owner.setActive('video', true);
    owner.setActive('video', false);

    assert.deepEqual(blocker.actions, [
        ['start', 'prevent-display-sleep', 0], ['isStarted', 0],
        ['isStarted', 0], ['stop', 0]
    ]);
    assert.deepEqual([...blocker.active], []);
});

test('unknown kinds throw before calling the power API', () => {
    const blocker = fakePowerSaveBlocker();
    const owner = createOwner(blocker);

    assert.throws(() => owner.setActive('display', true), TypeError);
    assert.throws(() => owner.setActive('__proto__', false), TypeError);
    assert.deepEqual(blocker.actions, []);
});

test('off before on is safe and does not touch the power API', () => {
    const blocker = fakePowerSaveBlocker();
    const owner = createOwner(blocker);

    owner.setActive('audio', false);
    assert.deepEqual(blocker.actions, []);
});

test('shutdown retires on calls before cleaning both owned locks', () => {
    const blocker = fakePowerSaveBlocker();
    const owner = createOwner(blocker);
    owner.setActive('video', true);
    owner.setActive('audio', true);

    owner.shutdown();
    owner.setActive('video', true);
    owner.setActive('audio', true);

    assert.deepEqual([...blocker.active], []);
    assert.deepEqual(blocker.actions.filter(([action]) => action === 'start'), [
        ['start', 'prevent-display-sleep', 1], ['start', 'prevent-app-suspension', 2]
    ]);
    assert.deepEqual(blocker.actions.filter(([action]) => action === 'stop'), [
        ['stop', 1], ['stop', 2]
    ]);
});

test('repeated shutdown and off calls clean each lock once', () => {
    const blocker = fakePowerSaveBlocker();
    const owner = createOwner(blocker);
    owner.setActive('video', true);
    owner.setActive('audio', true);

    owner.shutdown();
    owner.shutdown();
    owner.setActive('video', false);
    owner.setActive('audio', false);

    assert.deepEqual(blocker.actions.filter(([action]) => action === 'stop'), [
        ['stop', 1], ['stop', 2]
    ]);
});

test('never stops a fake external lock', () => {
    const blocker = fakePowerSaveBlocker();
    blocker.active.add(99);
    const owner = createOwner(blocker);
    owner.setActive('video', true);
    owner.setActive('video', false);
    owner.shutdown();

    assert.deepEqual([...blocker.active], [99]);
    assert.deepEqual(blocker.actions.filter(([action]) => action === 'stop'), [['stop', 1]]);
});

test('API errors propagate and a failed stop keeps the handle for later cleanup', () => {
    const blocker = fakePowerSaveBlocker();
    const owner = createOwner(blocker);
    owner.setActive('video', true);
    const originalStop = blocker.stop;
    const failure = new Error('stop failed');
    blocker.stop = () => { throw failure; };

    assert.throws(() => owner.setActive('video', false), error => error === failure);
    blocker.stop = originalStop;
    owner.setActive('video', false);

    assert.deepEqual([...blocker.active], []);
    assert.deepEqual(blocker.actions.filter(([action]) => action === 'stop'), [['stop', 1]]);
});

test('shutdown attempts both resources and preserves each failed handle for cleanup', () => {
    const blocker = fakePowerSaveBlocker();
    const owner = createOwner(blocker);
    owner.setActive('video', true);
    owner.setActive('audio', true);
    const originalStop = blocker.stop;
    const videoFailure = new Error('video stop failed');
    const audioFailure = new Error('audio stop failed');
    blocker.stop = id => {
        blocker.actions.push(['stop', id]);
        throw id === 1 ? videoFailure : audioFailure;
    };

    assert.throws(() => owner.shutdown(), error => {
        assert.ok(error instanceof AggregateError);
        assert.deepEqual(error.errors, [videoFailure, audioFailure]);
        return true;
    });
    assert.deepEqual(blocker.actions.filter(([action]) => action === 'stop'), [
        ['stop', 1], ['stop', 2]
    ]);
    assert.deepEqual([...blocker.active], [1, 2]);

    blocker.stop = originalStop;
    owner.shutdown();
    assert.deepEqual([...blocker.active], []);
});
