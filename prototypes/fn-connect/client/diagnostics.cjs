'use strict';

// Finite synthetic diagnostics only. Never accept arbitrary message, URL,
// proxy description, header, cookie or filesystem fields from an exception.
const events = new Set(['SESSION_CREATED', 'REQUEST_CREATED', 'REQUEST_CLOSE_BEFORE_RESPONSE',
    'RESPONSE', 'REDIRECT', 'REQUEST_ERROR', 'REQUEST_SETUP_ERROR', 'PROXY_ROUTE', 'FIXTURE_SNAPSHOT']);
const codes = new Set(['ERR_ABORTED', 'ERR_FAILED', 'ERR_CONNECTION_REFUSED', 'ERR_CONNECTION_RESET',
    'ERR_CONNECTION_CLOSED', 'ERR_CONNECTION_TIMED_OUT', 'ERR_TIMED_OUT', 'ERR_NAME_NOT_RESOLVED',
    'ERR_PROXY_CONNECTION_FAILED', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INVALID_ARGUMENT',
    'ERR_INVALID_ARG_TYPE', 'ERR_INVALID_ARG_VALUE', 'ERR_CERT_AUTHORITY_INVALID',
    'ERR_CERT_COMMON_NAME_INVALID', 'ERR_CERT_DATE_INVALID', 'ERR_SSL_PROTOCOL_ERROR', 'OTHER']);
const counts = ['nasPageHits', 'authorizationHits', 'publicInfoHits', 'publicInfoSuccess', 'publicInfoDenied'];
function errorCode(error) {
    for (const candidate of [error?.code, typeof error?.message === 'string' && error.message.replace(/^net::/, '')]) {
        if (codes.has(candidate)) return candidate;
    }
    return 'OTHER';
}
function normalizeDiagnostic(value) {
    if (!value || !events.has(value.event)) return null;
    const output = {event: value.event};
    if (Number.isInteger(value.requestId) && value.requestId > 0 && value.requestId <= 10000) output.requestId = value.requestId;
    if (codes.has(value.errorCode)) output.errorCode = value.errorCode;
    if (Number.isInteger(value.status) && value.status >= 100 && value.status <= 599) output.status = value.status;
    if (value.sessionMode === 'MEMORY') output.sessionMode = 'MEMORY';
    if (['DIRECT', 'PROXY', 'UNKNOWN'].includes(value.proxyRoute)) output.proxyRoute = value.proxyRoute;
    if (value.scheme === 'HTTP') output.scheme = 'HTTP';
    if (value.family === 'IPv4') output.family = 'IPv4';
    for (const key of ['loopback', 'listening']) if (typeof value[key] === 'boolean') output[key] = value[key];
    for (const key of counts) if (Number.isInteger(value[key]) && value[key] >= 0 && value[key] <= 10000) output[key] = value[key];
    return output;
}
module.exports = {errorCode, normalizeDiagnostic};
