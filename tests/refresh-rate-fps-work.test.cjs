'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const boundedTest = (name, fn) => test(name, {timeout: 2000}, fn);

const sourcePath = process.env.ETE_LIBMPV_SOURCE
  ? path.resolve(process.env.ETE_LIBMPV_SOURCE)
  : path.join(__dirname, '..', 'src/electronapp/plugins/libmpv.js');
const source = fs.readFileSync(sourcePath, 'utf8');

function makeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    get now() { return now; },
    setTimeout(callback, delay) {
      const id = nextId++;
      timers.set(id, {id, at: now + Math.max(0, Number(delay) || 0), callback});
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    pendingDelays() { return [...timers.values()].map(timer => timer.at - now).sort((a, b) => a - b); },
    advance(milliseconds) {
      const target = now + milliseconds;
      while (true) {
        const due = [...timers.values()].filter(timer => timer.at <= target).sort((a, b) => a.at - b.at || a.id - b.id)[0];
        if (!due) break;
        timers.delete(due.id);
        now = due.at;
        due.callback();
      }
      now = target;
    }
  };
}

function loadPlayer({plans = {}, resolverError, createError, setPropertiesError, loadfileError} = {}) {
  const clock = makeClock();
  const settings = new Map([['mpv-displaysync', 'true'], ['mpv-displaysync_override', '120;144']]);
  const appSettings = {get: key => settings.get(key), set: (key, value) => settings.set(key, value)};
  let factory;
  const listeners = new Map();
  const refreshRequests = [];
  const endpoint = {style: {}, commands: [], properties: [], pauseWrites: [], signals: [],
    setProperties: async values => {
      endpoint.properties.push(values);
      if (Object.prototype.hasOwnProperty.call(values, 'pause')) endpoint.pauseWrites.push(values.pause);
      if (setPropertiesError) throw setPropertiesError;
    },
    sendCommand: async command => {
      endpoint.commands.push(command);
      if (Array.isArray(command) && command[0] === 'loadfile') {
        if (loadfileError) throw loadfileError;
        dispatch('core-playing');
      }
    },
    addEventListener() {}, removeEventListener() {}, observeProperties: async () => {}, getProperty: async name => ({
      'video-out-params': {w: 1920, h: 1080, aspect: '16:9'},
      'display-fps': 60,
      'estimated-display-fps': 59.94,
      'video-codec': 'h264',
      'mpv-version': 'fixture',
      'current-vo': 'gpu-next',
      'hwdec-current': 'd3d11va',
      'display-names': ['fixture display'],
      'display-sync-active': true,
      'frame-drop-count': 0,
      'decoder-frame-drop-count': 0,
      'mistimed-drop-count': 0,
      'vo-delayed-frame-count': 0
    })[name] ?? null,
    beginGeneration: async () => {}, destroy: async () => {}};
  const pendingXhrs = [];
  const allXhrs = [];
  const dispatch = name => (listeners.get(name) || []).slice().forEach(listener => listener({type: name}));
  class FakeDate extends Date { static now() { return clock.now; } }
  class FakeXhr {
    constructor() { this.abortCount = 0; this.settled = false; }
    open(method, url) { this.method = method; this.url = url; }
    saveHandlers() {
      this.savedHandlers = {onload: this.onload, onerror: this.onerror, onabort: this.onabort, ontimeout: this.ontimeout};
    }
    abort() {
      this.abortCount++;
      this.settled = true;
      const onabort = this.savedHandlers && this.savedHandlers.onabort || this.onabort;
      if (onabort) onabort.call(this, new Error('synthetic abort'));
    }
    send() {
      refreshRequests.push(this.url);
      allXhrs.push(this);
      const queue = plans[this.url] || [];
      const plan = queue.length ? queue.shift() : {};
      this.plan = plan;
      if (plan.advanceBeforeResponse) clock.advance(plan.advanceBeforeResponse);
      this.saveHandlers();
      if (plan.pending) { pendingXhrs.push(this); return; }
      if (plan.error) { this.settled = true; this.onerror && this.onerror(new Error('synthetic network error')); return; }
      if (plan.timeout) {
        this.settled = true;
        if (this.ontimeout) this.ontimeout(new Error('synthetic timeout'));
        else if (this.onerror) this.onerror(new Error('synthetic timeout'));
        return;
      }
      this.response = plan.response === undefined ? defaultResponse(this.url) : plan.response;
      this.settled = true;
      this.onload && this.onload();
    }
    respondLate() {
      this.response = this.plan.response === undefined ? defaultResponse(this.url) : this.plan.response;
      this.settled = true;
      if (this.savedHandlers && this.savedHandlers.onload) this.savedHandlers.onload.call(this);
    }
    failLate() {
      this.settled = true;
      if (this.savedHandlers && this.savedHandlers.onerror) this.savedHandlers.onerror.call(this, new Error('late synthetic network error'));
    }
  }
  function defaultResponse(url) {
    if (url === 'electronrefreshrate://list_possible') return '60;120;144';
    if (url === 'electronrefreshrate://current') return '60';
    if (url.startsWith('electronrefreshrate://change?rate=')) return 'Refresh rate ' + url.split('=').pop();
    return '';
  }
  const context = {
    define: (dependencies, callback) => { factory = callback; },
    addEventListener: (name, listener) => { const list = listeners.get(name) || []; list.push(listener); listeners.set(name, list); },
    removeEventListener: (name, listener) => { listeners.set(name, (listeners.get(name) || []).filter(item => item !== listener)); },
    dispatchEvent: event => dispatch(event.type), Event: function (name) { this.type = name; },
    console: {log() {}, warn() {}, error() {}}, Promise, Set, Map, Object, Array, String, Number, Math, Date: FakeDate,
    parseInt, parseFloat, AbortController,
    CustomEvent: function (name, options) { this.type = name; this.detail = options && options.detail; },
    window: {platform: 'win32', innerWidth: 1920, innerHeight: 1080, PlayerWindowId: 'fixture-window', ipc: {send: () => Promise.resolve()}},
    screen: {width: 1920, height: 1080},
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    document: {querySelector: () => null, body: {firstChild: null, insertBefore() {}},
      createElement: () => ({classList: {add() {}, remove() {}}, style: {}, addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {}})},
    XMLHttpRequest: FakeXhr
  };
  vm.runInNewContext(source, context, {filename: 'libmpv.js'});
  const playbackManager = {getSubtitleUrl: () => '', getPlayerState: () => ({volume: 50}), getCurrentItem: () => ({}),
    getPlayerSettings: () => ({}), addEventListener() {}, removeEventListener() {}};
  const pluginManager = {registerPlugin: (instance, id) => { instance.id = id; }, mapPath: (instance, file) => file};
  const events = {on() {}, off() {}, trigger() {}};
  const router = {showVideoOsd: async () => {}, show: async () => {}, setTransparency() {}};
  const userSettings = {get: () => null, getSubtitleAppearanceSettings: () => ({})};
  const modules = [
    {}, playbackManager, pluginManager, events, router, appSettings, userSettings, (names, callback) => callback(), {},
    {isStrm: () => !!resolverError, resolveAsync: async request => { if (resolverError) throw resolverError; return {type: 'native', source: request.nativeSource}; }},
    {}, {}, {}, {},
    {create: async () => { if (createError) throw createError; return {mode: 'native-helper', endpoint}; }}
  ];
  modules[13] = {install() {}, createNative: () => ({playbackStarted() {}, playbackReady() {}, playbackFailed() {},
    loadingToken: () => null, install() {}, admit: () => true, cancel() {}, isActive: () => false, beforeTeardown: async () => null})};
  const Player = factory(...modules);
  return {instance: new Player(), settings, clock, endpoint, refreshRequests, pendingXhrs, allXhrs};
}

function options(id = 1, extra = {}) {
  return {item: {MediaType: 'Video', Type: 'Movie', Path: `fixture-${id}.mkv`}, mediaType: 'Video',
    mediaSource: {Path: `fixture-${id}.mkv`, RunTimeTicks: 10000000, MediaStreams: []},
    url: `fixture-${id}.mkv`, playMethod: 'DirectPlay', _etePlayRequestId: id, ...extra};
}

async function drainMicrotasks() { for (let i = 0; i < 16; i++) await Promise.resolve(); }
async function runFps(h, fps) {
  const pending = h.instance._onEstimatedVfFpsChanged(fps);
  await drainMicrotasks();
  h.clock.advance(3000);
  await pending;
}
function loadfiles(harness) { return harness.endpoint.commands.filter(command => Array.isArray(command) && command[0] === 'loadfile'); }
function changes(harness) { return harness.refreshRequests.filter(url => url.startsWith('electronrefreshrate://change?')); }
async function settlesWithin(promise, milliseconds = 20) {
  let settled = false;
  promise.then(() => { settled = true; }, () => { settled = true; });
  for (let i = 0; i < milliseconds && !settled; i++) await new Promise(resolve => global.setTimeout(resolve, 0));
  return settled;
}
async function captureUnhandled(run) {
  const reasons = [];
  const listener = reason => reasons.push(reason);
  process.on('unhandledRejection', listener);
  try {
    await run(reasons);
    await new Promise(resolve => global.setImmediate(resolve));
    return reasons;
  } finally {
    process.off('unhandledRejection', listener);
  }
}

async function qualifiedPlayer(config) {
  const h = loadPlayer(config);
  await h.instance.play(options());
  assert.equal(h.refreshRequests.filter(url => url === 'electronrefreshrate://list_possible').length, 1,
    'actual AMD Play completed its display-rate list probe');
  assert.equal(h.refreshRequests.filter(url => url === 'electronrefreshrate://current').length, 1,
    'actual AMD Play completed its current-rate probe');
  return h;
}

function videoStats(result) {
  return result.categories.find(category => category.type === 'video');
}

boundedTest('same-turn FPS callbacks share one drain promise and collapse to one change', async () => {
  const h = await qualifiedPlayer();
  const first = h.instance._onEstimatedVfFpsChanged(24);
  const second = h.instance._onEstimatedVfFpsChanged(24);
  assert.strictEqual(second, first, 'callbacks for this adapter request share one promise');
  await drainMicrotasks();
  assert.deepEqual(changes(h), ['electronrefreshrate://change?rate=120']);
  assert.equal(h.allXhrs.filter(xhr => !xhr.settled).length, 0, 'immediate fake endpoint completed the sole request');
  h.clock.advance(3000);
  await first;
  assert.deepEqual(h.endpoint.pauseWrites.slice(-2), [true, false]);
});

boundedTest('latest same-turn FPS target equal to current rate makes no write', async () => {
  const h = await qualifiedPlayer();
  h.settings.set('mpv-displaysync_override', '');
  const initialUnpauseCount = h.endpoint.pauseWrites.filter(value => value === false).length;
  const pending = h.instance._onEstimatedVfFpsChanged(24);
  h.instance._onEstimatedVfFpsChanged(30);
  await drainMicrotasks();
  h.clock.advance(3000);
  h.clock.advance(3000);
  await pending;
  assert.deepEqual(changes(h), [], 'latest FPS maps to the already-current 60 Hz rate');
  assert.deepEqual(h.endpoint.pauseWrites, Array(initialUnpauseCount).fill(false), 'no display write means no additional pause cycle');
});

boundedTest('in-flight change keeps one XHR, then applies only the latest pending target with a fresh 3000ms wait', async () => {
  const h = await qualifiedPlayer({plans: {
    'electronrefreshrate://list_possible': [{response: '60;120'}],
    'electronrefreshrate://change?rate=120': [{pending: true}]
  }});
  h.settings.set('mpv-displaysync_override', '60;144');
  const work = h.instance._onEstimatedVfFpsChanged(24);
  await drainMicrotasks();
  const firstXhr = h.pendingXhrs[0];
  assert.ok(firstXhr, 'the first change reached XMLHttpRequest.send');
  h.instance._onEstimatedVfFpsChanged(24);
  h.instance._onEstimatedVfFpsChanged(30);
  assert.equal(h.allXhrs.filter(xhr => xhr.url.startsWith('electronrefreshrate://change?')).length, 1,
    'same/new FPS callbacks only replace pendingFps while the first XHR is active');
  assert.equal(h.allXhrs.filter(xhr => !xhr.settled).length, 1, 'at most one display XHR is in flight');

  firstXhr.response = 'Refresh rate 120';
  firstXhr.settled = true;
  firstXhr.savedHandlers.onload.call(firstXhr);
  await drainMicrotasks();
  assert.deepEqual(changes(h), ['electronrefreshrate://change?rate=120'], 'latest target is not sent before first stabilization');
  assert.ok(h.clock.pendingDelays().includes(3000), 'first successful change retains its 3000ms stabilization');
  h.clock.advance(3000);
  await drainMicrotasks();
  assert.deepEqual(changes(h), ['electronrefreshrate://change?rate=120', 'electronrefreshrate://change?rate=60'],
    'the last pending FPS wins after the first success; refresh=' + JSON.stringify(h.refreshRequests) +
      ' timers=' + JSON.stringify(h.clock.pendingDelays()));
  const secondXhr = h.allXhrs.filter(xhr => xhr.url.startsWith('electronrefreshrate://change?'))[1];
  secondXhr.response = 'Refresh rate 60';
  secondXhr.settled = true;
  secondXhr.savedHandlers.onload.call(secondXhr);
  await drainMicrotasks();
  assert.ok(h.clock.pendingDelays().includes(3000), 'second successful change gets its own 3000ms wait');
  h.clock.advance(3000);
  await work;
  assert.deepEqual(h.endpoint.pauseWrites.slice(-4), [true, false, true, false]);
});

for (const outcome of ['network error', 'empty result']) {
  boundedTest(`failed first change drops pending FPS, clears qualification, and unpauses: ${outcome}`, async () => {
    const h = await qualifiedPlayer({plans: {'electronrefreshrate://change?rate=120': [{pending: true}]}});
    const work = h.instance._onEstimatedVfFpsChanged(24);
    await drainMicrotasks();
    h.instance._onEstimatedVfFpsChanged(30);
    const xhr = h.pendingXhrs[0];
    if (outcome === 'network error') xhr.failLate();
    else {
      xhr.response = '';
      xhr.settled = true;
      xhr.savedHandlers.onload.call(xhr);
    }
    await drainMicrotasks();
    await work;
    assert.deepEqual(changes(h), ['electronrefreshrate://change?rate=120'], 'pending FPS is discarded on failure');
    assert.deepEqual(h.endpoint.pauseWrites.slice(-2), [true, false], 'current request is resumed after failure');
    await h.instance._onEstimatedVfFpsChanged(30);
    assert.deepEqual(changes(h), ['electronrefreshrate://change?rate=120'], 'failure clears this request display qualification');
  });
}

for (const retireBy of ['Stop', 'Next']) {
  boundedTest(`${retireBy} retires a successful FPS stabilization wait and never unpauses the new owner`, async () => {
    const h = await qualifiedPlayer({plans: {'electronrefreshrate://change?rate=120': [{pending: true}]}});
    const work = h.instance._onEstimatedVfFpsChanged(24);
    await drainMicrotasks();
    const xhr = h.pendingXhrs[0];
    xhr.respondLate();
    await drainMicrotasks();
    assert.ok(h.clock.pendingDelays().includes(3000), 'successful request owns a stabilization timer');
    const unpauseCount = h.endpoint.pauseWrites.filter(value => value === false).length;
    if (retireBy === 'Stop') await h.instance.stop(false);
    else await h.instance.play(options(2, {command: 'nextTrack'}));
    const timerClearedImmediately = !h.clock.pendingDelays().includes(3000);
    const retiredOwnerUnpauses = h.endpoint.pauseWrites.filter(value => value === false).length - unpauseCount;
    h.clock.advance(3000);
    await work;
    assert.equal(timerClearedImmediately, true, 'retirement clears the owned timer immediately');
    assert.equal(retiredOwnerUnpauses, retireBy === 'Next' ? 1 : 0,
      retireBy === 'Next' ? 'only the new Play performs its own unpause' : 'Stop does not cause an FPS-work unpause');
    h.clock.advance(3000);
    assert.equal(h.endpoint.pauseWrites.filter(value => value === false).length - unpauseCount, retiredOwnerUnpauses,
      'the retired timer cannot unpause after its owner ended');
  });
}

boundedTest('a fulfilled old XHR cannot commit its reported rate after Next invalidates the request', async () => {
  const h = await qualifiedPlayer({plans: {
    'electronrefreshrate://change?rate=120': [{response: 'Refresh rate 144'}],
    'electronrefreshrate://current': [{}, {pending: true}]
  }});
  const initialUnpauseCount = h.endpoint.pauseWrites.filter(value => value === false).length;
  const work = h.instance._onEstimatedVfFpsChanged(24);
  await Promise.resolve();
  assert.deepEqual(changes(h), ['electronrefreshrate://change?rate=120'], 'old change has already been sent and fulfilled');
  const next = h.instance.play(options(2, {command: 'nextTrack'}));
  await drainMicrotasks();
  assert.equal(h.pendingXhrs.at(-1).url, 'electronrefreshrate://current', 'new owner is held before its current-rate response');
  const stats = videoStats(await h.instance.getStats());
  assert.ok(stats, 'stats returns the normal video category');
  assert.ok(stats.stats.some(item => item.label === '屏幕刷新率:' && item.value === '60 Hz'),
    'stale fulfilled response did not overwrite the prior current rate; got ' + JSON.stringify(stats.stats));
  assert.equal(h.endpoint.pauseWrites.filter(value => value === false).length, initialUnpauseCount,
    'old request does not unpause while new owner probe is pending');
  h.pendingXhrs.at(-1).respondLate();
  await next;
  h.clock.advance(3000);
  await work;
});

boundedTest('full AMD positive controls reach getStats, setProperties, and native loadfile', async () => {
  const h = await qualifiedPlayer();
  assert.ok(h.endpoint.properties.length > 0, 'real adapter called endpoint.setProperties during Play');
  assert.equal(h.endpoint.commands.filter(command => Array.isArray(command) && command[0] === 'loadfile').length, 1,
    'real adapter called endpoint.sendCommand with native loadfile');
  const stats = videoStats(await h.instance.getStats());
  assert.ok(stats.stats.some(item => item.label === '视频编码:' && item.value === 'h264'));
  assert.ok(stats.stats.some(item => item.label === '屏幕刷新率:' && item.value === '60 Hz'));
});
