'use strict';
// Owned anonymous synthetic source only. No production source/auth adapter.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
function span(video, audio, duration) {
    if (!audio?.commonMappingWithinOneSample || !Number.isFinite(duration)) throw Error('export-edl-input');
    const start = Math.max(video.sourceStartSeconds, audio.sourceStartSeconds);
    const limit = Math.min(video.sourceEndExclusiveSeconds, audio.sourceEndSeconds, start + duration);
    // End on a complete source-video frame before the remuxer's EOF rounding.
    const end = Math.floor((limit - 1e-9) * 24) / 24;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end - start < .5 || end >= 8 || Math.abs(start * 24 - Math.round(start * 24)) > 1e-6) throw Error('export-edl-input');
    return {start, end, resume: start + (end - start) / 4, total: 8};
}
function description(source, clip, range) {
    const url = new URL(source);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/Videos/A/stream.avi') throw Error('export-edl-input');
    if (!path.isAbsolute(clip) || /[\0\r\n]/.test(clip) || range.total !== 8 || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.start <= 0 || range.end <= range.start || range.end >= 8) throw Error('export-edl-input');
    const quoted = value => '%' + Buffer.byteLength(value, 'utf8') + '%' + value;
    return '# mpv EDL v0\n!no_chapters\n' + quoted(source) + ',0,' + range.start + '\n' +
        quoted(clip) + ',0,' + (range.end - range.start) + '\n' + quoted(source) + ',' + range.end + ',' + (8 - range.end) + '\n';
}
function selectSourcePosition(range, position) {
    if (!Number.isFinite(position) || position < 0 || position >= range.total) return null;
    return position >= range.start && position < range.end ? {segment: 'retained', sourceSeconds: position, localSeconds: position - range.start} : {segment: 'original', sourceSeconds: position};
}
function savedRanges(source, range) {
    const first = Math.round(range.start * 24), end = Math.round(range.end * 24), intervals = [];
    if (source.video.fps !== 24 || first < 0 || end > source.video.packets.length || end <= first) throw Error('export-edl-input');
    for (const p of source.video.packets.slice(first, end)) intervals.push([p.offset, p.offset + p.bytes]);
    const lo = first * 2000, hi = end * 2000;
    for (const r of source.audio.ranges) {
        const a = Math.max(lo, r.sampleStart), b = Math.min(hi, r.sampleStart + r.bytes / 2);
        if (b > a) intervals.push([r.offset + (a - r.sampleStart) * 2, r.offset + (b - r.sampleStart) * 2]);
    }
    return union(intervals);
}
function union(intervals) {
    const merged = [];
    for (const [a, b] of intervals.map(row => [...row]).sort((a, b) => a[0] - b[0])) {
        if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a < 0 || b < a) throw Error('export-edl-input');
        if (a === b) continue;
        const last = merged.at(-1); if (last && a <= last[1]) last[1] = Math.max(last[1], b); else merged.push([a, b]);
    }
    return merged;
}
const bytes = intervals => intervals.reduce((n, [a, b]) => n + b - a, 0);
function overlap(a, b) {let n = 0; for (const [x, y] of union(a)) for (const [u, v] of union(b)) n += Math.max(0, Math.min(y, v) - Math.max(x, u)); return n;}
function network(rows, saved, total) {
    const prefixes = completed => rows.filter(r => r.method === 'GET' && (!completed || r.finished)).map(r => {
        if (!Number.isSafeInteger(r.start) || !Number.isSafeInteger(r.bytesScheduled) || r.start < 0 || r.bytesScheduled < 0 || r.start + r.bytesScheduled > total) throw Error('export-edl-input');
        return [r.start, r.start + r.bytesScheduled];
    });
    const scheduled = union(prefixes(false)), completed = union(prefixes(true)), savedBytes = bytes(saved), scheduledOverlap = overlap(scheduled, saved), completedOverlap = overlap(completed, saved);
    const measured = rows.every(r => r.writeMeasurement === true);
    if (measured && rows.some(r => r.pendingWriteCallbacks !== 0 && (r.closed !== true || !Array.isArray(r.pendingWriteRanges) || r.pendingWriteRanges.length !== r.pendingWriteCallbacks) || r.writeMeasurementOverflow)) throw Error('export-edl-input');
    const flushed = measured ? union(rows.flatMap(r => (r.flushedRanges || []).map(([a, b]) => {
        if (a < 0 || b < a || b > r.bytesSubmitted || r.start + b > total) throw Error('export-edl-input');
        return [r.start + a, r.start + b];
    }))) : [];
    const flushedOverlap = measured ? overlap(flushed, saved) : null;
    const unknown = measured ? union(rows.flatMap(r => (r.pendingWriteRanges || []).map(([a, b]) => {
        if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a < 0 || b < a || b > r.bytesSubmitted || r.start + b > total) throw Error('export-edl-input');
        return [r.start + a, r.start + b];
    }))) : [];
    return {requests: rows.length, sourceFileBytes: total, savedPayloadBytes: savedBytes,
        scheduledSourceBytes: rows.reduce((n, r) => n + r.bytesScheduled, 0), scheduledUniqueSourceBytes: bytes(scheduled), completedUniqueSourceBytes: bytes(completed),
        scheduledSavedPayloadBytes: scheduledOverlap, completedSavedPayloadBytes: completedOverlap,
        scheduledAllSavedPayloadReread: savedBytes > 0 && scheduledOverlap >= savedBytes,
        completedAllSavedPayloadReread: savedBytes > 0 && completedOverlap >= savedBytes,
        completedWholeSourceRead: bytes(completed) === total,
        writeCallbacksMeasured: measured, callbackFlushedUniqueSourceBytes: measured ? bytes(flushed) : null,
        callbackFlushedSavedPayloadBytes: flushedOverlap,
        callbackFlushedAllSavedPayload: measured ? savedBytes > 0 && flushedOverlap >= savedBytes : null,
        failedWriteCallbacks: measured ? rows.reduce((n, r) => n + r.failedWriteCallbacks, 0) : null,
        pendingClosedCallbacks: measured ? rows.filter(r => r.closed).reduce((n, r) => n + r.pendingWriteCallbacks, 0) : null,
        callbackObservationsComplete: measured ? rows.every(r => r.pendingWriteCallbacks === 0) : null,
        callbackUnknownSavedPayloadBytes: measured ? overlap(unknown, saved) : null,
        transferAssessment: !measured ? 'NOT_MEASURED' : flushedOverlap > 0 ? 'SAVED_PAYLOAD_FLUSHED_TO_UNDERLYING_SYSTEM' : overlap(unknown, saved) > 0 ? 'SAVED_PAYLOAD_DELIVERY_UNKNOWN_AFTER_CLOSE' : 'NO_SAVED_PAYLOAD_SUCCESSFUL_CALLBACK_OBSERVED',
        clientConsumption: 'NOT_MEASURED',
        assessment: completedOverlap > 0 ? 'COMPLETED_SAVED_PAYLOAD_REREAD' : scheduledOverlap > 0 ? 'SCHEDULED_SAVED_PAYLOAD_REREAD_DELIVERY_UNCERTAIN' : 'NO_SAVED_PAYLOAD_REREAD_OBSERVED'};
}
function physicalClosed(snapshot) {
    return snapshot.resources.activeResponses === 0 && snapshot.resources.openSockets === 0 && snapshot.resources.openSourceStreams === 0 && snapshot.all.pendingOpenCallbacks === 0;
}
function validStopObservation(stop) {
    if (!stop || !Array.isArray(stop.snapshots) || stop.snapshots.length < 3) return false;
    const last = stop.snapshots.at(-1), counts = last?.all;
    if (!counts || !last.resources || !['pendingCallbacks', 'pendingOpenCallbacks', 'pendingClosedCallbacks'].every(k => Number.isSafeInteger(counts[k]) && counts[k] >= 0) ||
        counts.pendingCallbacks !== counts.pendingOpenCallbacks + counts.pendingClosedCallbacks || !physicalClosed(last)) return false;
    if (stop.resolution === 'PHYSICAL_AND_CALLBACKS_SETTLED') return last.label === 'settled' && counts.pendingCallbacks === 0 && stop.legacyWaitTimedOut === false;
    if (stop.resolution === 'PHYSICAL_CLOSED_CALLBACK_DELIVERY_UNKNOWN') return last.label === 'deadline' && counts.pendingClosedCallbacks > 0 && stop.legacyWaitTimedOut === true;
    return false;
}
async function stopObserved({client, server, firstRequest, until, checkpoint}) {
    const result = {snapshots: [], legacyWaitTimedOut: false, resolution: 'UNKNOWN'};
    const capture = label => {const value = server.snapshot(firstRequest); result.snapshots.push({label, ...value}); checkpoint(result); return value;};
    capture('before-stop'); await client.stop(); capture('stop-replied');
    try {
        await until(() => {const state = server.snapshot(firstRequest); return physicalClosed(state) && state.all.pendingCallbacks === 0;});
        capture('settled'); result.resolution = 'PHYSICAL_AND_CALLBACKS_SETTLED';
    } catch (error) {
        const state = capture('deadline');
        if (error.message !== 'export-stage-timeout' || !physicalClosed(state) || state.all.pendingClosedCallbacks <= 0) throw error;
        result.legacyWaitTimedOut = true; result.resolution = 'PHYSICAL_CLOSED_CALLBACK_DELIVERY_UNKNOWN';
    }
    checkpoint(result); return result;
}
async function run({client, property, until, delay, server, fixture, original, video, audio, duration, output, directory, checkpoint}) {
    const range = span(video, audio, duration), saved = savedRanges(original, range), file = path.join(directory, 'retained.edl');
    require('./playback-range-windows-smoke.cjs').regular(output);
    const text = description(server.origin + '/Videos/A/stream.avi', output, range);
    fs.writeFileSync(file, text, {flag: 'wx'});
    const descriptor = {bytes: Buffer.byteLength(text), sha256: crypto.createHash('sha256').update(text).digest('hex')};
    const firstRequest = server.rows.length, result = {range, descriptor, samples: [], audioContinuity: 'NOT_SAMPLE_CAPTURED', normalEmbySession: 'NOT_ASSESSED'};
    if (selectSourcePosition(range, range.resume)?.segment !== 'retained') throw Error('export-edl-input');
    checkpoint('edl-load', result);
    client.setProperty('pause', true); if (await property('pause') !== true) throw Error('export-edl-observation');
    await client.load(['loadfile', file, 'replace', '-1', 'start=' + range.resume]).promise;
    await until(async () => client.state.fileLoaded && Math.abs(await property('time-pos') - range.resume) <= 1 / 24);
    const virtualDuration = await property('duration'); if (Math.abs(virtualDuration - 8) > 1 / 24) throw Error('export-edl-observation');
    result.virtualDuration = virtualDuration;
    const tracks = async () => {
        const a = await property('audio-out-params'), v = await property('video-out-params'), list = await property('track-list'), ao = await property('current-ao');
        if (!a || a.samplerate !== 48000 || a['channel-count'] !== 1 || !v || v.w !== 320 || v.h !== 180 || ao !== 'null' || !Array.isArray(list) ||
            list.filter(t => t.type === 'audio' && t.selected).length !== 1 || list.filter(t => t.type === 'video' && t.selected).length !== 1) throw Error('export-edl-observation');
        return {samplerate: a.samplerate, channels: a['channel-count'], width: v.w, height: v.h, output: ao};
    };
    client.setProperty('pause', false); await until(async () => await property('time-pos') >= range.resume + .1);
    client.setProperty('pause', true); if (await property('pause') !== true) throw Error('export-edl-observation');
    result.audioBefore = await tracks(); const before = await property('time-pos');
    if (before >= range.end - 1 / 24) throw Error('export-edl-observation');
    result.samples.push(before); checkpoint('edl-cross', result); client.setProperty('pause', false);
    await until(async () => {const now = await property('time-pos'); if (!Number.isFinite(now)) throw Error('export-edl-observation'); result.samples.push(now); await delay(25); return now >= range.end + .25;});
    client.setProperty('pause', true); if (await property('pause') !== true) throw Error('export-edl-observation');
    result.audioAfter = await tracks();
    if (selectSourcePosition(range, result.samples.at(-1))?.segment !== 'original') throw Error('export-edl-observation');
    result.maxBackstepSeconds = Math.max(0, ...result.samples.slice(1).map((x, n) => result.samples[n] - x));
    result.startFiles = client.timeline.filter(e => e.action === 'ACCEPT' && e.name === 'start-file').length;
    if (result.maxBackstepSeconds > 1 / 24 || result.startFiles !== 1) throw Error('export-edl-observation');
    checkpoint('edl-stop', result);
    result.stop = await stopObserved({client, server, firstRequest, until, checkpoint(value) {result.stop = value; checkpoint('edl-stop', result);}});
    result.network = network(server.rows.slice(firstRequest), saved, fixture.size); result.timelineAndTracksPassed = true; checkpoint('edl-stop', result);
    return result;
}
module.exports = {span, description, selectSourcePosition, savedRanges, union, overlap, network, physicalClosed, validStopObservation, stopObserved, run};
