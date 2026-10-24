'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const sourceRoot = process.env.ETE_TEST_SOURCE_ROOT
  ? path.resolve(process.env.ETE_TEST_SOURCE_ROOT) : path.join(__dirname, '..');
const {NativeHelperClient, encodeFrame} = require(path.join(sourceRoot, 'src/electronapp/native-helper/controller'));

const TIMELINE_CAPACITY = 4096;
const REQUEST_HISTORY_CAPACITY = 1024;

function makeClient(options = {}) {
  const client = new NativeHelperClient({
    helperPath: 'unused', libmpvPath: 'unused', parentWindowHandle: '1',
    helperInstanceId: 'history-test', ...options
  });
  client.child = {stdin: {writable: true, write: () => true}};
  return client;
}

function event(client, name, value, generationId = client.currentGenerationId) {
  return {protocolVersion: 1, type: 'event', scope: 'generation',
    helperInstanceId: client.helperInstanceId, generationId, name, value};
}

function flood(client, count, offset = 0) {
  // Same valid time-pos traffic as the retention probe, through the production dispatcher.
  for (let index = 0; index < count; index++) client.dispatch(event(client, 'time-pos', (offset + index) / 10));
}

function respond(client, request, result = {ok: true}) {
  client.onStdout(encodeFrame({protocolVersion: 1, type: 'response',
    helperInstanceId: client.helperInstanceId, generationId: request.generationId,
    requestId: request.requestId, result}));
}

test('200000 valid time-pos events retain only the latest bounded chronological timeline', () => {
  let delivered = 0;
  const client = makeClient({onEvent: () => delivered++});
  client.currentGenerationId = 123;
  flood(client, 200000);

  assert.equal(client.timeline.length, TIMELINE_CAPACITY);
  assert.equal(delivered, 200000, 'retention does not suppress production event delivery');
  assert.ok(Array.isArray(client.timeline));
  assert.equal(client.timeline[0].value, (200000 - TIMELINE_CAPACITY) / 10);
  assert.equal(client.timeline.at(-1).value, 19999.9);
  const snapshot = client.snapshot();
  assert.equal(snapshot.timelineCapacity, TIMELINE_CAPACITY);
  assert.equal(snapshot.timelineDroppedCount, 200000 - TIMELINE_CAPACITY);
  assert.equal(snapshot.timeline.length + snapshot.timelineDroppedCount, 200000);
  snapshot.timeline[0].name = 'changed-snapshot';
  snapshot.timeline.pop();
  assert.equal(client.timeline[0].name, 'time-pos', 'snapshot rows remain detached');
  flood(client, TIMELINE_CAPACITY * 2, 200000);
  assert.equal(client.timeline.length, TIMELINE_CAPACITY, 'repeated ring wraps stay bounded');
  assert.equal(snapshot.timelineDroppedCount, 200000 - TIMELINE_CAPACITY, 'old snapshot metrics stay fixed');
});

test('completed requests retain only recent settlements and duplicates never settle twice', async () => {
  const client = makeClient();
  const count = 20000;
  for (let index = 0; index < count; index++) {
    const request = client.request('get-property', {name: 'time-pos'}, {mediaScoped: false});
    respond(client, request, {value: index});
    respond(client, request, {value: 'duplicate'});
    assert.deepEqual(await request, {value: index});
  }

  assert.ok(Array.isArray(client.requestHistory));
  assert.equal(client.requestHistory.length, REQUEST_HISTORY_CAPACITY);
  assert.equal(client.requestHistory[0].requestId, count - REQUEST_HISTORY_CAPACITY + 1);
  assert.equal(client.requestHistory.at(-1).requestId, count);
  assert.ok(client.requestHistory.every(row => row.terminalTransitions === 1));
  assert.equal(client.pending.size, 0);
  const snapshot = client.snapshot();
  assert.equal(snapshot.requestHistoryCapacity, REQUEST_HISTORY_CAPACITY);
  assert.equal(snapshot.requestHistoryDroppedCount, count - REQUEST_HISTORY_CAPACITY);
  snapshot.requestHistory[0].state = 'changed-snapshot';
  assert.equal(client.requestHistory[0].state, 'RESOLVED');
  assert.equal(snapshot.timelineCapacity, TIMELINE_CAPACITY);
  assert.equal(snapshot.timeline.length + snapshot.timelineDroppedCount, count * 2);
});

test('failed, cancelled and timed-out requests preserve exactly one terminal transition', async () => {
  const client = makeClient();
  const failed = client.request('failed', {}, {mediaScoped: false});
  const failedResult = assert.rejects(failed, error => error.state === 'FAILED');
  client.onStdout(encodeFrame({protocolVersion: 1, type: 'error',
    helperInstanceId: client.helperInstanceId, generationId: failed.generationId,
    requestId: failed.requestId, code: 'synthetic-failure'}));
  await failedResult;
  const cancelled = client.request('cancelled', {}, {mediaScoped: false});
  const pendingCancelled = client.pending.get(cancelled.requestId);
  const cancelledResult = assert.rejects(cancelled, error => error.state === 'CANCELLED');
  assert.equal(client.cancelRequest(cancelled.requestId), true);
  assert.equal(client.cancelRequest(cancelled.requestId), false);
  client.finishRequest(pendingCancelled, 'RESOLVED', 'duplicate');
  await cancelledResult;
  const timedOut = client.request('timeout', {}, {mediaScoped: false, timeoutMs: 5});
  await assert.rejects(timedOut, error => error.state === 'TIMED_OUT');
  respond(client, timedOut);
  assert.deepEqual(client.requestHistory.map(row => row.state), ['FAILED', 'CANCELLED', 'TIMED_OUT']);
  assert.ok(client.requestHistory.every(row => row.terminalTransitions === 1));
  assert.equal(client.pending.size, 0);
});

test('startup retains accepted ready state after the ready history entry is evicted', async t => {
  const client = new NativeHelperClient({helperPath: process.execPath,
    libmpvPath: path.join(__dirname, 'fixtures', 'native-helper-fake.cjs'),
    parentWindowHandle: '1', expectedLibmpvVersion: 'fake-mpv', readyTimeoutMs: 1000});
  t.after(() => client.kill());
  const onStdout = client.onStdout.bind(client);
  let flooded = false;
  client.onStdout = chunk => {
    onStdout(chunk);
    if (client.handshake && !flooded) {
      flooded = true;
      for (let index = 0; index < TIMELINE_CAPACITY + 1; index++) {
        client.dispatch({protocolVersion: 1, type: 'lifecycle', scope: 'helper',
          helperInstanceId: client.helperInstanceId, name: 'diagnostic-tick'});
      }
    }
  };
  await client.start();
  assert.equal(flooded, true);
  assert.equal(client.timeline.some(row => row.name === 'ready'), false);
  assert.equal(client.handshake.libmpvVersion, 'fake-mpv');
  assert.equal(client.protocolFailure, null);
});

test('event waits observe accepted events between polls, including when history wraps', async () => {
  const client = makeClient();
  const generation = client.beginGeneration('wait-history');
  const waiting = client.waitForGenerationEvent(generation, 'file-loaded', 1000);
  client.onStdout(encodeFrame(event(client, 'file-loaded', null)));
  flood(client, TIMELINE_CAPACITY + 1);
  await waiting;
  assert.equal(client.generationEventWaiters.size, 0, 'matched waiters release their retained state');
  assert.equal(client.timeline.some(row => row.name === 'file-loaded'), false);
  assert.equal(client.state.fileLoaded, true);
  // Registration after eviction cannot replay discarded history. A retained match still works.
  await assert.rejects(client.waitForGenerationEvent(generation, 'file-loaded', 15), /timeout:/);
  assert.equal(client.generationEventWaiters.size, 0, 'timed-out waiters release their retained state');
  client.dispatch(event(client, 'core-idle', false));
  await client.waitForGenerationEvent(generation, 'core-idle', 1000);
});

test('history eviction preserves retirement, stop and transport-terminal settlement rules', async () => {
  const client = makeClient();
  const oldGeneration = client.beginGeneration('old');
  const retired = client.request('pending-media');
  const retiredResult = assert.rejects(retired, error => error.state === 'GENERATION_RETIRED');
  const generation = client.beginGeneration('current');
  await retiredResult;
  let observed = false;
  const waiting = client.waitForGenerationEvent(generation, 'file-loaded', 1000).then(() => { observed = true; });
  client.dispatch(event(client, 'file-loaded', null, oldGeneration));
  client.dispatch({...event(client, 'file-loaded', null), helperInstanceId: 'old-helper'});
  flood(client, TIMELINE_CAPACITY + 1);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(observed, false, 'stale helper and generation events do not fulfill a wait');
  assert.equal(client.state.fileLoaded, false);
  client.dispatch(event(client, 'file-loaded', null));
  await waiting;

  const pendingMedia = client.request('pending-media');
  const mediaResult = assert.rejects(pendingMedia, error => error.state === 'GENERATION_RETIRED');
  const stop = client.stop();
  await mediaResult;
  respond(client, [...client.pending.values()].find(row => row.method === 'stop'));
  await stop;
  assert.equal(client.currentGenerationId, null);
  assert.equal(client.state.status, 'stopped');
  const pending = client.request('pending-global', {}, {mediaScoped: false});
  const terminalResult = assert.rejects(pending, error => error.state === 'HELPER_DIED');
  client.onTransportTerminal('stdout-end');
  client.onTransportTerminal('stdout-close');
  await terminalResult;
  respond(client, pending);
  client.dispatch(event(client, 'file-loaded', null, generation));
  assert.equal(client.timeline.at(-1).action, 'DROP_TRANSPORT_TERMINAL');
  assert.equal(client.state.fileLoaded, false);
  assert.equal(client.pending.size, 0);
  assert.deepEqual(client.requestHistory.map(row => row.state), [
    'GENERATION_RETIRED', 'GENERATION_RETIRED', 'RESOLVED', 'HELPER_DIED'
  ]);
  assert.ok(client.requestHistory.every(row => row.terminalTransitions === 1));
});
