'use strict';

function replaceUnique(source, original, replacement) {
    const index = source.indexOf(original);
    if (index === -1 || source.indexOf(original, index + original.length) !== -1) {
        throw new Error('Content width source contract mismatch: read-only width block');
    }
    return source.slice(0, index) + replacement + source.slice(index + original.length);
}

function patchContentWidthText(value) {
    if (typeof value !== 'string') throw new TypeError('Content width source must be text.');

    const lineEnding = value.includes('\r\n') ? '\r\n' : '\n';
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

    return replaceUnique(value, original, replacement);
}

module.exports = {patchContentWidthText};
