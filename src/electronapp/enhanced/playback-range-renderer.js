(function (factory) {
    if (typeof define === 'function' && define.amd) define(['./playback-range-diagnostics.js', './preload-next-source.js'], factory);
    else if (typeof module === 'object' && module.exports) module.exports = factory(require('./playback-range-diagnostics'), require('./preload-next-source'));
}(function (diagnostics, nextSource) {
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
        if (new URL(request.url).origin !== origin) throw diagnostics.error('metadata-origin','range-metadata-origin');
        var response = await fetcher(request.url, {method: 'GET', headers: request.headers, redirect: 'error', credentials: 'same-origin', signal: signal});
        if (response.status !== 200) throw diagnostics.error(response.status === 401 || response.status === 403 ? 'metadata-auth' : response.status >= 300 && response.status < 400 ? 'metadata-redirect' : 'metadata-http-status', 'range-metadata-denied', response.status);
        if (new URL(response.url).origin !== origin) throw diagnostics.error('metadata-origin', 'range-metadata-denied');
        if (!response.body || typeof response.body.getReader !== 'function') throw diagnostics.error('metadata-json', 'range-metadata-json');
        var reader = response.body.getReader(), chunks = [], size = 0;
        try {
            while (true) {
                var row = await reader.read(); if (row.done) break;
                size += row.value.length; if (size > 262144) throw diagnostics.error('metadata-size','range-metadata-limit'); chunks.push(row.value);
            }
        } finally {await reader.cancel().catch(function () {}); reader.releaseLock();}
        var bytes = new Uint8Array(size), offset = 0;
        chunks.forEach(function (chunk) {bytes.set(chunk, offset); offset += chunk.length;});
        try {return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));}
        catch (_) {throw diagnostics.error('metadata-json', 'range-metadata-json');}
    }
    function category(state, diagnostic, next) {
        var labels = {idle: '未预载', waiting: '等待进度或下一集', checking: '正在确认下一集', preparing: '正在准备', warming: '正在预载', ready: '预载完成', partial: '已预载部分', unavailable: '暂不可用', cancelled: '已取消'};
        var text = labels[state] || '未预载';
        if (diagnostic) text += '：' + diagnostics.text(diagnostic);
        if (next && next.bytes > 0) {
            var mb = function (n) {return Number.isFinite(n) && n >= 0 ? (n / 1000000).toFixed(1) + ' MB' : '未知';};
            text += ' · ' + mb(next.bytes) + ' / ' + mb(next.targetBytes);
        }
        return {type: 'enhanced', name: 'Emby Theater Enhanced', stats: [{label: '预载:', value: text}]};
    }
    async function bind(options) {
        var endpoint = options.endpoint;
        if (options.signal.aborted || !endpoint || !endpoint.rangeCache || !endpoint.rangeCache.enabled) return null;
        var binding = endpoint.createRangeBinding(), current = capture(options.connectionManager, options.item, options.mediaSource, options.options, options.source);
        var nextState = 'waiting', nextDiagnostic = null, lastReported = null, stateEpoch = 0, statusSequence = 0, nextCancellation = null;
        var closed = false, closing, ticking = false, ready = false, timer, candidateId = null, attemptId = null, nextController = null, job = null;
        function valid() {return !closed && !options.signal.aborted && options.isCurrent() && current();}
        function report(value) {
            var safe = diagnostics.snapshot(value), key = JSON.stringify(safe);
            if (key !== lastReported) {lastReported = key; try {if (options.onDiagnostic) options.onDiagnostic(safe);} catch (_) {}}
            return safe;
        }
        function diagnosticController(value) {
            var safe = report(value);
            return {started: function () {}, category: async function () {return !closed && !options.signal.aborted && options.isCurrent() ? category('unavailable', safe) : null;},
                close: function () {closed = true; return binding.retire().catch(function () {});}};
        }
        if (!current()) return diagnosticController({stage: 'current-context', reason: 'identity-missing'});

        async function cancelNext() {
            stateEpoch++;
            if (nextController) nextController.abort(); nextController = null; nextState = 'waiting'; nextDiagnostic = null; lastReported = null;
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
                attemptId = id; nextState = 'checking'; nextDiagnostic = null; var owner = new AbortController(); nextController = owner;
                function ownsCandidate() {var c = valid(), n = c && nextItem(options, c); return c && n && n.Id === id && candidateId === id && nextController === owner;}
                function owns() {return ownsCandidate() && !owner.signal.aborted;}
                job = (async function () {
                    var timedOut = false, deadline = setTimeout(function () {timedOut = true; owner.abort();}, endpoint.rangeCache.timeoutMs);
                    function refuse(reason) {if (owns()) {nextState = 'unavailable'; nextDiagnostic = report({stage: 'next-metadata', reason: reason});}}
                    try {
                        var currentStatus;
                        try {currentStatus = await binding.status();}
                        catch (error) {if (owns()) {nextState = 'unavailable'; nextDiagnostic = report(diagnostics.fromError(error, 'current-context', 'proxy-unavailable'));} return;}
                        if (!owns()) return;
                        var currentFailure = currentStatus && currentStatus.value && currentStatus.value.current;
                        if (currentFailure && currentFailure.state === 'original' && currentFailure.diagnostic) {
                            nextState = 'unavailable'; nextDiagnostic = report(currentFailure.diagnostic); return;
                        }
                        var api = options.connectionManager.getApiClient(context.serverId);
                        var item = await readItem(api, id, owner.signal, options.fetch || fetch);
                        if (owns()) nextState = 'unavailable';
                        if (!owns()) return;
                        if (!item || item.ServerId && item.ServerId !== context.serverId || item.Id !== id || item.Type !== 'Episode' || item.SeriesId !== options.item.SeriesId) {refuse('next-identity'); return;}
                        if (item.MediaType !== 'Video') {refuse('media-unsupported'); return;}
                        var source = await nextSource.prepare({api: api, player: options.player, item: item,
                            currentSessionId: context.playSessionId, signal: owner.signal, fetch: options.fetch || fetch,
                            requestId: options.nextRequestId && options.nextRequestId(), recoverIdentity: options.recoverIdentity,
                            resolveSource: options.resolveSource});
                        if (!owns()) return;
                        var finalUrl = new URL(source.source);
                        if (!/^https?:$/.test(finalUrl.protocol)) {refuse('source-not-http'); return;}
                        if (finalUrl.username || finalUrl.password) {refuse('source-credentials'); return;}
                        if (finalUrl.origin !== context.serverOrigin) {refuse('source-cross-origin'); return;}
                        // Resolver metadata alone grants no transport authority. Preserve the
                        // current strict source and file-local request-option boundaries.
                        if (source.requestOptions) {refuse('file-options-unproxied'); return;}
                        clearTimeout(deadline); deadline = null;
                        var result = await binding.preload(Object.assign({}, context, {source: source.source, itemId: item.Id,
                            mediaSourceId: source.mediaSourceId, mode: source.mode, container: source.container, live: false}));
                        if (owns()) {nextDiagnostic = result && result.value && result.value.diagnostic ? report(result.value.diagnostic) : null; nextState = result && result.value && result.value.state || 'unavailable'; if (nextState === 'progress-pending') {attemptId = null; nextState = 'waiting';}}
                    } catch (error) {if (ownsCandidate()) {nextState = 'unavailable'; nextDiagnostic = report(timedOut ? {stage: 'next-metadata', reason: 'timeout'} : diagnostics.fromError(error, 'next-metadata', 'network-failed'));}}
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
                    var status = result.value, next = status.next || {}, state = next.state === 'idle' ? nextState : next.state;
                    var diagnostic = next.diagnostic || (status.current && status.current.state === 'original' && status.current.diagnostic) || nextDiagnostic;
                    return category(diagnostic && (state === 'waiting' || state === 'idle') ? 'unavailable' : state, diagnostic, next);
                } catch (error) {
                    var latest = valid(), latestNext = latest && nextItem(options, latest);
                    if (!latest || nextCancellation || ticket !== stateEpoch || sequence !== statusSequence || nextId !== candidateId || nextId !== (latestNext && latestNext.Id)) return null;
                    return category('unavailable', nextDiagnostic || report(diagnostics.fromError(error, 'lifecycle', 'proxy-unavailable')));
                }
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
        try {
            var result = await binding.setContext(current());
            if (result && result.value && result.value.state === 'unavailable') return diagnosticController(result.value.diagnostic || {stage: 'current-context', reason: 'context-missing'});
        } catch (error) {return diagnosticController(diagnostics.fromError(error, 'current-context', 'proxy-unavailable'));}
        if (!valid()) {await controller.close(); return null;}
        return controller;
    }
    return {bind: bind, capture: capture, nextItem: nextItem, category: category};
}));
