'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const patch = require('../tools/patch-plugin-settings.cjs');

const root = path.resolve(__dirname, '..');
const modulePath = path.join(root, 'src/electronapp/enhanced/plugin-ui/dialogclosebutton.js');
const moduleSource = fs.readFileSync(modulePath, 'utf8');

class FakeClassList {
    constructor(...initial) { this.values = new Set(initial); }
    add(...values) { values.forEach(value => this.values.add(value)); }
    remove(...values) { values.forEach(value => this.values.delete(value)); }
    contains(value) { return this.values.has(value); }
}

class FakeEventTarget {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, listener, options = {}) {
        const list = this.listeners.get(type) || [];
        list.push({listener, once: !!options.once});
        this.listeners.set(type, list);
    }
    removeEventListener(type, listener) {
        const list = (this.listeners.get(type) || []).filter(entry => entry.listener !== listener);
        this.listeners.set(type, list);
    }
    listenerCount(type) { return (this.listeners.get(type) || []).length; }
    dispatchEvent(event) {
        event.target = event.target || this;
        event.defaultPrevented = false;
        event.propagationStopped = false;
        event.preventDefault = function() { this.defaultPrevented = true; };
        event.stopPropagation = function() { this.propagationStopped = true; };
        const list = [...(this.listeners.get(event.type) || [])];
        for (const entry of list) {
            entry.listener.call(this, event);
            if (entry.once) this.removeEventListener(event.type, entry.listener);
        }
        return !event.defaultPrevented;
    }
}

class FakeButton extends FakeEventTarget {
    constructor() {
        super();
        this.type = 'submit';
        this.attributes = new Map();
        this.classList = new FakeClassList();
        this.textContent = '';
        this.ownerDocument = {defaultView: {}};
        this.isConnected = false;
        this.form = null;
        this.ownerDialog = null;
    }
    setAttribute(name, value) {
        this.attributes.set(name, String(value));
        if (name === 'type') this.type = String(value);
    }
    hasAttribute(name) { return this.attributes.has(name); }
    closest(selector) { return selector === '.dialog' ? this.ownerDialog : null; }
    click() {
        const event = {type: 'click'};
        this.dispatchEvent(event);
        if (!event.defaultPrevented && this.type === 'submit' && this.form) this.form.submit();
        return event;
    }
}

class FakeDialog extends FakeEventTarget {
    constructor(document) {
        super();
        this.ownerDocument = document;
        this.isConnected = true;
        this.classList = new FakeClassList('dialog');
    }
}

function loadCloseButton(existing = null) {
    const registry = new Map();
    if (existing) registry.set('emby-dialogclosebutton', existing);
    let defineCalls = 0;
    const customElements = {
        get(name) { return registry.get(name); },
        define(name, constructor, options) {
            defineCalls++;
            if (registry.has(name)) throw new Error('custom element already defined');
            registry.set(name, {constructor, options});
        }
    };
    const closeCalls = [];
    const dialogHelper = {default: {close(dialog) {
        closeCalls.push(dialog);
        dialog.classList.add('hide');
        dialog.dispatchEvent({type: 'close'});
    }}};
    const globalize = {default: {translate: key => key === 'ButtonClose' ? 'Close' : key}};
    const exports = {};
    const context = {
        customElements,
        HTMLButtonElement: FakeButton,
        WeakSet,
        define(dependencies, factory) {
            assert.deepEqual(Array.from(dependencies), ['exports', 'modules/dialoghelper/dialoghelper.js', 'modules/common/globalize.js']);
            factory(exports, dialogHelper, globalize);
        }
    };
    vm.runInNewContext(moduleSource, context, {filename: modulePath});
    return {Button: exports.default && (exports.default.constructor || exports.default), exported: exports.default,
        registry, defineCalls, closeCalls, dialogHelper, globalize};
}

function buttonRuntime() {
    const runtime = loadCloseButton();
    const Button = runtime.registry.get('emby-dialogclosebutton').constructor;
    return {runtime, button: new Button()};
}

test('owner close button closes only its live dialog exactly once and never submits', () => {
    const {runtime, button} = buttonRuntime();
    const document = button.ownerDocument;
    const owner = new FakeDialog(document);
    const other = new FakeDialog(document);
    let submits = 0;
    button.form = {submit() { submits++; }};
    button.ownerDialog = owner;
    button.isConnected = true;
    button.connectedCallback();

    const event = button.click();
    button.click();

    assert.equal(button.type, 'button');
    assert.equal(button.getAttribute?.('type') || button.attributes.get('type'), 'button');
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.propagationStopped, true);
    assert.deepEqual(runtime.closeCalls, [owner]);
    assert.equal(owner.classList.contains('hide'), true);
    assert.equal(other.classList.contains('hide'), false);
    assert.equal(submits, 0);
});

test('button without a live owner dialog does nothing', () => {
    const {runtime, button} = buttonRuntime();
    button.isConnected = true;
    button.ownerDialog = null;
    button.connectedCallback();
    const event = button.click();
    assert.equal(runtime.closeCalls.length, 0);
    assert.equal(event.defaultPrevented, false);
    assert.equal(button.type, 'button');
});

test('disconnected, hidden, or cross-document owner is never closed', () => {
    const cases = [
        {connected: false, hidden: false, sameDocument: true},
        {connected: true, hidden: true, sameDocument: true},
        {connected: true, hidden: false, sameDocument: false}
    ];
    for (const item of cases) {
        const {runtime, button} = buttonRuntime();
        const owner = new FakeDialog(item.sameDocument ? button.ownerDocument : {defaultView: {}});
        owner.isConnected = item.connected;
        if (item.hidden) owner.classList.add('hide');
        button.ownerDialog = owner;
        button.isConnected = true;
        button.connectedCallback();
        button.click();
        assert.equal(runtime.closeCalls.length, 0);
    }
});

test('repeated connect does not duplicate listeners and disconnect removes them', () => {
    const {runtime, button} = buttonRuntime();
    const owner = new FakeDialog(button.ownerDocument);
    button.ownerDialog = owner;
    button.isConnected = true;
    button.connectedCallback();
    button.connectedCallback();
    assert.equal(button.listenerCount('click'), 1);
    button.disconnectedCallback();
    assert.equal(button.listenerCount('click'), 0);
    button.isConnected = false;
    button.click();
    assert.equal(runtime.closeCalls.length, 0);
    button.isConnected = true;
    button.connectedCallback();
    assert.equal(button.listenerCount('click'), 1);
    button.click();
    assert.equal(runtime.closeCalls.length, 1);
});

test('existing element registration is preserved', () => {
    class ExistingCloseButton {}
    const runtime = loadCloseButton(ExistingCloseButton);
    assert.equal(runtime.exported, ExistingCloseButton);
    assert.equal(runtime.defineCalls, 0);
});

test('actual generated app and view-manager patches install alias before plugin template parsing', () => {
    const app = fs.readFileSync(path.join(root, 'vendor/carnival/electronapp/www/app.js'), 'utf8');
    const viewManager = fs.readFileSync(path.join(root, 'vendor/carnival/electronapp/www/modules/viewmanager/viewmanager.js'), 'utf8');
    const patchedApp = patch.patchApp(app);
    const patchedViewManager = patch.patchViewManager(viewManager);
    assert.match(patchedApp, /define\("emby-dialogclosebutton", \[\], getDynamicImport\("\.\/\.\.\/enhanced\/plugin-ui\/dialogclosebutton\.js"\)\)/);
    const loaderStart = patchedViewManager.indexOf('function eteLoad');
    const dependency = patchedViewManager.indexOf("require(['emby-dialogclosebutton'])", loaderStart);
    const prepareCall = patchedViewManager.indexOf('return etePrepareNewPage();', dependency);
    const parseFunction = patchedViewManager.indexOf('function etePrepareNewPage()', loaderStart);
    const parseCall = patchedViewManager.indexOf('normalizeNewView(options, options.isPluginPage)', parseFunction);
    assert.ok(loaderStart >= 0 && dependency > loaderStart);
    assert.ok(parseFunction > loaderStart && parseCall > parseFunction);
    assert.ok(prepareCall > dependency);
});
