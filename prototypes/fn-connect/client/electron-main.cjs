'use strict';

// Standalone experiment: this is deliberately absent from production main,
// runtime manifests, installers and release workflows.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const startupReceipt = (() => {
    const at = process.argv.indexOf('--startup-receipt-root');
    if (at < 0) return {stage() {}, failed() {}};
    const root = process.argv[at + 1], entryId = 'ETE_FN_STARTUP_RECEIPT_V1';
    if (typeof root !== 'string' || !path.isAbsolute(root) || !/^ete-fn-startup-[a-f0-9]{32}$/.test(path.basename(root)) ||
        fs.lstatSync(root).isSymbolicLink() || !fs.lstatSync(root).isDirectory() ||
        fs.readdirSync(root).length !== 1) throw new Error('STARTUP_RECEIPT_ROOT_INVALID');
    const marker = path.join(root, '.startup-owner');
    if (fs.lstatSync(marker).isSymbolicLink() || !fs.lstatSync(marker).isFile() ||
        fs.readFileSync(marker, 'utf8') !== entryId + '\n') throw new Error('STARTUP_RECEIPT_ROOT_INVALID');
    const sourceSha = require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'electron-main.cjs'))).digest('hex');
    const state = {entryId, runId: path.basename(root).slice('ete-fn-startup-'.length), sourceSha,
        pid: Number.isInteger(process.pid) ? process.pid : null,
        electronVersion: /^\d+\.\d+\.\d+$/.test(process.versions?.electron || '') ? process.versions.electron : 'UNKNOWN',
        sequence: 0, stage: 'ENTRY', status: 'ENTERED', readyReached: false, exitObserved: false, exitCode: null, errorCode: null};
    const file = path.join(root, 'startup.json');
    const write = () => {
        state.sequence++;
        fs.writeFileSync(file + '.next', JSON.stringify(state) + '\n', {flag: 'wx'});
        fs.renameSync(file + '.next', file);
    };
    const observe = () => { try { write(); } catch { /* A missing/stale receipt must fail the caller's validation. */ } };
    const failed = error => {
        const codes = new Set(['PROFILE_APPLICATION_IN_USE', 'PROFILE_STORAGE_INVALID', 'PROFILE_ROOT_INVALID',
            'PROFILE_REGISTRY_BUSY', 'PROFILE_IN_USE', 'INVALID_PROFILE', 'PROFILE_TOO_LARGE', 'FN_PROTOTYPE_DISABLED']);
        state.status = 'FAILED';
        state.errorCode = codes.has(error?.code) ? error.code : error?.code === 'MODULE_NOT_FOUND' ? 'MISSING_DEPENDENCY' :
            ['SyntaxError', 'TypeError', 'ReferenceError'].includes(error?.name) ? error.name.toUpperCase() : 'STARTUP_FAILED';
        observe();
    };
    write(); // Write the first entry before loading application dependencies; not an fsync guarantee.
    process.on('uncaughtExceptionMonitor', failed);
    process.on('exit', code => {
        state.exitObserved = true;
        state.exitCode = Number.isInteger(code) && code >= -2147483648 && code <= 4294967295 ? code : null;
        if (state.status !== 'FAILED') state.status = state.readyReached ? 'CLOSED' : 'EARLY_EXIT';
        observe();
    });
    return {failed, stage(value) {
        if (!['APP_CODE_STARTED', 'APP_READY', 'PANEL_READY'].includes(value) || state.status === 'FAILED') return;
        state.stage = value; state.readyReached ||= value === 'PANEL_READY';
        state.status = state.readyReached ? 'READY' : 'STARTING'; observe();
    }};
})();
const electron = require('electron');
const {app, BrowserWindow, ipcMain} = electron;
const {pathToFileURL} = require('node:url');
const {createController} = require('./controller.cjs');
const {createBridge} = require('./bridge.cjs');
const {createElectronIO} = require('./electron-io.cjs');
const {createFixture} = require('./fixture.cjs');
const {config: validateConfig} = require('./policy.cjs');

if (!process.argv.includes('--fn-connect-prototype')) {
    startupReceipt.failed({code: 'FN_PROTOTYPE_DISABLED'});
    process.stderr.write('FN_PROTOTYPE_DISABLED\n');
    app.exit(2);
} else {
    const fixtureMode = process.argv.includes('--fixture') || process.argv.includes('--fixture-smoke');
    const smoke = process.argv.includes('--fixture-smoke');
    const externalCheckAvailable = process.argv.includes('--single-external-header-check');
    const relayExternalMedia = fixtureMode || process.argv.includes('--anonymous-media-relay');
    if (externalCheckAvailable && fixtureMode) throw new Error('EXTERNAL_CHECK_LIVE_ONLY');
    if (externalCheckAvailable && relayExternalMedia) throw new Error('EXTERNAL_TRIAL_MODE_CONFLICT');
    const persistenceRequested = process.argv.includes('--remember-login');
    if (persistenceRequested && (fixtureMode || process.platform !== 'win32')) throw new Error('REMEMBER_LOGIN_UNAVAILABLE');
    let profileStore, persistentControl, releaseControl;
    if (persistenceRequested) {
        const local = process.env.LOCALAPPDATA;
        if (!local || !path.isAbsolute(local)) throw new Error('PROFILE_ROOT_INVALID');
        const {createProfileStore} = require('./profile-store.cjs');
        profileStore = createProfileStore(path.join(fs.realpathSync(local), 'EmbyTheaterEnhanced-FN-Prototype'));
        persistentControl = profileStore.initialize();
        releaseControl = profileStore.lockApplication();
    }
    const runnerProfileRoot = smoke && process.env.ETE_FN_FIXTURE_PROFILE_ROOT;
    if (runnerProfileRoot && (!path.isAbsolute(runnerProfileRoot) || path.basename(runnerProfileRoot) !== 'profiles' ||
        !/^ete-fn-runner-[a-f0-9]{32}$/.test(path.basename(path.dirname(runnerProfileRoot))) ||
        !fs.lstatSync(runnerProfileRoot).isDirectory() || fs.lstatSync(runnerProfileRoot).isSymbolicLink())) {
        throw new Error('INVALID_FIXTURE_PROFILE_ROOT');
    }
    const temporary = persistentControl ? null : fs.mkdtempSync(runnerProfileRoot ? path.join(runnerProfileRoot, 'profile-') : path.join(os.tmpdir(), 'ete-fn-client-'));
    if (temporary) fs.chmodSync(temporary, 0o700);
    // Chromium's app-local state remains stable as well as each Session path.
    app.setPath('userData', persistentControl || temporary);
    app.setPath('sessionData', persistentControl || temporary);
    let smokeOutcome = null;
    function report(kind, value) {
        // quit handlers cannot await stdout callbacks; write the small fixed
        // evidence record synchronously to the runner's redirected pipe.
        if (smoke) fs.writeSync(1, 'ETE_FN_FIXTURE ' + JSON.stringify({kind, ...value}) + '\n');
    }
    function stage(value) { startupReceipt.stage(value); report('stage', {stage: value}); }
    if (smoke) report('binding', {
        runId: /^[a-f0-9]{32}$/.test(process.env.ETE_FN_FIXTURE_RUN_ID || '') ? process.env.ETE_FN_FIXTURE_RUN_ID : 'UNKNOWN',
        sourceCommit: /^[a-f0-9]{40}$/.test(process.env.ETE_FN_FIXTURE_SOURCE_COMMIT || '') ? process.env.ETE_FN_FIXTURE_SOURCE_COMMIT : 'UNKNOWN'
    });
    stage('APP_CODE_STARTED');
    report('runtime', {electronVersion: process.versions?.electron || 'UNKNOWN'});
    let fixture, controller, bridge, panel, closing;
    let stopping = false, startupDone;
    const startupSettled = new Promise(resolve => { startupDone = resolve; });
    const panelUrl = pathToFileURL(path.join(__dirname, 'panel.html')).href;
    const initialProfiles = new Set();
    const rememberAvailable = persistenceRequested;
    function store() {
        if (!rememberAvailable) throw Object.assign(new Error('REMEMBER_LOGIN_UNAVAILABLE'), {code: 'REMEMBER_LOGIN_UNAVAILABLE'});
        return profileStore;
    }
    let defaults = null;
    function publish(state) {
        if (panel && !panel.isDestroyed()) panel.webContents.send('fn-experiment-state', state);
    }
    function code(error) { return /^[A-Z_]{2,60}$/.test(error?.code || '') ? error.code : 'PROTOTYPE_ACTION_FAILED'; }
    async function action(name, payload) {
        if (stopping) throw new Error('SHUTTING_DOWN');
        if (name === 'defaults') return {fixture: fixtureMode, config: defaults, rememberAvailable, externalCheckAvailable};
        if (name === 'saved') return {profiles: rememberAvailable ? store().list(validateConfig(payload, 'live')) : []};
        if (name === 'add') {
            const {rememberLogin, savedProfileId, ...input} = payload || {};
            if (rememberLogin !== undefined && typeof rememberLogin !== 'boolean' || savedProfileId !== undefined &&
                (!rememberLogin || typeof savedProfileId !== 'string')) throw new Error('INVALID_PROFILE');
            const validated = validateConfig(input, fixtureMode ? 'fixture' : 'live');
            const storage = rememberLogin ? store().acquire(validated, savedProfileId) : undefined;
            const id = controller.add(input, {storage});
            initialProfiles.add(id);
            try { await controller.start(id); }
            catch (error) { await controller.close(id); initialProfiles.delete(id); throw error; }
            return {id, state: 'authorizing', remembered: Boolean(storage)};
        }
        if (!payload || !initialProfiles.has(payload.id)) throw new Error('UNKNOWN_PROFILE');
        if (name === 'target') { controller.showTarget(payload.id); return {id: payload.id, state: 'target-opened'}; }
        if (name === 'verify') return controller.verify(payload.id);
        if (name === 'media-check') return controller.armMediaCheck(payload.id, {onReport: publish});
        if (name === 'external-header-once') {
            if (!externalCheckAvailable) throw new Error('EXTERNAL_PROBE_DISABLED');
            return controller.armExternalHeaderCheck(payload.id, {onReport: publish});
        }
        if (name === 'prepare-next-check') return controller.prepareNextCheck(payload.id);
        if (name === 'reopen-check') return controller.reopenCheck(payload.id, {onReport: publish});
        if (name === 'remove' || name === 'forget') {
            await controller.close(payload.id, {forget: name === 'forget'}); initialProfiles.delete(payload.id);
            return {id: payload.id, state: 'closed', sessionAction: name === 'forget' ? 'FORGOTTEN' : 'CLOSED'};
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
                const proxy = await profile.session.resolveProxy(defaults.embyUrl);
                report('diagnostic', {event: 'PROXY_ROUTE', proxyRoute: proxy === 'DIRECT' ? 'DIRECT' : typeof proxy === 'string' ? 'PROXY' : 'UNKNOWN'});
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
        if (fixtureMode) { fixture = await createFixture({distinctOrigins: smoke}); defaults = fixture.profile; }
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
        controller = createController({enabled: true, mode: fixtureMode ? 'fixture' : 'live', relayExternalMedia, allowApiWrites: fixtureMode,
            io: createElectronIO(electron, {onStatus: reason => publish({state: 'notice', reason}),
                anonymousMediaEnabled: relayExternalMedia, mode: fixtureMode ? 'fixture' : 'live',
                authenticationOnly: smoke,
                externalHeaderOrigin: externalCheckAvailable ? 'https://cdnfhnfile.115cdn.net' : undefined,
                onDiagnostic: value => { if (smoke) report('diagnostic', value); }})});
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
        panel.on('close', event => { if (!drained) { event.preventDefault(); app.quit(); } });
        panel.on('closed', () => app.quit());
        await panel.loadURL(panelUrl);
        stage('PANEL_READY');
        } finally { startupDone(); }
        if (smoke && !stopping) {
            try { smokeOutcome = {result: 'PASSED', checks: await smokeFixture()}; }
            catch (error) { process.exitCode = 1; smokeOutcome = {result: 'FAILED', reason: code(error)}; }
            report('diagnostic', fixture.diagnostics());
            await shutdown();
            stage('DRAINED');
            app.quit();
        }
    }).catch(async error => {
        startupReceipt.failed(error);
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
        shutdown().then(() => { drained = true; app.quit(); }, () => {
            publish({state: 'notice', reason: 'FN_PROTOTYPE_DRAIN_FAILED'});
            process.stderr.write('FN_PROTOTYPE_DRAIN_FAILED\n');
        });
    });
    app.on('quit', () => {
        try { releaseControl?.(); } catch { process.stderr.write('FN_PROFILE_LOCK_RELEASE_FAILED\n'); }
        let removed = false;
        if (temporary && !runnerProfileRoot) {
            try { fs.rmSync(temporary, {recursive: true, force: true}); removed = !fs.existsSync(temporary); } catch { /* No paths in diagnostics. */ }
        }
        if (smoke) {
            if (!runnerProfileRoot && !removed) { process.exitCode = 1; smokeOutcome = {result: 'FAILED', reason: 'TEMP_PROFILE_CLEANUP_FAILED'}; }
            report('result', {test: 'electron-synthetic-session', ...(smokeOutcome || {result: 'FAILED', reason: 'INCOMPLETE'}),
                profileCleanupOwner: runnerProfileRoot ? 'runner' : 'application', temporaryProfileRemoved: removed});
        }
    });
}
