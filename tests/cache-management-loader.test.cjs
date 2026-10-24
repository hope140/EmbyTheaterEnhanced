'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

for (const controllerId of ['../plugins/mpvplayer/cache-management.js', 'file:///synthetic/electronapp/plugins/mpvplayer/cache-management.js']) {
    test('actual Alameda cache controller and Home share one owner: ' + controllerId, {timeout: 5000}, async () => {
        const requested = [], nodes = new Map();
        const node = selector => {
            if (!nodes.has(selector)) nodes.set(selector, {textContent: '', disabled: false, handlers: new Map(), addEventListener(type, callback) { this.handlers.set(type, callback); }, removeEventListener(type, callback) { if (this.handlers.get(type) === callback) this.handlers.delete(type); }, setAttribute() {}, querySelector: node});
            return nodes.get(selector);
        };
        const view = {querySelector: node};
        const context = vm.createContext({URL, Promise, AbortController, console, setTimeout, clearTimeout,
            window: {ipc: {invoke: async channel => channel.endsWith('clear') ? {status: 'cleared', bytes: 0} : {status: 'ok', bytes: 128}}},
            document: {
                createElement(tag) {
                    assert.equal(tag, 'script'); const listeners = new Map();
                    return {addEventListener(type, callback) { listeners.set(type, callback); }, fire(type = 'load') { listeners.get(type)?.({type, target: this}); }};
                },
                head: {appendChild(script) {
                    const filename = new URL(script.src, 'file:///synthetic/electronapp/www/index.html').pathname;
                    assert.ok(filename.startsWith('/synthetic/electronapp/'), filename);
                    const relative = 'src/' + filename.slice('/synthetic/'.length);
                    if (![
                        'src/electronapp/plugins/mpvplayer/cache-management.js', 'src/electronapp/plugins/mpvplayer/cache-settings.js',
                        'src/electronapp/enhanced/detail-cache/store.js', 'src/electronapp/enhanced/page-cache/home-layout-cache.js', 'src/electronapp/enhanced/page-cache/page-data-cache.js'
                    ].includes(relative)) { queueMicrotask(() => script.fire('error')); return; }
                    requested.push(relative);
                    vm.runInContext(fs.readFileSync(path.join(root, relative), 'utf8'), context, {filename});
                    queueMicrotask(() => script.fire());
                }}
            }});
        vm.runInContext(fs.readFileSync(path.join(root, 'vendor/web-snapshot/www/modules/alameda/alameda.js'), 'utf8'), context);
        // The app owns canonical API events; use a minimal event shell rather than an account/API.
        context.define('modules/emby-apiclient/events.js', [], () => ({default: {on() {}, off() {}}}));
        function Base() { this.view = view; }
        Base.prototype.onResume = function () {};
        Base.prototype.onPause = function () {};
        Base.prototype.destroy = function () { this.destroyCount = (this.destroyCount || 0) + 1; this.view = null; };
        context.define('baseView', [], () => Base);
        for (const id of ['emby-button', 'emby-scroller']) context.define(id, [], () => ({}));
        context.require.config({baseUrl: 'file:///synthetic/electronapp/www/', noRequireCss: true});
        vm.runInContext(require('../tools/patch-server-home.cjs').CACHE_ALIAS+';'+require('../tools/patch-server-home.cjs').DETAIL_CACHE_ALIAS, context);
        const home = await context.require(['../enhanced/page-cache/home-layout-cache.js'], value => value);
        const client = {isLoggedIn: () => true, serverId: () => 'synthetic-server', getCurrentUserId: () => 'synthetic-user', _identityEpoch: 1, getCurrentLocale: () => 'zh-CN', serverVersion: () => '4.10.0.40'};
        const owner = home.default.create({currentApiClient: () => client}, {enabled: true, ttlMs: 10000, maxEntries: 2, maxBytes: 4096});
        try {
            await owner.load(vm.runInContext("({displayMode: 'desktop'})", context), () => vm.runInContext("Promise.resolve([{Id: 'synthetic-layout'}])", context));
            const Controller = await context.require([controllerId], value => value);
            const controller = new Controller(view);
            await controller.onResume();
            assert.match(node('.cachePageValue').textContent, /bytes（部分可读）/);
            assert.match(node('.cacheHttpValue').textContent, /128 bytes/);
            assert.equal(requested.filter(file => file.endsWith('/home-layout-cache.js')).length, 1);
            node('.btnClearAllCaches').handlers.get('click')();
            for (let i = 0; i < 35; i++) await Promise.resolve();
            assert.equal(home.default.management.snapshot().entries, 0);
            assert.match(node('.cacheOperationState').textContent, /部分清理完成/);
            controller.destroy(); assert.equal(controller.destroyCount, 1);
        } finally { owner.dispose(); }
    });
}
