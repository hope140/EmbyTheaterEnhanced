'use strict';

const http = require('node:http');
const https = require('node:https');
const {PassThrough} = require('node:stream');
const {fail} = require('./policy.cjs');
const {errorCode, normalizeDiagnostic} = require('./diagnostics.cjs');

function createElectronIO({session, BrowserWindow, net}, {onStatus = () => {}, onDiagnostic = () => {}, environment = process.env,
    externalHeaderOrigin, anonymousMediaEnabled = false, mode = 'live'} = {}) {
    let requestSequence = 0;
    let externalTrialUsed = false;
    let reservedExternalSession, externalTrialStarted = false;
    const mediaChecks = new WeakMap();
    const frozenSessions = new WeakSet();
    function freeze(ses) {
        if (mediaChecks.has(ses)) mediaChecks.get(ses).freeze();
        else {
            ses.webRequest.onBeforeRequest({urls: ['<all_urls>']}, (_details, callback) => callback({cancel: true}));
            ses.webRequest.onBeforeSendHeaders?.({urls: ['<all_urls>']}, (_details, callback) => callback({cancel: true}));
            ses.webRequest.onHeadersReceived({urls: ['<all_urls>']}, (_details, callback) => callback({cancel: true}));
            frozenSessions.add(ses);
        }
    }
    const diagnostic = value => { try { onDiagnostic(normalizeDiagnostic(value)); } catch { /* Diagnostics cannot change transport ownership. */ } };
    return {
        openAnonymousMedia(ses, input) {
            const {createAnonymousMedia} = require('./anonymous-media.cjs');
            return createAnonymousMedia({enabled: anonymousMediaEnabled, mode, environment,
                resolveProxy: address => ses.resolveProxy(address)}).open(input);
        },
        createSession(id, storage) {
            // Only a main-owned store descriptor can select this dedicated path.
            const ses = storage?.persistent ? session.fromPath(storage.path, {cache: false}) :
                session.fromPartition('ete-fn-experiment-' + id, {cache: false});
            // A previous closed connection may have left a frozen guard on this
            // cached Session. Its pages/operations were retired before release.
            mediaChecks.get(ses)?.dispose(); mediaChecks.delete(ses);
            if (frozenSessions.has(ses)) {
                ses.webRequest.onBeforeRequest(null); ses.webRequest.onBeforeSendHeaders?.(null); ses.webRequest.onHeadersReceived(null); frozenSessions.delete(ses);
            }
            ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
            ses.setPermissionCheckHandler(() => false);
            diagnostic({event: 'SESSION_CREATED', sessionMode: storage?.persistent ? 'PERSISTENT' : 'MEMORY'});
            return ses;
        },
        async openLogin(ses, profile, {signal, onCancel, onLifecycle = () => {}, deferNavigation = false}) {
            let preArmReports = 0;
            const preArmBlocked = (d, stage, reason, type) => {
                if (preArmReports >= 32) return;
                preArmReports++;
                let sourceClass = 'OTHER';
                try {
                    const origin = new URL(d.url).origin;
                    sourceClass = origin === profile.emby.origin ? 'EMBY' : profile.authOrigins.has(origin) ? 'APPROVED_FN' : 'OTHER';
                } catch {}
                const resources = new Set(['mainFrame', 'subFrame', 'stylesheet', 'script', 'image', 'font', 'object', 'xhr', 'ping', 'cspReport', 'media', 'webSocket', 'other']);
                const mimeClass = stage !== 'HEADERS_RECEIVED' ? 'NOT_OBSERVED' : typeof type !== 'string' ? 'OTHER' :
                    /mpegurl|dash\+xml/i.test(type) ? 'PLAYLIST' : /^video\//i.test(type) ? 'VIDEO' : /^audio\//i.test(type) ? 'AUDIO' :
                    /^application\/octet-stream/i.test(type) ? 'BYTES' : /^(?:application\/json|text\/json)/i.test(type) ? 'JSON' :
                    /^text\/html/i.test(type) ? 'HTML' : /javascript/i.test(type) ? 'SCRIPT' : 'OTHER';
                try { onLifecycle(Object.freeze({event: 'PREARM_BLOCKED', stage, reason, sourceClass,
                    resourceType: resources.has(d.resourceType) ? d.resourceType : 'other', mimeClass,
                    status: stage === 'HEADERS_RECEIVED' && Number.isInteger(d.statusCode) && d.statusCode >= 100 && d.statusCode <= 599 ? d.statusCode : null})); } catch {}
            };
            if (externalHeaderOrigin && !mediaChecks.has(ses) && !frozenSessions.has(ses)) {
                // The header-only process never offers an unrestricted media
                // window before or after its explicit one-shot gate.
                const reject = details => {
                    if (details.resourceType === 'media') return 'MEDIA_RESOURCE';
                    try {
                        const u = new URL(details.url);
                        if (u.origin === externalHeaderOrigin) return 'APPROVED_CDN';
                        if (u.origin === profile.emby.origin && /\/PlaybackInfo\/?$/i.test(u.pathname)) return 'PLAYBACK_INFO';
                        if (details.initiatorOrigin === profile.emby.origin && !profile.authOrigins.has(u.origin)) return 'EMBY_EXTERNAL';
                        return null;
                    } catch { return 'INVALID_URL'; }
                };
                for (const [event, stage] of [['onBeforeRequest', 'BEFORE_REQUEST'], ['onBeforeSendHeaders', 'BEFORE_SEND_HEADERS']]) {
                    ses.webRequest[event]({urls: ['<all_urls>']}, (d, callback) => {
                        const reason = reject(d); callback({cancel: Boolean(reason)});
                        if (reason) preArmBlocked(d, stage, reason);
                    });
                }
                ses.webRequest.onHeadersReceived({urls: ['<all_urls>']}, (d, callback) => {
                    const key = Object.keys(d.responseHeaders || {}).find(name => name.toLowerCase() === 'content-type');
                    const value = key === undefined ? '' : d.responseHeaders[key];
                    const type = Array.isArray(value) ? value[0] : value;
                    // Normal FN bootstrap uses an authenticated binary XHR.
                    // This exception never applies to Emby, CDN, media or partial responses.
                    let fnAuthBytes = false;
                    if (d.resourceType === 'xhr' && d.statusCode === 200 && typeof type === 'string' &&
                        type.split(';', 1)[0].trim().toLowerCase() === 'application/octet-stream') {
                        try {
                            const u = new URL(d.url);
                            fnAuthBytes = !u.username && !u.password && profile.authOrigins.has(u.origin) &&
                                u.origin !== profile.emby.origin && u.origin !== externalHeaderOrigin;
                        } catch {}
                    }
                    const reason = reject(d) || (!fnAuthBytes && /^(?:video\/|audio\/|application\/octet-stream)|mpegurl|dash\+xml/i.test(type || '') ? 'MEDIA_MIME' :
                        [206, 416].includes(d.statusCode) ? 'PARTIAL_STATUS' : null);
                    callback({cancel: Boolean(reason)});
                    if (reason) preArmBlocked(d, 'HEADERS_RECEIVED', reason, type);
                });
            }
            const win = new BrowserWindow({width: 900, height: 720, title: 'FN transport experiment — normal NAS login',
                webPreferences: {session: ses, nodeIntegration: false, contextIsolation: true, sandbox: true,
                    webSecurity: true, allowRunningInsecureContent: false}});
            let mainClose = false, lifetimeAbort = false, nativeClose = false, contentClose = false;
            const lifecycle = (event, fields = {}) => { try { onLifecycle(Object.freeze({event, ...fields})); } catch {} };
            lifecycle('WINDOW_CREATED');
            win.on('close', () => { nativeClose = true; lifecycle('NATIVE_CLOSE_REQUEST'); });
            // Observational only: v44.4.2 CloseContents emits this before Destroy.
            // It is not an authorization signal or a supported cancellation hook.
            win.webContents.on('close', () => { contentClose = true; lifecycle('CONTENT_CLOSE_REQUEST'); });
            win.webContents.on('render-process-gone', (_event, details) => {
                const reasons = new Set(['clean-exit', 'abnormal-exit', 'killed', 'crashed', 'oom', 'launch-failed', 'integrity-failure']);
                lifecycle('RENDER_PROCESS_GONE', {code: reasons.has(details?.reason) ? details.reason.toUpperCase().replaceAll('-', '_') : 'OTHER'});
            });
            // Remote Emby Web must take its normal browser path, not request a
            // Theater-only plugin. Scope the real network UA to this window.
            const originalAgent = win.webContents.getUserAgent();
            const browserAgent = originalAgent.replace(/\s+Electron\/[^\s]+/gi, '').trim();
            if (/\bChrome\/[\d.]+/.test(originalAgent) && browserAgent !== originalAgent) {
                win.webContents.setUserAgent(browserAgent);
            }
            const permitted = value => {
                try { const u = new URL(value); return !u.username && !u.password && profile.authOrigins.has(u.origin); } catch { return false; }
            };
            let blocked = false;
            const reportBlocked = (code, destination) => {
                let origin = 'UNPARSEABLE_ORIGIN';
                try {
                    const u = new URL(destination);
                    origin = ['https:', 'http:'].includes(u.protocol) ? u.origin : 'NON_HTTP_ORIGIN';
                } catch { /* Never report parser errors or the original URL. */ }
                blocked = true;
                onStatus(code + ' origin: ' + origin);
            };
            win.webContents.setWindowOpenHandler(({url}) => { reportBlocked('LOGIN_POPUP_REQUIRES_REVIEW', url); return {action: 'deny'}; });
            for (const event of ['will-navigate', 'will-redirect']) win.webContents.on(event, (e, destination) => {
                destination = typeof destination === 'string' ? destination : typeof e.url === 'string' ? e.url : undefined;
                if (!permitted(destination)) { e.preventDefault(); reportBlocked('LOGIN_REDIRECT_REQUIRES_REVIEW', destination); }
            });
            // Do not inject username/password, OAuth interceptors or client IDs.
            win.on('closed', () => {
                lifecycle('WINDOW_CLOSED', {cause: mainClose ? 'MAIN_HANDLE' : lifetimeAbort ? 'LIFETIME_ABORT' :
                    nativeClose ? 'NATIVE_REQUEST' : contentClose ? 'CONTENT_REQUEST' : 'UNATTRIBUTED'});
                onCancel();
            });
            const abort = () => {
                lifetimeAbort = true; lifecycle('LIFETIME_ABORT');
                if (!win.isDestroyed()) win.destroy();
            };
            signal.addEventListener('abort', abort, {once: true});
            win.once('closed', () => signal.removeEventListener('abort', abort));
            if (!deferNavigation) {
                lifecycle('BOOTSTRAP_LOAD_STARTED');
                win.loadURL(profile.bootstrap.href).catch(error => {
                    lifecycle('BOOTSTRAP_LOAD_FAILED', {code: errorCode(error)});
                    if (!blocked) onStatus('LOGIN_PAGE_LOAD_FAILED');
                });
            }
            return {webContentsId: win.webContents.id, close() {
                return new Promise(resolve => {
                    if (win.isDestroyed()) resolve();
                    else { mainClose = true; lifecycle('MAIN_HANDLE_CLOSE'); win.once('closed', resolve); win.destroy(); }
                });
            },
                showTarget() {
                    if (!win.isDestroyed()) {
                        blocked = false;
                        lifecycle('TARGET_LOAD_STARTED');
                        win.loadURL(profile.emby.href).catch(error => {
                            lifecycle('TARGET_LOAD_FAILED', {code: errorCode(error)});
                            if (!blocked) onStatus('TARGET_PAGE_LOAD_FAILED');
                        });
                    }
                }};
        },
        request(ses, {url, method, headers, signal}) {
            return new Promise((resolve, reject) => {
                if (signal.aborted) return reject(fail('CANCELLED'));
                const requestId = ++requestSequence;
                let req;
                try { req = net.request({url, method, session: ses, credentials: 'include', redirect: 'manual'}); }
                catch (error) { diagnostic({event: 'REQUEST_SETUP_ERROR', requestId, errorCode: errorCode(error)}); return reject(fail('NETWORK_ERROR')); }
                diagnostic({event: 'REQUEST_CREATED', requestId});
                let responseSeen = false, body, ended = false;
                const detach = () => signal.removeEventListener('abort', abort);
                const rejectPending = () => { if (!responseSeen) { responseSeen = true; reject(fail(signal.aborted ? 'CANCELLED' : 'NETWORK_ERROR')); } };
                const abort = () => { rejectPending(); req.abort(); body?.destroy(); detach(); };
                signal.addEventListener('abort', abort, {once: true});
                req.once('abort', () => { rejectPending(); if (body && !ended) body.destroy(); detach(); });
                req.once('close', () => {
                    // Electron 44.4.2 inherits autoDestroy Writable: upload
                    // finish can emit close before the URLLoader response.
                    // An ordinary close is neither an error nor cancellation.
                    if (!responseSeen) diagnostic({event: 'REQUEST_CLOSE_BEFORE_RESPONSE', requestId});
                    if (signal.aborted) { rejectPending(); detach(); }
                    else if (body && (ended || body.destroyed)) detach();
                });
                // Manual redirect event is returned as an inspectable response;
                // never follow it with Chromium's automatic cookie propagation.
                req.once('redirect', (statusCode, _method, location, responseHeaders = {}) => {
                    diagnostic({event: 'REDIRECT', requestId, status: statusCode});
                    if (signal.aborted || responseSeen) { req.abort(); detach(); return; }
                    responseSeen = true;
                    body = new PassThrough();
                    body.on('error', () => {});
                    body.end();
                    ended = true;
                    resolve({statusCode, headers: {...Object.fromEntries(Object.entries(responseHeaders).map(([key, value]) => [key.toLowerCase(), value])), location}, body});
                    req.abort();
                    detach();
                });
                req.once('response', response => {
                    diagnostic({event: 'RESPONSE', requestId, status: response.statusCode});
                    if (signal.aborted || responseSeen) { response.destroy(); detach(); return; }
                    responseSeen = true;
                    body = new PassThrough();
                    body.on('error', () => {});
                    response.on('data', chunk => { if (!body.write(chunk)) response.pause(); });
                    body.on('drain', () => response.resume());
                    response.once('end', () => { ended = true; body.end(); });
                    response.once('error', () => body.destroy(fail('UPSTREAM_STREAM_FAILED')));
                    response.once('close', () => { if (!ended) body.destroy(fail('UPSTREAM_STREAM_FAILED')); });
                    body.once('close', () => { detach(); if (!ended) req.abort(); });
                    resolve({statusCode: response.statusCode, headers: response.headers, body});
                });
                req.once('error', error => { diagnostic({event: 'REQUEST_ERROR', requestId, errorCode: errorCode(error)}); rejectPending(); if (body && !ended) body.destroy(fail('UPSTREAM_STREAM_FAILED')); detach(); });
                try { for (const [key, value] of Object.entries(headers)) req.setHeader(key, value); req.end(); }
                catch (error) { diagnostic({event: 'REQUEST_SETUP_ERROR', requestId, errorCode: errorCode(error)}); rejectPending(); req.abort(); detach(); }
            });
        },
        async cookieValues(ses, url) {
            return (await ses.cookies.get({url})).filter(cookie => !['mode', 'language'].includes(cookie.name.toLowerCase())).map(cookie => cookie.value);
        },
        armMediaCheck(ses, profile, {onReport, webContentsId}) {
            if (externalHeaderOrigin) throw fail('EXTERNAL_CHECK_MODE_ONLY');
            if (mediaChecks.has(ses)) throw fail('MEDIA_CHECK_ALREADY_ARMED');
            if (!Number.isInteger(webContentsId) || webContentsId <= 0) throw fail('MEDIA_CHECK_OWNER_REQUIRED');
            const {installMediaCheck} = require('./media-check.cjs');
            mediaChecks.set(ses, installMediaCheck(ses, profile.emby.href, {onReport, ownerId: webContentsId}));
        },
        reserveExternalHeaderCheck(ses) {
            if (!externalHeaderOrigin) throw fail('EXTERNAL_PROBE_DISABLED');
            if (externalTrialUsed) throw fail('EXTERNAL_PROBE_ALREADY_USED');
            if (mediaChecks.has(ses)) throw fail('MEDIA_CHECK_ALREADY_ARMED');
            externalTrialUsed = true;
            reservedExternalSession = ses;
            freeze(ses);
        },
        armExternalHeaderCheck(ses, profile, {onReport, webContentsId, signal}) {
            if (!externalHeaderOrigin) throw fail('EXTERNAL_PROBE_DISABLED');
            if (reservedExternalSession !== ses || externalTrialStarted) throw fail('EXTERNAL_PROBE_ALREADY_USED');
            if (mediaChecks.has(ses)) throw fail('MEDIA_CHECK_ALREADY_ARMED');
            externalTrialStarted = true;
            const {createExternalHeaderProbe} = require('./external-header-probe.cjs');
            const {installExternalMediaCheck} = require('./external-media-check.cjs');
            const probe = createExternalHeaderProbe({enabled: true, approvedOrigin: externalHeaderOrigin,
                resolveProxy: address => ses.resolveProxy(address), environment});
            const observer = installExternalMediaCheck(ses, profile.emby.href, {approvedOrigin: externalHeaderOrigin,
                ownerId: webContentsId, onReport, probe, signal});
            mediaChecks.set(ses, observer);
            return observer.ready;
        },
        async finalExternalHeaderBudget(ses) {
            const observer = mediaChecks.get(ses);
            if (typeof observer?.snapshotBudget !== 'function') return undefined;
            let settled = true;
            try { await observer.drain(); } catch { settled = false; }
            return Object.freeze({...observer.snapshotBudget(), settled});
        },
        prepareMediaCheck(ses) {
            if (!mediaChecks.has(ses)) throw fail('MEDIA_CHECK_NOT_ARMED');
            return mediaChecks.get(ses).prepare();
        },
        rearmMediaCheck(ses, {onReport, webContentsId}) {
            if (externalHeaderOrigin) throw fail('EXTERNAL_ONESHOT_RETIRED');
            if (!mediaChecks.has(ses)) throw fail('MEDIA_CHECK_NOT_ARMED');
            if (!Number.isInteger(webContentsId) || webContentsId <= 0) throw fail('MEDIA_CHECK_OWNER_REQUIRED');
            mediaChecks.get(ses).rearm(onReport, webContentsId);
        },
        async openWebSocket(ses, {url, headers, signal}) {
            // Node's TLS client cannot silently bypass an Electron/system proxy.
            // Unsupported proxy routes stop here instead of falling back direct.
            if (await ses.resolveProxy(url) !== 'DIRECT') throw fail('WS_PROXY_UNSUPPORTED');
            if (new URL(url).hostname !== '127.0.0.1' && ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']
                .some(key => environment[key])) throw fail('WS_PROXY_UNSUPPORTED');
            const cookies = await ses.cookies.get({url});
            const values = cookies.filter(c => !c.expirationDate || c.expirationDate * 1000 > Date.now())
                .map(c => c.name + '=' + c.value).join('; ');
            return openNodeWebSocket({url, headers, signal, cookie: values});
        },
        async clearSession(ses) {
            freeze(ses);
            await mediaChecks.get(ses)?.drain?.();
            await ses.closeAllConnections();
            await ses.clearStorageData();
            await ses.clearAuthCache?.();
            await ses.clearCache?.();
            ses.flushStorageData?.();
            await ses.cookies?.flushStore?.();
            // Keep the deny-all guard after clearing as well: the old Session
            // must not restart a service-worker request after logical close.
        },
        async preserveSession(ses) {
            freeze(ses);
            await mediaChecks.get(ses)?.drain?.();
            await ses.closeAllConnections();
            ses.flushStorageData();
            await ses.cookies.flushStore();
            // Keep the frozen guard until an explicit new connection acquires
            // the same profile. No storage is copied, cleared or re-expired.
        }
    };
}

function openNodeWebSocket({url, headers, signal, cookie}) {
    return new Promise((resolve, reject) => {
        if (signal.aborted) return reject(fail('CANCELLED'));
        const target = new URL(url);
        const transport = target.protocol === 'https:' ? https : http;
        const safe = {...headers, Connection: 'Upgrade', Upgrade: 'websocket'};
        if (cookie) safe.Cookie = cookie;
        const req = transport.request(target, {method: 'GET', headers: safe});
        let socket;
        const abort = () => { req.destroy(); socket?.destroy(); };
        signal.addEventListener('abort', abort, {once: true});
        const timer = setTimeout(() => req.destroy(), 10000);
        req.once('error', () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(fail('WS_NETWORK_ERROR')); });
        req.once('response', response => {
            clearTimeout(timer);
            response.destroy();
            signal.removeEventListener('abort', abort);
            resolve({statusCode: response.statusCode, headers: response.headers});
        });
        req.once('upgrade', (response, upgraded, head) => {
            clearTimeout(timer);
            socket = upgraded;
            socket.once('close', () => signal.removeEventListener('abort', abort));
            resolve({statusCode: response.statusCode, headers: response.headers, socket, head});
        });
        req.end();
    });
}
module.exports = {createElectronIO, openNodeWebSocket};
