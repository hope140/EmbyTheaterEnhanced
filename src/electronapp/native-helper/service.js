'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('node:child_process');
const {NativeHelperClient, PROTOCOL_VERSION} = require('./controller');

const CALL_CHANNEL = 'enhanced-native-helper-call';
const NOTIFY_CHANNEL = 'enhanced-native-helper-notify';
const EVENT_CHANNEL = 'enhanced-native-helper-event';
const WINDOW_PLACEMENT_MODE = '--place-window-behind';
const WINDOW_PLACEMENT_TIMEOUT_MS = 2000;
const EXPECTED_LIBMPV_VERSION = 'mpv v0.41.0-920-gdd5d17d32';
const EXPECTED_LIBMPV_SHA256 = '965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c';

const OBSERVED_PROPERTIES = new Set([
  'pause', 'time-pos', 'duration', 'volume', 'mute', 'eof-reached',
  'demuxer-cache-state', 'demuxer-cache-time', 'estimated-vf-fps',
  'sub-delay', 'speed', 'core-idle'
]);
const SET_PROPERTIES = new Set([
  'volume', 'audio-display', 'keep-open', 'speed', 'sub-delay', 'hwdec', 'gpu-api',
  'wid', 'fullscreen',
  'demuxer-max-bytes', 'vo', 'video-output-levels', 'profile', 'video-sync', 'interpolation',
  'demuxer-readahead-secs', 'sub-font-size', 'sub-back-color', 'sub-color',
  'sub-create-cc-track', 'deinterlace', 'audio-delay', 'af', 'audio-channels',
  'audio-spdif', 'ad-lavc-ac3drc', 'audio-exclusive', 'start', 'pause', 'mute',
  'video-unscaled', 'video-aspect', 'panscan', 'sid', 'teletext-page', 'aid',
  'user-data/emby-theater-enhanced/diagnostics/cache-bytes'
]);
const GET_PROPERTIES = new Set([
  ...OBSERVED_PROPERTIES,
  'audio-codec-name', 'audio-out-params', 'audio-bitrate', 'current-ao', 'audio-out-detected-device',
  'video-out-params', 'video-codec', 'mpv-version', 'libmpv-version', 'mpv-build-date',
  'video-bitrate', 'current-vo', 'hwdec-current', 'display-names', 'display-fps',
  'estimated-display-fps', 'display-sync-active', 'frame-drop-count', 'decoder-frame-drop-count',
  'mistimed-drop-count', 'vo-delayed-frame-count', 'chapter', 'vo', 'gpu-api', 'gpu-context',
  'hwdec', 'scale', 'cscale', 'dscale', 'tscale', 'deband', 'interpolation', 'video-sync',
  'target-colorspace-hint', 'target-trc', 'target-prim', 'target-peak', 'tone-mapping',
  'gamut-mapping-mode', 'glsl-shaders', 'video-params', 'config', 'config-dir', 'sub-font',
  'sub-fonts-dir', 'demuxer-max-bytes', 'user-data/emby-theater-enhanced/diagnostics/cache-bytes'
]);
const COMMANDS = new Set(['loadfile', 'seek', 'cycle', 'stop', 'sub-add', 'expand-properties']);

function resolveMode(value) {
  if (value == null || value === '' || value === 'native-helper') return 'native-helper';
  if (value === 'pepper') throw new Error('legacy-mode-removed');
  throw new Error('unsupported-bridge-mode');
}

function decimalWindowHandle(window) {
  const handle = window.getNativeWindowHandle();
  if (!Buffer.isBuffer(handle) || (handle.length !== 4 && handle.length !== 8)) throw new Error('unsupported-native-window-handle');
  return handle.length === 8 ? handle.readBigUInt64LE(0).toString(10) : String(handle.readUInt32LE(0));
}

function validatePropertyName(name, allowlist) {
  if (typeof name !== 'string' || !allowlist.has(name)) throw new Error('property-not-allowed');
  return name;
}

function validateScalar(value) {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  throw new Error('property-value-invalid');
}

function validateCommand(input) {
  const args = input === 'stop' ? ['stop'] : input;
  if (!Array.isArray(args) || !args.length || args.length > 16 ||
      args.some(value => typeof value !== 'string' || value.length > 8192)) throw new Error('command-invalid');
  if (!COMMANDS.has(args[0])) throw new Error('command-not-allowed');
  if (args[0] === 'loadfile') {
    if (args.length !== 2 && args.length !== 5) throw new Error('loadfile-shape-invalid');
    if (!args[1]) throw new Error('loadfile-source-invalid');
    if (args.length === 5 && (args[2] !== 'replace' || args[3] !== '-1' ||
        !/^user-agent=[\x20-\x7e]{1,1024}$/.test(args[4]) || /[,\\]/.test(args[4].slice(11)))) {
      throw new Error('loadfile-options-invalid');
    }
  }
  if (args[0] === 'stop' && args.length !== 1) throw new Error('stop-shape-invalid');
  if (args[0] === 'cycle' && (args.length !== 2 || args[1] !== 'pause')) throw new Error('cycle-shape-invalid');
  if (args[0] === 'expand-properties' &&
      (args.length !== 4 || args[1] !== 'set' || args[2] !== 'user-data/emby-theater-enhanced/diagnostics/cache-bytes' || args[3] !== '${=demuxer-max-bytes}')) {
    throw new Error('diagnostic-command-invalid');
  }
  return args;
}

function createService(options) {
  const settings = options || {};
  const electron = settings.electron;
  const BrowserWindow = electron && electron.BrowserWindow;
  const ClientClass = settings.NativeHelperClient || NativeHelperClient;
  const fileSystem = settings.fs || fs;
  const getMainWindow = settings.getMainWindow;
  const getWebContents = settings.getWebContents;
  const logger = typeof settings.logger === 'function' ? settings.logger : function () {};
  const execFile = typeof settings.execFile === 'function' ? settings.execFile : childProcess.execFile;
  const runtimeRoot = path.resolve(settings.runtimeRoot || path.join(__dirname, '..', '..'));
  const helperPath = path.join(runtimeRoot, 'electronapp', 'native-helper', 'ete-mpv-helper.exe');
  const libmpvPath = path.join(runtimeRoot, 'electronapp', 'libmpv', 'x64', 'mpv-1.dll');
  const mode = resolveMode(settings.mode);
  let client = null;
  let startingClient = null;
  let startPromise = null;
  let surfaceWindow = null;
  let surfaceWanted = false;
  let crashCount = 0;
  let recreateCount = 0;
  let everStarted = false;
  let destroyed = false;
  let activeEndpointId = null;
  let surfaceEpoch = 0;
  let placementRevision = 0;
  let placementInFlight = null;
  let placementPending = null;
  let placementChild = null;
  const observed = new Set();
  const fixedSettingLogged = new Set();
  const boundWindowEvents = [];

  function log(event, details) {
    try { logger({category: 'native-helper', event, details: details || {}}); } catch (_) { }
  }

  function trusted(event) {
    const expected = typeof getWebContents === 'function' ? getWebContents() : null;
    return !!expected && event && event.sender === expected;
  }

  function sendEvent(payload) {
    const target = typeof getWebContents === 'function' ? getWebContents() : null;
    if (!target || target.isDestroyed()) return;
    target.send(EVENT_CHANNEL, payload);
  }

  function bindMainWindowEvent(name, listener) {
    const main = getMainWindow();
    if (!main || main.isDestroyed()) return;
    main.on(name, listener);
    boundWindowEvents.push({main, name, listener});
  }

  function safePlacementFailure(error) {
    if (!error) return null;
    const code = error.code;
    return {
      code: typeof code === 'number' ? code : typeof code === 'string' && /^[A-Z0-9_-]{1,64}$/i.test(code) ? code : 'unknown',
      killed: error.killed === true,
      signal: typeof error.signal === 'string' && /^[A-Z0-9_-]{1,32}$/i.test(error.signal) ? error.signal : null
    };
  }

  function requestIsCurrent(request) {
    if (!request || destroyed || placementRevision !== request.revision || surfaceEpoch !== request.surfaceEpoch ||
        surfaceWindow !== request.surface || request.surface.isDestroyed()) return false;
    const main = getMainWindow();
    if (!main || main !== request.main || main.isDestroyed()) return false;
    try {
      return decimalWindowHandle(request.surface) === request.surfaceHandle &&
        decimalWindowHandle(main) === request.mainHandle;
    } catch (_) {
      return false;
    }
  }

  function hideSurfaceAfterStalePlacement(request) {
    if (!request || surfaceWindow !== request.surface || request.surface.isDestroyed()) return;
    const main = getMainWindow();
    if (!surfaceWanted || !main || main.isDestroyed() || !main.isVisible() || main.isMinimized()) {
      try { request.surface.hide(); } catch (_) { }
    }
  }

  function runPendingPlacement() {
    if (placementInFlight || !placementPending || destroyed) return;
    const request = placementPending;
    placementPending = null;
    placementInFlight = request;
    const finish = function (error) {
      if (placementInFlight !== request) return;
      placementInFlight = null;
      placementChild = null;
      if (!requestIsCurrent(request)) {
        hideSurfaceAfterStalePlacement(request);
        log('surface-z-order-stale', {reason: request.reason});
      } else if (error) {
        log('surface-z-order-warning', {reason: request.reason, failure: safePlacementFailure(error)});
      } else {
        log('surface-z-order', {reason: request.reason, applied: true});
      }
      if (placementPending && !destroyed) runPendingPlacement();
    };
    try {
      placementChild = execFile(helperPath, [WINDOW_PLACEMENT_MODE, request.surfaceHandle, request.mainHandle], {
        encoding: 'utf8',
        timeout: WINDOW_PLACEMENT_TIMEOUT_MS,
        windowsHide: true
      }, finish);
    } catch (error) {
      finish(error);
    }
  }

  function placeSurfaceBehindMain(main, reason) {
    const surface = surfaceWindow;
    if (!surface || surface.isDestroyed() || !main || main.isDestroyed()) return;
    const revision = ++placementRevision;
    let surfaceHandle;
    let mainHandle;
    try {
      surfaceHandle = decimalWindowHandle(surface);
      mainHandle = decimalWindowHandle(main);
    } catch (error) {
      log('surface-z-order-warning', {reason, failure: {code: 'invalid-window-handle', killed: false, signal: null}});
      return;
    }
    placementPending = {reason, revision, surface, surfaceEpoch, surfaceHandle, main, mainHandle};
    runPendingPlacement();
  }

  function invalidateSurfacePlacement() {
    ++placementRevision;
    placementPending = null;
    const child = placementChild;
    if (child && typeof child.kill === 'function') {
      try { child.kill(); } catch (_) { }
    }
  }

  function syncSurface(reason) {
    const main = getMainWindow();
    if (!surfaceWindow || surfaceWindow.isDestroyed() || !main || main.isDestroyed()) return;
    if (!surfaceWanted || !main.isVisible() || main.isMinimized()) {
      invalidateSurfacePlacement();
      surfaceWindow.hide();
      return;
    }
    surfaceWindow.setBounds(main.getBounds(), false);
    if (!surfaceWindow.isVisible()) surfaceWindow.showInactive();
    placeSurfaceBehindMain(main, reason);
    log('surface-sync', {reason, visible: true});
  }

  function ensureSurfaceWindow() {
    if (surfaceWindow && !surfaceWindow.isDestroyed()) return surfaceWindow;
    if (!BrowserWindow) throw new Error('browser-window-unavailable');
    const main = getMainWindow();
    if (!main || main.isDestroyed()) throw new Error('main-window-unavailable');
    const ownedSurface = new BrowserWindow({
      x: main.getBounds().x,
      y: main.getBounds().y,
      width: main.getBounds().width,
      height: main.getBounds().height,
      frame: false,
      transparent: false,
      backgroundColor: '#000000',
      show: false,
      skipTaskbar: true,
      focusable: false,
      webPreferences: {nodeIntegration: false, contextIsolation: true, sandbox: true}
    });
    surfaceWindow = ownedSurface;
    ++surfaceEpoch;
    surfaceWindow.setMenu(null);
    surfaceWindow.loadURL('data:text/html,<meta charset="utf-8"><style>html,body{margin:0;background:#000;overflow:hidden}</style>');
    surfaceWindow.on('closed', function () {
      if (surfaceWindow !== ownedSurface) return;
      invalidateSurfacePlacement();
      surfaceWindow = null;
      ++surfaceEpoch;
    });
    if (!boundWindowEvents.length) {
      ['move', 'resize', 'maximize', 'unmaximize', 'restore', 'enter-full-screen', 'leave-full-screen', 'show', 'focus'].forEach(function (name) {
        bindMainWindowEvent(name, function () { syncSurface(name); });
      });
      ['minimize', 'hide'].forEach(function (name) {
        bindMainWindowEvent(name, function () { syncSurface(name); });
      });
      bindMainWindowEvent('closed', function () { destroy().catch(function () {}); });
    }
    return surfaceWindow;
  }

  async function ensureClient() {
    if (destroyed) throw new Error('native-helper-service-destroyed');
    if (client && !client.transportTerminated && !client.exited) return client;
    if (startPromise) return startPromise;
    const host = ensureSurfaceWindow();
    if (!fileSystem.existsSync(helperPath) || !fileSystem.existsSync(libmpvPath)) throw new Error('native-helper-runtime-missing');
    startPromise = (async function () {
      let owned;
      owned = new ClientClass({
        helperPath,
        libmpvPath,
        parentWindowHandle: decimalWindowHandle(host),
        expectedLibmpvVersion: EXPECTED_LIBMPV_VERSION,
        onEvent: function (message) {
          if (client !== owned) return;
          if (message.name === 'end-file' && message.value && message.value.reason === 4) {
            surfaceWanted = false;
            syncSurface('media-error');
            sendEvent({type: 'bridge_error', reason: 'load-failed'});
            log('load-failed', {reason: 'mpv-end-file-error'});
            return;
          }
          if (!observed.has(message.name)) return;
          sendEvent({type: 'property_change', generationId: message.generationId, data: {name: message.name, value: message.value}});
        },
        onTerminal: function (terminal) {
          if (client !== owned) return;
          crashCount += terminal.name === 'process-exit-terminal' || terminal.name === 'stdout-end' ? 1 : 0;
          surfaceWanted = false;
          syncSurface('helper-terminal');
          sendEvent({type: 'bridge_error', reason: terminal.name});
          log('helper-terminal', {reason: terminal.name});
          client = null;
          owned.kill().catch(function () {});
        }
      });
      startingClient = owned;
      try {
        await owned.start();
        if (destroyed) {
          await owned.kill();
          throw new Error('native-helper-service-destroyed');
        }
        if (everStarted) recreateCount += 1;
        everStarted = true;
        client = owned;
        log('helper-ready', {protocolVersion: PROTOCOL_VERSION, helperVersion: owned.handshake.helperVersion, libmpvVersion: owned.handshake.libmpvVersion});
        return owned;
      } finally {
        if (startingClient === owned) startingClient = null;
      }
    }()).finally(function () { startPromise = null; });
    return startPromise;
  }

  function requireEndpoint(endpointId) {
    if (typeof endpointId !== 'string' || !activeEndpointId || endpointId !== activeEndpointId) throw new Error('stale-endpoint');
  }

  function requireGeneration(active, payload) {
    const supplied = payload && payload.generationId == null ? null : payload.generationId;
    if (supplied !== active.currentGenerationId) throw new Error('stale-generation');
  }

  async function call(operation, request, endpointId) {
    const payload = request && typeof request === 'object' ? request : {};
    if (operation === 'create') {
      if (!activeEndpointId) activeEndpointId = crypto.randomUUID();
      const active = await ensureClient();
      return {status: 'ok', mode, endpointId: activeEndpointId, protocolVersion: PROTOCOL_VERSION, helperVersion: active.handshake.helperVersion, libmpvVersion: active.handshake.libmpvVersion};
    }
    if (operation === 'status') return status();
    requireEndpoint(endpointId);
    if (operation === 'destroy') {
      await destroyClient('renderer-destroy');
      activeEndpointId = null;
      return {status: 'ok'};
    }
    const active = operation === 'begin-generation' ? await ensureClient() : client;
    if (!active || active.transportTerminated || active.exited) throw new Error('native-helper-unavailable');
    if (operation === 'begin-generation') {
      const label = typeof payload.label === 'string' ? payload.label.slice(0, 128) : 'play';
      return {status: 'ok', generationId: active.beginGeneration(label, [...observed])};
    }
    if (operation === 'observe') {
      if (!Array.isArray(payload.properties) || payload.properties.some(name => !OBSERVED_PROPERTIES.has(name))) throw new Error('observed-property-not-allowed');
      payload.properties.forEach(name => observed.add(name));
      if (active.currentGenerationId !== null) active.command('activate-generation', {properties: [...observed]}, active.currentGenerationId);
      return {status: 'ok'};
    }
    if (operation === 'set-property') {
      requireGeneration(active, payload);
      const name = validatePropertyName(payload.name, SET_PROPERTIES);
      if (name === 'wid' || name === 'fullscreen') return {status: 'ok', handledBy: 'surface'};
      if (name === 'vo' || name === 'gpu-api') {
        if (!fixedSettingLogged.has(name)) { fixedSettingLogged.add(name); log('render-setting-fixed', {property: name}); }
        return {status: 'ok', handledBy: 'native-helper-render-path'};
      }
      active.setProperty(name, validateScalar(payload.value));
      return {status: 'accepted'};
    }
    if (operation === 'set-properties') {
      requireGeneration(active, payload);
      if (!Array.isArray(payload.entries) || payload.entries.length > 64) throw new Error('property-batch-invalid');
      payload.entries.forEach(function (entry) {
        const name = validatePropertyName(entry && entry.name, SET_PROPERTIES);
        if (name === 'wid' || name === 'fullscreen') return;
        if (name === 'vo' || name === 'gpu-api') {
          if (!fixedSettingLogged.has(name)) { fixedSettingLogged.add(name); log('render-setting-fixed', {property: name}); }
          return;
        }
        active.setProperty(name, validateScalar(entry.value));
      });
      return {status: 'accepted'};
    }
    if (operation === 'get-property') {
      requireGeneration(active, payload);
      const name = validatePropertyName(payload.name, GET_PROPERTIES);
      return {status: 'ok', value: await active.getProperty(name, 2000)};
    }
    if (operation === 'command') {
      requireGeneration(active, payload);
      const args = validateCommand(payload.data);
      if (args[0] === 'loadfile') {
        const load = active.load(args);
        load.promise.catch(function (error) {
          if (client !== active || !error || error.state === 'GENERATION_RETIRED') return;
          surfaceWanted = false;
          syncSurface('load-failed');
          sendEvent({type: 'bridge_error', reason: 'load-failed'});
          log('load-failed', {reason: String(error.message || 'load-failed').slice(0, 128)});
        });
        return {status: 'accepted'};
      }
      if (args[0] === 'stop') {
        surfaceWanted = false;
        syncSurface('stop');
        active.stop().catch(function () {});
        return {status: 'accepted'};
      }
      active.submitCommand(args);
      return {status: 'accepted'};
    }
    if (operation === 'set-visible') {
      requireGeneration(active, payload);
      surfaceWanted = payload.visible === true;
      syncSurface('renderer-visibility');
      return {status: 'ok'};
    }
    if (operation === 'surface-status') {
      return {status: 'ok', value: await active.request('surface-status', {}, {generationId: active.currentGenerationId || active.allocateGenerationId(), mediaScoped: false, timeoutMs: 2000})};
    }
    throw new Error('operation-not-allowed');
  }

  function notify(operation, request, endpointId) {
    if (destroyed) return;
    if (!activeEndpointId || endpointId !== activeEndpointId) return;
    if (operation === 'retire-generation' && client && request && request.generationId === client.currentGenerationId) {
      client.retireGeneration(request.reason || 'retired');
    }
    if (operation === 'set-visible') {
      if (!client || !request || request.generationId !== client.currentGenerationId) return;
      surfaceWanted = request && request.visible === true;
      syncSurface('renderer-notify-visibility');
    }
  }

  async function destroyClient(reason) {
    surfaceWanted = false;
    syncSurface(reason);
    const owned = client;
    client = null;
    if (owned) {
      owned.retireGeneration(reason);
      await owned.kill();
    }
  }

  async function destroy() {
    if (destroyed) return;
    destroyed = true;
    activeEndpointId = null;
    invalidateSurfacePlacement();
    if (startingClient) {
      try { await startingClient.kill(); } catch (_) { }
    }
    if (startPromise) {
      try { await startPromise; } catch (_) { }
    }
    await destroyClient('service-destroy');
    for (const binding of boundWindowEvents.splice(0)) {
      try { binding.main.removeListener(binding.name, binding.listener); } catch (_) { }
    }
    if (surfaceWindow && !surfaceWindow.isDestroyed()) surfaceWindow.destroy();
    surfaceWindow = null;
  }

  function status() {
    return {
      status: 'ok',
      mode,
      protocolVersion: PROTOCOL_VERSION,
      state: client && !client.transportTerminated ? 'ready' : startPromise ? 'starting' : 'stopped',
      surfaceVisible: !!(surfaceWindow && !surfaceWindow.isDestroyed() && surfaceWindow.isVisible()),
      helperVersion: client && client.handshake ? client.handshake.helperVersion : null,
      libmpvVersion: client && client.handshake ? client.handshake.libmpvVersion : EXPECTED_LIBMPV_VERSION,
      libmpvSha256: EXPECTED_LIBMPV_SHA256,
      crashCount,
      recreateCount
    };
  }

  return {call, destroy, mode, notify, status};
}

function register(options) {
  const ipcMain = options.ipcMain;
  const service = options.service;
  const getWebContents = options.getWebContents;
  function trusted(event) {
    const expected = getWebContents();
    return !!expected && event && event.sender === expected;
  }
  ipcMain.handle(CALL_CHANNEL, async function (event, request) {
    if (!trusted(event)) return {status: 'error', reason: 'untrusted_sender'};
    try { return await service.call(request && request.operation, request && request.payload, request && request.endpointId); }
    catch (error) { return {status: 'error', reason: String(error && error.message || 'native_helper_failed')}; }
  });
  const notifyListener = function (event, request) {
    if (!trusted(event)) return;
    try { service.notify(request && request.operation, request && request.payload, request && request.endpointId); } catch (_) { }
  };
  ipcMain.on(NOTIFY_CHANNEL, notifyListener);
  return async function unregister() {
    if (typeof ipcMain.removeHandler === 'function') ipcMain.removeHandler(CALL_CHANNEL);
    if (typeof ipcMain.removeListener === 'function') ipcMain.removeListener(NOTIFY_CHANNEL, notifyListener);
    await service.destroy();
  };
}

module.exports = {
  CALL_CHANNEL,
  EVENT_CHANNEL,
  EXPECTED_LIBMPV_SHA256,
  EXPECTED_LIBMPV_VERSION,
  NOTIFY_CHANNEL,
  createService,
  decimalWindowHandle,
  register,
  resolveMode,
  validateCommand
};
