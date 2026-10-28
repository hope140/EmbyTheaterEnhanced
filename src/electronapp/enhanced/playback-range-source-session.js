'use strict';
// Existing opt-in settings, source-aware routing. A provided but invalid proof
// never gets a second attempt through the legacy source policy.
const fs = require('node:fs/promises');
const path = require('node:path');
const {createSession} = require('./playback-range-session');
const {selection} = require('./playback-range-policy');
const sharedAdapter = require('./shared-playback-cache/adapter');
const diagnostics = require('./playback-range-diagnostics');

function createSourceSession({config, authorize, readCurrentBytes, onDiagnostic = () => {}}, dependencies = {}) {
    if (!config || config.kind !== 'source-aware' || !path.isAbsolute(config.root || '') ||
        !path.isAbsolute(config.sharedRoot || '') || path.resolve(config.root) === path.resolve(config.sharedRoot)) throw Error('source-cache-config-invalid');
    const policy = selection(config), jobs = new Set();
    const sessionFactory = dependencies.createSession || createSession;
    const storeFactory = dependencies.createStore || require('./shared-playback-cache/store').createStore;
    let active = null, owner = null, epoch = 0, nextEpoch = 0, tail = Promise.resolve(), maintenance = Promise.resolve(), closed = false, closing;
    let retainedBytes = null, maintenanceFailure = null, maintenanceCloseError = null;
    const track = promise => {jobs.add(promise); promise.finally(() => jobs.delete(promise)).catch(() => {}); return promise;};
    const live = record => !closed && owner === record && record.epoch === epoch && !record.helper.exited &&
        !record.helper.transportTerminated && record.helper.currentGenerationId === record.generationId;
    function report(error) {
        const safe = diagnostics.fromError(error, 'next-prefix', 'cache-unavailable');
        try {onDiagnostic(safe);} catch (_) {}
        return safe;
    }
    async function cleanupRetained(record) {
        // A legacy foreground route never writes media. Wait until its real
        // start before deleting another actual media; admit no legacy P until
        // this bounded-root maintenance has settled. No source is fetched.
        let stat;
        try {stat = await fs.lstat(config.sharedRoot);} catch (error) {if (error.code === 'ENOENT') {retainedBytes = 0; return;} throw error;}
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('source-cache-root-invalid');
        if (!live(record)) return;
        if (typeof readCurrentBytes !== 'function') throw Error('source-cache-budget-unavailable');
        const budget = await readCurrentBytes(record.helper, record.generationId);
        const valid = () => live(record) && budget && typeof budget.isCurrent === 'function' && budget.isCurrent() === true;
        if (!valid() || typeof budget.commit !== 'function' || !Number.isSafeInteger(budget.bytes) ||
            budget.bytes < 262144 || budget.bytes > 3072 * 1048576) throw Error('source-cache-budget-unavailable');
        // Recovery may trim retained M, so lock the actual budget before any
        // recovery work, not merely before admitting a later prefix write.
        budget.commit();
        let store;
        try {
            store = await storeFactory({root: config.sharedRoot, currentBytes: budget.bytes,
                nextBytes: policy.prefetchBytes, recoveryMode: 'on-demand', existingOnly: true});
            if (!valid()) return;
            await store.forgetActualUnlessMedia(sharedAdapter.uncachedIdentity(record.context), {isCurrent: valid});
            if (!valid()) return;
            retainedBytes = store.status().current;
        } finally {if (store) {try {await store.close();} catch (error) {maintenanceCloseError = error; maintenanceFailure = report(error); throw error;}}}
    }
    function setContext(context, helper, generationId) {
        // renderer binding.retire sends range-context(null). This is not a
        // new proofless Play: keep the engine and its unconsumed next prefix.
        if (context == null) return retire().then(() => ({state: 'unavailable'}));
        const ticket = ++epoch, previousMaintenance = maintenance; owner = null; ++nextEpoch;
        const retiring = active ? active.session.retire() : Promise.resolve();
        const job = tail.then(async () => {
            await retiring;
            await previousMaintenance;
            if (closed || ticket !== epoch) return {state: 'unavailable'};
            if (maintenanceFailure) return {state: 'unavailable', diagnostic: maintenanceFailure};
            const kind = context && context.sourceProof !== undefined ? 'shared-byte-trial' : 'next-prefix';
            if (active && active.kind !== kind) {
                try {await active.session.close();} catch (error) {maintenanceCloseError = error; maintenanceFailure = report(error); return {state: 'unavailable', diagnostic: maintenanceFailure};}
                if (active.kind === 'shared-byte-trial') retainedBytes = active.session.status().diskBytes;
                active = null;
            }
            if (closed || ticket !== epoch) return {state: 'unavailable'};
            if (!active) {
                const {sharedRoot, ...base} = config;
                active = {kind, session: sessionFactory({config: {...base, kind, root: kind === 'next-prefix' ? config.root : sharedRoot},
                    authorize, onDiagnostic, ...(kind === 'shared-byte-trial' ? {create: sharedAdapter.createCache, readCurrentBytes} : {})})};
            }
            const selected = active;
            const result = await selected.session.setContext(context, helper, generationId);
            if (!closed && ticket === epoch) owner = {epoch: ticket, context: {...context}, helper, generationId, session: selected.session, kind, start: null, failure: null};
            return result;
        });
        tail = job.catch(() => {}); return track(job);
    }
    function started(helper, generationId) {
        const record = owner;
        if (!record || !live(record) || record.helper !== helper || record.generationId !== generationId) return Promise.resolve();
        if (record.start) return record.start;
        record.start = track((async () => {
            await record.session.started(helper, generationId);
            if (record.kind === 'next-prefix' && live(record)) await cleanupRetained(record);
        })().catch(error => {if (live(record)) record.failure = report(error); throw error;}));
        // This survives owner retirement. Repeated Stop/context-null requests
        // cannot lose the only waiter for a store still restoring or closing.
        maintenance = record.start.catch(() => {});
        return record.start;
    }
    function retire(preserveNext = true) {
        ++epoch; ++nextEpoch; owner = null;
        const retiring = active ? active.session.retire(preserveNext) : Promise.resolve();
        const previousTail = tail, previousMaintenance = maintenance;
        const job = Promise.all([previousTail, retiring, previousMaintenance]).then(() => {});
        tail = job.catch(() => {}); return track(job);
    }
    return {setContext, started, retire,
        select: (...args) => !maintenanceFailure && owner && live(owner) ? track(owner.session.select(...args)) : Promise.resolve(null),
        unproxied: (...args) => {if (owner && live(owner)) owner.session.unproxied(...args);},
        preload(context, helper, generationId) {
            const record = owner, ticket = nextEpoch;
            return track((async () => {
                if (!record || !live(record)) return {state: 'cancelled'};
                if (record.start) await record.start.catch(() => {});
                if (!live(record) || ticket !== nextEpoch) return {state: 'cancelled'};
                if (record.failure || maintenanceFailure) return {state: 'unavailable', diagnostic: record.failure || maintenanceFailure};
                return record.session.preload(context, helper, generationId);
            })());
        },
        cancelNext() {++nextEpoch; return active ? track(active.session.cancelNext()) : Promise.resolve();},
        status() {
            const status = active ? active.session.status() : {enabled: true, ...policy, kind: 'source-aware', timeoutMs: config.timeoutMs,
                maxBytes: policy.prefetchBytes, current: {route: 'idle', state: 'idle', bytes: 0}, next: {state: 'idle'}, diskBytes: null, sharedRetainedBytes: null};
            if (active && active.kind === 'next-prefix') return {...status, routing: 'source-aware',
                diskBytes: retainedBytes === null ? null : status.diskBytes + retainedBytes, legacyDiskBytes: status.diskBytes,
                sharedRetainedBytes: retainedBytes, ...(maintenanceFailure || owner && owner.failure ? {next: {...status.next, state: 'unavailable', diagnostic: maintenanceFailure || owner.failure}} : {})};
            return {...status, routing: 'source-aware', ...(maintenanceFailure ? {next: {...status.next, state: 'unavailable', diagnostic: maintenanceFailure}} : {})};
        },
        close() {
            if (closing) return closing;
            closed = true; ++epoch; ++nextEpoch; owner = null;
            const retiring = active ? active.session.retire(false) : Promise.resolve();
            closing = (async () => {await retiring; await tail; await maintenance; await Promise.allSettled([...jobs]); if (active) await active.session.close(); if (maintenanceCloseError) throw maintenanceCloseError;})();
            return closing;
        }};
}
module.exports = {createSourceSession};
