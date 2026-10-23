(function (factory) {
    if (typeof define === 'function' && define.amd) define([], factory);
    else if (typeof module === 'object' && module.exports) module.exports = factory();
}(function () {
    'use strict';
    function capture(connectionManager, item, mediaSource, options, source) {
        var api, snapshot = null;
        try {
            api = item.ServerId && connectionManager.getApiClient(item.ServerId);
            if (api && api.serverId() === item.ServerId && options.playMethod === 'DirectPlay' && options.playSessionId) {
                snapshot = Object.freeze({source: source, serverOrigin: new URL(api.serverAddress()).origin, serverId: api.serverId(),
                    accountId: api.getCurrentUserId(), itemId: item.Id, mediaSourceId: mediaSource.Id,
                    playSessionId: options.playSessionId, mode: options.playMethod});
            }
        } catch (_) { snapshot = null; }
        return function () {
            try {
                if (!snapshot || api.getCurrentUserId() !== snapshot.accountId || api.serverId() !== snapshot.serverId ||
                    new URL(api.serverAddress()).origin !== snapshot.serverOrigin) return null;
                return snapshot;
            } catch (_) { return null; }
        };
    }
    return {capture: capture};
}));
