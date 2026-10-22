'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const REPO_ROOT = path.resolve(__dirname, '../..');
const FROZEN_VIEW_MANAGER = path.join(
    REPO_ROOT,
    'vendor',
    'web-snapshot',
    'www',
    'modules',
    'viewmanager',
    'viewmanager.js'
);
const PATCH_MODULE = path.join(REPO_ROOT, 'tools', 'patch-plugin-settings.cjs');

class ClassList {
    constructor(element) {
        this.element = element;
    }

    add(...names) {
        for (const name of names) this.element.classes.add(name);
    }

    remove(...names) {
        for (const name of names) this.element.classes.delete(name);
    }

    contains(name) {
        return this.element.classes.has(name);
    }
}

class FakeElement {
    constructor(tagName = 'div', attributes = {}) {
        this.tagName = tagName.toUpperCase();
        this.attributes = new Map(Object.entries(attributes));
        this.classes = new Set((attributes.class || '').split(/\s+/).filter(Boolean));
        this.classList = new ClassList(this);
        this.children = [];
        this.parentNode = null;
        this.listeners = new Map();
        this.textContent = attributes['data-name'] || '';
        this._innerHTML = '';
    }

    get innerHTML() {
        return this._innerHTML;
    }

    set innerHTML(value) {
        this._innerHTML = String(value);
        this.children = [];
        const match = this._innerHTML.match(/<([a-z][\w-]*)\b([^>]*)>/i);
        if (!match) return;
        const attributes = {};
        for (const attr of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
            attributes[attr[1]] = attr[2] === undefined ? '' : attr[2];
        }
        const content = this._innerHTML.slice(match.index + match[0].length);
        const text = content.match(/^([^<]*)/);
        if (!attributes['data-name']) attributes['data-name'] = text ? text[1].trim() : '';
        const child = new FakeElement(match[1], attributes);
        this.appendChild(child);
        if (/<script\b/i.test(this._innerHTML)) child.appendChild(new FakeElement('script'));
    }

    getAttribute(name) {
        return this.attributes.has(name) ? this.attributes.get(name) : null;
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
        if (name === 'class') this.classes = new Set(String(value).split(/\s+/).filter(Boolean));
    }

    appendChild(child) {
        if (child.parentNode) child.parentNode.removeChild(child);
        child.parentNode = this;
        this.children.push(child);
        return child;
    }

    removeChild(child) {
        const index = this.children.indexOf(child);
        if (index >= 0) this.children.splice(index, 1);
        child.parentNode = null;
        return child;
    }

    replaceChild(next, previous) {
        const index = this.children.indexOf(previous);
        if (index < 0) throw new Error('replaceChild target is not a child');
        if (next.parentNode) next.parentNode.removeChild(next);
        previous.parentNode = null;
        next.parentNode = this;
        this.children[index] = next;
        return previous;
    }

    addEventListener(name, callback) {
        const callbacks = this.listeners.get(name) || [];
        callbacks.push(callback);
        this.listeners.set(name, callbacks);
    }

    dispatchEvent(event) {
        event.target = this;
        for (const callback of this.listeners.get(event.type) || []) callback.call(this, event);
        return true;
    }

    querySelector(selector) {
        const matches = element => {
            if (selector === 'script') return element.tagName === 'SCRIPT';
            if (selector.includes('.view') && element.classList.contains('view')) return true;
            if (selector.includes('data-role="page"') && element.getAttribute('data-role') === 'page') return true;
            if (selector === '.app-splash') return element.classList.contains('app-splash');
            if (selector === '.mainAnimatedPages') return element.classList.contains('mainAnimatedPages');
            return false;
        };
        const visit = parent => {
            for (const child of parent.children) {
                if (matches(child)) return child;
                const nested = visit(child);
                if (nested) return nested;
            }
            return null;
        };
        return visit(this);
    }

    closest() {
        return null;
    }
}

class FakeDocument {
    constructor() {
        this.body = new FakeElement('body');
        this.main = new FakeElement('main', {class: 'mainAnimatedPages'});
        this.splash = new FakeElement('div', {class: 'app-splash'});
        this.body.appendChild(this.main);
        this.body.appendChild(this.splash);
        this.activeElement = this.body;
        this.documentElement = new FakeElement('html');
    }

    createElement(tagName) {
        return new FakeElement(tagName);
    }

    querySelector(selector) {
        return this.body.querySelector(selector);
    }

    contains(element) {
        const visit = parent => parent === element || parent.children.some(visit);
        return visit(this.body);
    }
}

function deferred() {
    let resolve;
    let reject;
    let markStarted;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    const started = new Promise(resolveStarted => { markStarted = resolveStarted; });
    return {promise, resolve, reject, started, markStarted};
}

function makeDependencies() {
    return [
        {},
        {default: {android: false}},
        {default: {tv: false}},
        {default: {isCurrentlyFocusable: () => false, focus() {}, autoFocus() {}}},
        {default: {getConfigurationResourceUrl: value => value}},
        {default: {on() {}}},
        {default: {on() {}}},
        {default: {parse: () => ({})}}
    ];
}

function makeRuntime(options = {}) {
    if (!fs.existsSync(FROZEN_VIEW_MANAGER)) throw new Error(`Missing frozen viewmanager: ${FROZEN_VIEW_MANAGER}`);
    const document = new FakeDocument();
    const pending = new Map();
    const registry = new Map();
    const requireCalls = [];
    const jqueryStats = {appendCalls: 0, scriptAppendCalls: 0, hiddenOnAppend: []};
    const toastMessages = [];
    registry.set('toast', message => toastMessages.push(message));
    registry.set('jQuery', {});
    let manager;
    const waitFor = id => {
        const queue = pending.get(id) || [];
        const entry = queue.shift();
        if (queue.length) pending.set(id, queue);
        else pending.delete(id);
        return entry;
    };
    const fakeRequire = ids => {
        const requestIds = Array.isArray(ids) ? ids : [ids];
        requireCalls.push(requestIds.slice());
        for (const id of requestIds) {
            const entry = waitFor(id);
            if (entry) {
                entry.markStarted();
                return entry.promise.then(value => Array.isArray(value) ? value : [value]);
            }
        }
        return Promise.resolve(requestIds.map(id => registry.has(id) ? registry.get(id) : {}));
    };
    const define = (ids, factory) => {
        const values = makeDependencies();
        factory(...values);
        manager = values[0].default;
    };
    const dollar = element => ({
        appendTo(container) {
            jqueryStats.appendCalls++;
            jqueryStats.hiddenOnAppend.push(element.classList.contains('hide'));
            const hasScript = Boolean(element.querySelector('script'));
            if (hasScript) jqueryStats.scriptAppendCalls++;
            container.appendChild(element);
            return [element];
        }
    });
    const context = {
        define,
        require: fakeRequire,
        document,
        window: {$: dollar},
        navigator: {hardwareConcurrency: 4},
        CSS: {supports: () => true},
        screen: {width: 800, height: 600},
        CustomEvent: class CustomEvent {
            constructor(type, init = {}) {
                this.type = type;
                this.detail = init.detail;
                this.bubbles = init.bubbles;
                this.cancelable = init.cancelable;
            }
        },
        console: {log() {}, error() {}},
        setTimeout,
        clearTimeout,
        requestAnimationFrame: callback => callback()
    };
    let source = fs.readFileSync(FROZEN_VIEW_MANAGER, 'utf8');
    if (options.transform) source = options.transform(source);
    vm.runInNewContext(source, context, {filename: FROZEN_VIEW_MANAGER});

    return {
        manager,
        document,
        registerController(id, factory) {
            registry.set(id, factory);
        },
        deferNext(id) {
            const gate = deferred();
            const queue = pending.get(id) || [];
            queue.push(gate);
            pending.set(id, queue);
            return gate;
        },
        get requireCalls() {
            return requireCalls.map(ids => ids.slice());
        },
        jqueryStats,
        toastMessages,
        page(name, {dependencies = '', controller = '', classes = ''} = {}) {
            const classNames = ['view', ...classes.split(/\s+/).filter(Boolean)].join(' ');
            const attrs = [`class="${classNames}"`, `data-name="${name}"`];
            if (dependencies) attrs.push(`data-require="${dependencies}"`);
            if (controller) attrs.push(`data-controller="${controller}"`);
            return `<div ${attrs.join(' ')}>${name}</div>`;
        },
        visiblePages() {
            return document.main.children.filter(page => !page.classList.contains('hide'));
        },
        currentName() {
            const view = manager.currentView();
            return view && view.getAttribute('data-name');
        },
        currentInfo() {
            return manager.currentViewInfo();
        },
        findPage(name) {
            return document.main.children.find(page => page.getAttribute('data-name') === name) || null;
        }
    };
}

function loadPatchTransform() {
    const patcher = require(PATCH_MODULE);
    if (!patcher || typeof patcher.patchViewManager !== 'function') {
        throw new TypeError('tools/patch-plugin-settings.cjs must export patchViewManager(text)');
    }
    return patcher.patchViewManager;
}

module.exports = {
    FROZEN_VIEW_MANAGER,
    PATCH_MODULE,
    FakeDocument,
    FakeElement,
    makeRuntime,
    loadPatchTransform
};
