'use strict';

const path = require('node:path');
const {Worker} = require('node:worker_threads');

const WORKER_PATH = path.join(__dirname, 'mpv-kernel-validation-worker.js');
const MAX_ARCHIVE_BYTES = 192 * 1024 * 1024;
const MAX_MEMBER_BYTES = Object.freeze({
    'candidate.json': 32 * 1024,
    'mpv-1.dll': 160 * 1024 * 1024,
    'SOURCE.txt': 64 * 1024,
    'NOTICE.txt': 64 * 1024
});
const MEMBER_NAMES = Object.freeze(Object.keys(MAX_MEMBER_BYTES));
const DEFAULT_TIMEOUT_MS = 120000;

function validationError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}

function transferableView(value, maxBytes) {
    if (!Buffer.isBuffer(value) || value.length > maxBytes) throw validationError('validation-input-invalid');
    if (value.byteOffset === 0 && value.byteLength === value.buffer.byteLength && value.buffer instanceof ArrayBuffer) {
        return new Uint8Array(value.buffer);
    }
    const copy = new Uint8Array(value.byteLength);
    copy.set(value);
    return copy;
}

function normalizeResult(message) {
    if (!message || message.ok !== true || !message.result || typeof message.result.candidateId !== 'string' ||
        !message.result.metadata || !message.result.checks || !message.result.members) {
        throw validationError(message && typeof message.code === 'string' ? message.code : 'validation-worker-failed');
    }
    const members = {};
    for (const name of MEMBER_NAMES) {
        const value = message.result.members[name];
        if (!(value instanceof Uint8Array) || value.byteLength > MAX_MEMBER_BYTES[name]) throw validationError('validation-worker-failed');
        members[name] = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    }
    return Object.freeze({
        candidateId: message.result.candidateId,
        metadata: Object.freeze(message.result.metadata),
        members: Object.freeze(members),
        checks: Object.freeze(message.result.checks)
    });
}

function runValidation(kind, input, expectedHelperIdentity, options) {
    const settings = options || {};
    const signal = settings.signal;
    const WorkerClass = typeof settings.WorkerClass === 'function' ? settings.WorkerClass : Worker;
    const timeoutMs = Number.isSafeInteger(settings.timeoutMs) && settings.timeoutMs > 0
        ? Math.min(settings.timeoutMs, DEFAULT_TIMEOUT_MS)
        : DEFAULT_TIMEOUT_MS;
    if (signal && signal.aborted) return Promise.reject(validationError('validation-cancelled'));
    if (!expectedHelperIdentity || typeof expectedHelperIdentity.sha256 !== 'string' || typeof expectedHelperIdentity.version !== 'string') {
        return Promise.reject(validationError('helper-contract-invalid'));
    }

    let payload;
    const transferList = [];
    try {
        if (kind === 'archive') {
            payload = {kind, bytes: transferableView(input, MAX_ARCHIVE_BYTES)};
            transferList.push(payload.bytes.buffer);
        } else if (kind === 'members') {
            if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== MEMBER_NAMES.length ||
                MEMBER_NAMES.some(name => !Object.hasOwn(input, name))) throw validationError('validation-input-invalid');
            const members = {};
            for (const name of MEMBER_NAMES) {
                const view = transferableView(input[name], MAX_MEMBER_BYTES[name]);
                members[name] = view;
                transferList.push(view.buffer);
            }
            payload = {kind, members};
        } else {
            throw validationError('validation-input-invalid');
        }
    } catch (error) {
        return Promise.reject(error && typeof error.code === 'string' ? error : validationError('validation-input-invalid'));
    }

    return new Promise((resolve, reject) => {
        let completed = false;
        let exitHandled = false;
        let timer = null;
        let worker;
        let pendingError = null;
        let pendingResult = null;
        let hasMessage = false;
        let terminationRequested = false;

        function finishAfterExit(code) {
            if (completed || exitHandled) return;
            exitHandled = true;
            if (timer !== null) clearTimeout(timer);
            if (signal) signal.removeEventListener('abort', abort);
            completed = true;
            if (pendingError) reject(pendingError);
            else if (!hasMessage || code !== 0) reject(validationError('validation-worker-failed'));
            else resolve(pendingResult);
        }

        function requestTermination(code) {
            if (completed) return;
            if (!pendingError) pendingError = validationError(code);
            if (!worker) {
                finishAfterExit(1);
                return;
            }
            if (terminationRequested) return;
            terminationRequested = true;
            // Both the exit event and terminate() completion represent this owned Worker.
            // Settle only after one confirms that it has stopped.
            worker.terminate().then(
                exitCode => {
                    terminationRequested = false;
                    finishAfterExit(exitCode);
                },
                () => {
                    terminationRequested = false;
                    // A rejection is not a join receipt. Wait for the exact worker's exit event;
                    // the still-armed validation timer can retry termination if it remains alive.
                    if (worker.threadId === -1) finishAfterExit(1);
                }
            );
        }

        function abort() { requestTermination('validation-cancelled'); }

        try {
            worker = new WorkerClass(WORKER_PATH, {name: 'ete-mpv-kernel-validation'});
        } catch (_) {
            pendingError = validationError('validation-worker-unavailable');
            finishAfterExit(1);
            return;
        }
        if (signal) signal.addEventListener('abort', abort, {once: true});
        timer = setTimeout(() => requestTermination('validation-timeout'), timeoutMs);
        worker.once('message', message => {
            if (pendingError || completed) return;
            hasMessage = true;
            try { pendingResult = normalizeResult(message); }
            catch (error) { pendingError = error && typeof error.code === 'string' ? error : validationError('validation-worker-failed'); }
        });
        worker.once('error', () => {
            if (pendingError || completed) return;
            pendingError = validationError('validation-worker-failed');
        });
        worker.once('exit', code => {
            if (completed) return;
            if (!pendingError && (!hasMessage || code !== 0)) pendingError = validationError('validation-worker-failed');
            finishAfterExit(code);
        });
        try {
            worker.postMessage({kind, payload, expectedHelperIdentity}, transferList);
        } catch (_) {
            requestTermination('validation-worker-failed');
        }
    });
}

function validateCandidateArchiveInWorker(buffer, expectedHelperIdentity, options) {
    return runValidation('archive', buffer, expectedHelperIdentity, options);
}

function validateCandidateMembersInWorker(members, expectedHelperIdentity, options) {
    return runValidation('members', members, expectedHelperIdentity, options);
}

module.exports = Object.freeze({
    validateCandidateArchiveInWorker,
    validateCandidateMembersInWorker
});
