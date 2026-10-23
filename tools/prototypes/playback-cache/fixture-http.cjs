'use strict';

// Deliberately loopback-only, <=4 KiB test transport. Never a product downloader.
const http = require('node:http');
const strong = value => typeof value === 'string' && /^"[\x21\x23-\x7e]{1,256}"$/.test(value);
function error(code) { return Object.assign(new Error(code), {code}); }
function createFixtureClient(options = {}) {
    if (options.enabled !== true) return Object.freeze({enabled: false});
    let origin;
    try { origin = new URL(options.origin); } catch { throw error('fixture-origin-invalid'); }
    if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || !origin.port ||
        origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw error('fixture-origin-invalid');
    if (!Number.isSafeInteger(options.maxObjectBytes) || options.maxObjectBytes < 1 || options.maxObjectBytes > 4096 ||
        !Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 5000 ||
        typeof options.isCurrent !== 'function') throw error('fixture-policy-required');
    const {maxObjectBytes, timeoutMs, isCurrent} = options;
    const active = new Set();
    let closed = false;
    function current(scope) { try { return isCurrent(scope) === true; } catch { return false; } }
    function readRange(input) {
        let url;
        try { url = new URL(input.url); } catch { return Promise.reject(error('fixture-url-invalid')); }
        const {offset, length, total, strongETag, scope, signal, authorization} = input;
        if (closed) return Promise.reject(error('fixture-client-closed'));
        if (url.origin !== origin.origin || url.username || url.password || url.hash) return Promise.reject(error('fixture-url-invalid'));
        if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 1 ||
            offset + length > maxObjectBytes || (total !== null && (!Number.isSafeInteger(total) ||
                total > maxObjectBytes || offset + length > total)) ||
            (strongETag !== null && !strong(strongETag)) ||
            (offset > 0 && (!strong(strongETag) || total === null)) ||
            typeof authorization !== 'string' || !/^[\x20-\x7e]{1,256}$/.test(authorization) ||
            !signal || typeof signal.addEventListener !== 'function') return Promise.reject(error('fixture-range-invalid'));
        if (!current(scope) || signal.aborted) return Promise.reject(error('fixture-context-retired'));

        const promise = new Promise((resolve, reject) => {
            let request, response, socket, requestClosed = false, socketClosed = false;
            let finished = false, finalized = false, result, failure;
            const deadline = Date.now() + timeoutMs;
            let done;
            const job = {closed: new Promise(resolve => { done = resolve; }), cancel: () => finish(error('fixture-cancelled'))};
            active.add(job);
            const abort = () => finish(error('fixture-cancelled'));
            const timer = setTimeout(() => finish(error('fixture-timeout')), timeoutMs);
            function finalize() {
                if (finalized) return; finalized = true;
                if (!failure && (closed || signal.aborted || !current(scope))) failure = error('fixture-context-retired');
                if (!failure && Date.now() >= deadline) failure = error('fixture-timeout');
                active.delete(job); done();
                if (failure) reject(failure); else resolve(result);
            }
            function finish(reason, value) {
                if (finished) return; finished = true; failure = reason; result = value;
                clearTimeout(timer); signal.removeEventListener('abort', abort);
                if (response) response.destroy();
                if (request) request.destroy();
                if (socket) socket.destroy();
                if (!request || socketClosed || (!socket && requestClosed)) finalize();
            }
            try {
                const headers = {'Range': `bytes=${offset}-${offset + length - 1}`, 'Accept-Encoding': 'identity', 'Authorization': authorization};
                if (strongETag !== null) headers['If-Range'] = strongETag;
                request = http.request(url, {method: 'GET', headers, agent: false, maxHeaderSize: 4096}, incoming => {
                    response = incoming;
                    incoming.once('error', () => finish(error('fixture-body-interrupted')));
                    if (!current(scope) || signal.aborted) return finish(error('fixture-context-retired'));
                    if (incoming.statusCode === 401 || incoming.statusCode === 403) return finish(error('fixture-authorization-rejected'));
                    if (incoming.statusCode >= 300 && incoming.statusCode < 400) return finish(error('fixture-redirect-rejected'));
                    if (incoming.statusCode === 416) return finish(error('fixture-range-unsatisfiable'));
                    if (incoming.statusCode !== 206) return finish(error('fixture-range-unconfirmed'));
                    const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(incoming.headers['content-range'] || '');
                    const actualTotal = match && Number(match[3]);
                    if (!match || Number(match[1]) !== offset || Number(match[2]) !== offset + length - 1 ||
                        !Number.isSafeInteger(actualTotal) || actualTotal < offset + length || actualTotal > maxObjectBytes ||
                        (total !== null && actualTotal !== total) || incoming.headers['content-length'] !== String(length) ||
                        (incoming.headers['content-encoding'] && incoming.headers['content-encoding'] !== 'identity')) return finish(error('fixture-range-mismatch'));
                    const tag = incoming.headers.etag;
                    // Last-Modified alone is deliberately unsupported, even if
                    // a particular server could prove it a strong date validator.
                    if (!strong(tag)) return finish(error('fixture-strong-validator-required'));
                    if (strongETag !== null && tag !== strongETag) return finish(error('fixture-validator-changed'));
                    const chunks = []; let received = 0;
                    incoming.on('data', bytes => {
                        received += bytes.length;
                        if (received > length) return finish(error('fixture-body-invalid'));
                        chunks.push(bytes);
                    });
                    incoming.once('aborted', () => finish(error('fixture-body-interrupted')));
                    incoming.once('end', () => {
                        if (Date.now() >= deadline) return finish(error('fixture-timeout'));
                        if (!current(scope) || signal.aborted) return finish(error('fixture-context-retired'));
                        if (!incoming.complete || received !== length) return finish(error('fixture-body-invalid'));
                        finish(null, Object.freeze({bytes: Buffer.concat(chunks, received), total: actualTotal, strongETag: tag}));
                    });
                });
                request.once('socket', value => {
                    socket = value;
                    socket.once('close', () => { socketClosed = true; if (finished) finalize(); });
                });
                request.once('error', () => finish(error('fixture-transport-failed')));
                request.once('close', () => {
                    requestClosed = true;
                    if (!finished) finish(error('fixture-body-interrupted'));
                    if (finished && !socket) finalize();
                });
                signal.addEventListener('abort', abort, {once: true});
                if (signal.aborted) abort(); else request.end();
            } catch { finish(error('fixture-transport-failed')); }
        });
        promise.catch(() => {});
        return promise;
    }
    return Object.freeze({enabled: true, readRange,
        status: () => Object.freeze({closed, activeRequests: active.size}),
        async close() {
            closed = true;
            const jobs = [...active]; jobs.forEach(job => job.cancel());
            await Promise.all(jobs.map(job => job.closed));
        }
    });
}

module.exports = {createFixtureClient};
