'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const tool = path.join(__dirname, '..', 'tools', 'make-fixture.cjs');
const HEADER = Buffer.from('YUV4MPEG2 W64 H64 F30:1 Ip A1:1 C420jpeg\n');
const FRAME_BYTES = Buffer.byteLength('FRAME\n') + (64 * 64) + (64 * 64 / 4) + (64 * 64 / 4);

function run(output, seconds) {
    const args = [tool, output];
    if (seconds !== undefined) args.push(String(seconds));
    return childProcess.spawnSync(process.execPath, args, {encoding: 'utf8', windowsHide: true});
}

test('fixture generator keeps the five-second default and supports requested durations', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-make-fixture-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    for (const [name, seconds] of [['default.y4m', 5], ['short.y4m', 3], ['runner.y4m', 60], ['maximum.y4m', 120]]) {
        const output = path.join(root, name);
        const result = run(output, name === 'default.y4m' ? undefined : seconds);
        assert.equal(result.status, 0, result.stderr);
        const bytes = fs.readFileSync(output);
        assert.equal(bytes.subarray(0, HEADER.length).equals(HEADER), true);
        assert.equal(bytes.length, HEADER.length + seconds * 30 * FRAME_BYTES);
    }
});

test('invalid fixture durations fail before creating the output', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-make-fixture-invalid-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    for (const seconds of ['2', '121', '3.5', '0', '-1', 'abc']) {
        const output = path.join(root, 'invalid-' + seconds.replace(/[^A-Za-z0-9]/g, '_') + '.y4m');
        const result = run(output, seconds);
        assert.equal(result.status, 1, 'accepted invalid seconds ' + seconds);
        assert.match(result.stderr, /Seconds must be an integer from 3 to 120\./);
        assert.equal(fs.existsSync(output), false);
    }
});

test('existing output is rejected and preserved', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-make-fixture-existing-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const output = path.join(root, 'existing.y4m');
    const original = Buffer.from('owned');
    fs.writeFileSync(output, original);
    const result = run(output, 60);
    assert.equal(result.status, 1);
    assert.deepEqual(fs.readFileSync(output), original);
});
