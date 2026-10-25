'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const pcmProbe = require('../tools/playback-buffer-pcm-inspect.cjs');

function wav(pcm, {extensible = false, rate = 48000, channels = 1, guid = '0100000000001000800000aa00389b71', truncate = false, trailing = null, duplicateFmt = false, duplicateData = false, unknown = false} = {}) {
    const fmt = Buffer.alloc(extensible ? 40 : 16);
    fmt.writeUInt16LE(extensible ? 0xfffe : 1, 0); fmt.writeUInt16LE(channels, 2); fmt.writeUInt32LE(rate, 4);
    fmt.writeUInt32LE(rate * channels * 2, 8); fmt.writeUInt16LE(channels * 2, 12); fmt.writeUInt16LE(16, 14);
    if (extensible) {fmt.writeUInt16LE(22, 16); fmt.writeUInt16LE(16, 18); fmt.writeUInt32LE(0, 20); Buffer.from(guid, 'hex').copy(fmt, 24);}
    const chunk = (id, body) => {const head = Buffer.alloc(8); head.write(id); head.writeUInt32LE(body.length, 4); return Buffer.concat([head, body, body.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);};
    const body = Buffer.concat([Buffer.from('WAVE'), chunk('fmt ', fmt), ...(duplicateFmt ? [chunk('fmt ', fmt)] : []), ...(unknown ? [chunk('JUNK', Buffer.alloc(0))] : []), chunk('data', pcm), ...(duplicateData ? [chunk('data', pcm)] : []), ...(trailing ? [chunk(trailing, Buffer.alloc(0))] : [])]);
    const head = Buffer.alloc(8); head.write('RIFF'); head.writeUInt32LE(body.length, 4);
    const result = Buffer.concat([head, body]); if (truncate) return result.subarray(0, result.length - 1); return result;
}
function signal(samples) {
    const data = Buffer.alloc(samples * 2); let value = 0x5a17;
    for (let i = 0; i < samples; i++) {value = (Math.imul(value, 1664525) + 1013904223) >>> 0; data.writeInt16LE((value >>> 16) - 32768, i * 2);}
    return data;
}
function withWav(t, bytes) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-pcm-inspect-')); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const file = path.join(root, 'capture.wav'); fs.writeFileSync(file, bytes); return file;
}

test('reads bounded standard and fixed mpv extensible mono 48kHz S16 WAV', t => {
    const data = signal(9000);
    for (const extensible of [false, true]) {
        const parsed = pcmProbe.inspectWav(withWav(t, wav(data, {extensible})));
        assert.deepEqual(parsed.pcm, data); assert.equal(parsed.samples, 9000);
        assert.deepEqual(parsed.format, {container: 'wav', encoding: 's16le', wavFormat: extensible ? 'pcm-extensible' : 'pcm', sampleRate: 48000, channels: 1, bitsPerSample: 16, blockAlign: 2, byteRate: 96000});
    }
});

test('aligns independently shifted captures and requires exact source samples around the seam', () => {
    const source = signal(48000 * 8), seam = 4;
    const baseline = source.subarray((seam * 48000 - 6000) * 2, (seam * 48000 + 6000) * 2);
    const edl = source.subarray((seam * 48000 - 7000) * 2, (seam * 48000 + 7000) * 2);
    const result = pcmProbe.compareSeam(source, baseline, edl, seam);
    assert.equal(result.ok, true); assert.equal(result.assessment, 'exact-source-samples-through-seam');
    assert.equal(result.baseline.sourceSample, seam * 48000 - 6000); assert.equal(result.edl.sourceSample, seam * 48000 - 7000);
    assert.equal(result.comparedSamplesAroundSeam, 9600); assert.match(result.interpretation, /device gaplessness not assessed/);
});

test('reports changed, missing, duplicated, ambiguous, and insufficient seam evidence', () => {
    const source = signal(48000 * 8), seam = 4, start = seam * 48000 - 7000, end = seam * 48000 + 7000;
    const baseline = source.subarray(start * 2, end * 2), original = source.subarray(start * 2, end * 2);
    const changed = Buffer.from(original); changed[8000] ^= 0x40;
    assert.equal(pcmProbe.compareSeam(source, baseline, changed, seam).assessment, 'changed-edl');
    const before = original.subarray(0, 8000), after = original.subarray(8000);
    const duplicated = Buffer.concat([before, original.subarray(7998, 8000), after]);
    assert.equal(pcmProbe.compareSeam(source, baseline, duplicated, seam).assessment, 'duplicated-sample-edl');
    const missing = Buffer.concat([before, original.subarray(8002)]);
    assert.equal(pcmProbe.compareSeam(source, baseline, missing, seam).assessment, 'missing-sample-edl');
    const tooShort = original.subarray(0, 5000 * 2);
    assert.equal(pcmProbe.compareSeam(source, tooShort, tooShort, seam).assessment, 'insufficient-seam-coverage-baseline');
    const ambiguous = Buffer.alloc(6000 * 2); assert.equal(pcmProbe.compareSeam(source, ambiguous, baseline, seam).assessment, 'unalignable-baseline');
});

test('rejects malformed, unsupported, unfinished, unaligned, or oversized WAV files', t => {
    const data = signal(3000);
    const badGuid = wav(data, {extensible: true, guid: '0200000000001000800000aa00389b71'});
    const cases = [
        [wav(data, {rate: 44100}), /pcm-wav-format-mismatch/],
        [wav(data, {channels: 2}), /pcm-wav-format-mismatch/],
        [badGuid, /pcm-wav-format-unsupported/],
        [wav(data.subarray(0, data.length - 1)), /pcm-wav-data/],
        [wav(data, {truncate: true}), /pcm-wav-truncated/],
        [wav(data, {trailing: 'JUNK'}), /pcm-wav-data-not-final/],
        [wav(data, {duplicateFmt: true}), /pcm-wav-format/],
        [wav(data, {duplicateData: true}), /pcm-wav-data-not-final/],
        [wav(data, {unknown: true}), /pcm-wav-chunk-unsupported/]
    ];
    for (const [bytes, error] of cases) assert.throws(() => pcmProbe.inspectWav(withWav(t, bytes)), error);
    const incomplete = wav(data); incomplete.writeUInt32LE(incomplete.readUInt32LE(4) - 2, 4);
    assert.throws(() => pcmProbe.inspectWav(withWav(t, incomplete)), /pcm-wav-container/);
    const oversized = Buffer.alloc(pcmProbe.MAX_BYTES + 1);
    assert.throws(() => pcmProbe.inspectWav(withWav(t, oversized)), /pcm-file-limit/);
});

test('rejects nonfinite seam positions and caps PCM inputs', () => {
    const source = signal(48000 * 8), capture = source.subarray(3 * 48000 * 2, 5 * 48000 * 2);
    assert.throws(() => pcmProbe.compareSeam(source, capture, capture, NaN), /pcm-seam-input-invalid/);
    assert.throws(() => pcmProbe.compareSeam(source, capture, capture, Infinity), /pcm-seam-input-invalid/);
    assert.throws(() => pcmProbe.compareSeam(Buffer.alloc(pcmProbe.MAX_BYTES + 2), capture, capture, 4), /pcm-source-invalid/);
});
