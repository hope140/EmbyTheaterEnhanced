'use strict';
const crypto = require('node:crypto');
const {createCache} = require('./playback-range-cache');
const {selection} = require('./playback-range-policy');
const {mediaKey} = require('./playback-range-store');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const contextFields = ['source', 'serverOrigin', 'serverId', 'accountId', 'itemId', 'mediaSourceId', 'playSessionId', 'mode', 'mediaType', 'container', 'live'];
function parseContext(value) {
    if (!value || Object.keys(value).some(k => !contextFields.includes(k)) || value.mode !== 'DirectPlay' && value.mode !== 'DirectStream' || value.mediaType !== 'Video' || value.live === true ||
        ['source', 'serverOrigin', 'serverId', 'accountId', 'itemId', 'mediaSourceId', 'playSessionId'].some(k => typeof value[k] !== 'string' || !value[k] || value[k].length > 8192)) return null;
    try {
        if (!['mp4', 'm4v', 'mkv', 'matroska', 'mov', 'avi', 'webm', 'mpg', 'mpeg', 'ts', 'm2ts'].includes(String(value.container).toLowerCase())) return null;
        const url = new URL(value.source), origin = new URL(value.serverOrigin).origin;
        if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || value.serverOrigin !== origin || url.username || url.password || url.hash) return null;
        const staticValues = [...url.searchParams].filter(([key]) => key.toLowerCase() === 'static');
        if (value.mode === 'DirectStream' && (staticValues.length !== 1 || staticValues[0][1].toLowerCase() !== 'true')) return null;
        // Only established Emby authorization/session query fields are transient.
        const query = url.search.slice(1).split('&').filter(part => !['api_key', 'x-emby-token', 'playsessionid'].includes(decodeURIComponent(part.split('=')[0]).toLowerCase())).join('&');
        const identity = {serverId: value.serverId, serverOrigin: origin, accountId: value.accountId, itemId: value.itemId,
            mediaSourceId: value.mediaSourceId, representation: hash([value.mode, url.pathname, query])};
        return Object.freeze({...value, identity});
    } catch (_) {return null;}
}
function playbackContext(value) {
    if (!value || Object.keys(value).some(k => !contextFields.includes(k)) || value.mediaType !== 'Video' || ['serverId', 'serverOrigin', 'accountId', 'itemId', 'mediaSourceId', 'playSessionId'].some(k => typeof value[k] !== 'string' || !value[k] || value[k].length > 2048)) return null;
    return {...value, identity: null};
}
function createSession({config, create = createCache}) {
    if (!config) return null;
    const policy = selection(config), work = new Set();
    let cacheInstance = null, nextProgress = {state: 'idle', bytes: 0, targetBytes: policy.prefetchBytes};
    let cachePromise, current = null, next = null, epoch = 0, playedEpoch = 0, closed = false, closing, retirement = Promise.resolve();
    const ensure = () => cachePromise ||= Promise.resolve(create(config)).then(value => {cacheInstance = value; return value;});
    const track = promise => {work.add(promise); promise.finally(() => work.delete(promise)).catch(() => {}); return promise;};
    function retire(preserveNext = true) {
        ++epoch; const old = current, oldNext = next; current = next = null;
        nextProgress = {state: 'idle', bytes: 0, targetBytes: policy.prefetchBytes};
        if (old) old.controller.abort(); if (oldNext) oldNext.controller.abort();
        const cleanup = retirement.then(async () => {
            await Promise.allSettled([old && old.handle && old.handle.stop(), oldNext && oldNext.handle && oldNext.handle.stop()]);
            if (!preserveNext && cachePromise) {try {await (await cachePromise).discardNext();} catch (_) {}}
        });
        retirement = cleanup.catch(() => {}); return cleanup;
    }
    function setContext(value, helper, generationId) {
        return track((async () => {
            const ticket = epoch + 1; await retire();
            const parsed = parseContext(value) || playbackContext(value);
            if (closed || epoch !== ticket || !parsed || helper.exited || helper.transportTerminated || helper.currentGenerationId !== generationId) return {state: 'unavailable'};
            const record = {value: parsed, helper, generationId, epoch, controller: new AbortController(), handle: null, playing: false}; current = record;
            return {state: 'ready'};
        })());
    }
    function owns(record) {return !closed && current === record && epoch === record.epoch && !record.controller.signal.aborted &&
        !record.helper.exited && !record.helper.transportTerminated && record.helper.currentGenerationId === record.generationId;}
    async function select(source, helper, generationId) {
        const record = current;
        if (!record || !record.value.identity || !owns(record) || record.value.source !== source || record.helper !== helper || record.generationId !== generationId) return null;
        try {
            const cache = await ensure(); if (!owns(record)) return null;
            const handle = await cache.open({source, identity: record.value.identity, isCurrent: () => owns(record), signal: record.controller.signal});
            if (!owns(record)) {await handle.stop(); return null;}
            record.handle = handle;
            return {source: handle.source, canDispatch: () => owns(record), cancel: () => handle.stop()};
        } catch (_) {return null;}
    }
    function started(helper, generationId) {
        const record = current;
        if (!record || !owns(record) || record.helper !== helper || record.generationId !== generationId || record.playing) return Promise.resolve();
        record.playing = true;
        const play = ++playedEpoch;
        // Queue a confirmed start before a subsequent Stop can release its read lease.
        const promotion = record.handle ? record.handle.markPlaying() : null;
        return track((async () => {
            const cache = await ensure();
            if (promotion) await promotion;
            else if (playedEpoch === play) await cache.discardLastUnless(mediaKey(record.value));
            if (playedEpoch === play) await cache.discardNext();
        })());
    }
    function preload(value, helper, generationId) {
        return track((async () => {
            const owner = current, parsed = parseContext(value);
            if (!owner || !owner.handle || !owner.playing || !owns(owner) || owner.helper !== helper || owner.generationId !== generationId || !parsed ||
                parsed.serverId !== owner.value.serverId || parsed.accountId !== owner.value.accountId || parsed.serverOrigin !== owner.value.serverOrigin ||
                parsed.itemId === owner.value.itemId || parsed.playSessionId !== owner.value.playSessionId) return {state: 'unavailable'};
            if (next) return {state: 'already-preparing'};
            const record = {controller: new AbortController(), handle: null}; next = record;
            nextProgress = {state: 'preparing', bytes: 0, targetBytes: policy.prefetchBytes};
            const valid = () => next === record && owns(owner) && !record.controller.signal.aborted;
            try {
                const cache = await ensure(); if (!valid()) throw Error('range-next-retired');
                record.handle = await cache.open({source: parsed.source, identity: parsed.identity, role: 'next', isCurrent: valid, signal: record.controller.signal});
                if (!valid()) throw Error('range-next-retired');
                const size = record.handle.status ? record.handle.status().total : policy.prefetchBytes;
                nextProgress = {state: 'warming', bytes: 0, targetBytes: Math.min(size, policy.prefetchBytes)};
                const result = await record.handle.prefetch({maxBytes: policy.prefetchBytes, bytesPerSecond: config.bytesPerSecond, signal: record.controller.signal,
                    onProgress(value) {if (valid()) nextProgress = {state: 'warming', bytes: value.bytes, targetBytes: value.targetBytes};}});
                if (valid()) nextProgress = {...nextProgress, bytes: result.bytes, state: result.bytes >= nextProgress.targetBytes ? 'ready' : 'partial'};
                return {state: 'ready', bytes: result.bytes};
            } catch (_) {if (valid()) nextProgress = {...nextProgress, state: 'unavailable'}; return {state: record.controller.signal.aborted ? 'cancelled' : 'unavailable'};}
        })());
    }
    function cancelNext() {
        const old = next; next = null; nextProgress = {state: 'idle', bytes: 0, targetBytes: policy.prefetchBytes};
        if (old) old.controller.abort();
        return track((async () => {
            if (old && old.handle) await old.handle.stop();
            if (cachePromise) await (await cachePromise).discardNext();
        })());
    }
    return {cancelNext, setContext, select: (...args) => track(select(...args)), started, preload, retire,
        status: () => {
            let bytes = 0; try {if (current && current.handle && current.handle.status) bytes = current.handle.status().bytes;} catch (_) {}
            return {enabled: true, ...policy, timeoutMs: config.timeoutMs,
                current: {state: current ? current.handle ? current.playing ? 'active' : 'preparing' : 'original' : 'idle', bytes},
                next: {...nextProgress}, diskBytes: cacheInstance ? cacheInstance.status().bytes : 0, maxBytes: config.maxBytes};
        },
        close() {
            if (closing) return closing; closed = true;
            closing = (async () => {await retire(false); await Promise.allSettled([...work]); if (cachePromise) await (await cachePromise).close();})(); return closing;
        }};
}
module.exports = {createSession, parseContext};
