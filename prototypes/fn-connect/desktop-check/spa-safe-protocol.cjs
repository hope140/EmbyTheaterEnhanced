'use strict';
// Reimplemented from the recovered diagnostic tests. The original helper bytes
// were not recovered. This module never attaches a debugger or reads a page.
const resourceTypes = new Set(['Document', 'Stylesheet', 'Image', 'Media', 'Font', 'Script', 'XHR', 'Fetch', 'WebSocket', 'Other']);
const errors = new Set(['Error', 'TypeError', 'SyntaxError', 'ReferenceError', 'RangeError', 'URIError', 'EvalError']);
const networkErrors = new Set(['ERR_ABORTED', 'ERR_FAILED', 'ERR_NAME_NOT_RESOLVED', 'ERR_CONNECTION_REFUSED',
    'ERR_CONNECTION_RESET', 'ERR_CONNECTION_CLOSED', 'ERR_TIMED_OUT', 'ERR_CONNECTION_TIMED_OUT',
    'ERR_CERT_AUTHORITY_INVALID', 'ERR_CERT_COMMON_NAME_INVALID', 'ERR_CERT_DATE_INVALID', 'ERR_BLOCKED_BY_CLIENT']);
function origin(value) {
    try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.origin : null; } catch { return null; }
}
function mime(value) {
    const type = typeof value === 'string' ? value.split(';', 1)[0].trim().toLowerCase() : '';
    return type === 'text/html' ? 'HTML' : type === 'application/json' ? 'JSON' :
        ['text/javascript', 'application/javascript'].includes(type) ? 'SCRIPT' :
            type.startsWith('video/') ? 'VIDEO' : type.startsWith('audio/') ? 'AUDIO' : 'OTHER';
}
function sanitize(method, params = {}) {
    try {
        if (method === 'Runtime.exceptionThrown') {
            const d = params.exceptionDetails;
            return {event: 'SCRIPT_EXCEPTION', code: errors.has(d?.exception?.className) ? d.exception.className : 'OTHER_EXCEPTION', origin: origin(d?.url)};
        }
        if (method === 'Runtime.consoleAPICalled') return {event: 'CONSOLE_NOTICE', code: params.type === 'error' ? 'ERROR_PRESENT' : 'NOTICE_PRESENT'};
        if (method === 'Network.responseReceived') {
            const r = params.response;
            return {event: 'RESOURCE_RESPONSE', resourceType: resourceTypes.has(params.type) ? params.type : 'Other',
                status: Number.isInteger(r?.status) && r.status >= 100 && r.status <= 599 ? r.status : null,
                mime: mime(r?.mimeType), origin: origin(r?.url)};
        }
        if (method === 'Network.loadingFailed') {
            const candidate = typeof params.errorText === 'string' && params.errorText.startsWith('net::') ? params.errorText.slice(5) : '';
            return {event: 'RESOURCE_FAILED', resourceType: resourceTypes.has(params.type) ? params.type : 'Other',
                code: networkErrors.has(candidate) ? candidate : 'OTHER_NETWORK_FAILURE'};
        }
    } catch { return {event: 'METADATA_UNAVAILABLE', code: 'SAFE_METADATA_UNAVAILABLE'}; }
    return null;
}
module.exports = {sanitize};
