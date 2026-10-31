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
        enqueueCollection: async value => {calls.push(['collection', value]); return {status: 'queued', added: 2};},
        list: () => [], status: async () => [], current: () => true, targets: (_ctx, value) => value.taskIds || [],
        control: async (_ctx, value) => {calls.push(['control', value]); return {status: 'ok'};}, retry: () => ({status: 'queued'}), pauseAll: async () => {calls.push(['pause']);},
        close: async () => {calls.push(['close']);}, localSource: async () => null, ...overrides.manager};
    let chosen = overrides.directory;
    const unregister = api.register({ipcMain, getWebContents: () => sender,
        preferences: {read: () => chosen || null, save: value => {calls.push(['save-directory']); chosen = value; return value;}},
        dialog: {showOpenDialog: overrides.dialog || (async () => ({canceled: true, filePaths: []})), showMessageBox: overrides.confirm || (async () => ({response: 0, checkboxChecked: false}))},
        fileDeletionAvailable: true,
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
test('parent download accepts only its identity and native batch confirmation defaults to cancel', async () => {
    let shown;
    const f = fixture({confirm: async (_window, value) => {shown = value; return {response: 1, checkboxChecked: true};}});
    assert.equal((await f.invoke('COLLECTION', {context, itemId: 'season', directory: '/untrusted', episodes: ['foreign']})).added, 2);
    const request = f.calls.find(call => call[0] === 'collection')[1];
    assert.equal(request.itemId, 'season'); assert.equal(request.directory, undefined); assert.equal(request.episodes, undefined);
    assert.equal((await f.invoke('COLLECTION', {context, itemId: '../bad'})).reason, 'invalid-request');
    const controller = new AbortController(), value = {title: 'Fixture', type: 'Season', count: 3, watched: 1, unwatched: 2, unknown: 0, reused: 2, directory: '/main-owned'};
    assert.deepEqual(await f.config.confirmCollection(value, controller.signal), {confirmed: true, skipPlayed: true});
    assert.equal(shown.defaultId, 0); assert.equal(shown.cancelId, 0); assert.match(shown.detail, /main-owned/);
    assert.equal(shown.title, '下载本季');
    assert.equal(shown.checkboxChecked, true); assert.equal(shown.checkboxLabel, '跳过已看完的集数');
    assert.match(shown.detail, /跳过已看完：可添加 2 集，跳过 1 集/); assert.match(shown.detail, /下载全部：可添加 3 集/);
    await f.config.confirmCollection({...value, type: 'Series'}, controller.signal); assert.equal(shown.title, '下载全剧');
    controller.abort(); assert.equal((await f.config.confirmCollection(value, controller.signal)).confirmed, false);
    await f.unregister();
});
test('batch choice preserves explicit unchecked selection and missing watch state requires explicit download-all', async () => {
    let shown, response = 1, checked = false;
    const f = fixture({confirm: async (_window, value) => {shown = value; return {response, checkboxChecked: checked};}});
    const controller = new AbortController(), value = {title: 'Fixture', type: 'Series', count: 5, watched: 2, unwatched: 3, unknown: 0, reused: 1, directory: '/owned'};
    assert.deepEqual(await f.config.confirmCollection(value, controller.signal), {confirmed: true, skipPlayed: false});
    const unknown = {...value, unknown: 1, unwatched: 2}; response = 0;
    assert.equal((await f.config.confirmCollection(unknown, controller.signal)).confirmed, false);
    assert.equal(shown.defaultId, 0); assert.equal(shown.cancelId, 0); assert.equal(shown.type, 'warning');
    assert.match(shown.message, /1 集无法确认/); assert.deepEqual(shown.buttons, ['取消', '仍下载全部']);
    assert.equal(shown.checkboxLabel, undefined); assert.match(shown.detail, /暂不能确定可添加数量/);
    response = 1; assert.deepEqual(await f.config.confirmCollection(unknown, controller.signal), {confirmed: true, skipPlayed: false});
    const gate = deferred(), late = fixture({confirm: () => gate.promise}), signal = new AbortController();
    const pending = late.config.confirmCollection(value, signal.signal); signal.abort(); gate.resolve({response: 1, checkboxChecked: false});
    assert.equal((await pending).confirmed, false);
    await f.unregister(); await late.unregister();
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

test('removal always asks main-owned confirmation with file deletion unchecked and ignores renderer file flags', async () => {
    const id = '12345678-1234-4123-8123-123456789abc'; let options;
    const f = fixture({confirm: async (_window, value) => {options = value; return {response: 1, checkboxChecked: false};}});
    assert.equal((await f.invoke('CONTROL', {context, action: 'remove', taskIds: [id], deleteFiles: true, directory: '/untrusted'})).status, 'ok');
    assert.equal(options.checkboxChecked, false); assert.equal(options.defaultId, 0); assert.equal(options.cancelId, 0);
    const request = f.calls.find(value => value[0] === 'control')[1];
    assert.equal(request.deleteFiles, false); assert.equal(request.directory, undefined); assert.deepEqual(request.taskIds, [id]);
    assert.equal((await f.invoke('CONTROL', {context, action: 'remove', all: true})).reason, 'invalid-request');
    await f.unregister();
});

test('only explicit native checkbox approval enables file removal and retired confirmation cannot mutate anything', async () => {
    const id = '12345678-1234-4123-8123-123456789abc';
    const f = fixture({confirm: async () => ({response: 1, checkboxChecked: true})});
    await f.invoke('CONTROL', {context, action: 'remove', taskIds: [id]});
    assert.equal(f.calls.find(value => value[0] === 'control')[1].deleteFiles, true); await f.unregister();
    const gate = deferred(), old = fixture({confirm: () => gate.promise});
    const request = old.invoke('CONTROL', {context, action: 'remove', taskIds: [id]}); await Promise.resolve();
    await old.unregister(); gate.resolve({response: 1, checkboxChecked: true});
    assert.equal((await request).status, 'cancelled'); assert.ok(!old.calls.some(value => value[0] === 'control'));
});
