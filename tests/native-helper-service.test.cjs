'use strict';

const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {createService, decimalWindowHandle, resolveMode, validateCommand} = require('../src/electronapp/native-helper/service');

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
  setBounds(value) { this.bounds = Object.assign({}, value); }
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
    beginGeneration() { this.currentGenerationId = ++nextGeneration; return this.currentGenerationId; }
    retireGeneration() { this.currentGenerationId = null; }
    command() {}
    setProperty() {}
    submitCommand() {}
    getProperty() { return Promise.resolve(false); }
    request() { return Promise.resolve({attached: true, width: 800, height: 450}); }
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
    logger: record => logs.push(record),
    runtimeRoot: 'C:\\fixture-runtime'
  });
  return {main, service, logs, placementExecutor};
}

async function showSurface(service) {
  const created = await service.call('create');
  const begun = await service.call('begin-generation', {label: 'visible'}, created.endpointId);
  await service.call('set-visible', {visible: true, generationId: begun.generationId}, created.endpointId);
  return {created, begun};
}

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
  placementExecutor.complete(0);
  assert.equal(logs.some(record => record.event === 'surface-z-order' && record.details.applied === true), true);
  await service.destroy();
});

test('surface placement keeps one operation in flight and latest pending reason wins', async function () {
  const ClientClass = makeClientClass();
  const {main, service, logs, placementExecutor} = makeService(ClientClass);
  await showSurface(service);
  main.emit('resize');
  main.emit('move');
  main.emit('enter-full-screen');
  assert.equal(placementExecutor.calls.length, 1);
  placementExecutor.complete(0);
  assert.equal(placementExecutor.calls.length, 2);
  placementExecutor.complete(1);
  assert.equal(placementExecutor.calls.length, 2);
  assert.equal(logs.some(record => record.event === 'surface-z-order-stale' && record.details.reason === 'renderer-visibility'), true);
  assert.equal(logs.some(record => record.event === 'surface-z-order' && record.details.reason === 'enter-full-screen'), true);
  assert.equal(logs.some(record => record.event === 'surface-z-order' && ['resize', 'move'].includes(record.details.reason)), false);
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
