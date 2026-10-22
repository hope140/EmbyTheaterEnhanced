'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {patchVideoOsd} = require('../tools/patch-videoosd-lifecycle.cjs');
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

test('ApiClient and toast are direct maintained sources without overlay generators', () => {
    for (const id of ['apiclient', 'toast-css']) {
        assert.equal(overlays.WEB_OVERLAY_CONTRACT.some(entry => entry.id === id), false);
    }
    for (const retired of ['tools/patch-user-web.cjs', 'tools/patch-apiclient-lifecycle.cjs']) {
        assert.equal(buildInputs.INPUT_PATHS.includes(retired), false);
        assert.equal(fs.existsSync(path.join(__dirname, '..', retired)), false);
    }
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
