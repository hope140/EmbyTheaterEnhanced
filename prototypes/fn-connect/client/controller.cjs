'use strict';

const {randomBytes} = require('node:crypto');
const policy = require('./policy.cjs');

function abortable(promise, signal) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (callback, value) => {
            if (settled) return;
            settled = true;
            signal.removeEventListener('abort', abort);
            callback(value);
        };
        const abort = () => finish(reject, policy.fail('CANCELLED'));
        signal.addEventListener('abort', abort, {once: true});
        if (signal.aborted) abort();
        Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error));
    });
}

function createController({enabled = false, mode = 'live', io, headerTimeoutMs = 10000, verificationTimeoutMs = 10000} = {}) {
    if (!['live', 'fixture'].includes(mode)) throw policy.fail('INVALID_MODE');
    const profiles = new Map(), listeners = new Set();
    function emit(p, state, reason) {
        p.state = state;
        const event = Object.freeze({id: p.id, state, reason: reason || null});
        for (const listener of listeners) { try { listener(event); } catch { /* No external errors in diagnostics. */ } }
        return event;
    }
    function requireAuth(p, reason) {
        p.authEpoch++;
        emit(p, 'needs-auth', reason);
        for (const pending of p.pending) pending.abort();
    }
    function get(id) {
        if (!enabled) throw policy.fail('FEATURE_DISABLED');
        const p = profiles.get(id);
        if (!p || p.state === 'closed') throw policy.fail('PROFILE_CLOSED');
        return p;
    }
    function ready(id) { const p = get(id); if (p.state !== 'ready') throw policy.fail('FN_AUTH_NOT_READY'); return p; }
    function owned(p, signal) {
        const owner = new AbortController();
        const abort = () => owner.abort();
        p.lifetime.signal.addEventListener('abort', abort, {once: true});
        signal?.addEventListener('abort', abort, {once: true});
        if (p.lifetime.signal.aborted || signal?.aborted) abort();
        const generation = p.generation, authEpoch = p.authEpoch;
        let done;
        owner.done = new Promise(resolve => { done = resolve; });
        p.pending.add(owner);
        let cleaned = false;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            p.pending.delete(owner);
            p.lifetime.signal.removeEventListener('abort', abort);
            signal?.removeEventListener('abort', abort);
            done();
        };
        return {signal: owner.signal, abort, cleanup, check() {
            if (owner.signal.aborted || p.generation !== generation || p.authEpoch !== authEpoch || p.state === 'closed') throw policy.fail('CANCELLED');
        }};
    }
    async function exchange(p, address, inputHeaders, signal, kind) {
        const requestHeaders = policy.headers(inputHeaders), scope = owned(p, signal);
        let response, timer, earlyBodyFailed = false, releaseEarlyBody = () => {};
        try {
            let current = address;
            const seen = new Set();
            const secrets = Object.entries(requestHeaders).filter(([key]) => /authorization|token/.test(key)).map(([, value]) => value);
            for (const value of [...secrets]) {
                const token = value.match(/(?:Token="|Bearer\s+)([^"\s,]+)/i);
                if (token) secrets.push(token[1]);
            }
            for (let hop = 0; hop < 6; hop++) {
                scope.check();
                for (const [key, value] of current.searchParams) if (/api_key|token|authorization/i.test(key)) secrets.push(value);
                secrets.push(...await abortable(io.cookieValues(p.session, current.href), scope.signal));
                scope.check();
                if (seen.has(current.href)) throw policy.fail('REDIRECT_LOOP');
                seen.add(current.href);
                let timedOut = false;
                timer = setTimeout(() => { timedOut = true; scope.abort(); }, headerTimeoutMs);
                try {
                    response = await io.request(p.session, {url: current.href, method: 'GET',
                        headers: requestHeaders, credentials: 'include', signal: scope.signal});
                } catch {
                    if (timedOut) throw policy.fail('NETWORK_TIMEOUT');
                    scope.check();
                    throw policy.fail('NETWORK_ERROR');
                } finally { clearTimeout(timer); }
                scope.check();
                // Own premature stream termination before any asynchronous
                // cookie-store work; otherwise its terminal event can be lost.
                const retireEarlyBody = () => { earlyBodyFailed = true; scope.abort(); };
                response.body.once('error', retireEarlyBody);
                response.body.once('close', retireEarlyBody);
                releaseEarlyBody = () => {
                    response.body.removeListener('error', retireEarlyBody);
                    response.body.removeListener('close', retireEarlyBody);
                };
                if (response.body.destroyed) retireEarlyBody();
                scope.check();
                // A redirect may set a cookie scoped only to the old path. Read
                // it before leaving that path, and include raw Set-Cookie values
                // when Chromium's cookie-store commit has not completed yet.
                secrets.push(...await abortable(io.cookieValues(p.session, current.href), scope.signal));
                const setCookies = response.headers?.['set-cookie'];
                for (const raw of Array.isArray(setCookies) ? setCookies : setCookies ? [setCookies] : []) {
                    const pair = raw.split(';', 1)[0], split = pair.indexOf('=');
                    if (split > 0 && !['mode', 'language'].includes(pair.slice(0, split).toLowerCase())) secrets.push(pair.slice(split + 1));
                }
                if (response.body.destroyed) retireEarlyBody();
                scope.check();
                const challenge = policy.challenge(response, p.config, mode);
                if (challenge) {
                    releaseEarlyBody();
                    response.body.destroy();
                    requireAuth(p, challenge);
                    throw policy.fail(challenge);
                }
                if (response.statusCode < 300 || response.statusCode >= 400) {
                    const abortBody = () => response.body.destroy(policy.fail('CANCELLED'));
                    scope.signal.addEventListener('abort', abortBody, {once: true});
                    response.body.once('close', () => scope.signal.removeEventListener('abort', abortBody));
                    response.body.once('end', scope.cleanup);
                    response.body.once('close', scope.cleanup);
                    response.body.once('error', scope.cleanup);
                    releaseEarlyBody();
                    if (response.body.readableEnded || response.body.destroyed) scope.cleanup();
                    response.dispose = () => { response.body.destroy(); scope.abort(); scope.cleanup(); };
                    return response;
                }
                const location = policy.header(response, 'location');
                releaseEarlyBody();
                response.body.destroy();
                if (!location || hop === 5) throw policy.fail('REDIRECT_REJECTED');
                const next = policy.url(new URL(location, current).href, mode);
                if (next.origin === p.config.emby.origin) {
                    current = policy.target(p.config, next.href, mode);
                    continue;
                }
                if (kind !== 'media' || !p.config.externalMediaOrigins.has(next.origin)) throw policy.fail('EXTERNAL_REDIRECT_REVIEW_REQUIRED');
                secrets.push(...await abortable(io.cookieValues(p.session, current.href), scope.signal));
                scope.check();
                policy.rejectCredentialRedirect(next, secrets);
                scope.cleanup();
                // The player follows this location without receiving any NAS or
                // Emby header. This process never fetches the external origin.
                return policy.externalRedirect(next);
            }
            throw policy.fail('REDIRECT_REJECTED');
        } catch (error) {
            releaseEarlyBody();
            response?.body?.destroy();
            scope.cleanup();
            if (earlyBodyFailed) throw policy.fail('UPSTREAM_STREAM_FAILED');
            if (error?.code && ['CANCELLED', 'NETWORK_TIMEOUT', 'NETWORK_ERROR', 'FN_AUTH_REQUIRED', 'ACCESS_CODE_REQUIRED',
                'REDIRECT_LOOP', 'REDIRECT_REJECTED', 'EXTERNAL_REDIRECT_REVIEW_REQUIRED', 'CREDENTIAL_REDIRECT_BLOCKED',
                'TARGET_OUT_OF_SCOPE', 'HTTPS_REQUIRED', 'INVALID_ADDRESS'].includes(error.code)) throw error;
            throw policy.fail('REQUEST_FAILED');
        }
    }
    const controller = {
        onState(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        add(input) {
            if (!enabled) throw policy.fail('FEATURE_DISABLED');
            const config = policy.config(input, mode), id = randomBytes(18).toString('hex');
            const p = {id, config, session: io.createSession(id), generation: 0, authEpoch: 0, verifySequence: 0, pending: new Set(),
                lifetime: new AbortController(), window: null, state: 'draft'};
            profiles.set(id, p);
            emit(p, 'draft');
            return id;
        },
        async start(id) {
            const p = get(id);
            p.generation++;
            for (const pending of p.pending) pending.abort();
            if (p.window) p.window.close();
            const generation = p.generation;
            emit(p, 'authorizing');
            const window = await io.openLogin(p.session, p.config, {signal: p.lifetime.signal,
                onCancel() { if (p.generation === generation && !['ready', 'closed'].includes(p.state)) void controller.close(id).catch(() => {}); }});
            if (generation !== p.generation || p.state === 'closed') { window.close(); throw policy.fail('CANCELLED'); }
            p.window = window;
            return {id, state: p.state};
        },
        async verify(id, {signal} = {}) {
            const p = get(id);
            if (!['authorizing', 'needs-auth', 'ready'].includes(p.state)) throw policy.fail('AUTH_NOT_STARTED');
            const generation = p.generation, authEpoch = p.authEpoch, sequence = ++p.verifySequence;
            const cancel = new AbortController();
            const abort = () => cancel.abort();
            signal?.addEventListener('abort', abort, {once: true});
            if (signal?.aborted) abort();
            let timedOut = false;
            const deadline = Date.now() + verificationTimeoutMs;
            const timer = setTimeout(() => { timedOut = true; cancel.abort(); }, verificationTimeoutMs);
            let response;
            try {
                response = await exchange(p, policy.target(p.config, p.config.probePath, mode), {accept: 'application/json'}, cancel.signal, 'api');
                if (response.statusCode !== 200) throw policy.fail(response.statusCode === 429 ? 'RATE_LIMITED' :
                    [401, 403].includes(response.statusCode) ? 'ACCESS_DENIED_UNCLASSIFIED' : 'HTTP_ERROR');
                if (!policy.header(response, 'content-type').toLowerCase().includes('application/json')) throw policy.fail('AUTH_UNVERIFIED');
                const chunks = [];
                let size = 0;
                for await (const chunk of response.body) {
                    size += chunk.length;
                    if (size > 65536) throw policy.fail('INFO_TOO_LARGE');
                    chunks.push(chunk);
                }
                if (timedOut || Date.now() >= deadline) throw policy.fail('NETWORK_TIMEOUT');
                if (signal?.aborted || p.lifetime.signal.aborted || p.generation !== generation ||
                    p.authEpoch !== authEpoch || sequence !== p.verifySequence) throw policy.fail('CANCELLED');
                let info;
                try { info = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw policy.fail('INVALID_EMBY_INFO'); }
                if (typeof info?.Id !== 'string' || !info.Id || typeof info.Version !== 'string' || !/^\d+\.\d+/.test(info.Version)) throw policy.fail('INVALID_EMBY_INFO');
                if (p.config.expectedServerId && info.Id !== p.config.expectedServerId) throw policy.fail('SERVER_ID_MISMATCH');
                emit(p, 'ready');
                return {id, state: p.state, expectedServerMatch: p.config.expectedServerId ? true : 'NOT_CHECKED'};
            } catch (error) {
                if (timedOut) throw policy.fail('NETWORK_TIMEOUT');
                if (['FN_AUTH_REQUIRED', 'ACCESS_CODE_REQUIRED'].includes(error?.code)) throw error;
                if (signal?.aborted || p.lifetime.signal.aborted || p.generation !== generation ||
                    p.authEpoch !== authEpoch || sequence !== p.verifySequence) throw policy.fail('CANCELLED');
                if (['NETWORK_ERROR', 'NETWORK_TIMEOUT', 'CANCELLED', 'RATE_LIMITED', 'ACCESS_DENIED_UNCLASSIFIED',
                    'HTTP_ERROR', 'AUTH_UNVERIFIED', 'INFO_TOO_LARGE', 'INVALID_EMBY_INFO', 'SERVER_ID_MISMATCH',
                    'EXTERNAL_REDIRECT_REVIEW_REQUIRED', 'REDIRECT_LOOP', 'REDIRECT_REJECTED'].includes(error?.code)) throw error;
                throw policy.fail('INFO_STREAM_FAILED');
            } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); response?.dispose?.(); }
        },
        request(id, {path, headers = {}, signal, kind = 'api'} = {}) {
            const p = ready(id);
            if (!['api', 'media'].includes(kind)) throw policy.fail('INVALID_REQUEST_KIND');
            return exchange(p, policy.target(p.config, path, mode), headers, signal, kind);
        },
        showTarget(id) {
            const p = get(id);
            if (!p.window || !['authorizing', 'needs-auth', 'ready'].includes(p.state)) throw policy.fail('AUTH_NOT_STARTED');
            p.window.showTarget();
        },
        async webSocket(id, {path, headers, signal}) {
            const p = ready(id), address = policy.target(p.config, path, mode), scope = owned(p, signal);
            let result;
            try {
                const safeHeaders = policy.wsHeaders(headers, p.config.emby.origin);
                result = await io.openWebSocket(p.session, {url: address.href, headers: safeHeaders, signal: scope.signal});
                scope.check();
                if (result.statusCode !== 101) {
                    const challenge = policy.challenge(result, p.config, mode);
                    result.socket?.destroy();
                    if (challenge) { requireAuth(p, challenge); throw policy.fail(challenge); }
                    throw policy.fail('WS_UPGRADE_REJECTED');
                }
                result.socket.once('close', scope.cleanup);
                result.socket.once('error', scope.cleanup);
                return result;
            } catch (error) {
                result?.socket?.destroy();
                scope.cleanup();
                if (['FN_AUTH_REQUIRED', 'ACCESS_CODE_REQUIRED'].includes(error?.code)) throw error;
                if (scope.signal.aborted) throw policy.fail('CANCELLED');
                throw policy.fail(['FN_AUTH_REQUIRED', 'ACCESS_CODE_REQUIRED', 'WS_PROXY_UNSUPPORTED',
                    'WS_UPGRADE_REJECTED', 'HEADER_NOT_ALLOWED', 'WS_ORIGIN_NOT_ALLOWED'].includes(error?.code) ? error.code : 'WS_NETWORK_ERROR');
            }
        },
        snapshot(id) { const p = get(id); return {id, state: p.state, generation: p.generation}; },
        assertReady(id) { return {generation: ready(id).generation}; },
        async close(id) {
            const p = profiles.get(id);
            if (!p) return;
            if (p.closing) return p.closing;
            const draining = [...p.pending].map(pending => pending.done);
            p.closing = Promise.resolve().then(async () => {
                await Promise.all(draining);
                try { await io.clearSession(p.session); } catch { throw policy.fail('SESSION_CLEAR_FAILED'); }
                profiles.delete(id);
            });
            p.generation++;
            emit(p, 'closed');
            p.lifetime.abort();
            for (const pending of p.pending) pending.abort();
            p.window?.close();
            return p.closing;
        },
        async closeAll() {
            const results = await Promise.allSettled([...profiles.keys()].map(id => controller.close(id)));
            if (results.some(result => result.status === 'rejected')) throw policy.fail('SESSION_CLEAR_FAILED');
        }
    };
    return controller;
}
module.exports = {createController};
