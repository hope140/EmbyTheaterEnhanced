'use strict';

function patchActionSheetCss(text) {
    if (typeof text !== 'string') throw new TypeError('ActionSheet CSS source must be text.');
    const marker = '/* ETE empty ActionSheet spacing */';
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const anchor = ['.actionsheetScrollSlider-bottompadded {', '  padding-bottom: 0.35em;', '}'].join(eol);
    if (text.includes(marker) || text.split(anchor).length !== 2) {
        throw new Error('ActionSheet CSS source contract mismatch.');
    }
    // Keep the list's focus/scroll gutter when rows exist. An empty, non-virtual
    // list has no last row to pad and otherwise moves the title above center.
    const addition = [
        marker,
        '.actionSheetScroller.actionsheetScrollSlider-bottompadded:not(.flex-grow):has(> .actionsheetScrollSlider:empty) {',
        '  padding-bottom: 0;',
        '}'
    ].join(eol);
    return text + (text.endsWith('\n') ? '' : eol) + addition + eol;
}

module.exports = {patchActionSheetCss};
