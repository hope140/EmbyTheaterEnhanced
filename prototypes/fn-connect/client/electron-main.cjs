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
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-fn-client-'));
    fs.chmodSync(temporary, 0o700);
    app.setPath('userData', temporary);
    app.setPath('sessionData', temporary);
    const fixtureMode = process.argv.includes('--fixture') || process.argv.includes('--fixture-smoke');
    const smoke = process.argv.includes('--fixture-smoke');
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
    async function waitFor(check) {
        const deadline = Date.now() + 5000;
        while (!await check()) {
            if (Date.now() >= deadline) throw new Error('FIXTURE_DEADLINE');
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }
    async function smokeFixture() {
        const added = await action('add', defaults), id = added.id;
        const login = BrowserWindow.getAllWindows().find(win => win !== panel);
        await waitFor(() => !login.webContents.isLoading() && login.webContents.getURL() === defaults.bootstrapUrl);
        // Synthetic page only; no script is injected into a real NAS page.
        if (new URL(login.webContents.getURL()).hostname !== '127.0.0.1') throw new Error('FIXTURE_ONLY');
        await login.webContents.executeJavaScript('document.querySelector("form").requestSubmit()');
        const ownSession = login.webContents.session;
        await waitFor(async () => (await ownSession.cookies.get({url: defaults.embyUrl})).length > 0);
        await action('target', {id});
        await action('verify', {id});
        const range = await action('fixture-media', {id});
        if (range.state !== 'fixture-range-passed') throw new Error('RANGE_FAILED');
        const isolated = await action('add', defaults);
        let denied = false;
        try { await action('verify', isolated); } catch (error) { denied = error.code === 'FN_AUTH_REQUIRED'; }
        if (!denied) throw new Error('SESSION_ISOLATION_FAILED');
        const lease = bridge.lease(id, {path: 'direct', headers: {'X-Emby-Token': 'synthetic-electron-canary'}});
        await (await fetch(lease.url)).arrayBuffer(); lease.revoke();
        if (fixture.state.externalRequests.some(headers => headers.cookie || headers['x-emby-token'] || headers.authorization)) throw new Error('REDIRECT_LEAK');
        process.stdout.write(JSON.stringify({test: 'electron-synthetic-session', result: 'PASSED',
            bootstrap: true, isolatedSessions: true, range206: true, externalRedirectCredentialSeparation: true,
            realFNConnect: 'NOT_TESTED', nativeHelperPlayback: 'NOT_TESTED'}) + '\n');
    }
    app.whenReady().then(async () => {
        try {
        if (stopping) return;
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
        } finally { startupDone(); }
        if (smoke && !stopping) {
            try { await smokeFixture(); }
            catch (error) { process.exitCode = 1; process.stdout.write(JSON.stringify({test: 'electron-synthetic-session', result: 'FAILED', reason: code(error)}) + '\n'); }
            await shutdown();
            app.quit();
        }
    }).catch(async () => {
        startupDone();
        if (stopping) { await shutdown().catch(() => {}); app.quit(); return; }
        process.exitCode = 1;
        process.stderr.write('FN_PROTOTYPE_START_FAILED\n');
        await shutdown().catch(() => {}); app.quit();
    });
    let drained = false;
    app.on('before-quit', event => {
        if (drained) return;
        event.preventDefault();
        shutdown().then(() => { drained = true; app.quit(); }, () => { process.stderr.write('FN_PROTOTYPE_DRAIN_FAILED\n'); });
    });
    app.on('quit', () => { try { fs.rmSync(temporary, {recursive: true, force: true}); } catch { /* Reported as temporary profile cleanup only. */ } });
}
