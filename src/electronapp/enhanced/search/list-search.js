(function (factory) {
    if (typeof define === 'function' && define.amd) define(['exports', 'modules/emby-apiclient/connectionmanager.js', 'modules/common/globalize.js'], function (exports, connection, globalize) { exports.default = factory(connection.default, globalize.default); });
    else if (typeof module === 'object' && module.exports) module.exports = factory();
}(function (connection, globalize) {
    'use strict';
    function cancelled() { var error = new Error('Search request retired.'); error.name = 'AbortError'; return error; }
    function install(owner) {
        if (!owner.params || owner.params.type !== 'search' || owner._eteSearchBrowse) return;
        var state = owner._eteSearchBrowse = {epoch: 0, paused: true, destroyed: false, pending: false};
        var requests = new Set(), status;
        function invalidate(hide) {
            state.epoch++;
            Array.from(requests).forEach(function (cancel) { cancel(); });
            if (hide && owner.itemsContainer) owner.itemsContainer.classList.add('hide');
            if (status && hide) status.classList.add('hide');
        }
        var getItems = owner.getItems;
        owner.getItems = function (query, signal) {
            if (state.paused || state.destroyed || signal && signal.aborted) return Promise.reject(cancelled());
            var epoch = state.epoch, api = owner.apiClient || connection.getApiClient(owner.params.serverId), user = api.getCurrentUserId();
            var controller = new AbortController();
            state.pending = true;
            return new Promise(function (resolve, reject) {
                var settled = false;
                function current() { return !state.paused && !state.destroyed && state.epoch === epoch && api.getCurrentUserId() === user; }
                function finish(error, result) {
                    if (settled) return;
                    settled = true;
                    requests.delete(cancel);
                    if (signal) signal.removeEventListener('abort', cancel);
                    if (!requests.size) state.pending = false;
                    if (error) reject(error); else resolve(result);
                }
                function cancel() { controller.abort(); finish(cancelled()); }
                requests.add(cancel);
                if (signal) signal.addEventListener('abort', cancel, {once: true});
                Promise.resolve().then(function () {
                    if (settled || !current()) throw cancelled();
                    return getItems.call(owner, query, controller.signal);
                }).then(function (result) {
                    if (!current()) return cancel();
                    owner.itemsContainer.classList.remove('hide');
                    if (status) status.classList.add('hide');
                    if (status && !(result.Items || []).length && !(query && query.StartIndex) &&
                        owner.searchFields && (owner.searchFields.getSearchTerm() || '').trim()) {
                        status.textContent = globalize.translate('NoItemsMatchingFound');
                        status.classList.remove('hide');
                    }
                    finish(null, result);
                }, function (error) {
                    if (!current() || controller.signal.aborted) return cancel();
                    if (status) { status.textContent = globalize.translate('HeaderError'); status.classList.remove('hide'); }
                    finish(error);
                });
            });
        };
        var init = owner.initItemsContainer;
        owner.initItemsContainer = function () {
            var result = init.apply(this, arguments), container = this.itemsContainer;
            container._eteSearchBrowse = state;
            status = document.createElement('p');
            status.className = 'eteSearchStatus hide padded-top';
            status.setAttribute('role', 'status');
            container.parentNode.insertBefore(status, container);
            var refresh = container.refreshItemsInternal;
            container.refreshItemsInternal = function () { invalidate(true); return refresh.apply(this, arguments); };
            return result;
        };
        owner.invalidateSearch = function () { invalidate(true); };
        var resume = owner.onResume, pause = owner.onPause, destroy = owner.destroy;
        owner.onResume = function (options) {
            state.paused = false;
            if (state.needsResume) options = Object.assign({}, options, {refresh: true});
            state.needsResume = false;
            return resume.call(this, options);
        };
        owner.onPause = function () { state.needsResume = state.pending; state.paused = true; invalidate(false); return pause.apply(this, arguments); };
        owner.destroy = function () { state.destroyed = true; state.paused = true; invalidate(false); return destroy.apply(this, arguments); };
    }
    return {install: install};
}));
