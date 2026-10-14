'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {EventEmitter} = require('node:events');
const {validateCandidateArchiveInWorker, validateCandidateMembersInWorker} = require('../src/electronapp/enhanced/mpv-kernel-validation');

const helper = {sha256: 'a'.repeat(64), version: '1.0.0'};

test('archive validation executes the fixed parser in a worker and returns a fixed error code', async () => {
  await assert.rejects(validateCandidateArchiveInWorker(Buffer.from('not a zip'), helper), error => {
    assert.equal(error.code, 'zip-invalid');
    assert.doesNotMatch(error.message, /[A-Z]:\\|candidate\.json|not a zip/);
    return true;
  });
});

test('pre-cancelled archive and member validation do not start work', async () => {
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(validateCandidateArchiveInWorker(Buffer.from('not a zip'), helper, {signal: cancelled.signal}),
    error => error.code === 'validation-cancelled');
  await assert.rejects(validateCandidateMembersInWorker({}, helper, {signal: cancelled.signal}),
    error => error.code === 'validation-cancelled');
});

class ControlledWorker extends EventEmitter {
  static instances = [];
  static failPostMessage = false;
  constructor() {
    super();
    ControlledWorker.instances.push(this);
    this.terminationRequested = false;
    this.posted = null;
  }
  postMessage(message) {
    if (ControlledWorker.failPostMessage) throw new Error('synthetic-post-failure');
    this.posted = message;
  }
  terminate() {
    this.terminationRequested = true;
    return new Promise(resolve => { this.finishTermination = code => { this.emit('exit', code); resolve(code); }; });
  }
  finish(code) { this.emit('exit', code); }
}

test('cancel rejects only after the exact worker exits', async () => {
  ControlledWorker.instances.length = 0;
  const controller = new AbortController();
  const pending = validateCandidateArchiveInWorker(Buffer.from('synthetic archive'), helper,
    {signal: controller.signal, timeoutMs: 5000, WorkerClass: ControlledWorker});
  await new Promise(resolve => setImmediate(resolve));
  const worker = ControlledWorker.instances[0];
  assert.ok(worker);
  controller.abort();
  assert.equal(worker.terminationRequested, true);
  let settled = false;
  pending.finally(() => { settled = true; }).catch(() => {});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false, 'abort waits for the owned worker exit');
  worker.finishTermination(1);
  await assert.rejects(pending, error => error.code === 'validation-cancelled');
  assert.equal(settled, true);
});

test('successful result is not returned until the validation worker exits', async () => {
  ControlledWorker.instances.length = 0;
  const pending = validateCandidateArchiveInWorker(Buffer.from('synthetic archive'), helper,
    {timeoutMs: 5000, WorkerClass: ControlledWorker});
  await new Promise(resolve => setImmediate(resolve));
  const worker = ControlledWorker.instances[0];
  const members = Object.fromEntries(['candidate.json', 'mpv-1.dll', 'SOURCE.txt', 'NOTICE.txt']
    .map(name => [name, new Uint8Array([1, 2, 3])]));
  worker.emit('message', {ok: true, result: {
    candidateId: 'a'.repeat(64), metadata: {schemaVersion: 1}, checks: {staticCompatibility: 'PASS'}, members
  }});
  let settled = false;
  pending.then(() => { settled = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false, 'success waits for the owned worker exit');
  worker.finish(0);
  const result = await pending;
  assert.equal(result.candidateId, 'a'.repeat(64));
  assert.equal(settled, true);
});

test('timeout rejects only after terminating and joining its worker', async () => {
  ControlledWorker.instances.length = 0;
  const pending = validateCandidateArchiveInWorker(Buffer.from('synthetic archive'), helper,
    {timeoutMs: 5, WorkerClass: ControlledWorker});
  await new Promise(resolve => setTimeout(resolve, 15));
  const worker = ControlledWorker.instances[0];
  assert.equal(worker.terminationRequested, true);
  let settled = false;
  pending.catch(() => { settled = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  worker.finishTermination(1);
  await assert.rejects(pending, error => error.code === 'validation-timeout');
});

test('worker error waits for its exit event before rejecting', async () => {
  ControlledWorker.instances.length = 0;
  const pending = validateCandidateArchiveInWorker(Buffer.from('synthetic archive'), helper,
    {timeoutMs: 5000, WorkerClass: ControlledWorker});
  await new Promise(resolve => setImmediate(resolve));
  const worker = ControlledWorker.instances[0];
  let settled = false;
  pending.catch(() => { settled = true; });
  worker.emit('error', new Error('synthetic worker error'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  worker.finish(1);
  await assert.rejects(pending, error => error.code === 'validation-worker-failed');
});

test('postMessage failure rejects only after the worker termination promise completes', async () => {
  ControlledWorker.instances.length = 0;
  ControlledWorker.failPostMessage = true;
  try {
    const pending = validateCandidateArchiveInWorker(Buffer.from('synthetic archive'), helper,
      {timeoutMs: 5000, WorkerClass: ControlledWorker});
    await new Promise(resolve => setImmediate(resolve));
    const worker = ControlledWorker.instances[0];
    assert.equal(worker.terminationRequested, true);
    let settled = false;
    pending.catch(() => { settled = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false);
    worker.finishTermination(1);
    await assert.rejects(pending, error => error.code === 'validation-worker-failed');
  } finally {
    ControlledWorker.failPostMessage = false;
  }
});
