(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.strmIdentityRecovery = factory();
    }
}(this, function () {
    'use strict';

    var DEFAULT_TIMEOUT_MS = 750;

    function readField(object, name) {
        try {
            return object && object[name];
        } catch (err) {
            return undefined;
        }
    }

    function hasText(value) {
        return typeof value === 'string' && value.length > 0;
    }

    function isStrmPath(value) {
        return hasText(value) && /\.strm$/i.test(value);
    }

    function baseResult(status, attempted) {
        return {
            status: status,
            metadataRecoveryAttempted: attempted === true,
            metadataRecoverySucceeded: false,
            recoveredPathEndsWithStrm: false,
            recoveredPath: null,
            strmIdentitySource: 'none'
        };
    }

    function recover(options) {
        var settings = options || {};
        var item = settings.item;
        var itemPath = readField(item, 'Path');
        var itemId = readField(item, 'Id');
        var serverId = readField(item, 'ServerId');
        var signal = settings.signal;
        var connectionManager = settings.connectionManager;
        var timeoutMs = Number(settings.timeoutMs) > 0 ? Number(settings.timeoutMs) : DEFAULT_TIMEOUT_MS;
        var setTimer = typeof settings.setTimeout === 'function' ? settings.setTimeout : setTimeout;
        var clearTimer = typeof settings.clearTimeout === 'function' ? settings.clearTimeout : clearTimeout;
        var initial;
        var apiClient;
        var userId;
        var controller;
        var timer;
        var abortListener;
        var settled = false;

        if (hasText(itemPath)) {
            initial = baseResult('not-needed', false);
            initial.strmIdentitySource = isStrmPath(itemPath) ? 'item-path' : 'none';
            return Promise.resolve(initial);
        }

        initial = baseResult('not-eligible', false);
        if (!item || !itemId || !serverId) return Promise.resolve(initial);
        initial.metadataRecoveryAttempted = true;
        if (signal && signal.aborted) return Promise.resolve(Object.assign(initial, {status: 'superseded'}));
        if (!connectionManager || typeof connectionManager.getApiClient !== 'function') {
            return Promise.resolve(Object.assign(initial, {status: 'unavailable'}));
        }

        try {
            apiClient = connectionManager.getApiClient(serverId);
            if (apiClient && typeof apiClient.getCurrentUserId === 'function') userId = apiClient.getCurrentUserId();
        } catch (_) {
            return Promise.resolve(Object.assign(initial, {status: 'unavailable'}));
        }
        if (!apiClient || typeof apiClient.getItem !== 'function') {
            return Promise.resolve(Object.assign(initial, {status: 'unavailable'}));
        }

        try { controller = new AbortController(); } catch (_) {
            return Promise.resolve(Object.assign(initial, {status: 'unavailable'}));
        }

        return new Promise(function (resolve) {
            function finish(value) {
                if (settled) return;
                settled = true;
                if (timer) clearTimer(timer);
                if (signal && abortListener) signal.removeEventListener('abort', abortListener);
                resolve(value);
            }

            abortListener = function () {
                try { controller.abort(); } catch (_) { }
                finish(Object.assign(initial, {status: 'superseded'}));
            };
            if (signal) signal.addEventListener('abort', abortListener, {once: true});
            timer = setTimer(function () {
                try { controller.abort(); } catch (_) { }
                finish(Object.assign(initial, {status: 'timeout'}));
            }, timeoutMs);

            try {
                Promise.resolve(apiClient.getItem(userId, itemId, {Fields: 'Path'}, controller.signal)).then(function (metadata) {
                    var recoveredPath;
                    var endsWithStrm;
                    if (signal && signal.aborted) return finish(Object.assign(initial, {status: 'superseded'}));
                    recoveredPath = readField(metadata, 'Path');
                    if (!hasText(recoveredPath)) return finish(Object.assign(initial, {status: 'failed'}));
                    endsWithStrm = isStrmPath(recoveredPath);
                    finish({
                        status: 'recovered',
                        metadataRecoveryAttempted: true,
                        metadataRecoverySucceeded: true,
                        recoveredPathEndsWithStrm: endsWithStrm,
                        recoveredPath: recoveredPath,
                        strmIdentitySource: endsWithStrm ? 'metadata-recovery' : 'none'
                    });
                }, function () {
                    finish(Object.assign(initial, {status: signal && signal.aborted ? 'superseded' : 'failed'}));
                });
            } catch (_) {
                finish(Object.assign(initial, {status: 'failed'}));
            }
        });
    }

    return {
        DEFAULT_TIMEOUT_MS: DEFAULT_TIMEOUT_MS,
        isStrmPath: isStrmPath,
        recover: recover
    };
}));
