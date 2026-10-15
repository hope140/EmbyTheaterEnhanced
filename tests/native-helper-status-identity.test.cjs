'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {createService, EXPECTED_LIBMPV_VERSION, EXPECTED_LIBMPV_SHA256} = require('../src/electronapp/native-helper/service');
const {readBundledVersions} = require('../src/electronapp/enhanced/bundled-versions');

function serviceFixture(handshake) {
  class FakeWindow {
    constructor() { this.webContents = {getOwnerBrowserWindow: () => this}; }
    isDestroyed() { return false; }
    destroy() {}
    hide() {}
    showInactive() {}
    setBounds() {}
    setMenu() {}
    loadURL() {}
    on() {}
    removeListener() {}
    getNativeWindowHandle() { return Buffer.from([1, 0, 0, 0]); }
    getBounds() { return {x: 0, y: 0, width: 10, height: 10}; }
    isVisible() { return false; }
    isMinimized() { return false; }
  }
  const service = createService({
    mode: 'native-helper',
    electron: {BrowserWindow: FakeWindow},
    fs: {existsSync: () => true},
    getMainWindow: () => new FakeWindow(),
    getWebContents: () => null,
    NativeHelperClient: class {
      constructor() { this.transportTerminated = false; this.exited = false; this.currentGenerationId = null; }
      async start() { this.handshake = handshake; }
      async kill() { this.transportTerminated = true; }
      retireGeneration() {}
    }
  });
  return service;
}

test('Native Helper status keeps expected identity separate until a validated handshake is ready', async t => {
  const stopped = serviceFixture(null);
  t.after(() => stopped.destroy());
  const initial = stopped.status();
  assert.equal(initial.helperVersion, null);
  assert.equal(initial.libmpvVersion, null);
  assert.equal(initial.mpvClientApiVersion, null);
  assert.equal(initial.validatedCapabilities, null);
  assert.equal(initial.expectedLibmpvVersion, EXPECTED_LIBMPV_VERSION);
  assert.equal(initial.expectedMpvClientApiVersion, 131077);
  assert.equal(initial.expectedLibmpvSha256, EXPECTED_LIBMPV_SHA256);
  assert.equal(initial.libmpvSha256, null);
  assert.equal(initial.libmpvImageSha256, null);

  const ready = serviceFixture({
    helperVersion: '0.3.0', libmpvVersion: EXPECTED_LIBMPV_VERSION,
    mpvClientApiVersion: 131077,
    capabilities: ['private-inherited-pipe', 'native-child-hwnd', 'gpu-next', 'd3d11', 'generation-attribution', 'extra-unapproved-capability']
  });
  t.after(() => ready.destroy());
  await ready.call('create', {});
  const status = ready.status();
  assert.equal(status.state, 'ready');
  assert.equal(status.helperVersion, '0.3.0');
  assert.equal(status.libmpvVersion, EXPECTED_LIBMPV_VERSION);
  assert.equal(status.mpvClientApiVersion, 131077);
  assert.deepEqual(status.validatedCapabilities, [
    'private-inherited-pipe', 'native-child-hwnd', 'gpu-next', 'd3d11', 'generation-attribution'
  ]);
  assert.equal(status.libmpvImageSha256, null);
  assert.equal(status.libmpvSha256, null);
  assert.equal(status.fixedNativeRenderPath, 'vo=gpu-next; gpu-api=d3d11');
  assert.equal(status.renderSettingUiValues, 'mpv-vo/mpv-gpuapi not applied as Native properties');
  assert.equal(status.observedNativeRenderPath, null);
});

test('bundled identity reader returns package file hashes independently of runtime status', async t => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const crypto = require('node:crypto');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-status-identity-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const sourceCommit = 'a'.repeat(40);
  const files = [
    ['electronapp/native-helper/ete-mpv-helper.exe', Buffer.from('fixture helper')],
    ['electronapp/libmpv/x64/mpv-1.dll', Buffer.from('fixture libmpv')]
  ];
  const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  for (const [name, bytes] of files) {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, bytes);
  }
  const provenance = Buffer.from(JSON.stringify({
    schemaVersion: 1, protocolVersion: 1, sourceCommit,
    helper: {version: '0.3.0', runtimePath: files[0][0], sha256: sha256(files[0][1]), testing: false},
    libmpv: {version: 'v0.41.0-test', runtimePath: files[1][0], sha256: sha256(files[1][1])}
  }));
  fs.writeFileSync(path.join(root, 'native-helper-provenance.json'), provenance);
  fs.writeFileSync(path.join(root, 'build-manifest.json'), JSON.stringify({
    schemaVersion: 3, sourceCommit,
    files: [{path: 'native-helper-provenance.json', sha256: sha256(provenance)}]
  }));
  assert.deepEqual(await readBundledVersions(root, sourceCommit), {
    helperVersion: '0.3.0',
    helperFileSha256: sha256(files[0][1]),
    libmpvVersion: 'v0.41.0-test', libmpvFileSha256: sha256(files[1][1])
  });
});
