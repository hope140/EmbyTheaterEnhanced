'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const webOverlays = require('./prepare-web-overlays.cjs');
const trackedFileHash = require('./tracked-file-hash.cjs');
const nativeHelperProvenance = require('./native-helper-provenance.cjs');
const runtimeExclusions = require('./runtime-exclusions.cjs');
const electronRuntimeInput = require('./electron-runtime-input.cjs');
const windowsHostInput = require('./windows-host-input.cjs');
const inheritedNpmInput = require('./inherited-npm-input.cjs');
const runtimeTemplates=require('./runtime-template-input.cjs');
const libmpvInput=require('./libmpv-input.cjs');
const compatibilityInput=require('./compatibility-resources-input.cjs');
const smallRuntimeInput=require('./small-runtime-input.cjs');

const MANIFEST_NAME = 'source-provenance.json';
const HISTORICAL_ELECTRON_PATH = 'x64/electron/electron.exe';
const HISTORICAL_ELECTRON_VERSION_PATH = 'x64/electron/version';
const LIBMPV_RUNTIME_PATH = 'electronapp/libmpv/x64/mpv-1.dll';
const LIBMPV_PATCH_PATH = 'payload/libmpv/mpv-1.dll';

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
}

function slash(value) {
    return value.split(path.sep).join('/');
}

function readFile(file, label) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(label + ' missing: ' + file);
    return fs.readFileSync(file);
}

function hashFile(file, label) {
    return sha256(readFile(file, label));
}

function walkFiles(root) {
    if (!fs.existsSync(root)) return [];
    const result = [];
    const pending = [root];
    while (pending.length) {
        const current = pending.pop();
        for (const entry of fs.readdirSync(current, {withFileTypes: true}).sort((a, b) => b.name.localeCompare(a.name))) {
            const child = path.join(current, entry.name);
            if (entry.isDirectory()) pending.push(child);
            else if (entry.isFile()) result.push(child);
        }
    }
    return result.sort((a, b) => a.localeCompare(b));
}

function treeIdentity(root, files) {
    const entries = files.map(file => ({
        path: slash(path.relative(root, file)),
        sha256: hashFile(file, 'Tree file')
    })).sort((a, b) => a.path.localeCompare(b.path));
    const digestInput = entries.map(entry => entry.path + '\0' + entry.sha256 + '\n').join('');
    return {fileCount: entries.length, sha256: sha256(Buffer.from(digestInput, 'utf8'))};
}

function manifestEntry(manifest, collection, expectedPath) {
    const entries = Array.isArray(manifest[collection]) ? manifest[collection] : [];
    const entry = entries.find(candidate => candidate.path === expectedPath);
    if (!entry || !/^[0-9a-f]{64}$/i.test(entry.sha256 || '')) {
        throw new Error('Vendor manifest identity missing: ' + expectedPath);
    }
    return entry;
}

function checkedRuntimeIdentity(root, runtime, manifestEntryValue, runtimePath, role, vendorRoot) {
    const inputPath = slash(path.join(vendorRoot, manifestEntryValue.path));
    const inputSha256 = hashFile(path.join(root, inputPath), role + ' input');
    const manifestSha256 = String(manifestEntryValue.sha256).toUpperCase();
    if (inputSha256 !== manifestSha256) throw new Error(role + ' input hash mismatch: ' + inputPath);
    const actual = hashFile(path.join(runtime, runtimePath), role);
    if (actual !== manifestSha256) throw new Error(role + ' hash mismatch: ' + runtimePath);
    return {role, inputPath, inputSha256, runtimePath, sha256: actual};
}

function historicalRetiredRuntimeInput(manifestEntryValue, runtimePath) {
    const inputPath = slash(path.join('vendor/carnival', manifestEntryValue.path));
    const manifestSha256 = String(manifestEntryValue.sha256).toUpperCase();
    return {
        runtimePath,
        historicalPath:inputPath,
        recordedSha256:manifestSha256,
        evidence:'tracked-historical-manifest',
        physicalInputRequired:false,
        excluded: true,
        reason: 'retired-runtime-input-not-copied'
    };
}

function historicalElectronInput(root, vendorManifest) {
    const executableEntry = manifestEntry(vendorManifest, 'files', HISTORICAL_ELECTRON_PATH);
    const versionEntry = manifestEntry(vendorManifest, 'files', HISTORICAL_ELECTRON_VERSION_PATH);
    const executableSha256 = String(executableEntry.sha256).toUpperCase();
    const versionSha256 = String(versionEntry.sha256).toUpperCase();
    const entries=vendorManifest.files.filter(item=>item.path.startsWith('x64/electron/')).map(item=>({
        path:item.path.slice('x64/electron/'.length),sha256:manifestEntry(vendorManifest,'files',item.path).sha256.toUpperCase()
    })).sort((a,b)=>a.path.localeCompare(b.path));
    const declaration=(vendorManifest.components||[]).find(item=>item.path===HISTORICAL_ELECTRON_PATH);
    return {
        role: 'historical-carnival-electron-baseline',
        versionDeclaration:declaration&&declaration.version||null,
        historicalPath: 'vendor/carnival/x64/electron',
        executablePath: 'vendor/carnival/' + HISTORICAL_ELECTRON_PATH,
        executableSha256,
        versionPath: 'vendor/carnival/' + HISTORICAL_ELECTRON_VERSION_PATH,
        versionSha256,
        manifestTree:{fileCount:entries.length,sha256:sha256(Buffer.from(entries.map(item=>item.path+'\0'+item.sha256+'\n').join(''),'utf8'))},
        verification:'historical-manifest-only',
        physicalInputRequired:false,
        excludedFromProduction: true,
        reason: 'replaced-by-pinned-official-electron-runtime'
    };
}

function productionElectronIdentity(root, runtime) {
    const manifest = electronRuntimeInput.readManifest(root);
    const prepared = electronRuntimeInput.validatePrepared(root);
    const production = electronRuntimeInput.validateRuntime(root, runtime);
    if (prepared.runtimeTree.fileCount !== production.runtimeTree.fileCount ||
        prepared.runtimeTree.sha256 !== production.runtimeTree.sha256 ||
        prepared.electronExeSha256 !== production.electronExeSha256) {
        throw new Error('Prepared and production Electron runtime identity mismatch.');
    }
    return {
        role: 'electron-runtime',
        source: 'official-electron-release',
        channel: manifest.channel,
        version: manifest.version,
        platform: manifest.platform,
        arch: manifest.arch,
        releaseUrl: manifest.releaseUrl,
        manifestPath: electronRuntimeInput.MANIFEST_PATH,
        manifestSha256: trackedFileHash.hashTrackedTextFile(root, electronRuntimeInput.MANIFEST_PATH),
        validatorPath: 'tools/electron-runtime-input.cjs',
        validatorSha256: trackedFileHash.hashTrackedTextFile(root, 'tools/electron-runtime-input.cjs'),
        archive: {
            name: manifest.archive.name,
            sourceUrl: manifest.archive.sourceUrl,
            shasumsUrl: manifest.archive.shasumsUrl,
            sha256: String(manifest.archive.sha256).toUpperCase(),
            size: manifest.archive.size
        },
        inputPath: manifest.runtime.preparedPath,
        runtimePath: manifest.runtime.runtimePath,
        electronExeSha256: production.electronExeSha256.toUpperCase(),
        runtimeTree: {
            fileCount: production.runtimeTree.fileCount,
            sha256: production.runtimeTree.sha256.toUpperCase()
        },
        processVersions: manifest.runtime.processVersions,
        relation: 'official archive -> validated prepared tree -> exact production runtime tree'
    };
}

function productionDependencyClosure(root, runtime) {
    const lockPath = path.join(root, 'package-lock.json');
    const lock = JSON.parse(readFile(lockPath, 'package-lock.json').toString('utf8'));
    const packages = Object.entries(lock.packages || {})
        .filter(([packagePath, metadata]) => packagePath.startsWith('node_modules/') && metadata.dev !== true)
        .map(([packagePath, metadata]) => ({
            path: slash(packagePath),
            version: metadata.version || null,
            integrity: metadata.integrity || null
        }))
        .sort((a, b) => a.path.localeCompare(b.path));
    const runtimeElectronApp = path.join(runtime, 'electronapp');
    const byPath = new Map();
    for (const packageEntry of packages) {
        const packageRoot = path.join(runtimeElectronApp, packageEntry.path);
        if (!fs.existsSync(packageRoot) || !fs.statSync(packageRoot).isDirectory()) {
            throw new Error('Production dependency missing from runtime: ' + packageEntry.path);
        }
        for (const file of walkFiles(packageRoot)) {
            byPath.set(slash(path.relative(runtimeElectronApp, file)), file);
        }
    }
    const files = Array.from(byPath.values());
    return {
        selection: 'package-lock packages under node_modules with dev !== true',
        packageLockPath: 'package-lock.json',
        packageLockSha256: trackedFileHash.hashTrackedTextFile(root, 'package-lock.json'),
        generatorPath: 'tools/copy-runtime-dependencies.cjs',
        generatorSha256: trackedFileHash.hashTrackedTextFile(root, 'tools/copy-runtime-dependencies.cjs'),
        packageCount: packages.length,
        packages,
        runtimeTree: treeIdentity(runtimeElectronApp, files)
    };
}

function buildManifest(rootArg, runtimeArg, sourceCommit) {
    if (!/^[0-9a-fA-F]{40}$/.test(sourceCommit || '')) throw new Error('sourceCommit must be a 40-character git commit.');
    const root = path.resolve(rootArg);
    const runtime = path.resolve(runtimeArg);
    const vendorManifestPath = path.join(root, 'vendor', 'runtime-manifest.json');
    const vendorManifest = JSON.parse(readFile(vendorManifestPath, 'Vendor manifest').toString('utf8'));
    const baseLibmpvEntry = manifestEntry(vendorManifest, 'files', LIBMPV_RUNTIME_PATH);
    const patchLibmpvEntry = manifestEntry(vendorManifest, 'patchFiles', LIBMPV_PATCH_PATH);
    const electron = productionElectronIdentity(root, runtime);
    const historicalElectron = historicalElectronInput(root, vendorManifest);
    const libmpv=libmpvInput.validateRuntime(root,runtime);
    if(libmpv.inputSha256!==String(patchLibmpvEntry.sha256).toUpperCase())throw new Error('libmpv snapshot differs from historical patch identity.');
    libmpv.historicalPredecessor={path:'vendor/carnival/'+baseLibmpvEntry.path,
        recordedSha256:String(baseLibmpvEntry.sha256).toUpperCase(),evidence:'tracked-historical-manifest',physicalInputRequired:false};
    libmpv.historicalPatchInput={path:'vendor/patch/'+patchLibmpvEntry.path,recordedSha256:String(patchLibmpvEntry.sha256).toUpperCase(),physicalInputRequired:false,evidence:'historical manifest plus unchanged snapshot import'};
    libmpv.preparation={generatorPath:'tools/libmpv-input.cjs',generatorSha256:trackedFileHash.hashTrackedTextFile(root,'tools/libmpv-input.cjs')};
    libmpv.inputSha256 = String(patchLibmpvEntry.sha256).toUpperCase();
    const webInput = require('./web-snapshot-input.cjs').validate(root);
    const baseWebRoot = path.join(root, 'vendor', 'web-snapshot', 'www');
    const runtimeWebRoot = path.join(runtime, 'electronapp', 'www');
    const overlayReport = webOverlays.inspect(root, runtime);
    const windowsHost = windowsHostInput.validateRuntime(root,runtime);
    const compatibilityResources=compatibilityInput.validateRuntime(root,runtime);
    compatibilityResources.preparation={generatorPath:'tools/compatibility-resources-input.cjs',generatorSha256:trackedFileHash.hashTrackedTextFile(root,'tools/compatibility-resources-input.cjs')};
    const smallRuntime=smallRuntimeInput.validateRuntime(root,runtime);
    smallRuntime.preparation={generatorPath:'tools/small-runtime-input.cjs',generatorSha256:trackedFileHash.hashTrackedTextFile(root,'tools/small-runtime-input.cjs')};
    const inheritedNpm = inheritedNpmInput.validateRuntime(root,runtime);
    inheritedNpm.preparation = {generatorPath:'tools/inherited-npm-input.cjs',
        generatorSha256:trackedFileHash.hashTrackedTextFile(root,'tools/inherited-npm-input.cjs')};
    windowsHost.preparation = {generatorPath:'tools/prepare-windows-host.ps1',
        generatorSha256:trackedFileHash.hashTrackedTextFile(root,'tools/prepare-windows-host.ps1')};
    const retiredRuntimeInputs = runtimeExclusions.RETIRED_RUNTIME_PATHS.map(runtimePath =>
        historicalRetiredRuntimeInput(manifestEntry(vendorManifest, 'files', runtimePath), runtimePath));
    let nativeHelper = null;
    if (fs.existsSync(path.join(root, 'vendor', 'native-helper-manifest.json'))) {
        nativeHelper = nativeHelperProvenance.validate(root, runtime, sourceCommit);
        if (nativeHelper.status !== 'passed') throw new Error('Native helper provenance validation failed: ' + nativeHelper.errors.join(','));
    }
    const result = {
        schemaVersion: 1,
        sourceCommit: sourceCommit.toLowerCase(),
        purpose: 'Source and transform provenance; final payload enumeration is build-manifest.json',
        baseline: {
            manifestPath: 'vendor/runtime-manifest.json',
            manifestSha256: trackedFileHash.hashTrackedTextFile(root, 'vendor/runtime-manifest.json'),
            version: vendorManifest.baseline || 'unknown',
            historicalReferenceOnly:true,
            physicalArchivesRequired:false,
            archives: (vendorManifest.archives || []).map(entry => ({
                pattern: entry.pattern,
                sha256: String(entry.sha256 || '').toUpperCase()
            }))
        },
        runtimeIdentities: {electron, libmpv,windowsHost,inheritedNpm,compatibilityResources,smallRuntime},
        runtimeTemplates:runtimeTemplates.validate(root),
        historicalInputs: {carnivalElectron: historicalElectron},
        runtimeExclusions: {
            generatorPath: 'tools/runtime-exclusions.cjs',
            generatorSha256: trackedFileHash.hashTrackedTextFile(root, 'tools/runtime-exclusions.cjs'),
            paths: [...runtimeExclusions.RETIRED_RUNTIME_PATHS],
            inputs: retiredRuntimeInputs
        },
        webSnapshot: {
            basePath: 'vendor/web-snapshot/www',
            inputManifest: webInput,
            baseTree: treeIdentity(baseWebRoot, walkFiles(baseWebRoot)),
            overlays: overlayReport.entries,
            runtimePath: 'electronapp/www',
            runtimeTree: treeIdentity(runtimeWebRoot, walkFiles(runtimeWebRoot))
        },
        productionDependencyClosure: productionDependencyClosure(root, runtime)
    };
    if (nativeHelper) result.nativeHelper = nativeHelper.record;
    return result;
}

function writeManifest(root, runtime, sourceCommit) {
    const manifest = buildManifest(root, runtime, sourceCommit);
    fs.writeFileSync(path.join(runtime, MANIFEST_NAME), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    return {schemaVersion: 1, status: 'passed', manifest: MANIFEST_NAME};
}

function validateManifest(root, runtime, sourceCommit) {
    const manifestPath = path.join(runtime, MANIFEST_NAME);
    let actual;
    try {
        actual = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (_) {
        return {schemaVersion: 1, status: 'failed', manifest: MANIFEST_NAME, errors: ['source-provenance-missing-or-invalid']};
    }
    let expected;
    try {
        expected = buildManifest(root, runtime, sourceCommit);
    } catch (error) {
        return {schemaVersion: 1, status: 'failed', manifest: MANIFEST_NAME, errors: [String(error.message || error)]};
    }
    const valid = JSON.stringify(actual) === JSON.stringify(expected);
    return {
        schemaVersion: 1,
        status: valid ? 'passed' : 'failed',
        manifest: MANIFEST_NAME,
        errors: valid ? [] : ['source-provenance-content-mismatch']
    };
}

if (require.main === module) {
    const [command, root, runtime, sourceCommit] = process.argv.slice(2);
    if (!command || !root || !runtime || !sourceCommit) {
        throw new Error('Usage: source-provenance.cjs <write|validate> <root> <runtime> <sourceCommit>');
    }
    const result = command === 'write'
        ? writeManifest(path.resolve(root), path.resolve(runtime), sourceCommit)
        : command === 'validate'
            ? validateManifest(path.resolve(root), path.resolve(runtime), sourceCommit)
            : (() => { throw new Error('Unknown command: ' + command); })();
    process.stdout.write(JSON.stringify(result) + '\n');
    if (result.status === 'failed') process.exitCode = 1;
}

module.exports = {buildManifest, validateManifest, writeManifest};
