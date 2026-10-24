(function (factory) {
    if (typeof define === 'function' && define.amd) define([], factory);
    else if (typeof module === 'object' && module.exports) module.exports = factory();
}(function () {
    'use strict';
    function capture(manager, item, mediaSource, options, source) {
        var api, value, epoch, address;
        try {
            api = manager.getApiClient(item.ServerId); epoch = api._identityEpoch || 0; address = api.serverAddress();
            value = {source: source, serverOrigin: new URL(address).origin, serverId: api.serverId(), accountId: api.getCurrentUserId(),
                itemId: item.Id, mediaSourceId: mediaSource.Id, playSessionId: options.playSessionId, mode: options.playMethod,
                mediaType: item.MediaType, container: mediaSource.Container, live: !!mediaSource.LiveStreamId};
            if (value.serverId !== item.ServerId || !value.accountId || !value.mediaSourceId || !value.playSessionId) value = null;
        } catch (_) {value = null;}
        return function () {
            try {return value && item.Id === value.itemId && item.ServerId === value.serverId && mediaSource.Id === value.mediaSourceId && options.playSessionId === value.playSessionId && options.playMethod === value.mode && manager.getApiClient(value.serverId) === api && api.getCurrentUserId() === value.accountId &&
                api.serverId() === value.serverId && (api._identityEpoch || 0) === epoch && api.serverAddress() === address ? value : null;
            } catch (_) {return null;}
        };
    }
    function nextItem(options, current) {
        var manager = options.playbackManager, item = options.item;
        if (manager.getCurrentPlayer() !== options.player || item.Type !== 'Episode' || !item.SeriesId) return null;
        var info;
        try {info = manager._playQueueManager && manager._playQueueManager.getNextItemInfo();} catch (_) {return null;}
        var next = info && info.item;
        return next && next.Id && next.Id !== item.Id && next.Type === 'Episode' && next.SeriesId === item.SeriesId &&
            next.ServerId === current.serverId ? next : null;
    }
    async function readItem(api, id, signal, fetcher) {
        var request = {type: 'GET', url: api.getUrl('Users/' + encodeURIComponent(api.getCurrentUserId()) + '/Items/' + encodeURIComponent(id)), headers: {accept: 'application/json'}};
        api.setAuthorizationInfoIntoRequest(request, true);
        var origin = new URL(api.serverAddress()).origin;
        if (new URL(request.url).origin !== origin) throw Error('range-metadata-origin');
        var response = await fetcher(request.url, {method: 'GET', headers: request.headers, redirect: 'error', credentials: 'same-origin', signal: signal});
        if (response.status !== 200 || new URL(response.url).origin !== origin) throw Error('range-metadata-denied');
        var reader = response.body.getReader(), chunks = [], size = 0;
        try {
            while (true) {
                var row = await reader.read(); if (row.done) break;
                size += row.value.length; if (size > 262144) throw Error('range-metadata-limit'); chunks.push(row.value);
            }
        } finally {await reader.cancel().catch(function () {}); reader.releaseLock();}
        var bytes = new Uint8Array(size), offset = 0;
        chunks.forEach(function (chunk) {bytes.set(chunk, offset); offset += chunk.length;});
        return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
    }
    async function bind(options) {
        var endpoint = options.endpoint;
        if (options.signal.aborted || !endpoint || !endpoint.rangeCache || !endpoint.rangeCache.enabled) return null;
        var binding = endpoint.createRangeBinding(), current = capture(options.connectionManager, options.item, options.mediaSource, options.options, options.source);
        var nextState = 'waiting', stateEpoch = 0, statusSequence = 0, nextCancellation = null;
        var closed = false, closing, ticking = false, ready = false, timer, candidateId = null, attemptId = null, nextController = null, job = null;
        function valid() {return !closed && !options.signal.aborted && options.isCurrent() && current();}
        async function cancelNext() {
            stateEpoch++;
            if (nextController) nextController.abort(); nextController = null; nextState = 'waiting';
            var cancellation = binding.cancelNext().catch(function () {}); nextCancellation = cancellation;
            try {await cancellation;} finally {if (nextCancellation === cancellation) nextCancellation = null;}
        }
        var controller = {
            started: function () {if (!ready && valid()) {ready = true; timer = setInterval(function () {void controller.tick();}, 500);}},
            async tick() {
                if (!valid()) {await controller.close(); return;}
                if (!ready || ticking) return;
                ticking = true;
                try {
                var state = options.position(), context = current(), next = nextItem(options, context);
                var id = next && next.Id;
                if (id !== candidateId) {candidateId = id; attemptId = null; await cancelNext();}
                if (!next || attemptId === id || !state || !Number.isFinite(state.positionTicks) || !Number.isFinite(state.durationTicks) || state.durationTicks <= 0 ||
                    state.positionTicks / state.durationTicks * 100 < endpoint.rangeCache.progressPercent) return;
                attemptId = id; nextState = 'checking'; var owner = new AbortController(); nextController = owner;
                function ownsCandidate() {var c = valid(), n = c && nextItem(options, c); return c && n && n.Id === id && candidateId === id && nextController === owner;}
                function owns() {return ownsCandidate() && !owner.signal.aborted;}
                job = (async function () {
                    var deadline = setTimeout(function () {owner.abort();}, endpoint.rangeCache.timeoutMs);
                    try {
                        var api = options.connectionManager.getApiClient(context.serverId);
                        var item = await readItem(api, id, owner.signal, options.fetch || fetch);
                        if (owns()) nextState = 'unavailable';
                        if (!owns() || item.ServerId && item.ServerId !== context.serverId || item.Id !== id || item.MediaType !== 'Video' || item.Type !== 'Episode' || item.SeriesId !== options.item.SeriesId || !Array.isArray(item.MediaSources) || item.MediaSources.length !== 1) return;
                        var source = item.MediaSources[0];
                        if (!source.Id || !source.SupportsDirectStream || source.LiveStreamId || !/^[a-z0-9]{1,12}$/i.test(source.Container || '')) return;
                        var params = {Static: true, mediaSourceId: source.Id, deviceId: api.deviceId(), api_key: api.accessToken()};
                        if (source.ETag) params.Tag = source.ETag;
                        var url = source.DirectStreamUrl ? api.getUrl(source.DirectStreamUrl) : api.getUrl('Videos/' + encodeURIComponent(item.Id) + '/stream.' + source.Container.toLowerCase().replace('m4v', 'mp4'), params);
                        if (new URL(url).origin !== context.serverOrigin || !owns()) return;
                        clearTimeout(deadline); deadline = null;
                        var result = await binding.preload(Object.assign({}, context, {source: url, itemId: item.Id, mediaSourceId: source.Id, mode: 'DirectStream', container: source.Container, live: false}));
                        if (owns()) {nextState = result && result.value && result.value.state || 'unavailable'; if (nextState === 'progress-pending') {attemptId = null; nextState = 'waiting';}}
                    } catch (_) {if (ownsCandidate()) nextState = 'unavailable';}
                    finally {if (deadline) clearTimeout(deadline);}
                })();
                } finally {ticking = false;}
            },
            category: async function () {
                var context = valid(); if (!context || !binding.status) return null;
                var queue = nextItem(options, context), nextId = queue && queue.Id, ticket = stateEpoch, sequence = ++statusSequence;
                if (nextCancellation || nextId !== candidateId) return null;
                try {
                    var result = await binding.status(), now = valid(), currentNext = now && nextItem(options, now);
                    if (!now || nextCancellation || nextId !== candidateId || ticket !== stateEpoch || sequence !== statusSequence || nextId !== (currentNext && currentNext.Id) || !result || !result.value || !result.value.enabled) return null;
                    var status = result.value, labels = {idle: '未预载', waiting: '等待进度或下一集', checking: '正在确认下一集', preparing: '正在准备', warming: '正在预载', ready: '预载完成', partial: '已预载部分', unavailable: '当前来源不可预载', cancelled: '已取消'};
                    var next = status.next || {}, state = next.state === 'idle' ? nextState : next.state;
                    var mb = function (n) {return Number.isFinite(n) && n >= 0 ? (n / 1000000).toFixed(1) + ' MB' : '未知';};
                    var stats = [{label: '下一集预载:', value: (labels[state] || '未预载') + (next.bytes > 0 ? ' · ' + mb(next.bytes) + ' / ' + mb(next.targetBytes) : '')}];
                    return {type: 'enhanced', name: '下一集预载', stats: stats};
                } catch (_) {return null;}
            },
            close: function () {
                if (closing) return closing; closed = true; stateEpoch++; clearInterval(timer);
                if (nextController) nextController.abort();
                options.signal.removeEventListener('abort', abort);
                closing = (async function () {await binding.retire().catch(function () {}); if (job) await job;})(); return closing;
            }
        };
        function abort() {void controller.close();}
        options.signal.addEventListener('abort', abort, {once: true});
        try {await binding.setContext(current());} catch (_) {await controller.close(); return null;}
        if (!valid()) {await controller.close(); return null;}
        return controller;
    }
    return {bind: bind, capture: capture, nextItem: nextItem};
}));
