'use strict';
const crypto = require('node:crypto');
const KINDS = new Set(['ready', 'unavailable', 'response', 'http-error', 'error', 'range', 'retry', 'overflow', 'suppressed']);
const STAGES = new Set(['response', 'pre-response', 'transfer', 'unavailable']);
const ERRORS = new Set(['none', 'unknown', 'http-status', 'name-resolution', 'connect', 'tls-handshake',
    'tls-verification', 'timeout', 'send', 'receive', 'partial-file', 'empty-response', 'http2', 'range-not-honored']);
const KEYS = ['kind', 'stage', 'networkError', 'httpStatus', 'sequence'];
const EXTRA = ['streamOk', 'declaredContentSize', 'seekable', 'mpvLevel'];
function projectLog(value) {
    try {
        if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !KEYS.includes(key) && !EXTRA.includes(key))) return null;
        const clean = {};
        for (const key of KEYS) {
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            if (!descriptor || !Object.hasOwn(descriptor, 'value')) return null;
            clean[key] = descriptor.value;
        }
        if (!KINDS.has(clean.kind) || !STAGES.has(clean.stage) || !ERRORS.has(clean.networkError) ||
            !Number.isSafeInteger(clean.sequence) || clean.sequence < 1 || clean.sequence > 2147483647 ||
            !(clean.httpStatus === null || Number.isInteger(clean.httpStatus) && clean.httpStatus >= 100 && clean.httpStatus <= 599)) return null;
        if (clean.httpStatus !== null && (!['response', 'http-error'].includes(clean.kind) || clean.stage !== 'response')) return null;
        for (const key of EXTRA) {
            if (!Object.hasOwn(value, key)) continue;
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            if (!descriptor || !Object.hasOwn(descriptor, 'value')) return null;
            const v = descriptor.value;
            if (key === 'mpvLevel' ? !['unknown', 'fatal', 'error', 'warn', 'info', 'v', 'debug', 'trace'].includes(v) :
                key === 'declaredContentSize' ? !(v === null || Number.isSafeInteger(v) && v >= -1) : !(v === null || typeof v === 'boolean')) return null;
            clean[key] = v;
        }
        return clean;
    } catch (_) {return null;}
}
function createInputReference() {
    let key = null, attempt = 0;
    try {key = crypto.randomBytes(32);} catch (_) { /* Optional diagnostics cannot block service startup. */ }
    return function inputReference(source) {
        const result = {inputEndpointRef: null, inputScheme: 'unavailable', endpointRole: 'input-only', finalEndpointRef: null,
            inputHost: null, inputPort: null, inputRoute: [], inputPathRef: null, inputLocatorRef: null, loadAttempt: ++attempt};
        try {
            if (!key || typeof source !== 'string' || source.length > 8192 || /[\x00-\x20\x7f]/.test(source)) return result;
            const url = new URL(source);
            if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return result;
            const reference = parts => crypto.createHmac('sha256', key).update(JSON.stringify(parts)).digest('hex').slice(0, 32);
            result.inputHost = url.hostname.toLowerCase();
            result.inputPort = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
            // Only fixed route vocabulary survives. Never copy arbitrary path/query values.
            const vocabulary = new Set(['emby', 'Videos', 'Audio', 'Items', 'stream', 'stream.mkv', 'stream.mp4', 'master.m3u8', 'Subtitles', 'Download']);
            result.inputRoute = url.pathname.split('/').filter(Boolean).slice(0, 24).map(part => vocabulary.has(part) ? part : '{segment}');
            result.inputPathRef = 'path-' + reference(['input-path', url.protocol, url.hostname, url.port, url.pathname]);
            result.inputLocatorRef = 'loc-' + reference(['input-locator', url.protocol, url.hostname, url.port, url.pathname, url.search]);
            result.inputScheme = url.protocol === 'https:' ? 'https' : 'http';
            result.inputEndpointRef = 'ep-' + crypto.createHmac('sha256', key)
                .update(JSON.stringify(['input-endpoint', url.protocol, url.hostname.toLowerCase(), url.port])).digest('hex').slice(0, 32);
        } catch (_) { /* No URL/parser errors or strings escape this boundary. */ }
        return result;
    };
}
function projectInput(value) {
    try {
        const keys = ['inputEndpointRef', 'inputScheme', 'endpointRole', 'finalEndpointRef', 'inputHost', 'inputPort', 'inputRoute', 'inputPathRef', 'inputLocatorRef', 'loadAttempt'], clean = {};
        if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length) return null;
        for (const name of keys) {
            const descriptor = Object.getOwnPropertyDescriptor(value, name);
            if (!descriptor || !Object.hasOwn(descriptor, 'value')) return null;
            clean[name] = descriptor.value;
        }
        if (!['http', 'https', 'unavailable'].includes(clean.inputScheme) || clean.endpointRole !== 'input-only' || clean.finalEndpointRef !== null) return null;
        const ref = clean.inputEndpointRef;
        if (ref !== null && (typeof ref !== 'string' || !/^ep-[a-f0-9]{32}$/.test(ref))) return null;
        if (!Number.isSafeInteger(clean.loadAttempt) || clean.loadAttempt < 1 ||
            !(clean.inputHost === null || typeof clean.inputHost === 'string' && clean.inputHost.length <= 253 && /^[a-z0-9.:[\]-]+$/.test(clean.inputHost)) ||
            !(clean.inputPort === null || Number.isInteger(clean.inputPort) && clean.inputPort > 0 && clean.inputPort <= 65535) ||
            !(clean.inputPathRef === null || /^path-[a-f0-9]{32}$/.test(clean.inputPathRef)) ||
            !(clean.inputLocatorRef === null || /^loc-[a-f0-9]{32}$/.test(clean.inputLocatorRef)) ||
            !Array.isArray(clean.inputRoute) || clean.inputRoute.length > 24 ||
            clean.inputRoute.some(part => !['emby', 'Videos', 'Audio', 'Items', 'stream', 'stream.mkv', 'stream.mp4', 'master.m3u8', 'Subtitles', 'Download', '{segment}'].includes(part))) return null;
        return clean;
    } catch (_) {return null;}
}
module.exports = {projectLog, createInputReference, projectInput};
