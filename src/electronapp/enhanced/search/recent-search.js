(function(factory) {
    if (typeof define === 'function') define(['exports'], function(exports) { exports.default = factory(); });
    else if (typeof module === 'object' && module.exports) module.exports = factory();
})(function() {
    'use strict';
    function versionAtLeast(value, minimum) {
        if (typeof value !== 'string' || !/^\d{1,5}(?:\.\d{1,5}){2,3}$/.test(value)) return false;
        var a = value.split('.').map(Number), b = minimum.split('.').map(Number);
        for (var i = 0; i < 4; i++) { if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0); }
        return true;
    }
    function create(instance, connection, globalize, router) {
        var epoch = 0, controller = null, root = null, old = null, clearing = null;
        function client() {
            try {
                if (!instance.options) return null;
                var api = connection.getApiClient(instance.options.serverId);
                if (!api || connection.currentApiClient() !== api || api.serverId() !== instance.options.serverId ||
                    typeof api.getCurrentUserId() !== 'string' || !api.getCurrentUserId() ||
                    typeof api.isLoggedIn === 'function' && !api.isLoggedIn() ||
                    !versionAtLeast(api.serverVersion(), '4.10.0.40') || typeof api.getJSON !== 'function' ||
                    typeof api.fetch !== 'function' || typeof api.getUrl !== 'function') return null;
                return {api: api, user: api.getCurrentUserId(), server: api.serverId(), auth: api._identityEpoch || 0};
            } catch (_) { return null; }
        }
        function current(bound, stamp) {
            if (stamp !== epoch || !instance.options || instance._eteFieldsPaused) return false;
            var now = client();
            return now && now.api === bound.api && now.user === bound.user && now.server === bound.server && now.auth === bound.auth;
        }
        function retire() { epoch++; if (controller) controller.abort(); controller = null; }
        function hide() {
            retire();
            clearing = null;
            if (root) root.remove(); root = null;
            if (old) old.hidden = false;
            old = null;
        }
        function mount(items, bound, stamp) {
            var context = instance.options.element, parent = context.querySelector('.searchFieldsInner');
            if (!parent || !current(bound, stamp)) return;
            var routes = items.map(function(item) {
                if (!item || typeof item.Id !== 'string' || !item.Id || typeof item.Name !== 'string' || !item.Name ||
                    item.ServerId != null && item.ServerId !== bound.server) throw new Error('recent-items-invalid');
                var route = router.getRouteUrl(item);
                if (typeof route !== 'string' || !/^\/(?!\/)[^\\\u0000-\u001f]*$/.test(route)) throw new Error('recent-route-invalid');
                return route;
            });
            hide();
            if (!items.length) return;
            // hide() retires old work. The rendered list now belongs to its own epoch.
            var renderEpoch = epoch, section = context.ownerDocument.createElement('section');
            section.className = 'eteRecentSearch verticalSection padded-top';
            var heading = context.ownerDocument.createElement('h2'); heading.className = 'sectionTitle';
            heading.textContent = /^zh/i.test(globalize.getCurrentLocale()) ? '最近搜索' : 'Recently searched';
            section.appendChild(heading);
            var list = context.ownerDocument.createElement('div'); list.className = 'padded-left padded-right';
            items.forEach(function(item, index) {
                var line = context.ownerDocument.createElement('div');
                var link = context.ownerDocument.createElement('a'); link.setAttribute('is', 'emby-linkbutton');
                link.className = 'button-link'; link.href = '.' + routes[index]; link.textContent = item.Name;
                line.appendChild(link); list.appendChild(line);
            });
            section.appendChild(list);
            var button = context.ownerDocument.createElement('button'); button.type = 'button'; button.className = 'button-link';
            button.textContent = /^zh/i.test(globalize.getCurrentLocale()) ? '清除最近搜索' : 'Clear recently searched';
            section.appendChild(button);
            var status = context.ownerDocument.createElement('p'); status.setAttribute('role', 'status'); section.appendChild(status);
            button.addEventListener('click', function() {
                if (clearing || !current(bound, renderEpoch)) return;
                var token = clearing = {}; button.disabled = true; status.textContent = '';
                Promise.resolve().then(function() {
                    return bound.api.fetch({type: 'DELETE', url: bound.api.getUrl('Users/' + encodeURIComponent(bound.user) + '/RecentlySearched')});
                }).then(function() {
                    if (clearing === token && current(bound, renderEpoch)) hide();
                }, function() {
                    if (clearing === token && current(bound, renderEpoch)) {
                        clearing = null;
                        button.disabled = false;
                        status.textContent = /^zh/i.test(globalize.getCurrentLocale()) ? '清除失败，请重试。' : 'Could not clear recent searches. Try again.';
                    }
                });
            });
            old = context.querySelector('.searchSuggestions'); if (old) old.hidden = true;
            root = section; parent.appendChild(section);
        }
        function load() {
            hide();
            var bound = client();
            if (!bound || !instance.options || instance.getSearchTerm && instance.getSearchTerm()) return;
            var stamp = epoch, abort = controller = new AbortController();
            Promise.resolve().then(function() {
                var url = bound.api.getUrl('Users/' + encodeURIComponent(bound.user) + '/Items', {
                    WasSearched: true, SortBy: 'DateLastSearched', SortOrder: 'Descending',
                    Limit: 12, Recursive: true, ImageTypeLimit: 1, EnableImageTypes: 'Primary,Thumb'});
                return bound.api.getJSON(url, abort.signal);
            }).then(function(result) {
                if (!current(bound, stamp)) return;
                if (!result || !Array.isArray(result.Items) || result.Items.length > 12) return;
                try { mount(result.Items, bound, stamp); } catch (_) { hide(); }
            }, function() { if (current(bound, stamp)) hide(); });
        }
        return {load: load, hide: hide, pause: hide, destroy: hide};
    }
    return Object.freeze({create: create, versionAtLeast: versionAtLeast});
});
