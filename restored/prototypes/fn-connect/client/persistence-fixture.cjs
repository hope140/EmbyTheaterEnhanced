'use strict';

// Offline, synthetic four-process fixture. Never open a user profile or NAS.
const {app, session, BrowserWindow} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const {createElectronIO} = require('./electron-io.cjs');
const at = name => process.argv[process.argv.indexOf(name) + 1];
const root = at('--fixture-root'), phase = at('--phase');
let window, timer;
function report(result) {
    fs.writeSync(1, 'FN_PERSIST_FIXTURE ' + JSON.stringify({phase, result, realNAS: 'NOT_TESTED'}) + '\n');
}
try {
    if (!process.argv.includes('--fn-persistence-fixture') || !process.argv.includes('--fixture-root') || !process.argv.includes('--phase') ||
        !['write', 'read', 'forget', 'verify-forgot'].includes(phase) || !path.isAbsolute(root) ||
        !/^ete-fn-persist-fixture-[a-f0-9]{32}$/.test(path.basename(root)) ||
        fs.lstatSync(root).isSymbolicLink() || !fs.lstatSync(root).isDirectory() ||
        fs.readFileSync(path.join(root, '.fixture-owner'), 'utf8') !== 'ETE_FN_SYNTHETIC_PERSISTENCE_V1\n' ||
        process.versions.electron !== '44.4.2') throw new Error('FIXTURE_INPUT_INVALID');
    for (const name of ['control', 'session']) {
        const directory = path.join(root, name);
        if (!fs.existsSync(directory)) fs.mkdirSync(directory);
        if (fs.lstatSync(directory).isSymbolicLink() || !fs.lstatSync(directory).isDirectory()) throw new Error('FIXTURE_INPUT_INVALID');
    }
    app.setPath('userData', path.join(root, 'control'));
    app.setPath('sessionData', path.join(root, 'control'));
    timer = setTimeout(() => { report('TIMEOUT'); app.exit(1); }, 20000);
    app.whenReady().then(async () => {
        const io = createElectronIO({session});
        const ses = io.createSession('fixture', {persistent: true, path: path.join(root, 'session')});
        const page = path.join(root, 'fixture.html');
        if (!fs.existsSync(page)) fs.writeFileSync(page, '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'"><title>Offline persistence fixture</title>', {flag: 'wx'});
        if (fs.lstatSync(page).isSymbolicLink() || !fs.lstatSync(page).isFile()) throw new Error('FIXTURE_INPUT_INVALID');
        window = new BrowserWindow({show: false, webPreferences: {session: ses, sandbox: true,
            contextIsolation: true, nodeIntegration: false, webSecurity: true}});
        await window.loadFile(page);
        const fixtureUrl = 'https://fixture.invalid/';
        if (phase === 'write') {
            // Synthetic cookie only. Never change a real site's expiry.
            await ses.cookies.set({url: fixtureUrl, name: 'ete_fixture_only', value: 'synthetic-only',
                secure: true, expirationDate: Math.floor(Date.now() / 1000) + 600});
            await window.webContents.executeJavaScript('localStorage.setItem("eteFixtureOnly", "synthetic-only")');
            await io.preserveSession(ses);
        } else if (phase === 'forget') {
            await new Promise(resolve => { window.once('closed', resolve); window.destroy(); }); window = null;
            await io.clearSession(ses);
            await ses.cookies.flushStore();
        } else {
            const cookies = await ses.cookies.get({url: fixtureUrl});
            const stored = await window.webContents.executeJavaScript('localStorage.getItem("eteFixtureOnly")');
            const expected = phase === 'read';
            if (cookies.some(c => c.name === 'ete_fixture_only' && c.value === 'synthetic-only') !== expected ||
                (stored === 'synthetic-only') !== expected) throw new Error('FIXTURE_STATE_MISMATCH');
            await io.preserveSession(ses);
        }
        window?.destroy(); clearTimeout(timer); report('PASSED'); app.quit();
    }).catch(() => { clearTimeout(timer); window?.destroy(); report('FAILED'); app.exit(1); });
} catch {
    // Do not include exception text, paths, stored values or system details.
    clearTimeout(timer); app.exit(2);
}
