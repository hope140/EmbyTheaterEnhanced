'use strict';

// Explicit integration check; requires caller-selected existing FFmpeg tools.
// Not part of portable tests/*.test.cjs and never fetches real user media.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const cp = require('node:child_process'), crypto = require('node:crypto');
const {fixture} = require('./helpers/advance-download-fixture.cjs');
const {download} = require('../src/electronapp/enhanced/advance-download/transfer');

test('a generated real clip survives authorized source resolution, interruption, resume and full decode', async t => {
    const ffmpeg = process.env.ETE_ADVANCE_DOWNLOAD_FFMPEG, ffprobe = process.env.ETE_ADVANCE_DOWNLOAD_FFPROBE;
    assert.ok(ffmpeg && ffprobe && path.isAbsolute(ffmpeg) && path.isAbsolute(ffprobe), 'select existing FFmpeg and FFprobe absolute paths explicitly');
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-advance-media-selftest-')));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const original = path.join(root, 'generated.mkv'), destination = path.join(root, 'downloads');
    fs.mkdirSync(destination);
    const run = (tool, args) => cp.execFileSync(tool, args, {encoding: 'utf8', timeout: 30000, maxBuffer: 1048576, windowsHide: true});
    run(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=64x64:rate=10', '-t', '2', '-c:v', 'ffv1', '-threads', '1', '-nostdin', '-n', original]);
    const f = await fixture(t);
    f.state.body = fs.readFileSync(original);
    assert.ok(f.state.body.length > 1024);
    const session = f.session(), source = await session.acquire();
    f.state.cutTransfer = 1;
    const result = await download({session, source, directory: destination});
    const downloaded = path.join(destination, result.fileName);
    const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    assert.equal(sha(downloaded), sha(original));
    const info = JSON.parse(run(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', downloaded]));
    assert.equal(info.streams[0].codec_name, 'ffv1');
    assert.equal(info.streams[0].width, 64);
    assert.equal(info.streams[0].height, 64);
    assert.equal(Number(info.format.duration), 2);
    const frames = file => run(ffmpeg, ['-v', 'error', '-nostdin', '-i', file, '-f', 'framemd5', '-']).split(/\r?\n/).filter(line => line && !line.startsWith('#'));
    const expected = frames(original), actual = frames(downloaded);
    assert.equal(actual.length, 20);
    assert.deepEqual(actual, expected);
    assert.ok(f.calls.some(call => call.headers.range === 'bytes=1024-'));
    assert.equal(f.state.closedServices, 2);
    console.log('Generated clip: 20 decoded frames, exact file SHA256 and frame hashes match, no external media requests.');
});
