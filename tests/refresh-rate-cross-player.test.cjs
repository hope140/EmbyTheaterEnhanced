'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {EventEmitter} = require('node:events');
const {test} = require('node:test');
const {namedFunction} = require('./fixtures/settings-menu-routes.cjs');

const root = path.resolve(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'src/electronapp/main.js'), 'utf8');
const playerSource = fs.readFileSync(path.join(root, 'src/electronapp/plugins/libmpv.js'), 'utf8');

class SharedClock {
  constructor() { this.now = 1000; this.nextId = 1; this.jobs = new Map(); }
  setTimeout(callback, delay = 0) {
    const id = this.nextId++;
    this.jobs.set(id, {at: this.now + Math.max(0, Number(delay) || 0), callback});
    return id;
  }
  clearTimeout(id) { this.jobs.delete(id); }
  advance(ms) {
    const target = this.now + ms;
    for (;;) {
      const next = [...this.jobs.entries()].filter(([, job]) => job.at <= target)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      const [id, job] = next;
      this.jobs.delete(id);
      this.now = job.at;
      job.callback();
    }
    this.now = target;
  }
}

function createHarness(scenario) {
  const clock = new SharedClock();
  const trace = [];
  const children = [];
  const endpoints = [];
  let physicalDisplay = '60';
  let handler;
  let eventSeq = 0;
  const log = (event, data = {}) => trace.push({seq: ++eventSeq, event, ...data});

  function finishChild(child, output) {
    if (child.closed) return;
    child.closed = true;
    child.stdout.emit('data', Buffer.from(output));
    child.emit('exit', 0);
    child.emit('close', 0);
    log('main-child-close', {childId: child.id, action: child.action, output, display: physicalDisplay});
  }

  function installMainHandler() {
    const runtime = {
      electron: {protocol: {registerStringProtocol: (_scheme, callback) => { handler = callback; }}},
      process: {platform: 'win32', arch: 'x64'},
      __dirname: '/synthetic-app',
      Date: {now: () => clock.now},
      setTimeout: clock.setTimeout.bind(clock),
      clearTimeout: clock.clearTimeout.bind(clock),
      require(name) {
        if (name === 'path') return path;
        if (name !== 'child_process') throw new Error('Unexpected module ' + name);
        return {spawn(_file, args) {
          const action = String(args[0]);
          const child = new EventEmitter();
          child.stdout = new EventEmitter();
          child.id = children.length + 1;
          child.action = action;
          child.rate = action === 'change' ? String(args[2]) : null;
          child.pid = 5000 + child.id;
          child.kill = () => { child.killCalls = (child.killCalls || 0) + 1; return true; };
          children.push(child);
          log('main-spawn', {childId: child.id, action, rate: child.rate, liveAtSpawn: true});
          if (action === 'current' || action === 'list_possible') {
            clock.setTimeout(() => finishChild(child, action === 'current' ? 'Refresh rate ' + physicalDisplay + ' Hz' : '60;120;144'), 0);
          }
          return child;
        }};
      }
    };
    const register = vm.runInNewContext(namedFunction(mainSource, 'registerFreshRate') + '\nregisterFreshRate', runtime,
      {timeout: 1000, filename: 'src/electronapp/main.js'});
    return register();
  }

  const shutdown = installMainHandler();
  const protocol = {
    invoke(playerId, url, xhr) {
      log('renderer-xhr-send', {playerId, url});
      handler({url}, value => {
        log('main-protocol-callback', {playerId, url, value, display: physicalDisplay});
        xhr.response = value;
        if (xhr.onload) xhr.onload.call(xhr);
        log('renderer-xhr-complete', {playerId, url, value});
      });
    }
  };

  function createAdapter(playerId) {
    let factory;
    const listeners = new Map();
    const settings = new Map([['mpv-displaysync', 'true'], ['mpv-displaysync_override', '']]);
    const appSettings = {get: key => settings.get(key), set: (key, value) => settings.set(key, value)};
    let endpointNumber = 0;
    const dispatch = name => (listeners.get(name) || []).slice().forEach(fn => fn({type: name}));
    class PlayerDate extends Date { static now() { return clock.now; } }
    class FakeXHR {
      open(method, url) { this.method = method; this.url = url; }
      send() { protocol.invoke(playerId, this.url, this); }
      abort() { this.abortCalls = (this.abortCalls || 0) + 1; log('renderer-xhr-abort', {playerId, url: this.url}); }
    }
    const context = {
      define: (_dependencies, callback) => { factory = callback; },
      addEventListener(name, fn) { const values = listeners.get(name) || []; values.push(fn); listeners.set(name, values); },
      removeEventListener(name, fn) { listeners.set(name, (listeners.get(name) || []).filter(value => value !== fn)); },
      dispatchEvent: event => dispatch(event.type), Event: function (name) { this.type = name; },
      console: {log() {}, warn() {}, error() {}}, Promise, Set, Map, Object, Array, String, Number, Math, Date: PlayerDate,
      parseInt, parseFloat, AbortController,
      CustomEvent: function (name, options) { this.type = name; this.detail = options && options.detail; },
      window: {platform: 'win32', innerWidth: 1920, innerHeight: 1080, PlayerWindowId: 'synthetic-' + playerId, ipc: {send() {}}},
      screen: {width: 1920, height: 1080},
      setTimeout: clock.setTimeout.bind(clock), clearTimeout: clock.clearTimeout.bind(clock),
      document: {querySelector: () => null, body: {firstChild: null, insertBefore() {}}, createElement: () => ({
        classList: {add() {}, remove() {}}, style: {}, addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {}
      })},
      XMLHttpRequest: FakeXHR
    };
    vm.runInNewContext(playerSource, context, {timeout: 1000, filename: 'src/electronapp/plugins/libmpv.js<' + playerId + '>'});
    const playbackManager = {getSubtitleUrl: () => '', getPlayerState: () => ({volume: 50}), getCurrentItem: () => ({}),
      getPlayerSettings: () => ({}), addEventListener() {}, removeEventListener() {}};
    const pluginManager = {registerPlugin(instance, id) { instance.id = id; }, mapPath: (_instance, file) => file};
    const events = {on() {}, off() {}, trigger() {}};
    const router = {showVideoOsd: async () => {}, show: async () => {}, setTransparency() {}};
    const userSettings = {get: () => null, getSubtitleAppearanceSettings: () => ({})};
    const modules = [{}, playbackManager, pluginManager, events, router, appSettings, userSettings, (_names, callback) => callback(), {},
      {isStrm: () => false, resolveAsync: async request => ({type: 'native', source: request.nativeSource})}, {}, {}, {}, {},
      {create: async () => {
        const endpointId = playerId + '-native-endpoint-' + (++endpointNumber);
        const endpoint = {style: {}, commands: [], properties: [], endpointId,
          setProperties: async values => { endpoint.properties.push(values); log('native-set-properties', {playerId, values}); },
          sendCommand: async command => {
            endpoint.commands.push(command);
            log('native-command', {playerId, command});
            if (Array.isArray(command) && command[0] === 'loadfile') dispatch('core-playing');
          },
          addEventListener() {}, removeEventListener() {}, observeProperties: async () => {}, getProperty: async () => null,
          beginGeneration: async () => ({}), retireGeneration() {}, destroy: async () => log('native-endpoint-destroy', {playerId, endpointId})};
        endpoints.push(endpoint);
        return {mode: 'native-helper', endpoint};
      }}];
    modules[13] = {install() {}, createNative: () => ({playbackStarted() {}, playbackReady() {}, playbackFailed() {}, loadingToken: () => null,
      install() {}, admit: () => true, cancel() {}, isActive: () => false, beforeTeardown: async () => null})};
    const Player = factory(...modules);
    const instance = new Player();
    log('amd-adapter-constructed', {playerId});
    return {playerId, instance, endpoints, options: id => ({item: {MediaType: 'Video', Type: 'Movie', Path: 'synthetic-' + playerId + '.mkv'},
      mediaType: 'Video', mediaSource: {Path: 'synthetic-' + playerId + '.mkv', RunTimeTicks: 10000000, MediaStreams: []},
      url: 'synthetic-' + playerId + '.mkv', playMethod: 'DirectPlay', startPositionTicks: 0, _etePlayRequestId: id})};
  }

  return {scenario, clock, trace, children, endpoints, log, createAdapter, shutdown,
    get physicalDisplay() { return physicalDisplay; },
    requestMain(url, callback) { handler({url}, callback); },
    applyChange(child) {
      assert.equal(child.action, 'change');
      physicalDisplay = child.rate;
      log('synthetic-tool-apply', {childId: child.id, rate: child.rate, display: physicalDisplay});
    },
    finishChild,
    liveChanges() { return children.filter(child => child.action === 'change' && !child.closed); }};
}

async function flushMicrotasks() { for (let i = 0; i < 24; i++) await Promise.resolve(); }

async function play(adapter, clock) {
  let state = 'pending', error;
  const pending = adapter.instance.play(adapter.options(1));
  pending.then(() => { state = 'resolved'; }, value => { state = 'rejected'; error = value; });
  for (let i = 0; i < 80 && state === 'pending'; i++) {
    clock.advance(0);
    await flushMicrotasks();
  }
  assert.equal(state, 'resolved', 'actual AMD Player.play() completes: ' + String(error && error.stack || error || 'still pending'));
  const endpoint = adapter.endpoints.at(-1);
  assert.ok(endpoint, adapter.playerId + ' created its Native endpoint');
  assert.ok(endpoint.commands.some(command => Array.isArray(command) && command[0] === 'loadfile'), adapter.playerId + ' sent normal loadfile');
  assert.ok(endpoint.properties.some(properties => Object.prototype.hasOwnProperty.call(properties, 'pause')),
    adapter.playerId + ' applied initial normal pause state');
  return endpoint;
}

async function settleChange(harness, promise) {
  await flushMicrotasks();
  const active = harness.liveChanges();
  assert.equal(active.length, 1, 'one real main child is live when the serialized change is settled');
  harness.applyChange(active[0]);
  harness.finishChild(active[0], 'Refresh rate ' + harness.physicalDisplay + ' Hz');
  await flushMicrotasks();
  harness.clock.advance(3000);
  await flushMicrotasks();
  await promise;
}

function assertNativePlaybackContinued(harness, endpoint, playerId) {
  assert.ok(endpoint.commands.some(command => Array.isArray(command) && command[0] === 'loadfile'), playerId + ' still loaded media');
  assert.ok(endpoint.properties.some(properties => properties.pause === true), playerId + ' paused during its display change');
  const changeCompleted = harness.trace.find(event => event.event === 'renderer-xhr-complete' && event.playerId === playerId &&
    event.url.includes('change') && event.value === 'Refresh rate 120 Hz');
  assert.ok(changeCompleted, playerId + ' received its successful display result');
  assert.ok(harness.trace.some(event => event.event === 'native-set-properties' && event.playerId === playerId &&
    event.values.pause === false && event.seq > changeCompleted.seq), playerId + ' resumed after its successful display change');
}

test('two complete AMD players serialize refresh changes through one main handler and keep native playback alive', async () => {
  const h = createHarness('two-player-fifo');
  const A = h.createAdapter('A');
  const B = h.createAdapter('B');
  const endpointA = await play(A, h.clock);
  const endpointB = await play(B, h.clock);

  const changeA = A.instance._onEstimatedVfFpsChanged(24);
  const changeB = B.instance._onEstimatedVfFpsChanged(24);
  await flushMicrotasks();
  const first = h.liveChanges();
  assert.equal(first.length, 1, 'B remains queued while A owns the single utility slot');
  assert.equal(first[0].rate, '120');
  assert.equal(h.children.filter(child => child.action === 'change').length, 1);

  h.applyChange(first[0]);
  h.finishChild(first[0], 'Refresh rate ' + h.physicalDisplay + ' Hz');
  await flushMicrotasks();
  const firstCallbackIndex = h.trace.findIndex(event => event.event === 'renderer-xhr-complete' && event.playerId === 'A' && event.url.includes('change'));
  const secondSpawnIndex = h.trace.findIndex(event => event.event === 'main-spawn' && event.action === 'change' && event.childId !== first[0].id);
  assert.ok(firstCallbackIndex >= 0, 'A received its completed tool result');
  assert.ok(secondSpawnIndex > firstCallbackIndex, 'B only spawned after A callback completion');
  const second = h.liveChanges();
  assert.equal(second.length, 1, 'B acquired the slot after A closed');
  assert.equal(second[0].rate, '120');

  h.applyChange(second[0]);
  h.finishChild(second[0], 'Refresh rate ' + h.physicalDisplay + ' Hz');
  await flushMicrotasks();
  h.clock.advance(3000);
  await Promise.all([changeA, changeB]);
  assert.equal(h.physicalDisplay, '120');
  assertNativePlaybackContinued(h, endpointA, 'A');
  assertNativePlaybackContinued(h, endpointB, 'B');
  assert.equal(h.trace.filter(event => event.event === 'main-spawn' && event.action === 'change').length, 2,
    'both actual AMD callbacks made an independently completed change request');

  await A.instance.destroy();
  await B.instance.destroy();
  await flushMicrotasks();
  const restoreA = h.liveChanges();
  assert.equal(restoreA.length, 1, 'A original-rate restoration owns the main slot first');
  assert.equal(restoreA[0].rate, '60', 'A restores the original rate it observed at play');
  h.applyChange(restoreA[0]);
  h.finishChild(restoreA[0], 'Refresh rate ' + h.physicalDisplay + ' Hz');
  await flushMicrotasks();
  const restoreCallbackIndex = h.trace.map(event => event.event === 'main-protocol-callback' && event.url.includes('change') && event.value ? event.seq : 0)
    .filter(Boolean).at(-1);
  const restoreBSpawn = h.trace.filter(event => event.event === 'main-spawn' && event.action === 'change').at(-1);
  assert.ok(restoreBSpawn && restoreBSpawn.seq > restoreCallbackIndex,
    'B original-rate restoration starts after A restoration callback completion');
  assert.equal(restoreBSpawn.rate, '60', 'B restores its own original rate');
  assert.equal(h.liveChanges().length, 1);
  h.applyChange(h.liveChanges()[0]);
  h.finishChild(h.liveChanges()[0], 'Refresh rate ' + h.physicalDisplay + ' Hz');
  await flushMicrotasks();
  assert.equal(h.physicalDisplay, '60');

  await h.shutdown;
});

test('a queued cross-player change expires at its receive-time deadline without spawning', async () => {
  const h = createHarness('queued-timeout');
  const A = h.createAdapter('A');
  const B = h.createAdapter('B');
  const endpointA = await play(A, h.clock);
  const endpointB = await play(B, h.clock);
  const changeA = A.instance._onEstimatedVfFpsChanged(24);
  const changeB = B.instance._onEstimatedVfFpsChanged(24);
  await flushMicrotasks();

  assert.equal(h.liveChanges().length, 1, 'A is running while B waits in the main FIFO');
  assert.equal(h.children.filter(child => child.action === 'change').length, 1);
  h.clock.advance(5000);
  await flushMicrotasks();
  await Promise.all([changeA, changeB]);
  assert.equal(h.children.filter(child => child.action === 'change').length, 1,
    'B callback times out without creating a child after the receive-time deadline');
  const quarantinedChild = h.liveChanges()[0];
  assert.ok(quarantinedChild, 'A stays quarantined until its child confirms exit');
  assert.equal(quarantinedChild.killCalls, 1, 'running A child received the deadline kill request');
  h.clock.advance(3000);
  await flushMicrotasks();
  await Promise.all([changeA, changeB]);
  assert.ok(h.trace.some(event => event.event === 'renderer-xhr-complete' && event.playerId === 'B' && event.value === ''),
    'queued B received a bounded empty result');
  const spawnCountAfterTimeout = h.children.length;
  const xhrCountAfterTimeout = h.trace.filter(event => event.event === 'renderer-xhr-send').length;
  await A.instance._onEstimatedVfFpsChanged(24);
  await B.instance._onEstimatedVfFpsChanged(24);
  assert.equal(h.children.length, spawnCountAfterTimeout, 'failed adapters do not retry the display utility');
  assert.equal(h.trace.filter(event => event.event === 'renderer-xhr-send').length, xhrCountAfterTimeout,
    'failed adapters do not issue another refresh-rate request');
  for (const endpoint of [endpointA, endpointB]) {
    assert.ok(endpoint.properties.some(properties => properties.pause === true), 'display attempt paused only this adapter');
    assert.ok(endpoint.properties.some(properties => properties.pause === false), 'failed display attempt resumed native playback');
  }
  const childCountBeforeQuarantineProbe = h.children.length;
  let rejectedProbe;
  h.requestMain('electronrefreshrate://current', value => { rejectedProbe = value; });
  assert.equal(rejectedProbe, '', 'quarantine rejects a fresh main tool request');
  assert.equal(h.children.length, childCountBeforeQuarantineProbe, 'quarantine prevents a fresh utility spawn');
  assert.ok(endpointA.commands.some(command => Array.isArray(command) && command[0] === 'loadfile'));
  assert.ok(endpointB.commands.some(command => Array.isArray(command) && command[0] === 'loadfile'));
  h.finishChild(quarantinedChild, '');
  await h.shutdown;
});
