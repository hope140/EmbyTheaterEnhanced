'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {EventEmitter} = require('node:events'), vm = require('node:vm'), path = require('node:path');
const {pathToFileURL} = require('node:url');
const {build} = require('../tools/windows-media-trial-bootstrap.cjs');

function fixture(lock = true) {
    const app = new EventEmitter(), windows = [], calls = [];
    const directory = path.resolve('trial-fixture/electronapp');
    app.setPath = (key, value) => calls.push(key);
    app.getAppPath = () => directory;
    app.setAppUserModelId = () => {};
    app.requestSingleInstanceLock = () => lock;
    app.quit = () => { calls.push('quit'); app.emit('before-quit'); };
    const files = new Map();
    const context = {__dirname: directory, process: {env: {}, argv: ['trial.exe'], pid: 1234}, setImmediate,
        require(name) {
            if (name === 'electron') return {app, BrowserWindow: {getAllWindows: () => windows}};
            if (name === './main.js') { calls.push('main'); return {}; }
            if (name === 'node:fs') return {mkdirSync() {}, writeFileSync(p, value) {files.set(p, value);}, readFileSync(p) {return files.get(p);}, unlinkSync(p) {files.delete(p);}};
            return require(name);
        }};
    vm.runInNewContext(build(path.resolve('private-fixture')), context, {timeout: 1000});
    function window(isApp = true) {
        const w = new EventEmitter(); w.webContents = new EventEmitter();
        w.webContents.getURL = () => isApp ? pathToFileURL(path.join(directory, 'www/index.html')).href + '?autostart=false#!/home' : 'data:text/html,video';
        w.isDestroyed = () => false; w.isMinimized = () => true;
        w.restore = () => calls.push('restore'); w.show = () => calls.push('show'); w.focus = () => calls.push('focus');
        windows.push(w); app.emit('browser-window-created', {}, w);
        return w;
    }
    return {app, calls, window, context, files};
}

test('secondary launch exits before loading main or opening the private profile again', () => {
    const f = fixture(false);
    assert.equal(f.calls.includes('main'), false);
    assert.equal(f.calls.filter(c => c === 'quit').length, 1);
    assert.equal(f.files.size, 0);
});
test('primary instance marker belongs to its PID and retires only on actual quit', () => {
    const f = fixture();
    assert.equal(JSON.parse([...f.files.values()][0]).pid, 1234);
    f.app.emit('before-quit'); assert.equal(f.files.size, 1);
    f.app.emit('will-quit'); assert.equal(f.files.size, 0);
});
test('initial and duplicate launches reveal only the original application window', () => {
    const f = fixture(), hidden = f.window(false), main = f.window();
    hidden.webContents.emit('did-finish-load'); assert.equal(f.calls.includes('show'), false);
    main.webContents.emit('did-finish-load');
    assert.deepEqual(f.calls.slice(-3), ['restore','show','focus']);
    f.app.emit('second-instance'); assert.deepEqual(f.calls.slice(-3), ['restore','show','focus']);
});
test('duplicate launch during startup waits for the application document', () => {
    const f = fixture(); f.app.emit('second-instance');
    const main = f.window(); assert.equal(f.calls.includes('focus'), false);
    main.webContents.emit('did-finish-load'); assert.equal(f.calls.at(-1), 'focus');
});
test('closing the application UI enters normal quit even with a hidden carrier', async () => {
    const f = fixture(), main = f.window(), hidden = f.window(false);
    main.webContents.emit('did-finish-load'); hidden.webContents.emit('did-finish-load');
    main.emit('closed'); await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.calls.filter(c => c === 'quit').length, 1);
    f.app.emit('second-instance'); assert.equal(f.calls.at(-1), 'quit');
});
test('closing a helper window or an already-quitting main never starts another quit', async () => {
    const f = fixture(), hidden = f.window(false), main = f.window();
    main.webContents.emit('did-finish-load'); hidden.emit('closed');
    await new Promise(resolve => setImmediate(resolve)); assert.equal(f.calls.includes('quit'), false);
    f.app.emit('before-quit'); main.emit('closed'); await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.calls.includes('quit'), false);
});
