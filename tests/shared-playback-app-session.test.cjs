'use strict';

// Synthetic app-session integration only: issue/bind use the real authority,
// playback-range-session and shared cache adapter; the HTTP origin is loopback.
// readCurrentBytes is an explicit test injection (not a native property read).
const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {performance} = require('node:perf_hooks');
const {createAuthority} = require('../src/electronapp/enhanced/preload-source-authority');
const {createSession} = require('../src/electronapp/enhanced/playback-range-session');
const {createCache} = require('../src/electronapp/enhanced/shared-playback-cache/adapter');

const BLOCK = 256 * 1024;
const MEDIA_BUFFER_BYTES = 512 * 1024;
const PRELOAD_MB = 100;
const UA = 'OwnedSynthetic/1.0';
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function localOrigin({aBytes = Buffer.alloc(BLOCK, 0x41), bBytes = Buffer.alloc(BLOCK, 0x42), delayMs = 0} = {}) {
  const objects = new Map([['A', aBytes], ['B', bBytes], ['C', aBytes]]);
  const requests = [], sockets = new Set();
  const server = http.createServer((req, res) => {
    const item = /^\/(A|B|C)\.mkv$/.exec(new URL(req.url, 'http://127.0.0.1').pathname)?.[1];
    const data = objects.get(item);
    const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    const start = match ? Number(match[1]) : 0;
    const end = match && match[2] ? Number(match[2]) : data ? data.length - 1 : -1;
    const request = {item, start, end, closed: false}; requests.push(request);
    res.once('close', () => {request.closed = true;});
    if (!data || !match || start < 0 || end < start || end >= data.length) {
      res.writeHead(416); res.end(); return;
    }
    const send = () => {
      if (res.destroyed) return;
      res.writeHead(206, {'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${data.length}`,
        'Content-Type': 'application/octet-stream', 'Last-Modified': 'Wed, 21 Oct 2026 08:00:00 GMT',
        ETag: '"owned-synthetic-v1"'});
      res.end(data.subarray(start, end + 1));
    };
    if (delayMs) setTimeout(send, delayMs); else send();
  });
  server.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {origin, requests, replace(item, data) {objects.set(item, data);},
    async close() {for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve));}};
}

async function freshRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ete-app-session-cache-'));
}

async function fixture(t, options = {}) {
  const root = await freshRoot();
  const origin = await localOrigin(options.origin);
  const authority = createAuthority();
  const webA = new EventEmitter(), webB = new EventEmitter();
  webA.isDestroyed = webB.isDestroyed = () => false;
  const principalA = authority.principalFor(webA), principalB = authority.principalFor(webB);
  const helper = {currentGenerationId: 1, exited: false, transportTerminated: false};
  let bindingPrincipal = principalA, currentRequestId = 'play-A', nextRequestPrefix = 'play-A-next-', cache, createCount = 0;
  const currentBytesReads = [];
  const config = {kind: 'shared-byte-trial', root, progressPercent: 50, preloadMB: PRELOAD_MB, timeoutMs: 1000};
  const session = createSession({config,
    async create(value) {
      createCount++;
      if (options.slowCreateMs) await delay(options.slowCreateMs);
      cache = await createCache(value);
      return cache;
    },
    authorize(value, role, signal) {
      return authority.bind({principal: bindingPrincipal, signal, sourceProof: value.sourceProof, source: value.source,
        ...(role === 'current' ? {requestId: currentRequestId} : {requestPrefix: nextRequestPrefix})});
    },
    async readCurrentBytes(_helper, generationId) {
      currentBytesReads.push(generationId);
      if (options.slowCurrentBytesMs) await delay(options.slowCurrentBytesMs);
      return MEDIA_BUFFER_BYTES;
    }});
  t.after(async () => {await session.close(); authority.close(); await origin.close(); await fs.rm(root, {recursive: true, force: true});});

  function candidate(item, {principal = principalA, accountId = 'account-A', requestId = 'play-A', playSessionId = 'session-A'} = {}) {
    const source = `${origin.origin}/${item}.mkv`;
    const proof = authority.issue({principal, source, requestId, sourceKind: 'direct-url',
      resourceKey: `owned-resource-${item}`, expectedSize: BLOCK,
      requestOptions: {userAgent: UA}});
    return {source, sourceProof: proof, serverOrigin: origin.origin, serverId: 'owned-server', accountId,
      itemId: item, mediaSourceId: `media-${item}`, playSessionId, mode: 'DirectPlay', mediaType: 'Video',
      container: 'mkv', live: false};
  }
  const loadOptions = value => ['loadfile', value.source, 'replace', '-1', `user-agent=${UA}`];
  return {root, origin, authority, principalA, principalB, helper, session, config, candidate, loadOptions,
    webA, webB,
    get cache() {return cache;}, get createCount() {return createCount;}, currentBytesReads,
    setBindingPrincipal(value) {bindingPrincipal = value;}, setCurrentRequestId(value) {currentRequestId = value;},
    setNextRequestPrefix(value) {nextRequestPrefix = value;}};
}

function getRange(url, start = 0, length = BLOCK) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, {headers: {Range: `bytes=${start}-${start + length - 1}`, Connection: 'close'}, agent: false}, response => {
      const chunks = []; response.on('data', chunk => chunks.push(chunk));
      response.once('error', reject);
      response.once('end', () => resolve({status: response.statusCode, body: Buffer.concat(chunks)}));
    });
    request.once('error', reject);
  });
}

async function waitFor(predicate, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {if (predicate()) return true; await delay(2);}
  return predicate();
}

async function selectCurrent(f, value) {
  await f.session.setContext(value, f.helper, f.helper.currentGenerationId);
  return f.session.select(value.source, f.helper, f.helper.currentGenerationId, f.loadOptions(value));
}

test('strict load binding replaces the source with the loopback cache route and streams actual bytes', async t => {
  const f = await fixture(t), a = f.candidate('A');
  await f.session.setContext(a, f.helper, 1);
  const altered = f.loadOptions(a).slice(); altered[4] = 'user-agent=Wrong/1.0';
  assert.equal(await f.session.select(a.source, f.helper, 1, altered), null);
  assert.equal(f.createCount, 0, 'mismatched load options cannot initialize the cache');
  const selected = await f.session.select(a.source, f.helper, 1, f.loadOptions(a));
  assert.ok(selected);
  assert.notEqual(selected.source, a.source, 'the replacement source belongs to the loopback proxy');
  assert.equal(selected.canDispatch(), true);
  // This invokes the session callback directly. It is not a Native Helper/core-idle observation.
  await f.session.started(f.helper, 1);
  const result = await getRange(selected.source);
  assert.equal(result.status, 206);
  assert.equal(digest(result.body), digest(Buffer.alloc(BLOCK, 0x41)));
  assert.ok(f.origin.requests.some(row => row.item === 'A'), 'HTTP bytes came from the owned synthetic source');
  assert.deepEqual(f.currentBytesReads, [1], 'M comes from the explicit test-only injection');
  assert.equal(f.cache.status().maxBytes, MEDIA_BUFFER_BYTES + PRELOAD_MB * 1_000_000);
});

test('preparing B preserves A, actual B promotes its warmed bytes, and close discards unplayed C', async t => {
  const f = await fixture(t), a = f.candidate('A');
  const selectedA = await selectCurrent(f, a); assert.ok(selectedA);
  await f.session.started(f.helper, 1);
  assert.equal((await getRange(selectedA.source)).status, 206);
  assert.ok(await waitFor(() => f.cache.status().currentBytes >= BLOCK));
  const currentBeforeNext = f.cache.status().currentBytes;
  assert.equal(digest((await getRange(selectedA.source)).body), digest(Buffer.alloc(BLOCK, 0x41)));

  const bNext = f.candidate('B', {requestId: 'play-A-next-1'});
  const warmed = await f.session.preload(bNext, f.helper, 1);
  assert.equal(warmed.state, 'ready', JSON.stringify(warmed.diagnostic));
  assert.equal(f.cache.status().currentBytes, currentBeforeNext, 'preparing B must not evict current A');
  assert.ok(f.cache.status().currentBytes >= BLOCK);
  assert.ok(f.cache.status().nextBytes >= BLOCK);
  assert.equal(digest((await getRange(selectedA.source)).body), digest(Buffer.alloc(BLOCK, 0x41)), 'A remains readable while B is prepared');

  await f.session.retire(); f.helper.currentGenerationId = 2; f.setCurrentRequestId('play-B'); f.setNextRequestPrefix('play-B-next-');
  const bCurrent = f.candidate('B', {requestId: 'play-B'});
  const selectedB = await selectCurrent(f, bCurrent); assert.ok(selectedB);
  assert.equal(digest((await getRange(selectedB.source)).body), digest(Buffer.alloc(BLOCK, 0x42)), 'B reuses its prepared cache bytes');
  await f.session.started(f.helper, 2);
  assert.ok(await waitFor(() => f.cache.status().currentBytes >= BLOCK && f.cache.status().nextBytes === 0));

  const cNext = f.candidate('C', {requestId: 'play-B-next-1', playSessionId: 'session-A'});
  assert.equal((await f.session.preload(cNext, f.helper, 2)).state, 'ready');
  assert.ok(f.cache.status().nextBytes >= BLOCK);
  await f.session.close();
  assert.equal(f.cache.status().nextBytes, 0, 'closing removes unplayed next data');
  assert.ok(f.cache.status().currentBytes >= BLOCK, 'the last played B remains in the owned cache');
  const {createStore} = require('../src/electronapp/enhanced/shared-playback-cache/store');
  const recovered = await createStore({root: f.root, currentBytes: MEDIA_BUFFER_BYTES,
    nextBytes: PRELOAD_MB * 1_000_000, recoveryMode: 'on-demand'});
  assert.ok(recovered.status().current >= BLOCK);
  assert.equal(recovered.status().next, 0);
  await recovered.close();
});

test('document navigation revokes the transport and prevents a cached local hit', async t => {
  const f = await fixture(t), a = f.candidate('A');
  const selected = await selectCurrent(f, a); assert.ok(selected);
  await f.session.started(f.helper, 1);
  assert.equal((await getRange(selected.source)).status, 206);
  assert.ok(await waitFor(() => f.cache.status().currentBytes >= BLOCK));
  const upstreamBefore = f.origin.requests.length;
  // principalA belongs to the first web contents; the fixture retains it for this navigation.
  f.webA.emit('did-start-navigation', {isMainFrame: true, isSameDocument: false});
  const result = await getRange(selected.source);
  assert.equal(result.status, 403);
  assert.equal(result.body.length, 0);
  assert.equal(f.origin.requests.length, upstreamBefore, 'revocation cannot fall back to or reuse the source');
});

test('foreign principal proof and changed account identity cannot reuse A bytes', async t => {
  const f = await fixture(t), a = f.candidate('A');
  const selectedA = await selectCurrent(f, a); assert.ok(selectedA);
  await f.session.started(f.helper, 1);
  assert.equal((await getRange(selectedA.source)).status, 206);
  assert.ok(await waitFor(() => f.cache.status().currentBytes >= BLOCK));

  f.setBindingPrincipal(f.principalB);
  const forgedForNewPrincipal = f.candidate('B', {principal: f.principalA, requestId: 'play-A', accountId: 'account-B'});
  await f.session.setContext(forgedForNewPrincipal, f.helper, 1);
  assert.equal(await f.session.select(forgedForNewPrincipal.source, f.helper, 1, f.loadOptions(forgedForNewPrincipal)), null,
    'a proof issued to another web principal cannot be rebound');

  const changedBody = Buffer.alloc(BLOCK, 0x5a); f.origin.replace('B', changedBody);
  const accountB = f.candidate('B', {principal: f.principalB, requestId: 'play-A', accountId: 'account-B'});
  const selectedB = await selectCurrent(f, accountB); assert.ok(selectedB);
  const result = await getRange(selectedB.source);
  assert.equal(result.status, 206);
  assert.equal(digest(result.body), digest(changedBody), 'account B gets current origin bytes, never A cached bytes');
});

test('shared-trial 25 ms deadline retires slow budget, cache initialization, and probe work', async t => {
  await t.test('slow current-byte read', async st => {
    const f = await fixture(st, {slowCurrentBytesMs: 80}), a = f.candidate('A');
    const started = performance.now();
    assert.equal(await selectCurrent(f, a), null);
    assert.ok(performance.now() - started < 75, 'selection returns on the soft deadline');
    await delay(100);
    assert.equal(f.createCount, 0, 'late M resolution cannot continue to cache creation');
    assert.deepEqual(f.currentBytesReads, [1]);
  });
  await t.test('slow cache initialization', async st => {
    const f = await fixture(st, {slowCreateMs: 80}), a = f.candidate('A');
    const started = performance.now();
    assert.equal(await selectCurrent(f, a), null);
    assert.ok(performance.now() - started < 75);
    await delay(100);
    assert.equal(f.createCount, 1);
    await f.session.close();
    assert.equal(f.cache.status().unavailable, false);
  });
  await t.test('slow origin probe is cancelled and joined', async st => {
    const f = await fixture(st, {origin: {delayMs: 100}}), a = f.candidate('A');
    const started = performance.now();
    assert.equal(await selectCurrent(f, a), null);
    assert.ok(performance.now() - started < 75);
    assert.ok(await waitFor(() => f.origin.requests.length > 0));
    await f.session.close();
    assert.ok(f.origin.requests[0].closed, 'the timed-out one-byte probe has physically closed');
    assert.equal(f.cache.status().routes, 0);
  });
});

test('default next-prefix session mode still selects a same-origin source route', async t => {
  const root = await freshRoot(), origin = await localOrigin();
  const helper = {currentGenerationId: 1, exited: false, transportTerminated: false};
  const session = createSession({config: {kind: 'next-prefix', root, progressPercent: 50, preloadMB: 100, timeoutMs: 1000}});
  t.after(async () => {await session.close(); await origin.close(); await fs.rm(root, {recursive: true, force: true});});
  const source = `${origin.origin}/A.mkv?Static=true`;
  const context = {source, serverOrigin: origin.origin, serverId: 'owned-server', accountId: 'account-A', itemId: 'A',
    mediaSourceId: 'media-A', playSessionId: 'session-A', mode: 'DirectStream', mediaType: 'Video', container: 'mkv', live: false};
  await session.setContext(context, helper, 1);
  const selected = await session.select(source, helper, 1, ['loadfile', source]);
  assert.ok(selected, JSON.stringify(session.status().current.diagnostic));
  assert.notEqual(selected.source, source);
  const result = await getRange(selected.source, 0, 4096);
  assert.equal(result.status, 206);
  assert.equal(digest(result.body), digest(Buffer.alloc(4096, 0x41)));
});
