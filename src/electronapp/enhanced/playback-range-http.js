'use strict';
const http = require('node:http');
const https = require('node:https');
const {strongTag} = require('./playback-range-store');
const abortError = () => Object.assign(Error('range-cancelled'), {name: 'AbortError'});
function createReader({timeoutMs}) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30000) throw Error('range-timeout-required');
    const active = new Set();
    let closed = false;
    function read({source, origin, start, length, expected, signal}) {
        const url = new URL(source);
        if (closed || signal && signal.aborted) return Promise.reject(abortError());
        if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password || url.hash ||
            !Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(length) || length <= 0 || length > 1048576 || !Number.isSafeInteger(start + length)) return Promise.reject(Error('range-request-invalid'));
        return new Promise((resolve, reject) => {
            const headers = {Range: 'bytes=' + start + '-' + (start + length - 1), 'Accept-Encoding': 'identity', Connection: 'close'};
            if (expected) headers['If-Match'] = expected.etag;
            let result, failure, response, timer;
            const request = (url.protocol === 'https:' ? https : http).request(url, {method: 'GET', headers, agent: false});
            active.add(request);
            const fail = error => {failure ||= error; if (response) response.destroy(); request.destroy();};
            const abort = () => fail(abortError());
            request.once('response', incoming => {
                response = incoming;
                const match = /^bytes ([0-9]+)-([0-9]+)\/([0-9]+)$/.exec(incoming.headers['content-range'] || '');
                const etag = incoming.headers.etag, total = match && Number(match[3]);
                if (incoming.statusCode !== 206 || !match || Number(match[1]) !== start || Number(match[2]) !== start + length - 1 ||
                    !Number.isSafeInteger(total) || total <= start + length - 1 || !strongTag(etag) ||
                    Number(incoming.headers['content-length']) !== length ||
                    incoming.headers['content-encoding'] && incoming.headers['content-encoding'] !== 'identity' ||
                    expected && (etag !== expected.etag || total !== expected.total)) return fail(Error('range-response-invalid'));
                const chunks = []; let size = 0;
                incoming.on('data', chunk => {size += chunk.length; if (size > length) fail(Error('range-body-invalid')); else chunks.push(chunk);});
                incoming.once('error', () => fail(Error('range-response-interrupted')));
                incoming.once('aborted', () => fail(Error('range-response-interrupted')));
                incoming.once('end', () => {
                    if (size !== length) return fail(Error('range-body-invalid'));
                    result = {bytes: Buffer.concat(chunks), etag, total}; request.destroy();
                });
            });
            request.once('error', () => {failure ||= Error('range-network-failed');});
            request.once('close', () => {
                clearTimeout(timer); active.delete(request); if (signal) signal.removeEventListener('abort', abort);
                if (failure) reject(failure); else if (result) resolve(result); else reject(Error('range-response-interrupted'));
            });
            timer = setTimeout(() => fail(Error('range-timeout')), timeoutMs);
            if (signal) {signal.addEventListener('abort', abort, {once: true}); if (signal.aborted) abort();}
            request.end();
        });
    }
    return {read, status: () => ({requests: active.size}), async close() {
        closed = true;
        await Promise.all([...active].map(request => new Promise(resolve => {request.once('close', resolve); request.destroy();})));
    }};
}
module.exports = {createReader, abortError};
