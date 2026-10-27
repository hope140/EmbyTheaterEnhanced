'use strict';
const crypto = require('node:crypto');
const {createCache} = require('./playback-range-cache');
const {selection} = require('./playback-range-policy');
const diagnostics = require('./playback-range-diagnostics');
// Optional load/replace preparation includes the actual Native budget read,
// fresh source probe and ready cache key. Steady-state seek does not enter it.
const SHARED_PREPARE_TIMEOUT_MS = 50;
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const contextFields = ['source', 'serverOrigin', 'serverId', 'accountId', 'itemId', 'mediaSourceId', 'playSessionId', 'mode', 'mediaType', 'container', 'live', 'sourceProof'];
function parseContext(value) {
    if (!value || value.sourceProof !== undefined || Object.keys(value).some(k => !contextFields.includes(k)) || value.mode !== 'DirectPlay' && value.mode !== 'DirectStream' || value.mediaType !== 'Video' || value.live === true ||
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
function contextDiagnostic(value, stage = 'current-context') {
    let reason = 'source-invalid';
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !contextFields.includes(k))) reason = 'context-missing';
    else if (value.mediaType !== 'Video') reason = 'media-unsupported';
    else if (value.live === true) reason = 'live-unsupported';
    else if (value.mode !== 'DirectPlay' && value.mode !== 'DirectStream') reason = 'mode-unsupported';
    else if (['source','serverOrigin','serverId','accountId','itemId','mediaSourceId','playSessionId'].some(k => typeof value[k] !== 'string' || !value[k] || value[k].length > 8192)) reason = 'identity-missing';
    else {
        try {
            const url = new URL(value.source), origin = new URL(value.serverOrigin).origin;
            if (!['http:', 'https:'].includes(url.protocol)) reason = 'source-not-http';
            else if (url.origin !== origin || value.serverOrigin !== origin) reason = 'source-cross-origin';
            else if (url.username || url.password) reason = 'source-credentials';
            else if (url.hash) reason = 'source-invalid';
            else if (!['mp4','m4v','mkv','matroska','mov','avi','webm','mpg','mpeg','ts','m2ts'].includes(String(value.container).toLowerCase())) reason = 'container-unsupported';
        } catch (_) {reason = 'source-invalid';}
    }
    return diagnostics.snapshot({stage, reason});
}
function playbackContext(value) {
    if (!value || Object.keys(value).some(k => !contextFields.includes(k)) || value.mediaType !== 'Video' || ['serverId', 'serverOrigin', 'accountId', 'itemId', 'mediaSourceId', 'playSessionId'].some(k => typeof value[k] !== 'string' || !value[k] || value[k].length > 2048)) return null;
    return {...value, identity: null};
}
function createSession({config, create = createCache, onDiagnostic = () => {}, authorize, readCurrentBytes, now = () => require('node:perf_hooks').performance.now()}) {
    if (!config) return null;
    if (!['next-prefix', 'shared-byte-trial'].includes(config.kind)) throw Error('next-prefix-required');
    const policy = selection(config), work = new Set();
    let cacheInstance = null, nextProgress = {state: 'idle', bytes: 0, targetBytes: policy.prefetchBytes};
    let cacheFailed = false;
    let cachePromise, current = null, next = null, epoch = 0, playedEpoch = 0, closed = false, closing, retirement = Promise.resolve();
    const ensure = () => cachePromise ||= Promise.resolve(create(config)).then(value => {cacheInstance = value; return value;}, error => {cacheFailed = true; throw error;});
    const track = promise => {work.add(promise); promise.finally(() => work.delete(promise)).catch(() => {}); return promise;};
    function report(value) {const safe = diagnostics.snapshot(value); try {onDiagnostic(safe);} catch (_) {} return safe;}
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
    function ownedContext(value, role, helper, generationId, signal) {
        if (!value || value.sourceProof === undefined) return parseContext(value);
        const base = playbackContext(value);
        if (!base || typeof authorize !== 'function' || typeof value.sourceProof !== 'string' || value.sourceProof.length > 128 ||
            value.live === true || !['DirectPlay', 'DirectStream'].includes(value.mode) ||
            !['strm','mp4','m4v','mkv','matroska','mov','avi','webm','mpg','mpeg','ts','m2ts','mts','vob','wmv','flv'].includes(String(value.container).toLowerCase())) {
            throw diagnostics.error('source-proof-invalid', 'range-source-proof-invalid');
        }
        try {
            const origin = new URL(value.serverOrigin);
            if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== value.serverOrigin) throw Error();
        } catch (_) {throw diagnostics.error('source-proof-invalid', 'range-source-proof-invalid');}
        const transport = authorize(value, role, signal, helper, generationId);
        if (!require('./preload-source-authority').isTransport(transport)) throw diagnostics.error('source-proof-invalid', 'range-source-proof-invalid');
        return {...base, identity: {serverId: value.serverId, serverOrigin: value.serverOrigin, accountId: value.accountId,
            itemId: value.itemId, mediaSourceId: value.mediaSourceId, representation: transport.representation}, transport};
    }
    function setContext(value, helper, generationId) {
        return track((async () => {
            const ticket = epoch + 1; await retire();
            const controller = new AbortController();
            let parsed, diagnostic;
            try {parsed = ownedContext(value, 'current', helper, generationId, controller.signal);}
            catch (error) {diagnostic = diagnostics.fromError(error, 'current-context', 'source-proof-invalid');}
            parsed ||= playbackContext(value);
            if (closed || epoch !== ticket || helper.exited || helper.transportTerminated || helper.currentGenerationId !== generationId) {controller.abort(); return {state: 'unavailable', diagnostic: diagnostics.snapshot({stage: 'lifecycle', reason: 'generation-retired'})};}
            if (!parsed) {controller.abort(); return {state: 'unavailable', diagnostic: report(diagnostic || contextDiagnostic(value))};}
            const record = {value: parsed, helper, generationId, epoch, controller, handle: null, playing: false, selection: 'idle', diagnostic: parsed.identity ? null : report(diagnostic || contextDiagnostic(value))}; current = record;
            return {state: 'ready', ...(record.diagnostic ? {diagnostic: record.diagnostic} : {})};
        })());
    }
    function owns(record) {return !closed && current === record && epoch === record.epoch && !record.controller.signal.aborted &&
        !record.helper.exited && !record.helper.transportTerminated && record.helper.currentGenerationId === record.generationId;}
    async function select(source, helper, generationId, loadOptions) {
        const record = current;
        if (!record || !record.value.identity || !owns(record) || record.value.source !== source || record.helper !== helper || record.generationId !== generationId) return null;
        // One attempt belongs to this explicit Play. Late backend readiness is
        // reusable infrastructure, never permission to replace its fallback.
        if (config.kind === 'shared-byte-trial') {
            if (record.selection !== 'idle') return null;
            record.selection = 'preparing';
        }
        if (loadOptions) {
            if (record.value.transport ? !record.value.transport.matchesLoadOptions(loadOptions) : loadOptions.length !== 2) {
                record.selection = 'original';
                record.diagnostic = report({stage: 'current-context', reason: record.value.transport ? 'source-options-changed' : 'file-options-unproxied'});
                return null;
            }
        }
        try {
            let handle, budget;
            if (config.kind === 'shared-byte-trial') {
                // Optional cache preparation must not hold loadfile behind a
                // slow backend/property read. The original source stays owned.
                const selection = new AbortController(), signal = AbortSignal.any([selection.signal, record.controller.signal]);
                const expiresAt = now() + SHARED_PREPARE_TIMEOUT_MS;
                const active = () => {
                    if (now() >= expiresAt) {
                        selection.abort();
                        throw diagnostics.error('timeout', 'range-shared-prepare-timeout');
                    }
                    if (!owns(record) || signal.aborted || record.selection !== 'preparing')
                        throw diagnostics.error('generation-retired', 'range-shared-retired');
                };
                let timer;
                const deadline = new Promise((_resolve, reject) => {timer = setTimeout(() => {
                    selection.abort(); reject(diagnostics.error('timeout', 'range-shared-prepare-timeout'));
                }, SHARED_PREPARE_TIMEOUT_MS);});
                const preparing = (async () => {
                    if (typeof readCurrentBytes !== 'function') throw diagnostics.error('identity-missing', 'range-shared-budget-unavailable');
                    budget = await readCurrentBytes(helper, generationId);
                    active();
                    if (!budget || typeof budget.isCurrent !== 'function' || !budget.isCurrent()) throw diagnostics.error('generation-retired', 'range-shared-budget-retired');
                    const currentBytes = budget.bytes;
                    active();
                    record.currentBytes = currentBytes;
                    const cache = await ensure();
                    active();
                    const value = await cache.open({source, identity: record.value.identity, transport: record.value.transport,
                        currentBytes, isCurrent: () => owns(record) && ['preparing', 'proxy'].includes(record.selection) && !signal.aborted && budget.isCurrent() && (record.selection === 'proxy' || now() < expiresAt), signal});
                    try {
                        // Publishing a proxy is not proof its restored metadata
                        // is ready. Keep this wait inside the existing load cap;
                        // cancellation retires late recovery without a cold body.
                        if (typeof value.ready === 'function') await value.ready();
                        active();
                        if (!budget.isCurrent()) throw diagnostics.error('generation-retired', 'range-shared-retired');
                        return value;
                    } catch (error) {await value.stop(); throw error;}
                })();
                try {
                    handle = await Promise.race([preparing, deadline]);
                    try {active();} catch (error) {await handle.stop(); throw error;}
                }
                catch (error) {
                    selection.abort();
                    if (now() >= expiresAt) throw diagnostics.error('timeout', 'range-shared-prepare-timeout');
                    throw error;
                }
                finally {clearTimeout(timer);}
            } else {
                const cache = await ensure(); if (!owns(record)) return null;
                handle = await cache.open({source, identity: record.value.identity, transport: record.value.transport, isCurrent: () => owns(record), signal: record.controller.signal});
            }
            if (!owns(record) || budget && !budget.isCurrent()) {await handle.stop(); return null;}
            record.handle = handle; record.selection = 'proxy';
            let cancelling;
            function cancel() {
                // Clear synchronously: original-source fallback must not later
                // mark this un-dispatched proxy as the actually playing route.
                if (record.handle === handle) {record.handle = null; record.selection = 'original';}
                return cancelling ||= track(Promise.resolve().then(() => handle.stop()));
            }
            return {source: handle.source, canDispatch: () => owns(record) && record.handle === handle && (!budget || budget.isCurrent()),
                ...(budget ? {commit: () => budget.commit()} : {}), cancel};
        } catch (error) {if (owns(record)) {record.selection = 'original'; record.diagnostic = report(diagnostics.fromError(error, 'current-probe', 'cache-unavailable'));} return null;}
    }
    function unproxied(reason, helper, generationId) {
        const record = current;
        if (record && owns(record) && !record.diagnostic && record.helper === helper && record.generationId === generationId) record.diagnostic = report({stage: 'current-context', reason});
    }
    function started(helper, generationId) {
        const record = current;
        if (!record || !owns(record) || record.helper !== helper || record.generationId !== generationId || record.playing) return Promise.resolve();
        record.playing = true;
        if (!record.handle) record.selection = 'original';
        const play = ++playedEpoch;
        // Queue a confirmed start before a subsequent Stop can release its read lease.
        const promotion = record.handle ? record.handle.markPlaying() : null;
        return track((async () => {
            const cache = await ensure();
            if (promotion) await promotion;
            if (config.kind === 'shared-byte-trial') {
                if (!promotion && playedEpoch === play && typeof cache.markUncachedPlaying === 'function') await cache.markUncachedPlaying(record.value, () => playedEpoch === play && owns(record));
            } else if (playedEpoch === play) await cache.discardNext();
        })());
    }
    function preload(value, helper, generationId) {
        return track((async () => {
            const owner = current;
            function refuse(diagnostic) {
                const safe = diagnostics.snapshot(diagnostic);
                if (owner && owns(owner) && owner.helper === helper && owner.generationId === generationId) {
                    nextProgress = {state: 'unavailable', bytes: 0, targetBytes: policy.prefetchBytes, diagnostic: report(safe)};
                }
                return {state: 'unavailable', diagnostic: safe};
            }
            if (!owner || !owns(owner) || owner.helper !== helper || owner.generationId !== generationId) return refuse({stage: 'lifecycle', reason: 'generation-retired'});
            if (!owner.handle) return refuse(owner.diagnostic || {stage: 'current-context', reason: 'current-proxy-required'});
            if (!owner.playing) return refuse({stage: 'progress-check', reason: 'waiting-progress'});
            if (next) return {state: 'already-preparing'};
            const controller = new AbortController(); let parsed;
            try {parsed = ownedContext(value, 'next', helper, generationId, controller.signal);}
            catch (error) {controller.abort(); return refuse(diagnostics.fromError(error, 'next-context', 'source-proof-invalid'));}
            if (!parsed) {controller.abort(); return refuse(contextDiagnostic(value, 'next-context'));}
            if (parsed.serverId !== owner.value.serverId || parsed.accountId !== owner.value.accountId || parsed.serverOrigin !== owner.value.serverOrigin ||
                parsed.itemId === owner.value.itemId || parsed.playSessionId !== owner.value.playSessionId) {controller.abort(); return refuse({stage: 'next-context', reason: 'next-identity'});}
            const record = {controller, handle: null}; next = record;
            nextProgress = {state: 'preparing', bytes: 0, targetBytes: policy.prefetchBytes};
            const valid = () => next === record && owns(owner) && !record.controller.signal.aborted;
            try {
                const cache = await ensure(); if (!valid()) throw Error('range-next-retired');
                record.handle = await cache.open({source: parsed.source, identity: parsed.identity, transport: parsed.transport, role: 'next',
                    ...(config.kind === 'shared-byte-trial' ? {currentBytes: owner.currentBytes} : {}), isCurrent: valid, signal: record.controller.signal});
                if (!valid()) throw Error('range-next-retired');
                const size = record.handle.status ? record.handle.status().total : policy.prefetchBytes;
                nextProgress = {state: 'warming', bytes: 0, targetBytes: Math.min(size, policy.prefetchBytes)};
                const result = await record.handle.prefetch({maxBytes: policy.prefetchBytes, bytesPerSecond: config.bytesPerSecond, signal: record.controller.signal,
                    onProgress(value) {if (valid()) nextProgress = {state: 'warming', bytes: value.bytes, targetBytes: value.targetBytes};}});
                if (valid()) nextProgress = {...nextProgress, bytes: result.bytes, state: result.bytes >= nextProgress.targetBytes ? 'ready' : 'partial',
                    ...(result.bytes < nextProgress.targetBytes ? {diagnostic: report({stage: 'next-prefix', reason: 'cache-quota'})} : {})};
                return {state: valid() ? nextProgress.state : 'cancelled', bytes: result.bytes, ...(valid() && nextProgress.diagnostic ? {diagnostic: nextProgress.diagnostic} : {})};
            } catch (error) {
                const diagnostic = diagnostics.fromError(error, record.handle ? 'next-prefix' : 'next-probe', 'cache-unavailable');
                if (valid()) nextProgress = {...nextProgress, state: 'unavailable', diagnostic: report(diagnostic)};
                return {state: record.controller.signal.aborted ? 'cancelled' : 'unavailable', diagnostic};
            }
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
    return {cancelNext, setContext, unproxied, select: (...args) => track(select(...args)), started, preload, retire,
        status: () => {
            const backend = config.kind === 'shared-byte-trial' ? {state: cacheInstance ? cacheInstance.status().backendState : cacheFailed ? 'failed' : cachePromise ? 'initializing' : 'idle'} : undefined;
            let bytes = 0; try {if (current && current.handle && current.handle.status) bytes = current.handle.status().bytes;} catch (_) {}
            return {enabled: true, ...policy, kind: config.kind, timeoutMs: config.timeoutMs,
                ...(backend ? {backend} : {}),
                current: {route: current ? current.handle ? 'proxy' : 'original' : 'idle', state: current ? current.handle ? current.playing ? 'active' : 'preparing' : 'original' : 'idle', bytes, ...(current && current.diagnostic ? {diagnostic: diagnostics.snapshot(current.diagnostic)} : {})},
                next: {...nextProgress}, diskBytes: cacheInstance ? cacheInstance.status().bytes : 0,
                maxBytes: policy.prefetchBytes};
        },
        close() {
            if (closing) return closing; closed = true;
            closing = (async () => {await retire(false); await Promise.allSettled([...work]); if (cachePromise) await (await cachePromise).close();})(); return closing;
        }};
}
module.exports = {createSession, parseContext, contextDiagnostic};
