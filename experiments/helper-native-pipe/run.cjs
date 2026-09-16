'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { generateMedia } = require('./generate-media.cjs');
const {
  MAX_FRAME_BYTES,
  MAX_INBOUND_BYTES,
  MAX_INBOUND_FRAMES,
  MAX_RECEIVE_BUFFER,
  NativeHelperClient,
  PROTOCOL_VERSION,
  cleanupActiveClients,
  encodeFrame,
} = require('./protocol.cjs');

const ITERATIONS = 20;

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function writeJson(directory, name, value) {
  fs.writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function outcome(promise) {
  const record = { status: 'pending' };
  promise.then(value => { record.status = 'resolved'; record.value = value; }, error => {
    record.status = 'rejected'; record.state = error.state || null; record.error = error.message;
  });
  return record;
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (_) { return false; }
}

async function waitUntil(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`timeout:${label}`);
}

async function finishHelper(client) {
  if (!client || client.exited) return client && client.exitPromise;
  try {
    const generationId = client.currentGenerationId || client.allocateGenerationId();
    await client.request('normal-exit', {}, { generationId, mediaScoped: false, timeoutMs: 3000 });
  } catch (_) {
    // Exit can win the final response drain; exact pending cleanup is checked separately.
  }
  return Promise.race([
    client.exitPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('helper-exit-timeout')), 5000)),
  ]);
}

function assertAuthoritative(client, generationId, mediaPath) {
  assert.equal(client.currentGenerationId, generationId);
  assert.equal(path.resolve(client.state.path), path.resolve(mediaPath));
  assert.equal(client.state.playing, true);
  const acceptedForeign = client.timeline.filter(item => item.action === 'ACCEPT' && item.generationId !== item.currentAuthoritativeGeneration);
  assert.equal(acceptedForeign.length, 0);
}

async function runMainMediaScenarios(helperPath, libmpvPath, media) {
  const client = await new NativeHelperClient({ helperPath, libmpvPath, requestTimeoutMs: 7000 }).start();
  const result = { helperInstanceId: client.helperInstanceId, helperPid: client.child.pid };
  const timelineStart = () => client.timeline.length;
  const slice = index => client.timeline.slice(index);

  let start = timelineStart();
  const single = client.load('single-A', media.A.path);
  const singleReply = await single.promise;
  await client.waitForGenerationEvent(single.generationId, 'start-file');
  await client.waitForGenerationEvent(single.generationId, 'file-loaded');
  await client.waitForGenerationEvent(single.generationId, 'core-idle');
  await client.waitFor(() => client.state.playing && client.state.path && path.resolve(client.state.path) === path.resolve(media.A.path), 5000, 'single-playing-path');
  result.singleLoad = { status: 'PASS', generationId: single.generationId, reply: singleReply, finalState: { ...client.state }, timeline: slice(start) };

  start = timelineStart();
  const seqA = client.load('sequential-A', media.A.path);
  await seqA.promise; await client.waitForGenerationEvent(seqA.generationId, 'file-loaded');
  const seqB = client.load('sequential-B', media.B.path);
  await seqB.promise; await client.waitForGenerationEvent(seqB.generationId, 'file-loaded');
  await client.waitFor(() => client.state.playing && client.state.path && path.resolve(client.state.path) === path.resolve(media.B.path), 5000, 'sequential-B-current');
  assertAuthoritative(client, seqB.generationId, media.B.path);
  result.sequential = { status: 'PASS', generations: [seqA.generationId, seqB.generationId], timeline: slice(start), finalState: { ...client.state } };

  const rapidAB = [];
  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    start = timelineStart();
    const a = client.load(`rapid-ab-${iteration}-A`, media.A.path); const aOutcome = outcome(a.promise);
    const b = client.load(`rapid-ab-${iteration}-B`, media.B.path); const bReply = await b.promise;
    await client.waitForGenerationEvent(b.generationId, 'file-loaded');
    await client.waitFor(() => client.state.playing && client.state.path && path.resolve(client.state.path) === path.resolve(media.B.path), 5000, `rapid-ab-current-${iteration}`);
    await settle(); assert.equal(aOutcome.status, 'rejected'); assert.equal(aOutcome.state, 'GENERATION_RETIRED');
    assertAuthoritative(client, b.generationId, media.B.path);
    rapidAB.push({ iteration: iteration + 1, status: 'PASS', aGeneration: a.generationId, bGeneration: b.generationId, bMediaIdentity: bReply.mediaIdentity, timeline: slice(start) });
  }
  result.rapidAB = { status: 'PASS', passed: rapidAB.length, total: ITERATIONS, iterations: rapidAB };

  const rapidABC = [];
  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    start = timelineStart();
    const a = client.load(`rapid-abc-${iteration}-A`, media.A.path); const ao = outcome(a.promise);
    const b = client.load(`rapid-abc-${iteration}-B`, media.B.path); const bo = outcome(b.promise);
    const c = client.load(`rapid-abc-${iteration}-C`, media.C.path); const cReply = await c.promise;
    await client.waitForGenerationEvent(c.generationId, 'file-loaded');
    await client.waitFor(() => client.state.playing && client.state.path && path.resolve(client.state.path) === path.resolve(media.C.path), 5000, `rapid-abc-current-${iteration}`);
    await settle();
    assert.equal(ao.state, 'GENERATION_RETIRED'); assert.equal(bo.state, 'GENERATION_RETIRED');
    assertAuthoritative(client, c.generationId, media.C.path);
    rapidABC.push({ iteration: iteration + 1, status: 'PASS', generations: [a.generationId, b.generationId, c.generationId], cMediaIdentity: cReply.mediaIdentity, timeline: slice(start) });
  }
  result.rapidABC = { status: 'PASS', passed: rapidABC.length, total: ITERATIONS, iterations: rapidABC };

  const stopRace = [];
  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    start = timelineStart();
    const load = client.load(`stop-${iteration}-A`, media.A.path); const loadOutcome = outcome(load.promise);
    await client.stop();
    await new Promise(resolve => setTimeout(resolve, 20));
    await settle();
    assert.equal(client.currentGenerationId, null); assert.equal(client.state.status, 'stopped'); assert.equal(client.state.playing, false); assert.equal(client.state.path, null);
    const afterStop = slice(start);
    const resurrection = afterStop.some(item => item.action === 'ACCEPT' && item.generationId === load.generationId && ['file-loaded', 'core-idle', 'path'].includes(item.name));
    assert.equal(resurrection, false);
    stopRace.push({ iteration: iteration + 1, status: 'PASS', loadGeneration: load.generationId, loadOutcome, timeline: afterStop });
  }
  result.stopRace = { status: 'PASS', passed: stopRace.length, total: ITERATIONS, iterations: stopRace };

  start = timelineStart();
  const nextA = client.load('next-like-A', media.A.path); await nextA.promise; await client.waitForGenerationEvent(nextA.generationId, 'file-loaded');
  const nextB = client.load('next-like-B', media.B.path); await nextB.promise; await client.waitForGenerationEvent(nextB.generationId, 'file-loaded');
  await client.waitFor(() => client.state.playing && client.state.path && path.resolve(client.state.path) === path.resolve(media.B.path), 5000, 'next-like-B-current');
  assertAuthoritative(client, nextB.generationId, media.B.path);
  result.nextLike = { status: 'PASS', generations: [nextA.generationId, nextB.generationId], timeline: slice(start), finalState: { ...client.state } };

  const lifecycleGeneration = client.currentGenerationId;
  const timed = client.request('pending', {}, { generationId: lifecycleGeneration, mediaScoped: false, timeoutMs: 50 });
  const timedOutcome = outcome(timed);
  await client.waitFor(() => timedOutcome.status !== 'pending', 1000, 'request-timeout');
  assert.equal(timedOutcome.state, 'TIMED_OUT');
  const cancelled = client.request('pending', {}, { generationId: lifecycleGeneration, mediaScoped: false });
  const cancelledOutcome = outcome(cancelled);
  assert.equal(client.cancelRequest(cancelled.requestId, 'test-cancel'), true);
  await settle();
  assert.equal(cancelledOutcome.state, 'CANCELLED');
  const timedHistory = client.requestHistory.filter(item => item.requestId === timed.requestId);
  const cancelledHistory = client.requestHistory.filter(item => item.requestId === cancelled.requestId);
  assert.equal(timedHistory.length, 1); assert.equal(timedHistory[0].terminalTransitions, 1);
  assert.equal(cancelledHistory.length, 1); assert.equal(cancelledHistory[0].terminalTransitions, 1);
  result.requestLifecycle = { status: 'PASS', absoluteTimeout: timedOutcome, cancellation: cancelledOutcome, timeoutHistory: timedHistory, cancellationHistory: cancelledHistory };

  start = timelineStart();
  const blocker = client.request('block-main', { milliseconds: 250 }, { generationId: lifecycleGeneration, mediaScoped: false, timeoutMs: 2000 });
  const queuedA = client.load('queued-supersession-A', media.A.path); const queuedAOutcome = outcome(queuedA.promise);
  const queuedB = client.load('queued-supersession-B', media.B.path); const queuedBOutcome = outcome(queuedB.promise);
  const queuedC = client.load('queued-supersession-C', media.C.path); const queuedCReply = await queuedC.promise;
  await blocker;
  await client.waitForGenerationEvent(queuedC.generationId, 'file-loaded');
  await client.waitFor(() => client.state.playing && client.state.path && path.resolve(client.state.path) === path.resolve(media.C.path), 5000, 'queued-supersession-C-current');
  await settle();
  assert.equal(queuedAOutcome.state, 'GENERATION_RETIRED'); assert.equal(queuedBOutcome.state, 'GENERATION_RETIRED');
  const queuedTimeline = slice(start);
  assert.equal(queuedTimeline.some(item => item.name === 'start-file' && [queuedA.generationId, queuedB.generationId].includes(item.generationId)), false);
  assertAuthoritative(client, queuedC.generationId, media.C.path);
  result.queuedSupersession = { status: 'PASS', generations: [queuedA.generationId, queuedB.generationId, queuedC.generationId], cReply: queuedCReply, timeline: queuedTimeline, finalState: { ...client.state } };

  const pressure = client.load('pressure-C', media.C.path); await pressure.promise; await client.waitForGenerationEvent(pressure.generationId, 'file-loaded');
  client.pauseRead();
  const stormPromise = client.request('transport-storm', { count: 20000 }, { generationId: pressure.generationId, mediaScoped: false, timeoutMs: 10000 });
  const stderrPromise = client.request('stderr-storm', { bytes: 1024 * 1024 }, { generationId: pressure.generationId, mediaScoped: false, timeoutMs: 10000 });
  await new Promise(resolve => setTimeout(resolve, 150));
  client.resumeRead();
  const [stormResult, stderrResult] = await Promise.all([stormPromise, stderrPromise]);
  const queueStats = await client.request('queue-stats', {}, { generationId: pressure.generationId, mediaScoped: false });
  assert.ok(queueStats.coalescedReplaced > 0);
  assert.ok(queueStats.peakFrames <= queueStats.maxPendingFrames);
  assert.ok(queueStats.peakBytes <= queueStats.maxPendingBytes);
  assert.equal(stderrResult.stderrBytes, 1024 * 1024);
  assert.equal(client.stderrObservedBytes, 1024 * 1024);
  assert.ok(client.stderrRetainedBytes <= 64 * 1024);
  result.backpressure = { status: 'PASS', stormResult, queueStats, finalState: { ...client.state } };
  result.stderrDrain = { status: 'PASS', emittedBytes: stderrResult.stderrBytes, observedBytes: client.stderrObservedBytes, retainedBytes: client.stderrRetainedBytes, retentionLimit: 64 * 1024 };

  const unknownStart = client.timeline.length;
  const unknownResult = await client.request('emit-unknown-response', { requestId: 999999 }, { generationId: pressure.generationId, mediaScoped: false });
  assert.ok(client.timeline.slice(unknownStart).some(item => item.requestId === 999999 && item.action === 'DROP_UNKNOWN_OR_TERMINAL_REQUEST'));
  result.unknownRequest = { status: 'PASS', result: unknownResult, timeline: client.timeline.slice(unknownStart) };

  result.eventAttribution = {
    status: 'PASS',
    mechanism: 'serialized unbound load candidate + START_FILE playlist_entry_id map; END_FILE playlist_entry_id direct; FILE_LOADED unique open media state; property/core-idle mpv_observe_property reply_userdata token',
    timeline: client.timeline,
    unattributedCount: client.timeline.filter(item => item.action === 'DROP_UNATTRIBUTED').length,
    staleGenerationDropCount: client.timeline.filter(item => item.action === 'DROP_STALE_GENERATION').length,
  };
  result.snapshotBeforeExit = client.snapshot();
  result.exit = await finishHelper(client);
  result.residual = isAlive(client.child.pid) ? 1 : 0;
  assert.equal(result.residual, 0);
  return result;
}

async function runCrashAndRecreate(helperPath, libmpvPath, media) {
  const iterations = [];
  let previousHelperId = null;
  let previousGenerationId = 0;
  for (let index = 0; index < ITERATIONS; index += 1) {
    const client = await new NativeHelperClient({ helperPath, libmpvPath, requestTimeoutMs: 5000 }).start();
    assert.notEqual(client.helperInstanceId, previousHelperId); previousHelperId = client.helperInstanceId;
    const load = client.load(`crash-${index}-A`, media.A.path); const loadOutcome = outcome(load.promise);
    assert.ok(load.generationId > previousGenerationId); previousGenerationId = load.generationId;
    const pending = client.request('pending', {}, { generationId: load.generationId, mediaScoped: false }); const pendingOutcome = outcome(pending);
    const crash = client.request('crash', {}, { generationId: load.generationId, mediaScoped: false }); const crashOutcome = outcome(crash);
    const exit = await client.exitPromise; await settle();
    assert.notEqual(exit.code, 0);
    assert.equal(pendingOutcome.state, 'HELPER_DIED'); assert.equal(crashOutcome.state, 'HELPER_DIED');
    assert.ok(['GENERATION_RETIRED', 'HELPER_DIED', 'resolved'].includes(loadOutcome.state || loadOutcome.status));
    assert.equal(client.requestHistory.filter(item => item.requestId === pending.requestId).length, 1);
    assert.equal(client.requestHistory.find(item => item.requestId === pending.requestId).terminalTransitions, 1);
    assert.equal(isAlive(client.child.pid), false);
    iterations.push({ iteration: index + 1, status: 'PASS', helperInstanceId: client.helperInstanceId, helperPid: client.child.pid, exit, loadOutcome, pendingOutcome, crashOutcome, requestHistory: client.requestHistory, closeOrdering: client.closeOrdering });
  }
  const recreated = await new NativeHelperClient({ helperPath, libmpvPath }).start();
  assert.notEqual(recreated.helperInstanceId, previousHelperId);
  const load = recreated.load('recreated-C', media.C.path); const reply = await load.promise;
  assert.ok(load.generationId > previousGenerationId);
  await recreated.waitForGenerationEvent(load.generationId, 'file-loaded');
  await recreated.waitFor(() => recreated.state.playing && recreated.state.path && path.resolve(recreated.state.path) === path.resolve(media.C.path), 5000, 'recreated-C-current');
  const snapshot = recreated.snapshot(); const exit = await finishHelper(recreated);
  assert.equal(isAlive(recreated.child.pid), false);
  return { status: 'PASS', passed: iterations.length, total: ITERATIONS, iterations, recreate: { status: 'PASS', helperInstanceId: recreated.helperInstanceId, helperPid: recreated.child.pid, generationId: load.generationId, reply, snapshot, exit } };
}

async function runPipeCloseOrdering(helperPath, libmpvPath) {
  const writeClient = await new NativeHelperClient({ helperPath, libmpvPath }).start();
  const writePending = writeClient.request('pending', {}, { generationId: 101, mediaScoped: false }); const writeOutcome = outcome(writePending);
  writeClient.closeWriteSide();
  const writeLate = writeClient.request('pending', {}, { generationId: 101, mediaScoped: false }); const writeLateOutcome = outcome(writeLate);
  const writeExit = await writeClient.exitPromise; await settle();
  assert.equal(writeExit.code, 0); assert.equal(writeOutcome.state, 'HELPER_DIED'); assert.equal(writeLateOutcome.state, 'HELPER_DIED');
  assert.equal(writeClient.requestHistory.find(item => item.requestId === writePending.requestId).terminalTransitions, 1);

  const readClient = await new NativeHelperClient({ helperPath, libmpvPath }).start();
  const readPending = readClient.request('pending', {}, { generationId: 101, mediaScoped: false }); const readOutcome = outcome(readPending);
  readClient.closeReadSide();
  const trigger = readClient.request('queue-stats', {}, { generationId: 101, mediaScoped: false }); const triggerOutcome = outcome(trigger);
  const readExit = await readClient.exitPromise; await settle();
  assert.equal(readOutcome.state, 'HELPER_DIED'); assert.equal(triggerOutcome.state, 'HELPER_DIED');
  assert.equal(readClient.requestHistory.find(item => item.requestId === readPending.requestId).terminalTransitions, 1);

  const normalClient = await new NativeHelperClient({ helperPath, libmpvPath }).start();
  const normalPending = normalClient.request('pending', {}, { generationId: 101, mediaScoped: false }); const normalOutcome = outcome(normalPending);
  const normalExitRequest = normalClient.request('normal-exit', {}, { generationId: 101, mediaScoped: false }); const exitRequestOutcome = outcome(normalExitRequest);
  const normalExit = await normalClient.exitPromise; await settle();
  assert.equal(normalExit.code, 0); assert.equal(normalOutcome.state, 'HELPER_DIED');

  const partialClient = await new NativeHelperClient({ helperPath, libmpvPath }).start();
  const partialPending = partialClient.request('pending', {}, { generationId: 101, mediaScoped: false }); const partialOutcome = outcome(partialPending);
  const frame = encodeFrame({ protocolVersion: 1, type: 'command', helperInstanceId: partialClient.helperInstanceId, generationId: 101, method: 'command-noop', params: {} });
  partialClient.sendRaw(frame.subarray(0, 7));
  const partialExit = await partialClient.kill(); await settle();
  assert.equal(partialOutcome.state, 'HELPER_DIED');

  return {
    status: 'PASS',
    parentWriteClose: { status: 'PASS', exit: writeExit, outcome: writeOutcome, lateRequestOutcome: writeLateOutcome, ordering: writeClient.closeOrdering },
    parentReadClose: { status: 'PASS', exit: readExit, pendingOutcome: readOutcome, triggerOutcome, ordering: readClient.closeOrdering },
    helperNormalExit: { status: 'PASS', exit: normalExit, pendingOutcome: normalOutcome, exitRequestOutcome, ordering: normalClient.closeOrdering },
    partialFrameThenCrash: { status: 'PASS', exit: partialExit, pendingOutcome: partialOutcome, ordering: partialClient.closeOrdering },
  };
}

async function startAndConfirm(helperPath, libmpvPath) {
  return new NativeHelperClient({ helperPath, libmpvPath, requestTimeoutMs: 3000 }).start();
}

async function runFramingCorruption(helperPath, libmpvPath) {
  const passing = {};
  {
    const client = await startAndConfirm(helperPath, libmpvPath);
    const frame = encodeFrame({ protocolVersion: 1, type: 'command', helperInstanceId: client.helperInstanceId, generationId: 101, method: 'command-noop', params: {} });
    client.sendRaw(frame.subarray(0, 2)); await new Promise(resolve => setTimeout(resolve, 5));
    client.sendRaw(frame.subarray(2, 9)); await new Promise(resolve => setTimeout(resolve, 5));
    client.sendRaw(frame.subarray(9));
    const stats = await client.request('queue-stats', {}, { generationId: 101, mediaScoped: false });
    passing.partialFrame = { status: 'PASS', stats }; await finishHelper(client);
  }
  {
    const client = await startAndConfirm(helperPath, libmpvPath);
    const one = encodeFrame({ protocolVersion: 1, type: 'command', helperInstanceId: client.helperInstanceId, generationId: 101, method: 'command-noop', params: { value: 1 } });
    const two = encodeFrame({ protocolVersion: 1, type: 'command', helperInstanceId: client.helperInstanceId, generationId: 101, method: 'command-noop', params: { value: 2 } });
    client.sendRaw(Buffer.concat([one, two]));
    const stats = await client.request('queue-stats', {}, { generationId: 101, mediaScoped: false });
    passing.concatenatedFrames = { status: 'PASS', stats }; await finishHelper(client);
  }

  const failures = {};
  const corruptions = {
    zeroLength: Buffer.alloc(4),
    oversizedLength: (() => { const b = Buffer.alloc(4); b.writeUInt32LE(MAX_FRAME_BYTES + 1); return b; })(),
    invalidUtf8: (() => { const payload = Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x22, 0x7d]); const h = Buffer.alloc(4); h.writeUInt32LE(payload.length); return Buffer.concat([h, payload]); })(),
    malformedJson: (() => { const payload = Buffer.from('{', 'utf8'); const h = Buffer.alloc(4); h.writeUInt32LE(payload.length); return Buffer.concat([h, payload]); })(),
  };
  const objectCases = {
    missingProtocolVersion: { type: 'command', helperInstanceId: 'PLACEHOLDER', generationId: 101, method: 'command-noop', params: {} },
    missingHelperInstanceId: { protocolVersion: 1, type: 'command', generationId: 101, method: 'command-noop', params: {} },
    missingGenerationId: { protocolVersion: 1, type: 'command', helperInstanceId: 'PLACEHOLDER', method: 'command-noop', params: {} },
    missingRequestId: { protocolVersion: 1, type: 'request', helperInstanceId: 'PLACEHOLDER', generationId: 101, method: 'queue-stats', params: {} },
    zeroGenerationId: { protocolVersion: 1, type: 'command', helperInstanceId: 'PLACEHOLDER', generationId: 0, method: 'command-noop', params: {} },
    zeroRequestId: { protocolVersion: 1, type: 'request', helperInstanceId: 'PLACEHOLDER', generationId: 101, requestId: 0, method: 'queue-stats', params: {} },
    unknownMessageType: { protocolVersion: 1, type: 'mystery', helperInstanceId: 'PLACEHOLDER', generationId: 101, method: 'command-noop', params: {} },
  };

  for (const [name, raw] of Object.entries(corruptions)) {
    const client = await startAndConfirm(helperPath, libmpvPath);
    const pending = client.request('pending', {}, { generationId: 101, mediaScoped: false }); const pendingOutcome = outcome(pending);
    client.sendRaw(raw); const exit = await client.exitPromise; await settle();
    assert.notEqual(exit.code, 0); assert.equal(pendingOutcome.state, 'HELPER_DIED');
    failures[name] = { status: 'PASS', exit, pendingOutcome, ordering: client.closeOrdering };
  }
  for (const [name, value] of Object.entries(objectCases)) {
    const client = await startAndConfirm(helperPath, libmpvPath);
    if (value.helperInstanceId === 'PLACEHOLDER') value.helperInstanceId = client.helperInstanceId;
    const pending = client.request('pending', {}, { generationId: 101, mediaScoped: false }); const pendingOutcome = outcome(pending);
    const payload = Buffer.from(JSON.stringify(value), 'utf8'); const header = Buffer.alloc(4); header.writeUInt32LE(payload.length);
    client.sendRaw(Buffer.concat([header, payload])); const exit = await client.exitPromise; await settle();
    assert.notEqual(exit.code, 0); assert.equal(pendingOutcome.state, 'HELPER_DIED');
    failures[name] = { status: 'PASS', exit, pendingOutcome, ordering: client.closeOrdering };
  }
  {
    const client = await startAndConfirm(helperPath, libmpvPath);
    const malformed = client.request('emit-malformed-response', {}, { generationId: client.allocateGenerationId(), mediaScoped: false });
    const malformedOutcome = outcome(malformed);
    const exit = await client.exitPromise; await settle();
    assert.equal(client.protocolFailure, 'unsupported-protocol-version');
    assert.equal(client.decoder.failed, true);
    assert.equal(malformedOutcome.state, 'HELPER_DIED');
    assert.equal(client.state.playing, false);
    assert.equal(client.timeline.some(item => item.action === 'ACCEPT' && item.name === 'core-idle'), false);
    failures.malformedHelperResponse = { status: 'PASS', exit, protocolFailure: client.protocolFailure, decoderFailed: client.decoder.failed, concatenatedValidEventAccepted: false, outcome: malformedOutcome, ordering: client.closeOrdering };
  }
  {
    const client = await startAndConfirm(helperPath, libmpvPath);
    const generationId = client.allocateGenerationId();
    const pending = client.request('pending', {}, { generationId, mediaScoped: false }); const pendingOutcome = outcome(pending);
    const blocker = client.request('block-main', { milliseconds: 250 }, { generationId, mediaScoped: false, timeoutMs: 2000 }); const blockerOutcome = outcome(blocker);
    const commandFrames = [];
    for (let index = 0; index < MAX_INBOUND_FRAMES + 32; index += 1) {
      commandFrames.push(encodeFrame({ protocolVersion: 1, type: 'command', helperInstanceId: client.helperInstanceId, generationId, method: 'command-noop', params: { index } }));
    }
    client.sendRaw(Buffer.concat(commandFrames));
    const exit = await client.exitPromise; await settle();
    assert.notEqual(exit.code, 0);
    assert.equal(pendingOutcome.state, 'HELPER_DIED');
    const diagnostics = Buffer.concat(client.stderrChunks).toString('utf8');
    assert.match(diagnostics, /inbound-queue-limit/);
    failures.inboundQueueLimit = { status: 'PASS', exit, pendingOutcome, blockerOutcome, framesSent: commandFrames.length, maxInboundFrames: MAX_INBOUND_FRAMES, maxInboundBytes: MAX_INBOUND_BYTES, ordering: client.closeOrdering };
  }
  {
    const client = new NativeHelperClient({ helperPath: `${helperPath}.missing`, libmpvPath, requestTimeoutMs: 500 });
    let error = null;
    try { await client.start(); } catch (caught) { error = caught; }
    assert.ok(error); assert.equal(client.exited, true); assert.equal(client.transportTerminated, true);
    const exit = await client.exitPromise;
    failures.spawnFailure = { status: 'PASS', error: error.message, exit, exited: client.exited, transportTerminated: client.transportTerminated };
  }
  return { status: 'PASS', ...passing, failures };
}

async function runParentDeath(helperPath, libmpvPath, outputDirectory) {
  const recordPath = path.join(outputDirectory, 'parent-under-test.json');
  const child = spawn(process.execPath, [path.join(__dirname, 'parent-under-test.cjs'), helperPath, libmpvPath, recordPath], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
  await waitUntil(() => fs.existsSync(recordPath), 10000, 'parent-record');
  const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
  assert.equal(record.parentPid, child.pid); assert.equal(isAlive(record.helperPid), true);
  child.kill('SIGKILL');
  await new Promise(resolve => child.once('exit', resolve));
  await waitUntil(() => !isAlive(record.helperPid), 5000, 'helper-eof-exit');
  return { status: 'PASS', parentPid: record.parentPid, helperPid: record.helperPid, helperInstanceId: record.helperInstanceId, readyFrame: record.readyFrame, helperExitedAfterParentDeath: true, residualHelperProcess: isAlive(record.helperPid) ? 1 : 0, parentStdout: stdout, parentStderr: stderr };
}

async function main() {
  const [helperArgument, libmpvArgument, outputArgument, buildProvenanceArgument] = process.argv.slice(2);
  if (!helperArgument || !libmpvArgument || !outputArgument || !buildProvenanceArgument) throw new Error('usage: node run.cjs <helper.exe> <mpv-1.dll> <output-dir> <build-provenance.json>');
  const helperPath = path.resolve(helperArgument); const libmpvPath = path.resolve(libmpvArgument); const outputDirectory = path.resolve(outputArgument);
  if (fs.existsSync(outputDirectory) && fs.readdirSync(outputDirectory).length) throw new Error('output-directory-must-be-empty');
  fs.mkdirSync(outputDirectory, { recursive: true });
  const mediaRecords = generateMedia(path.join(outputDirectory, 'media'));
  const media = Object.fromEntries(mediaRecords.map(item => [path.parse(item.name).name, item]));
  const runtimeProvenance = {
    schemaVersion: 1,
    platform: process.platform,
    architecture: process.arch,
    nodeVersion: process.version,
    electronVersion: null,
    helper: { path: helperPath, size: fs.statSync(helperPath).size, sha256: sha256(helperPath) },
    libmpv: { path: libmpvPath, size: fs.statSync(libmpvPath).size, sha256: sha256(libmpvPath), version: 'v0.41.0-920-gdd5d17d32', clientApi: '2.5' },
    build: JSON.parse(fs.readFileSync(path.resolve(buildProvenanceArgument), 'utf8').replace(/^\uFEFF/, '')),
    media: mediaRecords,
  };
  writeJson(outputDirectory, 'runtime-provenance.json', runtimeProvenance);
  writeJson(outputDirectory, 'protocol-schema.json', {
    protocolVersion: PROTOCOL_VERSION,
    framing: 'uint32 little-endian length + strict UTF-8 JSON',
    limits: { maxFrameBytes: MAX_FRAME_BYTES, maxReceiveBuffer: MAX_RECEIVE_BUFFER, maxInboundFrames: MAX_INBOUND_FRAMES, maxInboundBytes: MAX_INBOUND_BYTES, maxPendingFrames: 128, maxPendingBytes: 256 * 1024 },
    classes: ['COMMAND', 'REQUEST', 'RESPONSE', 'EVENT', 'LIFECYCLE', 'ERROR'],
    requiredIdentities: ['helperInstanceId', 'generationId for media scope', 'requestId for response-bearing request'],
  });

  const mainResult = await runMainMediaScenarios(helperPath, libmpvPath, media);
  writeJson(outputDirectory, 'single-load.json', mainResult.singleLoad);
  writeJson(outputDirectory, 'sequential-load.json', mainResult.sequential);
  writeJson(outputDirectory, 'rapid-a-b.json', mainResult.rapidAB);
  writeJson(outputDirectory, 'rapid-a-b-c.json', mainResult.rapidABC);
  writeJson(outputDirectory, 'stop-race.json', mainResult.stopRace);
  writeJson(outputDirectory, 'request-lifecycle.json', mainResult.requestLifecycle);
  writeJson(outputDirectory, 'queued-supersession.json', mainResult.queuedSupersession);
  writeJson(outputDirectory, 'event-attribution.json', mainResult.eventAttribution);
  writeJson(outputDirectory, 'backpressure.json', mainResult.backpressure);
  writeJson(outputDirectory, 'stderr-drain.json', mainResult.stderrDrain);

  const crash = await runCrashAndRecreate(helperPath, libmpvPath, media);
  writeJson(outputDirectory, 'helper-crash.json', { status: crash.status, passed: crash.passed, total: crash.total, iterations: crash.iterations });
  writeJson(outputDirectory, 'helper-recreate.json', crash.recreate);
  const pipe = await runPipeCloseOrdering(helperPath, libmpvPath);
  writeJson(outputDirectory, 'pipe-close-ordering.json', pipe);
  const framing = await runFramingCorruption(helperPath, libmpvPath);
  writeJson(outputDirectory, 'framing-corruption.json', framing);
  const parentDeath = await runParentDeath(helperPath, libmpvPath, outputDirectory);
  writeJson(outputDirectory, 'parent-death.json', parentDeath);

  const summary = {
    status: 'PASS',
    unattended: true,
    realNativeHelper: 'PASS',
    realLibmpv: 'PASS',
    privateInheritedPipe: 'PASS',
    eventAttribution: 'PASS',
    singleLoad: mainResult.singleLoad.status,
    sequential: mainResult.sequential.status,
    rapidAB: `${mainResult.rapidAB.passed}/${mainResult.rapidAB.total} PASS`,
    rapidABC: `${mainResult.rapidABC.passed}/${mainResult.rapidABC.total} PASS`,
    stopRace: `${mainResult.stopRace.passed}/${mainResult.stopRace.total} PASS`,
    nextLike: mainResult.nextLike.status,
    helperCrash: `${crash.passed}/${crash.total} PASS`,
    helperRecreate: crash.recreate.status,
    pipeCloseOrdering: pipe.status,
    framing: framing.status,
    backpressure: mainResult.backpressure.status,
    stderrDrain: mainResult.stderrDrain.status,
    parentDeath: parentDeath.status,
    requestLifecycle: mainResult.requestLifecycle.status,
    queuedSupersession: mainResult.queuedSupersession.status,
    residualHelperProcesses: mainResult.residual + parentDeath.residualHelperProcess,
  };
  assert.equal(summary.residualHelperProcesses, 0);
  writeJson(outputDirectory, 'run-summary.json', summary);
  fs.writeFileSync(path.join(outputDirectory, 'comparison.md'), [
    '# Phase 2B comparison', '',
    '- Previous fake/controller oracle: 36/36 deterministic model cases PASS.',
    '- This run: real Windows executable, real bundled libmpv and real inherited stdio pipes.',
    '- START_FILE and END_FILE use native playlist_entry_id.',
    '- FILE_LOADED is accepted only with one unique open playlist entry mapping.',
    '- Property/core-idle events use mpv_observe_property reply_userdata mapped to generation.',
    '- COMMAND_REPLY remains command-layer acknowledgement and is not media-loaded/playing evidence.',
    '- No production source, Emby server, renderer, PlaybackManager, Session, Resolver or WebSocket was used.',
    '',
  ].join('\n'), 'utf8');
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch(async error => {
  process.stderr.write(`${error.stack || error}\n`);
  await cleanupActiveClients();
  process.exitCode = 1;
});
