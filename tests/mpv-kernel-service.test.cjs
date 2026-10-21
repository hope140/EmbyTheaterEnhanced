'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const {EventEmitter} = require('node:events');
const {createService} = require('../src/electronapp/native-helper/service');

const ROOT = path.resolve('ete-runtime-fixture');
const BASELINE = path.join(ROOT, 'electronapp', 'libmpv', 'x64', 'mpv-1.dll');
const CANDIDATE_ID = 'a'.repeat(64);
const CANDIDATE_PATH = path.join(path.resolve('ete-profile-fixture'), 'mpv-kernels', 'objects', CANDIDATE_ID, 'mpv-1.dll');
const CAPABILITIES = ['private-inherited-pipe', 'native-child-hwnd', 'gpu-next', 'd3d11', 'generation-attribution'];

class FakeWindow extends EventEmitter {
  constructor() {
    super();
    this.destroyed = false;
    this.visible = false;
    this.bounds = {x: 0, y: 0, width: 800, height: 450};
  }
  getBounds() { return {...this.bounds}; }
  setBounds(value) { this.bounds = {...value}; }
  getNativeWindowHandle() { return Buffer.from([1, 0, 0, 0]); }
  isDestroyed() { return this.destroyed; }
  isVisible() { return this.visible; }
  isMinimized() { return false; }
  setMenu() {}
  loadURL() { return Promise.resolve(); }
  showInactive() { this.visible = true; }
  hide() { this.visible = false; }
  destroy() { this.destroyed = true; this.emit('closed'); }
}

function makeFixture(plan) {
  const events = [];
  const clients = [];
  const activationResults = [];
  const service = createService({
    mode: 'native-helper',
    electron: {BrowserWindow: FakeWindow},
    fs: {existsSync: () => true},
    getMainWindow: () => new FakeWindow(),
    getWebContents: () => null,
    runtimeRoot: ROOT,
    startupKernelSelection: plan.selection,
    kernelStore: {
      verifyCandidateForStartup: async (id, version) => {
        events.push('verify:' + id);
        if (plan.verifyFailure) throw Object.assign(new Error('synthetic integrity mismatch'), {code: 'candidate-integrity-failed'});
        return {candidateId: id, version};
      },
      recordActivationResult: async (...args) => { activationResults.push(args); }
    },
    NativeHelperClient: class {
      constructor(options) {
        this.options = options;
        this.transportTerminated = false;
        this.exited = false;
        this.currentGenerationId = null;
        clients.push(this);
      }
      async start() {
        const index = clients.length - 1;
        const behavior = plan.starts[index] || {ok: true};
        events.push('start:' + (this.options.libmpvPath === CANDIDATE_PATH ? 'candidate' : 'baseline'));
        if (behavior.deferStart) await new Promise(resolve => { this.releaseStart = resolve; });
        if (!behavior.ok) throw Object.assign(new Error(behavior.message || 'synthetic failure'), {code: behavior.code || 'synthetic-start-failed'});
        this.handshake = {
          protocolVersion: 1,
          helperVersion: '1.0.0',
          libmpvVersion: this.options.expectedLibmpvVersion,
          mpvClientApiVersion: 131077,
          surfaceAttached: true,
          capabilities: CAPABILITIES,
          queueLimits: {maxPendingFrames: 32, maxPendingBytes: 1024 * 1024}
        };
      }
      async kill() {
        events.push('kill:' + (this.options.libmpvPath === CANDIDATE_PATH ? 'candidate' : 'baseline'));
        if (plan.unconfirmedExit && this.options.libmpvPath === CANDIDATE_PATH) return null;
        this.exited = true;
        this.transportTerminated = true;
        return {code: 1};
      }
      beginGeneration(label) { this.currentGenerationId = 1; return 1; }
      allocateGenerationId() { return 1; }
      retireGeneration() { this.currentGenerationId = null; }
      request() { return Promise.resolve({attached: true, width: 800, height: 450}); }
      command() {}
      setProperty() {}
      async destroy() { await this.kill(); }
      crash() {
        this.exited = true;
        this.transportTerminated = true;
        this.options.onTerminal({name: 'process-exit-terminal'});
      }
    }
  });
  return {service, clients, events, activationResults};
}

function candidateSelection() {
  return {kind: 'candidate', candidateId: CANDIDATE_ID, libmpvPath: CANDIDATE_PATH,
    expectedLibmpvVersion: 'mpv v0.42.0-candidate'};
}

test('candidate prewarm and renderer create share one startup promise and use the frozen candidate', async t => {
  const f = makeFixture({selection: candidateSelection(), starts: [{ok: true}]});
  t.after(() => f.service.destroy());
  const prewarm = f.service.prewarm();
  const create = f.service.call('create', {});
  const [warm, created] = await Promise.all([prewarm, create]);
  assert.equal(warm.status, 'ready');
  assert.equal(created.status, 'ok');
  assert.equal(f.clients.length, 1);
  assert.equal(f.events[0], 'verify:' + CANDIDATE_ID);
  assert.equal(f.clients[0].options.libmpvPath, CANDIDATE_PATH);
  assert.equal(f.clients[0].options.expectedLibmpvVersion, 'mpv v0.42.0-candidate');
  assert.deepEqual(f.activationResults, [[CANDIDATE_ID, 'candidate-ready', 'candidate-ready']]);
  assert.equal(f.service.status().kernel.activationState, 'candidate-active');
  assert.equal(f.service.status().libmpvImageSha256, null);
});

test('candidate startup failure waits for exact child exit then falls back once to fixed baseline', async t => {
  const f = makeFixture({selection: candidateSelection(), starts: [
    {ok: false, code: 'unexpected-libmpv-version'}, {ok: true}
  ]});
  t.after(() => f.service.destroy());
  const warm = await f.service.prewarm();
  assert.equal(warm.status, 'ready');
  assert.deepEqual(f.events.slice(0, 4), ['verify:' + CANDIDATE_ID, 'start:candidate', 'kill:candidate', 'start:baseline']);
  assert.equal(f.clients.length, 2);
  assert.equal(f.clients[1].options.libmpvPath, BASELINE);
  assert.equal(f.clients[1].options.expectedLibmpvVersion, 'mpv v0.41.0-920-gdd5d17d32');
  assert.deepEqual(f.activationResults[0], [CANDIDATE_ID, 'candidate-fallback', 'candidate-handshake-failed']);
  assert.equal(f.service.status().kernel.activationState, 'candidate-fallback-baseline-active');
  assert.equal(f.service.status().kernel.activeCandidateId, null);
});

test('unconfirmed candidate exit blocks fallback, and baseline failure blocks retries', async t => {
  const blocked = makeFixture({selection: candidateSelection(), starts: [{ok: false}], unconfirmedExit: true});
  t.after(() => blocked.service.destroy());
  assert.equal((await blocked.service.prewarm()).status, 'failed');
  assert.equal(blocked.clients.length, 1);
  assert.equal(blocked.service.status().kernel.activationState, 'candidate-exit-unconfirmed');
  await assert.rejects(blocked.service.call('create', {}), /native-helper-startup-failed/);
  assert.equal(blocked.clients.length, 1);

  const baseFailed = makeFixture({selection: candidateSelection(), starts: [{ok: false}, {ok: false}]});
  t.after(() => baseFailed.service.destroy());
  assert.equal((await baseFailed.service.prewarm()).status, 'failed');
  assert.equal(baseFailed.clients.length, 2);
  assert.equal(baseFailed.service.status().kernel.activationState, 'baseline-start-failed');
  await assert.rejects(baseFailed.service.call('create', {}), /native-helper-startup-failed/);
  assert.equal(baseFailed.clients.length, 2);
});

test('baseline remains lazy when no non-baseline candidate is frozen', async t => {
  const f = makeFixture({selection: {kind: 'baseline'}, starts: [{ok: true}]});
  t.after(() => f.service.destroy());
  assert.deepEqual(await f.service.prewarm(), {status: 'skipped', reason: 'baseline-selected'});
  assert.equal(f.clients.length, 0);
  await f.service.call('create', {});
  assert.equal(f.clients.length, 1);
  assert.equal(f.clients[0].options.libmpvPath, BASELINE);
});

test('invalid frozen candidate resolves to baseline before page create', async t => {
  const f = makeFixture({selection: {kind: 'baseline', selectionState: 'invalid', invalidCandidateId: CANDIDATE_ID,
    reasonCode: 'candidate-integrity-failed'}, starts: [{ok: true}]});
  t.after(() => f.service.destroy());
  assert.equal((await f.service.prewarm()).status, 'ready');
  assert.equal(f.clients.length, 1);
  assert.equal(f.clients[0].options.libmpvPath, BASELINE);
  assert.deepEqual(f.activationResults, [[CANDIDATE_ID, 'candidate-fallback', 'candidate-integrity-failed']]);
});

test('candidate bytes are revalidated immediately before Helper creation', async t => {
  const f = makeFixture({selection: candidateSelection(), starts: [{ok: true}], verifyFailure: true});
  t.after(() => f.service.destroy());
  assert.equal((await f.service.prewarm()).status, 'ready');
  assert.deepEqual(f.events.slice(0, 2), ['verify:' + CANDIDATE_ID, 'start:baseline']);
  assert.equal(f.clients.length, 1);
  assert.equal(f.clients[0].options.libmpvPath, BASELINE);
  assert.deepEqual(f.activationResults[0], [CANDIDATE_ID, 'candidate-fallback', 'candidate-integrity-failed']);
});

test('candidate runtime crash can recreate only the same candidate and never falls back or replays a session', async t => {
  const f = makeFixture({selection: candidateSelection(), starts: [{ok: true}, {ok: true}]});
  t.after(() => f.service.destroy());
  await f.service.prewarm();
  const first = await f.service.call('create', {});
  f.clients[0].crash();
  const recreated = await f.service.call('create', {});
  assert.equal(recreated.endpointId, first.endpointId, 'recreation keeps the existing renderer/PlaybackManager endpoint owner');
  assert.equal(f.clients.length, 2);
  assert.equal(f.clients[1].options.libmpvPath, CANDIDATE_PATH);
  assert.equal(f.events.filter(event => event === 'start:baseline').length, 0);
  assert.equal(f.service.status().kernel.activationState, 'candidate-active');
  await f.service.call('destroy', {}, recreated.endpointId);
});

test('candidate start failure latches baseline after destroy and create', async t => {
  const f = makeFixture({selection: candidateSelection(), starts: [
    {ok: false}, {ok: true}, {ok: true}
  ]});
  t.after(() => f.service.destroy());
  assert.equal((await f.service.prewarm()).status, 'ready');
  const first = await f.service.call('create', {});
  await f.service.call('destroy', {}, first.endpointId);
  const second = await f.service.call('create', {});
  await f.service.call('destroy', {}, second.endpointId);
  assert.equal(f.clients.length, 3);
  assert.equal(f.clients[0].options.libmpvPath, CANDIDATE_PATH);
  assert.equal(f.clients[1].options.libmpvPath, BASELINE);
  assert.equal(f.clients[2].options.libmpvPath, BASELINE);
  assert.equal(f.events.filter(event => event === 'start:candidate').length, 1);
  assert.equal(f.service.status().kernel.fallbackOccurred, true);
});

test('baseline crash after candidate fallback recreates baseline without reconsidering failed candidate', async t => {
  const f = makeFixture({selection: candidateSelection(), starts: [
    {ok: false}, {ok: true}, {ok: true}
  ]});
  t.after(() => f.service.destroy());
  assert.equal((await f.service.prewarm()).status, 'ready');
  const first = await f.service.call('create', {});
  f.clients[1].crash();
  const second = await f.service.call('create', {});
  await f.service.call('destroy', {}, second.endpointId);
  assert.equal(f.clients.length, 3);
  assert.equal(f.clients[0].options.libmpvPath, CANDIDATE_PATH);
  assert.equal(f.clients[1].options.libmpvPath, BASELINE);
  assert.equal(f.clients[2].options.libmpvPath, BASELINE);
  assert.equal(f.events.filter(event => event === 'start:candidate').length, 1);
});

test('destroy during delayed fallback baseline start does not record a baseline startup failure', async t => {
  const f = makeFixture({selection: candidateSelection(), starts: [
    {ok: false}, {ok: true, deferStart: true}
  ]});
  t.after(() => f.service.destroy());
  const prewarm = f.service.prewarm();
  for (let attempt = 0; attempt < 10 && !f.events.includes('start:baseline'); attempt++) {
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.deepEqual(f.events.slice(0, 3), [
    'verify:' + CANDIDATE_ID, 'start:candidate', 'kill:candidate'
  ]);
  assert.ok(f.clients.length >= 2);
  assert.equal(f.events.includes('start:baseline'), true);
  const shutdown = f.service.destroy();
  await new Promise(resolve => setImmediate(resolve));
  f.clients[1].releaseStart();
  await shutdown;
  assert.equal((await prewarm).status, 'failed');
  assert.deepEqual(f.activationResults, [[CANDIDATE_ID, 'candidate-fallback', 'candidate-start-failed']]);
  assert.equal(f.activationResults.some(entry => entry[1] === 'baseline-start-failed'), false);
});

test('destroy during a later effective-baseline restart does not record a false startup failure', async t => {
  const f = makeFixture({selection: candidateSelection(), starts: [
    {ok: false}, {ok: true}, {ok: true, deferStart: true}
  ]});
  t.after(() => f.service.destroy());
  assert.equal((await f.service.prewarm()).status, 'ready');
  const first = await f.service.call('create', {});
  f.clients[1].crash();
  const pendingCreate = f.service.call('create', {});
  for (let attempt = 0; attempt < 10 && f.clients.length < 3; attempt++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.clients.length, 3);
  const shutdown = f.service.destroy();
  await new Promise(resolve => setImmediate(resolve));
  f.clients[2].releaseStart();
  await shutdown;
  await assert.rejects(pendingCreate, /native-helper-service-destroyed/);
  assert.deepEqual(f.activationResults, [[CANDIDATE_ID, 'candidate-fallback', 'candidate-start-failed']]);
  assert.equal(f.activationResults.some(entry => entry[1] === 'baseline-start-failed'), false);
  assert.equal(first.status, 'ok');
});

test('successful candidate teardown and recreation retain the same frozen candidate', async t => {
  const f = makeFixture({selection: candidateSelection(), starts: [{ok: true}, {ok: true}]});
  t.after(() => f.service.destroy());
  await f.service.prewarm();
  const first = await f.service.call('create', {});
  await f.service.call('destroy', {}, first.endpointId);
  const second = await f.service.call('create', {});
  await f.service.call('destroy', {}, second.endpointId);
  assert.equal(f.clients.length, 2);
  assert.ok(f.clients.every(client => client.options.libmpvPath === CANDIDATE_PATH));
  assert.equal(f.events.filter(event => event === 'start:baseline').length, 0);
});
