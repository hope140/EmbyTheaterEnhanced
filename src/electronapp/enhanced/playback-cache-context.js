(function (factory) {
    if (typeof define === 'function' && define.amd) define([], factory);
    else if (typeof module === 'object' && module.exports) module.exports = factory();
}(function () {
    'use strict';
    function isDirectFile(mode, source) {
        if (mode === 'DirectPlay') return true;
        if (mode !== 'DirectStream') return false;
        try {
            var values = Array.from(new URL(source).searchParams).filter(function (entry) { return entry[0].toLowerCase() === 'static'; });
            return values.length === 1 && values[0][1].toLowerCase() === 'true';
        } catch (_) { return false; }
    }
    function capture(connectionManager, item, mediaSource, options, source) {
        var api, snapshot = null;
        try {
            api = item.ServerId && connectionManager.getApiClient(item.ServerId);
            if (api && api.serverId() === item.ServerId && isDirectFile(options.playMethod, source) && options.playSessionId && mediaSource.Container) {
                snapshot = Object.freeze({source: source, serverOrigin: new URL(api.serverAddress()).origin, serverId: api.serverId(),
                    accountId: api.getCurrentUserId(), itemId: item.Id, mediaSourceId: mediaSource.Id,
                    playSessionId: options.playSessionId, mode: options.playMethod, container: mediaSource.Container});
            }
        } catch (_) { snapshot = null; }
        return function () {
            try {
                if (!snapshot || connectionManager.getApiClient(snapshot.serverId) !== api || api.getCurrentUserId() !== snapshot.accountId || api.serverId() !== snapshot.serverId ||
                    new URL(api.serverAddress()).origin !== snapshot.serverOrigin) return null;
                return snapshot;
            } catch (_) { return null; }
        };
    }
    return {capture: capture, isDirectFile: isDirectFile};
}));
