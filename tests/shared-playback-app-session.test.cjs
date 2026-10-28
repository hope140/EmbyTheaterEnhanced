'use strict';

// Synthetic app-session integration only: issue/bind use the real authority,
// playback-range-session and shared cache adapter; the HTTP origin is loopback.
// readCurrentBytes normally uses explicit test injection. The budget-reader
// integration case runs the maintained reader with a synthetic helper getter;
// it is not a Native DLL/property measurement.
const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const http = require('node:http');
const fs = require('node:fs/promises');
const {temporaryRoot} = require('./helpers/range-fixture-root.cjs');
const crypto = require('node:crypto');
const path = require('node:path');
const {readFileSync} = require('node:fs');
const {createRequire} = require('node:module');
const {performance} = require('node:perf_hooks');
const {createAuthority} = require('../src/electronapp/enhanced/preload-source-authority');
const {createSession} = require('../src/electronapp/enhanced/playback-range-session');
const {createCache} = require('../src/electronapp/enhanced/shared-playback-cache/adapter');
const {createStore} = require('../src/electronapp/enhanced/shared-playback-cache/store');
const diagnostics = require('../src/electronapp/enhanced/playback-range-diagnostics');

const BLOCK = 256 * 1024;
const MEDIA_BUFFER_BYTES = 512 * 1024;
const PRELOAD_MB = 100;
const UA = 'OwnedSynthetic/1.0';
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
// Functional ownership cases must not assert a 50ms cold-filesystem SLA.
// Load the exact maintained CJS in Node's own realm and control ONLY its one
// lexical preparation timer; HTTP, FS, authority and adapter code remain real.
function controlledSessionClock() {
  const file = require.resolve('../src/electronapp/enhanced/playback-range-session');
  const source = readFileSync(file, 'utf8');
  assert.match(source, /const SHARED_PREPARE_TIMEOUT_MS = 50;/);
  assert.equal((source.match(/\bsetTimeout\s*\(/g) || []).length, 1);
  assert.equal((source.match(/\bclearTimeout\s*\(/g) || []).length, 1);
  const pending = new Map(), known = new Set(); let created = 0, fired = 0, cleared = 0, clockMs = 0;
  const arm = (fn, ms) => {assert.equal(ms, 50); const timer = {fn, ms}; pending.set(timer, timer); known.add(timer); created++; return timer;};
  const disarm = timer => {assert.ok(known.has(timer)); known.delete(timer); pending.delete(timer); cleared++;};
  const loaded = {exports: {}};
  new Function('exports', 'require', 'module', '__filename', '__dirname', 'setTimeout', 'clearTimeout', source)(
    loaded.exports, createRequire(file), loaded, file, path.dirname(file), arm, disarm);
  return {createSession: options => loaded.exports.createSession({...options, now: () => clockMs}),
    advance(ms) {clockMs += ms;},
    status: () => ({created, fired, cleared, pending: pending.size}),
    expire() {assert.equal(pending.size, 1); const timer = pending.keys().next().value; pending.delete(timer); clockMs += timer.ms; fired++; timer.fn();}};
}
function gate() {let release; const promise = new Promise(resolve => {release = resolve;}); return {promise, release};}
function selectionMessage(session, events, error) {
  const current = session.status().current?.diagnostic;
  return JSON.stringify({current: current ? diagnostics.snapshot(current) : null,
    events: events.map(value => diagnostics.snapshot(value)),
    error: error ? diagnostics.fromError(error, 'current-probe', 'unexpected') : null});
}
async function requireSelected(fixture, selecting) {
  let selected;
  try {selected = await selecting;}
  catch (error) {assert.fail(selectionMessage(fixture.session, fixture.selectionDiagnostics, error));}
  assert.ok(selected, selectionMessage(fixture.session, fixture.selectionDiagnostics));
  return selected;
}
async function cleanup(actions, remove) {
  const results = await Promise.allSettled(actions.map(action => Promise.resolve().then(action)));
  results.push(...await Promise.allSettled([Promise.resolve().then(remove)]));
  const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
  if (errors.length) throw new AggregateError(errors, 'owned-session-fixture-cleanup-failed');
}

async function localOrigin({aBytes = Buffer.alloc(BLOCK, 0x41), bBytes = Buffer.alloc(BLOCK, 0x42), delayMs = 0, responseGate, observeRequests = false} = {}) {
  const objects = new Map([['A', aBytes], ['B', bBytes], ['C', aBytes]]);
  const requests = [], sockets = new Set(), connections = [], clientRequests = [], trace = [];
  let version = 1, firstProbeFlushed;
  const mark = (event, fields = {}) => {const row = {sequence: trace.length, atMs: performance.now(), event, ...fields}; trace.push(row); return row.sequence;};
  const server = http.createServer((req, res) => {
    const item = /^\/(A|B|C)\.mkv$/.exec(new URL(req.url, 'http://127.0.0.1').pathname)?.[1];
    const data = objects.get(item);
    const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    const start = match ? Number(match[1]) : 0;
    const end = match && match[2] ? Number(match[2]) : data ? data.length - 1 : -1;
    const request = {item, start, end, method: req.method, peerPort: req.socket.remotePort, closed: false}; requests.push(request);
    request.arrived = mark('origin-request', {item, start, end, peerPort: request.peerPort});
    res.once('close', () => {request.closed = true; mark('origin-response-close', {peerPort: request.peerPort});});
    if (!data || !match || start < 0 || end < start || end >= data.length) {
      res.writeHead(416); res.end(); return;
    }
    const send = () => {
      if (res.destroyed) return;
      res.writeHead(206, {'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${data.length}`,
        'Content-Type': 'application/octet-stream', 'Last-Modified': 'Wed, 21 Oct 2026 08:00:00 GMT',
        ETag: '"owned-synthetic-v' + version + '"'});
      res.end(data.subarray(start, end + 1));
    };
    if (responseGate) responseGate.then(send); else if (delayMs) setTimeout(send, delayMs); else send();
  });
  server.on('connection', socket => {
    const connection = {socket, peerPort: socket.remotePort, closed: false}; connections.push(connection); sockets.add(socket);
    mark('origin-connection', {peerPort: connection.peerPort});
    socket.once('close', () => {connection.closed = true; sockets.delete(socket); mark('origin-socket-close', {peerPort: connection.peerPort});});
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  // Observe only requests to this fixture. Keep original arguments, return
  // identity and transport behavior; restore the shared Node method on close.
  const originalRequest = http.request;
  function observedRequest(...args) {
    const request = Reflect.apply(originalRequest, this, args);
    if (typeof args[0] === 'string' && args[0].startsWith(origin + '/')) {
      const row = {id: clientRequests.length + 1, item: new URL(args[0]).pathname, range: request.getHeader('range'),
        method: request.method, localPort: null, finished: false, closed: false}; clientRequests.push(row);
      row.created = mark('client-request', {id: row.id, item: row.item, range: row.range});
      request.once('finish', () => {row.finished = true; row.localPort = request.socket?.localPort;
        mark('client-finish', {id: row.id, localPort: row.localPort});
        if (row.id === 1 && firstProbeFlushed) firstProbeFlushed();});
      request.once('close', () => {row.closed = true; row.closeSequence = mark('client-close', {id: row.id, localPort: row.localPort});});
    }
    return request;
  }
  if (observeRequests) http.request = observedRequest;
  return {origin, requests, clientRequests, connections, trace, note: mark,
    atFirstProbeFlush(callback) {firstProbeFlushed = callback;}, version(value) {version = value;}, replace(item, data) {objects.set(item, data);},
    async close() {
      const ownsObserver = !observeRequests || http.request === observedRequest;
      if (observeRequests && ownsObserver) http.request = originalRequest;
      for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve));
      assert.equal(ownsObserver, true, 'fixture must restore exactly its owned HTTP observer');
    }};
}

async function freshRoot() {
  return temporaryRoot('ete-app-session-cache-', ['']);
}

async function fixture(t, options = {}) {
  const optionsForFixture = options;
  const root = await freshRoot();
  let origin, authority, session;
  const clock = controlledSessionClock();
  t.after(async () => {
    await cleanup([() => session?.close(), () => authority?.close(), () => origin?.close()],
      () => fs.rm(root, {recursive: true, force: true}));
    assert.equal(clock.status().pending, 0, 'no test-owned prepare timer survives cleanup');
    assert.equal(clock.status().cleared, clock.status().created);
  });
  origin = await localOrigin(options.origin);
  authority = createAuthority();
  const webA = new EventEmitter(), webB = new EventEmitter();
  webA.isDestroyed = webB.isDestroyed = () => false;
  const principalA = authority.principalFor(webA), principalB = authority.principalFor(webB);
  const helper = {currentGenerationId: 1, exited: false, transportTerminated: false};
  let budgetBytes = MEDIA_BUFFER_BYTES, budgetCurrent = true, budgetCommits = 0;
  const nativeBudgetCalls = [];
  helper.getProperty = async (...args) => {nativeBudgetCalls.push(args);return budgetBytes;};
  const realBudget = options.realBudget ? require('../src/electronapp/native-helper/shared-cache-budget').createBudgetReader((owned,generation) => owned===helper&&generation===helper.currentGenerationId&&budgetCurrent) : null;
  let bindingPrincipal = principalA, currentRequestId = 'play-A', nextRequestPrefix = 'play-A-next-', cache, createCount = 0;
  const currentBytesReads = [];
  const selectionDiagnostics = [];
  const config = {kind: 'shared-byte-trial', root, progressPercent: 50, preloadMB: PRELOAD_MB, timeoutMs: 1000};
  session = clock.createSession({config,
    onDiagnostic(value) {selectionDiagnostics.push(diagnostics.snapshot(value));},
    async create(value) {
      createCount++;
      if (options.createGate) await options.createGate;
      if (options.slowCreateMs) await delay(options.slowCreateMs);
      cache = await createCache(value, {async createStore(options) {
        if (optionsForFixture.storeGate) await optionsForFixture.storeGate;
        try {return await createStore(options);}
        catch (error) {
          console.log(JSON.stringify({type: 'owned-session-store-create-failed',
            code: ['EADDRINUSE', 'EACCES', 'EPERM', 'ENOENT', 'EBUSY'].includes(error?.code) ? error.code : 'unknown'}));
          throw error;
        }
      }});
      return cache;
    },
    authorize(value, role, signal) {
      return authority.bind({principal: bindingPrincipal, signal, sourceProof: value.sourceProof, source: value.source,
        ...(role === 'current' ? {requestId: currentRequestId} : {requestPrefix: nextRequestPrefix})});
    },
    async readCurrentBytes(_helper, generationId) {
      currentBytesReads.push(generationId);
      if (options.currentBytesGate) await options.currentBytesGate;
      if (options.slowCurrentBytesMs) await delay(options.slowCurrentBytesMs);
      if (realBudget) return realBudget.read(_helper,generationId);
      return {bytes: budgetBytes, isCurrent: () => budgetCurrent, commit() {budgetCommits++;}};
    }});

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
  return {root, origin, authority, principalA, principalB, helper, session, config, candidate, loadOptions, clock,
    webA, webB,
    get cache() {return cache;}, get createCount() {return createCount;}, currentBytesReads, selectionDiagnostics,
    setBudget(bytes, current = true) {budgetBytes = bytes; budgetCurrent = current;},
    setBudgetGate(value) {options.currentBytesGate = value;}, get budgetCommits() {return budgetCommits;},realBudget,nativeBudgetCalls,
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

test('strict load binding replaces the source with the loopback cache route and streams actual bytes', {timeout:10000}, async t => {
  const f = await fixture(t); let a = f.candidate('A');
  await f.session.setContext(a, f.helper, 1);
  const altered = f.loadOptions(a).slice(); altered[4] = 'user-agent=Wrong/1.0';
  assert.equal(await f.session.select(a.source, f.helper, 1, altered), null);
  assert.equal(f.createCount, 0, 'mismatched load options cannot initialize the cache');
  assert.equal(await f.session.select(a.source, f.helper, 1, f.loadOptions(a)), null, 'fallback is latched for that Play');
  f.helper.currentGenerationId = 2; f.setCurrentRequestId('play-again');
  a = f.candidate('A', {requestId:'play-again'});
  await f.session.setContext(a, f.helper, 2);
  const selected = await requireSelected(f, f.session.select(a.source, f.helper, 2, f.loadOptions(a)));
  assert.notEqual(selected.source, a.source, 'the replacement source belongs to the loopback proxy');
  assert.equal(selected.canDispatch(), true);
  // This invokes the session callback directly. It is not a Native Helper/core-idle observation.
  await f.session.started(f.helper, 2);
  const result = await getRange(selected.source);
  assert.equal(result.status, 206);
  assert.equal(digest(result.body), digest(Buffer.alloc(BLOCK, 0x41)));
  assert.ok(f.origin.requests.some(row => row.item === 'A'), 'HTTP bytes came from the owned synthetic source');
  assert.deepEqual(f.currentBytesReads, [2], 'M comes from the explicit test-only injection');
  assert.equal(f.cache.status().maxBytes, MEDIA_BUFFER_BYTES + PRELOAD_MB * 1024 * 1024);
});

test('preparing B preserves A, actual B promotes its warmed bytes, and close discards unplayed C', {timeout:10000}, async t => {
  const f = await fixture(t), a = f.candidate('A');
  const selectedA = await requireSelected(f, selectCurrent(f, a));
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
  const selectedB = await requireSelected(f, selectCurrent(f, bCurrent));
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
    nextBytes: PRELOAD_MB * 1024 * 1024, recoveryMode: 'on-demand'});
  try {
    assert.ok(recovered.status().current >= BLOCK);
    assert.equal(recovered.status().next, 0);
  } finally {await recovered.close();}
});

test('document navigation revokes the transport and prevents a cached local hit', {timeout:10000}, async t => {
  const f = await fixture(t), a = f.candidate('A');
  const selected = await requireSelected(f, selectCurrent(f, a));
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

test('foreign principal proof and changed account identity cannot reuse A bytes', {timeout:10000}, async t => {
  const f = await fixture(t), a = f.candidate('A');
  const selectedA = await requireSelected(f, selectCurrent(f, a));
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
  const selectedB = await requireSelected(f, selectCurrent(f, accountB));
  const result = await getRange(selectedB.source);
  assert.equal(result.status, 206);
  assert.equal(digest(result.body), digest(changedBody), 'account B gets current origin bytes, never A cached bytes');
});

test('shared-trial exact 50ms logical deadline retires gated budget, initialization, and probe work', {timeout:10000}, async t => {
  await t.test('gated current-byte read', async st => {
    const hold = gate(), f = await fixture(st, {currentBytesGate: hold.promise}), a = f.candidate('A');
    try {
      const selecting = selectCurrent(f, a);
      assert.ok(await waitFor(() => f.clock.status().pending === 1)); f.clock.expire();
      assert.equal(await selecting, null);
      assert.equal(f.origin.requests.length, 0, 'expiry precedes any fresh source probe');
      assert.deepEqual(f.session.status().current.diagnostic, {stage:'current-probe',reason:'timeout'});
    } finally {hold.release();}
    await f.session.close(); await delay(0);
    assert.equal(f.createCount, 0, 'late M cannot initialize a cache or issue a probe');
    assert.equal(f.origin.requests.length, 0); assert.deepEqual(f.currentBytesReads,[1]);
    assert.equal(f.clock.status().fired, 1); assert.equal(f.clock.status().pending, 0);
  });
  await t.test('gated cache initialization', async st => {
    const hold = gate(), f = await fixture(st, {createGate:hold.promise}), a = f.candidate('A');
    try {
      const selecting = selectCurrent(f,a);
      assert.ok(await waitFor(() => f.createCount === 1)); f.clock.expire();
      assert.equal(await selecting,null); assert.equal(f.origin.requests.length,0);
    } finally {hold.release();}
    await f.session.close(); assert.equal(f.cache.status().unavailable,false);
    assert.equal(f.cache.status().routes,0); assert.equal(f.clock.status().pending,0);
  });
  await t.test('gated origin probe is cancelled and joined', async st => {
    const hold = gate(), f = await fixture(st,{origin:{responseGate:hold.promise}}), a = f.candidate('A');
    try {
      const selecting = selectCurrent(f,a);
      assert.ok(await waitFor(() => f.origin.requests.length > 0)); f.clock.expire();
      assert.equal(await selecting,null);
      await f.session.close();
      assert.ok(await waitFor(() => f.origin.requests[0].closed), 'the one-byte HTTP request physically closes before releasing its response');
      assert.equal(f.cache.status().routes,0);
    } finally {hold.release();}
    assert.equal(f.clock.status().pending,0);
  });
});

test('default next-prefix session mode still selects a same-origin source route', {timeout:10000}, async t => {
  const root = await freshRoot();
  let origin, session;
  t.after(() => cleanup([() => session?.close(), () => origin?.close()], () => fs.rm(root, {recursive: true, force: true})));
  origin = await localOrigin();
  const helper = {currentGenerationId: 1, exited: false, transportTerminated: false};
  const selectionDiagnostics = [];
  session = createSession({config: {kind: 'next-prefix', root, progressPercent: 50, preloadMB: 100, timeoutMs: 1000},
    onDiagnostic(value) {selectionDiagnostics.push(diagnostics.snapshot(value));}});
  const source = `${origin.origin}/A.mkv?Static=true`;
  const context = {source, serverOrigin: origin.origin, serverId: 'owned-server', accountId: 'account-A', itemId: 'A',
    mediaSourceId: 'media-A', playSessionId: 'session-A', mode: 'DirectStream', mediaType: 'Video', container: 'mkv', live: false};
  await session.setContext(context, helper, 1);
  const selected = await requireSelected({session, selectionDiagnostics}, session.select(source, helper, 1, ['loadfile', source]));
  assert.notEqual(selected.source, source);
  const result = await getRange(selected.source, 0, 4096);
  assert.equal(result.status, 206);
  assert.equal(digest(result.body), digest(Buffer.alloc(4096, 0x41)));
});

test('selection assertion messages retain only known diagnostic reasons without source or error payloads', async () => {
  const privateValue = 'PRIVATE_CANARY https://private.invalid/?proof=SECRET_TOKEN C:\\private\\source';
  const fixture = {session: {status: () => ({current: {diagnostic: {
    stage: 'current-probe', reason: 'timeout', source: privateValue}}, sourceProof: privateValue})},
  selectionDiagnostics: [{stage: 'current-probe', reason: 'auth-required', source: privateValue}]};
  const failure = Object.assign(Error(privateValue), {preloadReason: 'cache-unavailable'});
  for (const selecting of [Promise.resolve(null), Promise.reject(failure)]) {
    await assert.rejects(requireSelected(fixture, selecting), error => {
      assert.match(error.message, /"reason":"timeout"/);
      assert.match(error.message, /"reason":"auth-required"/);
      assert.doesNotMatch(error.message, /PRIVATE_CANARY|SECRET_TOKEN|private\.invalid|C:\\private/);
      return true;
    });
  }
});


test('shared selection includes pending disk recovery in its existing finite prepare budget', {timeout:10000}, async t => {
  let release; const storeGate = new Promise(resolve => {release = resolve;});
  const f = await fixture(t, {storeGate}), a = f.candidate('A');
  try {
    const selecting = selectCurrent(f,a);
    assert.ok(await waitFor(() => f.cache?.status().initializing === true));
    f.clock.expire();
    assert.equal(await selecting, null, 'an unready proxy must not be dispatched as a restored cache');
    assert.equal(f.cache.status().initializing, true);
    assert.deepEqual(f.session.status().current.diagnostic, {stage:'current-probe',reason:'timeout'});
    assert.ok(f.origin.requests.every(row => row.start === 0 && row.end === 0));
  } finally {release();}
  await f.session.close();
});

test('fresh application selection reuses retained bytes on its first body without preload or early actual promotion', {timeout:10000}, async t => {
  const f = await fixture(t), seedCandidate = f.candidate('B');
  const owner = new AbortController();
  const transport = f.authority.bind({principal:f.principalA,signal:owner.signal,
    sourceProof:seedCandidate.sourceProof,source:seedCandidate.source,requestId:'play-A'});
  const seeded = await createCache(f.config);
  try {
    const handle = await seeded.open({source:seedCandidate.source,transport,
      identity:{serverOrigin:seedCandidate.serverOrigin,serverId:seedCandidate.serverId,accountId:seedCandidate.accountId,
        itemId:seedCandidate.itemId,mediaSourceId:seedCandidate.mediaSourceId,representation:transport.representation},
      currentBytes:MEDIA_BUFFER_BYTES,isCurrent:()=>true,signal:owner.signal});
    await handle.prefetch({maxBytes:BLOCK,signal:owner.signal});
    await handle.markPlaying();
  } finally {await seeded.close();}
  const before=f.origin.requests.length;
  const selected=await requireSelected(f,selectCurrent(f,f.candidate('B')));
  assert.equal(f.cache.status().currentBytes,BLOCK,'the new manager recovered the real prior actual object');
  const response=await getRange(selected.source);
  assert.equal(response.status,206);
  assert.equal(digest(response.body),digest(Buffer.alloc(BLOCK,0x42)));
  const requests=f.origin.requests.slice(before);
  assert.equal(requests.length,1,'only the fresh authorized one-byte identity probe is allowed');
  assert.deepEqual([requests[0].start,requests[0].end],[0,0]);
});

test('strict shared assertions still reject an original-source fallback at the controlled 50ms expiry', {timeout:10000}, async t => {
  const hold = gate(), f = await fixture(t, {createGate:hold.promise}), a = f.candidate('A');
  try {
    const selecting = selectCurrent(f,a);
    assert.ok(await waitFor(() => f.createCount === 1)); f.clock.expire();
    await assert.rejects(requireSelected(f,selecting), error => {
      assert.match(error.message, /"reason":"timeout"/); return true;
    });
    assert.equal(f.origin.requests.length,0);
    assert.equal(f.session.status().current.state,'original');
  } finally {hold.release();}
});


// This fence counts constructor-time submissions as well as server arrivals.
// A cancelled request may arrive after its client closes, so first join the
// exact initial probe on BOTH sides before forbidding any subsequent traffic.
function requestFence(origin) {
  return {
    client: origin.clientRequests.map(({id,item,range,method,localPort,finished,closed}) => ({id,item,range,method,localPort,finished,closed})),
    server: origin.requests.map(({item,start,end,method,peerPort,closed}) => ({item,start,end,method,peerPort,closed}))
  };
}
function assertNoAdditionalRequests(origin, fence) {
  assert.deepEqual(requestFence(origin), fence, 'backend readiness must issue no additional probe or media body request');
}
async function coldFallbackFixture(t, delayedArrival, extra = {}) {
  const hold = gate(); t.after(hold.release);
  const f = await fixture(t, {...extra,storeGate: hold.promise, origin:{observeRequests:true}}), a = f.candidate('A');
  const reached = async predicate => assert.ok(await waitFor(predicate), JSON.stringify(f.origin.trace));
  assert.deepEqual(f.session.status().backend, {state:'idle'});
  let arrivalCountAtExpiry;
  if (delayedArrival) f.origin.atFirstProbeFlush(() => {
    // Expire synchronously at the real client's flush boundary, before the
    // loopback server gets another I/O turn. No network delay/retry is added.
    arrivalCountAtExpiry = f.origin.requests.length;
    f.clock.expire(); f.origin.note('selection-expired');
  });
  const selecting = selectCurrent(f, a);
  await reached(() => f.cache?.status().backendState === 'initializing' && f.origin.clientRequests.length === 1 &&
    f.origin.clientRequests[0].finished && f.origin.connections.length === 1);
  assert.deepEqual(f.session.status().backend, {state:'initializing'});
  if (delayedArrival) assert.equal(arrivalCountAtExpiry, 0, 'expiry precedes the flushed probe HTTP arrival');
  else {
    await reached(() => f.origin.requests.length === 1 && f.origin.requests[0].closed);
    f.clock.expire(); f.origin.note('selection-expired');
  }
  assert.equal(await selecting, null);
  await reached(() => f.origin.clientRequests[0].closed);
  const starting = f.session.started(f.helper, 1);
  assert.equal(f.session.status().current.route, 'original');
  const diagnostic = f.session.status().current.diagnostic;
  await reached(() => f.origin.requests.length === 1 && f.origin.requests[0].closed && f.origin.connections.every(c => c.closed));
  assert.equal(f.origin.clientRequests.length, 1, 'silence baseline cannot absorb an extra submitted request');
  assert.equal(f.origin.connections.length, 1, 'only the initial probe connection may enter the baseline');
  const clientProbe = f.origin.clientRequests[0], serverProbe = f.origin.requests[0];
  assert.equal(clientProbe.range, 'bytes=0-0'); assert.equal(clientProbe.method, 'GET');
  assert.deepEqual([serverProbe.item,serverProbe.start,serverProbe.end,serverProbe.method], ['A',0,0,'GET']);
  assert.equal(clientProbe.localPort, serverProbe.peerPort, 'arrival belongs to the exact flushed connection');
  if (delayedArrival) assert.ok(f.origin.trace.find(row => row.event === 'selection-expired').sequence < serverProbe.arrived,
    'arrival after expiry is the same pre-existing flushed probe');
  assert.equal(f.cache.status().initializing, true, 'late arrival predates backend recovery, not a background retry');
  const fence = requestFence(f.origin);
  hold.release(); await starting;
  await reached(() => f.session.status().backend.state === 'ready' && f.cache.status().routes === 0);
  assert.equal(f.session.status().current.route, 'original');
  assert.deepEqual(f.session.status().current.diagnostic, diagnostic);
  assert.equal(f.session.status().current.bytes, 0);
  assert.equal(f.cache.status().bytes, 0, 'background recovery did not fetch a body');
  assert.equal(await f.session.select(a.source, f.helper, 1, f.loadOptions(a)), null, 'same Play cannot retry into a proxy');
  assert.equal((await f.session.preload(f.candidate('B'), f.helper, 1)).state, 'unavailable');
  assertNoAdditionalRequests(f.origin, fence);
  return {f,a,fence};
}

for (const delayedArrival of [false,true]) test('cold fallback never reselects current media; a new authorized generation reuses infrastructure / ' +
  (delayedArrival ? 'probe arrives after expiry' : 'probe arrives before expiry'), {timeout:10000}, async t => {
  const {f,a} = await coldFallbackFixture(t, delayedArrival);
  assert.equal(digest((await getRange(a.source)).body), digest(Buffer.alloc(BLOCK, 0x41)), 'fallback can play the original bytes');
  assert.equal(f.session.status().current.route, 'original');
  assert.ok(await waitFor(() => f.cache.status().routes === 0));

  f.helper.currentGenerationId = 2; f.setCurrentRequestId('play-again');
  const again = f.candidate('A', {requestId:'play-again'}), before = f.origin.requests.length;
  const selected = await requireSelected(f, selectCurrent(f, again));
  assert.deepEqual(f.currentBytesReads, [1,2], 'backend reuse still reads the new Native generation budget');
  assert.equal(f.createCount, 1);
  assert.equal(f.session.status().current.route, 'proxy');
  assert.equal(f.cache.status().bytes, 0, 'ready backend and route are not body hits');
  assert.deepEqual(f.origin.requests.slice(before).map(r => [r.start,r.end]), [[0,0]], 'a fresh probe remains mandatory');
  assert.equal(digest((await getRange(selected.source)).body), digest(Buffer.alloc(BLOCK, 0x41)));
  assert.ok(f.origin.requests.slice(before).some(r => r.end > r.start), 'empty recovered infrastructure still needs origin body bytes');
  await f.session.close();
  assert.equal(f.cache.status().backendState, 'closed');
});

test('cold original playback independently warms authorized next media; natural next reuses bytes and reopen retains only actual B', {timeout:10000}, async t => {
  const {f,a}=await coldFallbackFixture(t,false),diagnostic=f.session.status().current.diagnostic;
  const before=f.origin.requests.length,commits=f.budgetCommits;
  const next=f.candidate('B',{requestId:'play-A-next-1'});
  const result=await f.session.preload(next,f.helper,1);
  assert.equal(result.state,'ready',JSON.stringify(result.diagnostic));assert.equal(result.bytes,BLOCK);
  assert.equal(f.budgetCommits,commits+1);assert.equal(f.session.status().current.route,'original');assert.deepEqual(f.session.status().current.diagnostic,diagnostic);
  assert.equal(f.session.status().current.bytes,0);assert.equal(f.cache.status().currentBytes,0);assert.equal(f.cache.status().nextBytes,BLOCK);
  assert(f.origin.requests.slice(before).every(r=>r.item==='B'),'next work cannot reopen or fetch current A');
  assert.equal(await f.session.select(a.source,f.helper,1,f.loadOptions(a)),null);
  await f.session.retire();f.helper.currentGenerationId=2;f.setCurrentRequestId('play-B');f.setNextRequestPrefix('play-B-next-');
  const b=f.candidate('B',{requestId:'play-B'}),probeStart=f.origin.requests.length,selected=await requireSelected(f,selectCurrent(f,b));
  assert.equal(digest((await getRange(selected.source)).body),digest(Buffer.alloc(BLOCK,0x42)));
  assert(f.origin.requests.slice(probeStart).every(r=>r.item==='B'&&r.start===0&&r.end===0),'new actual B revalidates access without repeating warmed body');
  await f.session.started(f.helper,2);assert(await waitFor(()=>f.cache.status().currentBytes===BLOCK&&f.cache.status().nextBytes===0));
  await f.session.close();const restored=await createStore({root:f.root,currentBytes:MEDIA_BUFFER_BYTES,nextBytes:PRELOAD_MB*1048576,recoveryMode:'on-demand'});
  try{assert.equal(restored.status().current,BLOCK);assert.equal(restored.status().next,0);assert.equal(digest(await restored.read(restored.status().currentKey,0,BLOCK)),digest(Buffer.alloc(BLOCK,0x42)));}finally{await restored.close();}
});

for(const [label,bytes,current]of [['stale',MEDIA_BUFFER_BYTES,false],['too-small',1,true],['non-integer',3.5,true],['too-large',3072*1048576+1,true]])test('cold next refuses '+label+' real budget without new HTTP or reviving current', {timeout:10000},async t=>{
  const {f,fence}=await coldFallbackFixture(t,false);f.setBudget(bytes,current);
  const result=await f.session.preload(f.candidate('B',{requestId:'play-A-next-1'}),f.helper,1);
  assert.equal(result.state,'unavailable');assert.equal(f.session.status().next.state,'unavailable');assert.equal(f.session.status().current.route,'original');assert.equal(f.cache.status().nextBytes,0);assertNoAdditionalRequests(f.origin,fence);
});

test('cancelled cold-next budget read cannot start late routes, keys or bodies', {timeout:10000},async t=>{
  const {f,fence}=await coldFallbackFixture(t,false),hold=gate();t.after(hold.release);f.setBudgetGate(hold.promise);
  const warming=f.session.preload(f.candidate('B',{requestId:'play-A-next-1'}),f.helper,1);
  assert(await waitFor(()=>f.currentBytesReads.length===2));await f.session.cancelNext();hold.release();const result=await warming;
  assert.equal(result.state,'cancelled');assert.equal(f.session.status().current.route,'original');assert.equal(f.cache.status().nextBytes,0);assertNoAdditionalRequests(f.origin,fence);
});

for(const [label,options]of [['foreign-account',{requestId:'play-A-next-1',accountId:'other-account'}],['current-only-proof',{requestId:'play-A'}]])test('cold next rejects '+label+' independently of its ready backend', {timeout:10000},async t=>{
  const {f,fence}=await coldFallbackFixture(t,false),before=f.currentBytesReads.length;
  const result=await f.session.preload(f.candidate('B',options),f.helper,1);assert.equal(result.state,'unavailable');
  assert.equal(f.session.status().current.route,'original');assert.equal(f.cache.status().nextBytes,0);assert.equal(f.currentBytesReads.length,before);assertNoAdditionalRequests(f.origin,fence);
});

test('cold next uses actual budget-reader commit/retire barriers without locking the original fallback early', {timeout:10000},async t=>{
  const {f}=await coldFallbackFixture(t,false,{realBudget:true});assert.equal(f.nativeBudgetCalls.length,1);assert.deepEqual(f.nativeBudgetCalls[0],['demuxer-max-bytes',50]);
  assert.doesNotThrow(()=>f.realBudget.beforeWrite(),'original fallback did not commit a proxy budget');
  const result=await f.session.preload(f.candidate('B',{requestId:'play-A-next-1'}),f.helper,1);assert.equal(result.state,'ready');
  assert.equal(f.nativeBudgetCalls.length,2,'a settings revision must force a real new property read');assert.throws(()=>f.realBudget.beforeWrite(),/budget-in-use/);
  assert.equal(f.session.status().current.route,'original');await f.session.cancelNext();assert.equal(f.cache.status().nextBytes,0);
  f.realBudget.retire();assert.doesNotThrow(()=>f.realBudget.beforeWrite(),'new generation retires the held budget');
});

test('exiting after cold-next warming discards unplayed B instead of inventing a retained actual object', {timeout:10000},async t=>{
  const {f}=await coldFallbackFixture(t,false);assert.equal((await f.session.preload(f.candidate('B',{requestId:'play-A-next-1'}),f.helper,1)).state,'ready');
  assert.equal(f.cache.status().currentBytes,0);assert.equal(f.cache.status().nextBytes,BLOCK);await f.session.close();
  const restored=await createStore({root:f.root,currentBytes:MEDIA_BUFFER_BYTES,nextBytes:PRELOAD_MB*1048576,recoveryMode:'on-demand'});
  try{assert.equal(restored.status().current,0);assert.equal(restored.status().next,0);assert.equal(restored.status().currentKey,null);}finally{await restored.close();}
});

// Inject only into the synthetic origin AFTER the production fence is stable.
// A new request is a failure before the server receives it, as well as afterwards.
for (const range of ['bytes=0-0','bytes=0-1']) test('background traffic fence rejects new ' + range + ' before and after server arrival', {timeout:10000}, async t => {
  const {f,a,fence} = await coldFallbackFixture(t, true);
  const extra = http.request(a.source, {agent:false, headers:{Range:range,Connection:'close'}});
  extra.on('error', () => {});
  extra.on('response', response => response.resume());
  t.after(() => extra.destroy());
  extra.end();
  assert.equal(f.origin.requests.length, 1, 'no additional server arrival yet');
  assert.throws(() => assertNoAdditionalRequests(f.origin, fence), assert.AssertionError);
  assert.ok(await waitFor(() => f.origin.clientRequests.length === 2 && f.origin.clientRequests[1].finished && f.origin.connections.length === 2));
  assert.ok(await waitFor(() => f.origin.requests.length === 2 && f.origin.requests[1].closed && f.origin.clientRequests[1].closed));
  assert.deepEqual([f.origin.requests[1].start,f.origin.requests[1].end], range === 'bytes=0-0' ? [0,0] : [0,1]);
  assert.throws(() => assertNoAdditionalRequests(f.origin, fence), assert.AssertionError);
  assert.equal(f.session.status().current.route, 'original');
  assert.equal(f.cache.status().bytes, 0);
});

for (const phase of ['budget','store']) test('absolute prepare expiry rejects late ' + phase + ' completion before its timer callback runs', {timeout:10000}, async t => {
  const hold = gate(); t.after(hold.release);
  const f = await fixture(t, phase === 'budget' ? {currentBytesGate: hold.promise} : {storeGate: hold.promise});
  const a = f.candidate('A'), selecting = selectCurrent(f, a);
  assert.ok(await waitFor(() => phase === 'budget' ? f.currentBytesReads.length === 1 : f.cache?.status().initializing));
  f.clock.advance(50); hold.release();
  assert.equal(await selecting, null);
  assert.equal(f.clock.status().fired, 0, 'only the monotonic clock crossed the deadline');
  assert.equal(f.session.status().current.route, 'original');
  assert.deepEqual(f.session.status().current.diagnostic, {stage:'current-probe',reason:'timeout'});
  if (phase === 'budget') assert.equal(f.createCount, 0);
  else {
    assert.ok(await waitFor(() => f.cache.status().backendState === 'ready'));
    assert.equal(f.cache.status().bytes, 0);
  }
  assert.ok(f.origin.requests.every(r => r.start === 0 && r.end === 0));
});

test('ready backend still rejects stale proof and budget, and revalidates a changed representation before body reuse', {timeout:10000}, async t => {
  const f = await fixture(t), a = f.candidate('A');
  const first = await requireSelected(f, selectCurrent(f, a));
  await f.session.started(f.helper, 1); await getRange(first.source);
  assert.ok(await waitFor(() => f.cache.status().bytes >= BLOCK));
  const createCount = f.createCount;
  f.helper.currentGenerationId = 2; f.setCurrentRequestId('play-2');
  let before = f.origin.requests.length;
  assert.equal(await selectCurrent(f, a), null, 'old request proof cannot be reused');
  assert.equal(f.origin.requests.length, before);
  f.helper.currentGenerationId = 3; f.setCurrentRequestId('play-3'); f.setBudget(MEDIA_BUFFER_BYTES, false);
  assert.equal(await selectCurrent(f, f.candidate('A', {requestId:'play-3'})), null);
  assert.equal(f.origin.requests.length, before, 'retired Native budget cannot reach source probe');
  f.helper.currentGenerationId = 4; f.setCurrentRequestId('play-4'); f.setBudget(MEDIA_BUFFER_BYTES);
  f.origin.version(2); f.origin.replace('A', Buffer.alloc(BLOCK, 0x59));
  const changed = await requireSelected(f, selectCurrent(f, f.candidate('A', {requestId:'play-4'})));
  const response = await getRange(changed.source);
  assert.equal(digest(response.body), digest(Buffer.alloc(BLOCK, 0x59)), 'old cached body cannot survive a changed validator');
  assert.ok(f.origin.requests.slice(before).some(r => r.end > r.start));
  assert.equal(f.createCount, createCount);
  assert.deepEqual(f.currentBytesReads, [1,3,4]);
});
