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

function createController({enabled = false, mode = 'live', io, headerTimeoutMs = 10000, verificationTimeoutMs = 10000,
    relayExternalMedia = false} = {}) {
    if (!['live', 'fixture'].includes(mode)) throw policy.fail('INVALID_MODE');
    if (typeof relayExternalMedia !== 'boolean' || relayExternalMedia && typeof io?.openAnonymousMedia !== 'function') throw policy.fail('ANONYMOUS_MEDIA_UNAVAILABLE');
    const profiles = new Map(), listeners = new Set();
    const lifecycleEvents = new Set(['WINDOW_CREATED', 'BOOTSTRAP_LOAD_STARTED', 'BOOTSTRAP_LOAD_FAILED', 'TARGET_LOAD_STARTED',
        'TARGET_LOAD_FAILED', 'NATIVE_CLOSE_REQUEST', 'CONTENT_CLOSE_REQUEST', 'MAIN_HANDLE_CLOSE', 'LIFETIME_ABORT',
        'RENDER_PROCESS_GONE', 'WINDOW_CLOSED', 'VERIFY_STARTED', 'VERIFY_READY', 'VERIFY_FAILED']);
    const lifecycleCodes = new Set(['OTHER', 'ERR_ABORTED', 'ERR_FAILED', 'ERR_CONNECTION_REFUSED', 'ERR_CONNECTION_RESET',
        'ERR_CONNECTION_CLOSED', 'ERR_CONNECTION_TIMED_OUT', 'ERR_TIMED_OUT', 'ERR_NAME_NOT_RESOLVED', 'ERR_PROXY_CONNECTION_FAILED',
        'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_INVALID_ARGUMENT', 'ERR_INVALID_ARG_TYPE', 'ERR_INVALID_ARG_VALUE',
        'ERR_CERT_AUTHORITY_INVALID', 'ERR_CERT_COMMON_NAME_INVALID', 'ERR_CERT_DATE_INVALID', 'ERR_SSL_PROTOCOL_ERROR',
        'CLEAN_EXIT', 'ABNORMAL_EXIT', 'KILLED', 'CRASHED', 'OOM', 'LAUNCH_FAILED', 'INTEGRITY_FAILURE',
        'CANCELLED', 'NETWORK_ERROR', 'NETWORK_TIMEOUT', 'RATE_LIMITED', 'ACCESS_DENIED_UNCLASSIFIED', 'HTTP_ERROR',
        'AUTH_UNVERIFIED', 'INFO_TOO_LARGE', 'INVALID_EMBY_INFO', 'SERVER_ID_MISMATCH', 'FN_AUTH_REQUIRED', 'ACCESS_CODE_REQUIRED']);
    function observeWindow(p, value, generation) {
        if (value?.event === 'PREARM_BLOCKED') {
            const inSet = (key, values) => values.includes(value[key]) ? value[key] : 'OTHER';
            const entry = Object.freeze({generation,
                stage: inSet('stage', ['BEFORE_REQUEST', 'BEFORE_SEND_HEADERS', 'HEADERS_RECEIVED']),
                sourceClass: inSet('sourceClass', ['APPROVED_FN', 'EMBY', 'OTHER']),
                resourceType: inSet('resourceType', ['mainFrame', 'subFrame', 'stylesheet', 'script', 'image', 'font', 'object', 'xhr', 'ping', 'cspReport', 'media', 'webSocket', 'other']),
                mimeClass: inSet('mimeClass', ['NOT_OBSERVED', 'JSON', 'HTML', 'SCRIPT', 'BYTES', 'AUDIO', 'VIDEO', 'PLAYLIST', 'OTHER']),
                reason: inSet('reason', ['MEDIA_RESOURCE', 'APPROVED_CDN', 'PLAYBACK_INFO', 'EMBY_EXTERNAL', 'INVALID_URL', 'MEDIA_MIME', 'PARTIAL_STATUS']),
                status: Number.isInteger(value.status) && value.status >= 100 && value.status <= 599 ? value.status : null});
            const count = Math.min((p.preArmBlocks?.count || 0) + 1, 32);
            p.preArmBlocks = Object.freeze({count, capped: count === 32, first: p.preArmBlocks?.first || entry});
            const event = Object.freeze({id: p.id, state: p.state, preArmBlocks: p.preArmBlocks});
            for (const listener of listeners) { try { listener(event); } catch {} }
            return;
        }
        if (!lifecycleEvents.has(value?.event)) return;
        const entry = {sequence: (p.lifecycleSequence || 0) + 1, generation, event: value.event};
        p.lifecycleSequence = entry.sequence;
        if (value.code !== undefined) entry.code = lifecycleCodes.has(value.code) ? value.code : 'OTHER';
        if (['MAIN_HANDLE', 'LIFETIME_ABORT', 'NATIVE_REQUEST', 'CONTENT_REQUEST', 'UNATTRIBUTED'].includes(value.cause)) entry.cause = value.cause;
        p.lifecycleTrace = [...(p.lifecycleTrace || []), Object.freeze(entry)].slice(-16);
        const event = Object.freeze({id: p.id, state: p.state, windowLifecycleTrace: Object.freeze([...p.lifecycleTrace]),
            preArmBlocks: p.preArmBlocks || Object.freeze({count: 0, capped: false, first: null})});
        for (const listener of listeners) { try { listener(event); } catch {} }
    }
    function emit(p, state, reason) {
        p.state = state;
        const event = Object.freeze({id: p.id, state, reason: reason || null});
        for (const listener of listeners) { try { listener(event); } catch { /* No external errors in diagnostics. */ } }
        return event;
    }
    function requireAuth(p, reason) {
        p.authEpoch++;
        stopExternalCheck(p, 'AUTH_CHANGE');
        emit(p, 'needs-auth', reason);
        for (const pending of p.pending) pending.abort();
    }
    function stopExternalCheck(p, reason) {
        p.externalCheckAbort?.abort();
        const round = p.externalCheckRound;
        if (!round || round.stopping || typeof io.finalExternalHeaderBudget !== 'function') return;
        round.stopping = true;
        // This final observation retains the original round across retirement.
        // It is deliberately independent of the live generation/epoch filter.
        p.externalBudgetDrain = Promise.resolve().then(() => io.finalExternalHeaderBudget(p.session)).then(budget => {
            if (budget) round.onReport({id: p.id, state: 'media-check', roundId: round.roundId,
                mediaCheck: {event: 'cleanup', result: 'MEDIA_CHECK_BUDGET_STOPPED', stopReason: reason, budget}});
        }).catch(() => {});
    }
    function get(id) {
        if (!enabled) throw policy.fail('FEATURE_DISABLED');
        const p = profiles.get(id);
        if (!p || p.state === 'closed') throw policy.fail('PROFILE_CLOSED');
        return p;
    }
    function ready(id) {
        const p = get(id);
        if (p.transportDrainFailed) throw policy.fail('ANONYMOUS_MEDIA_CLOSE_UNCONFIRMED');
        if (p.state !== 'ready') throw policy.fail('FN_AUTH_NOT_READY'); return p;
    }
    function transition(p, run) {
        if (p.transition) throw policy.fail('PROFILE_OPERATION_PENDING');
        const generation = p.generation, authEpoch = p.authEpoch;
        const check = () => {
            if (p.state === 'closed' || p.generation !== generation || p.authEpoch !== authEpoch || p.lifetime.signal.aborted) throw policy.fail('CANCELLED');
        };
        const work = Promise.resolve().then(async () => {
            try { check(); return await run(check); }
            finally { if (p.transition === work) p.transition = null; }
        });
        p.transition = work;
        return work;
    }
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
    async function exchange(p, address, inputHeaders, signal, kind, method = 'GET') {
        const requestHeaders = policy.headers(inputHeaders), scope = owned(p, signal);
        let response, timer, earlyBodyFailed = false, releaseEarlyBody = () => {};
        function ownBody(value) {
            let retiring;
            const cleanup = () => {
                if (retiring) return retiring;
                if (typeof value.drain !== 'function') { scope.cleanup(); return; }
                retiring = Promise.resolve().then(() => value.drain()).then(scope.cleanup, () => {
                    p.transportDrainFailed = true; scope.cleanup();
                });
                return retiring;
            };
            const abortBody = () => value.body.destroy(policy.fail('CANCELLED'));
            scope.signal.addEventListener('abort', abortBody, {once: true});
            value.body.once('close', () => scope.signal.removeEventListener('abort', abortBody));
            value.body.once('end', cleanup);
            value.body.once('close', cleanup);
            value.body.once('error', cleanup);
            releaseEarlyBody();
            if (value.body.readableEnded || value.body.destroyed) cleanup();
            const dispose = value.dispose;
            value.dispose = () => { dispose?.(); value.body.destroy(); scope.abort(); return cleanup(); };
            return value;
        }
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
                    response = await io.request(p.session, {url: current.href, method,
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
                    return ownBody(response);
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
                if (relayExternalMedia) {
                    response = await io.openAnonymousMedia(p.session, {url: next.href, method,
                        allowedOrigins: [...p.config.externalMediaOrigins], forbiddenOrigins: [...p.config.authOrigins],
                        headers: requestHeaders, knownSecrets: secrets, signal: scope.signal});
                    scope.check();
                    return ownBody(response);
                }
                scope.cleanup();
                // Main-only review metadata. The player bridge refuses to pass
                // this Location to a consumer without per-hop authorization.
                return policy.externalRedirect(next);
            }
            throw policy.fail('REDIRECT_REJECTED');
        } catch (error) {
            releaseEarlyBody();
            response?.body?.destroy();
            if (response?.drain) {
                try { await response.drain(); } catch { p.transportDrainFailed = true; error = policy.fail('ANONYMOUS_MEDIA_CLOSE_UNCONFIRMED'); }
            }
            if (error?.code === 'ANONYMOUS_MEDIA_CLOSE_UNCONFIRMED') p.transportDrainFailed = true;
            scope.cleanup();
            if (earlyBodyFailed) throw policy.fail('UPSTREAM_STREAM_FAILED');
            if (error?.code && ['CANCELLED', 'NETWORK_TIMEOUT', 'NETWORK_ERROR', 'FN_AUTH_REQUIRED', 'ACCESS_CODE_REQUIRED',
                'REDIRECT_LOOP', 'REDIRECT_REJECTED', 'EXTERNAL_REDIRECT_REVIEW_REQUIRED', 'CREDENTIAL_REDIRECT_BLOCKED',
                'TARGET_OUT_OF_SCOPE', 'HTTPS_REQUIRED', 'INVALID_ADDRESS', 'ANONYMOUS_MEDIA_UA_UNCONFIRMED',
                'ANONYMOUS_MEDIA_IF_RANGE_UNSUPPORTED', 'ANONYMOUS_MEDIA_RANGE_INVALID', 'ANONYMOUS_MEDIA_SCOPE_INVALID',
                'ANONYMOUS_MEDIA_PROXY_UNSUPPORTED', 'ANONYMOUS_MEDIA_TIMEOUT', 'ANONYMOUS_MEDIA_NETWORK_ERROR', 'ANONYMOUS_MEDIA_FAILED',
                'ANONYMOUS_MEDIA_STREAM_FAILED', 'ANONYMOUS_MEDIA_CLOSE_UNCONFIRMED'].includes(error.code)) throw error;
            throw policy.fail('REQUEST_FAILED');
        }
    }
    const controller = {
        onState(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        add(input, {storage} = {}) {
            if (!enabled) throw policy.fail('FEATURE_DISABLED');
            const config = policy.config(input, mode), id = randomBytes(18).toString('hex');
            let session;
            try { session = io.createSession(id, storage); } catch (error) { storage?.release(); throw error; }
            const p = {id, config, session, storage, generation: 0, authEpoch: 0, verifySequence: 0, pending: new Set(),
                lifetime: new AbortController(), window: null, state: 'draft', roundId: 0, transition: null};
            profiles.set(id, p);
            emit(p, 'draft');
            return id;
        },
        async start(id) {
            const p = get(id);
            p.generation++;
            stopExternalCheck(p, 'LOGIN_RESTART');
            for (const pending of p.pending) pending.abort();
            if (p.window) p.window.close();
            const generation = p.generation;
            emit(p, 'authorizing');
            const window = await io.openLogin(p.session, p.config, {signal: p.lifetime.signal,
                onLifecycle: value => observeWindow(p, value, generation),
                onCancel() { if (p.generation === generation && !['ready', 'closed'].includes(p.state)) void controller.close(id).catch(() => {}); }});
            if (generation !== p.generation || p.state === 'closed') { window.close(); throw policy.fail('CANCELLED'); }
            p.window = window;
            return {id, state: p.state};
        },
        async verify(id, {signal} = {}) {
            const p = get(id);
            if (!['authorizing', 'needs-auth', 'ready'].includes(p.state)) throw policy.fail('AUTH_NOT_STARTED');
            const generation = p.generation, authEpoch = p.authEpoch, sequence = ++p.verifySequence;
            observeWindow(p, {event: 'VERIFY_STARTED'}, generation);
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
                observeWindow(p, {event: 'VERIFY_READY'}, generation);
                emit(p, 'ready');
                return {id, state: p.state, expectedServerMatch: p.config.expectedServerId ? true : 'NOT_CHECKED'};
            } catch (error) {
                observeWindow(p, {event: 'VERIFY_FAILED', code: timedOut ? 'NETWORK_TIMEOUT' : error?.code}, generation);
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
        request(id, {path, headers = {}, signal, kind = 'api', method = 'GET'} = {}) {
            const p = ready(id);
            if (!['api', 'media'].includes(kind)) throw policy.fail('INVALID_REQUEST_KIND');
            if (method !== 'GET' && !(kind === 'media' && method === 'HEAD')) throw policy.fail('METHOD_REJECTED');
            return exchange(p, policy.target(p.config, path, mode), headers, signal, kind, method);
        },
        showTarget(id) {
            const p = get(id);
            if (!p.window || !['authorizing', 'needs-auth', 'ready'].includes(p.state)) throw policy.fail('AUTH_NOT_STARTED');
            p.window.showTarget();
        },
        armMediaCheck(id, {onReport = () => {}} = {}) {
            const p = ready(id), generation = p.generation, authEpoch = p.authEpoch, roundId = p.roundId + 1;
            if (typeof io.armMediaCheck !== 'function') throw policy.fail('MEDIA_CHECK_UNAVAILABLE');
            io.armMediaCheck(p.session, p.config, {webContentsId: p.window?.webContentsId, onReport(value) {
                if (p.generation === generation && p.authEpoch === authEpoch && p.state !== 'closed') onReport({id, state: 'media-check', roundId, mediaCheck: value});
            }});
            p.roundId = roundId;
            return {id, state: 'media-check-armed', roundId};
        },
        armExternalHeaderCheck(id, {onReport = () => {}} = {}) {
            const p = ready(id), authEpoch = p.authEpoch, roundId = p.roundId + 1;
            if (typeof io.armExternalHeaderCheck !== 'function' || typeof io.reserveExternalHeaderCheck !== 'function') throw policy.fail('EXTERNAL_PROBE_DISABLED');
            if (p.transition) throw policy.fail('PROFILE_OPERATION_PENDING');
            io.reserveExternalHeaderCheck(p.session);
            const externalAbort = new AbortController();
            p.externalCheckAbort = externalAbort;
            p.externalCheckRound = {roundId, onReport, stopping: false};
            return transition(p, async check => {
                check();
                const oldWindow = p.window;
                const generation = ++p.generation;
                const current = () => {
                    if (p.state === 'closed' || p.generation !== generation || p.authEpoch !== authEpoch || externalAbort.signal.aborted) throw policy.fail('CANCELLED');
                };
                emit(p, 'external-check-preparing');
                const pending = [...p.pending]; for (const owner of pending) owner.abort();
                await Promise.all([Promise.resolve(oldWindow?.close()), ...pending.map(owner => owner.done)]);
                if (p.window === oldWindow) p.window = null;
                current();
                let terminalObserved = false;
                const window = await io.openLogin(p.session, p.config, {signal: p.lifetime.signal, deferNavigation: true,
                    onLifecycle: value => observeWindow(p, value, generation),
                    onCancel() {
                        if (p.generation !== generation || p.state === 'closed' || terminalObserved) return;
                        stopExternalCheck(p, 'MEDIA_WINDOW_CLOSED');
                        if (p.state !== 'ready') void controller.close(id).catch(() => {});
                        else onReport({id, state: 'media-check-aborted', roundId, reason: 'MEDIA_WINDOW_CLOSED'});
                    }});
                try { current(); } catch (error) { await window.close(); throw error; }
                p.window = window;
                await io.armExternalHeaderCheck(p.session, p.config, {webContentsId: window.webContentsId, signal: externalAbort.signal, onReport(value) {
                    if (p.generation === generation && p.authEpoch === authEpoch && p.state !== 'closed') {
                        if (value.event === 'terminal') terminalObserved = true;
                        onReport({id, state: 'media-check', roundId, mediaCheck: value});
                    }
                }});
                current(); p.roundId = roundId;
                emit(p, 'ready');
                window.showTarget();
                return {id, state: 'media-check-armed', roundId};
            });
        },
        prepareNextCheck(id) {
            const p = ready(id), authEpoch = p.authEpoch;
            if (typeof io.prepareMediaCheck !== 'function' || typeof io.rearmMediaCheck !== 'function') throw policy.fail('MEDIA_CHECK_UNAVAILABLE');
            return transition(p, async check => {
                // The observer verifies a genuine terminal and completed socket
                // closure first. Its existing source gate remains frozen.
                await io.prepareMediaCheck(p.session); check();
                const oldWindow = p.window; p.window = null;
                // Suppress this owned window retirement's old onCancel callback.
                p.generation++;
                const generation = p.generation;
                emit(p, 'check-preparing');
                const pending = [...p.pending];
                for (const owner of pending) owner.abort();
                await Promise.all([Promise.resolve(oldWindow?.close()), ...pending.map(owner => owner.done)]);
                if (p.state === 'closed' || p.generation !== generation || p.authEpoch !== authEpoch) throw policy.fail('CANCELLED');
                emit(p, 'check-prepared');
                return {id, state: 'check-prepared', roundId: p.roundId};
            });
        },
        reopenCheck(id, {onReport = () => {}} = {}) {
            const p = get(id);
            if (p.state !== 'check-prepared') throw policy.fail('MEDIA_CHECK_NOT_PREPARED');
            return transition(p, async check => {
                const generation = p.generation, authEpoch = p.authEpoch, roundId = p.roundId + 1;
                // Construct a blank replacement page first. No login/bootstrap
                // request is made, and the authenticated Session is unchanged.
                const window = await io.openLogin(p.session, p.config, {signal: p.lifetime.signal,
                    onLifecycle: value => observeWindow(p, value, generation),
                    deferNavigation: true, onCancel() {
                        if (p.generation === generation && !['ready', 'closed'].includes(p.state)) void controller.close(id).catch(() => {});
                    }});
                try { check(); } catch (error) { await window.close(); throw error; }
                p.window = window;
                io.rearmMediaCheck(p.session, {webContentsId: window.webContentsId, onReport(value) {
                    if (p.generation === generation && p.authEpoch === authEpoch && p.state !== 'closed') onReport({id, state: 'media-check', roundId, mediaCheck: value});
                }});
                p.roundId = roundId;
                emit(p, 'ready');
                window.showTarget(); // Only this explicit UI action navigates.
                return {id, state: 'media-check-armed', roundId};
            });
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
        async close(id, {forget = false} = {}) {
            const p = profiles.get(id);
            if (!p) return;
            if (p.closing) {
                if (forget && !p.forgetting) throw policy.fail('PROFILE_ALREADY_CLOSING');
                return p.closing;
            }
            p.forgetting = forget;
            const draining = [...p.pending].map(pending => pending.done);
            const transitioning = p.transition;
            const closingWindow = Promise.resolve().then(() => p.window?.close());
            p.closing = Promise.resolve().then(async () => {
                await Promise.all([...draining, transitioning?.catch(() => {}), closingWindow]);
                await p.externalBudgetDrain;
                if (p.transportDrainFailed) throw policy.fail('ANONYMOUS_MEDIA_CLOSE_UNCONFIRMED');
                try {
                    if (p.storage?.persistent && !forget) await io.preserveSession(p.session);
                    else await io.clearSession(p.session);
                    if (forget) p.storage?.forget();
                    p.storage?.release();
                } catch { throw policy.fail('SESSION_CLEAR_FAILED'); }
                profiles.delete(id);
            });
            p.generation++;
            emit(p, 'closed');
            stopExternalCheck(p, 'CONNECTION_CLOSED');
            p.lifetime.abort();
            for (const pending of p.pending) pending.abort();
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
