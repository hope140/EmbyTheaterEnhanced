'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const patcher = require('../tools/patch-server-home.cjs');
test('pinned HomeTab consumes the native default-unwrapped alias and preserves original lifecycle', async () => {
    const input = fs.readFileSync(path.join(__dirname, '../vendor/carnival/electronapp/www/home/hometab.js'), 'utf8');
    const output = patcher.patchHomeTab(input);
    assert.throws(() => patcher.patchHomeTab(input.replace('this.sectionsContainer=', 'this.changedContainer=')), /anchor mismatch/);
    assert.throws(() => patcher.patchHomeTab(output), /anchor mismatch/);
    let HomeTab, creates = 0; const events = [], view = {querySelector: () => ({addEventListener() {}})};
    function Base() {} Base.prototype.onResume = () => events.push('base-resume'); Base.prototype.onPause = () => events.push('base-pause'); Base.prototype.destroy = () => events.push('base-destroy');
    const control = {resume: () => events.push('resume'), refresh: () => events.push('refresh'), pause: () => events.push('pause'),
        dispose: () => events.push('dispose'), clear: () => events.push('clear')};
    const app = fs.readFileSync(path.join(__dirname, '../vendor/carnival/electronapp/www/app.js'), 'utf8');
    const unwrapStart = app.indexOf('function returnFirstDependencyDefault(');
    const unwrapEnd = app.indexOf('function enableNativeGamepadKeyMapping(', unwrapStart);
    const importStart = app.indexOf('function getDynamicImport(path)');
    const importEnd = app.indexOf('function importFromPath(', importStart);
    assert.ok(unwrapStart >= 0 && unwrapEnd > unwrapStart && importStart >= 0 && importEnd > importStart);
    const exported = {default: {create(owner) { creates++; return control; }}};
    const alias = await vm.runInNewContext(app.slice(unwrapStart, unwrapEnd) + app.slice(importStart, importEnd) +
        'getDynamicImport("fixture-home")()', {require() { return Promise.resolve([exported]); }});
    assert.equal(alias, exported.default);
    vm.runInNewContext(output, {define(dependencies, factory) {
        const exports = {};
        const args = Array.from(dependencies).map(name => name === 'exports' ? exports : name.includes('basetab') ? {default: Base} :
            name.includes('connectionmanager') ? {default: {currentApiClient: () => ({})}} : name === 'ete-server-home' ?
            alias : {default: {}});
        factory(...args); HomeTab = exports.default;
    }}, {timeout: 1000});
    const tab = new HomeTab(view, {}); tab.onResume(); tab.refresh(); tab.onPause(); tab.destroy();
    assert.equal(creates, 1); assert.deepEqual(events, ['base-resume', 'resume', 'refresh', 'base-pause', 'pause', 'dispose', 'base-destroy', 'clear']);
});
test('app transform preserves plugin registrations and adds exactly one home module with valid syntax', () => {
    const app = fs.readFileSync(path.join(__dirname, '../vendor/carnival/electronapp/www/app.js'), 'utf8');
    const external = require('../tools/patch-external-player-registration.cjs');
    const plugin = require('../tools/patch-plugin-settings.cjs');
    const input = plugin.patchApp(external.patchText(app).text), output = patcher.patchApp(input);
    assert.equal(output.split('define("ete-server-home",').length - 1, 1);
    for (const name of ['responseHelper', 'emby-premierecontainer', 'emby-dialogclosebutton', 'baseView']) {
        assert.equal(output.split('define("' + name + '",').length, input.split('define("' + name + '",').length);
    }
    assert.ok(output.includes('getDynamicImport("./../enhanced/home/home-tab.js")'));
    assert.doesNotThrow(() => new vm.Script(output));
    assert.throws(() => patcher.patchApp(output), /anchor mismatch/);
});
