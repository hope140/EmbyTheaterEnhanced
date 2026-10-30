'use strict';

const http = require('node:http');
const https = require('node:https');
const {inspectResponse, finishResponse} = require('./response-contract');
const PREFIX_LIMIT = 65536;
const failures = new WeakSet();

function failure(reason) {
    const error = Object.assign(Error('advance-download-' + reason), {downloadReason: reason});
    failures.add(error);
    return error;
}
function reasonOf(error) {return error && failures.has(error) ? error.downloadReason : 'source-unavailable';}
function sourceUrl(value) {
    let url;
    try {url = new URL(value);} catch (_) {throw failure('invalid-source');}
    if (typeof value !== 'string' || value.length > 32768 || /[\u0000-\u001f\u007f]/.test(value) ||
        !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || value.includes('#')) throw failure('invalid-source');
    return url;
}
function statusError(status) {
    if (status === 401 || status === 403) return 'auth-required';
    if (status === 416) return 'range-unsatisfied';
    return 'http-status';
}

// Resolves only after the owned request closes. In prefix mode a full 200 body
// is deliberately stopped at the cap; it is never buffered as a whole movie.
function requestBuffer(urlValue, {headers = {}, signal, limit, prefix = false, timeoutMs = 8000}) {
    const url = sourceUrl(urlValue);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 2097152 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw failure('invalid-request');
    if (signal?.aborted) return Promise.reject(failure('cancelled'));
    return new Promise((resolve, reject) => {
        const deadline = Date.now() + timeoutMs;
        let incoming, result, error, timer, count = 0;
        const chunks = [];
        const request = (url.protocol === 'https:' ? https : http).request(url, {
            method: 'GET', headers: {...headers, 'Accept-Encoding': 'identity', Connection: 'close'}, agent: false
        });
        function stop(reason) {error ||= failure(reason); incoming?.destroy(); request.destroy();}
        const abort = () => stop('cancelled');
        signal?.addEventListener('abort', abort, {once: true});
        request.once('response', response => {
            incoming = response;
            if (signal?.aborted) return stop('cancelled');
            if (Date.now() >= deadline) return stop('timeout');
            const base = {statusCode: response.statusCode, headers: response.headers};
            if (![200, 206].includes(response.statusCode)) {
                result = {...base, body: Buffer.alloc(0), messageComplete: false};
                response.destroy(); request.destroy(); return;
            }
            response.on('data', chunk => {
                if (result || error) return;
                if (signal?.aborted) return stop('cancelled');
                if (Date.now() >= deadline) return stop('timeout');
                const take = Math.min(chunk.length, limit - count);
                if (take > 0) {chunks.push(Buffer.from(chunk.subarray(0, take))); count += take;}
                const length = Number(response.headers['content-length']);
                if (chunk.length > take || prefix && response.statusCode === 200 && length > limit && count === limit) {
                    if (!prefix || response.statusCode !== 200) return stop('response-too-large');
                    result = {...base, body: Buffer.concat(chunks, count), messageComplete: false};
                    response.destroy(); request.destroy();
                }
            });
            response.once('end', () => {
                if (!result && !error) result = {...base, body: Buffer.concat(chunks, count), messageComplete: response.complete === true};
            });
            response.once('error', () => {if (!result) stop('response-interrupted');});
            response.once('aborted', () => {if (!result) stop('response-interrupted');});
        });
        request.once('error', () => {if (!result) error ||= failure('network-failed');});
        request.once('close', () => {
            clearTimeout(timer); signal?.removeEventListener('abort', abort);
            if (signal?.aborted) error ||= failure('cancelled');
            if (Date.now() >= deadline) error ||= failure('timeout');
            if (error) reject(error);
            else if (result) resolve(result);
            else reject(failure('response-interrupted'));
        });
        timer = setTimeout(() => stop('timeout'), timeoutMs);
        if (signal?.aborted) abort();
        request.end();
    });
}

async function jsonRequest(url, headers, signal, timeoutMs) {
    const response = await requestBuffer(url, {headers, signal, timeoutMs, limit: 2097152});
    if (response.statusCode !== 200) throw failure(response.statusCode >= 300 && response.statusCode < 400 ? 'metadata-redirect' : statusError(response.statusCode));
    if (!response.messageComplete) throw failure('response-interrupted');
    try {
        const value = JSON.parse(response.body.toString('utf8'));
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
        return value;
    } catch (_) {throw failure('invalid-metadata');}
}

function mediaExtension(body, hint) {
    if (body.length >= 4 && body.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return hint === 'webm' ? 'webm' : 'mkv';
    if (body.length >= 12 && body.toString('ascii', 4, 8) === 'ftyp') return hint === 'mov' ? 'mov' : 'mp4';
    if (body.length >= 12 && body.toString('ascii', 0, 4) === 'RIFF' && body.toString('ascii', 8, 12) === 'AVI ') return 'avi';
    if (body.length >= 4 && body.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0xba]))) return 'mpg';
    if (body.length >= 3 && body.toString('ascii', 0, 3) === 'FLV') return 'flv';
    if (body.length >= 16 && body.subarray(0, 16).equals(Buffer.from('3026b2758e66cf11a6d900aa0062ce6c', 'hex'))) return 'wmv';
    if (body.length > 376 && [0, 188, 376].every(offset => body[offset] === 0x47)) return 'ts';
    if (body.length > 388 && [4, 196, 388].every(offset => body[offset] === 0x47)) return 'm2ts';
    const text = body.toString('utf8', 0, Math.min(body.length, 512)).replace(/^\uFEFF/, '').trimStart();
    if (text.startsWith('#EXTM3U')) throw failure('segmented-source');
    if (/^https?:\/\//i.test(text)) throw failure('pointer-response');
    if (/^(?:<!doctype\s+html|<html|<\?xml|\{)/i.test(text)) throw failure('non-media-response');
    throw failure('container-unrecognized');
}

async function probeSource(candidate, {signal, timeoutMs = 8000} = {}) {
    let url = sourceUrl(candidate.url), headers = {...candidate.headers};
    const seen = new Set();
    let response;
    for (let hop = 0; ; hop++) {
        if (seen.has(url.href)) throw failure('redirect-loop');
        seen.add(url.href);
        response = await requestBuffer(url.href, {headers: {...headers, Range: 'bytes=0-65535'}, signal, timeoutMs, limit: PREFIX_LIMIT, prefix: true});
        if (![301, 302, 303, 307, 308].includes(response.statusCode)) break;
        if (hop >= 3 || typeof response.headers.location !== 'string') throw failure('redirect-limit');
        const next = sourceUrl(new URL(response.headers.location, url).href);
        if (url.protocol === 'https:' && next.protocol !== 'https:') throw failure('redirect-downgrade');
        if (next.origin !== url.origin) headers = headers['User-Agent'] ? {'User-Agent': headers['User-Agent']} : {};
        url = next;
    }
    if (![200, 206].includes(response.statusCode)) throw failure(statusError(response.statusCode));
    const range = /^bytes 0-(0|[1-9]\d*)\/([1-9]\d*)$/i.exec(response.headers['content-range'] || '');
    const total = Number(response.statusCode === 206 ? range?.[2] : response.headers['content-length']);
    if (!Number.isSafeInteger(total) || total <= 0) throw failure('length-unavailable');
    const plan = inspectResponse({offset: 0, total}, response);
    if (plan.action !== 'receive') throw failure(plan.reason);
    if (response.statusCode === 206) {
        if (plan.expectedBytes > PREFIX_LIMIT || finishResponse(plan, {receivedBytes: response.body.length,
            messageComplete: response.messageComplete}).action !== 'body-accepted') throw failure('invalid-probe-range');
    } else if (total <= PREFIX_LIMIT && (!response.messageComplete || response.body.length !== total)) throw failure('body-incomplete');
    const extension = mediaExtension(response.body, candidate.container);
    if (candidate.sizeHint !== undefined && candidate.sizeHint !== total) throw failure('representation-changed');
    let resumeVerified = false;
    if (response.statusCode === 206 && plan.etag && total > 1) {
        const offset = Math.min(total - 1, PREFIX_LIMIT);
        const tail = await requestBuffer(url.href, {headers: {...headers, Range: 'bytes=' + offset + '-' + offset, 'If-Range': plan.etag},
            signal, timeoutMs, limit: PREFIX_LIMIT, prefix: true});
        if (tail.statusCode === 401 || tail.statusCode === 403) throw failure('auth-required');
        if (tail.headers.etag !== undefined && tail.headers.etag !== plan.etag) throw failure('representation-changed');
        if (tail.statusCode === 206) {
            const check = inspectResponse({offset, total, etag: plan.etag}, tail);
            if (check.action !== 'receive' || check.expectedBytes !== 1 ||
                finishResponse(check, {receivedBytes: tail.body.length, messageComplete: tail.messageComplete}).action !== 'body-accepted') throw failure('resume-probe-invalid');
            resumeVerified = true;
        }
    }
    return Object.freeze({url: url.href, headers: Object.freeze(headers), total, extension,
        etag: plan.etag, lastModified: response.headers['last-modified'] || null,
        rangeSupported: response.statusCode === 206, resumeVerified,
        electronResumeEligible: resumeVerified && !!response.headers['last-modified']});
}

module.exports = {failure, reasonOf, sourceUrl, jsonRequest, probeSource, mediaExtension};
