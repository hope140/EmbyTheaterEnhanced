(function (factory) {
    if (typeof define === 'function' && define.amd) define(['./playback-range-diagnostics.js'], factory);
    else if (typeof module === 'object' && module.exports) module.exports = factory(require('./playback-range-diagnostics'));
}(function (diagnostics) {
    'use strict';
    var LIMIT = 262144;
    function fail(reason, status) {return diagnostics.error(reason, 'preload-next-source-' + reason, status);}
    function active(signal) {if (signal && signal.aborted) throw fail('request-cancelled');}
    function text(value) {return typeof value === 'string' && value.length > 0;}
    function clone(value) {return JSON.parse(JSON.stringify(value));}
    function sameOrigin(url, origin) {
        var parsed;
        try {parsed = new URL(url);} catch (_) {throw fail('metadata-origin');}
        if (parsed.origin !== origin || !/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) throw fail('metadata-origin');
    }
    async function read(api, fetcher, origin, url, method, body, signal) {
        active(signal);
        sameOrigin(url, origin);
        var request = {type: method, url: url, headers: {accept: 'application/json'}};
        if (body !== undefined) request.headers['content-type'] = 'application/json';
        api.setAuthorizationInfoIntoRequest(request, true);
        sameOrigin(request.url, origin);
        active(signal);
        var response;
        try {
            response = await fetcher(request.url, {method: method, headers: request.headers, body: body,
                redirect: 'error', credentials: 'same-origin', signal: signal});
        } catch (_) {active(signal); throw fail('network-failed');}
        try {
            active(signal);
            if (!response || response.status !== 200) {
                var status = response && response.status;
                throw fail(status === 401 || status === 403 ? 'metadata-auth' : status >= 300 && status < 400 ? 'metadata-redirect' : 'metadata-http-status', status);
            }
            sameOrigin(response.url, origin);
            if (!response.body || typeof response.body.getReader !== 'function') throw fail('metadata-json');
        } catch (error) {
            try {if (response && response.body && response.body.cancel) await response.body.cancel();} catch (_) {}
            active(signal); throw error;
        }
        var reader = response.body.getReader(), chunks = [], size = 0;
        try {
            while (true) {
                active(signal);
                var row = await reader.read();
                active(signal);
                if (row.done) break;
                if (!ArrayBuffer.isView(row.value) || Object.prototype.toString.call(row.value) !== '[object Uint8Array]') throw fail('metadata-json');
                size += row.value.byteLength;
                if (size > LIMIT) throw fail('metadata-size');
                chunks.push(row.value);
            }
        } catch (error) {
            active(signal);
            throw diagnostics.error(diagnostics.fromError(error, 'next-metadata', 'metadata-json').reason, 'preload-next-source-body');
        } finally {
            try {await reader.cancel();} catch (_) {}
            try {reader.releaseLock();} catch (_) {}
        }
        active(signal);
        var bytes = new Uint8Array(size), offset = 0;
        chunks.forEach(function (chunk) {bytes.set(chunk, offset); offset += chunk.byteLength;});
        try {return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));}
        catch (_) {throw fail('metadata-json');}
    }
    async function prepare(options) {
        options = options || {};
        var signal = options.signal;
        try {
            active(signal);
            var api = options.api, player = options.player, item = clone(options.item);
            if (!item || !text(item.Id) || item.MediaType !== 'Video' || !text(options.currentSessionId)) throw fail('metadata-shape');
            if (!api || !player || typeof player.getDeviceProfile !== 'function' || typeof options.resolveSource !== 'function') throw fail('context-missing');
            var address = new URL(api.serverAddress());
            if (!/^https?:$/.test(address.protocol) || address.username || address.password) throw fail('metadata-origin');
            var origin = address.origin, userId = api.getCurrentUserId();
            if (!text(userId)) throw fail('identity-missing');
            var fetcher = options.fetch || fetch;
            var profile = await player.getDeviceProfile(item);
            active(signal);
            var params = {UserId: userId, StartTimeTicks: 0, IsPlayback: false, AutoOpenLiveStream: false, CurrentPlaySessionId: options.currentSessionId};
            var protocols = typeof player.getDirectPlayProtocols === 'function' ? player.getDirectPlayProtocols() : ['File', 'Http'];
            if (typeof player.getDirectPlayProtocols === 'function') params.DirectPlayProtocols = protocols;
            if (player.enableMediaProbe && !player.enableMediaProbe(item)) params.EnableMediaProbe = false;
            var info = await read(api, fetcher, origin, api.getUrl('Items/' + encodeURIComponent(item.Id) + '/PlaybackInfo', params), 'POST', JSON.stringify({DeviceProfile: profile}), signal);
            active(signal);
            if (!info || !Array.isArray(info.MediaSources) || info.MediaSources.length !== 1) throw fail('source-count');
            var mediaSource = clone(info.MediaSources[0]);
            if (!mediaSource || !text(mediaSource.Id)) throw fail('metadata-shape');
            if (mediaSource.LiveStreamId || mediaSource.IsInfiniteStream || mediaSource.RequiresOpening || item.Type === 'TvChannel') throw fail('live-unsupported');
            if (!/^[a-z0-9]{1,12}$/i.test(mediaSource.Container || '')) throw fail('container-unsupported');
            var protocol = String(mediaSource.Protocol || '').toLowerCase(), nativeSource, mode;
            if (mediaSource.SupportsDirectPlay && text(mediaSource.Path) && (protocol === 'file' || protocol === 'http') &&
                Array.isArray(protocols) && protocols.some(function (value) {return String(value).toLowerCase() === protocol;})) {
                nativeSource = mediaSource.Path; mode = 'DirectPlay';
            } else if (mediaSource.SupportsDirectStream) {
                mode = 'DirectStream';
                if (text(mediaSource.DirectStreamUrl)) nativeSource = api.getUrl(mediaSource.DirectStreamUrl);
                else {
                    var direct = {Static: true, mediaSourceId: mediaSource.Id, deviceId: api.deviceId(), api_key: api.accessToken()};
                    if (mediaSource.ETag) direct.Tag = mediaSource.ETag;
                    nativeSource = api.getUrl('Videos/' + encodeURIComponent(item.Id) + '/stream.' + mediaSource.Container.toLowerCase().replace('m4v', 'mp4'), direct);
                    sameOrigin(nativeSource, origin);
                }
            } else throw fail('directstream-required');
            active(signal);
            var context = {item: item, mediaSource: mediaSource, sidecarPath: item.Path, sourcePath: mediaSource.Path,
                nativeSource: nativeSource, playMethod: mode,
                streamInfo: {item: item, mediaSource: mediaSource, url: nativeSource, playMethod: mode, mediaType: item.MediaType, playSessionId: options.currentSessionId}};
            if (!text(item.Path) && typeof options.recoverIdentity === 'function') {
                var facade = {getCurrentUserId: function () {return userId;}, getItem: function (requestedUser, id, fields, recoverySignal) {
                    active(signal);
                    if (requestedUser !== userId || id !== item.Id || !fields || fields.Fields !== 'Path') return Promise.reject(fail('next-identity'));
                    return read(api, fetcher, origin, api.getUrl('Users/' + encodeURIComponent(userId) + '/Items/' + encodeURIComponent(item.Id), {Fields: 'Path'}), 'GET', undefined, recoverySignal || signal);
                }};
                var recovery = await options.recoverIdentity({item: item, signal: signal, connectionManager: {getApiClient: function (serverId) {
                    if (serverId !== item.ServerId) throw fail('next-identity'); return facade;
                }}});
                active(signal);
                if (recovery && text(recovery.recoveredPath)) context.sidecarPath = recovery.recoveredPath;
            }
            active(signal);
            var result = await options.resolveSource(context, {signal: signal, requestId: options.requestId});
            active(signal);
            var selected = {source: result && text(result.source) ? result.source : nativeSource, mediaSourceId: mediaSource.Id, mode: mode, container: mediaSource.Container, live: false};
            // This returns resolver metadata, not authority to fetch that source.
            // The caller still owns strict source eligibility and request options.
            if (result && text(result.source)) ['type', 'sourceKind', 'requestOptions', 'acquiredAt', 'expiresAt'].forEach(function (key) {
                if (result[key] !== undefined) selected[key] = clone(result[key]);
            });
            return selected;
        } catch (error) {
            active(signal);
            throw diagnostics.error(diagnostics.fromError(error, 'next-metadata', 'unexpected').reason, 'preload-next-source-failed', diagnostics.fromError(error, 'next-metadata', 'unexpected').httpStatus);
        }
    }
    return {prepare: prepare};
}));
