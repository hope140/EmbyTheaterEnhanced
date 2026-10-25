'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {temporaryRoot} = require('./helpers/range-fixture-root.cjs');
const {createStore} = require('../tools/shared-playback-cache/store.cjs');
const {createProxy} = require('../tools/shared-playback-cache/proxy.cjs');
const {source, get, identity, delay} = require('../tools/shared-playback-cache/fixture.cjs');

const MiB = 1024 * 1024;
const deadline = async (predicate, message, timeoutMs = 3000) => {
  const end = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < end) await delay(2);
  assert(predicate(), message);
};

async function fixture(t, {writeFile, total = 11 * MiB, nextBytes = 12 * MiB, paceMs = 0, releaseGate} = {}) {
  const root = temporaryRoot('ete-preload-backpressure-', ['']);
  let origin, store, proxy;
  t.after(async () => {
    releaseGate?.();
    const results = await Promise.allSettled([
      Promise.resolve().then(() => proxy?.close()),
      Promise.resolve().then(() => store?.close()),
      Promise.resolve().then(() => origin?.close()),
    ]);
    await fs.rm(root, {recursive: true, force: true});
    const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
    if (errors.length) throw new AggregateError(errors, 'preload-backpressure-cleanup-failed');
  });
  const io = {...fs, ...(writeFile ? {writeFile} : {})};
  store = await createStore({root, currentBytes: MiB, nextBytes, maxPendingBytes: 512 * 1024,
    maxEntries: 256, io});
  // Reserve the actual fixed guard before any ephemeral HTTP listener.
  origin = await source({bytes: total, firstDelay: 0, tailDelay: 0,
    chunkBytes: paceMs ? 64 * 1024 : 1024 * 1024, paceMs});
  proxy = await createProxy({store, authorize: async () => origin.grant(), mediaBufferBytes: 2 * MiB});
  return {root, origin, store, proxy};
}

function gateFirstBlock() {
  let release, didStart = false;
  let released = false;
  const gate = new Promise(resolve => {release = () => {released = true; resolve();};});
  const writeFile = async (file, ...args) => {
    if (!released && path.basename(file).startsWith('.block-')) {didStart = true; await gate;}
    return fs.writeFile(file, ...args);
  };
  return {writeFile, get didStart() {return didStart;}, release: () => release()};
}

test('background preload backpressures one 11 MiB Range with bounded capture and complete durable coverage', {timeout: 15000}, async t => {
  const gate = gateFirstBlock();
  const {origin, store, proxy} = await fixture(t, {writeFile: gate.writeFile, releaseGate: gate.release});
  const handle = await proxy.open(identity('B'), 'next'), key = await handle.ready();
  const controller = new AbortController();
  const warming = handle.preload({maxBytes: origin.data.length, signal: controller.signal});
  await deadline(() => gate.didStart, 'first durable block write did not reach the controlled gate');
  assert.equal(origin.requests.length, 1, 'slow storage must not restart or split the owned source Range');
  assert.deepEqual([origin.requests[0].start, origin.requests[0].end], [0, origin.data.length - 1]);
  assert.ok(proxy.status().peakCaptureBytes <= MiB,
    'capture memory stays within half the configured two MiB reservation');
  assert.ok(proxy.status().peakMediaReservedBytes <= 2 * MiB, 'all reserved media memory stays within the configured cap');
  assert.ok(proxy.status().originReadHighWaterMarkBytes <= 256 * 1024, 'origin stream buffering retains its fixed high water mark');
  assert.ok(store.status().pending <= 512 * 1024, 'store pending bytes stay within the real quota');
  assert.ok(proxy.status().peakOrigins <= 1);

  gate.release();
  await warming;
  await proxy.drain();
  const covered = await store.coverage(key);
  assert.equal(origin.requests.length, 1, 'all bytes were captured from the same HTTP Range');
  assert.deepEqual(covered, {bytes: origin.data.length, total: origin.data.length, verifiedBytes: origin.data.length});
  for (let offset = 0; offset < origin.data.length; offset += 256 * 1024) {
    const length = Math.min(256 * 1024, origin.data.length - offset);
    assert.deepEqual(await store.read(key, offset, length), origin.data.subarray(offset, offset + length));
  }
  assert.equal(proxy.status().captureBytes, 0);
  assert.equal(store.status().pending, 0);
});

test('cancel and foreground preemption close the held background origin and never publish ready', {timeout: 15000}, async t => {
  for (const action of ['cancel', 'foreground']) {
    const gate = gateFirstBlock();
    const {origin, store, proxy} = await fixture(t, {writeFile: gate.writeFile, releaseGate: gate.release, paceMs: 10});
    const current = await proxy.open(identity('A'));
    const next = await proxy.open(identity('B'), 'next');
    await Promise.all([current.ready(), next.ready()]);
    const controller = new AbortController();
    let completed = false, completion;
    const warming = next.preload({maxBytes: origin.data.length, signal: controller.signal})
      .then(value => {completed = true; completion = {ok: true, value}; return completion;},
        error => {completed = true; completion = {ok: false, error}; return completion;});
    await deadline(() => gate.didStart === true, 'first durable block write did not reach the controlled gate');
    assert.equal(origin.requests.length, 1);
    if (action === 'cancel') controller.abort();
    else {
      const result = await get(current.url, 0, 4096);
      assert.equal(result.status, 206);
      assert.deepEqual(result.body, origin.data.subarray(0, 4096));
    }
    await deadline(() => origin.requests[0].closed, action + ' must close the physical background origin during the write gate');
    assert.equal(origin.requests.length, action === 'cancel' ? 1 : 2);
    assert.ok(!completed || completion.ok === false, 'the held write cannot publish a successful preload');

    gate.release();
    const outcome = await warming;
    assert.equal(outcome.ok, false, 'retired/cancelled preload must reject instead of resolving ready');
    assert.match(String(outcome.error?.reason || outcome.error?.message), /cancelled/);
    await Promise.all([proxy.drain(), current.stop(), next.stop()]);
    assert.equal(origin.requests[0].closed, true);
    assert.equal(proxy.status().activeOrigins, 0);
    assert.equal(proxy.status().captureBytes, 0);
    assert.equal(proxy.status().writes, 0);
    assert.equal(store.status().pending, 0);
  }
});

test('real quota and block IO failures reject or mark preload explicitly partial, without source retries', {timeout: 15000}, async t => {
  for (const kind of ['quota', 'block-io']) {
    let failed = false;
    const writeFile = async (file, ...args) => {
      if (kind === 'block-io' && !failed && path.basename(file).startsWith('.block-')) {
        failed = true; throw Error('owned-test-block-write-failure');
      }
      return fs.writeFile(file, ...args);
    };
    const {origin, store, proxy} = await fixture(t, {writeFile, nextBytes: kind === 'quota' ? 128 * 1024 : 12 * MiB});
    const handle = await proxy.open(identity('B'), 'next'), key = await handle.ready();
    let outcome;
    try {outcome = {ok: true, value: await handle.preload({maxBytes: origin.data.length, signal: new AbortController().signal})};}
    catch (error) {outcome = {ok: false, error};}
    await proxy.drain();
    if (kind === 'block-io') assert.equal(failed, true, 'the test exercised a real store block write');
    assert.equal(origin.requests.length, 1, kind + ' failure cannot trigger a source retry');
    const covered = await store.coverage(key);
    assert.ok(covered.bytes < origin.data.length);
    if (outcome.ok) {
      assert.equal(outcome.value.ready, false, kind + ' partial result must explicitly say it is not ready');
      assert.equal(outcome.value.partial, true, kind + ' short coverage must be identified as partial');
    } else assert.ok(outcome.error instanceof Error);
    assert.equal(origin.requests.length, 1, 'no second Range request retried missed cache writes');
    assert.equal(proxy.status().captureBytes, 0);
    assert.equal(store.status().pending, 0);
  }
});
