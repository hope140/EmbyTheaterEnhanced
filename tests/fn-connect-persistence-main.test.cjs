'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const {EventEmitter} = require('node:events');
const {createController} = require('../prototypes/fn-connect/client/controller.cjs');
const {createProfileStore} = require('../prototypes/fn-connect/client/profile-store.cjs');
const policy = require('../prototypes/fn-connect/client/policy.cjs');
const input = {bootstrapUrl: 'https://nas.example.test/', embyUrl: 'https://media.example.test/'};
const main = path.join(__dirname, '../prototypes/fn-connect/client/electron-main.cjs');
async function launch(local) {
    const app = new EventEmitter(), paths = {}, calls = [];
    let handler, panel, quitResolve;
    const quitting = new Promise(resolve => { quitResolve = resolve; });
    app.setPath = (name, value) => { paths[name] = value; };
    app.whenReady = () => Promise.resolve();
    app.quit = () => {
        let prevented = false;
        app.emit('before-quit', {preventDefault() { prevented = true; }});
        if (!prevented) { app.emit('quit'); quitResolve(); }
    };
    class Window extends EventEmitter {
        constructor() {
            super(); panel = this; this.webContents = new EventEmitter();
            Object.assign(this.webContents, {mainFrame: {}, setWindowOpenHandler() {}, send() {}});
        }
        isDestroyed() { return false; }
        async loadURL(url) { this.webContents.mainFrame.url = url; }
    }
    const io = {createSession(id, storage) { calls.push(['session', storage.path]); return {}; },
        async openLogin() { return {close() { calls.push(['window-close']); }, showTarget() {}}; },
        async clearSession() { calls.push(['clear']); }, async preserveSession() { calls.push(['preserve']); }};
    const replacement = {
        electron: {app, BrowserWindow: Window, ipcMain: {handle(_name, callback) { handler = callback; }}},
        './controller.cjs': {createController}, './policy.cjs': policy,
        './profile-store.cjs': {createProfileStore}, './electron-io.cjs': {createElectronIO: () => io},
        './bridge.cjs': {createBridge: async () => ({async close() { calls.push(['bridge-close']); }})},
        './fixture.cjs': {}
    };
    const errors = [];
    vm.runInNewContext(fs.readFileSync(main, 'utf8'), {
        require: name => Object.hasOwn(replacement, name) ? replacement[name] : require(name), __dirname: path.dirname(main),
        process: {platform: 'win32', env: {LOCALAPPDATA: local}, argv: ['electron', main, '--fn-connect-prototype', '--remember-login'],
            stderr: {write(value) { errors.push(value); }}}, setTimeout, clearTimeout, URL
    }, {filename: main});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(typeof handler, 'function'); assert.deepEqual(errors, []);
    return {paths, calls,
        action: (name, payload) => handler({sender: panel.webContents, senderFrame: panel.webContents.mainFrame}, name, payload),
        async quit() { app.quit(); await quitting; assert.deepEqual(errors, []); }};
}
test('main entry uses stable dedicated app-local state and preserves then explicitly forgets a selected profile', async t => {
    const local = fs.mkdtempSync(path.join(os.tmpdir(), 'fn-main-unit-'));
    t.after(() => fs.rmSync(local, {recursive: true, force: true}));
    const first = await launch(local);
    const root = path.join(fs.realpathSync(local), 'EmbyTheaterEnhanced-FN-Prototype');
    assert.equal(first.paths.userData, path.join(root, 'Control'));
    assert.equal(first.paths.sessionData, first.paths.userData);
    const added = await first.action('add', {...input, rememberLogin: true});
    assert.equal(added.remembered, true);
    const saved = await first.action('saved', input); assert.equal(saved.profiles.length, 1);
    await first.quit();
    assert.equal(first.calls.some(v => v[0] === 'preserve'), true);
    assert.equal(first.calls.some(v => v[0] === 'clear'), false);
    assert.equal(fs.existsSync(path.join(root, 'Control')), true);
    assert.equal(fs.existsSync(path.join(root, 'application.lock')), false);
    const second = await launch(local);
    assert.equal(second.paths.userData, first.paths.userData);
    const reopened = await second.action('add', {...input, rememberLogin: true, savedProfileId: saved.profiles[0].profileId});
    assert.equal(reopened.remembered, true);
    assert.equal(second.calls.find(v => v[0] === 'session')[1], first.calls.find(v => v[0] === 'session')[1]);
    const forgotten = await second.action('forget', {id: reopened.id}); assert.equal(forgotten.sessionAction, 'FORGOTTEN');
    assert.equal(second.calls.some(v => v[0] === 'clear'), true);
    const after = await second.action('saved', input); assert.equal(after.profiles.length, 0);
    await second.quit();
    assert.equal(fs.existsSync(first.calls.find(v => v[0] === 'session')[1]), true);
});
