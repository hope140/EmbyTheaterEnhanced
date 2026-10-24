'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const native = require('../src/electronapp/native-helper/client');
const {createService} = require('../src/electronapp/native-helper/service');
const root = path.join(__dirname, '..');
const pluginRoot = process.env.ETE_VIDEO_SETTINGS_SOURCE_ROOT
    ? path.resolve(process.env.ETE_VIDEO_SETTINGS_SOURCE_ROOT) : path.join(root, 'src/electronapp/plugins/mpvplayer');
const html = fs.readFileSync(path.join(pluginRoot, 'video.html'), 'utf8');
const source = fs.readFileSync(path.join(pluginRoot, 'video.js'), 'utf8');
const fixed = {status: 'ok', mode: 'native-helper', fixedNativeRenderPath: 'vo=gpu-next; gpu-api=d3d11'};
function deferred() { let resolve; const promise = new Promise(yes => {resolve = yes;}); return {promise, resolve}; }
function classList(text) { const values = new Set(text.split(/\s+/)); return {contains: c => values.has(c), toggle(c, enabled) {if (enabled) values.add(c); else values.delete(c);}}; }
// Parse the real maintained HTML controls; browser focus/layout gets a separate
// headless Chromium check. These nodes model DOM properties, not Emby's loader.
function dom() {
    const nodes = new Map();
    for (const match of html.matchAll(/<div class="(selectContainer[^"]*)"[^>]*>\s*<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
        const name = match[2].match(/class="([^"]+)"/)[1].split(/\s+/)[0];
        const values = [...match[3].matchAll(/<option value="([^"]*)"/g)].map(m => m[1]);
        const row = {classList: classList(match[1])}; let value = values[0] || '';
        nodes.set('.' + name, {disabled: /\bdisabled\b/.test(match[2]), closest(selector) {assert.equal(selector, '.selectContainer'); return row;},
            get value() {return value;}, set value(v) {value = values.includes(String(v)) ? String(v) : '';}});
    }
    for (const match of html.matchAll(/<input\b([^>]*)>/g)) {
        const name = match[1].match(/class="([^"]+)"/)[1].split(/\s+/)[0];
        nodes.set('.' + name, {value: '', checked: false, disabled: false});
    }
    nodes.set('form', {addEventListener() {}});
    return {querySelector(selector) {assert.ok(nodes.has(selector), selector); return nodes.get(selector);}, nodes};
}
function fixture(response = fixed, options = {}) {
    const view = dom(), values = new Map([['mpv-vo', 'historical-output'], ['mpv-gpuapi', 'historical-api'], ['mpv-hwdec', 'd3d11va']]);
    const writes = [], calls = []; let View, dependencies;
    function BaseView(element) {this.view = element;}
    BaseView.prototype.onResume = function () {};
    BaseView.prototype.onPause = function () {};
    const ipc = options.noIpc ? null : {invoke(channel, request) {
        calls.push({channel, request});
        return options.reject ? Promise.reject(new Error('fixture unavailable')) : Promise.resolve(response);
    }};
    vm.runInNewContext(source, {window: {ipc}, Promise, Object, define(deps, factory) {
        dependencies = deps;
        View = factory({hide() {}}, {}, {get: key => values.get(key), set(key, value) {values.set(key, value); writes.push(key);}}, BaseView, native);
    }});
    const controller = new View(view, {});
    return {view, values, writes, calls, controller, dependencies, node: selector => view.querySelector(selector)};
}
for (const state of ['stopped', 'starting', 'ready']) test('fixed Native render rows and their descriptions are inert for ' + state, async () => {
    const f = fixture({...fixed, state});
    await f.controller.onResume({refresh: true});
    for (const selector of ['.selectVideoOut', '.selectGpuApi']) {
        const input = f.node(selector); assert.equal(input.closest('.selectContainer').classList.contains('hide'), true); assert.equal(input.disabled, true);
    }
    assert.equal(f.node('.selectHwaMode').disabled, false);
    assert.equal(f.node('.selectHwaMode').closest('.selectContainer').classList.contains('hide'), false);
    assert.equal(f.node('.selectNominalRange').disabled, false);
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].channel, native.CALL_CHANNEL); assert.equal(f.calls[0].request.operation, 'status');
});
test('hidden legacy render values survive pause while effective hardware and range settings still save', async () => {
    const f = fixture(); await f.controller.onResume({refresh: true});
    assert.equal(f.node('.selectVideoOut').value, '', 'an unrepresentable old value cannot be round-tripped through this select');
    f.node('.selectHwaMode').value = 'no'; f.node('.selectNominalRange').value = 'limited';
    f.controller.onPause();
    assert.equal(f.values.get('mpv-vo'), 'historical-output'); assert.equal(f.values.get('mpv-gpuapi'), 'historical-api');
    assert.equal(f.writes.includes('mpv-vo'), false); assert.equal(f.writes.includes('mpv-gpuapi'), false);
    assert.equal(f.values.get('mpv-hwdec'), 'no'); assert.equal(f.values.get('mpv-outputlevels'), 'limited');
});
test('a mode without the fixed Native contract retains the original selectable controls', async () => {
    const f = fixture({status: 'ok', mode: 'selectable-renderer', fixedNativeRenderPath: null});
    await f.controller.onResume({refresh: true});
    for (const selector of ['.selectVideoOut', '.selectGpuApi']) {assert.equal(f.node(selector).disabled, false); assert.equal(f.node(selector).closest('.selectContainer').classList.contains('hide'), false);}
    f.node('.selectVideoOut').value = 'gpu'; f.node('.selectGpuApi').value = 'vulkan'; f.controller.onPause();
    assert.equal(f.values.get('mpv-vo'), 'gpu'); assert.equal(f.values.get('mpv-gpuapi'), 'vulkan');
});
for (const options of [{reject: true}, {noIpc: true}]) test('unavailable capability query preserves both historical render keys: ' + JSON.stringify(options), async () => {
    const f = fixture(fixed, options); await f.controller.onResume({refresh: true}); f.controller.onPause();
    assert.equal(f.values.get('mpv-vo'), 'historical-output'); assert.equal(f.values.get('mpv-gpuapi'), 'historical-api');
});
test('a Native status missing its fixed-path contract stays unknown and preserves stored values', async () => {
    const f = fixture({status: 'ok', mode: 'native-helper'});
    await f.controller.onResume({refresh: true}); f.controller.onPause();
    assert.equal(f.node('.selectVideoOut').disabled, true);
    assert.equal(f.values.get('mpv-vo'), 'historical-output'); assert.equal(f.values.get('mpv-gpuapi'), 'historical-api');
});
test('a reply after pause cannot reactivate controls or rewrite a later view', async () => {
    const response = deferred(), f = fixture(response.promise);
    const pending = f.controller.onResume({refresh: true}); f.controller.onPause();
    response.resolve({status: 'ok', mode: 'selectable-renderer'}); await pending;
    assert.equal(f.node('.selectVideoOut').disabled, true); assert.equal(f.values.get('mpv-vo'), 'historical-output');
});
test('the production stopped service reports the fixed path without starting a helper', async () => {
    const service = createService({getMainWindow: () => null, electron: {BrowserWindow: function () {throw Error('status must not start a surface');}}});
    try { const status = await service.call('status'); assert.equal(status.mode, 'native-helper'); assert.equal(status.state, 'stopped'); assert.equal(status.fixedNativeRenderPath, fixed.fixedNativeRenderPath); }
    finally {await service.destroy();}
});
