'use strict';

// Synthetic response and custom-element tests. These fixtures never contact a server.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const pluginDir = path.resolve(__dirname, '../src/electronapp/enhanced/plugin-ui');

function loadAmd(file, dependencies, globals = {}) {
    let module;
    const source = fs.readFileSync(path.join(pluginDir, file), 'utf8');
    const context = {define(ids, factory) {
        const exports = {};
        factory(exports, ...ids.slice(1).map(id => dependencies[id]));
        module = exports.default;
    }, Promise, console: globals.console || console, ...globals};
    vm.runInNewContext(source, context, {filename: file});
    return module;
}

function safeRejection(error, original, name, status) {
    assert.notEqual(error, original);
    assert.equal(Object.prototype.toString.call(error), '[object Error]');
    assert.equal(error.name, name);
    assert.equal(error.stack, error.name + ': ' + error.message);
    if (status !== undefined) assert.equal(error.status, status);
    const values = Object.getOwnPropertyNames(error).map(key => [key, error[key]]);
    const serialized = JSON.stringify(values);
    for (const secret of ['synthetic-token', 'private.invalid', 'private server payload', 'Authorization', 'synthetic abort detail']) assert.equal(serialized.includes(secret), false);
    for (const key of ['cause', 'url', 'headers', 'responseText', 'response', 'payload']) assert.equal(Object.hasOwn(error, key), false);
    assert.ok(Object.getOwnPropertyNames(error).every(key => ['stack', 'message', 'name', 'code', 'status'].includes(key)));
    return true;
}

test('response helper rejection and alert are static safe errors; AbortError stays silent', async () => {
    const alerts = [], logs = [];
    const response = {status: 403, url: 'https://private.invalid/path?api_key=synthetic-token',
        headers: {Authorization: 'Bearer synthetic-token'}, responseText: 'private server payload'};
    const loading = {default: {hideCalls: 0, hide() { this.hideCalls++; }}};
    const globalize = {default: {translate: key => key}};
    const helper = loadAmd('responsehelper.js', {
        '../../www/modules/loading/loading.js': loading,
        '../../www/modules/common/globalize.js': globalize
    }, {
        require(ids) { return Promise.resolve(ids.map(id => id === 'alert' ? options => { alerts.push(options); return Promise.resolve(); } : {})); },
        console: {log(...args) { logs.push(args); }, error(...args) { logs.push(args); }, warn(...args) { logs.push(args); }}
    });
    const info = await helper.getErrorInfo(response);
    assert.deepEqual(JSON.parse(JSON.stringify(info)), {title: 'Error', text: 'Plugin request denied.'});
    await assert.rejects(helper.handleErrorResponse(response), error => {
        assert.equal(error.message, 'Plugin request denied.');
        assert.equal(error.code, 'plugin-request-failed');
        return safeRejection(error, response, 'PluginRequestError', 403);
    });
    assert.equal(alerts.length, 1);
    const displayed = JSON.stringify(alerts[0]);
    for (const secret of ['synthetic-token', 'private.invalid', 'private server payload', 'Authorization']) assert.equal(displayed.includes(secret), false);
    assert.equal(logs.length, 0);
    const abort = Object.assign(new Error('synthetic abort detail'), {name: 'AbortError', ...response});
    await assert.rejects(helper.handleErrorResponse(abort), error => {
        assert.equal(error.message, 'Plugin request cancelled.');
        assert.equal(error.code, 'plugin-request-cancelled');
        return safeRejection(error, abort, 'AbortError', 403);
    });
    assert.equal(alerts.length, 1, 'AbortError must not open an alert');
    assert.equal(loading.default.hideCalls, 2);
});

for (const failurePhase of ['require-reject', 'require-throw', 'alert-reject']) {
    test('response helper sanitizes downstream ' + failurePhase + ' rejection', async () => {
        const raw = {status: 404, url: 'https://private.invalid', headers: {Authorization: 'synthetic-token'}, responseText: 'private server payload'};
        const helper = loadAmd('responsehelper.js', {
            '../../www/modules/loading/loading.js': {default: {hide() {}}},
            '../../www/modules/common/globalize.js': {default: {translate: key => key}}
        }, {require() {
            if (failurePhase === 'require-throw') throw raw;
            if (failurePhase === 'require-reject') return Promise.reject(raw);
            return Promise.resolve([() => Promise.reject(raw)]);
        }});
        await assert.rejects(helper.handleErrorResponse(raw), error => {
            assert.equal(error.message, 'Plugin resource is unavailable.');
            return safeRejection(error, raw, 'PluginRequestError', 404);
        });
    });
}

class FakeDiv {
    constructor() { this.style = {}; this.attributes = new Map(); this.isConnected = true; }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
}

function premiereHarness(validateFeature, isUnlockedByDefault) {
    const registrations = new Map(), calls = [];
    const customElements = {get(name) { return registrations.get(name); }, define(name, constructor, options) { registrations.set(name, constructor); calls.push({name, constructor, options}); }};
    const Premiere = loadAmd('premierecontainer.js', {
        '../../www/modules/registrationservices/registrationservices.js': {default: {validateFeature(...args) { calls.push({validateArgs: args}); return validateFeature(...args); }}},
        '../../www/modules/common/servicelocator.js': {iapManager: {isUnlockedByDefault(feature) { calls.push({unlockFeature: feature}); return isUnlockedByDefault(feature); }}}
    }, {HTMLDivElement: FakeDiv, customElements});
    return {Premiere, customElements, calls};
}

test('premiere compatibility element uses the existing subscription checks before showing content', async () => {
    const harness = premiereHarness(() => Promise.reject(new Error('feature is not directly entitled')), feature => Promise.resolve(feature === 'synthetic-premium'));
    const element = new harness.Premiere(); element.setAttribute('data-showifunlocked', 'synthetic-premium');
    element.connectedCallback();
    assert.equal(element.style.display, 'none');
    for (let i = 0; i < 10; i++) await Promise.resolve();
    assert.equal(element.style.display, '');
    const validation = harness.calls.find(item => item.validateArgs);
    assert.equal(validation.validateArgs[0], 'dvr');
    assert.deepEqual(JSON.parse(JSON.stringify(validation.validateArgs[1])), {showDialog: false, viewOnly: true});
    assert.deepEqual(harness.calls.find(item => item.unlockFeature).unlockFeature, 'synthetic-premium');
    assert.equal(harness.customElements.get('emby-premierecontainer'), harness.Premiere);
    assert.equal(harness.calls.find(item => item.name).options.extends, 'div');
});

test('detached premiere element ignores a late subscription result', async () => {
    let resolveUnlock;
    const unlock = new Promise(resolve => { resolveUnlock = resolve; });
    const harness = premiereHarness(() => Promise.reject(new Error('feature is not directly entitled')), () => unlock);
    const element = new harness.Premiere(); element.setAttribute('data-showifunlocked', 'synthetic-premium');
    element.connectedCallback();
    assert.equal(element.style.display, 'none');
    element.isConnected = false;
    element.disconnectedCallback();
    resolveUnlock();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    assert.equal(element.style.display, 'none');
});
