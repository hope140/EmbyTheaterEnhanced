'use strict';
// Synthetic raw AVI/PCM inspection only; no production imports or credentials.
const fs = require('node:fs'), crypto = require('node:crypto');
const MAX_FILE = 34 * 1024 * 1024, FRAME_BYTES = 320 * 180 * 3;
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
function chunk(tag, body) {const head = Buffer.alloc(8); head.write(tag); head.writeUInt32LE(body.length, 4); return Buffer.concat([head, body, body.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);}
function list(kind, children) {return chunk('LIST', Buffer.concat([Buffer.from(kind), ...children]));}
function fixture(file) {
    const frames = 192, samplesPerFrame = 2000, audioBytes = samplesPerFrame * 2;
    const avih = Buffer.alloc(56); [41667, (FRAME_BYTES + audioBytes) * 24, 0, 16, frames, 0, 2, FRAME_BYTES, 320, 180].forEach((v, i) => avih.writeUInt32LE(v, i * 4));
    const video = Buffer.alloc(56); video.write('vidsDIB '); video.writeUInt32LE(1, 20); video.writeUInt32LE(24, 24); video.writeUInt32LE(frames, 32); video.writeUInt32LE(FRAME_BYTES, 36); video.writeUInt32LE(0xffffffff, 40); video.writeInt16LE(320, 52); video.writeInt16LE(180, 54);
    const bitmap = Buffer.alloc(40); bitmap.writeUInt32LE(40); bitmap.writeInt32LE(320, 4); bitmap.writeInt32LE(180, 8); bitmap.writeUInt16LE(1, 12); bitmap.writeUInt16LE(24, 14); bitmap.writeUInt32LE(FRAME_BYTES, 20);
    const audio = Buffer.alloc(56); audio.write('auds'); audio.writeUInt32LE(1, 20); audio.writeUInt32LE(48000, 24); audio.writeUInt32LE(frames * samplesPerFrame, 32); audio.writeUInt32LE(audioBytes, 36); audio.writeUInt32LE(0xffffffff, 40); audio.writeUInt32LE(2, 44);
    const wave = Buffer.alloc(16); wave.writeUInt16LE(1); wave.writeUInt16LE(1, 2); wave.writeUInt32LE(48000, 4); wave.writeUInt32LE(96000, 8); wave.writeUInt16LE(2, 12); wave.writeUInt16LE(16, 14);
    const header = list('hdrl', [chunk('avih', avih), list('strl', [chunk('strh', video), chunk('strf', bitmap)]), list('strl', [chunk('strh', audio), chunk('strf', wave)])]);
    const movie = [], indices = []; let offset = 4;
    for (let i = 0; i < frames; i++) {
        const image = Buffer.alloc(FRAME_BYTES);
        for (let n = 0; n < image.length; n += 3) {image[n] = i % 2 ? 32 : 16; image[n + 2] = 180;}
        image.set([i, i ^ 0x5a, 180]);
        const pcm = Buffer.alloc(audioBytes);
        for (let n = 0; n < samplesPerFrame; n++) {const t = (i * samplesPerFrame + n) / 48000; pcm.writeInt16LE(Math.round(8000 * Math.sin(2 * Math.PI * (431 * t + 5 * t * t))), n * 2);}
        for (const [tag, body] of [['00db', image], ['01wb', pcm]]) {
            movie.push(chunk(tag, body)); const index = Buffer.alloc(16); index.write(tag); index.writeUInt32LE(16, 4); index.writeUInt32LE(offset, 8); index.writeUInt32LE(body.length, 12); indices.push(index); offset += 8 + body.length;
        }
    }
    const body = Buffer.concat([Buffer.from('AVI '), header, list('movi', movie), chunk('idx1', Buffer.concat(indices))]);
    const data = chunk('RIFF', body); if (data.length > MAX_FILE) throw Error('av-fixture-limit'); fs.writeFileSync(file, data, {flag: 'wx'});
    return {file: 'A.avi', size: data.length, sha256: sha(data), etag: '"' + sha(data) + '"', generator: 'marked-raw-AVI-PCM48k-v1'};
}
function inspect(file) {
    const support = require('./playback-range-windows-smoke.cjs'); support.regular(file);
    const size = fs.statSync(file).size; if (size < 64 || size > MAX_FILE) throw Error('export-av-format');
    const data = fs.readFileSync(file), streams = [], videoPackets = [], audioChunks = []; let empty = 0, slots = 0;
    if (data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'AVI ' || data.readUInt32LE(4) + 8 !== size) throw Error('export-av-format');
    function walk(start, end, movie, stream, depth) {
        if (depth > 4) throw Error('export-av-format');
        for (let at = start; at < end;) {
            if (at + 8 > end) throw Error('export-av-format');
            const tag = data.toString('ascii', at, at + 4), bytes = data.readUInt32LE(at + 4), body = at + 8, next = body + bytes + bytes % 2;
            if (next > end) throw Error('export-av-format');
            if (tag === 'LIST') {
                if (bytes < 4) throw Error('export-av-format');
                const kind = data.toString('ascii', body, body + 4), entry = kind === 'strl' ? {} : stream;
                if (kind === 'strl') {if (streams.length >= 2) throw Error('export-av-format'); streams.push(entry);}
                walk(body + 4, body + bytes, movie || kind === 'movi', entry, depth + 1);
            } else if (tag === 'strh') {
                if (!stream || stream.type || bytes < 56) throw Error('export-av-format');
                stream.type = data.toString('ascii', body, body + 4); stream.scale = data.readUInt32LE(body + 20); stream.rate = data.readUInt32LE(body + 24); stream.start = data.readUInt32LE(body + 28);
            } else if (tag === 'strf') {
                if (!stream || stream.format) throw Error('export-av-format');
                if (stream.type === 'vids') {
                    if (bytes < 40 || data.readInt32LE(body + 4) !== 320 || data.readInt32LE(body + 8) !== 180 || data.readUInt16LE(body + 14) !== 24 || data.readUInt32LE(body + 16) !== 0) throw Error('export-av-format');
                } else if (stream.type === 'auds') {
                    if (bytes < 16 || data.readUInt16LE(body) !== 1 || data.readUInt16LE(body + 2) !== 1 || data.readUInt32LE(body + 4) !== 48000 || data.readUInt16LE(body + 12) !== 2 || data.readUInt16LE(body + 14) !== 16) throw Error('export-av-format');
                } else throw Error('export-av-format');
                stream.format = true;
            } else if (movie && /^00d[bc]$/.test(tag)) {
                if (slots >= 4800 || bytes !== 0 && bytes !== FRAME_BYTES || videoPackets.length >= 192) throw Error('export-av-format');
                if (bytes) videoPackets.push({slot: slots, sha256: sha(data.subarray(body, body + bytes))}); else empty++;
                slots++;
            } else if (movie && tag === '01wb') {
                if (bytes % 2 || audioChunks.length >= 4096) throw Error('export-av-format'); audioChunks.push(data.subarray(body, body + bytes));
            } else if (movie && /^[0-9]{2}(?:db|dc|wb)$/.test(tag)) throw Error('export-av-format');
            at = next;
        }
    }
    walk(12, size, false, null, 0);
    if (streams.length !== 2 || streams[0].type !== 'vids' || streams[1].type !== 'auds' || streams.some(s => !s.format || !s.rate || !s.scale) || ![24, 600].includes(streams[0].rate / streams[0].scale) || streams[1].rate / streams[1].scale !== 48000 || !audioChunks.length || !videoPackets.length) throw Error('export-av-format');
    const pcm = Buffer.concat(audioChunks); if (pcm.length > 8 * 48000 * 2) throw Error('export-av-format');
    return {video: {fps: streams[0].rate / streams[0].scale, slots, emptyPackets: empty, packets: videoPackets},
        audio: {samples: pcm.length / 2, pcm, localStart: streams[1].start * streams[1].scale / streams[1].rate},
        videoLocalStart: streams[0].start * streams[0].scale / streams[0].rate};
}
function audioMapping(source, clip, videoMapping) {
    const needle = clip.audio.pcm.subarray(0, 512), pos = source.audio.pcm.indexOf(needle);
    if (needle.length < 512 || pos < 0 || pos % 2 || source.audio.pcm.lastIndexOf(needle) !== pos || !source.audio.pcm.subarray(pos, pos + clip.audio.pcm.length).equals(clip.audio.pcm)) throw Error('export-av-audio-mapping');
    const sourceStart = pos / 2 / 48000, offset = sourceStart - clip.audio.localStart;
    const videoOffset = videoMapping.sourceStartSeconds - clip.videoLocalStart;
    return {scope: 'single-raw-video-mono-PCM48k-only', samples: clip.audio.samples, payloadsContiguous: true,
        sourceStartSeconds: sourceStart, sourceEndSeconds: sourceStart + clip.audio.samples / 48000,
        localStartSeconds: clip.audio.localStart, sourceMinusLocalSeconds: offset, videoMinusLocalSeconds: videoOffset,
        offsetDeltaSeconds: offset - videoOffset, commonMappingWithinOneSample: Math.abs(offset - videoOffset) <= 1 / 48000 + 1e-9};
}
// Timeline arithmetic only. This is never an authorization or source-identity check.
function localPosition(video, audio, sourcePosition) {
    if (!video || !audio || audio.commonMappingWithinOneSample !== true || !Number.isFinite(audio.sourceMinusLocalSeconds) || !Number.isFinite(sourcePosition)) return null;
    const start = Math.max(video.sourceStartSeconds, audio.sourceStartSeconds), end = Math.min(video.sourceEndExclusiveSeconds, audio.sourceEndSeconds);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || sourcePosition < start || sourcePosition >= end) return null;
    return sourcePosition - audio.sourceMinusLocalSeconds;
}
function control() {
    const os = require('node:os'), path = require('node:path'), cp = require('node:child_process'), assert = require('node:assert/strict');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-av-control-'));
    const execute = args => {const r = cp.spawnSync('ffmpeg', args, {cwd: root, encoding: 'utf8', shell: false, windowsHide: true,
        env: require('./ci-playback-range-smoke.cjs').cleanEnvironment(), timeout: 20000, killSignal: 'SIGKILL', maxBuffer: 1048576});
        if (r.error || r.status !== 0) throw Error('av-control-child-failed'); return r.stdout;};
    try {
        const source = path.join(root, 'A.avi'), clip = path.join(root, 'excerpt.avi'), proof = fixture(source);
        const version = execute(['-version']).split(/\r?\n/, 1)[0];
        execute(['-nostdin', '-v', 'error', '-n', '-protocol_whitelist', 'file,pipe', '-ss', '0.6666666666666666', '-i', source,
            '-t', '1.0416666666666667', '-map', '0', '-c', 'copy', '-bsf:v', 'setts=time_base=1/1008:pts=PTS*42:dts=DTS*42:duration=DURATION*42', '-avoid_negative_ts', 'make_zero', clip]);
        const input = inspect(source), output = inspect(clip), video = require('./playback-buffer-export-probe.cjs').mapping(input.video, output.video), audio = audioMapping(input, output, video);
        execute(['-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', clip, '-map', '0', '-f', 'null', '-']);
        assert(audio.commonMappingWithinOneSample); assert(localPosition(video, audio, 1) !== null);
        assert.equal(localPosition(video, audio, video.sourceEndExclusiveSeconds), null);
        return {scope: 'auxiliary-FFmpeg-raw-AVI-PCM-NOT-native', version, inputBytes: proof.size, clipBytes: fs.statSync(clip).size, video, audio, allStreamsDecoded: true};
    } finally {fs.rmSync(root, {recursive: true, force: true});}
}
if (require.main === module) {
    if (process.argv.length !== 3 || process.argv[2] !== '--control') {console.error('Usage: node tools/playback-buffer-av-fixture.cjs --control'); process.exitCode = 2;}
    else {try {console.log(JSON.stringify(control()));} catch (_) {console.error('av-control-failed'); process.exitCode = 1;}}
}
module.exports = {fixture, inspect, audioMapping, localPosition, control};
