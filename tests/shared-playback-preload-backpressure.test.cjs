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

async function fixture(t, {writeFile, total = 11 * MiB, nextBytes = 12 * MiB, paceMs = 0,
  releaseGate, originFactory} = {}) {
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
  origin = originFactory ? await originFactory(total) : await source({bytes: total, firstDelay: 0, tailDelay: 0,
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

const BLOCK = 256 * 1024;

async function bounded(promise, message, timeoutMs = 3000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error(message)), timeoutMs);
    })]);
  } finally {clearTimeout(timer);}
}

async function controlledOrigin(total, mode) {
  const http = require('node:http');
  const bytes = Buffer.allocUnsafe(total);
  for (let index = 0; index < bytes.length; index++) bytes[index] = (index * 13 + (index >>> 8)) & 255;
  const requests = [], sockets = new Set();
  const server = http.createServer((req, res) => {
    const match = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || '');
    const start = match ? Number(match[1]) : 0, end = match ? Number(match[2]) : total - 1;
    const row = {start, end, sent: 0, closed: false}; requests.push(row);
    res.once('close', () => {row.closed = true;});
    if (!match || start !== 0 || end !== total - 1) {res.writeHead(416).end(); return;}
    res.writeHead(206, {'Content-Type': 'application/octet-stream', 'Content-Length': total,
      'Content-Range': `bytes ${start}-${end}/${total}`, 'Last-Modified': 'Wed, 21 Oct 2026 08:00:00 GMT'});
    const fragment = bytes.subarray(0, BLOCK + 17);
    row.sent = fragment.length;
    res.write(fragment);
    if (mode === 'short') {res.end(); return;}
    if (mode === 'disconnect') {setImmediate(() => res.destroy()); return;}
    // The abort/close variants intentionally leave the declared body open.
  });
  server.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
  await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
  const url = `http://127.0.0.1:${server.address().port}/controlled-binary`;
  return {url, bytes, requests,
    grant: () => ({url, origin: new URL(url).origin, metadata: {total, lastModified: 'Wed, 21 Oct 2026 08:00:00 GMT'}}),
    close: async () => {for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve));}};
}

async function noLateReady(handle, origin, store, proxy, key) {
  const outcome = await handle.preload({maxBytes: origin.bytes.length, signal: new AbortController().signal})
    .then(value => ({ok: true, value}), error => ({ok: false, error}));
  assert.equal(outcome.ok, false, 'truncated or interrupted origin cannot publish preload readiness');
  assert.equal(origin.requests.length, 1, 'failed body is never retried from the source');
  assert.equal(origin.requests[0].closed, true, 'the physical source response must be closed');
  await proxy.drain();
  const coverage = await store.coverage(key);
  assert.equal(coverage.bytes % BLOCK, 0, 'only complete store blocks may commit');
  assert.equal(coverage.bytes, BLOCK, 'the first complete block survives; the in-flight partial block is discarded');
  assert.equal(coverage.verifiedBytes, BLOCK);
  assert.equal(proxy.status().activeOrigins, 0);
  assert.equal(proxy.status().captureBytes, 0);
  assert.equal(proxy.status().writes, 0);
  assert.equal(store.status().pending, 0);
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

test('a failed final full-block write after the complete source body preserves earlier blocks but cannot become ready', {timeout: 12000}, async t => {
  const total = 3 * BLOCK;
  let blockWrites = 0;
  const writeFile = async (file, ...args) => {
    if (path.basename(file).startsWith('.block-') && ++blockWrites === 3) throw Error('owned-final-block-write-failure');
    return fs.writeFile(file, ...args);
  };
  const {root, origin, store, proxy} = await fixture(t, {total, nextBytes: 4 * BLOCK, writeFile});
  const handle = await proxy.open(identity('B'), 'next'), key = await handle.ready();
  const outcome = await handle.preload({maxBytes: total, signal: new AbortController().signal})
    .then(value => ({ok: true, value}), error => ({ok: false, error}));
  assert.equal(origin.requests.length, 1, 'the final disk failure cannot trigger a source refetch');
  assert.deepEqual([origin.requests[0].start, origin.requests[0].end], [0, total - 1]);
  assert.equal(origin.requests[0].closed, true);
  assert.equal(proxy.status().receivedBytes, total, 'the complete upstream body was consumed before the last durable write failed');
  assert.equal(blockWrites, 3);
  assert.equal(store.status().faulted, true, 'the failed write retires storage availability instead of claiming readiness');
  assert.equal(store.status().next, 2 * BLOCK);
  assert.equal(store.status().blocks, 2);
  const durableFiles = (await fs.readdir(path.join(root, 'blocks'))).filter(name => name.startsWith(key + '-') && name.endsWith('.bin'));
  assert.equal(durableFiles.length, 2, 'the previous complete block payloads remain on disk after the last block fails');
  for (const name of durableFiles) {
    const start = Number(name.split('-').at(-3));
    assert.ok(start === 0 || start === BLOCK);
    assert.deepEqual(await fs.readFile(path.join(root, 'blocks', name)), origin.data.subarray(start, start + BLOCK));
  }
  assert.equal(outcome.ok, true, 'write refusal is an explicit partial outcome, not a cache hit');
  assert.equal(outcome.value.ready, false);
  assert.equal(outcome.value.partial, true);
  await proxy.drain();
  assert.equal(proxy.status().activeOrigins, 0);
  assert.equal(proxy.status().captureBytes, 0);
  assert.equal(proxy.status().writes, 0);
  assert.equal(store.status().pending, 0);
});

for (const mode of ['short', 'disconnect']) test('background ' + mode + ' response discards the incomplete block and never hangs or reports ready',
  {timeout: 12000}, async t => {
    const total = 2 * BLOCK;
    const {origin, store, proxy} = await fixture(t, {total,
      originFactory: requestedTotal => controlledOrigin(requestedTotal, mode)});
    const handle = await proxy.open(identity('B'), 'next'), key = await handle.ready();
    await noLateReady(handle, origin, store, proxy, key);
  });

for (const ending of ['abort', 'close']) test('a stalled partial background body settles on ' + ending + ' and closes every owner',
  {timeout: 12000}, async t => {
    const total = 2 * BLOCK;
    const {origin, store, proxy} = await fixture(t, {total,
      originFactory: requestedTotal => controlledOrigin(requestedTotal, 'stall')});
    const handle = await proxy.open(identity('B'), 'next'), key = await handle.ready();
    const controller = new AbortController();
    const warming = handle.preload({maxBytes: total, signal: controller.signal})
      .then(value => ({ok: true, value}), error => ({ok: false, error}));
    await deadline(() => origin.requests.length === 1 && proxy.status().receivedBytes >= BLOCK + 17 &&
      store.status().committed === BLOCK && store.status().pending === 0,
    'stalled response must durably persist exactly its first full block');
    if (ending === 'abort') controller.abort();
    else {
      await bounded(proxy.close(), 'proxy close hung while a background origin was stalled');
    }
    const outcome = await bounded(warming, 'background preload did not settle after ' + ending);
    assert.equal(outcome.ok, false, 'an interrupted partial body cannot resolve as ready');
    await deadline(() => origin.requests[0].closed, 'interrupted origin response did not physically close');
    if (ending === 'abort') {
      assert.equal((await store.coverage(key)).bytes, BLOCK, 'only the complete preceding block remains committed: ' + JSON.stringify(store.status()));
    }
    if (ending === 'abort') await bounded(proxy.close(), 'proxy close hung after cancellation');
    else assert.equal(store.status().closed, true);
    assert.equal(proxy.status().activeOrigins, 0);
    assert.equal(proxy.status().captureBytes, 0);
    assert.equal(proxy.status().writes, 0);
    assert.equal(proxy.status().jobs, 0);
    assert.equal(store.status().pending, 0);
    assert.equal(store.status().readers, 0);
    if (ending === 'abort') await handle.stop();
  });
