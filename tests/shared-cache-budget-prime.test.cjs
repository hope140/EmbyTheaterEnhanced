'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const {createBudgetReader} = require('../src/electronapp/native-helper/shared-cache-budget');
const {createSession} = require('../src/electronapp/enhanced/playback-range-session');
const deferred = () => {let resolve, reject; const promise = new Promise((a, b) => {resolve = a; reject = b;}); return {promise, resolve, reject};};
function fixture() {
  const queue = [], helper = {currentGenerationId: 1, getProperty(name, timeout) {
    const pending = deferred(); queue.push({name, timeout, ...pending}); return pending.promise;
  }};
  let active = helper;
  const reader = createBudgetReader((owned, generation) => owned === active && owned.currentGenerationId === generation && !owned.exited && !owned.transportTerminated);
  return {queue, helper, reader, replace() {active = {};}};
}
test('batch-tail actual read is shared by selection without another IPC request', async () => {
  const f = fixture(), primed = f.reader.read(f.helper, 1);
  assert.equal(f.reader.read(f.helper, 1), primed);
  assert.deepEqual(f.queue.map(row => [row.name, row.timeout]), [['demuxer-max-bytes', 50]]);
  f.queue[0].resolve(3072 * 1024 * 1024);
  const lease = await primed;
  assert.equal(lease.bytes, 3072 * 1024 * 1024); assert.equal(lease.isCurrent(), true);
  assert.equal(await f.reader.read(f.helper, 1), lease);
});
for (const change of ['write', 'stop', 'generation', 'helper', 'transport']) test('late actual read is rejected after ' + change, async () => {
  const f = fixture(), pending = f.reader.read(f.helper, 1);
  if (change === 'write') f.reader.beforeWrite();
  if (change === 'stop') f.reader.retire();
  if (change === 'generation') f.helper.currentGenerationId++;
  if (change === 'helper') f.replace();
  if (change === 'transport') f.helper.transportTerminated = true;
  f.queue[0].resolve(314572800);
  await assert.rejects(pending, /budget-unavailable/);
});
test('failed priming is handled immediately and not retried within its revision', async () => {
  const f = fixture(), pending = f.reader.read(f.helper, 1);
  f.queue[0].reject(Error('owned-native-error'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.reader.read(f.helper, 1), pending); assert.equal(f.queue.length, 1);
  await assert.rejects(pending, /owned-native-error/);
  f.reader.beforeWrite(); f.reader.read(f.helper, 1); assert.equal(f.queue.length, 2);
  f.queue[1].resolve(314572800);
});
test('a reused helper cannot share actual budget across generations or revisions', async () => {
  const f = fixture(), old = f.reader.read(f.helper, 1);
  f.helper.currentGenerationId = 2;
  const fresh = f.reader.read(f.helper, 2); assert.notEqual(fresh, old);
  f.queue[1].resolve(629145600); const lease = await fresh;
  await assert.rejects(f.reader.read(f.helper, 1), /generation-retired/);
  assert.equal(lease.isCurrent(), true); assert.equal(f.queue.length, 2, 'stale caller may not evict the new read');
  f.queue[0].resolve(314572800); await assert.rejects(old, /budget-unavailable/);
  assert.equal(lease.bytes, 629145600); assert.equal(lease.isCurrent(), true);
  f.reader.beforeWrite(); assert.equal(lease.isCurrent(), false);
  const revised = f.reader.read(f.helper, 2); assert.notEqual(revised, fresh);
  f.queue[2].resolve(943718400); assert.equal((await revised).bytes, 943718400);
});
test('dispatched budget is immutable until retirement, not a silently stale route', async () => {
  const f = fixture(), pending = f.reader.read(f.helper, 1);
  f.queue[0].resolve(314572800); const lease = await pending;
  lease.commit(); assert.throws(() => f.reader.beforeWrite(), /budget-in-use/);
  assert.equal(lease.isCurrent(), true);
  f.reader.retire(); assert.equal(lease.isCurrent(), false);
  assert.doesNotThrow(() => f.reader.beforeWrite());
});

function batchCall(f) {
  const source = fs.readFileSync(require.resolve('../src/electronapp/native-helper/service'), 'utf8');
  const begin = source.indexOf("    if (operation === 'set-properties') {");
  const end = source.indexOf("    if (operation === 'get-property') {", begin);
  const sandbox = {SET_PROPERTIES: new Set(), payload: {}, operation: 'set-properties', active: f.helper, sharedBudget: f.reader,
    requireGeneration() {}, validatePropertyName(name) {if (!['profile', 'pause', 'demuxer-max-bytes'].includes(name)) throw Error('property-not-allowed'); return name;},
    validateScalar(value) {if (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'boolean') throw Error('property-value-invalid'); return value;},
    changesSharedBudget: name => name === 'profile' || name === 'demuxer-max-bytes',
    primeSharedBudget: helper => f.reader.read(helper, helper.currentGenerationId), fixedSettingLogged: new Set(), log() {}};
  vm.runInNewContext('call = function (entries) {payload = {entries};' + source.slice(begin, end) + '}', sandbox);
  return entries => sandbox.call(entries);
}
test('actual service batch queues read after all writes and ACK does not await the native read', async () => {
  const f = fixture(), order = [];
  f.helper.setProperty = (name, value) => order.push(['set', name, value]);
  const get = f.helper.getProperty; f.helper.getProperty = (...args) => {order.push(['get', ...args]); return get(...args);};
  const call = batchCall(f);
  assert.equal(call([{name: 'demuxer-max-bytes', value: 314572800}, {name: 'profile', value: 'owned'}, {name: 'pause', value: true}]).status, 'accepted');
  assert.deepEqual(order, [['set', 'demuxer-max-bytes', 314572800], ['set', 'profile', 'owned'], ['set', 'pause', true], ['get', 'demuxer-max-bytes', 50]]);
  f.queue[0].resolve(629145600);
  assert.equal((await f.reader.read(f.helper, 1)).bytes, 629145600, 'actual value can differ from submitted setting');
});
test('batch preflight prevents partial writes when a dispatched budget is locked or a later entry is invalid', async () => {
  const f = fixture(), writes = []; f.helper.setProperty = (...args) => writes.push(args);
  const call = batchCall(f), pending = f.reader.read(f.helper, 1); f.queue[0].resolve(314572800); (await pending).commit();
  assert.throws(() => call([{name: 'pause', value: true}, {name: 'profile', value: 'owned'}]), /budget-in-use/);
  assert.throws(() => call([{name: 'pause', value: true}, {name: 'private', value: 'owned'}]), /property-not-allowed/);
  assert.deepEqual(writes, []);
  assert.equal(call([{name: 'pause', value: true}]).status, 'accepted'); assert.equal(writes.length, 1);
});

async function sessionFixture(t, open) {
  const f = fixture(), pending = f.reader.read(f.helper, 1); f.queue[0].resolve(314572800); await pending;
  const handles = []; let opens = 0;
  const session = createSession({config: {kind: 'shared-byte-trial', root: '/owned', progressPercent: 70, preloadMB: 300},
    readCurrentBytes: (helper, generation) => f.reader.read(helper, generation),
    async create() {return {async open(options) {
      ++opens; if (open) await open(options, f);
      const handle = {source: 'http://127.0.0.1/authorized-local', stopped: false, async stop() {this.stopped = true;}}; handles.push(handle); return handle;
    }, status() {return {bytes: 0};}, async close() {}, async discardNext() {}};}});
  t.after(() => session.close());
  const context = {source: 'http://127.0.0.1/source.mkv', serverOrigin: 'http://127.0.0.1', serverId: 'owned', accountId: 'owned', itemId: 'A', mediaSourceId: 'A', playSessionId: 'owned', mode: 'DirectPlay', mediaType: 'Video', container: 'mkv'};
  await session.setContext(context, f.helper, 1);
  return {...f, session, handles, get opens() {return opens;}, select: () => session.select(context.source, f.helper, 1, ['loadfile', context.source])};
}
test('selection consumes completed actual budget without another read and rechecks immediately before dispatch', async t => {
  const f = await sessionFixture(t), selected = await f.select(); assert.ok(selected); assert.equal(f.queue.length, 1);
  f.reader.beforeWrite(); assert.equal(selected.canDispatch(), false); assert.throws(() => selected.commit(), /retired/);
});
test('profile/budget mutation during fresh probe cannot publish an obsolete route', async t => {
  const states = [];
  const f = await sessionFixture(t, async (options, owned) => {states.push(options.isCurrent()); owned.reader.beforeWrite(); states.push(options.isCurrent());});
  assert.equal(await f.select(), null); assert.equal(f.handles.length, 1); assert.equal(f.handles[0].stopped, true);
  assert.deepEqual(states, [true, false]);
});
test('cancelled selection immediately clears the undispatched handle before original-source start', async t => {
  const f = await sessionFixture(t), selected = await f.select(); assert.ok(selected);
  f.reader.beforeWrite(); assert.equal(selected.canDispatch(), false);
  const stopping = selected.cancel(); assert.equal(f.session.status().current.state, 'original');
  assert.equal(selected.cancel(), stopping);
  await f.session.started(f.helper, 1); await stopping;
  assert.equal(f.handles[0].stopped, true);
  assert.equal((await f.session.preload({}, f.helper, 1)).state, 'unavailable');
});
test('actual load dispatch cancels a selected route that lost its lease before synchronous original fallback', async () => {
  const source = fs.readFileSync(require.resolve('../src/electronapp/native-helper/service'), 'utf8');
  const start = source.indexOf("      if (args[0] === 'loadfile') {"), end = source.indexOf("      if (args[0] === 'stop') {", start);
  let cancelled = false, loaded = false;
  const args = ['loadfile', 'http://127.0.0.1/original'];
  const active = {currentGenerationId: 1, load(value) {assert.equal(cancelled, true); assert.equal(value, args); loaded = true; return {promise: Promise.resolve(), generationId: 1};}};
  const sandbox = {args, active, client: active, destroyed: false, generationEpoch: 1, endpointId: 'owned', activeEndpointId: 'owned', payload: {generationId: 1},
    rangeSession: {async select() {return {canDispatch: () => false, commit() {assert.fail('invalid lease committed');}, cancel() {cancelled = true; return Promise.resolve();}};}}, log() {}};
  vm.runInNewContext('call = async function () {' + source.slice(start, end) + '}', sandbox);
  assert.equal((await sandbox.call()).status, 'accepted'); assert.equal(loaded, true);
});

function virtualSelection(f, {historicalBudget, openWait} = {}) {
  let now = 0, created = 0, opened = 0;
  const deadlines = [], timers = new Set(), sandbox = {module: {exports: {}}, require: name => require(require.resolve(name, {paths: [require('node:path').dirname(require.resolve('../src/electronapp/enhanced/playback-range-session'))]})),
    URL, AbortController, AbortSignal,
    setTimeout(fn, ms) {deadlines.push(ms); const timer = {fn, at: now + (historicalBudget ?? ms)}; timers.add(timer); return timer;}, clearTimeout(timer) {timers.delete(timer);}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/electronapp/enhanced/playback-range-session'), 'utf8'), sandbox);
  const session = sandbox.module.exports.createSession({config: {kind: 'shared-byte-trial'},
    readCurrentBytes: (...args) => f.reader.read(...args), async create() {++created; return {async close() {}, async discardNext() {}, async open() {++opened; if (openWait) await openWait; return {source: 'http://127.0.0.1/local', async stop() {}};}};}});
  const context = {source: 'http://127.0.0.1/source.mkv', serverOrigin: 'http://127.0.0.1', serverId: 'owned', accountId: 'owned', itemId: 'A', mediaSourceId: 'A', playSessionId: 'owned', mode: 'DirectPlay', mediaType: 'Video', container: 'mkv'};
  return {session, context, deadlines, counts: () => ({created, opened}), advance(value) {now = value; for (const timer of timers) if (timer.at <= now) {timers.delete(timer); timer.fn();}}};
}
test('historical 25ms policy fits a 27ms read only with enough priming lead', async t => {
  const f = fixture(), v = virtualSelection(f, {historicalBudget: 25}); t.after(() => v.session.close());
  const primed = f.reader.read(f.helper, 1);
  v.advance(5); assert.equal((await v.session.setContext(v.context, f.helper, 1)).state, 'ready');
  const selecting = v.session.select(v.context.source, f.helper, 1, ['loadfile', v.context.source]);
  v.advance(27); f.queue[0].resolve(314572800); await primed;
  assert.ok(await selecting); assert.equal(f.queue.length, 1); assert.deepEqual(v.counts(), {created: 1, opened: 1});
});
test('historical 25ms selection rejects a late batch-tail read without creating a route', async t => {
  const f = fixture(), v = virtualSelection(f, {historicalBudget: 25}); t.after(() => v.session.close());
  const primed = f.reader.read(f.helper, 1);
  v.advance(5); assert.equal((await v.session.setContext(v.context, f.helper, 1)).state, 'ready');
  const selecting = v.session.select(v.context.source, f.helper, 1, ['loadfile', v.context.source]);
  v.advance(30); assert.equal(await selecting, null);
  v.advance(31); f.queue[0].resolve(314572800); await primed;
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(v.counts(), {created: 0, opened: 0}); assert.equal(f.queue.length, 1);
});
test('historical 25ms policy fails a valid 31ms read with only 1ms head start', async t => {
  const f = fixture(), v = virtualSelection(f, {historicalBudget: 25}); t.after(() => v.session.close());
  const primed = f.reader.read(f.helper, 1);
  v.advance(1); assert.equal((await v.session.setContext(v.context, f.helper, 1)).state, 'ready');
  const selecting = v.session.select(v.context.source, f.helper, 1, ['loadfile', v.context.source]);
  v.advance(26); assert.equal(await selecting, null);
  v.advance(31); f.queue[0].resolve(314572800); await primed;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.queue.length, 1, 'no settings invalidation or duplicate read is needed to reproduce the timeout');
  assert.deepEqual(v.counts(), {created: 0, opened: 0});
});
test('measured-shape native read plus required preparation fits 50ms, while the same work misses historical 25ms', async t => {
  for (const limit of [25, 50]) {
    const f = fixture(), prepared = deferred(), v = virtualSelection(f, {historicalBudget: limit, openWait: prepared.promise});
    let selecting;
    const primed = f.reader.read(f.helper, 1);
    t.after(async () => {prepared.resolve(); f.queue[0].resolve(314572800); v.advance(100); await Promise.allSettled([primed, selecting]); await v.session.close();});
    v.advance(0.8453); await v.session.setContext(v.context, f.helper, 1);
    selecting = v.session.select(v.context.source, f.helper, 1, ['loadfile', v.context.source]);
    assert.deepEqual(v.deadlines, [50], 'source must use bounded 50ms, not just the comparison clock');
    v.advance(18.7332); f.queue[0].resolve(314572800); await primed;
    await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(v.counts(), {created: 1, opened: 1});
    v.advance(26.7582);
    if (limit === 25) assert.equal(await selecting, null);
    prepared.resolve(); assert.equal(!!(await selecting), limit === 50);
    assert.equal(f.queue.length, 1);
  }
});
test('actual 50ms selection still expires and cannot publish work after its own deadline', async t => {
  const f = fixture(), v = virtualSelection(f); let selecting;
  const primed = f.reader.read(f.helper, 1);
  t.after(async () => {f.queue[0].resolve(314572800); v.advance(100); await Promise.allSettled([primed, selecting]); await v.session.close();});
  await v.session.setContext(v.context, f.helper, 1);
  selecting = v.session.select(v.context.source, f.helper, 1, ['loadfile', v.context.source]);
  assert.deepEqual(v.deadlines, [50]);
  v.advance(50); assert.equal(await selecting, null);
  v.advance(51); f.queue[0].resolve(314572800); await primed;
  await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(v.counts(), {created: 0, opened: 0});
});
test('ordinary seek commands do not enter the optional source-selection budget', async () => {
  const source = fs.readFileSync(require.resolve('../src/electronapp/native-helper/service'), 'utf8');
  const start = source.indexOf("    if (operation === 'command') {"), end = source.indexOf("    if (operation === 'set-visible') {", start);
  assert.ok(start > 0 && end > start);
  const calls = [], sandbox = {operation: 'command', payload: {data: ['seek', '10', 'absolute']},
    validateCommand: value => value, requireGeneration() {}, active: {submitCommand: data => calls.push(data)},
    rangeSession: {select() {assert.fail('seek must not reselect source');}}};
  vm.runInNewContext('call = async function () {' + source.slice(start, end) + '}', sandbox);
  assert.equal((await sandbox.call()).status, 'accepted'); assert.equal(calls[0], sandbox.payload.data);
});
