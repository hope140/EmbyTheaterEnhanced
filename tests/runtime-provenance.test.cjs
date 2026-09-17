'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const trackedProductSources = require('../tools/copy-tracked-product-sources.cjs');
const preloadPreparation = require('../tools/prepare-preload.cjs');
const webPreparation = require('../tools/prepare-web-overlays.cjs');
const sourceProvenance = require('../tools/source-provenance.cjs');

const repoRoot = path.resolve(__dirname, '..');
const tool = path.join(repoRoot, 'tools', 'runtime-provenance.cjs');

function hash(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function writeFile(file, content) {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, content);
}

function copyRepoFile(root, relativePath) {
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.copyFileSync(path.join(repoRoot, relativePath), target);
}

function addManifestFile(files, root, relativePath, content) {
    writeFile(path.join(root, 'vendor', 'carnival', relativePath), content);
    files.push({path: relativePath.replaceAll('\\', '/'), sha256: hash(Buffer.from(content))});
}

function createFixture(root) {
    const files = [];
    const patchFiles = [];
    const vendorPreload = "const { ipcRenderer } = require('electron');\r\nwindow.ipc = ipcRenderer;\r\nconst fs = require('fs');\r\nwindow.fs = fs;\r\nconst os = require('os');\r\nwindow.dirName = os.tmpdir();\r\nwindow.appdata = process.env.APPDATA;\r\n";
    addManifestFile(files, root, 'electronapp/preload.js', vendorPreload);
    addManifestFile(files, root, 'x64/electron/electron.exe', 'electron-fixture\n');
    addManifestFile(files, root, 'x64/electron/version', '18.3.15\n');
    addManifestFile(files, root, 'electronapp/libmpv/x64/mpv-win32-x64.node', 'bridge-fixture\n');
    addManifestFile(files, root, 'electronapp/libmpv/x64/mpv-1.dll', 'base-libmpv-fixture\n');
    addManifestFile(files, root, 'electronapp/www/modules/common/playback/playbackmanager.js', 'const playback = true;\n');
    addManifestFile(files, root, 'electronapp/package.json', '{"name":"fixture"}\n');

    for (const contract of webPreparation.WEB_OVERLAY_CONTRACT) {
        copyRepoFile(root, contract.basePath);
        const vendorPath = contract.basePath.replace('vendor/carnival/', '');
        if (!files.some(entry => entry.path === vendorPath)) {
            files.push({path: vendorPath, sha256: hash(fs.readFileSync(path.join(root, contract.basePath)))});
        }
        if (contract.inputPath) {
            copyRepoFile(root, contract.inputPath);
            patchFiles.push({
                path: contract.inputPath.replace('vendor/patch/', ''),
                sha256: hash(fs.readFileSync(path.join(root, contract.inputPath)))
            });
        }
    }

    const patchLibmpv = Buffer.from('patched-libmpv-fixture\n');
    writeFile(path.join(root, 'vendor', 'patch', 'payload', 'libmpv', 'mpv-1.dll'), patchLibmpv);
    patchFiles.push({path: 'payload/libmpv/mpv-1.dll', sha256: hash(patchLibmpv)});
    writeFile(path.join(root, 'vendor', 'runtime-manifest.json'), JSON.stringify({
        baseline: 'provenance-test-fixture',
        archives: [{pattern: 'base.exe', sha256: '0'.repeat(64)}],
        runtimeExclusions: ['electronapp/libmpv/x64/mpv-win32-x64.node'],
        files,
        patchFiles
    }));
    writeFile(path.join(root, 'package-lock.json'), JSON.stringify({lockfileVersion: 3, packages: {}}));

    for (const relativePath of [
        'tools/prepare-preload.cjs',
        'tools/prepare-web-overlays.cjs',
        'tools/patch-external-player-registration.cjs',
        'tools/copy-runtime-dependencies.cjs',
        'tools/copy-tracked-product-sources.cjs',
        'tools/tracked-file-hash.cjs',
        'tools/runtime-exclusions.cjs'
    ]) copyRepoFile(root, relativePath);
    writeFile(path.join(root, 'tools', 'patch-playbackmanager.cjs'), 'generator: playbackmanager\n');
    writeFile(path.join(root, 'tools', 'build.ps1'), 'generator: package-metadata\n');

    writeFile(path.join(root, 'src', 'electronapp', 'some-normal-file.js'), 'module.exports = "normal";\n');
    writeFile(path.join(root, 'src', 'electronapp', 'preload.js'), preloadPreparation.buildPreparedPreload(vendorPreload));
    const init = childProcess.spawnSync('git', ['init', root], {encoding: 'utf8'});
    assert.equal(init.status, 0, init.stderr);
    childProcess.spawnSync('git', ['-C', root, 'config', 'user.name', 'ETE Test'], {encoding: 'utf8'});
    childProcess.spawnSync('git', ['-C', root, 'config', 'user.email', 'ete-test@example.invalid'], {encoding: 'utf8'});
    const add = childProcess.spawnSync('git', ['-C', root, 'add', 'src/electronapp/some-normal-file.js', 'tools'], {encoding: 'utf8'});
    assert.equal(add.status, 0, add.stderr);
    const commit = childProcess.spawnSync('git', ['-C', root, 'commit', '-m', 'fixture'], {encoding: 'utf8'});
    assert.equal(commit.status, 0, commit.stderr);
}

function createRuntime(root, name) {
    const runtime = path.join(root, name);
    const sourceCommit = childProcess.spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).stdout.trim();
    trackedProductSources.materializeTrackedProductSources(root, sourceCommit, runtime);
    writeFile(path.join(runtime, 'electronapp', 'preload.js'), fs.readFileSync(path.join(root, 'src', 'electronapp', 'preload.js')));
    writeFile(path.join(runtime, 'electronapp', 'www', 'modules', 'common', 'playback', 'playbackmanager.js'), 'const playback = true;\n');
    writeFile(path.join(runtime, 'electronapp', 'package.json'), '{"name":"runtime"}\n');
    for (const relativePath of ['x64/electron/electron.exe', 'x64/electron/version']) {
        writeFile(path.join(runtime, relativePath), fs.readFileSync(path.join(root, 'vendor', 'carnival', relativePath)));
    }
    writeFile(path.join(runtime, 'electronapp/libmpv/x64/mpv-1.dll'),
        fs.readFileSync(path.join(root, 'vendor/patch/payload/libmpv/mpv-1.dll')));
    webPreparation.apply(root, runtime);
    sourceProvenance.writeManifest(root, runtime, sourceCommit);
    return runtime;
}

function runProvenance(command, root, runtime) {
    const result = runProvenanceRaw(command, root, runtime);
    assert.equal(result.error, undefined, result.error && result.error.message);
    assert.notEqual(result.stdout, '', result.stderr);
    return {exitCode: result.status, report: JSON.parse(result.stdout)};
}

function runProvenanceRaw(command, root, runtime) {
    const sourceCommit = childProcess.spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).stdout.trim();
    return childProcess.spawnSync(process.execPath, [tool, command, root, runtime, sourceCommit], {encoding: 'utf8'});
}

test('runtime provenance binds tracked product sources to committed Git blobs', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-provenance-'));
    try {
        createFixture(root);
        writeFile(path.join(root, 'src', 'electronapp', 'www', '__ignored-sentinel.js'), 'ignored\n');
        writeFile(path.join(root, 'src', 'electronapp', 'some-normal-file.js'), 'module.exports = "dirty";\r\n');
        const runtime = createRuntime(root, 'runtime');
        assert.equal(runProvenance('write', root, runtime).exitCode, 0);
        const manifest = JSON.parse(fs.readFileSync(path.join(runtime, 'runtime-provenance.json'), 'utf8'));
        assert.equal(manifest.validatedProductScope.includesIgnoredSourceFiles, false);
        assert.equal(manifest.validatedProductScope.sourceSelection, 'git-commit-blobs');
        assert.equal(manifest.validatedProductScope.sourceCommit,
            childProcess.spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).stdout.trim());
        assert.equal(manifest.validatedProductScope.sourceAcquisition.generatorPath,
            'tools/copy-tracked-product-sources.cjs');
        assert.deepEqual(manifest.validatedProductScope.files.map(entry => entry.sourcePath), [
            'src/electronapp/some-normal-file.js'
        ]);
        const sourceEntry = manifest.validatedProductScope.files[0];
        assert.equal(sourceEntry.relation, 'git-blob-copy');
        assert.match(sourceEntry.gitBlobObjectId, /^[0-9a-f]{40}$/);
        assert.equal(sourceEntry.sourceSha256, sourceEntry.runtimeSha256);
        assert.equal(fs.readFileSync(path.join(runtime, 'electronapp', 'some-normal-file.js'), 'utf8'),
            'module.exports = "normal";\n');
        assert.equal(fs.readFileSync(path.join(root, 'src', 'electronapp', 'some-normal-file.js'), 'utf8'),
            'module.exports = "dirty";\r\n');
        assert.equal(runProvenance('validate', root, runtime).exitCode, 0);

        fs.rmSync(path.join(runtime, 'electronapp', 'some-normal-file.js'));
        const missing = runProvenance('validate', root, runtime);
        assert.equal(missing.exitCode, 1);
        assert.equal(missing.report.errors.includes('runtime-file-missing:electronapp/some-normal-file.js'), true);
    } finally {
        fs.rmSync(root, {recursive: true, force: true});
    }
});

test('runtime provenance rejects prepared and source-provenance tampering', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-provenance-tamper-'));
    try {
        createFixture(root);
        const prewriteRuntime = createRuntime(root, 'runtime-prewrite-tamper');
        fs.appendFileSync(path.join(prewriteRuntime, 'electronapp', 'preload.js'), '\n// tampered\n', 'utf8');
        const prewriteTamper = runProvenanceRaw('write', root, prewriteRuntime);
        assert.equal(prewriteTamper.status, 1);
        assert.match(prewriteTamper.stderr, /Prepared artifact runtime mismatch/);
        assert.equal(fs.existsSync(path.join(prewriteRuntime, 'runtime-provenance.json')), false);

        const runtime = createRuntime(root, 'runtime-source-provenance');
        assert.equal(runProvenance('write', root, runtime).exitCode, 0);
        fs.appendFileSync(path.join(runtime, 'source-provenance.json'), '\n', 'utf8');
        const tampered = runProvenance('validate', root, runtime);
        assert.equal(tampered.exitCode, 1);
        assert.equal(tampered.report.errors.includes('source-provenance-mismatch'), true);
    } finally {
        fs.rmSync(root, {recursive: true, force: true});
    }
});
