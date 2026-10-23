'use strict';
const crypto = require('node:crypto');
const {createStore} = require('./playback-cache-store');
const {createReader} = require('./playback-cache-http');
const {createScheduler} = require('./playback-cache-budget');
const {valid} = require('./playback-cache-launch');
const hash = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

function createRuntime(options) {
    if (!options || options.enabled !== true || !valid(options.config)) return Object.freeze({enabled: false});
    const {policy, download} = options.config;
    let store;
    try { store = createStore({enabled: true, parent: options.parent, policy}); } catch { return Object.freeze({enabled: false}); }
    const reader = createReader({maxFileBytes: download.maxFileBytes, timeoutMs: Math.min(download.maxDurationMs, 2000)});
    const scheduler = createScheduler({enabled: true, policy: {bytesPerSecond: download.bytesPerSecond, burstBytes: download.chunkBytes,
        maxBytes: download.maxFileBytes + 1, maxDurationMs: download.maxDurationMs}});
    const approved = new Set(), controllers = new Set(), leases = new Set(), watched = new WeakSet(), used = new WeakMap();
    let context = null, closed = false, state = 'idle', downloading = false;
    function cancelPending() { for (const c of controllers) c.abort(); scheduler.cancel(); if (downloading) state = 'cancelled'; }
    function key(c) { return hash([c.serverId, c.accountId, c.itemId, c.mediaSourceId, c.origin]); }
    function current(c) { return !closed && context === c && !c.helper.exited && !c.helper.transportTerminated && c.helper.currentGenerationId === c.generationId; }
    function release(record) { if (!record.released) { record.released = true; record.lease.release(); leases.delete(record); } }
    function bind(c, probe) {
        return {identity: {serverId: c.serverId, accountId: c.accountId, itemId: c.itemId, mediaSourceId: c.mediaSourceId,
            versionId: probe.strongETag, representationId: 'direct-file/identity'},
        proof: {authorized: true, mode: 'direct-file', rangeSupported: true, contentLength: probe.total,
            strongETag: probe.strongETag, validUntil: Date.now() + download.authorizationMaxAgeMs}};
    }
    async function read(c, start, length, expected, signal) {
        const controller = new AbortController(); controllers.add(controller);
        const abort = () => controller.abort();
        if (signal) { signal.addEventListener('abort', abort, {once: true}); if (signal.aborted) abort(); }
        try {
            if (!current(c)) throw Error('cache-context-retired');
            const result = await reader.read({url: c.source, origin: c.origin, start, length, expected, signal: controller.signal});
            if (!current(c)) throw Error('cache-context-retired'); return result;
        } finally { controllers.delete(controller); if (signal) signal.removeEventListener('abort', abort); }
    }
    function setContext(value, helper, generationId) {
        cancelPending(); context = null; if (!downloading) state = 'idle';
        try {
            if (!value || value.mode !== 'DirectPlay' || ['serverId', 'accountId', 'itemId', 'mediaSourceId', 'playSessionId'].some(k =>
                typeof value[k] !== 'string' || !value[k] || value[k].length > 512)) return false;
            const url = new URL(value.source), origin = new URL(value.serverOrigin).origin;
            if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password || url.hash ||
                value.source.length > 8192 || !helper.exitPromise) return false;
            context = Object.freeze({serverId: value.serverId, accountId: value.accountId, itemId: value.itemId, mediaSourceId: value.mediaSourceId,
                playSessionId: value.playSessionId, source: value.source, origin, helper, generationId});
            if (!watched.has(helper)) {
                watched.add(helper); helper.exitPromise.then(() => { for (const record of [...leases]) if (record.helper === helper) release(record); }, () => {});
            }
            return true;
        } catch { return false; }
    }
    async function select(source, helper, generationId, isCurrent) {
        const c = context;
        if (!c || c.source !== source || c.helper !== helper || c.generationId !== generationId || !approved.has(key(c)) ||
            !current(c) || !isCurrent() || (used.get(helper) || 0) >= generationId) return null;
        used.set(helper, generationId);
        try {
            const probe = await read(c, 0, 1, null);
            if (!isCurrent()) return null;
            const {identity, proof} = bind(c, probe), lease = store.acquireCompleteSource(identity, proof);
            if (!lease) return null;
            if (!current(c) || !isCurrent()) { lease.release(); return null; }
            const record = {helper, generationId, lease, mediaIdentity: null, released: false}; leases.add(record);
            state = 'local-source-selected';
            return {source: lease.source, canDispatch: () => current(c) && lease.canStart(), contextCurrent: () => current(c),
                started(id) {
                    if (Number.isSafeInteger(id) && id >= 0) {
                        record.mediaIdentity = id;
                        if (!record.released && !record.fallback && current(c)) state = 'local-media-opened';
                    }
                },
                onFallback() { record.fallback = true; if (current(c)) state = 'original-source-fallback'; }, cancelBeforeDispatch: () => release(record)};
        } catch { return null; }
    }
    async function downloadCurrent(helper, generationId, confirmationOwner) {
        const c = context;
        if (downloading || !c || c !== confirmationOwner || c.helper !== helper || c.generationId !== generationId || !current(c)) return {state: 'unavailable'};
        downloading = true; state = 'downloading';
        try {
            scheduler.update({confirmed: true, owner: String(generationId), nextKey: key(c), confirmedUntil: Date.now() + download.maxDurationMs,
                run: async budget => {
                    try {
                        await budget.claim(1); const probe = await read(c, 0, 1, null, budget.signal);
                        const first = bind(c, probe); let offset, lastProof = first.proof;
                        const writer = store.begin(first.identity, first.proof);
                        try {
                            offset = writer.offset;
                            if (offset === 0) { budget.append(writer, 0, probe.bytes); offset = 1; }
                        } finally { writer.release(); }
                        while (offset < probe.total) {
                            const count = Math.min(download.chunkBytes, probe.total - offset);
                            await budget.claim(count);
                            const chunk = await read(c, offset, count, probe, budget.signal); budget.assertCurrent();
                            const fresh = bind(c, chunk), writer = store.begin(fresh.identity, fresh.proof);
                            lastProof = fresh.proof;
                            try { if (writer.offset !== offset) throw Error('cache-checkpoint-changed'); offset = budget.append(writer, offset, chunk.bytes); }
                            finally { writer.release(); }
                        }
                        budget.assertCurrent();
                        if (!current(c)) throw Error('cache-context-retired');
                        const verified = store.acquireComplete(first.identity, lastProof);
                        if (!verified) throw Error('cache-incomplete');
                        verified.release();
                        if (approved.size >= policy.maxEntries) approved.delete(approved.values().next().value);
                        approved.add(key(c)); state = 'ready';
                    } catch (error) { state = budget.signal.aborted ? 'cancelled' : 'unavailable'; throw error; }
                }});
            await scheduler.whenIdle(); return {state};
        } finally { downloading = false; }
    }
    return {enabled: true, setContext, select, downloadCurrent, cancelPending,
        retireContext() { cancelPending(); context = null; },
        confirmationOwner: (helper, generationId) => context && context.helper === helper && context.generationId === generationId && current(context) ? context : null,
        eligible: (helper, generationId) => !!context && context.helper === helper && context.generationId === generationId && current(context),
        mediaClosed(helper, generationId, mediaIdentity) { for (const record of [...leases]) if (record.helper === helper &&
            record.generationId === generationId && record.mediaIdentity === mediaIdentity) release(record); },
        status: () => ({state, activeRequests: reader.status().activeRequests, downloading}),
        async close() {
            closed = true; context = null; cancelPending();
            await Promise.all([reader.close(), scheduler.close()]); store.close();
        }};
}
module.exports = {createRuntime};
