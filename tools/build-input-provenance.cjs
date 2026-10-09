'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const contract = require('./build-input-contract.cjs');
const {readBlob} = require('./copy-tracked-product-sources.cjs');

const NAME = 'build-input-provenance.json';
const CONFIG_PATH = 'Emby.Theater.exe.config';
const FROM = '<add key="ProgramDataPath" value=""/>';
const TO = '<add key="ProgramDataPath" value="%ApplicationData%\\EmbyTheaterEnhanced"/>';
function hash(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function configOutput(base) {
    const text = base.toString('utf8');
    if (text.split(FROM).length !== 2) throw new Error('ProgramDataPath base must contain exactly one canonical anchor.');
    return Buffer.from(text.replace(FROM, TO), 'utf8');
}

function failPath() { throw new Error('Build output path is not a safe physical file or directory.'); }
function normalizedPath(value) {
    let result = path.resolve(value);
    if (process.platform === 'win32') {
        if (/^\\\\\?\\UNC\\/i.test(result)) result = '\\\\' + result.slice(8);
        else result = result.replace(/^\\\\\?\\/, '');
        result = result.toLowerCase();
    }
    return result;
}
function isWithin(parent, child) {
    const relative = path.relative(normalizedPath(parent), normalizedPath(child));
    return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}
function statPhysical(file, allowMissing = false) {
    let stat;
    try { stat = fs.lstatSync(file); }
    catch (error) {
        if (allowMissing && error && error.code === 'ENOENT') return null;
        throw error;
    }
    if (stat.isSymbolicLink()) failPath();
    const real = fs.realpathSync.native(file);
    if (normalizedPath(real) !== normalizedPath(file)) failPath();
    return stat;
}
function assertPhysicalDirectory(directory) {
    const absolute = path.resolve(directory);
    let current = path.parse(absolute).root;
    let finalStat = statPhysical(current);
    for (const segment of path.relative(current, absolute).split(path.sep).filter(Boolean)) {
        current = path.join(current, segment);
        finalStat = statPhysical(current);
        if (!finalStat.isDirectory()) failPath();
    }
    if (!finalStat || !finalStat.isDirectory()) failPath();
    return absolute;
}
function targetPath(runtime, relative) {
    const root = path.resolve(runtime);
    const output = path.resolve(root, relative);
    if (!isWithin(root, output)) failPath();
    return output;
}
function inspectTarget(runtime, relative, options = {}) {
    const root = assertPhysicalDirectory(runtime);
    const target = targetPath(root, relative);
    const parts = path.relative(root, target).split(path.sep);
    let current = root;
    for (let index = 0; index < parts.length; index++) {
        current = path.join(current, parts[index]);
        const stat = statPhysical(current, true);
        if (!stat) return {path: target, exists: false};
        if (index < parts.length - 1 && !stat.isDirectory()) failPath();
        if (index === parts.length - 1) {
            if (options.kind === 'directory' ? !stat.isDirectory() : !stat.isFile()) failPath();
            if (options.singleLink && stat.nlink !== 1) failPath();
            return {path: target, exists: true, stat};
        }
    }
    failPath();
}
function ensureParentDirectories(runtime, relative) {
    const root = assertPhysicalDirectory(runtime);
    const parent = path.dirname(targetPath(root, relative));
    const parts = path.relative(root, parent).split(path.sep).filter(Boolean);
    let current = root;
    for (const part of parts) {
        current = path.join(current, part);
        const existing = statPhysical(current, true);
        if (!existing) {
            try { fs.mkdirSync(current); }
            catch (error) { if (!error || error.code !== 'EEXIST') throw error; }
        }
        const createdOrExisting = statPhysical(current);
        if (!createdOrExisting.isDirectory()) failPath();
    }
}
function sameIdentity(left, right) {
    return left && right && left.dev === right.dev && left.ino === right.ino && left.ino !== 0;
}
function cleanupCreatedFile(runtime, relative, identity) {
    try {
        const target = inspectTarget(runtime, relative, {kind: 'file', singleLink: true});
        if (!target.exists || !sameIdentity(target.stat, identity)) return;
        fs.unlinkSync(target.path);
    } catch (_) { /* Never widen cleanup after a path or identity mismatch. */ }
}
function writeNewFile(runtime, relative, bytes) {
    ensureParentDirectories(runtime, relative);
    const target = inspectTarget(runtime, relative);
    if (target.exists) failPath();
    let fd;
    let identity;
    try {
        fd = fs.openSync(target.path, 'wx', 0o644);
        identity = fs.fstatSync(fd);
        if (!identity.isFile() || identity.nlink !== 1) failPath();
        fs.writeFileSync(fd, bytes);
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        fd = undefined;
        const written = inspectTarget(runtime, relative, {kind: 'file', singleLink: true});
        if (!sameIdentity(written.stat, identity) || !fs.readFileSync(written.path).equals(bytes)) failPath();
    } catch (error) {
        if (fd !== undefined) { try { fs.closeSync(fd); } catch (_) { } }
        // Preserve partial candidate outputs for diagnosis; only config temp
        // files are eligible for cleanup.
        throw error;
    }
}
function readConfigTarget(runtime, base) {
    const target = inspectTarget(runtime, CONFIG_PATH, {kind: 'file', singleLink: true});
    if (target.exists && !fs.readFileSync(target.path).equals(base)) {
        throw new Error('ProgramDataPath target must be missing or the verified Carnival base.');
    }
    return target;
}
function preflightWrite(runtime, base, notices) {
    assertPhysicalDirectory(runtime);
    for (const completed of ['build-manifest.json', NAME]) {
        if (inspectTarget(runtime, completed).exists) {
            throw new Error('Completed runtime outputs cannot be overwritten.');
        }
    }
    readConfigTarget(runtime, base);
    for (const notice of notices) {
        if (inspectTarget(runtime, notice.path).exists) {
            throw new Error('Notice output already exists: ' + notice.path);
        }
    }
}
function preflightNotices(runtime, notices) {
    assertPhysicalDirectory(runtime);
    for (const completed of ['build-manifest.json', NAME]) {
        if (inspectTarget(runtime, completed).exists) {
            throw new Error('Completed runtime outputs cannot be overwritten.');
        }
    }
    for (const notice of notices) {
        if (inspectTarget(runtime, notice.path).exists) {
            throw new Error('Notice output already exists: ' + notice.path);
        }
    }
}
function replaceConfig(runtime, base, generated) {
    ensureParentDirectories(runtime, CONFIG_PATH);
    const before = readConfigTarget(runtime, base);
    const parent = path.dirname(before.path);
    const temporaryName = '.ete-config-' + process.pid + '-' + crypto.randomBytes(16).toString('hex') + '.tmp';
    const temporaryRelative = path.relative(path.resolve(runtime), path.join(parent, temporaryName));
    const temporary = targetPath(runtime, temporaryRelative);
    let fd;
    let identity;
    let renamed = false;
    try {
        assertPhysicalDirectory(parent);
        fd = fs.openSync(temporary, 'wx', 0o600);
        identity = fs.fstatSync(fd);
        if (!identity.isFile() || identity.nlink !== 1) failPath();
        fs.writeFileSync(fd, generated);
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        fd = undefined;
        const tempStat = inspectTarget(runtime, temporaryRelative, {kind: 'file', singleLink: true});
        if (!sameIdentity(tempStat.stat, identity) || !fs.readFileSync(temporary).equals(generated)) failPath();
        const current = readConfigTarget(runtime, base);
        if (current.exists !== before.exists) failPath();
        fs.renameSync(temporary, before.path);
        renamed = true;
        const output = inspectTarget(runtime, CONFIG_PATH, {kind: 'file', singleLink: true});
        if (!output.exists || !fs.readFileSync(output.path).equals(generated)) failPath();
    } catch (error) {
        if (fd !== undefined) { try { fs.closeSync(fd); } catch (_) { } }
        if (!renamed && identity) cleanupCreatedFile(runtime, temporaryRelative, identity);
        throw error;
    }
}
function noticeInputs(root, contractInputs) {
    return contract.NOTICE_PATHS.map(relativePath => {
        const input = contractInputs.files.find(item => item.path === relativePath);
        if (!input) throw new Error('Committed notice input is missing from the build contract.');
        const bytes = readBlob(root, input.gitBlobObjectId);
        if (hash(bytes).toLowerCase() !== input.sha256) throw new Error('Notice blob identity mismatch.');
        return {path: relativePath, input, bytes};
    });
}
function record(root, runtime, sourceCommit, write) {
    const inputs = contract.inspect(root, sourceCommit);
    const byPath = new Map(inputs.files.map(file => [file.path, file]));
    const manifest = JSON.parse(readBlob(root, byPath.get('vendor/runtime-manifest.json').gitBlobObjectId));
    const base = fs.readFileSync(path.join(root, 'vendor/carnival', CONFIG_PATH));
    const expectedBase = manifest.files.find(file => file.path === CONFIG_PATH);
    if (!expectedBase || hash(base) !== expectedBase.sha256.toLowerCase()) throw new Error('Config base does not match committed vendor manifest.');
    const generated = configOutput(base);
    const notices = noticeInputs(root, inputs);
    if (write) {
        preflightWrite(runtime, base, notices);
        for (const notice of notices) ensureParentDirectories(runtime, notice.path);
        for (const notice of notices) writeNewFile(runtime, notice.path, notice.bytes);
        replaceConfig(runtime, base, generated);
    } else {
        assertPhysicalDirectory(runtime);
    }
    const configTarget = inspectTarget(runtime, CONFIG_PATH, {kind: 'file', singleLink: true});
    if (!configTarget.exists || !fs.readFileSync(configTarget.path).equals(generated)) throw new Error('ProgramDataPath generated output mismatch.');
    const noticeRecords = notices.map(notice => {
        const runtimeFile = inspectTarget(runtime, notice.path, {kind: 'file', singleLink: true});
        if (!runtimeFile.exists) throw new Error('Committed notice runtime is missing: ' + notice.path);
        const runtimeHash = hash(fs.readFileSync(runtimeFile.path));
        if (runtimeHash !== notice.input.sha256) throw new Error('Committed notice runtime mismatch: ' + notice.path);
        return {...notice.input, runtimePath: notice.path, relation: 'git-blob-copy'};
    });
    return {...inputs, configTransform: {
        basePath: 'vendor/carnival/' + CONFIG_PATH, baseSha256: hash(base),
        generatorPath: 'tools/build-input-provenance.cjs', generatorSha256: byPath.get('tools/build-input-provenance.cjs').sha256,
        runtimePath: CONFIG_PATH, outputSha256: hash(generated), relation: 'single ProgramDataPath anchor replacement; preserve other bytes'
    }, notices: noticeRecords};
}
function run(command, root, runtime, sourceCommit) {
    if (!['write', 'validate'].includes(command)) throw new Error('Expected write or validate.');
    const expected = record(root, runtime, sourceCommit, command === 'write');
    if (command === 'write') writeNewFile(runtime, NAME, Buffer.from(JSON.stringify(expected, null, 2) + '\n', 'utf8'));
    else {
        const provenanceTarget = inspectTarget(runtime, NAME, {kind: 'file', singleLink: true});
        if (!provenanceTarget.exists || JSON.stringify(JSON.parse(fs.readFileSync(provenanceTarget.path))) !== JSON.stringify(expected)) {
            throw new Error('Build input provenance mismatch.');
        }
    }
    return {status: 'passed', sourceCommit, fileCount: expected.files.length, notices: expected.notices.length};
}
function materializeNotices(root, runtime, contractInputs) {
    const notices = noticeInputs(root, contractInputs);
    preflightNotices(runtime, notices);
    for (const notice of notices) ensureParentDirectories(runtime, notice.path);
    for (const notice of notices) writeNewFile(runtime, notice.path, notice.bytes);
}
if (require.main === module) {
    const [command, root, runtime, sourceCommit] = process.argv.slice(2);
    process.stdout.write(JSON.stringify(run(command, root, runtime, sourceCommit)) + '\n');
}
module.exports = {run, record, configOutput, materializeNotices, NAME};
