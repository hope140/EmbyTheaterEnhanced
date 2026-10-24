'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const controllerPath = path.join(__dirname, '../src/electronapp/plugins/mpvplayer/cache.js');
const htmlPath = path.join(__dirname, '../src/electronapp/plugins/mpvplayer/cache.html');
const source = fs.readFileSync(controllerPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const GET = 'enhanced-playback-range-settings-get';
const SAVE = 'enhanced-playback-range-settings-save';

function deferred() {
    let resolve, reject;
    const promise = new Promise((a, b) => {resolve = a; reject = b;});
    return {promise, resolve, reject};
}

class FakeNode {
    constructor() {this.value = ''; this.checked = false; this.disabled = false; this.hidden = false; this.textContent = ''; this.listeners = Object.create(null);}
    addEventListener(name, callback) {this.listeners[name] = callback;}
}

function viewFixture() {
    const selectors = ['form', '.chkRangeEnabled', '.selectRangeProgress', '.selectRangePreload', '.rangeSettingsState', '.rangeRuntimeState'];
    const nodes = Object.fromEntries(selectors.map(selector => [selector, new FakeNode()]));
    const controls = [nodes['.chkRangeEnabled'], nodes['.selectRangeProgress'], nodes['.selectRangePreload'], new FakeNode()];
    const view = {
        querySelector(selector) {if (!nodes[selector]) throw Error('unexpected selector ' + selector); return nodes[selector];},
        querySelectorAll(selector) {assert.equal(selector, 'input,select,button'); return controls;}
    };
    return {view, nodes, controls};
}

function loadController(invoke) {
    let Controller;
    function BaseView() {}
    BaseView.prototype.onResume = function () {};
    BaseView.prototype.onPause = function () {};
    BaseView.prototype.destroy = function () {};
    const define = (_dependencies, factory) => {Controller = factory({hide() {}}, BaseView);};
    define.amd = {};
    vm.runInNewContext(source, {define, window: {ipc: {invoke}}}, {filename: controllerPath, timeout: 1000});
    return Controller;
}

function config(overrides) {return Object.assign({schema: 1, enabled: false, progressPercent: 70, preloadMB: 300}, overrides || {});}
function saved(configValue, runtime = {enabled: false}) {
    return {status: 'saved', requiresRestart: false, applyMode: 'next-play', config: configValue, runtime};
}

test('HTML exposes only next-episode controls and visible strict source-boundary language', () => {
    assert.doesNotMatch(html, /最后一次实际播放|另一视频实际开始|最后播放缓存|maxBytes|bytesPerSecond|总磁盘预算|后台预载限速/);
    assert.match(html, /class="chkRangeEnabled"/);
    assert.doesNotMatch(html, /chkRangeEnabled[^>]*(?:disabled|hidden)/s);
    assert.match(html, /下一集/);
    assert.match(html, /同源/);
    assert.doesNotMatch(source, /txtRangeBudget|txtRangeRate|maxBytes|bytesPerSecond/);
});

test('GET enables the ordinary toggle and loads only the confirmed progress and preload choices', async () => {
    const calls = [], fixture = viewFixture(), Controller = loadController(async (...args) => {
        calls.push(args);
        return {status: 'ok', config: config(), runtime: {enabled: false}};
    });
    const page = new Controller(fixture.view);
    page.onResume();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], GET);
    assert.equal(calls[0][1], undefined);
    assert.equal(fixture.nodes['.chkRangeEnabled'].disabled, false);
    assert.equal(fixture.nodes['.selectRangeProgress'].value, '70');
    assert.equal(fixture.nodes['.selectRangePreload'].value, '300');
});

test('page saves enabled next-prefix settings for next play and keeps effective runtime status separate', async () => {
    const calls = [], fixture = viewFixture(), Controller = loadController(async (channel, value) => {
        calls.push([channel, value]);
        if (channel === GET) return {status: 'ok', config: config(), runtime: {enabled: false}};
        return saved(value, {enabled: false});
    });
    const page = new Controller(fixture.view);
    page.onResume();
    await new Promise(resolve => setImmediate(resolve));
    fixture.nodes['.chkRangeEnabled'].checked = true;
    fixture.nodes['.selectRangeProgress'].value = '80';
    fixture.nodes['.selectRangePreload'].value = '500';
    await page.save({preventDefault() {}});
    assert.equal(calls[1][0], SAVE);
    assert.deepEqual(JSON.parse(JSON.stringify(calls[1][1])), {schema: 1, enabled: true, progressPercent: 80, preloadMB: 500});
    assert.equal(fixture.nodes['.rangeSettingsState'].textContent, '已保存；下次播放应用，当前播放不受影响。');
    assert.equal(fixture.nodes['.rangeRuntimeState'].textContent, '本次运行未启用。');
});

test('GET preserves a saved enabled preference and current runtime may remain disabled', async () => {
    const fixture = viewFixture(), Controller = loadController(async () => ({status: 'ok',
        config: config({enabled: true, progressPercent: 90, preloadMB: 100}), runtime: {enabled: false}}));
    const page = new Controller(fixture.view);
    page.onResume();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(fixture.nodes['.chkRangeEnabled'].checked, true);
    assert.equal(fixture.nodes['.selectRangeProgress'].value, '90');
    assert.equal(fixture.nodes['.selectRangePreload'].value, '100');
    assert.equal(fixture.nodes['.rangeRuntimeState'].textContent, '本次运行未启用。');
});

test('failed save preserves draft and unlocks controls', async () => {
    const fixture = viewFixture(), Controller = loadController(async channel => {
        if (channel === GET) return {status: 'ok', config: config(), runtime: {enabled: false}};
        throw Error('private transport failure');
    });
    const page = new Controller(fixture.view);
    page.onResume();
    await new Promise(resolve => setImmediate(resolve));
    fixture.nodes['.chkRangeEnabled'].checked = true;
    fixture.nodes['.selectRangeProgress'].value = '80';
    fixture.nodes['.selectRangePreload'].value = '500';
    await page.save({preventDefault() {}});
    assert.equal(fixture.nodes['.chkRangeEnabled'].checked, true);
    assert.equal(fixture.nodes['.selectRangeProgress'].value, '80');
    assert.equal(fixture.nodes['.selectRangePreload'].value, '500');
    assert.match(fixture.nodes['.rangeSettingsState'].textContent, /保存失败/);
    assert.equal(page.saving, false);
    assert.ok(fixture.controls.every(node => node.disabled === false));
});

test('double Save is gated while first next-play update is pending', async () => {
    const update = deferred(); let saveCount = 0;
    const fixture = viewFixture(), Controller = loadController(async channel => {
        if (channel === GET) return {status: 'ok', config: config(), runtime: {enabled: false}};
        saveCount++;
        return update.promise;
    });
    const page = new Controller(fixture.view);
    page.onResume();
    await new Promise(resolve => setImmediate(resolve));
    const first = page.save({preventDefault() {}}), second = page.save({preventDefault() {}});
    assert.equal(saveCount, 1);
    assert.ok(fixture.controls.every(node => node.disabled === true));
    update.resolve(saved(config({enabled: true})));
    await Promise.all([first, second]);
    assert.ok(fixture.controls.every(node => node.disabled === false));
});

test('late read from a paused view cannot fill the resumed view with stale settings', async () => {
    const oldRead = deferred(), newRead = deferred(); let count = 0;
    const Controller = loadController(() => (++count === 1 ? oldRead.promise : newRead.promise));
    const oldFixture = viewFixture(), page = new Controller(oldFixture.view);
    page.onResume();
    page.onPause();
    const newFixture = viewFixture(); page.view = newFixture.view; page.onResume();
    newRead.resolve({status: 'ok', config: config({enabled: true, progressPercent: 80, preloadMB: 500}), runtime: {enabled: false}});
    await new Promise(resolve => setImmediate(resolve));
    oldRead.resolve({status: 'ok', config: config({progressPercent: 50, preloadMB: 100}), runtime: {enabled: false}});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(newFixture.nodes['.chkRangeEnabled'].checked, true);
    assert.equal(newFixture.nodes['.selectRangeProgress'].value, '80');
    assert.equal(newFixture.nodes['.selectRangePreload'].value, '500');
    assert.equal(oldFixture.nodes['.selectRangeProgress'].value, '');
});

test('destroy retires a pending GET and initial loading locks Save', async () => {
    const read = deferred(), fixture = viewFixture(), Controller = loadController(() => read.promise);
    const page = new Controller(fixture.view);
    page.onResume();
    assert.ok(fixture.controls.every(node => node.disabled === true));
    await page.save({preventDefault() {}});
    page.destroy();
    read.resolve({status: 'ok', config: config({enabled: true}), runtime: {enabled: true}});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(page.loaded, false);
    assert.equal(fixture.nodes['.chkRangeEnabled'].checked, false);
});
