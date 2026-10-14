'use strict';

const rendererBoundary = require('./renderer-boundary');

const CHANNELS = Object.freeze({
    GET_STATUS: 'enhanced-mpv-kernel-status',
    IMPORT: 'enhanced-mpv-kernel-import',
    SELECT: 'enhanced-mpv-kernel-select'
});

const REASONS = new Set([
    'package-identity-unavailable', 'store-unavailable', 'store-closed', 'invalid-request',
    'package-file-invalid', 'package-file-unavailable', 'package-file-unstable', 'package-size-invalid',
    'package-file-read-failed', 'validation-cancelled', 'validation-timeout', 'validation-worker-unavailable',
    'validation-worker-failed', 'zip-invalid', 'schema-invalid', 'helper-contract-invalid', 'hash-mismatch',
    'text-invalid', 'pe-invalid', 'candidate-id-conflict', 'candidate-not-found', 'candidate-integrity-failed',
    'candidate-write-failed', 'state-invalid', 'state-write-failed', 'invalid-candidate-id', 'profile-unavailable',
    'store-unavailable', 'objects-unavailable', 'selection-invalid', 'activation-result-invalid',
    'state-file-invalid', 'state-file-unavailable', 'state-invalid'
]);

function safeReason(error) {
    return error && REASONS.has(error.code) ? error.code : 'kernel-operation-failed';
}

function register(options) {
    const settings = options || {};
    const ipcMain = settings.ipcMain;
    const dialog = settings.dialog;
    const store = settings.store || null;
    const unavailableReason = settings.unavailableReason === 'store-unavailable'
        ? 'store-unavailable'
        : 'package-identity-unavailable';
    const service = settings.service || null;
    const getWebContents = settings.getWebContents;
    const getBrowserWindow = settings.getBrowserWindow || function () { return null; };
    const registered = [];
    let closing = false;
    let queue = Promise.resolve();
    let unregisterPromise = null;

    function trusted(event) {
        const expected = typeof getWebContents === 'function' ? getWebContents() : null;
        return rendererBoundary.isTrusted(event, expected);
    }

    function enqueue(operation) {
        if (closing) return Promise.resolve({status: 'error', reason: 'store-closed'});
        const result = queue.then(function () {
            if (closing) return {status: 'error', reason: 'store-closed'};
            return operation();
        });
        queue = result.catch(function () {});
        return result;
    }

    function runtimeStatus() {
        try {
            return service && typeof service.kernelStatus === 'function' ? service.kernelStatus() : null;
        } catch (_) { return null; }
    }

    function registerHandler(channel, handler) {
        ipcMain.handle(channel, async function (event, request) {
            if (!trusted(event)) return {status: 'error', reason: 'untrusted_sender'};
            try { return await handler(request); }
            catch (error) { return {status: 'error', reason: safeReason(error)}; }
        });
        registered.push(channel);
    }

    registerHandler(CHANNELS.GET_STATUS, function (request) {
        if (request !== undefined) return {status: 'error', reason: 'invalid-request'};
        return enqueue(async function () {
            if (!store) return {status: 'unavailable', reason: unavailableReason, runtime: runtimeStatus()};
            try {
                const result = await store.getStatus();
                return Object.assign({}, result, {runtime: runtimeStatus()});
            } catch (error) {
                return {status: 'error', reason: safeReason(error), runtime: runtimeStatus()};
            }
        });
    });

    registerHandler(CHANNELS.IMPORT, function (request) {
        if (request !== undefined) return {status: 'error', reason: 'invalid-request'};
        return enqueue(async function () {
            if (!store) return {status: 'unavailable', reason: unavailableReason, runtime: runtimeStatus()};
            if (!dialog || typeof dialog.showOpenDialog !== 'function') return {status: 'error', reason: 'dialog-unavailable'};
            const result = await dialog.showOpenDialog(getBrowserWindow(), {
                title: '导入 libmpv 候选包',
                properties: ['openFile'],
                filters: [{name: 'ETE libmpv candidate package', extensions: ['zip']}]
            });
            if (closing) return {status: 'error', reason: 'store-closed'};
            if (!result || result.canceled) return {status: 'cancelled'};
            if (!Array.isArray(result.filePaths) || result.filePaths.length !== 1 || typeof result.filePaths[0] !== 'string') {
                return {status: 'error', reason: 'package-file-invalid'};
            }
            const imported = await store.importPackageFile(result.filePaths[0]);
            return {status: 'imported', candidate: imported.candidate, selected: false, pendingRestart: false,
                runtime: runtimeStatus()};
        });
    });

    registerHandler(CHANNELS.SELECT, function (request) {
        if (!request || typeof request !== 'object' || Array.isArray(request) ||
            Object.keys(request).length !== 1 || !Object.hasOwn(request, 'candidateId') ||
            !(request.candidateId === null || (typeof request.candidateId === 'string' && /^[0-9a-f]{64}$/.test(request.candidateId)))) {
            return {status: 'error', reason: 'invalid-request'};
        }
        return enqueue(async function () {
            if (!store) return {status: 'unavailable', reason: unavailableReason, runtime: runtimeStatus()};
            const result = await store.selectCandidate(request.candidateId);
            return {status: 'selected', selectedCandidateId: result.selectedCandidateId,
                pendingRestart: result.pendingRestart === true, runtime: runtimeStatus()};
        });
    });

    return function unregister() {
        if (unregisterPromise) return unregisterPromise;
        closing = true;
        if (typeof ipcMain.removeHandler === 'function') registered.forEach(channel => ipcMain.removeHandler(channel));
        const storeClose = store && typeof store.close === 'function' ? Promise.resolve().then(() => store.close()) : Promise.resolve();
        // A native file picker cannot be cancelled by Electron. Do not make application shutdown
        // wait for its promise; its continuation checks `closing` before it can enter the store.
        unregisterPromise = storeClose.then(() => undefined);
        return unregisterPromise;
    };
}

module.exports = {CHANNELS, register};
