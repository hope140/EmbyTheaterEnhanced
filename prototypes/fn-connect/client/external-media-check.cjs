'use strict';

// Explicit one-shot handoff. Raw source/UA stay inside the main process only.
const {url: parseUrl, rejectCredentialRedirect, fail} = require('./policy.cjs');
const {describeUserAgent} = require('./external-header-probe.cjs');
function installExternalMediaCheck(session, base, {approvedOrigin, mode = 'live', ownerId, probe,
    onReport = () => {}, signal, timeoutMs = 180000, closeTimeoutMs = 1000, schedule = setTimeout, unschedule = clearTimeout} = {}) {
    const target = parseUrl(base, mode), approved = parseUrl(approvedOrigin, mode);
    if (!Number.isInteger(ownerId) || ownerId <= 0 || target.search || !target.pathname.endsWith('/') ||
        approved.pathname !== '/' || approved.search || approved.origin === target.origin ||
        !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 180000 || !Number.isInteger(closeTimeoutMs) ||
        closeTimeoutMs < 1 || closeTimeoutMs > 10000 || typeof probe?.run !== 'function') throw fail('EXTERNAL_CHECK_CONFIG_INVALID');
    if (signal?.aborted) throw fail('CANCELLED');
    const filter = {urls: ['<all_urls>']}, abort = new AbortController();
    let ended = false, disposed = false, terminal = false, active, timer, sourceId, externalId, linkRequests = 0;
    let closeWork, initialCloseWork, sourceAgent, held = false, initializing = true;
    let sourceCaptured = false, probeInvoked = 0;
    const budgetSnapshot = () => {
        let observed;
        try { observed = probe.snapshot?.(); } catch {}
        const count = name => {
            let value;
            try { value = observed?.[name]; } catch {}
            return value === 0 || value === 1 ? value : probeInvoked === 0 ? 0 : null;
        };
        return Object.freeze({scope: 'INDEPENDENT_HEADER_PROBE', countBasis: 'REQUEST_END_ATTEMPT',
            probeStarted: count('probeStarted') ?? probeInvoked,
            requestCreatedCount: count('requestCreatedCount'), actualHttpRequestCount: count('actualHttpRequestCount'),
            headersObserved: count('headersObserved'), sourceCaptured, terminal});
    };
    const owned = d => d.webContentsId === ownerId;
    const report = value => { if (!disposed) { try { onReport(Object.freeze({...value, budget: budgetSnapshot()})); } catch {} } };
    const boundedClose = phase => {
        let work;
        try { work = Promise.resolve(session.closeAllConnections()); } catch { work = Promise.reject(); }
        let deadline;
        const pending = Promise.race([work, new Promise((_, reject) => {
            deadline = setTimeout(() => reject(fail('EXTERNAL_BROWSER_CLOSE_UNCONFIRMED')), closeTimeoutMs);
        })]).then(() => report({event: 'cleanup', scope: 'BROWSER_SESSION', phase, result: 'MEDIA_CHECK_CONNECTIONS_CLOSED'}), () => {
            report({event: 'cleanup', scope: 'BROWSER_SESSION', phase, result: 'MEDIA_CHECK_CLOSE_UNCONFIRMED'});
            throw fail('EXTERNAL_BROWSER_CLOSE_UNCONFIRMED');
        }).finally(() => clearTimeout(deadline));
        pending.catch(() => {});
        return pending;
    };
    const close = () => {
        if (!closeWork) closeWork = initializing && initialCloseWork ? initialCloseWork : boundedClose('HANDOFF');
        return closeWork;
    };
    async function waitClosed(work = close()) {
        let cancel;
        try {
            await Promise.race([work, new Promise((_, reject) => {
                cancel = () => reject(fail('CANCELLED'));
                abort.signal.addEventListener('abort', cancel, {once: true});
                if (abort.signal.aborted) cancel();
            })]);
        } finally { abort.signal.removeEventListener('abort', cancel); }
    }
    function finish(value) {
        if (terminal || disposed || ended) return;
        terminal = true; ended = true; unschedule(timer); abort.abort();
        sourceAgent = undefined;
        close(); report({event: 'terminal', source: 'EXTERNAL_ONCE', ...value});
    }
    function blocked(d, reason) {
        let origin;
        try { const u = new URL(d.url); if (['http:', 'https:'].includes(u.protocol)) origin = u.origin; } catch {}
        report({event: 'diagnostic', result: 'MEDIA_CHECK_EXTERNAL_BLOCKED', scheme: origin ? new URL(origin).protocol === 'https:' ? 'HTTPS' : 'HTTP' : 'OTHER',
            resourceType: d.resourceType === 'media' ? 'media' : 'other', blockReason: reason, ...(origin ? {origin} : {})});
    }
    function trusted(u) {
        return u.origin === target.origin && u.pathname.startsWith(target.pathname) && !/%(?:2f|5c|2e)/i.test(u.pathname);
    }
    const header = (headers, name) => {
        const keys = Object.keys(headers || {}).filter(key => key.toLowerCase() === name);
        return keys.length === 1 ? headers[keys[0]] : undefined;
    };
    const onceReply = callback => {
        let sent = false;
        return value => { if (!sent) { sent = true; callback(value); } };
    };
    function consume(sourceUrl, userAgent, uaSource) {
        held = true; sourceAgent = undefined;
        sourceCaptured = true;
        const uaMetadata = describeUserAgent(userAgent);
        report({event: 'diagnostic', result: 'MEDIA_CHECK_UA_METADATA', resourceType: 'media', uaSource, uaMetadata});
        const input = {sourceUrl, userAgent, signal: abort.signal};
        active = (async () => {
            try {
                await waitClosed();
                if (abort.signal.aborted) throw fail('CANCELLED');
                probeInvoked = 1;
                const result = await probe.run(input);
                const partial = result.status === 206 && result.contentEncoding === 'IDENTITY' && ['VIDEO', 'AUDIO', 'BYTES'].includes(result.kind) &&
                    result.contentRange !== null && result.contentRange.start === 0 && result.contentRange.end === 0 &&
                    (result.contentLength === null || result.contentLength === 1);
                finish({result: result.kind === 'PLAYLIST' ? 'MEDIA_CHECK_PLAYLIST_UNSUPPORTED' : partial ? 'MEDIA_CHECK_PARTIAL_HEADERS_OBSERVED' : 'MEDIA_CHECK_HEADERS_ONLY',
                    external: result, partial, uaSource, uaMetadata, browserRequestCancelled: true, bodyRead: false, nativePlayback: 'NOT_TESTED', seek: 'NOT_PROVEN'});
            } catch (error) {
                const allowed = new Set(['CANCELLED', 'EXTERNAL_PROBE_UA_UNCONFIRMED', 'EXTERNAL_PROBE_UA_REJECTED', 'EXTERNAL_PROBE_SOURCE_EXPIRED',
                    'CREDENTIAL_REDIRECT_BLOCKED', 'EXTERNAL_PROBE_PROXY_UNSUPPORTED', 'EXTERNAL_PROBE_PROXY_UNVERIFIED', 'EXTERNAL_PROBE_TIMEOUT',
                    'EXTERNAL_PROBE_NETWORK_ERROR', 'EXTERNAL_PROBE_REQUEST_FAILED', 'EXTERNAL_PROBE_CLOSE_UNCONFIRMED', 'EXTERNAL_BROWSER_CLOSE_UNCONFIRMED']);
                finish({result: 'MEDIA_CHECK_METADATA_INVALID', externalResult: allowed.has(error?.code) ? error.code : 'EXTERNAL_CHECK_FAILED',
                    uaSource, uaMetadata, browserRequestCancelled: true, bodyRead: false});
            } finally { input.sourceUrl = undefined; input.userAgent = undefined; }
        })();
    }
    session.webRequest.onBeforeRequest(filter, (d, respond) => {
        const callback = onceReply(respond);
        if (initializing || ended || disposed || !owned(d) || held) return callback({cancel: true});
        try {
            const u = parseUrl(d.url, mode);
            if (externalId !== undefined) return callback({cancel: true});
            if (trusted(u)) {
                if (sourceId !== undefined && d.id !== sourceId) return callback({cancel: true});
                if (d.resourceType === 'media') {
                    if (d.method !== 'GET' || !Number.isInteger(d.id)) return callback({cancel: true});
                    sourceId = d.id;
                }
                if (/\/PlaybackInfo\/?$/i.test(u.pathname)) {
                    if (++linkRequests > 1) return callback({cancel: true});
                }
                return callback({cancel: false});
            }
            const provenance = d.initiatorOrigin === target.origin || sourceId !== undefined && d.id === sourceId;
            if (u.origin !== approved.origin || d.resourceType !== 'media' || d.method !== 'GET' || !Number.isInteger(d.id) || !provenance) {
                if (provenance && d.resourceType === 'media' && d.method === 'GET' && Number.isInteger(d.id)) held = true;
                blocked(d, u.origin !== approved.origin ? 'ORIGIN_MISMATCH' : 'SOURCE_CONTEXT_UNCONFIRMED');
                return callback({cancel: true});
            }
            rejectCredentialRedirect(u, []);
            externalId = d.id; // Latch before allowing only this request to the header interception stage.
            callback({cancel: false});
        } catch {
            if (d.resourceType === 'media' && d.method === 'GET' && Number.isInteger(d.id) &&
                (d.initiatorOrigin === target.origin || sourceId !== undefined && d.id === sourceId)) held = true;
            blocked(d, 'INVALID_SOURCE'); callback({cancel: true});
        }
    });
    session.webRequest.onBeforeSendHeaders(filter, (d, respond) => {
        const callback = onceReply(respond);
        if (initializing || ended || disposed || !owned(d) || held) return callback({cancel: true});
        try {
            const u = parseUrl(d.url, mode);
            if (externalId === undefined && trusted(u) && (sourceId === undefined || sourceId === d.id) &&
                (d.resourceType !== 'media' || sourceId === d.id)) {
                if (d.resourceType === 'media') sourceAgent = header(d.requestHeaders, 'user-agent');
                return callback({cancel: false});
            }
            // Cancel BEFORE reading UA or starting any independent request.
            callback({cancel: true});
            if (d.id !== externalId || u.origin !== approved.origin || d.resourceType !== 'media' || d.method !== 'GET') return;
            consume(d.url, header(d.requestHeaders, 'user-agent'), 'DIRECT_REQUEST_HEADER');
        } catch { callback({cancel: true}); finish({result: 'MEDIA_CHECK_METADATA_INVALID', externalResult: 'EXTERNAL_CHECK_FAILED', bodyRead: false}); }
    });
    session.webRequest.onHeadersReceived(filter, (d, respond) => {
        const callback = onceReply(respond);
        if (initializing || ended || disposed || !owned(d) || held || externalId !== undefined) return callback({cancel: true});
        try {
            const u = parseUrl(d.url, mode);
            if (!trusted(u)) return callback({cancel: true});
            const typeKey = Object.keys(d.responseHeaders || {}).find(key => key.toLowerCase() === 'content-type');
            const rawType = typeKey === undefined ? '' : d.responseHeaders[typeKey];
            const kind = Array.isArray(rawType) ? rawType[0] : rawType;
            const media = d.resourceType === 'media' || /^(?:video\/|audio\/|application\/octet-stream)|mpegurl|dash\+xml/i.test(kind || '') || [206, 416].includes(d.statusCode);
            if (media && (sourceId !== d.id || d.resourceType !== 'media')) { blocked(d, 'UNTRACKED_MEDIA_RESPONSE'); return callback({cancel: true}); }
            if (sourceId === d.id && d.resourceType === 'media') {
                callback({cancel: true});
                if ([301, 302, 303, 307, 308].includes(d.statusCode)) {
                    held = true;
                    const key = Object.keys(d.responseHeaders || {}).find(key => key.toLowerCase() === 'location');
                    const raw = key === undefined ? undefined : d.responseHeaders[key];
                    const location = Array.isArray(raw) ? raw[0] : raw;
                    if (typeof location !== 'string' || !location) throw fail('INVALID_LOCATION');
                    const destination = parseUrl(new URL(location, d.url).href, mode);
                    if (destination.origin !== approved.origin) { blocked({url: destination.href, resourceType: 'media'}, 'REDIRECT_TARGET_UNAPPROVED'); return; }
                    rejectCredentialRedirect(destination, []);
                    consume(destination.href, sourceAgent, 'EMBY_MEDIA_REQUEST');
                    return;
                }
                finish({result: /mpegurl|dash\+xml/i.test(kind || '') ? 'MEDIA_CHECK_PLAYLIST_UNSUPPORTED' : 'MEDIA_CHECK_HEADERS_ONLY',
                    externalResult: 'SAME_ORIGIN_MEDIA_STOPPED', status: Number.isInteger(d.statusCode) ? d.statusCode : 0, bodyRead: false});
            } else callback({cancel: false});
        } catch { callback({cancel: true}); finish({result: 'MEDIA_CHECK_METADATA_INVALID', bodyRead: false}); }
    });
    const freeze = () => { ended = true; held = true; sourceAgent = undefined; abort.abort(); unschedule(timer); close(); };
    signal?.addEventListener('abort', freeze, {once: true});
    const ready = (async () => {
        initialCloseWork = boundedClose('INITIAL');
        try {
            await waitClosed(initialCloseWork);
            if (ended || disposed || abort.signal.aborted) throw fail('CANCELLED');
            initializing = false;
            timer = schedule(() => finish({result: 'MEDIA_CHECK_TIMEOUT', bodyRead: false}), timeoutMs); timer?.unref?.();
        } catch (error) {
            finish({result: 'MEDIA_CHECK_METADATA_INVALID', externalResult: error?.code === 'CANCELLED' ? 'CANCELLED' : 'EXTERNAL_BROWSER_CLOSE_UNCONFIRMED', bodyRead: false});
            throw error;
        }
    })();
    ready.catch(() => {});
    return {
        ready, freeze, snapshotBudget: budgetSnapshot,
        async drain() { await ready.catch(() => {}); await active; await initialCloseWork; await closeWork; },
        prepare() { throw fail('EXTERNAL_ONESHOT_RETIRED'); },
        rearm() { throw fail('EXTERNAL_ONESHOT_RETIRED'); },
        dispose() {
            freeze(); disposed = true; signal?.removeEventListener('abort', freeze);
            session.webRequest.onBeforeRequest(null); session.webRequest.onBeforeSendHeaders(null); session.webRequest.onHeadersReceived(null);
        }
    };
}
module.exports = {installExternalMediaCheck};
