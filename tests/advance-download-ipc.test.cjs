'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {eventFor} = require('./helpers/trusted-renderer.cjs');
const api = require('../src/electronapp/enhanced/advance-download/ipc');
const context = {serverId: 'server', accountId: 'account', serverAddress: 'http://127.0.0.1:1234/base', token: 'synthetic'};
const deferred = () => {let resolve; const promise = new Promise(done => {resolve = done;}); return {promise, resolve};};
function fixture(overrides = {}) {
    const handlers = new Map(), calls = [], sent = [];
    const ipcMain = new EventEmitter();
    ipcMain.handle = (name, work) => handlers.set(name, work); ipcMain.removeHandler = name => handlers.delete(name);
    const sender = new EventEmitter(); sender.send = (name, value) => sent.push({name, value}); eventFor(sender);
    let config;
    const manager = {attach(value) {calls.push(['attach', value]);}, enqueue: async value => {calls.push(['start', value]); return {status: 'queued'};},
        list: () => [], retry: () => ({status: 'queued'}), pauseAll: async () => {calls.push(['pause']);},
        close: async () => {calls.push(['close']);}, localSource: async () => null, ...overrides.manager};
    let chosen = overrides.directory;
    const unregister = api.register({ipcMain, getWebContents: () => sender,
        preferences: {read: () => chosen || null, save: value => {calls.push(['save-directory']); chosen = value; return value;}},
        dialog: {showOpenDialog: overrides.dialog || (async () => ({canceled: true, filePaths: []}))},
        shell: overrides.shell, createManager(value) {config = value; return manager;}});
    return {handlers, calls, sent, sender, ipcMain, manager, unregister, get config() {return config;},
        invoke(name, request = {}) {return handlers.get(api.CHANNELS[name])(eventFor(sender), request);}};
}
test('all new download IPC operations reject missing, child and foreign-document senders before any action', async () => {
    const f = fixture();
    for (const handler of f.handlers.values()) {
        for (const event of [{sender: f.sender}, {sender: f.sender, senderFrame: {...f.sender.mainFrame}}, {sender: {}, senderFrame: f.sender.mainFrame}]) {
            assert.equal((await handler(event, {context})).reason, 'untrusted-sender');
        }
    }
    assert.deepEqual(f.calls, []);
    f.sender.mainFrame.url = 'https://untrusted.invalid/';
    assert.equal((await f.invoke('START', {context, itemId: 'item'})).reason, 'untrusted-sender');
    await f.unregister();
});
test('a trusted original-button request supplies only credential and media identity to the manager', async () => {
    const f = fixture();
    assert.equal((await f.invoke('START', {context, itemId: 'item', mediaSourceId: 'source', directory: '/untrusted/path'})).status, 'queued');
    const start = f.calls.find(value => value[0] === 'start')[1];
    assert.equal(start.itemId, 'item'); assert.equal(start.mediaSourceId, 'source');
    assert.equal(start.directory, undefined);
    assert.equal((await f.invoke('START', {context, itemId: '../escape'})).reason, 'invalid-request');
    await f.unregister();
});
test('shutdown does not wait for a native folder picker and its late result cannot change preferences', async () => {
    const picker = deferred(), f = fixture({dialog: () => picker.promise});
    const selection = f.invoke('DIRECTORY', {context});
    await Promise.resolve();
    await f.unregister();
    picker.resolve({canceled: false, filePaths: ['/synthetic/chosen']});
    assert.equal((await selection).status, 'cancelled');
    assert.ok(!f.calls.some(value => value[0] === 'save-directory'));
    assert.equal(f.handlers.size, 0);
});
test('unregistration cancels lookup but joins both owned lookup cleanup and download shutdown', async () => {
    const entered = deferred(), cleanup = deferred(), stopped = deferred();
    let signal;
    const f = fixture({manager: {localSource: async (_context, value) => {signal = value; entered.resolve(); await cleanup.promise; return {status: 'hit', source: '/late.mkv'};}, close: () => stopped.promise}});
    const lookup = f.invoke('LOOKUP', {context, itemId: 'item', mediaSourceId: 'source', requestId: 'owned-lookup'});
    await entered.promise;
    let finished = false;
    const closing = f.unregister().then(() => {finished = true;});
    assert.equal(signal.aborted, true);
    stopped.resolve(); await Promise.resolve();
    assert.equal(finished, false);
    cleanup.resolve(); await closing;
    assert.equal((await lookup).status, 'cancelled');
});
test('navigation retires in-flight results and progress updates are bounded and detached with the document', async () => {
    const gate = deferred(), f = fixture({manager: {localSource: () => gate.promise}});
    const lookup = f.invoke('LOOKUP', {context, itemId: 'item', mediaSourceId: 'source', requestId: 'navigation'});
    await Promise.resolve();
    f.config.onChange({id: 'task', state: 'downloading', reason: null, bytes: 1, total: 100});
    f.config.onChange({id: 'task', state: 'downloading', reason: null, bytes: 2, total: 100});
    assert.equal(f.sent.length, 1);
    f.sender.emit('did-start-navigation', {isMainFrame: true, isSameDocument: false});
    gate.resolve({status: 'hit', source: '/retired.mkv'});
    assert.equal((await lookup).status, 'cancelled');
    f.config.onChange({id: 'task', state: 'complete', reason: null});
    assert.equal(f.sent.length, 1);
    await f.unregister();
});

test('open folder uses only saved default or account-scoped task directories, never renderer paths or shell URLs', async t => {
    const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-folder-ipc-')));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const opened = [];
    const f = fixture({directory: root, shell: {async openPath(value) {opened.push(value); return '';}},
        manager: {directory(current, id) {return current.accountId === 'account' && id === 'owned' ? root : null;}}});
    assert.equal((await f.invoke('OPEN_FOLDER', {context, path: 'https://untrusted.invalid/'})).status, 'ok');
    assert.equal((await f.invoke('OPEN_FOLDER', {context, taskId: 'owned', path: '/ignored'})).status, 'ok');
    assert.equal((await f.invoke('OPEN_FOLDER', {context: {...context, accountId: 'other'}, taskId: 'owned'})).reason, 'directory-unavailable');
    assert.equal((await f.invoke('OPEN_FOLDER', {context, taskId: 'missing'})).reason, 'directory-unavailable');
    assert.deepEqual(opened, [root, root]);
    fs.rmdirSync(root);
    assert.equal((await f.invoke('OPEN_FOLDER', {context})).reason, 'directory-unavailable');
    assert.equal(opened.length, 2);
    await f.unregister();
});

test('native folder-open errors expose a fixed reason rather than system paths', async () => {
    const f = fixture({directory: require('node:fs').realpathSync.native(require('node:os').tmpdir()), shell: {async openPath() {return 'private-system-error';}}});
    assert.deepEqual(await f.invoke('OPEN_FOLDER', {context}), {status: 'error', reason: 'folder-open-failed'});
    await f.unregister();
});
