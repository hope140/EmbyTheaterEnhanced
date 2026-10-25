'use strict';
// Experiment-only: verify serialized clip anchors without reading the original source.
const crypto = require('node:crypto');
const fail = () => {throw Error('retention-export-map-unavailable');};
const need = value => {if (!value) fail();};
const finite = x => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) < 1e9;
const integer = x => Number.isSafeInteger(x);
function rational(stream) {
    const m = /^(\d+)\/(\d+)$/.exec(stream?.time_base || '');
    need(m && +m[1] > 0 && +m[2] > 0 && +m[1] <= 2147483647 && +m[2] <= 2147483647);
    return +m[1] / +m[2];
}
const only = (value, keys) => value && Object.keys(value).every(k => keys.includes(k));
const REPORT = ['schema', 'export-id', 'complete', 'io-ok', 'internal-affine-map-known', 'serialized-clip-map-verified', 'ranges', 'segments', 'input-error', 'packet-error', 'trailer-error', 'close-error', 'base-ts', 'rebase-ts', 'ts-offset', 'streams'];
const STREAM = ['source-index', 'mux-index', 'codec-id', 'dts-complete', 'type', 'timebase-num', 'timebase-den', 'packets', 'packet-sequence-sha256', 'source-params-known', 'source-width', 'source-height', 'source-sample-rate', 'source-channels', 'source-pixel-format', 'source-extradata-sha256', 'first', 'last'];
const ANCHOR = ['pts-valid', 'dts-valid', 'input-pts', 'input-dts', 'mux-pts', 'mux-dts', 'keyframe', 'bytes', 'sha256'];
function verify(report, clip, exportId) {
    need(only(report, REPORT) && report.schema === 1 && integer(exportId) && exportId > 0 && report['export-id'] === exportId &&
        report.complete === true && report['io-ok'] === true && report['internal-affine-map-known'] === true && report['serialized-clip-map-verified'] === false &&
        report.ranges === 1 && report.segments === 1 && report['input-error'] === false &&
        ['packet-error', 'trailer-error', 'close-error'].every(k => report[k] === 0) &&
        ['base-ts', 'rebase-ts', 'ts-offset'].every(k => finite(report[k])) &&
        Array.isArray(report.streams) && report.streams.length > 0 && report.streams.length <= 8 &&
        Array.isArray(clip?.streams) && clip.streams.length === report.streams.length &&
        Array.isArray(clip.packets) && clip.packets.length > 0 && clip.packets.length <= 32768);
    const affine = report['base-ts'] - report['rebase-ts'], shifts = [], sources = new Set(), outputs = new Set(), bounds = [];
    let tolerance = 0;
    for (const stream of report.streams) {
        need(only(stream, STREAM) && integer(stream['source-index']) && stream['source-index'] >= 0 && stream['source-index'] <= 255 && !sources.has(stream['source-index']) &&
            integer(stream['mux-index']) && stream['mux-index'] >= 0 && stream['mux-index'] <= 255 && !outputs.has(stream['mux-index']) &&
            integer(stream['codec-id']) && [13, 65536, 27, 86018].includes(stream['codec-id']) &&
            ['video', 'audio'].includes(stream.type) && integer(stream.packets) && stream.packets > 0 && stream.packets <= 32768 &&
            integer(stream['timebase-num']) && stream['timebase-num'] > 0 && stream['timebase-num'] <= 2147483647 && integer(stream['timebase-den']) && stream['timebase-den'] > 0 && stream['timebase-den'] <= 2147483647);
        sources.add(stream['source-index']); outputs.add(stream['mux-index']);
        const target = clip.streams.find(row => row.index === stream['mux-index']);
        need(target && target.codec_type === stream.type);
        need(stream['source-params-known'] === true && /^[a-f0-9]{64}$/.test(stream['source-extradata-sha256']));
        if (stream.type === 'video') need(integer(stream['source-width']) && stream['source-width'] > 0 && integer(stream['source-height']) && stream['source-height'] > 0 &&
            target.width === stream['source-width'] && target.height === stream['source-height'] && typeof stream['source-pixel-format'] === 'string' &&
            (stream['source-pixel-format'] ? target.pix_fmt === stream['source-pixel-format'] : stream['codec-id'] === 27 && Number(target.extradata_size) > 0 && typeof target.pix_fmt === 'string' && target.pix_fmt.length > 0));
        else need(integer(stream['source-sample-rate']) && stream['source-sample-rate'] > 0 && integer(stream['source-channels']) && stream['source-channels'] > 0 &&
            Number(target.sample_rate) === stream['source-sample-rate'] && target.channels === stream['source-channels']);
        const extradata = Number(target.extradata_size || 0);
        need(integer(extradata) && extradata >= 0 && extradata <= 1048576);
        const extraHash = extradata ? typeof target.extradata_hash === 'string' && /^sha256:[a-f0-9]{64}$/i.test(target.extradata_hash) ? target.extradata_hash.slice(7).toLowerCase() : null : crypto.createHash('sha256').digest('hex');
        need(extraHash === stream['source-extradata-sha256']);
        const nativeTick = stream['timebase-num'] / stream['timebase-den'], fileTick = rational(target);
        need(nativeTick <= 1 && fileTick <= 1);
        tolerance = Math.max(tolerance, nativeTick + fileTick + 1e-9);
        if (stream.type === 'video') need(stream.first?.keyframe === true);
        need(stream['dts-complete'] === true && /^[a-f0-9]{64}$/.test(stream['packet-sequence-sha256']));
        for (const key of ['first', 'last']) {
            const a = stream[key];
            need(only(a, ANCHOR) && a['pts-valid'] === true && finite(a['input-pts']) && integer(a['mux-pts']) &&
                typeof a['dts-valid'] === 'boolean' && typeof a.keyframe === 'boolean' && integer(a.bytes) && a.bytes > 0 && a.bytes <= 34 * 1048576 && /^[a-f0-9]{64}$/.test(a.sha256));
            const matches = clip.packets.filter(p => p.stream_index === stream['mux-index'] && p.data_hash?.toLowerCase() === 'sha256:' + a.sha256);
            need(matches.length === 1); const p = matches[0];
            need(Number(p.size) === a.bytes && integer(Number(p.pts)));
            need(Math.abs(a['input-pts'] - a['mux-pts'] * nativeTick - affine) <= nativeTick / 2 + 1e-8);
            shifts.push(Number(p.pts) * fileTick - a['mux-pts'] * nativeTick);
            if (a['dts-valid']) {
                need(finite(a['input-dts']) && integer(a['mux-dts']) && p.dts != null && integer(Number(p.dts)));
                need(Math.abs(a['input-dts'] - a['mux-dts'] * nativeTick - affine) <= nativeTick / 2 + 1e-8);
                shifts.push(Number(p.dts) * fileTick - a['mux-dts'] * nativeTick);
            } else need([13, 65536].includes(stream['codec-id']));
        }
        need(stream.last['input-pts'] > stream.first['input-pts']);
        bounds.push({start: stream.first['input-pts'] + report['ts-offset'], end: stream.last['input-pts'] + report['ts-offset']});
    }
    const min = Math.min(...shifts), max = Math.max(...shifts); need(max - min <= tolerance);
    const shift = (min + max) / 2, sourceMinusClipSeconds = affine + report['ts-offset'] - shift;
    need(clip.packets.every(p => outputs.has(p.stream_index)));
    for (const stream of report.streams) {
        const packets = clip.packets.filter(p => p.stream_index === stream['mux-index']);
        need(packets.length === stream.packets);
        const tick = stream['timebase-num'] / stream['timebase-den'];
        const fileTick = rational(clip.streams.find(row => row.index === stream['mux-index']));
        // First scope permits packet-preserving, equivalent clock units only.
        need(tick === fileTick);
        const hash = crypto.createHash('sha256');
        for (const packet of packets) {
            const bytes = Number(packet.size), pts = Number(packet.pts), dts = Number(packet.dts);
            need(integer(bytes) && bytes > 0 && packet.pts != null && packet.dts != null && integer(pts) && integer(dts) &&
                /^sha256:[a-f0-9]{64}$/i.test(packet.data_hash || '') && typeof packet.flags === 'string');
            const nativePts = Math.round((pts * fileTick - shift) / tick), nativeDts = Math.round((dts * fileTick - shift) / tick);
            need(integer(nativePts) && integer(nativeDts));
            hash.update(`${bytes}:1:${nativePts}:1:${nativeDts}:${packet.flags.includes('K') ? 1 : 0}:`, 'ascii');
            hash.update(Buffer.from(packet.data_hash.slice(7), 'hex'));
        }
        need(hash.digest('hex') === stream['packet-sequence-sha256']);
    }
    const sourceStart = Math.max(...bounds.map(b => b.start)), sourceEnd = Math.min(...bounds.map(b => b.end));
    need(sourceEnd > sourceStart && finite(sourceMinusClipSeconds));
    return {schema: 1, exportId, serializedClipMapVerified: true, sourceMinusClipSeconds,
        quantizationBoundSeconds: tolerance, observedContainerShiftSeconds: shift,
        sourceAnchorStartSeconds: sourceStart, sourceAnchorEndSeconds: sourceEnd,
        scope: 'verified-packet-sequence-NOT-device-gaplessness-HDR-or-preroll-guarantee'};
}
module.exports = {verify};
