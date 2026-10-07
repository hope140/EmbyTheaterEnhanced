'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const probe = require('../tools/native-frame-hold-probe.cjs');
const probeSource = fs.readFileSync(path.join(__dirname, '../tools/native-frame-hold-probe.cjs'), 'utf8');

function withTempDirectory(callback) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-frame-hold-probe-test-'));
    try { return callback(root); }
    finally { fs.rmSync(root, {recursive: true, force: true}); }
}

function createInputs(root) {
    const files = ['helper.exe', 'mpv.dll', 'media-a.y4m', 'media-b.y4m'];
    for (const file of files) fs.writeFileSync(path.join(root, file), 'synthetic-test-input', {flag: 'wx'});
    return files.map(file => path.join(root, file));
}

test('CLI accepts four existing inputs, a new output directory, and optional fullscreen flag', function () {
    withTempDirectory(root => {
        const inputs = createInputs(root);
        const output = path.join(root, 'probe-output');
        const windowed = probe.parseArguments([...inputs, output]);
        assert.equal(windowed.fullscreen, false);
        assert.equal(windowed.outputPath, output);
        const fullscreen = probe.parseArguments([...inputs, output, '--fullscreen']);
        assert.equal(fullscreen.fullscreen, true);
        assert.equal(fullscreen.mediaAPath, inputs[2]);
        assert.equal(fullscreen.mediaBPath, inputs[3]);
        assert.equal(fs.existsSync(output), false, 'argument validation does not create output');
    });
});

test('CLI refuses missing inputs, same synthetic media, unknown flags, and existing output', function () {
    withTempDirectory(root => {
        const inputs = createInputs(root);
        const output = path.join(root, 'existing-output');
        fs.mkdirSync(output);

        assert.throws(() => probe.parseArguments([...inputs.slice(0, 3), path.join(root, 'absent.y4m'), path.join(root, 'new')]),
            /input-file-missing/);
        assert.throws(() => probe.parseArguments([inputs[0], inputs[1], inputs[2], inputs[2], path.join(root, 'new')]),
            /media-inputs-must-differ/);
        assert.throws(() => probe.parseArguments([...inputs, output]), /output-directory-exists/);
        assert.throws(() => probe.parseArguments([...inputs, path.join(root, 'new'), '--fullscreen', '--unexpected']), /usage/);
        assert.throws(() => probe.parseArguments([...inputs, path.join(root, 'missing-parent', 'new')]), /output-parent-missing/);
    });
});

test('hold metadata requires ready and painted bytes, and preserves only bounded metadata', function () {
    const response = {
        ready: true, status: 'held', holdId: 17, w: 960, h: 540, bytes: 2073600,
        captureMs: 2.25, meanRGB: {r: 121, g: 64, b: 31}, hash: '0123abcd', painted: true
    };
    assert.deepEqual(probe.validateHoldResponse(response), {
        holdId: 17, width: 960, height: 540, bytes: 2073600,
        captureMs: 2.25, meanRGB: {r: 121, g: 64, b: 31}, hash: '0123abcd',
        ready: true, painted: true, status: 'held'
    });
    assert.throws(() => probe.validateHoldResponse({...response, ready: false}), /frame-hold-not-ready-or-painted/);
    assert.throws(() => probe.validateHoldResponse({...response, painted: false}), /frame-hold-not-ready-or-painted/);
    assert.throws(() => probe.validateHoldResponse({...response, bytes: 0}), /frame-hold-metadata-invalid/);
    assert.throws(() => probe.validateHoldResponse({...response, w: undefined, width: 960}), /frame-hold-metadata-invalid/);
});

test('status and release validators bind to the exact hold id, then accept cleared status null id', function () {
    assert.deepEqual(probe.validateHeldStatus({active: true, holdId: 9, bytes: 4096, painted: true}, 9),
        {active: true, holdId: 9, bytes: 4096, painted: true});
    assert.throws(() => probe.validateHeldStatus({active: true, holdId: 8, bytes: 4096, painted: true}, 9),
        /frame-hold-status-mismatch/);

    assert.deepEqual(probe.validateReleaseResponse({released: true, active: false, bytes: 0, holdId: 9}, 9),
        {released: true, active: false, bytes: 0, holdId: 9});
    assert.throws(() => probe.validateReleaseResponse({released: true, active: false, bytes: 0, holdId: 8}, 9),
        /frame-hold-release-mismatch/);
    assert.deepEqual(probe.validateReleasedStatus({active: false, bytes: 0, holdId: null, painted: false}, 9),
        {active: false, bytes: 0, holdId: null, releasedHoldId: 9});
});

test('probe has one opaque host window and always stops capture, kills helper, and destroys host', function () {
    assert.equal((probeSource.match(/new BrowserWindow\(/g) || []).length, 1);
    assert.match(probeSource, /backgroundColor: '#000000', transparent: false/);
    assert.match(probeSource, /parentWindowHandle: nativeHelperService\.decimalWindowHandle\(host\)/);
    assert.match(probeSource, /finally \{/);
    assert.match(probeSource, /screenCapture\.stop\(\)/);
    assert.match(probeSource, /client\.kill\(\)/);
    assert.match(probeSource, /host\.destroy\(\)/);
    assert.match(probeSource, /experimental-capability-only/);
    assert.doesNotMatch(probeSource, /setAlwaysOnTop|capture-screen|\.toPNG\(|screenshot/i);
});
