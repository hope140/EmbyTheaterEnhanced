'use strict';

function replaceUnique(source, original, replacement, label) {
    const index = source.indexOf(original);
    if (index === -1 || source.indexOf(original, index + original.length) !== -1) {
        throw new Error('Item control source contract mismatch: ' + label);
    }
    return source.slice(0, index) + replacement + source.slice(index + original.length);
}

function patchItemHtmlText(value) {
    if (typeof value !== 'string') throw new TypeError('Item HTML source must be text.');

    let output = value;
    for (const control of ['selectSource', 'selectVideo']) {
        const original = '<select is="emby-select" class="' + control + ' detailTrackSelect emby-select-inline" label=""></select>';
        const replacement = '<select is="emby-select" class="' + control + ' detailTrackSelect emby-select-inline" label="" data-menu="custom"></select>';
        output = replaceUnique(output, original, replacement, control + ' selector');
    }

    return output;
}

function patchLayoutCssText(value) {
    if (typeof value !== 'string') throw new TypeError('Layout CSS source must be text.');
    const marker = '/* ETE detail track selection layout overlay */';
    if (value.includes(marker)) throw new Error('Item layout CSS source contract mismatch: overlay marker already exists.');
    const lineEnding = value.includes('\r\n') ? '\r\n' : '\n';
    const addition = [
        marker,
        '@media all and (min-width: 80em) {',
        '  .itemView .trackSelections {',
        '    width: auto;',
        '  }',
        '  .itemView .trackSelections .selectLabel,',
        '  .itemView .trackSelections .detailTrackSelect {',
        '    margin-top: 0;',
        '  }',
        '}'
    ].join(lineEnding);
    return value + (value.endsWith('\n') || value.endsWith('\r') ? '' : lineEnding) + addition + lineEnding;
}

module.exports = {patchItemHtmlText, patchLayoutCssText};
