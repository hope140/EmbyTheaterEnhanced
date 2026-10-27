'use strict';
const path = require('node:path'), crypto = require('node:crypto');
const BASE = '9492750b2b0e7b3fc81f52b51b61900209ac9aba';
const SCENARIOS = Object.freeze(['cold-first-frame', 'cached-seek', 'uncached-seek', 'boundary-seek', 'far-seek']);
const TARGETS = Object.freeze({'cached-seek': 0.5, 'uncached-seek': 8, 'boundary-seek': 3, 'far-seek': 14});
const LIMITS = Object.freeze({warmups: 3, pairs: 20, workerMs: 90000, suiteMs: 5400000,
  prefixBytes: 2 * 1024 * 1024, gapBytes: 262144, chunkBytes: 16384, chunkDelayMs: 8, firstByteDelayMs: 20});
const need = (value, code) => {if (!value) throw Error(code);};
function rendererLogin(origin) {
  const u = new URL(origin); need(u.origin === origin && u.protocol === 'http:' && u.hostname === '127.0.0.1', 'app-fixture-origin');
  return `(async()=>{const unwrap=m=>m&&m.default||m;const [c,p,r,a]=await require(['connectionManager','playbackManager','./modules/approuter.js','appSettings']);
const cm=unwrap(c),pm=unwrap(p),router=unwrap(r);unwrap(a).set('mpv-demuxermaxbytes','314572800');
const connected=await cm.connectToAddress(${JSON.stringify(origin)},{enableAutoLogin:false});
if(connected.State!=='ServerSignIn'||!connected.ApiClient)throw Error('app-connect-state');
const api=connected.ApiClient;await api.authenticateUserByName('fixture-user','fixture-password');
if(cm.currentApiClient()!==api||api.serverId()!=='prefix-server'||api.getCurrentUserId()!=='fixture-user')throw Error('app-session-missing');
await router.handleConnectionResult({State:'SignedIn',ApiClient:api});return {signedIn:true};})()`;
}
function rendererAction(operation, seconds) {
  need(['play', 'seek', 'pause', 'unpause', 'stop', 'ready'].includes(operation), 'app-action');
  if (operation === 'seek') need(Number.isFinite(seconds) && seconds >= 0 && seconds <= 16, 'app-seek-target');
  const action = operation === 'play' ? "await pm.play({serverId:'prefix-server',ids:['A'],fullscreen:true,enableRemotePlayers:false});" :
    operation === 'seek' ? `await pm.seek(${Math.round(seconds * 10000000)});` : operation === 'pause' ? 'pm.pause();' :
      operation === 'unpause' ? 'pm.unpause();' : operation === 'stop' ? 'await pm.stop();' : '';
  return `(async()=>{const [m]=await require(['playbackManager']);const pm=m&&m.default||m;${action}
const player=pm.getCurrentPlayer();return {player:!!player,source:!!(player&&player.currentSrc&&player.currentSrc())};})()`;
}
function frameRange(file, seconds) {
  need(file && Number.isSafeInteger(file.dataStart) && file.dataStart >= 0 && Number.isSafeInteger(file.frameStride) && file.frameStride > 8 &&
    Number.isSafeInteger(file.frames) && file.frames > 0 && Number.isInteger(file.fps) && file.fps > 0 && Number.isFinite(seconds) && seconds >= 0, 'app-frame-layout');
  const frame = Math.min(file.frames - 1, Math.floor(seconds * file.fps));
  return {start: file.dataStart + frame * file.frameStride, end: file.dataStart + (frame + 1) * file.frameStride};
}
function coverageKind(span, range) {
  need(Number.isSafeInteger(range?.start) && Number.isSafeInteger(range.end) && range.end > range.start, 'app-coverage-range');
  if (!span || span.end <= range.start || span.start >= range.end) return 'uncached';
  return span.start <= range.start && span.end >= range.end ? 'cached' : 'boundary';
}
function assertCoverage(scenario, kind) {
  const expected = scenario === 'cached-seek' ? 'cached' : scenario === 'boundary-seek' ? 'boundary' : 'uncached';
  need(kind === expected, 'app-seek-coverage-mismatch');
}
function assertEntry({argv, runtime, appPath, appReady}) {
  need(!appReady && Array.isArray(argv) && argv[1] === path.join(runtime, 'electronapp') && appPath === argv[1] &&
    argv.filter(value => typeof value === 'string' && value.startsWith('--ete-shared-cache-trial=')).length === 1, 'app-entry-contract');
}
function isMediaA(identity, origin) {
  const server = crypto.createHash('sha256').update(JSON.stringify([origin,'prefix-server'])).digest('hex');
  return identity?.server === server && identity.account === 'fixture-user' && identity.item === 'A' && identity.mediaSource === 'A-avi';
}
function loadSource(source, mediaOrigin, ownedProxyUrls) {
  let url; try {url = new URL(source);} catch (_) {throw Error('app-native-source-identity');}
  need(url.protocol === 'http:' && url.hostname === '127.0.0.1' && !url.username && !url.password && !url.hash, 'app-native-source-identity');
  const proxied = ownedProxyUrls.has(url.href);
  need(proxied || url.href === mediaOrigin + '/Videos/A/stream.avi?fixture=synthetic', 'app-native-source-identity');
  return {proxied};
}
function workerArguments(args) {
  need(Array.isArray(args) && args.length === 4, 'app-worker-argument'); const result = {};
  for (const arg of args) {const m = /^--(plan|plan-sha256|case|deadline-ms)=(.+)$/.exec(arg);
    need(m && !Object.hasOwn(result,m[1]), 'app-worker-argument'); result[m[1]] = m[2];}
  need(Object.keys(result).length === 4 && /^[a-f0-9]{64}$/.test(result['plan-sha256']) &&
    /^\d{1,2}$/.test(result.case) && /^[1-9][0-9]{12}$/.test(result['deadline-ms']), 'app-worker-argument'); return result;
}
async function executeAppFrame(contents, entryUrl, script) {
  const expected = new URL(entryUrl), frame = contents?.mainFrame;
  const trusted = () => {
    if (!contents || contents.isDestroyed() || contents.mainFrame !== frame || !frame || frame.isDestroyed() || frame.detached) return false;
    try {const current = new URL(frame.url); return current.protocol === 'file:' && current.origin === expected.origin && current.pathname === expected.pathname && current.search === expected.search;} catch (_) {return false;}
  };
  need(trusted(), 'app-frame-untrusted');
  const value = await frame.executeJavaScript(script);
  need(trusted(), 'app-frame-retired'); return value;
}
// Rejection values can be undefined or arbitrary objects. Do not coerce them
// through RegExp or expose server/renderer error payloads in safe receipts.
const SAFE_FAILURE_CODES = new Set([
  'app-amd-not-ready', 'app-between-seek-pause', 'app-cache-body-reread',
  'app-cache-disk-layout', 'app-cache-next', 'app-cache-owner-missing',
  'app-cache-ranges-limit', 'app-cache-span', 'app-cold-playback-failed',
  'app-connect-state', 'app-decoded-frame-missing', 'app-document-not-ready',
  'app-external-scripts', 'app-frame-retired', 'app-frame-untrusted',
  'app-initial-pause', 'app-lan-discovery-disabled', 'app-login-failed',
  'app-main-window-missing', 'app-observation-window', 'app-observer-owner',
  'app-observer-target', 'app-owned-memory-query-failed', 'app-owned-memory-result',
  'app-owned-memory-query-denied', 'app-owned-memory-query-timeout', 'app-owned-memory-query-unknown', 'app-owned-memory-target-exited',
  'app-owned-memory-single-helper', 'app-owned-memory-target', 'app-play-not-established',
  'app-player-not-ready', 'app-prefix-coverage-missing', 'app-preload-ipc-not-ready',
  'app-preview-owner-retired', 'app-initial-position',
  'app-pixel-audit-failed', 'app-pixel-codec-roundtrip', 'app-pixel-preview-missing', 'app-pixel-carrier-owner', 'app-pixel-carrier-limit',
  'app-ready-dependencies', 'app-ready-entered', 'app-ready-event-missing',
  'app-ready-observer-missing', 'app-renderer-command-timeout', 'app-routes',
  'app-sample-count', 'app-sample-failed', 'app-seek-coverage-mismatch',
  'app-seek-no-resume', 'app-seek-position-restart', 'app-session-missing',
  'app-shared-selection', 'app-source-observation', 'app-startup-not-ready',
  'app-windows-electron-required', 'app-worker-case', 'app-worker-deadline',
  'app-worker-deadline-argument', 'app-worker-failed', 'app-worker-preserve-lifecycle',
  'app-worker-preserve-receipt',
]);
function failureCode(error, fallback) {
  try {const message = error?.message; if (typeof message === 'string' && SAFE_FAILURE_CODES.has(message)) return message;} catch (_) {}
  return fallback;
}
function rejectionFacts(error) {
  const result = {type: error === null ? 'null' : typeof error, name: null};
  try {const name = error?.name; if (['Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'AbortError', 'TimeoutError'].includes(name)) result.name = name;} catch (_) {}
  return result;
}
function recordTerminalFailure(report, error) {
  report.terminalFailure = {code: failureCode(error, 'app-worker-failed'), failure: rejectionFacts(error)};
  report.code = report.firstFailure?.code || report.terminalFailure.code;
  report.failure = report.firstFailure?.rejection || report.terminalFailure.failure;
}
// Main registers its start-info injection on dom-ready after BrowserWindow
// construction. Register the observer at web-contents-created, so its same-frame
// listener is queued first, before the unchanged product starts Emby.App.
const READY_LISTENER = `(() => {
  if (!window.__eteOwnedAppReadiness) {
    const state = window.__eteOwnedAppReadiness = {installed: true, appReady: false};
    document.addEventListener('appready', () => {state.appReady = true;}, {once: true});
  }
  return window.__eteOwnedAppReadiness.installed === true;
})()`;
const READY_SNAPSHOT = `(() => ({
  markerInstalled: window.__eteOwnedAppReadiness?.installed === true,
  appReady: window.__eteOwnedAppReadiness?.appReady === true,
  requireType: typeof window.require, requirejsType: typeof window.requirejs,
  sameRequire: window.require === window.requirejs,
  amdDefined: !!window.define?.amd, ipc: !!window.ipc,
  appStartAvailable: typeof window.Emby?.App?.start === 'function',
  startInfoAvailable: !!window.appStartInfo,
  documentReadyState: document.readyState
}))()`;
function readinessCode(state) {
  if (!state?.markerInstalled) return 'app-ready-observer-missing';
  if (state.requireType !== 'function' || state.requirejsType !== 'function' || !state.sameRequire || !state.amdDefined) return 'app-amd-not-ready';
  if (!state.ipc) return 'app-preload-ipc-not-ready';
  if (!state.appReady) return 'app-ready-event-missing';
  return null;
}
function installReadinessObserver(app, entryUrl, mark) {
  const owned = new Map();
  const created = (_event, contents) => {
    const onDom = () => {
      // Ignore carriers/about:blank and never run code in a different document.
      if (contents.isDestroyed() || contents.mainFrame?.url.split('#')[0] !== entryUrl) return;
      mark('ordinary-ready-observer-dispatch', {contentsId: contents.id});
      executeAppFrame(contents, entryUrl, READY_LISTENER).then(installed => {
        mark('ordinary-ready-observer-settled', {contentsId: contents.id, installed: installed === true});
      }, () => mark('ordinary-ready-observer-rejected', {contentsId: contents.id}));
    };
    contents.on('dom-ready', onDom); owned.set(contents, onDom);
  };
  app.on('web-contents-created', created);
  return () => {app.removeListener('web-contents-created', created);
    for (const [contents, listener] of owned) contents.removeListener('dom-ready', listener);
    owned.clear();};
}
// Do not reenter app.quit() from its native will-quit stack just to write a
// receipt. With no outstanding owned stream closes the event may proceed.
// If closes remain, prevent once and resume on a fresh event-loop turn.
function installQuitCollector({app, pending, finalize, mark, onFailure, schedule = setImmediate, timeoutMs = 2000}) {
  let finalized = false, collecting = false;
  const failed = () => {try {onFailure();} catch (_) { /* Exit must still proceed; missing/invalid receipt fails the coordinator. */ }};
  const finish = () => {try {finalize();} catch (_) {failed();} finally {finalized = true;}};
  const listener = event => {
    mark('ordinary-will-quit', {finalized, collecting});
    if (finalized) return;
    if (collecting) {event.preventDefault(); return;}
    let work;
    try {work = pending();} catch (_) {failed(); work = [];}
    if (!work.length) {finish(); return;}
    event.preventDefault(); collecting = true;
    let timer;
    Promise.race([Promise.all(work), new Promise(resolve => {timer = setTimeout(resolve, timeoutMs);})])
      .then(() => {clearTimeout(timer); finish(); schedule(() => app.quit());}, () => {
        clearTimeout(timer); failed(); finish(); schedule(() => app.quit());
      });
  };
  app.on('will-quit', listener);
  return () => app.removeListener('will-quit', listener);
}
module.exports = {recordTerminalFailure, failureCode, rejectionFacts, READY_LISTENER, READY_SNAPSHOT, readinessCode, installReadinessObserver, installQuitCollector, BASE, SCENARIOS, TARGETS, LIMITS, rendererLogin, rendererAction, frameRange, coverageKind, assertCoverage, assertEntry, executeAppFrame, workerArguments, isMediaA, loadSource};
