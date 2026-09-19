'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const electronInput = require('../tools/electron-runtime-input.cjs');

const repoRoot = path.resolve(__dirname, '..');

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex').toLowerCase();
}

function write(file, value) {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, value);
}

function fixtureManifest(archive, runtimeDirectory) {
    const identity = electronInput.treeIdentity(runtimeDirectory);
    return {
        schemaVersion: 1,
        channel: 'Stable',
        version: '44.4.2',
        platform: 'win32',
        arch: 'x64',
        archive: {name: 'fixture.zip', sha256: sha256(archive), size: archive.length},
        runtime: {
            electronPath: 'electron.exe',
            electronExeSha256: sha256(fs.readFileSync(path.join(runtimeDirectory, 'electron.exe'))),
            versionPath: 'version',
            fileCount: identity.fileCount,
            treeSha256: identity.sha256
        }
    };
}

test('tracked Electron runtime manifest pins the official Stable Windows x64 asset', () => {
    const manifest = electronInput.readManifest(repoRoot);
    assert.equal(manifest.version, '44.4.2');
    assert.equal(manifest.channel, 'Stable');
    assert.equal(manifest.archive.name, 'electron-v44.4.2-win32-x64.zip');
    assert.equal(manifest.archive.sourceUrl,
        'https://github.com/electron/electron/releases/download/v44.4.2/electron-v44.4.2-win32-x64.zip');
    assert.match(manifest.archive.sha256, /^[0-9a-f]{64}$/);
    assert.match(manifest.runtime.electronExeSha256, /^[0-9a-f]{64}$/);
    assert.equal(manifest.runtime.processVersions.electron, '44.4.2');
    assert.equal(manifest.runtime.processVersions.node, '24.21.0');
    assert.match(manifest.runtime.processVersions.chrome, /^152\./);
});

test('archive and extracted runtime validation fail closed on missing or changed bytes', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-electron-input-'));
    try {
        const archiveRoot = path.join(root, 'archives');
        const runtime = path.join(root, 'runtime');
        fs.mkdirSync(archiveRoot, {recursive: true});
        write(path.join(runtime, 'electron.exe'), Buffer.from('fixture-electron'));
        write(path.join(runtime, 'version'), Buffer.from('44.4.2\n'));
        write(path.join(runtime, 'locales', 'en-US.pak'), Buffer.from('fixture-locale'));
        const archive = Buffer.from('fixture-archive');
        const manifest = fixtureManifest(archive, runtime);

        assert.throws(() => electronInput.validateArchive(root, archiveRoot, manifest), /archive missing/);
        write(path.join(archiveRoot, manifest.archive.name), Buffer.from('wrong'));
        assert.throws(() => electronInput.validateArchive(root, archiveRoot, manifest), /size mismatch|SHA256 mismatch/);
        write(path.join(archiveRoot, manifest.archive.name), archive);
        assert.equal(electronInput.validateArchive(root, archiveRoot, manifest).status, 'passed');
        assert.equal(electronInput.validateDirectory(root, runtime, manifest).status, 'passed');

        fs.appendFileSync(path.join(runtime, 'electron.exe'), 'tampered');
        assert.throws(() => electronInput.validateDirectory(root, runtime, manifest), /tree identity mismatch/);
    } finally {
        fs.rmSync(root, {recursive: true, force: true});
    }
});

test('prepare and build are wired to the pinned Electron input contract', () => {
    const prepare = fs.readFileSync(path.join(repoRoot, 'tools', 'prepare.ps1'), 'utf8');
    const prepareElectron = fs.readFileSync(path.join(repoRoot, 'tools', 'prepare-electron-runtime.ps1'), 'utf8');
    assert.match(prepare, /prepare-electron-runtime\.ps1/);
    assert.match(prepareElectron, /validate-archive/);
    assert.match(prepareElectron, /validate-directory/);
    assert.match(prepareElectron, /validate-prepared/);
    assert.doesNotMatch(prepareElectron, /releases\/latest|electron@latest|npm\s+install\s+electron/i);
});
