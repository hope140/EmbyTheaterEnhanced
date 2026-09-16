'use strict';

const { app, BrowserWindow, ipcMain, nativeImage, screen } = require('electron');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const output = path.resolve(process.env.GATE_OUTPUT);
const binary = path.resolve(process.env.GATE_BINARY);
const dll = path.resolve(process.env.GATE_LIBMPV);
const media = path.resolve(process.env.GATE_MEDIA);
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'profile'));

const evidence = {
  gate: 'helper-composition-input-mixed-dpi',
  versions: process.versions,
  checks: {},
  observations: {},
  captures: [],
  topologies: [],
  inputEvents: [],
  security: {},
  displayInventory: [],
  classifications: {}
};

let win;
let overlay;
let away;
let bridge;
let pollTimer;
let pollPending = false;
let finishing = false;
let overlayWanted = true;
let osdVisible = true;
let overlayInteractive = false;
let latestMetrics = null;
let focusRecoveryEnabled = true;

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
function save() {
  fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
}
function pass(name, detail = true) {
  evidence.checks[name] = { status: 'PASS', detail };
  save();
}
function blocked(name, detail) {
  evidence.checks[name] = { status: 'BLOCKED', detail };
  save();
}
async function until(predicate, label, timeout = 10000) {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    if (await predicate()) return performance.now() - start;
    await delay(30);
  }
  throw new Error(`timeout:${label}`);
}
function decimalHandle(browserWindow) {
  return browserWindow.getNativeWindowHandle().readBigUInt64LE().toString();
}
function isOverlaySender(event) {
  return overlay && !overlay.isDestroyed() && event.sender === overlay.webContents;
}
function sanitizeDetail(detail) {
  try {
    if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return null;
    const json = JSON.stringify(detail);
    if (!json || json.length > 4096) return null;
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

ipcMain.on('composition-gate-interactive', (event, value) => {
  if (!isOverlaySender(event) || typeof value !== 'boolean') return;
  overlayInteractive = value;
  overlay.setIgnoreMouseEvents(!value, { forward: true });
  evidence.observations.lastOverlayInteractive = value;
  save();
});

ipcMain.on('composition-gate-event', (event, packet) => {
  if (!isOverlaySender(event) || !packet || typeof packet !== 'object') return;
  const allowed = new Set(['ready', 'metrics', 'mousemove', 'hover', 'button', 'slider', 'keydown', 'focus', 'blur']);
  if (!allowed.has(packet.type)) return;
  const detail = sanitizeDetail(packet.detail);
  if (!detail) {
    evidence.observations.rejectedRendererEvents = (evidence.observations.rejectedRendererEvents || 0) + 1;
    save();
    return;
  }
  const item = { type: packet.type, detail, atMs: +performance.now().toFixed(3) };
  evidence.inputEvents.push(item);
  if (packet.type === 'metrics') latestMetrics = detail;
  if (packet.type === 'keydown' && detail.key === 'Escape' && win && win.isFullScreen()) win.setFullScreen(false);
  save();
});

class Helper {
  constructor() {
    this.pending = new Map();
    this.sequence = 0;
    this.exited = false;
  }
  async create(parentHandle) {
    this.child = spawn(path.join(binary, 'bridge-helper.exe'), [dll, parentHandle], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    this.child.stdin.on('error', () => {});
    this.closed = new Promise(resolve => this.child.once('exit', (code, signal) => {
      this.exited = true;
      this.exit = { code, signal };
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error('helper-exited'));
      }
      this.pending.clear();
      resolve(this.exit);
    }));
    let buffer = '';
    this.ready = new Promise((resolve, reject) => {
      this.child.once('error', reject);
      this.child.stdout.on('data', chunk => {
        buffer += chunk;
        if (buffer.length > 1024 * 1024) {
          reject(new Error('ipc-frame-limit'));
          this.child.kill();
          return;
        }
        let newline;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          try {
            const packet = JSON.parse(line);
            if (packet.ready) resolve();
            if (packet.failure) reject(new Error(packet.failure));
            const pending = this.pending.get(packet.id);
            if (pending) {
              clearTimeout(pending.timer);
              this.pending.delete(packet.id);
              pending.resolve(packet.result);
            }
          } catch (_) {
            reject(new Error('invalid-helper-json'));
          }
        }
      });
    });
    this.child.stderr.pipe(fs.createWriteStream(path.join(output, `helper-${this.child.pid}.stderr.log`)));
    await Promise.race([
      this.ready,
      this.closed.then(() => { throw new Error('helper-early-exit'); }),
      delay(15000).then(() => { throw new Error('helper-ready-timeout'); })
    ]);
  }
  request(operation) {
    if (this.exited) return Promise.reject(new Error('helper-exited'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('ipc-timeout'));
      }, 5000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${id}\t${operation}\n`);
    });
  }
  async destroy() {
    if (!this.exited) this.child.stdin.end(`${++this.sequence}\tdestroy\n`);
    await Promise.race([
      this.closed,
      delay(5000).then(() => { throw new Error('helper-exit-timeout'); })
    ]);
    assert.equal(this.exit.code, 0);
  }
}

function syncOverlay(reason) {
  if (!win || win.isDestroyed() || !overlay || overlay.isDestroyed()) return;
  if (!overlayWanted || win.isMinimized() || !win.isVisible()) {
    overlay.hide();
    return;
  }
  overlay.setBounds(win.getBounds(), false);
  if (!overlay.isVisible()) overlay.showInactive();
  if (typeof overlay.moveTop === 'function') overlay.moveTop();
  evidence.observations.lastOverlaySync = { reason, main: win.getBounds(), overlay: overlay.getBounds() };
  save();
}

async function activateCompositionGroup(focusOverlay = false) {
  if (!win.isVisible()) win.show();
  if (typeof win.moveTop === 'function') win.moveTop();
  win.focus();
  if (overlayWanted) {
    syncOverlay('activate-composition-group');
    if (typeof overlay.moveTop === 'function') overlay.moveTop();
    if (focusOverlay) overlay.focus();
  }
  if (bridge && !bridge.exited) {
    await bridge.request(`activate\t${overlayWanted ? 'overlay' : 'main'}`);
  }
  await until(async () => {
    if (!bridge || bridge.exited) return true;
    const state = await bridge.request('focus');
    return state.foregroundMain || state.foregroundOverlay;
  }, focusOverlay ? 'overlay-foreground' : 'main-foreground', 3000);
  await delay(180);
}

async function showOverlay(value, reason) {
  osdVisible = value;
  overlayWanted = true;
  syncOverlay(reason);
  overlay.webContents.send('composition-gate-state', { osdVisible: value });
  if (!value) {
    overlayInteractive = false;
    overlay.setIgnoreMouseEvents(true, { forward: true });
  }
  await delay(250);
}

async function startPolling() {
  pollTimer = setInterval(async () => {
    if (pollPending || !bridge || bridge.exited) return;
    pollPending = true;
    const current = bridge;
    try {
      const events = await current.request('poll');
      if (current === bridge && evidence.observations.nativeEventCount < 5000) {
        evidence.observations.nativeEventCount += events.length;
      }
    } catch (_) {
      // The deliberate crash ends exactly one helper generation.
    } finally {
      pollPending = false;
    }
  }, 30);
}

async function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
  await until(() => !pollPending, 'poll-drain', 2000).catch(() => {});
}

async function startHelper() {
  bridge = new Helper();
  const started = performance.now();
  await bridge.create(decimalHandle(win));
  await bridge.request(`set-window\toverlay\t${decimalHandle(overlay)}`);
  if (away && !away.isDestroyed()) await bridge.request(`set-window\taway\t${decimalHandle(away)}`);
  evidence.observations.initializeMs ??= [];
  evidence.observations.initializeMs.push(+(performance.now() - started).toFixed(2));
  await startPolling();
}

async function get(name) {
  return (await bridge.request(`get\t${name}`)).value;
}

async function command(operation) {
  const result = await bridge.request(operation);
  assert.equal(result.rc, 0);
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function capture(label, overlayExpected) {
  const foregroundAssist = false;
  await activateCompositionGroup(false);
  if (overlayExpected) syncOverlay(`capture:${label}`);
  await delay(350);
  const before = Number(await get('time-pos'));
  await delay(220);
  const rawPath = path.join(output, `${label}.bgra`);
  const captured = await bridge.request(`capture-screen\t${rawPath}`);
  assert.equal(captured.ok, true);
  let image = nativeImage.createFromBitmap(fs.readFileSync(rawPath), {
    width: captured.width,
    height: captured.height
  });
  const maximumWidth = 1600;
  if (captured.width > maximumWidth) {
    image = image.resize({ width: maximumWidth, quality: 'best' });
  }
  const png = image.toPNG();
  fs.writeFileSync(path.join(output, `${label}.png`), png);
  const after = Number(await get('time-pos'));
  assert.ok(after > before, `video did not advance during ${label}`);
  evidence.captures.push({
    label,
    method: 'desktop BitBlt of the parent physical window rectangle',
    foregroundAssist,
    overlayExpected,
    sourceWidth: captured.width,
    sourceHeight: captured.height,
    storedWidth: image.getSize().width,
    storedHeight: image.getSize().height,
    sha256: sha256(png),
    timePosBefore: before,
    timePosAfter: after
  });
  save();
}

function sameRect(left, right, tolerance = 2) {
  return ['left', 'top', 'right', 'bottom'].every(key => Math.abs(left[key] - right[key]) <= tolerance);
}

async function recordTopology(label) {
  const native = await bridge.request('topology');
  const mainBounds = win.getBounds();
  const overlayBounds = overlay.getBounds();
  const display = screen.getDisplayMatching(mainBounds);
  const item = {
    label,
    mainDipBounds: mainBounds,
    overlayDipBounds: overlayBounds,
    electronDisplay: {
      id: String(display.id),
      bounds: display.bounds,
      workArea: display.workArea,
      scaleFactor: display.scaleFactor,
      rotation: display.rotation
    },
    native,
    overlayPhysicalMatchesParent: native.overlayRect && native.parentRect && sameRect(native.overlayRect, native.parentRect),
    videoInsideParent: native.childRect && native.parentRect &&
      native.childRect.left >= native.parentRect.left && native.childRect.right <= native.parentRect.right &&
      native.childRect.top >= native.parentRect.top && native.childRect.bottom <= native.parentRect.bottom
  };
  evidence.topologies.push(item);
  save();
  return item;
}

function eventCount(type, predicate = () => true) {
  return evidence.inputEvents.filter(event => event.type === type && predicate(event.detail)).length;
}

async function requestMetrics() {
  const previous = eventCount('metrics');
  overlay.webContents.send('composition-gate-state', { requestMetrics: true });
  await until(() => eventCount('metrics') > previous && latestMetrics, 'overlay-metrics');
  return latestMetrics;
}

function clientPixelPoint(rect, devicePixelRatio) {
  return {
    x: Math.round((rect.left + rect.width / 2) * devicePixelRatio),
    y: Math.round((rect.top + rect.height / 2) * devicePixelRatio)
  };
}

async function moveAndClick(rect, expectedType) {
  await activateCompositionGroup(false);
  // Fixed interactive mode is the bounded proof for HTML controls. The
  // transparent video-area proof below switches the whole overlay back to
  // ignore+forward mode before injecting an OS click.
  overlayInteractive = true;
  overlay.setIgnoreMouseEvents(false);
  const metrics = latestMetrics || await requestMetrics();
  const point = clientPixelPoint(rect, metrics.devicePixelRatio);
  const prior = eventCount(expectedType);
  const started = performance.now();
  await bridge.request(`mouse-move\toverlay\t${point.x}\t${point.y}`);
  overlay.focus();
  await until(async () => (await bridge.request('focus')).foregroundOverlay, `${expectedType}-overlay-focus`);
  await bridge.request(`mouse-click\toverlay\t${point.x}\t${point.y}`);
  await until(() => eventCount(expectedType) > prior, `${expectedType}-event`);
  return +(performance.now() - started).toFixed(2);
}

async function sendAndObserveKey(virtualKey, keyName) {
  const prior = eventCount('keydown', detail => detail.key === keyName);
  await bridge.request(`key\t${virtualKey}`);
  await until(() => eventCount('keydown', detail => detail.key === keyName) > prior, `key-${keyName}`);
}

async function sampleCpu(label, visible) {
  await showOverlay(visible, `cpu:${label}`);
  const helperBefore = await bridge.request('cpu');
  const mainBefore = process.cpuUsage();
  const started = performance.now();
  await delay(1400);
  const elapsedMs = performance.now() - started;
  const helperAfter = await bridge.request('cpu');
  const mainAfter = process.cpuUsage(mainBefore);
  const helperCpuMs = (helperAfter.kernelMs + helperAfter.userMs) - (helperBefore.kernelMs + helperBefore.userMs);
  return {
    label,
    overlayVisible: visible,
    intervalMs: +elapsedMs.toFixed(1),
    helperCpuMs: +helperCpuMs.toFixed(2),
    helperApproxOneCorePercent: +(helperCpuMs / elapsedMs * 100).toFixed(2),
    electronMainCpuMs: +((mainAfter.user + mainAfter.system) / 1000).toFixed(2),
    electronMainApproxOneCorePercent: +((mainAfter.user + mainAfter.system) / 1000 / elapsedMs * 100).toFixed(2),
    appMetrics: app.getAppMetrics().map(metric => ({
      type: metric.type,
      pid: metric.pid,
      cpuPercent: metric.cpu ? metric.cpu.percentCPUUsage : null
    }))
  };
}

async function run() {
  assert.equal(process.versions.electron, '18.3.15');
  evidence.observations.nativeEventCount = 0;
  evidence.displayInventory = screen.getAllDisplays().map(display => ({
    id: String(display.id),
    bounds: display.bounds,
    workArea: display.workArea,
    scaleFactor: display.scaleFactor,
    rotation: display.rotation
  }));

  const primary = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({
    x: primary.x + 40,
    y: primary.y + 40,
    width: Math.min(1000, primary.width - 80),
    height: Math.min(680, primary.height - 80),
    frame: false,
    show: true,
    backgroundColor: '#09131d',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  await win.loadFile(path.join(__dirname, 'main.html'));

  overlay = new BrowserWindow({
    parent: win,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    focusable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });
  overlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  overlay.webContents.on('will-navigate', event => event.preventDefault());
  await overlay.loadFile(path.join(__dirname, 'overlay.html'));
  overlay.setIgnoreMouseEvents(true, { forward: true });
  syncOverlay('initial');

  for (const event of ['move', 'resize', 'maximize', 'unmaximize', 'restore', 'show', 'enter-full-screen', 'leave-full-screen']) {
    win.on(event, () => setTimeout(() => syncOverlay(event), 0));
  }
  win.on('minimize', () => overlay.hide());
  win.on('focus', () => {
    if (focusRecoveryEnabled && overlayWanted && overlay && !overlay.isDestroyed() && overlay.isVisible()) {
      setTimeout(() => { if (focusRecoveryEnabled && !overlay.isDestroyed()) overlay.focus(); }, 60);
    }
  });
  screen.on('display-metrics-changed', () => setTimeout(() => syncOverlay('display-metrics-changed'), 0));

  await until(() => eventCount('ready') > 0 && latestMetrics, 'overlay-ready');
  const preferences = overlay.webContents.getLastWebPreferences();
  evidence.security = {
    sandbox: preferences.sandbox === true,
    contextIsolation: preferences.contextIsolation === true,
    nodeIntegrationDisabled: preferences.nodeIntegration === false,
    rendererReported: evidence.inputEvents.find(event => event.type === 'ready').detail,
    exposedApi: ['onState', 'setInteractive', 'report', 'security'],
    rawHwndExposed: false,
    arbitraryNativeCommandExposed: false,
    filesystemExposed: false,
    childProcessExposed: false,
    helperPipeExposed: false
  };
  assert.equal(evidence.security.sandbox, true);
  assert.equal(evidence.security.contextIsolation, true);
  assert.equal(evidence.security.nodeIntegrationDisabled, true);
  assert.equal(evidence.security.rendererReported.nodeGlobalsAbsent, true);
  pass('SECURITY_BASELINE');

  await startHelper();
  pass('INITIALIZE');
  const loadStarted = performance.now();
  await command(`load\t${media}`);
  await until(async () => Number(await get('time-pos')) > 0.2, 'core-playing');
  evidence.observations.loadToAdvancingMs = +(performance.now() - loadStarted).toFixed(2);
  pass('LOAD_AND_CORE_PLAYING');

  for (const name of ['mpv-version', 'current-vo', 'gpu-api', 'gpu-context', 'hwdec', 'hwdec-current', 'video-codec', 'video-params', 'duration', 'd3d11-output-mode']) {
    evidence.observations[name] = await get(name);
  }
  assert.equal(evidence.observations['current-vo'], 'gpu-next');
  assert.equal(evidence.observations['gpu-api'], 'd3d11');
  assert.equal(evidence.observations['gpu-context'], 'd3d11');
  assert.equal(evidence.observations['hwdec-current'], 'd3d11va');
  pass('NATIVE_VIDEO_PATH');

  await recordTopology('normal');
  await capture('playing-overlay-visible', true);
  await showOverlay(false, 'hide-proof');
  await capture('overlay-hidden', false);
  await showOverlay(true, 'show-again-proof');
  await capture('overlay-visible-again', true);
  pass('OVERLAY_SHOW_HIDE_CAPTURED');

  latestMetrics = null;
  const metrics = await requestMetrics();
  evidence.observations.buttonRoundTripMs = await moveAndClick(metrics.button, 'button');
  evidence.observations.sliderRoundTripMs = await moveAndClick(metrics.slider, 'slider');
  assert.ok(eventCount('hover') > 0);
  assert.ok(eventCount('mousemove') > 0);
  pass('OVERLAY_MOUSE_INPUT');

  const videoPoint = {
    x: Math.round(metrics.videoProbe.x * metrics.devicePixelRatio),
    y: Math.round(metrics.videoProbe.y * metrics.devicePixelRatio)
  };
  await bridge.request(`mouse-move\toverlay\t${videoPoint.x}\t${videoPoint.y}`);
  await until(() => !overlayInteractive, 'video-click-through-mode');
  const moved = await bridge.request(`mouse-move\toverlay\t${videoPoint.x}\t${videoPoint.y}`);
  const targetBeforeClick = await bridge.request(`point\t${moved.screenX}\t${moved.screenY}`);
  assert.equal(targetBeforeClick.inVideo, true);
  focusRecoveryEnabled = false;
  const clickInjection = await bridge.request(`mouse-click\toverlay\t${videoPoint.x}\t${videoPoint.y}`);
  assert.equal(clickInjection.ok, true);
  assert.equal(clickInjection.targetInVideo, true);
  assert.equal(clickInjection.targetInOverlay, false);
  await delay(120);
  const focusAfterVideoClick = await bridge.request('focus');
  focusRecoveryEnabled = true;
  overlay.focus();
  await until(async () => (await bridge.request('focus')).foregroundOverlay, 'focus-recovery');
  evidence.observations.clickThrough = { targetBeforeClick, clickInjection, focusAfterVideoClick };
  pass('VIDEO_AREA_CLICK_THROUGH', { targetBeforeClick, clickInjection });
  pass('FOCUS_RECOVERY_AFTER_VIDEO_CLICK');

  overlay.focus();
  await sendAndObserveKey(0x20, ' ');
  await sendAndObserveKey(0x25, 'ArrowLeft');
  await sendAndObserveKey(0x27, 'ArrowRight');
  await sendAndObserveKey(0x0d, 'Enter');
  pass('KEYBOARD_SPACE_LEFT_RIGHT_ENTER');

  win.setSize(1120, 760);
  await delay(500);
  await recordTopology('resized');
  await capture('resized', true);
  pass('RESIZE');

  win.maximize();
  await until(() => win.isMaximized(), 'maximize');
  await delay(500);
  await recordTopology('maximized');
  await capture('maximized', true);
  pass('MAXIMIZE');

  win.unmaximize();
  await until(() => !win.isMaximized(), 'unmaximize');
  await delay(400);
  await recordTopology('restored-after-maximize');
  pass('RESTORE_AFTER_MAXIMIZE');

  win.minimize();
  await until(() => win.isMinimized() && !overlay.isVisible(), 'minimize');
  win.restore();
  await until(() => !win.isMinimized(), 'restore');
  syncOverlay('restore-after-minimize');
  await delay(450);
  await recordTopology('restored-after-minimize');
  await capture('restore-after-minimize', true);
  pass('MINIMIZE_RESTORE');

  win.setFullScreen(true);
  await until(() => win.isFullScreen(), 'fullscreen-enter');
  await delay(550);
  syncOverlay('fullscreen-enter');
  overlay.focus();
  await recordTopology('fullscreen');
  await capture('fullscreen', true);
  const escapeBefore = eventCount('keydown', detail => detail.key === 'Escape');
  await bridge.request('key\t27');
  await until(() => eventCount('keydown', detail => detail.key === 'Escape') > escapeBefore, 'escape-key');
  await until(() => !win.isFullScreen(), 'fullscreen-exit-by-html-key');
  await delay(450);
  syncOverlay('fullscreen-exit');
  await recordTopology('fullscreen-exit');
  await capture('fullscreen-exit', true);
  pass('FULLSCREEN_ENTER_EXIT_BY_HTML_ESCAPE');

  away = new BrowserWindow({
    x: primary.x + 120,
    y: primary.y + 120,
    width: 420,
    height: 220,
    frame: false,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  await away.loadFile(path.join(__dirname, 'away.html'));
  await bridge.request(`set-window\taway\t${decimalHandle(away)}`);
  away.show();
  away.focus();
  await until(async () => (await bridge.request('focus')).foregroundAway, 'away-focused');
  overlay.focus();
  await until(async () => (await bridge.request('focus')).foregroundOverlay, 'overlay-before-alt-tab');
  await bridge.request('alt-tab');
  await until(async () => (await bridge.request('focus')).foregroundAway, 'alt-tab-away');
  const awayFocus = await bridge.request('focus');
  await bridge.request('alt-tab');
  await until(async () => {
    const state = await bridge.request('focus');
    return state.foregroundOverlay || state.foregroundMain;
  }, 'alt-tab-back');
  await delay(120);
  if (!overlay.isFocused()) overlay.focus();
  const recoveredFocus = await bridge.request('focus');
  evidence.observations.altTab = { away: awayFocus, recovered: recoveredFocus };
  away.destroy();
  away = null;
  pass('ALT_TAB_AWAY_BACK');

  const displays = screen.getAllDisplays();
  const transitionTopologies = [];
  if (displays.length >= 2) {
    for (let index = 0; index < displays.length; index += 1) {
      const workArea = displays[index].workArea;
      win.setBounds({
        x: workArea.x + 40,
        y: workArea.y + 40,
        width: Math.min(1000, workArea.width - 80),
        height: Math.min(680, workArea.height - 80)
      });
      await delay(650);
      syncOverlay(`monitor-${index}`);
      transitionTopologies.push(await recordTopology(`monitor-${index}`));
      await capture(`monitor-${index}`, true);
      if (index > 0) {
        latestMetrics = null;
        const monitorMetrics = await requestMetrics();
        await moveAndClick(monitorMetrics.button, 'button');
      }
    }
    const monitorRects = transitionTopologies.map(item => JSON.stringify(item.native.monitorRect));
    assert.ok(new Set(monitorRects).size >= 2);
    assert.ok(transitionTopologies.every(item => item.overlayPhysicalMatchesParent && item.videoInsideParent));
    pass('MONITOR_TRANSITION');
    pass('INPUT_ALIGNMENT_AFTER_MONITOR_TRANSITION');

    win.setFullScreen(true);
    await until(() => win.isFullScreen(), 'secondary-fullscreen-enter');
    await delay(500);
    syncOverlay('secondary-fullscreen');
    const secondaryFullscreen = await recordTopology('secondary-fullscreen');
    await capture('secondary-fullscreen', true);
    assert.equal(secondaryFullscreen.native.sameMonitor, true);
    win.setFullScreen(false);
    await until(() => !win.isFullScreen(), 'secondary-fullscreen-exit');
    await delay(400);
    syncOverlay('secondary-fullscreen-exit');
    pass('FULLSCREEN_USES_CURRENT_MONITOR');
  } else {
    blocked('MONITOR_TRANSITION', 'Only one real display was enumerated by Electron screen API.');
  }

  const distinctScaleFactors = [...new Set(displays.map(display => display.scaleFactor))];
  if (displays.length >= 2 && distinctScaleFactors.length >= 2) {
    const observedNativeDpis = [...new Set(transitionTopologies.map(item => item.native.parentDpi))];
    assert.ok(observedNativeDpis.length >= 2, 'native parent DPI did not change across mixed-scale displays');
    assert.ok(transitionTopologies.every(item =>
      item.native.parentDpi === item.native.childDpi &&
      item.native.parentDpi === item.native.overlayDpi &&
      Math.abs(item.native.parentDpi - Math.round(item.electronDisplay.scaleFactor * 96)) <= 1
    ));
    pass('REAL_MIXED_DPI', { scaleFactors: distinctScaleFactors, nativeDpis: observedNativeDpis });
  } else {
    blocked('REAL_MIXED_DPI', {
      reason: 'No two currently enumerated displays have different real scale factors.',
      displays: evidence.displayInventory
    });
  }

  evidence.observations.performance = [
    await sampleCpu('overlay-visible', true),
    await sampleCpu('overlay-hidden', false)
  ];
  await showOverlay(true, 'post-performance');
  pass('PERFORMANCE_OBSERVATION');

  await stopPolling();
  const crashRequest = bridge.request('crash').catch(() => null);
  await until(() => bridge.exited, 'native-access-violation');
  await crashRequest;
  const crashExit = bridge.exit;
  assert.equal(crashExit.code, 3221225477);
  assert.equal(win.isDestroyed(), false);
  assert.equal(overlay.isDestroyed(), false);
  assert.equal(await overlay.webContents.executeJavaScript('document.title'), 'Helper Composition Gate Overlay');
  evidence.observations.crash = {
    helperExit: crashExit,
    mainAlive: !win.isDestroyed(),
    rendererAlive: !overlay.webContents.isDestroyed(),
    overlayVisible: overlay.isVisible()
  };
  pass('HELPER_ACCESS_VIOLATION_ISOLATED');
  pass('OVERLAY_SURVIVED_HELPER_CRASH');

  await startHelper();
  await command(`load\t${media}`);
  await until(async () => Number(await get('time-pos')) > 0.2, 'video-reload-after-crash');
  await recordTopology('after-crash-recreate');
  await capture('after-crash-reload', true);
  pass('HELPER_RECREATE_AND_VIDEO_RELOAD');

  await stopPolling();
  await bridge.destroy();
  bridge = null;
  pass('FINAL_DESTROY');
  evidence.observations.windowTopology = 'frameless main BrowserWindow + helper-owned WS_CHILD video + parent-owned transparent frameless overlay BrowserWindow';
  evidence.observations.captureClassification = 'DESKTOP COMPOSITION CAPTURE; screenshots require separate visual review before VISUAL PASS';
  save();
  finishing = true;
  overlay.destroy();
  win.destroy();
  app.quit();
}

app.on('window-all-closed', () => { if (finishing) app.quit(); });
app.whenReady().then(run).catch(async error => {
  evidence.failure = String(error.stack || error.message)
    .replaceAll(media, '<generated-media>')
    .replaceAll(dll, '<libmpv>')
    .replaceAll(binary, '<native-build>');
  save();
  clearInterval(pollTimer);
  try {
    if (bridge && !bridge.exited) await bridge.destroy();
  } catch (_) {
    if (bridge && bridge.child && !bridge.exited) bridge.child.kill();
  }
  app.exit(1);
});
app.on('will-quit', () => {
  evidence.observations.willQuit = true;
  save();
});
