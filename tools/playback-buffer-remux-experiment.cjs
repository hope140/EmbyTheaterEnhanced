'use strict';

// Auxiliary container experiment only. This neither invokes mpv nor exports its
// live packet queue. No production module imports this file.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');

function sha(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
function executable(name) {
    for (const dir of (process.env.PATH || '').split(path.delimiter)) {
        const candidate = path.join(dir, name + (process.platform === 'win32' ? '.exe' : ''));
        try {
            fs.accessSync(candidate, fs.constants.X_OK);
            return fs.realpathSync(candidate);
        } catch { /* Try only existing PATH entries; never install a dependency. */ }
    }
    throw new Error('missing-' + name);
}

function experiment() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-remux-feasibility-'));
    let stage = 'tools';
    const deadline = Date.now() + 90000;
    const run = (binary, args) => {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error('deadline');
        const result = spawnSync(binary, args, {
            cwd: root, encoding: 'utf8', windowsHide: true,
            timeout: Math.min(20000, remaining), killSignal: 'SIGKILL',
            maxBuffer: 4 * 1024 * 1024, shell: false
        });
        if (result.error || result.status !== 0 || result.signal) throw new Error('child-failed');
        return result.stdout;
    };
    try {
        const ffmpeg = executable('ffmpeg');
        const ffprobe = executable('ffprobe');
        const tools = [ffmpeg, ffprobe].map(file => ({
            name: path.basename(file), sha256: sha(fs.readFileSync(file)),
            version: run(file, ['-version']).split(/\r?\n/, 1)[0]
        }));
        stage = 'synthesize';
        run(ffmpeg, ['-nostdin', '-v', 'error', '-n',
            '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=12',
            '-f', 'lavfi', '-i', 'sine=frequency=431:sample_rate=16000',
            '-t', '8', '-map', '0:v:0', '-map', '1:a:0',
            '-c:v', 'mpeg4', '-g', '24', '-bf', '2', '-q:v', '4',
            '-c:a', 'pcm_s16le', 'source.mkv']);
        stage = 'finite-remux';
        run(ffmpeg, ['-nostdin', '-v', 'error', '-n',
            '-protocol_whitelist', 'file,pipe', '-ss', '2.25', '-i', 'source.mkv',
            '-t', '2.5', '-map', '0', '-c', 'copy', '-avoid_negative_ts', 'make_zero', 'clip.mkv']);
        const media = name => {
            const data = fs.readFileSync(path.join(root, name));
            assert(data.length > 0 && data.length <= 8 * 1024 * 1024);
            return {bytes: data.length, sha256: sha(data)};
        };
        const source = media('source.mkv');
        const clip = media('clip.mkv');
        stage = 'inspect';
        const packets = name => JSON.parse(run(ffprobe, ['-v', 'error',
            '-protocol_whitelist', 'file,pipe', '-show_packets', '-show_data_hash', 'sha256',
            '-show_entries', 'packet=stream_index,pts_time,dts_time,pos,size,flags,data_hash',
            '-of', 'json', name])).packets;
        const input = packets('source.mkv');
        const output = packets('clip.mkv');
        const streams = [...new Set(input.map(p => p.stream_index))].map(index => {
            const all = input.filter(p => p.stream_index === index);
            const kept = output.filter(p => p.stream_index === index);
            assert(kept.length > 0 && kept.length < all.length);
            const start = all.findIndex((p, n) => p.data_hash === kept[0].data_hash &&
                kept.every((q, k) => all[n + k]?.data_hash === q.data_hash));
            assert(start >= 0, 'remux must preserve a contiguous packet payload subsequence');
            const offsetChanges = kept.filter((p, n) => p.pos !== all[start + n].pos).length;
            const timestampChanges = kept.filter((p, n) => p.pts_time !== all[start + n].pts_time).length;
            assert(offsetChanges > 0 && timestampChanges > 0);
            return {index, inputPackets: all.length, keptPackets: kept.length,
                sourceFirstPTS: Number(all[start].pts_time), clipFirstPTS: Number(kept[0].pts_time),
                sourceLastPacketPTS: Number(all[start + kept.length - 1].pts_time),
                payloadsPreserved: true, changedByteOffsets: offsetChanges,
                changedTimestamps: timestampChanges, firstPacketKeyframe: kept[0].flags.includes('K')};
        });
        assert.equal(streams.length, 2);
        assert.notEqual(source.sha256, clip.sha256);
        assert(clip.bytes < source.bytes);
        stage = 'decode';
        run(ffmpeg, ['-nostdin', '-v', 'error', '-err_detect', 'explode',
            '-protocol_whitelist', 'file,pipe', '-i', 'clip.mkv', '-map', '0', '-f', 'null', '-']);
        return {schema: 1, result: 'PASS', scope: 'auxiliary-ffmpeg-finite-remux',
            fixedLibmpvExecuted: false, originalRangeRecoveryTested: false,
            tools, synthetic: {durationSeconds: 8, width: 160, height: 90, fps: 12},
            requestedClip: {startSeconds: 2.25, durationSeconds: 2.5}, source, clip, streams,
            clipDecoded: true, productCodeChanged: false};
    } catch (error) {
        // Paths and child stderr are intentionally excluded from the safe receipt.
        throw new Error('remux-experiment-failed:' + stage, {cause: error});
    } finally {
        fs.rmSync(root, {recursive: true, force: true});
    }
}

module.exports = {experiment};
if (require.main === module) {
    if (process.argv.length !== 3 || process.argv[2] !== '--run') {
        process.stderr.write('Usage: node tools/playback-buffer-remux-experiment.cjs --run\n');
        process.exitCode = 2;
    } else {
        try { process.stdout.write(JSON.stringify(experiment(), null, 2) + '\n'); }
        catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
    }
}
