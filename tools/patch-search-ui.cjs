'use strict';

function once(text, before, after) {
    if (typeof text !== 'string') throw new TypeError('Search source must be text.');
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    before = before.replace(/\n/g, eol);
    if (text.split(before).length !== 2) throw new Error('Search source contract mismatch: ' + before.slice(0, 80));
    return text.replace(before, after.replace(/\n/g, eol));
}

function patchSearchView(text) {
    text = once(text, 'events.on(self.searchFields,"search",function(e,value){self.searchResults.search(value)})',
        'events.on(self.searchFields,"search",function(e,value){self.searchResults.search(value)}),events.on(self.searchFields,"searchpending",function(){self.searchResults.invalidate()})');
    text = once(text, 'this.searchFields&&this.searchFields.pause()',
        'this.searchFields&&this.searchFields.pause(),this.searchResults&&this.searchResults.pause()');
    return once(text, 'this.searchFields&&this.searchFields.resume()',
        'this.searchResults&&this.searchResults.resume(this.searchFields&&this.searchFields._eteResumeSearch),this.searchFields&&this.searchFields.resume()');
}

function patchSearchResults(text) {
    const helper = 'function isCurrentSearch(instance,epoch){return !!instance.options&&!instance._eteSearchPaused&&instance._eteSearchEpoch===epoch}';
    text = once(text, 'function renderSearchTypes(instance,apiClient,context,value,types){',
        helper + 'function renderSearchTypes(instance,apiClient,context,value,types){var epoch=instance._eteSearchEpoch;');
    text = once(text, 'return populateResults(result,context,section,items)',
        'return isCurrentSearch(instance,epoch)?populateResults(result,context,section,items):[]');
    text = once(text, 'SearchResults.prototype.search=function(value){loading.show();',
        'SearchResults.prototype.search=function(value){if(!this.options||this._eteSearchPaused)return Promise.resolve();this._eteSearchValue=value;this.invalidate();var epoch=this._eteSearchEpoch;this._eteSearchPending=true;this._eteSearchLoading=true;loading.show();');
    text = once(text, '{instance:this,searchTerm:value}', '{instance:this,searchTerm:value,epoch:epoch}');
    text = once(text, 'return apiClient.getSearchResults(query).then(function(result){var subPromises=[];',
        'return apiClient.getSearchResults(query).then(function(result){if(!isCurrentSearch(instance,epoch))return [[],[]];context.querySelector(".searchCategories").classList.remove("hide");var subPromises=[];');
    text = once(text, '.then(function(itemsResponses){loading.hide();',
        '.then(function(itemsResponses){if(!isCurrentSearch(this.instance,this.epoch))return;this.instance._eteSearchPending=false;this.instance._eteSearchLoading=false;loading.hide();');
    text = once(text, 'function(){loading.hide();var options=this.options;options&&options.element.querySelector(".noResults").classList.remove("hide")}.bind(this)',
        'function(){if(!isCurrentSearch(this.instance,this.epoch))return;this.instance._eteSearchPending=false;this.instance._eteSearchLoading=false;loading.hide();var message=this.instance.options.element.querySelector(".noResults");message.textContent=globalize.translate("HeaderError");message.classList.remove("hide")}.bind(searchInfo)');
    text = once(text, 'SearchResults.prototype.destroy=function(){',
        'SearchResults.prototype.invalidate=function(clear){this._eteSearchEpoch=(this._eteSearchEpoch||0)+1;if(this._eteSearchLoading){this._eteSearchLoading=false;loading.hide()}if(clear!==false&&this.options){var elem=this.options.element;elem.querySelector(".globalResults").classList.add("hide");elem.querySelector(".searchCategories").classList.add("hide");elem.querySelector(".noResults").classList.add("hide")}},SearchResults.prototype.pause=function(){this._eteSearchPaused=true;this._eteNeedsResume=this._eteSearchPending;this.invalidate(false)},SearchResults.prototype.resume=function(fieldPending){this._eteSearchPaused=false;if(this._eteNeedsResume&&!fieldPending)this.search(this._eteSearchValue);this._eteNeedsResume=false},SearchResults.prototype.destroy=function(){this.pause();');
    return text;
}

function patchSearchFields(text) {
    text = once(text, '  function onSearchTimeout() {',
        '  function onSearchTimeout() {\n    this.searchTimeout = null;\n    if (!this.options || this._eteFieldsPaused || !this._eteEmbedded) return;\n    var epoch = this._eteFieldsEpoch;');
    text = once(text, '          apiClient.getItems(apiClient.getCurrentUserId(), options).then(function (result) {',
        '          apiClient.getItems(apiClient.getCurrentUserId(), options).then(function (result) {\n            if (!instance.options || instance._eteFieldsPaused || instance._eteFieldsEpoch !== epoch) return;');
    text = once(text, '                : searchSuggestions.classList.add("hide");\n          });',
        '                : searchSuggestions.classList.add("hide");\n          }, function () {\n            if (instance.options && !instance._eteFieldsPaused && instance._eteFieldsEpoch === epoch) {\n              context.querySelector(".searchSuggestions").classList.add("hide");\n              console.warn("Search suggestions unavailable.");\n            }\n          });');
    text = once(text, '  function triggerSearch(instance, value, immediate) {',
        '  function triggerSearch(instance, value, immediate) {\n    if (!instance.options || instance._eteFieldsPaused) return;\n    instance._eteResumeSearch = false;\n    instance._eteFieldsEpoch = (instance._eteFieldsEpoch || 0) + 1;\n    _events.default.trigger(instance, "searchpending", [value]);');
    text = once(text, '    require(["text!search/searchfields.template.html"]).then(function (responses) {',
        '    require(["text!search/searchfields.template.html"]).then(function (responses) {\n      if (instance.options !== options) return;');
    text = once(text, '        instance.focus();',
        '        instance._eteEmbedded = true;\n      if (!instance._eteFieldsPaused && instance._eteResumeRequested && !instance.firstLoad) {\n        instance.firstLoad = true;\n        onSearchTimeout.call(instance);\n      }\n      if (!instance._eteFieldsPaused) instance.focus();');
    text = once(text, '    (SearchFields.prototype.pause = function () {\n      this.destroyVoiceInput();',
        '    (SearchFields.prototype.pause = function () {\n      this._eteFieldsPaused = true;\n      this._eteFieldsEpoch = (this._eteFieldsEpoch || 0) + 1;\n      this._eteResumeSearch = !!this.searchTimeout;\n      if (this.searchTimeout) clearTimeout(this.searchTimeout);\n      this.searchTimeout = null;\n      this.destroyVoiceInput();');
    text = once(text, '    (SearchFields.prototype.resume = function () {\n      this.firstLoad || ((this.firstLoad = !0), onSearchTimeout.call(this));',
        '    (SearchFields.prototype.resume = function () {\n      this._eteFieldsPaused = false;\n      this._eteResumeRequested = true;\n      if (!this._eteEmbedded) return;\n      if (this._eteResumeSearch) {\n        this._eteResumeSearch = false;\n        triggerSearch(this, this.nextSearchValue, true);\n      } else this.firstLoad || ((this.firstLoad = !0), onSearchTimeout.call(this));');
    text = once(text, '  function SearchFields(options) {',
        '  function SearchFields(options) {\n    this.nextSearchValue = options.value;');
    return once(text, '    (SearchFields.prototype.destroy = function () {\n      this.destroyVoiceInput();',
        '    (SearchFields.prototype.destroy = function () {\n      this.pause();');
}

function patchApp(text) {
    return once(text, 'define("baseView", [], getDynamicImport("./modules/viewmanager/baseview.js")),',
        'define("ete-search-list", [], getDynamicImport("./../enhanced/search/list-search.js")),\n      define("baseView", [], getDynamicImport("./modules/viewmanager/baseview.js")),');
}

function patchListView(text) {
    text = once(text, '"./../modules/tabbedview/listcontroller.js"]', '"./../modules/tabbedview/listcontroller.js","ete-search-list"]');
    text = once(text, '_embyItemscontainer,_listcontroller){', '_embyItemscontainer,_listcontroller,_eteSearchList){');
    text = once(text, 'this.initItemsContainer(),params.parentId?', '_eteSearchList.install(this),this.initItemsContainer(),params.parentId?');
    text = once(text, 'this.searchFields.getSearchTerm()}.bind(this)))',
        'this.searchFields.getSearchTerm()}.bind(this)),_events.default.on(this.searchFields,"searchpending",function(){this.invalidateSearch()}.bind(this)))');
    text = once(text, '_baseview.default.prototype.onResume.apply(this,arguments),_listcontroller.default.prototype.resume.apply(this,arguments);',
        '_baseview.default.prototype.onResume.apply(this,arguments),_listcontroller.default.prototype.resume.apply(this,arguments);if(this._eteSearchBrowse&&this.searchFields)this.searchFields._eteFieldsPaused=false;');
    text = once(text, '(this).then(function(item){item?',
        '(this).then(function(item){if(instance._eteSearchBrowse&&(instance._eteSearchBrowse.paused||instance._eteSearchBrowse.destroyed))return;item?');
    return once(text, '.then(function(){var searchFields=instance.searchFields;',
        '.then(function(){if(instance._eteSearchBrowse&&(instance._eteSearchBrowse.paused||instance._eteSearchBrowse.destroyed))return;var searchFields=instance.searchFields;');
}

function patchListController(text) {
    return once(text, '              return result.ItemTypes && this.refreshSearchTabs(result.ItemTypes), result;',
        '              if (signal && signal.aborted) { var error = new Error("Search request retired."); error.name = "AbortError"; throw error; }\n              return result.ItemTypes && this.refreshSearchTabs(result.ItemTypes), result;');
}

function patchBrowseGuard(text) {
    if (!text.includes('this._eteMovieBrowse') || text.includes('this._eteSearchBrowse')) throw new Error('Search browse guard source contract mismatch.');
    return text.replaceAll('this._eteMovieBrowse', '(this._eteMovieBrowse || this._eteSearchBrowse)');
}

module.exports = {patchSearchView, patchSearchResults, patchSearchFields, patchApp, patchListView, patchListController, patchBrowseGuard};
