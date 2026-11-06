'use strict';

// One user-armed response-header check. The existing Emby web UI performs its
// own login/request; this module never reads credentials, request headers,
// upload data, DOM, storage, media URLs into logs, or response bodies.
function installMediaCheck(session, base, {onReport = () => {}, ownerId, timeoutMs = 180000, schedule = setTimeout, unschedule = clearTimeout} = {}) {
    const target = new URL(base);
    if (target.username || target.password || target.search || target.hash || !target.pathname.endsWith('/') ||
        target.protocol !== 'https:' && !(target.protocol === 'http:' && target.hostname === '127.0.0.1')) throw new Error('MEDIA_CHECK_TARGET_INVALID');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 180000) throw new Error('MEDIA_CHECK_TIMEOUT_INVALID');
    if (ownerId !== undefined && (!Number.isInteger(ownerId) || ownerId <= 0)) throw new Error('MEDIA_CHECK_OWNER_INVALID');
    let ended = false, disposed = false, prepared = false, terminal = false, closureConfirmed = true;
    let notify = onReport, draining = Promise.resolve(), timer;
    let owner = ownerId;
    const owned = details => owner === undefined || details.webContentsId === owner;
    const filter = {urls: ['<all_urls>']};
    const report = value => { if (!disposed) { try { notify(Object.freeze(value)); } catch { /* No diagnostic exceptions escape. */ } } };
    const failure = code => Object.assign(new Error(code), {code});
    // Finite categories plus HTTP(S) origin only; no path, query, userinfo,
    // fragment or raw custom scheme is reported.
    const schemes = new Map([['http:', 'HTTP'], ['https:', 'HTTPS'], ['ws:', 'WS'], ['wss:', 'WSS'],
        ['blob:', 'BLOB'], ['data:', 'DATA'], ['about:', 'ABOUT'], ['chrome-extension:', 'CHROME_EXTENSION'],
        ['chrome:', 'CHROME_INTERNAL'], ['chrome-error:', 'CHROME_ERROR'], ['devtools:', 'DEVTOOLS'],
        ['file:', 'FILE'], ['filesystem:', 'FILESYSTEM'], ['javascript:', 'JAVASCRIPT']]);
    const resources = new Set(['mainFrame', 'subFrame', 'stylesheet', 'script', 'image', 'font',
        'object', 'xhr', 'ping', 'cspReport', 'media', 'webSocket', 'other']);
    function diagnostic(result, details, url, reason = 'INVALID_URL') {
        report({event: 'diagnostic', result, scheme: url ? schemes.get(url.protocol) || 'OTHER' : 'INVALID',
            resourceType: resources.has(details.resourceType) ? details.resourceType : 'other', blockReason: reason,
            ...(url && ['https:', 'http:'].includes(url.protocol) ? {origin: url.origin} : {})});
    }
    const integer = value => /^\d{1,16}$/.test(value || '') && Number.isSafeInteger(Number(value)) ? Number(value) : null;
    function header(headers, name) {
        const key = Object.keys(headers || {}).find(key => key.toLowerCase() === name);
        const value = key === undefined ? '' : headers[key];
        return typeof value === 'string' ? value : Array.isArray(value) && typeof value[0] === 'string' ? value[0] : '';
    }
    function classify(value) {
        const type = value.split(';', 1)[0].trim().toLowerCase();
        return /mpegurl|dash\+xml/.test(type) ? 'PLAYLIST' : type.startsWith('video/') ? 'VIDEO' :
            type.startsWith('audio/') ? 'AUDIO' : type === 'application/octet-stream' ? 'BYTES' : type === 'text/html' ? 'HTML' : 'OTHER';
    }
    function parseRange(value) {
        const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(value);
        if (match) {
            const start = integer(match[1]), end = integer(match[2]), total = integer(match[3]);
            if (start !== null && end !== null && total !== null && start <= end && end < total) return {start, end, total};
        }
        return null;
    }
    function blockReason(value) {
        const url = new URL(value);
        if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) return 'SCHEME_UNSUPPORTED';
        if (url.username || url.password) return 'URL_CREDENTIALS';
        if (url.protocol === 'wss:') url.protocol = 'https:';
        else if (url.protocol === 'ws:') url.protocol = 'http:';
        if (url.origin !== target.origin) return 'ORIGIN_MISMATCH';
        if (!url.pathname.startsWith(target.pathname)) return 'PATH_OUT_OF_SCOPE';
        return /%(?:2f|5c|2e)/i.test(url.pathname) ? 'PATH_ENCODING_INVALID' : null;
    }
    const sameTarget = value => blockReason(value) === null;
    function finish(value) {
        if (ended || disposed) return;
        ended = true; terminal = true; unschedule(timer);
        // Do not let the web client's retry/fallback start another stream.
        // The guard continues to deny new requests until the profile is removed.
        const cleanup = result => report({event: 'cleanup', result});
        let pending;
        try { pending = Promise.resolve(session.closeAllConnections()); }
        catch { pending = Promise.reject(failure('MEDIA_CHECK_CLOSE_UNCONFIRMED')); }
        draining = pending.then(() => { closureConfirmed = true; cleanup('MEDIA_CHECK_CONNECTIONS_CLOSED'); },
            () => { closureConfirmed = false; cleanup('MEDIA_CHECK_CLOSE_UNCONFIRMED'); });
        report({event: 'terminal', ...value});
    }
    function arm() { timer = schedule(() => finish({result: 'MEDIA_CHECK_TIMEOUT'}), timeoutMs); timer?.unref?.(); }
    arm();
    session.webRequest.onBeforeRequest(filter, (details, callback) => {
        if (ended || disposed || !owned(details)) { callback({cancel: true}); return; }
        try {
            const url = new URL(details.url);
            if (['data:', 'blob:', 'about:'].includes(url.protocol)) { callback({cancel: false}); return; }
            const reason = blockReason(details.url);
            if (reason) diagnostic('MEDIA_CHECK_EXTERNAL_BLOCKED', details, url, reason);
            callback({cancel: reason !== null});
        } catch { diagnostic('MEDIA_CHECK_INVALID_TARGET', details); callback({cancel: true}); }
    });
    session.webRequest.onHeadersReceived(filter, (details, callback) => {
        if (ended || disposed || !owned(details)) { callback({cancel: true}); return; }
        try {
            if (!sameTarget(details.url)) { callback({cancel: true}); return; }
            // Redirects can continue only through onBeforeRequest's origin gate.
            if (details.statusCode >= 300 && details.statusCode < 400) { callback({cancel: false}); return; }
            const kind = classify(header(details.responseHeaders, 'content-type'));
            const candidate = details.resourceType === 'media' || ['VIDEO', 'AUDIO', 'BYTES', 'PLAYLIST'].includes(kind) || [206, 416].includes(details.statusCode);
            if (!candidate) { callback({cancel: false}); return; }
            const range = parseRange(header(details.responseHeaders, 'content-range'));
            const contentLength = integer(header(details.responseHeaders, 'content-length'));
            const partial = details.statusCode === 206 && ['VIDEO', 'AUDIO', 'BYTES'].includes(kind) && range !== null &&
                (contentLength === null || contentLength === range.end - range.start + 1);
            callback({cancel: true});
            finish({result: kind === 'PLAYLIST' ? 'MEDIA_CHECK_PLAYLIST_UNSUPPORTED' : partial ? 'MEDIA_CHECK_PARTIAL_HEADERS_OBSERVED' : 'MEDIA_CHECK_HEADERS_ONLY',
                status: Number.isInteger(details.statusCode) ? details.statusCode : 0, kind, contentLength,
                range: range || null, partial, responseCancelled: true, bodyRead: false,
                nativePlayback: 'NOT_TESTED', seek: 'NOT_PROVEN'});
        } catch { callback({cancel: true}); finish({result: 'MEDIA_CHECK_METADATA_INVALID'}); }
    });
    return {
        async prepare() {
            if (disposed || !terminal) throw failure('MEDIA_CHECK_NOT_TERMINAL');
            await draining;
            if (disposed) throw failure('MEDIA_CHECK_RETIRED');
            if (!closureConfirmed) throw failure('MEDIA_CHECK_CLOSE_UNCONFIRMED');
            prepared = true;
        },
        rearm(onReport, ownerId) {
            if (disposed || !prepared || !ended) throw failure('MEDIA_CHECK_NOT_PREPARED');
            if (typeof onReport !== 'function') throw failure('MEDIA_CHECK_CALLBACK_INVALID');
            notify = onReport; owner = ownerId; prepared = false; terminal = false; ended = false; arm();
        },
        freeze() { ended = true; prepared = false; unschedule(timer); },
        dispose() {
            if (disposed) return;
            disposed = true; ended = true; unschedule(timer);
            session.webRequest.onBeforeRequest(null);
            session.webRequest.onHeadersReceived(null);
        }
    };
}
module.exports = {installMediaCheck};
