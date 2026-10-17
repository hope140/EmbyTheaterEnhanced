'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'src/electronapp/plugins/libmpv.js'), 'utf8');

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

test('normal Play reads both display properties and continues through the native loadfile path', async () => {
  const h = loadPlayer({plans: {'electronrefreshrate://list_possible': [{response: ''}], 'electronrefreshrate://current': [{response: ''}]}});
  h.settings.set('mpv-displaysync', 'false');
  await h.instance.play(options());
  assert.deepEqual(h.refreshRequests, ['electronrefreshrate://list_possible', 'electronrefreshrate://current']);
  assert.equal(loadfiles(h).length, 1, 'actual endpoint received native loadfile');
  assert.ok(h.endpoint.properties.length > 0, 'actual endpoint received playback properties');
  await runFps(h, 24);
  assert.deepEqual(changes(h), [], 'disabled display sync does not change the system refresh rate');
});

test('list and current share an 8000ms absolute budget, and late current response cannot enable FPS changes', async () => {
  const h = loadPlayer({plans: {
    'electronrefreshrate://list_possible': [{advanceBeforeResponse: 5000}],
    'electronrefreshrate://current': [{pending: true}]
  }});
  const playing = h.instance.play(options());
  await drainMicrotasks();
  assert.equal(h.pendingXhrs.length, 1);
  assert.equal(h.pendingXhrs[0].url, 'electronrefreshrate://current');
  assert.ok(h.clock.pendingDelays().includes(3000), 'second step receives only the remaining 3000ms');
  h.clock.advance(2999);
  await drainMicrotasks();
  assert.equal(loadfiles(h).length, 0, 'play remains in display probe until the shared deadline');
  h.clock.advance(1);
  await playing;
  assert.equal(h.clock.now, 8000, 'both sequential reads share one 8000ms ceiling');
  assert.equal(loadfiles(h).length, 1, 'probe timeout falls through to native playback');
  h.pendingXhrs[0].respondLate();
  await runFps(h, 24);
  assert.deepEqual(changes(h), [], 'late response cannot qualify this request for an FPS change');
});

for (const [step, url] of [['list', 'electronrefreshrate://list_possible'], ['current', 'electronrefreshrate://current']]) {
  for (const failure of ['error', 'timeout']) {
    test(`${step} ${failure} degrades to native loadfile without a refresh change`, async () => {
      const plans = {[url]: [{[failure]: true}]};
      if (step === 'current') plans['electronrefreshrate://list_possible'] = [{}];
      const h = loadPlayer({plans});
      await h.instance.play(options());
      await runFps(h, 24);
      assert.equal(loadfiles(h).length, 1, 'display probe failure does not block native loadfile');
      assert.deepEqual(changes(h), [], 'incomplete display probe never authorizes a refresh change');
    });
  }
}

test('expired shared budget skips sending the current-display request', async () => {
  const h = loadPlayer({plans: {'electronrefreshrate://list_possible': [{advanceBeforeResponse: 8000}]}});
  await h.instance.play(options());
  assert.deepEqual(h.refreshRequests, ['electronrefreshrate://list_possible'], 'expired second step is not sent');
  assert.equal(loadfiles(h).length, 1, 'expired probe still continues native playback');
});

test('Stop aborts a pending display probe and the superseded Play never loadfiles', async () => {
  const h = loadPlayer({plans: {'electronrefreshrate://list_possible': [{pending: true}]}});
  const oldPlay = h.instance.play(options());
  await drainMicrotasks();
  const stopped = h.instance.stop(false);
  const settledOnAbort = await settlesWithin(oldPlay);
  const rejected = assert.rejects(oldPlay, error => error && error.playbackSuperseded === true);
  await stopped;
  assert.equal(h.pendingXhrs[0].abortCount, 1, 'Stop aborts the probe XHR');
  h.pendingXhrs[0].respondLate();
  await rejected;
  assert.equal(settledOnAbort, true, 'Stop abort settles the active probe without waiting for its response');
  assert.equal(loadfiles(h).length, 0, 'old request cannot reach Native loadfile after Stop');
});

test('Next aborts the previous probe while the newer Play reaches native loadfile', async () => {
  const h = loadPlayer({plans: {'electronrefreshrate://list_possible': [{pending: true}, {}]}});
  const oldPlay = h.instance.play(options(1));
  await drainMicrotasks();
  const oldRejected = assert.rejects(oldPlay, error => error && error.playbackSuperseded === true);
  await h.instance.play(options(2, {command: 'nextTrack'}));
  const settledOnNext = await settlesWithin(oldPlay);
  h.pendingXhrs[0].failLate();
  await oldRejected;
  assert.equal(h.pendingXhrs[0].abortCount, 1, 'Next aborts the previous probe XHR');
  assert.equal(settledOnNext, true, 'Next abort settles the retired probe without waiting for its response');
  assert.equal(loadfiles(h).length, 1, 'only one request reaches native loadfile');
  assert.equal(loadfiles(h)[0][1], 'fixture-2.mkv', 'only Next owner reaches native loadfile');
  await runFps(h, 24);
  assert.ok(changes(h).length > 0, 'older aborted probe did not erase the current owner qualification');
});

test('FPS change timeout unpauses its still-current request and disables further changes without an unhandled rejection', async () => {
  const h = loadPlayer({plans: {'electronrefreshrate://change?rate=120': [{pending: true}]}});
  await h.instance.play(options());
  const unhandled = await captureUnhandled(async () => {
    const changing = h.instance._onEstimatedVfFpsChanged(24);
    await drainMicrotasks();
    assert.deepEqual(h.endpoint.pauseWrites.slice(-1), [true], 'FPS change pauses through the actual endpoint');
    const changeXhr = h.allXhrs.find(xhr => xhr.url === 'electronrefreshrate://change?rate=120');
    assert.ok(changeXhr, 'FPS change request was sent');
    h.clock.advance(8000);
    await changing;
    assert.deepEqual(h.endpoint.pauseWrites.slice(-2), [true, false], 'current owner resumes itself after change timeout');
    const changeCount = changes(h).length;
    await h.instance._onEstimatedVfFpsChanged(24);
    assert.equal(changes(h).length, changeCount, 'failed current request loses qualification for later FPS changes');
  });
  assert.equal(unhandled.length, 0, 'timed out change rejection is handled');
});

test('Next aborts a pending FPS change without letting the old owner unpause the new playback', async () => {
  const h = loadPlayer({plans: {'electronrefreshrate://change?rate=120': [{pending: true}]}});
  await h.instance.play(options(1));
  const changing = h.instance._onEstimatedVfFpsChanged(24);
  await drainMicrotasks();
  const oldChange = h.allXhrs.find(xhr => xhr.url === 'electronrefreshrate://change?rate=120');
  assert.ok(oldChange);
  assert.deepEqual(h.endpoint.pauseWrites.slice(-1), [true], 'old owner paused before its refresh request');
  const falseCountBeforeNext = h.endpoint.pauseWrites.filter(value => value === false).length;
  await h.instance.play(options(2, {command: 'nextTrack'}));
  await changing;
  assert.equal(h.endpoint.pauseWrites.filter(value => value === false).length, falseCountBeforeNext + 1,
    'new native Play supplies its own pause=false positive control');
  assert.equal(oldChange.abortCount, 1, 'Next aborts the in-flight refresh request');
  oldChange.failLate();
  await drainMicrotasks();
  assert.equal(h.endpoint.pauseWrites.filter(value => value === false).length, falseCountBeforeNext + 1,
    'late old failure cannot add an unpause to the new owner');
  assert.equal(h.endpoint.pauseWrites.at(-1), false, 'new playback remains unpaused by its own load path');
});

for (const failure of ['network error', 'timeout']) {
  test(`destroy restoration ${failure} is caught without claiming completion or awaiting it`, async () => {
    const h = loadPlayer({plans: {'electronrefreshrate://change?rate=60': [{pending: true}]}});
    await h.instance.play(options());
    await runFps(h, 24);
    assert.ok(changes(h).includes('electronrefreshrate://change?rate=120'), 'positive control changed the synthetic display rate: ' + JSON.stringify(h.refreshRequests));
    let restoreXhr;
    const unhandled = await captureUnhandled(async () => {
      await h.instance.destroy();
      restoreXhr = h.allXhrs.find(xhr => xhr.url === 'electronrefreshrate://change?rate=60');
      assert.ok(restoreXhr, 'destroy requested the original synthetic rate');
      assert.equal(restoreXhr.settled, false, 'destroy returned while restoration request remained pending');
      if (failure === 'network error') restoreXhr.failLate();
      else h.clock.advance(8000);
    });
    assert.equal(restoreXhr.settled, true, 'the synthetic restoration request later failed');
    if (failure === 'timeout') assert.equal(restoreXhr.abortCount, 1, 'restore timeout aborts its local XHR');
    assert.equal(unhandled.length, 0, 'fire-and-forget restoration failure has a rejection handler');
  });
}

for (const response of ['', '0', 'synthetic unavailable']) {
  test('an unavailable FPS change result clears qualification and resumes the current owner: ' + (response || 'empty'), async () => {
    const h = loadPlayer({plans: {'electronrefreshrate://change?rate=120': [{response}]}});
    await h.instance.play(options());
    const changing = h.instance._onEstimatedVfFpsChanged(24);
    await drainMicrotasks();
    assert.deepEqual(h.endpoint.pauseWrites.slice(-2), [true, false], 'no confirmed display change can hold the current request paused');
    await changing;
    assert.equal(h.clock.pendingDelays().includes(3000), false, 'unavailable result is not a successful stabilization');
    const count = changes(h).length;
    await h.instance._onEstimatedVfFpsChanged(24);
    assert.equal(changes(h).length, count, 'unavailable result disables this request automatic changes');
  });
}

test('an unknown current rate after a later probe failure cannot trigger a blind restore', async () => {
  const h = loadPlayer({plans: {'electronrefreshrate://current': [{response: '60'}, {error: true}]}});
  await h.instance.play(options(1));
  await runFps(h, 24);
  assert.deepEqual(changes(h), ['electronrefreshrate://change?rate=120']);
  await h.instance.play(options(2));
  assert.equal(loadfiles(h).length, 2, 'failed optional probe still continues the current native Play');
  await h.instance.destroy();
  assert.deepEqual(changes(h), ['electronrefreshrate://change?rate=120'], 'unknown state is not evidence for a restore write');
});

test('a failed FPS change leaves no known rate from which destroy may infer a restore', async () => {
  const h = loadPlayer({plans: {'electronrefreshrate://change?rate=120': [{error: true}]}});
  await h.instance.play(options());
  await h.instance._onEstimatedVfFpsChanged(24);
  assert.deepEqual(h.endpoint.pauseWrites.slice(-2), [true, false]);
  await h.instance.destroy();
  assert.deepEqual(changes(h), ['electronrefreshrate://change?rate=120'], 'failed change is not a confirmed new display state');
});

test('resolver, Native creation, properties, and loadfile errors still reject Play', async t => {
  for (const [stage, config] of [
    ['resolver superseded', {resolverError: Object.assign(new Error('resolver superseded'), {playbackSuperseded: true})}],
    ['native-create', {createError: new Error('native create failure')}],
    ['setProperties', {setPropertiesError: new Error('native properties failure')}],
    ['loadfile', {loadfileError: new Error('native loadfile failure')}]
  ]) {
    await t.test(stage, async () => {
      const h = loadPlayer(config);
      const playOptions = stage === 'resolver superseded' ? options(1, {
        item: {MediaType: 'Video', Type: 'Movie', Path: 'fixture.strm'},
        mediaSource: {Path: 'fixture.strm', RunTimeTicks: 10000000, MediaStreams: []}, url: 'fixture.strm'
      }) : options();
      if (stage === 'resolver superseded') {
        await assert.rejects(h.instance.play(playOptions), error => error && error.playbackSuperseded === true);
      } else {
        await assert.rejects(h.instance.play(playOptions), new RegExp(stage === 'native-create' ? 'native create failure' : stage === 'setProperties' ? 'native properties failure' : 'native loadfile failure'));
      }
    });
  }
});
