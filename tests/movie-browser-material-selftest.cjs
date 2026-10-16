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
