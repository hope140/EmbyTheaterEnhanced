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
        '}',
        '/* ETE opt-in language order controls inside the existing ActionSheet */',
        '.ete-reorder-actionsheet .listItemBody-tall { min-height: 2.6em; }',
        '.ete-reorder-actionsheet .ete-reorder-controls {',
        '  display: inline-flex;',
        '  align-items: center;',
        '  flex-shrink: 0;',
        '  margin-inline-start: auto;',
        '}',
        '.ete-reorder-actionsheet .ete-reorder-button.paper-icon-button-light.md-icon {',
        '  display: inline-flex;',
        '  align-items: center;',
        '  justify-content: center;',
        '  width: 2em;',
        '  height: 2em;',
        '  margin: 0 0.1em;',
        '  padding: 0;',
        '  font-size: 1em;',
        '  color: inherit;',
        '}',
        '.ete-reorder-actionsheet .ete-reorder-button:disabled { opacity: .35; }',
        '.ete-reorder-actionsheet .ete-reorder-button:focus-visible { outline: 2px solid currentColor !important; }',
        '.ete-reorder-actionsheet .ete-reorder-selected .listViewDragHandle {',
        '  cursor: grab;',
        '  opacity: .8;',
        '  font-size: 1.2em;',
        '  padding: 0.2em;',
        '}'
    ].join(eol);
    return text + (text.endsWith('\n') ? '' : eol) + addition + eol;
}

module.exports = {patchActionSheetCss};
