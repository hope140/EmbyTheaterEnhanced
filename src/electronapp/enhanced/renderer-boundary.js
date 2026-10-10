'use strict';

const path = require('path');
const {pathToFileURL} = require('url');
const applicationUrl = pathToFileURL(path.join(__dirname, '..', 'www', 'index.html')).href;

function isApplicationDocument(value) {
    if (typeof value !== 'string') return false;
    try {
        const url = new URL(value);
        url.hash = '';
        url.search = '';
        return url.href === applicationUrl;
    } catch (_) { return false; }
}

function isTrusted(event, expected) {
    try {
        return !!expected && !!event && event.sender === expected &&
            !(typeof expected.isDestroyed === 'function' && expected.isDestroyed()) &&
            !!event.senderFrame && event.senderFrame === expected.mainFrame &&
            isApplicationDocument(event.senderFrame.url);
    } catch (_) { return false; }
}

function restrictNavigation(webContents) {
    // Emby routes inside the packaged index; external documents never inherit its preload.
    function guard(event, url) {
        if (!isApplicationDocument(event.url === undefined ? url : event.url)) event.preventDefault();
    }
    webContents.on('will-navigate', guard);
    webContents.on('will-redirect', guard);
}

module.exports = {isApplicationDocument, isTrusted, restrictNavigation};
