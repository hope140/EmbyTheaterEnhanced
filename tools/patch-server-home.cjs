'use strict';

const CACHE_ALIAS = 'define("ete-home-layout-cache", ["./../enhanced/page-cache/home-layout-cache.js"], function(cache) { return cache; })';

const DETAIL_CACHE_ALIAS='define("ete-detail-cache-store", ["./../enhanced/detail-cache/store.js"], function(cache) { return cache; })';
// ItemPage consumes the AMD namespace (detailCache.default), unlike the Home
// controller alias, whose consumer expects the unwrapped default directly.
const DETAIL_PAGE_ALIAS='define("ete-detail-page-cache", ["./../enhanced/detail-cache/page.js"], function(cache) { return cache; })';

function once(text, anchor, replacement) {
    if (text.split(anchor).length !== 2) throw new Error('Server home anchor mismatch.');
    return text.replace(anchor, replacement);
}
function patchHomeTab(text) {
    text = once(text, '"./../modules/emby-apiclient/connectionmanager.js"]',
        '"./../modules/emby-apiclient/connectionmanager.js","ete-server-home"]');
    text = once(text, '_embyItemscontainer,_connectionmanager){', '_embyItemscontainer,_connectionmanager,_eteHome){');
    text = once(text, 'this.sectionsContainer=view.querySelector(".sections"),',
        'this.sectionsContainer=view.querySelector(".sections"),this.eteHome=_eteHome.create(this,{legacy:_homesections.default,loading:_loading.default,focus:_focusmanager.default,connection:_connectionmanager.default}),');
    const resumeStart = 'HomeTab.prototype.onResume=function(options){';
    const refreshStart = 'HomeTab.prototype.refresh=function(options){';
    const pauseStart = 'HomeTab.prototype.onPause=function(){';
    function replaceMethod(source, from, to, body) {
        if (source.split(from).length !== 2 || source.split(to).length !== 2) throw new Error('Server home method anchor mismatch.');
        const start = source.indexOf(from), end = source.indexOf(to, start);
        if (end < start) throw new Error('Server home method order mismatch.');
        return source.slice(0, start) + body + source.slice(end);
    }
    text = replaceMethod(text, resumeStart, refreshStart,
        'HomeTab.prototype.onResume=function(options){_basetab.default.prototype.onResume.apply(this,arguments);return this.eteHome.resume(options)},');
    text = replaceMethod(text, refreshStart, pauseStart,
        'HomeTab.prototype.refresh=function(options){return this.eteHome.refresh(options)},');
    text = once(text, 'sectionsContainer&&_homesections.default.pause(sectionsContainer)', 'this.eteHome.pause()');
    text = once(text, 'HomeTab.prototype.destroy=function(){_basetab.default.prototype.destroy.apply(this,arguments)',
        'HomeTab.prototype.destroy=function(){this.eteHome.dispose(),_basetab.default.prototype.destroy.apply(this,arguments)');
    text = once(text, 'sectionsContainer&&(sectionsContainer.innerHTML="")', 'this.eteHome.clear()');
    return text;
}
function patchApp(text) {
    if (text.includes('define("ete-server-home",')) throw new Error('Server home anchor mismatch.');
    return once(text, 'define("baseView", [], getDynamicImport("./modules/viewmanager/baseview.js")),',
        CACHE_ALIAS + ',\n      ' + DETAIL_CACHE_ALIAS + ',\n      ' + DETAIL_PAGE_ALIAS + ',\n      define("ete-server-home", [], getDynamicImport("./../enhanced/home/home-tab.js")),\n' +
        '      define("baseView", [], getDynamicImport("./modules/viewmanager/baseview.js")),');
}
function patchHomeView(text) {
    if (text.includes('eteHomeRestoreState')) throw new Error('Home view anchor mismatch.');
    text = once(text, 'HomeView.prototype.onPause=',
        'HomeView.prototype.eteHomeRestoreState=function(){var tab=this.tabControllers&&this.tabControllers[0],owner=tab&&tab.eteHome;return owner&&owner.restoreEnabled?{enabled:true,allowed:this.currentTabController===tab&&owner.canRestore()}:null},HomeView.prototype.onPause=');
    return text;
}
// Select only from the native three-slot owner. No pinned view, copied DOM or data pool.
function homeRestoreHelpers() {
    function eteHomeRestoreIndex(options) {
        if (!options || options.type !== 'home') return null;
        var managed = false;
        for (var index = allPages.length - 1; index >= 0; index--) {
            var view = allPages[index];
            if (!view || currentUrls[index] !== options.url || !view.controller || typeof view.controller.eteHomeRestoreState !== 'function') continue;
            var state;
            try { state = view.controller.eteHomeRestoreState(); }
            catch (_) { state = {enabled: true, allowed: false}; }
            if (!state || !state.enabled) continue;
            managed = true;
            if (view.allowRestore !== false && state.allowed) return index;
        }
        return managed ? -1 : null;
    }
    function eteHomeRestoreCheck(options, view) {
        var index = eteHomeRestoreIndex(options);
        if (index !== null && (index < 0 || allPages[index] !== view)) throw new Error('Home restore unavailable.');
    }
}
function patchViewManager(text) {
    if (text.includes('eteHomeRestoreIndex')) throw new Error('Home view manager anchor mismatch.');
    text = once(text, 'function ViewManager(){}', homeRestoreHelpers.toString().replace(/\r\n/g, '\n').replace(/^function homeRestoreHelpers\(\) \{/, '').replace(/\}$/, '') +
        'function ViewManager(){}ViewManager.prototype.canRestoreHome=function(options){var index=eteHomeRestoreIndex(options);return index!==null&&index>=0};');
    text = once(text, 'index=currentUrls.indexOf(url);if(-1!==index)',
        'index=eteHomeRestoreIndex(options);if(index===null)index=currentUrls.indexOf(url);if(-1!==index)');
    // Forward Home navigation can restore the already-current native slot.
    // Keep its original pause/resume cycle, but never hide that same view as
    // the previous page after revealing it.
    text = once(text, 'return view.classList.remove("hide"),selectedPageIndex=index,!previousView||controller&&controller.hidesPreviousView||previousView.classList.add("hide")',
        'return view.classList.remove("hide"),selectedPageIndex=index,!previousView||previousView===view||controller&&controller.hidesPreviousView||previousView.classList.add("hide")');
    return once(text, 'return setControllerClass(view,options).then(function(){eteCheck(epoch,signal);console.log',
        'return setControllerClass(view,options).then(function(){eteCheck(epoch,signal);eteHomeRestoreCheck(options,view);console.log');
}
function patchRouter(text) {
    if (text.includes('canRestoreHome(currentRequest)')) throw new Error('Home router anchor mismatch.');
    return once(text, '              isBackNav\n                ? _viewmanager.default.tryRestoreView',
        '              (isBackNav || route.type === "home" && typeof _viewmanager.default.canRestoreHome === "function" && _viewmanager.default.canRestoreHome(currentRequest))\n                ? _viewmanager.default.tryRestoreView');
}
function patchItemsContainer(text) {
    if (text.includes('eteHomeFlowOwns')) throw new Error('Home flow anchor mismatch.');
    // This opt-in hook belongs to the Home controller, not a transport/global
    // cache. Other pages have no hook and retain their existing behavior.
    text = once(text, 'function onDataFetched(result) {',
        'function onDataFetched(result) {\n    if (this.eteHomeFlowOwns && !this.eteHomeFlowOwns(result)) return;');
    return once(text, '          hasActiveElement &&',
        '          if (this.eteHomeFlowOwns && !this.eteHomeFlowOwns(result)) return;\n          hasActiveElement && (!this.eteHomeFlowCanRestore || this.eteHomeFlowCanRestore(result)) &&');
}
function patchVirtualScroller(text) {
    if (text.includes('eteHomeFlowOwns')) throw new Error('Home flow anchor mismatch.');
    return once(text, '                var items = result.Items || result,',
        '                if (instance.eteHomeFlowOwns && !instance.eteHomeFlowOwns(result)) return;\n                var items = result.Items || result,');
}
module.exports = {CACHE_ALIAS, DETAIL_CACHE_ALIAS, DETAIL_PAGE_ALIAS, patchHomeView, patchViewManager, patchRouter, patchHomeTab, patchApp, patchItemsContainer, patchVirtualScroller};
