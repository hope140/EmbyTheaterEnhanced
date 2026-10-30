'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const patch = require('../tools/patch-advance-download.cjs');
const source = fs.readFileSync(path.join(__dirname, '../src/electronapp/enhanced/advance-download/renderer.js'), 'utf8');
function fixture(invoke) {
    const calls = [], messages = [], sends = [], intervals = [], listeners = new Map();
    let result, account = 'account', token = 'synthetic', current;
    const api = {serverId: () => 'server', serverAddress: () => 'https://emby.example.invalid/base', getCurrentUserId: () => account, accessToken: () => token};
    current = api;
    const ipc = {invoke: async (channel, body) => {calls.push({channel, body}); return invoke ? invoke(channel, body) : {status: 'ok'};},
        send: (channel, body) => sends.push({channel, body}), on: (name, work) => listeners.set(name, work), removeListener: name => listeners.delete(name)};
    const window = {ipc, addEventListener(name, fn) {listeners.set(name, fn);}};
    vm.runInNewContext(source, {window, AbortController, Date, Promise, JSON, Object,
        setInterval(fn) {intervals.push(fn); return intervals.length;}, clearInterval() {},
        define(_names, factory) {result = factory({currentApiClient: () => current}, {on() {}, off() {}}, text => messages.push(text));}});
    return {api, result, calls, messages, sends, intervals, listeners,
        logout() {current = null;}, changeAccount() {account = 'other'; token = 'other-synthetic';}};
}
test('bootstrap attaches the current account once, pauses on logout and cleans up on unload', async () => {
    const f = fixture(); f.result.start(); f.result.start();
    assert.equal(f.intervals.length, 1);
    assert.equal(f.calls.filter(value => value.channel === 'enhanced-download-attach').length, 1);
    f.intervals[0]();
    assert.equal(f.calls.length, 1);
    f.logout(); f.intervals[0]();
    assert.equal(f.calls.at(-1).channel, 'enhanced-download-detach');
    f.listeners.get('unload')();
    assert.equal(f.listeners.has('enhanced-download-progress'), false);
});
test('the original video action preserves selected version and uses no arbitrary download directory', async () => {
    const f = fixture(channel => ({status: channel === 'enhanced-download-start' ? 'queued' : 'ok'}));
    await f.result.begin(f.api, {Id: 'item', ServerId: 'server'}, 'edition');
    const call = f.calls.find(value => value.channel === 'enhanced-download-start');
    assert.equal(call.body.itemId, 'item'); assert.equal(call.body.mediaSourceId, 'edition'); assert.equal(call.body.directory, undefined);
    assert.ok(f.messages.some(text => text.includes('已加入')));
});
test('a cancelled or changed-account local lookup cannot publish a late local source', async () => {
    let resolve;
    const f = fixture(() => new Promise(done => {resolve = done;})), controller = new AbortController();
    const pending = f.result.localSource(f.api, {Id: 'item', ServerId: 'server', MediaType: 'Video'}, {Id: 'edition'}, controller.signal);
    controller.abort(); resolve({status: 'hit', source: 'C:\\synthetic\\video.mkv'});
    assert.equal(await pending, null);
    assert.equal(f.sends[0].channel, 'enhanced-download-lookup-cancel');
    const second = f.result.localSource(f.api, {Id: 'item', ServerId: 'server', MediaType: 'Video'}, {Id: 'edition'});
    f.changeAccount(); resolve({status: 'hit', source: 'C:\\synthetic\\video.mkv'});
    assert.equal(await second, null);
});
test('settings discard a previous account response after switching accounts', async () => {
    let resolve;
    const f = fixture(() => new Promise(done => {resolve = done;}));
    const pending = f.result.status();
    f.changeAccount(); resolve({status: 'ok', tasks: [{title: 'previous account'}]});
    assert.equal((await pending).status, 'cancelled');
});
test('the pinned command overlay routes video only and preserves original audio, logs and subtitle download branches', async () => {
    const base = fs.readFileSync(path.join(__dirname, '../vendor/web-snapshot/www/modules/commandprocessor.js'), 'utf8');
    const output = patch.patchCommandProcessor(base), exports = {}, downloads = [], browser = [];
    const api = {getItemDownloadUrl: (id, source) => 'original:' + id + ':' + source,
        getLogDownloadUrl: () => 'log-url', getUrl: url => url, isMinServerVersion: () => true};
    vm.runInNewContext(output, {Object, Promise,
        require: names => Promise.resolve([names[0] === '../enhanced/advance-download/renderer.js' ? {begin: async (...args) => downloads.push(args)} : urls => browser.push(urls)]),
        define(names, factory) {factory(...names.map(name => name === 'exports' ? exports : name.includes('connectionmanager') ? {default: {getApiClient: () => api}} : {default: {}}));}});
    await exports.default.executeCommand('download', {Id: 'movie', MediaType: 'Video'}, {mediaSourceId: 'edition'});
    await exports.default.executeCommand('download', {Id: 'audio', MediaType: 'Audio'}, {mediaSourceId: 'song'});
    await exports.default.executeCommand('download', {Type: 'Log', Name: 'log'}, {});
    await exports.default.executeCommand('download', {Type: 'MediaStream', StreamType: 'Subtitle', ItemId: 'i', MediaSourceId: 's', Index: 2, Codec: 'srt'}, {});
    assert.equal(downloads.length, 1); assert.equal(downloads[0][2], 'edition');
    assert.equal(browser.length, 3);
    assert.equal(browser[0][0], 'original:audio:song');
    assert.throws(() => patch.patchCommandProcessor('unrelated'));
    assert.throws(() => patch.patchCommandProcessor(base + base));
});

test('context menu hides legacy device sync but retains unified download and unrelated actions', () => {
    const base = fs.readFileSync(path.join(__dirname, '../vendor/web-snapshot/www/modules/itemcontextmenu.js'), 'utf8');
    function load(source) {
        const exports = {};
        const helper = new Proxy({canSync: () => true, canEdit: () => true}, {get(target, key) {return target[key] || (() => false);}});
        vm.runInNewContext(source, {self: {}, define(names, factory) {factory(...names.map(name =>
            name === 'exports' ? exports : name.includes('servicelocator') ? {appHost: {supports: () => true}} :
            name.includes('globalize') ? {default: {translate: value => value}} :
            name.includes('connectionmanager') ? {default: {getApiClient: () => ({serverId: () => 'server'})}} :
            name.includes('itemhelper') ? {default: helper} : name.includes('playbackmanager') ? {default: {canPlay: () => false}} : {default: {}}));}});
        return exports.default.getCommands({item: {Id: 'item', Type: 'Movie', MediaType: 'Video', CanDownload: true}, user: {Policy: {}}});
    }
    const original = load(base).map(command => command.id), modified = load(patch.patchItemContextMenu(base)).map(command => command.id);
    assert.ok(original.includes('sync')); assert.ok(original.includes('synclocal'));
    assert.equal(modified.filter(id => id === 'download').length, 1);
    assert.ok(modified.includes('edit'));
    assert.deepEqual(Array.from(modified), Array.from(original.filter(id => id !== 'sync' && id !== 'synclocal')));
    assert.throws(() => patch.patchItemContextMenu('unrelated'));
    assert.throws(() => patch.patchItemContextMenu(base + base));
});

test('actual multi-select menu also hides device sync and handles an otherwise empty menu normally', async () => {
    const base = fs.readFileSync(path.join(__dirname, '../vendor/web-snapshot/www/modules/multiselect/multiselect.js'), 'utf8');
    async function commands(source, canMarkPlayed) {
        const start = source.indexOf('function showMenuForSelectedItems(e)'), end = source.indexOf('function getSelectedItemIdentifier(item)');
        assert.ok(start > 0 && end > start);
        let shown, alerts = 0;
        const helper = new Proxy({canSync: () => true, canMarkPlayed: () => canMarkPlayed}, {get(target, key) {return target[key] || (() => false);}});
        const work = vm.runInNewContext('(' + source.slice(start, end).trim() + ')', {
            selectedItems: [{Id: 'item', ServerId: 'server', MediaType: 'Video'}],
            _connectionmanager: {default: {getApiClient: () => ({getCurrentUser: async () => ({})})}},
            mapApiClientArrayToObject: () => ({server: {Policy: {}}}),
            _playbackmanager: {default: {canQueue: () => false}}, _itemhelper: {default: helper},
            _globalize: {default: {translate: value => value}}, _servicelocator: {appHost: {supports: () => true}},
            alertText: async () => {alerts++;}, require(names, callback) {assert.deepEqual(Array.from(names), ['actionsheet']); callback({show(value) {shown = value.items;}});}
        });
        await work({target: {}});
        return {ids: Array.from(shown || [], value => value.id), alerts};
    }
    const original = await commands(base, true), modified = await commands(patch.patchMultiSelect(base), true);
    assert.ok(original.ids.includes('sync')); assert.ok(original.ids.includes('synclocal'));
    assert.deepEqual(modified.ids, original.ids.filter(id => id !== 'sync' && id !== 'synclocal'));
    assert.ok(modified.ids.includes('markplayed'));
    assert.deepEqual(await commands(patch.patchMultiSelect(base), false), {ids: [], alerts: 1});
    assert.throws(() => patch.patchMultiSelect('unrelated'));
    assert.throws(() => patch.patchMultiSelect(base + base));
});
