'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const baseSource = fs.readFileSync(path.join(__dirname, '..', 'src/electronapp/plugins/libmpv.js'), 'utf8');
const selectedSource = process.env.ETE_N1_SOURCE_FILE
  ? fs.readFileSync(path.resolve(process.env.ETE_N1_SOURCE_FILE), 'utf8')
  : baseSource;

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

function loadPlayer({plans = {}, resolverError, createError, setPropertiesError, loadfileError, source = selectedSource, onUnpause} = {}) {
  const clock = makeClock();
  const settings = new Map([['mpv-displaysync', 'true'], ['mpv-displaysync_override', '120;144']]);
  const appSettings = {get: key => settings.get(key), set: (key, value) => settings.set(key, value)};
  let factory;
  const listeners = new Map();
  const refreshRequests = [];
  const endpoint = {style: {}, commands: [], properties: [], pauseWrites: [], signals: [],
    setProperties: async values => {
      endpoint.properties.push(values);
      if (Object.prototype.hasOwnProperty.call(values, 'pause')) {
        endpoint.pauseWrites.push(values.pause);
        if (values.pause === false && onUnpause) queueMicrotask(onUnpause);
      }
      if (setPropertiesError) throw setPropertiesError;
    },
    sendCommand: async command => {
      endpoint.commands.push(command);
      if (Array.isArray(command) && command[0] === 'loadfile') {
        if (loadfileError) throw loadfileError;
        dispatch('core-playing');
      }
    },
    addEventListener() {}, removeEventListener() {}, observeProperties: async () => {}, getProperty: async () => null,
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


test('pre-drain FPS burst is separate from an already in-flight request', {timeout: 2000}, async () => {
  const h = loadPlayer({plans: {
    'electronrefreshrate://current': [{response: '144'}],
    'electronrefreshrate://change?rate=120': [{pending: true}],
    'electronrefreshrate://change?rate=60': [{pending: true}]
  }});
  await h.instance.play(options());
  h.settings.set('mpv-displaysync_override', '60;120');
  const first = h.instance._onEstimatedVfFpsChanged(24);
  const second = h.instance._onEstimatedVfFpsChanged(60);
  await drainMicrotasks();
  assert.equal(changes(h).length, 1, 'pre-drain calls create one work item');
  assert.equal(changes(h)[0], 'electronrefreshrate://change?rate=60', 'latest pre-drain FPS selects the target');
  assert.equal(first, second, 'same-request burst shares the work promise');
  for (const xhr of h.pendingXhrs.slice()) xhr.respondLate();
  h.clock.advance(3000);
  await drainMicrotasks();
  h.clock.advance(3000);
  await Promise.all([first, second]);
});

test('in-flight updates retain only the latest FPS and preserve distinct request ownership', {timeout: 2000}, async () => {
  const h = loadPlayer({plans: {'electronrefreshrate://change?rate=120': [{pending: true}], 'electronrefreshrate://change?rate=60': [{pending: true}]}});
  await h.instance.play(options());
  h.settings.set('mpv-displaysync_override', '60;120');
  const first = h.instance._onEstimatedVfFpsChanged(24);
  await drainMicrotasks();
  assert.equal(changes(h).length, 1, 'the first target is already in flight');
  const second = h.instance._onEstimatedVfFpsChanged(60);
  const third = h.instance._onEstimatedVfFpsChanged(24);
  const fourth = h.instance._onEstimatedVfFpsChanged(60);
  assert.equal(first, second);
  assert.equal(first, third);
  assert.equal(first, fourth);
  assert.equal(changes(h).length, 1, 'pending FPS values do not start parallel requests');
  h.pendingXhrs[0].respondLate();
  await drainMicrotasks();
  h.clock.advance(2999);
  await drainMicrotasks();
  assert.equal(h.endpoint.pauseWrites.filter(value => value === false).length, 1, 'no refresh work unpauses before its 3000ms wait');
  h.clock.advance(1);
  await drainMicrotasks();
  assert.equal(changes(h).length, 2, 'latest pending target starts after the first stabilization');
  assert.equal(changes(h)[1], 'electronrefreshrate://change?rate=60');
  h.pendingXhrs[1].respondLate();
  await drainMicrotasks();
  h.clock.advance(2999);
  assert.equal(h.endpoint.pauseWrites.filter(value => value === false).length, 2, 'second target has its own full stability wait');
  h.clock.advance(1);
  await drainMicrotasks();
  await Promise.all([first, second, third, fourth]);
});

test('one successful current change waits until exactly 3000ms before unpause', {timeout: 2000}, async () => {
  const h = loadPlayer({plans: {'electronrefreshrate://change?rate=120': [{pending: true}]}});
  await h.instance.play(options());
  const unpausesBefore = h.endpoint.pauseWrites.filter(value => value === false).length;
  const changing = h.instance._onEstimatedVfFpsChanged(24);
  await drainMicrotasks();
  h.pendingXhrs[0].respondLate();
  await drainMicrotasks();
  h.clock.advance(2999);
  await drainMicrotasks();
  assert.equal(h.endpoint.pauseWrites.filter(value => value === false).length, unpausesBefore, '2999ms is below the stability boundary');
  h.clock.advance(1);
  await drainMicrotasks();
  assert.equal(h.endpoint.pauseWrites.filter(value => value === false).length, unpausesBefore + 1, '3000ms releases the current request');
  await changing;
});

test('FPS arriving from the endpoint unpause microtask is accepted before drain settlement', {timeout: 2000}, async () => {
  let armed = false;
  let followup;
  const h = loadPlayer({
    plans: {'electronrefreshrate://change?rate=120': [{pending: true}], 'electronrefreshrate://change?rate=60': [{pending: true}]},
    onUnpause: () => { if (armed && !followup) followup = h.instance._onEstimatedVfFpsChanged(60); }
  });
  await h.instance.play(options());
  armed = true;
  h.settings.set('mpv-displaysync_override', '60;120');
  const first = h.instance._onEstimatedVfFpsChanged(24);
  await drainMicrotasks();
  assert.equal(changes(h).length, 1, 'first target has reached the actual fake endpoint');
  h.pendingXhrs[0].respondLate();
  await drainMicrotasks();
  h.clock.advance(3000);
  await drainMicrotasks();
  assert.ok(followup, 'endpoint pause=false triggered a fresh FPS event');
  assert.equal(h.endpoint.pauseWrites.filter(value => value === false).length, 2,
    'one unpause belongs to initial native Play and one to successful FPS work');
  assert.equal(changes(h).length, 2, 'the new FPS target was not lost at the drain close boundary');
  assert.equal(changes(h)[1], 'electronrefreshrate://change?rate=60');
  assert.notEqual(first, followup, 'the closed drain releases ownership before its shared promise settles');
  h.pendingXhrs[1].respondLate();
  await drainMicrotasks();
  h.clock.advance(3000);
  await Promise.all([first, followup]);
});

test('Stop and Next retire a fulfilled response before its continuation commits state', {timeout: 2000}, async t => {
  for (const transition of ['Stop', 'Next']) {
    await t.test(transition, {timeout: 2000}, async () => {
      const h = loadPlayer({plans: {'electronrefreshrate://change?rate=120': [{pending: true}]}});
      await h.instance.play(options(1));
      const unpausesBefore = h.endpoint.pauseWrites.filter(value => value === false).length;
      const changing = h.instance._onEstimatedVfFpsChanged(24);
      await drainMicrotasks();
      h.pendingXhrs[0].respondLate();
      const transitionPromise = transition === 'Stop'
        ? h.instance.stop(false)
        : h.instance.play(options(2, {command: 'nextTrack'}));
      await transitionPromise;
      await drainMicrotasks();
      h.clock.advance(3000);
      await drainMicrotasks();
      await changing;
      assert.equal(h.endpoint.pauseWrites.filter(value => value === false).length, unpausesBefore + (transition === 'Next' ? 1 : 0),
        'the old FPS owner does not unpause after request retirement');
      if (transition === 'Stop') {
        await h.instance.destroy();
        assert.deepEqual(changes(h), ['electronrefreshrate://change?rate=120'],
          'the retired response did not pollute curRefreshRate and trigger restore');
      } else {
        assert.equal(loadfiles(h).length, 2, 'Next owns the second native loadfile');
        assert.equal(changes(h).filter(url => url === 'electronrefreshrate://change?rate=60').length, 0,
          'the old response does not schedule a stale target after Next');
      }
    });
  }
});

test('Stop clears its 3000ms wait and an old finally cannot retire a new request work item', {timeout: 2000}, async () => {
  const h = loadPlayer({plans: {'electronrefreshrate://change?rate=120': [{pending: true}, {pending: true}]}});
  await h.instance.play(options(1));
  const oldWork = h.instance._onEstimatedVfFpsChanged(24);
  await drainMicrotasks();
  h.pendingXhrs[0].respondLate();
  await drainMicrotasks();
  assert.ok(h.clock.pendingDelays().includes(3000), 'old work owns a live stabilization timer');
  const stopping = h.instance.stop(false);
  const newPlaying = h.instance.play(options(2, {command: 'nextTrack'}));
  await Promise.all([stopping, newPlaying]);
  const currentWork = h.instance._onEstimatedVfFpsChanged(24);
  await drainMicrotasks();
  assert.equal(h.clock.pendingDelays().includes(3000), false, 'Stop clears the retired work timer');
  await oldWork;
  assert.equal(changes(h).length, 2, 'fresh request work reaches the endpoint after retirement');
  const repeated = h.instance._onEstimatedVfFpsChanged(24);
  assert.equal(currentWork, repeated, 'old finally did not clear the new work record');
  h.pendingXhrs[1].respondLate();
  await drainMicrotasks();
  h.clock.advance(3000);
  await currentWork;
});

test('different playback requests never share an FPS promise', {timeout: 2000}, async () => {
  const h = loadPlayer({plans: {'electronrefreshrate://change?rate=120': [{pending: true}, {pending: true}]}});
  await h.instance.play(options(1));
  const oldWork = h.instance._onEstimatedVfFpsChanged(24);
  await drainMicrotasks();
  const nextPlay = h.instance.play(options(2, {command: 'nextTrack'}));
  await nextPlay;
  const newWork = h.instance._onEstimatedVfFpsChanged(24);
  assert.notEqual(oldWork, newWork, 'new Play owns an independent promise');
  await drainMicrotasks();
  assert.equal(changes(h).length, 2, 'each playback request reached its own refresh request');
  h.pendingXhrs[1].respondLate();
  await drainMicrotasks();
  h.clock.advance(3000);
  await newWork;
  await oldWork;
});
