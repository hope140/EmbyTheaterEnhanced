'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function harness() {
    const nodes = new Map(), pending = [], listeners = new Map();
    function node() {
        return {textContent: '', value: 0, disabled: false, hidden: false, attributes: {}, listeners: {},
            setAttribute(k, v) { this.attributes[k] = v; }, getAttribute(k) { return this.attributes[k]; },
            addEventListener(k, v) { this.listeners[k] = v; },
            set innerHTML(_) { throw new Error('Untrusted notes must never be parsed as HTML'); }};
    }
    const view = {querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, node()); return nodes.get(selector); }};
    function BaseView() {}
    BaseView.prototype.onResume = function () {};
    BaseView.prototype.onPause = function () {};
    let AboutView;
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/electronapp/plugins/mpvplayer/about.js'), 'utf8'), {
        define(_deps, factory) { AboutView = factory({show() {}, hide() {}}, BaseView); },
        window: {ipc: {
            invoke(channel, payload) { return new Promise(resolve => pending.push({channel, payload, resolve})); },
            on(channel, fn) { listeners.set(channel, fn); },
            removeListener(channel, fn) { if (listeners.get(channel) === fn) listeners.delete(channel); }
        }}
    });
    const controller = new AboutView(view);
    return {view, pending, listeners, controller};
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const update = {status: 'update-available', currentVersion: '0.4.0', latestVersion: '0.4.1', installer: {id: 1},
    notes: '<img src=x onerror=alert(1)>\n## Release', releaseUrl: 'https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.1'};

test('entry performs no version check/download; notes render as inert text after a click', async () => {
    const h = harness();
    h.controller.loadInfo = () => {}; h.controller.loadKernelStatus = () => {};
    h.controller.onResume(); assert.equal(h.pending.length, 0);
    const work = h.controller.checkUpdates();
    assert.equal(h.pending[0].channel, 'enhanced-maintenance-check-update');
    assert.equal(h.view.querySelector('.btnCancelUpdate').disabled, false);
    h.pending[0].resolve(update); await work;
    assert.equal(h.view.querySelector('.aboutReleaseNotes').textContent, update.notes);
    assert.equal(h.view.querySelector('.btnDownloadUpdate').disabled, false);
    assert.equal(h.pending.length, 1, 'checking never starts a download');
});

test('ahead, prerelease and unavailable-verification results never enable a download', async () => {
    for (const response of [{...update, status: 'ahead'}, {...update, status: 'latest'},
        {...update, installer: null}, {status: 'error', reason: 'not-stable-release'}]) {
        const h = harness(), work = h.controller.checkUpdates(); h.pending[0].resolve(response); await work;
        assert.equal(h.view.querySelector('.btnDownloadUpdate').disabled, true);
    }
});

test('download displays progress and actual source in details, cancels only on explicit click', async () => {
    const h = harness(), work = h.controller.downloadUpdate();
    assert.equal(h.pending[0].channel, 'enhanced-maintenance-download-update');
    await h.controller.checkUpdates(); assert.equal(h.pending.length, 1, 'no concurrent check');
    h.listeners.get('enhanced-maintenance-update-progress')({}, {bytes: 8, total: 16, source: 'ghfast.top'});
    assert.equal(h.view.querySelector('.aboutDownloadProgress').value, 0.5);
    assert.match(h.view.querySelector('.aboutDownloadDetails').textContent, /ghfast.top/);
    const cancel = h.controller.cancelUpdate();
    assert.equal(h.pending[1].channel, 'enhanced-maintenance-cancel-update');
    h.pending[1].resolve({status: 'cancelled'}); await cancel;
    h.pending[0].resolve({status: 'cancelled'}); await work;
    assert.match(h.view.querySelector('.aboutUpdateState').textContent, /已取消/);
    assert.equal(h.listeners.size, 0);
});

test('download completion provides manual instructions and never invokes shell or installation', async () => {
    const h = harness(), work = h.controller.downloadUpdate();
    h.pending[0].resolve({status: 'downloaded', source: 'github', directory: '/test', fileName: 'fixture.exe', sha256: 'a'.repeat(64)}); await work;
    assert.match(h.view.querySelector('.aboutUpdateState').textContent, /自行打开/);
    assert.match(h.view.querySelector('.aboutUpdateState').textContent, /不代表数字签名/);
    assert.equal(h.pending.length, 1); assert.equal(h.listeners.size, 0);
});

test('pause cancels the owner, removes progress and prevents late response changing a new view', async () => {
    const h = harness(), oldWork = h.controller.downloadUpdate();
    const oldProgress = h.listeners.get('enhanced-maintenance-update-progress');
    h.controller.onPause(); assert.equal(h.listeners.size, 0);
    assert.equal(h.pending[1].channel, 'enhanced-maintenance-cancel-update');
    const next = h.controller.checkUpdates();
    h.pending[2].resolve({...update, latestVersion: '0.4.2'}); await next;
    const state = h.view.querySelector('.aboutUpdateState').textContent;
    oldProgress({}, {bytes: 1, total: 1, source: 'old-source'});
    h.pending[0].resolve({status: 'downloaded'}); h.pending[1].resolve({status: 'cancelled'}); await oldWork; await tick();
    assert.equal(h.view.querySelector('.aboutUpdateState').textContent, state);
    assert.equal(h.view.querySelector('.aboutLatestVersion').textContent, '0.4.2');
});

test('UI has no source chooser, custom address or install action', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../src/electronapp/plugins/mpvplayer/about.html'), 'utf8');
    assert.match(html, /btnCheckUpdates/); assert.match(html, /btnDownloadUpdate/); assert.match(html, /btnCancelUpdate/);
    assert.doesNotMatch(html, /<select|<input[^>]+(?:url|source)|btnInstall/);
});
