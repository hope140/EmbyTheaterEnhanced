'use strict';
const http = require('node:http');
const https = require('node:https');
const strong = v => typeof v === 'string' && /^"[\x21\x23-\x7e]{1,256}"$/.test(v);
const failure = code => Object.assign(new Error(code), {code});

// No redirects, cookies, proxy overrides, TLS exceptions, retries or persistence.
function createReader({maxFileBytes, timeoutMs}) {
    const jobs = new Set(); let closed = false;
    function read({url, origin, start, length, expected, signal}) {
        let target;
        try { target = new URL(url); } catch { return Promise.reject(failure('cache-source-invalid')); }
        if (closed || !['http:', 'https:'].includes(target.protocol) || target.origin !== origin || target.username || target.password || target.hash ||
            !Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(length) || length < 1 || length > 65536 ||
            start + length > maxFileBytes || signal.aborted) return Promise.reject(failure('cache-source-invalid'));
        const promise = new Promise((resolve, reject) => {
            let request, response, socket, socketClosed = false, requestClosed = false, finished = false, finalized = false, result, error;
            const deadline = Date.now() + timeoutMs;
            let done;
            const job = {done: new Promise(r => { done = r; }), cancel: () => finish(failure('cache-cancelled'))}; jobs.add(job);
            const abort = () => finish(failure('cache-cancelled'));
            const timer = setTimeout(() => finish(failure('cache-timeout')), timeoutMs);
            function finalize() {
                if (finalized) return; finalized = true;
                if (!error && (closed || signal.aborted || Date.now() >= deadline)) error = failure('cache-cancelled');
                jobs.delete(job); done(); if (error) reject(error); else resolve(result);
            }
            function finish(reason, value) {
                if (finished) return; finished = true; error = reason; result = value;
                clearTimeout(timer); signal.removeEventListener('abort', abort);
                if (response) response.destroy(); if (request) request.destroy(); if (socket) socket.destroy();
                if (!request || socketClosed || (!socket && requestClosed)) finalize();
            }
            try {
                const headers = {Range: `bytes=${start}-${start + length - 1}`, 'Accept-Encoding': 'identity'};
                if (expected) headers['If-Range'] = expected.strongETag;
                request = (target.protocol === 'https:' ? https : http).request(target, {method: 'GET', headers, agent: false, maxHeaderSize: 8192}, incoming => {
                    response = incoming; incoming.once('error', () => finish(failure('cache-body-interrupted')));
                    const h = incoming.headers, range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(h['content-range'] || ''), total = range && Number(range[3]);
                    if (incoming.statusCode !== 206 || !range || Number(range[1]) !== start || Number(range[2]) !== start + length - 1 ||
                        !Number.isSafeInteger(total) || total < start + length || total > maxFileBytes || h['content-length'] !== String(length) ||
                        (h['content-encoding'] && h['content-encoding'] !== 'identity') || /multipart\//i.test(h['content-type'] || '') ||
                        /(?:^|,)\s*no-store\b/i.test(h['cache-control'] || '') ||
                        (h.vary && h.vary.split(',').some(v => v.trim().toLowerCase() !== 'accept-encoding')) || !strong(h.etag) ||
                        (expected && (expected.total !== total || expected.strongETag !== h.etag))) return finish(failure('cache-response-ineligible'));
                    const chunks = []; let count = 0;
                    incoming.on('data', data => { count += data.length; if (count > length) finish(failure('cache-body-invalid')); else chunks.push(data); });
                    incoming.once('aborted', () => finish(failure('cache-body-interrupted')));
                    incoming.once('end', () => {
                        if (!incoming.complete || count !== length || signal.aborted) return finish(failure('cache-body-interrupted'));
                        finish(null, {bytes: Buffer.concat(chunks, count), total, strongETag: h.etag});
                    });
                });
                request.once('socket', s => { socket = s; socket.once('close', () => { socketClosed = true; if (finished) finalize(); }); });
                request.once('error', () => finish(failure('cache-transport-failed')));
                request.once('close', () => { requestClosed = true; if (!finished) finish(failure('cache-body-interrupted')); if (!socket && finished) finalize(); });
                signal.addEventListener('abort', abort, {once: true}); if (signal.aborted) abort(); else request.end();
            } catch { finish(failure('cache-transport-failed')); }
        });
        promise.catch(() => {}); return promise;
    }
    return {read, status: () => ({activeRequests: jobs.size}),
        async close() { closed = true; const active = [...jobs]; active.forEach(job => job.cancel()); await Promise.all(active.map(job => job.done)); }};
}
module.exports = {createReader};
