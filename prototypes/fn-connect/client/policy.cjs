'use strict';

const {isIP} = require('node:net');
const {Readable} = require('node:stream');
const allowedHeaders = new Set(['accept', 'content-type', 'range', 'if-range', 'user-agent',
    'authorization', 'x-emby-authorization', 'x-emby-token', 'x-mediabrowser-token']);

function fail(code) { const error = new Error(code); error.code = code; return error; }
function url(value, mode) {
    let parsed;
    try { parsed = new URL(value); } catch { throw fail('INVALID_ADDRESS'); }
    if (typeof value !== 'string' || /[\\\r\n]/.test(value) || parsed.username || parsed.password || parsed.hash) {
        throw fail('INVALID_ADDRESS');
    }
    if (parsed.protocol !== 'https:' && !(mode === 'fixture' && parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1')) {
        throw fail('HTTPS_REQUIRED');
    }
    return parsed;
}
function config(input, mode) {
    if (!input || Object.keys(input).some(key => !['bootstrapUrl', 'embyUrl', 'probePath', 'expectedServerId',
        'authOrigins', 'externalMediaOrigins'].includes(key))) throw fail('INVALID_PROFILE');
    const bootstrap = url(input.bootstrapUrl, mode), emby = url(input.embyUrl, mode);
    if (bootstrap.search || emby.search || /%(?:2f|5c|2e)/i.test(emby.pathname)) throw fail('INVALID_ADDRESS');
    if (!emby.pathname.endsWith('/')) emby.pathname += '/';
    const authOrigins = new Set([bootstrap.origin, emby.origin]);
    for (const item of input.authOrigins || []) {
        const parsed = url(item, mode);
        if (parsed.pathname !== '/' || parsed.search) throw fail('INVALID_AUTH_ORIGIN');
        authOrigins.add(parsed.origin);
    }
    const externalMediaOrigins = new Set();
    for (const item of input.externalMediaOrigins || []) {
        const parsed = url(item, mode);
        if (parsed.pathname !== '/' || parsed.search || parsed.origin === emby.origin ||
            mode !== 'fixture' && (isIP(parsed.hostname.replace(/^\[|\]$/g, '')) ||
                !parsed.hostname.includes('.') || /\.(?:local|internal|localhost)$/i.test(parsed.hostname))) {
            throw fail('INVALID_MEDIA_ORIGIN');
        }
        externalMediaOrigins.add(parsed.origin);
    }
    if (authOrigins.size > 8 || externalMediaOrigins.size > 16) throw fail('TOO_MANY_ORIGINS');
    const result = {bootstrap, emby, authOrigins, externalMediaOrigins,
        probePath: input.probePath || 'System/Info/Public', expectedServerId: input.expectedServerId};
    target(result, result.probePath, mode);
    return result;
}
function target(profile, path, mode) {
    if (typeof path !== 'string' || path.length > 8192 || /[\\\r\n]/.test(path) ||
        /(?:^|\/)(?:\.|%2e){1,2}(?:\/|[?#]|$)/i.test(path)) throw fail('INVALID_PATH');
    const parsed = url(new URL(path, profile.emby).href, mode);
    if (parsed.origin !== profile.emby.origin || !parsed.pathname.startsWith(profile.emby.pathname) ||
        /%(?:2f|5c|2e)/i.test(parsed.pathname)) throw fail('TARGET_OUT_OF_SCOPE');
    return parsed;
}
function headers(input = {}) {
    const output = {};
    for (const [key, value] of Object.entries(input)) {
        const name = key.toLowerCase();
        if (!allowedHeaders.has(name) || typeof value !== 'string' || /[\r\n\x00]/.test(value) || value.length > 16384) {
            throw fail('HEADER_NOT_ALLOWED');
        }
        output[name] = value;
    }
    // Keep byte lengths meaningful for the streaming bridge; compressed replies
    // are separately rejected there rather than guessed to be raw or decoded.
    output['accept-encoding'] = 'identity';
    return output;
}
function wsHeaders(input = {}, origin) {
    const standard = {}, extra = {};
    for (const [key, value] of Object.entries(input)) {
        const name = key.toLowerCase();
        if (['sec-websocket-key', 'sec-websocket-version', 'sec-websocket-protocol', 'sec-websocket-extensions'].includes(name)) {
            if (typeof value !== 'string' || /[\r\n\x00]/.test(value) || value.length > 1024) throw fail('HEADER_NOT_ALLOWED');
            extra[name] = value;
        } else if (name === 'origin') {
            if (value !== origin) throw fail('WS_ORIGIN_NOT_ALLOWED');
            extra.origin = value;
        } else standard[key] = value;
    }
    return {...headers(standard), ...extra};
}
function header(response, name) {
    const value = response.headers?.[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value || '';
}
function challenge(response, profile, mode) {
    if (header(response, 'x-trim-safe-code-challenge')) return 'ACCESS_CODE_REQUIRED';
    if (mode === 'fixture' && header(response, 'x-ete-fn-fixture-auth') === 'required') return 'FN_AUTH_REQUIRED';
    if (response.statusCode >= 300 && response.statusCode < 400 && header(response, 'location')) {
        try {
            const next = new URL(header(response, 'location'), profile.emby);
            if (next.origin === profile.bootstrap.origin && next.pathname === profile.bootstrap.pathname) return 'FN_AUTH_REQUIRED';
        } catch { /* An invalid redirect is handled by the redirect boundary. */ }
    }
    return null;
}
function rejectCredentialRedirect(destination, secrets) {
    let text = destination.href;
    for (let i = 0; i < 3; i++) {
        for (const secret of secrets) if (secret && text.includes(secret)) throw fail('CREDENTIAL_REDIRECT_BLOCKED');
        try { text = decodeURIComponent(text); } catch { break; }
    }
    for (const key of destination.searchParams.keys()) {
        if (/^(?:api_key|x-emby-token|x-mediabrowser-token|entry-token|fnos-token)$/i.test(key)) throw fail('CREDENTIAL_REDIRECT_BLOCKED');
    }
}
function externalRedirect(destination) {
    return {statusCode: 302, headers: {location: destination.href}, body: Readable.from([]), external: true};
}
module.exports = {fail, url, config, target, headers, wsHeaders, header, challenge, rejectCredentialRedirect, externalRedirect};
