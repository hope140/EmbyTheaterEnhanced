'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {createProtocol, createRefreshRateRequests, flushPromises} = require('./fixtures/refresh-rate-lifecycle.cjs');

const fixedUtility = path.join('/synthetic-app', 'libmpv', 'x64', 'refreshrate.exe');

test('refresh utility keeps its fixed executable and DISPLAY1 arguments', () => {
    const fixture = createProtocol();
    fixture.invoke('change?rate=59.94');
    assert.equal(fixture.spawns[0].file, fixedUtility);
    assert.deepEqual(fixture.spawns[0].args, ['change', String.raw`\\.\DISPLAY1`, '59.94']);
});

test('the absolute five second deadline settles once and kills the owned child', () => {
    const fixture = createProtocol();
    fixture.invoke('current');
    const child = fixture.children[0];

    fixture.scheduler.advance(4999);
    assert.deepEqual(fixture.replies, []);
    assert.deepEqual(child.killCalls, []);

    fixture.scheduler.advance(1);
    assert.deepEqual(fixture.replies.map(reply => reply.value), ['']);
    assert.equal(child.killCalls.length, 1);

    child.stdout.emit('data', Buffer.from('late output'));
    child.emit('close', 0);
    child.emit('exit', 0);
    assert.deepEqual(fixture.replies.map(reply => reply.value), ['']);
});

test('a late protocol request during quarantine does not spawn another utility', () => {
    const fixture = createProtocol();
    fixture.invoke('current');
    fixture.scheduler.advance(5000);
    fixture.invoke('list_possible');
    assert.equal(fixture.spawns.length, 1);
    assert.deepEqual(fixture.replies.map(reply => reply.value), ['', '']);
});

for (const confirmedEvent of ['close', 'exit']) {
    test('quarantine ends only after a real child ' + confirmedEvent, () => {
        const fixture = createProtocol();
        fixture.invoke('current');
        const child = fixture.children[0];
        fixture.scheduler.advance(5000);
        fixture.scheduler.advance(1000);
        fixture.invoke('list_possible');
        assert.equal(fixture.spawns.length, 1);

        child.emit(confirmedEvent, 0);
        fixture.invoke('list_possible');
        assert.equal(fixture.spawns.length, 2);
    });
}

test('child error with a pid does not count as process exit', () => {
    const fixture = createProtocol();
    fixture.invoke('current');
    const child = fixture.children[0];
    child.emit('error', Object.assign(new Error('synthetic child error'), {code: 'EIO'}));
    fixture.scheduler.advance(5000);
    fixture.scheduler.advance(1000);
    fixture.invoke('current');
    assert.equal(fixture.spawns.length, 1);
    child.emit('close', -1);
    fixture.invoke('current');
    assert.equal(fixture.spawns.length, 2);
});

test('child error without a pid releases the failed spawn slot', () => {
    const fixture = createProtocol({children: [{noPid: true}]});
    fixture.invoke('current');
    const child = fixture.children[0];
    child.emit('error', Object.assign(new Error('synthetic spawn error'), {code: 'ENOENT'}));
    fixture.invoke('current');
    assert.equal(fixture.spawns.length, 2);
    assert.deepEqual(fixture.replies.map(reply => reply.value), ['']);
});

for (const killMode of ['throws', 'false', 'no-exit']) {
    test('kill ' + killMode + ' keeps the utility quarantined until exit confirmation', () => {
        const children = [{}, {}];
        if (killMode === 'throws') children[0].killError = new Error('synthetic kill failure');
        if (killMode === 'false') children[0].killResult = false;
        const fixture = createProtocol({children});
        fixture.invoke('current');
        const child = fixture.children[0];
        fixture.scheduler.advance(5000);
        assert.equal(child.killCalls.length, 1);
        fixture.scheduler.advance(1000);
        fixture.invoke('current');
        assert.equal(fixture.spawns.length, 1);
        child.emit('close', -1);
        fixture.invoke('current');
        assert.equal(fixture.spawns.length, 2);
    });
}

test('callback exceptions remain observable after owned child resources are closed', () => {
    const failure = new Error('synthetic callback failure');
    const fixture = createProtocol({callbacks: [failure]});
    fixture.invoke('current');
    const child = fixture.children[0];
    assert.throws(() => child.emit('close', 0), error => error === failure);
    assert.deepEqual(fixture.replies.map(reply => reply.value), ['']);
    assert.doesNotThrow(() => child.emit('close', 0));
    assert.equal(fixture.scheduler.jobs.size, 0);
});

test('shutdown settles each pending request, blocks new spawns, and is bounded', async () => {
    const fixture = createProtocol();
    fixture.invoke('current');
    fixture.invoke('list_possible');
    const shutdown = fixture.shutdown;
    assert.equal(typeof shutdown, 'function');
    const stopped = shutdown();
    assert.strictEqual(shutdown(), stopped);
    fixture.invoke('change?rate=60');
    assert.equal(fixture.spawns.length, 2);
    assert.deepEqual(fixture.replies.map(reply => reply.value), ['', '', '']);
    assert.deepEqual(fixture.children.map(child => child.killCalls.length), [1, 1]);

    fixture.scheduler.advance(1000);
    await stopped;
    fixture.invoke('current');
    assert.equal(fixture.spawns.length, 2);
});

test('one shutdown callback exception does not prevent cleanup of other pending requests', async () => {
    const failure = new Error('synthetic shutdown callback failure');
    const fixture = createProtocol({callbacks: [failure, undefined]});
    fixture.invoke('current');
    fixture.invoke('list_possible');
    const stopped = fixture.shutdown();
    assert.deepEqual(fixture.replies.map(reply => reply.value), ['', '']);
    assert.deepEqual(fixture.children.map(child => child.killCalls.length), [1, 1]);
    fixture.children.forEach(child => child.emit('close', 0));
    await assert.rejects(stopped, error => error === failure);
});

test('deadline callback exception closes once, clears reap timer, and keeps quarantine until exit', () => {
    const failure = new Error('synthetic deadline callback failure');
    const fixture = createProtocol({callbacks: [failure]});
    fixture.invoke('current');
    const child = fixture.children[0];

    assert.throws(() => fixture.scheduler.advance(5000), error => error === failure);
    assert.deepEqual(fixture.replies.map(reply => reply.value), ['']);
    assert.equal(child.killCalls.length, 1);
    assert.equal(fixture.scheduler.jobs.size, 1);

    fixture.scheduler.advance(1000);
    assert.equal(fixture.scheduler.jobs.size, 0);
    fixture.invoke('list_possible');
    assert.equal(fixture.spawns.length, 1);

    child.emit('exit', 0);
    fixture.invoke('list_possible');
    assert.equal(fixture.spawns.length, 2);
});

test('synchronous spawn time consumes the original handler deadline', () => {
    const fixture = createProtocol({spawnAdvanceMs: 2000});
    fixture.invoke('current');
    const child = fixture.children[0];

    fixture.scheduler.advance(2999);
    assert.deepEqual(fixture.replies, []);
    assert.equal(child.killCalls.length, 0);
    fixture.scheduler.advance(1);
    assert.deepEqual(fixture.replies.map(reply => reply.value), ['']);
    assert.equal(child.killCalls.length, 1);
});

test('dependency setup that consumes the deadline does not spawn a child', () => {
    const fixture = createProtocol({requireAdvanceOn: 'path', requireAdvanceMs: 5000});
    fixture.invoke('current');

    assert.deepEqual(fixture.spawns, []);
    assert.deepEqual(fixture.replies.map(reply => reply.value), ['']);
    assert.equal(fixture.scheduler.jobs.size, 0);
});

function beginXHR(fixture, method, options) {
    const promise = fixture.api[method](...(method === 'setRefreshRate' ? [60, options] : [options]));
    return {promise, xhr: fixture.requests.at(-1)};
}

function observeRejection(promise) {
    const outcome = {status: 'pending'};
    outcome.settled = promise.then(
        value => { outcome.status = 'resolved'; outcome.value = value; },
        error => { outcome.status = 'rejected'; outcome.error = error; }
    );
    return {
        async assert(predicate) {
            await flushPromises();
            assert.equal(outcome.status, 'rejected', 'request should reject instead of remaining pending');
            assert.equal(predicate(outcome.error), true);
        }
    };
}

test('renderer deadline uses the shorter remaining absolute budget and clears on success', async () => {
    const fixture = createRefreshRateRequests();
    const {promise, xhr} = beginXHR(fixture, 'getRefreshRate', {deadline: fixture.scheduler.now + 75});
    assert.equal(xhr.openCalls.length, 1);
    assert.equal(xhr.openCalls[0].method, 'POST');
    assert.equal(xhr.openCalls[0].url, 'electronrefreshrate://current');
    assert.equal(xhr.sendCalls, 1);
    assert.equal(fixture.scheduler.jobs.size, 1);
    xhr.response = '60 Hz';
    xhr.onload.call(xhr);
    assert.equal(await promise, '60');
    assert.equal(fixture.scheduler.jobs.size, 0);
    fixture.scheduler.advance(100);
    assert.equal(xhr.abortCalls, 0);
});

test('renderer caps a later absolute deadline at eight seconds', async () => {
    const fixture = createRefreshRateRequests();
    const {promise, xhr} = beginXHR(fixture, 'getRefreshRateList', {deadline: fixture.scheduler.now + 20000});
    const rejected = observeRejection(promise);
    assert.equal(xhr.openCalls[0].url, 'electronrefreshrate://list_possible');
    fixture.scheduler.advance(7999);
    assert.equal(xhr.abortCalls, 0);
    fixture.scheduler.advance(1);
    await rejected.assert(error => error.name === 'RefreshRateTimeout');
    assert.equal(xhr.abortCalls, 1);
});

test('already expired renderer deadline rejects without opening or sending XHR', async () => {
    const fixture = createRefreshRateRequests();
    const {promise} = beginXHR(fixture, 'setRefreshRate', {deadline: fixture.scheduler.now});
    const rejected = observeRejection(promise);
    await rejected.assert(error => error.name === 'RefreshRateTimeout');
    assert.equal(fixture.requests.length, 0);
    assert.equal(fixture.scheduler.jobs.size, 0);
});

test('renderer timeout seals before abort and ignores reentrant and late events', async () => {
    const fixture = createRefreshRateRequests();
    const {promise, xhr} = beginXHR(fixture, 'setRefreshRate', {deadline: fixture.scheduler.now + 20});
    const rejected = observeRejection(promise);
    const lateEvents = {onload: xhr.onload, onerror: xhr.onerror, ontimeout: xhr.ontimeout};
    fixture.scheduler.advance(19);
    assert.equal(xhr.abortCalls, 0);
    fixture.scheduler.advance(1);
    await rejected.assert(error => error.name === 'RefreshRateTimeout');
    assert.equal(xhr.abortCalls, 1);
    assert.equal(fixture.scheduler.jobs.size, 0);
    xhr.response = '120 Hz';
    lateEvents.onload.call(xhr);
    lateEvents.onerror(new Error('late error'));
    lateEvents.ontimeout(new Error('late timeout'));
    assert.equal(xhr.abortCalls, 1);
});

test('external abort rejects with its own name despite synchronous abort reentry', async () => {
    const fixture = createRefreshRateRequests();
    const controller = new AbortController();
    const {promise, xhr} = beginXHR(fixture, 'getRefreshRate', {signal: controller.signal});
    const rejected = observeRejection(promise);
    const lateLoad = xhr.onload;
    controller.abort();
    await rejected.assert(error => error.name === 'RefreshRateAbort');
    assert.equal(xhr.abortCalls, 1);
    assert.equal(fixture.scheduler.jobs.size, 0);
    xhr.response = '120 Hz';
    lateLoad.call(xhr);
    assert.equal(xhr.abortCalls, 1);
});

test('renderer preserves the original XHR network error object', async () => {
    const fixture = createRefreshRateRequests();
    const {promise, xhr} = beginXHR(fixture, 'getRefreshRate');
    const failure = new Error('synthetic network error');
    const rejected = observeRejection(promise);
    xhr.onerror(failure);
    await rejected.assert(error => error === failure);
    assert.equal(fixture.scheduler.jobs.size, 0);
});

test('renderer ontimeout rejects as RefreshRateTimeout and seals once', async () => {
    const fixture = createRefreshRateRequests();
    const {promise, xhr} = beginXHR(fixture, 'getRefreshRate');
    const rejected = observeRejection(promise);
    if (xhr.ontimeout) xhr.ontimeout({type: 'timeout'});
    await rejected.assert(error => error.name === 'RefreshRateTimeout');
    assert.equal(xhr.abortCalls, 1);
    assert.equal(fixture.scheduler.jobs.size, 0);
});

test('renderer XHR abort event rejects and removes its deadline timer', async () => {
    const fixture = createRefreshRateRequests();
    const {promise, xhr} = beginXHR(fixture, 'getRefreshRate');
    const rejected = observeRejection(promise);
    if (xhr.onabort) xhr.onabort({type: 'abort'});
    await rejected.assert(error => error.type === 'abort');
    assert.equal(xhr.abortCalls, 0);
    assert.equal(fixture.scheduler.jobs.size, 0);
});

test('renderer set request preserves its URL and a timeout ignores late load', async () => {
    const fixture = createRefreshRateRequests();
    const {promise, xhr} = beginXHR(fixture, 'setRefreshRate', {deadline: fixture.scheduler.now + 10});
    assert.equal(xhr.openCalls[0].method, 'POST');
    assert.equal(xhr.openCalls[0].url, 'electronrefreshrate://change?rate=60');
    const rejected = observeRejection(promise);
    const lateLoad = xhr.onload;
    fixture.scheduler.advance(10);
    await rejected.assert(error => error.name === 'RefreshRateTimeout');
    xhr.response = '60 Hz';
    lateLoad.call(xhr);
    await flushPromises();
    assert.equal(xhr.abortCalls, 1);
});
