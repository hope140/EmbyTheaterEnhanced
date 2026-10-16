'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const connectionState = {active: null, byServer: new Map(), calls: []};
const connection = {
    getApiClient(serverId) {
        connectionState.calls.push({method: 'getApiClient', serverId});
        if (serverId === undefined || serverId === null) throw new Error('getApiClient(undefined) is forbidden');
        const api = connectionState.byServer.get(serverId);
        if (!api) throw new Error('Unknown fixture server ' + serverId);
        return api;
    },
    currentApiClient() {
        connectionState.calls.push({method: 'currentApiClient'});
        if (!connectionState.active) throw new Error('No current fixture ApiClient');
        return connectionState.active;
    }
};

function loadSearchBrowse() {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src/electronapp/enhanced/search/list-search.js'), 'utf8');
    const documentState = {status: null};
    let exported;
    const define = (_names, factory) => {
        const exports = {};
        factory(exports, {default: connection}, {default: {translate(key) { return key; }}});
        exported = exports.default;
    };
    define.amd = {};
    vm.runInNewContext(source, {
        define, AbortController, Set, Promise, Error, Array,
        document: {createElement(tag) { assert.equal(tag, 'p'); return documentState.status; }}
    }, {filename: 'list-search.js'});
    return {helper: exported, setStatus(status) { documentState.status = status; }};
}

const searchBrowseModule = loadSearchBrowse();
const searchBrowse = searchBrowseModule.helper;

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
    return {promise, resolve, reject};
}

function classList() {
    const values = new Set();
    return {
        add(value) { values.add(value); },
        remove(value) { values.delete(value); },
        contains(value) { return values.has(value); }
    };
}

function setup(type = 'search', options = {}) {
    const originals = {init: 0, resume: [], pause: 0, destroy: 0};
    const calls = [];
    const deliveries = [];
    const status = {classList: classList(), textContent: '', setAttribute(name, value) { this[name] = value; }};
    status.classList.add('hide');
    searchBrowseModule.setStatus(status);
    let userId = options.userId || 'user-a';
    const api = {getCurrentUserId() { return userId; }};
    connectionState.byServer.set('server-a', api);
    connectionState.active = api;
    connectionState.calls.length = 0;
    const searchFields = {term: 'fixture', getSearchTerm() { return this.term; }};
    const container = {
        classList: classList(),
        parentNode: {insertBefore(element, before) { assert.equal(before, container); assert.equal(element, status); }},
        currentAbortController: null,
        refreshItemsInternal() {
            if (this.currentAbortController) this.currentAbortController.abort();
            const controller = new AbortController();
            this.currentAbortController = controller;
            const query = {StartIndex: 0, Limit: 16};
            return owner.getItems(query, controller.signal).then(result => { deliveries.push(result); return result; });
        }
    };
    const owner = {
        params: {type, serverId: Object.prototype.hasOwnProperty.call(options, 'serverId') ? options.serverId : 'server-a'},
        apiClient: options.ownerApi === false ? undefined : api,
        searchFields,
        itemsContainer: container,
        getItems(query, signal) {
            const item = deferred();
            calls.push({query, signal, item});
            return item.promise;
        },
        initItemsContainer() { originals.init++; return container; },
        onResume(options) { originals.resume.push(options); return 'resume-result'; },
        onPause() { originals.pause++; return 'pause-result'; },
        destroy() { originals.destroy++; return 'destroy-result'; }
    };
    const originalGetItems = owner.getItems;
    searchBrowse.install(owner);
    if (type === 'search') owner.initItemsContainer();
    return {
        owner, api, get userId() { return userId; }, set userId(value) { userId = value; },
        container, status, calls, deliveries, originals, originalGetItems,
        restore() { searchBrowseModule.setStatus(null); }
    };
}

const tick = () => new Promise(resolve => setImmediate(resolve));
const isAbort = error => error && error.name === 'AbortError';

test('installs only for search and retains the original query with linked request cancellation', async () => {
    const normal = setup('Movie');
    try {
        assert.equal(normal.owner.getItems, normal.originalGetItems);
        assert.equal(normal.owner._eteSearchBrowse, undefined);
        assert.equal(normal.originals.init, 0);
    } finally { normal.restore(); }

    const f = setup();
    try {
        f.owner.onResume({refresh: false});
        const query = {SearchTerm: 'needle', IncludeItemTypes: 'Movie', StartIndex: 0, Limit: 16};
        const outer = new AbortController();
        const pending = f.owner.getItems(query, outer.signal);
        await tick();
        assert.equal(f.calls.length, 1);
        assert.strictEqual(f.calls[0].query, query);
        assert.notStrictEqual(f.calls[0].signal, outer.signal);
        assert.equal(f.calls[0].signal.aborted, false);
        outer.abort();
        await assert.rejects(pending, isAbort);
        assert.equal(f.calls[0].signal.aborted, true, 'outer abort reaches the underlying ApiClient signal');
        f.calls[0].item.resolve({Items: [{Id: 'late'}]});
        await tick();
        assert.deepEqual(f.deliveries, []);
    } finally { f.restore(); }
});

test('uses the canonical current ApiClient when search has neither an owner client nor serverId', async () => {
    const f = setup('search', {serverId: undefined, ownerApi: false});
    try {
        f.owner.onResume({refresh: false});
        const pending = f.owner.getItems({SearchTerm: 'movie', StartIndex: 0}, new AbortController().signal);
        await tick();
        assert.ok(connectionState.calls.length >= 2, 'the ApiClient is re-read at request commit');
        assert.equal(connectionState.calls.every(call => call.method === 'currentApiClient'), true,
            'the no-server search path always uses the canonical current ApiClient');
        assert.strictEqual(f.calls[0].signal.aborted, false);
        const result = {Items: [{Id: 'current-client'}], TotalRecordCount: 1};
        f.calls[0].item.resolve(result);
        assert.strictEqual(await pending, result);
    } finally { f.restore(); }
});

test('keeps explicit server fallback and owner ApiClient precedence', async () => {
    const explicit = setup('search', {serverId: 'server-b', ownerApi: false});
    const serverB = {getCurrentUserId() { return 'user-b'; }};
    connectionState.byServer.set('server-b', serverB);
    try {
        explicit.owner.onResume({refresh: false});
        const pending = explicit.owner.getItems({SearchTerm: 'movie'}, new AbortController().signal);
        await tick();
        assert.ok(connectionState.calls.length >= 2, 'the explicit server client is re-read at request commit');
        assert.equal(connectionState.calls.every(call => call.method === 'getApiClient' && call.serverId === 'server-b'), true,
            'an explicit server id remains bound to that server');
        explicit.calls[0].item.resolve({Items: [{Id: 'server-b'}]});
        await pending;
    } finally { explicit.restore(); }

    const owned = setup('search', {serverId: 'server-b'});
    try {
        owned.owner.onResume({refresh: false});
        const pending = owned.owner.getItems({SearchTerm: 'movie'}, new AbortController().signal);
        await tick();
        assert.deepEqual(connectionState.calls, [], 'an owner ApiClient takes precedence over connection lookup');
        owned.calls[0].item.resolve({Items: [{Id: 'owner-client'}]});
        await pending;
    } finally { owned.restore(); }
});

test('retires a response when implicit current ApiClient changes to a different client for the same user', async () => {
    for (const outcome of ['success', 'failure']) {
        const f = setup('search', {serverId: undefined, ownerApi: false});
        try {
            f.owner.onResume({refresh: false});
            f.container.classList.add('hide');
            f.status.textContent = 'prior-status';
            f.status.classList.remove('hide');
            const pending = f.owner.getItems({SearchTerm: 'movie', StartIndex: 0}, new AbortController().signal);
            await tick();
            connectionState.active = {getCurrentUserId() { return 'user-a'; }};
            if (outcome === 'success') f.calls[0].item.resolve({Items: [{Id: 'stale-client'}]});
            else f.calls[0].item.reject(new Error('stale client request error'));
            await assert.rejects(pending, isAbort);
            await tick();
            assert.equal(f.container.classList.contains('hide'), true, outcome + ' from an old ApiClient does not unhide results');
            assert.equal(f.status.textContent, 'prior-status', outcome + ' from an old ApiClient does not change status');
            assert.equal(f.status.classList.contains('hide'), false);
            assert.deepEqual(f.deliveries, []);
        } finally { f.restore(); }
    }
});

test('refresh, input invalidation, pause, and destroy retire pending results and keep lifecycle calls', async () => {
    for (const retire of ['refresh', 'input', 'pause', 'destroy']) {
        const f = setup();
        try {
            if (retire === 'refresh') {
                f.owner.onResume({refresh: false});
                const first = f.container.refreshItemsInternal();
                await tick();
                const second = f.container.refreshItemsInternal();
                await assert.rejects(first, isAbort);
                await tick();
                f.calls[0].item.resolve({Items: [{Id: 'stale'}]});
                f.calls[1].item.resolve({Items: [{Id: 'current'}]});
                await second;
                assert.deepEqual(f.deliveries.map(result => result.Items[0].Id), ['current']);
            } else {
                f.owner.onResume({refresh: false});
                const pending = f.owner.getItems({SearchTerm: 'movie'}, new AbortController().signal);
                await tick();
                if (retire === 'input') f.owner.invalidateSearch();
                else if (retire === 'pause') f.owner.onPause();
                else f.owner.destroy();
                await assert.rejects(pending, isAbort);
                f.calls[0].item.resolve({Items: [{Id: 'stale'}]});
                await tick();
                assert.deepEqual(f.deliveries, [], retire + ' prevents late result delivery');
            }
            if (retire === 'pause') {
                assert.equal(f.originals.pause, 1);
                assert.equal(f.owner._eteSearchBrowse.paused, true);
            }
            if (retire === 'destroy') {
                assert.equal(f.originals.destroy, 1);
                assert.equal(f.owner._eteSearchBrowse.destroyed, true);
            }
        } finally { f.restore(); }
    }
});

test('rejects a response after user identity changes and allows same-epoch paging', async () => {
    const f = setup();
    let user = 'user-a';
    f.api.getCurrentUserId = () => user;
    try {
        f.owner.onResume({refresh: false});
        const first = f.owner.getItems({SearchTerm: 'movie', StartIndex: 0}, new AbortController().signal);
        await tick();
        user = 'user-b';
        f.calls[0].item.resolve({Items: [{Id: 'previous-user'}]});
        await assert.rejects(first, isAbort);

        const second = f.owner.getItems({SearchTerm: 'movie', StartIndex: 30, Limit: 16}, new AbortController().signal);
        await tick();
        assert.deepEqual(f.calls[1].query, {SearchTerm: 'movie', StartIndex: 30, Limit: 16});
        const page = {Items: [{Id: 'page-two'}], TotalRecordCount: 65};
        f.calls[1].item.resolve(page);
        assert.strictEqual(await second, page);
        assert.equal(f.status.classList.contains('hide'), true, 'non-empty later pages do not display the empty status');
    } finally { f.restore(); }
});

test('reports empty and failed queries separately and a new successful search clears the error', async () => {
    const f = setup();
    try {
        f.owner.onResume({refresh: false});
        f.owner.searchFields.term = '';
        const blank = f.owner.getItems({SearchTerm: '', StartIndex: 0}, new AbortController().signal);
        await tick();
        f.calls[0].item.resolve({Items: [], TotalRecordCount: 0});
        await blank;
        assert.equal(f.status.classList.contains('hide'), true, 'blank input does not claim there are no matches');

        f.owner.searchFields.term = 'fixture';
        const empty = f.container.refreshItemsInternal();
        await tick();
        const emptyResponse = {Items: [], TotalRecordCount: 0};
        f.calls[1].item.resolve(emptyResponse);
        assert.strictEqual(await empty, emptyResponse, 'the original empty result remains available to ListController');
        assert.deepEqual(f.deliveries, [emptyResponse], 'the native ItemsContainer still receives empty results');
        assert.equal(f.status.classList.contains('hide'), true, 'helper does not duplicate the original empty-state message');

        f.owner.invalidateSearch();
        const failed = f.owner.getItems({SearchTerm: 'broken', StartIndex: 0}, new AbortController().signal);
        await tick();
        f.calls[2].item.reject(new Error('synthetic API failure'));
        await assert.rejects(failed, /synthetic API failure/);
        assert.equal(f.status.textContent, 'HeaderError');
        assert.equal(f.status.classList.contains('hide'), false);

        f.owner.onPause();
        assert.equal(f.status.classList.contains('hide'), false, 'leaving the page preserves completed error feedback');
        f.owner.onResume({refresh: false});
        assert.equal(f.originals.resume.at(-1).refresh, false);
        assert.equal(f.status.textContent, 'HeaderError');
        assert.equal(f.status.classList.contains('hide'), false, 'cached return without refresh retains the error');

        f.owner.invalidateSearch();
        const recovered = f.owner.getItems({SearchTerm: 'movie', StartIndex: 0}, new AbortController().signal);
        await tick();
        f.calls[3].item.resolve({Items: [{Id: 'recovered'}], TotalRecordCount: 1});
        await recovered;
        assert.equal(f.status.classList.contains('hide'), true);
    } finally { f.restore(); }
});

test('resume carries a pending refresh request into the original lifecycle', async () => {
    const f = setup();
    try {
        f.owner.onResume({refresh: false});
        const pending = f.owner.getItems({SearchTerm: 'movie'}, new AbortController().signal);
        await tick();
        f.owner.onPause();
        await assert.rejects(pending, isAbort);
        assert.equal(f.owner.onResume({refresh: false}), 'resume-result');
        assert.equal(f.originals.resume.length, 2);
        assert.equal(f.originals.resume[1].refresh, true);
    } finally { f.restore(); }
});
