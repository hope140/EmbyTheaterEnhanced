'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const home = require('../tools/patch-server-home.cjs'), movie = require('../tools/patch-movie-browser.cjs'), search = require('../tools/patch-search-ui.cjs');
function composed(file, method) { return home[method](search.patchBrowseGuard(movie[method](fs.readFileSync(require('node:path').join(__dirname, '../vendor/web-snapshot/www/modules', file), 'utf8')))); }
const items = composed('emby-elements/emby-itemscontainer/emby-itemscontainer.js', 'patchItemsContainer');
const virtual = composed('virtual-scroller/virtual-scroller.js', 'patchVirtualScroller');
async function flush() { for (let i = 0; i < 15; i++) await Promise.resolve(); }

test('composed native Items submission rejects a retired Home response before accessing any DOM', () => {
    const start = items.indexOf('function onDataFetched(result) {'), end = items.indexOf('  function onItemDragStart(', start);
    assert.ok(start > 0 && end > start);
    const commit = vm.runInNewContext('(' + items.slice(start, end).trim() + ')');
    let checks = 0;
    commit.call({eteHomeFlowOwns() { checks++; return false; }, get onDataFetched() { throw Error('must not reach DOM'); }}, {Items: []});
    assert.equal(checks, 1);
});
test('native delayed focus/refresher continuation rechecks Home ownership after its existing delay', () => {
    const start = items.indexOf('function () {\n          if (browse'), end = items.indexOf('}.bind(this)', start) + 1;
    assert.ok(start > 0 && end > start);
    const callback = vm.runInNewContext('(' + items.slice(start, end) + ')', {browse: null, epoch: 1, hasActiveElement: false, listItemOptions: {}, result: {Items: []}});
    for (const allowed of [false, true]) {
        let calls = 0;
        callback.call({eteHomeFlowOwns: () => allowed, getAttribute: () => null, mergeRefreshOptions: () => calls++, afterRefresh: () => calls++});
        assert.equal(calls, allowed ? 2 : 0);
    }
});
test('composed native virtual chunks cannot commit after Home ownership retires', async () => {
    const start = virtual.indexOf('this.boundLoadItems = function () {') + 'this.boundLoadItems = '.length;
    const end = virtual.indexOf('}.bind(this)', start) + 1;
    for (const allowed of [false, true]) {
        let resets = 0;
        const owner = {startIndexToLoad: 12, virtualChunkSize: 12, chunksLoaded: {}, _itemSource: [], _itemSourceMap: {},
            fetchItems: () => Promise.resolve({Items: [{Id: 'synthetic'}]}), scroller: {requestReset() { resets++; }}, eteHomeFlowOwns: () => allowed};
        vm.runInNewContext('(' + virtual.slice(start, end) + ')', {AbortController, abortRequests(instance) { instance.currentAbortController?.abort(); }}).call(owner);
        await flush(); assert.equal(resets, allowed ? 1 : 0); assert.equal(owner._itemSource[12]?.Id, allowed ? 'synthetic' : undefined);
    }
});
test('Home transforms reject a changed input anchor instead of silently missing the commit checks', () => {
    assert.throws(() => home.patchItemsContainer(items), /anchor mismatch/);
    assert.throws(() => home.patchVirtualScroller(virtual), /anchor mismatch/);
});

test('user-moved native focus is skipped while the current refresher bookkeeping still completes', () => {
    const start = items.indexOf('function () {\n          if (browse'), end = items.indexOf('}.bind(this)', start) + 1;
    const callback = vm.runInNewContext('(' + items.slice(start, end) + ')', {browse: null, epoch: 1, hasActiveElement: true, listItemOptions: {}, result: {Items: []}});
    let bookkeeping = 0;
    callback.call({eteHomeFlowOwns: () => true, eteHomeFlowCanRestore: () => false,
        getAttribute: () => null, mergeRefreshOptions: () => bookkeeping++, afterRefresh: () => bookkeeping++});
    assert.equal(bookkeeping, 2);
});
