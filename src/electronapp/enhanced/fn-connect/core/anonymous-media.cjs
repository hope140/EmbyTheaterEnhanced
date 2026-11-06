'use strict';

const http = require('node:http');
const https = require('node:https');
const {PassThrough} = require('node:stream');
const policy = require('./policy.cjs');
const {describeUserAgent} = require('./external-header-probe.cjs');
const responseHeaders = new Set(['content-type', 'content-length', 'content-range', 'accept-ranges',
    'etag', 'last-modified', 'cache-control', 'content-encoding']);
const redirectStatuses = new Set([301, 302, 303, 307, 308]);

// Optional streaming consumer for the existing authenticated media bridge.
// Each request uses new Node request state, no cookie jar/auth/referrer and no
// global agent. It does not invoke the header-only trial or refresh a URL.
function createAnonymousMedia({enabled = false, mode = 'live', resolveProxy, environment = process.env,
    timeoutMs = 10000, maxRedirects = 3, closeTimeoutMs = 1000, now = Date.now} = {}) {
    if (!enabled) return {open: async () => { throw policy.fail('ANONYMOUS_MEDIA_DISABLED'); }};
    if (!['live', 'fixture'].includes(mode) || typeof resolveProxy !== 'function' ||
        !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000 ||
        !Number.isInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 3 ||
        !Number.isInteger(closeTimeoutMs) || closeTimeoutMs < 1 || closeTimeoutMs > 1000) throw policy.fail('ANONYMOUS_MEDIA_CONFIG_INVALID');
    return {async open({url, method = 'GET', allowedOrigins, forbiddenOrigins = [], headers = {}, knownSecrets = [], signal} = {}) {
        if (!['GET', 'HEAD'].includes(method)) throw policy.fail('ANONYMOUS_MEDIA_METHOD_INVALID');
        if (!Array.isArray(allowedOrigins) || !allowedOrigins.length || !Array.isArray(forbiddenOrigins) ||
            !Array.isArray(knownSecrets) || knownSecrets.some(value => typeof value !== 'string')) throw policy.fail('ANONYMOUS_MEDIA_SCOPE_INVALID');
        const forbidden = new Set(forbiddenOrigins), allowed = new Set();
        for (const value of allowedOrigins) {
            const u = policy.url(value, mode);
            if (u.pathname !== '/' || u.search || forbidden.has(u.origin)) throw policy.fail('ANONYMOUS_MEDIA_SCOPE_INVALID');
            allowed.add(u.origin);
        }
        const checked = value => {
            const u = policy.url(value, mode);
            if (!allowed.has(u.origin) || forbidden.has(u.origin)) throw policy.fail('EXTERNAL_REDIRECT_REVIEW_REQUIRED');
            policy.rejectCredentialRedirect(u, knownSecrets);
            return u;
        };
        let destination = checked(url);
        const lower = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
        const ua = lower['user-agent'];
        if (!['VALID', 'VALID_COMMENT_COMMA'].includes(describeUserAgent(ua).validation) ||
            knownSecrets.some(value => value && ua.includes(value))) throw policy.fail('ANONYMOUS_MEDIA_UA_UNCONFIRMED');
        if (lower['if-range'] !== undefined) throw policy.fail('ANONYMOUS_MEDIA_IF_RANGE_UNSUPPORTED');
        const outgoing = {'User-Agent': ua, 'Accept-Encoding': 'identity'};
        if (lower.range !== undefined) {
            if (typeof lower.range !== 'string' || !/^bytes=\d{1,16}-\d{0,16}$/.test(lower.range)) throw policy.fail('ANONYMOUS_MEDIA_RANGE_INVALID');
            const [start, end] = lower.range.slice(6).split('-');
            if (!Number.isSafeInteger(Number(start)) || end && (!Number.isSafeInteger(Number(end)) || Number(end) < Number(start))) throw policy.fail('ANONYMOUS_MEDIA_RANGE_INVALID');
            outgoing.Range = lower.range;
        }
        const loopbackFixture = mode === 'fixture' && [...allowed].every(value => new URL(value).hostname === '127.0.0.1');
        if (!loopbackFixture && ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'].some(key => environment[key])) throw policy.fail('ANONYMOUS_MEDIA_PROXY_UNSUPPORTED');
        const deadline = now() + timeoutMs, seen = new Set();
        let request, incoming, body, timer;
        const records = [];
        function track(value) {
            let resolve;
            const record = {value, closed: new Promise(done => { resolve = done; }), waiting: null};
            value.once('close', resolve);
            if (value.closed === true) resolve();
            records.push(record); return record;
        }
        function closeRecord(record) {
            record.value.destroy();
            if (!record.waiting) record.waiting = (async () => {
                let clock;
                try { await Promise.race([record.closed, new Promise((_, reject) => {
                    clock = setTimeout(() => reject(policy.fail('ANONYMOUS_MEDIA_CLOSE_UNCONFIRMED')), closeTimeoutMs);
                })]); } finally { clearTimeout(clock); }
            })();
            record.waiting.catch(() => {});
            return record.waiting;
        }
        const drain = () => Promise.all(records.map(closeRecord)).then(() => {});
        const stop = () => { request?.destroy(); incoming?.destroy(); body?.destroy(); };
        const cancelled = () => { body?.destroy(policy.fail('CANCELLED')); stop(); };
        const remaining = () => {
            if (signal?.aborted) throw policy.fail('CANCELLED');
            const left = deadline - now();
            if (left <= 0) throw policy.fail('ANONYMOUS_MEDIA_TIMEOUT');
            return left;
        };
        const route = async () => {
            let cancel, clock;
            try {
                return await Promise.race([Promise.resolve().then(() => resolveProxy(destination.href)),
                    new Promise((_, reject) => {
                        clock = setTimeout(() => reject(policy.fail('ANONYMOUS_MEDIA_TIMEOUT')), remaining());
                        cancel = () => reject(policy.fail('CANCELLED'));
                        signal?.addEventListener('abort', cancel, {once: true});
                        if (signal?.aborted) cancel();
                    })]);
            } finally { clearTimeout(clock); signal?.removeEventListener('abort', cancel); }
        };
        try {
            for (let hop = 0; ; hop++) {
                remaining();
                if (seen.has(destination.href)) throw policy.fail('REDIRECT_LOOP');
                seen.add(destination.href);
                if (await route() !== 'DIRECT') throw policy.fail('ANONYMOUS_MEDIA_PROXY_UNSUPPORTED');
                remaining();
                const hopResult = await new Promise((resolve, reject) => {
                    let settled = false;
                    let record;
                    const abort = () => {
                        request?.destroy();
                        if (!settled) { settled = true; reject(policy.fail('CANCELLED')); }
                    };
                    signal?.addEventListener('abort', abort, {once: true});
                    const finish = (error, value) => {
                        if (settled) { value?.incoming?.destroy(); return; }
                        settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
                        if (error) reject(error); else resolve(value);
                    };
                    try {
                        const transport = destination.protocol === 'https:' ? https : http;
                        request = transport.request(destination, {method, headers: outgoing, agent: false, rejectUnauthorized: true});
                        record = track(request);
                        request.once('response', value => {
                            const observation = {failed: false, body: null};
                            const failed = () => { observation.failed = true; observation.body?.destroy(policy.fail('ANONYMOUS_MEDIA_STREAM_FAILED')); };
                            // Observe terminal events before yielding to the await
                            // continuation. No raw upstream exception crosses it.
                            value.on('error', failed); value.once('aborted', failed);
                            value.once('close', () => { if (!value.complete) failed(); });
                            finish(null, {incoming: value, observation, record});
                        });
                        request.once('error', () => finish(policy.fail('ANONYMOUS_MEDIA_NETWORK_ERROR')));
                        timer = setTimeout(() => { request.destroy(); finish(policy.fail('ANONYMOUS_MEDIA_TIMEOUT')); }, remaining());
                        if (signal?.aborted) abort(); else request.end();
                    } catch { finish(policy.fail('ANONYMOUS_MEDIA_NETWORK_ERROR')); }
                });
                incoming = hopResult.incoming;
                if (hopResult.observation.failed || incoming.aborted || incoming.destroyed) throw policy.fail('ANONYMOUS_MEDIA_STREAM_FAILED');
                remaining();
                const status = incoming.statusCode;
                if (redirectStatuses.has(status)) {
                    const location = incoming.headers.location;
                    incoming.destroy(); await closeRecord(hopResult.record);
                    if (hop >= maxRedirects || typeof location !== 'string' || !location || /[\\\r\n]/.test(location)) throw policy.fail('REDIRECT_REJECTED');
                    destination = checked(new URL(location, destination).href);
                    continue;
                }
                if (status >= 300 && status < 400) throw policy.fail('REDIRECT_REJECTED');
                const safe = {};
                for (const [key, value] of Object.entries(incoming.headers)) if (responseHeaders.has(key)) safe[key] = value;
                body = new PassThrough();
                body.on('error', () => {});
                hopResult.observation.body = body;
                const retire = () => { signal?.removeEventListener('abort', cancelled); request.destroy(); incoming.destroy(); };
                body.once('close', retire);
                signal?.addEventListener('abort', cancelled, {once: true});
                if (signal?.aborted) cancelled(); else incoming.pipe(body);
                return {statusCode: status, headers: safe, body, anonymous: true,
                    dispose() { cancelled(); }, drain};
            }
        } catch (error) {
            clearTimeout(timer); stop();
            await drain();
            if (signal?.aborted) throw policy.fail('CANCELLED');
            const codes = new Set(['EXTERNAL_REDIRECT_REVIEW_REQUIRED', 'CREDENTIAL_REDIRECT_BLOCKED', 'REDIRECT_LOOP', 'REDIRECT_REJECTED',
                'ANONYMOUS_MEDIA_PROXY_UNSUPPORTED', 'ANONYMOUS_MEDIA_TIMEOUT', 'ANONYMOUS_MEDIA_NETWORK_ERROR', 'ANONYMOUS_MEDIA_STREAM_FAILED', 'INVALID_ADDRESS', 'HTTPS_REQUIRED']);
            throw policy.fail(codes.has(error?.code) ? error.code : 'ANONYMOUS_MEDIA_FAILED');
        }
    }};
}
module.exports = {createAnonymousMedia};
