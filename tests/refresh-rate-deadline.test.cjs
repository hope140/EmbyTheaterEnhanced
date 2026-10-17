'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createProtocol} = require('./fixtures/refresh-rate-lifecycle.cjs');

for (const [elapsed, expected] of [[4999, '60 Hz'], [5000, ''], [5001, '']]) {
    test('close checks absolute time at ' + elapsed + 'ms even before delayed timer dispatch', () => {
        const fixture = createProtocol();
        fixture.invoke('current');
        const child = fixture.children[0];
        child.stdout.emit('data', Buffer.from('60 Hz'));
        // Model a busy event loop: wall time passed, but no timer callback ran.
        fixture.scheduler.now += elapsed;
        assert.equal(fixture.replies.length, 0);
        child.emit('close', 0);
        assert.deepEqual(fixture.replies.map(reply => reply.value), [expected]);
        assert.equal(child.killCalls.length, 0, 'observed close needs no termination request');
        assert.equal(fixture.scheduler.jobs.size, 0);
        fixture.scheduler.advance(1000);
        child.emit('close', 0);
        assert.equal(fixture.replies.length, 1);
    });
}

test('expired close cleans resources before exposing the original callback exception', () => {
    const failure = new Error('synthetic expired callback failure');
    const fixture = createProtocol({callbacks: [failure]});
    fixture.invoke('current');
    fixture.children[0].stdout.emit('data', Buffer.from('60 Hz'));
    fixture.scheduler.now += 5000;
    assert.throws(() => fixture.children[0].emit('close', 0), error => error === failure);
    assert.deepEqual(fixture.replies.map(reply => reply.value), ['']);
    assert.equal(fixture.scheduler.jobs.size, 0);
    assert.equal(fixture.children[0].killCalls.length, 0);
});
