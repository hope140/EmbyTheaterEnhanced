'use strict';
const boundary = require('../renderer-boundary');
const {createService} = require('./service.cjs');
const {createElectronIO} = require('./core/electron-io.cjs');
const CHANNEL = 'enhanced-fn-connect';
const CANCEL = 'enhanced-fn-connect-cancel';
const IDENTITY = 'enhanced-fn-connect-identity';
const NOTICE = 'enhanced-fn-connect-notice';
function safeNotice(value) {
    if (['LOGIN_PAGE_LOAD_FAILED', 'TARGET_PAGE_LOAD_FAILED'].includes(value)) return {code: value, origin: null};
    const match = /^(LOGIN_REDIRECT_REQUIRES_REVIEW|LOGIN_POPUP_REQUIRES_REVIEW|LOGIN_TARGET_REQUIRES_EMBY_CLIENT) origin: (.+)$/.exec(value || '');
    if (!match || match[2].length > 512) return null;
    if (['NON_HTTP_ORIGIN', 'UNPARSEABLE_ORIGIN'].includes(match[2])) return {code: match[1], origin: null};
    try { const u = new URL(match[2]); if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.href !== u.origin + '/') return null;
        return {code: match[1], origin: u.origin}; } catch { return null; }
}
const reasons = new Set(['FN_CONNECT_DISABLED', 'FN_PROFILE_UNKNOWN', 'FN_PROFILE_LIMIT', 'FN_IDENTITY_INVALID',
    'FN_SERVER_MISMATCH', 'FN_ACCOUNT_PROFILE_MISMATCH', 'FN_ACCOUNT_UNVERIFIED', 'FN_ACCOUNT_NOT_BOUND',
    'FN_REQUEST_INVALID', 'FN_REQUEST_PENDING', 'FN_CLOSE_UNCONFIRMED', 'CANCELLED', 'INVALID_PROFILE',
    'INVALID_ADDRESS', 'API_BASE_REQUIRES_REVIEW', 'INVALID_AUTH_ORIGIN', 'INVALID_MEDIA_ORIGIN',
    'FN_AUTH_NOT_READY', 'FN_AUTH_REQUIRED', 'ACCESS_CODE_REQUIRED', 'AUTH_NOT_STARTED', 'NETWORK_ERROR',
    'NETWORK_TIMEOUT', 'SERVER_ID_MISMATCH', 'INVALID_EMBY_INFO', 'ACCESS_DENIED_UNCLASSIFIED',
    'ANONYMOUS_MEDIA_CLOSE_UNCONFIRMED', 'TARGET_OUT_OF_SCOPE', 'HTTPS_REQUIRED', 'FN_IDENTITY_CARRIER_MISMATCH', 'AUTH_BOOTSTRAP_ROLE_INVALID']);
function register({ipcMain, getWebContents, electron, enabled = false, service: supplied} = {}) {
    const service = supplied || createService({enabled, io: enabled ? createElectronIO(electron, {anonymousMediaEnabled: true, authenticationOnly: true,
        onStatus(value) { try { const notice = safeNotice(value), contents = getWebContents(); if (notice && contents && !contents.isDestroyed()) contents.send(NOTICE, notice); } catch {} }
    }) : undefined});
    let stopped = false;
    const watched = new Map();
    const trusted = event => {
        if (stopped || !boundary.isTrusted(event, getWebContents())) return false;
        const contents = event.sender;
        if (!watched.has(contents)) {
            const retire = () => service.documentRetired();
            const navigation = (e, _url, sameDocument, mainFrame) => {
                if (e?.isMainFrame === true && !e.isSameDocument || mainFrame === true && !sameDocument) retire();
            };
            contents.on('destroyed', retire); contents.on('render-process-gone', retire); contents.on('did-start-navigation', navigation);
            watched.set(contents, {retire, navigation});
        }
        return true;
    };
    ipcMain.handle(CHANNEL, async (event, value) => {
        if (!trusted(event)) return {status: 'error', reason: 'untrusted_sender'};
        try {
            if (!value || typeof value !== 'object') throw new Error();
            let result;
            switch (value.operation) {
                case 'capabilities': result = service.capabilities(); break;
                case 'open': result = await service.open(value.config); break;
                case 'verify': result = await service.verify(value.id); break;
                case 'route': result = await service.route(value.id); break;
                case 'bind': result = await service.bind(value.id, value.context); break;
                case 'switch': await service.switchIdentity(value.context, value.id); result = {}; break;
                case 'source': result = await service.source(value); break;
                case 'release': service.release(value.leaseId); result = {}; break;
                case 'remove': await service.remove(value.id); result = {}; break;
                default: throw new Error();
            }
            return {status: 'ok', ...result};
        } catch (error) { return {status: 'error', reason: reasons.has(error?.code) ? error.code : 'FN_CONNECT_FAILED'}; }
    });
    const cancel = (event, value) => {
        if (trusted(event) && Number.isSafeInteger(value?.requestId) && value.requestId > 0) service.cancel(value.requestId);
    };
    const identity = (event, value) => { if (trusted(event)) { try { service.observeIdentity(value); } catch { service.observeIdentity(null); } } };
    ipcMain.on(CANCEL, cancel); ipcMain.on(IDENTITY, identity);
    let closing;
    return function unregister() {
        if (closing) return closing;
        stopped = true; ipcMain.removeHandler(CHANNEL); ipcMain.removeListener(CANCEL, cancel); ipcMain.removeListener(IDENTITY, identity);
        for (const [contents, listeners] of watched) {
            contents.removeListener('destroyed', listeners.retire); contents.removeListener('render-process-gone', listeners.retire);
            contents.removeListener('did-start-navigation', listeners.navigation);
        }
        watched.clear();
        closing = service.close(); return closing;
    };
}
module.exports = {register, CHANNEL, CANCEL, IDENTITY, NOTICE, safeNotice};
