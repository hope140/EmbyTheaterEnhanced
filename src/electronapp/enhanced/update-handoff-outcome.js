'use strict';
const fs = require('fs'), path = require('path');
const stages = new Set(['preparing', 'armed', 'waiting-release', 'cancelled', 'waiting-client', 'client-exited', 'waiting-host',
    'host-exited', 'client-timeout', 'host-timeout', 'client-nonzero', 'host-nonzero', 'release-timeout',
    'shell-entered', 'shell-started', 'wizard-exited', 'shell-failed', 'handoff-failed']);
const fail = () => Object.assign(Error('cache-unsafe'), {code: 'cache-unsafe'});
function checked(root, proof) {
    if (!proof || !/^handoff-[0-9a-f]{32}\.json$/.test(proof.name || '')) throw fail();
    const file = path.join(root, proof.name), stat = fs.lstatSync(file, {bigint: true});
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n || String(stat.ino) !== proof.ino || String(stat.dev) !== proof.dev) throw fail();
    return file;
}
function prepare(root, directory, expected) {
    const name = 'handoff-' + path.basename(directory).slice(7) + '.json', file = path.join(root, name);
    if (!/^handoff-[0-9a-f]{32}\.json$/.test(name)) throw fail();
    let fd;
    try { fd = fs.openSync(file, 'wx', 0o600); }
    catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const stat = fs.lstatSync(file, {bigint: true});
        const proof = {name, ino: String(stat.ino), dev: String(stat.dev)};
        checked(root, proof);
        if (!expected || expected.name !== name || expected.ino !== proof.ino || expected.dev !== proof.dev || stat.size > 1024n) throw fail();
        // An active guard owns an exclusive write handle on Windows. Never
        // rename/replace it or interpret a sharing violation as cancellation.
        fd = fs.openSync(file, fs.constants.O_RDWR | (fs.constants.O_NOFOLLOW || 0));
        const opened = fs.fstatSync(fd, {bigint: true});
        if (String(opened.ino) !== proof.ino || String(opened.dev) !== proof.dev) { fs.closeSync(fd); throw fail(); }
    }
    try {
        const stat = fs.fstatSync(fd, {bigint: true});
        if (!stat.isFile() || stat.nlink !== 1n) throw fail();
        const proof = {name, ino: String(stat.ino), dev: String(stat.dev)};
        fs.ftruncateSync(fd, 0); fs.writeSync(fd, '{"schemaVersion":1,"stage":"preparing","elapsedMs":0}\n'); fs.fsyncSync(fd);
        checked(root, proof); return proof;
    } finally { fs.closeSync(fd); }
}
function read(root, proof) {
    const file = checked(root, proof), fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    try {
        const stat = fs.fstatSync(fd, {bigint: true});
        if (String(stat.ino) !== proof.ino || String(stat.dev) !== proof.dev || !stat.isFile() || stat.nlink !== 1n || stat.size > 1024n) throw fail();
        const buffer = Buffer.alloc(1025), size = fs.readSync(fd, buffer, 0, buffer.length, 0);
        checked(root, proof);
        if (size > 1024) throw fail();
        const value = JSON.parse(buffer.subarray(0, size));
        if (value.schemaVersion !== 1 || !stages.has(value.stage) || !Number.isSafeInteger(value.elapsedMs) || value.elapsedMs < 0) throw fail();
        return {stage: value.stage, elapsedMs: value.elapsedMs,
            exitCode: Number.isSafeInteger(value.exitCode) && value.exitCode >= 0 && value.exitCode <= 65535 ? value.exitCode : null};
    } finally { fs.closeSync(fd); }
}
function cancelled(root, proof) {
    const file = checked(root, proof), fd = fs.openSync(file, fs.constants.O_RDWR | (fs.constants.O_NOFOLLOW || 0));
    try {
        const stat = fs.fstatSync(fd, {bigint: true});
        if (String(stat.ino) !== proof.ino || String(stat.dev) !== proof.dev || stat.nlink !== 1n) throw fail();
        fs.ftruncateSync(fd, 0); fs.writeSync(fd, '{"schemaVersion":1,"stage":"cancelled","elapsedMs":0}\n'); fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
}
module.exports = {prepare, read, cancelled};
