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
function widget({available = true, openGate, openError, openNotice, verifyError, removeGate, removeError} = {}) {
    class Node {
        constructor(type) { this.tagName = type; this.children = []; this.listeners = new Map(); this.value = ''; this.textContent = ''; }
        appendChild(node) { this.children.push(node); node.parent = this; }
        insertBefore(node) { this.children.unshift(node); node.parent = this; }
        remove() { this.parent.children = this.parent.children.filter(node => node !== this); }
        setAttribute(name, value) {if (name === 'role') this.attributesRole = value;}
        addEventListener(type, fn) { this.listeners.set(type, fn); }
        removeEventListener(type) { this.listeners.delete(type); }
    }
    const form = new Node('form'), submit = new Node('button'), host = new Node('input'), port = new Node('input'), calls = [];
    submit.textContent = 'Connect'; host.value = 'https://media.example.test/'; port.value = '8096';
    form.querySelector = () => submit;
    const view = {querySelector(selector) { return selector === 'form' ? form : selector === '.txtServerHost' ? host : port; }};
    let module, onNotice;
    vm.runInNewContext(fs.readFileSync('src/electronapp/enhanced/fn-connect/manual-server.js', 'utf8'), {URL, AbortController,
        document: {createElement: type => new Node(type)}, define(_names, factory) { module = factory({
            available: async () => available, onNotice: callback => {onNotice = callback; return () => {};}, async open(config) { calls.push(['open', config]); const id = String(calls.filter(v => v[0] === 'open').length).repeat(36); if (openNotice) onNotice({profileId: id, ...openNotice}); if (openGate) await (typeof openGate === 'function' ? openGate(calls.filter(v => v[0] === 'open').length) : openGate.promise); if (openError) {openError.profileId = id; throw openError;} return {id}; },
            async verify() { calls.push(['verify']); if (verifyError) {if (typeof verifyError === 'function') await verifyError(); else throw verifyError;} }, async route() { calls.push(['route']); }, async remove(id) { calls.push(['remove', id]); if (removeGate) await removeGate.promise; if (removeError) throw removeError; }
        }); }});
    const dispose = module.install(view, {loading: {show() {}, hide() {}}, connection: {async connectToAddress(address, options) {
        calls.push(['normal-connection', address, options]); return {State: 'ServerSignIn'};
    }}, router: {async handleConnectionResult() { calls.push(['normal-router']); }}});
    function inputs() { const result = []; const visit = node => { if (node.tagName === 'input') result.push(node); node.children.forEach(visit); }; form.children.forEach(visit); return result; }
    async function enable() { await tick(); const nodes = inputs(); nodes[0].checked = true; nodes[0].listeners.get('change')(); nodes[1].value = 'https://nas.example.test/'; return nodes; }
    const submitFn = async () => form.listeners.get('submit')({preventDefault() {}, stopImmediatePropagation() {}});
    return {calls, form, submit, dispose, enable, submitFn, notify: value => onNotice(value), status: () => form.children[0].children.find(v => v.attributesRole === 'status')};
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

for (const code of ['PROFILE_CLOSED', 'FN_PROFILE_UNKNOWN']) test('an explicit reconnect recreates a cancelled auth profile exactly once: ' + code, async () => {
    const f = widget({verifyError: new Error(code)}); await f.enable(); await f.submitFn();
    await f.submitFn();
    assert.deepEqual(f.calls.map(v => v[0]), ['open', 'verify', 'remove', 'open']);
    assert.equal(f.submit.disabled, false); assert.equal(f.submit.textContent, '已完成飞牛认证，继续');
    assert.deepEqual(f.calls[0][1], f.calls[3][1]);
    f.dispose();
});
for (const code of ['NETWORK_TIMEOUT', 'ACCESS_DENIED_UNCLASSIFIED', 'FN_AUTH_REQUIRED']) test('auth and network failures never create an automatic retry: ' + code, async () => {
    const f = widget({verifyError: new Error(code)}); await f.enable(); await f.submitFn(); await f.submitFn();
    assert.deepEqual(f.calls.map(v => v[0]), ['open', 'verify']); assert.equal(f.submit.disabled, false); f.dispose();
});
test('an origin review notice survives open cancellation and leaves an enabled reconnect button', async () => {
    const f = widget({openNotice: {code: 'LOGIN_REDIRECT_REQUIRES_REVIEW', origin: 'https://unapproved.example.test'}, openError: new Error('CANCELLED')});
    const nodes = await f.enable(); await f.submitFn();
    assert.match(f.status().textContent, /https:\/\/unapproved\.example\.test/); assert.equal(f.submit.textContent, '重新连接');
    assert.equal(f.submit.disabled, false); assert.equal(nodes[2].value, ''); assert.equal(f.calls.length, 1); f.dispose();
});
test('load failure details use the safe enum instead of the generic unfinished-page message', async () => {
    const f = widget({openNotice: {code: 'LOGIN_PAGE_LOAD_FAILED', errorCode: 'ERR_CONNECTION_RESET'}, openError: new Error('CANCELLED')});
    await f.enable(); await f.submitFn(); assert.match(f.status().textContent, /入口加载失败（ERR_CONNECTION_RESET）/); f.dispose();
});

test('failure before open resolves is not overwritten by the default authentication prompt', async () => {
    const gate = deferred(), f = widget({openGate: gate}); await f.enable();
    const pending = f.submitFn();
    f.notify({profileId: '1'.repeat(36), code: 'LOGIN_REDIRECT_REQUIRES_REVIEW', origin: 'https://unapproved.example.test'});
    gate.resolve(); await pending;
    assert.match(f.status().textContent, /认证跳转未放行/); assert.equal(f.submit.textContent, '重新连接'); f.dispose();
});
test('old notices during and after a new same-config Session cannot overwrite the new prompt', async () => {
    const gate = deferred(), f = widget({verifyError: new Error('PROFILE_CLOSED'), openGate: count => count === 2 ? gate.promise : Promise.resolve()});
    await f.enable(); await f.submitFn();
    f.notify({profileId: '1'.repeat(36), code: 'LOGIN_PAGE_LOAD_FAILED', errorCode: 'ERR_FAILED'});
    const pending = f.submitFn();
    await tick(); f.notify({profileId: '1'.repeat(36), code: 'LOGIN_REDIRECT_REQUIRES_REVIEW', origin: 'https://old.example.test'});
    gate.resolve(); await pending;
    const current = f.status().textContent;
    assert.match(current, /请在独立窗口完成/);
    f.notify({profileId: '1'.repeat(36), code: 'LOGIN_PAGE_LOAD_FAILED', errorCode: 'ERR_FAILED'});
    assert.equal(f.status().textContent, current); assert.equal(f.submit.textContent, '已完成飞牛认证，继续'); f.dispose();
});
test('editing reviewed origins creates a new profile only on explicit submit, without verifying the old one', async () => {
    const f = widget(), nodes = await f.enable(); await f.submitFn();
    f.notify({profileId: '1'.repeat(36), code: 'LOGIN_REDIRECT_REQUIRES_REVIEW', origin: 'https://review.example.test'});
    assert.equal(nodes[2].value, ''); assert.equal(f.calls.length, 1);
    nodes[2].value = 'https://review.example.test'; await f.submitFn();
    assert.deepEqual(f.calls.map(v => v[0]), ['open', 'remove', 'open']);
    assert.deepEqual(Array.from(f.calls[2][1].authOrigins), ['https://review.example.test']);
    f.notify({profileId: '1'.repeat(36), code: 'LOGIN_PAGE_LOAD_FAILED'});
    assert.equal(f.submit.textContent, '已完成飞牛认证，继续'); f.dispose();
});
test('unchecking FN while a closed-profile verification settles never opens a replacement window', async () => {
    const gate = deferred(), f = widget({verifyError: () => gate.promise.then(() => {throw new Error('PROFILE_CLOSED');})});
    const nodes = await f.enable(); await f.submitFn(); const pending = f.submitFn();
    nodes[0].checked = false; nodes[0].listeners.get('change')(); gate.resolve(); await pending;
    assert.deepEqual(f.calls.map(v => v[0]), ['open', 'verify', 'remove']); f.dispose();
});
test('blocked Emby navigation preserves the authenticated profile and continues verification on explicit submit', async () => {
    const f = widget({openNotice: {code: 'LOGIN_TARGET_REQUIRES_EMBY_CLIENT', origin: 'https://media.example.test'}});
    await f.enable(); await f.submitFn();
    assert.match(f.status().textContent, /继续验证飞牛授权/);
    assert.equal(f.submit.textContent, '已完成飞牛认证，继续');
    await f.submitFn();
    assert.deepEqual(f.calls.map(v => v[0]), ['open', 'verify', 'route', 'normal-connection', 'normal-router']); f.dispose();
});
test('failed navigation creates a new Session only on an explicit retry with unchanged configuration', async () => {
    const f = widget(); await f.enable(); await f.submitFn();
    f.notify({profileId: '1'.repeat(36), code: 'LOGIN_PAGE_LOAD_FAILED', errorCode: 'ERR_FAILED'});
    assert.deepEqual(f.calls.map(v => v[0]), ['open']);
    await f.submitFn();
    assert.deepEqual(f.calls.map(v => v[0]), ['open', 'remove', 'open']); f.dispose();
});
for (const failure of [false, true]) test('retired form verification cannot route or overwrite a new form state: ' + failure, async () => {
    const gate = deferred(), f = widget({verifyError: async () => {await gate.promise; if (failure) throw new Error('NETWORK_TIMEOUT');}});
    const nodes = await f.enable(); await f.submitFn(); const pending = f.submitFn();
    nodes[0].checked = false; nodes[0].listeners.get('change')();
    const status = f.status().textContent; gate.resolve(); await pending;
    assert.deepEqual(f.calls.map(v => v[0]), ['open', 'verify', 'remove']); assert.equal(f.status().textContent, status); f.dispose();
});
test('field help distinguishes a full bootstrap URL, exact extra origin and separate media consent', async () => {
    const f = widget(), nodes = await f.enable();
    assert.match(nodes[1].parent.textContent, /原完整入口，可含路径/);
    assert.match(nodes[2].parent.textContent, /精确 HTTPS 地址，不含路径/);
    assert.match(nodes[3].parent.textContent, /仅媒体正文用途/);
    assert.equal(nodes[2].value, ''); assert.equal(nodes[3].value, ''); f.dispose();
});
for (const fail of [false, true]) test('manual retry waits for old profile retirement and cannot proceed after unconfirmed cleanup: ' + fail, async () => {
    const gate = deferred(), f = widget({removeGate: gate, removeError: fail ? new Error('SESSION_CLEAR_FAILED') : null});
    await f.enable(); await f.submitFn();
    f.notify({profileId: '1'.repeat(36), code: 'LOGIN_PAGE_LOAD_FAILED', errorCode: 'ERR_FAILED'});
    const pending = f.submitFn(); await tick();
    assert.deepEqual(f.calls.map(v => v[0]), ['open', 'remove']); assert.equal(f.submit.disabled, true);
    gate.resolve(); await pending;
    assert.deepEqual(f.calls.map(v => v[0]), fail ? ['open', 'remove'] : ['open', 'remove', 'open']);
    if (fail) {assert.match(f.status().textContent, /未确认收尾/); await f.submitFn(); assert.equal(f.calls.length, 2);}
    f.dispose();
});
for (const fail of [false, true]) test('late open cleanup joins the same retirement barrier before a subsequent explicit restart: ' + fail, async () => {
    const gate = deferred(), f = widget({openGate: gate, removeError: fail ? new Error('SESSION_CLEAR_FAILED') : null});
    const nodes = await f.enable(); const pending = f.submitFn();
    nodes[0].checked = false; nodes[0].listeners.get('change')(); gate.resolve(); await pending;
    assert.deepEqual(f.calls.map(v => v[0]), ['open', 'remove']);
    nodes[0].checked = true; nodes[0].listeners.get('change')(); await f.submitFn();
    assert.deepEqual(f.calls.map(v => v[0]), fail ? ['open', 'remove'] : ['open', 'remove', 'open']);
    if (fail) {assert.match(f.status().textContent, /未确认收尾/); await f.submitFn(); assert.equal(f.calls.length, 2);}
    f.dispose();
});
