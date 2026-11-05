'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const recent = require('../src/electronapp/enhanced/search/recent-search.js');
const searchOverlay = require('../tools/patch-search-ui.cjs');
class Element {
    constructor(document) { this.ownerDocument = document; this.children = []; this.attributes = {}; this.hidden = false; this.style = {}; this.events = {}; this.textContent = ''; }
    appendChild(child) { child.parent = this; this.children.push(child); return child; }
    remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, fn) { this.events[name] = fn; }
    querySelector(selector) { return this.children.find(child => child.selector === selector) || this.children.map(child => child.querySelector(selector)).find(Boolean) || null; }
}
function fixture() {
    const document = {createElement() { return new Element(document); }};
    const context = new Element(document), parent = new Element(document), old = new Element(document);
    parent.selector = '.searchFieldsInner'; old.selector = '.searchSuggestions'; context.appendChild(parent); parent.appendChild(old);
    let version = '4.10.0.40', user = 'user-1', server = 'server-1', apiCurrent, read, remove;
    const calls = [];
    const api = {getCurrentUserId() { return user; }, serverId() { return server; }, serverVersion() { return version; }, isLoggedIn() { return true; }, _identityEpoch: 0,
        getUrl(route, query) { return {route, query}; },
        getJSON(url, signal) { calls.push({url, signal}); return read ? read() : Promise.resolve({Items: [{Id: 'one', Name: '<safe>', ServerId: server}]}); },
        fetch(request) { calls.push({request}); return remove ? remove() : Promise.resolve(); }};
    apiCurrent = api;
    const connection = {getApiClient() { return api; }, currentApiClient() { return apiCurrent; }};
    const instance = {options: {element: context, serverId: server}, getSearchTerm() { return ''; }};
    const controller = recent.create(instance, connection, {getCurrentLocale() { return 'en-US'; }}, {getRouteUrl(item) { return '/details?id=' + item.Id; }});
    return {api, calls, context, old, controller, setVersion(value) { version = value; }, setUser(value) { user = value; },
        setServer(value) { server = value; }, switchClient(value) { apiCurrent = value; }, setRead(fn) { read = fn; }, setRemove(fn) { remove = fn; }};
}
async function settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
test('old server keeps legacy recommendations and issues no history request', async () => {
    const f = fixture(); f.setVersion('4.10.0.30'); f.controller.load(); await settle();
    assert.equal(f.calls.length, 0); assert.equal(f.old.hidden, false);
});
test('typing hides recently searched and legacy suggestions immediately until the normal search runs', async () => {
    const f = fixture(); f.controller.load(); await settle();
    f.controller.hide(false);
    assert.equal(f.old.hidden, true); assert.equal(f.old.style.display, 'none');
    assert.equal(f.context.querySelector('.searchFieldsInner').children.length, 1);
    f.controller.hide(); assert.equal(f.old.hidden, false);
});
test('reads fixed per-user recently searched items and renders safe text and route', async () => {
    const f = fixture(); f.controller.load(); await settle();
    assert.equal(f.calls[0].url.route, 'Users/user-1/Items');
    assert.deepEqual(f.calls[0].url.query, {WasSearched: true, SortBy: 'DateLastSearched', SortOrder: 'Descending', Limit: 12, Recursive: true, ImageTypeLimit: 1, EnableImageTypes: 'Primary,Thumb'});
    assert.equal(f.old.hidden, true); assert.equal(f.old.style.display, 'none');
    const list = f.context.querySelector('.eteRecentSearch');
    // The mock does not parse classes; inspect rendered tree directly.
    const section = f.context.querySelector('.searchFieldsInner').children[1];
    assert.equal(section.children[1].children[0].children[0].textContent, '<safe>');
    assert.equal(section.children[1].children[0].children[0].href, './details?id=one');
    assert.equal(list, null);
});
test('clear targets current user, retires display only after success, and preserves it on failure', async () => {
    const f = fixture(); f.controller.load(); await settle();
    const section = f.context.querySelector('.searchFieldsInner').children[1], button = section.children[2];
    let reject; f.setRemove(() => new Promise((_, no) => { reject = no; }));
    button.events.click(); await settle(); assert.equal(button.disabled, true); assert.equal(f.old.hidden, true);
    assert.equal(f.calls[1].request.type, 'DELETE'); assert.equal(f.calls[1].request.url.route, 'Users/user-1/RecentlySearched');
    reject(new Error('offline')); await settle(); assert.equal(button.disabled, false); assert.match(section.children[3].textContent, /Could not clear/);
    f.setRemove(null); button.events.click(); await settle(); assert.equal(f.old.hidden, false);
});
test('late read after user, server, client change or pause cannot replace current suggestions', async () => {
    for (const action of ['user', 'server', 'client', 'pause']) {
        const f = fixture(); let resolve; f.setRead(() => new Promise(done => { resolve = done; }));
        f.controller.load(); await settle();
        if (action === 'user') f.setUser('user-2');
        else if (action === 'server') f.setServer('server-2');
        else if (action === 'client') f.switchClient({});
        else f.controller.pause();
        resolve({Items: [{Id: 'stale', Name: 'old'}]}); await settle();
        assert.equal(f.old.hidden, false); assert.equal(f.context.querySelector('.searchFieldsInner').children.length, 1);
    }
});

test('returning to an empty search page reloads recent items after pause', () => {
    const source = fs.readFileSync(path.join(__dirname, '../vendor/web-snapshot/www/search/searchfields.js'), 'utf8');
    let SearchFields;
    const sandbox = {require() {}, define(names, factory) {
        const exports = {};
        factory(...names.map(name => name === 'exports' ? exports : {}));
        SearchFields = exports.default;
    }};
    vm.runInNewContext(searchOverlay.patchSearchFields(source), sandbox, {filename: 'searchfields.js'});
    const calls = [];
    const fields = Object.create(SearchFields.prototype);
    const input = {value: ''};
    fields.options = {element: {querySelector(selector) {
        assert.equal(selector, '.searchfields-txtSearch');
        return input;
    }}};
    fields._eteEmbedded = true;
    fields.firstLoad = true;
    fields._eteRecent = {pause() { calls.push('pause'); }, load() { calls.push('load'); }};
    fields.pause();
    fields._eteFieldsPaused = false; // The standard list route clears this before SearchFields.resume().
    fields.resume();
    fields.resume();
    assert.deepEqual(calls, ['pause', 'load'], 'return reloads once without a new input event');
    input.value = 'movie';
    fields.pause(); fields.resume();
    assert.deepEqual(calls, ['pause', 'load', 'pause'], 'a populated search does not load the empty-state history');
});
