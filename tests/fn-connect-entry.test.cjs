'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {patchManualServer} = require('../tools/patch-fn-connect.cjs');
const {patchConnectionManager} = require('../tools/patch-connectionmanager-transport.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {resolve, promise}; };
test('fixed manual-server overlay preserves ordinary submit and owns its added cleanup', () => {
    const base = fs.readFileSync('vendor/web-snapshot/www/startup/manualserver.js', 'utf8'), output = patchManualServer(base);
    assert.throws(() => patchManualServer(base + ' '), /fixed input mismatch/);
    let View, installed = 0, disposed = 0, destroyed = 0, submits = 0;
    function Base(view) { this.view = view; }
    Base.prototype.destroy = function () { destroyed++; };
    const form = {addEventListener(event) { if (event === 'submit') submits++; }};
    const view = {querySelector: () => form};
    vm.runInNewContext(output, {require() {}, define(names, factory) {
        const exported = {}, modules = names.map(name => name === 'exports' ? exported : name.includes('baseview') ? {default: Base} :
            name.includes('fn-connect/manual-server') ? {install(actual) { assert.equal(actual, view); installed++; return () => disposed++; }} : {default: {}});
        factory(...modules); View = exported.default;
    }});
    const instance = new View(view); assert.equal(installed, 1); assert.equal(submits, 1);
    instance.destroy(); assert.equal(disposed, 1); assert.equal(destroyed, 1);
});
test('actual CM callback cannot switch the current user before main acknowledges old capability retirement', async () => {
    const output = patchConnectionManager(fs.readFileSync('vendor/web-snapshot/www/modules/emby-apiclient/connectionmanager.js', 'utf8'));
    const a = output.indexOf('  function onLocalUserSignIn('), b = output.indexOf('  function afterConnectValidated(', a);
    const gate = deferred(), calls = [];
    const context = {window: {__eteFnTransport: {beforeIdentityChange(value) { calls.push(['retiring', value]); return gate.promise; }}},
        _events: {default: {trigger() { calls.push(['event']); }}}};
    vm.runInNewContext(output.slice(a, b), context);
    const instance = {_getOrAddApiClient() { calls.push(['client']); }, onLocalUserSignedIn() { calls.push(['current-user-changed']); return Promise.resolve(); }};
    const pending = context.onLocalUserSignIn(instance, {Id: 's', UserId: 'b', AccessToken: 'synthetic-b'}, 'https://media.example.test/');
    await tick(); assert.deepEqual(calls.map(v => v[0]), ['retiring']); gate.resolve(); await pending;
    assert.deepEqual(calls.map(v => v[0]), ['retiring', 'client', 'current-user-changed', 'event']);
});
function widget({available = true, openGate} = {}) {
    class Node {
        constructor(type) { this.tagName = type; this.children = []; this.listeners = new Map(); this.value = ''; this.textContent = ''; }
        appendChild(node) { this.children.push(node); node.parent = this; }
        insertBefore(node) { this.children.unshift(node); node.parent = this; }
        remove() { this.parent.children = this.parent.children.filter(node => node !== this); }
        setAttribute() {}
        addEventListener(type, fn) { this.listeners.set(type, fn); }
        removeEventListener(type) { this.listeners.delete(type); }
    }
    const form = new Node('form'), submit = new Node('button'), host = new Node('input'), port = new Node('input'), calls = [];
    submit.textContent = 'Connect'; host.value = 'https://media.example.test/'; port.value = '8096';
    form.querySelector = () => submit;
    const view = {querySelector(selector) { return selector === 'form' ? form : selector === '.txtServerHost' ? host : port; }};
    let module;
    vm.runInNewContext(fs.readFileSync('src/electronapp/enhanced/fn-connect/manual-server.js', 'utf8'), {URL, AbortController,
        document: {createElement: type => new Node(type)}, define(_names, factory) { module = factory({
            available: async () => available, onNotice: () => () => {}, async open(config) { calls.push(['open', config]); if (openGate) await openGate.promise; return {id: 'profile'}; },
            async verify() { calls.push(['verify']); }, async route() { calls.push(['route']); }, async remove(id) { calls.push(['remove', id]); }
        }); }});
    const dispose = module.install(view, {loading: {show() {}, hide() {}}, connection: {async connectToAddress(address, options) {
        calls.push(['normal-connection', address, options]); return {State: 'ServerSignIn'};
    }}, router: {async handleConnectionResult() { calls.push(['normal-router']); }}});
    function inputs() { const result = []; const visit = node => { if (node.tagName === 'input') result.push(node); node.children.forEach(visit); }; form.children.forEach(visit); return result; }
    async function enable() { await tick(); const nodes = inputs(); nodes[0].checked = true; nodes[0].listeners.get('change')(); nodes[1].value = 'https://nas.example.test/'; return nodes; }
    const submitFn = async () => form.listeners.get('submit')({preventDefault() {}, stopImmediatePropagation() {}});
    return {calls, form, submit, dispose, enable, submitFn};
}
test('ordinary application never receives experimental fields or an extra submit handler', async () => {
    const f = widget({available: false}); await tick(); assert.equal(f.form.children.length, 0); assert.equal(f.form.listeners.size, 0); f.dispose();
});
test('FN uses official auth first, then the original Emby connection and login router; external body consent is separate', async () => {
    const f = widget(), nodes = await f.enable(); nodes[3].value = 'https://external.example.test/';
    await f.submitFn(); assert.deepEqual(f.calls.map(v => v[0]), ['open']);
    assert.deepEqual(Array.from(f.calls[0][1].externalMediaOrigins), []);
    await f.submitFn(); assert.deepEqual(f.calls.map(v => v[0]), ['open', 'verify', 'route', 'normal-connection', 'normal-router']);
    assert.equal(f.calls[3][1], 'https://media.example.test/'); assert.equal(f.calls[3][2].enableAutoLogin, false);
    f.dispose(); assert.equal(f.calls.filter(v => v[0] === 'remove').length, 0);
});
test('unchecking FN while the auth window is opening retires its late handle and never connects Emby', async () => {
    const gate = deferred(), f = widget({openGate: gate}), nodes = await f.enable();
    const pending = f.submitFn(); nodes[0].checked = false; nodes[0].listeners.get('change')(); gate.resolve(); await pending;
    assert.deepEqual(f.calls.map(v => v[0]), ['open', 'remove']); f.dispose();
});
