'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MANIFEST_PATH = 'vendor/electron-runtime-manifest.json';

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex').toLowerCase();
}

function slash(value) {
    return value.split(path.sep).join('/');
}

function readJson(file, label) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(label + ' missing.');
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readManifest(root) {
    const manifest = readJson(path.join(root, MANIFEST_PATH), 'Electron runtime manifest');
    const archive = manifest.archive || {};
    const runtime = manifest.runtime || {};
    const expectedName = `electron-v${manifest.version}-${manifest.platform}-${manifest.arch}.zip`;
    const exactReleasePrefix = `https://github.com/electron/electron/releases/download/v${manifest.version}/`;
    const errors = [];
    if (manifest.schemaVersion !== 1) errors.push('unsupported-schema');
    if (manifest.channel !== 'Stable') errors.push('channel-not-stable');
    if (manifest.version !== '44.4.2') errors.push('version-not-pinned');
    if (manifest.platform !== 'win32' || manifest.arch !== 'x64') errors.push('platform-or-arch-mismatch');
    if (archive.name !== expectedName) errors.push('archive-name-mismatch');
    if (archive.sourceUrl !== exactReleasePrefix + expectedName || /latest|nightly|beta|alpha/i.test(archive.sourceUrl || '')) {
        errors.push('archive-url-not-exact');
    }
    if (archive.shasumsUrl !== exactReleasePrefix + 'SHASUMS256.txt') errors.push('shasums-url-not-exact');
    if (!/^[0-9a-f]{64}$/.test(archive.sha256 || '')) errors.push('archive-sha256-invalid');
    if (!Number.isSafeInteger(archive.size) || archive.size <= 0) errors.push('archive-size-invalid');
    if (runtime.preparedPath !== 'vendor/electron/44.4.2/win32-x64') errors.push('prepared-path-mismatch');
    if (runtime.runtimePath !== 'x64/electron') errors.push('runtime-path-mismatch');
    if (runtime.electronPath !== 'electron.exe' || runtime.versionPath !== 'version') errors.push('runtime-sentinel-mismatch');
    if (!/^[0-9a-f]{64}$/.test(runtime.electronExeSha256 || '')) errors.push('electron-exe-sha256-invalid');
    if (!/^[0-9a-f]{64}$/.test(runtime.treeSha256 || '') || !Number.isSafeInteger(runtime.fileCount) || runtime.fileCount <= 0) {
        errors.push('runtime-tree-identity-invalid');
    }
    const versions = runtime.processVersions || {};
    if (versions.electron !== manifest.version || versions.node !== '24.21.0' || !/^152\./.test(versions.chrome || '') || !versions.v8) {
        errors.push('process-versions-mismatch');
    }
    if (errors.length) throw new Error('Electron runtime manifest invalid: ' + errors.join(','));
    return manifest;
}

function walkFiles(root) {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error('Electron runtime directory missing.');
    const files = [];
    const pending = [root];
    while (pending.length) {
        const current = pending.pop();
        for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
            const child = path.join(current, entry.name);
            if (entry.isDirectory()) pending.push(child);
            else if (entry.isFile()) files.push(child);
            else throw new Error('Electron runtime contains an unsupported entry type.');
        }
    }
    return files.sort((a, b) => a.localeCompare(b));
}

function treeIdentity(directory) {
    const files = walkFiles(directory);
    const entries = files.map(file => ({
        path: slash(path.relative(directory, file)),
        sha256: sha256(fs.readFileSync(file))
    })).sort((a, b) => a.path.localeCompare(b.path));
    const input = entries.map(entry => entry.path + '\0' + entry.sha256.toUpperCase() + '\n').join('');
    return {fileCount: entries.length, sha256: sha256(Buffer.from(input, 'utf8')), entries};
}

function validateArchive(rootArg, archiveRootArg, manifestOverride) {
    const root = path.resolve(rootArg);
    const archiveRoot = path.resolve(archiveRootArg);
    const manifest = manifestOverride || readManifest(root);
    const archivePath = path.join(archiveRoot, manifest.archive.name);
    if (!fs.existsSync(archivePath) || !fs.statSync(archivePath).isFile()) throw new Error('Electron archive missing: ' + manifest.archive.name);
    const stat = fs.statSync(archivePath);
    if (stat.size !== manifest.archive.size) throw new Error('Electron archive size mismatch.');
    const actualSha256 = sha256(fs.readFileSync(archivePath));
    if (actualSha256 !== manifest.archive.sha256) throw new Error('Electron archive SHA256 mismatch.');
    return {
        status: 'passed',
        version: manifest.version,
        archive: manifest.archive.name,
        archiveSha256: actualSha256,
        archiveSize: stat.size
    };
}

function validateDirectory(rootArg, directoryArg, manifestOverride) {
    const root = path.resolve(rootArg);
    const directory = path.resolve(directoryArg);
    const manifest = manifestOverride || readManifest(root);
    const identity = treeIdentity(directory);
    if (identity.fileCount !== manifest.runtime.fileCount || identity.sha256 !== manifest.runtime.treeSha256) {
        throw new Error('Electron runtime tree identity mismatch.');
    }
    const electronPath = path.join(directory, manifest.runtime.electronPath);
    const versionPath = path.join(directory, manifest.runtime.versionPath);
    if (!fs.existsSync(electronPath) || !fs.statSync(electronPath).isFile()) throw new Error('Electron executable missing.');
    if (!fs.existsSync(versionPath) || !fs.statSync(versionPath).isFile()) throw new Error('Electron version file missing.');
    const electronExeSha256 = sha256(fs.readFileSync(electronPath));
    if (electronExeSha256 !== manifest.runtime.electronExeSha256) throw new Error('Electron executable SHA256 mismatch.');
    const version = fs.readFileSync(versionPath, 'utf8').trim();
    if (version !== manifest.version) throw new Error('Electron version mismatch.');
    return {
        status: 'passed',
        version,
        electronExeSha256,
        runtimeTree: {fileCount: identity.fileCount, sha256: identity.sha256}
    };
}

function validatePrepared(rootArg) {
    const root = path.resolve(rootArg);
    const manifest = readManifest(root);
    return validateDirectory(root, path.join(root, ...manifest.runtime.preparedPath.split('/')), manifest);
}

function validateRuntime(rootArg, runtimeArg) {
    const root = path.resolve(rootArg);
    const runtime = path.resolve(runtimeArg);
    const manifest = readManifest(root);
    return validateDirectory(root, path.join(runtime, ...manifest.runtime.runtimePath.split('/')), manifest);
}

function runCli() {
    const [command, rootArg, inputArg] = process.argv.slice(2);
    if (!command || !rootArg) throw new Error('Usage: electron-runtime-input.cjs <validate-manifest|validate-archive|validate-directory|validate-prepared|validate-runtime> <root> [input]');
    const root = path.resolve(rootArg);
    let result;
    if (command === 'validate-manifest') {
        const manifest = readManifest(root);
        result = {status: 'passed', version: manifest.version, channel: manifest.channel, archive: manifest.archive.name};
    } else if (command === 'validate-archive') {
        if (!inputArg) throw new Error('Archive root is required.');
        result = validateArchive(root, inputArg);
    } else if (command === 'validate-directory') {
        if (!inputArg) throw new Error('Runtime directory is required.');
        result = validateDirectory(root, inputArg);
    } else if (command === 'validate-prepared') {
        result = validatePrepared(root);
    } else if (command === 'validate-runtime') {
        if (!inputArg) throw new Error('Runtime root is required.');
        result = validateRuntime(root, inputArg);
    } else {
        throw new Error('Unknown command: ' + command);
    }
    process.stdout.write(JSON.stringify(result) + '\n');
}

if (require.main === module) {
    try {
        runCli();
    } catch (error) {
        process.stderr.write(String(error && error.message || error) + '\n');
        process.exitCode = 1;
    }
}

module.exports = {MANIFEST_PATH, readManifest, treeIdentity, validateArchive, validateDirectory, validatePrepared, validateRuntime};
