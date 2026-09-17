'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
  FrameDecoder,
  NativeHelperClient,
  ProtocolFailure,
  encodeFrame,
  validateIncoming
} = require('../src/electronapp/native-helper/controller');

test('framed protocol decodes partial and concatenated messages', function () {
  const first = {protocolVersion: 1, type: 'lifecycle', scope: 'helper', helperInstanceId: 'h1', name: 'ready'};
  const second = {protocolVersion: 1, type: 'event', scope: 'generation', helperInstanceId: 'h1', generationId: 1, name: 'core-idle', value: false};
  const bytes = Buffer.concat([encodeFrame(first), encodeFrame(second)]);
  const decoder = new FrameDecoder();
  assert.deepEqual(decoder.push(bytes.subarray(0, 3)), []);
  assert.deepEqual(decoder.push(bytes.subarray(3)), [first, second]);
});

test('framed protocol fails closed on malformed input', function () {
  const zero = Buffer.alloc(4);
  assert.throws(() => new FrameDecoder().push(zero), error => error instanceof ProtocolFailure && error.code === 'zero-length-frame');
  const oversized = Buffer.alloc(4);
  oversized.writeUInt32LE(65537, 0);
  assert.throws(() => new FrameDecoder().push(oversized), error => error.code === 'oversized-frame');
  const invalidUtf8 = Buffer.from([2, 0, 0, 0, 0xc3, 0x28]);
  assert.throws(() => new FrameDecoder().push(invalidUtf8), error => error.code === 'invalid-utf8');
});

test('incoming schema rejects missing identities and unsupported versions', function () {
  assert.throws(() => validateIncoming({protocolVersion: 2}), error => error.code === 'unsupported-protocol-version');
  assert.throws(() => validateIncoming({protocolVersion: 1, type: 'lifecycle', scope: 'helper', name: 'ready'}), error => error.code === 'missing-helper-instance-id');
});

test('typed operation failures are generation-scoped, nonfatal and privacy-safe', function () {
  const message = {protocolVersion: 1, type: 'event', scope: 'generation', helperInstanceId: 'h1', generationId: 1,
    name: 'operation-error', operation: 'set-property', property: 'sub-back-color', errorCode: -10,
    error: 'error setting option', fatal: false};
  assert.doesNotThrow(() => validateIncoming(message));
  const commandMessage = {...message, operation: 'command'};
  delete commandMessage.property;
  assert.doesNotThrow(() => validateIncoming(commandMessage));
  assert.throws(() => validateIncoming({...message, fatal: true}), error => error.code === 'invalid-operation-error-fatality');
  assert.throws(() => validateIncoming({...message, property: undefined}), error => error.code === 'invalid-operation-error-property');
});

test('controller preserves request, generation and helper lifecycle', async function () {
  const accepted = [];
  const client = new NativeHelperClient({
    helperPath: process.execPath,
    libmpvPath: path.join(__dirname, 'fixtures', 'native-helper-fake.cjs'),
    parentWindowHandle: '1',
    expectedLibmpvVersion: 'fake-mpv',
    onEvent: message => accepted.push(message)
  });
  await client.start();
  const generation = client.beginGeneration('A', ['core-idle', 'time-pos']);
  const load = client.load(['loadfile', 'A.wav']);
  await load.promise;
  await client.waitForGenerationEvent(generation, 'core-idle');
  assert.equal(client.state.playing, true);
  assert.ok(accepted.some(message => message.name === 'core-idle' && message.generationId === generation));
  assert.deepEqual(await client.getProperty('video-out-params'), {nested: [1, true, 'ok']});
  const beforeFailure = client.snapshot();
  client.setProperty('sub-back-color', '0/0/0/1');
  await client.waitFor(() => client.operationErrors.length === 1, 1000, 'operation-error');
  const afterFailure = client.snapshot();
  assert.equal(afterFailure.helperPid, beforeFailure.helperPid);
  assert.equal(afterFailure.helperInstanceId, beforeFailure.helperInstanceId);
  assert.equal(afterFailure.currentGenerationId, generation);
  assert.equal(afterFailure.operationErrors[0].property, 'sub-back-color');
  assert.equal(afterFailure.operationErrors[0].fatal, false);
  assert.equal(client.transportTerminated, false);
  assert.equal(client.exited, false);
  assert.deepEqual(await client.getProperty('video-out-params'), {nested: [1, true, 'ok']});
  for (let index = 0; index < 70; index++) client.setProperty('sub-back-color', '0/0/0/1');
  await client.waitFor(() => accepted.filter(message => message.name === 'operation-error').length === 71, 1000, 'bounded-operation-errors');
  assert.equal(client.operationErrors.length, 64);
  client.retireGeneration('superseded');
  assert.equal(client.currentGenerationId, null);
  await client.kill();
  assert.equal(client.pending.size, 0);
  assert.ok(client.requestHistory.every(entry => entry.terminalTransitions === 1));
});

test('helper crash rejects pending request exactly once and future request fails', async function () {
  const client = new NativeHelperClient({
    helperPath: process.execPath,
    libmpvPath: path.join(__dirname, 'fixtures', 'native-helper-fake.cjs'),
    parentWindowHandle: '1',
    expectedLibmpvVersion: 'fake-mpv'
  });
  await client.start();
  client.beginGeneration('A', []);
  const pending = client.request('pending', {}, {timeoutMs: 5000});
  client.child.kill();
  await assert.rejects(pending, error => error.state === 'HELPER_DIED');
  await client.exitPromise;
  await assert.rejects(client.request('get-property', {name: 'x'}), error => error.state === 'HELPER_DIED');
  assert.ok(client.requestHistory.every(entry => entry.terminalTransitions === 1));
});

test('ready fails closed when required native surface capabilities are missing', async function () {
  const client = new NativeHelperClient({
    helperPath: process.execPath,
    libmpvPath: path.join(__dirname, 'fixtures', 'native-helper-bad-handshake.cjs'),
    parentWindowHandle: '1',
    expectedLibmpvVersion: 'fake-mpv'
  });
  await assert.rejects(client.start(), error => error.code === 'invalid-helper-handshake' || error.code === 'missing-helper-capability');
  assert.equal(client.exited, true);
});
