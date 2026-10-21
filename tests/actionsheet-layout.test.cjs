'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {patchActionSheetCss} = require('../tools/patch-actionsheet-layout.cjs');
const {WEB_OVERLAY_CONTRACT} = require('../tools/prepare-web-overlays.cjs');
const {INPUT_PATHS} = require('../tools/build-input-contract.cjs');

const base = '.actionsheetScrollSlider-bottompadded {\n  padding-bottom: 0.35em;\n}\n';

test('empty menu spacing has a separate source-bound CSS overlay', () => {
    const contract = WEB_OVERLAY_CONTRACT.find(entry => entry.id === 'actionsheet-layout');
    assert.equal(contract.runtimePath, 'electronapp/www/modules/actionsheet/actionsheet.css');
    assert.equal(contract.mode, 'tracked-canonical-transform');
    assert.ok(contract.generatorPaths.includes('tools/patch-actionsheet-layout.cjs'));
    assert.ok(INPUT_PATHS.includes('tools/patch-actionsheet-layout.cjs'));
    assert.match(contract.expectedBaseSha256, /^[A-F0-9]{64}$/);
    assert.match(contract.expectedOutputSha256, /^[A-F0-9]{64}$/);
});

test('requires the original gutter contract and rejects missing, duplicate or already patched input', () => {
    assert.throws(() => patchActionSheetCss(null), TypeError);
    assert.throws(() => patchActionSheetCss(base.replace('0.35em', '0.5em')), /contract mismatch/);
    assert.throws(() => patchActionSheetCss(base + base), /contract mismatch/);
    assert.throws(() => patchActionSheetCss(patchActionSheetCss(base)), /contract mismatch/);
});

test('retains the frozen CSS prefix and its line ending style', () => {
    for (const eol of ['\n', '\r\n']) {
        const input = base.replaceAll('\n', eol);
        const output = patchActionSheetCss(input);
        assert.ok(output.startsWith(input));
        assert.ok(output.endsWith(eol));
        if (eol === '\r\n') assert.doesNotMatch(output.replaceAll('\r\n', ''), /\n/);
        else assert.doesNotMatch(output, /\r/);
    }
});
