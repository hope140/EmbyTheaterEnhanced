'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const {EventEmitter} = require('node:events');
const {eventFor} = require('./helpers/trusted-renderer.cjs');
const {fixture, media, token} = require('./helpers/advance-download-fixture.cjs');
const downloadIpc = require('../src/electronapp/enhanced/advance-download/ipc');
const patch = require('../tools/patch-advance-download.cjs');

test('the actual original-button overlay, renderer, main IPC and persistent manager download and select a local copy', {timeout: 10000}, async t => {
    const f = await fixture(t); f.state.sourcePath = f.cdn + '/direct';
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-download-full-flow-')));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const profile = path.join(root, 'profile'), first = path.join(root, 'first'), next = path.join(root, 'next');
    for (const directory of [profile, first, next]) fs.mkdirSync(directory);
    const handlers = new Map(), ipcMain = new EventEmitter(), sender = new EventEmitter(), rendererEvents = new EventEmitter();
    ipcMain.handle = (name, callback) => handlers.set(name, callback); ipcMain.removeHandler = name => handlers.delete(name);
    eventFor(sender); sender.send = (name, value) => rendererEvents.emit(name, {}, value);
    let folder = first, picks = 0;
    const unregister = downloadIpc.register({ipcMain, getWebContents: () => sender, profileRoot: profile,
        getBrowserWindow: () => null, dialog: {async showOpenDialog() {picks++; return {canceled: false, filePaths: [folder]};}}});
    t.after(() => unregister());
    const rendererIpc = {invoke: (name, body) => handlers.get(name)(eventFor(sender), body),
        send: (name, body) => ipcMain.emit(name, eventFor(sender), body), on: rendererEvents.on.bind(rendererEvents), removeListener: rendererEvents.removeListener.bind(rendererEvents)};
    const api = {serverId: () => 'server', getCurrentUserId: () => 'account', serverAddress: () => f.emby + '/base', accessToken: () => token};
    const cm = {getApiClient: () => api, currentApiClient: () => api};
    let renderer;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/electronapp/enhanced/advance-download/renderer.js'), 'utf8'), {
        window: {ipc: rendererIpc, addEventListener() {}}, Promise, AbortController, Date,
        setInterval() {return 1;}, clearInterval() {},
        define(_names, factory) {renderer = factory(cm, {on() {}, off() {}}, () => {});}
    });
    const exports = {};
    vm.runInNewContext(patch.patchCommandProcessor(fs.readFileSync(path.join(__dirname, '../vendor/web-snapshot/www/modules/commandprocessor.js'), 'utf8')), {
        require: () => Promise.resolve([renderer]),
        define(names, factory) {factory(...names.map(name => name === 'exports' ? exports : name.includes('connectionmanager') ? {default: cm} : {default: {}}));}
    });
    async function completed(action) {
        const done = new Promise(resolve => {const listener = (_event, task) => {if (task.state === 'complete') {rendererEvents.removeListener(downloadIpc.CHANNELS.PROGRESS, listener); resolve(task);}}; rendererEvents.on(downloadIpc.CHANNELS.PROGRESS, listener);});
        assert.equal((await action()).status, 'queued');
        return done;
    }
    const task = await completed(() => exports.default.executeCommand('download', {Id: 'item', ServerId: 'server', MediaType: 'Video'}, {mediaSourceId: 'source'}));
    assert.equal(picks, 1);
    assert.equal(task.directory, first);
    assert.deepEqual(fs.readFileSync(path.join(first, task.fileName)), media);
    const hit = await renderer.localSource(api, {Id: 'item', ServerId: 'server', MediaType: 'Video'}, {Id: 'source'});
    assert.equal(hit.source, path.join(first, task.fileName));
    folder = next;
    assert.equal((await renderer.directory()).directory, next);
    f.state.etag = '"second-download-version"';
    const second = await completed(() => renderer.begin(api, {Id: 'item', ServerId: 'server'}, 'source'));
    assert.equal(second.directory, next);
    assert.equal(picks, 2, 'new downloads reuse the chosen default without reopening the picker');
    assert.ok(fs.existsSync(path.join(first, task.fileName)), 'old user file is neither moved nor deleted');
    const status = await renderer.status();
    assert.equal(status.tasks.filter(value => value.state === 'complete').length, 2);
    assert.equal(status.directory, next);
    assert.equal((await renderer.localSource(api, {Id: 'item', ServerId: 'server', MediaType: 'Video'}, {Id: 'source'})).source, path.join(next, second.fileName));
});
