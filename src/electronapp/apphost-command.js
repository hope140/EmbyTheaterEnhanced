'use strict';

const KNOWN_COMMANDS = new Set([
    'windowstate-normal',
    'windowstate-maximized',
    'windowstate-fullscreen',
    'windowstate-minimized',
    'exit',
    'sleep',
    'shutdown',
    'restart',
    'openurl',
    'video-on',
    'video-off',
    'audio-on',
    'audio-off',
    'loaded'
]);

function parse(requestUrl, scheme) {
    const text = typeof requestUrl === 'string' ? requestUrl : '';
    const prefix = String(scheme || '') + '://';
    const rawUrl = text.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase()
        ? text.slice(prefix.length)
        : text;
    const queryIndex = rawUrl.indexOf('?');
    const rawCommand = queryIndex === -1 ? rawUrl : rawUrl.slice(0, queryIndex);
    return {
        command: rawCommand.replace(/\/+$/, '').toLowerCase(),
        rawUrl: rawUrl,
        rawQuery: queryIndex === -1 ? '' : rawUrl.slice(queryIndex + 1)
    };
}

function getOpenUrlTarget(parsed) {
    const rawUrl = parsed && typeof parsed.rawUrl === 'string' ? parsed.rawUrl : '';
    const markerIndex = rawUrl.indexOf('url=');
    return markerIndex === -1 ? '' : rawUrl.slice(markerIndex + 4);
}

function isKnown(command) {
    return KNOWN_COMMANDS.has(command);
}

module.exports = {
    getOpenUrlTarget,
    isKnown,
    parse
};
