define(['connectionManager', 'events'], function (connectionManager, events) {
    'use strict';
    var channel = 'enhanced-fn-connect', sequence = 0, active = new Set();
    var capabilities, enabled = false, observedIdentity, switching = false;
    var routes = new Map();
    var notices = new Set();
    function notice(_event, value) { if (enabled && value && typeof value.code === 'string') notices.forEach(function (listener) { listener(value); }); }
    function ipc() { return typeof window !== 'undefined' ? window.ipc : null; }
    function context(api) {
        try {
            var value = {serverId: api.serverId(), accountId: api.getCurrentUserId(),
                serverAddress: api.serverAddress(), token: api.accessToken()};
            return Object.keys(value).every(function (key) { return typeof value[key] === 'string' && value[key]; }) ? value : null;
        } catch (_) { return null; }
    }
    function current() { try { return context(connectionManager.currentApiClient()); } catch (_) { return null; } }
    function routeFor(value, owner) {
        try {
            var url = new URL(value);
            var choices = Array.from(routes.values()).reverse().filter(function (route) { return url.href.indexOf(route.remoteBase) === 0; });
            if (/\/users\/authenticatebyname\/?$/i.test(url.pathname) && choices[0] && !choices[0].owner) return choices[0];
            if (owner && owner.token) {
                var exact = choices.find(function (route) { return same(route.owner, owner); });
                if (exact) return exact;
                var old = choices.find(function (route) { return route.owner && route.owner.serverId === owner.serverId && route.owner.accountId === owner.accountId && canonical(route.owner.serverAddress) === canonical(owner.serverAddress); });
                if (old) return old; // Unknown token does not silently acquire a different FN Session.
            }
            return choices[0];
        } catch (_) { return null; }
    }
    function mapUrl(value, owner) {
        var route = routeFor(value, owner);
        if (route && owner?.token && fnServer(owner.serverAddress) && !new URL(value).href.startsWith(canonical(owner.serverAddress))) throw new Error('FN_SERVER_MISMATCH');
        return route ? route.apiBase + new URL(value).href.slice(route.remoteBase.length) : value;
    }
    function apiRoute(value) { try { var href = new URL(value).href; return Array.from(routes.values()).find(function (route) { return href.indexOf(route.apiBase) === 0; }); } catch (_) { return null; } }
    function authentication(value) { try { return Boolean(apiRoute(value)) && /\/users\/authenticatebyname\/?$/i.test(new URL(value).pathname); } catch (_) { return false; } }
    function fnServer(value) { try { var origin = new URL(value).origin; return Array.from(routes.values()).some(function (route) { return new URL(route.remoteBase).origin === origin; }); } catch (_) { return false; } }
    if (typeof window !== 'undefined') window.__eteFnTransport = Object.freeze({mapUrl: mapUrl, isAuthentication: authentication,
        authenticated: async function (url, value) {
            if (!authentication(url) || typeof value?.AccessToken !== 'string' || typeof value.User?.Id !== 'string' || typeof value.ServerId !== 'string') return;
            var route = apiRoute(url), owner = {serverId: value.ServerId, accountId: value.User.Id,
                token: value.AccessToken, serverAddress: route.remoteBase};
            switching = true; active.forEach(function (retire) { retire(); });
            try {
                await call('switch', {id: route.id, context: owner});
                // A same-account login may reuse its token, so the original CM
                // need not emit an identity change. Bind this selected profile
                // before accepting its authentication result in either case.
                await call('bind', {id: route.id, context: owner}); route.owner = owner;
            }
            catch (error) { switching = false; throw error; }
        },
        owns: function (value) { return Boolean(routeFor(String(value).replace(/\/?$/, '/'))); },
        beforeIdentityChange: function (next) {
            if (!enabled) return;
            switching = true;
            active.forEach(function (retire) { retire(); });
            var route = next && routeFor(next.serverAddress.replace(/\/?$/, '/'), next);
            return call('switch', {id: route?.id, context: next}).catch(function (error) { switching = false; throw error; });
        }});
    function canonical(value) { try { var u = new URL(value); if (!u.pathname.endsWith('/')) u.pathname += '/'; return u.href; } catch (_) { return value; } }
    function same(a, b) { return a && b && ['serverId', 'accountId', 'token'].every(function (key) { return a[key] === b[key]; }) && canonical(a.serverAddress) === canonical(b.serverAddress); }
    function abortError() { var e = new Error('FN_PLAY_CANCELLED'); e.name = 'AbortError'; return e; }
    function call(operation, value) {
        if (!ipc() || typeof ipc().invoke !== 'function') return Promise.reject(new Error('FN_CONNECT_UNAVAILABLE'));
        return ipc().invoke(channel, Object.assign({operation: operation}, value)).then(function (result) {
            if (!result || result.status !== 'ok') {
                var error = new Error(result && result.reason || 'FN_CONNECT_FAILED');
                if (operation === 'open' && /^[a-f0-9]{36}$/.test(result?.profileId || '')) error.profileId = result.profileId;
                throw error;
            }
            return result;
        });
    }
    function available() {
        if (!capabilities) capabilities = call('capabilities').then(function (r) {
            enabled = r.enabled === true;
            if (enabled && typeof ipc().on === 'function') ipc().on('enhanced-fn-connect-notice', notice);
            return enabled;
        }, function () { return false; });
        return capabilities;
    }
    function pulse() {
        if (!enabled || switching) return;
        var value = current();
        if (same(value, observedIdentity) || value === null && observedIdentity === null) return;
        observedIdentity = value;
        // Retire renderer-held capabilities synchronously; main retires matching
        // sockets before honoring another queued source request.
        active.forEach(function (retire) { retire(); });
        if (ipc() && typeof ipc().send === 'function') ipc().send('enhanced-fn-connect-identity', value);
        var route = value && routeFor(value.serverAddress.replace(/\/?$/, '/'), value);
        if (route) call('bind', {id: route.id, context: value}).then(function () { route.owner = value; }).catch(function () {});
    }
    events.on(connectionManager, 'credentialsupdated', pulse);
    events.on(connectionManager, 'apiclientcreated', pulse);
    function signedIn() { switching = false; pulse(); }
    events.on(connectionManager, 'localusersignedin', signedIn);
    events.on(connectionManager, 'localusersignedout', pulse);
    if (typeof window !== 'undefined') window.addEventListener('unload', function () {
        active.forEach(function (retire) { retire(); }); if (enabled && ipc()) ipc().send('enhanced-fn-connect-identity', null);
        events.off(connectionManager, 'credentialsupdated', pulse); events.off(connectionManager, 'apiclientcreated', pulse);
        events.off(connectionManager, 'localusersignedin', signedIn); events.off(connectionManager, 'localusersignedout', pulse);
        if (ipc() && typeof ipc().removeListener === 'function') ipc().removeListener('enhanced-fn-connect-notice', notice);
        notices.clear();
    }, {once: true});
    return {
        available: available,
        onNotice: function (listener) { notices.add(listener); return function () { notices.delete(listener); }; },
        open: function (config) { return call('open', {config: config}); },
        verify: function (id) { return call('verify', {id: id}); },
        async route(id) {
            var value = await call('route', {id: id});
            if (!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/a\/[a-f0-9]{48}\/$/.test(value.apiBase)) throw new Error('FN_SOURCE_INVALID');
            routes.set(id, value); return value;
        },
        bind: function (id, api) { var owner = context(api); return call('bind', {id: id, context: owner}).then(function (value) { if (routes.has(id)) routes.get(id).owner = owner; return value; }); },
        remove: function (id) { return call('remove', {id: id}); },
        async source(api, source, signal) {
            if (!await available()) return null;
            var captured = context(api);
            if (!captured || !fnServer(captured.serverAddress)) return null;
            if (/^[a-z]:[\\/]/i.test(source)) return null;
            var address;
            try { address = new URL(source); } catch (_) { return null; } // Existing native filesystem source.
            if (address.protocol === 'file:') return null;
            if (!['http:', 'https:'].includes(address.protocol)) throw new Error('FN_SOURCE_UNSUPPORTED');
            if (signal.aborted || switching) throw abortError();
            if (!same(captured, current())) throw abortError();
            observedIdentity = captured;
            var requestId = ++sequence, retired = false, leaseId, releasePromise;
            var owner = new AbortController();
            function retireOwner() {
                owner.abort(); active.delete(retireOwner); signal.removeEventListener('abort', retireOwner); release();
            }
            function release() {
                if (retired) return releasePromise; retired = true;
                ipc().send('enhanced-fn-connect-cancel', {requestId: requestId});
                releasePromise = leaseId ? call('release', {leaseId: leaseId}) : Promise.resolve();
                releasePromise.catch(function () {}); // Event-driven retirement has no awaiting caller.
                return releasePromise;
            }
            active.add(retireOwner); signal.addEventListener('abort', retireOwner, {once: true});
            try {
                var result = await call('source', {context: captured, source: source, requestId: requestId});
                leaseId = result.leaseId;
                if (retired || signal.aborted || !same(captured, current()) || !same(captured, context(api))) {
                    if (leaseId) await call('release', {leaseId: leaseId}); throw abortError();
                }
                if (!result.matched) { retireOwner(); return null; }
                if (typeof result.url !== 'string' || !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/r\/[a-f0-9]{48}$/.test(result.url) ||
                    typeof leaseId !== 'string' || !/^[a-f0-9]{48}$/.test(leaseId)) throw new Error('FN_SOURCE_INVALID');
                return {url: result.url, release: release, ownerSignal: owner.signal, isOwnerCurrent: function () {
                    return !signal.aborted && !switching && same(captured, current()) && same(captured, context(api));
                }};
            } catch (error) { retireOwner(); throw error; }
        }
    };
});
