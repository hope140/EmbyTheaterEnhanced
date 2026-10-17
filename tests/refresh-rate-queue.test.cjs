'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {createProtocol} = require('./fixtures/refresh-rate-lifecycle.cjs');

const fixedUtility = path.join('/synthetic-app', 'libmpv', 'x64', 'refreshrate.exe');

test('all actions share one FIFO execution slot', () => {
    const fixture = createProtocol();
    fixture.invoke('current');
    fixture.invoke('change?rate=59.94');
    fixture.invoke('list_possible');

    assert.equal(fixture.spawns.length, 1);
    assert.deepEqual(fixture.spawns[0].args, ['current', String.raw`\\.\DISPLAY1`]);
    fixture.children[0].emit('close', 0);

    assert.equal(fixture.spawns.length, 2);
    assert.deepEqual(fixture.spawns[1].args, ['change', String.raw`\\.\DISPLAY1`, '59.94']);
    fixture.children[1].emit('close', 0);
    assert.equal(fixture.spawns.length, 3);
    assert.deepEqual(fixture.spawns[2].args, ['list_possible', String.raw`\\.\DISPLAY1`]);
});

test('exit before close confirms process exit but keeps the slot until close', () => {
    const fixture = createProtocol();
    fixture.invoke('current');
    fixture.invoke('list_possible');
    fixture.children[0].emit('exit', 0);

    assert.equal(fixture.spawns.length, 1);
    assert.deepEqual(fixture.replies, []);
    fixture.children[0].stdout.emit('data', Buffer.from('60 Hz'));
    fixture.children[0].emit('close', 0);

    assert.equal(fixture.spawns.length, 2);
    assert.deepEqual(fixture.replies.map(reply => reply.value), ['60 Hz']);
});

test('a queued request keeps its receive-time deadline and only its remaining budget after dispatch', () => {
    const fixture = createProtocol();
    fixture.invoke('current');
    fixture.invoke('change?rate=60');
    fixture.scheduler.now += 4999;
    fixture.children[0].emit('close', 0);

    assert.equal(fixture.spawns.length, 2);
    fixture.scheduler.advance(0.999);
    assert.deepEqual(fixture.replies.map(reply => reply.value), ['']);
    fixture.scheduler.advance(0.001);
    assert.deepEqual(fixture.replies.map(reply => reply.value), ['', '']);
    assert.equal(fixture.children[1].killCalls.length, 1);
});

test('an expired queued request is sealed without spawn when close observes the deadline first', () => {
    const fixture = createProtocol();
    fixture.invoke('current');
    fixture.invoke('list_possible');
    fixture.scheduler.now += 5000;
    fixture.children[0].emit('close', 0);

    assert.equal(fixture.spawns.length, 1);
    assert.deepEqual(fixture.replies.map(reply => reply.value), ['', '']);
});

test('callback throw from close remains visible and does not prevent pumping the next request', () => {
    const failure = new Error('synthetic callback failure');
    const fixture = createProtocol({callbacks: [failure]});
    fixture.invoke('current');
    fixture.invoke('list_possible');

    assert.equal(fixture.spawns.length, 1);
    assert.throws(() => fixture.children[0].emit('close', 0), error => error === failure);
    assert.equal(fixture.spawns.length, 2);
    assert.deepEqual(fixture.spawns[1].args, ['list_possible', String.raw`\\.\DISPLAY1`]);
});

test('quarantine holds the slot, lets queued requests expire, and late exit pumps only live work', () => {
    const fixture = createProtocol();
    fixture.invoke('current');
    fixture.invoke('list_possible');
    fixture.scheduler.advance(5000);

    assert.equal(fixture.spawns.length, 1);
    assert.deepEqual(fixture.children[0].killCalls.length, 1);
    fixture.invoke('change?rate=60');
    fixture.scheduler.advance(1000);
    assert.equal(fixture.spawns.length, 1);
    assert.deepEqual(fixture.replies.map(reply => reply.value), ['', '', '']);

    fixture.children[0].emit('exit', 0);
    assert.equal(fixture.spawns.length, 1);
    fixture.invoke('current');
    assert.equal(fixture.spawns.length, 2);
});

test('shutdown cancels queued work and bounds cleanup of the sole running child', async () => {
    const fixture = createProtocol();
    fixture.invoke('current');
    fixture.invoke('list_possible');
    const stopped = fixture.shutdown();

    assert.equal(fixture.spawns.length, 1);
    assert.deepEqual(fixture.replies.map(reply => reply.value), ['', '']);
    assert.equal(fixture.children[0].killCalls.length, 1);
    fixture.scheduler.advance(1000);
    await stopped;
    assert.equal(fixture.spawns.length, 1);
});

test('shutdown callback failure does not skip queued and running cleanup', async () => {
    const failure = new Error('synthetic queued callback failure');
    const fixture = createProtocol({callbacks: [undefined, failure, undefined]});
    fixture.invoke('current');
    fixture.invoke('list_possible');
    fixture.invoke('change?rate=60');
    const stopped = fixture.shutdown();

    assert.deepEqual(fixture.replies.map(reply => reply.value), ['', '', '']);
    assert.equal(fixture.children[0].killCalls.length, 1);
    assert.equal(fixture.spawns.length, 1);
    fixture.scheduler.advance(1000);
    await assert.rejects(stopped, error => error === failure);
});
