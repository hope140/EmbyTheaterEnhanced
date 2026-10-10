'use strict';

const maintenance = require('./maintenance');
const rendererBoundary = require('./renderer-boundary');

const CHANNELS = Object.freeze({
    GET_INFO: 'enhanced-maintenance-info',
    COPY_ENVIRONMENT: 'enhanced-maintenance-copy-environment',
    CHECK_UPDATE: 'enhanced-maintenance-check-update',
    OPEN_RELEASES: 'enhanced-maintenance-open-releases'
});

function register(options) {
    const settings = options || {};
    const ipcMain = settings.ipcMain;
    const getWebContents = settings.getWebContents;
    const clipboard = settings.clipboard;
    const shell = settings.shell;
    const registered = [];

    function isTrusted(event) {
        const expected = typeof getWebContents === 'function' ? getWebContents() : null;
        return rendererBoundary.isTrusted(event, expected);
    }

    function rejectUntrusted() {
        return {status: 'error', reason: 'untrusted_sender'};
    }

    async function appInfo() {
        const raw = typeof settings.getAppInfo === 'function' ? await settings.getAppInfo() : {};
        const platform = typeof settings.getPlatformInfo === 'function' ? settings.getPlatformInfo() : {};
        const display = typeof settings.getDisplayInfo === 'function' ? settings.getDisplayInfo() : {};
        return maintenance.buildEnvironmentInfo(raw, platform, display);
    }

    function registerHandler(channel, handler) {
        ipcMain.handle(channel, async function (event, request) {
            if (!isTrusted(event)) return rejectUntrusted();
            try {
                return await handler(request);
            } catch (_) {
                return {status: 'error', reason: 'maintenance_operation_failed'};
            }
        });
        registered.push(channel);
    }

    registerHandler(CHANNELS.GET_INFO, async function () {
        return {status: 'ok', info: await appInfo()};
    });

    registerHandler(CHANNELS.COPY_ENVIRONMENT, async function () {
        if (!clipboard || typeof clipboard.writeText !== 'function') return {status: 'error', reason: 'clipboard_unavailable'};
        const info = await appInfo();
        const text = maintenance.formatEnvironmentText(info);
        clipboard.writeText(text);
        return {status: 'copied', info};
    });

    registerHandler(CHANNELS.CHECK_UPDATE, async function () {
        const info = await appInfo();
        return maintenance.checkLatestRelease({
            currentVersion: info.appVersion,
            requestJson: settings.requestJson
        });
    });

    registerHandler(CHANNELS.OPEN_RELEASES, async function (request) {
        if (!shell || typeof shell.openExternal !== 'function') return {status: 'error', reason: 'shell_unavailable'};
        await Promise.resolve(shell.openExternal(maintenance.safeReleaseUrl(request && request.url)));
        return {status: 'opened'};
    });

    return function unregister() {
        if (typeof ipcMain.removeHandler === 'function') registered.forEach(function (channel) { ipcMain.removeHandler(channel); });
    };
}

module.exports = {CHANNELS, register};
