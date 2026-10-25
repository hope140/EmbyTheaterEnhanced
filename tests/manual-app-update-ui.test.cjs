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
    BaseView.prototype.destroy = function () { this.baseDestroyCount = (this.baseDestroyCount || 0) + 1; this.view = null; };
    let AboutView;
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/electronapp/plugins/mpvplayer/about.js'), 'utf8'), {
        define(_deps, factory) { AboutView = factory({show() {}, hide() {}}, BaseView, require('../src/electronapp/enhanced/release-note-links')); },
        window: {ipc: {
            invoke(channel, payload) { return new Promise((resolve, reject) => pending.push({channel, payload, resolve, reject})); },
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
    assert.equal(h.view.querySelector('.btnCancelUpdate').hidden, true);
    assert.equal(h.view.querySelector('.btnCancelUpdate').disabled, true);
    h.controller.loadInfo = () => {}; h.controller.loadKernelStatus = () => {}; h.controller.loadChannel = () => {};
    h.controller.onResume(); assert.equal(h.pending.length, 0);
    const work = h.controller.checkUpdates();
    assert.equal(h.pending[0].channel, 'enhanced-maintenance-check-update');
    assert.equal(h.view.querySelector('.btnCancelUpdate').disabled, false);
    assert.equal(h.view.querySelector('.btnCancelUpdate').hidden, false);
    assert.equal(h.view.querySelector('.btnCancelUpdate').textContent, '取消检查');
    await h.controller.checkUpdates();
    assert.equal(h.pending.length, 1, 'repeated check does not start another operation');
    h.pending[0].resolve(update); await work;
    assert.equal(h.view.querySelector('.aboutReleaseNotes').textContent, update.notes);
    assert.equal(h.view.querySelector('.btnDownloadUpdate').disabled, false);
    assert.equal(h.pending.length, 1, 'checking never starts a download');
    assert.equal(h.view.querySelector('.btnCancelUpdate').hidden, true);
    assert.equal(h.view.querySelector('.btnCancelUpdate').disabled, true);
});

test('ahead, prerelease and unavailable-verification results never enable a download', async () => {
    for (const response of [{...update, status: 'ahead'}, {...update, status: 'latest'},
        {...update, installer: null}, {status: 'error', reason: 'not-stable-release'}]) {
        const h = harness(), work = h.controller.checkUpdates(); h.pending[0].resolve(response); await work;
        assert.equal(h.view.querySelector('.btnDownloadUpdate').disabled, true);
        assert.equal(h.view.querySelector('.btnCancelUpdate').hidden, true);
    }
});

test('download displays progress and actual source in details, cancels only on explicit click', async () => {
    const h = harness(), work = h.controller.downloadUpdate();
    assert.equal(h.pending[0].channel, 'enhanced-maintenance-download-update');
    assert.equal(h.view.querySelector('.btnCancelUpdate').hidden, false);
    assert.equal(h.view.querySelector('.btnCancelUpdate').textContent, '取消下载');
    await h.controller.downloadUpdate();
    await h.controller.checkUpdates(); assert.equal(h.pending.length, 1, 'no concurrent check');
    h.listeners.get('enhanced-maintenance-update-progress')({}, {bytes: 8, total: 16, source: 'ghfast.top'});
    assert.equal(h.view.querySelector('.aboutDownloadProgress').value, 0.5);
    assert.match(h.view.querySelector('.aboutDownloadDetails').textContent, /ghfast.top/);
    const cancel = h.controller.cancelUpdate();
    await h.controller.cancelUpdate();
    assert.equal(h.pending.length, 2, 'repeated cancel does not send another IPC');
    assert.equal(h.view.querySelector('.btnCancelUpdate').disabled, true);
    assert.equal(h.pending[1].channel, 'enhanced-maintenance-cancel-update');
    h.pending[1].resolve({status: 'cancelled'}); await cancel;
    h.pending[0].resolve({status: 'cancelled'}); await work;
    assert.match(h.view.querySelector('.aboutUpdateState').textContent, /已取消/);
    assert.equal(h.listeners.size, 0);
    assert.equal(h.view.querySelector('.btnCancelUpdate').hidden, true);
});

test('verified handoff explains normal quit and wizard, with all update controls locked', async () => {
    const h = harness(), work = h.controller.downloadUpdate();
    h.pending[0].resolve({status: 'installing', source: 'github', directory: '/test', fileName: 'fixture.exe', sha256: 'a'.repeat(64)}); await work;
    assert.match(h.view.querySelector('.aboutUpdateState').textContent, /正常退出.*安装向导/);
    assert.match(h.view.querySelector('.aboutUpdateState').textContent, /Windows 安全检查/);
    for (const selector of ['.selectUpdateChannel', '.btnCheckUpdates', '.btnDownloadUpdate']) assert.equal(h.view.querySelector(selector).disabled, true);
    await h.controller.downloadUpdate(); await h.controller.checkUpdates(); await h.controller.changeChannel();
    assert.equal(h.pending.length, 1); assert.equal(h.listeners.size, 0);
    assert.equal(h.view.querySelector('.btnCancelUpdate').hidden, true);
});

test('pause cancels the owner, removes progress and prevents late response changing a new view', async () => {
    const h = harness(), oldWork = h.controller.downloadUpdate();
    const oldProgress = h.listeners.get('enhanced-maintenance-update-progress');
    h.controller.onPause(); assert.equal(h.listeners.size, 0);
    assert.equal(h.view.querySelector('.btnCancelUpdate').hidden, true);
    assert.equal(h.pending[1].channel, 'enhanced-maintenance-cancel-update');
    const next = h.controller.checkUpdates();
    oldProgress({}, {bytes: 1, total: 1, source: 'old-source'});
    h.pending[0].resolve({status: 'downloaded'}); h.pending[1].resolve({status: 'cancelled'}); await oldWork; await tick();
    assert.equal(h.view.querySelector('.btnCancelUpdate').hidden, false);
    assert.equal(h.view.querySelector('.btnCancelUpdate').disabled, false);
    assert.equal(h.view.querySelector('.btnCancelUpdate').textContent, '取消检查');
    assert.equal(h.view.querySelector('.aboutUpdateState').textContent, '正在检查…');
    h.pending[2].resolve({...update, latestVersion: '0.4.2'}); await next;
    assert.equal(h.view.querySelector('.btnCancelUpdate').hidden, true);
    assert.equal(h.view.querySelector('.aboutLatestVersion').textContent, '0.4.2');
});

test('UI has no source chooser, custom address or install action', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../src/electronapp/plugins/mpvplayer/about.html'), 'utf8');
    assert.match(html, /btnCheckUpdates/); assert.match(html, /btnDownloadUpdate/); assert.match(html, /btnCancelUpdate/);
    assert.doesNotMatch(html, /<input[^>]+(?:url|source)|btnInstall/);
    assert.equal((html.match(/<select\b/g) || []).length, 1);
    assert.match(html, /class="selectUpdateChannel" label="更新通道"/);
    assert.match(html, /class="[^"]*btnCancelUpdate" hidden disabled/);
    assert.equal((html.match(/<details class="about-update-disclosure"><summary>/g) || []).length, 2);
});

test('direct destruction retires the update even without a preceding pause', async () => {
    const h = harness(), work = h.controller.downloadUpdate();
    const oldProgress = h.listeners.get('enhanced-maintenance-update-progress');
    h.controller.destroy();
    assert.equal(h.controller.view, null); assert.equal(h.listeners.size, 0);
    assert.equal(h.controller.baseDestroyCount, 1);
    assert.equal(h.controller.infoRequestId, 1); assert.equal(h.controller.kernelRequestId, 1);
    assert.equal(h.pending[1].channel, 'enhanced-maintenance-cancel-update');
    oldProgress({}, {bytes: 1, total: 1, source: 'old-source'});
    h.pending[0].resolve({status: 'downloaded'}); h.pending[1].resolve({status: 'cancelled'}); await work;
    assert.equal(h.view.querySelector('.aboutDownloadProgress').value, 0);
    assert.equal(h.view.querySelector('.btnCancelUpdate').hidden, true);
});

test('checking cancellation is single-shot, waits for the owner and does not start another check', async () => {
    const h = harness(), work = h.controller.checkUpdates();
    const cancel = h.controller.cancelUpdate();
    await h.controller.cancelUpdate(); await h.controller.checkUpdates();
    assert.equal(h.pending.length, 2);
    assert.equal(h.pending[1].channel, 'enhanced-maintenance-cancel-update');
    assert.equal(h.view.querySelector('.btnCancelUpdate').textContent, '取消检查');
    assert.equal(h.view.querySelector('.btnCancelUpdate').disabled, true);
    h.pending[1].resolve({status: 'cancelled'}); await cancel;
    assert.equal(h.controller.updating, true, 'cancel acknowledgement does not retire the running owner');
    h.pending[0].resolve({status: 'cancelled'}); await work;
    assert.equal(h.controller.updating, false);
    assert.equal(h.view.querySelector('.btnCancelUpdate').hidden, true);
    await h.controller.cancelUpdate(); assert.equal(h.pending.length, 2);
});

test('errors, rejected requests and cancellation all hide the inactive cancel action', async () => {
    for (const action of ['checkUpdates', 'downloadUpdate']) {
        for (const terminal of ['error', 'rejected', 'cancelled']) {
            const h = harness(), work = h.controller[action]();
            if (terminal === 'rejected') h.pending[0].reject(new Error('synthetic transport failure'));
            else h.pending[0].resolve({status: terminal});
            await work;
            assert.equal(h.view.querySelector('.btnCancelUpdate').hidden, true, action + ': ' + terminal);
            assert.equal(h.view.querySelector('.btnCancelUpdate').disabled, true);
            assert.equal(h.controller.updating, false);
            assert.equal(h.listeners.size, 0);
        }
    }
});

test('click deduplication does not suppress pause or destroy cleanup after a failed cancel IPC', async () => {
    for (const lifecycle of ['onPause', 'destroy']) {
        const h = harness(), work = h.controller.checkUpdates();
        const cancel = h.controller.cancelUpdate();
        h.pending[1].reject(new Error('synthetic cancel transport failure')); await cancel;
        await h.controller.cancelUpdate({type: 'click'});
        assert.equal(h.pending.length, 2, 'repeated button action stays deduplicated');
        h.controller[lifecycle]();
        assert.equal(h.pending.length, 3, 'lifecycle still sends its original cleanup request');
        assert.equal(h.pending[2].channel, 'enhanced-maintenance-cancel-update');
        assert.equal(h.view.querySelector('.btnCancelUpdate').hidden, true);
        h.pending[2].resolve({status: 'cancelled'}); h.pending[0].resolve({status: 'cancelled'}); await work;
        assert.equal(h.controller.updating, false);
    }
});

test('note click and middle-click prevent native navigation and use only the separate link IPC', async () => {
    const h = harness(), notes = h.view.querySelector('.aboutReleaseNotes');
    const url = 'https://github.com/hope140/EmbyTheaterEnhanced/compare/v0.4.0...v0.4.1';
    const anchor = {getAttribute: () => url}; notes.contains = node => node === anchor;
    for (const type of ['click', 'auxclick']) {
        let prevented = false, stopped = false;
        notes.listeners[type]({type, button: type === 'auxclick' ? 1 : 0, target: {closest: () => anchor},
            preventDefault() { prevented = true; }, stopPropagation() { stopped = true; }});
        assert.equal(prevented, true); assert.equal(stopped, true);
        const request = h.pending.at(-1);
        assert.equal(request.channel, 'enhanced-maintenance-open-note-link');
        assert.equal(request.payload.url, url);
        request.resolve({status: 'opened'}); await tick();
    }
    const count = h.pending.length;
    notes.listeners.auxclick({type: 'auxclick', button: 2, target: {closest: () => anchor}, preventDefault() {}, stopPropagation() {}});
    await h.controller.openNoteLink('file:///C:/test');
    assert.equal(h.pending.length, count);
});

test('note link failures are inline and stale replies cannot change a resumed or destroyed page', async () => {
    const h = harness();
    const opening = h.controller.openNoteLink('https://example.invalid/');
    h.pending[0].resolve({status: 'error'}); await opening;
    assert.match(h.view.querySelector('.aboutNoteLinkState').textContent, /无法打开/);
    const late = h.controller.openNoteLink('https://example.invalid/');
    h.controller.onPause();
    h.view.querySelector('.aboutNoteLinkState').textContent = 'new page';
    h.pending[1].resolve({status: 'error'}); await late;
    assert.equal(h.view.querySelector('.aboutNoteLinkState').textContent, 'new page');
    h.controller.destroy(); await h.controller.openNoteLink('https://example.invalid/');
    assert.equal(h.pending.length, 2);
});

test('reading the saved channel is local only and does not start a check', async () => {
    const h = harness(), reading = h.controller.loadChannel();
    assert.equal(h.pending[0].channel, 'enhanced-maintenance-get-channel');
    assert.equal(h.view.querySelector('.btnCheckUpdates').disabled, true);
    h.pending[0].resolve({status: 'ok', channel: 'testing'}); await reading;
    assert.equal(h.controller.updateChannel, 'testing');
    assert.equal(h.view.querySelector('.selectUpdateChannel').value, 'testing');
    assert.equal(h.pending.length, 1);
});

for (const [recovery, message] of [['pending-install', /尚未确认安装完成/], ['cleanup-pending', /新版本已启动.*无法安全清理/]]) {
    test('local recovery distinguishes ' + recovery + ' without a check or popup', async () => {
        const h = harness(), reading = h.controller.loadChannel();
        h.pending[0].resolve({status: 'ok', channel: 'stable', recovery}); await reading;
        assert.match(h.view.querySelector('.aboutUpdateState').textContent, message);
        assert.equal(h.pending.length, 1);
    });
}

test('switching while checking retires old results, saves the channel and requires another manual click', async () => {
    const h = harness(), old = h.controller.checkUpdates();
    h.view.querySelector('.selectUpdateChannel').value = 'testing';
    const changing = h.controller.changeChannel();
    assert.equal(h.pending[1].channel, 'enhanced-maintenance-cancel-update');
    assert.equal(h.pending[2].channel, 'enhanced-maintenance-set-channel');
    await h.controller.checkUpdates(); assert.equal(h.pending.length, 3);
    h.pending[0].resolve(update); h.pending[1].resolve({status: 'cancelled'}); await old;
    assert.equal(h.view.querySelector('.about-update').hidden, true);
    assert.equal(h.view.querySelector('.btnDownloadUpdate').disabled, true);
    h.pending[2].resolve({status: 'saved', channel: 'testing'}); await changing;
    assert.equal(h.controller.updateChannel, 'testing'); assert.equal(h.pending.length, 3);
    const next = h.controller.checkUpdates();
    h.pending[3].resolve({...update, latestVersion: '0.4.1', channel: 'testing', prerelease: true}); await next;
    assert.match(h.view.querySelector('.aboutUpdateState').textContent, /测试版/);
    assert.match(h.view.querySelector('.about-update-channel').textContent, /测试通道/);
});

test('download keeps the selector disabled; cancellation then failed save leaves the original channel', async () => {
    const h = harness(), downloading = h.controller.downloadUpdate();
    assert.equal(h.view.querySelector('.selectUpdateChannel').disabled, true);
    h.view.querySelector('.selectUpdateChannel').value = 'testing'; await h.controller.changeChannel();
    assert.equal(h.pending.length, 1); assert.equal(h.controller.updateChannel, 'stable');
    h.pending[0].resolve({status: 'cancelled'}); await downloading;
    assert.equal(h.view.querySelector('.selectUpdateChannel').disabled, false);
    h.view.querySelector('.selectUpdateChannel').value = 'testing'; const changing = h.controller.changeChannel();
    h.pending[1].resolve({status: 'error'}); await changing;
    assert.equal(h.view.querySelector('.selectUpdateChannel').value, 'stable');
    assert.equal(h.view.querySelector('.btnDownloadUpdate').disabled, true);
    assert.match(h.view.querySelector('.aboutUpdateState').textContent, /仍使用原通道/);
});

test('a retired channel-save reply cannot change the channel read after reentry', async () => {
    const h = harness(); h.view.querySelector('.selectUpdateChannel').value = 'testing';
    const changing = h.controller.changeChannel(); h.controller.onPause();
    const reading = h.controller.loadChannel();
    h.pending[0].resolve({status: 'saved', channel: 'testing'}); await changing;
    assert.equal(h.controller.updateChannel, 'stable');
    h.pending[1].resolve({status: 'ok', channel: 'testing'}); await reading;
    assert.equal(h.controller.updateChannel, 'testing'); assert.equal(h.pending.length, 2);
});
