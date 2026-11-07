'use strict';

// Main-owned bridge between the existing Emby identity and final Native source.
// No renderer cookie jar, password storage, polling, or alternative login flow.
const {randomBytes} = require('node:crypto');
const policy = require('./core/policy.cjs');
const {createController} = require('./core/controller.cjs');
const {createBridge} = require('./core/bridge.cjs');
const {createApiBridge} = require('./api-bridge.cjs');
const carriers = require('./identity.cjs');

function identity(value) {
    if (!value || Object.keys(value).some(key => !['serverId', 'accountId', 'serverAddress', 'token'].includes(key)) ||
        ['serverId', 'accountId', 'serverAddress', 'token'].some(key => typeof value[key] !== 'string' ||
            !value[key] || value[key].length > 16384 || /[\x00-\x1f\x7f]/.test(value[key]))) throw policy.fail('FN_IDENTITY_INVALID');
    const output = {...value};
    try { const u = new URL(value.serverAddress); if (!u.pathname.endsWith('/')) u.pathname += '/'; output.serverAddress = u.href; } catch { throw policy.fail('FN_IDENTITY_INVALID'); }
    return output;
}
function same(a, b) { return a && b && ['serverId', 'accountId', 'serverAddress', 'token'].every(key => a[key] === b[key]); }
function createService({enabled = false, mode = 'live', io, controller: suppliedController, bridgeFactory = createBridge} = {}) {
    const controller = enabled ? suppliedController || createController({enabled: true, mode, io, relayExternalMedia: true, allowApiWrites: true}) : null;
    const records = new Map(), leases = new Map(), sources = new Map(), configuredOrigins = new Set();
    let bridgePromise, closed = false, closing;
    function available() { if (!enabled || closed) throw policy.fail('FN_CONNECT_DISABLED'); }
    function record(id, retiring = false) { available(); const r = records.get(id); if (!r || r.closed || r.documentRetired && !retiring) throw policy.fail('FN_PROFILE_UNKNOWN'); return r; }
    function retire(r, exceptRequest) {
        r.epoch++; r.binding?.abort(); r.context = null;
        if (r.accountId) r.api?.cancel(exceptRequest);
        for (const ticket of sources.values()) if (ticket.id === r.id) ticket.cancelled = true;
        for (const [key, lease] of leases) if (lease.id === r.id) { lease.value.revoke(); leases.delete(key); }
    }
    function matching(context) {
        let address;
        try { address = new URL(context.serverAddress); } catch { return []; }
        if (!['http:', 'https:'].includes(address.protocol) || address.username || address.password || address.search || address.hash) return [];
        if (!address.pathname.endsWith('/')) address.pathname += '/';
        return [...records.values()].filter(r => !r.closed && r.config.emby.href === address.href);
    }
    const off = controller?.onState(event => {
        if (event.state === 'ready') return;
        const r = records.get(event.id); if (r) retire(r);
    });
    return {
        capabilities() { return {enabled: enabled && !closed, persistentLogin: false}; },
        async open(input) {
            available();
            if (records.size >= 16) throw policy.fail('FN_PROFILE_LIMIT');
            // Match the retained ConnectionManager/ApiClient server-base
            // contract. Their getUrl appends /emby/; do not infer a root from
            // a Web page path or confuse the server base with that API child.
            const connection = {...input, probePath: input?.probePath || 'emby/System/Info/Public'};
            const config = policy.config(connection, mode), id = controller.add(connection);
            configuredOrigins.add(config.emby.origin);
            const r = {id, config, epoch: 0, context: null, binding: null, accountId: null, closed: false};
            records.set(id, r);
            try { await controller.start(id); available(); return {id, state: 'authorizing'}; }
            catch (error) { r.closed = true; await controller.close(id); records.delete(id); error.profileId = id; throw error; }
        },
        async verify(id) {
            const r = record(id); retire(r);
            return controller.verify(id);
        },
        async route(id) {
            const r = record(id); controller.assertReady(id);
            if (!r.apiPromise) r.apiPromise = createApiBridge(controller, {id, config: r.config, mode,
                onLogout(owner) { r.accountId ||= 'RETIRED'; retire(r, owner); },
                authorize(address, headers) {
                    if (r.closed || closed || r.documentRetired) return false;
                    if (!r.accountId) {
                        const values = carriers.tokens(address, headers);
                        if (!values || values.some(value => typeof value !== 'string' || !value)) return false;
                        if (r.provisionalToken && values.some(value => value !== r.provisionalToken)) return false;
                        if (r.provisionalToken && /\/users\/(?:authenticatebyname|authenticatewithquickconnect)\/?$/i.test(address.pathname)) return false;
                        if (values.length) {
                            if (values.some(value => value !== values[0])) return false;
                            r.provisionalToken ||= values[0];
                        }
                        return true;
                    }
                    if (!r.context) return false;
                    return !/\/users\/(?:authenticatebyname|authenticatewithquickconnect)\/?$/i.test(address.pathname) &&
                        carriers.matches(address, headers, r.context.token);
                }}).then(api => { r.api = api; return api; });
            const api = await r.apiPromise;
            if (r.closed || r.documentRetired || closed) { await api.close(); throw policy.fail('CANCELLED'); }
            return {id, remoteBase: r.config.emby.href, apiBase: api.base};
        },
        async bind(id, value) {
            const r = record(id), context = identity(value);
            if (!matching(context).includes(r) || controller.verifiedServer(id) !== context.serverId) throw policy.fail('FN_SERVER_MISMATCH');
            if (r.accountId && r.accountId !== context.accountId) { retire(r); throw policy.fail('FN_ACCOUNT_PROFILE_MISMATCH'); }
            if (!r.accountId && r.provisionalToken && r.provisionalToken !== context.token) throw policy.fail('FN_ACCOUNT_PROFILE_MISMATCH');
            if (same(r.context, context)) return {id, state: 'bound'};
            retire(r);
            const epoch = r.epoch, abort = new AbortController(); r.binding = abort; r.bindingContext = context;
            const timer = setTimeout(() => abort.abort(), 10000);
            let response;
            try {
                response = await controller.request(id, {path: 'emby/Users/' + encodeURIComponent(context.accountId),
                    headers: {accept: 'application/json', 'X-Emby-Token': context.token}, signal: abort.signal});
                if (response.statusCode !== 200 || !policy.header(response, 'content-type').toLowerCase().includes('application/json')) throw policy.fail('FN_ACCOUNT_UNVERIFIED');
                const chunks = []; let size = 0;
                for await (const chunk of response.body) {
                    size += chunk.length; if (size > 262144) throw policy.fail('FN_ACCOUNT_UNVERIFIED'); chunks.push(chunk);
                }
                let user;
                try { user = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw policy.fail('FN_ACCOUNT_UNVERIFIED'); }
                if (user?.Id !== context.accountId || user.ServerId && user.ServerId !== context.serverId) throw policy.fail('FN_ACCOUNT_UNVERIFIED');
                if (r.closed || closed || abort.signal.aborted || r.epoch !== epoch) throw policy.fail('CANCELLED');
                r.context = context; r.accountId = context.accountId; r.provisionalToken = context.token;
                return {id, state: 'bound'};
            } finally { clearTimeout(timer); response?.dispose?.(); if (r.binding === abort) { r.binding = null; r.bindingContext = null; } }
        },
        observeIdentity(value) {
            if (!enabled || closed) return;
            // Called before the renderer changes active server/user/token. Never
            // wait for network or a timer to retire old Native capabilities.
            let context = null; if (value !== null) context = identity(value);
            for (const r of records.values()) {
                if ((r.context || r.bindingContext) && !same(r.context || r.bindingContext, context)) retire(r);
                else if (!r.context && !r.bindingContext && r.api && (!context || !matching(context).includes(r) ||
                    r.provisionalToken && r.provisionalToken !== context.token)) {
                    if (r.provisionalToken) r.accountId ||= 'RETIRED'; retire(r); r.api.cancel();
                }
            }
        },
        async switchIdentity(value, preferredId) {
            available(); const context = identity(value), retired = [];
            const preferred = preferredId === undefined ? null : record(preferredId);
            if (preferred && (!matching(context).includes(preferred) || controller.verifiedServer(preferredId) !== context.serverId)) throw policy.fail('FN_SERVER_MISMATCH');
            for (const r of records.values()) if (r.context && !same(r.context, context) ||
                r.bindingContext && !same(r.bindingContext, context) || r.provisionalToken && r.provisionalToken !== context.token ||
                preferred && r.id !== preferred.id && (r.context || r.bindingContext || r.provisionalToken)) retired.push(r.id);
            this.observeIdentity(context);
            if (preferred) for (const id of retired) {
                const r = records.get(id);
                // A provisional route must stay retired even when the server
                // issues the same token to the newly selected profile.
                r.accountId ||= 'RETIRED'; retire(r); r.api?.cancel();
            }
            await Promise.all(retired.map(id => controller.retireRequests(id)));
        },
        documentRetired() {
            for (const r of records.values()) {
                r.documentRetired = true; retire(r); r.api?.cancel();
                r.retirement ||= controller.close(r.id); r.retirement.catch(() => {});
            }
        },
        async source({context: input, source, requestId}) {
            available(); const context = identity(input), candidates = matching(context);
            if (!candidates.length) {
                let origin; try { origin = new URL(context.serverAddress).origin; } catch {}
                if (configuredOrigins.has(origin)) throw policy.fail('FN_SERVER_MISMATCH');
                return {matched: false};
            }
            const matches = candidates.filter(r => same(r.context, context));
            if (matches.length !== 1) throw policy.fail('FN_ACCOUNT_NOT_BOUND');
            const r = matches[0], epoch = r.epoch;
            if (!Number.isSafeInteger(requestId) || requestId < 1) throw policy.fail('FN_REQUEST_INVALID');
            const address = policy.target(r.config, r.api && typeof source === 'string' && source.startsWith(r.api.base) ? r.api.remote(source) : source, mode);
            if (!carriers.matches(address, {}, context.token)) throw policy.fail('FN_IDENTITY_CARRIER_MISMATCH');
            if (sources.has(requestId)) throw policy.fail('FN_REQUEST_PENDING');
            const ticket = {id: r.id, cancelled: false}; sources.set(requestId, ticket);
            try {
                if (!bridgePromise) bridgePromise = bridgeFactory(controller, {enabled: true});
                const bridge = await bridgePromise;
                if (ticket.cancelled || closed || r.closed || epoch !== r.epoch || !same(r.context, context)) throw policy.fail('CANCELLED');
                const key = randomBytes(24).toString('hex');
                const value = bridge.lease(r.id, {path: address.href, headers: {
                    'X-Emby-Token': context.token, 'User-Agent': controller.requestUserAgent(r.id)
                }});
                leases.set(key, {id: r.id, requestId, value});
                return {matched: true, leaseId: key, url: value.url};
            } finally { if (sources.get(requestId) === ticket) sources.delete(requestId); }
        },
        cancel(requestId) {
            const ticket = sources.get(requestId); if (ticket) ticket.cancelled = true;
            for (const [key, lease] of leases) if (lease.requestId === requestId) lease.value.revoke();
        },
        release(leaseId) {
            const lease = leases.get(leaseId);
            if (lease) return Promise.resolve(lease.value.revoke()).then(() => { if (leases.get(leaseId) === lease) leases.delete(leaseId); });
        },
        async remove(id) {
            const r = record(id, true); r.closed = true; retire(r);
            if (r.apiPromise) await (await r.apiPromise).close();
            await controller.close(id); records.delete(id);
        },
        close() {
            if (closing) return closing;
            closed = true; off?.();
            for (const r of records.values()) { r.closed = true; retire(r); }
            closing = (async () => {
                const result = await Promise.allSettled([controller?.closeAll(), bridgePromise?.then(b => b.close()),
                    ...[...records.values()].map(r => r.retirement),
                    ...[...records.values()].filter(r => r.apiPromise).map(r => r.apiPromise.then(api => api.close()))]);
                if (result.some(r => r.status === 'rejected')) throw policy.fail('FN_CLOSE_UNCONFIRMED');
                records.clear();
            })();
            return closing;
        }
    };
}
module.exports = {createService};
