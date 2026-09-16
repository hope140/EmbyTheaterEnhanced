'use strict';

const assert = require('node:assert/strict');
const { ResearchController } = require('./controller.cjs');
const { FakeHelper, SharedTransport } = require('./fake-helper.cjs');
const {
  ControlledScheduler,
  LengthPrefixedJsonDecoder,
  MESSAGE_TYPES,
  ProtocolError,
  REQUEST_STATES,
  encodeFrame
} = require('./model.cjs');

const TEST_TIMEOUT_MS = 50;

function createHarness(options = {}) {
  const scheduler = new ControlledScheduler();
  const transport = new SharedTransport();
  const controller = new ResearchController({
    scheduler,
    transport,
    controllerInstanceId: options.controllerInstanceId || 'C1',
    testTimeoutMs: TEST_TIMEOUT_MS,
    maxDiagnostics: 32,
    maxDropRecords: 64
  });
  const helper = new FakeHelper({
    scheduler,
    transport,
    helperInstanceId: options.helperInstanceId || 'H1'
  });
  controller.startHelper(helper.helperInstanceId);
  const token = controller.beginGeneration(options.media || 'A');
  return { scheduler, transport, controller, helper, token };
}

function observe(promise) {
  const outcome = { status: 'pending', value: undefined, error: undefined };
  promise.then(
    value => { outcome.status = 'resolved'; outcome.value = value; },
    error => { outcome.status = 'rejected'; outcome.error = error; }
  );
  return outcome;
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

function lastOutboundRequest(transport) {
  const requests = transport.outbound.filter(message => message.type === MESSAGE_TYPES.REQUEST);
  assert.ok(requests.length > 0, 'expected at least one outbound request');
  return requests[requests.length - 1];
}

function terminalRecord(controller, requestId) {
  return controller.snapshot().requestHistory.find(item => item.requestId === requestId);
}

async function testResponseInOrder() {
  const h = createHarness();
  h.helper.plan('first', { drop: true }).plan('second', { drop: true });
  const first = h.controller.request('first');
  const second = h.controller.request('second');
  const firstOutcome = observe(first);
  const secondOutcome = observe(second);
  const [firstMessage, secondMessage] = h.transport.outbound.filter(item => item.type === MESSAGE_TYPES.REQUEST);
  h.helper.respond(firstMessage, { result: 'one' });
  h.helper.respond(secondMessage, { result: 'two' });
  await flushPromises();
  assert.deepEqual([firstOutcome.value, secondOutcome.value], ['one', 'two']);
  assert.equal(h.controller.snapshot().pendingRequestIds.length, 0);
  return { resolved: 2 };
}

async function testResponseReversedOrder() {
  const h = createHarness();
  h.helper.plan('first', { drop: true }).plan('second', { drop: true });
  const first = h.controller.request('first');
  const second = h.controller.request('second');
  const firstOutcome = observe(first);
  const secondOutcome = observe(second);
  const [firstMessage, secondMessage] = h.transport.outbound.filter(item => item.type === MESSAGE_TYPES.REQUEST);
  h.helper.respond(secondMessage, { result: 'two' });
  h.helper.respond(firstMessage, { result: 'one' });
  await flushPromises();
  assert.equal(firstOutcome.value, 'one');
  assert.equal(secondOutcome.value, 'two');
  return { correlation: 'requestId' };
}

async function testDuplicateResponse() {
  const h = createHarness();
  h.helper.plan('query', { drop: true });
  const promise = h.controller.request('query');
  const outcome = observe(promise);
  const message = lastOutboundRequest(h.transport);
  h.helper.respond(message, { result: 'first' });
  h.helper.respond(message, { result: 'duplicate' });
  await flushPromises();
  assert.equal(outcome.value, 'first');
  assert.equal(terminalRecord(h.controller, promise.requestId).terminalTransitions, 1);
  assert.ok(h.controller.snapshot().drops.some(item => item.reason === 'unknown-or-terminal-request-id'));
  return { terminalTransitions: 1, duplicate: 'dropped' };
}

async function testUnknownRequestId() {
  const h = createHarness();
  const before = h.controller.snapshot().state;
  h.transport.deliver({
    type: MESSAGE_TYPES.RESPONSE,
    helperInstanceId: 'H1',
    generationId: h.token.generationId,
    requestId: 999,
    result: { path: 'unexpected' }
  });
  assert.deepEqual(h.controller.snapshot().state, before);
  return { stateMutated: false };
}

async function testStaleGenerationResponse() {
  const h = createHarness();
  h.helper.plan('load', { drop: true });
  const oldPromise = h.controller.request('load', { media: 'A' });
  const outcome = observe(oldPromise);
  const oldRequest = lastOutboundRequest(h.transport);
  const current = h.controller.beginGeneration('B');
  h.helper.respond(oldRequest, { result: { media: 'A' } });
  await flushPromises();
  assert.equal(outcome.error.state, REQUEST_STATES.GENERATION_RETIRED);
  assert.equal(h.controller.snapshot().state.media, 'B');
  assert.equal(h.controller.snapshot().generationId, current.generationId);
  return { oldState: outcome.error.state, currentMedia: 'B' };
}

async function testStaleHelperResponse() {
  const h = createHarness();
  h.helper.plan('query', { drop: true });
  const promise = h.controller.request('query');
  const outcome = observe(promise);
  const oldRequest = lastOutboundRequest(h.transport);
  h.controller.helperDied('H1');
  h.helper.restart('H2');
  h.controller.startHelper('H2');
  h.controller.beginGeneration('B');
  h.helper.respond(oldRequest, { helperInstanceId: 'H1', result: 'old' });
  await flushPromises();
  assert.equal(outcome.error.state, REQUEST_STATES.HELPER_DIED);
  assert.equal(h.controller.snapshot().state.media, 'B');
  return { oldHelper: 'dropped', currentHelper: 'H2' };
}

async function testTimeoutThenResponse() {
  const h = createHarness();
  h.helper.plan('slow', { drop: true });
  const promise = h.controller.request('slow', null, { timeoutMs: TEST_TIMEOUT_MS });
  const outcome = observe(promise);
  const request = lastOutboundRequest(h.transport);
  h.scheduler.advanceTo(TEST_TIMEOUT_MS);
  h.helper.respond(request, { result: 'late' });
  await flushPromises();
  assert.equal(outcome.error.state, REQUEST_STATES.TIMED_OUT);
  assert.equal(terminalRecord(h.controller, promise.requestId).terminalTransitions, 1);
  return { deadlineMs: TEST_TIMEOUT_MS, lateResponse: 'dropped' };
}

async function testCancelThenResponse() {
  const h = createHarness();
  h.helper.plan('cancel-me', { drop: true });
  const promise = h.controller.request('cancel-me');
  const outcome = observe(promise);
  const request = lastOutboundRequest(h.transport);
  assert.equal(h.controller.cancelRequest(promise.requestId, 'test-cancel'), true);
  h.helper.respond(request, { result: 'late' });
  await flushPromises();
  assert.equal(outcome.error.state, REQUEST_STATES.CANCELLED);
  assert.equal(terminalRecord(h.controller, promise.requestId).terminalTransitions, 1);
  return { terminalState: REQUEST_STATES.CANCELLED };
}

async function testHelperCrashPending() {
  const h = createHarness();
  h.helper.plan('one', { drop: true }).plan('two', { drop: true });
  const p1 = h.controller.request('one');
  const p2 = h.controller.request('two');
  const o1 = observe(p1);
  const o2 = observe(p2);
  h.helper.crash();
  await flushPromises();
  assert.equal(o1.error.state, REQUEST_STATES.HELPER_DIED);
  assert.equal(o2.error.state, REQUEST_STATES.HELPER_DIED);
  assert.equal(h.controller.snapshot().pendingRequestIds.length, 0);
  return { terminatedRequests: 2 };
}

async function testHelperRecreate() {
  const h = createHarness();
  h.helper.crash();
  h.helper.restart('H2');
  h.controller.startHelper('H2');
  const token = h.controller.beginGeneration('B');
  h.helper.emitGenerationEvent(token.generationId, 'path', 'B.mkv');
  assert.equal(h.controller.snapshot().state.path, 'B.mkv');
  assert.equal(h.controller.snapshot().helperInstanceId, 'H2');
  return { helperBoundary: 'H1->H2', generationId: token.generationId };
}

async function testOldHelperEventAfterRecreate() {
  const h = createHarness();
  h.helper.crash();
  h.helper.restart('H2');
  h.controller.startHelper('H2');
  const token = h.controller.beginGeneration('B');
  h.helper.emitGenerationEvent(token.generationId, 'path', 'B.mkv');
  h.helper.emitGenerationEvent(h.token.generationId, 'path', 'A.mkv', { helperInstanceId: 'H1' });
  assert.equal(h.controller.snapshot().state.path, 'B.mkv');
  return { authoritativePath: 'B.mkv' };
}

async function testRapidABC() {
  const h = createHarness({ media: 'A' });
  const a = h.token;
  const b = h.controller.beginGeneration('B');
  const c = h.controller.beginGeneration('C');
  h.helper.emitGenerationEvent(a.generationId, 'path', 'A.mkv');
  h.helper.emitGenerationEvent(b.generationId, 'path', 'B.mkv');
  h.helper.emitGenerationEvent(c.generationId, 'path', 'C.mkv');
  h.helper.emitGenerationEvent(a.generationId, 'core-idle', false);
  assert.equal(h.controller.snapshot().state.media, 'C');
  assert.equal(h.controller.snapshot().state.path, 'C.mkv');
  assert.equal(h.controller.snapshot().state.status, 'loading');
  return { authoritativeMedia: 'C', staleEventsDropped: 3 };
}

async function testStopPendingLoad() {
  const h = createHarness();
  h.helper.plan('load', { drop: true });
  const promise = h.controller.request('load');
  const outcome = observe(promise);
  const request = lastOutboundRequest(h.transport);
  h.controller.stop();
  h.helper.respond(request, { result: { path: 'A.mkv' } });
  h.helper.emitGenerationEvent(h.token.generationId, 'core-idle', false);
  await flushPromises();
  assert.equal(outcome.error.state, REQUEST_STATES.GENERATION_RETIRED);
  assert.equal(h.controller.snapshot().state.status, 'stopped');
  assert.equal(h.controller.snapshot().state.media, null);
  return { finalStatus: 'stopped', resurrection: false };
}

async function testDestroyPendingRequest() {
  const h = createHarness();
  h.helper.plan('query', { drop: true });
  const promise = h.controller.request('query');
  const outcome = observe(promise);
  const oldMessage = lastOutboundRequest(h.transport);
  h.controller.destroy();
  h.transport.deliver({ ...oldMessage, type: MESSAGE_TYPES.RESPONSE, result: 'late' });
  await flushPromises();
  assert.equal(outcome.error.state, REQUEST_STATES.CONTROLLER_DESTROYED);
  assert.equal(h.controller.snapshot().state.status, 'destroyed');
  return { terminalState: REQUEST_STATES.CONTROLLER_DESTROYED };
}

async function testMalformedMessage() {
  const h = createHarness();
  const before = h.controller.snapshot().state;
  h.helper.sendMalformed('not-an-object');
  h.helper.sendMalformed({ type: 'response', helperInstanceId: 'H1' });
  assert.deepEqual(h.controller.snapshot().state, before);
  assert.equal(h.controller.snapshot().metrics.dropped, 2);
  return { malformedDropped: 2 };
}

async function testMissingIdentity() {
  const h = createHarness();
  h.transport.deliver({
    type: MESSAGE_TYPES.EVENT,
    scope: 'generation',
    generationId: h.token.generationId,
    name: 'path',
    value: 'wrong.mkv'
  });
  assert.equal(h.controller.snapshot().state.path, null);
  return { missingHelperInstanceId: 'dropped' };
}

async function testImpossibleFutureGeneration() {
  const h = createHarness();
  h.helper.emitGenerationEvent(h.token.generationId + 100, 'path', 'future.mkv');
  assert.equal(h.controller.snapshot().state.path, null);
  assert.ok(h.controller.snapshot().drops.some(item => item.reason === 'impossible-future-generation'));
  return { futureGeneration: 'dropped' };
}

async function testStaleEventStorm() {
  const h = createHarness();
  const stale = h.token;
  const current = h.controller.beginGeneration('B');
  for (let index = 0; index < 1000; index++) {
    h.helper.emitGenerationEvent(stale.generationId, 'time-pos', index);
    h.helper.emitHelperEvent('stderr-diagnostic', `${'x'.repeat(2048)}-${index}`);
  }
  for (let index = 0; index < 1000; index++) {
    h.helper.emitGenerationEvent(current.generationId, 'time-pos', index);
    h.controller.command('set_property', ['volume', index % 100]);
  }
  const commandOutcome = observe(h.controller.command('set_property', ['pause', true]));
  h.helper.emitGenerationEvent(current.generationId, 'path', 'B.mkv');
  await flushPromises();
  const snapshot = h.controller.snapshot();
  assert.equal(snapshot.state.path, 'B.mkv');
  assert.equal(commandOutcome.status, 'resolved');
  assert.ok(snapshot.drops.length <= 64);
  assert.ok(snapshot.diagnostics.length <= 32);
  assert.ok(snapshot.metrics.dropRecordDrops > 0);
  assert.ok(snapshot.metrics.diagnosticDrops > 0);
  assert.ok(snapshot.diagnostics.every(item => typeof item.value !== 'string' || item.value.length <= 1038));
  assert.ok(h.transport.outbound.length <= h.transport.maxOutboundHistory);
  assert.ok(h.transport.outboundHistoryDrops > 0);
  return {
    staleEvents: 1000,
    currentPropertyEvents: 1000,
    diagnostics: 1000,
    commandBurst: 1000,
    retainedDropRecords: snapshot.drops.length,
    retainedDiagnostics: snapshot.diagnostics.length,
    retainedOutboundHistory: h.transport.outbound.length,
    commandAccepted: true
  };
}

async function testResponseBeforeDeadline() {
  const h = createHarness();
  h.helper.plan('near-deadline', { delayMs: TEST_TIMEOUT_MS - 1, result: 'on-time' });
  const promise = h.controller.request('near-deadline');
  const outcome = observe(promise);
  h.scheduler.advanceTo(TEST_TIMEOUT_MS - 1);
  await flushPromises();
  assert.equal(outcome.value, 'on-time');
  h.scheduler.advanceTo(TEST_TIMEOUT_MS);
  assert.equal(terminalRecord(h.controller, promise.requestId).state, REQUEST_STATES.RESOLVED);
  return { responseAtMs: TEST_TIMEOUT_MS - 1, deadlineMs: TEST_TIMEOUT_MS };
}

async function testNeverResponds() {
  const h = createHarness();
  h.helper.plan('never', { drop: true });
  const promise = h.controller.request('never');
  const outcome = observe(promise);
  h.scheduler.advanceTo(TEST_TIMEOUT_MS);
  await flushPromises();
  assert.equal(outcome.error.state, REQUEST_STATES.TIMED_OUT);
  assert.equal(h.scheduler.pendingTimerCount(), 0);
  return { terminalState: REQUEST_STATES.TIMED_OUT, timerLeak: false };
}

async function testGenerationGlobalEventSplit() {
  const h = createHarness();
  const stale = h.token;
  h.controller.beginGeneration('B');
  h.helper.emitGenerationEvent(stale.generationId, 'pause', true);
  h.helper.emitHelperEvent('stderr-diagnostic', 'bounded-safe-diagnostic');
  const snapshot = h.controller.snapshot();
  assert.equal(snapshot.state.paused, false);
  assert.equal(snapshot.diagnostics.length, 1);
  return { staleMediaEvent: 'dropped', helperGlobalEvent: 'accepted' };
}

async function testNextTrackRace() {
  const h = createHarness({ media: 'episode-A' });
  const a = h.token;
  const b = h.controller.beginGeneration('episode-B');
  h.helper.emitGenerationEvent(b.generationId, 'path', 'B.mkv');
  h.helper.emitGenerationEvent(b.generationId, 'core-idle', false);
  for (const [name, value] of [
    ['core-idle', true], ['file-loaded', true], ['duration', 100], ['path', 'A.mkv'],
    ['pause', true], ['time-pos', 99], ['end-file', 'eof']
  ]) h.helper.emitGenerationEvent(a.generationId, name, value);
  const state = h.controller.snapshot().state;
  assert.equal(state.media, 'episode-B');
  assert.equal(state.path, 'B.mkv');
  assert.equal(state.status, 'playing');
  assert.equal(state.paused, false);
  assert.equal(state.timePos, 0);
  return { authoritativeMedia: 'episode-B', staleEventKinds: 7 };
}

async function testCriticalMediaRace() {
  const h = createHarness({ media: 'A' });
  h.helper.plan('resolve-and-load', { drop: true });
  const request = h.controller.request('resolve-and-load', { media: 'A' });
  const outcome = observe(request);
  request.then(result => h.controller.submitLoadFor(request.token, result.path), () => {});
  const outbound = lastOutboundRequest(h.transport);
  const b = h.controller.beginGeneration('B');
  assert.equal(h.controller.submitLoadFor(b, 'B.mkv'), true);
  h.helper.emitGenerationEvent(b.generationId, 'core-idle', false);
  h.helper.respond(outbound, { result: { media: 'A', path: 'A.mkv' } });
  h.helper.emitGenerationEvent(h.token.generationId, 'path', 'A.mkv');
  h.helper.emitGenerationEvent(h.token.generationId, 'core-idle', false);
  await flushPromises();
  const state = h.controller.snapshot().state;
  assert.equal(outcome.error.state, REQUEST_STATES.GENERATION_RETIRED);
  assert.equal(state.media, 'B');
  assert.equal(state.path, 'B.mkv');
  assert.equal(state.status, 'playing');
  const effects = h.controller.snapshot().effects;
  assert.deepEqual(effects.loadCalls.map(item => item.source), ['B.mkv']);
  assert.deepEqual(effects.playingTransitions.map(item => item.media), ['B']);
  return { aLoaded: false, aBecameCurrent: false, currentMedia: 'B', loadCalls: ['B.mkv'], playingTransitions: ['B'] };
}

async function testResolvedCallbackAfterGenerationChange() {
  const h = createHarness({ media: 'A' });
  h.helper.plan('resolve', { drop: true });
  const promise = h.controller.request('resolve');
  let applied = false;
  promise.then(result => {
    applied = h.controller.submitLoadFor(promise.token, result.path);
  }, () => {});
  const outbound = lastOutboundRequest(h.transport);
  h.helper.respond(outbound, { result: { path: 'A.mkv' } });
  h.controller.beginGeneration('B');
  await flushPromises();
  assert.equal(applied, false);
  assert.equal(h.controller.snapshot().state.media, 'B');
  assert.equal(h.controller.snapshot().state.path, null);
  assert.deepEqual(h.controller.snapshot().effects.loadCalls, []);
  return { resolvedUnder: 'A', callbackRanUnder: 'B', application: 'dropped-by-local-token' };
}

async function testHelperIdentityReuseRejected() {
  const scheduler = new ControlledScheduler();
  const transport = new SharedTransport();
  const c1 = new ResearchController({ scheduler, transport, controllerInstanceId: 'C1', testTimeoutMs: TEST_TIMEOUT_MS });
  c1.startHelper('H1');
  c1.beginGeneration('A');
  c1.destroy();
  const c2 = new ResearchController({ scheduler, transport, controllerInstanceId: 'C2', testTimeoutMs: TEST_TIMEOUT_MS });
  assert.throws(() => c2.startHelper('H1'), /helper-instance-id-reused/);
  c2.startHelper('H2');
  const token = c2.beginGeneration('B');
  transport.deliver({ type: MESSAGE_TYPES.EVENT, helperInstanceId: 'H1', generationId: 1, scope: 'generation', name: 'path', value: 'OLD.mkv' });
  transport.deliver({ type: MESSAGE_TYPES.EVENT, helperInstanceId: 'H2', generationId: token.generationId, scope: 'generation', name: 'path', value: 'B.mkv' });
  assert.equal(c2.snapshot().state.path, 'B.mkv');
  return { reusedIdentity: 'rejected', replacementIdentity: 'H2' };
}

async function testTransportWriteFailure() {
  const h = createHarness();
  h.helper.plan('pending', { drop: true });
  const first = h.controller.request('pending');
  const firstOutcome = observe(first);
  h.transport.failNextSend(new Error('EPIPE'));
  const second = h.controller.request('write-fails');
  const secondOutcome = observe(second);
  await flushPromises();
  assert.equal(firstOutcome.error.state, REQUEST_STATES.HELPER_DIED);
  assert.equal(secondOutcome.error.state, REQUEST_STATES.HELPER_DIED);
  assert.equal(h.controller.snapshot().pendingRequestIds.length, 0);
  assert.equal(h.scheduler.pendingTimerCount(), 0);

  const h2 = createHarness();
  h2.transport.failNextSend(new Error('EPIPE'));
  const commandOutcome = observe(h2.controller.command('set_property', ['pause', true]));
  await flushPromises();
  assert.equal(commandOutcome.error.state, REQUEST_STATES.HELPER_DIED);
  assert.equal(h2.controller.snapshot().state.status, 'helper-dead');
  return { requestTerminated: 2, commandRejected: true, timerLeak: false };
}

async function testSynchronousResponseStateMachine() {
  const h = createHarness();
  h.helper.plan('sync', { result: 'ok' });
  const promise = h.controller.request('sync');
  const outcome = observe(promise);
  await flushPromises();
  assert.equal(outcome.value, 'ok');
  assert.deepEqual(terminalRecord(h.controller, promise.requestId).stateTransitions, [
    REQUEST_STATES.CREATED,
    REQUEST_STATES.SENT,
    REQUEST_STATES.RESOLVED
  ]);
  return { transitions: ['CREATED', 'SENT', 'RESOLVED'] };
}

async function testScheduledLateResponseAfterCrash() {
  const h = createHarness();
  h.helper.plan('slow', { delayMs: 10, deliverAfterCrash: true, result: 'late' });
  const promise = h.controller.request('slow');
  const outcome = observe(promise);
  h.helper.crash();
  h.scheduler.advanceTo(10);
  await flushPromises();
  assert.equal(outcome.error.state, REQUEST_STATES.HELPER_DIED);
  assert.ok(h.controller.snapshot().drops.some(item => item.reason === 'stale-helper-instance'));
  return { terminalState: REQUEST_STATES.HELPER_DIED, delayedResponse: 'dropped' };
}

async function testScheduledLateResponseAfterGenerationChange() {
  const h = createHarness();
  h.helper.plan('slow', { delayMs: 10, result: 'late-A' });
  const promise = h.controller.request('slow');
  const outcome = observe(promise);
  h.controller.beginGeneration('B');
  h.scheduler.advanceTo(10);
  await flushPromises();
  assert.equal(outcome.error.state, REQUEST_STATES.GENERATION_RETIRED);
  assert.equal(h.controller.snapshot().state.media, 'B');
  return { terminalState: REQUEST_STATES.GENERATION_RETIRED, delayedResponse: 'dropped' };
}

async function testResponseAtDeadline() {
  const h = createHarness();
  h.helper.plan('deadline', { delayMs: TEST_TIMEOUT_MS, result: 'same-tick' });
  const promise = h.controller.request('deadline');
  const outcome = observe(promise);
  h.scheduler.advanceTo(TEST_TIMEOUT_MS);
  await flushPromises();
  assert.equal(outcome.error.state, REQUEST_STATES.TIMED_OUT);
  return { policy: 'deadline-is-exclusive', terminalState: REQUEST_STATES.TIMED_OUT };
}

async function testDestroyRecreateSharedTransport() {
  const scheduler = new ControlledScheduler();
  const transport = new SharedTransport();
  const c1 = new ResearchController({ scheduler, transport, controllerInstanceId: 'C1', testTimeoutMs: TEST_TIMEOUT_MS });
  c1.startHelper('H1');
  const old = c1.beginGeneration('A');
  c1.destroy();
  const c2 = new ResearchController({ scheduler, transport, controllerInstanceId: 'C2', testTimeoutMs: TEST_TIMEOUT_MS });
  c2.startHelper('H2');
  const current = c2.beginGeneration('B');
  transport.deliver({ type: MESSAGE_TYPES.EVENT, helperInstanceId: 'H1', generationId: old.generationId, scope: 'generation', name: 'path', value: 'A.mkv' });
  transport.deliver({ type: MESSAGE_TYPES.EVENT, helperInstanceId: 'H2', generationId: current.generationId, scope: 'generation', name: 'path', value: 'B.mkv' });
  assert.equal(c2.snapshot().state.path, 'B.mkv');
  assert.ok(c2.snapshot().drops.some(item => item.reason === 'stale-helper-instance'));
  return { oldControllerMessage: 'dropped', currentPath: 'B.mkv' };
}

async function testFramingPartialAndConcatenated() {
  const first = { type: MESSAGE_TYPES.LIFECYCLE, helperInstanceId: 'H1', name: 'helper-ready' };
  const second = { type: MESSAGE_TYPES.EVENT, helperInstanceId: 'H1', scope: 'helper', name: 'stderr-diagnostic', value: 'ok' };
  const frame1 = encodeFrame(first, 1024);
  const frame2 = encodeFrame(second, 1024);
  const decoder = new LengthPrefixedJsonDecoder({ maxFrameBytes: 1024 });
  assert.deepEqual(decoder.push(frame1.subarray(0, 2)), []);
  const decoded = decoder.push(Buffer.concat([frame1.subarray(2), frame2]));
  assert.deepEqual(decoded, [first, second]);
  return { partialRead: 'buffered', concatenatedFrames: 2 };
}

async function testFramingMalformedAndOversized() {
  const invalidJson = Buffer.from('{', 'utf8');
  const malformedFrame = Buffer.alloc(4 + invalidJson.length);
  malformedFrame.writeUInt32BE(invalidJson.length, 0);
  invalidJson.copy(malformedFrame, 4);
  const decoder = new LengthPrefixedJsonDecoder({ maxFrameBytes: 32 });
  assert.throws(() => decoder.push(malformedFrame), error => error instanceof ProtocolError && error.code === 'malformed-json');
  const oversized = Buffer.alloc(4);
  oversized.writeUInt32BE(33, 0);
  const decoder2 = new LengthPrefixedJsonDecoder({ maxFrameBytes: 32 });
  assert.throws(() => decoder2.push(oversized), error => error instanceof ProtocolError && error.code === 'invalid-frame-length');
  assert.throws(() => decoder2.push(Buffer.alloc(0)), error => error instanceof ProtocolError && error.code === 'decoder-failed');

  const invalidUtf8Payload = Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x22, 0x7d]);
  const invalidUtf8Frame = Buffer.alloc(4 + invalidUtf8Payload.length);
  invalidUtf8Frame.writeUInt32BE(invalidUtf8Payload.length, 0);
  invalidUtf8Payload.copy(invalidUtf8Frame, 4);
  const decoder3 = new LengthPrefixedJsonDecoder({ maxFrameBytes: 32 });
  assert.throws(() => decoder3.push(invalidUtf8Frame), error => error instanceof ProtocolError && error.code === 'invalid-utf8');

  const missingIdentity = Buffer.from(JSON.stringify({ type: 'lifecycle', name: 'helper-ready' }), 'utf8');
  const missingIdentityFrame = Buffer.alloc(4 + missingIdentity.length);
  missingIdentityFrame.writeUInt32BE(missingIdentity.length, 0);
  missingIdentity.copy(missingIdentityFrame, 4);
  const decoder4 = new LengthPrefixedJsonDecoder({ maxFrameBytes: 128 });
  assert.throws(() => decoder4.push(missingIdentityFrame), error => error instanceof ProtocolError && error.code === 'missing-helper-instance-id');
  return {
    malformed: 'connection-failed-closed',
    oversized: 'connection-failed-closed',
    invalidUtf8: 'connection-failed-closed',
    missingIdentity: 'connection-failed-closed',
    decoderRemainsFailed: true
  };
}

async function testFramingBufferLimit() {
  const decoder = new LengthPrefixedJsonDecoder({ maxFrameBytes: 1024, maxBufferedBytes: 16 });
  const partial = Buffer.alloc(14);
  partial.writeUInt32BE(20, 0);
  assert.deepEqual(decoder.push(partial), []);
  assert.throws(
    () => decoder.push(Buffer.alloc(3)),
    error => error instanceof ProtocolError && error.code === 'buffer-limit-exceeded'
  );
  assert.throws(
    () => decoder.push(Buffer.alloc(0)),
    error => error instanceof ProtocolError && error.code === 'decoder-failed'
  );
  return { declaredFrameBytes: 20, receiveBufferBytes: 16, result: 'connection-failed-closed' };
}

async function testFramingFailureClosesHelperBoundary() {
  const h = createHarness();
  h.helper.plan('pending', { drop: true });
  const promise = h.controller.request('pending');
  const outcome = observe(promise);
  const decoder = new LengthPrefixedJsonDecoder({ maxFrameBytes: 32 });
  const invalidPayload = Buffer.from('{', 'utf8');
  const invalidFrame = Buffer.alloc(4 + invalidPayload.length);
  invalidFrame.writeUInt32BE(invalidPayload.length, 0);
  invalidPayload.copy(invalidFrame, 4);
  try {
    decoder.push(invalidFrame);
    assert.fail('malformed frame must fail');
  } catch (error) {
    assert.equal(error.code, 'malformed-json');
    h.controller.helperDied('H1', 'protocol-frame-failed');
  }
  await flushPromises();
  assert.equal(outcome.error.state, REQUEST_STATES.HELPER_DIED);
  assert.equal(h.controller.snapshot().pendingRequestIds.length, 0);
  assert.equal(h.scheduler.pendingTimerCount(), 0);
  assert.throws(() => decoder.push(Buffer.alloc(0)), error => error.code === 'decoder-failed');
  return { pendingTerminated: 1, timerLeak: false, laterFramesAccepted: false };
}

async function testSubmissionAckSemantics() {
  const h = createHarness();
  const outcome = observe(h.controller.command('set_property', ['pause', true]));
  await flushPromises();
  assert.equal(outcome.value.guarantee, 'ipc-submission-only');
  assert.equal(h.controller.snapshot().state.paused, false);
  h.helper.emitGenerationEvent(h.token.generationId, 'pause', true);
  assert.equal(h.controller.snapshot().state.paused, true);
  return { commandPromise: 'submission-only', operationObservedBy: 'generation-scoped-event' };
}

const CASES = [
  ['response in order', testResponseInOrder],
  ['response reversed order', testResponseReversedOrder],
  ['duplicate response', testDuplicateResponse],
  ['unknown requestId', testUnknownRequestId],
  ['stale generation response', testStaleGenerationResponse],
  ['stale helper instance response', testStaleHelperResponse],
  ['timeout then response', testTimeoutThenResponse],
  ['cancel then response', testCancelThenResponse],
  ['helper crash with pending requests', testHelperCrashPending],
  ['helper recreate', testHelperRecreate],
  ['old helper event after recreate', testOldHelperEventAfterRecreate],
  ['rapid Play A -> B -> C', testRapidABC],
  ['Stop during pending load', testStopPendingLoad],
  ['destroy during pending request', testDestroyPendingRequest],
  ['malformed message', testMalformedMessage],
  ['missing identity field', testMissingIdentity],
  ['impossible future generation', testImpossibleFutureGeneration],
  ['event storm from stale generation', testStaleEventStorm],
  ['response just before deadline', testResponseBeforeDeadline],
  ['response exactly at deadline', testResponseAtDeadline],
  ['never responds', testNeverResponds],
  ['helper-global vs generation event', testGenerationGlobalEventSplit],
  ['NextTrack late event race', testNextTrackRace],
  ['critical Play A -> B late completion', testCriticalMediaRace],
  ['resolved callback after generation change', testResolvedCallbackAfterGenerationChange],
  ['helper identity reuse rejected', testHelperIdentityReuseRejected],
  ['transport write failure', testTransportWriteFailure],
  ['synchronous response state machine', testSynchronousResponseStateMachine],
  ['scheduled late response after helper crash', testScheduledLateResponseAfterCrash],
  ['scheduled late response after generation change', testScheduledLateResponseAfterGenerationChange],
  ['destroy/recreate shared transport', testDestroyRecreateSharedTransport],
  ['partial and concatenated framing', testFramingPartialAndConcatenated],
  ['malformed and oversized framing', testFramingMalformedAndOversized],
  ['framing receive buffer limit', testFramingBufferLimit],
  ['framing failure closes helper boundary', testFramingFailureClosesHelperBoundary],
  ['command submission acknowledgement', testSubmissionAckSemantics]
];

async function runFaultInjection() {
  const results = [];
  for (const [name, execute] of CASES) {
    try {
      const evidence = await execute();
      results.push({ name, status: 'PASS', evidence });
    } catch (error) {
      results.push({ name, status: 'FAIL', error: { name: error.name, message: error.message } });
    }
  }
  return {
    testTimeoutMs: TEST_TIMEOUT_MS,
    total: results.length,
    passed: results.filter(item => item.status === 'PASS').length,
    failed: results.filter(item => item.status === 'FAIL').length,
    results
  };
}

module.exports = { CASES, TEST_TIMEOUT_MS, runFaultInjection };

if (require.main === module) {
  runFaultInjection().then(result => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.failed === 0 ? 0 : 1;
  }, error => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}
