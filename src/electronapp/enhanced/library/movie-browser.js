(function (factory) {
    if (typeof define === 'function' && define.amd) define(['exports', 'modules/emby-apiclient/connectionmanager.js'], function (exports, connection) { exports.default = factory(connection.default); });
    else if (typeof module === 'object' && module.exports) module.exports = factory();
}(function (connection) {
    'use strict';
    function cancelled() { var error = new Error('Movie browse request cancelled.'); error.name = 'AbortError'; return error; }
    function install(owner) {
        if (!owner.options || owner.options.itemType !== 'Movie' || owner._eteMovieBrowse) return;
        var state = owner._eteMovieBrowse = {epoch: 0, paused: true, destroyed: false};
        var requests = new Set();
        function invalidate() {
            state.epoch++;
            Array.from(requests).forEach(function (cancel) { cancel(); });
        }
        var getItems = owner.getItems;
        owner.getItems = function (query, signal) {
            if (state.paused || state.destroyed || signal && signal.aborted) return Promise.reject(cancelled());
            var epoch = state.epoch, api = owner.apiClient || connection.currentApiClient(), user = api.getCurrentUserId();
            var controller = new AbortController();
            return new Promise(function (resolve, reject) {
                var settled = false;
                function current() {
                    return !state.destroyed && !state.paused && epoch === state.epoch &&
                        (owner.apiClient || connection.currentApiClient()) === api && api.getCurrentUserId() === user;
                }
                function finish(error, result) {
                    if (settled) return;
                    settled = true;
                    requests.delete(cancel);
                    if (signal) signal.removeEventListener('abort', cancel);
                    if (error) reject(error); else resolve(result);
                }
                function cancel() { controller.abort(); finish(cancelled()); }
                requests.add(cancel);
                if (signal) signal.addEventListener('abort', cancel, {once: true});
                Promise.resolve().then(function () {
                    if (settled || !current()) { cancel(); throw cancelled(); }
                    return getItems.call(owner, query, controller.signal);
                }).then(function (result) {
                    // A transport may ignore abort; ownership is checked independently.
                    if (!current()) cancel();
                    else finish(null, result);
                }, function (error) { if (!current()) cancel(); else finish(error); });
            });
        };
        var init = owner.initItemsContainer;
        owner.initItemsContainer = function () {
            var result = init.apply(this, arguments), container = this.itemsContainer;
            container._eteMovieBrowse = state;
            var refresh = container.refreshItemsInternal;
            container.refreshItemsInternal = function () { invalidate(); return refresh.apply(this, arguments); };
            return result;
        };
        var resume = owner.onResume, pause = owner.onPause, destroy = owner.destroy;
        owner.onResume = function () { state.paused = false; return resume.apply(this, arguments); };
        owner.onPause = function () { state.paused = true; invalidate(); return pause.apply(this, arguments); };
        owner.destroy = function () { state.destroyed = true; state.paused = true; invalidate(); return destroy.apply(this, arguments); };
    }
    return {install: install};
}));
