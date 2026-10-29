'use strict';

// Bounded playback evidence only. Never pass source strings, tokens, paths,
// raw validators, cache capabilities or arbitrary exception messages to logs.
const crypto = require('node:crypto');
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const numeric = new Set(['totalBytes','rangeStart','rangeEnd','rangeOrdinal','selectedLocalBytes','queuedLocalBytes','queuedSourceBytes','flushedLocalBytes','flushedSourceBytes','rangeCount','omittedRanges','retainedBytes','preloadedBytes','elapsedMs','positionSeconds','width','height','droppedFrames','omittedEvents','refusedBlocks']);
const booleans = new Set(['preloadEnabled','retainPlayback','coldIndex','complete','preparedHandoff','fallbackOriginal','decoderObserved']);
const enums = {
    sourceClass: ['emby-http','resolved-http','legacy'],
    property: ['video-codec','hwdec-current','video-out-params','decoder-frame-drop-count'],
    codec: ['h264','hevc','vp8','vp9','av1','mpeg2video','mpeg4','vc1'],
    hardware: ['no','auto','d3d11va','d3d11va-copy','dxva2','dxva2-copy','cuda','nvdec','nvdec-copy','videotoolbox','videotoolbox-copy','vaapi','vaapi-copy','vdpau'],
    pixelFormat: ['p010','p010le','nv12','yuv420p','yuv420p10le','yuv444p','yuv444p10le','yuv422p','yuv422p10le','bgra','bgr0','rgba','rgb0','d3d11'],
    role: ['current','next'], route: ['proxy','original','idle'], method: ['GET','HEAD'],
    phase: ['budget','adapter','source-probe','backend','metadata'],
    validator: ['strong-etag','weak-etag','last-modified-only','none'],
    reason: ['timeout','cancelled','request-cancelled','generation-retired','representation-changed','access-refused','source-unavailable','source-proof-invalid','origin-range','origin-short-body','origin-long-body','origin-timeout','origin-unavailable','cache-unavailable','cache-io','queue-full','stale-read','invalid-span','invalid-hole','unexpected','version-changed','actual-advanced','next-cancelled','actual-media-changed','retention-disabled','unplayed-next','metadata-limit','policy','integrity-mismatch','block-unavailable']
};
const events = new Set(['play-open','selection','play-end','adapter-open','adapter-failed','route-open','index-ready','source-headers','source-refused','range-end','route-end','preload-complete','entry-retired','actual-promoted','actual-preserved','store-close','block-refused','file-loaded','core-playing','playback-restart','end-file','decode-state','seek-requested']);
function version(metadata) {
    const value = metadata || {}, strong = typeof value.etag === 'string' && /^"[\x21\x23-\x7e]{1,255}"$/.test(value.etag);
    const meta = {total: value.total};
    for (const field of ['etag','lastModified','version']) if (typeof value[field] === 'string') meta[field] = crypto.createHash('sha256').update(value[field]).digest('hex');
    return {versionHash: storedVersion(meta),
        validator: strong ? 'strong-etag' : typeof value.etag === 'string' && value.etag.startsWith('W/') ? 'weak-etag' : value.lastModified ? 'last-modified-only' : 'none'};
}
function decoder(name, value) {
    if (name === 'video-codec' && enums.codec.includes(value)) return {codec: value, property: name};
    if (name === 'hwdec-current' && enums.hardware.includes(value)) return {hardware: value, property: name};
    if (name === 'decoder-frame-drop-count' && Number.isSafeInteger(value) && value >= 0) return {droppedFrames: value, property: name};
    if (name === 'video-out-params' && value && enums.pixelFormat.includes(value.pixelformat)) {
        const result = {pixelFormat: value.pixelformat, property: name};
        if (Number.isSafeInteger(value.w) && value.w > 0) result.width = value.w;
        if (Number.isSafeInteger(value.h) && value.h > 0) result.height = value.h;
        return result;
    }
    return null;
}
function storedVersion(meta) {return digest(['total','etag','lastModified','version'].map(k => meta[k] ?? null));}
function create(sink, identity) {
    if (typeof sink !== 'function') return () => {};
    const value = identity || {};
    const server = value.server ?? digest([value.serverOrigin ?? null, value.serverId ?? null]);
    const media = [server, value.account ?? value.accountId ?? null, value.item ?? value.itemId ?? null, value.mediaSource ?? value.mediaSourceId ?? null];
    const known = field => typeof value[field] === 'string' && /^[a-f0-9]{64}$/.test(value[field]) ? value[field] : null;
    const mediaHash = known('knownMediaHash') || digest(media), representationHash = known('knownRepresentationHash') || digest([...media, value.resource ?? value.representation ?? null, value.resource === undefined ? 'authorized-original-bytes-v1' : value.representation]);
    const trace = crypto.randomUUID(), terminal = new Set(); let emitted = 0, omitted = 0;
    return (event, details = {}) => {
        if (!events.has(event)) return;
        if (emitted >= 32 && !['play-end','route-end'].includes(event)) {omitted++; return;}
        if (['play-end','route-end'].includes(event)) {if (terminal.size) return; terminal.add(event);}
        const safe = {schema: 1, trace, mediaHash, representationHash, ...(['play-end','route-end'].includes(event) ? {omittedEvents: omitted} : {})};
        for (const [key, item] of Object.entries(details)) {
            if (numeric.has(key) && Number.isFinite(item) && item >= 0 && item <= Number.MAX_SAFE_INTEGER) safe[key] = item;
            else if (booleans.has(key) && typeof item === 'boolean') safe[key] = item;
            else if (enums[key]?.includes(item)) safe[key] = item;
            else if (['versionHash','generationHash'].includes(key) && typeof item === 'string' && /^[a-f0-9]{64}$/.test(item)) safe[key] = item;
        }
        emitted++;
        try {const pending = sink({event, details: safe}); if (pending && typeof pending.catch === 'function') pending.catch(() => {});} catch (_) { /* Evidence cannot fail playback. */ }
    };
}
module.exports = {create, version, storedVersion, digest, decoder};
