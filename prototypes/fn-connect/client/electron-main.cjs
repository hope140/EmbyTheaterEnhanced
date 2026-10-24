'use strict';

// Standalone experiment: this is deliberately absent from production main,
// runtime manifests, installers and release workflows.
const electron = require('electron');
const {app, BrowserWindow, ipcMain} = electron;
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {createController} = require('./controller.cjs');
const {createBridge} = require('./bridge.cjs');
const {createElectronIO} = require('./electron-io.cjs');
const {createFixture} = require('./fixture.cjs');
const {config: validateConfig} = require('./policy.cjs');

if (!process.argv.includes('--fn-connect-prototype')) {
    process.stderr.write('FN_PROTOTYPE_DISABLED\n');
    app.exit(2);
} else {
    const fixtureMode = process.argv.includes('--fixture') || process.argv.includes('--fixture-smoke');
    const smoke = process.argv.includes('--fixture-smoke');
    const runnerProfileRoot = smoke && process.env.ETE_FN_FIXTURE_PROFILE_ROOT;
    if (runnerProfileRoot && (!path.isAbsolute(runnerProfileRoot) || path.basename(runnerProfileRoot) !== 'profiles' ||
        !/^ete-fn-runner-[a-f0-9]{32}$/.test(path.basename(path.dirname(runnerProfileRoot))) ||
        !fs.lstatSync(runnerProfileRoot).isDirectory() || fs.lstatSync(runnerProfileRoot).isSymbolicLink())) {
        throw new Error('INVALID_FIXTURE_PROFILE_ROOT');
    }
    const temporary = fs.mkdtempSync(runnerProfileRoot ? path.join(runnerProfileRoot, 'profile-') : path.join(os.tmpdir(), 'ete-fn-client-'));
    fs.chmodSync(temporary, 0o700);
    app.setPath('userData', temporary);
    app.setPath('sessionData', temporary);
    let smokeOutcome = null;
    function report(kind, value) {
        // quit handlers cannot await stdout callbacks; write the small fixed
        // evidence record synchronously to the runner's redirected pipe.
        if (smoke) fs.writeSync(1, 'ETE_FN_FIXTURE ' + JSON.stringify({kind, ...value}) + '\n');
    }
    function stage(value) { report('stage', {stage: value}); }
    stage('APP_CODE_STARTED');
    report('runtime', {electronVersion: process.versions?.electron || 'UNKNOWN'});
    let fixture, controller, bridge, panel, closing;
    let stopping = false, startupDone;
    const startupSettled = new Promise(resolve => { startupDone = resolve; });
    const panelUrl = pathToFileURL(path.join(__dirname, 'panel.html')).href;
    const initialProfiles = new Set();
    let defaults = null;
    function publish(state) {
        if (panel && !panel.isDestroyed()) panel.webContents.send('fn-experiment-state', state);
    }
    function code(error) { return /^[A-Z_]{2,60}$/.test(error?.code || '') ? error.code : 'PROTOTYPE_ACTION_FAILED'; }
    async function action(name, payload) {
        if (stopping) throw new Error('SHUTTING_DOWN');
        if (name === 'defaults') return {fixture: fixtureMode, config: defaults};
        if (name === 'add') {
            const id = controller.add(payload);
            initialProfiles.add(id);
            try { await controller.start(id); }
            catch (error) { await controller.close(id); initialProfiles.delete(id); throw error; }
            return {id, state: 'authorizing'};
        }
        if (!payload || !initialProfiles.has(payload.id)) throw new Error('UNKNOWN_PROFILE');
        if (name === 'target') { controller.showTarget(payload.id); return {id: payload.id, state: 'target-opened'}; }
        if (name === 'verify') return controller.verify(payload.id);
        if (name === 'remove') {
            await controller.close(payload.id); initialProfiles.delete(payload.id);
            return {id: payload.id, state: 'closed'};
        }
        if (name === 'fixture-media' && fixtureMode) {
            const lease = bridge.lease(payload.id, {path: 'media.bin'});
            try {
                const response = await fetch(lease.url, {headers: {Range: 'bytes=11-97'}});
                const bytes = (await response.arrayBuffer()).byteLength;
                return {id: payload.id, state: response.status === 206 && bytes === 87 ? 'fixture-range-passed' : 'fixture-range-failed'};
            } finally { lease.revoke(); }
        }
        throw new Error('UNKNOWN_ACTION');
    }
    async function shutdown() {
        if (closing) return closing;
        stopping = true;
        closing = (async () => {
            await startupSettled;
            const results = await Promise.allSettled([
                bridge?.close(), controller?.closeAll()
            ]);
            await fixture?.close();
            if (results.some(result => result.status === 'rejected')) throw new Error('DRAIN_FAILED');
        })();
        return closing;
    }
    async function smokeFixture() {
        const {runElectronSmoke, waitFor} = require('./electron-smoke.cjs');
        const security = await panel.webContents.executeJavaScript('window.fnExperiment.security');
        if (security?.sandboxed !== true || security.contextIsolated !== true) throw new Error('FIXTURE_RENDERER_SECURITY_FAILED');
        const result = await runElectronSmoke({controller, bridge, fixture, stage,
            async addProfile() {
                const previous = new Set(BrowserWindow.getAllWindows());
                const added = await action('add', defaults);
                const window = BrowserWindow.getAllWindows().find(value => !previous.has(value));
                if (!window) throw new Error('FIXTURE_WINDOW_MISSING');
                return {id: added.id, window, session: window.webContents.session};
            },
            async authorizeProfile(profile) {
                // Synthetic page only: no script is injected into real NAS pages.
                if (new URL(defaults.bootstrapUrl).hostname !== '127.0.0.1') throw new Error('FIXTURE_ONLY');
                await waitFor(() => !profile.window.webContents.isLoading() && profile.window.webContents.getURL() === defaults.bootstrapUrl);
                await profile.window.webContents.executeJavaScript('document.querySelector("form").requestSubmit()');
                await waitFor(async () => (await profile.session.cookies.get({url: defaults.embyUrl})).length > 0);
                await action('target', {id: profile.id});
            },
            removeProfile: id => action('remove', {id})
        });
        return {...result, sandboxedControlRenderer: true, isolatedControlRenderer: true};
    }
    app.whenReady().then(async () => {
        try {
        if (stopping) return;
        stage('APP_READY');
        if (fixtureMode) { fixture = await createFixture(); defaults = fixture.profile; }
        else {
            const at = process.argv.indexOf('--profile-config');
            if (at >= 0) {
                const input = fs.readFileSync(process.argv[at + 1]);
                if (input.length > 16384) throw new Error('PROFILE_TOO_LARGE');
                defaults = JSON.parse(input.toString('utf8'));
                validateConfig(defaults, 'live');
            }
        }
        if (stopping) return;
        controller = createController({enabled: true, mode: fixtureMode ? 'fixture' : 'live',
            io: createElectronIO(electron, {onStatus: reason => publish({state: 'notice', reason})})});
        bridge = await createBridge(controller, {enabled: true});
        if (stopping) return;
        controller.onState(publish);
        panel = new BrowserWindow({width: 880, height: 750, show: !smoke, title: 'FN transport standalone experiment',
            webPreferences: {preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false,
                contextIsolation: true, sandbox: true, webSecurity: true}});
        panel.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
        panel.webContents.on('will-navigate', event => event.preventDefault());
        ipcMain.handle('fn-experiment-action', async (event, name, payload) => {
            if (event.sender !== panel.webContents || event.senderFrame !== panel.webContents.mainFrame ||
                event.senderFrame.url !== panelUrl) return {error: 'INVALID_SENDER'};
            try { return await action(name, payload); } catch (error) { return {error: code(error)}; }
        });
        panel.on('closed', () => app.quit());
        await panel.loadURL(panelUrl);
        stage('PANEL_READY');
        } finally { startupDone(); }
        if (smoke && !stopping) {
            try { smokeOutcome = {result: 'PASSED', checks: await smokeFixture()}; }
            catch (error) { process.exitCode = 1; smokeOutcome = {result: 'FAILED', reason: code(error)}; }
            await shutdown();
            stage('DRAINED');
            app.quit();
        }
    }).catch(async () => {
        startupDone();
        if (stopping) { await shutdown().catch(() => {}); app.quit(); return; }
        process.exitCode = 1;
        if (smoke) smokeOutcome = {result: 'FAILED', reason: 'STARTUP_FAILED'};
        process.stderr.write('FN_PROTOTYPE_START_FAILED\n');
        await shutdown().catch(() => {}); app.quit();
    });
    let drained = false;
    app.on('before-quit', event => {
        if (drained) return;
        event.preventDefault();
        shutdown().then(() => { drained = true; app.quit(); }, () => { process.stderr.write('FN_PROTOTYPE_DRAIN_FAILED\n'); });
    });
    app.on('quit', () => {
        let removed = false;
        if (!runnerProfileRoot) {
            try { fs.rmSync(temporary, {recursive: true, force: true}); removed = !fs.existsSync(temporary); } catch { /* No paths in diagnostics. */ }
        }
        if (smoke) {
            if (!runnerProfileRoot && !removed) { process.exitCode = 1; smokeOutcome = {result: 'FAILED', reason: 'TEMP_PROFILE_CLEANUP_FAILED'}; }
            report('result', {test: 'electron-synthetic-session', ...(smokeOutcome || {result: 'FAILED', reason: 'INCOMPLETE'}),
                profileCleanupOwner: runnerProfileRoot ? 'runner' : 'application', temporaryProfileRemoved: removed});
        }
    });
}
