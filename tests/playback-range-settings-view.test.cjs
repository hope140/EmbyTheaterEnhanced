'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.join(__dirname, '../src/electronapp/plugins/mpvplayer/cache.js');
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
        this.textContent = '';
        this.listeners = Object.create(null);
    }
    addEventListener(name, callback) { this.listeners[name] = callback; }
}

function createView() {
    const selectors = [
        'form', '.chkRangeEnabled', '.selectRangeProgress', '.selectRangePreload',
        '.txtRangeBudget', '.txtRangeRate', '.rangeSettingsState', '.rangeRuntimeState'
    ];
    const nodes = Object.fromEntries(selectors.map(selector => [selector, new FakeNode()]));
    nodes.form.addEventListener = FakeNode.prototype.addEventListener;
    const controls = [nodes['.chkRangeEnabled'], nodes['.selectRangeProgress'], nodes['.selectRangePreload'],
        nodes['.txtRangeBudget'], nodes['.txtRangeRate'], new FakeNode()];
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
        define(_dependencies, factory) {
            Controller = factory({hide() {}}, BaseView);
        },
        window: {ipc: {invoke}},
    }, {filename: sourcePath, timeout: 1000});
    return Controller;
}

function settings(enabled, overrides) {
    return Object.assign({schema: 1, enabled, progressPercent: 70, preloadMB: 300,
        maxBytes: null, bytesPerSecond: null}, overrides || {});
}

function submitEvent() {
    return {prevented: false, preventDefault() { this.prevented = true; }};
}

async function openPage(invoke, fixture = createView()) {
    const Controller = loadController(invoke);
    const page = new Controller(fixture.view);
    page.onResume();
    return {page, ...fixture};
}

test('GET initializes a disabled draft with 70/300 defaults and empty resource fields', async () => {
    const calls = [];
    const {page, nodes, controls} = await openPage(async (...args) => {
        calls.push(args);
        assert.equal(args[0], GET);
        return {status: 'ok', config: settings(false), runtime: {enabled: false}};
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], GET);
    assert.equal(calls[0][1], undefined);
    assert.equal(nodes['.chkRangeEnabled'].checked, false);
    assert.equal(nodes['.selectRangeProgress'].value, '70');
    assert.equal(nodes['.selectRangePreload'].value, '300');
    assert.equal(nodes['.txtRangeBudget'].value, '');
    assert.equal(nodes['.txtRangeRate'].value, '');
    assert.equal(nodes['.rangeRuntimeState'].textContent, '本次运行未启用。');
    assert.equal(page.loaded, true);
    assert.ok(controls.every(node => node.disabled === false));
});

test('enabled draft without both resources is rejected locally and sends no SAVE', async () => {
    const calls = [];
    const {page, nodes} = await openPage(async channel => {
        calls.push(channel);
        return {status: 'ok', config: settings(false), runtime: {enabled: false}};
    });
    await new Promise(resolve => setImmediate(resolve));
    nodes['.chkRangeEnabled'].checked = true;
    const event = submitEvent();
    await page.save(event);
    assert.equal(event.prevented, true);
    assert.deepEqual(calls, [GET]);
    assert.match(nodes['.rangeSettingsState'].textContent, /明确填写磁盘预算和后台预载限速/);
});

test('save converts explicit MB values and keeps saved restart state separate from current runtime', async () => {
    const calls = [];
    const fixture = await openPage(async (channel, config) => {
        calls.push([channel, config]);
        if (channel === GET) return {status: 'ok', config: settings(false), runtime: {enabled: false}};
        return {status: 'saved', requiresRestart: true, config,
            runtime: {enabled: false, diskBytes: 2500000}};
    });
    const {page, nodes} = fixture;
    await new Promise(resolve => setImmediate(resolve));
    nodes['.chkRangeEnabled'].checked = true;
    nodes['.selectRangeProgress'].value = '80';
    nodes['.selectRangePreload'].value = '500';
    nodes['.txtRangeBudget'].value = '123.456';
    nodes['.txtRangeRate'].value = '1.25';
    await page.save(submitEvent());
    assert.equal(calls.length, 2);
    assert.equal(calls[1][0], SAVE);
    assert.deepEqual(JSON.parse(JSON.stringify(calls[1][1])), {
        schema: 1, enabled: true, progressPercent: 80, preloadMB: 500,
        maxBytes: 123456000, bytesPerSecond: 1250000
    });
    assert.equal(nodes['.rangeSettingsState'].textContent, '已保存，重启后生效。');
    assert.equal(nodes['.rangeRuntimeState'].textContent, '本次运行未启用。 本配置目录已提交的媒体缓存总量 2.5 MB。');
});

test('save failure preserves the edited draft and releases the input lock', async () => {
    const fixture = await openPage(async channel => {
        if (channel === GET) return {status: 'ok', config: settings(false), runtime: {enabled: false}};
        throw Error('private transport failure');
    });
    await new Promise(resolve => setImmediate(resolve));
    const {page, nodes, controls} = fixture;
    nodes['.chkRangeEnabled'].checked = true;
    nodes['.txtRangeBudget'].value = '456';
    nodes['.txtRangeRate'].value = '2';
    await page.save(submitEvent());
    assert.equal(nodes['.chkRangeEnabled'].checked, true);
    assert.equal(nodes['.txtRangeBudget'].value, '456');
    assert.equal(nodes['.txtRangeRate'].value, '2');
    assert.match(nodes['.rangeSettingsState'].textContent, /保存失败/);
    assert.equal(page.saving, false);
    assert.ok(controls.every(node => node.disabled === false));
});

test('concurrent submit is ignored while the first save holds the form lock', async () => {
    const pendingSave = deferred();
    let saveCalls = 0;
    const fixture = await openPage(async channel => {
        if (channel === GET) return {status: 'ok', config: settings(false), runtime: {enabled: false}};
        saveCalls++;
        return pendingSave.promise;
    });
    await new Promise(resolve => setImmediate(resolve));
    fixture.nodes['.chkRangeEnabled'].checked = true;
    fixture.nodes['.txtRangeBudget'].value = '10';
    fixture.nodes['.txtRangeRate'].value = '1';
    const first = fixture.page.save(submitEvent());
    const second = fixture.page.save(submitEvent());
    assert.equal(saveCalls, 1);
    assert.ok(fixture.controls.every(node => node.disabled === true));
    pendingSave.resolve({status: 'saved', requiresRestart: true, runtime: {enabled: false}});
    await Promise.all([first, second]);
    assert.ok(fixture.controls.every(node => node.disabled === false));
});

test('late GET from paused view cannot overwrite a newer resumed view', async () => {
    const oldRead = deferred(), newRead = deferred();
    const calls = [];
    const invoke = channel => {
        calls.push(channel);
        return calls.length === 1 ? oldRead.promise : newRead.promise;
    };
    const Controller = loadController(invoke);
    const oldFixture = createView();
    const page = new Controller(oldFixture.view);
    page.onResume();
    page.onPause();
    const freshFixture = createView();
    page.view = freshFixture.view;
    page.onResume();
    newRead.resolve({status: 'ok', config: settings(true, {progressPercent: 90, preloadMB: 500,
        maxBytes: 100000000, bytesPerSecond: 2000000}), runtime: {enabled: true}});
    await new Promise(resolve => setImmediate(resolve));
    oldRead.resolve({status: 'ok', config: settings(false, {progressPercent: 50, preloadMB: 100}), runtime: {enabled: false}});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(freshFixture.nodes['.chkRangeEnabled'].checked, true);
    assert.equal(freshFixture.nodes['.selectRangeProgress'].value, '90');
    assert.equal(freshFixture.nodes['.selectRangePreload'].value, '500');
    assert.equal(oldFixture.nodes['.chkRangeEnabled'].checked, false);
});

test('late GET after destroy does not write controls in the retired view', async () => {
    const read = deferred();
    const fixture = createView();
    const Controller = loadController(() => read.promise);
    const page = new Controller(fixture.view);
    page.onResume();
    page.destroy();
    read.resolve({status: 'ok', config: settings(true, {progressPercent: 90, preloadMB: 500,
        maxBytes: 100000000, bytesPerSecond: 2000000}), runtime: {enabled: true}});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(page.loaded, false);
    assert.equal(fixture.nodes['.chkRangeEnabled'].checked, false);
    assert.equal(fixture.nodes['.selectRangeProgress'].value, '');
});

test('controls remain locked while the initial settings read is pending', async () => {
    const read = deferred();
    let saveCalls = 0;
    const fixture = await openPage(async channel => {
        if (channel === GET) return read.promise;
        saveCalls++;
        return {status: 'saved'};
    });
    assert.ok(fixture.controls.every(node => node.disabled === true));
    fixture.nodes['.chkRangeEnabled'].checked = true;
    fixture.nodes['.txtRangeBudget'].value = '100';
    fixture.nodes['.txtRangeRate'].value = '1';
    await fixture.page.save(submitEvent());
    assert.equal(saveCalls, 0);
    assert.ok(fixture.controls.every(node => node.disabled === true));
    read.resolve({status: 'ok', config: settings(false), runtime: {enabled: false}});
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(fixture.controls.every(node => node.disabled === false));
});
