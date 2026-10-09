'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const toolchains = require('../tools/build-toolchains.cjs');

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex').toLowerCase();
}

function write(root, relative, value) {
    const file = path.join(root, ...relative.split('/'));
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, value);
    return file;
}

function json(root, relative, value) {
    return write(root, relative, JSON.stringify(value, null, 2) + '\n');
}

function git(root, args) {
    const result = spawnSync('git', ['-C', root, ...args], {encoding: 'utf8', windowsHide: true});
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
}

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-build-toolchains-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const nativeRoot = path.join(root, '.work', 'toolchain', 'msys2', 'ucrt64');
    const compiler = write(nativeRoot, 'bin/g++.exe', 'fixture compiler');
    write(nativeRoot, 'include/windows.h', 'fixture header');
    write(nativeRoot, 'lib/libuser32.a', 'fixture import library');
    const innoArchive = write(root, '.work/toolchain/innosetup-fixture.exe', 'fixture Inno archive');
    const unpackerArchive = write(root, '.work/toolchain/innounp.zip', 'fixture unpacker archive');
    const unpackerRoot = path.join(root, '.work', 'toolchain', 'innounp');
    const unpacker = write(unpackerRoot, 'innounp.exe', 'fixture unpacker');
    write(unpackerRoot, 'innounp.htm', 'fixture unpacker notice');
    const innoRoot = path.join(root, '.work', 'toolchain', 'inno', '{app}');
    const iscc = write(innoRoot, 'ISCC.exe', 'fixture ISCC');
    write(innoRoot, 'ISCmplr.dll', 'fixture compiler library');

    const nativeManifest = {
        compiler: {
            family: 'fixture GCC',
            architecture: 'x64',
            version: 'fixture g++ 1.0',
            sha256: sha256(fs.readFileSync(compiler))
        }
    };
    const toolchainManifest = {
        inno: {version: '6.fixture', sha256: sha256(fs.readFileSync(innoArchive))},
        unpacker: {sha256: sha256(fs.readFileSync(unpackerArchive))}
    };
    json(root, 'vendor/native-helper-manifest.json', nativeManifest);
    json(root, 'vendor/toolchain-manifest.json', toolchainManifest);
    git(root, ['init', '-q']);
    git(root, ['config', 'user.name', 'Fixture']);
    git(root, ['config', 'user.email', 'fixture@example.invalid']);
    git(root, ['add', 'vendor/native-helper-manifest.json', 'vendor/toolchain-manifest.json']);
    git(root, ['commit', '-q', '-m', 'fixture authority']);

    function authority(relative) {
        const committed = Buffer.from(git(root, ['show', 'HEAD:' + relative]) + '\n', 'utf8');
        return {
            path: relative,
            gitBlobObjectId: git(root, ['rev-parse', 'HEAD:' + relative]),
            canonicalTextSha256: sha256(Buffer.from(committed.toString('utf8').replace(/\r\n/g, '\n'), 'utf8'))
        };
    }
    const nativeTree = toolchains.treeIdentity(nativeRoot);
    const unpackerTree = toolchains.treeIdentity(unpackerRoot);
    const innoTree = toolchains.treeIdentity(innoRoot);
    const lock = {
        schemaVersion: 1,
        treeIdentityAlgorithm: toolchains.TREE_IDENTITY_ALGORITHM,
        authority: {
            toolchainManifest: authority('vendor/toolchain-manifest.json'),
            nativeHelperManifest: authority('vendor/native-helper-manifest.json')
        },
        native: {
            family: nativeManifest.compiler.family,
            architecture: nativeManifest.compiler.architecture,
            compilerRoot: '.work/toolchain/msys2/ucrt64',
            compilerRelativePath: 'bin/g++.exe',
            compilerVersion: nativeManifest.compiler.version,
            compilerSha256: nativeManifest.compiler.sha256,
            tree: {fileCount: nativeTree.fileCount, bytes: nativeTree.bytes, sha256: nativeTree.sha256},
            environmentOverrides: ['CPLUS_INCLUDE_PATH']
        },
        inno: {
            version: toolchainManifest.inno.version,
            archive: {relativePath: '.work/toolchain/innosetup-fixture.exe', size: fs.statSync(innoArchive).size,
                sha256: toolchainManifest.inno.sha256},
            unpackerArchive: {relativePath: '.work/toolchain/innounp.zip', size: fs.statSync(unpackerArchive).size,
                sha256: toolchainManifest.unpacker.sha256},
            unpackerRoot: '.work/toolchain/innounp',
            unpackerRelativePath: 'innounp.exe',
            unpackerSha256: sha256(fs.readFileSync(unpacker)),
            unpackerTree: {fileCount: unpackerTree.fileCount, bytes: unpackerTree.bytes, sha256: unpackerTree.sha256},
            compilerRoot: '.work/toolchain/inno/{app}',
            compilerRelativePath: 'ISCC.exe',
            compilerSha256: sha256(fs.readFileSync(iscc)),
            compilerTree: {fileCount: innoTree.fileCount, bytes: innoTree.bytes, sha256: innoTree.sha256},
            environmentOverrides: ['INNO_SETUP_HOME']
        }
    };
    json(root, toolchains.LOCK_PATH, lock);
    git(root, ['add', toolchains.LOCK_PATH]);
    git(root, ['commit', '-q', '-m', 'fixture lock']);
    return {root, nativeRoot, compiler, innoRoot, iscc, lock};
}

function inspectNative(f) {
    return toolchains.inspectNative(f.root, f.compiler, {
        environment: {},
        readCompilerVersion: () => f.lock.native.compilerVersion
    });
}

test('native and Inno inspections return deterministic records without private paths', t => {
    const f = fixture(t);
    const native = inspectNative(f);
    const inno = toolchains.inspectInno(f.root, f.iscc, {environment: {}});
    assert.deepEqual(native, toolchains.expectedRecord(f.root, 'native'));
    assert.deepEqual(inno, toolchains.expectedRecord(f.root, 'inno'));
    assert.equal(JSON.stringify({native, inno}).includes(f.root), false);
    assert.equal(native.tree.fileCount, 3);
    assert.equal(inno.compiler.tree.fileCount, 2);
});

test('native full-tree lock rejects changed, missing, and extra files', t => {
    for (const mutate of [
        f => fs.appendFileSync(path.join(f.nativeRoot, 'lib/libuser32.a'), 'changed'),
        f => fs.rmSync(path.join(f.nativeRoot, 'include/windows.h')),
        f => write(f.nativeRoot, 'bin/unexpected.exe', 'extra')
    ]) {
        const f = fixture(t);
        mutate(f);
        assert.throws(() => inspectNative(f), /Native toolchain tree identity mismatch/);
    }
});

test('Inno archive, unpacker, and compiler tree identities fail closed', t => {
    for (const mutate of [
        f => fs.appendFileSync(path.join(f.root, '.work/toolchain/innosetup-fixture.exe'), 'changed'),
        f => write(path.join(f.root, '.work/toolchain/innounp'), 'unexpected.dll', 'extra'),
        f => fs.rmSync(path.join(f.innoRoot, 'ISCmplr.dll'))
    ]) {
        const f = fixture(t);
        mutate(f);
        assert.throws(() => toolchains.inspectInno(f.root, f.iscc, {environment: {}}), /identity mismatch/);
    }
});

test('external compiler paths and environment overrides are rejected', t => {
    const f = fixture(t);
    const external = write(f.root, 'external/g++.exe', fs.readFileSync(f.compiler));
    assert.throws(() => toolchains.inspectNative(f.root, external, {
        environment: {}, readCompilerVersion: () => f.lock.native.compilerVersion
    }), /project-local locked path/);
    assert.throws(() => toolchains.inspectNative(f.root, f.compiler, {
        environment: {CPLUS_INCLUDE_PATH: 'external'}, readCompilerVersion: () => f.lock.native.compilerVersion
    }), /environment override is set/);
    assert.throws(() => toolchains.inspectInno(f.root, f.iscc, {environment: {INNO_SETUP_HOME: 'external'}}),
        /environment override is set/);
});

test('dirty authority and a dirty lock fail before toolchain acceptance', t => {
    const dirty = fixture(t);
    fs.appendFileSync(path.join(dirty.root, 'vendor/native-helper-manifest.json'), ' ');
    assert.throws(() => inspectNative(dirty), /differs from HEAD/);

    const invalid = fixture(t);
    invalid.lock.native.compilerVersion = 'dirty but otherwise valid';
    json(invalid.root, toolchains.LOCK_PATH, invalid.lock);
    assert.throws(() => inspectNative(invalid), /Build toolchain lock differs from HEAD/);
});

test('record validation binds provenance to the committed lock without installed toolchain files', t => {
    const f = fixture(t);
    const record = toolchains.expectedRecord(f.root, 'native');
    fs.rmSync(path.join(f.root, '.work'), {recursive: true, force: true});
    assert.deepEqual(toolchains.validateRecorded(f.root, record, 'native'), record);
    record.tree.fileCount++;
    assert.throws(() => toolchains.validateRecorded(f.root, record, 'native'), /Recorded native toolchain identity mismatch/);
});
