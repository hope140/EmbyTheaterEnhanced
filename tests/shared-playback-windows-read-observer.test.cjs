'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const {install} = require('../tools/shared-playback-cache/windows-read-observer.cjs');
const smoke = require('../tools/shared-playback-cache/windows-smoke.cjs');
const proxyModule = require('../src/electronapp/enhanced/shared-playback-cache/proxy');
const {createStore} = require('../src/electronapp/enhanced/shared-playback-cache/store');
const {temporaryRoot} = require('./helpers/range-fixture-root.cjs');
const fixture = require('../tools/shared-playback-cache/fixture.cjs');

function observedFixtureRoot(prefix, allocate=temporaryRoot) {return allocate(prefix,['']);}
async function setupStage(stage, operation, diagnostic=()=>{}) {
  diagnostic(JSON.stringify({type:'read-observer-setup',stage,state:'begin'}));
  try {const value=await operation();diagnostic(JSON.stringify({type:'read-observer-setup',stage,state:'ready'}));return value;}
  catch(error){diagnostic(JSON.stringify({type:'read-observer-setup',stage,state:'failed',
    code:['EACCES','EADDRINUSE'].includes(error?.code)?error.code:'other',
    port:Number.isInteger(error?.port)&&error.port>0&&error.port<=65535?error.port:null}));throw error;}
}
async function cleanupReadFixture({proxy,origin,store,observer},remove) {
  const outcomes=await Promise.allSettled([()=>proxy?.close(),()=>origin?.close()].map(action=>Promise.resolve().then(action)));
  outcomes.push(...await Promise.allSettled([()=>store?.close(),()=>observer?.restore()].map(action=>Promise.resolve().then(action))));
  outcomes.push(...await Promise.allSettled([Promise.resolve().then(remove)]));
  const errors=outcomes.filter(row=>row.status==='rejected');
  if(errors.length)throw new AggregateError(errors.map(row=>row.reason),'read-observer-real-fixture-cleanup-failed');
}

const filename = path.resolve('/owned/runtime/enhanced/shared-playback-cache/proxy.js');
const source = Buffer.from(`'use strict';
const {performance} = require('node:perf_hooks');
exports.createProxy = function (options) {
  const store = options.store;
  return {
    raw(...args) { return store.read.apply(store, args); },
    observedStore: store,
    race(...args) {
      const deadline = performance.now() + 15;
      const read = store.read.apply(store, args);
      let timer;
      const timeout = new Promise(resolve => {
        const expire = () => {
          const remaining = deadline - performance.now();
          if (remaining > 0) {timer = setTimeout(expire, Math.ceil(remaining)); return;}
          resolve(null);
        };
        timer = setTimeout(expire, 15);
      });
      return Promise.race([read, timeout]).finally(() => clearTimeout(timer));
    },
    forward(callback, ms, ...args) {
      let handle;
      const result = new Promise(resolve => {handle = setTimeout(function (...values) {
        resolve(callback.apply(this, values));
      }, ms, ...args);});
      return {handle, result};
    }
  };
};
`);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

class ManualTimers {
  constructor() {this.next = 0; this.tasks = new Map(); this.cleared = []; this.thisValue = {timer: true};}
  setTimeout(callback, ms, ...args) {
    const handle = {id: ++this.next};
    this.tasks.set(handle, {callback, ms, args});
    return handle;
  }
  clearTimeout(handle) {
    this.cleared.push(handle);
    this.tasks.delete(handle);
  }
  fire(handle) {
    const task = this.tasks.get(handle);
    assert.ok(task, 'timer should still be armed');
    this.tasks.delete(handle);
    task.callback.apply(this.thisValue, task.args);
  }
  one() {
    assert.equal(this.tasks.size, 1);
    return [...this.tasks.keys()][0];
  }
}

function harness({read, emit = () => {}, context = () => ({item: 'A', generation: 1}), timers = new ManualTimers(), clock} = {}) {
  const calls = [], target = {createProxy(options) {calls.push(options); return null;}};
  // install compiles the verified source with the observer's timer wrappers.
  const observer = install({target, filename, source, expectedSha256: sha(source), emit, context,
    now: clock || (() => 0), timers});
  const proxy = target.createProxy({store: {read}});
  return {target, calls, observer, proxy, timers};
}

test('verified CJS source and exact 15 ms contract are checked before target mutation', () => {
  const original = () => 'original';
  const target = {createProxy: original};
  assert.throws(() => install({target, filename, source, expectedSha256: '0'.repeat(64)}), /read-observer-source-mismatch/);
  assert.strictEqual(target.createProxy, original);
  const altered = Buffer.from(source.toString().replace('Math.ceil(remaining)', 'Math.floor(remaining)'));
  assert.throws(() => install({target, filename, source: altered, expectedSha256: sha(altered)}), /read-observer-source-contract/);
  assert.strictEqual(target.createProxy, original);
});

test('read returns the exact underlying promise with receiver and arguments preserved; settle clears its timer', async () => {
  const timers = new ManualTimers(); let now = 10;
  const deferred = {}; deferred.promise = new Promise(resolve => {deferred.resolve = resolve;});
  const events = [], receiver = {marker: 1}; let seen;
  const store = {read(...args) {seen = {receiver: this, args}; return deferred.promise;}};
  const target = {createProxy() {return null;}};
  const observer = install({target, filename, source, expectedSha256: sha(source), timers, now: () => now,
    context: () => ({item: 'A', generation: 4}), emit: row => events.push(row)});
  const proxy = target.createProxy({store});
  const args = [receiver, 128, 512];
  const actual = proxy.observedStore.read(...args);
  assert.strictEqual(actual, deferred.promise);
  assert.strictEqual(seen.receiver, store);
  assert.deepEqual(seen.args, args);
  now = 13;
  deferred.resolve(Buffer.alloc(512));
  assert.equal(await actual.then(b => b.length), 512);
  await Promise.resolve();
  const racing = proxy.race(...args);
  const timer = timers.one();
  assert.equal(timers.tasks.get(timer).ms, 15);
  assert.equal((await racing).length, 512);
  assert.ok(timers.cleared.includes(timer));
  assert.deepEqual(events.map(row => row.operation), ['read-begin', 'read-settled', 'read-begin', 'timer-armed', 'read-settled', 'timer-cleared']);
  assert.equal(events[1].elapsedMs, 3);
  assert.equal(observer.snapshot().pendingTimers, 0);
  observer.restore();
});

test('15 ms timeout reports only timeout observation; late bytes settle without changing the proxy result', async () => {
  const timers = new ManualTimers(), events = []; let now = 0;
  let resolveRead;
  const promise = new Promise(resolve => {resolveRead = resolve;});
  const {proxy, observer} = harness({read: () => promise, timers, emit: row => events.push(row), clock: () => now});
  const pending = proxy.race('private-cache-key', 0, 64);
  const timer = timers.one();
  now = 15;
  timers.fire(timer);
  assert.equal(await pending, null);
  resolveRead(Buffer.from('private-buffer'));
  await Promise.resolve(); await Promise.resolve();
  const snapshot = observer.snapshot();
  assert.equal(snapshot.fired, 1);
  assert.equal(snapshot.valid, 1, 'late bytes are observed as a completed store read, not a proxy cache hit');
  assert.equal(snapshot.pendingTimers, 0);
  assert.ok(events.some(row => row.operation === 'timer-fired'));
  assert.ok(events.some(row => row.operation === 'read-settled' && row.outcome === 'bytes'));
  observer.restore();
});

test('an early absolute-deadline wake rearms under the same attempt; a valid read wins and clears the rearm', async () => {
  const timers = new ManualTimers(), events = []; let now = 0;
  let resolveRead;
  const read = new Promise(resolve => {resolveRead = resolve;});
  const {proxy, observer} = harness({read: () => read, timers, clock: () => now, emit: row => events.push(row)});
  const pending = proxy.race('opaque-key', 32, 64);
  const first = timers.one();
  assert.equal(timers.tasks.get(first).ms, 15);
  now = 4;
  timers.fire(first);
  assert.equal(observer.snapshot().fired, 0, 'an early wake is not a completed timeout');
  assert.equal(observer.snapshot().pendingTimers, 1, 'the expired handle is replaced by one rearm');
  const rearmed = timers.one();
  assert.notStrictEqual(rearmed, first);
  assert.equal(timers.tasks.get(rearmed).ms, 11);
  assert.ok(events.some(row => row.operation === 'timer-rearmed' && row.attempt === 1));
  now = 8;
  resolveRead(Buffer.from('warm-data'));
  assert.equal((await pending).toString(), 'warm-data');
  assert.equal(observer.snapshot().fired, 0);
  assert.equal(observer.snapshot().activeReads, 0);
  assert.equal(observer.snapshot().pendingTimers, 0);
  assert.ok(timers.cleared.includes(rearmed), 'settlement clears the currently armed rearm handle');
  observer.restore();
});

test('a rejected read after an early wake clears the rearmed timer and retires the observation', async () => {
  const timers = new ManualTimers(); let now = 0, rejectRead;
  const read = new Promise((_resolve, reject) => {rejectRead = reject;});
  const {proxy, observer} = harness({read: () => read, timers, clock: () => now});
  const pending = proxy.race('opaque-key', 0, 16);
  const first = timers.one(); now = 2; timers.fire(first);
  const rearmed = timers.one();
  rejectRead(Error('cancelled-read'));
  await assert.rejects(pending, /cancelled-read/);
  await Promise.resolve();
  assert.equal(observer.snapshot().activeReads, 0);
  assert.equal(observer.snapshot().pendingTimers, 0);
  assert.ok(timers.cleared.includes(rearmed));
  observer.restore();
});

test('empty reads, rejected promises, synchronous throws, and throwing emit preserve caller behavior', async () => {
  const privateError = Error('PRIVATE_ERROR_TEXT'), events = [];
  const timers = new ManualTimers();
  const first = harness({read: () => Promise.resolve(null), emit() {throw Error('observer');}, timers});
  assert.strictEqual(await first.proxy.raw('k', 0, 1), null);
  await Promise.resolve();
  assert.equal(first.observer.snapshot().empty, 1);

  const rejectedPromise = Promise.reject(privateError);
  const second = harness({read() {return rejectedPromise;}, emit: row => events.push(row), timers: new ManualTimers()});
  const returned = second.proxy.raw('k', 0, 2);
  assert.strictEqual(returned, rejectedPromise);
  await assert.rejects(returned, error => error === privateError);
  await Promise.resolve();
  assert.equal(second.observer.snapshot().rejected, 1);
  assert.doesNotMatch(JSON.stringify(events), /PRIVATE_ERROR_TEXT|private-cache-key|PRIVATE/);

  const throwing = harness({read() {throw privateError;}, timers: new ManualTimers()});
  assert.throws(() => throwing.proxy.raw('k', 0, 3), error => error === privateError);
  assert.equal(throwing.observer.snapshot().threw, 1);
  const asyncReporter = harness({read: () => Promise.resolve(Buffer.alloc(1)), async emit() {throw privateError;}});
  assert.equal((await asyncReporter.proxy.raw('k', 0, 1)).length, 1);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(asyncReporter.observer.snapshot().observerErrors, 2);
  for (const item of [first, second, throwing, asyncReporter]) item.observer.restore();
});

test('diagnostics redact keys, buffers, errors, and unknown context; restore refuses a replaced owner', async () => {
  const events = [], timers = new ManualTimers(); let bytesResolve;
  const pending = new Promise(resolve => {bytesResolve = resolve;});
  const fixture = harness({read: () => pending, timers, context: () => ({item: 'PRIVATE_UNKNOWN_ITEM', generation: 2}),
    emit: row => events.push(row)});
  const actual = fixture.proxy.observedStore.read('private-key', 0, 4);
  bytesResolve(Buffer.from('private-buffer-content'));
  await actual;
  await Promise.resolve();
  const serialized = JSON.stringify({events, snapshot: fixture.observer.snapshot()});
  assert.doesNotMatch(serialized, /private-key|private-buffer-content|PRIVATE_UNKNOWN_ITEM/);
  assert.ok(events.every(row => row.item === null));
  fixture.target.createProxy = () => {};
  assert.throws(() => fixture.observer.restore(), /read-observer-owner-changed/);
  assert.equal(fixture.observer.snapshot().restored, false);

  const thrownContext = harness({read: () => Promise.resolve(Buffer.alloc(1)), context() {throw Error('PRIVATE_CONTEXT_ERROR');}, emit: row => events.push(row)});
  await thrownContext.proxy.observedStore.read('private-key', 0, 1);
  await Promise.resolve();
  assert.equal(events.at(-1).item, null);
  assert.doesNotMatch(JSON.stringify(events), /PRIVATE_CONTEXT_ERROR/);
  thrownContext.observer.restore();
});

test('non-15 ms timers preserve returned handle, callback receiver, and arguments', async () => {
  const calls = [], timers = {setTimeout(callback, ms, ...args) {
    const handle = {id: ms}; calls.push({handle, callback, ms, args}); return handle;
  }, clearTimeout(handle) {calls.push({cleared: handle});}};
  const fixture = harness({read: () => Promise.resolve(null), timers});
  const receiver = {token: 1}; let seen;
  const call = fixture.proxy.forward(function (value, extra) {seen = {receiver: this, value, extra}; return 'done';}, 37, 'arg-a', 42);
  assert.strictEqual(call.handle, calls[0].handle);
  assert.equal(calls[0].ms, 37);
  assert.deepEqual(calls[0].args, ['arg-a', 42]);
  calls[0].callback.apply(receiver, calls[0].args);
  assert.equal(await call.result, 'done');
  assert.deepEqual(seen, {receiver, value: 'arg-a', extra: 42});
  fixture.observer.restore();
});

test('read-observer root selects its real guard identity before any bind, including Windows exclusions',()=>{
  const {guardPort,selectRoot}=require('./helpers/range-fixture-root.cjs');
  const base=path.join(path.parse(process.cwd()).root,'owned','read-observer-fixture'),initial=guardPort(base,'win32');
  const excluded=[{start:initial,end:initial}],calls=[];
  const selected=observedFixtureRoot('owned-prefix',(prefix,relatives)=>{
    calls.push({prefix,relatives});return selectRoot(base,relatives,excluded,new Set(),'win32');
  });
  assert.deepEqual(calls,[{prefix:'owned-prefix',relatives:['']}]);
  assert.notEqual(selected,base);assert.notEqual(guardPort(selected,'win32'),initial);
  assert.equal(selectRoot(base,[],excluded,new Set(),'win32'),base,'old omitted guard roots reproduce the unsafe selection without binding a denied port');
});

test('each setup listener failure preserves EACCES with one attempt and safe stage evidence',async()=>{
  for(const label of ['store-guard','origin-listener','proxy-listener']){
    const rows=[],denied=Object.assign(Error('private-source-path'),{code:'EACCES',port:49839});let attempts=0;
    await assert.rejects(setupStage(label,async()=>{attempts++;throw denied;},row=>rows.push(JSON.parse(row))),error=>error===denied);
    assert.equal(attempts,1);assert.deepEqual(rows.map(row=>row.state),['begin','failed']);
    assert.deepEqual(rows[1],{type:'read-observer-setup',stage:label,state:'failed',code:'EACCES',port:49839});
    assert.equal(JSON.stringify(rows).includes('private'),false);
  }
});

test('partial read-observer setup closes its store even when proxy or observer cleanup fails',async()=>{
  const closed=[];
  await assert.rejects(cleanupReadFixture({proxy:{close(){closed.push('proxy');throw Error('owned-close-failed');}},
    origin:{close(){closed.push('origin');}},store:{close(){closed.push('store');}},observer:{restore(){closed.push('observer');throw Error('owned-restore-failed');}}},
    ()=>closed.push('remove')),error=>error instanceof AggregateError&&error.errors.length===2);
  assert.deepEqual(closed,['proxy','origin','store','observer','remove']);
  const storeOnly=[];await cleanupReadFixture({store:{close(){storeOnly.push('store');}}},()=>storeOnly.push('remove'));
  assert.deepEqual(storeOnly,['store','remove']);
});

test('source fixture returns a single real listen error instead of leaving its Promise pending',async()=>{
  const {EventEmitter}=require('node:events'),server=new EventEmitter(),denied=Object.assign(Error('private-source-path'),{code:'EACCES',port:49839});let calls=0;
  server.listen=(port,host)=>{
    calls++;assert.equal(port,0);assert.equal(host,'127.0.0.1');
    assert.equal(server.listenerCount('error'),1,'the original missing error handler fails this negative control');
    queueMicrotask(()=>server.emit('error',denied));return server;
  };
  const file=require.resolve('../tools/shared-playback-cache/fixture.cjs'),source=await fs.readFile(file,'utf8'),module={exports:{}};
  new Function('require','module','exports',source)(id=>id==='node:http'?{createServer:()=>server}:require(id),module,module.exports);
  await assert.rejects(module.exports.source({bytes:4096}),error=>error===denied);
  assert.equal(calls,1);assert.equal(server.listenerCount('error'),0);assert.equal(server.listenerCount('listening'),0);
});

test('maintained proxy source observes a real loopback warm read with controlled bounded response timer', async t => {
  const file = require.resolve('../src/electronapp/enhanced/shared-playback-cache/proxy');
  const exactSource = await fs.readFile(file), root = observedFixtureRoot('ete-read-observer-real-');
  const original = proxyModule.createProxy, events = [], pendingTimers = new Map();
  const realSetTimeout = global.setTimeout, realClearTimeout = global.clearTimeout;
  let proxy, origin, store, observer, timerId = 0, armed = 0, cleared = 0, forwarded = 0;
  const timers = {
    setTimeout(callback, ms, ...args) {
      if (ms === 15 || ms === 25 || ms === 30) {const handle = {id: ++timerId}; pendingTimers.set(handle, {callback, args}); armed++; return handle;}
      forwarded++; return realSetTimeout(callback, ms, ...args);
    },
    clearTimeout(handle) {
      if (pendingTimers.delete(handle)) {cleared++; return;}
      return realClearTimeout(handle);
    }
  };
  t.after(()=>cleanupReadFixture({proxy,origin,store,observer},()=>fs.rm(root,{recursive:true,force:true})));
  // Acquire the real deterministic guard first. A system-selected HTTP port
  // must not occupy the cache's future guard while setup is still pending.
  store = await setupStage('store-guard',()=>createStore({root, currentBytes: 2 * 1024 * 1024, nextBytes: 1024 * 1024}),row=>t.diagnostic(row));
  origin = await setupStage('origin-listener',()=>fixture.source({bytes: 64 * 1024, firstDelay: 0, tailDelay: 0}),row=>t.diagnostic(row));
  observer = install({target: proxyModule, filename: file, source: exactSource,
    expectedSha256: sha(exactSource), timers, now: () => 0, context: () => ({item: 'B', generation: 9}),
    emit: row => events.push(row)});
  proxy = await setupStage('proxy-listener',()=>proxyModule.createProxy({store, authorize: async () => origin.grant(), requestPolicy: 'coherent'}),row=>t.diagnostic(row));
  const opened = await proxy.open(fixture.identity('B'));
  await opened.ready();
  const boundedGet = async signal => {
    const requestController = signal ? null : new AbortController();
    const requestSignal = signal || requestController.signal;
    let timeout;
    try {
      return await Promise.race([fixture.get(opened.url, 0, origin.data.length, {signal: requestSignal}),
        new Promise((_, reject) => {timeout = realSetTimeout(() => {
          if (requestController) requestController.abort();
          reject(Error('observer-loopback-deadline'));
        }, 2500);})]);
    } finally {if (timeout) realClearTimeout(timeout);}
  };
  const first = await boundedGet();
  assert.equal(first.status, 206);
  assert.deepEqual(first.body, origin.data);
  await proxy.drain();
  await opened.actual();
  const controller = new AbortController();
  const warm = await boundedGet(controller.signal);
  assert.equal(warm.status, 206);
  assert.deepEqual(warm.body, origin.data);
  assert.equal(origin.requests.length, 1, 'warm bytes came from the maintained store, without a second source request');
  await proxy.drain();
  assert.ok(armed > 0, 'warm store read armed the observed source bounded read timer');
  assert.equal(cleared, armed, 'read settlement cleared each pending timer');
  assert.equal(pendingTimers.size, 0);
  assert.ok(forwarded > 0, 'other proxy timers still use real Node timers');
  const evidence = observer.snapshot();
  assert.equal(evidence.sourceSha256, sha(exactSource));
  assert.equal(evidence.unknownTimers, 0);
  assert.ok(events.some(row => row.operation === 'timer-armed' && row.deadlineMs === 30));
  assert.equal(evidence.activeReads, 0);
  assert.equal(evidence.pendingTimers, 0);
  assert.ok(events.some(row => row.operation === 'read-settled' && row.outcome === 'bytes'));
  await proxy.close(); proxy = null;
  observer.restore();
  assert.equal(observer.snapshot().restored, true);
  assert.strictEqual(proxyModule.createProxy, original);
});

test('readEvidence selects matching B body attempts and projects only safe source-stream fields', () => {
  const trace = [
    {type: 'load', item: 'B', wallClockMs: 10, source: 'PRIVATE_URL'},
    {type: 'cache-read', operation: 'read-begin', attempt: 1, item: 'A', generation: 2, offset: 0, length: 8, secret: 'PRIVATE_KEY'},
    {type: 'cache-read', operation: 'read-begin', attempt: 2, item: 'B', generation: 9, offset: 16, length: 32, body: 'PRIVATE_BUFFER'},
    {type: 'cache-read', operation: 'read-settled', attempt: 2, item: 'B', generation: 9, offset: 16, length: 32, elapsedMs: 1, outcome: 'bytes', resultBytes: 32, error: 'PRIVATE_ERROR'},
    {type: 'cache-read', operation: 'timer-fired', attempt: 3, item: 'B', generation: 9, offset: 64, length: 16, deadlineMs: 15},
    {type: 'cache-read', operation: 'read-settled', attempt: 4, item: 'B', generation: 9, offset: 128, length: 16, outcome: 'empty', resultBytes: 0}
  ];
  const events = [
    {phase: 'natural', type: 'media-open', item: 'B', requestId: 7, start: 0, end: 63, wallClockMs: 11, source: 'PRIVATE_URL'},
    {phase: 'natural', type: 'media-close', item: 'B', requestId: 7, streamReadBytes: 64, complete: true, body: 'PRIVATE_BODY'},
    {phase: 'natural', type: 'media-open', item: 'B', requestId: 8, start: 100, end: 140, wallClockMs: 12},
    {phase: 'natural', type: 'media-close', item: 'B', requestId: 8, streamReadBytes: 20, complete: false}
  ];
  const evidence = smoke.readEvidence(trace, events, 'natural');
  assert.deepEqual(evidence.sourceRanges.map(row => row.requestId), [7, 8]);
  assert.deepEqual(evidence.sourceRanges.map(row => row.sourceStreamReadBytes), [64, 20]);
  assert.equal(evidence.sourceRanges[0].sourceComplete, true);
  assert.equal(evidence.sourceRanges[1].sourceComplete, false);
  assert.ok(evidence.reads.some(row => row.attempt === 2));
  assert.ok(evidence.reads.some(row => row.attempt === 3 && row.operation === 'timer-fired'));
  assert.ok(evidence.reads.some(row => row.attempt === 4 && row.outcome === 'empty'));
  assert.deepEqual(evidence.sourceRanges[0].candidateAttempts, [2]);
  assert.equal(Object.hasOwn(evidence.sourceRanges[0], 'clientRXBytes'), false);
  assert.doesNotMatch(JSON.stringify(evidence), /PRIVATE_URL|PRIVATE_KEY|PRIVATE_BUFFER|PRIVATE_ERROR|PRIVATE_BODY|clientRXBytes/);
  const many = Array.from({length: 100}, (_, index) => ({type: 'cache-read', operation: 'timer-fired', attempt: index + 10, item: 'B'}));
  const truncated = smoke.readEvidence(many, [], 'natural');
  assert.equal(truncated.truncated, true);
  assert.equal(truncated.reads.length, 96);
});
