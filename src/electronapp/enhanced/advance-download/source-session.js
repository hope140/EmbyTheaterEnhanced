'use strict';

const {randomUUID, createHash} = require('node:crypto');
const strmResolver = require('../../resolvers/strm-resolver');
const mountResolver = require('../../resolvers/mount-resolver');
const {validateUserAgent} = require('../cd2-service');
const probe = require('./source-probe');
const {failure} = probe;
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(value);
const text = value => typeof value === 'string' && value.length <= 8192 && !/[\u0000-\u001f\u007f]/.test(value);

function createSession(input, dependencies = {}) {
    if (!input || !['serverId', 'accountId', 'itemId'].every(key => identifier(input[key])) ||
        input.mediaSourceId !== undefined && !identifier(input.mediaSourceId) || !text(input.token) || !input.token) throw failure('invalid-request');
    const server = probe.sourceUrl(input.serverAddress);
    if (server.search || server.hash) throw failure('invalid-server');
    server.pathname = server.pathname.replace(/\/+$/, '') + '/';
    let token = input.token, closed = false, baseline, selectedId = input.mediaSourceId;
    const controller = new AbortController();
    let active = false;
    const identity = {serverId: input.serverId, accountId: input.accountId, itemId: input.itemId};
    const json = dependencies.jsonRequest || probe.jsonRequest;
    const check = dependencies.probeSource || probe.probeSource;
    const getConfig = dependencies.getConfig || (() => ({resolver: {version: 1, enabled: false, rules: []}, runtime: {enabled: false}}));
    function apiUrl(relative) {return new URL(relative, server).href;}
    function alive(signal) {if (closed || signal.aborted) throw failure('cancelled');}
    async function acquire(signal) {
        if (closed || active) throw failure(closed ? 'cancelled' : 'request-pending');
        active = true;
        const timeout = AbortSignal.timeout(30000);
        const combined = AbortSignal.any([controller.signal, timeout, ...(signal ? [signal] : [])]);
        let service;
        async function resolveCd2(request) {
            alive(combined);
            const abort = () => service.cancel(request.requestId);
            combined.addEventListener('abort', abort, {once: true});
            try {return await service.resolve(request);}
            finally {combined.removeEventListener('abort', abort);}
        }
        try {
            alive(combined);
            const headers = {'X-Emby-Token': token};
            // A renderer DTO or a prior playback grant is not permission to download.
            const info = await json(apiUrl('System/Info/Public'), headers, combined);
            alive(combined);
            if (info.Id !== identity.serverId) throw failure('server-changed');
            const user = await json(apiUrl('Users/' + identity.accountId), headers, combined);
            alive(combined);
            if (user.Id !== identity.accountId || user.Policy?.EnableContentDownloading !== true) throw failure('download-not-permitted');
            const item = await json(apiUrl('Users/' + identity.accountId + '/Items/' + identity.itemId), headers, combined);
            alive(combined);
            if (item.Id !== identity.itemId || item.ServerId && item.ServerId !== identity.serverId || item.MediaType !== 'Video' || item.CanDownload !== true) throw failure('download-not-permitted');
            const sources = Array.isArray(item.MediaSources) ? item.MediaSources : [];
            const source = selectedId ? sources.find(value => value.Id === selectedId) : sources.length === 1 ? sources[0] : null;
            if (!source || !identifier(source.Id)) throw failure(selectedId ? 'source-unavailable' : 'source-selection-required');
            selectedId = source.Id;
            if (source.IsInfiniteStream || source.IsRemote === true && /^(?:rtsp|rtmp)$/i.test(source.Protocol || '') || source.Type === 'Placeholder') throw failure('stream-unsupported');
            const original = new URL(apiUrl('Items/' + identity.itemId + '/Download'));
            original.searchParams.set('mediaSourceId', source.Id);
            const context = {item, mediaSource: source, sidecarPath: item.Path, sourcePath: source.Path,
                nativeSource: original.href, playMethod: 'DirectPlay'};
            const config = getConfig();
            if (!config?.resolver || !config?.runtime) throw failure('invalid-config');
            if (strmResolver.isStrm(context) && config.resolver.enabled && config.runtime.enabled && dependencies.createCd2Service) service = dependencies.createCd2Service(config.runtime);
            const requestId = 'download-' + randomUUID();
            const transport = service && {resolve: resolveCd2, cancel: id => service.cancel(id)};
            const resolved = await strmResolver.resolveAsync(context, {config: config.resolver, fs: dependencies.fs || require('node:fs'),
                signal: combined, requestId, cd2Transport: transport});
            alive(combined);
            const candidates = [];
            if (resolved.type === 'url') candidates.push({url: resolved.source, headers: resolved.requestOptions?.userAgent ? {'User-Agent': resolved.requestOptions.userAgent} : {}, kind: resolved.sourceKind});
            // Main-fetched HTTP MediaSource is an additional original-byte candidate,
            // not a renderer-supplied arbitrary URL. Unsupported headers are refused.
            const mediaHeaders = source.RequiredHttpHeaders || source.HttpHeaders;
            const entries = mediaHeaders && typeof mediaHeaders === 'object' && !Array.isArray(mediaHeaders) ? Object.entries(mediaHeaders) : [];
            const headersSupported = (mediaHeaders == null || typeof mediaHeaders === 'object' && !Array.isArray(mediaHeaders)) &&
                entries.length <= 1 && entries.every(([key, value]) => key.toLowerCase() === 'user-agent' && validateUserAgent(value).valid === true);
            if (typeof source.Path === 'string' && /^https?:\/\//i.test(source.Path) && headersSupported) {
                candidates.push({url: source.Path, headers: entries.length ? {'User-Agent': entries[0][1]} : {}, kind: 'media-source-http'});
            }
            // A direct CD2 URL may fail its byte probe while the same-origin route
            // remains usable. Re-query our own service; never borrow preload grants.
            if (resolved.sourceKind === 'direct-url' && service) {
                candidates.push({resolve: async () => {
                    const reply = await resolveCd2({requestId: 'download-' + randomUUID(),
                        candidates: mountResolver.getCandidates(context, {fs: dependencies.fs || require('node:fs')}),
                        ruleId: resolved.ruleId, mode: 'same-origin'});
                    alive(combined);
                    if (reply.status !== 'hit' || reply.type !== 'url') throw failure('source-unavailable');
                    return {url: reply.source, headers: {}, kind: 'cd2-url'};
                }});
            }
            candidates.push({url: original.href, headers, kind: 'emby-original'});
            let lastError;
            for (let candidate of candidates) {
                try {
                    alive(combined);
                    if (candidate.resolve) candidate = await candidate.resolve();
                    const sizeHint = String(source.Container || '').toLowerCase() !== 'strm' && Number.isSafeInteger(source.Size) && source.Size > 0 ? source.Size : undefined;
                    const result = await check({...candidate, container: String(source.Container || '').toLowerCase(), sizeHint}, {signal: combined});
                    alive(combined);
                    const representation = JSON.stringify([identity.serverId, identity.accountId, identity.itemId,
                        source.Id, source.Container || '', result.extension, result.total]);
                    if (baseline && (baseline.representation !== representation || baseline.etag && baseline.etag !== result.etag)) throw failure('representation-changed');
                    baseline ||= {representation, etag: result.etag};
                    return Object.freeze({...result, kind: candidate.kind, mediaSourceId: source.Id,
                        title: typeof item.Name === 'string' ? item.Name.slice(0, 256) : 'Video',
                        identity: createHash('sha256').update(representation).digest('hex')});
                } catch (error) {
                    alive(combined);
                    if (probe.reasonOf(error) === 'representation-changed') throw error;
                    lastError = error;
                }
            }
            throw failure(probe.reasonOf(lastError));
        } catch (error) {
            if (closed || signal?.aborted) throw failure('cancelled');
            if (timeout.aborted) throw failure('timeout');
            throw failure(probe.reasonOf(error));
        } finally {
            try {if (service) await service.close();}
            catch (_) {throw failure('source-close-failed');}
            finally {active = false;}
        }
    }
    return Object.freeze({acquire, close() {closed = true; token = null; controller.abort();}});
}

module.exports = {createSession};
