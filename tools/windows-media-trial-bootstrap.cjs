'use strict';
const {APP_ID} = require('./windows-media-trial-identity.cjs');

// Local trial entry only. The caller supplies the private profile location;
// no personal path or authentication material belongs in this source file.
function build(privateRoot) {
    if (typeof privateRoot !== 'string' || !privateRoot) throw new TypeError('Trial profile root required');
    return `'use strict';
const {app, BrowserWindow} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const {pathToFileURL} = require('node:url');
const profileRoot = path.join(${JSON.stringify(privateRoot)}, 'appdata');
const profile = path.join(profileRoot, 'EmbyTheaterEnhanced/data/electron');
app.setPath('appData', profileRoot);
app.setPath('userData', profile);
process.env.APPDATA = profileRoot;
process.env.MPV_HOME = path.join(profileRoot, 'mpv');
process.env.ETE_WINDOWS_NATIVE_TRIAL = '1';
process.argv = [process.argv[0], app.getAppPath(), profile, 'cec-client'];
app.setAppUserModelId(${JSON.stringify(APP_ID)});
if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    const instanceFile = path.join(profileRoot, 'trial-instance.json');
    try { fs.mkdirSync(profileRoot, {recursive: true}); fs.writeFileSync(instanceFile, JSON.stringify({version: 1, pid: process.pid})); } catch (_) { }
    app.once('will-quit', () => {
        try { if (JSON.parse(fs.readFileSync(instanceFile, 'utf8')).pid === process.pid) fs.unlinkSync(instanceFile); } catch (_) { }
    });
    const applicationUrl = pathToFileURL(path.join(__dirname, 'www/index.html')).href;
    const applicationWindows = new WeakSet();
    let activationPending = true, quitting = false;
    function isApplicationWindow(window) {
        return !window.isDestroyed() && window.webContents.getURL().split(/[?#]/)[0] === applicationUrl;
    }
    function reveal() {
        if (quitting) return;
        const matches = BrowserWindow.getAllWindows().filter(isApplicationWindow);
        if (matches.length !== 1) { activationPending = true; return; }
        const window = matches[0];
        if (window.isMinimized()) window.restore();
        window.show();
        window.focus();
        activationPending = false;
    }
    app.once('before-quit', () => { quitting = true; });
    app.on('second-instance', () => { activationPending = true; reveal(); });
    app.on('browser-window-created', (_event, window) => {
        window.webContents.on('did-finish-load', () => {
            if (!isApplicationWindow(window)) return;
            applicationWindows.add(window);
            if (activationPending) reveal();
        });
        window.on('page-title-updated', (event, title) => {
            if (!isApplicationWindow(window)) return;
            event.preventDefault();
            window.setTitle('ETE Native Trial - ' + title);
        });
        window.once('closed', () => {
            if (!applicationWindows.has(window)) return;
            // Hidden video carriers must not keep a closed trial UI alive.
            // Enter the original before-quit drain; never force process exit.
            setImmediate(() => { if (!quitting) { quitting = true; app.quit(); } });
        });
    });
    require('./main.js');
}
`;
}

function buildPortable() {
    const sentinel = '__ETE_PORTABLE_PROFILE__';
    const expression = `(function () {
        const value = process.argv[2], runtime = path.resolve(__dirname, '..');
        if (!value || !path.isAbsolute(value)) throw Error('Absolute new trial profile required');
        const directory = path.resolve(value), relative = path.relative(runtime, directory);
        if (!relative || (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))) throw Error('Profile must be outside bundle');
        let parent = path.dirname(directory);
        if (fs.realpathSync.native(parent).toLowerCase() !== parent.toLowerCase()) throw Error('Physical profile parent required');
        fs.mkdirSync(directory); return directory;
    }())`;
    return build(sentinel).replace(JSON.stringify(sentinel), expression).replace("app.setPath('appData', profileRoot);", "fs.mkdirSync(profile, {recursive: true});\napp.setPath('appData', profileRoot);").replace("app.setPath('userData', profile);", `app.setPath('userData', profile);
for (const name of ['sessionData', 'temp']) {
    const directory = path.join(profileRoot, name); fs.mkdirSync(directory, {recursive: true}); app.setPath(name, directory);
}`);
}
module.exports = {build, buildPortable};
