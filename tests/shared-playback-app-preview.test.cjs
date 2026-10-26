'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {createPreviewObserver, seekSignals, operationFacts, propertyName} = require('../tools/shared-playback-cache/app-preview-observer.cjs');
const contract = require('../tools/shared-playback-cache/app-performance-contract.cjs');
const owner = {endpointId: 'owned', generationId: 17};
const tick = async () => {await Promise.resolve(); await Promise.resolve();};
function fixture() {
  let clock = 0, live = {...owner}, calls = 0, pending = [];
  const observations = [];
  const original = function (value) {assert.equal(this, service); assert.equal(value.endpointId, owner.endpointId); calls++;
    let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;});
    pending.push({resolve, reject, promise}); return promise;};
  const service = {capturePreview: original};
  const observer = createPreviewObserver({now: () => clock, colored: frame => frame.colored,
    current: value => value.endpointId === live.endpointId && value.generationId === live.generationId,
    observe: row => observations.push(row)});
  const restore = observer.install(service);
  const frame = (value, owned = owner) => ({owner: {...owned}, colored: true, pixels: Buffer.from(value)});
  return {observer, service, original, restore, frame, observations, pending, setClock: v => {clock = v;}, retire: () => {live.generationId++;}, calls: () => calls};
}

test('preview observer preserves receiver, original Promise and rejection; restores ownership', async () => {
  const f = fixture(), promise = f.service.capturePreview(owner);
  assert.equal(promise, f.pending[0].promise); assert.equal(f.calls(), 1);
  f.pending[0].resolve(f.frame('a')); await promise; await tick();
  assert.ok(f.observer.frame(owner, 0, null));
  const rejection = f.service.capturePreview(owner); const error = Error('canary-private');
  f.pending[1].reject(error); await assert.rejects(rejection, actual => actual === error); await tick();
  assert.equal(f.observations.at(-1).category, 'rejected');
  assert.doesNotMatch(JSON.stringify(f.observations), /canary|pixels|endpointId/);
  f.restore(); assert.equal(f.service.capturePreview, f.original); assert.equal(f.observer.frame(owner, 0, null), null);
});

test('only a colored current-owner request starting after target events confirms a different seek frame', async () => {
  const f = fixture();
  f.setClock(10); const early = f.service.capturePreview(owner);
  f.setClock(30); f.pending[0].resolve(f.frame('a')); await early; await tick();
  const initial = f.observer.frame(owner, 0, null); assert.ok(initial);
  assert.equal(f.observations[0].hash, initial.hash);
  assert.equal(f.observer.frame(owner, 20, null), null, 'late completion does not make an early request fresh');
  f.setClock(40); const unchanged = f.service.capturePreview(owner); f.pending[1].resolve(f.frame('a')); await unchanged; await tick();
  assert.equal(f.observer.frame(owner, 20, initial.hash), null);
  f.setClock(50); const fresh = f.service.capturePreview(owner); f.pending[2].resolve(f.frame('b')); await fresh; await tick();
  const next = f.observer.frame(owner, 20, initial.hash); assert.ok(next); assert.notEqual(next.hash, initial.hash);
  assert.equal(f.observer.frame(owner, 20, initial.hash, 49), null, 'late completion cannot satisfy the original absolute frame deadline');
  assert.deepEqual(Object.keys(next).sort(), ['hash', 'owner', 'requestedAt', 'resolvedAt']);
  f.retire(); assert.equal(f.observer.frame(owner, 20, initial.hash), null);
  f.restore();
});

test('empty, stale and older completions cannot replace a valid fresh frame', async () => {
  const f = fixture(); f.setClock(1); const old = f.service.capturePreview(owner);
  f.setClock(2); const fresh = f.service.capturePreview(owner); f.pending[1].resolve(f.frame('fresh')); await fresh; await tick();
  const hash = f.observer.frame(owner, 2, null).hash;
  f.pending[0].resolve(f.frame('old')); await old; await tick(); assert.equal(f.observer.frame(owner, 2, null).hash, hash);
  const empty = f.service.capturePreview(owner); f.pending[2].resolve(null); await empty; await tick();
  const stale = f.service.capturePreview(owner); f.pending[3].resolve(f.frame('wrong', {...owner, generationId: 18})); await stale; await tick();
  assert.equal(f.observer.frame(owner, 2, null).hash, hash);
  assert.equal(f.observations.at(-1).category, 'stale-owner'); f.restore();
});

test('test probes are spaced one second; passive real-service captures remain observable', async () => {
  const f = fixture(); assert.equal(f.observer.probeDue(), true);
  f.setClock(950); assert.equal(f.observer.probeDue(), false);
  const passive = f.service.capturePreview(owner); f.pending[0].resolve(f.frame('passive')); await passive; await tick();
  assert.ok(f.observer.frame(owner, 950, null));
  f.setClock(999); assert.equal(f.observer.probeDue(), false);
  f.setClock(1000); assert.equal(f.observer.probeDue(), true); f.restore();
});

test('seek evidence requires target position and restart after dispatch in the same generation', () => {
  const events = [{name:'playback-restart', generation:17, at:1}, {name:'time-pos',generation:17,at:3,value:0.5}];
  assert.equal(seekSignals(events, 1, 17, .5), null);
  events.push({name:'playback-restart',generation:18,at:4}); assert.equal(seekSignals(events, 1, 17, .5), null);
  events.push({name:'playback-restart',generation:17,at:5});
  assert.deepEqual(seekSignals(events, 1, 17, .5), {positionAt:3,restartAt:5,after:5});
  assert.equal(seekSignals(events, 1, 17, 14), null);
});

test('operation error summary is bounded and excludes arbitrary native content', () => {
  const rows = operationFacts(Array.from({length:70}, () => ({generationId:17,operation:'private command',property:'private source',errorCode:-9,error:'private url'})));
  assert.equal(rows.length,64); assert.deepEqual(rows[0], {generation:17,operation:'other',property:'other',errorCode:-9});
  assert.doesNotMatch(JSON.stringify(rows), /private/);
});

test('known property diagnostics name the existing exact service vocabulary without granting more', () => {
  const source = require('node:fs').readFileSync(require.resolve('../src/electronapp/native-helper/service.js'),'utf8');
  const list = /const SET_PROPERTIES = new Set\(\[([\s\S]*?)\]\);/.exec(source);assert.ok(list);
  for(const match of list[1].matchAll(/'([^']+)'/g))assert.equal(propertyName(match[1]),match[1]);
  assert.equal(propertyName('private unknown path'),'other');
  assert.deepEqual(operationFacts([{generationId:131,operation:'set-property',property:'audio-channels',errorCode:-9}]),
    [{generation:131,operation:'set-property',property:'audio-channels',errorCode:-9}]);
});

test('later resource failure retains the first actual seek failure and records both safe causes', () => {
  const firstFailure = {scenario:'cached-seek',code:'app-decoded-frame-missing',rejection:{type:'object',name:'Error'}};
  const report = {firstFailure};
  contract.recordTerminalFailure(report, Error('app-owned-memory-query-timeout'));
  assert.equal(report.code,firstFailure.code);assert.equal(report.firstFailure,firstFailure);
  assert.equal(report.terminalFailure.code,'app-owned-memory-query-timeout');
  const denied = {};contract.recordTerminalFailure(denied,Error('app-owned-memory-query-denied'));
  assert.equal(denied.code,'app-owned-memory-query-denied');
  const unknown = {};contract.recordTerminalFailure(unknown,Error('https://private.invalid/?token=secret'));
  assert.equal(unknown.code,'app-worker-failed');assert.doesNotMatch(JSON.stringify(unknown),/secret|private/);
});
