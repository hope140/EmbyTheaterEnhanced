'use strict';
// Owned, no-media runtime liveness probe. No playback or service modules are loaded.
const fs = require('node:fs');
const path = require('node:path');
const CASES = ['bare', 'contents', 'frame'];
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
async function run() {
  const started = Date.now();
  const args = parseArgs(process.argv.slice(2));
  const {readPlan, profileFor} = require('./windows-liveness.cjs');
  const plan = readPlan(args.plan, args['plan-sha256']);
  const profile = profileFor(plan, args.case);
  const root = typeof profile === 'string' ? profile : profile.root;
  need(typeof root === 'string' && path.isAbsolute(root), 'worker-profile');
  const {app, BrowserWindow, ipcMain, session} = require('electron');
  need(process.platform === 'win32' && process.type === 'browser' && !app.isReady(), 'worker-process');
  need(path.resolve(process.execPath).toLowerCase() === path.resolve(plan.runtime, 'x64/electron/electron.exe').toLowerCase(), 'worker-runtime');
  need(args.deadline > Date.now() + 1000 && args.deadline <= started + plan.limits.caseMs, 'worker-deadline');
  const receipt = {schema: 1, kind: 'runtime-liveness-case', case: args.case, status: 'FAIL', pid: process.pid,
    ppid: process.ppid, processType: process.type, browserProcess: process.type === 'browser', electronVersion: process.versions.electron,
    verificationMs: Date.now() - started, scripts: [], ipcCounts: [0, 0, 0, 0], observations: []};
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
  let win, finishing = false;
  const finish = (ok, error) => {
    if (finishing) return;
    finishing = true;
    receipt.status = 'FAIL';
    if (error) receipt.error = /^[a-z0-9-]{1,100}$/.test(error.message) ? error.message : 'worker-failed';
    stage('cleanup-start');
    try {
      ipcMain.removeHandler('ete-owned-liveness-echo');
      ipcMain.removeAllListeners('ete-owned-liveness-report');
      stage('before-window-destroy');
      if (win && !win.isDestroyed()) win.destroy();
      need(!win || win.isDestroyed(), 'window-cleanup-incomplete');
      stage('after-window-destroy');
    } catch (cleanupError) {
      ok = false;
      receipt.error = 'worker-cleanup-failed';
      stage('cleanup-failed');
    }
    receipt.status = ok ? 'PASS' : 'FAIL';
    stage(ok ? 'complete' : 'failed');
    clearTimeout(watchdog);
    stage('app-exit-requested');
    app.exit(ok ? 0 : 2);
  };
  const watchdog = setTimeout(() => finish(false, Error('worker-deadline')), Math.max(1, args.deadline - Date.now() - 1000));
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
    if (args.case === 'bare') { receipt.windowsCreated = 0; need(BrowserWindow.getAllWindows().length === 0, 'bare-window'); finish(true); return; }
    const ownedSession = session.fromPath(path.join(root, 'session'), {cache: false});
    ownedSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    ownedSession.setPermissionCheckHandler(() => false);
    ownedSession.webRequest.onBeforeRequest((details, callback) => callback({cancel: details.url !== URL}));
    win = new BrowserWindow({show: false, width: 320, height: 180, focusable: false,
      webPreferences: {session: ownedSession, preload: path.join(__dirname, 'windows-liveness-preload.cjs'),
        contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false}});
    receipt.windowsCreated = 1;
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
      if (!trusted(event) || !['entered', 'returned', 'settled', 'rejected'].includes(label)) { finish(false, Error('report-untrusted')); return; }
      if (receipt.observations.length >= 64) { finish(false, Error('observation-limit')); return; }
      receipt.observations.push(label);
    });
    await within(() => win.loadURL(URL), Math.min(6000, args.deadline - Date.now() - 4000), 'load-timeout');
    need(!finishing, 'worker-retired');
    const frame = win.webContents.mainFrame;
    const stable = () => need(!finishing && !win.isDestroyed() && !win.webContents.isDestroyed() && win.webContents.mainFrame === frame && !frame.detached && !frame.isDestroyed() && frame.url === URL && win.webContents.getURL() === URL, 'frame-untrusted');
    stage('loaded');
    for (const [label, expression, expected] of SCRIPTS) {
      stable();
      const record = {label, dispatched: true}; receipt.scripts.push(record); stage('script-dispatch');
      const script = observeExpression(expression);
      const value = await within(() => args.case === 'contents' ? win.webContents.executeJavaScript(script) : frame.executeJavaScript(script), Math.min(3000, args.deadline - Date.now() - 4000), 'script-timeout');
      stable(); need(value === expected, 'script-result'); record.result = value; stage('script-result');
    }
    const observationDeadline = Math.min(Date.now() + 1000, args.deadline - 4000);
    while (receipt.observations.filter(label => label === 'settled').length < 6 || receipt.ipcCounts[1] !== 1) {
      need(!finishing && Date.now() < observationDeadline, 'observation-timeout');
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    need(receipt.scripts.length === 6 && receipt.ipcCounts.every(count => count === 1) &&
      ['entered', 'returned', 'settled'].every(label => receipt.observations.filter(value => value === label).length === 6) &&
      !receipt.observations.includes('rejected'), 'completion-incomplete');
    finish(true);
  } catch (error) { finish(false, error); }
}
module.exports = {parseArgs, within, observeExpression, SCRIPTS, URL, run};
// Electron runs this as the application entry; require.main is not reliable there.
if (process.versions.electron) run().catch(error => {
  const code = error && /^[a-z0-9-]{1,100}$/.test(error.message) ? error.message : 'worker-startup-failed';
  console.error('ETE_LIVENESS_STARTUP_FAIL ' + code);
  require('electron').app.exit(2);
});
