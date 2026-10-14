'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const path = require('node:path');
const {createStore} = require('../src/electronapp/enhanced/mpv-kernel-store');

const helper = {sha256: 'a'.repeat(64), version: '1.0.0'};
const capabilities = ['private-inherited-pipe', 'native-child-hwnd', 'gpu-next', 'd3d11', 'generation-attribution'];
const exportNames = [
    'mpv_create', 'mpv_initialize', 'mpv_set_option_string', 'mpv_observe_property',
    'mpv_unobserve_property', 'mpv_wait_event', 'mpv_terminate_destroy', 'mpv_command',
    'mpv_command_async', 'mpv_get_property', 'mpv_set_property_string', 'mpv_get_property_string',
    'mpv_free', 'mpv_free_node_contents', 'mpv_client_api_version', 'mpv_error_string', 'mpv_event_name'
];

function hash(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }

function makeDll(marker) {
    const b = Buffer.alloc(0x700);
    b.writeUInt16LE(0x5a4d, 0); b.writeUInt32LE(0x80, 0x3c); b.writeUInt32LE(0x4550, 0x80);
    const p = 0x84;
    b.writeUInt16LE(0x8664, p); b.writeUInt16LE(1, p + 2); b.writeUInt16LE(0xf0, p + 16); b.writeUInt16LE(0x2022, p + 18);
    const o = p + 20;
    b.writeUInt16LE(0x20b, o); b.writeUInt32LE(0x2000, o + 56); b.writeUInt32LE(0x200, o + 60);
    b.writeUInt32LE(16, o + 108); b.writeUInt32LE(0x1000, o + 112); b.writeUInt32LE(0x80, o + 116);
    const s = o + 0xf0;
    b.writeUInt32LE(0x500, s + 8); b.writeUInt32LE(0x1000, s + 12); b.writeUInt32LE(0x500, s + 16); b.writeUInt32LE(0x200, s + 20);
    const e = 0x200;
    b.writeUInt32LE(1, e + 16); b.writeUInt32LE(18, e + 20); b.writeUInt32LE(17, e + 24);
    b.writeUInt32LE(0x1040, e + 28); b.writeUInt32LE(0x1088, e + 32); b.writeUInt32LE(0x10cc, e + 36);
    b[0x6ff] = marker;
    for (let i = 0; i < exportNames.length; i++) {
        b.writeUInt32LE(0x10e0 + i * 4, 0x240 + i * 4);
        b.writeUInt32LE(0x1100 + i * 32, 0x288 + i * 4);
        b.writeUInt16LE(i, 0x2cc + i * 2);
        b.write(exportNames[i] + '\0', 0x300 + i * 32, 'ascii');
    }
    return b;
}

function crc32(buffer) {
    let value = 0xffffffff;
    for (const byte of buffer) {
        value ^= byte;
        for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    }
    return (value ^ 0xffffffff) >>> 0;
}

function zip(members) {
    const local = [], central = [];
    let offset = 0;
    for (const name of ['candidate.json', 'mpv-1.dll', 'SOURCE.txt', 'NOTICE.txt']) {
        const nameBytes = Buffer.from(name, 'ascii'), data = members[name], crc = crc32(data);
        const l = Buffer.alloc(30 + nameBytes.length);
        l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(0x0800, 6); l.writeUInt16LE(0, 8);
        l.writeUInt32LE(crc, 14); l.writeUInt32LE(data.length, 18); l.writeUInt32LE(data.length, 22);
        l.writeUInt16LE(nameBytes.length, 26); nameBytes.copy(l, 30); local.push(l, data);
        const c = Buffer.alloc(46 + nameBytes.length);
        c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(0x0314, 4); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(0, 10);
        c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24);
        c.writeUInt16LE(nameBytes.length, 28); c.writeUInt32LE(0x81a40000, 38); c.writeUInt32LE(offset, 42);
        nameBytes.copy(c, 46); central.push(c); offset += l.length + data.length;
    }
    const body = Buffer.concat(local), directory = Buffer.concat(central), end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(4, 8); end.writeUInt16LE(4, 10);
    end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(body.length, 16);
    return Buffer.concat([body, directory, end]);
}

function fixture(marker = 1, change = {}) {
    const dll = makeDll(marker), source = Buffer.from('Synthetic source fixture\n'), notice = Buffer.from('Synthetic notice fixture\n');
    const metadata = {
        schemaVersion: 1,
        libmpv: {file: 'mpv-1.dll', version: 'mpv v0.42.0-example', sizeBytes: dll.length, sha256: hash(dll), machine: 'x64', clientApiVersion: 131077},
        helperContract: {fileSha256: helper.sha256, version: helper.version, protocolVersion: 1, clientApiVersion: 131077, requiredCapabilities: capabilities},
        source: {project: 'Synthetic', release: 'test-1', revision: 'deadbeef', reference: 'https://example.org/source'},
        license: {spdxExpression: 'GPL-3.0-or-later', redistribution: 'declared-permitted'},
        sourceSha256: hash(source), noticeSha256: hash(notice)
    };
    if (change.sourceRevision) metadata.source.revision = change.sourceRevision;
    const members = {'candidate.json': Buffer.from(JSON.stringify(metadata)), 'mpv-1.dll': dll, 'SOURCE.txt': source, 'NOTICE.txt': notice};
    if (change.corruptDll) members['mpv-1.dll'][0x6ff] ^= 1;
    return zip(members);
}

async function freshStore(t, options = {}) {
    const profileRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'ete-mpv-store-'));
    t.after(() => fsp.rm(profileRoot, {recursive: true, force: true}));
    return {profileRoot, store: createStore({profileRoot, expectedHelperIdentity: helper, ...options})};
}

function expectedCode(promise, code) {
    return assert.rejects(promise, error => error && error.code === code && !/([A-Za-z]:\\|candidate\.json|NOTICE\.txt|SOURCE\.txt)/.test(error.message));
}

test('fresh profile reports missing baseline; import is explicit, validated, and never auto-selects', async t => {
    const {store} = await freshStore(t);
    assert.deepEqual(await store.getStatus(), {status: 'ok', selectedCandidateId: null, selectionState: 'missing', candidates: [], lastActivation: null});
    const selectedPath = path.join(os.tmpdir(), `ete-kernel-selected-${process.pid}-${crypto.randomBytes(6).toString('hex')}.zip`);
    await fsp.writeFile(selectedPath, fixture());
    t.after(() => fsp.rm(selectedPath, {force: true}));
    const result = await store.importPackageFile(selectedPath);
    assert.equal(result.imported, true); assert.equal(result.selected, false); assert.equal(result.pendingRestart, false);
    assert.equal(result.candidate.packageIntegrity, 'VERIFIED');
    const status = await store.getStatus();
    assert.equal(status.selectedCandidateId, null); assert.equal(status.selectionState, 'missing'); assert.equal(status.candidates.length, 1);
    assert.equal(JSON.stringify(status).includes('mpv-1.dll'), false);
    assert.equal(JSON.stringify(result).includes(selectedPath), false);
    await store.close();
});

test('cancel-equivalent no import call writes nothing; selected file path must be regular and bounded', async t => {
    const {profileRoot, store} = await freshStore(t);
    assert.equal((await store.getStatus()).candidates.length, 0);
    await expectedCode(store.importPackageFile('relative.zip'), 'package-file-invalid');
    await expectedCode(store.importPackageFile(path.join(profileRoot, 'absent.zip')), 'package-file-unavailable');
    const oversized = path.join(profileRoot, 'oversized.zip');
    const handle = await fsp.open(oversized, 'w'); await handle.truncate(192 * 1024 * 1024 + 1); await handle.close();
    await expectedCode(store.importPackageFile(oversized), 'package-size-invalid');
    await store.close();
});

test('symbolic-link import path is rejected without disclosing its path', async t => {
    const {profileRoot, store} = await freshStore(t);
    const target = path.join(profileRoot, 'real.zip'); await fsp.writeFile(target, fixture());
    const link = path.join(profileRoot, 'linked.zip');
    try { await fsp.symlink(target, link, 'file'); }
    catch (error) {
        if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip('file symlinks unavailable on this host'); await store.close(); return; }
        throw error;
    }
    await expectedCode(store.importPackageFile(link), 'package-file-invalid');
    await store.close();
});

test('hash mismatch is rejected and errors expose no selected source path', async t => {
    const {store} = await freshStore(t);
    await expectedCode(store.importPackageBuffer(fixture(1, {corruptDll: true})), 'hash-mismatch');
    assert.equal((await store.getStatus()).candidates.length, 0);
    await store.close();
});

test('reimport is idempotent, while same DLL identity with changed package declarations conflicts', async t => {
    const {store} = await freshStore(t);
    const original = fixture();
    const imported = await store.importPackageBuffer(original);
    const repeated = await store.importPackageBuffer(original);
    assert.equal(repeated.candidate.candidateId, imported.candidate.candidateId);
    await expectedCode(store.importPackageBuffer(fixture(1, {sourceRevision: 'changed'})), 'candidate-id-conflict');
    assert.equal((await store.getStatus()).candidates.length, 1);
    await store.close();
});

test('concurrent imports serialize and produce one immutable content-addressed object', async t => {
    const {store} = await freshStore(t);
    const bytes = fixture();
    const results = await Promise.all([store.importPackageBuffer(bytes), store.importPackageBuffer(bytes)]);
    assert.equal(results.length, 2); assert.equal((await store.getStatus()).candidates.length, 1);
    await store.close();
});

test('selection freezes one startup snapshot; later baseline selection and import only affect pending state', async t => {
    const {store} = await freshStore(t);
    const first = await store.importPackageBuffer(fixture(1));
    await store.selectCandidate(first.candidate.candidateId);
    const frozen = await store.freezeStartupSelection();
    assert.equal(frozen.kind, 'candidate'); assert.equal(frozen.candidateId, first.candidate.candidateId);
    assert.match(frozen.libmpvPath, new RegExp(first.candidate.candidateId));
    assert.deepEqual(await store.verifyCandidateForStartup(frozen.candidateId, frozen.expectedLibmpvVersion), {
        candidateId: frozen.candidateId, version: frozen.expectedLibmpvVersion
    });
    assert.equal(JSON.stringify(await store.verifyCandidateForStartup(frozen.candidateId, frozen.expectedLibmpvVersion)).includes('libmpvPath'), false);
    await store.selectCandidate(null);
    await store.importPackageBuffer(fixture(2));
    const later = await store.freezeStartupSelection();
    assert.deepEqual(later, frozen);
    const status = await store.getStatus();
    assert.equal(status.selectedCandidateId, null); assert.equal(status.candidates.length, 2);
    await store.close();
});

test('baseline selection repairs malformed state only after explicit user selection', async t => {
    const {profileRoot, store} = await freshStore(t);
    const root = path.join(profileRoot, 'mpv-kernels'); await fsp.mkdir(root);
    await fsp.writeFile(path.join(root, 'state.json'), JSON.stringify({schemaVersion: 99, selectedCandidateId: null, activationHistory: []}));
    const corrupt = await store.getStatus();
    assert.equal(corrupt.selectionState, 'invalid'); assert.equal(corrupt.selectedCandidateId, null);
    assert.deepEqual(await store.freezeStartupSelection(), {kind: 'baseline', selectionState: 'invalid'});
    await store.selectCandidate(null);
    const repaired = await store.getStatus();
    assert.equal(repaired.selectionState, 'valid'); assert.equal(repaired.selectedCandidateId, null);
    assert.equal(JSON.parse(await fsp.readFile(path.join(root, 'state.json'), 'utf8')).schemaVersion, 1);
    await store.close();
});

test('bad JSON state freezes baseline and is repaired only by explicit baseline selection', async t => {
    const {profileRoot, store} = await freshStore(t);
    const imported = await store.importPackageBuffer(fixture());
    const statePath = path.join(profileRoot, 'mpv-kernels', 'state.json');
    await fsp.mkdir(path.dirname(statePath), {recursive: true});
    await fsp.writeFile(statePath, '{not valid json');
    const status = await store.getStatus();
    assert.equal(status.selectionState, 'invalid');
    assert.equal(status.selectedCandidateId, null);
    await expectedCode(store.selectCandidate(imported.candidate.candidateId), 'state-invalid');
    await store.selectCandidate(null);
    const repaired = JSON.parse(await fsp.readFile(statePath, 'utf8'));
    assert.equal(repaired.schemaVersion, 1);
    assert.equal(repaired.selectedCandidateId, null);
    assert.equal((await store.getStatus()).selectionState, 'valid');
    await store.close();
});

test('explicit baseline selection atomically repairs oversized ordinary state without reading its old bytes', async t => {
    const {profileRoot} = await freshStore(t);
    const statePath = path.join(profileRoot, 'mpv-kernels', 'state.json');
    await fsp.mkdir(path.dirname(statePath), {recursive: true});
    await fsp.writeFile(statePath, Buffer.alloc(16 * 1024 + 1, 0x78));
    let attemptedRead = false;
    const injectedFs = new Proxy(fsp, {
        get(target, property) {
            if (property === 'open') return async (file, ...args) => {
                if (path.resolve(String(file)) === path.resolve(statePath)) {
                    attemptedRead = true;
                    throw new Error('oversized-state-must-not-be-opened');
                }
                return target.open(file, ...args);
            };
            const value = target[property];
            return typeof value === 'function' ? value.bind(target) : value;
        }
    });
    const store = createStore({profileRoot, expectedHelperIdentity: helper, fs: injectedFs});
    const status = await store.getStatus();
    assert.equal(status.selectionState, 'invalid');
    await store.selectCandidate(null);
    assert.equal(attemptedRead, false);
    const repaired = JSON.parse(await fsp.readFile(statePath, 'utf8'));
    assert.equal(repaired.schemaVersion, 1);
    assert.equal(repaired.selectedCandidateId, null);
    await store.close();
});

test('state directories and symbolic links are reported invalid and never replaced', async t => {
    const dirFixture = await freshStore(t);
    const directoryState = path.join(dirFixture.profileRoot, 'mpv-kernels', 'state.json');
    await fsp.mkdir(path.dirname(directoryState));
    await fsp.mkdir(directoryState);
    const directoryStatus = await dirFixture.store.getStatus();
    assert.equal(directoryStatus.selectionState, 'invalid');
    await expectedCode(dirFixture.store.selectCandidate(null), 'state-file-invalid');
    assert.equal((await fsp.stat(directoryState)).isDirectory(), true);
    await dirFixture.store.close();

    const linkFixture = await freshStore(t);
    const statePath = path.join(linkFixture.profileRoot, 'mpv-kernels', 'state.json');
    await fsp.mkdir(path.dirname(statePath));
    const outside = path.join(linkFixture.profileRoot, 'external-state-canary');
    await fsp.writeFile(outside, 'external-canary');
    try { await fsp.symlink(outside, statePath, 'file'); }
    catch (error) {
        if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { await linkFixture.store.close(); t.skip('file symlinks unavailable on this host'); return; }
        throw error;
    }
    const linkedStatus = await linkFixture.store.getStatus();
    assert.equal(linkedStatus.selectionState, 'invalid');
    await expectedCode(linkFixture.store.selectCandidate(null), 'state-file-invalid');
    assert.equal(await fsp.readFile(outside, 'utf8'), 'external-canary');
    await linkFixture.store.close();
});

test('baseline repair write failure preserves the corrupt prior state bytes', async t => {
    const {profileRoot} = await freshStore(t);
    const statePath = path.join(profileRoot, 'mpv-kernels', 'state.json');
    await fsp.mkdir(path.dirname(statePath), {recursive: true});
    const corrupt = Buffer.from('{bad-state-json');
    await fsp.writeFile(statePath, corrupt);
    const injectedFs = new Proxy(fsp, {
        get(target, property) {
            if (property === 'rename') return async (source, destination) => {
                if (path.resolve(String(destination)) === path.resolve(statePath)) {
                    throw Object.assign(new Error('synthetic-state-rename-failure'), {code: 'EIO'});
                }
                return target.rename(source, destination);
            };
            const value = target[property];
            return typeof value === 'function' ? value.bind(target) : value;
        }
    });
    const store = createStore({profileRoot, expectedHelperIdentity: helper, fs: injectedFs});
    assert.equal((await store.getStatus()).selectionState, 'invalid');
    await expectedCode(store.selectCandidate(null), 'state-write-failed');
    assert.deepEqual(await fsp.readFile(statePath), corrupt);
    const rootEntries = await fsp.readdir(path.dirname(statePath));
    assert.deepEqual(rootEntries.sort(), ['objects', 'state.json']);
    await store.close();
});

test('failed staging write cleans only its own stage and leaves no candidate or state', async t => {
    const {profileRoot} = await freshStore(t);
    let failed = false;
    const injectedFs = new Proxy(fsp, {
        get(target, property) {
            if (property === 'open') return async (...args) => {
                const handle = await target.open(...args);
                if (!failed && String(args[0]).includes(`${path.sep}.stage-`)) {
                    failed = true;
                    return new Proxy(handle, {
                        get(targetHandle, member) {
                            if (member === 'writeFile') return async () => { const error = new Error('io'); error.code = 'EIO'; throw error; };
                            const value = targetHandle[member]; return typeof value === 'function' ? value.bind(targetHandle) : value;
                        }
                    });
                }
                return handle;
            };
            const value = target[property]; return typeof value === 'function' ? value.bind(target) : value;
        }
    });
    const store = createStore({profileRoot, expectedHelperIdentity: helper, fs: injectedFs});
    await expectedCode(store.importPackageBuffer(fixture()), 'candidate-write-failed');
    assert.equal((await store.getStatus()).candidates.length, 0);
    assert.deepEqual((await fsp.readdir(path.join(profileRoot, 'mpv-kernels', 'objects'))), []);
    await store.close();
});

test('tampered stored bytes are no longer selectable and freeze falls back to baseline', async t => {
    const {profileRoot, store} = await freshStore(t);
    const imported = await store.importPackageBuffer(fixture());
    await store.selectCandidate(imported.candidate.candidateId);
    const dllPath = path.join(profileRoot, 'mpv-kernels', 'objects', imported.candidate.candidateId, 'mpv-1.dll');
    await fsp.chmod(dllPath, 0o666);
    const bytes = await fsp.readFile(dllPath); bytes[0x6ff] ^= 1; await fsp.writeFile(dllPath, bytes);
    const status = await store.getStatus();
    assert.equal(status.selectionState, 'invalid'); assert.equal(status.selectedCandidateId, null); assert.equal(status.candidates.length, 0);
    const frozen = await store.freezeStartupSelection();
    assert.equal(frozen.kind, 'baseline'); assert.equal(frozen.invalidCandidateId, imported.candidate.candidateId);
    await store.close();
});

test('candidate fallback clears only a matching pending selection and history remains bounded', async t => {
    const {profileRoot, store} = await freshStore(t);
    const candidate = await store.importPackageBuffer(fixture());
    const id = candidate.candidate.candidateId;
    await store.selectCandidate(id);
    await store.recordActivationResult(id, 'candidate-fallback', 'candidate-handshake-failed');
    assert.equal((await store.getStatus()).selectedCandidateId, null);
    for (let i = 0; i < 20; i++) await store.recordActivationResult(null, 'baseline-start-failed', 'base-start-failed');
    const state = JSON.parse(await fsp.readFile(path.join(profileRoot, 'mpv-kernels', 'state.json'), 'utf8'));
    assert.equal(state.activationHistory.length, 16);
    assert.equal(state.activationHistory[15].outcome, 'baseline-start-failed');
    await store.close();
});

test('close aborts an in-flight worker validation, prevents writes, and rejects late operations', async t => {
    const {profileRoot, store} = await freshStore(t);
    const pending = store.importPackageBuffer(fixture());
    await new Promise(resolve => setImmediate(resolve));
    await store.close();
    await assert.rejects(pending, error => error && ['validation-cancelled', 'store-closed'].includes(error.code));
    await expectedCode(store.getStatus(), 'store-closed');
    const objectRoot = path.join(profileRoot, 'mpv-kernels', 'objects');
    const contents = await fsp.readdir(objectRoot).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error));
    assert.equal(contents.length, 0);
});

test('close during a deferred stored-member read stops before spawning a worker and preserves state/objects', async t => {
    for (const operation of ['status', 'freeze', 'select']) {
        const {profileRoot, store: seed} = await freshStore(t);
        const imported = await seed.importPackageBuffer(fixture());
        const candidateId = imported.candidate.candidateId;
        await seed.selectCandidate(candidateId);
        await seed.close();
        const statePath = path.join(profileRoot, 'mpv-kernels', 'state.json');
        const dllPath = path.join(profileRoot, 'mpv-kernels', 'objects', candidateId, 'mpv-1.dll');
        const stateBefore = await fsp.readFile(statePath);
        const dllBefore = await fsp.readFile(dllPath);
        const memberPath = path.join(profileRoot, 'mpv-kernels', 'objects', candidateId, 'candidate.json');
        let unblockOpen;
        let signalOpen;
        const openStarted = new Promise(resolve => { signalOpen = resolve; });
        const openGate = new Promise(resolve => { unblockOpen = resolve; });
        let deferred = false;
        let validationCalls = 0;
        const injectedFs = new Proxy(fsp, {
            get(target, property) {
                if (property === 'open') return async (file, ...args) => {
                    if (!deferred && path.resolve(String(file)) === path.resolve(memberPath)) {
                        deferred = true;
                        signalOpen();
                        await openGate;
                    }
                    return target.open(file, ...args);
                };
                const value = target[property];
                return typeof value === 'function' ? value.bind(target) : value;
            }
        });
        const store = createStore({profileRoot, expectedHelperIdentity: helper, fs: injectedFs,
            validateMembers: async () => { validationCalls++; throw new Error('validation-must-not-start'); }});
        const pending = operation === 'status' ? store.getStatus() :
            operation === 'freeze' ? store.freezeStartupSelection() : store.selectCandidate(candidateId);
        await openStarted;
        const closePromise = store.close();
        let closeResolved = false;
        closePromise.then(() => { closeResolved = true; });
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(closeResolved, false, operation + ' close joins the already-open store read');
        unblockOpen();
        await expectedCode(pending, 'store-closed');
        await closePromise;
        assert.equal(validationCalls, 0, operation + ' does not spawn a worker after close during read');
        assert.deepEqual(await fsp.readFile(statePath), stateBefore);
        assert.deepEqual(await fsp.readFile(dllPath), dllBefore);
    }
});
