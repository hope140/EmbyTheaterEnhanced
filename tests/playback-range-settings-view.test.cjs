'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.join(__dirname, '../src/electronapp/plugins/mpvplayer/cache.js');
const htmlPath = path.join(__dirname, '../src/electronapp/plugins/mpvplayer/cache.html');
const source = fs.readFileSync(sourcePath, 'utf8');
const GET = 'enhanced-playback-range-settings-get';
const SAVE = 'enhanced-playback-range-settings-save';

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return {promise, resolve, reject};
}

class FakeNode {
    constructor() {
        this.value = '';
        this.checked = false;
        this.disabled = false;
        this.hidden = false;
        this.textContent = '';
        this.listeners = Object.create(null);
    }
    addEventListener(name, callback) { this.listeners[name] = callback; }
}

function createView() {
    const selectors = ['form', '.chkRangeEnabled', '.selectRangeProgress', '.selectRangePreload',
        '.rangeSettingsState', '.rangeRuntimeState'];
    const nodes = Object.fromEntries(selectors.map(selector => [selector, new FakeNode()]));
    nodes['.chkRangeEnabled'].hidden = true;
    nodes['.chkRangeEnabled'].disabled = true;
    const controls = [nodes['.chkRangeEnabled'], nodes['.selectRangeProgress'], nodes['.selectRangePreload'], new FakeNode()];
    const view = {
        querySelector(selector) {
            if (!nodes[selector]) throw Error('unexpected selector ' + selector);
            return nodes[selector];
        },
        querySelectorAll(selector) {
            assert.equal(selector, 'input,select,button');
            return controls;
        }
    };
    return {view, nodes, controls};
}

function loadController(invoke) {
    let Controller;
    function BaseView() {}
    BaseView.prototype.onResume = function () {};
    BaseView.prototype.onPause = function () {};
    BaseView.prototype.destroy = function () {};
    vm.runInNewContext(source, {
        define(_dependencies, factory) { Controller = factory({hide() {}}, BaseView); },
        window: {ipc: {invoke}}
    }, {filename: sourcePath, timeout: 1000});
    return Controller;
}

function config(overrides) {
    return Object.assign({schema: 1, enabled: false, progressPercent: 70, preloadMB: 300}, overrides || {});
}

function submitEvent() {return {prevented: false, preventDefault() {this.prevented = true;}};}

async function openPage(invoke, fixture = createView()) {
    const Controller = loadController(invoke), page = new Controller(fixture.view);
    page.onResume();
    return {page, ...fixture};
}

test('page hides/disables the enable control and contains no budget or rate inputs', () => {
    const html = fs.readFileSync(htmlPath, 'utf8');
    assert.doesNotMatch(html, /txtRangeBudget|txtRangeRate|总磁盘预算|后台预载限速/);
    assert.match(html, /chkRangeEnabled[^>]*(?:disabled|hidden)/s);
});

test('GET loads only the confirmed 70/300 choices and leaves feature disabled', async () => {
    const calls = [];
    const {page, nodes, controls} = await openPage(async (...args) => {
        calls.push(args);
        assert.equal(args[0], GET);
        return {status: 'ok', config: config(), runtime: {enabled: false}, capacityPending: true};
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1], undefined);
    assert.equal(nodes['.chkRangeEnabled'].checked, false);
    assert.equal(nodes['.chkRangeEnabled'].disabled, true);
    assert.equal(nodes['.chkRangeEnabled'].hidden, true);
    assert.equal(nodes['.selectRangeProgress'].value, '70');
    assert.equal(nodes['.selectRangePreload'].value, '300');
    assert.equal(nodes['.rangeRuntimeState'].textContent, '本次运行未启用。');
    assert.equal(page.loaded, true);
    assert.equal(nodes['.selectRangeProgress'].disabled, false);
    assert.equal(nodes['.selectRangePreload'].disabled, false);
    assert.equal(controls[3].disabled, false);
});

test('legacy enabled GET remains forced off while retaining legal progress and preload selections', async () => {
    const {nodes} = await openPage(async () => ({status: 'ok',
        config: config({enabled: true, progressPercent: 90, preloadMB: 500}),
        runtime: {enabled: false}, capacityPending: true}));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(nodes['.chkRangeEnabled'].checked, false);
    assert.equal(nodes['.chkRangeEnabled'].disabled, true);
    assert.equal(nodes['.selectRangeProgress'].value, '90');
    assert.equal(nodes['.selectRangePreload'].value, '500');
});

test('Save sends only disabled four-field selection and reports next-play capacity-pending state', async () => {
    const calls = [];
    const fixture = await openPage(async (channel, value) => {
        calls.push([channel, value]);
        if (channel === GET) return {status: 'ok', config: config(), runtime: {enabled: false}, capacityPending: true};
        return {status: 'saved', requiresRestart: false, applyMode: 'next-play', capacityPending: true,
            config: value, runtime: {enabled: false}};
    });
    await new Promise(resolve => setImmediate(resolve));
    fixture.nodes['.selectRangeProgress'].value = '80';
    fixture.nodes['.selectRangePreload'].value = '500';
    await fixture.page.save(submitEvent());
    assert.equal(calls.length, 2);
    assert.equal(calls[1][0], SAVE);
    assert.deepEqual(JSON.parse(JSON.stringify(calls[1][1])), {
        schema: 1, enabled: false, progressPercent: 80, preloadMB: 500
    });
    assert.equal(fixture.nodes['.chkRangeEnabled'].checked, false);
    assert.equal(fixture.nodes['.rangeSettingsState'].textContent,
        '已保存；播放缓存容量规则确定前不会启用。');
    assert.equal(fixture.nodes['.rangeRuntimeState'].textContent, '本次运行未启用。');
});

test('failed save retains selection and releases the editable controls', async () => {
    const fixture = await openPage(async channel => {
        if (channel === GET) return {status: 'ok', config: config(), runtime: {enabled: false}, capacityPending: true};
        throw Error('private transport failure');
    });
    await new Promise(resolve => setImmediate(resolve));
    fixture.nodes['.selectRangeProgress'].value = '80';
    fixture.nodes['.selectRangePreload'].value = '500';
    await fixture.page.save(submitEvent());
    assert.equal(fixture.nodes['.selectRangeProgress'].value, '80');
    assert.equal(fixture.nodes['.selectRangePreload'].value, '500');
    assert.match(fixture.nodes['.rangeSettingsState'].textContent, /保存失败/);
    assert.equal(fixture.page.saving, false);
    assert.equal(fixture.nodes['.chkRangeEnabled'].disabled, true);
    assert.equal(fixture.nodes['.selectRangeProgress'].disabled, false);
    assert.equal(fixture.nodes['.selectRangePreload'].disabled, false);
});

test('concurrent submit is ignored while the first Save owns the form lock', async () => {
    const pendingSave = deferred();
    let saveCalls = 0;
    const fixture = await openPage(async channel => {
        if (channel === GET) return {status: 'ok', config: config(), runtime: {enabled: false}, capacityPending: true};
        saveCalls++;
        return pendingSave.promise;
    });
    await new Promise(resolve => setImmediate(resolve));
    fixture.nodes['.selectRangeProgress'].value = '80';
    const first = fixture.page.save(submitEvent()), second = fixture.page.save(submitEvent());
    assert.equal(saveCalls, 1);
    assert.ok(fixture.controls.every(node => node.disabled === true));
    pendingSave.resolve({status: 'saved', requiresRestart: false, applyMode: 'next-play', capacityPending: true,
        config: config({progressPercent: 80}), runtime: {enabled: false}});
    await Promise.all([first, second]);
    assert.equal(fixture.nodes['.chkRangeEnabled'].disabled, true);
    assert.equal(fixture.nodes['.selectRangeProgress'].disabled, false);
    assert.equal(fixture.nodes['.selectRangePreload'].disabled, false);
});

test('late GET from a paused view cannot overwrite the newer resumed view', async () => {
    const oldRead = deferred(), newRead = deferred();
    let calls = 0;
    const Controller = loadController(() => (++calls === 1 ? oldRead.promise : newRead.promise));
    const oldFixture = createView(), page = new Controller(oldFixture.view);
    page.onResume();
    page.onPause();
    const freshFixture = createView();
    page.view = freshFixture.view;
    page.onResume();
    newRead.resolve({status: 'ok', config: config({progressPercent: 90, preloadMB: 500}), runtime: {enabled: false}, capacityPending: true});
    await new Promise(resolve => setImmediate(resolve));
    oldRead.resolve({status: 'ok', config: config({progressPercent: 50, preloadMB: 100}), runtime: {enabled: false}, capacityPending: true});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(freshFixture.nodes['.selectRangeProgress'].value, '90');
    assert.equal(freshFixture.nodes['.selectRangePreload'].value, '500');
    assert.equal(oldFixture.nodes['.selectRangeProgress'].value, '');
});

test('late GET after destroy does not write into a retired view', async () => {
    const read = deferred(), fixture = createView(), Controller = loadController(() => read.promise);
    const page = new Controller(fixture.view);
    page.onResume();
    page.destroy();
    read.resolve({status: 'ok', config: config({progressPercent: 90, preloadMB: 500}), runtime: {enabled: false}, capacityPending: true});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(page.loaded, false);
    assert.equal(fixture.nodes['.selectRangeProgress'].value, '');
});

test('controls remain locked and cannot Save while the initial GET is pending', async () => {
    const read = deferred();
    let saveCalls = 0;
    const fixture = await openPage(async channel => {
        if (channel === GET) return read.promise;
        saveCalls++;
        return {status: 'saved'};
    });
    assert.ok(fixture.controls.every(node => node.disabled === true));
    await fixture.page.save(submitEvent());
    assert.equal(saveCalls, 0);
    assert.ok(fixture.controls.every(node => node.disabled === true));
    read.resolve({status: 'ok', config: config(), runtime: {enabled: false}, capacityPending: true});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(fixture.nodes['.chkRangeEnabled'].disabled, true);
    assert.equal(fixture.nodes['.selectRangeProgress'].disabled, false);
    assert.equal(fixture.nodes['.selectRangePreload'].disabled, false);
});
