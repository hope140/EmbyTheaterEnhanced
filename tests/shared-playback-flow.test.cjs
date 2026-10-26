'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createRequire} = require('node:module');
const {temporaryRoot} = require('./helpers/range-fixture-root.cjs');
const {createStore} = require('../tools/shared-playback-cache/store.cjs');
const {source, get, identity, hash, delay} = require('../tools/shared-playback-cache/fixture.cjs');
async function cleanup(actions, remove) {
  const results = await Promise.allSettled(actions.map(action => Promise.resolve().then(action)));
  results.push(...await Promise.allSettled([Promise.resolve().then(remove)]));
  const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
  if (errors.length) throw new AggregateError(errors, 'owned-shared-flow-fixture-cleanup-failed');
}

// These functional capture/ownership cases need a deterministic disk deadline, not a
// promise that a Windows filesystem callback always arrives within 15ms.
// Load the maintained proxy unchanged; intercept only its one read timer.
async function controlledReadClock() {
  const file = require.resolve('../src/electronapp/enhanced/shared-playback-cache/proxy');
  const source = await fs.readFile(file, 'utf8');
  assert.equal((source.match(/timer = setTimeout\(expire, 15\)/g) || []).length, 1);
  const pending = new Set(), timers = new Set(); let fired = 0, now = 0, firing = false;
  const readSetTimeout = (fn, ms, ...args) => {
    if (ms !== 15 && !firing) return setTimeout(fn, ms, ...args);
    const timer = {fn, due: now + ms}; timers.add(timer); pending.add(timer); return timer;
  };
  const readClearTimeout = timer => {if (timers.has(timer)) pending.delete(timer); else clearTimeout(timer);};
  const loaded = {exports: {}};
  // Keep Node's own realm (Error/Array/Promise identity); only the two lexical
  // timer dependencies differ from the standard CommonJS wrapper.
  const load = new Function('exports', 'require', 'module', '__filename', '__dirname', 'setTimeout', 'clearTimeout', source);
  const realRequire = createRequire(file);
  const clockRequire = name => name === 'node:perf_hooks' ? {performance: {now: () => now}} : realRequire(name);
  load(loaded.exports, clockRequire, loaded, file, path.dirname(file), readSetTimeout, readClearTimeout);
  return {createProxy: loaded.exports.createProxy,
    status: () => ({created: timers.size, pending: pending.size, fired}),
    expireRead(elapsed = 15) {
      assert.equal(pending.size, 1, 'exactly one owned local read must be waiting');
      const timer = [...pending][0]; pending.delete(timer); fired++; now += elapsed;
      firing = true; try {timer.fn();} finally {firing = false;}
    }};
}
async function createProxy(options) {
  return (await controlledReadClock()).createProxy(options);
}

async function setup(t, {policy = 'coherent', bytes = 512 * 1024, origin: supplied, onOriginChunk} = {}) {
  let root, origin = supplied, store, proxy;
  t.after(() => cleanup([() => proxy?.close(), () => store?.close(), () => origin?.close()],
    () => root && fs.rm(root, {recursive: true, force: true})));
  root = temporaryRoot('ete-shared-flow-', ['']);
  origin ||= await source({bytes, firstDelay: 0, tailDelay: 0});
  store = await createStore({root, currentBytes: 2 * 1024 * 1024,
    nextBytes: 1024 * 1024, maxPendingBytes: 1024 * 1024});
  const options = {store, authorize: async () => origin.grant()};
  if (policy !== null) options.requestPolicy = policy;
  if (onOriginChunk !== undefined) options.onOriginChunk = onOriginChunk;
  proxy = await createProxy(options);
  return {origin, store, proxy};
}

function fullGet(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, {agent: false, headers: {Connection: 'close'}}, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.once('error', reject);
      response.once('end', () => {
        const body = Buffer.concat(chunks);
        resolve({status: response.statusCode, body, hash: hash(body)});
      });
    });
    request.once('error', reject);
  });
}

async function partialPreload(proxy, store) {
  const handle = await proxy.open(identity());
  const key = await handle.ready();
  assert.equal((await handle.preload({maxBytes: 80 * 1024,
    signal: new AbortController().signal})).spent, 80 * 1024);
  await proxy.drain();
  assert.deepEqual(await store.span(key, 0), {start: 0, end: 64 * 1024});
  assert.deepEqual(await store.span(key, 512 * 1024 - 1), {start: 496 * 1024, end: 512 * 1024});
  return {handle, key};
}

for (const request of ['open-ended', 'full GET']) {
  test(`coherent ${request} uses one origin response over cached head, interior and tail`, async t => {
    const {origin, store, proxy} = await setup(t);
    const {handle, key} = await partialPreload(proxy, store);
    assert.equal(await store.put(key, 256 * 1024, origin.data.subarray(256 * 1024, 272 * 1024)), true);
    assert.deepEqual(await store.span(key, 256 * 1024), {start: 256 * 1024, end: 272 * 1024});
    const before = proxy.status(), requests = origin.requests.length;
    const start = request === 'open-ended' ? 32 * 1024 : 0;
    const result = request === 'open-ended'
      ? await get(handle.url, start, origin.data.length - start, {openEnded: true})
      : await fullGet(handle.url);
    await proxy.drain();
    assert.equal(result.status, request === 'open-ended' ? 206 : 200);
    assert.deepEqual(result.body, origin.data.subarray(start));
    assert.equal(result.hash, hash(origin.data.subarray(start)));
    assert.equal(origin.requests.length - requests, 1);
    assert.equal(origin.requests[requests].start, start);
    assert.equal(origin.requests[requests].end, origin.data.length - 1);
    const after = proxy.status();
    assert.equal(after.hitBytes - before.hitBytes, 0);
    assert.equal(after.receivedBytes - before.receivedBytes, origin.data.length - start);
    assert.equal(after.wholeResponseRequests - before.wholeResponseRequests, 1);
    assert.equal(after.partialPrefixBypasses - before.partialPrefixBypasses, 1);
    assert.equal(after.bypassedPrefixBytes - before.bypassedPrefixBytes, 64 * 1024 - start);
    assert.ok(after.originReadHighWaterMarkBytes <= 256 * 1024);
    assert.ok(after.localWriteHighWaterMarkBytes <= 256 * 1024);
  });
}

test('default sparse open-ended playback reuses the prepared head and tail', async t => {
  const {origin, store, proxy} = await setup(t, {policy: null});
  const {handle} = await partialPreload(proxy, store);
  const before = proxy.status(), requests = origin.requests.length;
  const result = await get(handle.url, 0, origin.data.length, {openEnded: true});
  await proxy.drain();
  assert.equal(result.hash, hash(origin.data));
  assert.equal(origin.requests.length - requests, 1);
  assert.equal(origin.requests[requests].start, 64 * 1024);
  assert.equal(origin.requests[requests].end, origin.data.length - 16 * 1024 - 1);
  assert.equal(proxy.status().hitBytes - before.hitBytes, 80 * 1024);
  assert.equal(proxy.status().wholeResponseRequests, 0);
});

for (const allowed of [true, false]) {
  test(`a fresh coherent full-cache route performs a real access probe, allowed=${allowed}`, async t => {
    const {origin, proxy} = await setup(t, {bytes: 128 * 1024});
    const first = await proxy.open(identity());
    await first.ready();
    assert.equal((await get(first.url, 0, origin.data.length)).hash, hash(origin.data));
    await proxy.drain();
    await first.actual();
    first.retire();
    origin.allow(allowed);
    const fresh = await proxy.open(identity());
    await fresh.ready();
    const before = proxy.status(), requests = origin.requests.length;
    const result = await get(fresh.url, 0, origin.data.length, {openEnded: true});
    await proxy.drain();
    assert.equal(origin.requests.length - requests, 1);
    assert.equal(origin.requests[requests].start, 0);
    assert.equal(origin.requests[requests].end, 0);
    assert.equal(proxy.status().probeRequests - before.probeRequests, 1);
    assert.equal(proxy.status().wholeResponseRequests - before.wholeResponseRequests, 0);
    if (allowed) {
      assert.equal(result.status, 206);
      assert.equal(result.hash, hash(origin.data));
      assert.equal(proxy.status().receivedBytes - before.receivedBytes, 1);
      assert.equal(proxy.status().hitBytes - before.hitBytes, origin.data.length);
    } else {
      assert.equal(result.status, 502);
      assert.equal(result.body.length, 0);
      assert.equal(proxy.status().hitBytes - before.hitBytes, 0);
    }
  });
}

test('coherent policy keeps sparse cache reuse for a bounded range', async t => {
  const {origin, store, proxy} = await setup(t);
  const {handle} = await partialPreload(proxy, store);
  const before = proxy.status(), requests = origin.requests.length;
  const result = await get(handle.url, 0, 128 * 1024);
  await proxy.drain();
  assert.equal(result.status, 206);
  assert.equal(result.hash, hash(origin.data.subarray(0, 128 * 1024)));
  assert.equal(origin.requests.length - requests, 1);
  assert.equal(origin.requests[requests].start, 64 * 1024);
  assert.equal(origin.requests[requests].end, 128 * 1024 - 1);
  assert.equal(proxy.status().hitBytes - before.hitBytes, 64 * 1024);
  assert.equal(proxy.status().wholeResponseRequests - before.wholeResponseRequests, 0);
});

async function brokenSource(mode) {
  const data = Buffer.alloc(64 * 1024, 0x5a), requests = [];
  let finishLate;
  const late = new Promise(resolve => {finishLate = resolve;});
  const server = http.createServer((req, res) => {
    requests.push(req.headers.range);
    const range = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || '');
    const start = Number(range[1]), end = Number(range[2]);
    res.writeHead(206, {'Content-Length': end - start + 1,
      'Content-Range': `bytes ${mode === 'malformed' ? start + 1 : start}-${end}/${data.length}`});
    if (mode === 'malformed') {res.end(data.subarray(start, end + 1)); finishLate(); return;}
    res.write(data.subarray(start, start + 4096));
    // EOF and explicit socket abort are separate IncomingMessage failure paths.
    if (mode === 'short EOF') res.end();
    else setImmediate(() => res.destroy());
    res.once('close', () => setImmediate(() => {
      res.write(data.subarray(start + 4096, end + 1));
      finishLate();
    }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/anonymous-owned-bytes`;
  return {data, requests, late, grant: () => ({url, origin: new URL(url).origin,
    metadata: {total: data.length}}), close: async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }};
}

for (const mode of ['malformed', 'short EOF', 'aborted']) {
  test(`${mode} origin 206 cannot publish a complete cache block, including late bytes`, async t => {
    const origin = await brokenSource(mode);
    const {store, proxy} = await setup(t, {origin});
    const handle = await proxy.open(identity());
    const key = await handle.ready();
    const result = await get(handle.url, 0, origin.data.length, {openEnded: true}).catch(error => error);
    await origin.late;
    await proxy.drain();
    if (mode === 'malformed') {
      assert.equal(result.status, 502);
      assert.equal(result.body.length, 0);
    } else assert.ok(result instanceof Error, 'partial local body must fail instead of completing');
    assert.deepEqual(origin.requests, [`bytes=0-${origin.data.length - 1}`]);
    assert.equal(await store.span(key, 0), null);
    assert.equal(await store.read(key, 0, origin.data.length), null);
    const status = proxy.status();
    assert.equal(status.committedBytes, 0);
    assert.equal(status.captureBytes, 0);
    assert.equal(status.activeOrigins, 0);
    assert.equal(status.activeBodies, 0);
    assert.equal(status.writes, 0);
  });
}

test('cancelling a player-paused coherent response releases the pending drain and owned origin', async t => {
  const {origin, proxy} = await setup(t, {bytes: 8 * 1024 * 1024});
  const handle = await proxy.open(identity());
  await handle.ready();
  const controller = new AbortController();
  const result = get(handle.url, 0, origin.data.length, {openEnded: true,
    signal: controller.signal, pauseAfterFirstMs: 500}).catch(error => error);
  const deadline = Date.now() + 2000;
  while (!proxy.status().foregroundIdle && Date.now() < deadline) await delay(1);
  assert.ok(proxy.status().foregroundIdle, 'the player must actually hold an origin drain');
  controller.abort();
  assert.ok(await result instanceof Error);
  await proxy.drain();
  const status = proxy.status();
  assert.equal(status.activeBodies, 0);
  assert.equal(status.activeOrigins, 0);
  assert.equal(status.foregroundIdle, 0);
  assert.equal(status.captureBytes, 0);
  assert.ok(status.backpressureWrites > 0);
  assert.equal(origin.requests.length, 1);
  assert.ok(origin.requests[0].closed);
});

test('a synchronous cache tap failure observes an already pending player drain rejection', async t => {
  // Create the origin before wrapping createServer, so only the proxy's local
  // response gets deterministic synthetic backpressure after its real write.
  const root = temporaryRoot('ete-shared-tap-failure-', ['']);
  const originalCreateServer = http.createServer, originalAllocUnsafe = Buffer.allocUnsafe;
  const requestedBytes = 64 * 1024;
  let origin, store, proxy, forceBackpressure = true, inject = false, failures = 0;
  const restore = () => {
    http.createServer = originalCreateServer;
    Buffer.allocUnsafe = originalAllocUnsafe;
  };
  t.after(async () => {
    restore();
    await cleanup([() => proxy?.close(), () => store?.close(), () => origin?.close()],
      () => fs.rm(root, {recursive: true, force: true}));
  });
  origin = await source({bytes: 256 * 1024, firstDelay: 20, tailDelay: 100});
  store = await createStore({root, currentBytes: 1024 * 1024, nextBytes: 256 * 1024});
  http.createServer = function(...args) {
    const listener = args.pop();
    args.push((req, res) => {
      const originalWrite = res.write;
      res.write = function(...writeArgs) {
        const result = originalWrite.apply(this, writeArgs);
        if (forceBackpressure) {
          forceBackpressure = false;
          inject = true;
          return false;
        }
        return result;
      };
      listener(req, res);
    });
    return originalCreateServer.apply(this, args);
  };
  try {
    proxy = await createProxy({store, requestPolicy: 'coherent', authorize: async () => origin.grant()});
  } finally {
    http.createServer = originalCreateServer;
  }
  Buffer.allocUnsafe = function(size) {
    if (inject && size === requestedBytes) {
      Buffer.allocUnsafe = originalAllocUnsafe;
      inject = false;
      failures++;
      throw new Error('injected-cache-tap-failure');
    }
    return originalAllocUnsafe.apply(this, arguments);
  };
  const handle = await proxy.open(identity());
  const key = await handle.ready();
  const result = await get(handle.url, 0, requestedBytes, {openEnded: false}).catch(error => error);
  restore();
  await proxy.drain();
  assert.equal(failures, 1, 'the first forwarded chunk must reach the failing cache tap');
  assert.ok(result instanceof Error, 'a partial local response cannot complete successfully');
  assert.equal(await store.span(key, 0), null);
  assert.equal(proxy.status().backpressureWrites, 1);
  assert.equal(proxy.status().committedBytes, 0);
  await proxy.close();
  // node:test must observe any unhandled drain rejection before this test ends.
  await new Promise(resolve => setImmediate(resolve));
  const status = proxy.status();
  assert.equal(status.activeBodies, 0);
  assert.equal(status.activeOrigins, 0);
  assert.equal(status.captureBytes, 0);
  assert.equal(status.foregroundIdle, 0);
  assert.equal(status.writes, 0);
});

test('origin chunk observer reports actual contiguous bytes and separates access probes despite a callback error', async t => {
  const origin = await source({bytes: 128 * 1024, firstDelay: 20, tailDelay: 100});
  const chunks = [];
  let throwOnce = true;
  const {proxy} = await setup(t, {origin, onOriginChunk: chunk => {
    chunks.push(chunk);
    if (throwOnce) {throwOnce = false; throw new Error('owned-observer-failure');}
  }});
  const first = await proxy.open(identity());
  await first.ready();
  const start = 17, length = 65539, before = proxy.status();
  const result = await get(first.url, start, length);
  await proxy.drain();
  assert.equal(result.status, 206);
  assert.equal(result.hash, hash(origin.data.subarray(start, start + length)));
  assert.ok(chunks.length > 1, 'the delayed source body must produce separate received intervals');
  let offset = start;
  for (const chunk of chunks) {
    assert.deepEqual(Object.keys(chunk).sort(), ['kind', 'length', 'probe', 'requestId', 'start']);
    for (const field of ['requestId', 'start', 'length']) assert.ok(Number.isSafeInteger(chunk[field]));
    assert.ok(chunk.length > 0 && chunk.length < length, 'each event describes its actual body chunk');
    assert.equal(chunk.requestId, before.originRequests + 1);
    assert.equal(chunk.start, offset);
    assert.equal(chunk.kind, 'foreground');
    assert.equal(chunk.probe, false);
    offset += chunk.length;
  }
  assert.equal(offset, start + length);
  const received = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  assert.equal(received, length);
  assert.equal(received, proxy.status().receivedBytes - before.receivedBytes);
  assert.equal(proxy.status().observerErrors, 1);

  await first.actual();
  first.retire();
  const fresh = await proxy.open(identity());
  await fresh.ready();
  const observed = chunks.length, beforeProbe = proxy.status();
  const cached = await get(fresh.url, start, length);
  await proxy.drain();
  assert.equal(cached.status, 206);
  assert.equal(cached.hash, result.hash);
  assert.deepEqual(chunks.slice(observed), [{requestId: beforeProbe.originRequests + 1,
    start, length: 1, kind: 'foreground', probe: true}]);
  assert.equal(proxy.status().receivedBytes - beforeProbe.receivedBytes, 1);
  assert.equal(proxy.status().hitBytes - beforeProbe.hitBytes, length);
  assert.equal(proxy.status().probeRequests - beforeProbe.probeRequests, 1);
  assert.equal(proxy.status().observerErrors, 1);
});

test('an already received two-MiB cold response survives a blocked disk tap for a later full cache hit before its read deadline', async t => {
  const bytes = 2 * 1024 * 1024;
  const root = temporaryRoot('ete-shared-two-mib-capture-', ['']);
  let release, enter;
  const gate = new Promise(resolve => {release = resolve;});
  const entered = new Promise(resolve => {enter = resolve;});
  let origin, store, proxy;
  t.after(async () => {
    release();
    await cleanup([() => proxy?.close(), () => store?.close(), () => origin?.close()],
      () => fs.rm(root, {recursive: true, force: true}));
  });
  origin = await source({bytes, firstDelay: 0, tailDelay: 0});
  const io = {...fs, async writeFile(file, ...args) {
    if (path.basename(file).startsWith('.block-')) {enter(); await gate;}
    return fs.writeFile(file, ...args);
  }};
  store = await createStore({root, currentBytes: 4 * 1024 * 1024,
    nextBytes: 1024 * 1024, maxPendingBytes: bytes, io});
  const clock = await controlledReadClock();
  proxy = await clock.createProxy({store, requestPolicy: 'coherent', authorize: async () => origin.grant()});
  const handle = await proxy.open(identity());
  const key = await handle.ready();

  const cold = await get(handle.url, 0, bytes);
  await entered;
  assert.equal(cold.status, 206);
  assert.equal(cold.hash, hash(origin.data));
  assert.equal(cold.body.length, bytes, 'playback completes while the first disk write is still blocked');
  assert.equal(origin.requests.length, 1);
  assert.equal(proxy.status().receivedBytes, bytes);
  assert.equal(store.status().committed, 0);
  assert.ok(store.status().pending <= bytes);
  assert.ok(proxy.status().peakMediaReservedBytes <= 8 * 1024 * 1024);
  release();
  await proxy.drain();
  assert.deepEqual(await store.span(key, 0), {start: 0, end: bytes});
  assert.equal(await handle.actual(), true);

  const before = proxy.status();
  const warm = await get(handle.url, 0, bytes);
  await proxy.drain();
  assert.equal(warm.status, 206);
  assert.equal(warm.hash, cold.hash);
  assert.equal(origin.requests.length, 1, 'the second playback cannot reread an origin gap');
  assert.equal(proxy.status().receivedBytes - before.receivedBytes, 0);
  assert.equal(proxy.status().hitBytes - before.hitBytes, bytes);
  assert.deepEqual(clock.status(), {created: 8, pending: 0, fired: 0}, 'all eight actual disk reads finish before the controlled deadline');
  assert.ok(proxy.status().peakWriteJobs <= 8);
  assert.ok(store.status().peak <= bytes);
  assert.ok(proxy.status().peakMediaReservedBytes <= 8 * 1024 * 1024);
});

test('a committed local block exceeding its read deadline falls back and retains the late owned read until drain', async t => {
  const bytes = 64 * 1024, root = temporaryRoot('ete-shared-read-deadline-', ['']);
  let origin, store, proxy, release, enter;
  const gate = new Promise(resolve => {release = resolve;});
  const entered = new Promise(resolve => {enter = resolve;});
  t.after(async () => {release(); await cleanup([() => proxy?.close(), () => store?.close(), () => origin?.close()],
    () => fs.rm(root, {recursive: true, force: true}));});
  origin = await source({bytes, firstDelay: 0, tailDelay: 0});
  let hold = false;
  const io = {...fs, async open(file, flags, ...args) {
    const handle = await fs.open(file, flags, ...args);
    if (!String(file).endsWith('.bin') || flags !== 'r') return handle;
    return {stat: (...params) => handle.stat(...params), close: (...params) => handle.close(...params),
      async read(...params) {if (hold) {enter(); await gate;} return handle.read(...params);}};
  }};
  store = await createStore({root, currentBytes: bytes, nextBytes: bytes, maxPendingBytes: bytes, io});
  const clock = await controlledReadClock();
  proxy = await clock.createProxy({store, authorize: async () => origin.grant()});
  const handle = await proxy.open(identity()), key = await handle.ready();
  const first = await get(handle.url, 0, bytes); await proxy.drain();
  assert.deepEqual(await store.span(key, 0), {start: 0, end: bytes}); await handle.actual();
  const before = proxy.status(); hold = true;
  const second = get(handle.url, 0, bytes);
  await entered;
  assert.equal(origin.requests.length, 1, 'the committed block is still being read locally before the timeout');
  assert.deepEqual(clock.status(), {created: 1, pending: 1, fired: 0});
  clock.expireRead(14.294);
  await delay(5);
  assert.equal(origin.requests.length, 1, 'an early timer callback must not refetch a committed block');
  assert.equal(clock.status().pending, 1, 'the remaining absolute deadline is rearmed');
  clock.expireRead(0.706);
  const result = await second;
  assert.equal(result.status, 206); assert.equal(result.hash, first.hash);
  assert.equal(origin.requests.length, 2, 'the unchanged production timeout branch deliberately refetches this block');
  assert.equal(proxy.status().receivedBytes - before.receivedBytes, bytes);
  assert.equal(proxy.status().hitBytes - before.hitBytes, 0, 'a late local result is never counted as the delivered hit');
  assert.equal(store.status().readers, 1);
  let drained = false; const draining = proxy.drain().then(() => {drained = true;});
  await new Promise(resolve => setImmediate(resolve)); assert.equal(drained, false);
  hold = false; release(); await draining;
  assert.equal(store.status().readers, 0); assert.equal(proxy.status().readReservedBytes, 0);
  assert.deepEqual(clock.status(), {created: 2, pending: 0, fired: 2});
  assert.deepEqual(await store.read(key, 0, bytes), origin.data);
});

test('cold overlapping probes stay on one origin response until actual playback enables cache reads', async t => {
  const origin = await source({bytes: 256 * 1024, firstDelay: 20, tailDelay: 100});
  const {proxy, store} = await setup(t, {origin});
  const handle = await proxy.open(identity());
  const key = await handle.ready();
  const headBytes = 64 * 1024;
  const head = await get(handle.url, 0, headBytes);
  await proxy.drain();
  assert.equal(head.hash, hash(origin.data.subarray(0, headBytes)));
  assert.deepEqual(await store.span(key, 0), {start: 0, end: headBytes});

  const before = proxy.status(), requests = origin.requests.length;
  let selecting;
  const overlapping = await get(handle.url, 0, 2 * headBytes, {onFirst() {
    selecting = handle.actual();
  }});
  assert.equal(await selecting, true);
  await proxy.drain();
  assert.equal(overlapping.status, 206);
  assert.equal(overlapping.hash, hash(origin.data.subarray(0, 2 * headBytes)));
  assert.equal(origin.requests.length - requests, 1);
  assert.equal(origin.requests[requests].start, 0, 'a cold probe cannot splice its newly cached head');
  assert.equal(origin.requests[requests].end, 2 * headBytes - 1);
  assert.equal(proxy.status().receivedBytes - before.receivedBytes, 2 * headBytes);
  assert.equal(proxy.status().hitBytes - before.hitBytes, 0,
    'actual selection during the response cannot change its latched cache policy');

  const playing = proxy.status(), playingRequests = origin.requests.length;
  const activeHead = await get(handle.url, 0, headBytes);
  await proxy.drain();
  assert.equal(activeHead.status, 206);
  assert.equal(activeHead.hash, head.hash);
  assert.equal(origin.requests.length, playingRequests);
  assert.equal(proxy.status().receivedBytes - playing.receivedBytes, 0);
  assert.equal(proxy.status().hitBytes - playing.hitBytes, headBytes);
});

test('a preload cancelled after origin close cannot publish readiness while final disk writes drain', async t => {
  const bytes = 64 * 1024;
  const root = temporaryRoot('ete-shared-preload-cancel-', ['']);
  let release, enter, origin, store, proxy;
  const gate = new Promise(resolve => {release = resolve;});
  const entered = new Promise(resolve => {enter = resolve;});
  t.after(async () => {
    release();
    await cleanup([() => proxy?.close(), () => store?.close(), () => origin?.close()],
      () => fs.rm(root, {recursive: true, force: true}));
  });
  origin = await source({bytes, firstDelay: 0, tailDelay: 0});
  const io = {...fs, async writeFile(file, ...args) {
    if (path.basename(file).startsWith('.block-')) {enter(); await gate;}
    return fs.writeFile(file, ...args);
  }};
  store = await createStore({root, currentBytes: 256 * 1024, nextBytes: 256 * 1024, io});
  proxy = await createProxy({store, authorize: async () => origin.grant()});
  const handle = await proxy.open(identity());
  const key = await handle.ready();
  const controller = new AbortController();
  const outcome = handle.preload({maxBytes: bytes, signal: controller.signal})
    .then(result => ({result}), error => ({error}));
  await entered;
  const deadline = Date.now() + 1000;
  while ((proxy.status().activeOrigins || !origin.requests[0]?.closed) && Date.now() < deadline) await delay(1);
  assert.equal(origin.requests.length, 1);
  assert.ok(origin.requests[0].closed, 'the owned origin must be physically closed before cancellation');
  assert.equal(proxy.status().activeOrigins, 0);
  assert.equal(proxy.status().receivedBytes, bytes);
  assert.equal(store.status().committed, 0);
  controller.abort();
  release();
  const prepared = await outcome;
  assert.ok(prepared.error instanceof Error, 'a cancelled preparation cannot report success');
  assert.match(prepared.error.message, /cancelled/);
  await proxy.drain();
  assert.deepEqual(await store.read(key, 0, bytes), origin.data, 'completed bytes can remain valid');

  const before = proxy.status();
  const read = await get(handle.url, 0, bytes);
  await proxy.drain();
  assert.equal(read.status, 206);
  assert.equal(read.hash, hash(origin.data));
  assert.equal(origin.requests.length, 2, 'a cancelled preparation cannot enable cache reads before actual playback');
  assert.equal(proxy.status().receivedBytes - before.receivedBytes, bytes);
  assert.equal(proxy.status().hitBytes - before.hitBytes, 0);
});

for (const sizes of [[262144, 262144, 262144], [70001, 190003, 33007]]) {
  test(`local response reads only one actual block at a time: ${sizes.join('/')}`, async t => {
    const bytes = sizes.reduce((a, b) => a + b, 0), root = temporaryRoot('ete-shared-boundary-', ['']);
    let origin, store, proxy; const reads = [];
    t.after(() => cleanup([() => proxy?.close(), () => store?.close(), () => origin?.close()],
      () => fs.rm(root, {recursive: true, force: true})));
    origin = await source({bytes, firstDelay: 0, tailDelay: 0});
    const io = {...fs, async open(file, flags, ...args) {
      const handle = await fs.open(file, flags, ...args);
      if (!String(file).endsWith('.bin') || flags !== 'r') return handle;
      return {stat: (...params) => handle.stat(...params), close: (...params) => handle.close(...params),
        async read(...params) {const result = await handle.read(...params); reads.push(result.bytesRead); return result;}};
    }};
    store = await createStore({root, currentBytes: bytes, nextBytes: bytes, maxPendingBytes: bytes, io});
    const calls = [], observed = {...store, read(key, start, length) {calls.push({start, length}); return store.read(key, start, length);}};
    proxy = await createProxy({store: observed, authorize: async () => origin.grant()});
    const handle = await proxy.open(identity()), key = await handle.ready();
    let start = 0;
    for (const size of sizes) {assert.equal(await store.put(key, start, origin.data.subarray(start, start + size)), true); start += size;}
    await handle.actual();
    const offset = 1248, result = await get(handle.url, offset, bytes - offset);
    await proxy.drain();
    assert.equal(result.hash, hash(origin.data.subarray(offset)));
    assert.deepEqual(calls, sizes.map((size, i) => ({start: i ? sizes.slice(0, i).reduce((a, b) => a + b, 0) : offset,
      length: size - (i ? 0 : offset)})));
    assert.equal(reads.reduce((a, b) => a + b, 0), bytes, 'each whole physical block is verified exactly once');
    assert.equal(origin.requests.length, 1, 'only the fresh one-byte authorization probe reaches the origin');
    assert.equal(origin.requests[0].end - origin.requests[0].start + 1, 1);
    assert.equal(proxy.status().hitBytes, bytes - offset);
    assert.equal(proxy.status().readReservedBytes, 0);
  });
}

for (const phase of ['boundary', 'read']) for (const cancel of ['retirement', 'client']) {
  test(`${cancel} during ${phase} waiting cancels without origin fallback or late hit`, async t => {
    const bytes = 65536, {origin, store} = await setup(t, {bytes});
    let release, entered;
    const gate = new Promise(resolve => {release = resolve;}), waiting = new Promise(resolve => {entered = resolve;});
    let held = false;
    const observed = {...store,
      async nextOffset(...args) {if (held && phase === 'boundary') {entered(); await gate;} return store.nextOffset(...args);},
      async read(...args) {if (held && phase === 'read') {entered(); await gate;} return store.read(...args);}};
    const clock = await controlledReadClock();
    const proxy = await clock.createProxy({store: observed, authorize: async () => origin.grant()});
    t.after(async () => {release(); await proxy.close();});
    const handle = await proxy.open(identity()), key = await handle.ready();
    assert.equal((await get(handle.url, 0, bytes)).hash, hash(origin.data)); await proxy.drain(); await handle.actual();
    assert.ok(await store.span(key, 0));
    held = true; const before = proxy.status(), requestCount = origin.requests.length;
    const client = new AbortController();
    const pending = get(handle.url, 0, bytes, {signal: client.signal}).catch(() => null);
    await waiting;
    if (cancel === 'retirement') handle.retire(); else client.abort();
    const response = await pending;
    if (response) {assert.equal(response.status, 502); assert.equal(response.body.length, 0);}
    const until = Date.now() + 1000;
    while (proxy.status().activeBodies && Date.now() < until) await delay(1);
    assert.equal(proxy.status().activeBodies, 0, 'the cancelled body relinquishes its local wait');
    assert.equal(origin.requests.length, requestCount, 'cancellation cannot become a source gap request');
    assert.equal(proxy.status().hitBytes, before.hitBytes);
    if (phase === 'read') assert.equal(proxy.status().readReservedBytes, 1048576, 'unfinished physical work remains owned');
    release(); await proxy.drain();
    assert.equal(proxy.status().readReservedBytes, 0); assert.equal(clock.status().pending, 0);
    assert.equal(proxy.status().hitBytes, before.hitBytes);
  });
}
