(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.strmResolverConfigClient = factory();
    }
}(this, function () {
    'use strict';

    var CHANNEL = 'enhanced-strm-config-get';
    var cachedConfig = null;
    var hasCachedConfig = false;
    var pending;
    var cacheEpoch = 0;

    function validConfig(value) {
        return value && typeof value === 'object' &&
            Number(value.version) === 1 &&
            value.cd2 && typeof value.cd2 === 'object' &&
            Array.isArray(value.rules);
    }

    function getConfig(options) {
        var settings = options || {};
        var ipc = settings.ipc || (typeof window !== 'undefined' ? window.ipc : null);
        var timeoutMs = Number(settings.timeoutMs) > 0 ? Number(settings.timeoutMs) : 250;
        var timer;
        var request;
        var epoch = cacheEpoch;

        if (hasCachedConfig) return Promise.resolve(cachedConfig);
        if (pending) return pending;
        if (!ipc || typeof ipc.invoke !== 'function') return Promise.resolve(null);

        request = Promise.resolve().then(function () { return ipc.invoke(CHANNEL); });
        pending = new Promise(function (resolve) {
            var settled = false;
            function finish(value) {
                if (settled) return;
                settled = true;
                if (timer) clearTimeout(timer);
                if (epoch === cacheEpoch && validConfig(value)) {
                    cachedConfig = value;
                    hasCachedConfig = true;
                }
                resolve(validConfig(value) ? value : null);
            }
            timer = setTimeout(function () { finish(null); }, timeoutMs);
            request.then(finish, function () { finish(null); });
        }).then(function (value) {
            if (epoch === cacheEpoch) pending = null;
            return value;
        });
        return pending;
    }

    function clearCache() {
        cacheEpoch++;
        cachedConfig = null;
        hasCachedConfig = false;
        pending = null;
    }

    function begin(options) {
        var settings = options || {};
        var ipc = settings.ipc || (typeof window !== 'undefined' ? window.ipc : null);
        var signal = settings.signal, lease = null, released = false;
        if (!ipc || typeof ipc.invoke !== 'function') return Promise.resolve(null);
        var stop, timer;
        var stopped = new Promise(function (resolve) {stop = resolve;});
        function end(value) {
            try {Promise.resolve(ipc.invoke('enhanced-strm-playback-end', {lease: value})).catch(function () {});}
            catch (_) { /* A destroyed renderer cannot release through IPC. Main also observes its destruction. */ }
        }
        function release() {
            if (released) return;
            released = true;
            stop(null);
            if (signal) signal.removeEventListener('abort', release);
            if (lease) end(lease);
        }
        if (signal && signal.aborted) return Promise.resolve(null);
        if (signal) signal.addEventListener('abort', release, {once: true});
        timer = setTimeout(release, Number(settings.timeoutMs) > 0 ? Number(settings.timeoutMs) : 1000);
        var request = Promise.resolve().then(function () {
            if (released) return null;
            return ipc.invoke('enhanced-strm-playback-begin', {requestId: settings.requestId});
        }).then(function (value) {
            lease = value && value.lease;
            if (released) {
                if (lease) end(lease);
                return null;
            }
            if (!value || value.status !== 'ok' || typeof lease !== 'string' || !validConfig(value.config)) {release(); return null;}
            return {config: value.config, lease: lease, revision: value.revision, release: release,
                started: function () {
                    if (released) return;
                    try {Promise.resolve(ipc.invoke('enhanced-strm-playback-started', {lease: lease})).catch(function () {});}
                    catch (_) { /* Status reporting cannot fail playback. */ }
                }};
        }, function () {release(); return null;});
        return Promise.race([request, stopped]).finally(function () {clearTimeout(timer);});
    }

    return {
        CHANNEL: CHANNEL,
        begin: begin,
        clearCache: clearCache,
        get: getConfig,
        validConfig: validConfig
    };
}));
