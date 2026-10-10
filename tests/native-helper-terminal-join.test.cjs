'use strict';

const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const crypto = require('node:crypto');
const path = require('node:path');
const test = require('node:test');
const {NativeHelperClient} = require('../src/electronapp/native-helper/controller');
const {createService} = require('../src/electronapp/native-helper/service');

class FakeWindow extends EventEmitter {
  constructor() {
    super(); this.destroyed = false; this.visible = false; this.destroyCalls = 0;
    this.sent = []; this.webContents = {isDestroyed: () => false, send: (...args) => this.sent.push(args)};
    FakeWindow.instances.push(this);
  }
  getBounds() { return {x: 0, y: 0, width: 800, height: 450}; }
  getNativeWindowHandle() { const value = Buffer.alloc(8); value.writeBigUInt64LE(1n); return value; }
  isDestroyed() { return this.destroyed; }
  isVisible() { return this.visible; }
  isMinimized() { return false; }
  setBounds() {} setMenu() {} loadURL() { return Promise.resolve(); }
  hide() { this.visible = false; } showInactive() { this.visible = true; }
  destroy() { this.destroyCalls++; this.destroyed = true; this.emit('closed'); }
}

function harness() {
  FakeWindow.instances = [];
  const main = new FakeWindow(); main.visible = true;
  let sequence = 0;
  const runId = crypto.randomUUID();
  class Client extends NativeHelperClient {
    constructor(options) {
      super({...options, helperPath: process.execPath,
        libmpvPath: path.join(__dirname, 'fixtures', 'native-helper-delayed-exit.cjs'),
        helperInstanceId: runId + '-' + (++sequence), expectedLibmpvVersion: 'fake-mpv'});
      this.fixtureCallbacks = options;
      Client.clients.push(this);
    }
  }
  Client.clients = [];
  const service = createService({electron: {BrowserWindow: FakeWindow}, NativeHelperClient: Client,
    fs: {existsSync: () => true}, getMainWindow: () => main, getWebContents: () => main.webContents,
    runtimeRoot: path.join(__dirname, 'fixtures'),
    execFile(_file, _args, _options, callback) { callback(null); return {kill() {}}; }});
  return {main, service, Client};
}

for (const replacement of [false, true]) {
  test('full destroy joins a transport-terminal process exit; replacement=' + replacement, async function () {
    const {main, service, Client} = harness();
    const created = await service.call('create');
    const oldGeneration = await service.call('begin-generation', {label: 'old'}, created.endpointId);
    const first = Client.clients[0];
    let fullDestroy;
    try {
      const pending = first.request('fake-pending', {}, {timeoutMs: 5000});
      first.closeReadSide();
      await assert.rejects(pending, error => error.state === 'HELPER_DIED');
      await first.waitFor(() => first.transportTerminated, 1000, 'old-transport-terminal');
      assert.equal(first.exited, false, 'transport termination precedes the owned process exit');
      assert.equal(service.status().state, 'stopped');
      const terminalMessages = main.sent.filter(row => row[1].type === 'bridge_error');
      assert.equal(terminalMessages.length, 1);
      assert.equal(terminalMessages[0][1].reason, 'stdout-close');
      if (replacement) {
        const next = await service.call('create');
        assert.equal(next.endpointId, created.endpointId, 'crash/recreate preserves endpoint admission');
        const second = Client.clients[1];
        assert.notEqual(second.helperInstanceId, first.helperInstanceId);
        const generation = await service.call('begin-generation', {label: 'new'}, next.endpointId);
        assert.notEqual(generation.generationId, oldGeneration.generationId);
        await service.call('set-visible', {visible: true, generationId: generation.generationId}, next.endpointId);
        const sentCount = main.sent.length;
        first.fixtureCallbacks.onTerminal({name: 'stdout-end'});
        first.fixtureCallbacks.onEvent({name: 'core-idle', value: false, generationId: oldGeneration.generationId});
        assert.equal(main.sent.length, sentCount, 'old helper callbacks cannot notify or mutate replacement');
        assert.equal(service.status().surfaceVisible, true);
        assert.equal(service.status().recreateCount, 1);
      }
      const surface = FakeWindow.instances[1];
      fullDestroy = service.destroy();
      assert.strictEqual(service.destroy(), fullDestroy);
      let settled = false;
      fullDestroy.then(() => { settled = true; }, () => { settled = true; });
      await new Promise(resolve => setImmediate(resolve));
      if (replacement) await Client.clients[1].exitPromise;
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(first.exited, false, 'the first fake process remains in its EOF exit delay');
      assert.equal(settled, false, 'full destroy must remain pending until the old owned process exits');
      assert.equal(surface.destroyed, false, 'surface cleanup follows all owned exits');
      await fullDestroy;
      assert.equal(first.exited, true);
      assert.ok(Client.clients.every(client => client.exited));
      assert.equal(surface.destroyCalls, 1);
      assert.equal(main.eventNames().length, 0);
      assert.ok(first.requestHistory.every(row => row.terminalTransitions === 1));
      assert.strictEqual(service.destroy(), fullDestroy);
    } finally {
      // Await actual process completion even when the RED assertion fails.
      await Promise.all(Client.clients.map(client => client.kill()));
      await service.destroy();
      assert.ok(Client.clients.every(client => client.exited), 'the test leaves no owned fake process');
    }
  });
}
