'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function inventory(root) {
    const files = new Map();
    function walk(directory, prefix) {
        for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
            const file = path.join(directory, entry.name);
            const relative = prefix + entry.name;
            const stat = fs.lstatSync(file);
            if (stat.isSymbolicLink()) throw new Error('Links are forbidden in package verification.');
            if (stat.isDirectory()) walk(file, relative + '/');
            else if (stat.isFile()) files.set(relative, {size: stat.size,
                sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')});
            else throw new Error('Nonregular package input.');
        }
    }
    if (fs.lstatSync(root).isSymbolicLink()) throw new Error('Linked package root is forbidden.');
    walk(root, '');
    return files;
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
module.exports = {inventory, verify};
