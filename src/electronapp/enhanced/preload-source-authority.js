'use strict';

// Main owns issuance and refresh. No renderer-provided descriptor is transport authority.
const {createHash, randomUUID} = require('node:crypto');
const transports = new WeakSet();
const failures = new WeakSet();
const PENDING_TTL_MS = 60000;
const MAX_PENDING = 64;
const REFRESH_TIMEOUT_MS = 3000;
const EXPIRY_MARGIN_MS = 1000;
function failure(reason) {
    const error = Object.assign(Error('preload-source-' + reason), {preloadReason: reason});
    failures.add(error); return error;
}
function signalValid(signal) {return signal instanceof AbortSignal;}
function requestValid(value) {return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);}
function resourceValid(value) {return typeof value === 'string' && value.length > 0 && value.length <= 2048 && !/[\u0000-\u001f\u007f]/.test(value);}
function parseSource(source) {
    if (typeof source !== 'string' || !source || source.length > 32768 || /[\u0000-\u001f\u007f]/.test(source)) throw failure('source-proof-invalid');
    let url;
    try {url = new URL(source);} catch (_) {throw failure('source-proof-invalid');}
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.hash || source.includes('#')) throw failure('source-proof-invalid');
    return url.origin;
}
function userAgent(options) {
    if (options === undefined) return undefined;
    if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(key => key !== 'userAgent')) throw failure('source-options-changed');
    const value = options.userAgent;
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !value.trim() || value.length > 1024 || !/^[\x20-\x7e]+$/.test(value) || /[,\\]/.test(value)) throw failure('source-options-changed');
    return value;
}
function createAuthority({now = Date.now} = {}) {
    const documents = new WeakMap(), principals = new WeakMap(), observed = new Set(), pending = new Map();
    let closed = false;
    function time() {
        let value;
        try {value = now();} catch (_) {throw failure('source-proof-invalid');}
        if (!Number.isSafeInteger(value) || value < 0) throw failure('source-proof-invalid');
        return value;
    }
    function alive(record) {
        return !closed && record && record.active && record.entry.current === record && !record.entry.destroyed &&
            !(typeof record.entry.webContents.isDestroyed === 'function' && record.entry.webContents.isDestroyed());
    }
    function retire(record) {
        if (!record || !record.active) return;
        record.active = false;
        for (const proof of record.pending) pending.delete(proof);
        record.pending.clear();
        for (const owned of [...record.transports]) owned.retire('generation-retired');
    }
    function unobserve(entry) {
        entry.webContents.removeListener('did-start-navigation', entry.navigation);
        entry.webContents.removeListener('destroyed', entry.destroy);
        entry.webContents.removeListener('render-process-gone', entry.gone);
        observed.delete(entry);
    }
    function principalFor(webContents) {
        if (closed || !webContents || typeof webContents.on !== 'function' || typeof webContents.removeListener !== 'function' ||
            typeof webContents.isDestroyed === 'function' && webContents.isDestroyed()) throw failure('generation-retired');
        let entry = documents.get(webContents);
        if (!entry) {
            entry = {webContents, current: null, destroyed: false};
            entry.navigation = function (details, _url, isInPlace, isMainFrame) {
                const main = details && typeof details.isMainFrame === 'boolean' ? details.isMainFrame : isMainFrame;
                const same = details && typeof details.isSameDocument === 'boolean' ? details.isSameDocument : isInPlace;
                if (main === true && same !== true) {retire(entry.current); entry.current = null;}
            };
            entry.destroy = function () {entry.destroyed = true; retire(entry.current); entry.current = null; unobserve(entry);};
            entry.gone = function () {retire(entry.current); entry.current = null;};
            webContents.on('did-start-navigation', entry.navigation);
            webContents.on('destroyed', entry.destroy);
            webContents.on('render-process-gone', entry.gone);
            documents.set(webContents, entry); observed.add(entry);
        }
        if (entry.destroyed) throw failure('generation-retired');
        if (!entry.current) {
            const principal = Object.freeze(Object.create(null));
            entry.current = {principal, entry, active: true, pending: new Set(), transports: new Set()};
            principals.set(principal, entry.current);
        }
        return entry.current.principal;
    }
    function forget(proof, grant) {pending.delete(proof); grant.principal.pending.delete(proof);}
    function purge() {
        const currentTime = time();
        for (const [proof, grant] of pending) if (!alive(grant.principal) || currentTime >= grant.pendingUntil) forget(proof, grant);
    }
    function descriptor(value, currentTime, requireAcquired = false) {
        if (!value || !['cd2-url', 'direct-url'].includes(value.sourceKind)) throw failure('source-proof-invalid');
        const origin = parseSource(value.source), agent = userAgent(value.requestOptions);
        if (value.expectedSize !== undefined && (!Number.isSafeInteger(value.expectedSize) || value.expectedSize <= 0)) throw failure('source-proof-invalid');
        if (requireAcquired || value.acquiredAt !== undefined || value.expiresAt !== undefined) {
            if (!Number.isSafeInteger(value.acquiredAt) || value.acquiredAt < 0 || value.acquiredAt > currentTime) throw failure('source-proof-invalid');
        }
        if (value.expiresAt !== undefined && (!Number.isSafeInteger(value.expiresAt) || value.expiresAt <= value.acquiredAt)) throw failure('source-proof-invalid');
        return {source: value.source, origin, sourceKind: value.sourceKind, userAgent: agent, acquiredAt: value.acquiredAt, expiresAt: value.expiresAt, expectedSize: value.expectedSize};
    }
    function issue(value) {
        purge();
        const principal = value && principals.get(value.principal);
        if (!alive(principal)) throw failure('generation-retired');
        if (!requestValid(value.requestId) || !resourceValid(value.resourceKey) || value.refresh !== undefined && typeof value.refresh !== 'function' || pending.size >= MAX_PENDING) throw failure('source-proof-invalid');
        const currentTime = time(), source = descriptor(value, currentTime), proof = randomUUID();
        const grant = {principal, requestId: value.requestId, resourceKey: value.resourceKey, descriptor: source,
            refresh: value.refresh, pendingUntil: currentTime + PENDING_TTL_MS};
        pending.set(proof, grant); principal.pending.add(proof);
        return proof;
    }
    function bind(value) {
        purge();
        const grant = value && pending.get(value.sourceProof);
        if (!grant) throw failure('source-proof-invalid');
        // Every binding attempt consumes its proof, including rejected attempts.
        forget(value.sourceProof, grant);
        const principal = principals.get(value.principal), exact = value.requestId !== undefined, prefix = value.requestPrefix !== undefined;
        if (principal !== grant.principal || !alive(principal) || value.source !== grant.descriptor.source || exact === prefix ||
            exact && (!requestValid(value.requestId) || value.requestId !== grant.requestId) ||
            prefix && (!requestValid(value.requestPrefix) || !grant.requestId.startsWith(value.requestPrefix)) || !signalValid(value.signal)) throw failure('source-proof-invalid');
        if (value.signal.aborted) throw failure('request-cancelled');
        const controller = new AbortController(), loadSource = grant.descriptor.source, agent = grant.descriptor.userAgent;
        const representation = createHash('sha256').update(JSON.stringify([grant.resourceKey, grant.descriptor.sourceKind, grant.descriptor.origin, agent === undefined ? null : agent])).digest('hex');
        const record = {descriptor: grant.descriptor, refresh: grant.refresh, refreshJob: null, reason: null,
            retire(reason) {
                if (controller.signal.aborted) return;
                record.reason = reason;
                value.signal.removeEventListener('abort', ownerAbort);
                principal.transports.delete(record);
                controller.abort();
            }};
        function ownerAbort() {record.retire('request-cancelled');}
        value.signal.addEventListener('abort', ownerAbort, {once: true}); principal.transports.add(record);
        function active(signal) {
            if (!alive(principal) && !controller.signal.aborted) record.retire('generation-retired');
            if (controller.signal.aborted) throw failure(record.reason || 'generation-retired');
            if (signal !== undefined && !signalValid(signal)) throw failure('source-proof-invalid');
            if (signal && signal.aborted) throw failure('request-cancelled');
        }
        function beginRefresh(signal) {
            const refreshController = new AbortController();
            let rejectStop, timer, stopReason;
            const stopped = new Promise((_resolve, reject) => {rejectStop = reject;});
            function stop(reason) {
                if (stopReason) return;
                stopReason = reason; refreshController.abort(); rejectStop(failure(reason));
            }
            const ownerStop = () => stop(record.reason || 'generation-retired'), callerStop = () => stop('request-cancelled');
            controller.signal.addEventListener('abort', ownerStop, {once: true});
            if (signal) signal.addEventListener('abort', callerStop, {once: true});
            timer = setTimeout(() => stop('timeout'), REFRESH_TIMEOUT_MS);
            const job = (async () => {
                try {
                    active(signal);
                    const value = await Promise.race([Promise.resolve().then(() => {active(signal); return record.refresh(refreshController.signal);}), stopped]);
                    active(signal);
                    const next = descriptor(value, time(), true);
                    if (next.sourceKind !== record.descriptor.sourceKind || value.resourceKey !== undefined && value.resourceKey !== grant.resourceKey) throw failure('source-refresh-failed');
                    if (next.origin !== record.descriptor.origin) throw failure('source-origin-changed');
                    if (next.userAgent !== agent) throw failure('source-options-changed');
                    if (record.descriptor.expectedSize !== undefined && next.expectedSize !== record.descriptor.expectedSize) throw failure('representation-changed');
                    if (next.expiresAt === undefined || next.expiresAt <= time() + EXPIRY_MARGIN_MS) throw failure('source-expired');
                    active(signal);
                    record.descriptor = next;
                } catch (error) {
                    active(signal);
                    throw failures.has(error) ? error : failure('source-refresh-failed');
                } finally {
                    clearTimeout(timer);
                    controller.signal.removeEventListener('abort', ownerStop);
                    if (signal) signal.removeEventListener('abort', callerStop);
                }
            })();
            record.refreshJob = job;
            job.finally(() => {if (record.refreshJob === job) record.refreshJob = null;}).catch(() => {});
            return job;
        }
        async function waitRefresh(job, signal) {
            if (!signal) return job;
            let abort;
            const cancelled = new Promise((_resolve, reject) => {abort = () => reject(failure('request-cancelled')); signal.addEventListener('abort', abort, {once: true});});
            try {active(signal); return await Promise.race([job, cancelled]);}
            finally {signal.removeEventListener('abort', abort);}
        }
        const transport = Object.freeze({representation, signal: controller.signal,
            async access(signal) {
                active(signal);
                if (record.descriptor.expiresAt !== undefined && record.descriptor.expiresAt <= time() + EXPIRY_MARGIN_MS) {
                    if (!record.refresh) throw failure('source-expired');
                    await waitRefresh(record.refreshJob || beginRefresh(signal), signal);
                    active(signal);
                }
                const source = record.descriptor;
                return {source: source.source, origin: source.origin, ...(source.expectedSize === undefined ? {} : {expectedSize: source.expectedSize}), ...(source.userAgent === undefined ? {} : {userAgent: source.userAgent})};
            },
            matchesLoadOptions(args) {
                try {
                    active();
                    if (!Array.isArray(args) || args[0] !== 'loadfile' || args[1] !== loadSource) return false;
                    return agent === undefined ? args.length === 2 : args.length === 5 && args[2] === 'replace' && args[3] === '-1' && args[4] === 'user-agent=' + agent;
                } catch (_) {return false;}
            }});
        transports.add(transport); return transport;
    }
    function close() {
        if (closed) return;
        closed = true;
        for (const entry of [...observed]) {retire(entry.current); unobserve(entry);}
        pending.clear();
    }
    function safe(action) {
        return function (...args) {try {return action(...args);} catch (error) {throw failures.has(error) ? error : failure('source-proof-invalid');}};
    }
    return {principalFor: safe(principalFor), issue: safe(issue), bind: safe(bind), close: safe(close)};
}
module.exports = {createAuthority, isTransport: value => !!value && transports.has(value)};
