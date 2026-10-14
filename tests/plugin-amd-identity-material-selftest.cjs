'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const webRoot = path.join(root, 'vendor/carnival/electronapp/www');
const pluginRoot = path.join(root, 'src/electronapp/enhanced/plugin-ui');
const loaderPath = path.join(webRoot, 'modules/alameda/alameda.js');

const moduleContracts = {
    'genericui.js': [
        'modules/viewmanager/baseview.js',
        'modules/maintabsmanager.js',
        'modules/appheader/appheader.js',
        'modules/approuter.js',
        'modules/emby-apiclient/connectionmanager.js',
        'modules/emby-apiclient/events.js',
        'modules/common/input/api.js',
        'modules/common/globalize.js',
        'modules/genericedit/genericedit.js',
        'modules/emby-elements/emby-scroller/emby-scroller.js',
        'modules/emby-elements/emby-button/emby-button.js',
        'modules/dialoghelper/dialoghelper.js'
    ],
    'responsehelper.js': [
        'modules/loading/loading.js',
        'modules/common/globalize.js'
    ],
    'premierecontainer.js': [
        'modules/registrationservices/registrationservices.js',
        'modules/common/servicelocator.js'
    ]
};

function sentinel(moduleId, isRelativeAlias) {
    const marker = {moduleId, isRelativeAlias: !!isRelativeAlias};
    function Default() {}
    Default.marker = marker;
    Default.prototype.marker = marker;
    Default.currentApiClient = function() {};
    Default.on = function() {};
    Default.off = function() {};
    Default.translate = function(value) { return value; };
    Default.getCurrentLocale = function() { return 'en'; };
    Default.renderForm = function() {};
    Default.close = function() {};
    Default.hide = function() {};
    Default.validateFeature = function() { return Promise.resolve(); };
    return {default: Default, marker};
}

function createRuntime() {
    const initialized = new Map();
    const factories = new Map();
    const cssSentinel = {moduleId: 'css!./plugin-ui.css'};
    const cssRequests = [];
    let currentSourceId = null;
    const customElements = {get() { return undefined; }, define() {}};
    class HTMLDivElement {}
    const context = {
        console,
        Promise,
        setTimeout,
        clearTimeout,
        HTMLDivElement,
        customElements,
        document: {
            createElement(name) {
                const listeners = new Map();
                if (name === 'link') return {
                    attributes: new Map(),
                    setAttribute(key, value) { this.attributes.set(key, value); },
                    getAttribute(key) { return this.attributes.get(key); },
                    testSentinel: cssSentinel,
                    onload: null
                };
                assert.equal(name, 'script');
                return {
                    addEventListener(name, callback) { listeners.set(name, callback); },
                    fire(name) { const listener = listeners.get(name); if (listener) listener(); }
                };
            },
            head: {
                appendChild(script) {
                    if (script.attributes && script.attributes.get('rel') === 'stylesheet') {
                        assert.strictEqual(script.testSentinel, cssSentinel);
                        cssRequests.push({href: script.getAttribute('href'), sentinel: script.testSentinel});
                        if (script.onload) script.onload();
                        return;
                    }
                    const match = /(?:^|\/)enhanced\/plugin-ui\/([^/?]+\.js)(?:\?.*)?$/.exec(script.src);
                    if (!match) throw new Error('Unexpected AMD script request: ' + script.src);
                    const filename = match[1];
                    const sourceId = '../enhanced/plugin-ui/' + filename;
                    currentSourceId = sourceId;
                    try {
                        vm.runInContext(fs.readFileSync(path.join(pluginRoot, filename), 'utf8'), context, {filename: sourceId});
                    } finally {
                        currentSourceId = null;
                    }
                    queueMicrotask(() => script.fire('load'));
                }
            }
        }
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(loaderPath, 'utf8'), context, {filename: loaderPath});

    const originalDefine = context.define;
    context.define = function() {
        const args = Array.from(arguments);
        const dependencyIndex = typeof args[0] === 'string' ? 1 : 0;
        const factoryIndex = dependencyIndex + 1;
        const deps = args[dependencyIndex];
        const factory = args[factoryIndex];
        const sourceId = currentSourceId;
        if (sourceId && Array.isArray(deps) && typeof factory === 'function') {
            args[factoryIndex] = function() {
                factories.set(sourceId, {ids: deps.slice(), values: Array.from(arguments)});
                return factory.apply(this, arguments);
            };
        }
        return originalDefine.apply(this, args);
    };
    context.define.amd = originalDefine.amd;
    context.require.config({baseUrl: './'});

    const canonical = new Map();
    const aliases = new Map();
    const allShared = new Set(Object.values(moduleContracts).flat());
    for (const moduleId of allShared) {
        const value = sentinel(moduleId, false);
        canonical.set(moduleId, value);
        context.define(moduleId, [], () => value);

        // The old relative imports normalize to ../www/modules/... from the
        // plugin module's AMD identity. Give those IDs distinct objects so the
        // test can expose identity splits through the real Alameda resolver.
        const relativeId = '../www/' + moduleId;
        const relativeValue = sentinel(moduleId, true);
        aliases.set(relativeId, relativeValue);
        context.define(relativeId, [], () => relativeValue);
    }

    return {context, canonical, aliases, factories, initialized, cssSentinel, cssRequests};
}

function requireModule(context, moduleId) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timed out resolving AMD module: ' + moduleId)), 2000);
        const request = context.require([moduleId], resolve);
        if (request && typeof request.catch === 'function') request.catch(reject);
        request.then(() => clearTimeout(timer), () => clearTimeout(timer));
    });
}

test('maintenance AMD modules resolve shared imports to the initialized canonical instances', async t => {
    for (const [filename, sharedIds] of Object.entries(moduleContracts)) {
        await t.test(filename, async () => {
            const runtime = createRuntime();
            const sourceId = '../enhanced/plugin-ui/' + filename;
            await requireModule(runtime.context, sourceId);
            const record = runtime.factories.get(sourceId);
            assert.ok(record, 'actual AMD factory should execute through Alameda');

            for (const moduleId of sharedIds) {
                const index = record.ids.indexOf(moduleId);
                assert.notEqual(index, -1, 'shared dependency should use its canonical AMD identity: ' + moduleId);
                assert.strictEqual(record.values[index], runtime.canonical.get(moduleId), 'wrong instance injected for ' + moduleId);
            }

            if (filename === 'genericui.js') {
                const ownSchemaIndex = record.ids.indexOf('./schema.js');
                const ownHelperIndex = record.ids.indexOf('./responsehelper.js');
                assert.notEqual(ownSchemaIndex, -1);
                assert.notEqual(ownHelperIndex, -1);
                assert.strictEqual(record.values[ownSchemaIndex], await requireModule(runtime.context, '../enhanced/plugin-ui/schema.js'));
                assert.strictEqual(record.values[ownHelperIndex], await requireModule(runtime.context, '../enhanced/plugin-ui/responsehelper.js'));
                const ownDisplayIndex = record.ids.indexOf('./display.js');
                assert.notEqual(ownDisplayIndex, -1);
                assert.strictEqual(record.values[ownDisplayIndex], await requireModule(runtime.context, '../enhanced/plugin-ui/display.js'));
                const cssIndex = record.ids.indexOf('css!./plugin-ui.css');
                assert.notEqual(cssIndex, -1);
                assert.equal(runtime.cssRequests.length, 1);
                assert.equal(path.posix.normalize(runtime.cssRequests[0].href), '../enhanced/plugin-ui/plugin-ui.css');
                assert.strictEqual(runtime.cssRequests[0].sentinel, runtime.cssSentinel);
            }
        });
    }
});
