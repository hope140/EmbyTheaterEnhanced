'use strict';

const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const crypto = require('node:crypto');
const {selection} = require('../playback-range-policy');
const authority = require('../preload-source-authority');
const diagnostics = require('../playback-range-diagnostics');
const {createDeferredStore} = require('./deferred-store');

const error = reason => diagnostics.error(reason, 'shared-byte-' + reason);
const positive = value => Number.isSafeInteger(value) && value > 0;
const keyOf = value => JSON.stringify(['server', 'account', 'item', 'mediaSource', 'resource', 'representation'].map(key => value[key]));
function cacheIdentity(identity) {
    if (!identity || ['serverOrigin', 'serverId', 'accountId', 'itemId', 'mediaSourceId', 'representation']
        .some(field => typeof identity[field] !== 'string' || !identity[field] || identity[field].length > 8192)) throw error('identity-missing');
    return {server: crypto.createHash('sha256').update(JSON.stringify([identity.serverOrigin, identity.serverId])).digest('hex'),
        account: identity.accountId, item: identity.itemId, mediaSource: identity.mediaSourceId,
        resource: identity.representation, representation: 'authorized-original-bytes-v1'};
}
function uncachedIdentity(context) {
    try {
        if (!context || ['serverOrigin', 'serverId', 'accountId', 'itemId', 'mediaSourceId'].some(field =>
            typeof context[field] !== 'string' || !context[field] || context[field].length > 8192) ||
            new URL(context.serverOrigin).origin !== context.serverOrigin) return null;
        return cacheIdentity({...context, representation: 'uncached-media-identity'});
    } catch (_) {return null;}
}
function validAccess(access, expectedSize) {
    let url;
    try {url = new URL(access.source);} catch (_) {throw error('source-invalid');}
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== access.origin || url.username || url.password || url.hash) throw error('source-invalid');
    if (!positive(access.expectedSize)) throw error('file-size-unavailable');
    if (expectedSize !== undefined && access.expectedSize !== expectedSize) throw error('representation-changed');
    return access;
}
function probe(access, signal, timeoutMs) {
    return new Promise((resolve, reject) => {
        if (signal.aborted) {reject(error('request-cancelled')); return;}
        const headers = {Range: 'bytes=0-0', 'Accept-Encoding': 'identity', Connection: 'close'};
        if (access.userAgent !== undefined) headers['User-Agent'] = access.userAgent;
        let response, metadata, failure, timer;
        const request = (access.source.startsWith('https:') ? https : http).request(access.source,
            {method: 'GET', headers, agent: false});
        const fail = reason => {failure ||= error(reason); response?.destroy(); request.destroy();};
        const abort = () => fail('request-cancelled');
        signal.addEventListener('abort', abort, {once: true});
        request.once('response', incoming => {
            response = incoming;
            const match = /^bytes 0-0\/([1-9]\d*)$/.exec(incoming.headers['content-range'] || '');
            if (incoming.statusCode >= 300 && incoming.statusCode < 400) return fail('redirect');
            if ([401, 403].includes(incoming.statusCode)) return fail('auth-required');
            if (incoming.statusCode !== 206) return fail('status-not-206');
            if (!match || Number(match[1]) !== access.expectedSize) return fail('representation-changed');
            if (Number(incoming.headers['content-length']) !== 1) return fail('length-mismatch');
            if (incoming.headers['content-encoding'] && incoming.headers['content-encoding'] !== 'identity') return fail('encoding-unsupported');
            let bytes = 0;
            incoming.on('data', chunk => {bytes += chunk.length; if (bytes > 1) fail('body-invalid');});
            incoming.once('aborted', () => fail('response-interrupted'));
            incoming.once('error', () => fail('response-interrupted'));
            incoming.once('end', () => {
                if (bytes !== 1) return fail('body-invalid');
                metadata = {total: access.expectedSize};
                for (const [field, header] of [['etag', 'etag'], ['lastModified', 'last-modified']]) {
                    const value = incoming.headers[header];
                    if (typeof value === 'string' && value.length && value.length <= 1024) metadata[field] = value;
                }
                request.destroy();
            });
        });
        request.once('error', () => {failure ||= error('network-failed');});
        request.once('close', () => {
            clearTimeout(timer); signal.removeEventListener('abort', abort);
            if (failure) reject(failure);
            else if (metadata) resolve(metadata);
            else reject(error('response-interrupted'));
        });
        timer = setTimeout(() => fail('timeout'), timeoutMs);
        if (signal.aborted) abort();
        request.end();
    });
}

async function createCache(config, dependencies = {}) {
    if (!config || config.kind !== 'shared-byte-trial' || typeof config.root !== 'string' || !path.isAbsolute(config.root)) throw error('cache-unavailable');
    const policy = selection(config), timeoutMs = config.timeoutMs ?? 30000;
    if (!positive(timeoutMs) || timeoutMs > 30000) throw error('cache-unavailable');
    const records = new Set(), openings = new Set();
    let manager, managerPromise, managerBytes, resetting, closed = false, closing;
    let pendingUncachedIntent;
    let unavailable = false;
    const factory = dependencies.createStore || (value => require('./store').createStore(value));
    function guard(record, signal) {
        let live = false;
        try {live = record.isCurrent() === true;} catch (_) {}
        if (closed || record.stopped || !live || record.signal.aborted || signal?.aborted) throw error('request-cancelled');
    }
    function lookup(identity) {
        const signature = keyOf(identity);
        const record = [...records].find(value => value.signature === signature && !value.stopped);
        if (!record) throw error('generation-retired');
        return record;
    }
    async function access(record, signal) {
        guard(record, signal);
        const combined = AbortSignal.any([record.signal, ...(signal ? [signal] : [])]);
        const value = validAccess(await record.transport.access(combined), record.total);
        guard(record, signal);
        if (record.grant && (value.origin !== record.grant.origin || value.userAgent !== record.grant.userAgent)) throw error('source-options-changed');
        return value;
    }
    async function ensure(currentBytes) {
        if (resetting) throw error('cache-unavailable');
        if (managerBytes !== undefined && managerBytes !== currentBytes) {
            if (records.size > 1) throw error('cache-unavailable');
            resetting = Promise.resolve(managerPromise).then(value => value.proxy.close()).finally(() => {
                manager = managerPromise = managerBytes = undefined; resetting = undefined;
            });
            resetting.catch(() => {unavailable = true;});
            throw error('cache-unavailable');
        }
        if (managerPromise) return managerPromise;
        managerBytes = currentBytes;
        const store = createDeferredStore({root: config.root, currentBytes, nextBytes: policy.prefetchBytes,
            maxPendingBytes: 2 * 1024 * 1024, recoveryMode: 'on-demand'}, {create: factory});
        if (pendingUncachedIntent !== undefined) {
            store.forgetActualUnlessMedia(pendingUncachedIntent.identity,
                {isCurrent: pendingUncachedIntent.isCurrent}).catch(() => {unavailable = true;});
            pendingUncachedIntent = undefined;
        }
        managerPromise = require('./proxy').createProxy({store, timeoutMs, requestPolicy: 'sparse',
            async authorize(identity, {signal}) {
                const record = lookup(identity), value = await access(record, signal);
                return {...record.grant, url: value.source};
            },
            async resolveAccess(identity, _grant, {signal}) {
                const record = lookup(identity), value = await access(record, signal);
                return {url: value.source, origin: value.origin, userAgent: value.userAgent, expectedSize: value.expectedSize};
            }
        }).then(proxy => (manager = {store, proxy})).catch(async () => {
            unavailable = true; await store.close(); throw error('cache-unavailable');
        });
        managerPromise.catch(() => {});
        return managerPromise;
    }
    function open(options) {
        if (options) options = {...options, identity: options.identity && {...options.identity}};
        const job = (async () => {
            if (closed || records.size >= 4 || !options || !authority.isTransport(options.transport) ||
                typeof options.isCurrent !== 'function' || !positive(options.currentBytes) ||
                !Number.isSafeInteger(options.currentBytes + policy.prefetchBytes) ||
                options.signal !== undefined && !(options.signal instanceof AbortSignal)) throw error('source-proof-invalid');
            if (options.identity?.representation !== options.transport.representation) throw error('source-proof-invalid');
            const identity = cacheIdentity(options.identity), signature = keyOf(identity);
            if ([...records].some(record => record.signature === signature && !record.stopped)) throw error('cache-unavailable');
            const controller = new AbortController();
            const record = {identity, signature, transport: options.transport, isCurrent: options.isCurrent,
                signal: AbortSignal.any([controller.signal, options.transport.signal, ...(options.signal ? [options.signal] : [])]),
                controller, stopped: false, role: 'next', bytes: 0, jobs: new Set()};
            records.add(record);
            let transferred = false;
            try {
                guard(record);
                const initial = await access(record);
                const load = initial.userAgent === undefined ? ['loadfile', options.source]
                    : ['loadfile', options.source, 'replace', '-1', 'user-agent=' + initial.userAgent];
                if (!record.transport.matchesLoadOptions(load)) throw error('source-proof-invalid');
                record.total = initial.expectedSize;
                // Recover the owned backend within this same selection, while
                // the fresh probe is pending. No route/key or body is admitted
                // until that probe succeeds; close still owns late recovery.
                const preparing = ensure(options.currentBytes);
                preparing.catch(() => {});
                const metadata = await probe(initial, record.signal, timeoutMs);
                guard(record);
                record.grant = {url: initial.source, origin: initial.origin, userAgent: initial.userAgent,
                    metadata, accessChecked: true};
                const owned = await preparing;
                guard(record);
                const route = await owned.proxy.open(identity, 'next');
                record.route = route;
                // A recovered backend can establish a prepared first hit before
                // the engine asks for it. Pending recovery remains off this path.
                if (owned.store.status().available === true) {
                    try {await route.ready();} catch (_) {unavailable = true;}
                }
                guard(record);
                let stopping;
                const stop = () => {
                    if (stopping) return stopping;
                    record.stopped = true;
                    stopping = Promise.resolve().then(async () => {
                        await route.stop();
                        await Promise.allSettled([...record.jobs]);
                        record.signal.removeEventListener('abort', aborted);
                        records.delete(record);
                    });
                    controller.abort();
                    stopping.catch(() => {});
                    return stopping;
                };
                const aborted = () => {stop().catch(() => {});};
                record.signal.addEventListener('abort', aborted, {once: true});
                if (record.signal.aborted) {await stop(); throw error('request-cancelled');}
                const track = promise => {record.jobs.add(promise); promise.finally(() => record.jobs.delete(promise)).catch(() => {}); return promise;};
                const handle = {source: route.url,
                    ready: () => track((async () => {
                        guard(record);
                        await new Promise((resolve, reject) => {
                            const abort = () => {record.signal.removeEventListener('abort', abort); reject(error('request-cancelled'));};
                            record.signal.addEventListener('abort', abort, {once: true});
                            Promise.resolve(route.ready()).then(value => {
                                record.signal.removeEventListener('abort', abort); resolve(value);
                            }, failure => {record.signal.removeEventListener('abort', abort); reject(failure);});
                            if (record.signal.aborted) abort();
                        });
                        guard(record);
                    })()),
                    status: () => ({bytes: record.bytes, total: record.total}),
                    markPlaying: () => track((async () => {
                        guard(record);
                        const changed = await route.actual();
                        guard(record);
                        if (changed) record.role = 'current';
                        return changed;
                    })()),
                    prefetch: args => track((async () => {
                        guard(record, args?.signal);
                        if (!args || !positive(args.maxBytes) || !(args.signal instanceof AbortSignal) ||
                            args.bytesPerSecond !== undefined) throw error('cache-unavailable');
                        const combined = AbortSignal.any([record.signal, args.signal]);
                        await route.preload({maxBytes: Math.min(args.maxBytes, policy.prefetchBytes), signal: combined});
                        guard(record, combined);
                        const coverage = await route.coverage();
                        guard(record, combined);
                        if (!coverage || !Number.isSafeInteger(coverage.bytes) || coverage.bytes < 0 || coverage.bytes > record.total) throw error('cache-unavailable');
                        record.bytes = Math.min(coverage.bytes, args.maxBytes, policy.prefetchBytes, record.total);
                        if (typeof args.onProgress === 'function') {
                            try {args.onProgress({bytes: record.bytes, targetBytes: Math.min(args.maxBytes, policy.prefetchBytes, record.total)});} catch (_) {}
                        }
                        return {bytes: record.bytes};
                    })()), stop};
                record.handle = handle;
                guard(record);
                transferred = true;
                return handle;
            } finally {
                if (!transferred) {
                    record.stopped = true; controller.abort();
                    if (record.route) await record.route.stop();
                    records.delete(record);
                }
            }
        })();
        openings.add(job); job.finally(() => openings.delete(job)).catch(() => {});
        return job;
    }
    return {open,
        async markUncachedPlaying(context, isCurrent = () => true) {
            if (closed) throw error('generation-retired');
            const current = () => {try {return typeof isCurrent === 'function' && isCurrent() === true;} catch (_) {return false;}};
            if (!current()) return false;
            const identity = uncachedIdentity(context);
            if (!managerPromise || resetting) {pendingUncachedIntent = {identity, isCurrent}; return;}
            const owned = await managerPromise;
            if (!current()) return false;
            return owned.store.forgetActualUnlessMedia(identity, {isCurrent});
        },
        async discardNext() {
            const next = [...records].filter(record => record.role !== 'current');
            await Promise.all(next.map(record => record.handle ? record.handle.stop() : (record.controller.abort(), Promise.resolve())));
            if (managerPromise) await (await managerPromise).store.discardNext();
        },
        status() {
            const status = manager?.store.status();
            return {bytes: status?.committed || 0, currentBytes: status?.current || 0, nextBytes: status?.next || 0,
                maxBytes: (managerBytes || 0) + policy.prefetchBytes, routes: records.size,
                initializing: !!status?.initializing, unavailable: unavailable || !!status?.faulted || !!resetting,
                confidence: 'metadata-assumed-unless-strong-validator'};
        },
        close() {
            if (closing) return closing;
            closed = true;
            for (const record of records) record.controller.abort();
            closing = (async () => {
                await Promise.allSettled([...openings]);
                await Promise.allSettled([...records].map(record => record.handle?.stop()));
                if (resetting) await resetting;
                if (managerPromise) await (await managerPromise).proxy.close();
            })();
            return closing;
        }
    };
}

module.exports = {createCache};
