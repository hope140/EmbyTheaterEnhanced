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
const electronRuntimeInput = require('../tools/electron-runtime-input.cjs');
const webSnapshot = require('../tools/web-snapshot-input.cjs');
const windowsHost = require('../tools/windows-host-input.cjs');
const inheritedNpm = require('../tools/inherited-npm-input.cjs');
const templates=require('../tools/runtime-template-input.cjs');
const libmpvInput=require('../tools/libmpv-input.cjs');
const compatibilityInput=require('../tools/compatibility-resources-input.cjs');
const smallRuntimeInput=require('../tools/small-runtime-input.cjs');
const modelInput=require('../tools/model-compatibility-input.cjs');

const repoRoot = path.resolve(__dirname, '..');
const tool = path.join(repoRoot, 'tools', 'runtime-provenance.cjs');

function hash(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function writeFile(file, content) {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, content);
}

function createTempRoot(prefix, parent = os.tmpdir()) {
    return fs.realpathSync.native(fs.mkdtempSync(path.join(parent, prefix)));
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
    const componentFiles = [];
    const componentPatches = [];
    const vendorPreload = "const { ipcRenderer } = require('electron');\r\nwindow.ipc = ipcRenderer;\r\nconst fs = require('fs');\r\nwindow.fs = fs;\r\nconst os = require('os');\r\nwindow.dirName = os.tmpdir();\r\nwindow.appdata = process.env.APPDATA;\r\n";
    addManifestFile(files, root, 'electronapp/preload.js', vendorPreload);
    addManifestFile(files, root, 'x64/electron/electron.exe', 'electron-fixture\n');
    addManifestFile(files, root, 'x64/electron/version', '18.3.15\n');
    addManifestFile(files, root, 'electronapp/libmpv/x64/mpv-win32-x64.node', 'bridge-fixture\n');
    addManifestFile(files, root, 'electronapp/libmpv/x64/mpv-1.dll', 'base-libmpv-fixture\n');
    addManifestFile(files, root, 'MediaBrowser.Model.dll', 'historical Model fixture\n');
    const playbackFixture = Buffer.from('const playback = true;\n');
    writeFile(path.join(root,webSnapshot.WEB_ROOT,'modules/common/playback/playbackmanager.js'),playbackFixture);
    componentFiles.push({path:'www/modules/common/playback/playbackmanager.js',size:playbackFixture.length,sha256:hash(playbackFixture)});
    addManifestFile(files, root, 'electronapp/package.json', '{"name":"fixture"}\n');

    for (const contract of webPreparation.WEB_OVERLAY_CONTRACT) {
        copyRepoFile(root, contract.basePath);
        const vendorPath = contract.basePath.replace('vendor/web-snapshot/www/', 'electronapp/www/');
        const componentPath = contract.basePath.replace('vendor/web-snapshot/', '');
        const componentBytes = fs.readFileSync(path.join(root,contract.basePath));
        if (!componentFiles.some(entry=>entry.path===componentPath)) componentFiles.push({path:componentPath,size:componentBytes.length,sha256:hash(componentBytes)});
        if (!files.some(entry => entry.path === vendorPath)) {
            files.push({path: vendorPath, sha256: hash(fs.readFileSync(path.join(root, contract.basePath)))});
        }
        if (contract.inputPath) {
            copyRepoFile(root, contract.inputPath);
            const bytes=fs.readFileSync(path.join(root,contract.inputPath));
            componentPatches.push({path:contract.inputPath.replace('vendor/web-snapshot/',''),size:bytes.length,sha256:hash(bytes)});
        }
    }
    writeFile(path.join(root,webSnapshot.MANIFEST_PATH),JSON.stringify({schemaVersion:1,inputRoot:webSnapshot.INPUT_ROOT,
        fileCount:componentFiles.length,bytes:componentFiles.reduce((n,f)=>n+f.size,0),treeSha256:webSnapshot.treeHash(componentFiles),
        files:componentFiles,userPatches:componentPatches}));
    const hostBytes=Buffer.from('official-host-fixture\n');
    const hostFiles=[{path:'Emby.Theater.exe',size:hostBytes.length,sha256:hash(hostBytes)}];
    writeFile(path.join(root,windowsHost.INPUT_ROOT,'Emby.Theater.exe'),hostBytes);
    writeFile(path.join(root,windowsHost.MANIFEST_PATH),JSON.stringify({schemaVersion:1,version:'3.0.20',inputRoot:windowsHost.INPUT_ROOT,
        fileCount:1,bytes:hostBytes.length,treeSha256:webSnapshot.treeHash(hostFiles),files:hostFiles,
        archive:{size:1,sha256:'0'.repeat(64)}}));

    require('./helpers/inherited-npm-fixture.cjs').create(root,[{path:'electronapp/node_modules/is-linux/index.js',bytes:Buffer.from('synthetic npm fixture')}]);
    require('./helpers/runtime-template-fixture.cjs').create(root);
    const patchLibmpv = Buffer.from('patched-libmpv-fixture\n');
    writeFile(path.join(root, 'vendor', 'patch', 'payload', 'libmpv', 'mpv-1.dll'), patchLibmpv);
    patchFiles.push({path: 'payload/libmpv/mpv-1.dll', sha256: hash(patchLibmpv)});
    require('./helpers/libmpv-fixture.cjs').create(root,patchLibmpv);
    require('./helpers/compatibility-fixture.cjs').create(root);
    require('./helpers/model-compatibility-fixture.cjs').create(root);
    const small=require('./helpers/small-runtime-fixture.cjs').create(root);
    for(const entry of small.files)addManifestFile(files,root,entry.path,fs.readFileSync(path.join(root,smallRuntimeInput.INPUT_ROOT,entry.path)));
    writeFile(path.join(root, 'vendor', 'runtime-manifest.json'), JSON.stringify({
        baseline: 'provenance-test-fixture',
        archives: [{pattern: 'base.exe', sha256: '0'.repeat(64)}],
        runtimeExclusions: ['electronapp/libmpv/x64/mpv-win32-x64.node'],
        files,
        patchFiles
    }));
    const officialElectron = path.join(root, 'vendor', 'electron', '44.4.2', 'win32-x64');
    writeFile(path.join(officialElectron, 'electron.exe'), 'official-electron-44-fixture\n');
    writeFile(path.join(officialElectron, 'version'), '44.4.2\n');
    writeFile(path.join(officialElectron, 'locales', 'en-US.pak'), 'official-electron-locale-fixture\n');
    const officialIdentity = electronRuntimeInput.treeIdentity(officialElectron);
    writeFile(path.join(root, 'vendor', 'electron-runtime-manifest.json'), JSON.stringify({
        schemaVersion: 1,
        channel: 'Stable',
        version: '44.4.2',
        platform: 'win32',
        arch: 'x64',
        releaseUrl: 'https://github.com/electron/electron/releases/tag/v44.4.2',
        publishedAt: '2026-09-18T01:08:36Z',
        archive: {
            name: 'electron-v44.4.2-win32-x64.zip',
            sourceUrl: 'https://github.com/electron/electron/releases/download/v44.4.2/electron-v44.4.2-win32-x64.zip',
            shasumsUrl: 'https://github.com/electron/electron/releases/download/v44.4.2/SHASUMS256.txt',
            sha256: '1'.repeat(64),
            size: 123
        },
        runtime: {
            preparedPath: 'vendor/electron/44.4.2/win32-x64',
            runtimePath: 'x64/electron',
            electronPath: 'electron.exe',
            electronExeSha256: hash(fs.readFileSync(path.join(officialElectron, 'electron.exe'))),
            versionPath: 'version',
            fileCount: officialIdentity.fileCount,
            treeSha256: officialIdentity.sha256,
            processVersions: {
                electron: '44.4.2',
                chrome: '152.0.7977.130',
                node: '24.21.0',
                v8: '15.2.124.28-electron.0'
            }
        }
    }));
    writeFile(path.join(root, 'package-lock.json'), JSON.stringify({lockfileVersion: 3, packages: {}}));

    for (const relativePath of [
        'tools/prepare-preload.cjs',
        'tools/prepare-web-overlays.cjs',
        'tools/patch-videoosd-lifecycle.cjs', 'tools/patch-apiclient-lifecycle.cjs',
        'tools/patch-custom-css-js.cjs',
        'tools/patch-externalplayer-residue.cjs',
        'tools/patch-item-controls.cjs',
        'tools/patch-content-width.cjs',
        'tools/patch-actionsheet-layout.cjs',
        'tools/patch-item-lifecycle.cjs',
        'tools/patch-search-ui.cjs', 'tools/patch-select-cancel.cjs',
        'tools/patch-external-player-registration.cjs',
        'tools/patch-plugin-settings.cjs',
        'tools/patch-server-home.cjs',
        'tools/patch-movie-browser.cjs',
        'tools/patch-startup.cjs',
        'tools/copy-runtime-dependencies.cjs',
        'tools/copy-tracked-product-sources.cjs',
        'tools/electron-runtime-input.cjs',
        'tools/tracked-file-hash.cjs',
        'tools/runtime-exclusions.cjs',
        'tools/web-snapshot-input.cjs',
        'tools/windows-host-input.cjs','tools/prepare-windows-host.ps1','tools/inherited-npm-input.cjs','tools/runtime-template-input.cjs','tools/libmpv-input.cjs','tools/prepare-libmpv.cjs','tools/download-libmpv.ps1','tools/compatibility-resources-input.cjs','tools/small-runtime-input.cjs','tools/model-compatibility-input.cjs','tools/prepare-model-compatibility.ps1'
    ]) copyRepoFile(root, relativePath);
    copyRepoFile(root, 'src/electronapp/enhanced/startup.svg');
    writeFile(path.join(root, 'tools', 'patch-playbackmanager.cjs'), 'generator: playbackmanager\n');
    writeFile(path.join(root, 'tools', 'build.ps1'), 'generator: package-metadata\n');

    writeFile(path.join(root, 'src', 'electronapp', 'some-normal-file.js'), 'module.exports = "normal";\n');
    writeFile(path.join(root, 'src', 'electronapp', 'preload.js'), preloadPreparation.buildPreparedPreload(vendorPreload));
    const init = childProcess.spawnSync('git', ['init', root], {encoding: 'utf8'});
    assert.equal(init.status, 0, init.stderr);
    childProcess.spawnSync('git', ['-C', root, 'config', 'user.name', 'ETE Test'], {encoding: 'utf8'});
    childProcess.spawnSync('git', ['-C', root, 'config', 'user.email', 'ete-test@example.invalid'], {encoding: 'utf8'});
    const add = childProcess.spawnSync('git', ['-C', root, 'add', 'src/electronapp/some-normal-file.js', 'src/electronapp/enhanced/startup.svg', 'tools', 'package-lock.json', 'vendor/runtime-manifest.json', 'vendor/electron-runtime-manifest.json',webSnapshot.MANIFEST_PATH,windowsHost.MANIFEST_PATH,inheritedNpm.MANIFEST_PATH,templates.MANIFEST_PATH,libmpvInput.MANIFEST_PATH,compatibilityInput.MANIFEST_PATH,smallRuntimeInput.MANIFEST_PATH,modelInput.MANIFEST_PATH], {encoding: 'utf8'});
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
    writeFile(path.join(runtime,'Emby.Theater.exe'),fs.readFileSync(path.join(root,windowsHost.INPUT_ROOT,'Emby.Theater.exe')));
    fs.cpSync(path.join(root,inheritedNpm.INPUT_ROOT,'electronapp'),path.join(runtime,'electronapp'),{recursive:true});
    fs.cpSync(path.join(root, 'vendor', 'electron', '44.4.2', 'win32-x64'),
        path.join(runtime, 'x64', 'electron'), {recursive: true});
    writeFile(path.join(runtime, 'electronapp/libmpv/x64/mpv-1.dll'),
        fs.readFileSync(path.join(root,libmpvInput.INPUT_ROOT,'mpv-1.dll')));
    fs.cpSync(path.join(root,compatibilityInput.INPUT_ROOT),runtime,{recursive:true});
    fs.cpSync(path.join(root,smallRuntimeInput.INPUT_ROOT),runtime,{recursive:true});
    fs.cpSync(path.join(root,modelInput.INPUT_ROOT),runtime,{recursive:true});
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

test('runtime provenance fixtures normalize temporary parent aliases and retain input redirect rejection',t=>{
    const parent=createTempRoot('ete-provenance-parent-alias-');
    t.after(()=>fs.rmSync(parent,{recursive:true,force:true}));
    const physical=path.join(parent,'physical'),alias=path.join(parent,'alias');
    fs.mkdirSync(physical);
    fs.symlinkSync(physical,alias,process.platform==='win32'?'junction':'dir');
    const root=createTempRoot('fixture-',alias);
    assert.equal(path.dirname(root),physical);
    assert.equal(fs.realpathSync.native(root),root);
    createFixture(root);
    const runtime=createRuntime(root,'runtime-from-physical-root');
    assert.equal(runProvenance('write',root,runtime).exitCode,0);
    assert.equal(runProvenance('validate',root,runtime).exitCode,0);
    const component=path.join(root,libmpvInput.INPUT_ROOT),saved=component+'-physical';
    fs.renameSync(component,saved);
    fs.symlinkSync(saved,component,process.platform==='win32'?'junction':'dir');
    assert.throws(()=>libmpvInput.validate(root),/links or redirects are forbidden/);
});

test('historical Electron, Pepper and old libmpv bodies are not provenance prerequisites',()=>{
    const root=createTempRoot('ete-provenance-history-only-');
    try {
        createFixture(root);
        for(const relative of ['x64/electron/electron.exe','x64/electron/version','electronapp/libmpv/x64/mpv-win32-x64.node','electronapp/libmpv/x64/mpv-1.dll']) {
            fs.unlinkSync(path.join(root,'vendor/carnival',relative));
        }
        const runtime=createRuntime(root,'runtime-without-history-bodies');
        const source=JSON.parse(fs.readFileSync(path.join(runtime,'source-provenance.json')));
        assert.equal(source.historicalInputs.carnivalElectron.physicalInputRequired,false);
        assert.equal(source.historicalInputs.carnivalElectron.verification,'historical-manifest-only');
        assert.equal(source.runtimeIdentities.libmpv.historicalPredecessor.physicalInputRequired,false);
        assert.equal(source.runtimeExclusions.inputs[0].physicalInputRequired,false);
        assert.equal(runProvenance('write',root,runtime).exitCode,0);
        fs.appendFileSync(path.join(runtime,'electronapp/libmpv/x64/mpv-1.dll'),'changed current libmpv');
        assert.notEqual(runProvenance('validate',root,runtime).exitCode,0);
    } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('runtime provenance binds tracked product sources to committed Git blobs', () => {
    const root = createTempRoot('ete-provenance-');
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
            'src/electronapp/enhanced/startup.svg',
            'src/electronapp/some-normal-file.js'
        ]);
        const startupEntry = manifest.validatedProductScope.files[0];
        const startupBlob = childProcess.execFileSync('git', ['-C', root, 'show',
            manifest.validatedProductScope.sourceCommit + ':src/electronapp/enhanced/startup.svg']);
        assert.equal(startupEntry.sourceSha256,
            hash(startupBlob).toUpperCase());
        assert.equal(startupEntry.sourceSha256, startupEntry.runtimeSha256);
        assert.deepEqual(fs.readFileSync(path.join(runtime, 'electronapp/enhanced/startup.svg')),
            startupBlob);
        const sourceEntry = manifest.validatedProductScope.files[1];
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
    const root = createTempRoot('ete-provenance-tamper-');
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

        const electronRuntime = createRuntime(root, 'runtime-electron-tamper');
        assert.equal(runProvenance('write', root, electronRuntime).exitCode, 0);
        fs.appendFileSync(path.join(electronRuntime, 'x64', 'electron', 'electron.exe'), 'tampered');
        const electronTampered = runProvenance('validate', root, electronRuntime);
        assert.equal(electronTampered.exitCode, 1);
        assert.equal(electronTampered.report.errors.includes('electron-runtime-invalid'), true);
    } finally {
        fs.rmSync(root, {recursive: true, force: true});
    }
});
