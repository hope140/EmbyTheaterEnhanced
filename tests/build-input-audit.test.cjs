'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {run} = require('../tools/audit-build-inputs.cjs');
const runtimeExclusions = require('../tools/runtime-exclusions.cjs');

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function write(root, relative, value) {
    const file = path.join(root, ...relative.split('/'));
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, value);
    return file;
}
function json(root, relative, value) { return write(root, relative, JSON.stringify(value, null, 2) + '\n'); }
function temp(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'private-path-canary-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    return root;
}
function setup(t) {
    const base = temp(t);
    const repo = path.join(base, 'authority');
    const inputs = path.join(base, 'inputs');
    const runtime = path.join(base, 'runtime');
    const archives = path.join(base, 'archives');
    for (const dir of [repo, inputs, runtime, archives]) fs.mkdirSync(dir, {recursive: true});

    const carnivalBytes = Buffer.from('carnival');
    const patchBytes = Buffer.from('patch');
    const headerBytes = Buffer.from('header');
    const electronFiles = {'electron.exe': Buffer.from('fake executable'), 'version': Buffer.from('44.4.2\n')};
    const electronTree = Object.entries(electronFiles).map(([p, b]) => ({path: p, sha256: sha(b)})).sort((a, b) => a.path.localeCompare(b.path));
    const electronTreeSha = sha(Buffer.from(electronTree.map(e => e.path + '\0' + e.sha256.toUpperCase() + '\n').join('')));
    const lock = {name: 'audit-fixture', lockfileVersion: 3, packages: {
        '': {version: '1.0.0'},
        'node_modules/prod': {version: '1.2.3', integrity: 'sha512-prod', dev: false},
        'node_modules/dev-only': {version: '9.9.9', dev: true}
    }};
    const runtimeManifest = {
        schemaVersion: 1,
        archives: [{pattern: 'carnival.exe', sha256: sha('archive-carnival')}, {pattern: 'patch.zip', sha256: sha('archive-patch')}],
        files: [{path: 'baseline.bin', sha256: sha(carnivalBytes)}],
        patchFiles: [{path: 'patch.bin', sha256: sha(patchBytes)}],
        runtimeExclusions: ['retired/old.node']
    };
    const electronManifest = {version: '44.4.2', archive: {name: 'electron.zip', sha256: sha('electron archive'), size: Buffer.byteLength('electron archive')},
        runtime: {preparedPath: 'vendor/electron/44.4.2/win32-x64', runtimePath: 'x64/electron', electronPath: 'electron.exe',
            versionPath: 'version', electronExeSha256: sha(electronFiles['electron.exe']), fileCount: electronTree.length, treeSha256: electronTreeSha}};
    const nativeManifest = {clientHeader: {path: 'vendor/native-helper-inputs/mpv/client.h', sha256: sha(headerBytes)}};
    json(repo, 'vendor/runtime-manifest.json', runtimeManifest);
    json(repo, 'vendor/electron-runtime-manifest.json', electronManifest);
    json(repo, 'vendor/native-helper-manifest.json', nativeManifest);
    json(repo, 'package-lock.json', lock);

    write(inputs, 'vendor/carnival/baseline.bin', carnivalBytes);
    write(inputs, 'vendor/patch/patch.bin', patchBytes);
    write(inputs, nativeManifest.clientHeader.path, headerBytes);
    for (const [relative, bytes] of Object.entries(electronFiles)) write(inputs, electronManifest.runtime.preparedPath + '/' + relative, bytes);
    json(inputs, 'node_modules/prod/package.json', {name: 'prod', version: '1.2.3'});

    const provenanceSource = Buffer.from('source provenance');
    const provenanceRuntime = Buffer.from('runtime provenance');
    write(runtime, 'source-provenance.json', provenanceSource);
    write(runtime, 'runtime-provenance.json', provenanceRuntime);
    write(runtime, 'app.exe', 'runtime binary');
    write(runtime, 'LICENSE', 'license text');
    json(runtime, 'electronapp/node_modules/prod/package.json', {name: 'prod', version: '1.2.3'});
    json(runtime, 'electronapp/node_modules/legacy/package.json', {name: 'legacy', version: '0.8.0'});
    const files = [];
    for (const relative of ['LICENSE', 'app.exe', 'electronapp/node_modules/legacy/package.json', 'electronapp/node_modules/prod/package.json', 'runtime-provenance.json', 'source-provenance.json']) {
        const bytes = fs.readFileSync(path.join(runtime, ...relative.split('/')));
        files.push({path: relative, sha256: sha(bytes).toUpperCase()});
    }
    const payloadSetSha256 = sha(Buffer.from(files.map(item => item.path + '\0' + item.sha256 + '\n').join(''))).toUpperCase();
    json(runtime, 'build-manifest.json', {schemaVersion: 2, sourceCommit: 'a'.repeat(40), version: '1.0.0',
        sourceManifestSha256: sha(fs.readFileSync(path.join(repo, 'vendor/runtime-manifest.json'))),
        packageLockSha256: sha(fs.readFileSync(path.join(repo, 'package-lock.json'))),
        provenance: {source: {path: 'source-provenance.json', sha256: sha(provenanceSource)}, runtime: {path: 'runtime-provenance.json', sha256: sha(provenanceRuntime)}},
        payload: {fileCount: files.length, payloadSetSha256}, files});
    write(archives, 'carnival.exe', 'archive-carnival');
    write(archives, 'patch.zip', 'archive-patch');
    write(archives, 'electron.zip', 'electron archive');
    return {base, repo, inputs, runtime, archives, runtimeManifest, electronManifest, nativeManifest, lock};
}
function args(fixture, output = path.join(fixture.base, 'report.json')) {
    return ['--repo-root', fixture.repo, '--inputs-root', fixture.inputs, '--archive-root', fixture.archives,
        '--runtime', fixture.runtime, '--output', output];
}

test('missing vendor category is recorded while other categories continue', t => {
    const fixture = setup(t);
    fs.rmSync(path.join(fixture.inputs, 'vendor/carnival'), {recursive: true, force: true});
    const report = run(args(fixture));
    assert.equal(report.fileSets.carnival.status, 'MISSING');
    assert.equal(report.fileSets.patch.status, 'PASS');
    assert.equal(report.electronPrepared.status, 'PASS');
    assert.equal(report.nativeHeader.status, 'PASS');
    assert.equal(report.assessment, 'INCOMPLETE');
});

test('vendor hashes and unexpected files are counted without exposing extra names', t => {
    const fixture = setup(t);
    write(fixture.inputs, 'vendor/patch/patch.bin', 'changed');
    write(fixture.inputs, 'vendor/patch/private-extra-canary.dll', 'extra');
    const report = run(args(fixture));
    assert.equal(report.fileSets.patch.status, 'MISMATCH');
    assert.equal(report.fileSets.patch.mismatchCount, 1);
    assert.equal(report.fileSets.patch.extraCount, 1);
    assert.equal(JSON.stringify(report).includes('private-extra-canary'), false);
});

test('Electron archive size must be a positive safe integer', t => {
    for (const size of [0, -1, undefined]) {
        const fixture = setup(t);
        if (size === undefined) delete fixture.electronManifest.archive.size;
        else fixture.electronManifest.archive.size = size;
        json(fixture.repo, 'vendor/electron-runtime-manifest.json', fixture.electronManifest);
        assert.throws(() => run(args(fixture)), {message: 'Audit failed; inputs or arguments are invalid.'});
    }
});

test('Electron archive size mismatch is recorded without suppressing inventory output', t => {
    const fixture = setup(t);
    fixture.electronManifest.archive.size++;
    json(fixture.repo, 'vendor/electron-runtime-manifest.json', fixture.electronManifest);
    const output = path.join(fixture.base, 'report.json');
    const report = run(args(fixture, output));
    assert.equal(report.archives.electron.status, 'MISMATCH');
    assert.equal(report.archives.electron.expectedSize, fixture.electronManifest.archive.size);
    assert.equal(report.archives.electron.observedSize, Buffer.byteLength('electron archive'));
    assert.equal(report.archives.carnival.every(item => item.expectedSize === null), true);
    assert.equal(report.status, 'OBSERVED');
    assert.equal(report.assessment, 'MISMATCH');
    assert.equal(fs.existsSync(output), true);
});

test('runtime payload tampering fails exact payload checks', t => {
    const fixture = setup(t);
    write(fixture.runtime, 'app.exe', 'tampered');
    const report = run(args(fixture));
    assert.equal(report.runtime.status, 'MISMATCH');
    assert.equal(report.runtime.mismatchCount, 1);
    assert.equal(report.runtime.payloadSetSha256.status, 'PASS');
    assert.equal(report.runtime.runtimePackages.length, 2);
    assert.equal(report.runtime.runtimePackages.find(item => item.path === 'electronapp/node_modules/prod').selection, 'lockfile-production');
    assert.equal(report.runtime.runtimePackages.find(item => item.path === 'electronapp/node_modules/legacy').selection, 'archive-baseline-or-unclassified');
    assert.equal(report.packageComparison.packages[0].status, 'PASS');
});

test('package directory comparison reports extras without stopping the audit', t => {
    const fixture = setup(t);
    write(fixture.runtime, 'electronapp/node_modules/prod/extra-copy.js', 'extra');
    const report = run(args(fixture));
    assert.equal(report.packageComparison.status, 'MISMATCH');
    assert.equal(report.packageComparison.packages[0].extraCount, 1);
    assert.equal(report.status, 'OBSERVED');
    assert.equal(fs.existsSync(path.join(fixture.base, 'report.json')), true);
    assert.equal(JSON.stringify(report.runtime.binaries).includes('extra-copy'), false);
});

test('listed mixed-case binaries and notices remain in the exported inventory', t => {
    const fixture = setup(t);
    const manifestPath = path.join(fixture.runtime, 'build-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    fs.renameSync(path.join(fixture.runtime, 'app.exe'), path.join(fixture.runtime, 'Emby.Theater.exe'));
    manifest.files.find(item => item.path === 'app.exe').path = 'Emby.Theater.exe';
    for (const notice of ['x64/electron/LICENSES.chromium.html', 'electronapp/node_modules/prod/LICENSE-MIT.txt']) {
        write(fixture.runtime, notice, 'notice text');
        manifest.files.push({path: notice, sha256: sha('notice text')});
    }
    manifest.payload.fileCount = manifest.files.length;
    manifest.payload.payloadSetSha256 = sha(Buffer.from(manifest.files.map(item => item.path + '\0' + item.sha256 + '\n').join('')));
    json(fixture.runtime, 'build-manifest.json', manifest);
    const report = run(args(fixture));
    assert.equal(report.runtime.status, 'PASS');
    assert.equal(report.runtime.binaries.some(item => item.path === 'Emby.Theater.exe'), true);
    assert.equal(report.runtime.licenseNoticePaths.includes('LICENSE'), true);
    assert.equal(report.runtime.licenseNoticePaths.includes('x64/electron/LICENSES.chromium.html'), true);
    assert.equal(report.runtime.licenseNoticePaths.includes('electronapp/node_modules/prod/LICENSE-MIT.txt'), true);
    assert.equal(report.runtime.manifestSha256, sha(fs.readFileSync(manifestPath)));
});

test('a missing file in an existing package is not reported as a matching tree', t => {
    const fixture = setup(t);
    write(fixture.inputs, 'node_modules/prod/source-only.js', 'required package file');
    const report = run(args(fixture));
    assert.equal(report.packageComparison.missingPackageCount, 0);
    assert.equal(report.packageComparison.missingCount, 1);
    assert.equal(report.packageComparison.status, 'MISSING');
    assert.equal(report.packageComparison.packages[0].status, 'MISSING');
    assert.equal(report.assessment, 'INCOMPLETE');
});

test('missing package runtime is counted separately from missing package files', t => {
    const fixture = setup(t);
    fs.rmSync(path.join(fixture.runtime, 'electronapp/node_modules/prod'), {recursive: true, force: true});
    const report = run(args(fixture));
    assert.equal(report.packageComparison.missingPackageCount, 1);
    assert.equal(report.packageComparison.missingCount, 1);
    assert.equal(report.packageComparison.packages[0].status, 'MISSING');
    assert.equal(report.assessment, 'INCOMPLETE');
});

test('dangerous and duplicate manifest paths fail with a fixed safe error', t => {
    for (const badFiles of [
        [{path: '../escape', sha256: sha('x')}],
        [{path: 'drive:stream', sha256: sha('x')}],
        [{path: 'same.bin', sha256: sha('x')}, {path: 'same.bin', sha256: sha('y')}]
    ]) {
        const fixture = setup(t);
        const manifest = {...fixture.runtimeManifest, files: badFiles};
        json(fixture.repo, 'vendor/runtime-manifest.json', manifest);
        assert.throws(() => run(args(fixture)), {message: 'Audit failed; inputs or arguments are invalid.'});
    }
});

test('symlinked input ancestor is rejected before traversal', t => {
    const fixture = setup(t);
    const vendor = path.join(fixture.inputs, 'vendor');
    const vendorReal = path.join(fixture.inputs, 'vendor-real');
    fs.renameSync(vendor, vendorReal);
    try { fs.symlinkSync(vendorReal, vendor, 'junction'); }
    catch (error) { t.skip('This Windows environment does not permit creating a junction fixture.'); return; }
    assert.throws(() => run(args(fixture)), {message: 'Audit failed; inputs or arguments are invalid.'});
});

test('unsafe package and Electron version metadata is omitted from report', t => {
    const fixture = setup(t);
    const canary = 'C:\\private-path-canary\\secret';
    json(fixture.inputs, 'node_modules/prod/package.json', {name: 'prod', version: canary});
    write(fixture.inputs, fixture.electronManifest.runtime.preparedPath + '/version', canary + '\n');
    const output = path.join(fixture.base, 'report.json');
    const report = run(args(fixture, output));
    assert.equal(report.packageLock.packages[0].packageJsonVersion, null);
    assert.equal(report.packageLock.packages[0].status, 'MISMATCH');
    assert.equal(report.electronPrepared.version, null);
    assert.equal(fs.readFileSync(output, 'utf8').includes(canary), false);
});

test('runtime schema, self-entry and provenance paths are constrained', t => {
    for (const mutate of [
        manifest => { manifest.schemaVersion = 1; },
        manifest => { manifest.files.push({path: 'build-manifest.json', sha256: sha('self')}); },
        manifest => { manifest.provenance.source.path = '../source-provenance.json'; }
    ]) {
        const fixture = setup(t);
        const manifestPath = path.join(fixture.runtime, 'build-manifest.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        mutate(manifest);
        json(fixture.runtime, 'build-manifest.json', manifest);
        assert.throws(() => run(args(fixture)), {message: 'Audit failed; inputs or arguments are invalid.'});
    }
});

test('retired path directory is reported present and extra runtime names stay hidden', t => {
    const fixture = setup(t);
    fs.mkdirSync(path.join(fixture.runtime, ...runtimeExclusions.RETIRED_RUNTIME_PATHS[0].split('/')), {recursive: true});
    write(fixture.runtime, 'unknown-extra-canary.exe', 'unlisted');
    const report = run(args(fixture));
    assert.equal(report.runtime.retiredPaths[0].status, 'PRESENT');
    assert.equal(report.runtime.binaries.some(item => item.path.includes('unknown-extra-canary')), false);
    assert.equal(JSON.stringify(report).includes('unknown-extra-canary'), false);
    assert.equal(report.runtime.status, 'MISMATCH');
});

test('symlink traversal is rejected', t => {
    const fixture = setup(t);
    const external = path.join(fixture.base, 'outside');
    fs.mkdirSync(external);
    try { fs.symlinkSync(external, path.join(fixture.inputs, 'vendor/carnival/junction'), 'junction'); }
    catch (error) { t.skip('This Windows environment does not permit creating a junction fixture.'); return; }
    assert.throws(() => run(args(fixture)), {message: 'Audit failed; inputs or arguments are invalid.'});
});

test('output is exclusive and CLI diagnostics never disclose private absolute paths', t => {
    const fixture = setup(t);
    const output = path.join(fixture.base, 'private-path-canary-report.json');
    const first = spawnSync(process.execPath, [path.resolve(__dirname, '../tools/audit-build-inputs.cjs'), ...args(fixture, output)], {encoding: 'utf8'});
    assert.equal(first.status, 0);
    assert.equal(first.stdout, '');
    assert.equal(first.stderr, '');
    assert.equal(fs.existsSync(output), true);
    const second = spawnSync(process.execPath, [path.resolve(__dirname, '../tools/audit-build-inputs.cjs'), ...args(fixture, output)], {encoding: 'utf8'});
    assert.notEqual(second.status, 0);
    assert.equal(second.stderr.trim(), 'Audit failed; inputs or arguments are invalid.');
    assert.equal((first.stdout + first.stderr + second.stdout + second.stderr).includes(fixture.base), false);
    assert.equal(fs.readFileSync(output, 'utf8').includes(fixture.base), false);
});
