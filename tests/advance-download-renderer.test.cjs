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
