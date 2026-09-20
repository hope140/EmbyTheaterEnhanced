'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const webOverlays = require('./prepare-web-overlays.cjs');
const trackedFileHash = require('./tracked-file-hash.cjs');
const nativeHelperProvenance = require('./native-helper-provenance.cjs');
const runtimeExclusions = require('./runtime-exclusions.cjs');
const electronRuntimeInput = require('./electron-runtime-input.cjs');

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

function checkedRetiredRuntimeInput(root, manifestEntryValue, runtimePath) {
    const inputPath = slash(path.join('vendor/carnival', manifestEntryValue.path));
    const inputSha256 = hashFile(path.join(root, inputPath), 'Retired runtime input');
    const manifestSha256 = String(manifestEntryValue.sha256).toUpperCase();
    if (inputSha256 !== manifestSha256) throw new Error('Retired runtime input hash mismatch: ' + inputPath);
    return {
        runtimePath,
        inputPath,
        inputSha256,
        manifestSha256,
        excluded: true,
        reason: 'retired-runtime-input-not-copied'
    };
}

function historicalElectronInput(root, vendorManifest) {
    const executableEntry = manifestEntry(vendorManifest, 'files', HISTORICAL_ELECTRON_PATH);
    const versionEntry = manifestEntry(vendorManifest, 'files', HISTORICAL_ELECTRON_VERSION_PATH);
    const executablePath = path.join(root, 'vendor', 'carnival', executableEntry.path);
    const versionPath = path.join(root, 'vendor', 'carnival', versionEntry.path);
    const executableSha256 = hashFile(executablePath, 'Historical Carnival Electron executable');
    const versionSha256 = hashFile(versionPath, 'Historical Carnival Electron version');
    if (executableSha256 !== String(executableEntry.sha256).toUpperCase() ||
        versionSha256 !== String(versionEntry.sha256).toUpperCase()) {
        throw new Error('Historical Carnival Electron input mismatch.');
    }
    const historicalRoot = path.join(root, 'vendor', 'carnival', 'x64', 'electron');
    return {
        role: 'historical-carnival-electron-baseline',
        version: readFile(versionPath, 'Historical Carnival Electron version').toString('utf8').trim(),
        inputPath: 'vendor/carnival/x64/electron',
        executablePath: 'vendor/carnival/' + HISTORICAL_ELECTRON_PATH,
        executableSha256,
        versionPath: 'vendor/carnival/' + HISTORICAL_ELECTRON_VERSION_PATH,
        versionSha256,
        inputTree: treeIdentity(historicalRoot, walkFiles(historicalRoot)),
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
        manifestSha256: hashFile(path.join(root, electronRuntimeInput.MANIFEST_PATH), 'Electron runtime manifest'),
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
        packageLockSha256: hashFile(lockPath, 'package-lock.json'),
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
    const libmpv = checkedRuntimeIdentity(root, runtime, patchLibmpvEntry, LIBMPV_RUNTIME_PATH, 'libmpv', 'vendor/patch');
    const baseLibmpvInput = hashFile(path.join(root, 'vendor', 'carnival', baseLibmpvEntry.path), 'libmpv base input');
    if (baseLibmpvInput !== String(baseLibmpvEntry.sha256).toUpperCase()) {
        throw new Error('libmpv base input hash mismatch: vendor/carnival/' + baseLibmpvEntry.path);
    }
    libmpv.baseVendorPath = baseLibmpvEntry.path;
    libmpv.baseSha256 = String(baseLibmpvEntry.sha256).toUpperCase();
    libmpv.inputPath = patchLibmpvEntry.path;
    libmpv.inputSha256 = String(patchLibmpvEntry.sha256).toUpperCase();
    const baseWebRoot = path.join(root, 'vendor', 'carnival', 'electronapp', 'www');
    const runtimeWebRoot = path.join(runtime, 'electronapp', 'www');
    const overlayReport = webOverlays.inspect(root, runtime);
    const retiredRuntimeInputs = runtimeExclusions.RETIRED_RUNTIME_PATHS.map(runtimePath =>
        checkedRetiredRuntimeInput(root, manifestEntry(vendorManifest, 'files', runtimePath), runtimePath));
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
            manifestSha256: hashFile(vendorManifestPath, 'Vendor manifest'),
            version: vendorManifest.baseline || 'unknown',
            archives: (vendorManifest.archives || []).map(entry => ({
                pattern: entry.pattern,
                sha256: String(entry.sha256 || '').toUpperCase()
            }))
        },
        runtimeIdentities: {electron, libmpv},
        historicalInputs: {carnivalElectron: historicalElectron},
        runtimeExclusions: {
            generatorPath: 'tools/runtime-exclusions.cjs',
            generatorSha256: trackedFileHash.hashTrackedTextFile(root, 'tools/runtime-exclusions.cjs'),
            paths: [...runtimeExclusions.RETIRED_RUNTIME_PATHS],
            inputs: retiredRuntimeInputs
        },
        webSnapshot: {
            basePath: 'vendor/carnival/electronapp/www',
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
