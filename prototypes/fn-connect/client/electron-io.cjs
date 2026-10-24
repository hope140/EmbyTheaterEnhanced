'use strict';

const http = require('node:http');
const https = require('node:https');
const {PassThrough} = require('node:stream');
const {fail} = require('./policy.cjs');
const {errorCode, normalizeDiagnostic} = require('./diagnostics.cjs');

function createElectronIO({session, BrowserWindow, net}, {onStatus = () => {}, onDiagnostic = () => {}, environment = process.env} = {}) {
    let requestSequence = 0;
    const diagnostic = value => { try { onDiagnostic(normalizeDiagnostic(value)); } catch { /* Diagnostics cannot change transport ownership. */ } };
    return {
        createSession(id) {
            // No persist: prefix; do not open any existing browser profile.
            const ses = session.fromPartition('ete-fn-experiment-' + id, {cache: false});
            ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
            ses.setPermissionCheckHandler(() => false);
            diagnostic({event: 'SESSION_CREATED', sessionMode: 'MEMORY'});
            return ses;
        },
        async openLogin(ses, profile, {signal, onCancel}) {
            const win = new BrowserWindow({width: 900, height: 720, title: 'FN transport experiment — normal NAS login',
                webPreferences: {session: ses, nodeIntegration: false, contextIsolation: true, sandbox: true,
                    webSecurity: true, allowRunningInsecureContent: false}});
            const permitted = value => {
                try { const u = new URL(value); return !u.username && !u.password && profile.authOrigins.has(u.origin); } catch { return false; }
            };
            win.webContents.setWindowOpenHandler(() => { onStatus('LOGIN_POPUP_REQUIRES_REVIEW'); return {action: 'deny'}; });
            for (const event of ['will-navigate', 'will-redirect']) win.webContents.on(event, (e, destination) => {
                if (!permitted(destination)) { e.preventDefault(); onStatus('LOGIN_REDIRECT_REQUIRES_REVIEW'); }
            });
            // Do not inject username/password, OAuth interceptors or client IDs.
            win.on('closed', onCancel);
            const abort = () => { if (!win.isDestroyed()) win.destroy(); };
            signal.addEventListener('abort', abort, {once: true});
            win.once('closed', () => signal.removeEventListener('abort', abort));
            win.loadURL(profile.bootstrap.href).catch(() => onStatus('LOGIN_PAGE_LOAD_FAILED'));
            return {close() { if (!win.isDestroyed()) win.destroy(); },
                showTarget() { if (!win.isDestroyed()) win.loadURL(profile.emby.href).catch(() => onStatus('TARGET_PAGE_LOAD_FAILED')); }};
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
            await ses.closeAllConnections();
            await ses.clearStorageData();
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
