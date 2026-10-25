'use strict';

const maintenance = require('./maintenance');
const rendererBoundary = require('./renderer-boundary');
const appUpdate = require('./manual-app-update');
const noteLinks = require('./release-note-links');

const CHANNELS = Object.freeze({
    GET_INFO: 'enhanced-maintenance-info',
    COPY_ENVIRONMENT: 'enhanced-maintenance-copy-environment',
    CHECK_UPDATE: 'enhanced-maintenance-check-update',
    OPEN_RELEASES: 'enhanced-maintenance-open-releases',
    OPEN_NOTE_LINK: 'enhanced-maintenance-open-note-link',
    GET_CHANNEL: 'enhanced-maintenance-get-channel',
    SET_CHANNEL: 'enhanced-maintenance-set-channel',
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
    let checkedNoteUrls = new Set();
    let channel = null, channelLoad = null, channelChange = null, channelRevision = 0;
    let unregisterPromise = null;
    let installing = false;

    function currentChannel() {
        if (channel !== null) return Promise.resolve(channel);
        if (!channelLoad) channelLoad = Promise.resolve().then(() => settings.preferences ? settings.preferences.read() : 'stable').then(value => {
            if (!['stable', 'testing'].includes(value)) throw Error('invalid-update-channel');
            channel = value;
            return value;
        }).finally(() => { channelLoad = null; });
        return channelLoad;
    }

    function operation(kind, work) {
        if (closing || active || channelChange || installing) return Promise.resolve({status: 'error', reason: closing ? 'closed' : 'busy'});
        const controller = new AbortController();
        const record = {kind, controller, done: null};
        const timer = kind === 'check' ? setTimeout(() => { record.timedOut = true; controller.abort(); }, settings.checkTimeoutMs || 30000) : null;
        active = record;
        record.done = (async function () {
            try {
                const result = await work(controller.signal);
                return record.timedOut ? {status: 'error', reason: 'timeout'} : result;
            }
            catch (error) {
                const reasons = new Set(['file-exists', 'directory-invalid', 'unsafe-redirect', 'http-rejected', 'encoding-rejected', 'size-mismatch', 'hash-mismatch', 'timeout', 'cache-unsafe', 'disk-full', 'installer-launch-failed']);
                if (['ENOSPC', 'EDQUOT'].includes(error.code)) return {status: 'error', reason: 'disk-full'};
                if (['EACCES', 'EPERM', 'EROFS'].includes(error.code)) return {status: 'error', reason: 'cache-unwritable'};
                return record.timedOut ? {status: 'error', reason: 'timeout'} : controller.signal.aborted ? {status: 'cancelled'} :
                    {status: 'error', reason: reasons.has(error.code) ? error.code : 'maintenance_operation_failed'};
            } finally { if (timer) clearTimeout(timer); if (active === record) active = null; }
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

    registerHandler(CHANNELS.GET_CHANNEL, async function (request) {
        if (request !== undefined) return {status: 'error', reason: 'invalid-request'};
        if (channelChange) await channelChange.catch(() => {});
        if (closing) return {status: 'error', reason: 'closed'};
        let recovery = false;
        // Local cache faults must not disable read-only version/channel checks.
        try { if (settings.updateCache) recovery = await settings.updateCache.recovery(); }
        catch (_) { recovery = 'cache-unavailable'; }
        return {status: 'ok', channel: await currentChannel(), recovery};
    });

    registerHandler(CHANNELS.SET_CHANNEL, function (request) {
        if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).length !== 1 ||
            !Object.hasOwn(request, 'channel') || !['stable', 'testing'].includes(request.channel)) return {status: 'error', reason: 'invalid-request'};
        if (installing || channelChange || (active && active.kind === 'download')) return {status: 'error', reason: 'busy'};
        channelRevision++;
        candidate = null; checkedNoteUrls.clear();
        const previous = active;
        if (previous) previous.controller.abort();
        const change = (async function () {
            await currentChannel();
            if (previous) await previous.done;
            if (closing) return {status: 'error', reason: 'closed'};
            if (settings.preferences) await settings.preferences.save(request.channel);
            channel = request.channel;
            return {status: 'saved', channel};
        })();
        channelChange = change;
        return change.finally(() => { if (channelChange === change) channelChange = null; });
    });

    registerHandler(CHANNELS.CHECK_UPDATE, function (request) {
        if (request !== undefined) return {status: 'error', reason: 'invalid-request'};
        return operation('check', async function (signal) {
            candidate = null;
            checkedNoteUrls.clear();
            const revision = channelRevision, selectedChannel = await currentChannel();
            const info = await appInfo();
            if (signal.aborted) return {status: 'cancelled'};
            const result = await maintenance.checkLatestRelease({
                currentVersion: info.appVersion,
                channel: selectedChannel,
                requestJson: url => (settings.requestJson || appUpdate.requestJson)(url, {signal})
            });
            if (signal.aborted || revision !== channelRevision) return {status: 'cancelled'};
            if (['latest', 'ahead', 'update-available'].includes(result.status)) {
                checkedNoteUrls = new Set(noteLinks.parse(result.notes).filter(part => part.url).map(part => part.url));
            }
            if (result.status === 'update-available') candidate = {...result, channel: selectedChannel, revision};
            return result;
        });
    });

    registerHandler(CHANNELS.CANCEL, function (request) {
        if (request !== undefined) return {status: 'error', reason: 'invalid-request'};
        if (installing) return {status: 'error', reason: 'busy'};
        if (active) active.controller.abort();
        return {status: 'cancelled'};
    });

    registerHandler(CHANNELS.DOWNLOAD, function (request) {
        if (request !== undefined) return {status: 'error', reason: 'invalid-request'};
        return operation('download', async function (signal) {
            const selected = candidate;
            const selectedChannel = await currentChannel();
            if (!selected || !selected.installer || selected.channel !== selectedChannel || selected.revision !== channelRevision) return {status: 'error', reason: 'verification-unavailable'};
            // Refresh the exact official tag, never through a download proxy. Changed identity
            // requires another explicit check; cached or proxy supplied checksums are not trust.
            let release;
            try { release = await (settings.requestJson || appUpdate.requestJson)(appUpdate.API + 'tags/' + selected.releaseTag, {signal}); }
            catch (_) { return signal.aborted ? {status: 'cancelled'} : {status: 'error', reason: 'verification-unavailable'}; }
            const fresh = maintenance.describeRelease(release, {currentVersion: selected.currentVersion, channel: selectedChannel});
            if (signal.aborted) return {status: 'cancelled'};
            if (fresh.status !== 'update-available' || fresh.releaseTag !== selected.releaseTag ||
                fresh.prerelease !== selected.prerelease ||
                JSON.stringify(fresh.installer) !== JSON.stringify(selected.installer)) {
                candidate = null;
                return {status: 'error', reason: 'release-changed'};
            }
            if (!settings.updateCache || typeof settings.quitForUpdate !== 'function') return {status: 'error', reason: 'installer-launch-failed'};
            const deadline = Date.now() + 10 * 60 * 1000;
            const downloadRecord = active;
            const timer = setTimeout(() => { downloadRecord.timedOut = true; downloadRecord.controller.abort(); }, 10 * 60 * 1000);
            let lastProgress = 0;
            try {
                const downloaded = await settings.updateCache.download(fresh.installer, {
                    currentVersion: selected.currentVersion, targetVersion: fresh.latestVersion, tag: fresh.releaseTag,
                    signal, deadline, onProgress: function (progress) {
                        if (Date.now() - lastProgress < 150 && progress.bytes !== 0 && progress.bytes !== progress.total) return;
                        lastProgress = Date.now();
                        const contents = getWebContents && getWebContents();
                        if (!signal.aborted && contents && !contents.isDestroyed() && contents.mainFrame &&
                            rendererBoundary.isApplicationDocument(contents.mainFrame.url)) contents.send(CHANNELS.PROGRESS, progress);
                    }
                });
                if (signal.aborted) return {status: 'cancelled'};
                const lease = await settings.updateCache.prepare(downloaded, signal);
                try {
                    if (signal.aborted) return {status: 'cancelled'};
                    if (Date.now() >= deadline) throw Object.assign(Error('timeout'), {code: 'timeout'});
                    await lease.commit();
                    installing = true;
                    // Queue normal quit after this IPC operation releases its owner,
                    // so before-quit can drain maintenance without a self-deadlock.
                    settings.quitForUpdate();
                    return {status: 'installing', fileName: fresh.installer.name, sha256: fresh.installer.sha256,
                        source: downloaded.source, directory: downloaded.directory, reused: downloaded.reused};
                } finally { if (!installing) await lease.abort(); }
            } finally { clearTimeout(timer); }
        });
    });

    registerHandler(CHANNELS.OPEN_NOTE_LINK, async function (request) {
        if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).length !== 1 ||
            !Object.hasOwn(request, 'url') || typeof request.url !== 'string') return {status: 'error', reason: 'invalid-request'};
        const url = noteLinks.safeUrl(request.url);
        if (!url || !checkedNoteUrls.has(url)) return {status: 'error', reason: 'invalid-note-link'};
        if (!shell || typeof shell.openExternal !== 'function') return {status: 'error', reason: 'shell_unavailable'};
        await Promise.resolve(shell.openExternal(url));
        return {status: 'opened'};
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
        checkedNoteUrls.clear();
        if (active) active.controller.abort();
        if (typeof ipcMain.removeHandler === 'function') registered.forEach(function (channel) { ipcMain.removeHandler(channel); });
        unregisterPromise = Promise.allSettled([active && active.done, channelChange, channelLoad,
            settings.updateCache && settings.updateCache.close && settings.updateCache.close()]).then(() => undefined);
        return unregisterPromise;
    };
}

module.exports = {CHANNELS, register};
