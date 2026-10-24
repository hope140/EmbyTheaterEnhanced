'use strict';

// Integrity checks must see physical ASAR bytes, not Electron's virtual archive tree.
const fileSystemBackend = process.versions.electron ? 'original-fs' : 'node:fs';
const fs = require(fileSystemBackend);
const path = require('node:path');
const crypto = require('node:crypto');

function inventory(root) {
    const files = new Map();
    function failure(member, operation, cause, facts) {
        const error = Error('Physical package inventory failed.');
        error.member = member; error.operation = operation; error.fileSystemFacts = facts; error.fileSystemCode = /^[A-Z0-9_]{1,32}$/.test(cause?.code || '') ? cause.code : null;
        return error;
    }
    function walk(directory, prefix) {
        let entries;
        try {entries = fs.readdirSync(directory, {withFileTypes: true});} catch (error) {throw failure(prefix.slice(0, -1), 'readdir', error);}
        for (const entry of entries) {
            const file = path.join(directory, entry.name), relative = prefix + entry.name;
            let stat;
            try {stat = fs.lstatSync(file);} catch (error) {throw failure(relative, 'lstat', error);}
            if (stat.isSymbolicLink()) throw failure(relative, 'reject-link');
            if (stat.isDirectory()) walk(file, relative + '/');
            else if (stat.isFile()) {
                let bytes;
                try {bytes = fs.readFileSync(file);} catch (error) {throw failure(relative, 'read-file', error);}
                if (bytes.length !== stat.size) throw failure(relative, 'stat-read-length-mismatch', null, {size: stat.size, readBytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex')});
                files.set(relative, {size: stat.size, sha256: crypto.createHash('sha256').update(bytes).digest('hex')});
            } else throw failure(relative, 'reject-nonregular');
        }
    }
    if (fs.lstatSync(root).isSymbolicLink()) throw failure('', 'reject-root-link');
    walk(root, ''); return files;
}

function verify(runtime, extracted, sourceCommit) {
    if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error('Exact source commit required.');
    const build = JSON.parse(fs.readFileSync(path.join(runtime, 'build-manifest.json'), 'utf8'));
    if (build.schemaVersion !== 3 || build.sourceCommit !== sourceCommit) throw new Error('Runtime source identity mismatch.');
    const left = inventory(runtime);
    const right = inventory(extracted);
    if (left.size !== right.size || [...left.keys()].some(file => !right.has(file))) throw new Error('Installer payload paths differ from runtime.');
    for (const [file, expected] of left) {
        const actual = right.get(file);
        if (actual.size !== expected.size || actual.sha256 !== expected.sha256) throw new Error('Installer payload bytes differ: ' + file);
    }
    return {status: 'passed', sourceCommit, fileCount: left.size,
        bytes: [...left.values()].reduce((total, file) => total + file.size, 0),
        buildManifestSha256: left.get('build-manifest.json').sha256};
}

if (require.main === module) {
    try { console.log(JSON.stringify(verify(...process.argv.slice(2)))); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = {inventory, verify, fileSystemBackend};
