'use strict';

const rendererBoundary = require('./renderer-boundary');

const RESOLVE_CHANNEL = 'enhanced-cd2-resolve';
const CANCEL_CHANNEL = 'enhanced-cd2-cancel';

function register(options) {
    const ipcMain = options.ipcMain;
    const service = options.service;
    const getWebContents = options.getWebContents;

    function isTrusted(event) {
        const expected = getWebContents();
        return rendererBoundary.isTrusted(event, expected);
    }

    ipcMain.handle(RESOLVE_CHANNEL, function (event, request) {
        if (!isTrusted(event)) return {status: 'miss', reason: 'untrusted_sender'};
        return options.playback ? options.playback.resolve(request, undefined, getWebContents()) : service.resolve(request);
    });

    ipcMain.on(CANCEL_CHANNEL, function (event, request) {
        if (!isTrusted(event)) return;
        if (options.playback) options.playback.cancel(request && request.requestId, getWebContents(), request && request.configLease);
        else service.cancel(request && request.requestId);
    });

    return function unregister() {
        if (typeof ipcMain.removeHandler === 'function') ipcMain.removeHandler(RESOLVE_CHANNEL);
        if (typeof ipcMain.removeAllListeners === 'function') ipcMain.removeAllListeners(CANCEL_CHANNEL);
        if (options.playback) options.playback.close();
        else service.close();
    };
}

module.exports = {
    CANCEL_CHANNEL: CANCEL_CHANNEL,
    RESOLVE_CHANNEL: RESOLVE_CHANNEL,
    register: register
};
