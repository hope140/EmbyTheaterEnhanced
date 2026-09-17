'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const webOverlays = require('./prepare-web-overlays.cjs');
const trackedFileHash = require('./tracked-file-hash.cjs');
const nativeHelperProvenance = require('./native-helper-provenance.cjs');

const MANIFEST_NAME = 'source-provenance.json';
const ELECTRON_PATH = 'x64/electron/electron.exe';
const ELECTRON_VERSION_PATH = 'x64/electron/version';
const BRIDGE_PATH = 'electronapp/libmpv/x64/mpv-win32-x64.node';
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
    const electronEntry = manifestEntry(vendorManifest, 'files', ELECTRON_PATH);
    const electronVersionEntry = manifestEntry(vendorManifest, 'files', ELECTRON_VERSION_PATH);
    const bridgeEntry = manifestEntry(vendorManifest, 'files', BRIDGE_PATH);
    const baseLibmpvEntry = manifestEntry(vendorManifest, 'files', LIBMPV_RUNTIME_PATH);
    const patchLibmpvEntry = manifestEntry(vendorManifest, 'patchFiles', LIBMPV_PATCH_PATH);
    const electron = checkedRuntimeIdentity(root, runtime, electronEntry, ELECTRON_PATH, 'electron-runtime', 'vendor/carnival');
    const electronVersion = checkedRuntimeIdentity(root, runtime, electronVersionEntry, ELECTRON_VERSION_PATH, 'electron-version', 'vendor/carnival');
    electronVersion.version = readFile(path.join(runtime, ELECTRON_VERSION_PATH), 'Electron version').toString('utf8').trim();
    const bridge = checkedRuntimeIdentity(root, runtime, bridgeEntry, BRIDGE_PATH, 'pepper-bridge', 'vendor/carnival');
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
        runtimeIdentities: {electron, electronVersion, bridge, libmpv},
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
