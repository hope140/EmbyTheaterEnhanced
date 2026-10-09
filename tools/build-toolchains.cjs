'use strict';

const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LOCK_PATH = 'tools/build-toolchains.lock.json';
const TREE_IDENTITY_ALGORITHM = 'sha256(sorted(relativePath + NUL + uppercase(fileSha256) + LF))';

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex').toLowerCase();
}

function canonicalText(value) {
    return value.toString('utf8').replace(/\r\n/g, '\n');
}

function slash(value) {
    return value.split(path.sep).join('/');
}

function isSafeRepoPath(value) {
    return typeof value === 'string' && value.length > 0 && !path.isAbsolute(value) &&
        !value.includes('\\') && !value.startsWith('/') &&
        value.split('/').every(part => part && part !== '.' && part !== '..');
}

function safeRepoFile(root, repoPath, label) {
    if (!isSafeRepoPath(repoPath)) throw new Error(label + ' path is invalid.');
    const file = path.join(root, ...repoPath.split('/'));
    rejectLinkSegments(root, file, label);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(label + ' is missing.');
    return file;
}

function rejectLinkSegments(root, target, label) {
    const relative = path.relative(root, target);
    if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
        if (relative) throw new Error(label + ' path escapes the repository.');
        return;
    }
    let current = root;
    for (const part of relative.split(path.sep)) {
        current = path.join(current, part);
        if (!fs.existsSync(current)) return;
        if (fs.lstatSync(current).isSymbolicLink()) throw new Error(label + ' path contains a link.');
    }
}

function readJson(file, label) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        throw new Error(label + ' is invalid.');
    }
}

function readLock(rootArg) {
    const root = path.resolve(rootArg);
    const lockFile = safeRepoFile(root, LOCK_PATH, 'Build toolchain lock');
    assertMatchesHead(root, LOCK_PATH, lockFile, 'Build toolchain lock');
    const lock = readJson(lockFile, 'Build toolchain lock');
    if (lock.schemaVersion !== 1 || lock.treeIdentityAlgorithm !== TREE_IDENTITY_ALGORITHM ||
        !lock.authority || !lock.native || !lock.inno) {
        throw new Error('Build toolchain lock schema is invalid.');
    }
    return lock;
}

function walkFiles(directory) {
    if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
        throw new Error('Toolchain tree is missing.');
    }
    const files = [];
    const pending = [directory];
    while (pending.length) {
        const current = pending.pop();
        for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
            const child = path.join(current, entry.name);
            if (entry.isDirectory()) pending.push(child);
            else if (entry.isFile()) files.push(child);
            else throw new Error('Toolchain tree contains an unsupported entry type.');
        }
    }
    return files.sort((a, b) => slash(path.relative(directory, a)).localeCompare(slash(path.relative(directory, b))));
}

function treeIdentity(directoryArg) {
    const directory = path.resolve(directoryArg);
    const entries = walkFiles(directory).map(file => {
        const bytes = fs.readFileSync(file);
        return {path: slash(path.relative(directory, file)), size: bytes.length, sha256: sha256(bytes)};
    });
    const input = entries.map(entry => entry.path + '\0' + entry.sha256.toUpperCase() + '\n').join('');
    return {
        fileCount: entries.length,
        bytes: entries.reduce((total, entry) => total + entry.size, 0),
        sha256: sha256(Buffer.from(input, 'utf8')),
        entries
    };
}

function samePath(left, right) {
    const a = path.resolve(left);
    const b = path.resolve(right);
    return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function expectedDirectory(root, repoPath, label) {
    if (!isSafeRepoPath(repoPath)) throw new Error(label + ' path is invalid.');
    const directory = path.join(root, ...repoPath.split('/'));
    rejectLinkSegments(root, directory, label);
    if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) throw new Error(label + ' is missing.');
    return directory;
}

function expectedExecutable(rootDirectory, relativePath, suppliedPath, label) {
    if (!isSafeRepoPath(relativePath) || relativePath.includes('/../')) throw new Error(label + ' path is invalid.');
    const expected = path.join(rootDirectory, ...relativePath.split('/'));
    if (!samePath(expected, suppliedPath)) throw new Error(label + ' must use the project-local locked path.');
    if (!fs.existsSync(expected) || !fs.statSync(expected).isFile()) throw new Error(label + ' is missing.');
    return expected;
}

function checkFileIdentity(file, expected, label) {
    const bytes = fs.readFileSync(file);
    if (!expected || bytes.length !== expected.size || sha256(bytes) !== expected.sha256) {
        throw new Error(label + ' identity mismatch.');
    }
    return {size: bytes.length, sha256: expected.sha256};
}

function checkTreeIdentity(directory, expected, label) {
    const actual = treeIdentity(directory);
    if (!expected || actual.fileCount !== expected.fileCount || actual.bytes !== expected.bytes ||
        actual.sha256 !== expected.sha256) {
        throw new Error(label + ' tree identity mismatch.');
    }
    return {fileCount: actual.fileCount, bytes: actual.bytes, sha256: actual.sha256};
}

function git(root, args, label, encoding = null) {
    const result = childProcess.spawnSync('git', ['-C', root, ...args], {
        encoding,
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true
    });
    if (result.error || result.status !== 0) throw new Error(label + ' Git authority is unavailable.');
    return result.stdout;
}

function assertMatchesHead(root, repoPath, worktreeFile, label) {
    const treeEntry = git(root, ['ls-tree', 'HEAD', '--', repoPath], label, 'utf8').trim();
    if (!/^100\d{3}\s+blob\s+[0-9a-f]{40}\t/.test(treeEntry)) throw new Error(label + ' is not a regular HEAD blob.');
    const committed = git(root, ['show', 'HEAD:' + repoPath], label);
    if (canonicalText(fs.readFileSync(worktreeFile)) !== canonicalText(committed)) {
        throw new Error(label + ' differs from HEAD.');
    }
}

function inspectAuthority(root, expected, label) {
    if (!expected || !isSafeRepoPath(expected.path) || !/^[0-9a-f]{40}$/.test(expected.gitBlobObjectId || '') ||
        !/^[0-9a-f]{64}$/.test(expected.canonicalTextSha256 || '')) {
        throw new Error(label + ' authority lock is invalid.');
    }
    const file = safeRepoFile(root, expected.path, label);
    const committed = git(root, ['show', 'HEAD:' + expected.path], label);
    const objectId = git(root, ['rev-parse', 'HEAD:' + expected.path], label, 'utf8').trim().toLowerCase();
    if (objectId !== expected.gitBlobObjectId) throw new Error(label + ' Git blob identity mismatch.');
    const committedCanonical = canonicalText(committed);
    if (sha256(Buffer.from(committedCanonical, 'utf8')) !== expected.canonicalTextSha256) {
        throw new Error(label + ' canonical identity mismatch.');
    }
    if (canonicalText(fs.readFileSync(file)) !== committedCanonical) throw new Error(label + ' differs from HEAD.');
    return {path: expected.path, gitBlobObjectId: objectId, canonicalTextSha256: expected.canonicalTextSha256};
}

function inspectAuthorities(root, lock) {
    return {
        toolchainManifest: inspectAuthority(root, lock.authority.toolchainManifest, 'Toolchain manifest'),
        nativeHelperManifest: inspectAuthority(root, lock.authority.nativeHelperManifest, 'Native helper manifest')
    };
}

function rejectEnvironmentOverrides(names, environment, label) {
    if (!Array.isArray(names) || names.some(name => typeof name !== 'string' || !name)) {
        throw new Error(label + ' environment contract is invalid.');
    }
    const present = names.filter(name => Object.prototype.hasOwnProperty.call(environment, name) &&
        String(environment[name] || '').trim() !== '');
    if (present.length) throw new Error(label + ' environment override is set: ' + present.sort().join(','));
}

function validateManifestRelations(root, lock) {
    const toolchain = readJson(safeRepoFile(root, lock.authority.toolchainManifest.path, 'Toolchain manifest'), 'Toolchain manifest');
    const native = readJson(safeRepoFile(root, lock.authority.nativeHelperManifest.path, 'Native helper manifest'), 'Native helper manifest');
    if (!toolchain.inno || toolchain.inno.version !== lock.inno.version ||
        toolchain.inno.sha256 !== lock.inno.archive.sha256 || !toolchain.unpacker ||
        toolchain.unpacker.sha256 !== lock.inno.unpackerArchive.sha256) {
        throw new Error('Inno lock differs from vendor authority.');
    }
    if (!native.compiler || native.compiler.family !== lock.native.family ||
        native.compiler.architecture !== lock.native.architecture ||
        native.compiler.version !== lock.native.compilerVersion ||
        native.compiler.sha256 !== lock.native.compilerSha256) {
        throw new Error('Native toolchain lock differs from vendor authority.');
    }
}

function compilerVersion(compiler) {
    const result = childProcess.spawnSync(compiler, ['--version'], {
        encoding: 'utf8',
        windowsHide: true,
        env: process.env,
        maxBuffer: 1024 * 1024
    });
    if (result.error || result.status !== 0) throw new Error('Native compiler version probe failed.');
    return String(result.stdout || '').split(/\r?\n/, 1)[0].trim();
}

function expectedRecord(rootArg, kind) {
    const root = path.resolve(rootArg);
    const lock = readLock(root);
    const authority = inspectAuthorities(root, lock);
    validateManifestRelations(root, lock);
    if (kind === 'native') {
        return {
            schemaVersion: 1,
            status: 'passed',
            kind: 'native',
            authority,
            compiler: {
                root: lock.native.compilerRoot,
                path: lock.native.compilerRelativePath,
                sha256: lock.native.compilerSha256,
                version: lock.native.compilerVersion
            },
            tree: {...lock.native.tree}
        };
    }
    if (kind === 'inno') {
        return {
            schemaVersion: 1,
            status: 'passed',
            kind: 'inno',
            authority,
            version: lock.inno.version,
            archive: {size: lock.inno.archive.size, sha256: lock.inno.archive.sha256, path: lock.inno.archive.relativePath},
            unpackerArchive: {
                size: lock.inno.unpackerArchive.size,
                sha256: lock.inno.unpackerArchive.sha256,
                path: lock.inno.unpackerArchive.relativePath
            },
            unpacker: {
                root: lock.inno.unpackerRoot,
                path: lock.inno.unpackerRelativePath,
                sha256: lock.inno.unpackerSha256,
                tree: {...lock.inno.unpackerTree}
            },
            compiler: {
                root: lock.inno.compilerRoot,
                path: lock.inno.compilerRelativePath,
                sha256: lock.inno.compilerSha256,
                tree: {...lock.inno.compilerTree}
            }
        };
    }
    throw new Error('Unknown build toolchain kind.');
}

function validateRecorded(rootArg, record, kind) {
    const expected = expectedRecord(rootArg, kind);
    if (!record || JSON.stringify(record) !== JSON.stringify(expected)) {
        throw new Error(kind === 'native' ? 'Recorded native toolchain identity mismatch.' : 'Recorded Inno toolchain identity mismatch.');
    }
    return expected;
}

function inspectNative(rootArg, compilerExe, options = {}) {
    const root = path.resolve(rootArg);
    const lock = readLock(root);
    const expected = expectedRecord(root, 'native');
    rejectEnvironmentOverrides(lock.native.environmentOverrides, options.environment || process.env, 'Native toolchain');
    const compilerRoot = expectedDirectory(root, lock.native.compilerRoot, 'Native toolchain');
    const compiler = expectedExecutable(compilerRoot, lock.native.compilerRelativePath, compilerExe, 'Native compiler');
    const tree = checkTreeIdentity(compilerRoot, lock.native.tree, 'Native toolchain');
    const compilerBytes = fs.readFileSync(compiler);
    if (sha256(compilerBytes) !== lock.native.compilerSha256) throw new Error('Native compiler identity mismatch.');
    const version = options.readCompilerVersion ? options.readCompilerVersion(compiler) : compilerVersion(compiler);
    if (version !== lock.native.compilerVersion) throw new Error('Native compiler version mismatch.');
    if (JSON.stringify(tree) !== JSON.stringify(expected.tree) || version !== expected.compiler.version) {
        throw new Error('Native toolchain expected record mismatch.');
    }
    return expected;
}

function inspectInno(rootArg, isccExe, options = {}) {
    const root = path.resolve(rootArg);
    const lock = readLock(root);
    const expected = expectedRecord(root, 'inno');
    rejectEnvironmentOverrides(lock.inno.environmentOverrides, options.environment || process.env, 'Inno toolchain');
    const archive = safeRepoFile(root, lock.inno.archive.relativePath, 'Inno archive');
    const unpackerArchive = safeRepoFile(root, lock.inno.unpackerArchive.relativePath, 'Inno unpacker archive');
    const unpackerRoot = expectedDirectory(root, lock.inno.unpackerRoot, 'Inno unpacker');
    const unpacker = expectedExecutable(unpackerRoot, lock.inno.unpackerRelativePath,
        path.join(unpackerRoot, ...lock.inno.unpackerRelativePath.split('/')), 'Inno unpacker');
    const compilerRoot = expectedDirectory(root, lock.inno.compilerRoot, 'Inno compiler');
    const compiler = expectedExecutable(compilerRoot, lock.inno.compilerRelativePath, isccExe, 'Inno compiler');
    const archiveIdentity = checkFileIdentity(archive, lock.inno.archive, 'Inno archive');
    const unpackerArchiveIdentity = checkFileIdentity(unpackerArchive, lock.inno.unpackerArchive, 'Inno unpacker archive');
    const unpackerTree = checkTreeIdentity(unpackerRoot, lock.inno.unpackerTree, 'Inno unpacker');
    if (sha256(fs.readFileSync(unpacker)) !== lock.inno.unpackerSha256) throw new Error('Inno unpacker identity mismatch.');
    const compilerTree = checkTreeIdentity(compilerRoot, lock.inno.compilerTree, 'Inno compiler');
    if (sha256(fs.readFileSync(compiler)) !== lock.inno.compilerSha256) throw new Error('Inno compiler identity mismatch.');
    if (JSON.stringify({...archiveIdentity, path: lock.inno.archive.relativePath}) !== JSON.stringify(expected.archive) ||
        JSON.stringify({...unpackerArchiveIdentity, path: lock.inno.unpackerArchive.relativePath}) !== JSON.stringify(expected.unpackerArchive) ||
        JSON.stringify(unpackerTree) !== JSON.stringify(expected.unpacker.tree) ||
        JSON.stringify(compilerTree) !== JSON.stringify(expected.compiler.tree)) {
        throw new Error('Inno toolchain expected record mismatch.');
    }
    return expected;
}

function runCli() {
    const [command, rootArg, executable] = process.argv.slice(2);
    if (!command || !rootArg || !executable) {
        throw new Error('Usage: build-toolchains.cjs <native|inno> <repo-root> <compiler-exe>');
    }
    const result = command === 'native' ? inspectNative(rootArg, executable) :
        command === 'inno' ? inspectInno(rootArg, executable) : null;
    if (!result) throw new Error('Unknown build toolchain command.');
    process.stdout.write(JSON.stringify(result) + '\n');
}

if (require.main === module) {
    try {
        runCli();
    } catch (error) {
        process.stderr.write('Build toolchain validation failed: ' + String(error && error.message || error) + '\n');
        process.exitCode = 1;
    }
}

module.exports = {
    LOCK_PATH,
    TREE_IDENTITY_ALGORITHM,
    expectedRecord,
    inspectInno,
    inspectNative,
    readLock,
    treeIdentity,
    validateRecorded
};
