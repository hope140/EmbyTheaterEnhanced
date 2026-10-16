'use strict';
function once(text, anchor, replacement) {
    if (text.split(anchor).length !== 2) throw new Error('Movie browser anchor mismatch.');
    return text.replace(anchor, replacement);
}
function patchVideosTab(text) {
    text = once(text, '"./../common/globalize.js"]', '"./../common/globalize.js","ete-movie-browser"]');
    text = once(text, 'function(_exports,_itemstab,_globalize){', 'function(_exports,_itemstab,_globalize,_eteMovieBrowser){');
    return once(text, '_itemstab.default.call(this,view,params)}', '_itemstab.default.call(this,view,params),_eteMovieBrowser.install(this)}');
}
function patchListController(text) {
    if (text.includes('this._eteMovieBrowse')) throw new Error('Movie browser anchor mismatch.');
    return once(text, 'apiClient[initialQuery](apiClient.getCurrentUserId(), queryInfo.query);',
        'this._eteMovieBrowse ? apiClient[initialQuery](apiClient.getCurrentUserId(), queryInfo.query, signal) : apiClient[initialQuery](apiClient.getCurrentUserId(), queryInfo.query);');
}
function patchItemsTab(text) {
    text = once(text, 'this.itemsContainer.resume(options).then(function (result) {',
        'var pending = this.itemsContainer.resume(options), browse = this._eteMovieBrowse, epoch = browse && browse.epoch;\n      return pending.then(function (result) {\n        if (browse && (browse.paused || browse.destroyed || browse.epoch !== epoch)) return;');
    text = once(text, 'this.itemsContainer.refreshItems(options).then(function (result) {',
        'var pending = this.itemsContainer.refreshItems(options), browse = this._eteMovieBrowse, epoch = browse && browse.epoch;\n      return pending.then(function (result) {\n        if (browse && (browse.paused || browse.destroyed || browse.epoch !== epoch)) return;');
    return once(text, '(ItemsTab.prototype.onPause = function () {',
        '(ItemsTab.prototype.onPause = function () {\n      if (this._eteMovieBrowse) _loading.default.hide();');
}
function patchApp(text) {
    if (text.includes('define("ete-movie-browser",')) throw new Error('Movie browser anchor mismatch.');
    return once(text, 'define("baseView", [], getDynamicImport("./modules/viewmanager/baseview.js")),',
        'define("ete-movie-browser", [], getDynamicImport("./../enhanced/library/movie-browser.js")),\n      define("baseView", [], getDynamicImport("./modules/viewmanager/baseview.js")),');
}
function patchMovieCategories(text) {
    return once(text, 'url+="&tab="+e[1]', 'url+="&tab="+("movies"===e[1]?"videos":e[1])');
}
function patchItemsContainer(text) {
    text = once(text, 'query = ((this.currentAbortController = abortController), {}),',
        'query = ((this.currentAbortController = abortController), {}),\n              browse = this._eteMovieBrowse, epoch = browse && browse.epoch,');
    text = once(text, 'this.fetchData(query, abortController.signal).then(onDataFetched.bind(this), onGetItemsFailed)',
        'this.fetchData(query, abortController.signal).then(function (result) {\n                if (browse && (browse.paused || browse.destroyed || browse.epoch !== epoch || abortController.signal.aborted || this.currentAbortController !== abortController)) return;\n                return onDataFetched.call(this, result);\n              }.bind(this), onGetItemsFailed)');
    text = once(text, 'function onDataFetched(result) {',
        'function onDataFetched(result) {\n    var browse = this._eteMovieBrowse, epoch = browse && browse.epoch;');
    return once(text, 'function () {\r\n          hasActiveElement &&',
        'function () {\n          if (browse && (browse.paused || browse.destroyed || browse.epoch !== epoch)) return;\n          hasActiveElement &&');
}
function patchVirtualScroller(text) {
    // A fulfilled callback can retire after pause just like a rejection; neither
    // outcome may leave its marker stuck or clear a newer Movie request's marker.
    text = once(text, 'index = this.startIndexToLoad;',
        'index = this.startIndexToLoad, browse = this._eteMovieBrowse, epoch = browse && browse.epoch, chunkToken;\n        function retireOwnedMovieChunk() {\n          if (browse && instance && instance.chunksLoaded && instance.chunksLoaded[chunkStart] === chunkToken) instance.chunksLoaded[chunkStart] = null;\n        }');
    text = once(text, 'this.chunksLoaded[chunkStart] = !0',
        'this.chunksLoaded[chunkStart] = chunkToken = browse ? {} : !0');
    text = once(text, 'function (result) {\r\n                var items = result.Items || result,',
        'function (result) {\n                if (browse && (browse.paused || browse.destroyed || browse.epoch !== epoch || index.signal.aborted || instance.currentAbortController !== index)) { retireOwnedMovieChunk(); return; }\n                var items = result.Items || result,');
    return once(text, 'function (error) {\r\n                instance.chunksLoaded[chunkStart] = null;',
        'function (error) {\n                if (browse) {\n                  retireOwnedMovieChunk();\n                  if (browse.paused || browse.destroyed || browse.epoch !== epoch) return;\n                } else instance.chunksLoaded[chunkStart] = null;');
}
module.exports = {patchVideosTab, patchListController, patchItemsTab, patchApp, patchMovieCategories, patchItemsContainer, patchVirtualScroller};
