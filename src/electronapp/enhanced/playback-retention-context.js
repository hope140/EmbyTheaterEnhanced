'use strict';
// Context-only opt-in. No media persistence, dump, replacement or cache sizing.
const crypto = require('node:crypto');
const FIELDS = ['source', 'serverOrigin', 'serverId', 'accountId', 'itemId', 'mediaSourceId', 'playSessionId', 'mode', 'mediaType', 'container', 'live'];
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function parse(value) {
    try {
        if (!value || Object.keys(value).some(k => !FIELDS.includes(k)) || !['DirectPlay', 'DirectStream'].includes(value.mode) || value.mediaType !== 'Video' || value.live !== false ||
            ['source', 'serverOrigin', 'serverId', 'accountId', 'itemId', 'mediaSourceId', 'playSessionId', 'container'].some(k => typeof value[k] !== 'string' || !value[k] || value[k].length > (k === 'source' ? 8192 : 2048))) return null;
        const url = new URL(value.source), origin = new URL(value.serverOrigin).origin;
        if (!['http:', 'https:'].includes(url.protocol) || value.serverOrigin !== origin || url.origin !== origin || url.username || url.password || url.hash) return null;
        const fixed = [...url.searchParams].filter(([k]) => k.toLowerCase() === 'static');
        if (fixed.length !== 1 || fixed[0][1].toLowerCase() !== 'true') return null;
        const query = url.search.slice(1).split('&').filter(part => !['api_key', 'x-emby-token', 'playsessionid'].includes(decodeURIComponent(part.split('=')[0]).toLowerCase())).join('&');
        return {value: {...value}, binding: [origin, value.serverId, value.accountId, value.itemId, value.mediaSourceId, value.mode, url.pathname, query]};
    } catch (_) {return null;}
}
function create({enabled, reader} = {}) {
    if (enabled !== true) return null;
    reader ||= require('./playback-range-http').createReader({timeoutMs: 2000});
    let current = null, epoch = 0, closed = false, state = 'idle', retirement = Promise.resolve(); const jobs = new Set();
    const track = promise => {jobs.add(promise); promise.finally(() => jobs.delete(promise)).catch(() => {}); return promise;};
    const owns = r => !closed && current === r && epoch === r.epoch && !r.controller.signal.aborted && !r.helper.exited && !r.helper.transportTerminated && r.helper.currentGenerationId === r.generation;
    function status() {return {enabled: true, mode: 'context-only', state, canReuse: false, reason: 'exact-export-map-unavailable',
        ...(current?.bindingSha256 ? {bindingSha256: current.bindingSha256} : {}), ...(current?.buffer || {})};}
    function retire() {epoch++; const old = current; current = null; state = 'idle'; if (old) old.controller.abort(); retirement = Promise.allSettled([retirement, ...(old?.pending ? [old.pending] : [])]).then(() => undefined); return retirement;}
    function setContext(value, helper, generation) {
        const ticket = epoch + 1, retiring = retire();
        return track((async () => {
            await retiring; const parsed = parse(value);
            if (closed || ticket !== epoch || !parsed || !helper || helper.exited || helper.transportTerminated || helper.currentGenerationId !== generation) return status();
            const record = {parsed, helper, generation, epoch, controller: new AbortController(), dispatched: false}; current = record; state = 'authorizing';
            try {
                record.pending = reader.read({source: parsed.value.source, origin: parsed.value.serverOrigin, start: 0, length: 1, signal: record.controller.signal});
                const proof = await record.pending;
                if (!owns(record)) return status();
                if (!Buffer.isBuffer(proof?.bytes) || proof.bytes.length !== 1 || !Number.isSafeInteger(proof.total) || proof.total <= 0 ||
                    typeof proof.etag !== 'string' || proof.etag.length > 512 || !/^"[\x21\x23-\x7e]+"$/.test(proof.etag)) throw Error('retention-version-unavailable');
                record.bindingSha256 = digest([parsed.binding, proof.etag, proof.total]); state = 'identity-bound';
            } catch (_) {if (owns(record)) state = 'unavailable';}
            return status();
        })());
    }
    function dispatched(source, helper, generation) {
        const record = current;
        if (!record || !record.bindingSha256 || !owns(record) || record.helper !== helper || record.generation !== generation) return false;
        if (record.parsed.value.source !== source) {void retire(); return false;}
        record.dispatched = true; return true;
    }
    function started(helper, generation) {
        const record = current;
        if (!record || !record.bindingSha256 || !record.dispatched || !owns(record) || record.helper !== helper || record.generation !== generation) return Promise.resolve(status());
        return track((async () => {
            try {
                const values = await Promise.all(['demuxer-max-bytes', 'demuxer-max-back-bytes', 'demuxer-donate-buffer', 'cache-on-disk', 'demuxer-cache-state'].map(name => helper.getProperty(name, 2000)));
                if (!owns(record)) return status();
                const [forward, back, donate, disk, cache] = values, ranges = cache?.['seekable-ranges'];
                if (![forward, back].every(v => Number.isSafeInteger(v) && v >= 0) || typeof donate !== 'boolean' || disk !== false ||
                    !cache || !['fw-bytes', 'total-bytes'].every(k => Number.isSafeInteger(cache[k]) && cache[k] >= 0) ||
                    !Array.isArray(ranges) || ranges.length > 32 || ranges.some(r => !Number.isFinite(r.start) || !Number.isFinite(r.end) || r.end < r.start)) throw Error('retention-buffer-unavailable');
                record.buffer = {forwardLimitBytes: forward, backwardLimitBytes: back, donateBuffer: donate, heldForwardBytes: cache['fw-bytes'], heldTotalBytes: cache['total-bytes'], rangeCount: ranges.length};
                state = 'buffer-observed';
            } catch (_) {if (owns(record)) state = 'buffer-unavailable';}
            return status();
        })());
    }
    return {setContext, dispatched, started, status, retire,
        async close() {closed = true; await retire(); await Promise.allSettled([...jobs]); await reader.close();}};
}
module.exports = {create, parse};
