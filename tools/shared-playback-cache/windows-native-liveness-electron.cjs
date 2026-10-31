'use strict';
// Owned Native-helper liveness differential; fixed local fixture and no product bootstrap.
const fs = require('node:fs');
const path = require('node:path');
const CASES = ['helper-idle', 'helper-playback', 'helper-preview'];
const crypto = require('node:crypto');
const SURFACE_URL = 'data:text/html,<meta charset="utf-8"><style>html,body{margin:0;background:#000;overflow:hidden}</style>';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(predicate, ms, code) {
  need(ms > 0, code);
  const deadline = Date.now() + ms;
  while (!predicate()) { need(Date.now() < deadline, code); await delay(Math.min(10, Math.max(1, deadline - Date.now()))); }
}
function allowedKill(client) {
  return !!client && !client.killDenied && !client.exited && !!client.child &&
    Number.isSafeInteger(client.child.pid) && client.child.pid > 0 && client.child.exitCode === null && client.child.signalCode === null;
}
function requestOwnedKill(client) {
  if (!allowedKill(client)) return false;
  return client.child.kill();
}
function helperHealthy(client, requireClosed = false) {
  return !!client.handshake && (requireClosed || !client.transportTerminated) && !client.protocolFailure && !client.operationErrors.some(error => error.fatal !== false) &&
    (!requireClosed || (client.exited && client.child.exitCode === 0 && client.child.signalCode === null && client.closeSeen && client.pending.size === 0));
}
function coloredFrame(frame) {
  return !!frame && ((frame.width === 64 && frame.height === 64) || (frame.width === 160 && frame.height === 90)) &&
    Buffer.isBuffer(frame.pixels) && frame.pixels.length === frame.width * frame.height * 4 &&
    frame.pixels.some((value, index) => index % 4 !== 3 && value !== 0);
}
function verifyFixture(plan) {
  const fixture = plan.fixture;
  need(fixture && path.resolve(fixture.file) === path.join(plan.out, 'owned.y4m') && fs.realpathSync(fixture.file) === fixture.file, 'fixture-path');
  const stat = fs.lstatSync(fixture.file);
  need(stat.isFile() && !stat.isSymbolicLink() && stat.size === fixture.size && stat.size > 0 && stat.size < 2 * 1024 * 1024, 'fixture-size');
  need(crypto.createHash('sha256').update(fs.readFileSync(fixture.file)).digest('hex') === fixture.sha256, 'fixture-hash');
  return fixture.file;
}
const URL = 'data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><html><head><meta charset="utf-8"><title>Owned liveness</title></head><body></body></html>');
const SCRIPTS = Object.freeze([
  ['primitive', '11', 11],
  ['promise', 'Promise.resolve(12)', 12],
  ['echo-one', 'window.ownedLiveness.echo(1).then(v => v.seq)', 1],
  ['async-void', '(() => { void window.ownedLiveness.echo(2); return 14; })()', 14],
  ['awaited', '(async () => { const a = await window.ownedLiveness.echo(3); const b = await window.ownedLiveness.echo(4); return a.seq + b.seq; })()', 7],
  ['microtask', 'new Promise(resolve => queueMicrotask(() => resolve(16)))', 16]
]);
function need(value, code) { if (!value) throw Error(code); }
function parseArgs(args) {
  need(args.length === 4, 'worker-arguments');
  const result = {};
  for (const arg of args) {
    const match = /^--(plan|plan-sha256|case|deadline-ms)=(.+)$/.exec(arg);
    need(match && !Object.hasOwn(result, match[1]), 'worker-arguments');
    result[match[1]] = match[2];
  }
  need(path.isAbsolute(result.plan || '') && /^[a-f0-9]{64}$/.test(result['plan-sha256'] || '') &&
    CASES.includes(result.case) && /^\d{13}$/.test(result['deadline-ms'] || ''), 'worker-arguments');
  result.deadline = Number(result['deadline-ms']);
  return result;
}
function within(task, ms, code) {
  need(ms > 0, code);
  let timer;
  return Promise.race([Promise.resolve().then(task), new Promise((_, reject) => {
    timer = setTimeout(() => reject(Error(code)), ms);
  })]).finally(() => clearTimeout(timer));
}
function observeExpression(expression) {
  return '(() => { window.ownedLiveness.report("entered"); const value = (' + expression +
    '); window.ownedLiveness.report("returned"); Promise.resolve(value).then(() => window.ownedLiveness.report("settled"), () => window.ownedLiveness.report("rejected")); return value; })()';
}
// WebFrameMain marshals base::Value::NONE as null. Verify void inside the
// renderer, retain the original void result across the boundary, and inspect
// a separate fixed acknowledgement in the same frame. Never swallow failures.
function voidExpression(expression, sequence) {
  need(typeof expression === 'string' && [1, 2].includes(sequence), 'void-probe-invalid');
  return '(() => { if ((window.__ownedVoidSequence || 0) !== ' + (sequence - 1) +
    ') throw Error("void-probe-sequence"); return Promise.resolve((' + expression + ')).then(value => {' +
    ' if (typeof value !== "undefined") throw Error("void-probe-not-void");' +
    ' window.__ownedVoidSequence = ' + sequence + '; window.__ownedVoidResultType = typeof value; return value; }); })()';
}
function voidAckExpression(sequence) {
  need([1, 2].includes(sequence), 'void-probe-invalid');
  return '(window.__ownedVoidSequence === ' + sequence + ' && window.__ownedVoidResultType === "undefined") ? ' + (20 + sequence) + ' : -1';
}
function wireResultType(value) {
  return value === null ? 'null' : typeof value;
}
async function run() {
  const started = Date.now();
  const args = parseArgs(process.argv.slice(2));
  const {readPlan, profileFor} = require('./windows-liveness.cjs');
  const plan = readPlan(args.plan, args['plan-sha256']);
  need(plan.suite === 'native', 'worker-suite');
  const fixture = verifyFixture(plan);
  const profile = profileFor(plan, args.case);
  const root = typeof profile === 'string' ? profile : profile.root;
  need(typeof root === 'string' && path.isAbsolute(root), 'worker-profile');
  const {app, BrowserWindow, ipcMain, session} = require('electron');
  need(process.platform === 'win32' && process.type === 'browser' && !app.isReady(), 'worker-process');
  need(path.resolve(process.execPath).toLowerCase() === path.resolve(plan.runtime, 'x64/electron/electron.exe').toLowerCase(), 'worker-runtime');
  need(args.deadline > Date.now() + 1000 && args.deadline <= started + plan.limits.caseMs, 'worker-deadline');
  const receipt = {schema: 1, kind: 'runtime-liveness-case', suite: 'native', case: args.case, status: 'FAIL', pid: process.pid,
    ppid: process.ppid, processType: process.type, browserProcess: process.type === 'browser', electronVersion: process.versions.electron,
    verificationMs: Date.now() - started, scripts: [], ipcCounts: [0, 0, 0, 0], observations: [], helpers: [],
    ticks: {count: 0, maxLagMs: 0}, native: {created: false, loaded: false, closed: false, timePositionCount: 0, coreIdleCount: 0, playbackAdvanced: false}, previewCalls: 0};
  const stages = [];
  const write = () => {
    fs.writeFileSync(path.join(plan.out, args.case + '.stages.json'), JSON.stringify(stages, null, 2) + '\n');
    fs.writeFileSync(path.join(plan.out, args.case + '.json'), JSON.stringify(receipt, null, 2) + '\n');
  };
  const stage = label => {
    const counts = {};
    for (const resource of process.getActiveResourcesInfo().slice(0, 256)) {
      const type = /^[A-Za-z0-9_-]{1,80}$/.test(resource) ? resource : 'Other';
      counts[type] = (counts[type] || 0) + 1;
    }
    stages.push({label, elapsedMs: Date.now() - started, resourceTypes: counts});
    write();
  };
  const clients = [], windows = [];
  let win, originalFrame, service, endpointId, generationId, finishing = false, failed = false, firstPosition = null;
  let lastTick = Date.now();
  const tickTimer = setInterval(() => {
    const now = Date.now();
    receipt.ticks.count = Math.min(10000, receipt.ticks.count + 1);
    receipt.ticks.maxLagMs = Math.max(receipt.ticks.maxLagMs, Math.max(0, now - lastTick - 100));
    lastTick = now;
  }, 100);
  const remaining = (limit, reserve = 4000) => Math.min(limit, args.deadline - Date.now() - reserve);
  const helperFacts = () => clients.map(client => ({pid: client.child?.pid || null, ready: !!client.handshake,
    exited: !!client.exited, exitCode: client.child?.exitCode ?? null, signal: !!client.child?.signalCode,
    streamsClosed: !!client.closeSeen, protocolFailure: !!client.protocolFailure,
    killAttempted: !!client.killAttempted, killDenied: !!client.killDenied, pendingRequests: client.pending.size, operationErrorCount: client.operationErrors.length, fatal: client.operationErrors.some(error => error.fatal !== false)}));
  const finish = async (ok, error) => {
    if (finishing) return;
    finishing = true;
    receipt.status = 'FAIL';
    if (error) receipt.error = /^[a-z0-9-]{1,100}$/.test(error.message) ? error.message : 'worker-failed';
    stage('cleanup-start');
    try {
      if (service) await within(() => service.destroy(), remaining(2500, 2000), 'native-destroy-timeout');
      stage('helper-destroy-returned');
    } catch (_) { ok = false; receipt.cleanupError = 'native-destroy-failed'; stage('native-destroy-failed'); }
    for (const client of clients) {
      try {
        need(client.exitPromise, 'helper-exit-missing');
        if (!client.exited && !ok) {
          receipt.forcedHelperKill = true;
          requestOwnedKill(client);
          stage('helper-kill-requested');
        }
        await within(() => client.exitPromise, remaining(1500, 1000), 'helper-exit-timeout');
        await waitFor(() => client.closeSeen, remaining(1000, 1000), 'helper-close-timeout');
        need(helperHealthy(client, true), 'helper-exit-unconfirmed');
      } catch (_) {
        ok = false; receipt.cleanupError ||= 'helper-exit-unconfirmed';
        if (!client.exited && client.child) {
          try { receipt.forcedHelperKill = true; requestOwnedKill(client); stage('helper-kill-requested'); } catch (_) { }
          try {
            await within(() => client.exitPromise, remaining(1000, 1000), 'helper-kill-timeout');
            await waitFor(() => client.closeSeen, remaining(500, 1000), 'helper-kill-close-timeout');
          } catch (_) { receipt.cleanupError = 'helper-exit-unconfirmed'; }
        }
      }
    }
    try {
      receipt.helpers = helperFacts();
      receipt.ownedHelpersClosed = clients.length === 1 && clients.every(client => helperHealthy(client, true));
      need(receipt.ownedHelpersClosed, 'helper-count');
      receipt.native.closed = true;
    } catch (_) { ok = false; receipt.cleanupError ||= 'native-cleanup-failed'; stage('native-cleanup-failed'); }
    try {
      if (ok && win && !win.isDestroyed()) {
        const verifyOriginal = () => need(originalFrame && !win.isDestroyed() && !win.webContents.isDestroyed() &&
          win.webContents.mainFrame === originalFrame && !originalFrame.detached && !originalFrame.isDestroyed() &&
          originalFrame.url === URL && win.webContents.getURL() === URL, 'after-helper-frame-retired');
        verifyOriginal();
        stage('after-helper-script-dispatch');
        receipt.afterHelper = await within(() => originalFrame.executeJavaScript('17'), remaining(3000, 1000), 'after-helper-script-timeout');
        verifyOriginal();
        need(receipt.afterHelper === 17, 'after-helper-script-result');
        stage('after-helper-script-result');
      }
    } catch (_) { ok = false; receipt.error ||= 'after-helper-script-failed'; stage('after-helper-script-failed'); }
    try {
      ipcMain.removeHandler('ete-owned-liveness-echo');
      ipcMain.removeAllListeners('ete-owned-liveness-report');
      stage('before-window-destroy');
      need(clients.every(client => client.exited && client.closeSeen), 'helper-carrier-still-owned');
      for (const owned of windows) if (!owned.isDestroyed()) owned.destroy();
      need(windows.every(owned => owned.isDestroyed()), 'window-cleanup-incomplete');
      stage('after-window-destroy');
    } catch (_) { ok = false; receipt.cleanupError ||= 'worker-cleanup-failed'; stage('cleanup-failed'); }
    receipt.helpers = helperFacts();
    receipt.status = ok && !failed ? 'PASS' : 'FAIL';
    stage(receipt.status === 'PASS' ? 'complete' : 'failed');
    clearTimeout(watchdog); clearTimeout(hardWatchdog); clearInterval(tickTimer);
    stage('app-exit-requested');
    app.exit(receipt.status === 'PASS' ? 0 : 2);
  };
  const watchdog = setTimeout(() => {
    failed = true;
    void finish(false, Error('worker-deadline'));
  }, Math.max(1, args.deadline - Date.now() - 5000));
  const hardWatchdog = setTimeout(() => {
    failed = true; receipt.status = 'FAIL'; receipt.error ||= 'worker-deadline'; receipt.helpers = helperFacts();
    receipt.ownedHelpersClosed = clients.length === 1 && clients.every(client => helperHealthy(client, true));
    receipt.native.closed = receipt.ownedHelpersClosed;
    receipt.cleanupError = 'cleanup-deadline';
    for (const client of clients) if (!client.exited && client.child) {
      try { receipt.forcedHelperKill = true; requestOwnedKill(client); } catch (_) { }
    }
    stage('deadline-failed'); clearInterval(tickTimer); app.exit(2);
  }, Math.max(1, args.deadline - Date.now() - 1000));
  try {
  for (const [key, dir] of [['appData', 'appdata'], ['userData', 'userdata'], ['sessionData', 'session'], ['temp', 'temp'], ['logs', 'logs'], ['crashDumps', 'crashes']]) {
    const target = path.join(root, dir);
    need(fs.statSync(target).isDirectory(), 'worker-profile-directory');
    app.setPath(key, target);
  }
  app.on('window-all-closed', () => stage('all-windows-closed'));
  app.on('before-quit', () => stage('before-quit'));
  app.on('will-quit', () => stage('will-quit'));
  app.on('quit', () => stage('quit'));
  process.on('exit', () => stage('process-exit'));
  stage('verified');
    await within(() => app.whenReady(), Math.min(10000, args.deadline - Date.now() - 4000), 'ready-timeout');
    need(!finishing, 'worker-retired');
    receipt.ready = app.isReady();
    need(receipt.ready, 'ready-failed');
    stage('ready');
    const ownedSession = session.fromPath(path.join(root, 'session'), {cache: false});
    ownedSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    ownedSession.setPermissionCheckHandler(() => false);
    ownedSession.webRequest.onBeforeRequest((details, callback) => callback({cancel: details.url !== URL && details.url !== SURFACE_URL}));
    class HiddenWindow extends BrowserWindow {
      constructor(options) {
        super({...options, show: false, focusable: false, skipTaskbar: true, webPreferences: {...options.webPreferences, session: ownedSession, backgroundThrottling: false}});
        windows.push(this);
        this.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
        this.webContents.on('will-navigate', (event, url) => { if (url !== URL && url !== SURFACE_URL) event.preventDefault(); });
      }
      show() { throw Error('window-show-forbidden'); }
      showInactive() { throw Error('window-show-forbidden'); }
      focus() { throw Error('window-focus-forbidden'); }
    }
    win = new HiddenWindow({show: false, width: 320, height: 180, focusable: false,
      webPreferences: {session: ownedSession, preload: path.join(__dirname, 'windows-liveness-preload.cjs'),
        contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false}});
    receipt.windowsCreated = windows.length;
    receipt.hidden = win.isVisible() === false;
    receipt.backgroundThrottling = win.webContents.getBackgroundThrottling();
    need(receipt.hidden && receipt.backgroundThrottling === false, 'window-options');
    win.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
    win.webContents.on('will-navigate', (event, url) => { if (url !== URL) event.preventDefault(); });
    const trusted = event => event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame && event.senderFrame.url === URL;
    ipcMain.handle('ete-owned-liveness-echo', (event, seq) => {
      need(trusted(event) && Number.isInteger(seq) && seq >= 1 && seq <= 4, 'ipc-untrusted');
      need(seq === receipt.ipcCounts.reduce((a, b) => a + b, 0) + 1, 'ipc-sequence');
      receipt.ipcCounts[seq - 1]++;
      need(receipt.ipcCounts[seq - 1] === 1, 'ipc-duplicate');
      return Promise.resolve({seq});
    });
    ipcMain.on('ete-owned-liveness-report', (event, label) => {
      if (!trusted(event) || !['entered', 'returned', 'settled', 'rejected'].includes(label)) { failed = true; void finish(false, Error('report-untrusted')); return; }
      if (receipt.observations.length >= 64) { failed = true; void finish(false, Error('observation-limit')); return; }
      receipt.observations.push(label);
    });
    await within(() => win.loadURL(URL), Math.min(6000, args.deadline - Date.now() - 4000), 'load-timeout');
    need(!finishing, 'worker-retired');
    const frame = win.webContents.mainFrame;
    originalFrame = frame;
    const stable = () => need(!finishing && !win.isDestroyed() && !win.webContents.isDestroyed() && win.webContents.mainFrame === frame && !frame.detached && !frame.isDestroyed() && frame.url === URL && win.webContents.getURL() === URL, 'frame-untrusted');
    stage('loaded');
    stage('before-helper-script-dispatch');
    receipt.beforeHelper = await within(() => frame.executeJavaScript('11'), remaining(3000), 'before-helper-script-timeout');
    stable(); need(receipt.beforeHelper === 11, 'before-helper-script-result');
    stage('before-helper-script-result');
    const get = relative => require(path.join(plan.runtime, 'electronapp', relative));
    const ProductClient = get('native-helper/controller').NativeHelperClient;
    class ObservedClient extends ProductClient {
      constructor(options) {
        need(!finishing, 'helper-start-retired');
        super({...options, onEvent: message => {
          if (message.generationId === generationId && message.name === 'time-pos' && typeof message.value === 'number' && Number.isFinite(message.value)) {
            receipt.native.timePositionCount = Math.min(10000, receipt.native.timePositionCount + 1);
            if (firstPosition === null) firstPosition = message.value;
            receipt.native.firstPosition = firstPosition; receipt.native.latestPosition = message.value;
            receipt.native.playbackAdvanced ||= message.value >= firstPosition + 0.1;
          }
          if (message.generationId === generationId && message.name === 'core-idle' && typeof message.value === 'boolean') {
            receipt.native.coreIdleCount = Math.min(10000, receipt.native.coreIdleCount + 1);
            receipt.native.coreIdle = message.value;
          }
          options.onEvent(message);
        }});
        clients.push(this); this.closeSeen = false;
      }
      async start() {
        need(!finishing, 'helper-start-retired');
        const starting = super.start();
        if (this.child) {
          const child = this.child, originalKill = child.kill.bind(child);
          const denied = error => { if (error && ['EPERM', 'EACCES'].includes(error.code)) this.killDenied = true; };
          child.on('error', denied);
          child.kill = (...args) => {
            if (!allowedKill(this)) return false;
            this.killAttempted = true;
            try { return originalKill(...args); } catch (error) { denied(error); throw error; }
          };
          child.once('close', () => { this.closeSeen = true; });
        }
        await starting;
        need(helperHealthy(this), 'helper-handshake');
        return this;
      }
      load(args) {
        need(!finishing, 'helper-load-retired');
        need(args.length === 2 && args[0] === 'loadfile' && args[1] === fixture, 'helper-source');
        verifyFixture(plan);
        return super.load(args);
      }
    }
    stable();
    service = get('native-helper/service').createService({electron: {BrowserWindow: HiddenWindow},
      NativeHelperClient: ObservedClient, runtimeRoot: plan.runtime,
      getMainWindow: () => win, getWebContents: () => win.webContents, getRangeCacheConfig: () => null});
    stage('helper-create-dispatch');
    const created = await within(() => service.call('create', {}), remaining(10000), 'helper-create-timeout');
    stable();
    need(created.status === 'ok' && typeof created.endpointId === 'string' && clients.length === 1 && helperHealthy(clients[0]), 'helper-create');
    endpointId = created.endpointId;
    receipt.native.created = true;
    receipt.helperReady = true; receipt.helpers = helperFacts(); receipt.windowsCreated = windows.length;
    need(windows.every(owned => !owned.isVisible() && owned.webContents.getBackgroundThrottling() === false), 'native-hidden');
    stage('helper-ready');
    if (args.case !== 'helper-idle') {
      await within(() => service.call('observe', {properties: ['time-pos', 'core-idle']}, endpointId), remaining(2000), 'helper-observe-timeout');
      const begun = await within(() => service.call('begin-generation', {requestEpoch: 1, label: 'owned-liveness'}, endpointId), remaining(2000), 'helper-generation-timeout');
      stable();
      need(begun.status === 'ok' && Number.isSafeInteger(begun.generationId), 'helper-generation');
      generationId = begun.generationId;
      verifyFixture(plan);
      stage('helper-load-dispatch');
      const loaded = await within(() => service.call('command', {generationId, data: ['loadfile', fixture]}, endpointId), remaining(3000), 'helper-load-timeout');
      stable(); need(loaded.status === 'accepted', 'helper-load');
      receipt.native.loaded = true;
      await waitFor(() => receipt.native.playbackAdvanced && receipt.native.coreIdleCount > 0, remaining(6000), 'helper-playback-timeout');
      stage('helper-playback-advanced');
      stable();
      if (args.case === 'helper-preview') {
        receipt.previewCalls++;
        stage('helper-preview-dispatch');
        const preview = await within(() => service.capturePreview({endpointId, generationId}), remaining(2500), 'helper-preview-timeout');
        stable(); need(coloredFrame(preview), 'helper-preview-frame');
        receipt.preview = {width: preview.width, height: preview.height, colored: true};
        stage('helper-preview-result');
      }
    }
    receipt.undefinedScripts = [];
    for (const [label, expression] of [['undefined-promise', 'Promise.resolve(undefined)'], ['undefined-timer', 'new Promise(resolve => setTimeout(() => resolve(undefined), 25))']]) {
      stable();
      const record = {label, dispatched: true}; receipt.undefinedScripts.push(record); stage('undefined-script-dispatch');
      const sequence = receipt.undefinedScripts.length;
      const value = await within(() => frame.executeJavaScript(observeExpression(voidExpression(expression, sequence))), remaining(3000), 'undefined-script-timeout');
      stable(); record.wireResultType = wireResultType(value); stage('undefined-script-returned');
      record.completionAck = await within(() => frame.executeJavaScript(voidAckExpression(sequence)), remaining(3000), 'undefined-ack-timeout');
      stable(); need(record.completionAck === 20 + sequence, 'undefined-completion-missing');
      record.rendererResultType = 'undefined'; stage('undefined-script-result');
    }
    for (const [label, expression, expected] of SCRIPTS) {
      stable();
      const record = {label, dispatched: true}; receipt.scripts.push(record); stage('script-dispatch');
      const script = observeExpression(expression);
      const value = await within(() => frame.executeJavaScript(script), Math.min(3000, args.deadline - Date.now() - 4000), 'script-timeout');
      stable(); need(value === expected, 'script-result'); record.result = value; stage('script-result');
    }
    const observationDeadline = Math.min(Date.now() + 1000, args.deadline - 4000);
    while (receipt.observations.filter(label => label === 'settled').length < 8 || receipt.ipcCounts[1] !== 1) {
      need(!finishing && Date.now() < observationDeadline, 'observation-timeout');
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    need(receipt.scripts.length === 6 && receipt.ipcCounts.every(count => count === 1) &&
      ['entered', 'returned', 'settled'].every(label => receipt.observations.filter(value => value === label).length === 8) &&
      !receipt.observations.includes('rejected'), 'completion-incomplete');
    need(clients.length === 1 && helperHealthy(clients[0]) && !clients[0].exited, 'helper-retired-during-scripts');
    await finish(true);
  } catch (error) { await finish(false, error); }
}
module.exports = {parseArgs, within, observeExpression, voidExpression, voidAckExpression, wireResultType, SCRIPTS, URL, run, helperHealthy, coloredFrame, verifyFixture, allowedKill};
// Electron runs this as the application entry; require.main is not reliable there.
if (process.versions.electron) run().catch(error => {
  const code = error && /^[a-z0-9-]{1,100}$/.test(error.message) ? error.message : 'worker-startup-failed';
  console.error('ETE_LIVENESS_STARTUP_FAIL ' + code);
  require('electron').app.exit(2);
});
