'use strict';

const crypto = require('crypto');
const fsModule = require('fs');
const path = require('path');

const validation = require('./mpv-kernel-validation');

const SCHEMA_VERSION = 1;
const MAX_ARCHIVE_BYTES = 192 * 1024 * 1024;
const MAX_DLL_BYTES = 160 * 1024 * 1024;
const MEMBER_LIMITS = {
    'candidate.json': 32 * 1024,
    'mpv-1.dll': MAX_DLL_BYTES,
    'SOURCE.txt': 64 * 1024,
    'NOTICE.txt': 64 * 1024
};
const MAX_ACTIVATION_HISTORY = 16;
const OUTCOMES = new Set(['candidate-ready', 'candidate-fallback', 'baseline-start-failed']);
const REASON_CODES = new Set([
    'candidate-ready', 'candidate-start-failed', 'candidate-handshake-failed',
    'candidate-exit-unconfirmed', 'candidate-integrity-failed', 'candidate-not-found',
    'selection-invalid', 'base-start-failed', 'unknown'
]);
const HASH_RE = /^[a-f0-9]{64}$/;
const MEMBER_NAMES = Object.keys(MEMBER_LIMITS);

function codedError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function keysExactly(value, keys) {
    return isRecord(value) && Object.keys(value).sort().join('\0') === keys.slice().sort().join('\0');
}

function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.keys(value).forEach(key => deepFreeze(value[key]));
        Object.freeze(value);
    }
    return value;
}

function sameStat(left, right) {
    return left.isFile() && right.isFile() && left.dev === right.dev && left.ino === right.ino &&
        left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

function safeCode(error, fallback) {
    return error && typeof error.code === 'string' && /^[a-z0-9-]{1,48}$/.test(error.code)
        ? error.code
        : fallback;
}

function makeStoreError(code) {
    return codedError(code);
}

function createStore(options) {
    if (!isRecord(options) || typeof options.profileRoot !== 'string' || !path.isAbsolute(options.profileRoot)) {
        throw makeStoreError('invalid-profile-root');
    }
    if (!isRecord(options.expectedHelperIdentity)) throw makeStoreError('invalid-helper-identity');

    const fs = options.fs || fsModule.promises;
    const root = path.join(options.profileRoot, 'mpv-kernels');
    const objectsRoot = path.join(root, 'objects');
    const statePath = path.join(root, 'state.json');
    let closed = false;
    let queue = Promise.resolve();
    let startupSnapshot;
    let stateCache;
    let stateError;
    let stateMissing = false;
    let activeValidationController = null;

    function enqueue(operation) {
        if (closed) return Promise.reject(makeStoreError('store-closed'));
        const result = queue.then(() => {
            if (closed) throw makeStoreError('store-closed');
            return operation();
        });
        queue = result.catch(() => undefined);
        return result;
    }

    async function inspectPath(target, kind) {
        let info;
        try { info = await fs.lstat(target); }
        catch (error) {
            if (error && error.code === 'ENOENT') return null;
            throw makeStoreError(kind + '-unavailable');
        }
        if (info.isSymbolicLink() || (kind.endsWith('-dir') ? !info.isDirectory() : !info.isFile())) {
            throw makeStoreError(kind + '-invalid');
        }
        return info;
    }

    async function readStableFile(target, maxBytes, code) {
        if (closed) throw makeStoreError('store-closed');
        let before;
        try { before = await fs.lstat(target); }
        catch (error) {
            if (error && error.code === 'ENOENT') return null;
            throw makeStoreError(code);
        }
        if (closed) throw makeStoreError('store-closed');
        if (!before.isFile() || before.isSymbolicLink() || before.size > maxBytes) throw makeStoreError(code);
        let handle;
        try {
            const flags = fsModule.constants.O_RDONLY | (fsModule.constants.O_NOFOLLOW || 0);
            handle = await fs.open(target, flags);
            if (closed) throw makeStoreError('store-closed');
            const openedBefore = await handle.stat();
            if (!sameStat(before, openedBefore)) throw makeStoreError(code);
            const data = await handle.readFile();
            if (closed) throw makeStoreError('store-closed');
            const extraByte = Buffer.alloc(1);
            const extra = await handle.read(extraByte, 0, 1, data.length);
            const openedAfter = await handle.stat();
            const after = await fs.lstat(target);
            if (extra.bytesRead || !sameStat(openedBefore, openedAfter) || !sameStat(openedAfter, after) || data.length !== openedAfter.size) {
                throw makeStoreError(code);
            }
            return data;
        } catch (error) {
            if (error && error.code === 'store-closed') throw error;
            if (error && error.code === code) throw error;
            throw makeStoreError(code);
        } finally {
            if (handle) await handle.close().catch(() => undefined);
        }
    }

    async function ensureDirectory(target, code) {
        const found = await inspectPath(target, 'store-dir');
        if (found) return;
        try { await fs.mkdir(target); }
        catch (error) {
            if (!error || error.code !== 'EEXIST') throw makeStoreError(code);
        }
        if (!await inspectPath(target, 'store-dir')) throw makeStoreError(code);
    }

    async function ensureRoots() {
        if (closed) throw makeStoreError('store-closed');
        const profileStat = await inspectPath(options.profileRoot, 'profile-dir');
        if (closed) throw makeStoreError('store-closed');
        if (!profileStat) throw makeStoreError('profile-unavailable');
        await ensureDirectory(root, 'store-unavailable');
        if (closed) throw makeStoreError('store-closed');
        await ensureDirectory(objectsRoot, 'objects-unavailable');
        if (closed) throw makeStoreError('store-closed');
    }

    async function loadState() {
        if (closed) throw makeStoreError('store-closed');
        await ensureRoots();
        if (closed) throw makeStoreError('store-closed');
        let info;
        try { info = await inspectPath(statePath, 'state-file'); }
        catch (error) {
            if (closed) throw makeStoreError('store-closed');
            if (!error || error.code !== 'state-file-invalid') throw error;
            stateError = 'state-invalid';
            stateMissing = false;
            stateCache = {schemaVersion: SCHEMA_VERSION, selectedCandidateId: null, activationHistory: []};
            return stateCache;
        }
        if (closed) throw makeStoreError('store-closed');
        if (!info) {
            stateCache = {schemaVersion: SCHEMA_VERSION, selectedCandidateId: null, activationHistory: []};
            stateError = null;
            stateMissing = true;
            return stateCache;
        }
        if (info.size > 16 * 1024) {
            stateError = 'state-invalid';
            stateMissing = false;
            stateCache = {schemaVersion: SCHEMA_VERSION, selectedCandidateId: null, activationHistory: []};
            return stateCache;
        }
        try {
            const stateBytes = await readStableFile(statePath, 16 * 1024, 'state-invalid');
            if (closed) throw makeStoreError('store-closed');
            if (!stateBytes) throw new Error('missing');
            const parsed = JSON.parse(stateBytes.toString('utf8'));
            if (!keysExactly(parsed, ['schemaVersion', 'selectedCandidateId', 'activationHistory']) || parsed.schemaVersion !== SCHEMA_VERSION ||
                !(parsed.selectedCandidateId === null || (typeof parsed.selectedCandidateId === 'string' && HASH_RE.test(parsed.selectedCandidateId))) ||
                !Array.isArray(parsed.activationHistory) || parsed.activationHistory.length > MAX_ACTIVATION_HISTORY ||
                parsed.activationHistory.some(entry => !keysExactly(entry, ['candidateId', 'outcome', 'reasonCode']) ||
                    !(entry.candidateId === null || (typeof entry.candidateId === 'string' && HASH_RE.test(entry.candidateId))) ||
                    !OUTCOMES.has(entry.outcome) || !REASON_CODES.has(entry.reasonCode))) {
                throw new Error('invalid');
            }
            stateCache = {
                schemaVersion: SCHEMA_VERSION,
                selectedCandidateId: parsed.selectedCandidateId,
                activationHistory: parsed.activationHistory.map(entry => ({
                    candidateId: entry.candidateId,
                    outcome: entry.outcome,
                    reasonCode: entry.reasonCode
                }))
            };
            stateError = null;
            stateMissing = false;
        } catch (_) {
            stateError = 'state-invalid';
            stateMissing = false;
            stateCache = {schemaVersion: SCHEMA_VERSION, selectedCandidateId: null, activationHistory: []};
        }
        return stateCache;
    }

    async function validateMembers(members, expectedId) {
        if (closed) throw makeStoreError('store-closed');
        if (!isRecord(members) || Object.keys(members).length !== MEMBER_NAMES.length ||
            MEMBER_NAMES.some(name => !Buffer.isBuffer(members[name]) || members[name].length > MEMBER_LIMITS[name])) {
            throw makeStoreError('candidate-integrity-failed');
        }
        const controller = new AbortController();
        activeValidationController = controller;
        let result;
        try {
            result = await (options.validateMembers || validation.validateCandidateMembersInWorker)(
                members, options.expectedHelperIdentity, {signal: controller.signal}
            );
        } finally {
            if (activeValidationController === controller) activeValidationController = null;
        }
        if (closed) throw makeStoreError('store-closed');
        if (!result || !HASH_RE.test(result.candidateId) ||
            (expectedId && result.candidateId !== expectedId) || !result.members ||
            MEMBER_NAMES.some(name => !Buffer.isBuffer(result.members[name]))) throw makeStoreError('candidate-integrity-failed');
        return result;
    }

    function publicCandidate(validated) {
        return {
            candidateId: validated.candidateId,
            version: validated.metadata.libmpv.version,
            sizeBytes: validated.metadata.libmpv.sizeBytes,
            packageIntegrity: 'VERIFIED',
            staticCompatibility: 'PASSED',
            sourceEvidence: 'DECLARED_UNVERIFIED',
            noticeEvidence: 'PRESENT_UNVERIFIED',
            releaseability: 'NOT_ASSESSED'
        };
    }

    async function readObject(candidateId) {
        if (closed) throw makeStoreError('store-closed');
        if (!HASH_RE.test(candidateId)) throw makeStoreError('invalid-candidate-id');
        await ensureRoots();
        if (closed) throw makeStoreError('store-closed');
        const objectDir = path.join(objectsRoot, candidateId);
        const dirStat = await inspectPath(objectDir, 'object-dir');
        if (closed) throw makeStoreError('store-closed');
        if (!dirStat) return null;
        const members = {};
        for (const name of MEMBER_NAMES) {
            const filePath = path.join(objectDir, name);
            const data = await readStableFile(filePath, MEMBER_LIMITS[name], 'candidate-integrity-failed');
            if (closed) throw makeStoreError('store-closed');
            if (!data) throw makeStoreError('candidate-integrity-failed');
            members[name] = data;
        }
        if (closed) throw makeStoreError('store-closed');
        const validated = await validateMembers(members, candidateId);
        if (closed) throw makeStoreError('store-closed');
        return {members: validated.members, validated};
    }

    async function writeAtomic(target, bytes, prefix) {
        const tempPath = target + '.' + prefix + '-' + process.pid + '-' + crypto.randomBytes(8).toString('hex');
        let created = false;
        try {
            const handle = await fs.open(tempPath, 'wx', 0o600);
            created = true;
            try {
                await handle.writeFile(bytes);
                if (typeof handle.sync === 'function') await handle.sync();
            } finally {
                await handle.close();
            }
            if (closed) throw makeStoreError('store-closed');
            await fs.rename(tempPath, target);
            created = false;
        } catch (error) {
            if (created) {
                try { await fs.unlink(tempPath); } catch (_) { /* only our unique temporary file */ }
            }
            throw error;
        }
    }

    async function persistState(next, allowBaselineRepair) {
        await ensureRoots();
        const existing = await inspectPath(statePath, 'state-file');
        if (existing && existing.size > 16 * 1024 && !(allowBaselineRepair === true && next.selectedCandidateId === null)) {
            throw makeStoreError('state-invalid');
        }
        const body = Buffer.from(JSON.stringify({
            schemaVersion: SCHEMA_VERSION,
            selectedCandidateId: next.selectedCandidateId,
            activationHistory: next.activationHistory.slice(-MAX_ACTIVATION_HISTORY)
        }) + '\n', 'utf8');
        try { await writeAtomic(statePath, body, 'state'); }
        catch (_) { throw makeStoreError('state-write-failed'); }
        stateCache = {
            schemaVersion: SCHEMA_VERSION,
            selectedCandidateId: next.selectedCandidateId,
            activationHistory: next.activationHistory.slice(-MAX_ACTIVATION_HISTORY)
        };
        stateError = null;
        stateMissing = false;
    }

    async function persistCandidate(validated) {
        await ensureRoots();
        const candidateId = validated.candidateId;
        const target = path.join(objectsRoot, candidateId);
        const existingDir = await inspectPath(target, 'object-dir');
        if (existingDir) {
            const existing = await readObject(candidateId);
            if (!existing || MEMBER_NAMES.some(name => !existing.members[name].equals(validated.members[name]))) {
                throw makeStoreError('candidate-id-conflict');
            }
            return;
        }

        const staging = path.join(objectsRoot, '.stage-' + process.pid + '-' + crypto.randomBytes(12).toString('hex'));
        let madeStage = false;
        try {
            await fs.mkdir(staging);
            madeStage = true;
            for (const name of MEMBER_NAMES) {
                const handle = await fs.open(path.join(staging, name), 'wx', 0o444);
                try {
                    await handle.writeFile(validated.members[name]);
                    if (typeof handle.sync === 'function') await handle.sync();
                } finally {
                    await handle.close();
                }
            }
            const onDisk = {};
            for (const name of MEMBER_NAMES) {
                const filePath = path.join(staging, name);
                const fileStat = await inspectPath(filePath, 'object-file');
                if (!fileStat || fileStat.size > MEMBER_LIMITS[name]) throw makeStoreError('candidate-integrity-failed');
                onDisk[name] = await fs.readFile(filePath);
                if (onDisk[name].length !== fileStat.size) throw makeStoreError('candidate-integrity-failed');
            }
            if (MEMBER_NAMES.some(name => !onDisk[name].equals(validated.members[name]))) {
                throw makeStoreError('candidate-integrity-failed');
            }
            if (closed) throw makeStoreError('store-closed');
            await fs.rename(staging, target);
            madeStage = false;
        } catch (error) {
            if (madeStage) await removeOwnStage(staging);
            if (error && error.code === 'candidate-id-conflict') throw error;
            throw makeStoreError(safeCode(error, 'candidate-write-failed'));
        }
    }

    async function removeOwnStage(stagePath) {
        try {
            const entries = await fs.readdir(stagePath);
            for (const entry of entries) {
                const filePath = path.join(stagePath, entry);
                const info = await fs.lstat(filePath);
                if (info.isFile() && !info.isSymbolicLink()) await fs.unlink(filePath);
            }
            await fs.rmdir(stagePath);
        } catch (_) { /* never remove anything outside this operation's unique stage */ }
    }

    async function listCandidates() {
        if (closed) throw makeStoreError('store-closed');
        await ensureRoots();
        const entries = await fs.readdir(objectsRoot, {withFileTypes: true});
        if (closed) throw makeStoreError('store-closed');
        const candidates = [];
        for (const entry of entries) {
            if (closed) throw makeStoreError('store-closed');
            if (!HASH_RE.test(entry.name)) continue;
            try {
                const found = await readObject(entry.name);
                if (closed) throw makeStoreError('store-closed');
                if (found) candidates.push(publicCandidate(found.validated));
            } catch (error) {
                if (closed || error && error.code === 'store-closed') throw makeStoreError('store-closed');
                /* invalid objects remain unavailable */
            }
        }
        candidates.sort((a, b) => a.candidateId.localeCompare(b.candidateId));
        return candidates;
    }

    async function doImportBuffer(buffer) {
        if (closed) throw makeStoreError('store-closed');
        if (!Buffer.isBuffer(buffer) || buffer.length > MAX_ARCHIVE_BYTES) throw makeStoreError('package-size-invalid');
        let validated;
        const controller = new AbortController();
        activeValidationController = controller;
        try {
            validated = await (options.validateArchive || validation.validateCandidateArchiveInWorker)(
                buffer, options.expectedHelperIdentity, {signal: controller.signal}
            );
        } catch (error) {
            throw makeStoreError(safeCode(error, 'package-invalid'));
        } finally {
            if (activeValidationController === controller) activeValidationController = null;
        }
        if (closed) throw makeStoreError('store-closed');
        await persistCandidate(validated);
        const candidate = publicCandidate(validated);
        return {candidate, imported: true, selected: false, pendingRestart: false};
    }

    async function doGetStatus() {
        if (closed) throw makeStoreError('store-closed');
        const state = await loadState();
        if (closed) throw makeStoreError('store-closed');
        const candidates = await listCandidates();
        if (closed) throw makeStoreError('store-closed');
        const selectedExists = state.selectedCandidateId === null || candidates.some(item => item.candidateId === state.selectedCandidateId);
        const selectionState = stateError ? 'invalid' : (stateMissing ? 'missing' : (selectedExists ? 'valid' : 'invalid'));
        return {
            status: 'ok',
            selectedCandidateId: selectedExists && !stateError ? state.selectedCandidateId : null,
            selectionState,
            candidates,
            lastActivation: state.activationHistory.length ? state.activationHistory[state.activationHistory.length - 1] : null
        };
    }

    async function ensureStateForMutation() {
        if (!stateCache) await loadState();
        return stateCache;
    }

    return {
        // Returns only sanitized selection, candidate summary, and last activation data; never a path.
        getStatus() {
            return enqueue(doGetStatus);
        },

        importPackageFile(selectedPath) {
            return enqueue(async () => {
                if (typeof selectedPath !== 'string' || !path.isAbsolute(selectedPath)) throw makeStoreError('package-file-invalid');
                let before;
                try { before = await fs.lstat(selectedPath); }
                catch (_) { throw makeStoreError('package-file-unavailable'); }
                if (!before.isFile() || before.isSymbolicLink() || before.size < 1 || before.size > MAX_ARCHIVE_BYTES) {
                    throw makeStoreError(before.size > MAX_ARCHIVE_BYTES ? 'package-size-invalid' : 'package-file-invalid');
                }
                let handle;
                try {
                    const flags = fsModule.constants.O_RDONLY | (fsModule.constants.O_NOFOLLOW || 0);
                    handle = await fs.open(selectedPath, flags);
                    const openedBefore = await handle.stat();
                    if (!sameStat(before, openedBefore) || openedBefore.size > MAX_ARCHIVE_BYTES) throw makeStoreError('package-file-unstable');
                    const buffer = Buffer.alloc(openedBefore.size);
                    let offset = 0;
                    while (offset < buffer.length) {
                        const read = await handle.read(buffer, offset, buffer.length - offset, offset);
                        if (!read.bytesRead) throw makeStoreError('package-file-unstable');
                        offset += read.bytesRead;
                    }
                    const extraByte = Buffer.alloc(1);
                    const extra = await handle.read(extraByte, 0, 1, offset);
                    const openedAfter = await handle.stat();
                    const after = await fs.lstat(selectedPath);
                    if (extra.bytesRead || !sameStat(openedBefore, openedAfter) || !sameStat(openedAfter, after) || buffer.length !== openedAfter.size) {
                        throw makeStoreError('package-file-unstable');
                    }
                    return await doImportBuffer(buffer);
                } catch (error) {
                    if (error && error.code && /^[a-z0-9-]{1,48}$/.test(error.code)) throw error;
                    throw makeStoreError('package-file-read-failed');
                } finally {
                    if (handle) await handle.close().catch(() => undefined);
                }
            });
        },

        // Test-safe entrypoint: callers provide package bytes, never a filesystem path.
        importPackageBuffer(buffer) {
            return enqueue(() => doImportBuffer(buffer));
        },

        // Returns {selectedCandidateId, pendingRestart:true}; the active startup snapshot is unchanged.
        selectCandidate(candidateIdOrNull) {
            return enqueue(async () => {
                if (!(candidateIdOrNull === null || (typeof candidateIdOrNull === 'string' && HASH_RE.test(candidateIdOrNull)))) {
                    throw makeStoreError('invalid-candidate-id');
                }
                if (candidateIdOrNull !== null && !await readObject(candidateIdOrNull)) throw makeStoreError('candidate-not-found');
                const current = await ensureStateForMutation();
                if (stateError && candidateIdOrNull !== null) throw makeStoreError('state-invalid');
                const next = {
                    selectedCandidateId: candidateIdOrNull,
                    activationHistory: current.activationHistory
                };
                await persistState(next, candidateIdOrNull === null);
                return {selectedCandidateId: candidateIdOrNull, pendingRestart: true};
            });
        },

        // Freezes once to a baseline shape or a validated candidate path/metadata shape.
        freezeStartupSelection() {
            return enqueue(async () => {
                if (startupSnapshot) return startupSnapshot;
                const state = await loadState();
                if (stateError || !state.selectedCandidateId) {
                    startupSnapshot = Object.freeze({kind: 'baseline', selectionState: stateError ? 'invalid' : 'valid'});
                    return startupSnapshot;
                }
                const candidateId = state.selectedCandidateId;
                try {
                    const object = await readObject(candidateId);
                    if (closed) throw makeStoreError('store-closed');
                    if (!object) throw makeStoreError('candidate-not-found');
                    startupSnapshot = Object.freeze({
                        kind: 'candidate',
                        candidateId,
                        libmpvPath: path.join(objectsRoot, candidateId, 'mpv-1.dll'),
                        expectedLibmpvVersion: object.validated.metadata.libmpv.version,
                        metadata: deepFreeze(object.validated.metadata),
                        checks: deepFreeze(object.validated.checks)
                    });
                } catch (error) {
                    if (closed || error && error.code === 'store-closed') throw makeStoreError('store-closed');
                    startupSnapshot = Object.freeze({
                        kind: 'baseline', selectionState: 'invalid',
                        invalidCandidateId: candidateId,
                        reasonCode: 'candidate-integrity-failed'
                    });
                }
                return startupSnapshot;
            });
        },

        // Rechecks candidate bytes immediately before Native Helper startup; never returns a filesystem path.
        verifyCandidateForStartup(candidateId, expectedVersion) {
            return enqueue(async () => {
                if (!HASH_RE.test(candidateId || '') || typeof expectedVersion !== 'string') throw makeStoreError('candidate-integrity-failed');
                const object = await readObject(candidateId);
                if (!object || object.validated.metadata.libmpv.version !== expectedVersion) throw makeStoreError('candidate-integrity-failed');
                return {candidateId, version: object.validated.metadata.libmpv.version};
            });
        },

        // Persists one bounded enum event; candidate-fallback clears only the matching pending selection.
        recordActivationResult(candidateId, outcome, reasonCode) {
            return enqueue(async () => {
                if (!(candidateId === null || (typeof candidateId === 'string' && HASH_RE.test(candidateId))) ||
                    !OUTCOMES.has(outcome)) throw makeStoreError('activation-result-invalid');
                const safeReason = REASON_CODES.has(reasonCode) ? reasonCode : 'unknown';
                const current = await ensureStateForMutation();
                let selectedCandidateId = current.selectedCandidateId;
                if (outcome === 'candidate-fallback' && candidateId && selectedCandidateId === candidateId) {
                    selectedCandidateId = null;
                }
                const history = current.activationHistory.concat([{candidateId, outcome, reasonCode: safeReason}])
                    .slice(-MAX_ACTIVATION_HISTORY);
                await persistState({selectedCandidateId, activationHistory: history});
                return {selectedCandidateId, lastActivation: history[history.length - 1]};
            });
        },

        close() {
            closed = true;
            if (activeValidationController) activeValidationController.abort();
            return queue;
        }
    };
}

module.exports = {createStore};
