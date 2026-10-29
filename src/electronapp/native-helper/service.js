'use strict';
const preloadDiagnostics = require('../enhanced/playback-range-diagnostics');

const previewSnapshot = require('./preview-snapshot');

const rendererBoundary = require('../enhanced/renderer-boundary');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('node:child_process');
const {NativeHelperClient, PROTOCOL_VERSION} = require('./controller');
const {createNativeDiagnostics, mpvErrorCode} = require('../enhanced/native-diagnostics');

const CALL_CHANNEL = 'enhanced-native-helper-call';
const NOTIFY_CHANNEL = 'enhanced-native-helper-notify';
const EVENT_CHANNEL = 'enhanced-native-helper-event';
const WINDOW_PLACEMENT_MODE = '--place-window-behind';
const WINDOW_PLACEMENT_TIMEOUT_MS = 2000;
const EXPECTED_LIBMPV_VERSION = 'mpv v0.41.0-920-gdd5d17d32';
const EXPECTED_LIBMPV_SHA256 = '965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c';
const EXPECTED_MPV_CLIENT_API_VERSION = 131077;
// This is the required capability subset accepted by the unchanged controller handshake.
const STATUS_CAPABILITIES = Object.freeze([
  'private-inherited-pipe', 'native-child-hwnd', 'gpu-next', 'd3d11', 'generation-attribution'
]);

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

function normalizeStartupKernelSelection(value) {
  if (value && value.kind === 'candidate' && /^[0-9a-f]{64}$/.test(value.candidateId || '') &&
      typeof value.libmpvPath === 'string' && path.isAbsolute(value.libmpvPath) &&
      typeof value.expectedLibmpvVersion === 'string' && /^mpv v[\x20-\x7e]{1,123}$/.test(value.expectedLibmpvVersion)) {
    return Object.freeze({
      kind: 'candidate',
      candidateId: value.candidateId,
      libmpvPath: path.resolve(value.libmpvPath),
      expectedLibmpvVersion: value.expectedLibmpvVersion
    });
  }
  if (value && value.kind === 'baseline') {
    return Object.freeze({
      kind: 'baseline',
      selectionState: value.selectionState === 'invalid' ? 'invalid' : 'valid',
      invalidCandidateId: /^[0-9a-f]{64}$/.test(value.invalidCandidateId || '') ? value.invalidCandidateId : null,
      reasonCode: /^[a-z0-9-]{1,48}$/.test(value.reasonCode || '') ? value.reasonCode : null
    });
  }
  return Object.freeze({kind: 'baseline', selectionState: value ? 'invalid' : 'valid', invalidCandidateId: null, reasonCode: value ? 'selection-invalid' : null});
}

function createService(options) {
  const settings = options || {};
  function readRangeConfig() {
    try {const config = typeof settings.getRangeCacheConfig === 'function' ? settings.getRangeCacheConfig() : settings.rangeCache; return config && ['next-prefix', 'shared-byte-trial', 'source-aware'].includes(config.kind) ? {...config} : null;} catch (_) {return null;}
  }
  function reportPreload(value) {
    const safe = preloadDiagnostics.snapshot(value);
    try {if (typeof settings.logger === 'function') settings.logger({category: 'preload', event: 'decision', details: safe});} catch (_) {}
    return safe;
  }
  function authorizeRange(value, role, signal, helper, generationId) {
    const owner = rangeGenerationOwner, authority = settings.sourceAuthority;
    if (!authority || !owner || owner.helper !== helper || owner.generationId !== generationId ||
        owner.principal !== authority.principalFor(getWebContents())) throw preloadDiagnostics.error('source-proof-invalid', 'range-source-proof-invalid');
    return authority.bind({sourceProof: value.sourceProof, source: value.source, principal: owner.principal, signal,
      ...(role === 'current' ? {requestId: owner.label} : {requestPrefix: owner.scope + '-next-'})});
  }
  function authorizeOrdinaryRange(value, role, signal, helper, generationId) {
    const owner = rangeGenerationOwner, authority = settings.sourceAuthority;
    if (!authority || !owner || !['current', 'next'].includes(role) || owner.helper !== helper || owner.generationId !== generationId || !helper || helper.exited || helper.transportTerminated || helper.currentGenerationId !== generationId ||
        owner.principal !== authority.principalFor(getWebContents()) || value && value.sourceProof !== undefined) throw preloadDiagnostics.error('source-proof-invalid', 'range-source-proof-invalid');
    const parsed = require('../enhanced/playback-range-session').parseContext(value);
    if (!parsed) throw preloadDiagnostics.error('source-proof-invalid', 'range-source-proof-invalid');
    const requestId = role === 'current' ? owner.label : owner.scope + '-next-emby';
    const proof = authority.issue({principal: owner.principal, requestId, source: parsed.source, sourceKind: 'emby-http',
      resourceKey: crypto.createHash('sha256').update(JSON.stringify(parsed.identity)).digest('hex')});
    return authority.bind({sourceProof: proof, source: parsed.source, principal: owner.principal, signal,
      ...(role === 'current' ? {requestId: owner.label} : {requestPrefix: owner.scope + '-next-'})});
  }
  const sharedBudget = require('./shared-cache-budget').createBudgetReader((helper, generationId) =>
    !destroyed && helper === client && !helper.exited && !helper.transportTerminated && helper.currentGenerationId === generationId);
  function readSharedCurrentBytes(helper, generationId) {return sharedBudget.read(helper, generationId);}
  function primeSharedBudget(helper) {
    if (rangeSession && (rangeConfigKind === 'shared-byte-trial' || rangeConfigKind === 'source-aware' &&
        rangeSession.status().kind === 'shared-byte-trial' && rangeSession.status().current.state !== 'idle')) sharedBudget.read(helper, helper.currentGenerationId);
  }
  function changesSharedBudget(name) {return name === 'demuxer-max-bytes' || name === 'profile';}
  function createRangeSession(config) {
    if (config.kind === 'source-aware') return require('../enhanced/playback-range-source-session').createSourceSession({config,
      onDiagnostic: reportPreload, readCurrentBytes: readSharedCurrentBytes, authorize: settings.sourceAuthority ? authorizeRange : undefined,
      authorizeOrdinary: settings.sourceAuthority ? authorizeOrdinaryRange : undefined});
    return require('../enhanced/playback-range-session').createSession({config, onDiagnostic: reportPreload,
    ...(config.kind === 'shared-byte-trial' ? {create: require('../enhanced/shared-playback-cache/adapter').createCache, readCurrentBytes: readSharedCurrentBytes,
      authorizeOrdinary: settings.sourceAuthority ? authorizeOrdinaryRange : undefined} : {}),
    authorize: settings.sourceAuthority ? authorizeRange : undefined});}
  function rangeKey(config) {return JSON.stringify(config && ['kind', 'root', 'sharedRoot', 'blockBytes', 'timeoutMs', 'progressPercent', 'preloadMB', 'bytesPerSecond'].map(key => config[key] == null ? null : config[key]));}
  const initialRangeConfig = readRangeConfig();
  let rangeSession = initialRangeConfig ? createRangeSession(initialRangeConfig) : null;
  let rangeConfigKind = initialRangeConfig && initialRangeConfig.kind;
  let rangeConfigKey = rangeKey(initialRangeConfig), rangeApplyTail = Promise.resolve(), rangeCloseFailure = null;
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
  const kernelStore = settings.kernelStore || null;
  const startupKernel = normalizeStartupKernelSelection(settings.startupKernelSelection || null);
  const baselineKernelTarget = Object.freeze({candidateId: null, libmpvPath,
    expectedLibmpvVersion: EXPECTED_LIBMPV_VERSION, sha256: EXPECTED_LIBMPV_SHA256});
  const startupCandidateTarget = startupKernel.kind === 'candidate'
    ? Object.freeze({candidateId: startupKernel.candidateId, libmpvPath: startupKernel.libmpvPath,
        expectedLibmpvVersion: startupKernel.expectedLibmpvVersion, sha256: startupKernel.candidateId})
    : null;
  let effectiveKernelTarget = startupCandidateTarget || baselineKernelTarget;
  let client = null;
  let startingClient = null;
  let startPromise = null;
  let surfaceWindow = null;
  let surfaceWanted = false;
  let crashCount = 0;
  let recreateCount = 0;
  let everStarted = false;
  let activeKernelId = null;
  let activeKernelVersion = EXPECTED_LIBMPV_VERSION;
  let activeKernelSha256 = EXPECTED_LIBMPV_SHA256;
  let kernelActivationState = startupKernel.kind === 'candidate' ? 'candidate-pending' :
    startupKernel.invalidCandidateId ? 'candidate-invalid-pending-fallback' : 'baseline-lazy';
  let kernelFailureReason = startupKernel.reasonCode;
  let startupKernelFailure = null;
  let candidateStartupAttempted = false;
  let kernelFallbackOccurred = false;
  let destroyed = false;
  let destroyPromise = null;
  const pendingClientDestructions = new Set();
  let activeEndpointId = null;
  let generationEpoch = 0;
  let rangePreloadEpoch = 0;
  let rangeGenerationOwner = null;
  let rendererEpoch = 0;
  let presentationEpoch = 0;
  let presentationTokenHighWater = 0;
  let presentation = null;
  let lastVisibleMedia = null;
  let surfaceEpoch = 0;
  let placementRevision = 0;
  let placementInFlight = null;
  let placementPending = null;
  let placementChild = null;
  const observed = new Set();
  const fixedSettingLogged = new Set();
  const boundWindowEvents = [];
  const diagnostic = createNativeDiagnostics(logger);
  const helperRuns = new WeakMap();
  let helperRunSequence = 0;

  function observe(name, disposition, record, reason) {
    try {
      const owner = record && record.client || client;
      const generationId = record ? record.targetGeneration || record.sourceGenerationId :
        owner && owner.currentGenerationId || lastVisibleMedia && lastVisibleMedia.client === owner && lastVisibleMedia.generationId;
      diagnostic({name, disposition, reason, helperRun: owner && helperRuns.get(owner), generationId,
        currentGenerationId: owner && owner.currentGenerationId, transitionId: record && record.token,
        sourceGenerationId: record && record.sourceGenerationId});
    } catch (_) { /* Observation has no ownership or playback authority. */ }
  }

  function log(event, details) {
    try { logger({category: 'native-helper', event, details: details || {}}); } catch (_) { }
  }

  function validToken(value) { return Number.isSafeInteger(value) && value > 0; }

  function acceptRendererEpoch(payload) {
    // Older local callers omit this field; renderer Endpoints always send it.
    if (payload.requestEpoch == null) return;
    if (!validToken(payload.requestEpoch) || payload.requestEpoch <= rendererEpoch) throw new Error('generation-superseded');
    rendererEpoch = payload.requestEpoch;
  }

  function releaseHold(record, holdId) {
    if (!record || !validToken(holdId) || record.client !== client || record.client.exited || record.client.transportTerminated) return;
    try {
      record.client.request('presentation-release', {holdId}, {
        generationId: record.client.allocateGenerationId(), mediaScoped: false, timeoutMs: 1500
      }).catch(function () {});
    } catch (_) { /* Helper termination already removes its native child. */ }
  }

  function cancelPreparation(record) {
    if (!record || !validToken(record.controlGenerationId) || record.client !== client || record.client.exited || record.client.transportTerminated) return;
    try {
      record.client.request('presentation-cancel-preparation', {preparationGenerationId: record.controlGenerationId}, {
        generationId: record.client.allocateGenerationId(), mediaScoped: false, timeoutMs: 1500
      }).catch(function () {});
    } catch (_) { /* A timed-out prepare is cancelled on the same ordered transport. */ }
  }

  function clearPresentation(record) {
    if (!record || presentation !== record) return;
    observe('presentation-clear', 'cleared', record);
    presentation = null;
    ++presentationEpoch;
    cancelPreparation(record);
    releaseHold(record, record.holdId);
  }

  function ownsPresentation(record) {
    return !!record && presentation === record && record.epoch === presentationEpoch &&
      record.client === client && record.endpointId === activeEndpointId && !destroyed;
  }

  async function preparePresentation(active, endpointId, token) {
    if (!validToken(token)) throw new Error('presentation-token-invalid');
    if (token <= presentationTokenHighWater) return {status: 'ok', ready: false};
    presentationTokenHighWater = token;
    const main = getMainWindow();
    if (active.currentGenerationId !== null || !lastVisibleMedia || lastVisibleMedia.client !== active ||
        !surfaceWanted || !surfaceWindow || surfaceWindow.isDestroyed() || !surfaceWindow.isVisible() ||
        !main || main.isDestroyed() || !main.isVisible() || main.isMinimized()) {
      clearPresentation(presentation);
      observe('presentation-prepare', 'unavailable');
      return {status: 'ok', ready: false};
    }
    const previous = presentation;
    const record = {token, client: active, endpointId, epoch: ++presentationEpoch, holdId: null,
      controlGenerationId: active.allocateGenerationId(), targetGeneration: null, sourceGenerationId: lastVisibleMedia.generationId};
    presentation = record;
    observe('presentation-prepare', 'requested', record);
    let result;
    try {
      result = await active.request('presentation-prepare', {sourceGenerationId: lastVisibleMedia.generationId}, {
        generationId: record.controlGenerationId, mediaScoped: false, timeoutMs: 2500
      });
    } catch (_) { result = null; }
    if (!ownsPresentation(record)) {
      observe('presentation-prepare', 'stale', record);
      cancelPreparation(record);
      if (result && validToken(result.holdId)) releaseHold(record, result.holdId);
      return {status: 'ok', ready: false};
    }
    if (!result || result.ready !== true || result.painted !== true || !validToken(result.holdId)) {
      observe('presentation-prepare', 'unavailable', record);
      clearPresentation(record);
      if (previous) { cancelPreparation(previous); releaseHold(previous, previous.holdId); }
      return {status: 'ok', ready: false};
    }
    record.holdId = result.holdId;
    observe('presentation-prepare', 'ready', record);
    if (previous) { cancelPreparation(previous); releaseHold(previous, previous.holdId); }
    return {status: 'ok', ready: true};
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
      const current = requestIsCurrent(request);
      if (error && !request.cancelled) {
        if (!current) hideSurfaceAfterStalePlacement(request);
        log('surface-z-order-warning', {reason: request.reason, stale: !current, failure: safePlacementFailure(error)});
      } else if (!current) {
        hideSurfaceAfterStalePlacement(request);
        log('surface-z-order-stale', {reason: request.reason});
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
    placementPending = {reason, revision, surface, surfaceEpoch, surfaceHandle, main, mainHandle, cancelled: false};
    runPendingPlacement();
  }

  function invalidateSurfacePlacement() {
    ++placementRevision;
    placementPending = null;
    if (placementInFlight) placementInFlight.cancelled = true;
    const child = placementChild;
    if (child && typeof child.kill === 'function') {
      try { child.kill(); } catch (_) { }
    }
  }

  function syncSurfaceBounds() {
    const main = getMainWindow();
    if (!surfaceWindow || surfaceWindow.isDestroyed() || !main || main.isDestroyed()) return;
    surfaceWindow.setBounds(main.getBounds(), false);
  }

  function syncSurfaceVisibility(reason) {
    const main = getMainWindow();
    if (!surfaceWindow || surfaceWindow.isDestroyed() || !main || main.isDestroyed()) return;
    if (!surfaceWanted || !main.isVisible() || main.isMinimized()) {
      invalidateSurfacePlacement();
      surfaceWindow.hide();
      observe('surface-hidden', 'hidden', null, reason);
      return;
    }
    syncSurfaceBounds();
    if (!surfaceWindow.isVisible()) {
      surfaceWindow.showInactive();
      placeSurfaceBehindMain(main, reason);
    }
    log('surface-sync', {reason, visible: true});
  }

  function syncSurfaceLifecycle(reason) {
    const main = getMainWindow();
    if (!surfaceWindow || surfaceWindow.isDestroyed() || !main || main.isDestroyed()) return;
    if (!surfaceWanted || !main.isVisible() || main.isMinimized()) {
      invalidateSurfacePlacement();
      surfaceWindow.hide();
      observe('surface-hidden', 'hidden', null, reason);
      return;
    }
    syncSurfaceBounds();
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
      // This carrier follows main bounds; it has no user-owned resize frame.
      // WS_THICKFRAME paints a top border even underneath the transparent UI.
      thickFrame: false,
      resizable: false,
      movable: false,
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
      ['move', 'resize'].forEach(function (name) {
        bindMainWindowEvent(name, function () { syncSurfaceBounds(); });
      });
      ['maximize', 'unmaximize', 'restore', 'enter-full-screen', 'leave-full-screen', 'show', 'focus'].forEach(function (name) {
        bindMainWindowEvent(name, function () { syncSurfaceLifecycle(name); });
      });
      ['minimize', 'hide'].forEach(function (name) {
        bindMainWindowEvent(name, function () { syncSurfaceVisibility(name); });
      });
      bindMainWindowEvent('closed', function () { destroy().catch(function () {}); });
    }
    return surfaceWindow;
  }

  function recordKernelActivation(candidateId, outcome, reasonCode) {
    if (!kernelStore || typeof kernelStore.recordActivationResult !== 'function') return Promise.resolve(null);
    return Promise.resolve(kernelStore.recordActivationResult(candidateId, outcome, reasonCode)).catch(function () {
      kernelFailureReason = 'activation-state-write-failed';
      log('kernel-activation-state-write-failed', {outcome});
      return null;
    });
  }

  function candidateFailureCode(error) {
    const code = String(error && (error.code || error.message) || '');
    return ['invalid-helper-handshake', 'missing-helper-capability', 'unexpected-libmpv-version'].includes(code)
      ? 'candidate-handshake-failed'
      : code === 'candidate-integrity-failed' || code === 'candidate-not-found'
        ? 'candidate-integrity-failed'
        : 'candidate-start-failed';
  }

  async function startTarget(target, candidateStartup) {
    if (destroyed) throw new Error('native-helper-service-destroyed');
    activeKernelVersion = target.expectedLibmpvVersion;
    activeKernelSha256 = target.sha256;
    if (target.candidateId) {
      if (!kernelStore || typeof kernelStore.verifyCandidateForStartup !== 'function') throw Object.assign(new Error('candidate-integrity-failed'), {code: 'candidate-integrity-failed'});
      await kernelStore.verifyCandidateForStartup(target.candidateId, target.expectedLibmpvVersion);
      if (destroyed) throw new Error('native-helper-service-destroyed');
    }
    const host = ensureSurfaceWindow();
    if (!fileSystem.existsSync(helperPath) || !fileSystem.existsSync(target.libmpvPath)) throw new Error('native-helper-runtime-missing');
    let owned;
    const helperRun = ++helperRunSequence;
    owned = new ClientClass({
      helperPath,
      libmpvPath: target.libmpvPath,
      parentWindowHandle: decimalWindowHandle(host),
      expectedLibmpvVersion: target.expectedLibmpvVersion,
      onDiagnostic: function (record) { diagnostic(Object.assign({}, record, {helperRun})); },
      onEvent: function (message) {
        if (client !== owned) return;
        if (rangeSession && message.name === 'core-idle' && message.value === false) {
          rangeSession.started(owned, message.generationId).catch(function () {log('range-cache-unavailable', {});});
        }
        if (message.name === 'end-file' && message.value && message.value.reason === 4) {
          if (message.generationId !== owned.currentGenerationId) return;
          clearPresentation(presentation);
          surfaceWanted = false;
          syncSurfaceVisibility('media-error');
          sendEvent({type: 'bridge_error', reason: 'load-failed', endReason: 4,
            mpvErrorCode: mpvErrorCode(message.value.error)});
          log('load-failed', {reason: 'mpv-end-file-error'});
          return;
        }
        if (message.name === 'playback-restart') {
          if (message.generationId !== owned.currentGenerationId) return;
        } else if (!observed.has(message.name)) return;
        sendEvent({type: 'property_change', generationId: message.generationId, data: {name: message.name, value: message.value}});
      },
      onTerminal: function (terminal) {
        if (client !== owned) return;
        if (rangeSession) retireRangeSession().catch(function () {log('range-cache-unavailable', {});});
        crashCount += terminal.name === 'process-exit-terminal' || terminal.name === 'stdout-end' ? 1 : 0;
        clearPresentation(presentation);
        lastVisibleMedia = null;
        ++generationEpoch;
        surfaceWanted = false;
        syncSurfaceVisibility('helper-terminal');
        sendEvent({type: 'bridge_error', reason: terminal.name});
        log('helper-terminal', {reason: terminal.name});
        if (activeKernelId) {
          kernelActivationState = 'candidate-runtime-failed';
          kernelFailureReason = 'candidate-runtime-failed';
        }
        client = null;
        // Transport death releases playback authority, not owned-exit waiting.
        const completion = owned.kill();
        pendingClientDestructions.add(completion);
        completion.then(function () { pendingClientDestructions.delete(completion); },
          function () { pendingClientDestructions.delete(completion); });
      }
    });
    helperRuns.set(owned, helperRun);
    startingClient = owned;
    try {
      await owned.start();
      if (destroyed) {
        await owned.kill();
        if (owned.exitPromise) await owned.exitPromise;
        throw new Error('native-helper-service-destroyed');
      }
      if (everStarted) recreateCount += 1;
      everStarted = true;
      client = owned;
      activeKernelId = target.candidateId;
      activeKernelVersion = owned.handshake.libmpvVersion;
      activeKernelSha256 = target.sha256;
      kernelActivationState = target.candidateId
        ? 'candidate-active'
        : candidateStartup ? 'candidate-fallback-baseline-active' : 'baseline-active';
      log('helper-ready', {protocolVersion: PROTOCOL_VERSION, helperVersion: owned.handshake.helperVersion, libmpvVersion: owned.handshake.libmpvVersion});
      if (target.candidateId) await recordKernelActivation(target.candidateId, 'candidate-ready', 'candidate-ready');
      return owned;
    } catch (error) {
      if (client === owned) client = null;
      let exited = owned.exited === true;
      try {
        await owned.kill();
        if (owned.exitPromise) await owned.exitPromise;
        exited = owned.exited === true || exited;
      } catch (_) { exited = owned.exited === true; }
      if (!exited) {
        const failure = new Error('native-helper-exit-unconfirmed');
        failure.fallbackSafe = false;
        throw failure;
      }
      throw error;
    } finally {
      if (startingClient === owned) startingClient = null;
    }
  }

  function ensureClient() {
    if (destroyed) return Promise.reject(new Error('native-helper-service-destroyed'));
    if (startupKernelFailure) return Promise.reject(new Error('native-helper-startup-failed'));
    if (client && !client.transportTerminated && !client.exited) return Promise.resolve(client);
    if (startPromise) return startPromise;
    startPromise = (async function () {
      if (!candidateStartupAttempted && (startupKernel.kind === 'candidate' || startupKernel.invalidCandidateId)) {
        candidateStartupAttempted = true;
        let reasonCode = startupKernel.reasonCode || 'candidate-start-failed';
        if (startupKernel.kind === 'candidate') {
          kernelActivationState = 'candidate-starting';
          try {
            return await startTarget(effectiveKernelTarget, true);
          } catch (error) {
            if (destroyed) throw new Error('native-helper-service-destroyed');
            if (error && error.fallbackSafe === false) {
              reasonCode = 'candidate-exit-unconfirmed';
              kernelActivationState = 'candidate-exit-unconfirmed';
              kernelFailureReason = reasonCode;
              startupKernelFailure = reasonCode;
              await recordKernelActivation(startupKernel.candidateId, 'candidate-fallback', reasonCode);
              throw new Error('native-helper-startup-failed');
            }
            reasonCode = candidateFailureCode(error);
            effectiveKernelTarget = baselineKernelTarget;
            kernelFallbackOccurred = true;
            kernelActivationState = 'candidate-fallback-baseline-starting';
            kernelFailureReason = reasonCode;
            await recordKernelActivation(startupKernel.candidateId, 'candidate-fallback', reasonCode);
          }
        } else {
          effectiveKernelTarget = baselineKernelTarget;
          kernelFallbackOccurred = true;
          kernelActivationState = 'candidate-invalid-fallback-baseline-starting';
          reasonCode = startupKernel.reasonCode || 'candidate-integrity-failed';
          kernelFailureReason = reasonCode;
          await recordKernelActivation(startupKernel.invalidCandidateId, 'candidate-fallback', reasonCode);
        }
        try {
          return await startTarget(effectiveKernelTarget, true);
        } catch (error) {
          if (destroyed || error && error.message === 'native-helper-service-destroyed') {
            throw new Error('native-helper-service-destroyed');
          }
          kernelActivationState = 'baseline-start-failed';
          startupKernelFailure = 'base-start-failed';
          kernelFailureReason = 'base-start-failed';
          await recordKernelActivation(startupKernel.candidateId || startupKernel.invalidCandidateId,
            'baseline-start-failed', 'base-start-failed');
          throw new Error('native-helper-startup-failed');
        }
      }

      try {
        return await startTarget(effectiveKernelTarget, kernelFallbackOccurred);
      } catch (error) {
        if (destroyed || error && error.message === 'native-helper-service-destroyed') {
          throw new Error('native-helper-service-destroyed');
        }
        if (kernelFallbackOccurred && effectiveKernelTarget.candidateId === null) {
          kernelActivationState = 'baseline-start-failed';
          startupKernelFailure = 'base-start-failed';
          kernelFailureReason = 'base-start-failed';
          await recordKernelActivation(startupKernel.candidateId || startupKernel.invalidCandidateId,
            'baseline-start-failed', 'base-start-failed');
          throw new Error('native-helper-startup-failed');
        }
        throw error;
      }
    }()).finally(function () { startPromise = null; });
    return startPromise;
  }

  function prewarm() {
    if (startupKernel.kind !== 'candidate' && !startupKernel.invalidCandidateId) {
      return Promise.resolve({status: 'skipped', reason: 'baseline-selected'});
    }
    return ensureClient().then(function () {
      return {status: 'ready', kernel: kernelActivationState};
    }).catch(function () {
      return {status: 'failed', kernel: kernelActivationState, reasonCode: kernelFailureReason || 'base-start-failed'};
    });
  }

  function retireRangeSession() {
    ++rangePreloadEpoch; rangeGenerationOwner = null; sharedBudget.retire();
    const owned = rangeSession; return owned ? owned.retire() : Promise.resolve();
  }

  function applyRangeConfig(expectedEpoch) {
    const job = rangeApplyTail.then(async function () {
      if (destroyed || expectedEpoch !== generationEpoch) return;
      const desired = readRangeConfig();
      if (rangeKey(desired) === rangeConfigKey) return;
      if (rangeCloseFailure) throw rangeCloseFailure;
      ++rangePreloadEpoch;
      const old = rangeSession; rangeSession = null; rangeConfigKey = rangeKey(null);
      if (old) {
        try {await old.close();} catch (error) {rangeCloseFailure = error; throw error;}
      }
      if (destroyed || expectedEpoch !== generationEpoch) return;
      // Save can finish while the old readers close: publish only the latest config.
      const latest = readRangeConfig();
      rangeSession = latest ? createRangeSession(latest) : null;
      rangeConfigKey = rangeKey(latest); rangeConfigKind = latest && latest.kind;
    });
    rangeApplyTail = job.catch(function () {}); return job;
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
      if (!activeEndpointId) {
        activeEndpointId = crypto.randomUUID();
        rendererEpoch = 0;
        presentationTokenHighWater = 0;
      }
      const createdEndpointId = activeEndpointId;
      const active = await ensureClient();
      requireEndpoint(createdEndpointId);
      return {status: 'ok', mode, endpointId: createdEndpointId, protocolVersion: PROTOCOL_VERSION, helperVersion: active.handshake.helperVersion, libmpvVersion: active.handshake.libmpvVersion,
        rangeCache: rangeSession ? rangeSession.status() : null};
    }
    if (operation === 'status') return status();
    requireEndpoint(endpointId);
    if (operation === 'destroy') {
      // Retire this endpoint before awaiting its process. A new create owns a
      // different ID, and this completion must never revoke the replacement.
      const retiringRange = rangeSession ? retireRangeSession() : Promise.resolve();
      activeEndpointId = null;
      const outcomes = await Promise.allSettled([destroyClient('renderer-destroy'), retiringRange]);
      const failure = outcomes.find(outcome => outcome.status === 'rejected');
      if (failure) throw failure.reason;
      return {status: 'ok'};
    }
    let beginEpoch;
    if (operation === 'begin-generation') {
      acceptRendererEpoch(payload);
      beginEpoch = ++generationEpoch;
      if (rangeSession) await retireRangeSession();
      try {await applyRangeConfig(beginEpoch);} catch (_) {log('range-cache-unavailable', {});}
    }
    const active = operation === 'begin-generation' ? await ensureClient() : client;
    if (!active || active.transportTerminated || active.exited) throw new Error('native-helper-unavailable');
    if (operation === 'begin-generation') {
      requireEndpoint(endpointId);
      if (beginEpoch !== generationEpoch || active !== client) throw new Error('generation-superseded');
      const label = typeof payload.label === 'string' ? payload.label.slice(0, 128) : 'play';
      const generationId = active.beginGeneration(label, [...observed], payload.diagnosticIdentity);
      const record = presentation;
      if (ownsPresentation(record) && record.token === payload.presentationToken && validToken(record.holdId)) {
        record.targetGeneration = generationId;
        let result;
        try {
          result = await active.request('presentation-arm', {holdId: record.holdId}, {
            generationId, mediaScoped: false, timeoutMs: 2000
          });
        } catch (_) { result = null; }
        observe('presentation-arm', !ownsPresentation(record) ? 'stale' :
          result && result.ready === true && result.status === 'armed' && result.holdId === record.holdId ? 'ready' : 'unavailable', record);
        if (ownsPresentation(record) && (!result || result.ready !== true || result.status !== 'armed' ||
            result.holdId !== record.holdId)) clearPresentation(record);
      } else {
        clearPresentation(record);
      }
      if (beginEpoch !== generationEpoch || active !== client || endpointId !== activeEndpointId ||
          active.currentGenerationId !== generationId) throw new Error('generation-superseded');
      rangeGenerationOwner = rangeSession && settings.sourceAuthority ? {helper: active, generationId, label,
        scope: crypto.randomUUID(), principal: settings.sourceAuthority.principalFor(getWebContents())} : null;
      return {status: 'ok', generationId, rangeCache: rangeSession ? rangeSession.status() : null,
        ...(rangeGenerationOwner ? {rangeResolutionScope: rangeGenerationOwner.scope} : {})};
    }
    if (operation === 'range-context') {
      requireGeneration(active, payload);
      ++rangePreloadEpoch;
      const value = rangeSession ? await rangeSession.setContext(payload.context, active, active.currentGenerationId) : {state: 'disabled'};
      if (rangeConfigKind === 'source-aware' && active === client && active.currentGenerationId === payload.generationId &&
          value && value.state === 'ready' && !value.diagnostic) primeSharedBudget(active);
      return {status: 'ok', value};
    }
    if (operation === 'range-cancel-next') {
      requireGeneration(active, payload);
      ++rangePreloadEpoch;
      if (rangeSession) await rangeSession.cancelNext();
      return {status: 'ok'};
    }
    if (operation === 'range-status') {
      requireGeneration(active, payload);
      return {status: 'ok', value: rangeSession ? rangeSession.status() : {enabled: false}};
    }
    if (operation === 'range-preload') {
      requireGeneration(active, payload);
      if (!rangeSession) return {status: 'ok', value: {state: 'unavailable'}};
      // Queue cancellation/replacement can retire a candidate without changing generation.
      const generationId = active.currentGenerationId, candidateEpoch = ++rangePreloadEpoch, ownedRange = rangeSession;
      let values;
      try {values = await Promise.all([active.getProperty('time-pos', 2000), active.getProperty('duration', 2000)]);}
      catch (_) {
        if (candidateEpoch !== rangePreloadEpoch || ownedRange !== rangeSession || destroyed || endpointId !== activeEndpointId || active !== client || active.currentGenerationId !== generationId) return {status: 'ok', value: {state: 'cancelled'}};
        return {status: 'ok', value: {state: 'unavailable', diagnostic: reportPreload({stage: 'progress-check', reason: 'proxy-unavailable'})}};
      }
      if (candidateEpoch !== rangePreloadEpoch || ownedRange !== rangeSession) return {status: 'ok', value: {state: 'cancelled'}};
      if (destroyed || endpointId !== activeEndpointId || active !== client || active.currentGenerationId !== generationId) return {status: 'ok', value: {state: 'unavailable'}};
      if (!Number.isFinite(values[0]) || !Number.isFinite(values[1]) || values[1] <= 0 ||
          values[0] / values[1] * 100 < ownedRange.status().progressPercent) return {status: 'ok', value: {state: 'progress-pending'}};
      return {status: 'ok', value: await ownedRange.preload(payload.context, active, generationId)};
    }
    if (operation === 'prepare-presentation') return preparePresentation(active, endpointId, payload.token);
    if (operation === 'cancel-presentation') {
      if (!validToken(payload.token)) throw new Error('presentation-token-invalid');
      const record = presentation;
      if (ownsPresentation(record) && record.token === payload.token) {
        clearPresentation(record);
        if (active.currentGenerationId === null) {
          surfaceWanted = false;
          syncSurfaceVisibility('presentation-cancelled');
        }
      }
      return {status: 'ok'};
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
      const value = validateScalar(payload.value);
      if (changesSharedBudget(name)) sharedBudget.beforeWrite();
      active.setProperty(name, value);
      if (changesSharedBudget(name)) primeSharedBudget(active);
      return {status: 'accepted'};
    }
    if (operation === 'set-properties') {
      requireGeneration(active, payload);
      if (!Array.isArray(payload.entries) || payload.entries.length > 64) throw new Error('property-batch-invalid');
      // Preflight the whole batch before any native write. A rejected batch may
      // not partially change a budget already leased to a dispatched source.
      const entries = payload.entries.map(entry => {
        const name = validatePropertyName(entry && entry.name, SET_PROPERTIES);
        return {name, value: ['wid', 'fullscreen', 'vo', 'gpu-api'].includes(name) ? entry.value : validateScalar(entry.value)};
      });
      if (entries.some(entry => changesSharedBudget(entry.name))) sharedBudget.beforeWrite();
      entries.forEach(function ({name, value}) {
        if (name === 'wid' || name === 'fullscreen') return;
        if (name === 'vo' || name === 'gpu-api') {
          if (!fixedSettingLogged.has(name)) { fixedSettingLogged.add(name); log('render-setting-fixed', {property: name}); }
          return;
        }
        active.setProperty(name, value);
      });
      // FIFO tail read is not awaited by this settings IPC. The subsequent
      // range bind can overlap actual native completion without delaying load.
      primeSharedBudget(active);
      return {status: 'accepted'};
    }
    if (operation === 'get-property') {
      requireGeneration(active, payload);
      const name = validatePropertyName(payload.name, GET_PROPERTIES);
      return {status: 'ok', value: await active.getProperty(name, 2000)};
    }
    if (operation === 'command') {
      const args = validateCommand(payload.data);
      if (args[0] === 'stop' && payload.presentationToken != null) {
        if (!validToken(payload.presentationToken)) throw new Error('presentation-token-invalid');
        if (!ownsPresentation(presentation) || presentation.token !== payload.presentationToken) {
          return {status: 'accepted', stale: true};
        }
      }
      requireGeneration(active, payload);
      if (args[0] === 'loadfile') {
        const loadEpoch = generationEpoch;
        const selected = rangeSession ? await rangeSession.select(args[1], active, active.currentGenerationId, args) : null;
        if (destroyed || loadEpoch !== generationEpoch || active !== client || endpointId !== activeEndpointId || payload.generationId !== active.currentGenerationId) {
          if (selected) await selected.cancel();
          throw new Error('stale-generation');
        }
        const dispatchShared = selected && selected.canDispatch();
        if (selected && !dispatchShared) selected.cancel().catch(function () {log('range-cache-unavailable', {});});
        if (dispatchShared && selected.commit) selected.commit();
        const loadArgs = dispatchShared ? [args[0], selected.source].concat(args.slice(2)) : args;
        const load = active.load(loadArgs);
        load.promise.catch(function (error) {
          if (client !== active || endpointId !== activeEndpointId || load.generationId !== active.currentGenerationId ||
              !error || error.state === 'GENERATION_RETIRED') return;
          clearPresentation(presentation);
          surfaceWanted = false;
          syncSurfaceVisibility('load-failed');
          sendEvent({type: 'bridge_error', reason: 'load-failed'});
          log('load-failed', {reason: String(error.message || 'load-failed').slice(0, 128)});
        });
        return {status: 'accepted'};
      }
      if (args[0] === 'stop') {
        if (rangeSession) await retireRangeSession();
        const retain = ownsPresentation(presentation) && presentation.token === payload.presentationToken &&
          validToken(presentation.holdId) && active.currentGenerationId === null;
        if (!retain) {
          clearPresentation(presentation);
          surfaceWanted = false;
          syncSurfaceVisibility('stop');
        }
        active.stop().catch(function () {});
        return {status: 'accepted'};
      }
      active.submitCommand(args);
      return {status: 'accepted'};
    }
    if (operation === 'set-visible') {
      requireGeneration(active, payload);
      if (active.currentGenerationId === null) return {status: 'ok'};
      surfaceWanted = payload.visible === true;
      if (surfaceWanted) lastVisibleMedia = {client: active, generationId: active.currentGenerationId};
      syncSurfaceVisibility('renderer-visibility');
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
    if (operation === 'retire-generation' && request) {
      acceptRendererEpoch(request);
      ++generationEpoch;
      // A newer endpoint epoch also cancels a begin whose ID has not returned to the renderer yet.
      if (client && (validToken(request.requestEpoch) || request.generationId === null || request.generationId === client.currentGenerationId)) {
        if (rangeSession) retireRangeSession().catch(function () {log('range-cache-unavailable', {});});
        client.retireGeneration(request.reason || 'retired');
      }
    }
    if (operation === 'set-visible') {
      if (!client || !request || client.currentGenerationId === null || request.generationId !== client.currentGenerationId) return;
      surfaceWanted = request && request.visible === true;
      if (surfaceWanted) lastVisibleMedia = {client, generationId: client.currentGenerationId};
      syncSurfaceVisibility('renderer-notify-visibility');
    }
  }

  async function destroyClient(reason) {
    sharedBudget.retire();
    ++generationEpoch;
    clearPresentation(presentation);
    lastVisibleMedia = null;
    surfaceWanted = false;
    syncSurfaceVisibility(reason);
    const owned = client;
    client = null;
    if (owned) {
      owned.retireGeneration(reason);
      const completion = owned.kill();
      pendingClientDestructions.add(completion);
      try { await completion; }
      finally { pendingClientDestructions.delete(completion); }
    }
  }

  function destroy() {
    if (destroyPromise) return destroyPromise;
    ++rangePreloadEpoch; ++generationEpoch;
    destroyed = true;
    activeEndpointId = null;
    // Renderer unload or transport death may detach client while its kill is pending.
    const pendingDestructions = Array.from(pendingClientDestructions);
    // Window closed and before-quit can overlap. Publish the shared completion
    // before cleanup starts so every caller waits for the owned native child.
    destroyPromise = Promise.resolve().then(async function () {
      invalidateSurfacePlacement();
      if (startingClient) {
        try { await startingClient.kill(); } catch (_) { }
      }
      if (startPromise) {
        try { await startPromise; } catch (_) { }
      }
      // One failed child must not let before-quit outrun other owned exits.
      const outcomes = await Promise.allSettled([destroyClient('service-destroy'), ...pendingDestructions, ...(previewWork ? [previewWork.promise] : []),
        rangeSession ? rangeSession.close() : Promise.resolve(), rangeApplyTail]);
      const failure = outcomes.find(outcome => outcome.status === 'rejected') || (rangeCloseFailure ? {reason: rangeCloseFailure} : null);
      // Native failure does not transfer ownership of local window resources.
      // Attempt all releases, then preserve the original owned-client error.
      let cleanupFailure = null;
      for (const binding of boundWindowEvents.splice(0)) {
        try { binding.main.removeListener(binding.name, binding.listener); }
        catch (error) { if (!cleanupFailure) cleanupFailure = {reason: error}; }
      }
      try {
        if (surfaceWindow && !surfaceWindow.isDestroyed()) surfaceWindow.destroy();
      } catch (error) {
        if (!cleanupFailure) cleanupFailure = {reason: error};
      } finally {
        surfaceWindow = null;
      }
      if (failure) throw failure.reason;
      if (cleanupFailure) throw cleanupFailure.reason;
    });
    return destroyPromise;
  }

  function status() {
    const handshake = client && !client.transportTerminated && client.handshake ? client.handshake : null;
    const handshakeCapabilities = handshake && Array.isArray(handshake.capabilities) ? handshake.capabilities : [];
    const validatedCapabilities = handshake
      ? STATUS_CAPABILITIES.filter(capability => handshakeCapabilities.includes(capability))
      : null;
    return {
      status: 'ok',
      mode,
      protocolVersion: PROTOCOL_VERSION,
      state: client && !client.transportTerminated ? 'ready' : startPromise ? 'starting' : 'stopped',
      surfaceVisible: !!(surfaceWindow && !surfaceWindow.isDestroyed() && surfaceWindow.isVisible()),
      helperVersion: handshake ? handshake.helperVersion : null,
      libmpvVersion: handshake ? handshake.libmpvVersion : null,
      mpvClientApiVersion: handshake ? handshake.mpvClientApiVersion : null,
      validatedCapabilities,
      expectedLibmpvVersion: activeKernelVersion,
      expectedMpvClientApiVersion: EXPECTED_MPV_CLIENT_API_VERSION,
      expectedLibmpvSha256: activeKernelSha256,
      libmpvSha256: null,
      libmpvImageSha256: null,
      fixedNativeRenderPath: 'vo=gpu-next; gpu-api=d3d11',
      renderSettingUiValues: 'mpv-vo/mpv-gpuapi not applied as Native properties',
      observedNativeRenderPath: null,
      kernel: {
        startupSelection: startupKernel.kind,
        startupCandidateId: startupKernel.candidateId || startupKernel.invalidCandidateId || null,
        startupDecisionAttempted: candidateStartupAttempted,
        effectiveCandidateId: effectiveKernelTarget.candidateId,
        fallbackOccurred: kernelFallbackOccurred,
        activeCandidateId: activeKernelId,
        activationState: kernelActivationState,
        reasonCode: kernelFailureReason || startupKernelFailure || null
      },
      crashCount,
      recreateCount
    };
  }

  function isPreviewOwner(owner) {
    return previewSnapshot.validOwner(owner) && !destroyed && activeEndpointId === owner.endpointId &&
      !!client && !client.transportTerminated && !client.exited && client.currentGenerationId === owner.generationId &&
      (!client.state || client.state.status !== 'ended');
  }
  let previewWork = null;
  function capturePreview(owner) {
    if (previewWork || !isPreviewOwner(owner) || !client.handshake ||
        !Array.isArray(client.handshake.capabilities) || !client.handshake.capabilities.includes('preview-snapshot-v1')) return Promise.resolve(null);
    const active = client, owned = {...owner}, ownedEpoch = generationEpoch;
    const record = {}; previewWork = record;
    record.promise = (async function () {
      try {
        const result = await active.request('preview-snapshot', {}, {generationId:owned.generationId, timeoutMs:1800});
        if (active !== client || generationEpoch !== ownedEpoch || !isPreviewOwner(owned)) return null;
        const frame = previewSnapshot.decode(result, owned.generationId);
        return frame && {...frame, owner:owned};
      } catch (_) { return null; }
      finally { if (previewWork === record) previewWork = null; }
    }());
    return record.promise;
  }
  return {call, destroy, mode, notify, prewarm, status, rangeStatus: function () { return rangeSession ? rangeSession.status() : {enabled: false}; }, capturePreview, isPreviewOwner, kernelStatus: function () { return status().kernel; },
    getVideoWindow: function () { return !destroyed && surfaceWindow && !surfaceWindow.isDestroyed() ? surfaceWindow : null; }};
}

function register(options) {
  const ipcMain = options.ipcMain;
  const service = options.service;
  const getWebContents = options.getWebContents;
  function trusted(event) {
    const expected = getWebContents();
    return rendererBoundary.isTrusted(event, expected);
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
