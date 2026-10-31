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
  const workerStartedAt = now(), workerStartedWall = Date.now();
  console.log('SHARED_CACHE_WORKER module');
  // The owned driver publishes/drains receipts before its explicit app.exit.
  app.on('window-all-closed', () => {});
  const args = {};
  for (const arg of process.argv.slice(2)) {const m = /^--(plan|plan-sha256|session|session-sha256|deadline-ms|phase)=(.+)$/.exec(arg);
    need(m && !Object.hasOwn(args, m[1]), 'worker-argument-invalid'); args[m[1]] = m[2];}
  need(Object.keys(args).length === 6 && driver.PHASES.includes(args.phase) && /^[1-9][0-9]{12}$/.test(args['deadline-ms']), 'worker-arguments-required');
  const verificationStarted = now();
  const plan = driver.readPlan(args.plan, args['plan-sha256']), phase = args.phase, verificationMs = now() - verificationStarted;
  const availablePhaseMs = Math.min(plan.limits.phaseDeadlineMs, Number(args['deadline-ms']) - workerStartedWall);
  need(availablePhaseMs > 1000, 'worker-deadline-invalid');
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
  const workerDeadline = workerStartedAt + availablePhaseMs - 1000;
  let stage = 'isolated', activeEndpoint, lastGeneration, currentItem, service, authority, cd2Service,
    mainWindow, indexUrl, originalFrame, ownedSession, unregisterNative, unregisterCd2, unregisterSettings, readObserver, lateEvents = 0, retiredAt = null;
  const receipt = {schema: 1, phase, productCommit: plan.productCommit, toolCommit: plan.tools.toolCommit,
    status: 'FAIL', scope, workerPid: process.pid, workerParentPid: process.ppid, workerType: process.type,
    checks: {}, timingsMs: {candidateVerification: verificationMs}, firstFrameMeaning: 'decoded native preview; hidden carrier',
    audio: 'NOT_TESTED_VIDEO_ONLY_FIXTURE', hiddenHarnessBackgroundThrottling: false, real115Requests: 0, helpers: [], seekObservations: [], evaluations: []};
  const lifecycleFile = path.join(plan.out, phase + '.lifecycle.json'), lifecycleEntries = [];
  let lifecycleFailed = false;
  need(!fs.existsSync(lifecycleFile), 'worker-preserve-lifecycle');
  function lifecycle(event) {
    if (lifecycleEntries.length >= 16) return;
    const resources = {};
    const types = typeof process.getActiveResourcesInfo === 'function' ? process.getActiveResourcesInfo().slice(0, 256) : [];
    for (const type of types) if (/^[A-Za-z0-9_]{1,64}$/.test(type)) resources[type] = (resources[type] || 0) + 1;
    lifecycleEntries.push({event, elapsedMs: now() - workerStartedAt, resources});
    try {fs.writeFileSync(lifecycleFile, JSON.stringify({schema: 1, workerPid: process.pid, workerParentPid: process.ppid, entries: lifecycleEntries}) + '\n', {mode: 0o600});}
    catch (_) {lifecycleFailed = true;}
  }
  lifecycle('worker-isolated');
  function phaseOf(value) {stage = value; stages.push({stage, elapsedMs: now()});
    fs.writeFileSync(stagesFile, JSON.stringify(stages) + '\n', {mode: 0o600}); console.log('SHARED_CACHE_WORKER ' + value);}
  function record(type, data = {}) {
    need(trace.length < 8192, 'worker-trace-limit'); trace.push({type, at: now(), wallClockMs: Date.now(), ...data});
  }
  let finishing = false, failed = false, cleanupPromise, operationsComplete = false, voidSequence = 0, receiptWritten = false;
  function active() {need(!finishing, 'worker-retired');}
  async function waitFor(predicate, code, timeout = 5000) {
    const deadline = Math.min(now() + timeout, workerDeadline - 5000);
    while (now() < deadline) {
      active();
      need(!trace.some(r => r.type === 'renderer-failure' || r.type === 'bridge-failure'), 'renderer-or-helper-failure');
      const found = await driver.within(predicate, Math.max(1, deadline - now()), code);
      active();
      if (found) return;
      await delay(25);
      active();
    }
    throw Error(code);
  }
  async function evaluate(script, label, timeout = 5000) {
    active();
    phaseOf(label);
    const remaining = workerDeadline - now() - 5000; // Retain time for owned helper cleanup.
    need(remaining > 0, 'worker-operation-budget');
    const contents = mainWindow.webContents;
    record('renderer-dispatch', {operation: label, loading: contents.isLoading(),
      loadingMainFrame: contents.isLoadingMainFrame(), backgroundThrottling: contents.getBackgroundThrottling(),
      destroyed: contents.isDestroyed(), requestedMs: timeout, effectiveMs: Math.min(timeout, remaining), remainingPhaseMs: workerDeadline - now()});
    const value = await driver.within(() => {active(); return driver.executeStableFrame(contents, indexUrl, driver.observeExpression(script, label));}, Math.min(timeout, remaining), label + '-timeout');
    active();
    return value;
  }
  async function evaluateVoid(script, label, timeout = 5000) {
    active(); phaseOf(label);
    const remaining = workerDeadline - now() - 5000;
    need(remaining > 0, 'worker-operation-budget');
    const contents = mainWindow.webContents;
    record('renderer-dispatch', {operation: label, loading: contents.isLoading(),
      loadingMainFrame: contents.isLoadingMainFrame(), backgroundThrottling: contents.getBackgroundThrottling(),
      destroyed: contents.isDestroyed(), requestedMs: timeout, effectiveMs: Math.min(timeout, remaining), remainingPhaseMs: workerDeadline - now()});
    const sequence = ++voidSequence;
    const facts = await driver.executeAcknowledgedVoid(contents, indexUrl, script, label, sequence, Math.min(timeout, remaining), () => !finishing);
    active();
    receipt.evaluations.push({operation: label, sequence, ...facts});
    need(facts.completionAck === 1000 + sequence && facts.rendererResultType === 'undefined', 'worker-void-not-completed');
    return facts;
  }
  app.on('quit', () => {lifecycle('app-quit'); phaseOf('app-quit');});
  process.once?.('exit', () => {lifecycle('process-exit'); phaseOf('process-exit');});
  const runtime = member => path.join(plan.runtime, 'electronapp', member);
  const get = member => require(runtime(member));
  function helperFacts() {
    return clients.map(c => ({pid: c.child?.pid || null, ready: !!c.handshake,
      exitCode: c.child?.exitCode ?? null, exitSignal: c.child?.signalCode ?? null, streamsClosed: c.closeSeen === true,
      pendingRequests: c.pending?.size || 0, stderrTags: driver.safeNativeTags(c.stderrChunks),
      operationErrors: c.operationErrors.map(e => ({operation: e.operation, errorCode: e.errorCode})),
      protocolFailure: c.protocolFailure ? 'PROTOCOL_FAILURE' : null}));
  }
  function writeReceipt(origin) {
    receipt.readObservation = readObserver?.snapshot() || null;
    receipt.trace = trace; receipt.helpers = helperFacts(); receipt.receiptOrigin = origin;
    receipt.ownedHelpersClosed = clients.length > 0 && clients.every(c => c.exited && c.child.exitCode === 0 &&
      c.child.signalCode === null && c.closeSeen && !c.protocolFailure && c.pending.size === 0);
    receipt.helperExitAssessment = receipt.ownedHelpersClosed ? 'CONFIRMED' : 'UNCERTAIN';
    fs.writeFileSync(file, JSON.stringify(receipt, null, 2) + '\n', {flag: receiptWritten ? 'w' : 'wx', mode: 0o600});
    receiptWritten = true;
  }
  async function inspectOwnedStore(options, timeoutMs, code, inspect, duringCleanup = false) {
    let abandoned = false, resolvedStore, closePromise;
    const close = store => closePromise ||= driver.within(() => store.close(),
      Math.max(1, Math.min(1000, workerDeadline - now() - 250)), 'worker-store-close-timeout');
    const opening = Promise.resolve().then(() => {
      if (!duringCleanup) active();
      return get('enhanced/shared-playback-cache/store').createStore(options);
    }).then(store => {
      resolvedStore = store;
      if (abandoned || (!duringCleanup && finishing)) {
        abandoned = true;
        void close(store).catch(() => {failed = true; receipt.cleanupCode ||= 'worker-late-store-close-failed';});
        throw Error('worker-store-open-retired');
      }
      return store;
    });
    let store;
    try {store = await driver.within(() => opening, timeoutMs, code);}
    catch (error) {
      abandoned = true;
      if (resolvedStore) void close(resolvedStore).catch(() => {failed = true; receipt.cleanupCode ||= 'worker-late-store-close-failed';});
      throw error;
    }
    try {
      if (!duringCleanup) active();
      return inspect(store.status());
    } finally {await close(store);}
  }
  function cleanup() {
    if (cleanupPromise) return cleanupPromise;
    finishing = true;
    receipt.status = 'FAIL';
    cleanupPromise = (async () => {
      const budget = maximum => {
        const remaining = workerDeadline - now() - 250;
        need(remaining > 0, 'worker-cleanup-budget');
        return Math.min(maximum, remaining);
      };
      const attempt = async task => {
        try {await task();} catch (error) {failed = true; receipt.cleanupCode ||= driver.safeFailure(error);}
      };
      lifecycle('before-cleanup'); phaseOf('cleanup-native'); writeReceipt('cleanup-start');
      let nativeDestroyComplete = false;
      await attempt(async () => {
        if (unregisterNative) await driver.within(() => unregisterNative(), budget(2500), 'worker-native-cleanup-timeout');
        else if (service) await driver.within(() => service.destroy(), budget(2500), 'worker-native-cleanup-timeout');
        nativeDestroyComplete = true;
      });
      phaseOf('cleanup-helper-exit');
      for (const c of clients) await attempt(async () => {
        need(c.exitPromise, 'worker-helper-exit-missing');
        await driver.within(() => c.exitPromise, budget(1500), 'worker-helper-exit-timeout');
        const deadline = now() + budget(1000);
        while (!c.closeSeen) {need(now() < deadline, 'worker-helper-close-timeout'); await delay(10);}
        need(c.exited && c.child.exitCode === 0 && c.child.signalCode === null && !c.protocolFailure && c.pending.size === 0, 'worker-helper-exit');
      });
      for (const teardown of [() => unregisterCd2 ? unregisterCd2() : cd2Service?.close(),
        () => unregisterSettings?.(), () => authority?.close()]) {
        await attempt(() => driver.within(teardown, budget(1000), 'worker-owned-teardown-timeout'));
      }
      if (phase !== 'baseline') await attempt(async () => {
        need(nativeDestroyComplete, 'worker-store-live-backend');
        phaseOf('cleanup-store');
        const cacheRoot = path.join(profile, 'userdata/shared-playback-byte-cache-v2');
        const status = await inspectOwnedStore({root: cacheRoot,
          currentBytes: plan.limits.cacheBytes, nextBytes: (300 * 1024 * 1024), recoveryMode: 'on-demand'}, budget(1500), 'worker-store-open-timeout', value => value, true);
        receipt.afterClose = {current: status.current, next: status.next,
          pending: status.pending, readers: status.readers, reserved: status.reserved, entries: status.entries};
        need(status.next === 0 && status.pending === 0 && status.readers === 0 && status.reserved === 0, 'worker-store-not-drained');
        if (phase !== 'cancel') need(status.current > 0, 'worker-retention-empty');
      });
      writeReceipt('cleanup');
      // Keep the carrier intact while any owned helper exit or pipe close is uncertain.
      if (!clients.every(c => c.exited && c.closeSeen)) {
        failed = true; receipt.cleanupCode ||= 'worker-helper-exit-unconfirmed'; writeReceipt('cleanup-uncertain');
        return;
      }
      if (operationsComplete && !failed) await attempt(async () => {
        phaseOf('after-helper-script');
        const stable = () => need(mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed() &&
          mainWindow.webContents.mainFrame === originalFrame && originalFrame && !originalFrame.detached &&
          !originalFrame.isDestroyed() && originalFrame.url === indexUrl && mainWindow.webContents.getURL() === indexUrl, 'worker-after-helper-frame');
        stable();
        const value = await driver.within(() => originalFrame.executeJavaScript('17'), budget(1500), 'worker-after-helper-timeout');
        stable(); need(value === 17, 'worker-after-helper-result'); receipt.afterHelper = 17;
      });
      await attempt(async () => {
        phaseOf('cleanup-main-window');
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
        phaseOf('cleanup-main-destroyed');
        const ownedWindows = BrowserWindow.getAllWindows();
        for (const window of ownedWindows) {need(!window.isVisible(), 'worker-visible-window'); window.destroy();}
        need((!mainWindow || mainWindow.isDestroyed()) && ownedWindows.every(window => window.isDestroyed()) &&
          BrowserWindow.getAllWindows().length === 0, 'worker-windows-not-destroyed');
        phaseOf('cleanup-windows-destroyed');
        ownedSession?.protocol.unhandle('file'); phaseOf('cleanup-protocol-removed');
      });
      lifecycle('before-receipt');
      await attempt(() => readObserver?.restore());
      if (lifecycleFailed) {failed = true; receipt.cleanupCode ||= 'worker-lifecycle-write-failed';}
      receipt.status = operationsComplete && !failed ? 'PASS' : 'FAIL';
      receipt.stage ||= stage; phaseOf('receipt-write'); writeReceipt('cleanup'); phaseOf('receipt-written');
      clearTimeout(watchdog); clearTimeout(softWatchdog);
      console.log('SHARED_CACHE_WORKER_RESULT ' + JSON.stringify({phase, status: receipt.status, stage: receipt.stage,
        code: receipt.code || receipt.cleanupCode || null, checks: receipt.checks, timingsMs: receipt.timingsMs,
        ownedHelpersClosed: receipt.ownedHelpersClosed}));
      lifecycle('app-exit-requested'); phaseOf('app-exit-requested');
      app.exit(receipt.status === 'PASS' ? 0 : 1);
    })();
    return cleanupPromise;
  }
  const softWatchdog = setTimeout(() => {
    failed = true; receipt.code ||= 'worker-deadline'; receipt.stage ||= stage;
    void cleanup().catch(() => {receipt.cleanupCode ||= 'worker-cleanup-failed';});
  }, Math.max(1, workerDeadline - now() - 5000));
  const watchdog = setTimeout(() => {
    failed = true; finishing = true; receipt.status = 'FAIL'; receipt.code ||= 'worker-deadline'; receipt.stage ||= stage;
    try {writeReceipt('watchdog');} catch (_) {console.log('SHARED_CACHE_WORKER deadline-receipt-unavailable');}
    console.log('SHARED_CACHE_WORKER_RESULT ' + JSON.stringify({phase, status: 'FAIL', stage: receipt.stage, code: receipt.code,
      ownedHelpersClosed: receipt.ownedHelpersClosed, checks: receipt.checks}));
    app.exit(2);
  }, driver.watchdogDelay(workerStartedAt, now(), availablePhaseMs));
  try {
    await driver.within(() => app.whenReady(), Math.max(1, workerDeadline - now() - 5000), 'worker-ready-timeout'); active(); phaseOf('app-ready');
    // readPlan already ran the complete physical/source gate in this process
    // before isolation/ready; do not repeat every Git blob acquisition here.
    ownedSession = session.fromPath(path.join(profile, 'session'), {cache: false});
    indexUrl = pathToFileURL(runtime('www/index.html')).href;
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
    active();
    class HiddenWindow extends BrowserWindow {
      constructor(options) {active(); super({...options, show: false, focusable: false, skipTaskbar: true,
        webPreferences: {...options.webPreferences, session: ownedSession, backgroundThrottling: false}});}
      show() {throw Error('worker-window-show-forbidden');}
      showInactive() {throw Error('worker-window-show-forbidden');}
      focus() {throw Error('worker-window-focus-forbidden');}
    }
    mainWindow = new HiddenWindow({width: 320, height: 180, webPreferences: {session: ownedSession,
      contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false,
      preload: path.join(plan.repo, 'tools/shared-playback-cache/windows-preload.cjs')}});
    mainWindow.setMenu(null);
    need(mainWindow.webContents.getBackgroundThrottling() === false, 'worker-hidden-scheduling-not-applied');
    mainWindow.webContents.on('unresponsive', () => record('renderer-unresponsive'));
    mainWindow.webContents.on('responsive', () => record('renderer-responsive'));
    mainWindow.webContents.on('did-start-navigation', (_event, _url, _inPlace, mainFrame) => record('renderer-navigation', {mainFrame: !!mainFrame}));
    authority = get('enhanced/preload-source-authority').createAuthority();
    if (phase !== 'baseline') {
      const physicalFs = contract.selectPhysicalFs(), manifestBytes = physicalFs.readFileSync(path.join(plan.runtime, 'build-manifest.json'));
      need(sha(manifestBytes) === plan.identity.manifestSha256, 'worker-observer-manifest-changed');
      const member = 'electronapp/enhanced/shared-playback-cache/proxy.js';
      const row = JSON.parse(manifestBytes).files.find(value => value.path === member);
      need(row && /^[a-f0-9]{64}$/i.test(row.sha256), 'worker-observer-source-unbound');
      const filename = path.join(plan.runtime, member), source = physicalFs.readFileSync(filename);
      readObserver = require('./windows-read-observer.cjs').install({target: get('enhanced/shared-playback-cache/proxy'),
        filename, source, expectedSha256: row.sha256, context: () => ({item: currentItem, generation: lastGeneration}),
        emit: details => record('cache-read', details)});
    }
    const productClient = get('native-helper/controller').NativeHelperClient;
    class ObservedClient extends productClient {
      constructor(options) {
        active();
        super({...options, onEvent: message => {
          const item = contexts.get(message.generationId);
          if (retiredAt !== null && message.generationId === retiredAt && ['playback-restart', 'core-idle', 'time-pos'].includes(message.name)) lateEvents++;
          if (['playback-restart', 'time-pos', 'duration', 'pause', 'core-idle', 'eof-reached', 'operation-error'].includes(message.name)) {
            const value = ['number', 'boolean'].includes(typeof message.value) ? message.value : null;
            record('native', {generation: message.generationId, item, name: message.name, value});
          }
          options.onEvent(message);
        }}); clients.push(this); this.closeSeen = false;
      }
      async start() {active(); const starting = super.start(); this.child?.once('close', () => {this.closeSeen = true;}); await starting; active();
        record('native-ready', {pid: this.child.pid}); return this;}
      sendEnvelope(message) {
        const budget = message.type === 'request' && message.method === 'get-property' && message.params?.name === 'demuxer-max-bytes';
        if (!budget) return super.sendEnvelope(message);
        this.budgetRequestIds ||= new Map(); this.budgetRequestIds.set(message.requestId, message.generationId);
        const observe = operation => {
          try {record('budget-transport', {operation, generation: message.generationId, requestId: message.requestId,
            item: ['A', 'B', 'C'].includes(contexts.get(message.generationId)) ? contexts.get(message.generationId) : null, queuedFrames: this.outboundQueue.length,
            queuedBytes: this.outboundBytes, writeBlocked: this.writeBlocked === true});} catch (_) {}
        };
        observe('request-send-begin');
        try {return super.sendEnvelope(message);} finally {observe('request-send-return');}
      }
      dispatch(message) {
        const generation = this.budgetRequestIds?.get(message.requestId);
        if (!this.budgetRequestIds?.has(message.requestId) || generation !== message.generationId || message.helperInstanceId !== this.helperInstanceId || !['response', 'error'].includes(message.type)) return super.dispatch(message);
        const observe = operation => {
          try {record('budget-transport', {operation, generation, requestId: message.requestId,
            item: ['A', 'B', 'C'].includes(contexts.get(generation)) ? contexts.get(generation) : null, pending: this.pending.has(message.requestId), responseKind: message.type});} catch (_) {}
        };
        this.budgetRequestIds.delete(message.requestId); observe('response-enter');
        try {return super.dispatch(message);} finally {observe('response-dispatched');}
      }
      setProperty(name, value) {
        if (name === 'user-data/emby-theater-enhanced/diagnostics/cache-bytes' && value === '') {
          try {record('cache-budget', {operation: 'clear-submit', item: contexts.get(this.currentGenerationId), generation: this.currentGenerationId});} catch (_) {}
        }
        return super.setProperty(name, value);
      }
      submitCommand(args) {
        if (Array.isArray(args) && args.length === 4 && args[0] === 'expand-properties' && args[1] === 'set' &&
            args[2] === 'user-data/emby-theater-enhanced/diagnostics/cache-bytes' && args[3] === '${=demuxer-max-bytes}') {
          try {record('cache-budget', {operation: 'expand-submit', item: contexts.get(this.currentGenerationId), generation: this.currentGenerationId});} catch (_) {}
        }
        return super.submitCommand(args);
      }
      getProperty(name, timeoutMs) {
        const property = name === 'demuxer-max-bytes' ? 'native-node' : name === 'user-data/emby-theater-enhanced/diagnostics/cache-bytes' ? 'legacy-text' : null;
        if (!property) return super.getProperty(name, timeoutMs);
        const generation = this.currentGenerationId, item = contexts.get(generation);
        return driver.observeCacheBudgetRead(() => super.getProperty(name, timeoutMs), data => {
          if (!receiptWritten) record('cache-budget', {generation, item, property, ...data});
        });
      }
      load(args) {
        active();
        const u = new URL(args[1]), item = contexts.get(this.currentGenerationId) || /^\/Videos\/([ABC])\//.exec(u.pathname)?.[1];
        if (item) {contexts.set(this.currentGenerationId, item); currentItem = item; lastGeneration = this.currentGenerationId;}
        need(u.hostname === '127.0.0.1' && ['http:'].includes(u.protocol), 'worker-native-source-not-owned');
        record('load', {item, generation: this.currentGenerationId, proxied: u.origin !== sources.mediaOrigin,
          cache: driver.cacheSelectionSnapshot(service.rangeStatus())});
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
      const trustedNative = channel === 'enhanced-native-helper-call' && boundary.isTrusted(event, mainWindow.webContents);
      const observeDestroy = trustedNative && payload?.operation === 'destroy';
      const budgetBatch = trustedNative && payload?.operation === 'set-properties' &&
        Array.isArray(payload.payload?.entries) && payload.payload.entries.some(entry => ['demuxer-max-bytes', 'profile'].includes(entry?.name));
      const selectionCall = trustedNative && (payload?.operation === 'range-context' ||
        payload?.operation === 'command' && Array.isArray(payload.payload?.data) && payload.payload.data[0] === 'loadfile');
      const observeSelection = operation => {
        try {record('selection-ipc', {operation, generation: payload.payload?.generationId,
          item: ['A', 'B', 'C'].includes(contexts.get(payload.payload?.generationId)) ? contexts.get(payload.payload?.generationId) : null, phase: budgetBatch ? 'settings-batch' : payload.operation === 'range-context' ? 'range-context' : 'load-selection'});} catch (_) {}
      };
      if (observeDestroy) record('destroy-ipc', {operation: 'begin'});
      if (budgetBatch || selectionCall) observeSelection('entered');
      let result, completed = false;
      try {result = await fn(event, payload); completed = true;}
      finally {if (budgetBatch || selectionCall) observeSelection(completed ? 'returned' : 'rejected');}
      if (observeDestroy) record('destroy-ipc', {operation: 'complete', ok: result?.status === 'ok'});
      if (boundary.isTrusted(event, mainWindow.webContents)) {
        if (channel === 'enhanced-native-helper-call' && result?.status !== 'error') {
          if (payload.operation === 'create') activeEndpoint = result.endpointId;
          // Budget priming now precedes range-context. Label only this fixture's
          // fixed item IDs from the accepted original generation request.
          if (payload.operation === 'begin-generation' && Number.isSafeInteger(result.generationId) &&
              ['A', 'B', 'C'].includes(payload.payload?.diagnosticIdentity?.itemId)) {
            contexts.set(result.generationId, payload.payload.diagnosticIdentity.itemId);
          }
          if (payload.operation === 'range-context' && payload.payload?.context) {
            const context = payload.payload.context; contexts.set(payload.payload.generationId, context.itemId);
            currentItem = context.itemId; lastGeneration = payload.payload.generationId;
          }
          if (payload.operation === 'range-preload') record('preload', {state: result.value?.state, bytes: result.value?.bytes || 0,
            cache: driver.cacheSelectionSnapshot(service.rangeStatus())});
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
      if (value.type === 'server-report') {
        if (typeof value.session === 'string' && /^synthetic-session-[ABC]$/.test(value.session)) data.session = value.session;
        if (typeof value.mediaSource === 'string' && /^[ABC]-avi$/.test(value.mediaSource)) data.mediaSource = value.mediaSource;
      }
      record(value.type, data);
      if (['renderer-failure', 'bridge-failure'].includes(value.type)) {
        failed = true; receipt.code ||= 'renderer-or-helper-failure'; receipt.stage ||= stage;
      }
    });
    await driver.within(() => mainWindow.loadURL(indexUrl), Math.max(1, workerDeadline - now() - 5000), 'worker-load-timeout'); active();
    originalFrame = mainWindow.webContents.mainFrame;
    need(mainWindow.webContents.mainFrame.url === indexUrl, 'worker-frame-url');
    phaseOf('renderer');
    if (phase === 'reopen') {
      receipt.beforeReopen = await inspectOwnedStore({root: cacheRoot,
        currentBytes: plan.limits.cacheBytes, nextBytes: (300 * 1024 * 1024), recoveryMode: 'on-demand'},
      Math.max(1, workerDeadline - now() - 5000), 'worker-reopen-store-timeout', status => status);
      active();
      need(receipt.beforeReopen.current > 0 && receipt.beforeReopen.next === 0, 'worker-reopen-no-retained-cache');
    }
    const boot = require('../../tests/helpers/next-prefix-alameda.cjs').rendererBoot;
    const bootInput = {origin: sources.origin, windowId: String(mainWindow.id), moduleBaseUrl: pathToFileURL(runtime('www/')).href,
      cacheBytes: plan.limits.cacheBytes, itemIds: phase === 'reopen' ? ['B'] : ['A', 'B']};
    await evaluateVoid('(' + boot.toString() + ')(' + JSON.stringify(bootInput) + ')', 'renderer-boot', 12000);
    await waitFor(() => trace.some(row => row.type === 'initial-play-resolved'), 'worker-initial-play-not-resolved', 12000);
    need(!trace.some(row => row.type === 'renderer-failure' || row.type === 'bridge-failure'), 'renderer-or-helper-failure');
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
    async function seek(seconds, direction) {
      const label = 'seek-' + direction, facts = {direction, paused: false, commandCompleted: false,
        position: false, restart: false, frame: false, unpaused: false, playbackAdvanced: false};
      receipt.seekObservations.push(facts);
      await evaluateVoid("window.prefixAction('pause')", label + '-pause-command');
      phaseOf(label + '-pause-property');
      await waitFor(async () => await clients.at(-1).getProperty('pause', 500) === true, 'worker-seek-pause');
      facts.paused = true;
      const start = now(), generation = lastGeneration, initial = trace.length;
      const seekResult = await evaluate("window.require(['playbackManager']).then(v => {window.prefixHarness.report({type:'seek-module',operation:'" + direction + "'});" +
        'return Promise.resolve(v[0].seek(' + (seconds * 10000000) + ")).then(() => {window.prefixHarness.report({type:'seek-command',operation:'" + direction + "'}); return true;});})", label + '-dispatch');
      need(seekResult === true, 'worker-seek-command-result');
      facts.commandCompleted = true;
      phaseOf(label + '-position');
      await waitFor(() => trace.slice(initial).some(r => r.type === 'native' && r.generation === generation &&
        r.name === 'time-pos' && typeof r.value === 'number' && Math.abs(r.value - seconds) < 0.6), 'worker-seek-position');
      facts.position = true;
      phaseOf(label + '-restart');
      await waitFor(() => trace.slice(initial).some(r => r.type === 'native' && r.generation === generation && r.name === 'playback-restart'), 'worker-seek-frame-restart');
      facts.restart = true;
      phaseOf(label + '-frame'); await frame(currentItem); facts.frame = true;
      const elapsed = now() - start;
      const pausedPosition = await clients.at(-1).getProperty('time-pos', 500); active();
      need(typeof pausedPosition === 'number' && Number.isFinite(pausedPosition), 'worker-seek-paused-position');
      need(lastGeneration === generation, 'worker-seek-generation-retired');
      await evaluateVoid("window.prefixAction('unpause')", label + '-unpause-command');
      phaseOf(label + '-unpause-property');
      await waitFor(async () => await clients.at(-1).getProperty('pause', 500) === false, 'worker-seek-unpause');
      facts.unpaused = true;
      const afterUnpause = await clients.at(-1).getProperty('time-pos', 500); active();
      need(typeof afterUnpause === 'number' && Number.isFinite(afterUnpause), 'worker-seek-resumed-position');
      const resumeBaseline = Math.max(pausedPosition, afterUnpause);
      facts.pausedPosition = pausedPosition; facts.resumeBaseline = resumeBaseline;
      phaseOf(label + '-unpause-progress');
      await waitFor(async () => {
        need(lastGeneration === generation && clients.at(-1).currentGenerationId === generation, 'worker-seek-generation-retired');
        const position = await clients.at(-1).getProperty('time-pos', 500); active();
        if (typeof position !== 'number' || !Number.isFinite(position) || position <= resumeBaseline + 0.05) return false;
        facts.resumedPosition = position; return true;
      }, 'worker-seek-resume-progress');
      facts.playbackAdvanced = true;
      return elapsed;
    }
    if (phase === 'baseline' || phase === 'natural') {
      receipt.timingsMs.seekForward = await seek(8, 'forward');
      receipt.timingsMs.seekBack = await seek(2, 'back');
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
      await delay(300); active();
      phaseOf('cancel');
    }
    const stopping = now(), stoppingItem = currentItem, stopTraceStart = trace.length;
    await evaluateVoid('window.prefixStop()', 'stop-command');
    retiredAt = lastGeneration;
    receipt.timingsMs.stop = now() - stopping;
    phaseOf('stop-destroy-ipc');
    await waitFor(() => trace.slice(stopTraceStart).some(r => r.type === 'destroy-ipc' && r.operation === 'complete' && r.ok === true), 'worker-stop-ipc-not-completed');
    receipt.checks.stopIpcCompleted = true;
    phaseOf('stop-native-exit');
    await waitFor(() => clients.length > 0 && clients.every(c => c.exited && c.child.exitCode === 0 && c.closeSeen), 'worker-stop-native-not-closed');
    phaseOf('stop-server-report');
    await waitFor(() => trace.slice(stopTraceStart).some(r => driver.matchesStoppedReport(r, stoppingItem)), 'worker-stop-server-report-missing');
    receipt.checks.stopped = true; receipt.checks.stopNativeClosed = true; phaseOf('stop');
    if (phase === 'cancel') {await delay(150); active(); receipt.checks.noObsoleteNativeEvents = lateEvents === 0;
      need(receipt.checks.noObsoleteNativeEvents, 'worker-obsolete-native-events');}
    active(); operationsComplete = true;
  } catch (error) {failed = true; receipt.code ||= driver.safeFailure(error); receipt.stage ||= stage;}
  finally {await cleanup();}
}
if (process.versions.electron) main().catch(error => {console.log('SHARED_CACHE_WORKER startup-' + driver.safeFailure(error).slice(0, 90)); app.exit(1);});
