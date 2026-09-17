'use strict';

const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
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

class FakeWindow extends EventEmitter {
  constructor() {
    super();
    this.destroyed = false; this.visible = false; this.minimized = false;
    this.bounds = {x: 10, y: 10, width: 800, height: 450};
    this.webContents = {isDestroyed: () => false, send() {}};
  }
  getBounds() { return Object.assign({}, this.bounds); }
  setBounds(value) { this.bounds = Object.assign({}, value); }
  getNativeWindowHandle() { const value = Buffer.alloc(8); value.writeBigUInt64LE(42n); return value; }
  isDestroyed() { return this.destroyed; }
  isVisible() { return this.visible; }
  isMinimized() { return this.minimized; }
  setMenu() {}
  loadURL() { return Promise.resolve(); }
  showInactive() { this.visible = true; }
  hide() { this.visible = false; }
  moveTop() {}
  setAlwaysOnTop() {}
  destroy() { if (this.destroyed) return; this.destroyed = true; this.emit('closed'); }
}

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

function makeService(ClientClass) {
  const main = new FakeWindow(); main.visible = true;
  const service = createService({
    electron: {BrowserWindow: FakeWindow},
    NativeHelperClient: ClientClass,
    fs: {existsSync: () => true},
    getMainWindow: () => main,
    getWebContents: () => main.webContents,
    runtimeRoot: 'C:\\fixture-runtime'
  });
  return {main, service};
}

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
