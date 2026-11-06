'use strict';
// Offline diagnostic entry only. Never imports electron-main or real profiles.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const option = name => process.argv[process.argv.indexOf(name) + 1];
const modes = new Set(['entry', 'imports', 'panel-memory', 'panel-disk']);
const mode = option('--isolation-case'), root = option('--isolation-root');
if (!process.argv.includes('--isolation-case') || !process.argv.includes('--isolation-root') || !modes.has(mode) ||
    !path.isAbsolute(root || '') || !/^ete-fn-isolate-[a-f0-9]{32}$/.test(path.basename(root))) throw new Error('ISOLATION_INPUT_INVALID');
for (let dir = root; ; dir = path.dirname(dir)) {
    if (fs.lstatSync(dir).isSymbolicLink()) throw new Error('ISOLATION_ROOT_INVALID');
    if (dir === path.dirname(dir)) break;
}
const marker = path.join(root, '.isolation-owner');
if (!fs.lstatSync(root).isDirectory() || fs.readdirSync(root).length !== 1 ||
    fs.lstatSync(marker).isSymbolicLink() || !fs.lstatSync(marker).isFile() ||
    fs.readFileSync(marker, 'utf8') !== 'ETE_FN_ISOLATION_V1\n') throw new Error('ISOLATION_ROOT_INVALID');
const file = path.join(root, 'fixture.json');
const state = {entryId: 'ETE_FN_ISOLATION_V1', runId: path.basename(root).slice(15), mode,
    sourceSha: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
    pid: process.pid, electronVersion: process.versions.electron || 'UNKNOWN', sequence: 0,
    stage: 'ENTRY', result: 'PENDING', errorCode: null, failureStage: null, quitObserved: false, exitObserved: false, exitCode: null,
    blockedRequests: 0, environment: {runAsNodePresent: Object.hasOwn(process.env, 'ELECTRON_RUN_AS_NODE'),
        nodeOptionsPresent: Object.hasOwn(process.env, 'NODE_OPTIONS')}};
function checkpoint(stage) {
    state.stage = stage; state.sequence++;
    fs.writeFileSync(file + '.next', JSON.stringify(state) + '\n', {flag: 'wx'});
    fs.renameSync(file + '.next', file);
}
function observe() { try { checkpoint(state.stage); } catch {} }
checkpoint('ENTRY'); // Before loading Electron or any prototype modules.
process.on('uncaughtExceptionMonitor', () => { state.result = 'FAILED'; state.errorCode = 'UNCAUGHT_EXCEPTION'; state.failureStage = state.stage; observe(); });
process.on('exit', code => {
    state.exitObserved = true; state.exitCode = Number.isInteger(code) ? code : null;
    if (state.result === 'PENDING') { state.result = 'FAILED'; state.errorCode = 'EARLY_EXIT'; state.failureStage = state.stage; }
    observe();
});
const {app, BrowserWindow, session} = require('electron');
checkpoint('ELECTRON_IMPORTED');
let window, ownedSession, finishing = false;
const timeout = setTimeout(() => { void finish('FAILED', 'FIXTURE_TIMEOUT'); }, 15000);
app.on('window-all-closed', () => {}); // Cleanup, not window count, owns quit.
app.on('quit', () => { state.quitObserved = true; observe(); });
async function finish(result, errorCode = null) {
    if (finishing) return;
    finishing = true; clearTimeout(timeout);
    state.result = result; state.errorCode = errorCode; state.failureStage = result === 'FAILED' ? state.stage : null;
    try {
        if (window && !window.isDestroyed()) window.destroy();
        if (ownedSession) await ownedSession.flushStorageData();
    } catch { state.result = 'FAILED'; state.errorCode = 'CLEANUP_FAILED'; state.failureStage = 'CLEANUP'; }
    checkpoint('DONE');
    process.exitCode = state.result === 'PASSED' ? 0 : 1;
    app.quit();
}
// No existing userData/sessionData/profile is opened. Both panel variants have
// identical control paths relative to their new run; only Session type differs.
const control = path.join(root, 'Control'); fs.mkdirSync(control);
app.setPath('userData', control); app.setPath('sessionData', control);
checkpoint('CONTROL_READY');
const html = 'data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; base-uri \'none\'; form-action \'none\'"><title>FN offline startup check</title><p>Offline startup check</p>');
function denyNetwork(target) {
    target.webRequest.onBeforeRequest({urls: ['<all_urls>']}, (details, callback) => {
        const ownDocument = window && details.webContentsId === window.webContents.id &&
            details.resourceType === 'mainFrame' && details.url === html;
        if (!ownDocument) state.blockedRequests = Math.min(32, state.blockedRequests + 1);
        callback({cancel: !ownDocument});
    });
}
app.whenReady().then(async () => {
    if (finishing) return;
    checkpoint('APP_READY');
    if (mode === 'imports') {
        checkpoint('IMPORTS_STARTED');
        for (const name of ['policy', 'controller', 'bridge', 'electron-io', 'fixture', 'profile-store']) require('./' + name + '.cjs');
        checkpoint('IMPORTS_READY');
    }
    if (mode === 'entry' || mode === 'imports') return finish('PASSED');
    denyNetwork(session.defaultSession); checkpoint('NETWORK_GATE_READY');
    checkpoint('SESSION_CREATE_STARTED');
    if (mode === 'panel-disk') {
        const disk = path.join(root, 'SyntheticSession'); fs.mkdirSync(disk);
        ownedSession = session.fromPath(disk, {cache: false});
    } else ownedSession = session.fromPartition('fn-isolation-' + state.runId, {cache: false});
    denyNetwork(ownedSession); checkpoint('SESSION_READY');
    checkpoint('WINDOW_CREATE_STARTED');
    window = new BrowserWindow({width: 420, height: 180, show: true, title: 'FN offline startup check',
        webPreferences: {session: ownedSession, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true}});
    window.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.on('render-process-gone', () => { void finish('FAILED', 'RENDER_PROCESS_GONE'); });
    checkpoint('WINDOW_CREATED');
    await window.loadURL(html);
    if (finishing) return;
    checkpoint('PANEL_READY'); await finish('PASSED');
}).catch(() => { void finish('FAILED', 'FIXTURE_STEP_FAILED'); });
