'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {readBundledVersions, createBundledVersionReader} = require('../src/electronapp/enhanced/bundled-versions');

const sourceCommit = 'a'.repeat(40);
const helperPath = 'electronapp/native-helper/ete-mpv-helper.exe';
const libmpvPath = 'electronapp/libmpv/x64/mpv-1.dll';

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function createFixture() {
    const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-bundled-versions-'));
    const helper = Buffer.from('test helper executable bytes');
    const libmpv = Buffer.from('test libmpv library bytes');
    for (const [relative, contents] of [[helperPath, helper], [libmpvPath, libmpv]]) {
        const file = path.join(runtimeRoot, relative);
        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.writeFileSync(file, contents);
    }
    const record = {
        schemaVersion: 1,
        protocolVersion: 1,
        sourceCommit,
        helper: {version: '0.2.5', runtimePath: helperPath, sha256: sha256(helper), testing: false},
        libmpv: {version: 'v0.41.0', runtimePath: libmpvPath, sha256: sha256(libmpv)}
    };
    const provenancePath = path.join(runtimeRoot, 'native-helper-provenance.json');
    const manifestPath = path.join(runtimeRoot, 'build-manifest.json');
    const fixture = {runtimeRoot, provenancePath, manifestPath, record, helper, libmpv};
    rewriteRecord(fixture);
    return fixture;
}

function rewriteRecord(fixture, updateManifest) {
    const bytes = Buffer.from(JSON.stringify(fixture.record));
    fs.writeFileSync(fixture.provenancePath, bytes);
    if (updateManifest === false) return;
    fs.writeFileSync(fixture.manifestPath, JSON.stringify({
        schemaVersion: 3,
        sourceCommit,
        files: [{path: 'native-helper-provenance.json', sha256: sha256(bytes)}]
    }));
}

test('bundled versions require matching provenance and hashes for fixed runtime files', async t => {
    const fixture = createFixture();
    t.after(() => fs.rmSync(fixture.runtimeRoot, {recursive: true, force: true}));

    assert.deepEqual(await readBundledVersions(fixture.runtimeRoot, sourceCommit), {
        helperVersion: '0.2.5',
        libmpvVersion: 'v0.41.0'
    });
    assert.equal(await readBundledVersions(fixture.runtimeRoot, 'bad-commit'), null, 'invalid source commit is unknown');
    assert.equal(await readBundledVersions(fixture.runtimeRoot, 'b'.repeat(40)), null, 'provenance from another commit is unknown');

    fs.rmSync(fixture.provenancePath);
    assert.equal(await readBundledVersions(fixture.runtimeRoot, sourceCommit), null, 'missing provenance is unknown');
});

test('bundled versions require one source-bound provenance manifest hash', async t => {
    const fixture = createFixture();
    t.after(() => fs.rmSync(fixture.runtimeRoot, {recursive: true, force: true}));

    fixture.record.helper.version = '0.2.6';
    rewriteRecord(fixture, false);
    assert.equal(await readBundledVersions(fixture.runtimeRoot, sourceCommit), null,
        'a provenance version edit without a matching manifest hash is unknown');

    fixture.record.helper.version = '0.2.5';
    rewriteRecord(fixture);
    fs.rmSync(fixture.manifestPath);
    assert.equal(await readBundledVersions(fixture.runtimeRoot, sourceCommit), null, 'missing build manifest is unknown');

    rewriteRecord(fixture);
    const manifest = JSON.parse(fs.readFileSync(fixture.manifestPath, 'utf8'));
    manifest.files.push(Object.assign({}, manifest.files[0]));
    fs.writeFileSync(fixture.manifestPath, JSON.stringify(manifest));
    assert.equal(await readBundledVersions(fixture.runtimeRoot, sourceCommit), null, 'duplicate provenance manifest entries are unknown');

    rewriteRecord(fixture);
    const wrongCommitManifest = JSON.parse(fs.readFileSync(fixture.manifestPath, 'utf8'));
    wrongCommitManifest.sourceCommit = 'b'.repeat(40);
    fs.writeFileSync(fixture.manifestPath, JSON.stringify(wrongCommitManifest));
    assert.equal(await readBundledVersions(fixture.runtimeRoot, sourceCommit), null, 'manifest from another source commit is unknown');
});

test('bundled versions return unknown for invalid provenance or runtime artifacts', async t => {
    const cases = [
        ['unsupported schema', record => { record.schemaVersion = 2; }],
        ['testing helper build', record => { record.helper.testing = true; }],
        ['helper path outside the fixed runtime location', record => { record.helper.runtimePath = '../outside.exe'; }],
        ['libmpv path outside the fixed runtime location', record => { record.libmpv.runtimePath = 'other/mpv-1.dll'; }],
        ['malformed helper hash', record => { record.helper.sha256 = 'not-a-sha256'; }],
        ['tampered helper bytes', (_record, fixture) => fs.appendFileSync(path.join(fixture.runtimeRoot, helperPath), 'tampered')],
        ['tampered libmpv bytes', (_record, fixture) => fs.appendFileSync(path.join(fixture.runtimeRoot, libmpvPath), 'tampered')],
        ['invalid helper version', record => { record.helper.version = 'unknown'; }],
        ['invalid libmpv version', record => { record.libmpv.version = 'mpv'; }],
        ['missing libmpv artifact', (_record, fixture) => fs.rmSync(path.join(fixture.runtimeRoot, libmpvPath))]
    ];

    for (const [name, mutate] of cases) {
        const fixture = createFixture();
        try {
            mutate(fixture.record, fixture);
            rewriteRecord(fixture);
            assert.equal(await readBundledVersions(fixture.runtimeRoot, sourceCommit), null, name);
        } finally {
            fs.rmSync(fixture.runtimeRoot, {recursive: true, force: true});
        }
    }
});

test('first and repeated binary validation yields to timers with bounded reads and hashing', async t => {
    const fixture = createFixture();
    t.after(() => fs.rmSync(fixture.runtimeRoot, {recursive: true, force: true}));
    const binary = path.join(fixture.runtimeRoot, libmpvPath);
    const block = Buffer.alloc(64 * 1024, 7);
    const hash = crypto.createHash('sha256');
    const fd = fs.openSync(binary, 'w');
    try {
        for (let i = 0; i < 128; i++) { fs.writeSync(fd, block); hash.update(block); }
    } finally { fs.closeSync(fd); }
    fixture.record.libmpv.sha256 = hash.digest('hex');
    rewriteRecord(fixture);

    const open = fs.promises.open;
    let binaryReads = 0;
    let closed = 0;
    t.mock.method(fs.promises, 'open', async function (file, flags) {
        const handle = await open(file, flags);
        const read = handle.read.bind(handle);
        handle.read = async function (buffer, offset, length, position) {
            assert.ok(buffer.length <= 64 * 1024 && length <= 64 * 1024);
            if (file === binary) binaryReads++;
            return read(buffer, offset, length, position);
        };
        const close = handle.close.bind(handle);
        handle.close = async function () { await close(); closed++; };
        return handle;
    });
    for (const method of ['statSync', 'lstatSync', 'readFileSync']) {
        t.mock.method(fs, method, () => { throw new Error('synchronous filesystem use'); });
    }
    const reader = createBundledVersionReader(fixture.runtimeRoot, sourceCommit);
    for (let run = 0; run < 2; run++) {
        let timerRan = false;
        const timer = new Promise(resolve => setTimeout(() => { timerRan = true; resolve(); }, 0));
        const versions = await reader();
        assert.ok(timerRan, 'timer must execute before binary validation finishes');
        assert.equal(versions.libmpvVersion, 'v0.41.0');
        await timer;
    }
    assert.equal(binaryReads, 256, 'both queries rehash the entire binary');
    assert.equal(closed, 8, 'all four file handles close on each query');
    t.mock.restoreAll();
});

test('overlapping queries share one verification, clear on completion and recover from UNKNOWN', async t => {
    const fixture = createFixture();
    t.after(() => fs.rmSync(fixture.runtimeRoot, {recursive: true, force: true}));
    const open = fs.promises.open;
    let opened = 0;
    t.mock.method(fs.promises, 'open', async (...args) => { opened++; return open(...args); });
    const reader = createBundledVersionReader(fixture.runtimeRoot, sourceCommit);
    const first = reader();
    assert.equal(reader(), first);
    assert.equal(reader(), first);
    const versions = await first;
    assert.ok(Object.isFrozen(versions));
    assert.equal(opened, 4);
    const next = reader();
    assert.notEqual(next, first);
    assert.deepEqual(await next, versions);
    assert.equal(opened, 8);

    fs.writeFileSync(path.join(fixture.runtimeRoot, libmpvPath), Buffer.alloc(fixture.libmpv.length, 1));
    assert.equal(await reader(), null, 'same-size content replacement cannot use a cached result');
    fs.rmSync(fixture.manifestPath);
    const missing = reader();
    assert.equal(reader(), missing);
    assert.equal(await missing, null);
    fs.writeFileSync(path.join(fixture.runtimeRoot, libmpvPath), fixture.libmpv);
    rewriteRecord(fixture);
    assert.deepEqual(await reader(), versions, 'UNKNOWN is not permanently cached');
    assert.equal(await createBundledVersionReader(fixture.runtimeRoot, 'b'.repeat(40))(), null,
        'a different identity never joins this reader');
});

test('I/O failure closes the handle and the next query can recover', async t => {
    const fixture = createFixture();
    t.after(() => fs.rmSync(fixture.runtimeRoot, {recursive: true, force: true}));
    const open = fs.promises.open;
    let closed = 0;
    t.mock.method(fs.promises, 'open', async (...args) => {
        const handle = await open(...args);
        handle.read = async () => { throw new Error('read failure'); };
        const close = handle.close.bind(handle);
        handle.close = async () => { await close(); closed++; };
        return handle;
    });
    const reader = createBundledVersionReader(fixture.runtimeRoot, sourceCommit);
    assert.equal(await reader(), null);
    assert.equal(closed, 1);
    t.mock.restoreAll();
    assert.equal((await reader()).helperVersion, '0.2.5');
});

test('changes to previously read metadata during binary verification invalidate the whole result', async t => {
    const fixture = createFixture();
    t.after(() => fs.rmSync(fixture.runtimeRoot, {recursive: true, force: true}));
    const open = fs.promises.open;
    let changed = false;
    t.mock.method(fs.promises, 'open', async (file, flags) => {
        const handle = await open(file, flags);
        if (file === path.join(fixture.runtimeRoot, libmpvPath)) {
            const read = handle.read.bind(handle);
            handle.read = async (...args) => {
                const result = await read(...args);
                if (!changed) {
                    changed = true;
                    await fs.promises.appendFile(fixture.provenancePath, '\n');
                }
                return result;
            };
        }
        return handle;
    });
    assert.equal(await readBundledVersions(fixture.runtimeRoot, sourceCommit), null);
    assert.ok(changed);
    t.mock.restoreAll();
    rewriteRecord(fixture);
    assert.equal((await readBundledVersions(fixture.runtimeRoot, sourceCommit)).helperVersion, '0.2.5');
});

test('replacement after lstat and truncated reads return UNKNOWN', async t => {
    const fixture = createFixture();
    t.after(() => fs.rmSync(fixture.runtimeRoot, {recursive: true, force: true}));
    const open = fs.promises.open;
    t.mock.method(fs.promises, 'open', async (file, flags) => {
        if (file === fixture.provenancePath) await fs.promises.appendFile(file, '\n');
        return open(file, flags);
    });
    assert.equal(await readBundledVersions(fixture.runtimeRoot, sourceCommit), null);
    t.mock.restoreAll();
    rewriteRecord(fixture);
    t.mock.method(fs.promises, 'open', async (...args) => {
        const handle = await open(...args);
        handle.read = async () => ({bytesRead: 0});
        return handle;
    });
    assert.equal(await readBundledVersions(fixture.runtimeRoot, sourceCommit), null);
});

test('oversized metadata/binaries and non-regular fixed paths return UNKNOWN', async t => {
    const fixture = createFixture();
    t.after(() => fs.rmSync(fixture.runtimeRoot, {recursive: true, force: true}));
    for (const [file, limit] of [[fixture.provenancePath, 64 * 1024], [fixture.manifestPath, 2 * 1024 * 1024],
        [path.join(fixture.runtimeRoot, libmpvPath), 128 * 1024 * 1024]]) {
        fs.truncateSync(file, limit + 1);
        assert.equal(await readBundledVersions(fixture.runtimeRoot, sourceCommit), null);
        fs.writeFileSync(path.join(fixture.runtimeRoot, libmpvPath), fixture.libmpv);
        rewriteRecord(fixture);
    }
    const lstat = fs.promises.lstat;
    t.mock.method(fs.promises, 'lstat', async (...args) => {
        const stat = await lstat(...args);
        stat.isSymbolicLink = () => true;
        return stat;
    });
    assert.equal(await readBundledVersions(fixture.runtimeRoot, sourceCommit), null);
    t.mock.restoreAll();
    fs.rmSync(path.join(fixture.runtimeRoot, helperPath));
    fs.mkdirSync(path.join(fixture.runtimeRoot, helperPath));
    assert.equal(await readBundledVersions(fixture.runtimeRoot, sourceCommit), null);
});
