'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(process.env.ETE_REFRESH_RATE_PLAYER_SOURCE ||
  path.join(root, 'src/electronapp/plugins/libmpv.js'), 'utf8');

function makeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    get now() { return now; },
    setTimeout(callback, delay = 0) {
      const id = nextId++;
      timers.set(id, {id, at: now + Math.max(0, Number(delay) || 0), callback});
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    elapse(milliseconds) { now += milliseconds; },
    pendingDelays() { return [...timers.values()].map(timer => timer.at - now).sort((a, b) => a - b); },
    advance(milliseconds) {
      const target = now + milliseconds;
      for (;;) {
        const timer = [...timers.values()].filter(value => value.at <= target)
          .sort((a, b) => a.at - b.at || a.id - b.id)[0];
        if (!timer) break;
        timers.delete(timer.id);
        now = timer.at;
        timer.callback();
      }
      now = target;
    }
  };
}

function loadPlayer(plans = {}) {
  const clock = makeClock();
  const settings = new Map([['mpv-displaysync', 'true'], ['mpv-displaysync_override', '120;144']]);
  const appSettings = {get: key => settings.get(key), set: (key, value) => settings.set(key, value)};
  const listeners = new Map();
  const refreshRequests = [];
  const requests = [];
  const diagnostics = [];
  let factory;
  let endpoint;
  const dispatch = name => (listeners.get(name) || []).slice().forEach(listener => listener({type: name}));
  class FakeDate extends Date { static now() { return clock.now; } }
  class FakeXHR {
    constructor() { this.settled = false; this.abortCount = 0; }
    open(method, url) { this.method = method; this.url = url; }
    send() {
      refreshRequests.push(this.url);
      requests.push(this);
      const queue = plans[this.url] || [];
      this.plan = queue.length ? queue.shift() : {};
      if (this.plan.advanceBeforeResponse) clock.advance(this.plan.advanceBeforeResponse);
      if (this.plan.pending) return;
      this.deliver();
    }
    deliver() {
      if (this.settled) return;
      this.settled = true;
      if (this.plan.error) return this.onerror && this.onerror(new Error('synthetic network error'));
      if (this.plan.timeout) return (this.ontimeout || this.onerror).call(this, new Error('synthetic timeout'));
      this.response = this.plan.response === undefined ? defaultResponse(this.url) : this.plan.response;
      return this.onload && this.onload.call(this);
    }
    abort() {
      this.abortCount++;
      this.settled = true;
      if (this.onabort) this.onabort.call(this, new Error('synthetic abort'));
    }
  }
  function defaultResponse(url) {
    if (url === 'electronrefreshrate://list_possible') return '60;120;144';
    if (url === 'electronrefreshrate://current') return '60';
    if (url.startsWith('electronrefreshrate://change?rate=')) return 'Refresh rate ' + url.split('=').pop();
    return '';
  }
  const context = {
    define: (_dependencies, callback) => { factory = callback; },
    addEventListener(name, listener) { const values = listeners.get(name) || []; values.push(listener); listeners.set(name, values); },
    removeEventListener(name, listener) { listeners.set(name, (listeners.get(name) || []).filter(value => value !== listener)); },
    dispatchEvent: event => dispatch(event.type), Event: function (name) { this.type = name; },
    console: {log() {}, warn() {}, error() {}}, Promise, Set, Map, Object, Array, String, Number, Math, Date: FakeDate,
    parseInt, parseFloat, AbortController,
    CustomEvent: function (name, options) { this.type = name; this.detail = options && options.detail; },
    window: {platform: 'win32', innerWidth: 1920, innerHeight: 1080, PlayerWindowId: 'restore-fixture',
      ipc: {send(channel, payload) { diagnostics.push({channel, payload}); return Promise.resolve(); }}},
    screen: {width: 1920, height: 1080}, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    document: {querySelector: () => null, body: {firstChild: null, insertBefore() {}}, createElement: () => ({
      classList: {add() {}, remove() {}}, style: {}, addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {}
    })},
    XMLHttpRequest: FakeXHR
  };
  vm.runInNewContext(source, context, {timeout: 1000, filename: 'src/electronapp/plugins/libmpv.js'});
  const playbackManager = {getSubtitleUrl: () => '', getPlayerState: () => ({volume: 50}), getCurrentItem: () => ({}),
    getPlayerSettings: () => ({}), addEventListener() {}, removeEventListener() {}};
  const pluginManager = {registerPlugin(instance, id) { instance.id = id; }, mapPath: (_instance, file) => file};
  const events = {on() {}, off() {}, trigger() {}};
  const router = {showVideoOsd: async () => {}, show: async () => {}, setTransparency() {}};
  const userSettings = {get: () => null, getSubtitleAppearanceSettings: () => ({})};
  const modules = [{}, playbackManager, pluginManager, events, router, appSettings, userSettings, (_names, callback) => callback(), {},
    {isStrm: () => false, resolveAsync: async request => ({type: 'native', source: request.nativeSource})}, {}, {}, {}, {},
    {create: async () => {
      endpoint = {style: {}, commands: [], properties: [], destroyCalls: 0,
        setProperties: async values => endpoint.properties.push(values),
        sendCommand: async command => { endpoint.commands.push(command); if (command[0] === 'loadfile') dispatch('core-playing'); },
        addEventListener() {}, removeEventListener() {}, observeProperties: async () => {}, getProperty: async () => null,
        beginGeneration: async () => ({}), retireGeneration() {}, destroy: async () => { endpoint.destroyCalls++; }};
      return {mode: 'native-helper', endpoint};
    }}];
  modules[13] = {install() {}, createNative: () => ({playbackStarted() {}, playbackReady() {}, playbackFailed() {},
    loadingToken: () => null, install() {}, admit: () => true, cancel() {}, isActive: () => false, beforeTeardown: async () => null})};
  const Player = factory(...modules);
  return {instance: new Player(), clock, endpoint: () => endpoint, refreshRequests, requests, diagnostics};
}

function playOptions(id = 1, extra = {}) {
  return {item: {MediaType: 'Video', Type: 'Movie', Path: `restore-${id}.mkv`}, mediaType: 'Video',
    mediaSource: {Path: `restore-${id}.mkv`, RunTimeTicks: 10000000, MediaStreams: []}, url: `restore-${id}.mkv`,
    playMethod: 'DirectPlay', startPositionTicks: 0, _etePlayRequestId: id, ...extra};
}

async function flushMicrotasks() { for (let i = 0; i < 24; i++) await Promise.resolve(); }

async function establish60To120(h) {
  await h.instance.play(playOptions());
  assert.ok(h.endpoint().commands.some(command => command[0] === 'loadfile'), 'normal Native loadfile is the positive control');
  assert.ok(h.endpoint().properties.some(value => Object.prototype.hasOwnProperty.call(value, 'pause')),
    'actual Native endpoint received playback properties');
  const changing = h.instance._onEstimatedVfFpsChanged(24);
  await flushMicrotasks();
  assert.ok(h.refreshRequests.includes('electronrefreshrate://change?rate=120'), 'real FPS callback requests 120 Hz');
  const resumedBeforeChange = h.endpoint().properties.filter(value => value.pause === false).length;
  assert.equal(h.endpoint().properties.at(-1).pause, true, 'actual Native endpoint pauses during the change');
  h.clock.advance(2999);
  await flushMicrotasks();
  assert.equal(h.endpoint().properties.filter(value => value.pause === false).length, resumedBeforeChange,
    'successful rate change stays paused for the original 3000ms');
  h.clock.advance(1);
  await changing;
  assert.ok(h.endpoint().properties.filter(value => value.pause === false).length > resumedBeforeChange,
    'Native playback resumes after the original 3000ms stabilization');
}

function restorationRequests(h) {
  return h.refreshRequests.filter(value => value === 'electronrefreshrate://change?rate=60');
}

function restoreEvents(h, event) {
  return h.diagnostics.filter(value => value.channel === 'enhanced-diagnostics-log' && value.payload.category === 'display' &&
    value.payload.event === event);
}

function caseTest(name, run) {
  test(name, {timeout: 2000}, run);
}

caseTest('restore skips an observed third value and emits the fixed skipped diagnostic', async () => {
  const h = loadPlayer({'electronrefreshrate://current': [
    {response: '60'}, {response: '144'}
  ]});
  await establish60To120(h);
  await h.instance.destroy();
  assert.deepEqual(restorationRequests(h), [], '144 is observed before any compensating change is sent');
  assert.equal(restoreEvents(h, 'display-restore-skipped').length, 1);
  assert.equal(restoreEvents(h, 'display-restore-skipped')[0].payload.details.reason, 'observed-change');
});

caseTest('restore preserves 60 when the observed current value still matches the successful 120 change', async () => {
  const h = loadPlayer({'electronrefreshrate://current': [{response: '60'}, {response: '120'}]});
  await establish60To120(h);
  await h.instance.destroy();
  assert.deepEqual(restorationRequests(h), ['electronrefreshrate://change?rate=60']);
  assert.equal(restoreEvents(h, 'display-restore-skipped').length, 0);
  assert.equal(restoreEvents(h, 'display-restore-unavailable').length, 0);
});

for (const [label, plan, reason] of [
  ['error', {error: true}, 'probe-or-restore-failed'],
  ['empty', {response: ''}, 'current-unavailable'],
  ['zero', {response: '0'}, 'current-unavailable'],
  ['timeout', {timeout: true}, 'probe-or-restore-failed']
]) {
  caseTest(`unavailable current ${label} never writes the original value`, async () => {
    const h = loadPlayer({'electronrefreshrate://current': [{response: '60'}, plan]});
    await establish60To120(h);
    await h.instance.destroy();
    assert.deepEqual(restorationRequests(h), [], 'unknown current state never triggers a blind change');
    const events = restoreEvents(h, 'display-restore-unavailable');
    assert.equal(events.length, 1, 'one fixed unavailable diagnostic is captured through window.ipc.send');
    assert.equal(events[0].payload.details.reason, reason);
    assert.equal(restoreEvents(h, 'display-restore-skipped').length, 0, 'unknown is not classified as a third value');
  });
}

caseTest('destroy and Native teardown finish while its restore current request is pending', async () => {
  const h = loadPlayer({'electronrefreshrate://current': [{response: '60'}, {pending: true}]});
  await establish60To120(h);
  let destroySettled = false;
  const destroying = h.instance.destroy().then(() => { destroySettled = true; });
  await flushMicrotasks();
  assert.equal(destroySettled, true, 'destroy does not await the current display query');
  assert.equal(h.endpoint().destroyCalls, 1, 'Native endpoint teardown completed immediately');
  assert.ok(h.requests.some(request => request.url === 'electronrefreshrate://current' && request.plan.pending));
  await destroying;
  assert.deepEqual(restorationRequests(h), []);
  assert.equal(h.clock.pendingDelays().length, 1, 'only the bounded probe timer remains while its response is pending');
});

caseTest('Next retires a pending old restore query before it can send the original rate', async () => {
  const h = loadPlayer({'electronrefreshrate://current': [{response: '60'}, {pending: true}, {response: '60'}]});
  await establish60To120(h);
  await h.instance.destroy();
  const oldCurrent = h.requests.find(request => request.url === 'electronrefreshrate://current' && request.plan.pending);
  assert.ok(oldCurrent, 'destroy began a pending old-owner observation');
  await h.instance.play(playOptions(2, {command: 'nextTrack'}));
  oldCurrent.response = '120';
  oldCurrent.settled = true;
  oldCurrent.onload.call(oldCurrent);
  await flushMicrotasks();
  assert.deepEqual(restorationRequests(h), [], 'retired generation does not issue its old restore');
  assert.ok(h.endpoint().commands.some(command => command[0] === 'loadfile' && command[1] === 'restore-2.mkv'),
    'Next owner still reaches Native loadfile');
});

caseTest('a current read at 7999ms leaves exactly 1ms for its change request', async () => {
  const h = loadPlayer({'electronrefreshrate://current': [{response: '60'}, {pending: true}],
    'electronrefreshrate://change?rate=60': [{pending: true}]});
  await establish60To120(h);
  h.instance.destroy();
  await flushMicrotasks();
  const current = h.requests.find(request => request.url === 'electronrefreshrate://current' && request.plan.pending);
  assert.ok(current);
  h.clock.advance(7999);
  current.response = '120';
  current.settled = true;
  current.onload.call(current);
  await flushMicrotasks();
  const restoring = h.requests.find(request => request.url === 'electronrefreshrate://change?rate=60');
  assert.ok(restoring, 'matching observation permits the original-rate write');
  assert.ok(h.clock.pendingDelays().includes(1), 'query and change share the original absolute 8000ms budget');
  h.clock.advance(1);
  await flushMicrotasks();
  assert.equal(restoring.abortCount, 1, 'change request is aborted at the shared deadline');
  assert.equal(restoreEvents(h, 'display-restore-unavailable').length, 1);
});

caseTest('a query that consumes the full 8000ms budget sends no change request', async () => {
  const h = loadPlayer({'electronrefreshrate://current': [{response: '60'}, {pending: true}]});
  await establish60To120(h);
  h.instance.destroy();
  await flushMicrotasks();
  h.clock.advance(8000);
  await flushMicrotasks();
  assert.deepEqual(restorationRequests(h), [], 'expired observation budget prevents a restore request');
  assert.equal(restoreEvents(h, 'display-restore-unavailable').length, 1);
});

caseTest('a current onload delivered at 8000ms before its timer cannot start a change', async () => {
  const h = loadPlayer({'electronrefreshrate://current': [{response: '60'}, {pending: true}]});
  await establish60To120(h);
  h.instance.destroy();
  await flushMicrotasks();
  const current = h.requests.find(request => request.url === 'electronrefreshrate://current' && request.plan.pending);
  assert.ok(current);
  h.clock.elapse(8000);
  current.response = '120';
  current.deliver();
  await flushMicrotasks();
  assert.deepEqual(restorationRequests(h), [], 'deadline check rejects the result even when onload wins timer ordering');
  assert.equal(restoreEvents(h, 'display-restore-unavailable').length, 1);
});

for (const [label, plan, expectedReason] of [
  ['rejection', {error: true}, 'probe-or-restore-failed'],
  ['empty result', {response: ''}, 'restore-unavailable'],
  ['zero result', {response: '0'}, 'restore-unavailable'],
  ['non-original result', {response: 'Refresh rate 144 Hz'}, 'restore-unavailable']
]) {
  caseTest(`restore ${label} is captured as unavailable without retry or success`, async () => {
    const h = loadPlayer({'electronrefreshrate://current': [{response: '60'}, {response: '120'}],
      'electronrefreshrate://change?rate=60': [plan]});
    await establish60To120(h);
    await h.instance.destroy();
    assert.deepEqual(restorationRequests(h), ['electronrefreshrate://change?rate=60']);
    assert.equal(restoreEvents(h, 'display-restore-unavailable').length, 1);
    assert.equal(restoreEvents(h, 'display-restore-unavailable')[0].payload.details.reason, expectedReason);
    assert.equal(restoreEvents(h, 'display-restore-skipped').length, 0);
    assert.equal(h.refreshRequests.filter(value => value === 'electronrefreshrate://current').length, 2,
      'failed restore response is not retried or read back');
    assert.equal(restoreEvents(h, 'display-restore-success').length, 0, 'no restoration success is claimed');
  });
}
