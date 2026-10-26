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
module.exports = {BASE, SCENARIOS, TARGETS, LIMITS, rendererLogin, rendererAction, frameRange, coverageKind, assertCoverage, assertEntry, executeAppFrame, workerArguments, isMediaA, loadSource};
