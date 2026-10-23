'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const patcher = require('../tools/patch-server-home.cjs');
const provider = require('../src/electronapp/enhanced/home/server-sections.js');

function nativeRouteUrl() {
    const root = path.join(__dirname, '../vendor/web-snapshot/www');
    const router = fs.readFileSync(path.join(root, 'modules/approuter.js'), 'utf8');
    const start = router.indexOf('function getRouteUrl(item, options) {');
    const end = router.indexOf('\n  function showAlert(', start);
    const helpers = fs.readFileSync(path.join(root, 'modules/common/itemhelper.js'), 'utf8');
    const localStart = helpers.indexOf('function isLocalItem(item){');
    const localEnd = helpers.indexOf('Object.defineProperty(', localStart);
    assert.ok(start >= 0 && end > start && localStart >= 0 && localEnd > localStart);
    const isLocalItem = vm.runInNewContext('(' + helpers.slice(localStart, localEnd) + ')');
    return vm.runInNewContext('(' + router.slice(start, end).trim() + ')', {_itemhelper: {default: {isLocalItem}}});
}

test('projected parent identities use the pinned router library latest routes without manufacturing type or query', () => {
    const route = nativeRouteUrl();
    for (const [collection, endpoint] of [['movies', 'videos'], ['tvshows', 'tv']]) {
        const section = provider.prepareSections([{Id: 'unrelated-section', Name: 'Latest', SectionType: 'latestmedia',
            ParentItem: {Id: 'library-123', CollectionType: collection}}], 'server-123')[0];
        assert.equal(route(section.ParentItem, {section: 'latest', serverId: 'server-123'}),
            '/' + endpoint + '?serverId=server-123&parentId=library-123&tab=suggestions');
        assert.equal(section.ParentItem.Type, undefined); assert.equal(section.ParentItem.IsFolder, undefined);
    }
    for (const value of [{Id: 'x&serverId=other'}, {Id: 'x?tab=folders'}, {Id: 'x#fragment'}, {Id: '../x'},
        {ServerId: 'other'}, {url: 'javascript:alert(1)'}, {Href: '//invalid'}, {QueryOptions: {tab: 'bad'}}, {CollectionType: 'unknown'}]) {
        const section = provider.prepareSections([{Id: 'safe-section', Name: 'Latest', SectionType: 'latestmedia',
            ParentItem: {Id: 'library-123', CollectionType: 'movies', ...value}}], 'server-123')[0];
        assert.equal(section.ParentItem, null);
    }
    assert.equal(route({Id: 'local-library', CollectionType: 'movies', ServerId: 'server-123'}, {section: 'latest'}),
        '/item?id=local-library&serverId=server-123');
});

test('home module loads the native title registration and router through canonical AMD identities', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/electronapp/enhanced/home/home-tab.js'), 'utf8');
    let exported;
    vm.runInNewContext(source, {define(dependencies, factory) {
        const ids = Array.from(dependencies); assert.ok(ids.includes('modules/approuter.js'));
        assert.ok(ids.includes('modules/emby-elements/emby-button/emby-button.js'));
        assert.equal(ids.some(id => id.includes('../www/')), false);
        const exports = {}; factory(exports, {default: provider}, {default: {}}, {default: {tv: false}}, {default: {}},
            {default: {getRouteUrl: nativeRouteUrl()}}, {default: {}},
            {default: require('../src/electronapp/enhanced/page-cache/home-layout-cache.js')}); exported = exports.default;
    }});
    assert.equal(typeof exported.create, 'function');
});
test('pinned HomeTab consumes the native default-unwrapped alias and preserves original lifecycle', async () => {
    const input = fs.readFileSync(path.join(__dirname, '../vendor/web-snapshot/www/home/hometab.js'), 'utf8');
    const output = patcher.patchHomeTab(input);
    assert.throws(() => patcher.patchHomeTab(input.replace('this.sectionsContainer=', 'this.changedContainer=')), /anchor mismatch/);
    assert.throws(() => patcher.patchHomeTab(output), /anchor mismatch/);
    let HomeTab, creates = 0; const events = [], view = {querySelector: () => ({addEventListener() {}})};
    function Base() {} Base.prototype.onResume = () => events.push('base-resume'); Base.prototype.onPause = () => events.push('base-pause'); Base.prototype.destroy = () => events.push('base-destroy');
    const control = {resume: () => events.push('resume'), refresh: () => events.push('refresh'), pause: () => events.push('pause'),
        dispose: () => events.push('dispose'), clear: () => events.push('clear')};
    const app = fs.readFileSync(path.join(__dirname, '../vendor/web-snapshot/www/app.js'), 'utf8');
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
    const app = fs.readFileSync(path.join(__dirname, '../vendor/web-snapshot/www/app.js'), 'utf8');
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
