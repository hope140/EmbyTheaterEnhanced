'use strict';
const http = require('node:http');
const https = require('node:https');
const {strongTag} = require('./playback-range-identity');
const diagnostics = require('./playback-range-diagnostics');
const abortError = () => Object.assign(diagnostics.error('request-cancelled', 'range-cancelled'), {name: 'AbortError'});
function createReader({timeoutMs}) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30000) throw Error('range-timeout-required');
    const active = new Set();
    let closed = false;
    function read({source, origin, start, length, expected, signal, userAgent}) {
        let url;
        try {url = new URL(source);} catch (_) {return Promise.reject(diagnostics.error('source-invalid', 'range-request-invalid'));}
        if (closed || signal && signal.aborted) return Promise.reject(abortError());
        let refusal;
        if (!['http:', 'https:'].includes(url.protocol)) refusal = 'source-not-http';
        else if (url.origin !== origin) refusal = 'source-cross-origin';
        else if (url.username || url.password) refusal = 'source-credentials';
        else if (url.hash) refusal = 'source-invalid';
        else if (userAgent !== undefined && (typeof userAgent !== 'string' || !userAgent.length || userAgent.length > 1024 || !/^[\x20-\x7e]+$/.test(userAgent) || /[,\\]/.test(userAgent))) refusal = 'source-options-changed';
        else if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(length) || length <= 0 || length > 1048576 || !Number.isSafeInteger(start + length)) refusal = 'range-invalid';
        if (refusal) return Promise.reject(diagnostics.error(refusal, 'range-request-invalid'));
        return new Promise((resolve, reject) => {
            const headers = {Range: 'bytes=' + start + '-' + (start + length - 1), 'Accept-Encoding': 'identity', Connection: 'close'};
            if (userAgent !== undefined) headers['User-Agent'] = userAgent;
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
                const status = incoming.statusCode;
                let reason;
                if (status >= 300 && status <= 399) reason = 'redirect';
                else if (status === 401 || status === 403) reason = 'auth-required';
                else if (status === 412) reason = 'validator-changed';
                else if (status === 416) reason = 'range-invalid';
                else if (status !== 206) reason = 'status-not-206';
                else if (!match || Number(match[1]) !== start || Number(match[2]) !== start + length - 1 || !Number.isSafeInteger(total) || total <= start + length - 1) reason = 'range-invalid';
                else if (etag === undefined || etag === '') reason = 'etag-missing';
                else if (typeof etag === 'string' && etag.startsWith('W/')) reason = 'etag-weak';
                else if (!strongTag(etag)) reason = 'etag-invalid';
                else if (Number(incoming.headers['content-length']) !== length) reason = 'length-mismatch';
                else if (incoming.headers['content-encoding'] && incoming.headers['content-encoding'] !== 'identity') reason = 'encoding-unsupported';
                else if (expected && etag !== expected.etag) reason = 'validator-changed';
                else if (expected && total !== expected.total) reason = 'representation-changed';
                if (reason) return fail(diagnostics.error(reason, 'range-response-invalid', status));
                const chunks = []; let size = 0;
                incoming.on('data', chunk => {size += chunk.length; if (size > length) fail(diagnostics.error('body-invalid', 'range-body-invalid', status)); else chunks.push(chunk);});
                incoming.once('error', () => fail(diagnostics.error('response-interrupted', 'range-response-interrupted', status)));
                incoming.once('aborted', () => fail(diagnostics.error('response-interrupted', 'range-response-interrupted', status)));
                incoming.once('end', () => {
                    if (size !== length) return fail(diagnostics.error('body-invalid', 'range-body-invalid', status));
                    result = {bytes: Buffer.concat(chunks), etag, total}; request.destroy();
                });
            });
            request.once('error', () => {failure ||= diagnostics.error('network-failed', 'range-network-failed');});
            request.once('close', () => {
                clearTimeout(timer); active.delete(request); if (signal) signal.removeEventListener('abort', abort);
                if (failure) reject(failure); else if (result) resolve(result); else reject(diagnostics.error('response-interrupted', 'range-response-interrupted'));
            });
            timer = setTimeout(() => fail(diagnostics.error('timeout', 'range-timeout')), timeoutMs);
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
