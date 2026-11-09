'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const nativeClient = require('../src/electronapp/native-helper/client');
const {FakeIpc, makeEventTarget, makeDom, makeContext, makePlayOptions} = require('./helpers/startup-route-fixture.cjs');

async function playing(t) {
    const ipc = new FakeIpc(), target = makeEventTarget();
    Object.assign(target, {ipc, platform: 'win32', PlayerWindowId: 1});
    const resolver = {isStrm: () => false, resolveAsync: async info => ({type: 'native', source: info.nativeSource})};
    const f = makeContext(target, makeDom(), nativeClient, resolver);
    const options = makePlayOptions('https://synthetic.invalid/media');
    await f.player.play(options);
    t.after(() => f.player.stop(true));
    const property = (name, value, generationId = ipc.generationId) => ipc.emit(nativeClient.EVENT_CHANNEL, {}, {
        type: 'property_change', generationId, data: {name, value}
    });
    const failure = (overrides = {}) => ipc.emit(nativeClient.EVENT_CHANNEL, {}, {
        type: 'bridge_error', generationId: ipc.generationId, reason: 'load-failed',
        failureKind: 'media-load', endReason: 4, mpvErrorCode: -13, ...overrides
    });
    return {...f, ipc, target, options, property, failure,
        errors: () => f.eventCalls.filter(row => row[1] === 'error'),
        stops: () => f.eventCalls.filter(row => row[1] === 'stopped')};
}

test('owned terminal read error after visible playback preserves no-retry classification once', async t => {
    const f = await playing(t);
    f.property('duration', 1425.057);
    f.property('time-pos', 481.181);
    f.property('pause', true); f.property('pause', false);
    f.failure(); f.failure(); f.property('eof-reached', true);
    assert.equal(f.errors().length, 1);
    assert.equal(f.errors()[0][2][0].unexpectedEof, true);
    assert.equal(f.stops().length, 0);
    assert.equal(f.ipc.loadCalls.length, 1);
});

test('adapter retains explicit unexpectedEof rather than degrading it to a generic retryable error', async t => {
    const f = await playing(t);
    f.player._onError({reason: 'eof-before-core-playing', unexpectedEof: true});
    assert.equal(f.errors()[0][2][0].unexpectedEof, true);
});

for (const overrides of [{generationId: undefined}, {failureKind: 'bridge-operation'}, {endReason: null}]) {
    test('incomplete terminal evidence does not acquire no-retry classification: ' + JSON.stringify(overrides), async t => {
        const f = await playing(t);
        f.failure(overrides);
        assert.equal(f.errors().length, 1, 'legacy generic error handling is retained');
        assert.notEqual(f.errors()[0][2][0].unexpectedEof, true);
    });
}

test('typed end-file error remains terminal when its optional numeric error code is unavailable', async t => {
    const f = await playing(t);
    f.failure({mpvErrorCode: undefined});
    assert.equal(f.errors()[0][2][0].unexpectedEof, true);
});

test('retired errors and EOF cannot terminate a new generation of the same media', async t => {
    const f = await playing(t), old = f.ipc.generationId;
    await f.player.stop(true);
    const stoppedBeforeReplay = f.stops().length;
    await f.player.play({...f.options, _etePlayRequestId: 2});
    f.failure({generationId: old}); f.property('eof-reached', true, old);
    assert.equal(f.errors().length, 0); assert.equal(f.stops().length, stoppedBeforeReplay);
    f.failure();
    assert.equal(f.errors().length, 1);
    assert.equal(f.errors()[0][2][0].unexpectedEof, true);
});

test('synchronous error listener replacement does not mark the replacement request terminal', async t => {
    const f = await playing(t);
    let replacement;
    f.target.addEventListener('native-helper-error', () => {
        replacement = f.player.play({...f.options, _etePlayRequestId: 2});
    }, {once: true});
    f.failure();
    const completed = await Promise.race([replacement.then(() => true, () => false),
        new Promise(resolve => setTimeout(() => resolve(false), 500))]);
    assert.equal(completed, true, 'replacement must still reach core-playing');
    assert.equal(f.errors().length, 0);
    f.failure();
    assert.equal(f.errors().length, 1);
    assert.equal(f.errors()[0][2][0].unexpectedEof, true);
});

for (const [name, duration, position] of [
    ['normal tail', 1425.057, 1425], ['short video', 0.4, 0.39],
    ['unknown duration', null, 481.181], ['incorrect duration', 9000, 481.181],
    ['live without finite duration', 0, 481.181], ['near-tail seek', 1425.057, 1425.057],
    ['incident EOF without authoritative error (known limitation)', 1425.057, 481.181]
]) test(name + ' keeps ordinary EOF semantics without a duration heuristic', async t => {
    const f = await playing(t);
    if (name === 'near-tail seek') await f.player.currentTime(position * 1000);
    f.property('duration', duration); f.property('time-pos', position);
    f.property('eof-reached', true); f.property('eof-reached', true);
    assert.equal(f.stops().length, 1); assert.equal(f.errors().length, 0);
});

test('EOF already delivered is not reclassified by a later terminal error', async t => {
    const f = await playing(t);
    f.property('eof-reached', true);
    f.failure();
    assert.equal(f.stops().length, 1); assert.equal(f.errors().length, 0);
});

test('nonterminal engine diagnostics do not terminate playback', async t => {
    const f = await playing(t);
    f.ipc.emit(nativeClient.EVENT_CHANNEL, {}, {type: 'lifecycle', name: 'mpv-engine',
        detail: {records: [{level: 'error', text: 'Corrupt file detected. Trying to resync'}]}});
    f.property('time-pos', 482); f.property('core-idle', false);
    assert.equal(f.errors().length, 0); assert.equal(f.stops().length, 0);
    f.property('eof-reached', true);
    assert.equal(f.stops().length, 1);
});
