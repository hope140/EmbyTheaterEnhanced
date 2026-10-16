'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const patch = require('../tools/patch-movie-browser.cjs');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, 'vendor/carnival/electronapp/www', name), 'utf8');
function amd(text, dependencies) {
    let exported;
    const define = (names, factory) => {
        const exports = {};
        factory(...Array.from(names, name => name === 'exports' ? exports : dependencies[name] || {default: {}}));
        exported = exports.default;
    };
    define.amd = {};
    vm.runInNewContext(text, {define, AbortController, Set, Promise, Error}, {timeout: 1000});
    return exported;
}
async function fixture(patched = true, explicitServer = true) {
    const calls = [], results = [], loading = [], focus = [];
    const api = {getCurrentUserId: () => 'fixture-user', getItems(user, query, signal) {
        return new Promise((resolve, reject) => calls.push({user, query, signal, resolve, reject}));
    }};
    const connection = {currentApiClient: () => api, getApiClient: () => api};
    const helper = amd(fs.readFileSync(path.join(root, 'src/electronapp/enhanced/library/movie-browser.js'), 'utf8'),
        {'modules/emby-apiclient/connectionmanager.js': {default: connection}});
    const app = read('app.js');
    const unwrap = app.slice(app.indexOf('function returnFirstDependencyDefault('), app.indexOf('function enableNativeGamepadKeyMapping('));
    const importer = app.slice(app.indexOf('function getDynamicImport(path)'), app.indexOf('function importFromPath('));
    const alias = await vm.runInNewContext(unwrap + importer + 'getDynamicImport("fixture")()', {require: () => Promise.resolve([{default: helper}])});
    assert.equal(alias, helper);
    function Base() {}
    Base.prototype.onResume = function () {};
    Base.prototype.onPause = function () {};
    Base.prototype.destroy = function () {};
    const dependencies = {'./basetab.js': {default: Base}, './../emby-apiclient/connectionmanager.js': {default: connection},
        './../loading/loading.js': {default: {show: () => loading.push('show'), hide: () => loading.push('hide')}}};
    const List = amd(patched ? patch.patchListController(read('modules/tabbedview/listcontroller.js')) : read('modules/tabbedview/listcontroller.js'), dependencies);
    const Items = amd(patched ? patch.patchItemsTab(read('modules/tabbedview/itemstab.js')) : read('modules/tabbedview/itemstab.js'), {...dependencies, './listcontroller.js': {default: List}});
    const Videos = amd(patched ? patch.patchVideosTab(read('modules/tabbedview/videostab.js')) : read('modules/tabbedview/videostab.js'), {'./itemstab.js': {default: Items}, 'ete-movie-browser': alias});
    const containerSource = read('modules/emby-elements/emby-itemscontainer/emby-itemscontainer.js');
    const text = patched ? patch.patchItemsContainer(containerSource) : containerSource;
    const marker = 'key: "refreshItemsInternal",';
    const start = text.indexOf('value: function () {', text.indexOf(marker)) + 'value: '.length;
    const end = text.indexOf('\n          },', start) + '\n          }'.length;
    const refresh = vm.runInNewContext('(' + text.slice(start, end) + ')', {AbortController,
        abortRequests(instance) { if (instance.currentAbortController) instance.currentAbortController.abort(); },
        getVirtualChunkSize: () => 30, onGetItemsFailed() {}, onDataFetched(result) { results.push(result); }});
    const container = {paused: true, setAttribute() {}, addEventListener() {}, refreshItemsInternal: refresh,
        refreshItems() { return this.refreshItemsInternal(); }, pause() { this.paused = true; },
        resume(options) { this.paused = false; return options.refresh ? this.refreshItems() : Promise.resolve(); }};
    const owner = new Videos({querySelector: () => container}, {serverId: explicitServer ? 'fixture-server' : undefined, parentId: 'library', type: 'videos'}, {itemType: 'Movie'});
    owner.virtualChunkSize = () => 30;
    owner.requestedItemFields = 'BasicSyncInfo';
    owner.getSortMenuOptions = () => [{value: 'SortName'}];
    owner.getSortValues = () => ({sortBy: 'SortName', sortOrder: 'Descending'});
    owner.getViewSettings = () => ({imageType: 'primary', fields: ['Name']});
    owner.enableAlphaPicker = () => false;
    owner.getQueryIncludeItemTypes = () => ['Movie'];
    owner.isGlobalQuery = () => false;
    owner.getFilters = () => ({IsUnplayed: true, Years: '2024'});
    owner.setFilterStatus = value => assert.equal(value, true);
    owner.supportsAlphaPicker = () => false;
    owner.updateSortText = () => {};
    owner.configureScrollingForView = () => {};
    owner.autoFocus = () => focus.push('focus');
    owner.initItemsContainer();
    return {owner, container, calls, results, loading, focus};
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('frozen baseline reproduces missing query signal and stale refresh submission', async () => {
    const f = await fixture(false);
    f.owner.onResume({refresh: true}); await tick();
    f.owner.refresh({autoFocus: false}); await tick();
    assert.equal(f.calls[0].signal, undefined);
    f.calls[1].resolve({Items: [{Id: 'new'}]}); await tick();
    f.calls[0].resolve({Items: [{Id: 'old'}]}); await tick();
    assert.deepEqual(f.results.map(result => result.Items[0].Id), ['new', 'old']);
});
test('native AMD unwrap and pinned controllers cancel old refresh without stale rows or autofocus', async () => {
    const f = await fixture();
    const first = f.owner.onResume({refresh: true, autoFocus: true}); await tick();
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].query.Limit, 30);
    assert.equal(f.calls[0].query.Years, '2024');
    const next = f.owner.refresh({autoFocus: true}); await tick();
    assert.equal(f.calls[0].signal.aborted, true);
    const result = {Items: [{Id: 'new'}], TotalRecordCount: 65};
    f.calls[1].resolve(result); await next;
    f.calls[0].resolve({Items: [{Id: 'old'}]}); await first;
    assert.deepEqual(f.results, [result]); assert.deepEqual(f.focus, ['focus']);
    const page = f.container.fetchData({StartIndex: 30, Limit: 30}); await tick();
    assert.equal(f.calls[2].query.StartIndex, 30); assert.equal(f.calls[2].query.Filters, 'IsUnplayed');
    const pageResult = {Items: [{Id: 'page-2'}]}; f.calls[2].resolve(pageResult); assert.equal(await page, pageResult);
    const leaving = f.owner.refresh({autoFocus: true}); await tick();
    f.owner.onPause(); assert.equal(f.calls[3].signal.aborted, true);
    f.calls[3].resolve({Items: [{Id: 'late'}]}); await leaving;
    assert.deepEqual(f.results, [result]); assert.deepEqual(f.focus, ['focus']);
});
test('current API failure retains original error path and subsequent refresh can recover', async () => {
    const f = await fixture();
    const first = f.owner.onResume({refresh: true}); await tick();
    f.calls[0].reject(new Error('fixture server failure')); await first;
    assert.deepEqual(f.results, []);
    const next = f.owner.refresh({autoFocus: true}); await tick();
    const result = {Items: [], TotalRecordCount: 0}; f.calls[1].resolve(result); await next;
    assert.deepEqual(f.results, [result]);
});
test('canonical current connection works without serverId and cached resume does not refetch', async () => {
    const f = await fixture(true, false);
    const first = f.owner.onResume({refresh: true}); await tick();
    f.calls[0].resolve({Items: []}); await first;
    f.container.savedPosition = 30;
    f.owner.onPause(); await f.owner.onResume({refresh: false});
    assert.equal(f.calls.length, 1);
    assert.equal(f.container.savedPosition, 30);
    assert.equal(f.owner.apiClient, undefined);
});
test('already fulfilled first-page response is checked again at the DOM submission boundary', async () => {
    const f = await fixture();
    await f.owner.onResume({refresh: false});
    f.container.fetchData = () => Promise.resolve({Items: [{Id: 'already-ready'}]});
    const pending = f.container.refreshItemsInternal();
    f.owner.onPause();
    await pending;
    assert.deepEqual(f.results, []);
});
test('the native delayed focus and refresh-monitor callback also belongs to the current movie query', () => {
    const text = patch.patchItemsContainer(read('modules/emby-elements/emby-itemscontainer/emby-itemscontainer.js'));
    const start = text.indexOf('function () {\n          if (browse &&');
    const end = text.indexOf('}.bind(this)', start) + 1;
    for (const stale of [false, true]) {
        const browse = {epoch: stale ? 2 : 1, paused: false}; let callbacks = 0;
        const callback = vm.runInNewContext('(' + text.slice(start, end) + ')', {browse, epoch: 1, hasActiveElement: false,
            listItemOptions: {}, result: {Items: []}});
        callback.call({getAttribute: () => null, mergeRefreshOptions: () => callbacks++, afterRefresh: () => callbacks++});
        assert.equal(callbacks, stale ? 0 : 2);
    }
});
function virtualLoad(patched, instance) {
    const input = read('modules/virtual-scroller/virtual-scroller.js');
    const text = patched ? patch.patchVirtualScroller(input) : input;
    const start = text.indexOf('this.boundLoadItems = function () {') + 'this.boundLoadItems = '.length;
    const end = text.indexOf('}.bind(this)', start) + 1;
    return vm.runInNewContext('(' + text.slice(start, end) + ')', {AbortController,
        abortRequests(owner) { if (owner.currentAbortController) owner.currentAbortController.abort(); }}).call(instance);
}
function virtualInstance(state, fetchItems) {
    return {startIndexToLoad: 30, virtualChunkSize: 30, chunksLoaded: {}, _itemSource: [], _itemSourceMap: {},
        _eteMovieBrowse: state, fetchItems, scroller: {requestReset() {}}, currentAbortController: null};
}
function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return {promise, resolve, reject};
}
function isTruthyChunkMarker(instance, chunkStart = 30) { return !!instance.chunksLoaded[chunkStart]; }
test('pinned virtual-scroller discards fulfilled stale chunks at the item-source boundary', async () => {
    for (const patched of [false, true]) {
        let resets = 0;
        const state = {epoch: 0, paused: false, destroyed: false};
        const owner = {startIndexToLoad: 30, virtualChunkSize: 30, chunksLoaded: {}, _itemSource: [], _itemSourceMap: {},
            _eteMovieBrowse: state, fetchItems: () => Promise.resolve({Items: [{Id: 'old-page'}]}), scroller: {requestReset() { resets++; }}};
        virtualLoad(patched, owner);
        state.epoch++;
        await tick();
        assert.equal(!!owner._itemSource[30], !patched);
        assert.equal(resets, patched ? 0 : 1);
    }
});
test('stale virtual chunk failure cannot reset the new query chunk tracking', async () => {
    let reject;
    const state = {epoch: 0, paused: false, destroyed: false};
    const owner = {startIndexToLoad: 30, virtualChunkSize: 30, chunksLoaded: {}, _eteMovieBrowse: state,
        fetchItems: () => new Promise((resolve, failure) => { reject = failure; })};
    virtualLoad(true, owner);
    state.epoch++; owner.chunksLoaded = {30: 'new-query'};
    reject(new Error('old chunk failure')); await tick();
    assert.equal(owner.chunksLoaded[30], 'new-query');
});
test('an aborted chunk in the same query remains retryable after scrolling elsewhere', async () => {
    let reject;
    const owner = {startIndexToLoad: 30, virtualChunkSize: 30, chunksLoaded: {}, _eteMovieBrowse: {epoch: 0, paused: false},
        fetchItems: () => new Promise((resolve, failure) => { reject = failure; })};
    virtualLoad(true, owner);
    owner.currentAbortController.abort(); owner.currentAbortController = new AbortController();
    reject(new Error('chunk aborted')); await tick();
    assert.equal(owner.chunksLoaded[30], null);
});
test('real Movie wrapper pause and resume without refresh releases a cancelled virtual chunk for retry', async () => {
    const f = await fixture();
    const instance = virtualInstance(f.owner._eteMovieBrowse,
        (query, signal) => f.owner.itemsContainer.fetchData(query, signal));
    f.owner.onResume({refresh: false});

    virtualLoad(true, instance);
    await tick();
    assert.equal(f.calls.length, 1);
    assert.equal(isTruthyChunkMarker(instance), true);

    f.owner.onPause();
    await tick();
    assert.equal(f.calls[0].signal.aborted, true, 'the maintained Movie wrapper aborts the in-flight request');
    assert.equal(isTruthyChunkMarker(instance), false,
        'a stale failure releases its own in-flight chunk marker');

    f.owner.onResume({refresh: false});
    virtualLoad(true, instance);
    await tick();
    assert.equal(f.calls.length, 2, 'resume(refresh:false) retries the same uncached chunk on the retained scroller');
    f.calls[0].resolve({Items: [{Id: 'old-paused-result'}]});
    f.calls[1].resolve({Items: [{Id: 'resumed-result'}]});
    await tick();
    assert.equal(instance._itemSource[30].Id, 'resumed-result');
});
test('fulfilled Movie chunk retired before callback commit releases its marker and can retry', async () => {
    const state = {epoch: 0, paused: false, destroyed: false}, calls = [];
    const owner = virtualInstance(state, () => {
        calls.push(calls.length + 1);
        return Promise.resolve({Items: [{Id: 'ready-before-retire'}]});
    });
    virtualLoad(true, owner);
    assert.equal(isTruthyChunkMarker(owner), true);
    // The transport is fulfilled, but its .then callback has not committed yet.
    state.epoch++;
    state.paused = true;
    await tick();
    assert.deepEqual(owner._itemSource, [], 'retired success must not enter the item source');
    assert.equal(isTruthyChunkMarker(owner), false, 'the stale success releases only its own marker');

    state.paused = false;
    virtualLoad(true, owner);
    await tick();
    assert.equal(calls.length, 2, 'the retired fulfilled chunk is retryable');
    assert.equal(owner._itemSource[30].Id, 'ready-before-retire');
});
test('old query success and failure cannot release a newer query chunk token', async () => {
    for (const oldOutcome of ['success', 'failure']) {
        const state = {epoch: 0, paused: false, destroyed: false}, requests = [];
        const owner = virtualInstance(state, () => {
            const item = deferred(); requests.push(item); return item.promise;
        });
        virtualLoad(true, owner);
        const oldToken = owner.chunksLoaded[30];
        state.epoch++;
        owner.chunksLoaded = {}; // Frozen setItemSource starts the new query's map.
        virtualLoad(true, owner);
        const newToken = owner.chunksLoaded[30];
        assert.notEqual(newToken, oldToken, 'each query request owns a distinct marker');

        if (oldOutcome === 'success') requests[0].resolve({Items: [{Id: 'old-query'}]});
        else requests[0].reject(new Error('old query failed'));
        await tick();
        assert.strictEqual(owner.chunksLoaded[30], newToken,
            'a late old-query outcome cannot clear the new query marker');
        assert.deepEqual(owner._itemSource, [], 'the old query cannot submit rows');

        requests[1].resolve({Items: [{Id: 'new-query'}]});
        await tick();
        assert.equal(owner._itemSource[30].Id, 'new-query');
    }
});
test('same-epoch replacement request keeps its chunk marker when the old owner completes late', async () => {
    for (const oldOutcome of ['success', 'failure']) {
    const state = {epoch: 0, paused: false, destroyed: false}, requests = [];
    const owner = virtualInstance(state, (_query, signal) => {
        const item = deferred(); requests.push({item, signal}); return item.promise;
    });
    virtualLoad(true, owner);
    const oldToken = owner.chunksLoaded[30];
    const originalMap = owner.chunksLoaded;
    owner.chunksLoaded[30] = null; // Retry the slot without replacing its query map.
    virtualLoad(true, owner);
    const newToken = owner.chunksLoaded[30];
    assert.notEqual(newToken, oldToken, 'same-epoch replacement request has a fresh marker');
    assert.strictEqual(owner.chunksLoaded, originalMap, 'ownership is checked within the same map');
    assert.equal(requests[0].signal.aborted, true, 'the scroller retires the old request owner');

    if (oldOutcome === 'success') requests[0].item.resolve({Items: [{Id: 'old-owner'}]});
    else requests[0].item.reject(Object.assign(new Error('old owner failed'), {name: 'AbortError'}));
    await tick();
    assert.strictEqual(owner.chunksLoaded[30], newToken,
        'old same-epoch outcome cannot null the replacement request marker');
    assert.deepEqual(owner._itemSource, [], 'old same-epoch success cannot submit rows');

    requests[1].item.resolve({Items: [{Id: 'replacement-owner'}]});
    await tick();
    assert.equal(owner._itemSource[30].Id, 'replacement-owner');
    }
});
test('current failure clears its own Movie marker for retry and normal success remains cached', async () => {
    const requests = [];
    const owner = virtualInstance({epoch: 0, paused: false, destroyed: false}, () => {
        const item = deferred(); requests.push(item); return item.promise;
    });
    virtualLoad(true, owner);
    requests[0].reject(new Error('current chunk failure'));
    await tick();
    assert.equal(isTruthyChunkMarker(owner), false, 'the current failed request releases its own marker');

    virtualLoad(true, owner);
    assert.equal(requests.length, 2, 'a current failure can retry the chunk');
    requests[1].resolve({Items: [{Id: 'loaded'}]});
    await tick();
    assert.equal(isTruthyChunkMarker(owner), true, 'successful chunks remain cached');

    virtualLoad(true, owner);
    assert.equal(requests.length, 2, 'a successful chunk is not fetched a second time');
});
test('non-Movie virtual scrolling retains its original true/null marker behavior', async () => {
    for (const patched of [false, true]) {
        const requests = [];
        const owner = virtualInstance(undefined, () => {
            const item = deferred(); requests.push(item); return item.promise;
        });
        delete owner._eteMovieBrowse;
        virtualLoad(patched, owner);
        assert.equal(owner.chunksLoaded[30], true);
        requests[0].reject(new Error('ordinary list failure'));
        await tick();
        assert.equal(owner.chunksLoaded[30], null, 'ordinary list failure keeps the frozen null reset');

        virtualLoad(patched, owner);
        assert.equal(requests.length, 2);
        requests[1].resolve({Items: [{Id: 'ordinary-list'}]});
        await tick();
        assert.equal(owner.chunksLoaded[30], true, 'ordinary list success keeps the frozen truthy marker');

        virtualLoad(patched, owner);
        assert.equal(requests.length, 2, 'ordinary list success remains cached');
    }
});
test('patches are bounded, syntax-valid and reject shifted or repeated anchors', () => {
    for (const [method, file] of [['patchVideosTab', 'modules/tabbedview/videostab.js'], ['patchItemsTab', 'modules/tabbedview/itemstab.js'],
        ['patchListController', 'modules/tabbedview/listcontroller.js'], ['patchMovieCategories', 'home_horiz/views.movies.js'],
        ['patchItemsContainer', 'modules/emby-elements/emby-itemscontainer/emby-itemscontainer.js'],
        ['patchVirtualScroller', 'modules/virtual-scroller/virtual-scroller.js'], ['patchApp', 'app.js']]) {
        const output = patch[method](read(file));
        assert.doesNotThrow(() => new vm.Script(output));
        assert.throws(() => patch[method](output), /anchor mismatch/);
    }
    const categories = patch.patchMovieCategories(read('home_horiz/views.movies.js'));
    assert.ok(categories.includes('"movies"===e[1]?"videos":e[1]'));
    assert.ok(read('videos/videos.js').includes('id:"videos"'));
});
