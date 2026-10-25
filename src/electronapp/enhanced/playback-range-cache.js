'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const {once} = require('node:events');
const {createStore} = require('./playback-prefix-store');
const {createReader, abortError} = require('./playback-range-http');
const diagnostics = require('./playback-range-diagnostics');
const sourceAuthority = require('./preload-source-authority');
function parseRange(value, total) {
    if (value == null) return {start: 0, end: total - 1, partial: false};
    const match = /^bytes=(\d*)-(\d*)$/.exec(value);
    if (!match || !match[1] && !match[2]) return null;
    const start = match[1] ? Number(match[1]) : Math.max(0, total - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
    return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && end >= start && start < total &&
        (match[1] || Number(match[2]) > 0) ? {start, end, partial: true} : null;
}
function wait(ms, signal) {
    if (signal.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
        const abort = () => {clearTimeout(timer); signal.removeEventListener('abort', abort); reject(abortError());};
        const timer = setTimeout(() => {signal.removeEventListener('abort', abort); resolve();}, ms);
        signal.addEventListener('abort', abort, {once: true});
    });
}
async function createCache(options) {
    // Only next-prefix media writes use P; current misses always pass through.
    if (options.kind !== 'next-prefix') throw Error('next-prefix-required');
    const reader = createReader(options);
    const store = await createStore(options);
    const routes = new Map(), opens = new Set(), openJobs = new Set(), background = new Map(), retiring = new Set();
    let server, starting, closed = false, closing, foreground = 0, requests = 0;
    function preempt() {for (const controller of background.keys()) controller.abort();}
    async function foregroundRead(signal, action) {
        foreground++; const pending = [...background.values()]; preempt();
        try {
            // HTTP reader settles only after physical request close, including aborts.
            await Promise.allSettled(pending);
            if (closed || signal.aborted) throw abortError();
            return await action(signal);
        } finally {foreground--;}
    }
    async function backgroundRead(signal, action) {
        while (foreground || background.size) {if (closed) throw abortError(); await wait(25, signal);}
        if (closed || signal.aborted) throw abortError();
        const child = new AbortController(), cancel = () => child.abort(); let finish;
        const done = new Promise(resolve => {finish = resolve;}); background.set(child, done);
        signal.addEventListener('abort', cancel, {once: true});
        try {return await action(child.signal);}
        finally {signal.removeEventListener('abort', cancel); background.delete(child); finish();}
    }
    async function listen() {
        if (starting) return starting;
        starting = new Promise((resolve, reject) => {
            server = http.createServer((req, res) => {void serve(req, res);});
            server.maxConnections = 16; server.requestTimeout = 10000; server.headersTimeout = 10000;
            server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
        });
        return starting;
    }
    async function serve(req, res) {
        const host = '127.0.0.1:' + server.address().port;
        const route = routes.get(req.url);
        if (closed || !route || req.headers.host !== host || req.headers.origin || req.headers.referer || !['GET', 'HEAD'].includes(req.method)) {res.writeHead(403); res.end(); return;}
        if (!route.current()) {res.writeHead(410); res.end(); return;}
        if (requests >= 4) {res.writeHead(503); res.end(); return;}
        // RFC 9110 If-Range mismatch means ignore Range and send this full representation.
        const rangeHeader = req.headers['if-range'] && req.headers['if-range'] !== route.lease.etag ? null : req.headers.range;
        const range = parseRange(rangeHeader, route.lease.total);
        if (!range) {res.writeHead(416, {'Content-Range': 'bytes */' + route.lease.total}); res.end(); return;}
        const controller = new AbortController(), abort = () => controller.abort();
        req.once('aborted', abort); res.once('close', abort);
        requests++; route.controllers.add(controller);
        const job = (async () => {
            const headers = {'Content-Type': 'application/octet-stream', 'Content-Length': range.end - range.start + 1,
                'Accept-Ranges': 'bytes', ETag: route.lease.etag, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'};
            if (range.partial) headers['Content-Range'] = 'bytes ' + range.start + '-' + range.end + '/' + route.lease.total;
            try {
                if (req.method === 'HEAD') {res.writeHead(range.partial ? 206 : 200, headers); res.end(); return;}
                let offset = range.start;
                while (offset <= range.end) {
                    if (controller.signal.aborted || !route.current()) throw abortError();
                    const n = Math.floor(offset / route.lease.blockBytes);
                    const data = await route.block(n, controller.signal, false, undefined, offset - n * route.lease.blockBytes);
                    if (controller.signal.aborted || !route.current()) throw abortError();
                    if (!res.headersSent) res.writeHead(range.partial ? 206 : 200, headers);
                    const end = Math.min(range.end + 1, n * route.lease.blockBytes + data.length);
                    const bytes = data.subarray(offset - n * route.lease.blockBytes, end - n * route.lease.blockBytes);
                    if (!res.write(bytes)) await once(res, 'drain', {signal: controller.signal});
                    offset = end;
                }
                res.end();
            } catch (_) {
                if (!res.headersSent) {res.writeHead(502); res.end();} else res.destroy();
            } finally {requests--; route.controllers.delete(controller); req.removeListener('aborted', abort); res.removeListener('close', abort);}
        })();
        route.jobs.add(job); job.finally(() => route.jobs.delete(job)).catch(() => {});
    }
    async function performOpen({source, identity, isCurrent, signal, role = 'candidate', transport}) {
        if (transport !== undefined && !sourceAuthority.isTransport(transport)) throw diagnostics.error('source-proof-invalid', 'range-source-proof-invalid');
        if (transport) signal = AbortSignal.any([transport.signal].concat(signal ? [signal] : []));
        if (closed || routes.size >= 8 || typeof isCurrent !== 'function' || !isCurrent()) throw abortError();
        const controller = new AbortController(); opens.add(controller);
        const abort = () => controller.abort();
        if (signal) {signal.addEventListener('abort', abort, {once: true}); if (signal.aborted) abort();}
        let lease, transferred = false;
        try {
            const readSource = async (scoped, range) => {
                if (!transport) return reader.read({source, origin: identity.serverOrigin, ...range, signal: scoped});
                const signal = AbortSignal.any([scoped, transport.signal]);
                if (signal.aborted) throw abortError();
                const access = await transport.access(signal);
                if (signal.aborted) throw abortError();
                return reader.read({source: access.source, origin: access.origin, userAgent: access.userAgent, ...range, signal});
            };
            // A fresh authorized URL and successful 206 probe are required even for a disk hit.
            const probe = signal => readSource(signal, {start: 0, length: 1});
            const proof = await (role === 'next' ? backgroundRead(controller.signal, probe) : foregroundRead(controller.signal, probe));
            if (closed || controller.signal.aborted || !isCurrent()) throw abortError();
            lease = await store.acquire(transport ? {...identity, representation: transport.representation} : identity, proof, role);
            await listen();
            if (closed || routes.size >= 8 || controller.signal.aborted || !isCurrent()) throw abortError();
            const routePath = '/range/' + crypto.randomUUID();
            const active = {lease, jobs: new Set(), controllers: new Set(), retired: false};
            active.current = () => !closed && !active.retired && !controller.signal.aborted && isCurrent();
            // The single-byte eligibility probe is control overhead. Prefix media
            // attempts (including cancelled ones) are bounded separately by P.
            let backgroundSpent = 0, cacheFailed = false;
            active.block = async (n, signal, lowPriority, budget, requiredOffset = 0) => {
                if (!active.current() || signal.aborted) throw abortError();
                let hit = null;
                if (!cacheFailed) {
                    try {hit = await lease.readBlock(n);} catch (_) {cacheFailed = true;}
                }
                if (!active.current() || signal.aborted || transport && transport.signal.aborted) throw abortError();
                if (hit && hit.length > requiredOffset) {
                    if (!lowPriority && typeof options.onPrefixRead === 'function') {
                        try {options.onPrefixRead({itemId: identity.itemId, start: n * lease.blockBytes + requiredOffset,
                            end: n * lease.blockBytes + hit.length - 1});} catch (_) { /* Main-owned observation never controls IO. */ }
                    }
                    return hit;
                }
                if (cacheFailed && lowPriority) throw diagnostics.error('cache-io', 'range-cache-unavailable');
                const offset = n * lease.blockBytes, length = Math.min(lease.blockBytes, lease.total - offset,
                    lowPriority ? budget - offset : Infinity);
                if (lowPriority) {
                    if (backgroundSpent + length > budget) throw Error('range-prefetch-budget');
                    backgroundSpent += length; // Charge aborted attempts too: retries cannot run without bound.
                }
                const read = scoped => readSource(scoped, {start: offset, length, expected: proof});
                {
                    const result = lowPriority ? await read(signal) : await foregroundRead(signal, read);
                    if (!active.current() || signal.aborted) throw abortError();
                    // Disk failure/pressure must not prevent valid foreground bytes from playing.
                    try {if (!cacheFailed && lowPriority) {const written = await lease.writeBlock(n, result.bytes); if (!written && lowPriority) throw diagnostics.error('cache-quota', 'range-quota');}}
                    catch (error) {cacheFailed = true; if (lowPriority) throw error && error.preloadReason ? error : diagnostics.error('cache-io', 'range-cache-unavailable');}
                    return result.bytes;
                }
            };
            let stopping;
            const handle = {
                source: 'http://127.0.0.1:' + server.address().port + routePath,
                status: () => lease.status(),
                markPlaying: () => {if (!active.current()) return Promise.reject(abortError()); return lease.markPlaying();},
                async prefetch({maxBytes, bytesPerSecond, signal, onProgress}) {
                    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || bytesPerSecond !== undefined && (!Number.isSafeInteger(bytesPerSecond) || bytesPerSecond <= 0) || !signal) throw Error('range-prefetch-limits-required');
                    let offset = 0;
                    while (offset < Math.min(maxBytes, lease.total)) {
                        if (!active.current() || signal.aborted) throw abortError();
                        const length = Math.min(lease.blockBytes, lease.total - offset, maxBytes - offset);
                        if (offset + length > maxBytes) break;
                        if (foreground) {await wait(25, signal); continue;}
                        try {
                            await backgroundRead(signal, scoped => active.block(Math.floor(offset / lease.blockBytes), scoped, true, maxBytes));
                            offset += length;
                            if (typeof onProgress === 'function') {try {onProgress({bytes: offset, targetBytes: Math.min(maxBytes, lease.total)});} catch (_) {}}
                        } catch (error) {
                            if (error.message === 'range-prefetch-budget') return {bytes: offset};
                            if (signal.aborted || !active.current() || error.name !== 'AbortError') throw error;
                            // A foreground miss retired only this background attempt.
                        }
                        await wait(bytesPerSecond === undefined ? 0 : Math.ceil(length * 1000 / bytesPerSecond), signal);
                    }
                    return {bytes: offset};
                },
                stop() {
                    if (stopping) return stopping;
                    active.retired = true; routes.delete(routePath);
                    controller.signal.removeEventListener('abort', active.abort); controller.abort();
                    for (const c of active.controllers) c.abort();
                    stopping = (async () => {await Promise.allSettled([...active.jobs]); await active.lease.release();})();
                    retiring.add(stopping); stopping.finally(() => retiring.delete(stopping)).catch(() => {});
                    return stopping;
                }
            };
            const prefetch = handle.prefetch;
            handle.prefetch = config => {
                const job = prefetch({...config, signal: AbortSignal.any([config.signal, controller.signal])});
                active.jobs.add(job); job.finally(() => active.jobs.delete(job)).catch(() => {}); return job;
            };
            routes.set(routePath, active); active.handle = handle;
            active.abort = () => {handle.stop().catch(() => {});};
            controller.signal.addEventListener('abort', active.abort, {once: true});
            // Keep the parent's signal wired for this entire route lease.
            active.unlink = () => {if (signal) signal.removeEventListener('abort', abort);};
            const stop = handle.stop;
            handle.stop = () => {active.unlink(); return stop();};
            transferred = true;
            return handle;
        } finally {
            opens.delete(controller);
            if (!transferred && signal) signal.removeEventListener('abort', abort);
            if (lease && !transferred) await lease.release();
        }
    }
    function open(options) {
        const job = performOpen(options); openJobs.add(job); job.finally(() => openJobs.delete(job)).catch(() => {}); return job;
    }
    return {open, discardNext: () => store.discardNext(), status: () => ({...store.status(), routes: routes.size, requests, upstream: reader.status().requests}),
        close() {
            if (closing) return closing;
            closed = true; for (const c of opens) c.abort(); preempt();
            closing = (async () => {
                await Promise.allSettled([...openJobs]);
                await Promise.all([...routes.values()].map(route => route.handle.stop()).concat([...retiring]));
                await reader.close();
                if (starting) {await starting; server.closeAllConnections(); await new Promise(resolve => server.close(resolve));}
                await store.close();
            })(); return closing;
        }};
}
module.exports = {createCache, parseRange};
