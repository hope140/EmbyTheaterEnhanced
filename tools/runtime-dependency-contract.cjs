'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {hashTrackedTextFile} = require('./tracked-file-hash.cjs');

const OWNER_FILE = '.ete-build-owner.json';
const PROVENANCE_FILE = 'runtime-dependencies.json';
const CONTRACT_NAME = 'ete-runtime-dependencies';
const SCHEMA_VERSION = 1;

const RETAINED_PACKAGES = Object.freeze([
    Object.freeze({packagePath: 'node_modules/detect-rpi', version: '1.4.0'}),
    Object.freeze({packagePath: 'node_modules/is-linux', version: '1.0.1'}),
    Object.freeze({packagePath: 'node_modules/is-osx', version: '1.0.2'}),
    Object.freeze({packagePath: 'node_modules/is-windows', version: '1.0.2'}),
    Object.freeze({packagePath: 'node_modules/power-off', version: '1.1.2'}),
    Object.freeze({packagePath: 'node_modules/sleep-mode', version: '1.1.0'}),
    Object.freeze({packagePath: 'node_modules/sleep-mode/node_modules/is-windows', version: '0.1.1'})
]);

function fail(message) {
    throw new Error(message);
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function readJson(file, label) {
    let text;
    try {
        text = fs.readFileSync(file, 'utf8');
    } catch (error) {
        fail(`${label} is unavailable: ${error.message}`);
    }
    try {
        return {text, value: JSON.parse(text)};
    } catch (error) {
        fail(`${label} is not valid JSON: ${error.message}`);
    }
}

function normalizedPath(value) {
    const resolved = path.resolve(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isDescendant(parent, candidate) {
    const relative = path.relative(parent, candidate);
    return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function assertDirectory(directory, label) {
    let stat;
    try {
        stat = fs.lstatSync(directory);
    } catch (error) {
        fail(`${label} is unavailable: ${error.message}`);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`${label} must be a physical directory.`);
}

function assertPhysicalPath(root, candidate, label) {
    const rootPath = path.resolve(root);
    const candidatePath = path.resolve(candidate);
    assertDirectory(rootPath, 'Repository root');
    if (candidatePath !== rootPath && !isDescendant(rootPath, candidatePath)) {
        fail(`${label} must be inside the repository root.`);
    }
    const relative = path.relative(rootPath, candidatePath);
    let current = rootPath;
    for (const part of relative.split(path.sep).filter(Boolean)) {
        current = path.join(current, part);
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink()) fail(`${label} contains a symlink or junction: ${current}`);
        const real = fs.realpathSync.native(current);
        if (normalizedPath(real) !== normalizedPath(current)) {
            fail(`${label} contains a reparse redirect: ${current}`);
        }
    }
    return candidatePath;
}

function assertPhysicalAncestors(root, candidate, label) {
    const rootPath = path.resolve(root);
    let current = path.resolve(candidate);
    if (current !== rootPath && !isDescendant(rootPath, current)) fail(`${label} escaped its root.`);
    while (!fs.existsSync(current)) {
        const parent = path.dirname(current);
        if (parent === current || (parent !== rootPath && !isDescendant(rootPath, parent))) {
            fail(`${label} has no owned existing ancestor.`);
        }
        current = parent;
    }
    assertPhysicalPath(rootPath, current, label);
}

function assertRepoLayout(repoRoot, runtimeRoot, sourceProjectRoot) {
    const root = path.resolve(repoRoot);
    const runtime = path.resolve(runtimeRoot);
    const dist = path.join(root, 'dist');
    if (path.dirname(runtime) !== dist || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(path.basename(runtime))) {
        fail('Runtime root must be a direct simple-name child of repository dist.');
    }
    assertPhysicalPath(root, runtime, 'Runtime root');
    if (sourceProjectRoot !== undefined) {
        const source = path.resolve(sourceProjectRoot);
        const work = path.join(root, '.work');
        if (!isDescendant(work, source) || !/^runtime-dependencies-[A-Za-z0-9._-]+$/.test(path.basename(source))) {
            fail('Source project root must be a unique runtime-dependencies-* child of repository .work.');
        }
        assertPhysicalPath(root, source, 'Source project root');
        if (normalizedPath(source) === normalizedPath(root) || normalizedPath(source) === normalizedPath(runtime)) {
            fail('Source project root must be isolated from repository and runtime roots.');
        }
    }
    return {root, runtime};
}

function packageNameFromPath(packagePath) {
    const pathParts = packagePath.split('/');
    const lastNodeModules = pathParts.lastIndexOf('node_modules');
    const parts = pathParts.slice(lastNodeModules + 1);
    return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
}

function loadSelectedPackages(repoRoot) {
    const lockFile = path.join(repoRoot, 'package-lock.json');
    const lock = readJson(lockFile, 'Repository package lock');
    if (lock.value.lockfileVersion !== 3 || !lock.value.packages || typeof lock.value.packages !== 'object') {
        fail('Repository package lock must use lockfileVersion 3 with a packages map.');
    }
    const packages = Object.entries(lock.value.packages)
        .filter(([packagePath, metadata]) => packagePath.startsWith('node_modules/') && metadata.dev !== true)
        .map(([packagePath, metadata]) => {
            const pathParts = packagePath.split('/');
            if (packagePath.includes('\\') || pathParts.some(part => !part || part === '.' || part === '..' || part.includes(':')) ||
                pathParts.filter(part => part === 'node_modules').length !== 1) {
                fail(`Nested or non-canonical production package path is unsupported: ${packagePath}`);
            }
            const name = packageNameFromPath(packagePath);
            if (packagePath !== `node_modules/${name}`) fail(`Non-canonical production package path: ${packagePath}`);
            if (metadata.link === true) fail(`Linked production package is forbidden: ${packagePath}`);
            if (typeof metadata.version !== 'string' || !metadata.version) fail(`Locked version is missing: ${packagePath}`);
            if (typeof metadata.integrity !== 'string' || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(metadata.integrity)) {
                fail(`Locked sha512 integrity is missing or invalid: ${packagePath}`);
            }
            return Object.freeze({packagePath, name, version: metadata.version, integrity: metadata.integrity});
        })
        .sort((left, right) => left.packagePath.localeCompare(right.packagePath, 'en'));
    if (!packages.length) fail('The production dependency closure is empty.');
    const retained = new Set(RETAINED_PACKAGES.map(entry => entry.packagePath));
    for (const entry of packages) {
        if (retained.has(entry.packagePath)) fail(`A retained Carnival package became lock-selected: ${entry.packagePath}`);
    }
    return {lockText: lock.text, lockSha256: hashTrackedTextFile(repoRoot, 'package-lock.json'), packages};
}

function collectTree(directory, relativePrefix = '') {
    assertDirectory(directory, `Tree root ${relativePrefix || directory}`);
    const files = [];
    const pending = [{directory, relative: relativePrefix.replaceAll('\\', '/').replace(/\/$/, '')}];
    while (pending.length) {
        const current = pending.pop();
        const entries = fs.readdirSync(current.directory, {withFileTypes: true})
            .sort((left, right) => right.name.localeCompare(left.name, 'en'));
        for (const entry of entries) {
            const absolute = path.join(current.directory, entry.name);
            const relative = current.relative ? `${current.relative}/${entry.name}` : entry.name;
            const stat = fs.lstatSync(absolute);
            if (stat.isSymbolicLink()) fail(`Dependency tree contains a symlink or junction: ${relative}`);
            const real = fs.realpathSync.native(absolute);
            if (normalizedPath(real) !== normalizedPath(absolute)) fail(`Dependency tree contains a reparse redirect: ${relative}`);
            if (stat.isDirectory()) {
                pending.push({directory: absolute, relative});
            } else if (stat.isFile()) {
                if (entry.name.toLowerCase().endsWith('.node')) fail(`Runtime dependency closure contains a native addon: ${relative}`);
                const content = fs.readFileSync(absolute);
                files.push({path: relative.replaceAll('\\', '/'), size: content.length, sha256: sha256(content)});
            } else {
                fail(`Dependency tree contains an unsupported filesystem entry: ${relative}`);
            }
        }
    }
    files.sort((left, right) => left.path.localeCompare(right.path, 'en'));
    return files;
}

function treeIdentity(files) {
    const canonical = files.map(entry => `${entry.path}\0${entry.size}\0${entry.sha256}\n`).join('');
    return {fileCount: files.length, treeSha256: sha256(Buffer.from(canonical)), files};
}

function sameFiles(actual, expected, label) {
    if (actual.length !== expected.length) fail(`${label} file count mismatch: expected ${expected.length}, got ${actual.length}.`);
    for (let index = 0; index < expected.length; index += 1) {
        const left = actual[index];
        const right = expected[index];
        if (left.path !== right.path || left.size !== right.size || left.sha256 !== right.sha256) {
            fail(`${label} mismatch at ${right.path || left.path}.`);
        }
    }
}

function validatePackageIdentity(projectRoot, packageEntry, label) {
    const packageRoot = path.join(projectRoot, ...packageEntry.packagePath.split('/'));
    assertPhysicalPath(projectRoot, packageRoot, `${label} package root ${packageEntry.name}`);
    const manifest = readJson(path.join(packageRoot, 'package.json'), `${label} package manifest ${packageEntry.name}`).value;
    if (manifest.name !== packageEntry.name || manifest.version !== packageEntry.version) {
        fail(`${label} package identity mismatch for ${packageEntry.packagePath}: expected ${packageEntry.name}@${packageEntry.version}.`);
    }
    return packageRoot;
}

function collectSelected(projectRoot, selectedPackages, label) {
    const files = [];
    for (const entry of selectedPackages) {
        const packageRoot = validatePackageIdentity(projectRoot, entry, label);
        files.push(...collectTree(packageRoot, entry.packagePath));
    }
    files.sort((left, right) => left.path.localeCompare(right.path, 'en'));
    const seen = new Set();
    for (const file of files) {
        if (seen.has(file.path)) fail(`${label} selected dependency paths overlap: ${file.path}`);
        seen.add(file.path);
    }
    return files;
}

function retainedTopLevelPackages() {
    return RETAINED_PACKAGES.filter(candidate => !RETAINED_PACKAGES.some(other =>
        candidate !== other && candidate.packagePath.startsWith(`${other.packagePath}/`)));
}

function validateRetainedPackageIdentities(projectRoot, label) {
    for (const entry of RETAINED_PACKAGES) {
        validatePackageIdentity(projectRoot, {...entry, name: packageNameFromPath(entry.packagePath)}, label);
    }
}

function collectRetained(projectRoot, label) {
    validateRetainedPackageIdentities(projectRoot, label);
    const files = [];
    for (const entry of retainedTopLevelPackages()) {
        files.push(...collectTree(path.join(projectRoot, ...entry.packagePath.split('/')), entry.packagePath));
    }
    files.sort((left, right) => left.path.localeCompare(right.path, 'en'));
    return files;
}

function loadManifestRetained(repoRoot) {
    const relativeManifest = 'vendor/runtime-manifest.json';
    const manifest = readJson(path.join(repoRoot, relativeManifest), 'Committed Carnival runtime manifest').value;
    if (!Array.isArray(manifest.files)) fail('Committed Carnival runtime manifest files are unavailable.');
    const roots = retainedTopLevelPackages().map(entry => `electronapp/${entry.packagePath}`);
    const files = manifest.files
        .filter(entry => typeof entry?.path === 'string' && roots.some(root => entry.path.startsWith(`${root}/`)))
        .map(entry => {
            if (!Number.isSafeInteger(entry.size) || entry.size < 0 || typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(entry.sha256)) {
                fail(`Committed Carnival dependency manifest entry is invalid: ${entry.path}`);
            }
            return {
                path: entry.path.slice('electronapp/'.length),
                size: entry.size,
                sha256: entry.sha256.toLowerCase()
            };
        })
        .sort((left, right) => left.path.localeCompare(right.path, 'en'));
    if (!files.length) fail('Committed Carnival dependency manifest has no retained package files.');
    return {
        manifestSha256: hashTrackedTextFile(repoRoot, relativeManifest),
        files
    };
}

function verifiedRetained(repoRoot, vendorProject) {
    const manifest = loadManifestRetained(repoRoot);
    const vendorFiles = collectRetained(vendorProject, 'Carnival dependency source');
    sameFiles(vendorFiles, manifest.files, 'Carnival dependency source versus committed manifest');
    return {manifestSha256: manifest.manifestSha256, files: vendorFiles};
}

function pathBelongsTo(filePath, packagePath) {
    return filePath.startsWith(`${packagePath}/`);
}

function validateInitialRuntime(runtimeRoot, selectedPackages, expectedRetained) {
    const nodeModules = path.join(runtimeRoot, 'electronapp', 'node_modules');
    assertPhysicalPath(runtimeRoot, nodeModules, 'Runtime node_modules');
    const files = collectTree(nodeModules, 'node_modules');
    const retainedRoots = retainedTopLevelPackages();
    const allowedRoots = [...selectedPackages.map(entry => entry.packagePath), ...retainedRoots.map(entry => entry.packagePath)];
    const unexpected = files.find(file => !allowedRoots.some(packagePath => pathBelongsTo(file.path, packagePath)));
    if (unexpected) fail(`Initial runtime contains an unowned dependency file: ${unexpected.path}`);
    const retained = files.filter(file => retainedRoots.some(entry => pathBelongsTo(file.path, entry.packagePath)));
    sameFiles(retained, expectedRetained, 'Inherited Carnival dependency bytes');
}

function createOwner(repoRoot, runtimeRoot, sourceCommit) {
    const {root, runtime} = assertRepoLayout(repoRoot, runtimeRoot);
    if (!/^[0-9a-f]{40}$/i.test(sourceCommit || '')) fail('Source commit must be a full 40-character Git object id.');
    if (fs.readdirSync(runtime).length !== 0) fail('Runtime root must be empty before ownership is created.');
    const token = crypto.randomBytes(32).toString('hex');
    const owner = {
        schemaVersion: SCHEMA_VERSION,
        contract: CONTRACT_NAME,
        sourceCommit: sourceCommit.toLowerCase(),
        repoRootSha256: sha256(Buffer.from(normalizedPath(root))),
        runtimeRootSha256: sha256(Buffer.from(normalizedPath(runtime))),
        tokenSha256: sha256(Buffer.from(token))
    };
    fs.writeFileSync(path.join(runtime, OWNER_FILE), `${JSON.stringify(owner, null, 2)}\n`, {encoding: 'utf8', flag: 'wx', mode: 0o600});
    return token;
}

function loadOwner(repoRoot, runtimeRoot, token) {
    if (!/^[0-9a-f]{64}$/i.test(token || '')) fail('Build ownership token is invalid.');
    const marker = path.join(runtimeRoot, OWNER_FILE);
    const stat = fs.lstatSync(marker);
    if (!stat.isFile() || stat.isSymbolicLink()) fail('Build ownership marker must be a physical file.');
    const owner = readJson(marker, 'Build ownership marker').value;
    if (owner.schemaVersion !== SCHEMA_VERSION || owner.contract !== CONTRACT_NAME ||
        !/^[0-9a-f]{40}$/.test(owner.sourceCommit || '') ||
        owner.repoRootSha256 !== sha256(Buffer.from(normalizedPath(repoRoot))) ||
        owner.runtimeRootSha256 !== sha256(Buffer.from(normalizedPath(runtimeRoot))) ||
        owner.tokenSha256 !== sha256(Buffer.from(token.toLowerCase()))) {
        fail('Build ownership marker does not match this repository, runtime, and token.');
    }
    return owner;
}

function assertSourceProject(repoRoot, sourceProjectRoot) {
    if (!fs.readFileSync(path.join(repoRoot, 'package.json')).equals(fs.readFileSync(path.join(sourceProjectRoot, 'package.json')))) {
        fail('Source project package.json does not match the gated repository input.');
    }
    if (!fs.readFileSync(path.join(repoRoot, 'package-lock.json')).equals(fs.readFileSync(path.join(sourceProjectRoot, 'package-lock.json')))) {
        fail('Source project package-lock.json does not match the gated repository input.');
    }
}

function combineFiles(selected, retained) {
    const files = [...selected, ...retained].sort((left, right) => left.path.localeCompare(right.path, 'en'));
    const seen = new Set();
    for (const file of files) {
        if (seen.has(file.path)) fail(`Selected and retained dependency paths overlap: ${file.path}`);
        seen.add(file.path);
    }
    return files;
}

function writeProvenance(runtimeRoot, record) {
    const target = path.join(runtimeRoot, PROVENANCE_FILE);
    if (fs.existsSync(target)) fail(`Dependency provenance already exists: ${PROVENANCE_FILE}`);
    const temporary = path.join(runtimeRoot, `.${PROVENANCE_FILE}.${process.pid}.tmp`);
    fs.writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, {encoding: 'utf8', flag: 'wx'});
    fs.renameSync(temporary, target);
}

function copyRuntimeDependencies(repoRoot, runtimeRoot, sourceProjectRoot, token) {
    const {root, runtime} = assertRepoLayout(repoRoot, runtimeRoot, sourceProjectRoot);
    const source = path.resolve(sourceProjectRoot);
    const owner = loadOwner(root, runtime, token);
    assertSourceProject(root, source);
    const selectedContract = loadSelectedPackages(root);
    const sourceSelected = collectSelected(source, selectedContract.packages, 'Fresh npm source');
    const vendorProject = path.join(root, 'vendor', 'carnival', 'electronapp');
    assertPhysicalPath(root, vendorProject, 'Carnival dependency source');
    const retainedContract = verifiedRetained(root, vendorProject);
    const retained = retainedContract.files;
    validateInitialRuntime(runtime, selectedContract.packages, retained);

    const runtimeNodeModules = path.join(runtime, 'electronapp', 'node_modules');
    for (const entry of selectedContract.packages) {
        const target = path.join(runtime, 'electronapp', ...entry.packagePath.split('/'));
        if (!isDescendant(runtimeNodeModules, target)) fail(`Selected dependency target escaped node_modules: ${entry.packagePath}`);
        if (fs.existsSync(target)) {
            assertPhysicalPath(runtimeNodeModules, target, `Selected dependency target ${entry.packagePath}`);
            fs.rmSync(target, {recursive: true, force: false});
        } else {
            assertPhysicalAncestors(runtimeNodeModules, path.dirname(target), `Selected dependency parent ${entry.packagePath}`);
        }
    }
    for (const entry of selectedContract.packages) {
        const sourcePackage = path.join(source, ...entry.packagePath.split('/'));
        const target = path.join(runtime, 'electronapp', ...entry.packagePath.split('/'));
        fs.mkdirSync(path.dirname(target), {recursive: true});
        fs.cpSync(sourcePackage, target, {recursive: true, force: false, errorOnExist: true});
    }

    const runtimeSelected = collectSelected(path.join(runtime, 'electronapp'), selectedContract.packages, 'Runtime');
    sameFiles(runtimeSelected, sourceSelected, 'Fresh npm source to runtime dependency copy');
    const runtimeRetained = collectRetained(path.join(runtime, 'electronapp'), 'Runtime retained dependency');
    sameFiles(runtimeRetained, retained, 'Runtime retained Carnival dependency bytes');
    const combined = combineFiles(runtimeSelected, runtimeRetained);
    sameFiles(collectTree(runtimeNodeModules, 'node_modules'), combined, 'Final runtime dependency closure');

    const selectedIdentity = treeIdentity(runtimeSelected);
    const retainedIdentity = treeIdentity(runtimeRetained);
    const combinedIdentity = treeIdentity(combined);
    const record = {
        schemaVersion: SCHEMA_VERSION,
        contract: CONTRACT_NAME,
        sourceCommit: owner.sourceCommit,
        installContract: {
            command: 'npm ci --ignore-scripts --omit=dev --no-audit --no-fund',
            packageJsonSha256: hashTrackedTextFile(root, 'package.json'),
            packageLockSha256: selectedContract.lockSha256,
            carnivalManifestSha256: retainedContract.manifestSha256
        },
        selectedPackages: selectedContract.packages,
        retainedPackages: RETAINED_PACKAGES,
        selected: {...selectedIdentity, sourceTreeSha256: treeIdentity(sourceSelected).treeSha256},
        retained: retainedIdentity,
        combined: combinedIdentity
    };
    writeProvenance(runtime, record);
    inspectRuntime(root, runtime, owner.sourceCommit);
    fs.unlinkSync(path.join(runtime, OWNER_FILE));
    return {
        sourceCommit: record.sourceCommit,
        packageCount: record.selectedPackages.length,
        selectedFileCount: record.selected.fileCount,
        selectedTreeSha256: record.selected.treeSha256,
        retainedPackageCount: record.retainedPackages.length,
        retainedFileCount: record.retained.fileCount,
        retainedTreeSha256: record.retained.treeSha256,
        combinedFileCount: record.combined.fileCount,
        combinedTreeSha256: record.combined.treeSha256,
        provenance: PROVENANCE_FILE
    };
}

function inspectRuntime(repoRoot, runtimeRoot, expectedSourceCommit) {
    const {root, runtime} = assertRepoLayout(repoRoot, runtimeRoot);
    if (!/^[0-9a-f]{40}$/i.test(expectedSourceCommit || '')) fail('Expected source commit must be a full 40-character Git object id.');
    const record = readJson(path.join(runtime, PROVENANCE_FILE), 'Runtime dependency provenance').value;
    if (record.schemaVersion !== SCHEMA_VERSION || record.contract !== CONTRACT_NAME || !/^[0-9a-f]{40}$/.test(record.sourceCommit || '')) {
        fail('Runtime dependency provenance identity is invalid.');
    }
    if (record.sourceCommit !== expectedSourceCommit.toLowerCase()) fail('Runtime dependency provenance source commit mismatch.');
    const selectedContract = loadSelectedPackages(root);
    if (record.installContract?.packageLockSha256 !== selectedContract.lockSha256 ||
        record.installContract?.packageJsonSha256 !== hashTrackedTextFile(root, 'package.json')) {
        fail('Runtime dependency provenance is not bound to the current package inputs.');
    }
    if (JSON.stringify(record.selectedPackages) !== JSON.stringify(selectedContract.packages) ||
        JSON.stringify(record.retainedPackages) !== JSON.stringify(RETAINED_PACKAGES)) {
        fail('Runtime dependency package contract mismatch.');
    }
    const vendorProject = path.join(root, 'vendor', 'carnival', 'electronapp');
    const retainedContract = verifiedRetained(root, vendorProject);
    const expectedRetained = retainedContract.files;
    if (record.installContract?.carnivalManifestSha256 !== retainedContract.manifestSha256) {
        fail('Runtime dependency provenance is not bound to the committed Carnival manifest.');
    }
    sameFiles(record.retained.files, expectedRetained, 'Recorded retained Carnival dependency bytes');
    if (record.retained.treeSha256 !== treeIdentity(expectedRetained).treeSha256) fail('Recorded retained tree identity mismatch.');

    const runtimeProject = path.join(runtime, 'electronapp');
    const runtimeSelected = collectSelected(runtimeProject, selectedContract.packages, 'Runtime');
    const runtimeRetained = collectRetained(runtimeProject, 'Runtime retained dependency');
    sameFiles(runtimeSelected, record.selected.files, 'Runtime selected dependency provenance');
    sameFiles(runtimeRetained, expectedRetained, 'Runtime retained dependency provenance');
    if (record.selected.sourceTreeSha256 !== record.selected.treeSha256 ||
        record.selected.treeSha256 !== treeIdentity(runtimeSelected).treeSha256) {
        fail('Selected source/runtime tree identity mismatch.');
    }
    const combined = combineFiles(runtimeSelected, runtimeRetained);
    sameFiles(collectTree(path.join(runtimeProject, 'node_modules'), 'node_modules'), combined, 'Runtime exact dependency closure');
    sameFiles(record.combined.files, combined, 'Recorded combined dependency closure');
    if (record.combined.treeSha256 !== treeIdentity(combined).treeSha256) fail('Combined dependency tree identity mismatch.');
    return {
        valid: true,
        sourceCommit: record.sourceCommit,
        packageCount: selectedContract.packages.length,
        selectedFileCount: runtimeSelected.length,
        selectedTreeSha256: record.selected.treeSha256,
        retainedPackageCount: RETAINED_PACKAGES.length,
        retainedFileCount: runtimeRetained.length,
        retainedTreeSha256: record.retained.treeSha256,
        combinedFileCount: combined.length,
        combinedTreeSha256: record.combined.treeSha256,
        provenance: PROVENANCE_FILE
    };
}

function usage() {
    return [
        'Usage:',
        '  node tools/copy-runtime-dependencies.cjs create-owner <repoRoot> <runtimeRoot> <sourceCommit>',
        '  node tools/copy-runtime-dependencies.cjs copy <repoRoot> <runtimeRoot> <sourceProjectRoot> <token>',
        '  node tools/copy-runtime-dependencies.cjs validate <repoRoot> <runtimeRoot> <sourceCommit>'
    ].join('\n');
}

function main(args) {
    try {
        const command = args[0];
        if (command === 'create-owner' && args.length === 4) {
            process.stdout.write(`${createOwner(args[1], args[2], args[3])}\n`);
            return;
        }
        if (command === 'copy' && args.length === 5) {
            process.stdout.write(`${JSON.stringify(copyRuntimeDependencies(args[1], args[2], args[3], args[4]))}\n`);
            return;
        }
        if (command === 'validate' && args.length === 4) {
            process.stdout.write(`${JSON.stringify(inspectRuntime(args[1], args[2], args[3]))}\n`);
            return;
        }
        fail(usage());
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports = {
    CONTRACT_NAME,
    OWNER_FILE,
    PROVENANCE_FILE,
    RETAINED_PACKAGES,
    collectTree,
    copyRuntimeDependencies,
    createOwner,
    inspectRuntime,
    loadSelectedPackages,
    main,
    treeIdentity
};
