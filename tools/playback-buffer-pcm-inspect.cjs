'use strict';
// Bounded WAV/PCM inspection for the isolated synthetic seam probe.
const fs = require('node:fs');
const MAX_BYTES = 4 * 1024 * 1024;
const SAMPLE_RATE = 48000, CHANNELS = 1, BITS = 16, BLOCK_ALIGN = 2;
const PCM_GUID = Buffer.from('0100000000001000800000aa00389b71', 'hex');
const NEEDLE_BYTES = 512, MIN_SEAM_SAMPLES = 4800;

function fail(code) { throw Error(code); }
function inspectWav(file) {
    const support = require('./playback-range-windows-smoke.cjs');
    support.regular(file);
    const fd = fs.openSync(file, 'r'); let wav;
    try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || stat.size < 44 || stat.size > MAX_BYTES) fail('pcm-file-limit');
        wav = Buffer.alloc(stat.size); let offset = 0;
        while (offset < wav.length) {const read = fs.readSync(fd, wav, offset, wav.length - offset, offset); if (!read) fail('pcm-wav-truncated'); offset += read;}
        if (fs.fstatSync(fd).size !== stat.size) fail('pcm-file-changed');
    } finally {fs.closeSync(fd);}
    if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') fail('pcm-wav-container');
    if (wav.readUInt32LE(4) + 8 > wav.length) fail('pcm-wav-truncated');
    if (wav.readUInt32LE(4) + 8 < wav.length) fail('pcm-wav-container');
    let at = 12, format = null, pcm = null, sawData = false;
    while (at < wav.length) {
        if (at + 8 > wav.length) fail('pcm-wav-truncated');
        const id = wav.toString('ascii', at, at + 4), size = wav.readUInt32LE(at + 4), body = at + 8, end = body + size;
        if (!Number.isSafeInteger(end) || end > wav.length) fail('pcm-wav-truncated');
        if (sawData) fail('pcm-wav-data-not-final');
        if (id === 'fmt ') {
            if (format || pcm !== null || size < 16) fail('pcm-wav-format');
            const tag = wav.readUInt16LE(body), channels = wav.readUInt16LE(body + 2), rate = wav.readUInt32LE(body + 4);
            const byteRate = wav.readUInt32LE(body + 8), align = wav.readUInt16LE(body + 12), bits = wav.readUInt16LE(body + 14);
            let encoding = null;
            if (tag === 1 && size === 16) encoding = 'pcm';
            else if (tag === 0xfffe && size === 40 && wav.readUInt16LE(body + 16) === 22 && wav.readUInt16LE(body + 18) === 16 && wav.subarray(body + 24, body + 40).equals(PCM_GUID)) encoding = 'pcm-extensible';
            else fail('pcm-wav-format-unsupported');
            if (channels !== CHANNELS || rate !== SAMPLE_RATE || bits !== BITS || align !== BLOCK_ALIGN || byteRate !== SAMPLE_RATE * BLOCK_ALIGN) fail('pcm-wav-format-mismatch');
            format = {container: 'wav', encoding: 's16le', wavFormat: encoding, sampleRate: rate, channels, bitsPerSample: bits, blockAlign: align, byteRate};
        } else if (id === 'data') {
            if (!format || pcm !== null || size === 0 || size % BLOCK_ALIGN !== 0) fail('pcm-wav-data');
            pcm = Buffer.from(wav.subarray(body, end)); sawData = true;
        } else fail('pcm-wav-chunk-unsupported');
        at = end + (size & 1);
        if (at > wav.length) fail('pcm-wav-truncated');
        if (sawData && at !== wav.length) fail('pcm-wav-data-not-final');
    }
    if (!format || !pcm || at !== wav.length) fail('pcm-wav-incomplete');
    return {pcm, samples: pcm.length / BLOCK_ALIGN, format};
}

function validatePCM(value, label) {
    if (!Buffer.isBuffer(value) || value.length < NEEDLE_BYTES || value.length > MAX_BYTES || value.length % BLOCK_ALIGN) fail('pcm-' + label + '-invalid');
}
function alignCapture(source, capture, label) {
    const needle = capture.subarray(0, NEEDLE_BYTES), start = source.indexOf(needle);
    if (start < 0 || source.lastIndexOf(needle) !== start || start % BLOCK_ALIGN) return {ok: false, reason: 'unalignable-' + label};
    const sourceSample = start / BLOCK_ALIGN, compared = Math.min(capture.length, source.length - start);
    const expected = source.subarray(start, start + compared);
    if (compared !== capture.length || !expected.equals(capture)) {
        const limit = Math.min(expected.length, capture.length), mismatch = (() => {let i = 0; while (i < limit && expected[i] === capture[i]) i++; return i - (i % 2);})();
        const capTail = capture.subarray(mismatch), srcAt = start + mismatch;
        let reason = 'changed-' + label;
        if (srcAt + capTail.length - 2 <= source.length && capTail.length >= 4 && capTail.subarray(2).equals(source.subarray(srcAt, srcAt + capTail.length - 2))) reason = 'duplicated-sample-' + label;
        else if (srcAt + 2 + capTail.length <= source.length && capTail.equals(source.subarray(srcAt + 2, srcAt + 2 + capTail.length))) reason = 'missing-sample-' + label;
        else if (compared !== capture.length && expected.equals(capture.subarray(0, expected.length))) reason = 'capture-outside-source-' + label;
        return {ok: false, reason, sourceSample, samples: capture.length / 2};
    }
    return {ok: true, sourceSample, samples: capture.length / BLOCK_ALIGN};
}

// Source and captures are interleaved raw S16LE mono PCM. This establishes
// synthetic source-sample continuity only; it makes no device/gaplessness claim.
function compareSeam(sourcePCM, baselineWavPCM, edlWavPCM, seamSourceSeconds) {
    validatePCM(sourcePCM, 'source'); validatePCM(baselineWavPCM, 'baseline'); validatePCM(edlWavPCM, 'edl');
    if (sourcePCM.length > MAX_BYTES || !Number.isFinite(seamSourceSeconds) || seamSourceSeconds < 0) fail('pcm-seam-input-invalid');
    const baseline = alignCapture(sourcePCM, baselineWavPCM, 'baseline');
    if (!baseline.ok) return {ok: false, assessment: baseline.reason, baseline, edl: null, sampleRate: SAMPLE_RATE, channels: CHANNELS, bitsPerSample: BITS};
    const edl = alignCapture(sourcePCM, edlWavPCM, 'edl');
    if (!edl.ok) return {ok: false, assessment: edl.reason, baseline, edl, sampleRate: SAMPLE_RATE, channels: CHANNELS, bitsPerSample: BITS};
    const seam = Math.round(seamSourceSeconds * SAMPLE_RATE), before = seam - MIN_SEAM_SAMPLES, after = seam + MIN_SEAM_SAMPLES;
    if (!Number.isSafeInteger(seam) || before < 0 || after > sourcePCM.length / BLOCK_ALIGN) fail('pcm-seam-outside-source');
    for (const [label, capture] of [['baseline', baseline], ['edl', edl]]) {
        if (capture.sourceSample > before || capture.sourceSample + capture.samples < after) {
            return {ok: false, assessment: 'insufficient-seam-coverage-' + label, baseline, edl, seamSample: seam, requiredSamplesEachSide: MIN_SEAM_SAMPLES,
                sampleRate: SAMPLE_RATE, channels: CHANNELS, bitsPerSample: BITS};
        }
    }
    const from = before * BLOCK_ALIGN, bytes = 2 * MIN_SEAM_SAMPLES * BLOCK_ALIGN;
    const baselineWindow = baselineWavPCM.subarray((before - baseline.sourceSample) * BLOCK_ALIGN, (before - baseline.sourceSample) * BLOCK_ALIGN + bytes);
    const edlWindow = edlWavPCM.subarray((before - edl.sourceSample) * BLOCK_ALIGN, (before - edl.sourceSample) * BLOCK_ALIGN + bytes);
    if (!baselineWindow.equals(edlWindow) || !baselineWindow.equals(sourcePCM.subarray(from, from + bytes))) return {ok: false, assessment: 'changed-sample-at-seam', baseline, edl, seamSample: seam};
    return {ok: true, assessment: 'exact-source-samples-through-seam', baseline, edl, seamSample: seam,
        comparedSamplesAroundSeam: MIN_SEAM_SAMPLES * 2, sampleRate: SAMPLE_RATE, channels: CHANNELS, bitsPerSample: BITS,
        interpretation: 'synthetic PCM source continuity; output-device gaplessness not assessed'};
}

module.exports = {MAX_BYTES, SAMPLE_RATE, CHANNELS, BITS, MIN_SEAM_SAMPLES, inspectWav, compareSeam};
