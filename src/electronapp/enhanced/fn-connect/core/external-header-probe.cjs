'use strict';

// Disabled by default. An explicit main-only trial supplies one approved source:
// one HTTP request, no redirect/retry/body consumer or browser authentication.
const http = require('node:http');
const https = require('node:https');
const {fail, url: parseUrl, rejectCredentialRedirect} = require('./policy.cjs');
// Diagnostics contain no UA value. Keep the bounded printable-ASCII contract,
// but accept commas inside balanced HTTP comments (e.g. Chromium's comment).
function describeUserAgent(value) {
    const type = value === undefined ? 'UNDEFINED' : value === null ? 'NULL' :
        typeof value === 'string' ? 'STRING' : Array.isArray(value) ? 'ARRAY' : 'OTHER';
    let validation = 'TYPE_INVALID', byteLength = null;
    if (type === 'STRING') {
        byteLength = Math.min(Buffer.byteLength(value), 1025);
        validation = !value.trim() ? 'EMPTY' : byteLength > 1024 ? 'TOO_LONG' :
            !/^[\x20-\x7e]+$/.test(value) ? 'NON_PRINTABLE' : value.includes('\\') ? 'BACKSLASH' : 'VALID';
        if (validation === 'VALID') {
            let depth = 0, commentComma = false;
            for (const char of value) {
                if (char === '(') depth++;
                else if (char === ')' && --depth < 0) { validation = 'COMMENT_UNBALANCED'; break; }
                else if (char === ',') {
                    if (!depth) { validation = 'COMMA_OUTSIDE_COMMENT'; break; }
                    commentComma = true;
                }
            }
            if (validation === 'VALID') validation = depth ? 'COMMENT_UNBALANCED' : commentComma ? 'VALID_COMMENT_COMMA' : 'VALID';
        }
    }
    return Object.freeze({present: value !== undefined, type, byteLength, validation});
}
function createExternalHeaderProbe({enabled = false, approvedOrigin, mode = 'live', resolveProxy,
    environment = process.env, now = Date.now, timeoutMs = 10000} = {}) {
    const counts = {probeStarted: 0, requestCreatedCount: 0, actualHttpRequestCount: 0, headersObserved: 0};
    const snapshot = () => Object.freeze({...counts});
    if (!enabled) return {snapshot, run: async () => { throw fail('EXTERNAL_PROBE_DISABLED'); }};
    if (!['live', 'fixture'].includes(mode) || typeof resolveProxy !== 'function' ||
        !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw fail('EXTERNAL_PROBE_CONFIG_INVALID');
    const approved = parseUrl(approvedOrigin, mode);
    if (approved.pathname !== '/' || approved.search || approved.hash || approved.hostname.includes('*')) throw fail('EXTERNAL_PROBE_ORIGIN_INVALID');
    let used = false;
    return {snapshot, async run({sourceUrl, userAgent, range = 'bytes=0-0', expiresAt, knownSecrets = [], signal} = {}) {
        if (used) throw fail('EXTERNAL_PROBE_ALREADY_USED');
        used = true; // Validation failures also require a new explicit trial.
        counts.probeStarted = 1;
        const destination = parseUrl(sourceUrl, mode);
        if (destination.origin !== approved.origin) throw fail('EXTERNAL_PROBE_ORIGIN_REJECTED');
        // The caller supplies the actual media request UA, never a fallback.
        if (!['VALID', 'VALID_COMMENT_COMMA'].includes(describeUserAgent(userAgent).validation)) throw fail('EXTERNAL_PROBE_UA_UNCONFIRMED');
        if (!/^bytes=\d{1,16}-\d{0,16}$/.test(range)) throw fail('EXTERNAL_PROBE_RANGE_INVALID');
        const parts = /^bytes=(\d+)-(\d*)$/.exec(range), start = Number(parts[1]), end = parts[2] ? Number(parts[2]) : null;
        if (!Number.isSafeInteger(start) || end === null || !Number.isSafeInteger(end) || end < start || end - start + 1 > 65536) throw fail('EXTERNAL_PROBE_RANGE_INVALID');
        if (!Array.isArray(knownSecrets) || knownSecrets.some(v => typeof v !== 'string')) throw fail('EXTERNAL_PROBE_SECRETS_INVALID');
        rejectCredentialRedirect(destination, knownSecrets);
        if (knownSecrets.some(value => value && userAgent.includes(value))) throw fail('EXTERNAL_PROBE_UA_REJECTED');
        if (expiresAt !== undefined && (!Number.isSafeInteger(expiresAt) || expiresAt <= now())) throw fail('EXTERNAL_PROBE_SOURCE_EXPIRED');
        if (signal?.aborted) throw fail('CANCELLED');
        // Node HTTPS must not silently bypass an Electron/system/env proxy.
        if (['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'].some(k => environment[k])) throw fail('EXTERNAL_PROBE_PROXY_UNSUPPORTED');
        let request, response, timer, requestClosed;
        const stop = () => { request?.destroy(); response?.destroy(); };
        const deadline = now() + timeoutMs;
        let timeout, cancelProxy;
        let route;
        try { route = await Promise.race([Promise.resolve().then(() => resolveProxy(destination.href)),
            new Promise((_, reject) => {
                timeout = setTimeout(() => reject(fail('EXTERNAL_PROBE_TIMEOUT')), timeoutMs);
                cancelProxy = () => reject(fail('CANCELLED'));
                signal?.addEventListener('abort', cancelProxy, {once: true});
                if (signal?.aborted) cancelProxy();
            })]).finally(() => { clearTimeout(timeout); signal?.removeEventListener('abort', cancelProxy); });
        } catch (error) {
            if (['CANCELLED', 'EXTERNAL_PROBE_TIMEOUT'].includes(error?.code)) throw fail(error.code);
            throw fail('EXTERNAL_PROBE_PROXY_UNVERIFIED');
        }
        if (route !== 'DIRECT') throw fail('EXTERNAL_PROBE_PROXY_UNSUPPORTED');
        if (signal?.aborted) throw fail('CANCELLED');
        if (now() >= deadline) throw fail('EXTERNAL_PROBE_TIMEOUT');
        if (expiresAt !== undefined && expiresAt <= now()) throw fail('EXTERNAL_PROBE_SOURCE_EXPIRED');
        try {
            return await new Promise((resolve, reject) => {
                let settled = false;
                const finish = (error, value) => {
                    if (settled) return;
                    settled = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel);
                    stop(); if (error) reject(error); else resolve(value);
                };
                const cancel = () => finish(fail('CANCELLED'));
                signal?.addEventListener('abort', cancel, {once: true});
                timer = setTimeout(() => finish(fail('EXTERNAL_PROBE_TIMEOUT')), Math.max(1, deadline - now()));
                const transport = destination.protocol === 'https:' ? https : http;
                try {
                    request = transport.request(destination, {method: 'GET', agent: false, rejectUnauthorized: true,
                        headers: {Range: range, 'User-Agent': userAgent, 'Accept-Encoding': 'identity'}});
                    counts.requestCreatedCount = 1;
                    requestClosed = new Promise(resolve => request.once('close', resolve));
                    request.once('response', incoming => {
                        counts.headersObserved = 1;
                        response = incoming;
                        const status = incoming.statusCode;
                        let redirectOrigin = null;
                        if (status >= 300 && status < 400) {
                            try {
                                if (typeof incoming.headers.location !== 'string' || !incoming.headers.location) throw new Error('NO_LOCATION');
                                const next = new URL(incoming.headers.location, destination);
                                if (['https:', 'http:'].includes(next.protocol)) redirectOrigin = next.origin;
                            } catch { /* No raw Location or parser errors leave this scope. */ }
                        }
                        const integer = v => typeof v === 'string' && /^\d{1,16}$/.test(v) && Number.isSafeInteger(Number(v)) ? Number(v) : null;
                        const type = (incoming.headers['content-type'] || '').split(';', 1)[0].toLowerCase();
                        const encoding = (incoming.headers['content-encoding'] || 'identity').trim().toLowerCase();
                        const kind = /mpegurl|dash\+xml/.test(type) ? 'PLAYLIST' : type.startsWith('video/') ? 'VIDEO' :
                            type.startsWith('audio/') ? 'AUDIO' : type === 'application/octet-stream' ? 'BYTES' : 'OTHER';
                        const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(incoming.headers['content-range'] || '');
                        let contentRange = null;
                        if (match) {
                            const [a, b, total] = match.slice(1).map(integer);
                            if (a !== null && b !== null && total !== null && a <= b && b < total) contentRange = {start: a, end: b, total};
                        }
                        finish(null, {result: status >= 300 && status < 400 ? 'EXTERNAL_PROBE_REDIRECT_STOPPED' : 'EXTERNAL_PROBE_HEADERS_ONLY',
                            origin: approved.origin, status, kind, contentEncoding: encoding === 'identity' ? 'IDENTITY' : 'OTHER',
                            contentLength: integer(incoming.headers['content-length']), contentRange,
                            redirectOrigin, requestCount: 1, bodyRead: false, sourceExpiry: expiresAt === undefined ? 'UNKNOWN' : 'PROVIDED',
                            nativePlayback: 'NOT_TESTED', seek: 'NOT_PROVEN'});
                    });
                    request.once('error', () => finish(fail(signal?.aborted ? 'CANCELLED' : 'EXTERNAL_PROBE_NETWORK_ERROR')));
                    if (signal?.aborted) cancel(); else {
                        // Count dispatch attempts, including a synchronous end error.
                        // This does not claim server receipt or zero TCP bytes before end.
                        counts.actualHttpRequestCount = 1;
                        request.end();
                    }
                } catch { finish(fail('EXTERNAL_PROBE_REQUEST_FAILED')); }
            });
        } finally {
            clearTimeout(timer); stop();
            if (requestClosed) {
                let closeTimer;
                try {
                    await Promise.race([requestClosed, new Promise((_, reject) => {
                        closeTimer = setTimeout(() => reject(fail('EXTERNAL_PROBE_CLOSE_UNCONFIRMED')), 1000);
                    })]);
                } finally { clearTimeout(closeTimer); }
            }
        }
    }};
}
module.exports = {createExternalHeaderProbe, describeUserAgent};
