'use strict';

// Read-only binding of a published installer and its unpacked physical runtime.
// Electron's patched fs may turn *.asar into directories; inventory must not.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const trial = require('../../src/electronapp/enhanced/shared-playback-cache/trial');

const PRODUCT_COMMIT = '958df21c1e24150464b7a50e108b9d37d9f1b148';
const PRODUCT_PATHS = ['src', 'native', 'vendor', 'installer', ':(top,glob)package*.json'];
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hashPattern = /^[a-f0-9]{64}$/i;
const commitPattern = /^[a-f0-9]{40}$/;
function fail(code, member) {
    const error = new Error('windows-contract-' + code + (member ? ':' + member : ''));
    error.code = code;
    if (member) error.member = member;
    throw error;
}
function selectPhysicalFs({electron = !!process.versions.electron, load = require} = {}) {
    if (!electron) return fs;
    try {return load('original-fs');} catch (_) {fail('physical-backend-required');}
}
function memberPath(value) {
    if (typeof value !== 'string' || !value || value.length > 4096 || /[\x00-\x1f\x7f<>:"|?*\\]/.test(value) ||
        value.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) ||
            /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) fail('member-invalid');
    return value;
}
function canonical(value) {return process.platform === 'win32' ? value.toLowerCase() : value;}
function physical(file, directory = false, io = selectPhysicalFs()) {
    if (typeof file !== 'string' || !path.isAbsolute(file) || /[\x00-\x1f]/.test(file) || /^(?:\\\\|\/\/)/.test(file)) fail('physical-path-invalid');
    const target = path.resolve(file);
    let cursor = path.parse(target).root;
    try {
        for (const part of path.relative(cursor, target).split(path.sep).filter(Boolean)) {
            cursor = path.join(cursor, part);
            const stat = io.lstatSync(cursor);
            if (stat.isSymbolicLink() || canonical(io.realpathSync(cursor)) !== canonical(cursor)) fail('physical-path-redirected');
        }
        const stat = io.lstatSync(target);
        if (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1) fail('physical-file-invalid');
    } catch (error) {if (error.code?.startsWith?.('physical-')) throw error; fail('physical-file-invalid');}
    return target;
}
function hashFile(file, io = selectPhysicalFs()) {
    const target = physical(file, false, io);
    let handle;
    try {
        const before = io.lstatSync(target);
        handle = io.openSync(target, 'r');
        const opened = io.fstatSync(handle);
        if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) fail('physical-file-changed');
        const hash = crypto.createHash('sha256'), buffer = Buffer.allocUnsafe(256 * 1024);
        let position = 0;
        while (position < opened.size) {
            const count = io.readSync(handle, buffer, 0, Math.min(buffer.length, opened.size - position), position);
            if (!count) fail('physical-file-changed');
            hash.update(buffer.subarray(0, count)); position += count;
        }
        const after = io.fstatSync(handle), current = io.lstatSync(target);
        if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs ||
            current.isSymbolicLink() || current.dev !== opened.dev || current.ino !== opened.ino || current.size !== opened.size) fail('physical-file-changed');
        return hash.digest('hex');
    } catch (error) {if (error.code?.startsWith?.('physical-')) throw error; fail('physical-read-failed');}
    finally {if (handle !== undefined) {try {io.closeSync(handle);} catch (_) {fail('physical-close-failed');}}}
}
function readJson(file, io, limit = 32 * 1024 * 1024) {
    physical(file, false, io);
    try {
        if (io.lstatSync(file).size > limit) fail('json-too-large');
        return JSON.parse(io.readFileSync(file, 'utf8'));
    } catch (_) {fail('json-invalid');}
}
function physicalInventory(runtime, io = selectPhysicalFs()) {
    runtime = physical(runtime, true, io);
    const rows = [], folded = new Set();
    function visit(relative) {
        const directory = relative ? path.join(runtime, relative) : runtime;
        for (const name of io.readdirSync(directory)) {
            const member = memberPath(relative ? relative + '/' + name : name), key = member.toLowerCase();
            if (folded.has(key)) fail('physical-member-duplicate', member);
            folded.add(key);
            const file = path.join(runtime, member), stat = io.lstatSync(file);
            if (stat.isSymbolicLink()) fail('physical-member-redirected', member);
            if (stat.isDirectory()) {physical(file, true, io); visit(member);}
            else {
                physical(file, false, io);
                rows.push({path: member, size: stat.size, sha256: hashFile(file, io)});
            }
            if (rows.length > 200000) fail('inventory-too-large');
        }
    }
    try {visit('');} catch (error) {if (typeof error.code === 'string' && !/^(?:E[A-Z]+)$/.test(error.code)) throw error; fail('inventory-failed');}
    return rows.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
const payloadSetSha256 = rows => digest(rows.map(row => row.path + '\0' + row.sha256 + '\n').join(''));
function runGit(repo, args, input) {
    const result = childProcess.spawnSync('git', ['-c', 'protocol.allow=never', '-c', 'core.fsmonitor=false', '-C', repo, ...args],
        {encoding: null, input, windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: 30000,
            env: {...process.env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0'}});
    if (result.error || result.status !== 0) fail('git-read-failed');
    return result.stdout;
}

// One local Git process; preserve all bytes and validate every returned object.
function readGitBlobBatch(repo, objectIds, {run = runGit} = {}) {
    if (!Array.isArray(objectIds) || !objectIds.length || objectIds.length > 16384 ||
        objectIds.some(id => typeof id !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(id))) fail('git-batch-invalid');
    const ids = [...new Set(objectIds)], limit = 64 * 1024 * 1024;
    const bytes = run(repo, ['cat-file', '--batch'], Buffer.from(ids.join('\n') + '\n'));
    if (!Buffer.isBuffer(bytes) || bytes.length > limit) fail('git-batch-invalid');
    const blobs = new Map(); let offset = 0;
    for (const id of ids) {
        const end = bytes.indexOf(10, offset);
        if (end < offset || end - offset > 128) fail('git-batch-invalid');
        const header = /^(?:([a-f0-9]{40}|[a-f0-9]{64})) blob (0|[1-9][0-9]{0,8})$/.exec(bytes.subarray(offset, end).toString('latin1'));
        if (!header || header[1] !== id) fail('git-batch-invalid');
        const size = Number(header[2]); offset = end + 1;
        if (size > limit || size > bytes.length - offset - 1 || bytes[offset + size] !== 10) fail('git-batch-invalid');
        const blob = bytes.subarray(offset, offset + size); offset += size + 1;
        const actual = crypto.createHash(id.length === 40 ? 'sha1' : 'sha256').update('blob ' + size + '\0').update(blob).digest('hex');
        if (actual !== id) fail('git-batch-object-mismatch');
        blobs.set(id, blob);
    }
    if (offset !== bytes.length) fail('git-batch-invalid');
    return blobs;
}

// The factory permits a fresh synthetic Git repository in unit tests. Public
// verification first restricts its explicit candidate to the base or tool HEAD.
function createVerifier({productCommit = PRODUCT_COMMIT, io, git = runGit, trialIdentity = trial.identity} = {}) {
    if (!commitPattern.test(productCommit)) fail('product-commit-invalid');
    return function verifyCandidate(options = {}) {
        io ||= selectPhysicalFs();
        let repo, runtime, installer, installerSha256;
        try {
            ({repo, runtime, installer, installerSha256} = options || {});
            repo = physical(repo, true, io); runtime = physical(runtime, true, io);
            installer = physical(installer, false, io);
            if (!hashPattern.test(installerSha256 || '')) fail('installer-hash-required');
            const readGit = args => git(repo, args);
            const toolCommit = readGit(['rev-parse', 'HEAD']).toString('utf8').trim();
            if (!commitPattern.test(toolCommit)) fail('tool-commit-invalid');
            readGit(['merge-base', '--is-ancestor', productCommit, 'HEAD']);
            if (readGit(['diff', '--name-only', productCommit, 'HEAD', '--', ...PRODUCT_PATHS]).length ||
                readGit(['status', '--porcelain=v1', '-z', '--untracked-files=no', '--', ...PRODUCT_PATHS]).length) fail('product-tree-changed');
            const blob = sourcePath => readGit(['show', productCommit + ':' + memberPath(sourcePath)]);
            const blobJson = sourcePath => {try {return JSON.parse(blob(sourcePath));} catch (_) {fail('product-manifest-invalid', sourcePath);}};
            const installerHash = hashFile(installer, io);
            if (installerHash !== installerSha256.toLowerCase()) fail('installer-hash-mismatch');
            const receipt = readJson(installer + '.provenance.json', io, 1024 * 1024);
            if (receipt.schemaVersion !== 1 || receipt.sourceCommit !== productCommit ||
                !receipt.installer || receipt.installer.fileName !== path.basename(installer) ||
                receipt.installer.sha256?.toLowerCase() !== installerHash ||
                receipt.installer.size !== io.lstatSync(installer).size || !hashPattern.test(receipt.runtimeManifestSha256 || '')) fail('installer-receipt-invalid');
            const manifestPath = path.join(runtime, 'build-manifest.json'), manifestSha256 = hashFile(manifestPath, io);
            if (manifestSha256 !== receipt.runtimeManifestSha256.toLowerCase()) fail('installer-runtime-binding-mismatch');
            const build = readJson(manifestPath, io);
            if (build.schemaVersion !== 3 || build.sourceCommit !== productCommit || build.version !== receipt.version ||
                !Array.isArray(build.files) || !build.files.length || build.files.length > 200000) fail('build-manifest-invalid');
            const actual = physicalInventory(runtime, io), byPath = new Map(actual.map(row => [row.path, row]));
            const listed = new Set();
            for (const row of build.files) {
                if (!row || typeof row !== 'object') fail('payload-row-invalid');
                const member = memberPath(row.path), folded = member.toLowerCase();
                if (member === 'build-manifest.json' || listed.has(folded)) fail('payload-member-duplicate', member);
                listed.add(folded);
                if (!hashPattern.test(row.sha256 || '')) fail('payload-hash-invalid', member);
                const file = byPath.get(member);
                if (!file) fail('payload-member-missing', member);
                if (file.sha256 !== row.sha256.toLowerCase()) fail('payload-hash-mismatch', member);
                if (Object.hasOwn(row, 'size') && (!Number.isSafeInteger(row.size) || row.size < 0 || row.size !== file.size)) fail('payload-size-mismatch', member);
            }
            if (actual.length !== build.files.length + 1 || actual.some(row => row.path !== 'build-manifest.json' && !listed.has(row.path.toLowerCase()))) fail('payload-fullset-mismatch');
            if (!build.payload || build.payload.fileCount !== build.files.length ||
                build.payload.payloadSetSha256 !== payloadSetSha256(build.files)) fail('payload-set-mismatch');
            for (const [name, member] of Object.entries({inputs: 'build-input-provenance.json', source: 'source-provenance.json', runtime: 'runtime-provenance.json'})) {
                const binding = build.provenance?.[name];
                if (!binding || binding.path !== member || binding.sha256?.toLowerCase() !== byPath.get(member)?.sha256) fail('provenance-binding-mismatch', member);
                const record = readJson(path.join(runtime, member), io);
                if (record.schemaVersion !== 1 || record.sourceCommit !== productCommit) fail('provenance-schema-invalid', member);
            }
            if (build.sourceManifestSha256?.toLowerCase() !== digest(blob('vendor/runtime-manifest.json')) ||
                build.packageLockSha256?.toLowerCase() !== digest(blob('package-lock.json'))) fail('build-input-binding-mismatch');
            if (trialIdentity(runtime) !== productCommit) fail('trial-product-mismatch');
            const runtimeRecord = readJson(path.join(runtime, 'runtime-provenance.json'), io), scope = runtimeRecord.validatedProductScope;
            if (runtimeRecord.schemaVersion !== 1 || runtimeRecord.sourceCommit !== productCommit || !scope ||
                scope.sourceCommit !== productCommit || scope.sourceRoot !== 'src/electronapp' || scope.runtimeRoot !== 'electronapp' ||
                scope.sourceSelection !== 'git-commit-blobs' || scope.includesIgnoredSourceFiles !== false ||
                !Array.isArray(scope.files) || scope.fileCount !== scope.files.length) fail('runtime-source-scope-invalid');
            const expected = readGit(['ls-tree', '-r', '-z', '--full-tree', productCommit, '--', 'src/electronapp/'])
                .toString('utf8').split('\0').filter(Boolean).map(line => {
                    const match = /^(100644|100755) blob ([a-f0-9]{40,64})\t(src\/electronapp\/.+)$/.exec(line);
                    if (!match) fail('product-source-tree-invalid');
                    return {mode: match[1], objectId: match[2], sourcePath: memberPath(match[3]), runtimePath: match[3].slice(4)};
                }).filter(row => row.sourcePath !== 'src/electronapp/preload.js');
            if (scope.files.length !== expected.length) fail('runtime-source-fullset-mismatch');
            const sourceRows = new Map(), runtimeRows = new Set();
            for (const row of scope.files) {
                if (!row || typeof row.sourcePath !== 'string' || typeof row.runtimePath !== 'string') fail('runtime-source-row-invalid');
                const source = memberPath(row.sourcePath), target = memberPath(row.runtimePath);
                if (sourceRows.has(source.toLowerCase()) || runtimeRows.has(target.toLowerCase())) fail('runtime-source-duplicate', source);
                sourceRows.set(source.toLowerCase(), row); runtimeRows.add(target.toLowerCase());
            }
            const sourceBlobs = readGitBlobBatch(repo, expected.map(row => row.objectId), {run: git});
            for (const expectedRow of expected) {
                const row = sourceRows.get(expectedRow.sourcePath.toLowerCase());
                const sourceHash = digest(sourceBlobs.get(expectedRow.objectId));
                if (!row || row.sourcePath !== expectedRow.sourcePath || row.runtimePath !== expectedRow.runtimePath ||
                    row.sourceCommit !== productCommit || row.gitMode !== expectedRow.mode || row.gitBlobObjectId !== expectedRow.objectId ||
                    row.relation !== 'git-blob-copy' || row.sourceSha256?.toLowerCase() !== sourceHash ||
                    row.runtimeSha256?.toLowerCase() !== sourceHash || byPath.get(row.runtimePath)?.sha256 !== sourceHash) fail('runtime-source-blob-mismatch', expectedRow.sourcePath);
            }
            const native = blobJson('vendor/native-helper-manifest.json'), electron = blobJson('vendor/electron-runtime-manifest.json');
            if (native.schemaVersion !== 1 || electron.schemaVersion !== 1 || !native.libmpv || !electron.runtime) fail('native-manifest-invalid');
            const helperPath = memberPath(native.runtimePath), libmpvPath = memberPath(native.libmpv.runtimePath);
            const electronPath = memberPath(electron.runtime.runtimePath + '/' + electron.runtime.electronPath);
            const helper = byPath.get(helperPath), libmpv = byPath.get(libmpvPath), executable = byPath.get(electronPath);
            if (!helper || !libmpv || !executable || libmpv.sha256 !== native.libmpv.sha256?.toLowerCase() ||
                executable.sha256 !== electron.runtime.electronExeSha256?.toLowerCase()) fail('native-payload-mismatch');
            const nativeRecord = readJson(path.join(runtime, memberPath(native.provenancePath)), io);
            const nativeSource = blob(memberPath(native.sourcePath));
            const nativeObject = readGit(['rev-parse', productCommit + ':' + native.sourcePath]).toString('utf8').trim();
            const versions = [...nativeSource.toString('utf8').matchAll(/constexpr const char\* HELPER_VERSION = "([0-9]+\.[0-9]+\.[0-9]+)";/g)];
            if (nativeRecord.schemaVersion !== 1 || nativeRecord.sourceCommit !== productCommit ||
                nativeRecord.protocolVersion !== native.protocolVersion || versions.length !== 1 ||
                nativeRecord.source?.path !== native.sourcePath || nativeRecord.source.gitBlobObjectId !== nativeObject ||
                nativeRecord.source.sha256?.toLowerCase() !== digest(nativeSource) || nativeRecord.source.size !== nativeSource.length ||
                nativeRecord.source.relation !== 'git-commit-blob' || nativeRecord.helper?.runtimePath !== helperPath ||
                nativeRecord.helper.sha256?.toLowerCase() !== helper.sha256 || nativeRecord.helper.size !== helper.size ||
                nativeRecord.helper.testing !== false || nativeRecord.helper.version !== versions[0][1] ||
                nativeRecord.libmpv?.runtimePath !== libmpvPath || nativeRecord.libmpv.sha256?.toLowerCase() !== libmpv.sha256 ||
                nativeRecord.libmpv.version !== native.libmpv.version || nativeRecord.libmpv.clientApi !== native.libmpv.clientApi ||
                nativeRecord.clientHeader?.sha256?.toLowerCase() !== native.clientHeader?.sha256?.toLowerCase() ||
                nativeRecord.compiler?.sha256?.toLowerCase() !== native.compiler?.sha256?.toLowerCase() ||
                nativeRecord.compiler.version !== native.compiler.version ||
                JSON.stringify(nativeRecord.compiler.flags) !== JSON.stringify([...native.compiler.flags, ...native.compiler.linkerFlags])) fail('native-provenance-mismatch');
            if (runtimeRecord.electronRuntime?.manifestPath !== 'vendor/electron-runtime-manifest.json' ||
                runtimeRecord.electronRuntime.manifestSha256?.toLowerCase() !== digest(blob('vendor/electron-runtime-manifest.json')) ||
                runtimeRecord.electronRuntime.electronExeSha256?.toLowerCase() !== executable.sha256 ||
                runtimeRecord.electronRuntime.version !== electron.version) fail('electron-provenance-mismatch');
            const electronRoot = memberPath(electron.runtime.runtimePath) + '/';
            const electronFiles = actual.filter(row => row.path.startsWith(electronRoot)).map(row =>
                ({path: row.path.slice(electronRoot.length), sha256: row.sha256.toUpperCase()}))
                .sort((a, b) => a.path.localeCompare(b.path));
            if (electronFiles.length !== electron.runtime.fileCount ||
                payloadSetSha256(electronFiles) !== electron.runtime.treeSha256) fail('electron-tree-mismatch');
            return Object.freeze({productCommit, toolCommit, installerSha256: installerHash, manifestSha256,
                physicalPayloadSha256: payloadSetSha256(actual), fileCount: actual.length,
                helperSha256: helper.sha256, libmpvSha256: libmpv.sha256, electronSha256: executable.sha256});
        } catch (error) {
            if (error.message?.startsWith('windows-contract-')) throw error;
            fail('candidate-invalid');
        }
    };
}

function reviewedCandidate({repo, candidateCommit} = {}, {baseCommit = PRODUCT_COMMIT, git = runGit} = {}) {
    if (!commitPattern.test(candidateCommit || '')) fail('candidate-commit-required');
    const readGit = args => git(repo, args);
    const toolCommit = readGit(['rev-parse', 'HEAD']).toString('utf8').trim();
    if (!commitPattern.test(toolCommit)) fail('tool-commit-invalid');
    if (candidateCommit !== baseCommit && candidateCommit !== toolCommit) fail('candidate-commit-not-reviewed');
    readGit(['merge-base', '--is-ancestor', baseCommit, 'HEAD']);
    if (readGit(['diff', '--name-only', baseCommit, 'HEAD', '--', ...PRODUCT_PATHS]).length ||
        readGit(['status', '--porcelain=v1', '-z', '--untracked-files=no', '--', ...PRODUCT_PATHS]).length) fail('product-tree-changed');
    return {productCommit: candidateCommit, toolCommit};
}
function verifyCandidate(options = {}) {
    try {
        const io = selectPhysicalFs(), repo = physical(options?.repo, true, io);
        const reviewed = reviewedCandidate({repo, candidateCommit: options?.candidateCommit});
        const result = createVerifier({productCommit: reviewed.productCommit, io})({...options, repo});
        if (result.toolCommit !== reviewed.toolCommit || runGit(repo, ['rev-parse', 'HEAD']).toString('utf8').trim() !== reviewed.toolCommit) fail('tool-commit-changed');
        return result;
    } catch (error) {
        if (error.message?.startsWith('windows-contract-')) throw error;
        fail('candidate-invalid');
    }
}
module.exports = {PRODUCT_COMMIT, readGitBlobBatch, verifyCandidate, createVerifier, reviewedCandidate, selectPhysicalFs,
    physical, hashFile, physicalInventory, payloadSetSha256};
