'use strict';

const maintenance = require('./maintenance');
const rendererBoundary = require('./renderer-boundary');
const appUpdate = require('./manual-app-update');

const CHANNELS = Object.freeze({
    GET_INFO: 'enhanced-maintenance-info',
    COPY_ENVIRONMENT: 'enhanced-maintenance-copy-environment',
    CHECK_UPDATE: 'enhanced-maintenance-check-update',
    OPEN_RELEASES: 'enhanced-maintenance-open-releases',
    DOWNLOAD: 'enhanced-maintenance-download-update',
    CANCEL: 'enhanced-maintenance-cancel-update',
    PROGRESS: 'enhanced-maintenance-update-progress'
});

function register(options) {
    const settings = options || {};
    const ipcMain = settings.ipcMain;
    const getWebContents = settings.getWebContents;
    const clipboard = settings.clipboard;
    const shell = settings.shell;
    const registered = [];
    let closing = false;
    let active = null;
    let candidate = null;
    let unregisterPromise = null;

    function operation(work) {
        if (closing || active) return Promise.resolve({status: 'error', reason: closing ? 'closed' : 'busy'});
        const controller = new AbortController();
        const record = {controller, done: null};
        active = record;
        record.done = (async function () {
            try { return await work(controller.signal); }
            catch (error) {
                const reasons = new Set(['file-exists', 'directory-invalid', 'unsafe-redirect', 'http-rejected', 'encoding-rejected', 'size-mismatch', 'hash-mismatch', 'timeout']);
                return record.timedOut ? {status: 'error', reason: 'timeout'} : controller.signal.aborted ? {status: 'cancelled'} :
                    {status: 'error', reason: reasons.has(error.code) ? error.code : 'maintenance_operation_failed'};
            } finally { if (active === record) active = null; }
        })();
        return record.done;
    }

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
            if (closing) return {status: 'error', reason: 'closed'};
            try {
                return await handler(request);
            } catch (_) {
                return {status: 'error', reason: 'maintenance_operation_failed'};
            }
        });
        registered.push(channel);
    }

    registerHandler(CHANNELS.GET_INFO, async function (request) {
        if (request !== undefined) return {status: 'error', reason: 'invalid-request'};
        return {status: 'ok', info: await appInfo()};
    });

    registerHandler(CHANNELS.COPY_ENVIRONMENT, async function (request) {
        if (request !== undefined) return {status: 'error', reason: 'invalid-request'};
        if (!clipboard || typeof clipboard.writeText !== 'function') return {status: 'error', reason: 'clipboard_unavailable'};
        const info = await appInfo();
        const text = maintenance.formatEnvironmentText(info);
        clipboard.writeText(text);
        return {status: 'copied', info};
    });

    registerHandler(CHANNELS.CHECK_UPDATE, function (request) {
        if (request !== undefined) return {status: 'error', reason: 'invalid-request'};
        return operation(async function (signal) {
            candidate = null;
            const info = await appInfo();
            if (signal.aborted) return {status: 'cancelled'};
            const result = await maintenance.checkLatestRelease({
                currentVersion: info.appVersion,
                requestJson: url => (settings.requestJson || appUpdate.requestJson)(url, {signal})
            });
            if (signal.aborted) return {status: 'cancelled'};
            if (result.status === 'update-available') candidate = result;
            return result;
        });
    });

    registerHandler(CHANNELS.CANCEL, function (request) {
        if (request !== undefined) return {status: 'error', reason: 'invalid-request'};
        if (active) active.controller.abort();
        return {status: 'cancelled'};
    });

    registerHandler(CHANNELS.DOWNLOAD, function (request) {
        if (request !== undefined) return {status: 'error', reason: 'invalid-request'};
        return operation(async function (signal) {
            const selected = candidate;
            if (!selected || !selected.installer) return {status: 'error', reason: 'verification-unavailable'};
            // Refresh the exact official tag, never through a download proxy. Changed identity
            // requires another explicit check; cached or proxy supplied checksums are not trust.
            let release;
            try { release = await (settings.requestJson || appUpdate.requestJson)(appUpdate.API + 'tags/' + selected.releaseTag, {signal}); }
            catch (_) { return signal.aborted ? {status: 'cancelled'} : {status: 'error', reason: 'verification-unavailable'}; }
            const fresh = await maintenance.checkLatestRelease({currentVersion: selected.currentVersion, requestJson: async () => release});
            if (signal.aborted) return {status: 'cancelled'};
            if (fresh.status !== 'update-available' || fresh.releaseTag !== selected.releaseTag ||
                JSON.stringify(fresh.installer) !== JSON.stringify(selected.installer)) {
                candidate = null;
                return {status: 'error', reason: 'release-changed'};
            }
            if (!settings.dialog || typeof settings.dialog.showOpenDialog !== 'function') return {status: 'error', reason: 'dialog-unavailable'};
            const cancelled = new Promise(resolve => signal.addEventListener('abort', () => resolve({canceled: true}), {once: true}));
            const chosen = await Promise.race([settings.dialog.showOpenDialog(settings.getBrowserWindow && settings.getBrowserWindow(), {
                title: '选择软件更新下载目录', properties: ['openDirectory']
            }), cancelled]);
            if (signal.aborted || !chosen || chosen.canceled) return {status: 'cancelled'};
            if (!Array.isArray(chosen.filePaths) || chosen.filePaths.length !== 1 || typeof chosen.filePaths[0] !== 'string') return {status: 'error', reason: 'directory-invalid'};
            const deadline = Date.now() + 10 * 60 * 1000;
            const downloadRecord = active;
            const timer = setTimeout(() => { downloadRecord.timedOut = true; downloadRecord.controller.abort(); }, 10 * 60 * 1000);
            let lastProgress = 0;
            try {
                return await (settings.downloadInstaller || appUpdate.downloadInstaller)(fresh.installer, chosen.filePaths[0], {
                    signal, deadline, onProgress: function (progress) {
                        if (Date.now() - lastProgress < 150 && progress.bytes !== 0 && progress.bytes !== progress.total) return;
                        lastProgress = Date.now();
                        const contents = getWebContents && getWebContents();
                        if (!signal.aborted && contents && !contents.isDestroyed() && contents.mainFrame &&
                            rendererBoundary.isApplicationDocument(contents.mainFrame.url)) contents.send(CHANNELS.PROGRESS, progress);
                    }
                });
            } finally { clearTimeout(timer); }
        });
    });

    registerHandler(CHANNELS.OPEN_RELEASES, async function (request) {
        if (!request || typeof request !== 'object' || Array.isArray(request) ||
            Object.keys(request).length !== 1 || !Object.hasOwn(request, 'url') || typeof request.url !== 'string' || request.url.length > 2048) {
            return {status: 'error', reason: 'invalid-request'};
        }
        if (!shell || typeof shell.openExternal !== 'function') return {status: 'error', reason: 'shell_unavailable'};
        await Promise.resolve(shell.openExternal(maintenance.safeReleaseUrl(request && request.url)));
        return {status: 'opened'};
    });

    return function unregister() {
        if (unregisterPromise) return unregisterPromise;
        closing = true;
        if (active) active.controller.abort();
        if (typeof ipcMain.removeHandler === 'function') registered.forEach(function (channel) { ipcMain.removeHandler(channel); });
        unregisterPromise = active ? active.done.then(() => undefined) : Promise.resolve();
        return unregisterPromise;
    };
}

module.exports = {CHANNELS, register};
