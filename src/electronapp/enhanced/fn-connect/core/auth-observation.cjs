'use strict';
const {errorCode} = require('./diagnostics.cjs');
const events = new Set(['PERMISSION_CHECK', 'PERMISSION_REQUEST', 'AUTH_EMBY_BLOCKED', 'AUTH_REQUEST_BLOCKED', 'NAVIGATION_BLOCKED',
    'PAGE_LOAD_FAILED', 'RESOURCE_ERROR', 'RESOURCE_RESPONSE', 'UA_OBSERVATION']);
const permissions = new Set(['local-network', 'local-network-access', 'loopback-network', 'storage-access', 'top-level-storage-access']);
const resources = new Set(['mainFrame', 'subFrame', 'stylesheet', 'script', 'image', 'font', 'object', 'xhr', 'ping', 'cspReport', 'media', 'webSocket', 'other']);
function normalizeAuthObservation(value) {
    if (!value || !events.has(value.event)) return null;
    const out = {event: value.event};
    for (const key of ['authSession', 'generation', 'sequence']) {
        if (!Number.isInteger(value[key]) || value[key] < 1 || value[key] > (key === 'sequence' ? 32 : 10000)) return null;
        out[key] = value[key];
    }
    if (['BOOTSTRAP', 'APPROVED_FN', 'EMBY', 'OTHER'].includes(value.sourceClass)) out.sourceClass = value.sourceClass;
    if (value.resourceType !== undefined) out.resourceType = resources.has(value.resourceType) ? value.resourceType : 'other';
    if (value.permission !== undefined) out.permission = permissions.has(value.permission) ? value.permission : 'OTHER';
    if (['EMBY_ROLE', 'INVALID_URL'].includes(value.reason)) out.reason = value.reason;
    if (['JSON', 'HTML', 'SCRIPT', 'BYTES', 'AUDIO', 'VIDEO', 'PLAYLIST', 'OTHER'].includes(value.mimeClass)) out.mimeClass = value.mimeClass;
    if (value.decision === 'BLOCK') out.decision = 'BLOCK';
    if (['MAIN', 'SUBFRAME', 'UNKNOWN'].includes(value.frameClass)) out.frameClass = value.frameClass;
    if (value.errorCode !== undefined) out.errorCode = errorCode({code: value.errorCode});
    if (Number.isInteger(value.status) && value.status >= 100 && value.status <= 599) out.status = value.status;
    for (const key of ['capped', 'browserHasElectron', 'agentMatchesSession']) if (typeof value[key] === 'boolean') out[key] = value[key];
    return out;
}
function createAuthObservation({profile, authSession, generation, emit}) {
    let sequence = 0, active = true;
    return {
        record(event, details = {}, fields = {}) {
            if (!active || sequence >= 32) return;
            let sourceClass = 'OTHER';
            try {
                const u = new URL(details.url);
                if (!u.username && !u.password && ['https:', 'http:'].includes(u.protocol)) {
                    sourceClass = u.origin === profile.emby.origin ? 'EMBY' : u.origin === profile.bootstrap.origin ? 'BOOTSTRAP' :
                        profile.authOrigins.has(u.origin) ? 'APPROVED_FN' : 'OTHER';
                }
            } catch { /* URLs are classified locally and never retained. */ }
            let mimeClass;
            if (event === 'RESOURCE_RESPONSE') {
                const key = Object.keys(details.responseHeaders || {}).find(key => key.toLowerCase() === 'content-type');
                const raw = details.responseHeaders?.[key];
                const type = Array.isArray(raw) ? raw[0] : raw;
                mimeClass = typeof type !== 'string' ? 'OTHER' : /mpegurl|dash\+xml/i.test(type) ? 'PLAYLIST' :
                    /^video\//i.test(type) ? 'VIDEO' : /^audio\//i.test(type) ? 'AUDIO' : /^application\/octet-stream/i.test(type) ? 'BYTES' :
                    /^(?:application|text)\/json/i.test(type) ? 'JSON' : /^text\/html/i.test(type) ? 'HTML' : /javascript/i.test(type) ? 'SCRIPT' : 'OTHER';
            }
            const record = normalizeAuthObservation({...fields, mimeClass, event, sourceClass, resourceType: details.resourceType,
                authSession, generation, sequence: ++sequence, capped: sequence === 32});
            if (record) try { emit(Object.freeze(record)); } catch { /* Observation cannot change a security decision. */ }
        },
        retire() {active = false;}
    };
}
module.exports = {createAuthObservation, normalizeAuthObservation};
