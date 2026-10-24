(function (factory) {
    if (typeof define === 'function' && define.amd) define([], factory);
    else if (typeof module === 'object' && module.exports) module.exports = factory();
}(function () {
    'use strict';
    function nextItem(options, current) {
        var manager = options.playbackManager;
        if (manager.getCurrentPlayer() !== options.player || !manager._playQueueManager || options.currentItem.Type !== 'Episode' || !options.currentItem.SeriesId) return null;
        var info = manager._playQueueManager.getNextItemInfo(), item = info && info.item;
        return item && item.Type === 'Episode' && item.Id && item.Id !== options.currentItem.Id &&
            item.SeriesId === options.currentItem.SeriesId && item.ServerId === current.serverId ? item : null;
    }
    async function readItem(api, current, item, signal, fetcher) {
        var request = {type: 'GET', url: api.getUrl('Users/' + encodeURIComponent(current.accountId) + '/Items/' + encodeURIComponent(item.Id)),
            dataType: 'json', headers: {accept: 'application/json'}};
        api.setAuthorizationInfoIntoRequest(request, true);
        if (new URL(request.url).origin !== current.serverOrigin) throw Error('cache-next-origin');
        var response = await fetcher(request.url, {method: 'GET', headers: request.headers, signal: signal,
            redirect: 'error', credentials: 'same-origin'});
        if (response.status !== 200 || new URL(response.url).origin !== current.serverOrigin) throw Error('cache-next-authorization');
        var reader = response.body.getReader(), chunks = [], size = 0;
        try {
            while (true) {
                var row = await reader.read(); if (row.done) break;
                size += row.value.length; if (size > 262144) throw Error('cache-next-metadata-limit'); chunks.push(row.value);
            }
        } finally { if (signal.aborted || size > 262144) await reader.cancel().catch(function () {}); reader.releaseLock(); }
        var bytes = new Uint8Array(size), offset = 0;
        chunks.forEach(function (chunk) { bytes.set(chunk, offset); offset += chunk.length; });
        return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
    }
    async function prepare(options) {
        var ticket, timer, current = options.currentContext(), item;
        var controller = new AbortController();
        var abort = function () { controller.abort(); };
        if (options.signal) { options.signal.addEventListener('abort', abort, {once: true}); if (options.signal.aborted) abort(); }
        if (options.onController) options.onController(controller);
        function owns() {
            var now = options.currentContext();
            var next = now && nextItem(options, now);
            return !controller.signal.aborted && options.isCurrent() && now && current && now.accountId === current.accountId &&
                now.serverId === current.serverId && now.serverOrigin === current.serverOrigin && now.playSessionId === current.playSessionId && next && item && next.Id === item.Id;
        }
        try {
            if (!current || !options.isCurrent() || !(item = nextItem(options, current))) return {state: 'unavailable'};
            ticket = await options.endpoint.confirmNextCache(item.Id, item.Name || '下一集');
            if (!ticket.confirmationId || !owns()) return {state: 'cancelled'};
            timer = setTimeout(abort, 2000);
            var api = options.connectionManager.getApiClient(current.serverId);
            if (api.serverId() !== current.serverId || api.getCurrentUserId() !== current.accountId) return {state: 'unavailable'};
            var data = await readItem(api, current, item, controller.signal, options.fetch || fetch);
            if (!owns() || !data || data.Id !== item.Id || data.Type !== 'Episode' || data.SeriesId !== item.SeriesId ||
                data.ServerId && data.ServerId !== current.serverId || !Array.isArray(data.MediaSources) || data.MediaSources.length !== 1) return {state: 'unavailable'};
            var source = data.MediaSources[0];
            if (!source.Id || !source.Container || !(source.Protocol === 'File' || source.SupportsDirectStream === true) ||
                source.LiveStreamId || !['Video', 'Audio'].includes(data.MediaType)) return {state: 'unavailable'};
            var params = {Static: true, mediaSourceId: source.Id, deviceId: api.deviceId(), api_key: api.accessToken()};
            if (source.ETag) params.Tag = source.ETag;
            var url = source.DirectStreamUrl ? api.getUrl(source.DirectStreamUrl) :
                api.getUrl((data.MediaType === 'Video' ? 'Videos/' : 'Audio/') + encodeURIComponent(data.Id) + '/stream.' + source.Container.toLowerCase().replace('m4v', 'mp4'), params);
            if (new URL(url).origin !== current.serverOrigin || !owns()) return {state: 'unavailable'};
            clearTimeout(timer); timer = null;
            return await options.endpoint.downloadNextCache(ticket.confirmationId, {serverId: current.serverId, accountId: current.accountId,
                ownerPlaySessionId: current.playSessionId, itemId: data.Id, mediaSourceId: source.Id, container: source.Container,
                mode: 'DirectStream', source: url, serverOrigin: current.serverOrigin});
        } catch (_) { return {state: controller.signal.aborted ? 'cancelled' : 'unavailable'}; }
        finally {
            if (timer) clearTimeout(timer); controller.abort();
            if (options.signal) options.signal.removeEventListener('abort', abort);
            if (ticket && ticket.confirmationId) await options.endpoint.cancelNextCache(ticket.confirmationId, true).catch(function () {});
            if (options.onController) options.onController(null);
        }
    }
    return {prepare: prepare};
}));
