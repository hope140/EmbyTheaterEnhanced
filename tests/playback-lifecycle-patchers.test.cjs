'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {patchVideoOsd} = require('../tools/patch-videoosd-lifecycle.cjs');
const {patchApiClient} = require('../tools/patch-apiclient-lifecycle.cjs');
const buildInputs = require('../tools/build-input-contract.cjs');
const overlays = require('../tools/prepare-web-overlays.cjs');

const START = '_dom.default.addEventListener(window, "keydown", function (event)';
const END = '_dom.default.addEventListener(\n        view,\n        "dblclick"';

test('VideoOSD patcher rejects absent and malformed sources', () => {
    assert.throws(() => patchVideoOsd(null), /anchors mismatch/);
    assert.throws(() => patchVideoOsd('unrelated source'), /anchors mismatch/);
});

test('VideoOSD patcher rejects duplicate keyboard anchors', () => {
    assert.throws(() => patchVideoOsd(START + '\n' + START + '\n' + END), /anchors mismatch/);
    assert.throws(() => patchVideoOsd(START + '\n' + END + '\n' + END), /anchors mismatch/);
});

test('VideoOSD patcher rejects a mutated keyboard block', () => {
    const changed = START + '\n/* changed frozen material */\n' + END;
    assert.throws(() => patchVideoOsd(changed), /keyboard input hash mismatch/);
});

test('VideoOSD patcher is wired as a pinned overlay and build input', () => {
    const patcherPath = 'tools/patch-videoosd-lifecycle.cjs';
    const overlay = overlays.WEB_OVERLAY_CONTRACT.find(item => item.id === 'videoosd-lifecycle');

    assert.ok(overlay, 'VideoOSD lifecycle overlay must exist');
    assert.equal(overlay.basePath, 'vendor/web-snapshot/www/videoosd/videoosd.js');
    assert.equal(overlay.runtimePath, 'electronapp/www/videoosd/videoosd.js');
    assert.equal(overlay.expectedBaseSha256.toLowerCase(),
        '86ab60c897e827b5152435350fe7b3801d8afd6b8889eef96e9996e71bb5eeab');
    assert.ok(overlay.generatorPaths.includes(patcherPath));
    assert.ok(buildInputs.INPUT_PATHS.includes(patcherPath));
});

test('ApiClient patcher refuses absent, synthetic and changed authoritative material', () => {
    for (const input of [null, '', 'unrelated source', 'key: "logout",\nvalue: function () {}']) {
        assert.throws(() => patchApiClient(input), /authoritative payload hash mismatch/);
    }
});

test('user Web deltas and lifecycle fix share the existing canonical overlay system', () => {
    const userWeb = require('../tools/patch-user-web.cjs');
    for (const patcher of [userWeb.patchApiClient, userWeb.patchToastCss]) {
        for (const input of [null, '', 'unrelated source']) assert.throws(() => patcher(input), /hash mismatch/);
    }
    for (const id of ['apiclient', 'toast-css']) {
        const entry = overlays.WEB_OVERLAY_CONTRACT.find(item => item.id === id);
        assert.equal(entry.mode, 'tracked-canonical-transform');
        assert.equal(entry.inputPath, null, 'full historical replacements are no longer production overlay inputs');
        assert.equal(entry.expectedInputSha256, null);
        assert.ok(entry.generatorPaths.includes('tools/patch-user-web.cjs'));
    }
    const entry = overlays.WEB_OVERLAY_CONTRACT.find(item => item.id === 'apiclient');
    assert.equal(entry.expectedBaseSha256, 'F3516C72784E5BC8782ABBCE021F22A7F939034E5B8B70639672AE682E18ACC0');
    assert.equal(entry.expectedOutputSha256, '6342A2C809B8CD4C0E1E3E35FC49F6AF8A415E4F4F8F8F0363CB769E9A7EF95E');
    assert.ok(entry.generatorPaths.includes('tools/patch-apiclient-lifecycle.cjs'));
    assert.ok(buildInputs.INPUT_PATHS.includes('tools/patch-user-web.cjs'));
    assert.ok(buildInputs.INPUT_PATHS.includes('tools/patch-apiclient-lifecycle.cjs'));
});

for (const mode of ['missing', 'duplicate']) {
    test('PlaybackManager generator refuses ' + mode + ' source anchors without changing the input', () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-playback-generator-refusal-'));
        const file = path.join(directory, 'playbackmanager.js');
        const anchor = '    function playInternal(item, playOptions, onPlaybackStartedFn) {\n      return "disc" === item.Container';
        const input = mode === 'duplicate' ? anchor + '\n' + anchor : 'unrelated input\n';
        try {
            fs.writeFileSync(file, input);
            const run = spawnSync(process.execPath, [path.join(__dirname, '../tools/patch-playbackmanager.cjs'), file], {encoding: 'utf8'});
            assert.equal(run.status, 1);
            assert.match(run.stderr, /anchor count mismatch/);
            assert.equal(fs.readFileSync(file, 'utf8'), input);
        } finally {
            fs.unlinkSync(file);
            fs.rmdirSync(directory);
        }
    });
}
