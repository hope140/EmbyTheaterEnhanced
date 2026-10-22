'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {hashTrackedTextFile} = require('./tracked-file-hash.cjs');
const inheritedNpm = require('./inherited-npm-input.cjs');

const OWNER_FILE = '.ete-build-owner.json';
const PROVENANCE_FILE = 'runtime-dependencies.json';
const CONTRACT_NAME = 'ete-runtime-dependencies';
const SCHEMA_VERSION = 1;
const NPM_PROJECTION_VERSIONS = Object.freeze({'@grpc/grpc-js': '1.14.6', protobufjs: '7.6.6'});
// Only the reviewed runtime projection; locked npm inputs and their notices remain complete.
const NPM_PROJECTION_EXCLUSIONS = Object.freeze([
    {
        "path": "node_modules/@grpc/grpc-js/build/src/generated/grpc/channelz/v1/ChannelConnectivityState.js",
        "sha256": "40330f4b4f43d9c8226138ceb5747e4227573a061951e013792e418eccdb697f",
        "size": 500
    },
    {
        "path": "node_modules/@grpc/grpc-js/build/src/generated/grpc/channelz/v1/ChannelTraceEvent.js",
        "sha256": "9acf1a3c25c4020035b5dfabc8c3e87ad5a18eb59d1e92ff6cb1bb120a18dc42",
        "size": 491
    },
    {
        "path": "node_modules/@grpc/grpc-js/build/src/generated/google/protobuf/Edition.js",
        "sha256": "4d93fbe9063d4ec4092d6166ca6244d713898e7c6ed84ba011c945c41d42e865",
        "size": 702
    },
    {
        "path": "node_modules/@grpc/grpc-js/build/src/generated/google/protobuf/ExtensionRangeOptions.js",
        "sha256": "e4661934504f1ad2ed8409ae232d2ad80bc8fdf907aae5679c6fea6c6a8a16fc",
        "size": 381
    },
    {
        "path": "node_modules/@grpc/grpc-js/build/src/generated/google/protobuf/FeatureSet.js",
        "sha256": "f44d2b106c7aa7244c1ede455298e962b6ee7b10103a582845ce9852dea415e8",
        "size": 2286
    },
    {
        "path": "node_modules/@grpc/grpc-js/build/src/generated/google/protobuf/FieldDescriptorProto.js",
        "sha256": "e4b7b5ed298f5f7d0ecf7adc128c04e649a10c057ac9901b0bb0b885e3691009",
        "size": 1112
    },
    {
        "path": "node_modules/@grpc/grpc-js/build/src/generated/google/protobuf/FieldOptions.js",
        "sha256": "924d8839d8ed33509c97ad6f3a1803bf93c5369544f0e66ae7f318df4cbbce6c",
        "size": 1440
    },
    {
        "path": "node_modules/@grpc/grpc-js/build/src/generated/google/protobuf/FileOptions.js",
        "sha256": "ab18461b202bbec5bcb84be613eadeadafad0a309075a9db5bfd9ded9dac9d13",
        "size": 361
    },
    {
        "path": "node_modules/@grpc/grpc-js/build/src/generated/google/protobuf/GeneratedCodeInfo.js",
        "sha256": "6c7aa0f0f35e7085e3e3ae68a951545813bd01b583a7685ffe26b3bc6c463b63",
        "size": 365
    },
    {
        "path": "node_modules/@grpc/grpc-js/build/src/generated/validate/KnownRegex.js",
        "sha256": "f5ba1f1a9f409dcb34650413bc2bb0619eefd330a68b35a253d3a8800477d06a",
        "size": 537
    },
    {
        "path": "node_modules/@grpc/grpc-js/build/src/generated/google/protobuf/MethodOptions.js",
        "sha256": "54951b483d4446908f8b164dea0a655d05b73deb690c6989ef5ecc720a77ddd6",
        "size": 411
    },
    {
        "path": "node_modules/@grpc/grpc-js/build/src/generated/google/protobuf/SymbolVisibility.js",
        "sha256": "911ba4b19f8e068695af1fd827948277f04f1ee8236465a82aaf85ab3f493a14",
        "size": 339
    },
    {
        "path": "node_modules/protobufjs/google/api/annotations.json",
        "sha256": "87bbf6275532afc56ed997cab8399c38a138ae7d65e7e88e1ab6686f728eee3e",
        "size": 1987
    },
    {
        "path": "node_modules/protobufjs/google/api/http.json",
        "sha256": "170d4e8c54a54f14b209e612473a8d15468d114f7f7d8e779b93ef3503bb293d",
        "size": 2087
    },
    {
        "path": "node_modules/protobufjs/google/api/annotations.proto",
        "sha256": "e6b649083c6b414b2368a1562308f0a9fdaa71e8f932a6b32efc623fdef3a6c7",
        "size": 188
    },
    {
        "path": "node_modules/protobufjs/google/protobuf/api.proto",
        "sha256": "d706f909f2f115f4a18c6e64e38dd6c98ad647dba70c7a88f35e0b28414dab83",
        "size": 642
    },
    {
        "path": "node_modules/protobufjs/google/protobuf/descriptor.proto",
        "sha256": "e79074e7bddefd24d589baef2627c9d039b807933ca0c1fb37e8fffc63df0e1c",
        "size": 14464
    },
    {
        "path": "node_modules/protobufjs/google/api/http.proto",
        "sha256": "f052d98111aec06cd47c4082a9265cb05f51a94bb1553229d299f99ac8ba4e8b",
        "size": 474
    },
    {
        "path": "node_modules/protobufjs/google/protobuf/source_context.proto",
        "sha256": "992d3a7a0e8f79ccd4dc8da161376219aa7294408386fa6d65e130a45d31bff8",
        "size": 98
    },
    {
        "path": "node_modules/protobufjs/google/protobuf/type.proto",
        "sha256": "8bb73f0bb286c2725880abe204e2a5168b084fcf851eb493c5ee90a85f270abd",
        "size": 1675
    }
].map(Object.freeze));

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
    return {fileCount: files.length, bytes: files.reduce((sum, file) => sum + file.size, 0), treeSha256: sha256(Buffer.from(canonical)), files};
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
    const manifest=inheritedNpm.load(repoRoot);
    const roots=retainedTopLevelPackages().map(entry=>'electronapp/'+entry.packagePath);
    if(manifest.files.some(entry=>!roots.some(root=>entry.path.startsWith(root+'/'))))fail('Inherited npm manifest contains an unexpected retained package.');
    const files=manifest.files.map(entry=>({path:entry.path.slice('electronapp/'.length),size:entry.size,sha256:entry.sha256}))
        .sort((left,right)=>left.path.localeCompare(right.path,'en'));
    return {manifestSha256:hashTrackedTextFile(repoRoot,inheritedNpm.MANIFEST_PATH),files};
}

function verifiedRetained(repoRoot, vendorProject) {
    inheritedNpm.validate(repoRoot);
    const manifest = loadManifestRetained(repoRoot);
    const vendorFiles = collectRetained(vendorProject, 'Official inherited dependency source');
    sameFiles(vendorFiles, manifest.files, 'Inherited dependency source versus committed manifest');
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

function projectNpmFiles(sourceFiles, selectedPackages) {
    const selected = new Map(selectedPackages.map(entry => [entry.name, entry.version]));
    // Generic fixture/tool projects without either package have no applicable projection.
    if (!Object.keys(NPM_PROJECTION_VERSIONS).some(name => selected.has(name))) {
        return {files: sourceFiles, excludedFiles: []};
    }
    for (const [name, version] of Object.entries(NPM_PROJECTION_VERSIONS)) {
        if (selected.get(name) !== version) fail('Unreviewed npm projection package version: ' + name);
    }
    const byPath = new Map(sourceFiles.map(file => [file.path, file]));
    if (byPath.size !== sourceFiles.length) fail('Duplicate npm projection source path.');
    const excludedFiles = NPM_PROJECTION_EXCLUSIONS.map(expected => {
        const entry = byPath.get(expected.path);
        if (!entry || entry.size !== expected.size || entry.sha256 !== expected.sha256) fail('Npm projection identity mismatch: ' + expected.path);
        return entry;
    }).sort((left, right) => left.path.localeCompare(right.path, 'en'));
    const excluded = new Set(excludedFiles.map(entry => entry.path));
    return {files: sourceFiles.filter(entry => !excluded.has(entry.path)), excludedFiles};
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
    const projection = projectNpmFiles(sourceSelected, selectedContract.packages);
    const excluded = new Set(projection.excludedFiles.map(entry => entry.path));
    const vendorProject = path.join(root, inheritedNpm.INPUT_ROOT, 'electronapp');
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
        fs.cpSync(sourcePackage, target, {recursive: true, force: false, errorOnExist: true,
            filter: file => !excluded.has(path.relative(source, file).split(path.sep).join('/'))});
    }

    const runtimeSelected = collectSelected(path.join(runtime, 'electronapp'), selectedContract.packages, 'Runtime');
    sameFiles(collectSelected(source, selectedContract.packages, 'Fresh npm source after copy'), sourceSelected,
        'Fresh npm source changed during dependency copy');
    sameFiles(runtimeSelected, projection.files, 'Fresh npm source to runtime dependency projection');
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
            inheritedNpmManifestSha256: retainedContract.manifestSha256
        },
        selectedPackages: selectedContract.packages,
        retainedPackages: RETAINED_PACKAGES,
        selected: {...selectedIdentity, sourceTreeSha256: treeIdentity(sourceSelected).treeSha256,
            sourceFileCount: sourceSelected.length, sourceBytes: sourceSelected.reduce((sum, file) => sum + file.size, 0),
            excludedFiles: projection.excludedFiles},
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
        sourceSelectedFileCount: record.selected.sourceFileCount,
        sourceSelectedTreeSha256: record.selected.sourceTreeSha256,
        excludedFileCount: record.selected.excludedFiles.length,
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
    const vendorProject = path.join(root, inheritedNpm.INPUT_ROOT, 'electronapp');
    const retainedContract = verifiedRetained(root, vendorProject);
    const expectedRetained = retainedContract.files;
    if (record.installContract?.inheritedNpmManifestSha256 !== retainedContract.manifestSha256) {
        fail('Runtime dependency provenance is not bound to the committed inherited npm manifest.');
    }
    sameFiles(record.retained.files, expectedRetained, 'Recorded retained Carnival dependency bytes');
    if (record.retained.treeSha256 !== treeIdentity(expectedRetained).treeSha256) fail('Recorded retained tree identity mismatch.');

    const runtimeProject = path.join(runtime, 'electronapp');
    const runtimeSelected = collectSelected(runtimeProject, selectedContract.packages, 'Runtime');
    const runtimeRetained = collectRetained(runtimeProject, 'Runtime retained dependency');
    sameFiles(runtimeSelected, record.selected.files, 'Runtime selected dependency provenance');
    sameFiles(runtimeRetained, expectedRetained, 'Runtime retained dependency provenance');
    const sourceFiles = combineFiles(record.selected.files, record.selected.excludedFiles || []);
    const sourceIdentity = treeIdentity(sourceFiles);
    const projection = projectNpmFiles(sourceFiles, selectedContract.packages);
    sameFiles(projection.files, runtimeSelected, 'Selected source/runtime projection');
    sameFiles(projection.excludedFiles, record.selected.excludedFiles || [], 'Selected exact projection exclusions');
    if (record.selected.sourceTreeSha256 !== sourceIdentity.treeSha256 ||
        record.selected.sourceFileCount !== sourceIdentity.fileCount || record.selected.sourceBytes !== sourceIdentity.bytes ||
        record.selected.fileCount !== runtimeSelected.length || record.selected.bytes !== treeIdentity(runtimeSelected).bytes ||
        record.selected.treeSha256 !== treeIdentity(runtimeSelected).treeSha256) fail('Selected source/runtime tree identity mismatch.');
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
        sourceSelectedFileCount: record.selected.sourceFileCount,
        sourceSelectedTreeSha256: record.selected.sourceTreeSha256,
        excludedFileCount: record.selected.excludedFiles.length,
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
    NPM_PROJECTION_EXCLUSIONS,
    NPM_PROJECTION_VERSIONS,
    projectNpmFiles,
    assertRepoLayout,
    loadOwner,
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
