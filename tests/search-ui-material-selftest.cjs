'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const movie = require('../tools/patch-movie-browser.cjs');
const search = require('../tools/patch-search-ui.cjs');

const ROOT = path.resolve(__dirname, '..');
const WWW = 'vendor/web-snapshot/www';
const MATERIAL = Object.freeze({
    'search/searchfields.js': '7F051FEA8519DF0233723CAE1635BF13D3AECAA194846B73BEFE3FFA95A82ACC',
    'search/searchresults.js': 'C6FCE6F9B8B4A7549565AEFC7A25EE3643FA2130FB32D5198B8DE9E1B2521174',
    'search/search.js': 'B469D21AECB6A2A75BBD99B1058F594ABAB4BCBAAE1A87CD30177C815027D6D0',
    'list/list.js': 'AD46C8B15AEE29073FF5FD878F4D7643544B7A47360588F798FE6116717BC7CC',
    'modules/tabbedview/listcontroller.js': 'A8776FF47B4811A68AC177722FA3CD5FF7C7DE2B760B50EE9FB5ACF8C16D92D1',
    'modules/emby-elements/emby-itemscontainer/emby-itemscontainer.js': '46670CE92ADF5A46BA6F7689481E89CD39A5D423A9F97D9D78F45E49F1E86E49',
    'modules/virtual-scroller/virtual-scroller.js': 'D2982A619FDF3DC7F9ED13910D0CAB3723E7122440B02214057D2FC6A592A5B9'
});

function sha256(bytes) {
    return crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

function read(relativePath) {
    const bytes = fs.readFileSync(path.join(ROOT, WWW, ...relativePath.split('/')));
    assert.equal(sha256(bytes), MATERIAL[relativePath], relativePath + ' fixed source hash');
    return bytes.toString('utf8');
}

function compile(filename, source) {
    assert.doesNotThrow(() => new vm.Script(source, {filename}), filename + ' generated syntax');
}

function assertOriginalQueryContracts(fieldsText, resultsText, viewText, listText, controllerText) {
    assert.match(fieldsText, /setTimeout\(onSearchTimeout\.bind\(instance\), value\)/,
        'SearchFields retains its original debounce interval');
    assert.match(fieldsText, /SortBy: "IsFavoriteOrLiked,Random"/);
    assert.match(fieldsText, /IncludeItemTypes: "Movie,Series,MusicArtist"/);
    assert.match(fieldsText, /Limit: 20 \* 1\.5/);
    assert.match(resultsText, /query=\{SearchTerm:value,Recursive:!0,EnableTotalRecordCount:!1,ImageTypeLimit:1,Limit:16,ParentId:instance\.options\.parentId/);
    assert.match(resultsText, /query\.Limit=16,query\.ParentId=instance\.options\.parentId/);
    assert.match(resultsText, /apiClient\.getSearchResults\(query\)/);
    assert.match(resultsText, /apiClient\.getItems\(apiClient\.getCurrentUserId\(\),query\)/);
    assert.match(resultsText, /globalize\.translate\("HeaderError"\)/);
    assert.match(resultsText, /globalize\.translate\("NoItemsMatchingFound"\)/);
    assert.match(resultsText, /cardBuilder\.buildCards/);
    assert.match(resultsText, /appRouter/);
    assert.match(viewText, /self\.searchResults\.search\(value\)/);
    assert.match(listText, /this\.itemsContainer\.refreshItems\(\)/);
    assert.match(listText, /this\.searchFields\.getSearchTerm\(\)/);
    assert.match(listText, /query\.SearchTerm=this\.lastSearchTerm=this\.searchFields\.getSearchTerm\(\)/);
    assert.match(controllerText, /queryInfo\.query\.IncludeSearchTypes\s*=\s*!1/);
    assert.match(controllerText, /apiClient\.getSearchResults\(queryInfo\.query\)/);
    assert.match(controllerText, /this\.refreshSearchTabs\(result\.ItemTypes\)/);
}

function fakeClassList() {
    const values = new Set();
    return {add(value) { values.add(value); }, remove(value) { values.delete(value); }, contains(value) { return values.has(value); }};
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
    return {promise, resolve, reject};
}

function createSearchFieldModule() {
    const embeds = [];
    const timers = new Map();
    const clearedTimers = [];
    const events = [];
    const apiCalls = [];
    let nextTimerId = 1;

    function fakeElement() {
        const suggestionsList = {innerHTML: ''};
        const suggestions = {classList: fakeClassList(), querySelector(selector) {
            assert.equal(selector, '.searchSuggestionsList'); return suggestionsList;
        }};
        const textInput = {value: '', maxLength: -1, listeners: {}, setAttribute() {}, addEventListener(name, fn) { this.listeners[name] = fn; }, focus() { this.focusCount = (this.focusCount || 0) + 1; }};
        const voiceButton = {listeners: {}, classList: fakeClassList(), addEventListener(name, fn) { this.listeners[name] = fn; }};
        const element = {innerHTML: '', classList: fakeClassList(), querySelector(selector) {
            if (selector === '.searchfields-txtSearch') return textInput;
            if (selector === '.searchSuggestions') return suggestions;
            if (selector === '.btnVoiceInput') return voiceButton;
            throw new Error('Unexpected search field selector ' + selector);
        }};
        return {element, textInput, voiceButton, suggestions, suggestionsList};
    }

    const templates = [];
    const modules = {
        './..\/modules\/emby-apiclient\/connectionmanager.js': null
    };
    modules['./../modules/emby-apiclient/connectionmanager.js'] = {default: {
        getApiClient() { return api; }, currentApiClient() { return api; }
    }};
    const api = {getCurrentUserId() { return 'material-user'; }, getItems(user, query) {
        apiCalls.push({user, query}); return Promise.resolve({Items: []});
    }};
    modules['./../modules/emby-apiclient/events.js'] = {default: {trigger(instance, name, args) {
        events.push({instance, name, value: args && args[0]});
    }}};
    modules['./../modules/common/globalize.js'] = {default: {
        translate(key) { return key; }, translateDocument(value) { return value; }
    }};
    modules['./../modules/browser.js'] = {default: {tizen: false}};
    modules['./../modules/alphapicker/alphapicker.js'] = {default: function AlphaPicker() { this.destroy = function () {}; }};
    modules['./../modules/layoutmanager.js'] = {default: {tv: false}};
    modules['./../modules/emby-elements/emby-input/emby-input.js'] = {};
    modules['./../modules/emby-elements/emby-button/emby-button.js'] = {};
    modules['./../modules/common/servicelocator.js'] = {appHost: {supports() { return false; }}};
    modules['./../modules/approuter.js'] = {default: {getRouteUrl() { return '/item'; }}};
    const sandbox = {
        console: {log() {}, warn(message) { events.push({name: 'warning', value: message}); }},
        self: {},
        setTimeout(fn, delay) { const id = nextTimerId++; timers.set(id, {fn, delay}); return id; },
        clearTimeout(id) { clearedTimers.push(id); timers.delete(id); },
        require(names) {
            if (names && names[0] === 'text!search/searchfields.template.html') {
                const pending = deferred(); templates.push(pending); return pending.promise;
            }
            return Promise.resolve([]);
        },
        define(names, factory) {
            const exports = {};
            factory(...names.map(name => name === 'exports' ? exports : modules[name] || {}));
            sandbox.SearchFields = exports.default;
        }
    };
    sandbox.define.amd = {};
    return {sandbox, embeds, templates, timers, clearedTimers, events, apiCalls, fakeElement};
}

test('pinned search materials transform in required order, retain query/card/tab behavior, and fail closed', () => {
    const fields = read('search/searchfields.js');
    const results = read('search/searchresults.js');
    const view = read('search/search.js');
    const list = read('list/list.js');
    const listController = read('modules/tabbedview/listcontroller.js');
    const itemsContainer = read('modules/emby-elements/emby-itemscontainer/emby-itemscontainer.js');
    const virtualScroller = read('modules/virtual-scroller/virtual-scroller.js');

    const transformed = {
        fields: search.patchSearchFields(fields),
        results: search.patchSearchResults(results),
        view: search.patchSearchView(view),
        list: search.patchListView(list),
        listController: search.patchListController(movie.patchListController(listController)),
        itemsContainer: search.patchBrowseGuard(movie.patchItemsContainer(itemsContainer)),
        virtualScroller: search.patchBrowseGuard(movie.patchVirtualScroller(virtualScroller))
    };
    for (const [name, source] of Object.entries(transformed)) compile('search-overlay/' + name + '.js', source);
    assertOriginalQueryContracts(transformed.fields, transformed.results, transformed.view, transformed.list, transformed.listController);
    assert.match(transformed.view, /searchpending/);
    assert.match(transformed.view, /searchResults\.pause\(\)/);
    assert.match(transformed.view, /searchResults\.resume\(/);
    assert.match(transformed.list, /searchpending/);
    assert.match(transformed.list,
        /_listcontroller\.default\.prototype\.resume\.apply\(this,arguments\);if\(this\._eteSearchBrowse&&this\.searchFields\)this\.searchFields\._eteFieldsPaused=false;/,
        'search fields become active before ListView waits for a pending item query');
    assert.match(transformed.fields, /instance\._eteResumeSearch = false/,
        'a new user input supersedes the deferred resume search');
    assert.match(transformed.listController, /if \(signal && signal\.aborted\)/);
    assert.match(transformed.listController, /this\._eteMovieBrowse \? apiClient\[initialQuery\].*signal/);
    assert.match(transformed.itemsContainer, /this\._eteMovieBrowse \|\| this\._eteSearchBrowse/);
    assert.match(transformed.itemsContainer, /abortController\.signal\.aborted/);
    assert.match(transformed.virtualScroller, /this\._eteMovieBrowse \|\| this\._eteSearchBrowse/);
    assert.match(transformed.virtualScroller, /index\.signal\.aborted/);

    assert.throws(() => search.patchSearchView(view.replace('self.searchResults.search(value)', 'self.searchResults.run(value)')),
        /Search source contract mismatch/);
    assert.throws(() => search.patchSearchView(view + '\n' + 'events.on(self.searchFields,"search",function(e,value){self.searchResults.search(value)})'),
        /Search source contract mismatch/);
    assert.throws(() => search.patchSearchFields(fields.replace('function triggerSearch(instance, value, immediate)', 'function changedSearch(instance, value, immediate)')),
        /Search source contract mismatch/);
    assert.throws(() => search.patchSearchResults(results + '\nfunction SearchResults.prototype.search=function(value){loading.show();'),
        /Search source contract mismatch/);
    const movieListController = movie.patchListController(listController);
    const listAnchor = '              return result.ItemTypes && this.refreshSearchTabs(result.ItemTypes), result;';
    assert.throws(() => search.patchListController(movieListController.replace(listAnchor, '              return result;')),
        /Search source contract mismatch/);
    assert.throws(() => search.patchListController(movieListController + '\n' + listAnchor),
        /Search source contract mismatch/);
    assert.throws(() => search.patchBrowseGuard(transformed.itemsContainer), /Search browse guard source contract mismatch/);
});

test('SearchFields ignores a destroyed deferred embed, does not focus while paused, and resumes a pending input', async () => {
    const source = read('search/searchfields.js');
    const transformed = search.patchSearchFields(source);
    const runtime = createSearchFieldModule();
    compile('search-fields-vm.js', transformed);
    vm.runInNewContext(transformed, runtime.sandbox, {filename: 'search/searchfields.js', timeout: 1000});
    const {SearchFields} = runtime.sandbox;
    assert.equal(typeof SearchFields, 'function');

    const pausedNodes = runtime.fakeElement();
    const paused = new SearchFields({element: pausedNodes.element, serverId: 'server-a'});
    paused.pause();
    runtime.templates[0].resolve(['<template>']);
    await Promise.resolve(); await Promise.resolve();
    assert.equal(pausedNodes.textInput.focusCount || 0, 0, 'late embed does not focus a paused search field');

    const destroyedNodes = runtime.fakeElement();
    const destroyed = new SearchFields({element: destroyedNodes.element, serverId: 'server-a'});
    destroyed.destroy();
    runtime.templates[1].resolve(['<template>']);
    await Promise.resolve(); await Promise.resolve();
    assert.equal(destroyedNodes.element.innerHTML, '', 'late embed does not build a destroyed field');
    assert.equal(destroyedNodes.textInput.focusCount || 0, 0);

    const resumedNodes = runtime.fakeElement();
    const resumed = new SearchFields({element: resumedNodes.element, serverId: 'server-a'});
    resumedNodes.textInput.value = 'movie';
    runtime.templates[2].resolve(['<template>']);
    await Promise.resolve(); await Promise.resolve();
    resumed.resume();
    await Promise.resolve(); await Promise.resolve();
    resumedNodes.textInput.listeners.input({target: {value: 'series'}});
    const pendingTimer = resumed.searchTimeout;
    assert.equal(runtime.timers.get(pendingTimer).delay, 500);
    resumed.pause();
    assert.ok(runtime.clearedTimers.includes(pendingTimer), 'pause clears the pending debounce timer');
    assert.equal(resumed._eteResumeSearch, true);
    resumed.resume();
    const resumedTimer = resumed.searchTimeout;
    assert.equal(runtime.timers.get(resumedTimer).delay, 0, 'resume immediately continues the interrupted input');
    runtime.timers.get(resumedTimer).fn();
    await Promise.resolve(); await Promise.resolve();
    assert.equal(resumed._eteResumeSearch, false, 'the new input clears the saved resume intent');
    assert.ok(runtime.events.some(event => event.name === 'search' && event.value === 'series'));
    assert.ok(runtime.events.some(event => event.name === 'searchpending' && event.value === 'series'));
});
