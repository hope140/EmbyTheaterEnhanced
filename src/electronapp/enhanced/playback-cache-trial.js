'use strict';

// Main-owned offline trial seam. No renderer settings, IPC, downloader or network.
const fs = require('node:fs');
const path = require('node:path');
const {createStore} = require('./playback-cache-store');
const fields = ['serverId', 'accountId', 'itemId', 'mediaSourceId', 'versionId', 'representationId'];
const sameIdentity = (left, right) => left && right && fields.every(field => left[field] === right[field]);
const sameContext = (left, right) => left && right && left.serverId === right.serverId &&
    left.accountId === right.accountId && left.authEpoch === right.authEpoch;

function createTrial(options) {
    const off = Object.freeze({enabled: false});
    const config = options && options.config;
    if (!config || config.enabled !== true || config.testOnly !== true || config.networkPolicy !== 'offline-fixtures-only' ||
        config.activeLeasePolicy !== 'retain-until-media-close' ||
        !Number.isSafeInteger(config.verificationTimeoutMs) || config.verificationTimeoutMs < 1 || config.verificationTimeoutMs > 2000 ||
        !config.policy || config.policy.maxBytes > 1048576 || config.policy.maxEntries > 16 ||
        typeof options.revalidate !== 'function' || typeof options.getContext !== 'function' || !Array.isArray(options.catalog)) return off;
    let store, root;
    const catalog = new Map(), leases = new Set(), watched = new WeakSet(), used = new WeakMap();
    let pending = null, closed = false;
    const clock = options.now || Date.now;
    try {
        root = fs.realpathSync(options.fixtureSourceRoot);
        if (root !== path.resolve(options.fixtureSourceRoot) || /^\\\\/.test(root)) return off;
        for (const entry of options.catalog) {
            if (!entry || !entry.identity || fields.some(field => typeof entry.identity[field] !== 'string' || !entry.identity[field]) ||
                typeof entry.source !== 'string' || !path.isAbsolute(entry.source) || catalog.has(entry.source)) return off;
            const relative = path.relative(root, entry.source);
            if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return off;
            catalog.set(entry.source, Object.freeze({...entry.identity}));
        }
        store = createStore({enabled: true, parent: options.parent, policy: config.policy, now: clock});
    } catch { return off; }

    function context() {
        try {
            const value = options.getContext();
            if (!value || typeof value.serverId !== 'string' || typeof value.accountId !== 'string' ||
                !Number.isSafeInteger(value.authEpoch) || value.authEpoch < 0) return null;
            return Object.freeze({serverId: value.serverId, accountId: value.accountId, authEpoch: value.authEpoch});
        } catch { return null; }
    }
    function release(record) {
        if (record.released) return;
        record.released = true; record.lease.release(); leases.delete(record);
    }
    function watch(helper) {
        if (!helper.exitPromise || typeof helper.exitPromise.then !== 'function') return false;
        if (!watched.has(helper)) {
            watched.add(helper);
            helper.exitPromise.then(() => {
                for (const record of [...leases]) if (record.helper === helper) release(record);
            }, () => { /* Uncertain exit retains its leases. */ });
        }
        return true;
    }
    function cancelPending() { if (pending) pending.controller.abort(); }
    async function select(source, helper, generationId, isCurrent) {
        if (closed) return null;
        const identity = catalog.get(source), snapshot = context();
        if (closed || pending || !identity || !snapshot || !isCurrent() ||
            snapshot.serverId !== identity.serverId || snapshot.accountId !== identity.accountId ||
            !watch(helper) || (used.get(helper) || 0) >= generationId) return null;
        let stat;
        try { stat = fs.lstatSync(source); if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(source) !== source) return null; } catch { return null; }
        used.set(helper, generationId);
        const controller = new AbortController(), request = {controller}; pending = request;
        const deadline = clock() + config.verificationTimeoutMs;
        let timer, abort;
        const cancelled = new Promise(resolve => {
            abort = () => resolve(null);
            controller.signal.addEventListener('abort', abort, {once: true});
            timer = setTimeout(() => controller.abort(), config.verificationTimeoutMs);
        });
        // Only one verifier may remain outstanding, even if it ignores abort.
        const verification = Promise.resolve().then(() => {
            if (controller.signal.aborted || closed || !isCurrent()) return null;
            return options.revalidate(Object.freeze({source, identity, context: snapshot, signal: controller.signal}));
        }).catch(() => null);
        verification.then(() => { if (pending === request) pending = null; });
        try {
            const grant = await Promise.race([verification, cancelled]);
            if (!grant || closed || controller.signal.aborted || clock() >= deadline || !isCurrent() ||
                !sameContext(snapshot, context()) || !sameContext(snapshot, grant.context) || !sameIdentity(identity, grant.identity)) return null;
            let lease;
            try { lease = store.acquireCompleteSource(identity, grant.proof); } catch { return null; }
            if (!lease) return null;
            if (!isCurrent() || !sameContext(snapshot, context())) { lease.release(); return null; }
            const record = {helper, generationId, lease, mediaIdentity: null, released: false}; leases.add(record);
            return Object.freeze({source: lease.source, contextCurrent: () => sameContext(snapshot, context()),
                canDispatch() { try { return !closed && sameContext(snapshot, context()) && lease.canStart(); } catch { return false; } },
                started(mediaIdentity) { if (Number.isSafeInteger(mediaIdentity) && mediaIdentity >= 0) record.mediaIdentity = mediaIdentity; },
                cancelBeforeDispatch: () => release(record)});
        } finally {
            clearTimeout(timer); controller.signal.removeEventListener('abort', abort); controller.abort();
        }
    }
    return Object.freeze({enabled: true, select, cancelPending,
        mediaClosed(helper, generationId, mediaIdentity) {
            for (const record of [...leases]) if (record.helper === helper && record.generationId === generationId &&
                record.mediaIdentity !== null && record.mediaIdentity === mediaIdentity) release(record);
        },
        prune: () => store.prune(),
        status() {
            try { return Object.freeze({...store.status(), pendingVerification: !!pending}); }
            catch { return Object.freeze({state: 'unavailable', pinnedEntries: leases.size, pendingVerification: !!pending}); }
        },
        close() { closed = true; cancelPending(); store.close(); }
    });
}

module.exports = {createTrial};
