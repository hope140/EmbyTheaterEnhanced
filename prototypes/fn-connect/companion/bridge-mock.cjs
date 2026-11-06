'use strict';

// Original ETE simulation. No sockets, HTTP client, FNID resolver, credentials,
// fnOS APIs or real gateway authorization exist in this module.
const example = require('./config.mock.json');
function freezeTree(value) {
    for (const child of Object.values(value)) if (child && typeof child === 'object') freezeTree(child);
    return Object.freeze(value);
}
freezeTree(example);
const methods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const headerName = /^[!#$%&'*+.^_`|~0-9a-z-]+$/i;
const hopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailer', 'transfer-encoding', 'upgrade', 'host']);

function failure(code) { const error = new Error(code); error.code = code; return error; }

function validateConfig(input = example) {
    // Strict mock-only schema: no URL, account, token, mount, system permission
    // or production target can accidentally enter a review package.
    function match(value, expected) {
        if (!expected || typeof expected !== 'object') return value === expected;
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
        const keys = Object.keys(expected);
        return Object.keys(value).length === keys.length && keys.every(key =>
            Object.hasOwn(value, key) && match(value[key], expected[key]));
    }
    if (!match(input, example)) throw failure('MOCK_CONFIG_REQUIRED');
    return JSON.parse(JSON.stringify(example));
}

function targetPath(path, prefix) {
    if (typeof path !== 'string' || /[\x00-\x20\x7f\\#]/.test(path)) throw failure('INVALID_PATH');
    if (!path.startsWith('/') || path.startsWith('//')) throw failure('OUTSIDE_MAPPING');
    const question = path.indexOf('?');
    const pathname = question < 0 ? path : path.slice(0, question);
    const query = question < 0 ? '' : path.slice(question);
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { throw failure('INVALID_PATH'); }
    if (/%2f|%5c|%3f|%23/i.test(pathname) || /[\x00-\x1f\x7f%\\]/.test(decoded) || decoded.includes('//') ||
        decoded.split('/').some(segment => segment === '.' || segment === '..')) throw failure('INVALID_PATH');
    if (pathname !== prefix && !pathname.startsWith(prefix + '/')) throw failure('OUTSIDE_MAPPING');
    return (pathname.slice(prefix.length) || '/') + query;
}

function upstreamHeaders(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw failure('INVALID_HEADERS');
    const entries = Object.entries(input);
    if (entries.some(([key, value]) => !headerName.test(key) || typeof value !== 'string' || /[\r\n\0]/.test(value))) {
        throw failure('INVALID_HEADERS');
    }
    const connection = entries.filter(([key]) => key.toLowerCase() === 'connection')
        .flatMap(([, value]) => value.split(',').map(part => part.trim().toLowerCase()));
    const blocked = new Set([...hopHeaders, ...connection]);
    const result = Object.create(null);
    for (const [key, value] of entries) {
        const lower = key.toLowerCase();
        if (blocked.has(lower) || lower === 'cookie' || lower === 'forwarded' ||
            /^(x-access-|x-fnos-|x-trim-|x-forwarded-)/.test(lower)) continue;
        result[key] = value;
    }
    return result;
}

function createMockBridge({config, activateMock = false, upstream} = {}) {
    const snapshot = validateConfig(config);
    const lifetime = new AbortController();
    return Object.freeze({
        close() { lifetime.abort(); },
        async forward({gatewayAuthorized = false, method, path, headers, body} = {}, {signal} = {}) {
            if (activateMock !== true) throw failure('BRIDGE_DISABLED');
            if (lifetime.signal.aborted) throw failure('BRIDGE_CLOSED');
            if (signal?.aborted) throw failure('REQUEST_ABORTED');
            // This boolean is a TEST INPUT, never a real authorization check.
            if (gatewayAuthorized !== true) throw failure('MOCK_GATEWAY_AUTH_REQUIRED');
            if (!methods.has(method)) throw failure('METHOD_UNSUPPORTED');
            const request = {method, path: targetPath(path, snapshot.mapping.prefix),
                headers: upstreamHeaders(headers), body};
            if (typeof upstream !== 'function') throw failure('MOCK_UPSTREAM_REQUIRED');
            const controller = new AbortController();
            const abort = () => controller.abort();
            lifetime.signal.addEventListener('abort', abort, {once: true});
            signal?.addEventListener('abort', abort, {once: true});
            try {
                let response;
                try { response = await upstream(request, {signal: controller.signal}); }
                catch {
                    if (lifetime.signal.aborted) throw failure('BRIDGE_CLOSED');
                    throw failure(controller.signal.aborted ? 'REQUEST_ABORTED' : 'MOCK_UPSTREAM_FAILED');
                }
                if (lifetime.signal.aborted) throw failure('BRIDGE_CLOSED');
                if (controller.signal.aborted) throw failure('REQUEST_ABORTED');
                return response;
            } finally {
                lifetime.signal.removeEventListener('abort', abort);
                signal?.removeEventListener('abort', abort);
            }
        },
        upgrade() { throw failure('WEBSOCKET_NOT_IMPLEMENTED'); }
    });
}

module.exports = {validateConfig, createMockBridge, targetPath, upstreamHeaders};
