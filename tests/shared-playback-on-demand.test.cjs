'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {temporaryRoot} = require('./helpers/range-fixture-root.cjs');
const {createStore} = require('../src/electronapp/enhanced/shared-playback-cache/store');
const {createProxy} = require('../src/electronapp/enhanced/shared-playback-cache/proxy');
const {source, get, identity, hash} = require('../tools/shared-playback-cache/fixture.cjs');
const {runRecoveryProbe} = require('../tools/shared-playback-cache/recovery.cjs');

const BLOCK = 256 * 1024;
const currentBytes = 2 * BLOCK;
const nextBytes = BLOCK;
const metadata = {total: BLOCK, lastModified: 'Wed, 21 Oct 2026 08:00:00 GMT'};
const payload = Buffer.alloc(BLOCK, 0x5a);

async function ownedRoot(t) {
  const root = temporaryRoot('ete-cache-ondemand-', ['']), actions = [];
  t.after(async () => {
    const results = await Promise.allSettled(actions.map(action => Promise.resolve().then(action)));
    results.push(...await Promise.allSettled([fs.rm(root, {recursive: true, force: true})]));
    const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
    if (errors.length) throw new AggregateError(errors, 'owned-on-demand-fixture-cleanup-failed');
  });
  return {root, own: action => actions.push(action)};
}

function countMediaReads(root) {
  let bytes = 0;
  const io = {...fs, async open(file, ...args) {
    const handle = await fs.open(file, ...args);
    if (path.dirname(file) !== path.join(root, 'blocks') || !String(file).endsWith('.bin')) return handle;
    return {stat: (...a) => handle.stat(...a), close: (...a) => handle.close(...a),
      async read(...a) {const result = await handle.read(...a); bytes += result.bytesRead; return result;}};
  }};
  return {io, bytes: () => bytes};
}

async function seed(root, own, identityValue = identity()) {
  const store = await createStore({root, currentBytes, nextBytes});
  own(() => store.close());
  const key = await store.open(identityValue, metadata, 'current');
  await store.actual(key);
  assert.equal(await store.put(key, 0, payload), true);
  await store.close();
  return key;
}

test('on-demand reopen stats media blocks without reading them; read verifies before coverage is trusted', async t => {
  const {root, own} = await ownedRoot(t);
  const savedKey = await seed(root, own);
  const counted = countMediaReads(root);
  const store = await createStore({root, currentBytes, nextBytes,
    recoveryMode: 'on-demand', io: counted.io});
  own(() => store.close());

  assert.equal(store.status().currentKey, savedKey);
  assert.equal(counted.bytes(), 0, 'startup must not read media payloads');
  assert.equal(store.status().unverifiedBytes, BLOCK);
  assert.deepEqual(store.coverage(savedKey), {bytes: BLOCK, total: BLOCK, verifiedBytes: 0});
  assert.deepEqual(await store.span(savedKey, 0), {start: 0, end: BLOCK}, 'span is only a candidate');

  const otherAccount = {...identity(), account: 'different-anonymous-account'};
  const otherKey = await store.open(otherAccount, metadata, 'next');
  assert.notEqual(otherKey, savedKey);
  assert.equal(await store.span(otherKey, 0), null, 'an account cannot reuse another account cache entry');
  assert.equal(store.status().committed, BLOCK, 'unverified bytes stay charged to the cache budget');
  assert.equal(store.status().current + store.status().next, BLOCK);

  assert.deepEqual(await store.read(savedKey, 0, BLOCK), payload);
  assert.equal(store.status().unverifiedBytes, 0);
  assert.equal(store.coverage(savedKey).verifiedBytes, BLOCK);
  assert.equal(counted.bytes(), BLOCK);
  await store.close();
  assert.equal(store.status().closed, true);
  assert.equal(store.status().pending, 0);
  assert.equal(store.status().readers, 0);
});

test('on-demand corrupt candidate is rejected before delivery and evicted when authorized refills are skipped', async t => {
  const {root, own} = await ownedRoot(t);
  const savedKey = await seed(root, own);
  const blockDir = path.join(root, 'blocks');
  const names = await fs.readdir(blockDir);
  assert.equal(names.length, 1);
  const blockPath = path.join(blockDir, names[0]);
  const corrupted = Buffer.from(payload); corrupted[0] ^= 0xff;
  await fs.writeFile(blockPath, corrupted);

  const origin = await source({bytes: BLOCK, firstDelay: 0, tailDelay: 0, data: payload});
  own(() => origin.close());
  const counted = countMediaReads(root);
  const store = await createStore({root, currentBytes, nextBytes, recoveryMode: 'on-demand', io: counted.io});
  own(() => store.close());
  // Isolate rejection/eviction from the independently tested best-effort
  // source refill: a successful refill may legitimately restore one verified
  // block before this assertion, depending on completion ordering.
  const proxy = await createProxy({store: {...store, put: async () => false}, authorize: async () => origin.grant()});
  own(() => proxy.close());

  assert.equal(store.status().currentKey, savedKey);
  assert.equal(store.status().unverifiedBytes, BLOCK);
  assert.equal(counted.bytes(), 0);
  const handle = await proxy.open(identity());
  await handle.ready();
  const result = await get(handle.url, 0, BLOCK);
  assert.equal(result.status, 206);
  assert.equal(result.hash, hash(payload));
  await proxy.drain();
  assert.equal(proxy.status().hitBytes, 0, 'unverified corrupt bytes must not count as cache hits');
  assert.ok(proxy.status().receivedBytes >= BLOCK, 'the source supplied the delivered bytes');
  await store.open(identity(), metadata, 'current'); // Queue barrier for corrupt-block eviction.
  assert.equal(store.status().unverifiedBytes, 0, 'the corrupt block was removed after failed SHA verification');
  assert.equal(store.status().committed, 0);

  await handle.stop();
  await proxy.close();
  await store.close();
  const status = proxy.status();
  assert.equal(status.routes, 0);
  assert.equal(status.activeBodies, 0);
  assert.equal(status.activeOrigins, 0);
  assert.equal(status.queued, 0);
  assert.equal(status.captureBytes, 0);
  assert.equal(store.status().closed, true);
  assert.equal(store.status().pending, 0);
  assert.equal(store.status().readers, 0);
});

test('fresh recovery children distinguish startup scan IO from first-read verification', async t => {
  const {root, own} = await ownedRoot(t);
  const savedKey = await seed(root, own);
  const report = await runRecoveryProbe({root, actualKey: savedKey, metadata,
    currentBytes, nextBytes, expectedBlockSha256: hash(payload)});
  assert.deepEqual(report.modes.map(mode => mode.mode), ['verified', 'on-demand']);
  for (const mode of report.modes) {
    assert.equal(mode.processExited, true);
    assert.equal(mode.exitCode, 0);
    assert.equal(mode.firstRead.sha256MatchesExpected, true);
    assert.equal(mode.firstRead.bytes, BLOCK);
    assert.equal(mode.closed, true);
  }
  const [verified, onDemand] = report.modes;
  assert.equal(verified.mediaBytesReadDuringStartup, BLOCK);
  assert.equal(verified.occupancy.startupUnverified, 0);
  assert.equal(onDemand.mediaBytesReadDuringStartup, 0);
  assert.equal(onDemand.occupancy.startupCommitted, BLOCK);
  assert.equal(onDemand.occupancy.startupUnverified, BLOCK);
  assert.equal(onDemand.mediaBytesReadForFirstRead, BLOCK);
  assert.equal(onDemand.occupancy.afterFirstReadUnverified, 0);
  assert.equal(report.osPageCache, 'not-cleared-between-children');
});
