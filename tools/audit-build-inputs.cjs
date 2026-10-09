'use strict';

const crypto = require('node:crypto');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const electronInput = require('./electron-runtime-input.cjs');
const runtimeExclusions = require('./runtime-exclusions.cjs');
const {hashTrackedTextFile} = require('./tracked-file-hash.cjs');

const MANIFESTS = Object.freeze([
    'vendor/runtime-manifest.json',
    'vendor/electron-runtime-manifest.json',
    'vendor/native-helper-manifest.json',
    'package-lock.json'
]);
const HASH = /^[a-f0-9]{64}$/i;
const SAFE_VERSION = /^[a-z0-9][a-z0-9.+_-]{0,63}$/i;
const SAFE_ERROR = 'Audit failed; inputs or arguments are invalid.';

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function rel(value) {
    if (typeof value !== 'string' || !value || value.includes('\\') || /[:\0-\x1f\x7f]/.test(value) || value.startsWith('/') ||
        /^[a-z]:/i.test(value) || value.split('/').some(part => !part || part === '.' || part === '..')) {
        throw new Error(SAFE_ERROR);
    }
    return value;
}
function inside(parent, child) {
    const relative = path.relative(parent, child);
    return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
function safeRoot(root, required = false) {
    try {
        const resolved = path.resolve(root);
        let cursor = path.parse(resolved).root;
        const parts = path.relative(cursor, resolved).split(path.sep).filter(Boolean);
        let finalStat = null;
        for (const part of parts) {
            cursor = path.join(cursor, part);
            finalStat = fs.lstatSync(cursor);
            if (finalStat.isSymbolicLink()) throw new Error(SAFE_ERROR);
        }
        return !!finalStat && finalStat.isDirectory();
    } catch (error) {
        if (error instanceof Error && error.message === SAFE_ERROR) throw error;
        if (error && error.code === 'ENOENT' && !required) return false;
        throw new Error(SAFE_ERROR);
    }
}
function checkPath(root, relative, allowMissing = true) {
    rel(relative);
    let current = path.resolve(root);
    const parts = relative.split('/');
    for (let i = 0; i < parts.length; i++) {
        current = path.join(current, parts[i]);
        let stat;
        try { stat = fs.lstatSync(current); }
        catch (error) {
            if (error && error.code === 'ENOENT' && allowMissing) return {path: current, exists: false};
            throw new Error(SAFE_ERROR);
        }
        if (stat.isSymbolicLink()) throw new Error(SAFE_ERROR);
        if (i < parts.length - 1 && !stat.isDirectory()) return {path: current, exists: false};
        if (i === parts.length - 1 && !(stat.isFile() || stat.isDirectory())) throw new Error(SAFE_ERROR);
    }
    return {path: current, exists: true};
}
function readJson(root, relative) {
    const checked = checkPath(root, relative, false);
    if (!checked.exists || !fs.lstatSync(checked.path).isFile()) throw new Error(SAFE_ERROR);
    try {
        const bytes = fs.readFileSync(checked.path);
        return {value: JSON.parse(bytes.toString('utf8')), sha256: sha256(bytes)};
    }
    catch (_) { throw new Error(SAFE_ERROR); }
}
function validateEntries(entries) {
    if (!Array.isArray(entries)) throw new Error(SAFE_ERROR);
    const seen = new Set();
    for (const entry of entries) {
        if (!entry || typeof entry !== 'object') throw new Error(SAFE_ERROR);
        const itemPath = rel(entry.path);
        const key = itemPath.toLowerCase();
        if (seen.has(key) || !HASH.test(entry.sha256 || '')) throw new Error(SAFE_ERROR);
        seen.add(key);
    }
    return seen;
}
function walk(root) {
    const result = [];
    const stack = [''];
    const base = path.resolve(root);
    if (!safeRoot(base)) return null;
    while (stack.length) {
        const prefix = stack.pop();
        const dir = prefix ? path.join(base, ...prefix.split('/')) : base;
        let entries;
        try { entries = fs.readdirSync(dir, {withFileTypes: true}); }
        catch (error) { if (error && error.code === 'ENOENT' && !prefix) return null; throw new Error(SAFE_ERROR); }
        for (const entry of entries) {
            const item = prefix ? prefix + '/' + entry.name : entry.name;
            rel(item);
            const full = path.join(base, ...item.split('/'));
            const stat = fs.lstatSync(full);
            if (stat.isSymbolicLink() || entry.isSymbolicLink()) throw new Error(SAFE_ERROR);
            if (stat.isDirectory()) stack.push(item);
            else if (stat.isFile()) result.push(item);
            else throw new Error(SAFE_ERROR);
        }
    }
    return result.sort((a, b) => a.localeCompare(b));
}
function hashIfFile(root, relative) {
    const checked = checkPath(root, relative);
    if (!checked.exists || !fs.lstatSync(checked.path).isFile()) return null;
    return sha256(fs.readFileSync(checked.path));
}
function canonicalMetadataCheck(root, relative, expectedHash, sourceCommit) {
    const result = cp.spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
        encoding: 'utf8', maxBuffer: 1024 * 1024, windowsHide: true
    });
    const observedSourceCommit = !result.error && result.status === 0 && /^[a-f0-9]{40}$/i.test(result.stdout.trim())
        ? result.stdout.trim().toLowerCase() : null;
    const base = {path: relative, expectedHash: expectedHash.toLowerCase(), observedHash: null,
        expectedSourceCommit: sourceCommit.toLowerCase(), observedSourceCommit};
    if (!observedSourceCommit) return {...base, status: 'UNAVAILABLE'};
    if (observedSourceCommit !== sourceCommit.toLowerCase()) return {...base, status: 'MISMATCH'};
    try {
        const observedHash = hashTrackedTextFile(root, relative).toLowerCase();
        return {...base, observedHash, status: observedHash === expectedHash.toLowerCase() ? 'PASS' : 'MISMATCH'};
    } catch (error) {
        const message = String(error && error.message || '');
        return {...base, status: message.startsWith('Tracked generator differs from HEAD:') ? 'MISMATCH' :
            message.startsWith('Tracked generator missing:') ? 'MISSING' : 'UNAVAILABLE'};
    }
}
function packageMetadataRoot(relative) {
    const parts = relative.split('/');
    let nodeModules = -1;
    for (let i = 0; i < parts.length - 1; i++) if (parts[i] === 'node_modules') nodeModules = i;
    if (nodeModules < 0 || parts[parts.length - 1] !== 'package.json') return false;
    const names = parts.slice(nodeModules + 1, -1);
    return names.length === 1 || (names.length === 2 && names[0].startsWith('@'));
}
function inspectFileSet(inputsRoot, relativeRoot, expected) {
    const expectedSet = validateEntries(expected);
    const actualPaths = walk(path.join(inputsRoot, ...relativeRoot.split('/')));
    const actualSet = new Set(actualPaths || []);
    const entries = expected.map(item => {
        const observedHash = hashIfFile(path.join(inputsRoot, ...relativeRoot.split('/')), item.path);
        const status = observedHash === null ? 'MISSING' : observedHash === item.sha256.toLowerCase() ? 'PASS' : 'MISMATCH';
        return {path: item.path, expectedHash: item.sha256.toLowerCase(), observedHash, status};
    });
    let mismatchCount = entries.filter(entry => entry.status === 'MISMATCH').length;
    let missingCount = entries.filter(entry => entry.status === 'MISSING').length;
    let extraCount = 0;
    if (actualPaths) {
        for (const item of actualSet) if (!expectedSet.has(item.toLowerCase())) extraCount++;
    }
    return {
        status: actualPaths === null || missingCount > 0 ? 'MISSING' : mismatchCount || extraCount ? 'MISMATCH' : 'PASS',
        expectedCount: expected.length,
        actualCount: actualPaths ? actualPaths.length : 0,
        missingCount,
        extraCount,
        mismatchCount,
        failures: entries.filter(entry => entry.status !== 'PASS')
    };
}
function archiveRecord(archiveRoot, name, expectedHash, expectedSize) {
    const archiveName = rel(name);
    const hasExpectedSize = expectedSize !== null && expectedSize !== undefined;
    const reportedExpectedSize = hasExpectedSize ? expectedSize : null;
    if (archiveName.includes('/')) throw new Error(SAFE_ERROR);
    if (!safeRoot(archiveRoot)) return {path: archiveName, status: 'MISSING', expectedHash: expectedHash || null, observedHash: null, expectedSize: reportedExpectedSize, observedSize: null};
    const checked = checkPath(archiveRoot, archiveName);
    if (!checked.exists || !fs.lstatSync(checked.path).isFile()) return {path: archiveName, status: 'MISSING', expectedHash: expectedHash || null, observedHash: null, expectedSize: reportedExpectedSize, observedSize: null};
    const bytes = fs.readFileSync(checked.path);
    const observedHash = sha256(bytes);
    const observedSize = bytes.length;
    const status = expectedHash && hasExpectedSize ? (observedHash === expectedHash.toLowerCase() && observedSize === expectedSize ? 'PASS' : 'MISMATCH')
        : expectedHash ? (observedHash === expectedHash.toLowerCase() ? 'PASS' : 'MISMATCH') : 'OBSERVED';
    return {path: archiveName, status, expectedHash: expectedHash || null, observedHash, expectedSize: reportedExpectedSize, observedSize};
}
function packageLockAudit(inputsRoot, lock) {
    const packages = lock && lock.packages;
    if (!packages || typeof packages !== 'object') throw new Error(SAFE_ERROR);
    const selected = Object.keys(packages).filter(key => key && key.startsWith('node_modules/') && packages[key] && packages[key].dev !== true).sort();
    const entries = selected.map(key => {
        const entry = packages[key];
        const packagePath = rel(key);
        if (entry.version != null && (typeof entry.version !== 'string' || !SAFE_VERSION.test(entry.version))) throw new Error(SAFE_ERROR);
        if (entry.integrity != null && (typeof entry.integrity !== 'string' || !/^sha(?:1|256|384|512)-[a-z0-9+/=]+(?:\s+sha(?:1|256|384|512)-[a-z0-9+/=]+)*$/i.test(entry.integrity))) throw new Error(SAFE_ERROR);
        const file = checkPath(inputsRoot, packagePath + '/package.json');
        let packageJsonVersion = null;
        let exists = false;
        if (file.exists && fs.lstatSync(file.path).isFile()) {
            exists = true;
            try {
                const value = JSON.parse(fs.readFileSync(file.path, 'utf8')).version;
                packageJsonVersion = typeof value === 'string' && SAFE_VERSION.test(value) ? value : null;
            }
            catch (_) { throw new Error(SAFE_ERROR); }
        }
        return {path: packagePath, version: entry.version || null, integrity: entry.integrity || null,
            packageJsonExists: exists, packageJsonVersion,
            status: !exists ? 'MISSING' : packageJsonVersion !== null && packageJsonVersion === (entry.version || null) ? 'PASS' : 'MISMATCH'};
    });
    return {selectedProductionCount: entries.length, missingCount: entries.filter(x => x.status === 'MISSING').length,
        mismatchCount: entries.filter(x => x.status === 'MISMATCH').length, packages: entries};
}
function comparePackageTrees(inputsRoot, runtimeRoot, packages) {
    const selected = Object.keys(packages).filter(key => key && key.startsWith('node_modules/') && packages[key] && packages[key].dev !== true).sort();
    let missingPackageCount = 0, missingCount = 0, extraCount = 0, mismatchCount = 0;
    const entries = selected.map(packagePath => {
        rel(packagePath);
        const sourceRoot = path.join(inputsRoot, ...packagePath.split('/'));
        const runtimePath = 'electronapp/' + packagePath;
        const runtimePackageRoot = path.join(runtimeRoot, ...runtimePath.split('/'));
        const sourcePaths = walk(sourceRoot);
        const runtimePaths = walk(runtimePackageRoot);
        if (sourcePaths === null || runtimePaths === null) {
            missingPackageCount++;
            const packageMissing = sourcePaths !== null && runtimePaths === null ? sourcePaths.length : 0;
            missingCount += packageMissing;
            return {path: runtimePath, status: 'MISSING', sourceFileCount: sourcePaths ? sourcePaths.length : null,
                runtimeFileCount: runtimePaths ? runtimePaths.length : null, missingCount: packageMissing, extraCount: 0, mismatchCount: 0};
        }
        const sourceSet = new Set(sourcePaths);
        const runtimeSet = new Set(runtimePaths);
        let packageMissing = 0, packageExtra = 0, packageMismatch = 0;
        for (const file of sourcePaths) {
            if (!runtimeSet.has(file)) packageMissing++;
            else if (hashIfFile(sourceRoot, file) !== hashIfFile(runtimePackageRoot, file)) packageMismatch++;
        }
        for (const file of runtimePaths) if (!sourceSet.has(file)) packageExtra++;
        missingCount += packageMissing;
        extraCount += packageExtra;
        mismatchCount += packageMismatch;
        return {path: runtimePath, status: packageExtra || packageMismatch ? 'MISMATCH' : packageMissing ? 'MISSING' : 'PASS',
            sourceFileCount: sourcePaths.length, runtimeFileCount: runtimePaths.length,
            missingCount: packageMissing, extraCount: packageExtra, mismatchCount: packageMismatch};
    });
    return {status: mismatchCount || extraCount ? 'MISMATCH' : missingPackageCount || missingCount ? 'MISSING' : 'PASS', packageCount: entries.length,
        missingPackageCount, missingCount, extraCount, mismatchCount, packages: entries};
}
function electronTreeAudit(repoRoot, inputsRoot, manifest) {
    const relativeRoot = rel(manifest.runtime.preparedPath);
    const rootPath = path.join(inputsRoot, ...relativeRoot.split('/'));
    const actualPaths = walk(rootPath);
    if (!actualPaths) return {status: 'MISSING', path: relativeRoot, expectedVersion: manifest.version,
        expectedFileCount: manifest.runtime.fileCount, expectedTreeSha256: manifest.runtime.treeSha256};
    const entries = actualPaths.map(item => ({path: item, sha256: hashIfFile(rootPath, item)}));
    const treeInput = entries.map(item => item.path + '\0' + item.sha256.toUpperCase() + '\n').join('');
    const treeSha256 = sha256(Buffer.from(treeInput, 'utf8'));
    const exePath = rel(manifest.runtime.electronPath);
    const versionPath = rel(manifest.runtime.versionPath);
    const exeSha256 = hashIfFile(rootPath, exePath);
    const versionFile = checkPath(rootPath, versionPath);
    const rawVersion = versionFile.exists && fs.lstatSync(versionFile.path).isFile() ? fs.readFileSync(versionFile.path, 'utf8').trim() : null;
    const version = rawVersion !== null && SAFE_VERSION.test(rawVersion) ? rawVersion : null;
    let helperStatus = false;
    try { electronInput.validateDirectory(repoRoot, rootPath, manifest); helperStatus = true; } catch (_) { }
    const status = helperStatus && entries.length === manifest.runtime.fileCount && treeSha256 === manifest.runtime.treeSha256.toLowerCase() &&
        exeSha256 === manifest.runtime.electronExeSha256.toLowerCase() && version === manifest.version ? 'PASS' :
        entries.length === 0 ? 'MISSING' : 'MISMATCH';
    return {status, path: relativeRoot, version, expectedVersion: manifest.version, fileCount: entries.length,
        expectedFileCount: manifest.runtime.fileCount, treeSha256, expectedTreeSha256: manifest.runtime.treeSha256.toLowerCase(),
        electronExeSha256: exeSha256, expectedElectronExeSha256: manifest.runtime.electronExeSha256.toLowerCase()};
}
function validateOutput(output, inputsRoot, archiveRoot, runtimeRoot, repoRoot) {
    const destination = path.resolve(output);
    const protectedRoots = [path.join(inputsRoot, 'vendor'), path.join(inputsRoot, 'node_modules'), path.join(repoRoot, 'vendor')];
    if (archiveRoot) protectedRoots.push(archiveRoot);
    if (runtimeRoot) protectedRoots.push(runtimeRoot);
    if (protectedRoots.some(root => inside(path.resolve(root), destination))) throw new Error(SAFE_ERROR);
    for (const manifest of MANIFESTS) {
        const authoritative = path.resolve(repoRoot, ...manifest.split('/'));
        if (destination.toLowerCase() === authoritative.toLowerCase()) throw new Error(SAFE_ERROR);
    }
    const parent = path.dirname(destination);
    const relativeParent = path.relative(parent, destination);
    if (relativeParent !== path.basename(destination)) throw new Error(SAFE_ERROR);
    let cursor = path.parse(parent).root;
    for (const part of path.relative(cursor, parent).split(path.sep).filter(Boolean)) {
        cursor = path.join(cursor, part);
        try { if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error(SAFE_ERROR); }
        catch (error) { if (error instanceof Error && error.message === SAFE_ERROR) throw error; if (!error || error.code !== 'ENOENT') throw new Error(SAFE_ERROR); }
    }
    return destination;
}
function runtimeAudit(root, runtimeArg, loaded) {
    const runtimeRoot = path.resolve(runtimeArg);
    const manifestRelative = 'build-manifest.json';
    if (!safeRoot(runtimeRoot)) return {status: 'MISSING', expectedCount: 0, actualCount: 0, missingCount: 0, extraCount: 0, mismatchCount: 0};
    const manifestFile = checkPath(runtimeRoot, manifestRelative);
    if (!manifestFile.exists) return {status: 'MISSING', expectedCount: 0, actualCount: 0, missingCount: 0, extraCount: 0, mismatchCount: 0};
    const runtimeManifestFile = readJson(runtimeRoot, manifestRelative);
    const manifest = runtimeManifestFile.value;
    if (!manifest || ![2, 3].includes(manifest.schemaVersion) || !Array.isArray(manifest.files) || !manifest.payload || !HASH.test(manifest.payload.payloadSetSha256 || '') ||
        !Number.isSafeInteger(manifest.payload.fileCount) || !/^[a-f0-9]{40}$/i.test(manifest.sourceCommit || '') ||
        typeof manifest.version !== 'string' || !/^[a-z0-9.+_-]+$/i.test(manifest.version) ||
        !HASH.test(manifest.sourceManifestSha256 || '') || !HASH.test(manifest.packageLockSha256 || '')) throw new Error(SAFE_ERROR);
    const expectedSet = validateEntries(manifest.files);
    if (expectedSet.has(manifestRelative.toLowerCase())) throw new Error(SAFE_ERROR);
    const provenance = manifest.provenance || {};
    const provenanceDefinitions = manifest.schemaVersion === 3
        ? [['inputs', 'build-input-provenance.json'], ['source', 'source-provenance.json'], ['runtime', 'runtime-provenance.json']]
        : [['source', 'source-provenance.json'], ['runtime', 'runtime-provenance.json']];
    if (manifest.schemaVersion === 3 && JSON.stringify(Object.keys(provenance).sort()) !== JSON.stringify(['inputs', 'runtime', 'source'])) {
        throw new Error(SAFE_ERROR);
    }
    for (const [key, expectedPath] of provenanceDefinitions) {
        const record = provenance[key] || {};
        if (record.path !== expectedPath || !HASH.test(record.sha256 || '') || !expectedSet.has(expectedPath.toLowerCase())) throw new Error(SAFE_ERROR);
    }
    const actual = walk(runtimeRoot);
    if (!actual) throw new Error(SAFE_ERROR);
    const listedActual = actual.filter(item => item !== manifestRelative);
    const actualSet = new Set(listedActual);
    let missingCount = 0, extraCount = 0, mismatchCount = 0;
    const files = manifest.files.map(item => {
        const observedHash = hashIfFile(runtimeRoot, item.path);
        const status = observedHash === null ? 'MISSING' : observedHash === item.sha256.toLowerCase() ? 'PASS' : 'MISMATCH';
        if (status === 'MISSING') missingCount++; else if (status === 'MISMATCH') mismatchCount++;
        return {path: item.path, expectedHash: item.sha256.toLowerCase(), observedHash, status};
    });
    for (const item of actualSet) if (!expectedSet.has(item.toLowerCase())) extraCount++;
    const payloadSetSha256 = sha256(Buffer.from(manifest.files.map(item => item.path + '\0' + item.sha256 + '\n').join(''), 'utf8'));
    const metadataChecks = manifest.schemaVersion === 3
        ? [canonicalMetadataCheck(root, MANIFESTS[0], manifest.sourceManifestSha256, manifest.sourceCommit),
            canonicalMetadataCheck(root, MANIFESTS[3], manifest.packageLockSha256, manifest.sourceCommit)]
        : [{path: MANIFESTS[0], expectedHash: manifest.sourceManifestSha256, observedHash: hashIfFile(root, MANIFESTS[0])},
            {path: MANIFESTS[3], expectedHash: manifest.packageLockSha256, observedHash: hashIfFile(root, MANIFESTS[3])}];
    const sourceManifestHash = metadataChecks[0].observedHash;
    const lockHash = metadataChecks[1].observedHash;
    const provenanceChecks = provenanceDefinitions.map(([key]) => {
        const record = provenance[key] || {};
        const recordPath = rel(record.path);
        if (!HASH.test(record.sha256 || '')) throw new Error(SAFE_ERROR);
        const observedHash = hashIfFile(runtimeRoot, recordPath);
        return {path: recordPath, expectedHash: record.sha256 || null, observedHash,
            status: !observedHash ? 'MISSING' : observedHash === String(record.sha256 || '').toLowerCase() ? 'PASS' : 'MISMATCH'};
    });
    const bindingMismatch = manifest.schemaVersion === 3
        ? metadataChecks.some(item => item.status === 'MISMATCH') || provenanceChecks.some(item => item.status === 'MISMATCH')
        : sourceManifestHash !== manifest.sourceManifestSha256 || lockHash !== manifest.packageLockSha256 ||
            provenanceChecks.some(item => item.status === 'MISMATCH');
    const bindingMissing = manifest.schemaVersion === 3
        ? metadataChecks.some(item => item.status === 'MISSING' || item.status === 'UNAVAILABLE') || provenanceChecks.some(item => item.status === 'MISSING')
        : !sourceManifestHash || !lockHash || provenanceChecks.some(item => item.status === 'MISSING');
    const bindingStatus = bindingMismatch ? 'MISMATCH' : bindingMissing ? 'MISSING' : 'PASS';
    const listedPresent = manifest.files.filter(item => actualSet.has(item.path) && hashIfFile(runtimeRoot, item.path) !== null).map(item => item.path);
    const binaryFiles = listedPresent.filter(item => /\.(?:exe|dll|node)$/i.test(item)).map(item => ({path: item, sha256: hashIfFile(runtimeRoot, item)}));
    const licenseFiles = listedPresent.filter(item => /(?:^|\/)(?:licen[cs]es?|copying|notices?|copyright|third[._-]party[._-]notices?)(?:[._-][^/]*)?$/i.test(item));
    const lockPackages = loaded[MANIFESTS[3]].value.packages || {};
    const productionPackages = new Set(Object.keys(lockPackages).filter(key => key && key.startsWith('node_modules/') && lockPackages[key] && lockPackages[key].dev !== true).map(key => key.toLowerCase()));
    const runtimePackages = listedPresent.filter(packageMetadataRoot).map(item => {
        const record = checkPath(runtimeRoot, item);
        let data;
        try { data = JSON.parse(fs.readFileSync(record.path, 'utf8')); } catch (_) { throw new Error(SAFE_ERROR); }
        const packagePath = item.slice(0, -'/package.json'.length);
        const lockPath = packagePath.startsWith('electronapp/') ? packagePath.slice('electronapp/'.length) : packagePath;
        const safeName = typeof data.name === 'string' && /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(data.name) ? data.name : null;
        const safeVersion = typeof data.version === 'string' && SAFE_VERSION.test(data.version) ? data.version : null;
        return {path: packagePath, name: safeName, version: safeVersion,
            selection: productionPackages.has(lockPath.toLowerCase()) ? 'lockfile-production' : 'archive-baseline-or-unclassified'};
    });
    const retired = runtimeExclusions.RETIRED_RUNTIME_PATHS.map(item => {
        const safe = rel(item);
        return {path: safe, status: checkPath(runtimeRoot, safe).exists ? 'PRESENT' : 'ABSENT'};
    });
    const payloadStatus = manifest.payload.fileCount === manifest.files.length && payloadSetSha256 === manifest.payload.payloadSetSha256.toLowerCase() &&
        actualSet.size === expectedSet.size && missingCount === 0 && extraCount === 0 && mismatchCount === 0 ? 'PASS' : 'MISMATCH';
    const hasMissing = missingCount > 0 || bindingStatus === 'MISSING';
    const hasMismatch = mismatchCount > 0 || extraCount > 0 || payloadStatus === 'MISMATCH' && !hasMissing ||
        manifest.payload.fileCount !== manifest.files.length || payloadSetSha256 !== manifest.payload.payloadSetSha256.toLowerCase() ||
        bindingStatus === 'MISMATCH' || retired.some(item => item.status === 'PRESENT');
    return {
        status: hasMismatch ? 'MISMATCH' : hasMissing ? 'MISSING' : 'PASS',
        manifestPath: manifestRelative, manifestSha256: runtimeManifestFile.sha256,
        sourceCommit: manifest.sourceCommit || null, version: manifest.version || null,
        fileCount: manifest.payload.fileCount, actualPayloadFileCount: listedActual.length,
        expectedCount: manifest.files.length, actualCount: listedActual.length, missingCount, extraCount, mismatchCount,
        failures: files.filter(item => item.status !== 'PASS'),
        payloadSetSha256: {expected: manifest.payload.payloadSetSha256.toLowerCase(), observed: payloadSetSha256, status: payloadSetSha256 === manifest.payload.payloadSetSha256.toLowerCase() ? 'PASS' : 'MISMATCH'},
        provenanceBindings: {status: bindingStatus,
            metadataHashSemantics: manifest.schemaVersion === 3 ? 'HEAD_GIT_BLOB_WITH_CANONICAL_CRLF_WORKTREE_MATCH' : 'RAW_WORKTREE_BYTES',
            sourceManifestSha256: {expected: manifest.sourceManifestSha256 || null, observed: sourceManifestHash, status: metadataChecks[0].status || null},
            packageLockSha256: {expected: manifest.packageLockSha256 || null, observed: lockHash, status: metadataChecks[1].status || null},
            records: provenanceChecks},
        binaries: binaryFiles, licenseNoticePaths: licenseFiles, runtimePackages, retiredPaths: retired
    };
}
function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const key = argv[i];
        if (!['--repo-root', '--inputs-root', '--archive-root', '--runtime', '--output'].includes(key) || args[key]) throw new Error(SAFE_ERROR);
        if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(SAFE_ERROR);
        args[key] = argv[++i];
    }
    if (!args['--repo-root'] || !args['--inputs-root'] || !args['--output']) throw new Error(SAFE_ERROR);
    return args;
}
function run(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);
    const repoRoot = path.resolve(args['--repo-root']);
    const inputsRoot = path.resolve(args['--inputs-root']);
    const archiveRoot = args['--archive-root'] ? path.resolve(args['--archive-root']) : null;
    const runtimeRoot = args['--runtime'] ? path.resolve(args['--runtime']) : null;
    safeRoot(repoRoot, true);
    safeRoot(inputsRoot);
    if (archiveRoot) safeRoot(archiveRoot);
    if (runtimeRoot) safeRoot(runtimeRoot);
    const output = validateOutput(args['--output'], inputsRoot, archiveRoot, runtimeRoot, repoRoot);
    const loaded = {};
    for (const item of MANIFESTS) loaded[item] = readJson(repoRoot, item);
    const runtimeManifest = loaded[MANIFESTS[0]].value;
    const electronManifest = loaded[MANIFESTS[1]].value;
    const nativeManifest = loaded[MANIFESTS[2]].value;
    validateEntries(runtimeManifest.files);
    validateEntries(runtimeManifest.patchFiles);
    if (!Array.isArray(runtimeManifest.archives) || runtimeManifest.archives.some(item => !item || !HASH.test(item.sha256 || '') || !rel(item.pattern) || item.pattern.includes('/'))) throw new Error(SAFE_ERROR);
    for (const pathValue of runtimeManifest.runtimeExclusions || []) rel(pathValue);
    if (!electronManifest || typeof electronManifest.version !== 'string' || !/^[a-z0-9.+_-]+$/i.test(electronManifest.version) ||
        !electronManifest.archive || !HASH.test(electronManifest.archive.sha256 || '') || !Number.isSafeInteger(electronManifest.archive.size) || electronManifest.archive.size <= 0 ||
        !HASH.test(electronManifest.runtime.treeSha256 || '') || !HASH.test(electronManifest.runtime.electronExeSha256 || '') ||
        !Number.isSafeInteger(electronManifest.runtime.fileCount)) throw new Error(SAFE_ERROR);
    rel(electronManifest.runtime.preparedPath);
    rel(electronManifest.runtime.runtimePath);
    rel(nativeManifest.clientHeader.path);
    if (!HASH.test(nativeManifest.clientHeader.sha256 || '')) throw new Error(SAFE_ERROR);
    const authority = MANIFESTS.map(item => ({path: item, sha256: loaded[item].sha256}));
    const nativeHeaderHash = hashIfFile(inputsRoot, nativeManifest.clientHeader.path);
    const report = {
        schemaVersion: 1,
        status: 'OBSERVED',
        authority,
        archives: {
            carnival: (runtimeManifest.archives || []).map(item => archiveRoot ? archiveRecord(archiveRoot, item.pattern, item.sha256, null) : {path: rel(item.pattern), status: 'UNAVAILABLE', expectedHash: item.sha256 || null, observedHash: null, expectedSize: null, observedSize: null}),
            electron: archiveRoot ? archiveRecord(archiveRoot, electronManifest.archive.name, electronManifest.archive.sha256, electronManifest.archive.size) : {path: rel(electronManifest.archive.name), status: 'UNAVAILABLE', expectedHash: electronManifest.archive.sha256, observedHash: null, expectedSize: electronManifest.archive.size, observedSize: null}
        },
        fileSets: {
            carnival: inspectFileSet(inputsRoot, 'vendor/carnival', runtimeManifest.files),
            patch: inspectFileSet(inputsRoot, 'vendor/patch', runtimeManifest.patchFiles)
        },
        electronPrepared: electronTreeAudit(repoRoot, inputsRoot, electronManifest),
        nativeHeader: {path: nativeManifest.clientHeader.path, expectedHash: nativeManifest.clientHeader.sha256.toLowerCase(), observedHash: nativeHeaderHash, status: nativeHeaderHash === nativeManifest.clientHeader.sha256.toLowerCase() ? 'PASS' : nativeHeaderHash === null ? 'MISSING' : 'MISMATCH'},
        packageLock: packageLockAudit(inputsRoot, loaded[MANIFESTS[3]].value),
        packageComparison: runtimeRoot ? comparePackageTrees(inputsRoot, runtimeRoot, loaded[MANIFESTS[3]].value.packages || {}) : {status: 'UNAVAILABLE'},
        runtime: runtimeRoot ? runtimeAudit(repoRoot, runtimeRoot, loaded) : {status: 'UNAVAILABLE'}
    };
    const summaries = [report.fileSets.carnival, report.fileSets.patch, report.electronPrepared, report.nativeHeader, report.packageLock, report.packageComparison, report.runtime];
    const archiveRecords = [...report.archives.carnival, report.archives.electron];
    report.status = 'OBSERVED';
    const allChecks = [...summaries, ...archiveRecords];
    const explicitMismatch = allChecks.some(item => item.status === 'MISMATCH' || item.extraCount > 0 || item.mismatchCount > 0) ||
        report.packageLock.packages.some(item => item.status === 'MISMATCH');
    const missingEvidence = allChecks.some(item => item.status === 'MISSING' || item.status === 'UNAVAILABLE' || item.missingCount > 0 || item.missingPackageCount > 0) ||
        report.packageLock.packages.some(item => item.status === 'MISSING');
    report.assessment = explicitMismatch ? 'MISMATCH' : missingEvidence ? 'INCOMPLETE' : 'CONSISTENT';
    const fd = fs.openSync(output, 'wx', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(report, null, 2) + '\n', 'utf8'); }
    finally { fs.closeSync(fd); }
    return report;
}

if (require.main === module) {
    try { run(); }
    catch (_) { process.stderr.write(SAFE_ERROR + '\n'); process.exitCode = 1; }
}

module.exports = {MANIFESTS, run};
