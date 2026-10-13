'use strict';

// Synthetic adapter tests. No Emby server, frozen vendor tree, or real network is used.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const pluginDir = path.join(root, 'src/electronapp/enhanced/plugin-ui');

class Element {
    constructor(tag = 'div') {
        this.tagName = tag.toUpperCase();
        this.attributes = new Map();
        this.children = [];
        this.parentNode = null;
        this.listeners = new Map();
        this.className = '';
        this.textContent = '';
        this.hidden = false;
        this.disabled = false;
        this.valid = true;
        this.style = {};
        this.type = '';
        this.classes = new Set();
        this.classList = {add: name => { this.classes.add(name); this.className = [...this.classes].join(' '); }, contains: name => this.classes.has(name)};
        this._innerHTML = '';
    }
    get innerHTML() { return this._innerHTML; }
    set innerHTML(value) { this._innerHTML = String(value); parseMarkup(this._innerHTML, this); }
    appendChild(child) { if (child.parentNode) child.parentNode.removeChild(child); child.parentNode = this; this.children.push(child); return child; }
    removeChild(child) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1); child.parentNode = null; return child; }
    replaceChild(next, old) { const i = this.children.indexOf(old); if (i < 0) throw new Error('replace target missing'); if (next.parentNode) next.parentNode.removeChild(next); next.parentNode = this; old.parentNode = null; this.children[i] = next; return old; }
    replaceChildren(...children) { for (const child of this.children) child.parentNode = null; this.children = []; for (const child of children) this.appendChild(child); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); if (name === 'class') this.className = String(value); }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    removeAttribute(name) { this.attributes.delete(name); }
    addEventListener(name, fn, options = {}) { const list = this.listeners.get(name) || []; list.push({fn, once: !!(options && options.once)}); this.listeners.set(name, list); }
    removeEventListener(name, fn) { this.listeners.set(name, (this.listeners.get(name) || []).filter(item => item.fn !== fn)); }
    listenerCount(name) { return (this.listeners.get(name) || []).length; }
    dispatch(name, event = {}) { event.type = name; event.target = event.target || this; for (const entry of [...(this.listeners.get(name) || [])]) { entry.fn.call(this, event); if (entry.once) this.removeEventListener(name, entry.fn); } }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    closest(selector) { if (selector === '[data-data1]' && this.getAttribute('data-data1')) return this; return null; }
    querySelector(selector) {
        if (selector.startsWith('#')) return this.find(node => node.getAttribute('id') === selector.slice(1).replace(/\\\./g, '.'));
        if (selector.startsWith('.')) return this.find(node => (` ${node.className} `).includes(` ${selector.slice(1)} `));
        if (selector === 'form') return this.find(node => node.tagName === 'FORM');
        return null;
    }
    find(predicate) { for (const child of this.children) { if (predicate(child)) return child; const nested = child.find(predicate); if (nested) return nested; } return null; }
    querySelectorAll(selector) {
        var found = [];
        function walk(element) {
            for (const child of element.children) {
                if (selector === 'select[multiple]' && child.tagName === 'SELECT' && child.getAttribute('multiple') !== null) found.push(child);
                walk(child);
            }
        }
        walk(this);
        return found;
    }
    reportValidity() { return this.valid; }
    set href(value) { this.setAttribute('href', value); }
    get href() { return this.getAttribute('href'); }
}

class FakeDocument { createElement(tag) { return new Element(tag); } }

function parseMarkup(markup, rootElement) {
    rootElement.replaceChildren();
    const stack = [rootElement];
    for (const token of markup.matchAll(/<\/?([a-z][\w-]*)\b([^>]*)>/gi)) {
        const raw = token[0], tag = token[1];
        if (raw.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
        const child = new Element(tag);
        for (const attr of token[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
            const [, name, value = ''] = attr;
            child.setAttribute(name, value);
            if (name === 'class') for (const cls of value.split(/\s+/).filter(Boolean)) child.classes.add(cls);
        }
        stack[stack.length - 1].appendChild(child);
        if (!/\/\s*>$/.test(raw) && !['input', 'img', 'br', 'hr'].includes(tag.toLowerCase())) stack.push(child);
    }
}

function makeShell() {
    const view = new Element('div');
    view.innerHTML = fs.readFileSync(path.join(pluginDir, 'genericui.html'), 'utf8');
    const form = view.querySelector('form');
    return {view, form};
}

function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return {promise, resolve, reject};
}

const syntheticEditorItems = [
    {Id: 'section', EditorType: 'Group', DisplayName: 'Synthetic Group', EditorItems: [
        {Id: 'text', EditorType: 'Text', DisplayName: 'Synthetic Text'},
        {Id: 'numeric', EditorType: 'Numeric', DisplayName: 'Synthetic Numeric'},
        {Id: 'enabled', EditorType: 'Boolean', DisplayName: 'Synthetic Boolean'},
        {Id: 'choice', EditorType: 'SelectSingle', DisplayName: 'Synthetic Select', SelectOptions: [{Name: 'One', Value: '1'}]},
        {Id: 'date', EditorType: 'Date', DisplayName: 'Synthetic Date'},
        {Id: 'status', EditorType: 'StatusItem', DisplayName: 'Synthetic Status'}
    ]}
];

function syntheticPage(pageId = 'synthetic-a', viewId = 'view-a', options = {}) {
    return {
        PageId: pageId, ViewId: viewId, PluginId: 'synthetic-plugin-id', Caption: 'Synthetic plugin', SubCaption: 'Fixture only',
        ...(options.viewType ? {ViewType: options.viewType} : {}),
        EditObjectContainer: {EditorRoot: {EditorType: 'Group', EditorItems: syntheticEditorItems,
            PropertyConditions: [{TargetPropertyId: 'enabled', AffectedPropertyId: 'text', ConditionType: 'Visible', SimpleCondition: 'IsTrue'}],
            PostbackActions: [{TargetEditorId: 'choice', PostbackCommandId: 'RunSynthetic', CommandParameterPropertyId: 'text'}]},
            Object: {text: 'hello', numeric: 3, enabled: true, choice: '1', date: '2026-01-02T00:00:00Z', status: {Status: 'Succeeded'}}, DefaultObject: {}},
        TabPageInfos: [{PageId: pageId, DisplayName: 'Home', Href: './genericui?PageId=synthetic-a'},
            {PageId: 'unsafe', DisplayName: 'External', Href: 'https://evil.invalid/'}],
        Commands: [{CommandType: 'PageSave', Caption: 'Save', IsVisible: true, IsEnabled: true},
            {CommandType: 'RunSynthetic', Caption: 'Run', IsVisible: true, IsEnabled: false}, ...(options.commands || [])]
    };
}

function loadAmd(relative, deps) {
    const source = fs.readFileSync(path.join(pluginDir, relative), 'utf8');
    const context = {define(ids, factory) { const exports = {}; factory(exports, ...ids.slice(1).map(id => deps[id])); context.module = exports.default; },
        require: deps.require, document: deps.document, Promise, console};
    vm.runInNewContext(source, context, {filename: relative});
    return context.module;
}

function runtime(options = {}) {
    const events = {listeners: [], on(_target, name, fn) { this.listeners.push({name, fn}); }, off(_target, name, fn) { this.listeners = this.listeners.filter(entry => entry.name !== name || entry.fn !== fn); },
        emit(name, ...args) { for (const entry of [...this.listeners]) if (entry.name === name) entry.fn(...args); }};
    const requests = [];
    const client = {getUrl: (name, query) => ({name, query}), getJSON(url) { const gate = deferred(); requests.push({kind: 'view', url, gate}); return gate.promise; }, ajax(options) { const gate = deferred(); requests.push({kind: 'command', options, gate}); return gate.promise; }};
    const globalize = {default: {getCurrentLocale: () => 'zh-HK', translate: key => key}};
    const base = function BaseView(view) { this.view = view; };
    base.prototype.onResume = function() { this.resumeCount = (this.resumeCount || 0) + 1; };
    base.prototype.onPause = function() { this.pauseCount = (this.pauseCount || 0) + 1; };
    base.prototype.destroy = function() { this.destroyed = true; };
    const editorCalls = {render: [], set: [], get: []};
    const genericEdit = {default: {
        renderForm(container, detached) { editorCalls.render.push(container); detached.addEventListener('change', () => {}); if (options.renderForm) return options.renderForm(container, detached); detached.appendChild(new Element('fieldset')); },
        setFormValues(container, target) { editorCalls.set.push({container, target}); },
        getItemValues(container, target) { editorCalls.get.push({container, target}); container.Object.text = 'edited'; container.isDataValid = true; }
    }};
    const schema = loadAmd('schema.js', {});
    const document = new FakeDocument();
    const deps = {'modules/viewmanager/baseview.js': {default: base},
        'modules/emby-apiclient/connectionmanager.js': {default: {currentApiClient: () => client}},
        'modules/emby-apiclient/events.js': {default: events},
        'modules/common/input/api.js': {default: {}},
        'modules/common/globalize.js': globalize,
        'modules/genericedit/genericedit.js': genericEdit, './schema.js': {default: schema}, './responsehelper.js': {default: {}},
        'modules/emby-elements/emby-scroller/emby-scroller.js': {}, 'modules/emby-elements/emby-button/emby-button.js': {},
        'modules/dialoghelper/dialoghelper.js': {default: {created: [], opened: [], closed: [], createDialog(config) { const dialog = new Element('div'); dialog.config = config; this.created.push(dialog); return dialog; }, open(dialog) { this.opened.push(dialog); }, close(dialog) { this.closed.push(dialog); dialog.dispatch('close'); }}},
        require: ids => Promise.resolve(ids.map(id => ({'alert': () => Promise.resolve(), 'toast': () => {}, 'confirm': options.confirm || (() => Promise.resolve()), 'appRouter': {show() {}}}[id] || {}))), document};
    const View = loadAmd('genericui.js', deps);
    return {View, client, events, requests, editorCalls, document, dialogHelper: deps['modules/dialoghelper/dialoghelper.js'].default, schema};
}

async function tick() { await Promise.resolve(); await Promise.resolve(); }
async function resolveView(rt, request, data = syntheticPage()) { request.gate.resolve(data); await tick(); await tick(); }

test('synthetic schema renders representative GenericEdit field kinds and safe tabs', async () => {
    const rt = runtime(), shell = makeShell(), view = new rt.View(shell.view, {PageId: 'synthetic-a'});
    view.onResume();
    const request = rt.requests[0];
    assert.equal(request.url.name, 'UI/View');
    assert.deepEqual(JSON.parse(JSON.stringify(request.url.query)), {PageId: 'synthetic-a', ClientLocale: 'zh-HK'});
    await resolveView(rt, request);
    assert.deepEqual(rt.editorCalls.render[0].EditorRoot.EditorItems.map(item => item.EditorType), ['Group']);
    const group = rt.editorCalls.render[0].EditorRoot.EditorItems[0];
    assert.deepEqual(group.EditorItems.map(item => item.EditorType), ['Text', 'Numeric', 'Boolean', 'SelectSingle', 'Date', 'StatusItem']);
    assert.deepEqual(JSON.parse(JSON.stringify(rt.editorCalls.render[0].EditorRoot.PropertyConditions)),
        [{TargetPropertyId: 'enabled', AffectedPropertyId: 'text', ConditionType: 'Visible', SimpleCondition: 'IsTrue'}]);
    assert.deepEqual(JSON.parse(JSON.stringify(rt.editorCalls.render[0].EditorRoot.PostbackActions)),
        [{TargetEditorId: 'choice', PostbackCommandId: 'RunSynthetic', CommandParameterPropertyId: 'text'}]);
    assert.equal(rt.editorCalls.set.length, 1);
    const tabs = shell.view.querySelector('.pluginTabs').children;
    assert.equal(tabs.length, 1);
    assert.equal(tabs[0].getAttribute('href'), 'genericui?PageId=synthetic-a');
    assert.equal(tabs[0].getAttribute('aria-current'), 'page');
    assert.equal(shell.view.querySelector('.mainContent').listenerCount('change'), 1);
});

test('resume, pause, and destroy own one UIPageInfoChanged listener and DOM handlers', async () => {
    const rt = runtime(), shell = makeShell(), view = new rt.View(shell.view, {PageId: 'synthetic-a'});
    view.onResume();
    const first = rt.requests[0]; await resolveView(rt, first);
    view.onResume();
    assert.equal(rt.events.listeners.length, 1);
    assert.equal(rt.requests.length, 1);
    assert.equal(shell.view.listenerCount('click'), 1);
    assert.equal(shell.form.listenerCount('submit'), 1);
    view.onPause();
    assert.equal(rt.events.listeners.length, 0);
    view.onResume();
    assert.equal(rt.events.listeners.length, 1);
    rt.requests[1].gate.resolve(syntheticPage()); await tick(); await tick();
    view.destroy();
    assert.equal(rt.events.listeners.length, 0);
    assert.equal(shell.view.listenerCount('click'), 0);
    assert.equal(shell.form.listenerCount('submit'), 0);
});

test('late UI/View and Command responses from an old generation cannot replace the new page', async () => {
    const rt = runtime(), shell = makeShell(), view = new rt.View(shell.view, {PageId: 'old'});
    view.onResume(); const oldLoad = rt.requests[0];
    view.pageId = 'new'; const newLoad = view.load(); const fresh = rt.requests[1];
    const freshData = syntheticPage('new', 'new-view'); freshData.Commands.find(c => c.CommandType === 'RunSynthetic').IsEnabled = true;
    await resolveView(rt, fresh, freshData);
    oldLoad.gate.resolve(syntheticPage('old', 'old-view')); await tick(); await tick();
    assert.equal(view.data.PageId, 'new');
    assert.equal(shell.view.querySelector('.mainTitle').textContent, 'Synthetic plugin');
    const runButton = shell.view.querySelector('.pluginCommands').children.find(button => button.getAttribute('data-data1') === 'RunSynthetic');
    view.onClick({target: runButton, preventDefault() {}, stopPropagation() {}}); await tick(); const commandRequest = rt.requests[2];
    assert.equal(JSON.parse(commandRequest.options.data).ItemId, 'synthetic-plugin-id');
    view.pageId = 'newer'; const latest = view.load(); const latestRequest = rt.requests[3];
    await resolveView(rt, latestRequest, syntheticPage('newer', 'newer-view'));
    commandRequest.gate.resolve(syntheticPage('stale-command', 'stale-view')); await tick(); await tick();
    assert.equal(view.data.PageId, 'newer');
    void newLoad;
});

test('commands send the documented fields, honor validity and disabled state, and expose only static errors', async () => {
    const rt = runtime(), shell = makeShell(), view = new rt.View(shell.view, {PageId: 'synthetic-a'});
    view.onResume(); await resolveView(rt, rt.requests[0]);
    shell.form.valid = false;
    const invalidSave = view.runCommand('PageSave');
    assert.equal(rt.requests.length, 1);
    await view.runCommand('PageSave');
    assert.equal(rt.requests.length, 1);
    shell.form.valid = true;
    const disabled = shell.view.querySelector('.pluginCommands').children.find(button => button.getAttribute('data-data1') === 'RunSynthetic');
    assert.equal(disabled.disabled, true);
    await view.runCommand('RunSynthetic');
    assert.equal(rt.requests.length, 1, 'disabled command invoked directly must not POST');
    view.onClick({target: disabled, preventDefault() {}, stopPropagation() {}});
    assert.equal(rt.requests.length, 1);
    const saving = view.runCommand('PageSave', 'item-7');
    await tick();
    const command = rt.requests[1];
    assert.equal(command.kind, 'command');
    assert.equal(command.options.url.name, 'UI/Command');
    assert.equal(command.options.type, 'POST');
    const payload = JSON.parse(command.options.data);
    assert.deepEqual(Object.keys(payload).sort(), ['ClientLocale', 'CommandId', 'Data', 'ItemId', 'PageId'].sort());
    assert.equal(payload.PageId, 'synthetic-a'); assert.equal(payload.CommandId, 'PageSave'); assert.equal(payload.ItemId, 'item-7'); assert.equal(payload.ClientLocale, 'zh-HK');
    assert.equal(JSON.parse(payload.Data).text, 'edited');
    command.gate.reject(Object.assign(new Error('PRIVATE_SERVER_DETAIL'), {status: 404})); await saving;
    const error = shell.view.querySelector('.pluginError');
    assert.equal(error.hidden, false);
    assert.equal(error.textContent, 'Plugin page could not be loaded. Please try again.');
    assert.equal(error.textContent.includes('PRIVATE_SERVER_DETAIL'), false);
    await invalidSave;
});

test('keyboard form submit sends PageSave with the current PluginId as ItemId', async () => {
    const rt = runtime(), shell = makeShell(), view = new rt.View(shell.view, {PageId: 'synthetic-a'});
    view.onResume(); await resolveView(rt, rt.requests[0]);
    let prevented = false;
    view.onSubmit({preventDefault() { prevented = true; }});
    await tick();
    assert.equal(prevented, true);
    const request = rt.requests[1];
    assert.equal(JSON.parse(request.options.data).CommandId, 'PageSave');
    assert.equal(JSON.parse(request.options.data).ItemId, 'synthetic-plugin-id');
    request.gate.resolve(syntheticPage()); await tick(); await tick();
});

test('UIPageInfoChanged updates only the owned client and page, with matching view or explicit page-change info', async () => {
    const rt = runtime(), shell = makeShell(), view = new rt.View(shell.view, {PageId: 'synthetic-a'});
    view.onResume(); await resolveView(rt, rt.requests[0]);
    let renders = rt.editorCalls.render.length;
    const wrongClient = {getUrl() {}, getJSON() { throw new Error('must not request'); }};
    rt.events.emit('UIPageInfoChanged', {}, wrongClient, syntheticPage('synthetic-a', 'view-a'));
    rt.events.emit('UIPageInfoChanged', {}, rt.client, syntheticPage('other-page', 'view-a'));
    rt.events.emit('UIPageInfoChanged', {}, rt.client, syntheticPage('synthetic-a', 'other-view'));
    await tick();
    assert.equal(rt.editorCalls.render.length, renders);
    const updated = syntheticPage('synthetic-a', 'other-view'); updated.IsPageChangeInfo = true;
    rt.events.emit('UIPageInfoChanged', {}, rt.client, updated);
    await tick(); await tick();
    assert.equal(rt.editorCalls.render.length, renders + 1);
    assert.equal(view.data.ViewId, 'other-view');
    assert.equal(shell.view.querySelector('.mainContent').listenerCount('change'), 1);
});

test('denied or missing UI/View responses show a static error without response details', async () => {
    for (const status of [403, 404]) {
        const rt = runtime(), shell = makeShell(), view = new rt.View(shell.view, {PageId: 'synthetic-a'});
        view.onResume();
        rt.requests[0].gate.reject(Object.assign(new Error(`PRIVATE_RESPONSE_${status}`), {status}));
        await tick(); await tick();
        const error = shell.view.querySelector('.pluginError');
        assert.equal(error.hidden, false);
        assert.equal(error.textContent, 'Plugin page could not be loaded. Please try again.');
        assert.equal(error.textContent.includes(`PRIVATE_RESPONSE_${status}`), false);
    }
});

test('Dialog and Wizard render into their own roots and command actions enforce form validity', async () => {
    for (const [viewType, commandType] of [['Dialog', 'DialogOk'], ['Wizard', 'WizardNext'], ['Wizard', 'WizardFinish']]) {
        const rt = runtime(), shell = makeShell(), view = new rt.View(shell.view, {PageId: 'synthetic-a'});
        const data = syntheticPage('synthetic-a', 'view-a', {viewType, commands: [
            {CommandType: commandType, Caption: commandType, IsVisible: true, IsEnabled: true}
        ]});
        view.onResume(); await resolveView(rt, rt.requests[0], data);
        assert.ok(view.dialog, `${viewType} should have a modal root`);
        assert.equal(rt.dialogHelper.opened[0], view.dialog);
        const form = view.dialog.querySelector('form');
        assert.ok(form);
        form.valid = false;
        await view.runCommand(commandType);
        assert.equal(rt.requests.length, 1, `${commandType} with invalid form must not POST`);
        form.valid = true;
        const button = view.dialog.querySelector('.pluginCommands').children.find(item => item.getAttribute('data-data1') === commandType);
        view.onClick({target: button, preventDefault() {}, stopPropagation() {}});
        await tick();
        const request = rt.requests[1];
        assert.equal(request.kind, 'command');
        const body = JSON.parse(request.options.data);
        assert.equal(body.CommandId, commandType);
        assert.equal(body.ItemId, 'synthetic-plugin-id');
        const nextType = commandType === 'WizardNext' ? 'Wizard' : null;
        request.gate.resolve(syntheticPage('synthetic-a', 'next', nextType ? {viewType: nextType} : {})); await tick(); await tick();
        assert.equal(rt.requests.length, 2);
        if (commandType === 'WizardNext') assert.ok(view.dialog, 'WizardNext keeps the wizard open for its next state');
        else assert.equal(view.dialog, null, `${commandType} response transitions back to the page`);
    }
});

test('closing, pausing, or destroying a modal page does not issue a command POST', async () => {
    for (const exit of ['close', 'pause', 'destroy']) {
        const rt = runtime(), shell = makeShell(), view = new rt.View(shell.view, {PageId: 'synthetic-a'});
        view.onResume(); await resolveView(rt, rt.requests[0], syntheticPage('synthetic-a', 'dialog', {viewType: 'Dialog'}));
        const dialog = view.dialog;
        if (exit === 'close') rt.dialogHelper.close(dialog);
        if (exit === 'pause') view.onPause();
        if (exit === 'destroy') view.destroy();
        assert.equal(rt.requests.filter(item => item.kind === 'command').length, 0, `${exit} must not POST`);
    }
});

test('a late close callback from an old dialog cannot clear the current dialog', async () => {
    const rt = runtime(), shell = makeShell(), view = new rt.View(shell.view, {PageId: 'synthetic-a'});
    view.onResume(); await resolveView(rt, rt.requests[0], syntheticPage('synthetic-a', 'dialog-a', {viewType: 'Dialog'}));
    const oldDialog = view.dialog;
    view.pageId = 'synthetic-b';
    const nextLoad = view.load(), nextRequest = rt.requests[1];
    await resolveView(rt, nextRequest, syntheticPage('synthetic-b', 'dialog-b', {viewType: 'Wizard'}));
    const newDialog = view.dialog;
    assert.notEqual(newDialog, oldDialog);
    oldDialog.dispatch('close');
    assert.equal(view.dialog, newDialog);
    assert.equal(view.data.PageId, 'synthetic-b');
    void nextLoad;
});

test('PageBack is intercepted only when the current schema declares an enabled visible command', async () => {
    const rt = runtime(), shell = makeShell(), view = new rt.View(shell.view, {PageId: 'synthetic-a'});
    view.onResume(); await resolveView(rt, rt.requests[0]);
    const absent = {detail: {command: 'back'}, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }};
    view.onInputCommand(absent);
    assert.equal(absent.prevented, false);
    assert.equal(rt.requests.length, 1);
    for (const enabled of [false, true]) {
        const hiddenOrDisabled = syntheticPage('synthetic-a', 'view-a', {commands: [{CommandType: 'PageBack', IsVisible: enabled, IsEnabled: false}]});
        rt.events.emit('UIPageInfoChanged', {}, rt.client, hiddenOrDisabled); await tick(); await tick();
        const blocked = {detail: {command: 'back'}, prevented: false, stopPropagation() {}, preventDefault() { this.prevented = true; }};
        view.onInputCommand(blocked);
        assert.equal(blocked.prevented, false);
        assert.equal(rt.requests.length, 1);
    }
    const data = syntheticPage('synthetic-a', 'view-a', {commands: [{CommandType: 'PageBack', IsVisible: true, IsEnabled: true}]});
    rt.events.emit('UIPageInfoChanged', {}, rt.client, data); await tick(); await tick();
    const allowed = {detail: {command: 'back'}, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }};
    view.onInputCommand(allowed); await tick();
    assert.equal(allowed.prevented, true);
    assert.equal(allowed.stopped, true);
    const request = rt.requests[1];
    assert.equal(JSON.parse(request.options.data).CommandId, 'PageBack');
    // NAS genericui.js sends null for the global PageBack protocol command.
    assert.equal(JSON.parse(request.options.data).ItemId, null);
    assert.equal(JSON.parse(request.options.data).Data, null);
    assert.equal(rt.editorCalls.get.length, 0);
    request.gate.resolve(syntheticPage()); await tick(); await tick();
});

test('a resumed page accepts a new command while an old command is pending, and old finally cannot clear it', async () => {
    const rt = runtime(), shell = makeShell(), view = new rt.View(shell.view, {PageId: 'synthetic-a'});
    view.onResume(); await resolveView(rt, rt.requests[0]);
    const first = view.runCommand('PageSave'); await tick();
    const oldRequest = rt.requests[1];
    view.onPause();
    view.pageId = 'synthetic-b';
    view.onResume();
    const reload = rt.requests[2]; await resolveView(rt, reload, syntheticPage('synthetic-b', 'view-b'));
    const second = view.runCommand('PageSave'); await tick();
    const newRequest = rt.requests[3];
    const pendingGeneration = view.commandPending;
    assert.ok(pendingGeneration);
    oldRequest.gate.resolve(syntheticPage('stale', 'stale-view')); await first;
    assert.equal(view.commandPending, pendingGeneration);
    await view.runCommand('PageSave');
    assert.equal(rt.requests.length, 4, 'new pending command suppresses an additional command');
    newRequest.gate.resolve(syntheticPage('synthetic-b', 'done')); await second;
    assert.equal(view.commandPending, false);
});

test('schema rejects injection and prototype keys; ItemList display copy preserves canonical Data', () => {
    const unsafe = syntheticPage();
    unsafe.EditObjectContainer.EditorRoot.EditorItems[0].EditorItems[0].DisplayName = 'x" onmouseover="alert(1)';
    unsafe.EditObjectContainer.EditorRoot.EditorItems[0].EditorItems.push({Id: 'items', EditorType: 'ItemList'});
    const canonicalData = '{"PrimaryText":"<img src=x onerror=alert(1)>","Tag":"<b>unsafe</b>"}';
    unsafe.EditObjectContainer.Object.items = [{Data: canonicalData, PrimaryText: '<b>item</b>', HyperLink: 'javascript:alert(1)'}];
    const prepared = rtSchema(unsafe);
    assert.match(prepared.EditObjectContainer.EditorRoot.EditorItems[0].EditorItems[0].DisplayName, /&quot; onmouseover=/);
    const canonical = prepared.EditObjectContainer.Object.items[0].Data;
    const display = runtime().schema.displayContainer(prepared.EditObjectContainer);
    assert.equal(display.Object.items[0].Data, canonical);
    assert.equal(display.Object.items[0].PrimaryText, '&lt;b&gt;item&lt;/b&gt;');
    assert.equal(display.Object.items[0].HyperLink, null);
    assert.equal(prepared.EditObjectContainer.Object.items[0].Data, canonicalData);
    const polluted = JSON.parse('{"PageId":"p","ViewId":"v","EditObjectContainer":{"EditorRoot":{},"Object":{"__proto__":{"polluted":true}}}}');
    assert.throws(() => runtime().schema.prepare(polluted), /Invalid plugin property/);
    assert.equal(({}).polluted, undefined);
});

function rtSchema(data) { return runtime().schema.prepare(data); }

test('PageBack button also sends null data and item identity without extracting fields', async () => {
    const rt = runtime(), shell = makeShell(), view = new rt.View(shell.view, {PageId: 'synthetic-a'});
    view.onResume(); await resolveView(rt, rt.requests[0], syntheticPage('synthetic-a', 'view-a', {commands: [{CommandType: 'PageBack', IsVisible: true, IsEnabled: true}]}));
    const button = shell.view.querySelector('.pluginCommands').children.find(child => child.getAttribute('data-data1') === 'PageBack');
    assert.equal(button.getAttribute('data-data2'), 'synthetic-plugin-id');
    view.onClick({target: button, preventDefault() {}, stopPropagation() {}});
    await tick();
    const payload = JSON.parse(rt.requests[1].options.data);
    assert.equal(payload.CommandId, 'PageBack'); assert.equal(payload.Data, null); assert.equal(payload.ItemId, null);
    assert.equal(rt.editorCalls.get.length, 0);
    rt.requests[1].gate.resolve(syntheticPage()); await tick(); await tick();
});

test('synthetic submenu confirmation is shown as text and cancellation is silent', async () => {
    const prompts = [];
    const rt = runtime({confirm: options => { prompts.push(options.text); return Promise.reject('cancel'); }});
    const shell = makeShell(), view = new rt.View(shell.view, {PageId: 'synthetic-a'});
    view.onResume(); await resolveView(rt, rt.requests[0]);
    view.onClick({target: shell.view, Data1: 'PageSave', ConfirmationPrompt: 'Confirm <item> & operation?', preventDefault() {}, stopPropagation() {}});
    await tick(); await tick(); await tick();
    assert.deepEqual(prompts, ['Confirm <item> & operation?']);
    assert.equal(rt.requests.length, 1); assert.equal(shell.view.querySelector('.pluginError').hidden, true);
    assert.equal(view.commandPending, false);
});

test('ItemList tag text is escaped and progress cannot inject markup; unknown leaf editors reject', () => {
    const page = syntheticPage();
    page.EditObjectContainer.EditorRoot.EditorItems = [{Id: 'items', EditorType: 'ItemList'}];
    page.EditObjectContainer.Object.items = [{Tag: {Text: '<img src=x onerror=attack()>'}, PercentComplete: 42}];
    const schema = runtime().schema, prepared = schema.prepare(page), display = schema.displayContainer(prepared.EditObjectContainer);
    assert.equal(display.Object.items[0].Tag.Text, '&lt;img src=x onerror=attack()&gt;');
    assert.equal(prepared.EditObjectContainer.Object.items[0].Tag.Text, '<img src=x onerror=attack()>');
    prepared.EditObjectContainer.Object.items[0].PercentComplete = '1" onmouseover="attack()';
    assert.throws(() => schema.displayContainer(prepared.EditObjectContainer), /Invalid plugin progress/);
    page.EditObjectContainer.EditorRoot.EditorItems = [{Id: 'bad', ElementType: '<img src=x onerror=attack()>'}];
    assert.throws(() => schema.prepare(page), /Unsupported plugin editor/);
});

test('ButtonItem disabled and confirmation state is restored from canonical schema metadata', async () => {
    const rt = runtime({renderForm(_container, node) {
        const button = node.appendChild(new Element('button'));
        button.setAttribute('id', 'action'); button.setAttribute('data-data1', 'RunSynthetic');
    }});
    const shell = makeShell(), view = new rt.View(shell.view, {PageId: 'synthetic-a'}), page = syntheticPage();
    page.EditObjectContainer.EditorRoot.EditorItems = [{Id: 'action', EditorType: 'ButtonItem'}];
    page.EditObjectContainer.Object.action = {IsEnabled: false, IsVisible: true, ConfirmationPrompt: 'Confirm <operation> & change?'};
    view.onResume(); await resolveView(rt, rt.requests[0], page);
    const button = shell.view.querySelector('#action');
    assert.equal(button.disabled, true); assert.equal(button.getAttribute('data-prompt'), 'Confirm <operation> & change?');
    view.onClick({target: button, preventDefault() {}, stopPropagation() {}}); await tick();
    assert.equal(rt.requests.length, 1);
});

test('pausing a modal restores page command ownership before resumed UI/View resolves', async () => {
    const rt = runtime(), shell = makeShell(), view = new rt.View(shell.view, {PageId: 'synthetic-a'});
    view.onResume(); await resolveView(rt, rt.requests[0]);
    const pageData = view.data, modal = syntheticPage('synthetic-modal', 'modal', {viewType: 'Dialog', commands: [{CommandType: 'PageBack', IsVisible: true, IsEnabled: true}]});
    const generation = ++view.generation; await view.render(modal, generation);
    assert.ok(view.dialog); view.onPause();
    assert.equal(view.data, pageData); assert.equal(view.pageId, pageData.PageId);
    view.onResume(); assert.equal(rt.requests[1].url.query.PageId, pageData.PageId);
    const event = {detail: {command: 'back'}, preventDefault() { throw new Error('stale modal intercepted back'); }, stopPropagation() {}};
    view.onInputCommand(event);
    assert.equal(rt.requests.filter(request => request.kind === 'command').length, 0);
    view.onPause(); rt.requests[1].gate.resolve(syntheticPage()); await tick(); await tick();
});

test('ItemList action confirmation is recovered from its canonical descriptor', async () => {
    const prompts = [], rt = runtime({confirm: options => { prompts.push(options.text); return Promise.reject('cancel'); }, renderForm(_container, node) {
        const button = node.appendChild(new Element('button')); button.setAttribute('id', 'items.listitem0.button1'); button.setAttribute('data-data1', 'SyntheticRemove');
    }});
    const shell = makeShell(), view = new rt.View(shell.view, {PageId: 'synthetic-a'}), page = syntheticPage();
    page.EditObjectContainer.EditorRoot.EditorItems = [{Id: 'items', EditorType: 'ItemList'}];
    page.EditObjectContainer.Object.items = [{Button1: {IsEnabled: true, IsVisible: true, Data1: 'SyntheticRemove', ConfirmationPrompt: 'Confirm <item> & remove?'}}];
    view.onResume(); await resolveView(rt, rt.requests[0], page);
    const button = shell.view.querySelector('#items\\.listitem0\\.button1');
    assert.equal(button.getAttribute('data-prompt'), 'Confirm <item> & remove?');
    view.onClick({target: button, preventDefault() {}, stopPropagation() {}}); await tick(); await tick(); await tick();
    assert.deepEqual(prompts, ['Confirm <item> & remove?']); assert.equal(rt.requests.length, 1); assert.equal(view.commandPending, false);
});
