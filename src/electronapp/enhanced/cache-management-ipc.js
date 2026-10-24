'use strict';
const boundary = require('./renderer-boundary');
const CHANNELS = Object.freeze({STATUS: 'enhanced-http-cache-status', CLEAR: 'enhanced-http-cache-clear'});
function register({ipcMain, getWebContents}) {
    let closed = false, read = null, clear = null, readSession = null, clearSession = null;
    const operations = new Set();
    function track(work) {
        const promise = Promise.resolve().then(work).catch(() => ({status: 'error', reason: 'http_cache_unavailable'}));
        operations.add(promise);
        promise.then(() => operations.delete(promise));
        return promise;
    }
    async function size(session) {
        if (!session || typeof session.getCacheSize !== 'function') throw Error();
        const bytes = await session.getCacheSize();
        if (!Number.isSafeInteger(bytes) || bytes < 0) throw Error();
        return {status: 'ok', bytes};
    }
    function handle(channel, action) {
        ipcMain.handle(channel, function (event, request) {
            const web = getWebContents();
            if (closed) return {status: 'error', reason: 'closed'};
            if (!boundary.isTrusted(event, web)) return {status: 'error', reason: 'untrusted_sender'};
            if (request !== undefined && request !== null) return {status: 'error', reason: 'invalid_request'};
            try { return action(web.session); }
            catch (_) { return {status: 'error', reason: 'http_cache_unavailable'}; }
        });
    }
    handle(CHANNELS.STATUS, session => {
        if (clear) return {status: 'busy'};
        if (read) return readSession === session ? read : {status: 'busy'};
        readSession = session;
        const work = read = track(() => closed ? {status: 'error', reason: 'closed'} : size(session));
        work.then(() => { if (read === work) read = null; });
        return work;
    });
    handle(CHANNELS.CLEAR, session => {
        if (clear) return clearSession === session ? clear : {status: 'busy'};
        clearSession = session; // One physical operation for repeated trusted requests.
        const preceding = read;
        const work = clear = track(async () => {
            if (preceding) await preceding;
            if (closed) return {status: 'error', reason: 'closed'};
            if (!session || typeof session.clearCache !== 'function') throw Error();
            await session.clearCache(); // HTTP cache only; no storage, credentials or filesystem operations.
            try {
                const result = await size(session);
                return {status: 'cleared', bytes: result.bytes}; // Concurrent network activity may already refill it.
            } catch (_) {
                return {status: 'cleared', measurement: 'unavailable'}; // Do not misreport an already completed clear as failed.
            }
        });
        work.then(() => { if (clear === work) clear = null; });
        return work;
    });
    return function close() {
        closed = true;
        Object.values(CHANNELS).forEach(channel => ipcMain.removeHandler(channel));
        // Electron has no cancellation for an already started clearCache. Keep ownership until it settles.
        return Promise.allSettled(Array.from(operations));
    };
}
module.exports = {CHANNELS, register};
