'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const contentWidth = require('../tools/patch-content-width.cjs');

function fixture(lineEnding) {
    return [
        '.readOnlyContent,form {',
        '  max-width: 90ch;',
        '}',
        '',
        '.secondaryText.focusPreviewOverview,',
        '.readOnlyContent {',
        '  -webkit-line-clamp: 3;',
        '  max-width: 90ch !important;',
        '}',
        '',
        '.secondaryText {',
        '  -webkit-line-clamp: 2;',
        '}'
    ].join(lineEnding);
}

for (const [label, lineEnding] of [['LF', '\n'], ['CRLF', '\r\n']]) {
    test('patches only the read-only important width block and preserves ' + label, () => {
        const input = fixture(lineEnding);
        const output = contentWidth.patchContentWidthText(input);
        const original = [
            '.secondaryText.focusPreviewOverview,',
            '.readOnlyContent {',
            '  -webkit-line-clamp: 3;',
            '  max-width: 90ch !important;',
            '}'
        ].join(lineEnding);
        const replacement = [
            '.secondaryText.focusPreviewOverview,',
            '.readOnlyContent {',
            '  -webkit-line-clamp: 3;',
            '}',
            '',
            '.secondaryText.focusPreviewOverview {',
            '  max-width: 90ch !important;',
            '}'
        ].join(lineEnding);
        const index = input.indexOf(original);

        assert.equal(output.includes('\r\n') ? '\r\n' : '\n', lineEnding);
        assert.equal(output, input.slice(0, index) + replacement + input.slice(index + original.length));
        assert.match(output, /\.readOnlyContent,form \{\r?\n  max-width: 90ch;\r?\n\}/);
        assert.match(output, /\.secondaryText\.focusPreviewOverview,\r?\n\.readOnlyContent \{\r?\n  -webkit-line-clamp: 3;\r?\n\}/);
        assert.match(output, /\.secondaryText\.focusPreviewOverview \{\r?\n  max-width: 90ch !important;\r?\n\}/);
        assert.match(output, /\.secondaryText \{\r?\n  -webkit-line-clamp: 2;\r?\n\}/);
        assert.doesNotMatch(output, /\.readOnlyContent \{[^}]*max-width: 90ch !important;/s);
    });
}

test('fails closed for missing or duplicate canonical blocks', () => {
    const source = fixture('\n');
    const block = [
        '.secondaryText.focusPreviewOverview,',
        '.readOnlyContent {',
        '  -webkit-line-clamp: 3;',
        '  max-width: 90ch !important;',
        '}'
    ].join('\n');
    assert.equal(source.split(block).length - 1, 1);
    assert.throws(() => contentWidth.patchContentWidthText(source.replace(block, '')), /contract mismatch/);
    assert.throws(() => contentWidth.patchContentWidthText(source + '\n' + block), /contract mismatch/);
});

test('rejects non-text input', () => {
    assert.throws(() => contentWidth.patchContentWidthText(Buffer.from(fixture('\n'))), TypeError);
});
