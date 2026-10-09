'use strict';

const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {CALL_CHANNEL, createService, decimalWindowHandle, NOTIFY_CHANNEL, register, resolveMode, validateCommand} = require('../src/electronapp/native-helper/service');

test('native-helper is the only accepted production mode', function () {
  assert.equal(resolveMode(undefined), 'native-helper');
  assert.equal(resolveMode('native-helper'), 'native-helper');
  assert.throws(() => resolveMode('pepper'), /legacy-mode-removed/);
  assert.throws(() => resolveMode('unknown'), /unsupported-bridge-mode/);
});

test('command allowlist preserves supported playback shapes', function () {
  assert.deepEqual(validateCommand('stop'), ['stop']);
  assert.deepEqual(validateCommand(['seek', '12', 'absolute', 'exact']), ['seek', '12', 'absolute', 'exact']);
  assert.deepEqual(validateCommand(['loadfile', 'https://example.invalid/video', 'replace', '-1', 'user-agent=Safe UA/1.0']),
    ['loadfile', 'https://example.invalid/video', 'replace', '-1', 'user-agent=Safe UA/1.0']);
  assert.deepEqual(validateCommand(['sub-add', 'https://example.invalid/subtitle', 'cached', 'English', 'eng']),
    ['sub-add', 'https://example.invalid/subtitle', 'cached', 'English', 'eng']);
  assert.deepEqual(validateCommand(['sub-add', 'https://example.invalid/subtitle', 'cached', '', '']),
    ['sub-add', 'https://example.invalid/subtitle', 'cached', '', '']);
});

test('command allowlist rejects global headers, unsafe UA and arbitrary commands', function () {
  assert.throws(() => validateCommand(['set', 'http-header-fields', 'Authorization: secret']), /command-not-allowed/);
  assert.throws(() => validateCommand(['loadfile', 'https://example.invalid/video', 'replace', '-1', 'user-agent=bad,header']), /loadfile-options-invalid/);
  assert.throws(() => validateCommand(['loadfile', 'https://example.invalid/video', 'replace', '-1', 'http-header-fields=X: y']), /loadfile-options-invalid/);
  assert.throws(() => validateCommand(['run', 'cmd.exe']), /command-not-allowed/);
});

test('native window handle stays an exact decimal string', function () {
  const value = 9007199254740993n;
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);
  assert.equal(decimalWindowHandle({getNativeWindowHandle: () => bytes}), value.toString(10));
});

test('native placement CLI exits before media transport and uses non-activating relative z-order', function () {
  const source = fs.readFileSync(path.join(__dirname, '..', 'native', 'mpv-helper', 'ete-mpv-helper.cpp'), 'utf8');
  const placementFunction = source.slice(source.indexOf('int placeWindowBehind('), source.indexOf('uint64_t monotonicMicros()'));
  const placementDispatch = source.indexOf('std::wcscmp(argv[1], L"--place-window-behind")');
  const transportInitialization = source.indexOf('HANDLE input = GetStdHandle');
  assert.ok(placementDispatch > 0 && placementDispatch < transportInitialization);
  assert.match(placementFunction, /SetWindowPos\(surface, mainWindow/);
  for (const flag of ['SWP_NOMOVE', 'SWP_NOSIZE', 'SWP_NOACTIVATE', 'SWP_NOOWNERZORDER', 'SWP_SHOWWINDOW']) {
    assert.match(placementFunction, new RegExp(flag));
  }
  assert.doesNotMatch(placementFunction, /LoadLibrary|mpv_|WriterQueue|InputReader|STD_INPUT_HANDLE|STD_OUTPUT_HANDLE/);
});

let nextWindowHandle = 40n;

class FakeWindow extends EventEmitter {
  constructor(options) {
    super();
    this.options = options || {};
    this.destroyed = false; this.visible = false; this.minimized = false;
    this.bounds = {x: 10, y: 10, width: 800, height: 450};
    this.handle = ++nextWindowHandle;
    this.moveTopCalls = 0;
    this.alwaysOnTopCalls = [];
    this.parentWindowCalls = [];
    this.sent = [];
    this.webContents = {isDestroyed: () => false, send: (...args) => this.sent.push(args)};
    FakeWindow.instances.push(this);
  }
  getBounds() { return Object.assign({}, this.bounds); }
  setBounds(value, animate) {
    this.bounds = Object.assign({}, value);
    if (!this.setBoundsCalls) this.setBoundsCalls = [];
    this.setBoundsCalls.push({value: Object.assign({}, value), animate});
  }
  getNativeWindowHandle() { const value = Buffer.alloc(8); value.writeBigUInt64LE(this.handle); return value; }
  isDestroyed() { return this.destroyed; }
  isVisible() { return this.visible; }
  isMinimized() { return this.minimized; }
  setMenu() {}
  loadURL() { return Promise.resolve(); }
  showInactive() { this.visible = true; }
  hide() { this.visible = false; }
  moveTop() { this.moveTopCalls++; }
  setAlwaysOnTop(value) { this.alwaysOnTopCalls.push(value); }
  setParentWindow(value) { this.parentWindowCalls.push(value); }
  destroy() { if (this.destroyed) return; this.destroyed = true; this.emit('closed'); }
}
FakeWindow.instances = [];

function makeClientClass(options) {
  const settings = options || {};
  const clients = [];
  let nextGeneration = 0;
  class FakeClient {
    constructor(clientOptions) {
      this.options = clientOptions || {};
      this.handshake = {helperVersion: 'fake', libmpvVersion: 'fake-mpv'};
      this.currentGenerationId = null;
      this.transportTerminated = false;
      this.exited = false;
      this.killed = false;
      clients.push(this);
    }
    start() {
      if (!settings.deferredStart) return Promise.resolve(this);
      return new Promise((resolve, reject) => { this.resolveStart = resolve; this.rejectStart = reject; });
    }
    beginGeneration(label) {
      this.currentGenerationId = ++nextGeneration;
      if (typeof this.options.onDiagnostic === 'function') {
        this.options.onDiagnostic({name: 'generation-begin', generationId: this.currentGenerationId,
          disposition: 'BEGIN_GENERATION', currentGenerationId: this.currentGenerationId, label});
      }
      return this.currentGenerationId;
    }
    allocateGenerationId() { return ++nextGeneration; }
    retireGeneration(reason) {
      const generationId = this.currentGenerationId;
      if (generationId === null) return;
      this.currentGenerationId = null;
      if (typeof this.options.onDiagnostic === 'function') {
        this.options.onDiagnostic({name: 'generation-retired', generationId, disposition: 'RETIRE_GENERATION',
          currentGenerationId: null, reason});
      }
    }
    command() {}
    setProperty() {}
    submitCommand() {}
    getProperty() { return Promise.resolve(false); }
    request(method, params, requestOptions) {
      if (typeof settings.requestHandler === 'function') return settings.requestHandler(method, params, requestOptions, this);
      return Promise.resolve({attached: true, width: 800, height: 450});
    }
    load() {
      const promise = settings.loadFails ? Promise.reject(Object.assign(new Error('media-load-failed'), {state: 'FAILED'})) : Promise.resolve({commandAccepted: true});
      promise.catch(() => {});
      return {generationId: this.currentGenerationId, promise};
    }
    stop() { this.currentGenerationId = null; return Promise.resolve(); }
    kill() {
      this.killed = true; this.exited = true;
      if (this.rejectStart) this.rejectStart(new Error('killed-during-start'));
      return Promise.resolve({code: 0});
    }
    crash() {
      this.transportTerminated = true; this.exited = true;
      if (typeof this.options.onTerminal === 'function') this.options.onTerminal({name: 'process-exit-terminal'});
    }
  }
  FakeClient.clients = clients;
  return FakeClient;
}

function makePlacementExecutor() {
  const calls = [];
  function execFile(file, args, options, callback) {
    const call = {file, args, options, callback, killed: false};
    calls.push(call);
    return {kill() { call.killed = true; }};
  }
  execFile.calls = calls;
  execFile.complete = function (index, error) {
    const call = calls[index];
    assert.ok(call, 'placement call must exist');
    call.callback(error || null, '', '');
  };
  return execFile;
}

function makeService(ClientClass, options) {
  const settings = options || {};
  nextWindowHandle = 40n;
  FakeWindow.instances = [];
  const main = new FakeWindow(); main.visible = true;
  const logs = [];
  const placementExecutor = settings.execFile || makePlacementExecutor();
  const service = createService({
    electron: {BrowserWindow: FakeWindow},
    NativeHelperClient: ClientClass,
    fs: {existsSync: () => true},
    getMainWindow: () => main,
    getWebContents: () => main.webContents,
    execFile: placementExecutor,
    logger: typeof settings.logger === 'function' ? settings.logger : record => logs.push(record),
    runtimeRoot: 'C:\\fixture-runtime'
  });
  return {main, service, logs, placementExecutor};
}

function makeIpcMain() {
  const handlers = new Map();
  const listeners = new Map();
  return {
    handlers,
    listeners,
    handle(name, listener) { handlers.set(name, listener); },
    on(name, listener) {
      const values = listeners.get(name) || [];
      values.push(listener);
      listeners.set(name, values);
    },
    removeHandler(name) { handlers.delete(name); },
    removeListener(name, listener) {
      const values = listeners.get(name) || [];
      listeners.set(name, values.filter(value => value !== listener));
    },
    listenerCount(name) { return (listeners.get(name) || []).length; }
  };
}

async function showSurface(service) {
  const created = await service.call('create');
  const begun = await service.call('begin-generation', {label: 'visible'}, created.endpointId);
  await service.call('set-visible', {visible: true, generationId: begun.generationId}, created.endpointId);
  return {created, begun};
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}

test('destroy shares one pending Promise, rejects new create work, and cleans the surface once', async function () {
  const ClientClass = makeClientClass();
  const {service} = makeService(ClientClass);
  await service.call('create');
  const active = ClientClass.clients[0];
  const kill = deferred();
  let killCalls = 0;
  active.kill = function () { killCalls += 1; return kill.promise; };
  const surface = FakeWindow.instances[1];
  let surfaceDestroyCalls = 0;
  const originalSurfaceDestroy = surface.destroy.bind(surface);
  surface.destroy = function () { surfaceDestroyCalls += 1; return originalSurfaceDestroy(); };

  const first = service.destroy();
  const second = service.destroy();
  assert.strictEqual(first, second, 'concurrent destroy calls must share one Promise');
  await Promise.resolve();
  assert.equal(killCalls, 1, 'native kill must start once');
  await assert.rejects(service.call('create'), /native-helper-service-destroyed/);
  const beforeKill = await Promise.race([
    first.then(() => true, () => true),
    new Promise(resolve => setImmediate(() => resolve(false)))
  ]);
  assert.equal(beforeKill, false, 'destroy must remain pending until native kill completes');

  kill.resolve({code: 0});
  await first;
  assert.equal(surfaceDestroyCalls, 1, 'surface cleanup must run once');
  assert.strictEqual(service.destroy(), first, 'completed destroy must retain the same Promise');
  assert.equal(killCalls, 1);
  await assert.rejects(service.call('create'), /native-helper-service-destroyed/);
});

test('closed-triggered destroy gates register unregister on the first native kill', async function () {
  const ClientClass = makeClientClass();
  const {main, service} = makeService(ClientClass);
  await service.call('create');
  const active = ClientClass.clients[0];
  const kill = deferred();
  let killCalls = 0;
  active.kill = function () { killCalls += 1; return kill.promise; };
  const surface = FakeWindow.instances[1];
  let surfaceDestroyCalls = 0;
  const originalSurfaceDestroy = surface.destroy.bind(surface);
  surface.destroy = function () { surfaceDestroyCalls += 1; return originalSurfaceDestroy(); };
  const ipcMain = makeIpcMain();
  const unregister = register({ipcMain, service, getWebContents: () => main.webContents});
  assert.equal(ipcMain.handlers.has(CALL_CHANNEL), true);
  assert.equal(ipcMain.listenerCount(NOTIFY_CHANNEL), 1);

  main.emit('closed');
  await new Promise(resolve => setImmediate(resolve));
  const unregisterPromise = unregister();
  const beforeKill = await Promise.race([
    unregisterPromise.then(() => true, () => true),
    new Promise(resolve => setImmediate(() => resolve(false)))
  ]);
  assert.equal(beforeKill, false, 'unregister must wait for the close-triggered native kill');
  assert.equal(killCalls, 1);

  kill.resolve({code: 0});
  await unregisterPromise;
  assert.equal(surfaceDestroyCalls, 1);
  assert.equal(ipcMain.handlers.size, 0);
  assert.equal(ipcMain.listenerCount(NOTIFY_CHANNEL), 0);
});

test('destroy failure is the same Error for concurrent and later callers without retrying cleanup', async function () {
  const ClientClass = makeClientClass();
  const {service} = makeService(ClientClass);
  await service.call('create');
  const active = ClientClass.clients[0];
  const failure = new Error('native-kill-failed');
  let killCalls = 0;
  active.kill = function () { killCalls += 1; return Promise.reject(failure); };
  const surface = FakeWindow.instances[1];
  let surfaceDestroyCalls = 0;
  const originalSurfaceDestroy = surface.destroy.bind(surface);
  surface.destroy = function () { surfaceDestroyCalls += 1; return originalSurfaceDestroy(); };

  const first = service.destroy();
  const second = service.destroy();
  first.catch(() => {});
  second.catch(() => {});
  assert.strictEqual(first, second);
  await assert.rejects(first, error => error === failure);
  await assert.rejects(second, error => error === failure);
  assert.strictEqual(service.destroy(), first, 'later destroy must preserve the failed shared Promise');
  await assert.rejects(service.destroy(), error => error === failure);
  assert.equal(killCalls, 1);
  assert.equal(surfaceDestroyCalls, 0, 'native failure preserves the existing cleanup short circuit');
});

test('renderer destroy shares its in-flight native kill with full service destroy and unregister', async function () {
  const ClientClass = makeClientClass();
  const {main, service} = makeService(ClientClass);
  const created = await service.call('create');
  const active = ClientClass.clients[0];
  const kill = deferred();
  let killCalls = 0;
  active.kill = function () { killCalls += 1; return kill.promise; };
  const surface = FakeWindow.instances[1];
  let surfaceDestroyCalls = 0;
  const originalSurfaceDestroy = surface.destroy.bind(surface);
  surface.destroy = function () { surfaceDestroyCalls += 1; return originalSurfaceDestroy(); };
  const ipcMain = makeIpcMain();
  const unregister = register({ipcMain, service, getWebContents: () => main.webContents});

  const rendererDestroy = service.call('destroy', {}, created.endpointId);
  rendererDestroy.catch(() => {});
  await Promise.resolve();
  assert.equal(killCalls, 1, 'renderer destroy must start the only native kill');
  assert.equal(service.status().state, 'stopped', 'renderer destroy detaches the client before kill completion');

  const fullDestroy = service.destroy();
  const unregisterPromise = unregister();
  const closedDestroy = new Promise(resolve => {
    main.emit('closed');
    setImmediate(resolve);
  });
  const settledBeforeKill = await Promise.race([
    Promise.all([rendererDestroy, fullDestroy, unregisterPromise]).then(() => true, () => true),
    new Promise(resolve => setImmediate(() => resolve(false)))
  ]);
  await closedDestroy;
  assert.equal(settledBeforeKill, false, 'all destroy entry points must wait for the renderer kill');
  for (const [name, promise] of [['full destroy', fullDestroy], ['unregister', unregisterPromise]]) {
    const settled = await Promise.race([
      promise.then(() => true, () => true),
      new Promise(resolve => setImmediate(() => resolve(false)))
    ]);
    assert.equal(settled, false, name + ' must remain pending until the renderer kill completes');
  }
  assert.equal(killCalls, 1, 'closed and unregister must not retry native kill');

  kill.resolve({code: 0});
  assert.deepEqual(await rendererDestroy, {status: 'ok'});
  await fullDestroy;
  await unregisterPromise;
  assert.equal(killCalls, 1);
  assert.equal(surfaceDestroyCalls, 1);
});

test('renderer destroy kill failure is shared with full service destroy and preserves the cleanup short circuit', async function () {
  const ClientClass = makeClientClass();
  const {service} = makeService(ClientClass);
  const created = await service.call('create');
  const active = ClientClass.clients[0];
  const failure = new Error('renderer-native-kill-failed');
  let killCalls = 0;
  const kill = deferred();
  active.kill = function () { killCalls += 1; return kill.promise; };
  const surface = FakeWindow.instances[1];
  let surfaceDestroyCalls = 0;
  const originalSurfaceDestroy = surface.destroy.bind(surface);
  surface.destroy = function () { surfaceDestroyCalls += 1; return originalSurfaceDestroy(); };

  const rendererDestroy = service.call('destroy', {}, created.endpointId);
  rendererDestroy.catch(() => {});
  await Promise.resolve();
  const fullDestroy = service.destroy();
  kill.reject(failure);
  fullDestroy.catch(() => {});
  await assert.rejects(rendererDestroy, error => error === failure);
  await assert.rejects(fullDestroy, error => error === failure);
  await assert.rejects(service.destroy(), error => error === failure);
  assert.equal(killCalls, 1, 'a renderer kill failure must not trigger a retry');
  assert.equal(surfaceDestroyCalls, 0, 'renderer kill failure preserves the existing cleanup short circuit');
});

async function presentationHarness() {
  const ClientClass = makeClientClass();
  const context = makeService(ClientClass);
  const {created, begun} = await showSurface(context.service);
  const active = ClientClass.clients[0];
  const requests = [];
  let nextHold = 0;
  active.request = function (method, params, options) {
    requests.push({method, params, options});
    if (method === 'presentation-prepare') return Promise.resolve({ready: true, painted: true, holdId: ++nextHold});
    if (method === 'presentation-arm') return Promise.resolve({ready: true, status: 'armed', holdId: params.holdId});
    return Promise.resolve({released: true});
  };
  function retire(generationId, requestEpoch) {
    context.service.notify('retire-generation', {generationId, requestEpoch, reason: 'fixture'}, created.endpointId);
  }
  return {...context, created, begun, active, requests, retire, surface: FakeWindow.instances[1]};
}

test('native presentation retires media before preparation and preserves only a matching temporary Stop', async () => {
  const h = await presentationHarness();
  assert.deepEqual(await h.service.call('prepare-presentation', {token: 1}, h.created.endpointId), {status: 'ok', ready: false});
  h.retire(h.begun.generationId, 1);
  assert.equal((await h.service.call('prepare-presentation', {token: 2}, h.created.endpointId)).ready, true);
  const prepare = h.requests.find(row => row.method === 'presentation-prepare');
  assert.equal(prepare.params.sourceGenerationId, h.begun.generationId);
  assert.equal(prepare.options.mediaScoped, false);
  assert.ok(prepare.options.generationId > h.begun.generationId);
  h.service.notify('set-visible', {visible: false, generationId: null}, h.created.endpointId);
  assert.equal(h.surface.visible, true, 'retired opacity notifications cannot hide a held frame');
  await h.service.call('command', {data: 'stop', generationId: null, presentationToken: 2}, h.created.endpointId);
  assert.equal(h.surface.visible, true);
  const b = await h.service.call('begin-generation', {label: 'B', presentationToken: 2, requestEpoch: 2}, h.created.endpointId);
  assert.equal(h.requests.find(row => row.method === 'presentation-arm').options.generationId, b.generationId);
  await h.service.call('command', {data: 'stop', generationId: b.generationId}, h.created.endpointId);
  assert.equal(h.surface.visible, false);
  assert.ok(h.requests.some(row => row.method === 'presentation-cancel-preparation'));
  assert.ok(h.requests.some(row => row.method === 'presentation-release' && row.params.holdId === 1));
  await h.service.destroy();
});

test('cancelled pending preparation cleans its exact control generation and late hold', async () => {
  const h = await presentationHarness();
  h.retire(h.begun.generationId, 1);
  const pending = deferred();
  const original = h.active.request;
  h.active.request = function (method, params, options) {
    if (method === 'presentation-prepare') { h.requests.push({method, params, options}); return pending.promise; }
    return original(method, params, options);
  };
  const preparing = h.service.call('prepare-presentation', {token: 1}, h.created.endpointId);
  await h.service.call('cancel-presentation', {token: 1}, h.created.endpointId);
  const control = h.requests.find(row => row.method === 'presentation-prepare').options.generationId;
  assert.ok(h.requests.some(row => row.method === 'presentation-cancel-preparation' && row.params.preparationGenerationId === control));
  pending.resolve({ready: true, painted: true, holdId: 42});
  assert.equal((await preparing).ready, false);
  assert.ok(h.requests.some(row => row.method === 'presentation-release' && row.params.holdId === 42));
  assert.equal(h.surface.visible, false);
  await h.service.destroy();
});

test('newer preparation owns the surface when an older preparation resolves or cancels late', async () => {
  const h = await presentationHarness();
  h.retire(h.begun.generationId, 1);
  const old = deferred();
  const original = h.active.request;
  let prepares = 0;
  h.active.request = function (method, params, options) {
    if (method === 'presentation-prepare' && ++prepares === 1) return old.promise;
    return original(method, params, options);
  };
  const a = h.service.call('prepare-presentation', {token: 1}, h.created.endpointId);
  assert.equal((await h.service.call('prepare-presentation', {token: 2}, h.created.endpointId)).ready, true);
  old.resolve({ready: true, painted: true, holdId: 100});
  assert.equal((await a).ready, false);
  await h.service.call('cancel-presentation', {token: 1}, h.created.endpointId);
  assert.equal(h.surface.visible, true);
  let actualStops = 0;
  const stop = h.active.stop.bind(h.active);
  h.active.stop = function () { actualStops++; return stop(); };
  assert.equal((await h.service.call('command', {data: 'stop', generationId: null, presentationToken: 1}, h.created.endpointId)).stale, true);
  assert.equal(actualStops, 0, 'an old temporary stop must not clear C or issue a new mpv stop');
  assert.equal(h.surface.visible, true);
  await h.service.call('command', {data: 'stop', generationId: null, presentationToken: 2}, h.created.endpointId);
  assert.equal(actualStops, 1);
  assert.equal(h.surface.visible, true);
  assert.equal(h.requests.some(row => row.method === 'presentation-release' && row.params.holdId === 1), false);
  const next = await h.service.call('begin-generation', {label: 'C', presentationToken: 2}, h.created.endpointId);
  assert.equal((await h.service.call('command', {data: 'stop', generationId: null, presentationToken: 1}, h.created.endpointId)).stale, true);
  assert.equal(actualStops, 1);
  assert.equal(h.active.currentGenerationId, next.generationId);
  await h.service.destroy();
});

test('retirement during native arm invalidates the pending begin and stale renderer epochs cannot retire C', async () => {
  const h = await presentationHarness();
  h.retire(h.begun.generationId, 1);
  await h.service.call('prepare-presentation', {token: 1}, h.created.endpointId);
  const arm = deferred();
  const original = h.active.request;
  h.active.request = function (method, params, options) {
    if (method === 'presentation-arm') return arm.promise;
    return original(method, params, options);
  };
  const b = h.service.call('begin-generation', {label: 'B', presentationToken: 1, requestEpoch: 2}, h.created.endpointId);
  await Promise.resolve();
  h.retire(h.begun.generationId, 3);
  assert.equal(h.active.currentGenerationId, null, 'new epoch retires main begin before its ID has reached renderer');
  const c = await h.service.call('begin-generation', {label: 'C', requestEpoch: 4}, h.created.endpointId);
  arm.resolve({armed: true});
  await assert.rejects(b, /generation-superseded/);
  assert.throws(() => h.retire(null, 2), /generation-superseded/);
  assert.equal(h.active.currentGenerationId, c.generationId);
  await assert.rejects(h.service.call('begin-generation', {label: 'stale', requestEpoch: 3}, h.created.endpointId), /generation-superseded/);
  await h.service.destroy();
});

test('same-helper stale load failure cannot hide or report an error against a newer generation', async () => {
  const h = await presentationHarness();
  const load = deferred();
  h.active.load = () => ({generationId: h.begun.generationId, promise: load.promise});
  await h.service.call('command', {data: ['loadfile', 'fixture-A'], generationId: h.begun.generationId}, h.created.endpointId);
  const next = await h.service.call('begin-generation', {label: 'C'}, h.created.endpointId);
  await h.service.call('set-visible', {visible: true, generationId: next.generationId}, h.created.endpointId);
  load.reject(Object.assign(new Error('old failure'), {state: 'FAILED'}));
  await Promise.resolve();
  assert.equal(h.surface.visible, true);
  assert.equal(h.main.sent.some(row => row[1].type === 'bridge_error'), false);
  await h.service.destroy();
});

test('surface placement passes exact HWNDs without moveTop or always-on-top pulses', async function () {
  const ClientClass = makeClientClass();
  const {main, service, logs, placementExecutor} = makeService(ClientClass);
  await showSurface(service);
  const surface = FakeWindow.instances[1];
  assert.equal(placementExecutor.calls.length, 1);
  assert.match(placementExecutor.calls[0].file, /electronapp[\\/]native-helper[\\/]ete-mpv-helper\.exe$/);
  assert.deepEqual(placementExecutor.calls[0].args, ['--place-window-behind', surface.handle.toString(), main.handle.toString()]);
  assert.deepEqual(placementExecutor.calls[0].options, {encoding: 'utf8', timeout: 2000, windowsHide: true});
  assert.equal(surface.moveTopCalls, 0);
  assert.equal(main.moveTopCalls, 0);
  assert.deepEqual(main.alwaysOnTopCalls, []);
  assert.deepEqual(main.parentWindowCalls, []);
  assert.deepEqual(surface.parentWindowCalls, []);
  assert.equal(surface.options.parent, undefined);
  assert.equal(surface.options.focusable, false);
  assert.equal(surface.options.skipTaskbar, true);
  assert.equal(surface.options.thickFrame, false);
  assert.equal(surface.options.resizable, false);
  assert.equal(surface.options.movable, false);
  placementExecutor.complete(0);
  assert.equal(logs.some(record => record.event === 'surface-z-order' && record.details.applied === true), true);
  await service.destroy();
});

test('renderer visibility places a hidden surface once and does not re-place an already visible surface', async function () {
  const ClientClass = makeClientClass();
  const {service, placementExecutor} = makeService(ClientClass);
  const {created, begun} = await showSurface(service);
  const surface = FakeWindow.instances[1];
  assert.equal(placementExecutor.calls.length, 1);
  placementExecutor.complete(0);
  const initialBounds = surface.setBoundsCalls.length;
  await service.call('set-visible', {visible: true, generationId: begun.generationId}, created.endpointId);
  assert.equal(surface.setBoundsCalls.length, initialBounds + 1);
  assert.equal(surface.setBoundsCalls.at(-1).animate, false);
  assert.equal(placementExecutor.calls.length, 1);
  await service.destroy();
});

test('renderer visibility false invalidates and hides without scheduling another placement', async function () {
  const ClientClass = makeClientClass();
  const {service, placementExecutor} = makeService(ClientClass);
  const {created, begun} = await showSurface(service);
  const surface = FakeWindow.instances[1];
  await service.call('set-visible', {visible: false, generationId: begun.generationId}, created.endpointId);
  assert.equal(surface.visible, false);
  assert.equal(placementExecutor.calls[0].killed, true);
  placementExecutor.complete(0, Object.assign(new Error('killed'), {code: 'ABORT_ERR', killed: true, signal: 'SIGTERM'}));
  assert.equal(placementExecutor.calls.length, 1);
  await service.destroy();
});

test('move burst updates bounds only and starts no placement child', async function () {
  const ClientClass = makeClientClass();
  const {main, service, placementExecutor} = makeService(ClientClass);
  await showSurface(service);
  const surface = FakeWindow.instances[1];
  placementExecutor.complete(0);
  const initialBounds = surface.setBoundsCalls.length;
  for (let index = 0; index < 12; index++) {
    main.bounds = {x: index, y: index + 1, width: 800, height: 450};
    main.emit('move');
  }
  assert.equal(surface.setBoundsCalls.length, initialBounds + 12);
  assert.equal(surface.setBoundsCalls.slice(initialBounds).every(call => call.animate === false), true);
  assert.deepEqual(surface.bounds, main.bounds);
  assert.equal(placementExecutor.calls.length, 1);
  await service.destroy();
});

test('resize burst updates bounds only and starts no placement child', async function () {
  const ClientClass = makeClientClass();
  const {main, service, placementExecutor} = makeService(ClientClass);
  await showSurface(service);
  const surface = FakeWindow.instances[1];
  placementExecutor.complete(0);
  const initialBounds = surface.setBoundsCalls.length;
  for (let index = 0; index < 12; index++) {
    main.bounds = {x: 10, y: 10, width: 800 + index, height: 450 + index};
    main.emit('resize');
  }
  assert.equal(surface.setBoundsCalls.length, initialBounds + 12);
  assert.equal(surface.setBoundsCalls.slice(initialBounds).every(call => call.animate === false), true);
  assert.deepEqual(surface.bounds, main.bounds);
  assert.equal(placementExecutor.calls.length, 1);
  await service.destroy();
});

test('approved lifecycle events reassert placement with one operation in flight and latest pending reason wins', async function () {
  const ClientClass = makeClientClass();
  const {main, service, logs, placementExecutor} = makeService(ClientClass);
  await showSurface(service);
  main.emit('focus');
  main.emit('enter-full-screen');
  assert.equal(placementExecutor.calls.length, 1);
  placementExecutor.complete(0);
  assert.equal(placementExecutor.calls.length, 2);
  placementExecutor.complete(1);
  assert.equal(placementExecutor.calls.length, 2);
  assert.equal(logs.some(record => record.event === 'surface-z-order-stale' && record.details.reason === 'renderer-visibility'), true);
  assert.equal(logs.some(record => record.event === 'surface-z-order' && record.details.reason === 'enter-full-screen'), true);
  assert.equal(logs.some(record => record.event === 'surface-z-order' && record.details.reason === 'focus'), false);
  await service.destroy();
});

test('each approved lifecycle event reasserts placement after bounds sync', async function () {
  const ClientClass = makeClientClass();
  const {main, service, placementExecutor} = makeService(ClientClass);
  await showSurface(service);
  const surface = FakeWindow.instances[1];
  placementExecutor.complete(0);
  const lifecycleEvents = ['focus', 'show', 'restore', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen'];
  for (const eventName of lifecycleEvents) {
    const beforeBounds = surface.setBoundsCalls.length;
    const beforePlacements = placementExecutor.calls.length;
    main.emit(eventName);
    assert.equal(surface.setBoundsCalls.length, beforeBounds + 1, eventName);
    assert.equal(surface.setBoundsCalls.at(-1).animate, false, eventName);
    assert.equal(placementExecutor.calls.length, beforePlacements + 1, eventName);
    placementExecutor.complete(beforePlacements);
  }
  await service.destroy();
});

test('surface placement failure is warning-only and does not affect playback service state', async function () {
  const ClientClass = makeClientClass();
  const {main, service, logs, placementExecutor} = makeService(ClientClass);
  await showSurface(service);
  const error = Object.assign(new Error('private path must not be logged'), {code: 35, killed: false, signal: null});
  placementExecutor.complete(0, error);
  assert.equal(service.status().state, 'ready');
  assert.equal(main.sent.some(args => args[1] && args[1].type === 'bridge_error'), false);
  const warning = logs.find(record => record.event === 'surface-z-order-warning');
  assert.deepEqual(warning.details.failure, {code: 35, killed: false, signal: null});
  assert.equal(JSON.stringify(warning).includes('private path'), false);
  await service.destroy();
});

test('surface placement timeout warns once, releases in-flight state, and runs latest pending request', async function () {
  const ClientClass = makeClientClass();
  const {main, service, logs, placementExecutor} = makeService(ClientClass);
  await showSurface(service);
  main.emit('focus');
  main.emit('enter-full-screen');
  const timeout = Object.assign(new Error('timed out'), {code: null, killed: true, signal: 'SIGTERM'});
  placementExecutor.complete(0, timeout);
  assert.equal(placementExecutor.calls.length, 2);
  placementExecutor.complete(1);
  const warnings = logs.filter(record => record.event === 'surface-z-order-warning');
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].details.reason, 'renderer-visibility');
  assert.equal(warnings[0].details.stale, true);
  assert.deepEqual(warnings[0].details.failure, {code: 'unknown', killed: true, signal: 'SIGTERM'});
  assert.equal(logs.some(record => record.event === 'surface-z-order' && record.details.reason === 'enter-full-screen'), true);
  assert.equal(service.status().state, 'ready');
  assert.equal(main.sent.some(args => args[1] && args[1].type === 'bridge_error'), false);
  await service.destroy();
});

test('destroy during surface placement kills the operation and ignores its callback', async function () {
  const ClientClass = makeClientClass();
  const {service, logs, placementExecutor} = makeService(ClientClass);
  await showSurface(service);
  await service.destroy();
  assert.equal(placementExecutor.calls[0].killed, true);
  placementExecutor.complete(0, Object.assign(new Error('killed'), {code: 'ABORT_ERR', killed: true, signal: 'SIGTERM'}));
  assert.equal(logs.some(record => record.event === 'surface-z-order-stale'), true);
  assert.equal(logs.some(record => record.event === 'surface-z-order'), false);
  assert.equal(placementExecutor.calls.length, 1);
});

test('minimize invalidates an in-flight show and restore schedules one fresh placement', async function () {
  const ClientClass = makeClientClass();
  const {main, service, logs, placementExecutor} = makeService(ClientClass);
  await showSurface(service);
  const surface = FakeWindow.instances[1];
  assert.equal(surface.visible, true);
  main.minimized = true;
  main.emit('minimize');
  assert.equal(surface.visible, false);
  assert.equal(placementExecutor.calls[0].killed, true);
  placementExecutor.complete(0, Object.assign(new Error('killed'), {code: 'ABORT_ERR', killed: true, signal: 'SIGTERM'}));
  assert.equal(placementExecutor.calls.length, 1);
  main.minimized = false;
  main.emit('restore');
  assert.equal(surface.visible, true);
  assert.equal(placementExecutor.calls.length, 2);
  placementExecutor.complete(1);
  assert.equal(logs.some(record => record.event === 'surface-z-order' && record.details.reason === 'restore'), true);
  await service.destroy();
});

test('surface recreate supersedes the old HWND and stale callback cannot mutate the replacement', async function () {
  const ClientClass = makeClientClass();
  const {main, service, logs, placementExecutor} = makeService(ClientClass);
  const {created} = await showSurface(service);
  const firstSurface = FakeWindow.instances[1];
  firstSurface.destroy();
  ClientClass.clients[0].crash();
  const replacementGeneration = await service.call('begin-generation', {label: 'replacement'}, created.endpointId);
  await service.call('set-visible', {visible: true, generationId: replacementGeneration.generationId}, created.endpointId);
  const secondSurface = FakeWindow.instances[2];
  assert.notEqual(secondSurface.handle, firstSurface.handle);
  assert.equal(placementExecutor.calls.length, 1);
  placementExecutor.complete(0, Object.assign(new Error('old operation'), {code: 'ABORT_ERR', killed: true, signal: 'SIGTERM'}));
  assert.equal(placementExecutor.calls.length, 2);
  assert.deepEqual(placementExecutor.calls[1].args, ['--place-window-behind', secondSurface.handle.toString(), main.handle.toString()]);
  placementExecutor.complete(1);
  assert.equal(logs.some(record => record.event === 'surface-z-order-stale'), true);
  assert.equal(logs.filter(record => record.event === 'surface-z-order').length, 1);
  assert.equal(logs.find(record => record.event === 'surface-z-order').details.reason, 'renderer-visibility');
  await service.destroy();
});

test('ordinary load failure keeps the owned helper reusable', async function () {
  const ClientClass = makeClientClass({loadFails: true});
  const {service} = makeService(ClientClass);
  const created = await service.call('create');
  const begun = await service.call('begin-generation', {label: 'A'}, created.endpointId);
  await service.call('command', {data: ['loadfile', 'missing.mp4'], generationId: begun.generationId}, created.endpointId);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ClientClass.clients.length, 1);
  assert.equal(ClientClass.clients[0].killed, false);
  assert.equal(service.status().state, 'ready');
  await service.call('begin-generation', {label: 'B'}, created.endpointId);
  assert.equal(ClientClass.clients.length, 1);
  await service.destroy();
});

test('stale endpoint cannot retire or destroy a replacement endpoint', async function () {
  const ClientClass = makeClientClass();
  const {service} = makeService(ClientClass);
  const first = await service.call('create');
  await service.call('destroy', {}, first.endpointId);
  const second = await service.call('create');
  assert.notEqual(second.endpointId, first.endpointId);
  const begun = await service.call('begin-generation', {label: 'B'}, second.endpointId);
  service.notify('retire-generation', {generationId: begun.generationId, reason: 'stale'}, first.endpointId);
  assert.equal(ClientClass.clients.at(-1).currentGenerationId, begun.generationId);
  await assert.rejects(service.call('destroy', {}, first.endpointId), /stale-endpoint/);
  assert.equal(ClientClass.clients.at(-1).killed, false);
  await service.destroy();
});

test('service destroy cancels a helper still in handshake', async function () {
  const ClientClass = makeClientClass({deferredStart: true});
  const {service} = makeService(ClientClass);
  const creating = service.call('create');
  await new Promise(resolve => setImmediate(resolve));
  await service.destroy();
  await assert.rejects(creating, /killed-during-start|service-destroyed/);
  assert.equal(ClientClass.clients.length, 1);
  assert.equal(ClientClass.clients[0].killed, true);
  assert.equal(service.status().state, 'stopped');
});

test('stale work after a crash cannot recreate or mutate the next helper', async function () {
  const ClientClass = makeClientClass();
  const {service} = makeService(ClientClass);
  const created = await service.call('create');
  const begun = await service.call('begin-generation', {label: 'A'}, created.endpointId);
  ClientClass.clients[0].crash();
  await assert.rejects(service.call('set-properties', {entries: [{name: 'pause', value: true}], generationId: begun.generationId}, created.endpointId), /native-helper-unavailable/);
  assert.equal(ClientClass.clients.length, 1);
  const replacement = await service.call('begin-generation', {label: 'B'}, created.endpointId);
  assert.equal(ClientClass.clients.length, 2);
  assert.equal(ClientClass.clients[1].currentGenerationId, replacement.generationId);
  await service.destroy();
});

for (const observerFailure of ['throw', 'reject']) {
  test(`native-helper diagnostics associate presentation lifecycle and fail open when logger ${observerFailure}s`, async function () {
    const diagnosticEvents = new Set(['generation-begin', 'generation-retired', 'presentation-prepare',
      'presentation-arm', 'presentation-clear', 'surface-hidden']);
    const records = [];
    const logger = record => {
      if (!diagnosticEvents.has(record && record.event)) return;
      records.push(record);
      if (observerFailure === 'throw') throw new Error('diagnostic-logger-failure');
      return Promise.reject(new Error('diagnostic-logger-rejection'));
    };
    const ClientClass = makeClientClass({
      requestHandler(method, params) {
        if (method === 'presentation-prepare') return Promise.resolve({ready: true, painted: true, holdId: 701});
        if (method === 'presentation-arm') return Promise.resolve({ready: true, status: 'armed', holdId: params.holdId});
        return Promise.resolve({attached: true, width: 800, height: 450});
      }
    });
    const {main, service} = makeService(ClientClass, {logger});

    const created = await service.call('create');
    const generationA = await service.call('begin-generation', {label: 'play-41-1', requestEpoch: 1}, created.endpointId);
    await service.call('set-visible', {visible: true, generationId: generationA.generationId}, created.endpointId);
    service.notify('retire-generation', {
      generationId: generationA.generationId, requestEpoch: 2, reason: 'superseded'
    }, created.endpointId);

    const prepared = await service.call('prepare-presentation', {token: 1}, created.endpointId);
    assert.deepEqual(prepared, {status: 'ok', ready: true});
    const generationB = await service.call('begin-generation', {
      label: 'play-42-2', requestEpoch: 3, presentationToken: 1
    }, created.endpointId);
    await service.call('cancel-presentation', {token: 1}, created.endpointId);

    main.minimized = true;
    main.emit('minimize');
    await Promise.resolve();

    const byEvent = name => records.filter(record => record.event === name).map(record => record.details);
    assert.deepEqual(byEvent('generation-begin').map(details => details.requestId), ['play-41-1', 'play-42-2']);
    assert.equal(byEvent('generation-retired')[0].requestId, 'play-41-1');
    assert.equal(byEvent('generation-retired')[0].reason, 'superseded');

    const prepareReady = byEvent('presentation-prepare').find(details => details.disposition === 'ready');
    assert.deepEqual({helperRun: prepareReady.helperRun, generationId: prepareReady.generationId,
      sourceGenerationId: prepareReady.sourceGenerationId, transitionId: prepareReady.transitionId,
      disposition: prepareReady.disposition, association: prepareReady.association}, {
      helperRun: 1, generationId: generationA.generationId, sourceGenerationId: generationA.generationId,
      transitionId: 1, disposition: 'ready', association: 'available'
    });
    const armReady = byEvent('presentation-arm')[0];
    assert.deepEqual({helperRun: armReady.helperRun, generationId: armReady.generationId,
      currentGenerationId: armReady.currentGenerationId, sourceGenerationId: armReady.sourceGenerationId,
      transitionId: armReady.transitionId, requestId: armReady.requestId, disposition: armReady.disposition}, {
      helperRun: 1, generationId: generationB.generationId, currentGenerationId: generationB.generationId,
      sourceGenerationId: generationA.generationId, transitionId: 1, requestId: 'play-42-2', disposition: 'ready'
    });
    const cleared = byEvent('presentation-clear')[0];
    assert.equal(cleared.transitionId, 1);
    assert.equal(cleared.generationId, generationB.generationId);
    assert.equal(cleared.requestId, 'play-42-2');
    assert.equal(cleared.disposition, 'cleared');
    const hidden = byEvent('surface-hidden')[0];
    assert.deepEqual({helperRun: hidden.helperRun, generationId: hidden.generationId,
      requestId: hidden.requestId, visible: hidden.visible, reason: hidden.reason,
      disposition: hidden.disposition}, {
      helperRun: 1, generationId: generationB.generationId, requestId: 'play-42-2',
      visible: false, reason: 'minimize', disposition: 'hidden'
    });
    assert.ok(records.length <= 120);
    assert.equal(JSON.stringify(records).includes('token'), false);
    assert.equal(JSON.stringify(records).includes('C:\\private'), false);
    assert.equal(service.status().state, 'ready');
    assert.equal(service.status().surfaceVisible, false);
    await service.destroy();
  });
}
