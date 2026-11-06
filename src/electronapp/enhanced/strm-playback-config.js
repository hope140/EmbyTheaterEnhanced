'use strict';

// A save changes the next playback snapshot. Services and refresh closures belong
// to a playback lease, never to the mutable settings page or a test connection.
const {createHash, randomUUID} = require('node:crypto');
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
function create({store, createService}) {
    let revision = 1, stateRevision = 1, closed = false, current = null;
    const requests = new Map();
    function status() {
        return {stateRevision, savedRevision: revision, playbackRevision: current?.playing ? current.revision : null,
            pendingPlaybackRevision: current && !current.playing ? current.revision : null};
    }
    function retire(record) {
        if (!record || record.closed) return;
        record.closed = true;
        for (const [id, entry] of requests) if (entry.owner === record) {entry.cancelled = true; requests.delete(id);}
        record.contents.removeListener('did-start-navigation', record.navigation);
        record.contents.removeListener('destroyed', record.retire);
        record.contents.removeListener('render-process-gone', record.retire);
        if (current === record) current = null;
        ++stateRevision;
        record.service.close();
    }
    function begin(request, contents) {
        if (closed || !validId(request?.requestId)) return {status: 'error', reason: 'invalid_request'};
        const runtime = store.getRuntimeConfig(), config = store.getPublicConfig();
        // Private scope includes address, credentials, rules and resolver settings.
        // It is never returned to the renderer or written into diagnostics.
        const scope = createHash('sha256').update(JSON.stringify([runtime, config])).digest('hex');
        retire(current);
        const service = createService(runtime, scope);
        const record = {lease: randomUUID(), requestId: request.requestId, revision, scope, service, contents,
            closed: false, playing: false, cancelledIds: new Set(), cancelBudgetExhausted: false};
        record.retire = () => retire(record);
        record.navigation = (details, _url, inPlace, mainFrame) => {
            const main = typeof details?.isMainFrame === 'boolean' ? details.isMainFrame : mainFrame;
            const same = typeof details?.isSameDocument === 'boolean' ? details.isSameDocument : inPlace;
            if (main === true && same !== true) retire(record);
        };
        contents.on('did-start-navigation', record.navigation);
        contents.on('destroyed', record.retire);
        contents.on('render-process-gone', record.retire);
        current = record;
        ++stateRevision;
        return {status: 'ok', lease: record.lease, revision, config};
    }
    function owns(lease, contents) {return !closed && current && !current.closed && current.lease === lease && current.contents === contents;}
    async function resolve(request, principal, contents) {
        if (!owns(request?.configLease, contents) || !validId(request.requestId) || requests.has(request.requestId)) return {status: 'cancelled', reason: 'config_retired'};
        const record = current;
        if (record.cancelBudgetExhausted || record.cancelledIds.has(request.requestId)) return {status: 'cancelled', reason: 'config_retired'};
        const entry = {owner: record, cancelled: false};
        requests.set(request.requestId, entry);
        const clean = {...request}; delete clean.configLease;
        try {
            const result = await record.service.resolve(clean, principal);
            return !entry.cancelled && !record.closed && current === record ? result : {status: 'cancelled', reason: 'config_retired'};
        } finally {if (requests.get(request.requestId) === entry) requests.delete(request.requestId);}
    }
    return {begin, status, resolve,
        started(request, contents) {
            if (owns(request?.lease, contents) && !current.playing) {current.playing = true; ++stateRevision;}
            return status();
        },
        saved() {if (closed) throw Error('config_closed'); ++revision; ++stateRevision; return status();},
        release(request, contents) {if (owns(request?.lease, contents)) retire(current); return {status: 'ok'};},
        cancel(id, contents, lease) {
            if (!owns(lease, contents) || !validId(id)) return;
            const record = current, entry = requests.get(id);
            // send/invoke can reach main in either order. Remember cancellation
            // within this lease; an unknown/old lease cannot poison a new play.
            if (record.cancelledIds.size < 256) record.cancelledIds.add(id);
            else record.cancelBudgetExhausted = true;
            if (entry?.owner === record) {entry.cancelled = true; record.service.cancel(id);}
        },
        scopeFor(label) {if (!closed && current && !current.closed && current.requestId === label) {if (!current.playing) ++stateRevision; current.playing = true; return current.scope;} return null;},
        close() {closed = true; try {retire(current);} finally {requests.clear();}}};
}
module.exports = {create};
