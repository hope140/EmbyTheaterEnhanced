'use strict';

const boundary = require('../renderer-boundary');
const preferences = require('./directory-preferences');
const {createManager} = require('./manager');
const probe = require('./source-probe');
const CHANNELS = Object.freeze({START: 'enhanced-download-start', ATTACH: 'enhanced-download-attach',
    DETACH: 'enhanced-download-detach',
    OPEN_FOLDER: 'enhanced-download-open-folder', STATUS: 'enhanced-download-status', DIRECTORY: 'enhanced-download-directory', RETRY: 'enhanced-download-retry',
    LOOKUP: 'enhanced-download-lookup', CANCEL_LOOKUP: 'enhanced-download-lookup-cancel', PROGRESS: 'enhanced-download-progress'});
function context(value) {
    if (!value || ['serverId', 'accountId'].some(key => typeof value[key] !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(value[key])) ||
        typeof value.token !== 'string' || !value.token || value.token.length > 8192 || /[\u0000-\u001f\u007f]/.test(value.token)) throw probe.failure('invalid-request');
    const url = probe.sourceUrl(value.serverAddress);
    if (url.search || url.hash) throw probe.failure('invalid-server');
    return {serverId: value.serverId, accountId: value.accountId, serverAddress: url.href.replace(/\/+$/, ''), token: value.token};
}
function media(value) {
    if (!value || ['itemId', 'mediaSourceId'].some(key => value[key] !== undefined && (typeof value[key] !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(value[key]))) || !value.itemId) throw probe.failure('invalid-request');
    return {itemId: value.itemId, ...(value.mediaSourceId ? {mediaSourceId: value.mediaSourceId} : {})};
}
function errorReason(error) {
    const match = /^advance-download-(directory-invalid|directory-unavailable|settings-invalid|settings-save-failed)$/.exec(error?.message || '');
    return match ? match[1] : probe.reasonOf(error);
}

function register(options) {
    const {ipcMain, getWebContents} = options;
    const store = options.preferences || preferences.createStore(options.profileRoot);
    const selector = preferences.createSelector({store, dialog: options.dialog, getWindow: options.getBrowserWindow});
    const lookups = new Map(), dialogs = new Set(), handlers = [];
    let closing = false, epoch = 0, ui, observed, unregistration, lastProgress = 0, previousEvent;
    const manager = (options.createManager || createManager)({profileRoot: options.profileRoot,
        sourceDependencies: options.sourceDependencies, selectDirectory: value => selector.select(value),
        onChange(value) {
            if (closing || !ui || ui.epoch !== epoch || !boundary.isTrusted({sender: ui.sender, senderFrame: ui.frame}, getWebContents())) return;
            const changed = !previousEvent || previousEvent.id !== value.id || previousEvent.state !== value.state || previousEvent.reason !== value.reason;
            if (!changed && Date.now() - lastProgress < 250) return;
            previousEvent = value; lastProgress = Date.now();
            try {ui.sender.send(CHANNELS.PROGRESS, value);} catch (_) {}
            try {options.getBrowserWindow?.()?.setProgressBar(value.state === 'downloading' && value.total ? value.bytes / value.total : -1);} catch (_) {}
        }});
    function retire() {
        epoch++; ui = null;
        previousEvent = null;
        try {options.getBrowserWindow?.()?.setProgressBar(-1);} catch (_) {}
        for (const record of lookups.values()) record.controller.abort();
        for (const controller of dialogs) controller.abort();
        manager.pauseAll().catch(() => {});
    }
    function navigation(details, _url, isInPlace, isMainFrame) {
        const main = typeof details?.isMainFrame === 'boolean' ? details.isMainFrame : isMainFrame;
        const same = typeof details?.isSameDocument === 'boolean' ? details.isSameDocument : isInPlace;
        if (main === true && same !== true) retire();
    }
    function observe(sender) {
        if (observed === sender) return;
        if (observed) {observed.removeListener('did-start-navigation', navigation); observed.removeListener('destroyed', retire); observed.removeListener('render-process-gone', retire);}
        observed = sender;
        sender.on('did-start-navigation', navigation); sender.on('destroyed', retire); sender.on('render-process-gone', retire);
    }
    function handle(channel, work) {
        handlers.push(channel);
        ipcMain.handle(channel, async (event, request = {}) => {
            if (closing || !boundary.isTrusted(event, getWebContents())) return {status: 'error', reason: 'untrusted-sender'};
            const expectedEpoch = epoch;
            try {
                observe(event.sender); ui = {sender: event.sender, frame: event.senderFrame, epoch};
                const result = await work(request);
                return closing || epoch !== expectedEpoch ? {status: 'cancelled'} : result;
            } catch (error) {return {status: 'error', reason: errorReason(error)};}
        });
    }
    handle(CHANNELS.ATTACH, request => {manager.attach(context(request.context)); return {status: 'ok'};});
    handle(CHANNELS.DETACH, async () => {await manager.pauseAll(); return {status: 'ok'};});
    handle(CHANNELS.START, request => manager.enqueue({...context(request.context), ...media(request),
        displayTitle: typeof request.title === 'string' ? request.title.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 256) : undefined}));
    handle(CHANNELS.STATUS, request => {
        const current = context(request.context); manager.attach(current);
        return {status: 'ok', directory: store.read(), tasks: manager.list(current)};
    });
    handle(CHANNELS.DIRECTORY, async request => {
        context(request.context);
        const controller = new AbortController(); dialogs.add(controller);
        try {return await selector.select({force: true, signal: controller.signal});}
        finally {dialogs.delete(controller);}
    });
    handle(CHANNELS.OPEN_FOLDER, async request => {
        const current = context(request.context);
        if (request.taskId !== undefined && (typeof request.taskId !== 'string' || request.taskId.length > 80)) throw probe.failure('invalid-request');
        const directory = request.taskId === undefined ? store.read() : manager.directory(current, request.taskId);
        if (!directory) throw probe.failure('directory-unavailable');
        const root = preferences.physicalDirectory(directory);
        if (!options.shell || typeof options.shell.openPath !== 'function') throw probe.failure('folder-open-failed');
        let result;
        try {result = await options.shell.openPath(root);} catch (_) {throw probe.failure('folder-open-failed');}
        if (result) throw probe.failure('folder-open-failed');
        return {status: 'ok'};
    });
    handle(CHANNELS.RETRY, request => manager.retry(context(request.context), request.taskId));
    handle(CHANNELS.LOOKUP, request => {
        const current = {...context(request.context), ...media(request)};
        if (typeof request.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(request.requestId) || lookups.has(request.requestId) || lookups.size >= 8) throw probe.failure('invalid-request');
        const record = {controller: new AbortController()}; lookups.set(request.requestId, record);
        record.done = manager.localSource(current, record.controller.signal).then(value => value || {status: 'miss'}).finally(() => {
            if (lookups.get(request.requestId) === record) lookups.delete(request.requestId);
        });
        return record.done;
    });
    function cancel(event, request) {
        if (boundary.isTrusted(event, getWebContents())) lookups.get(request?.requestId)?.controller.abort();
    }
    ipcMain.on(CHANNELS.CANCEL_LOOKUP, cancel);
    return function unregister() {
        if (!unregistration) {
            closing = true;
            retire();
            for (const name of handlers) ipcMain.removeHandler(name);
            ipcMain.removeListener(CHANNELS.CANCEL_LOOKUP, cancel);
            if (observed) {observed.removeListener('did-start-navigation', navigation); observed.removeListener('destroyed', retire); observed.removeListener('render-process-gone', retire);}
            unregistration = Promise.allSettled([manager.close(), ...[...lookups.values()].map(value => value.done)]).then(() => undefined);
        }
        return unregistration;
    };
}
module.exports = {CHANNELS, register};
