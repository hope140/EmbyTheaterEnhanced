'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const observerModule = require('./generation-fixture-observer.js');

function eventTarget() {
    const listeners = new Map();
    return {
        addEventListener(name, listener) {
            const rows = listeners.get(name) || [];
            rows.push(listener);
            listeners.set(name, rows);
        },
        removeEventListener(name, listener) {
            listeners.set(name, (listeners.get(name) || []).filter(value => value !== listener));
        },
        dispatch(name) {
            for (const listener of (listeners.get(name) || []).slice()) listener({type:name});
        }
    };
}

function fakeBridge() {
    let generation = 130;
    return {
        beginGeneration(label) { return Promise.resolve({generationId:++generation,label}); },
        retireGeneration() { }
    };
}

test('overlap gate requires a registered listener, native generation, and pending first Play', async () => {
    let now = 0;
    const target = eventTarget();
    const bridge = fakeBridge();
    const observer = observerModule.create({target,timeoutMs:3000,now:()=>now});
    observer.attachBridge(bridge);
    observer.registerFixture('fixturePlay#1',9001);
    const oldListener = function () { throw new Error('old listener must not fire after takeover'); };
    target.addEventListener('core-playing', oldListener);
    now = 10;
    const generationOne = await bridge.beginGeneration('play-9001-1');
    const gate = await observer.waitForOverlapGate('fixturePlay#1');

    assert.equal(gate.pending, true);
    assert.equal(gate.requestId, 'play-9001-1');
    assert.equal(gate.nativeGenerationId, generationOne.generationId);

    observer.registerFixture('fixturePlay#2',9002);
    observer.markTakeover('fixturePlay#1','fixturePlay#2');
    target.removeEventListener('core-playing', oldListener);
    bridge.retireGeneration('upper-play-invalidated');
    const generationTwo = await bridge.beginGeneration('play-9002-2');
    let currentCallbacks = 0;
    target.addEventListener('core-playing', function () { currentCallbacks++; });
    target.dispatch('core-playing');
    observer.markPromiseSettled('fixturePlay#1','rejected',Object.assign(new Error('Playback request was superseded'),{name:'PlaybackSuperseded',playbackSuperseded:true}));
    observer.markPromiseSettled('fixturePlay#2','fulfilled');

    const snapshot = observer.snapshot();
    const first = snapshot.fixtures.find(value=>value.fixtureId==='fixturePlay#1');
    const second = snapshot.fixtures.find(value=>value.fixtureId==='fixturePlay#2');
    assert.equal(first.pendingAtGate, true);
    assert.equal(first.listenerRemoved, true);
    assert.equal(first.callbackCountAfterTakeover, 0);
    assert.equal(first.promiseSettlement, 'rejected');
    assert.equal(first.promiseError.playbackSuperseded, true);
    assert.equal(second.nativeGenerationId, generationTwo.generationId);
    assert.equal(second.promiseSettlement, 'fulfilled');
    assert.equal(currentCallbacks, 1);
    assert.deepEqual(snapshot.retirements.map(value=>({generationId:value.generationId,reason:value.reason})), [
        {generationId:generationOne.generationId,reason:'upper-play-invalidated'}
    ]);
    assert.equal(snapshot.takeovers[0].activeRequestBefore, 'play-9001-1');
    observer.restore();
});

test('overlap gate rejects when Play #1 settles before the authoritative stage', async () => {
    const target = eventTarget();
    const bridge = fakeBridge();
    const observer = observerModule.create({target,timeoutMs:3000});
    observer.attachBridge(bridge);
    observer.registerFixture('fixturePlay#1',9001);
    target.addEventListener('core-playing', function () {});
    observer.markPromiseSettled('fixturePlay#1','fulfilled');
    await bridge.beginGeneration('play-9001-1');
    await assert.rejects(observer.waitForOverlapGate('fixturePlay#1'), /fixture-play-settled-before-overlap-gate/);
    observer.restore();
});

test('listener gate can stop a pending request before generation or load', async () => {
    const target = eventTarget();
    const observer = observerModule.create({target,timeoutMs:3000});
    observer.registerFixture('fixtureStop#1-play',9003);
    target.addEventListener('core-playing', function () {});
    const gate = await observer.waitForListenerGate('fixtureStop#1-play');
    assert.equal(gate.pending, true);
    assert.equal(gate.playbackRequestId, 9003);
    observer.cancelOverlapGate('fixtureStop#1-play');
    observer.markPromiseSettled('fixtureStop#1-play','rejected',Object.assign(new Error('Playback request was superseded'),{name:'PlaybackSuperseded',playbackSuperseded:true}));
    const snapshot = observer.snapshot();
    const entry = snapshot.fixtures[0];
    assert.equal(entry.nativeGenerationId, null);
    assert.equal(entry.promiseError.playbackSuperseded, true);
    observer.restore();
});

test('CD2 gate observes an in-flight resolver and its matching cancel without changing transport promises', async () => {
    const target = eventTarget();
    let release;
    const transport = new Promise(resolve => { release = resolve; });
    target.ipc = {
        invoke() { return transport; },
        send() { }
    };
    const observer = observerModule.create({target,timeoutMs:3000});
    observer.registerFixture('fixtureStop#1-play',9003);
    const returned = target.ipc.invoke('enhanced-cd2-resolve',{requestId:'play-9003-7'});
    assert.strictEqual(returned, transport, 'observer must preserve the exact transport Promise');
    const gate = await observer.waitForCd2PendingGate('fixtureStop#1-play');
    assert.equal(gate.pending, true);
    assert.equal(gate.requestId, 'play-9003-7');
    observer.cancelUnusedGates('fixtureStop#1-play');
    target.ipc.send('enhanced-cd2-cancel',{requestId:'play-9003-7'});
    release({status:'cancelled'});
    await transport;
    const entry = observer.snapshot().fixtures[0];
    assert.equal(entry.cd2ResolveEntered, true);
    assert.equal(entry.cd2PendingAtGate, true);
    assert.equal(entry.cd2CancelSent, true);
    observer.restore();
});
