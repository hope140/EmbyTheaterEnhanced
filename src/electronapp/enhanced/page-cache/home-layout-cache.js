(function (factory) {
    if (typeof define === 'function' && define.amd) define(['exports', './page-data-cache.js',
        'modules/emby-apiclient/events.js'], function (exports, cache, events) { exports.default = factory(cache.default, events.default); });
    else if (typeof module === 'object' && module.exports) module.exports = factory(require('./page-data-cache.js'));
}(function (cacheModule, defaultEvents) {
    'use strict';
    function aborted() { var error = new Error('Home layout request cancelled.'); error.name = 'AbortError'; return error; }
    function create(connection, options, events) {
        options = options || {};
        // Source-level dependency injection only; no user setting or default TTL is introduced.
        if (options.enabled !== true || options.ttlMs == null) return {enabled: false, invalidate: function () {}, dispose: function () {}};
        events = events || defaultEvents;
        if (!events || typeof events.on !== 'function' || typeof events.off !== 'function') throw new TypeError('Canonical events required.');
        var cache = cacheModule.create({enabled: true, policies: {'home-layout': {ttlMs: options.ttlMs}},
            maxEntries: options.maxEntries, maxBytes: options.maxBytes, maxPending: options.maxPending,
            maxSubscribers: options.maxSubscribers, requestTimeoutMs: options.requestTimeoutMs, clock: options.clock});
        var binding = null, revision = 0, disposed = false;
        function invalidate() { if (!disposed) { revision++; cache.invalidate(); } }
        function detach() {
            if (!binding) return;
            events.off(binding.client, 'message', onMessage);
            events.off(binding.client, 'websocketopen', invalidate);
            events.off(binding.client, 'websocketclose', invalidate);
        }
        function retire() { if (disposed) return; revision++; detach(); binding = null; cache.bindContext(null); }
        function onMessage(event, message) {
            // Do not retain, log or inspect notification Data (which may contain user/media data).
            if (message && ['UserDataChanged', 'LibraryChanged', 'UserUpdated', 'UserConfigurationUpdated'].indexOf(message.MessageType) >= 0) invalidate();
        }
        function identity() {
            try {
                var client = connection.currentApiClient();
                if (!client || !client.isLoggedIn()) return null;
                var server = client.serverId(), user = client.getCurrentUserId();
                // Existing maintained ApiClient auth generation; never read token or serverInfo.
                var auth = client._identityEpoch || 0;
                if (typeof server !== 'string' || !server || typeof user !== 'string' || !user || !Number.isSafeInteger(auth) || auth < 0) return null;
                return {client: client, server: server, user: user, auth: auth,
                    locale: client.getCurrentLocale() || '', version: client.serverVersion()};
            } catch (_) { return null; }
        }
        function same(a, b) {
            return a && b && a.client === b.client && a.server === b.server && a.user === b.user && a.auth === b.auth && a.locale === b.locale && a.version === b.version;
        }
        function sync() {
            if (disposed) throw aborted();
            var value = identity();
            if (!same(value, binding)) {
                retire();
                if (!value) throw aborted();
                binding = value;
                cache.bindContext({client: value.client, serverId: value.server, userId: value.user, session: {}});
                events.on(value.client, 'message', onMessage);
                events.on(value.client, 'websocketopen', invalidate);
                events.on(value.client, 'websocketclose', invalidate);
            }
            return value;
        }
        function current(value, ticket) {
            if (disposed) return false;
            if (!same(value, identity())) { if (same(value, binding)) retire(); return false; }
            return ticket === revision;
        }
        function load(settings, readProjectedLayout) {
            var owner, ticket;
            try { owner = sync(); ticket = revision; } catch (error) { return Promise.reject(error); }
            return cache.load({resource: 'home-layout', params: {displayMode: settings.displayMode,
                locale: owner.locale, serverVersion: owner.version, projectionVersion: 1}, signal: settings.signal,
                load: function (signal) {
                    if (!current(owner, ticket)) throw aborted();
                    return Promise.resolve().then(function () { return readProjectedLayout(signal); }).then(function (sections) {
                        if (!current(owner, ticket)) throw aborted();
                        return sections;
                    });
                }}).then(function (sections) {
                    if (!current(owner, ticket)) throw aborted();
                    return sections;
                }, function (error) {
                    if (!current(owner, ticket)) throw aborted();
                    throw error;
                });
        }
        var connectionEvents = ['localusersignedin', 'localusersignedout', 'connected'];
        connectionEvents.forEach(function (name) { events.on(connection, name, retire); });
        return {enabled: true, load: load, invalidate: invalidate,
            revalidate: function () { try { sync(); return true; } catch (_) { return false; } },
            stats: function () { return cache.stats(); },
            dispose: function () {
                if (disposed) return;
                disposed = true;
                connectionEvents.forEach(function (name) { events.off(connection, name, retire); });
                detach(); binding = null; cache.dispose();
            }};
    }
    return {create: create};
}));
