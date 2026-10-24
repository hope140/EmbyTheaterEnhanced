'use strict';
// Build-time physical input only: reuse one member of the unchanged official tree.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const electron = require('./electron-runtime-input.cjs');
const {physical, mkdirPhysical} = require('./libmpv-input.cjs');
const {hashTrackedTextFile} = require('./tracked-file-hash.cjs');
const LOCK_PATH = 'native/windows-media/loader-input.json';
const SOURCE = 'x64/electron/vulkan-1.dll', TARGET = 'electronapp/libmpv/x64/vulkan-1.dll';
const NOTICE_PATHS = Object.freeze(['x64/electron/LICENSE', 'x64/electron/LICENSES.chromium.html']);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function load(root) {
    physical(path.join(root, LOCK_PATH), false);
    const lock = JSON.parse(fs.readFileSync(path.join(root, LOCK_PATH))), manifest = electron.readManifest(root);
    if (Object.keys(lock).sort().join(',') !== 'arch,archiveSha256,component,platform,relation,schemaVersion,sha256,size,sourcePath,targetPath,version' ||
        lock.schemaVersion !== 1 || lock.component !== 'Electron' || lock.version !== manifest.version || lock.platform !== 'win32' || lock.arch !== 'x64' ||
        lock.archiveSha256 !== manifest.archive.sha256 || lock.sourcePath !== SOURCE || lock.targetPath !== TARGET ||
        lock.relation !== 'byte-identical-standard-payload-copy' || !/^[a-f0-9]{64}$/.test(lock.sha256 || '') || !Number.isSafeInteger(lock.size) || lock.size <= 0) throw Error('native-loader-lock-invalid');
    return lock;
}
function member(runtime, name, lock) {
    const file = path.join(runtime, name); physical(file, false); const bytes = fs.readFileSync(file);
    if (bytes.length !== lock.size || sha(bytes) !== lock.sha256) throw Error('native-loader-member-mismatch:' + name);
    return bytes;
}
function source(root, runtime) {
    const lock = load(root);
    // Full Electron hash/set gate also preserves the original license files.
    electron.validateRuntime(root, runtime);
    const bytes = member(runtime, SOURCE, lock);
    const notices = NOTICE_PATHS.map(name => {const file = path.join(runtime, name); physical(file, false); return {path: name, sha256: sha(fs.readFileSync(file))};});
    return {lock, bytes, notices};
}
function validateRuntime(root, runtime) {
    const input = source(root, runtime); member(runtime, TARGET, input.lock);
    return {lockPath: LOCK_PATH, lockSha256: hashTrackedTextFile(root, LOCK_PATH),
        generatorPath: 'tools/native-loader-input.cjs', generatorSha256: hashTrackedTextFile(root, 'tools/native-loader-input.cjs'),
        ...input.lock, notices: input.notices};
}
function assemble(rootArg, runtimeArg) {
    const root = path.resolve(rootArg), runtime = path.resolve(runtimeArg), relative = path.relative(path.join(root, 'dist'), runtime);
    if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw Error('native-loader-dedicated-dist-required');
    const input = source(root, runtime), target = path.join(runtime, TARGET);
    // Validate tracked inputs before the first output write.
    hashTrackedTextFile(root, LOCK_PATH); hashTrackedTextFile(root, 'tools/native-loader-input.cjs');
    if (fs.existsSync(target)) throw Error('native-loader-target-exists');
    mkdirPhysical(path.dirname(target)); fs.writeFileSync(target, input.bytes, {flag: 'wx'});
    return validateRuntime(root, runtime);
}
if (require.main === module) {
    try {const [command, root, runtime] = process.argv.slice(2);
        if (!root || !runtime || !['assemble', 'validate-runtime'].includes(command)) throw Error('native-loader-arguments-invalid');
        console.log(JSON.stringify(command === 'assemble' ? assemble(root, runtime) : validateRuntime(root, runtime)));
    } catch (error) {console.error(error.message); process.exitCode = 1;}
}
module.exports = {LOCK_PATH, SOURCE, TARGET, NOTICE_PATHS, load, assemble, validateRuntime};
