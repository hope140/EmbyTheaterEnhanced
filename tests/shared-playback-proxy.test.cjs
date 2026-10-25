'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const {createStore} = require('../tools/shared-playback-cache/store.cjs');
const {createProxy} = require('../tools/shared-playback-cache/proxy.cjs');
const {source, get, identity, hash, delay} = require('../tools/shared-playback-cache/fixture.cjs');
async function setup(t, sourceOptions = {}, io) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ete-shared-proxy-'));
  const origin = await source(sourceOptions);
  const store = await createStore({root, currentBytes: 2 * 1024 * 1024, nextBytes: 512 * 1024, maxPendingBytes: 256 * 1024, io});
  let grants = 0;
  const proxy = await createProxy({store, authorize: async () => {grants++; return origin.grant();}});
  t.after(async () => {await proxy.close(); await origin.close(); await fs.rm(root, {recursive: true, force: true});});
  return {root, origin, store, proxy, grants: () => grants};
}
test('cold bytes stream before the delayed tail and before a slow disk commit', async t => {
  let finish, delayed = false;
  const gate = new Promise(resolve => {finish = resolve;});
  t.after(finish);
  const io = {...fs, async writeFile(file, ...args) {if (path.basename(file).startsWith('.block-')) {delayed = true; await gate;} return fs.writeFile(file, ...args);}};
  const {origin, proxy, store} = await setup(t, {bytes: 1024 * 1024}, io);
  const handle = await proxy.open(identity());
  const result = await get(handle.url, 0, 512 * 1024);
  assert.equal(result.status, 206); assert.equal(result.hash, hash(origin.data.subarray(0, 512 * 1024)));
  assert.ok(result.firstAt < origin.requests[0].tailAt, 'first body cannot wait for full block');
  const deadline = Date.now() + 1000;
  while (!delayed && Date.now() < deadline) await delay(1);
  assert.ok(delayed, JSON.stringify(proxy.status())); assert.equal(proxy.status().committedBytes, 0);
  assert.ok(store.status().pending <= 256 * 1024); assert.ok(proxy.status().captureBytes <= 8 * 1024 * 1024);
  finish(); await proxy.drain();
  assert.ok(proxy.status().skippedWrites > 0, 'slow writer must skip instead of queueing unbounded bodies');
});
for (const etag of [false, true]) test('same sparse bytes serve playing and preload; fresh reopen uses access check: ' + etag, async t => {
  const {origin, proxy, store} = await setup(t, {bytes: 1024 * 1024, firstDelay: 0, tailDelay: 0, etag});
  const a = await proxy.open(identity('A')); await a.ready();
  await get(a.url, 0, 256 * 1024); await proxy.drain(); await a.actual();
  const keyA = await a.ready(), b = await proxy.open(identity('B'), 'next'); await b.ready();
  const prepared = await b.preload({maxBytes: 128 * 1024, signal: new AbortController().signal}); await proxy.drain();
  assert.equal(prepared.spent, 128 * 1024); assert.ok(await store.read(keyA, 0, 16), 'preparing B cannot clear A');
  const before = proxy.status().receivedBytes;
  const bHead = await get(b.url, 0, 32768); assert.equal(bHead.hash, hash(origin.data.subarray(0, 32768)));
  assert.equal(proxy.status().receivedBytes, before, 'preloaded blocks and playback use the same store');
  const count = proxy.status().committedBytes; await b.actual();
  assert.equal(await store.read(keyA, 0, 16), null); assert.equal(proxy.status().committedBytes, count, 'promotion does not copy payload');
  b.retire(); const reopened = await proxy.open(identity('B')); await reopened.ready();
  const probeBefore = proxy.status().probeRequests;
  const again = await get(reopened.url, 0, 32768); assert.equal(again.hash, bHead.hash);
  assert.equal(proxy.status().probeRequests, probeBefore + 1, 'new route checks real source even on full hit');
});
test('cached bytes cannot bypass a new source access refusal', async t => {
  const {origin, proxy} = await setup(t, {bytes: 256 * 1024, firstDelay: 0, tailDelay: 0});
  const first = await proxy.open(identity()); await first.ready(); await get(first.url, 0, 65536); await proxy.drain(); await first.actual(); first.retire();
  origin.allow(false); const again = await proxy.open(identity()); await again.ready();
  const denied = await get(again.url, 0, 65536); assert.equal(denied.status, 502); assert.equal(denied.body.length, 0);
});
test('same-metadata replacement is explicitly an undetected ordinary-mode risk', async t => {
  const {origin, proxy} = await setup(t, {bytes: 256 * 1024, firstDelay: 0, tailDelay: 0});
  const a = await proxy.open(identity()); await a.ready(); const saved = await get(a.url, 0, 65536); await proxy.drain(); await a.actual(); a.retire();
  origin.mutate({sameMetadata: true});
  const b = await proxy.open(identity()); await b.ready(); const stale = await get(b.url, 0, 65536);
  assert.equal(stale.hash, saved.hash); assert.notEqual(stale.hash, hash(origin.data.subarray(0, 65536)));
  assert.match(proxy.status().confidence, /metadata-assumed/);
});
test('metadata replacement cannot let an old route read the new version', async t => {
  const {origin, proxy, store} = await setup(t, {bytes: 256 * 1024, firstDelay: 0, tailDelay: 0, etag: true});
  const a = await proxy.open(identity()); await a.ready(); await get(a.url, 0, 65536); await proxy.drain(); await a.actual();
  const oldKey = await a.ready(); origin.mutate();
  const b = await proxy.open(identity()); await b.ready(); assert.notEqual(await b.ready(), oldKey);
  assert.equal(await store.read(oldKey, 0, 16), null);
  const fresh = await get(b.url, 0, 65536); assert.equal(fresh.hash, hash(origin.data.subarray(0, 65536)));
  assert.equal((await get(a.url, 0, 65536)).status, 502);
});
test('foreground cancels a background origin and waits for its physical close', async t => {
  const {origin, proxy} = await setup(t, {bytes: 1024 * 1024, firstDelay: 20, tailDelay: 100});
  const a = await proxy.open(identity('A')); await a.ready();
  const b = await proxy.open(identity('B'), 'next'); await b.ready();
  const warm = b.preload({maxBytes: 256 * 1024, signal: new AbortController().signal}).catch(error => error);
  while (!origin.requests.length || !origin.requests[0].firstAt) await delay(1);
  const foreground = await get(a.url, 512 * 1024, 32768);
  assert.equal(foreground.hash, hash(origin.data.subarray(512 * 1024, 512 * 1024 + 32768)));
  assert.ok((await warm) instanceof Error); assert.ok(origin.requests[0].closed);
  assert.equal(proxy.status().peakOrigins, 1); assert.ok(proxy.status().peakBodies <= 2);
});
for (const change of ['revoked', 'length']) test('observed ' + change + ' after an access check retires subsequent cache hits', async t => {
  const {origin, proxy, store} = await setup(t, {bytes: 256 * 1024, firstDelay: 0, tailDelay: 0});
  const a = await proxy.open(identity()); await a.ready(); await get(a.url, 0, 65536); await proxy.drain(); await a.actual();
  const key = await a.ready();
  if (change === 'revoked') origin.allow(false); else origin.grow();
  assert.equal((await get(a.url, 128 * 1024, 1024)).status, 502);
  assert.equal((await get(a.url, 0, 1024)).status, 410);
  await proxy.drain();
  if (change === 'length') assert.equal(await store.read(key, 0, 16), null);
});
test('pending authorization is reserved, cancelled and joined before close; no late route can publish', async t => {
  let finish;
  const gate = new Promise(resolve => {finish = resolve;});
  const origin = await source({bytes: 1024, firstDelay: 0, tailDelay: 0});
  let opens = 0;
  const fake = {open: async () => {opens++; return 'key';}, close: async () => {}, status: () => ({pending: 0})};
  const proxy = await createProxy({store: fake, authorize: async () => {await gate; return origin.grant();}});
  t.after(async () => {finish(); await proxy.close(); await origin.close();});
  const pending = Array.from({length: 4}, (_, n) => proxy.open(identity(String(n))).catch(error => error));
  await assert.rejects(proxy.open(identity('fifth')), /route-limit/);
  let stopped = false; const closing = proxy.close().then(() => {stopped = true;});
  await delay(5); assert.equal(stopped, false); finish();
  assert.ok((await Promise.all(pending)).every(value => value instanceof Error)); await closing;
  assert.equal(opens, 0); assert.equal(proxy.status().routes, 0);
});
test('retired actual cannot act after its pending cache open completes', async t => {
  let finish; const gate = new Promise(resolve => {finish = resolve;});
  const origin = await source({bytes: 1024, firstDelay: 0, tailDelay: 0}); let actuals = 0;
  const fake = {open: async () => {await gate; return 'key';}, actual: async () => {actuals++;}, close: async () => {}, status: () => ({pending: 0})};
  const proxy = await createProxy({store: fake, authorize: async () => origin.grant()});
  t.after(async () => {finish(); await proxy.close(); await origin.close();});
  const a = await proxy.open(identity()); const actual = a.actual().catch(error => error); a.retire(); finish();
  assert.ok((await actual) instanceof Error); assert.equal(actuals, 0);
});
test('the authorized identity is an immutable snapshot, including later refresh', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ete-shared-alias-'));
  const origin = await source({bytes: 1024, firstDelay: 0, tailDelay: 0});
  const store = await createStore({root, currentBytes: 4096, nextBytes: 4096});
  const seen = [];
  const proxy = await createProxy({store, authorize: async value => {seen.push(value.account); assert.ok(Object.isFrozen(value)); return {...origin.grant(), expiresAt: Date.now() + 1};}});
  t.after(async () => {await proxy.close(); await origin.close(); await fs.rm(root, {recursive: true, force: true});});
  const value = identity(); const a = await proxy.open(value); value.account = 'different-account'; await delay(5);
  assert.equal((await get(a.url, 0, 32)).status, 206); assert.ok(seen.length > 1);
  assert.ok(seen.every(account => account === 'account-owned'));
});
test('a player-paused source survives beyond the network timeout and can coexist with one preload', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ete-shared-drain-'));
  const origin = await source({bytes: 8 * 1024 * 1024, firstDelay: 0, tailDelay: 0});
  const store = await createStore({root, currentBytes: 1024 * 1024, nextBytes: 262144});
  const proxy = await createProxy({store, timeoutMs: 100, authorize: async () => origin.grant()});
  t.after(async () => {await proxy.close(); await origin.close(); await fs.rm(root, {recursive: true, force: true});});
  const a = await proxy.open(identity('A')), b = await proxy.open(identity('B'), 'next'); await b.ready();
  const playing = get(a.url, 0, origin.data.length, {pauseAfterFirstMs: 400});
  const deadline = Date.now() + 2000;
  while (!proxy.status().foregroundIdle && Date.now() < deadline) await delay(1);
  assert.ok(proxy.status().foregroundIdle, 'owned foreground must actually be paused');
  const prepared = await b.preload({maxBytes: 65536, signal: new AbortController().signal});
  assert.equal(prepared.spent, 65536);
  const result = await playing; assert.equal(result.hash, hash(origin.data));
  assert.equal(proxy.status().peakOrigins, 2); assert.ok(proxy.status().peakBodies <= 2);
});
test('learning response validators preserves the actual playback designation across reopen', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ete-shared-enrichment-'));
  const origin = await source({bytes: 256 * 1024, firstDelay: 0, tailDelay: 0, etag: true});
  let proxy, store;
  t.after(async () => {await proxy?.close(); await store?.close(); await origin.close(); await fs.rm(root, {recursive: true, force: true});});
  store = await createStore({root, currentBytes: 1024 * 1024, nextBytes: 256 * 1024});
  proxy = await createProxy({store, authorize: async () => ({...origin.grant(), metadata: {total: origin.data.length}})});
  const handle = await proxy.open(identity()); await handle.ready(); await handle.actual();
  const before = store.status().currentKey;
  assert.ok(before);
  const next = await proxy.open(identity('B'), 'next'); await next.ready();
  await get(next.url, 0, 16384); await proxy.drain(); const nextKey = await next.ready();
  const body = await get(handle.url, 0, 65536); assert.equal(body.hash, hash(origin.data.subarray(0, 65536)));
  await proxy.drain();
  assert.ok(store.status().currentKey, 'learned validator must not turn actual playback into an unplayed candidate');
  assert.notEqual(store.status().currentKey, before);
  assert.ok(await store.read(nextKey, 0, 16), 'metadata learning cannot discard an unrelated prepared next');
  await proxy.close(); proxy = null;
  store = await createStore({root, currentBytes: 1024 * 1024, nextBytes: 256 * 1024});
  assert.equal(store.status().current, 65536, 'last actual bytes survive close/reopen');
});
test('retired routes keep admission charged until pending metadata settles', async t => {
  let release, queued = 0;
  const gate = new Promise(resolve => {release = resolve;}); t.after(release);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ete-shared-admission-'));
  const origin = await source({bytes: 65536, firstDelay: 0, tailDelay: 0});
  const store = await createStore({root, currentBytes: 1024 * 1024, nextBytes: 256 * 1024});
  const proxy = await createProxy({store: {...store, async open(...args) {queued++; await gate; return store.open(...args);}}, authorize: async () => origin.grant()});
  t.after(async () => {await proxy.close(); await origin.close(); await fs.rm(root, {recursive: true, force: true});});
  for (let n = 0; n < 4; n++) (await proxy.open(identity('pending-' + n))).retire();
  await assert.rejects(proxy.open(identity('excess')), /route-limit/);
  assert.equal(queued, 4);
  release(); await proxy.drain();
  const recovered = await proxy.open(identity('after-drain')); await recovered.ready(); recovered.retire();
});

test('actual selection pending persistence follows learned metadata without losing ownership', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ete-shared-pending-actual-'));
  const origin = await source({bytes: 256 * 1024, firstDelay: 0, tailDelay: 0, etag: true});
  let held = false, block = false, release;
  const gate = new Promise(resolve => {release = resolve;}); t.after(release);
  const io = {...fs, async writeFile(file, ...args) {
    if (block && path.basename(file).startsWith('.index-')) {block = false; held = true; await gate;}
    return fs.writeFile(file, ...args);
  }};
  const store = await createStore({root, currentBytes: 1024 * 1024, nextBytes: 256 * 1024, io});
  const proxy = await createProxy({store, authorize: async () => ({...origin.grant(), metadata: {total: origin.data.length}})});
  t.after(async () => {await proxy.close(); await origin.close(); await fs.rm(root, {recursive: true, force: true});});
  const handle = await proxy.open(identity()); await handle.ready();
  block = true; const selecting = handle.actual();
  const deadline = Date.now() + 1000; while (!held && Date.now() < deadline) await delay(1);
  assert.ok(held);
  const bytes = await get(handle.url, 0, 65536); assert.equal(bytes.status, 206);
  release(); assert.equal(await selecting, true); await proxy.drain();
  assert.equal(store.status().currentKey, await handle.ready());
  await proxy.close();
  const recovered = await createStore({root, currentBytes: 1024 * 1024, nextBytes: 256 * 1024});
  assert.equal(recovered.status().current, 65536); await recovered.close();
});
test('sequential warm playback reads each full cached block once instead of four times', async t => {
  let diskReadBytes = 0;
  const io = {...fs, async open(file, ...args) {
    const handle = await fs.open(file, ...args);
    if (path.basename(path.dirname(file)) !== 'blocks' || !String(file).endsWith('.bin')) return handle;
    return {stat: (...a) => handle.stat(...a), close: (...a) => handle.close(...a),
      async read(...a) {const result = await handle.read(...a); diskReadBytes += result.bytesRead; return result;}};
  }};
  const {proxy, origin} = await setup(t, {bytes: 256 * 1024, firstDelay: 0, tailDelay: 0}, io);
  const handle = await proxy.open(identity()); await handle.ready();
  await get(handle.url, 0, origin.data.length); await proxy.drain();
  diskReadBytes = 0;
  const before = proxy.status().originRequests;
  const again = await get(handle.url, 0, origin.data.length);
  assert.equal(again.hash, hash(origin.data));
  assert.equal(proxy.status().originRequests, before);
  assert.equal(diskReadBytes, origin.data.length, 'full-block integrity checking should not multiply warm disk IO');
});
test('seek hint interrupts only old foreground IO and keeps the route and next bytes', async t => {
  const {proxy, origin, store} = await setup(t, {bytes: 1024 * 1024, firstDelay: 20, tailDelay: 100});
  const a = await proxy.open(identity('A')); await a.ready(); await a.actual();
  const b = await proxy.open(identity('B'), 'next'); await b.ready();
  await b.preload({maxBytes: 65536, signal: new AbortController().signal}); await proxy.drain();
  const nextKey = await b.ready(), oldKey = await a.ready();
  const before = origin.requests.length;
  const oldRead = get(a.url, 0, 512 * 1024, {pauseAfterFirstMs: 200}).catch(error => error);
  const deadline = Date.now() + 1000;
  while (!origin.requests[before]?.firstAt && Date.now() < deadline) await delay(1);
  assert.ok(origin.requests[before]?.firstAt);
  const cancelOld = a.prepareForegroundInterruption();
  const targetRead = get(a.url, 768 * 1024, 16384);
  while (proxy.status().activeBodies < 2 && Date.now() < deadline) await delay(1);
  assert.equal(proxy.status().activeBodies, 2);
  assert.deepEqual(await cancelOld(), {interruptedBodies: 1});
  const cancelled = await oldRead;
  assert.ok(cancelled instanceof Error || cancelled.status === 502 && cancelled.body.length === 0,
    'old read must fail before completion, including cancellation before local headers');
  while (!origin.requests[before].closed && Date.now() < deadline) await delay(1);
  assert.ok(origin.requests[before].closed);
  assert.equal(await a.ready(), oldKey); assert.equal(store.status().currentKey, oldKey);
  assert.ok(await store.read(nextKey, 0, 16));
  const target = await targetRead;
  assert.equal(target.hash, hash(origin.data.subarray(768 * 1024, 768 * 1024 + 16384)));
  assert.deepEqual(await a.prepareForegroundInterruption()(), {interruptedBodies: 0});
});
