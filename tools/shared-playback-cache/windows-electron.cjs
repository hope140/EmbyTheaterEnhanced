'use strict';
// Explicit Electron entry: Electron imports CJS through ESM, so require.main is
// not an entry contract. This file is never imported by ordinary product code.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {pathToFileURL, fileURLToPath} = require('node:url');
const {app, BrowserWindow, ipcMain, session} = require('electron');
const driver = require('./windows-smoke.cjs');
const contract = require('./windows-contract.cjs');
const need = (v, c) => {if (!v) throw Error(c);};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const now = () => performance.now();
const scope = 'real Electron IPC/main-frame, product authority/renderer/native; owned synthetic shell and sources; no ordinary main bootstrap/visible UI';

async function main() {
  console.log('SHARED_CACHE_WORKER module');
  // The owned driver publishes/drains receipts before its explicit app.exit.
  app.on('window-all-closed', () => {});
  const args = {};
  for (const arg of process.argv.slice(2)) {const m = /^--(plan|plan-sha256|session|session-sha256|phase)=(.+)$/.exec(arg);
    need(m && !Object.hasOwn(args, m[1]), 'worker-argument-invalid'); args[m[1]] = m[2];}
  need(Object.keys(args).length === 5 && driver.PHASES.includes(args.phase), 'worker-arguments-required');
  const plan = driver.readPlan(args.plan, args['plan-sha256']), phase = args.phase;
  need(process.platform === 'win32' && process.execPath.toLowerCase() === path.join(plan.runtime, 'x64/electron/electron.exe').toLowerCase(), 'worker-executable-invalid');
  const sourceBytes = fs.readFileSync(args.session);
  need(sha(sourceBytes) === args['session-sha256'] && path.join(plan.out, 'sources.json') === args.session, 'worker-session-hash');
  const sources = JSON.parse(sourceBytes);
  need(sources.schema === 1 && Object.keys(sources).length === 4, 'worker-sources-invalid');
  for (const field of ['origin', 'mediaOrigin', 'cd2Endpoint']) {const u = new URL(sources[field]);
    need(u.protocol === 'http:' && u.hostname === '127.0.0.1' && u.port && u.origin === sources[field], 'worker-loopback-only');}
  need(!app.isReady(), 'worker-isolation-too-late');
  const profile = driver.validateProfile(plan, phase);
  for (const [name, member] of Object.entries({appData: 'appdata', userData: 'userdata', sessionData: 'session',
    logs: 'logs', temp: 'temp', crashDumps: 'crashes'})) app.setPath(name, path.join(profile, member));
  const file = path.join(plan.out, phase + '.json'), stagesFile = path.join(plan.out, phase + '.stages.json');
  need(!fs.existsSync(file) && !fs.existsSync(stagesFile), 'worker-preserve-receipts');
  const stages = [], trace = [], clients = [], contexts = new Map();
  let stage = 'isolated', activeEndpoint, lastGeneration, currentItem, service, authority, cd2Service,
    mainWindow, ownedSession, unregisterNative, unregisterCd2, unregisterSettings, lateEvents = 0, retiredAt = null;
  const receipt = {schema: 1, phase, productCommit: plan.productCommit, toolCommit: plan.tools.toolCommit,
    status: 'FAIL', scope, checks: {}, timingsMs: {}, firstFrameMeaning: 'decoded native preview; hidden carrier',
    audio: 'NOT_TESTED_VIDEO_ONLY_FIXTURE', real115Requests: 0, helpers: []};
  function phaseOf(value) {stage = value; stages.push({stage, elapsedMs: now()});
    fs.writeFileSync(stagesFile, JSON.stringify(stages) + '\n', {mode: 0o600}); console.log('SHARED_CACHE_WORKER ' + value);}
  function record(type, data = {}) {
    need(trace.length < 8192, 'worker-trace-limit'); trace.push({type, at: now(), wallClockMs: Date.now(), ...data});
  }
  async function waitFor(predicate, code, timeout = 5000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      need(!trace.some(r => r.type === 'renderer-failure' || r.type === 'bridge-failure'), 'renderer-or-helper-failure');
      if (await predicate()) return;
      await delay(25);
    }
    throw Error(code);
  }
  const runtime = member => path.join(plan.runtime, 'electronapp', member);
  const get = member => require(runtime(member));
  let watchdog = setTimeout(() => {receipt.code = 'worker-deadline'; app.exit(2);}, plan.limits.phaseDeadlineMs - 1000);
  try {
    await app.whenReady(); phaseOf('app-ready');
    // readPlan already ran the complete physical/source gate in this process
    // before isolation/ready; do not repeat every Git blob acquisition here.
    ownedSession = session.fromPath(path.join(profile, 'session'), {cache: false});
    const indexUrl = pathToFileURL(runtime('www/index.html')).href;
    const fileRoot = pathToFileURL(runtime('')).href;
    const allowedOrigins = new Set([sources.origin, sources.mediaOrigin]);
    ownedSession.webRequest.onBeforeRequest((request, callback) => {
      try {const u = new URL(request.url);
        callback({cancel: !((u.protocol === 'file:' && request.url.startsWith(fileRoot)) ||
          (u.protocol === 'http:' && allowedOrigins.has(u.origin)) || u.protocol === 'data:')});
      } catch (_) {callback({cancel: true});}
    });
    // Candidate files stay immutable. Only the precise trusted index document
    // receives an empty owned shell; real modules are the verified runtime bytes.
    await ownedSession.protocol.handle('file', request => {
      try {
        if (request.url === indexUrl) return new Response('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>', {headers: {'content-type': 'text/html'}});
        const member = fileURLToPath(request.url), relative = path.relative(runtime(''), member);
        if (relative.startsWith('..') || path.isAbsolute(relative) || !/\.(js|css)$/.test(member)) return new Response('', {status: 403});
        return new Response(fs.readFileSync(member), {headers: {'content-type': member.endsWith('.js') ? 'text/javascript' : 'text/css'}});
      } catch (_) {return new Response('', {status: 404});}
    });
    class HiddenWindow extends BrowserWindow {
      constructor(options) {super({...options, show: false, focusable: false, skipTaskbar: true});}
      show() {throw Error('worker-window-show-forbidden');}
      showInactive() {throw Error('worker-window-show-forbidden');}
      focus() {throw Error('worker-window-focus-forbidden');}
    }
    mainWindow = new HiddenWindow({width: 320, height: 180, webPreferences: {session: ownedSession,
      contextIsolation: true, nodeIntegration: false, sandbox: false,
      preload: path.join(plan.repo, 'tools/shared-playback-cache/windows-preload.cjs')}});
    mainWindow.setMenu(null);
    authority = get('enhanced/preload-source-authority').createAuthority();
    const productClient = get('native-helper/controller').NativeHelperClient;
    class ObservedClient extends productClient {
      constructor(options) {
        super({...options, onEvent: message => {
          const item = contexts.get(message.generationId);
          if (retiredAt !== null && message.generationId === retiredAt && ['playback-restart', 'core-idle', 'time-pos'].includes(message.name)) lateEvents++;
          if (['playback-restart', 'time-pos', 'duration', 'core-idle', 'eof-reached', 'operation-error'].includes(message.name)) {
            const value = ['number', 'boolean'].includes(typeof message.value) ? message.value : null;
            record('native', {generation: message.generationId, item, name: message.name, value});
          }
          options.onEvent(message);
        }}); clients.push(this); this.closeSeen = false;
      }
      async start() {const starting = super.start(); this.child?.once('close', () => {this.closeSeen = true;}); await starting;
        record('native-ready', {pid: this.child.pid}); return this;}
      load(args) {
        const u = new URL(args[1]), item = contexts.get(this.currentGenerationId) || /^\/Videos\/([ABC])\//.exec(u.pathname)?.[1];
        if (item) {contexts.set(this.currentGenerationId, item); currentItem = item; lastGeneration = this.currentGenerationId;}
        need(u.hostname === '127.0.0.1' && ['http:'].includes(u.protocol), 'worker-native-source-not-owned');
        record('load', {item, generation: this.currentGenerationId, proxied: u.origin !== sources.mediaOrigin});
        return super.load(args);
      }
    }
    const settings = get('enhanced/playback-range-user-settings');
    const prefs = settings.createStore({profileRoot: path.join(profile, 'userdata')});
    prefs.save({schema: 1, enabled: phase !== 'baseline', progressPercent: plan.limits.progressPercent, preloadMB: plan.limits.preloadMB});
    const cacheRoot = path.join(profile, 'userdata/shared-playback-byte-cache-v2');
    service = get('native-helper/service').createService({electron: {BrowserWindow: HiddenWindow},
      NativeHelperClient: ObservedClient, runtimeRoot: plan.runtime, sourceAuthority: authority,
      getMainWindow: () => mainWindow, getWebContents: () => mainWindow.webContents,
      getRangeCacheConfig: () => prefs.get().enabled ? {kind: 'shared-byte-trial', root: cacheRoot,
        progressPercent: prefs.get().progressPercent, preloadMB: prefs.get().preloadMB, timeoutMs: 30000} : null});
    const rule = {id: 'synthetic-cloud', sourcePrefix: 'X:\\Media', mountPrefix: 'X:\\Media', cloudPrefix: '/cloud/media',
      storageType: 'cloud-mount', strategy: 'cloud-first', order: ['direct-url', 'cd2-http', 'mount', 'native'], originState: 'USER', enabled: true};
    cd2Service = get('enhanced/cd2-service').createService({sourceAuthority: authority,
      config: {enabled: true, origin: sources.cd2Endpoint, token: 'synthetic-only-token', rules: [rule], directUrlEnabled: true}});
    const boundary = get('enhanced/renderer-boundary');
    const observedIpc = {handle(channel, fn) {ipcMain.handle(channel, async (event, payload) => {
      const result = await fn(event, payload);
      if (boundary.isTrusted(event, mainWindow.webContents)) {
        if (channel === 'enhanced-native-helper-call' && result?.status !== 'error') {
          if (payload.operation === 'create') activeEndpoint = result.endpointId;
          if (payload.operation === 'range-context' && payload.payload?.context) {
            const context = payload.payload.context; contexts.set(payload.payload.generationId, context.itemId);
            currentItem = context.itemId; lastGeneration = payload.payload.generationId;
          }
          if (payload.operation === 'range-preload') record('preload', {state: result.value?.state, bytes: result.value?.bytes || 0});
        }
        if (channel === 'enhanced-cd2-resolve') record('resolved', {status: result?.status, proofPresent: typeof result?.sourceProof === 'string'});
      }
      return result;
    });}, on: (...args) => ipcMain.on(...args), removeHandler: name => ipcMain.removeHandler(name),
      removeListener: (...args) => ipcMain.removeListener(...args), removeAllListeners: name => ipcMain.removeAllListeners(name)};
    unregisterNative = get('native-helper/service').register({ipcMain: observedIpc, service, getWebContents: () => mainWindow.webContents});
    unregisterCd2 = get('enhanced/cd2-ipc').register({ipcMain: observedIpc, service: cd2Service, sourceAuthority: authority,
      getWebContents: () => mainWindow.webContents});
    unregisterSettings = settings.register({ipcMain: observedIpc, store: prefs, getWebContents: () => mainWindow.webContents,
      getRuntimeStatus: () => service.rangeStatus()});
    ipcMain.handle('enhanced-strm-config-get', event => {
      need(boundary.isTrusted(event, mainWindow.webContents), 'worker-untrusted-config');
      return {version: 1, enabled: true, cd2: {enabled: true, origin: sources.cd2Endpoint, tokenConfigured: true, directUrlEnabled: true}, rules: [rule]};
    });
    ipcMain.on('shared-cache-harness-alameda', event => {
      if (boundary.isTrusted(event, mainWindow.webContents)) event.returnValue = fs.readFileSync(runtime('www/modules/alameda/alameda.js'), 'utf8');
      else event.returnValue = '';
    });
    ipcMain.on('shared-cache-harness-report', (event, value) => {
      if (!boundary.isTrusted(event, mainWindow.webContents) || !value || typeof value.type !== 'string') return;
      const data = {};
      // Never retain renderer source strings, tokens, exception messages or pixels.
      for (const k of ['item', 'operation', 'method', 'code']) if (typeof value[k] === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value[k])) data[k] = value[k];
      record(value.type, data);
    });
    await mainWindow.loadURL(indexUrl);
    need(mainWindow.webContents.mainFrame.url === indexUrl, 'worker-frame-url');
    phaseOf('renderer');
    const beforeStore = phase === 'reopen' ? await get('enhanced/shared-playback-cache/store').createStore({root: cacheRoot,
      currentBytes: plan.limits.cacheBytes, nextBytes: 300000000, recoveryMode: 'on-demand'}) : null;
    if (beforeStore) {receipt.beforeReopen = beforeStore.status(); await beforeStore.close();
      need(receipt.beforeReopen.current > 0 && receipt.beforeReopen.next === 0, 'worker-reopen-no-retained-cache');}
    const boot = require('../../tests/helpers/next-prefix-alameda.cjs').rendererBoot;
    const bootInput = {origin: sources.origin, windowId: String(mainWindow.id), moduleBaseUrl: pathToFileURL(runtime('www/')).href,
      cacheBytes: plan.limits.cacheBytes, itemIds: phase === 'reopen' ? ['B'] : ['A', 'B']};
    await mainWindow.webContents.executeJavaScript('(' + boot.toString() + ')(' + JSON.stringify(bootInput) + ')');
    await waitFor(() => trace.some(row => row.type === 'load'), 'worker-load-missing', 12000);
    const load = trace.find(row => row.type === 'load');
    need(load.proxied === (phase !== 'baseline'), 'worker-shared-not-selected');
    receipt.checks.trustedProof = trace.some(row => row.type === 'resolved' && row.proofPresent);
    need(receipt.checks.trustedProof, 'worker-proof-missing');
    async function frame(item) {
      let result;
      await waitFor(async () => {
        if (currentItem !== item || !activeEndpoint || !lastGeneration) return false;
        result = await service.capturePreview({endpointId: activeEndpoint, generationId: lastGeneration});
        return driver.coloredFrame(result);
      }, 'worker-decoded-frame-missing', 5000);
      return {width: result.width, height: result.height, sha256: sha(result.pixels)};
    }
    receipt.frame = await frame(phase === 'reopen' ? 'B' : 'A');
    receipt.timingsMs.decodedFirstFrame = now() - load.at;
    receipt.checks.decodedFrame = true; phaseOf('first-frame');
    async function seek(seconds) {
      await mainWindow.webContents.executeJavaScript("window.prefixAction('pause')");
      await waitFor(async () => await clients.at(-1).getProperty('pause', 500) === true, 'worker-seek-pause');
      const start = now(), generation = lastGeneration, initial = trace.length;
      await mainWindow.webContents.executeJavaScript("window.require(['playbackManager']).then(v => v[0].seek(" + (seconds * 10000000) + '))');
      await waitFor(() => trace.slice(initial).some(r => r.type === 'native' && r.generation === generation &&
        r.name === 'time-pos' && typeof r.value === 'number' && Math.abs(r.value - seconds) < 0.6), 'worker-seek-position');
      await waitFor(() => trace.slice(initial).some(r => r.type === 'native' && r.generation === generation && r.name === 'playback-restart'), 'worker-seek-frame-restart');
      await frame(currentItem); const elapsed = now() - start;
      await mainWindow.webContents.executeJavaScript("window.prefixAction('unpause')"); return elapsed;
    }
    if (phase === 'baseline' || phase === 'natural') {
      receipt.timingsMs.seekForward = await seek(8);
      receipt.timingsMs.seekBack = await seek(2);
      receipt.checks.seek = true; phaseOf('seek');
    }
    if (phase === 'natural') {
      await waitFor(() => trace.some(r => r.type === 'manager-next-track') && trace.some(r => r.type === 'load' && r.item === 'B'), 'worker-natural-next-missing', 22000);
      receipt.checks.naturalNext = true;
      need(trace.find(r => r.type === 'load' && r.item === 'B').proxied === true, 'worker-next-shared-not-selected');
      receipt.checks.nextProxied = true;
      receipt.checks.preloaded = trace.some(r => r.type === 'preload' && r.state === 'ready');
      need(receipt.checks.preloaded, 'worker-next-not-ready');
      receipt.nextFrame = await frame('B'); receipt.checks.nextDecoded = true;
      phaseOf('natural-next');
    }
    if (phase === 'cancel') {
      await waitFor(() => service.rangeStatus().next.state === 'warming', 'worker-warming-missing', 20000);
      // Let the actual foreground-driven preload reach the owned held response.
      await delay(300);
      phaseOf('cancel');
    }
    const stopping = now();
    await mainWindow.webContents.executeJavaScript('window.prefixStop()');
    retiredAt = lastGeneration;
    receipt.timingsMs.stop = now() - stopping;
    receipt.checks.stopped = true; phaseOf('stop');
    if (phase === 'cancel') {await delay(150); receipt.checks.noObsoleteNativeEvents = lateEvents === 0;
      need(receipt.checks.noObsoleteNativeEvents, 'worker-obsolete-native-events');}
    receipt.status = 'PASS';
  } catch (error) {receipt.code = driver.safeFailure(error); receipt.stage = stage;}
  finally {
    phaseOf('cleanup');
    try {
      if (unregisterNative) await unregisterNative(); else if (service) await service.destroy();
      unregisterCd2?.(); if (!unregisterCd2) cd2Service?.close(); unregisterSettings?.(); authority?.close();
      for (const c of clients) {
        await c.exitPromise;
        const deadline = Date.now() + 2000; while (!c.closeSeen && Date.now() < deadline) await delay(10);
        const code = c.child.exitCode;
        receipt.helpers.push({pid: c.child.pid, ready: !!c.handshake, exitCode: code, streamsClosed: c.closeSeen,
          stderrTags: driver.safeNativeTags(c.stderrChunks),
          operationErrors: c.operationErrors.map(e => ({operation: e.operation, errorCode: e.errorCode})),
          protocolFailure: c.protocolFailure ? 'PROTOCOL_FAILURE' : null});
        need(c.exited && code === 0 && c.closeSeen && !c.protocolFailure, 'worker-helper-exit');
      }
      receipt.ownedHelpersClosed = clients.length > 0 && receipt.helpers.every(r => r.streamsClosed && r.exitCode === 0);
      if (phase !== 'baseline') {
        const cacheRoot = path.join(profile, 'userdata/shared-playback-byte-cache-v2');
        const store = await get('enhanced/shared-playback-cache/store').createStore({root: cacheRoot,
          currentBytes: plan.limits.cacheBytes, nextBytes: 300000000, recoveryMode: 'on-demand'});
        const status = store.status(); receipt.afterClose = {current: status.current, next: status.next,
          pending: status.pending, readers: status.readers, reserved: status.reserved, entries: status.entries};
        await store.close();
        need(status.next === 0 && status.pending === 0 && status.readers === 0 && status.reserved === 0, 'worker-store-not-drained');
        if (phase !== 'cancel') need(status.current > 0, 'worker-retention-empty');
      }
    } catch (error) {receipt.status = 'FAIL'; receipt.cleanupCode = driver.safeFailure(error);}
    try {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
      for (const window of BrowserWindow.getAllWindows()) {need(!window.isVisible(), 'worker-visible-window'); window.destroy();}
      await ownedSession?.protocol.unhandle('file');
    } catch (_) {receipt.status = 'FAIL'; receipt.cleanupCode = 'worker-window-cleanup';}
    receipt.trace = trace; receipt.stage ||= stage;
    fs.writeFileSync(file, JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx', mode: 0o600});
    clearTimeout(watchdog); watchdog = null;
    console.log('SHARED_CACHE_WORKER_RESULT ' + JSON.stringify({phase, status: receipt.status, stage: receipt.stage,
      code: receipt.code || receipt.cleanupCode || null, checks: receipt.checks, timingsMs: receipt.timingsMs,
      ownedHelpersClosed: receipt.ownedHelpersClosed}));
    app.exit(receipt.status === 'PASS' ? 0 : 1);
  }
}
if (process.versions.electron) main().catch(error => {console.log('SHARED_CACHE_WORKER startup-' + driver.safeFailure(error).slice(0, 90)); app.exit(1);});
