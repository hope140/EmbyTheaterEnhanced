'use strict';

const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SOURCE_PREFIX = 'src/electronapp/';
const RUNTIME_PREFIX = 'electronapp/';
const REGULAR_FILE_MODES = new Set(['100644', '100755']);

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
}

function runGit(root, args, label) {
    const result = childProcess.spawnSync('git', ['-C', root, ...args], {
        encoding: null,
        maxBuffer: 64 * 1024 * 1024
    });
    if (result.error || result.status !== 0) {
        const detail = result.stderr ? result.stderr.toString('utf8').trim() : '';
        throw new Error(label + ' failed' + (detail ? ': ' + detail : '.'));
    }
    return result.stdout;
}

function validateSourceCommit(sourceCommit) {
    if (!/^[0-9a-fA-F]{40}$/.test(sourceCommit || '')) {
        throw new Error('sourceCommit must be a 40-character Git commit.');
    }
    return sourceCommit.toLowerCase();
}

function validateRepoPath(repoPath) {
    const segments = repoPath.split('/');
    if (!repoPath.startsWith(SOURCE_PREFIX) || repoPath.includes('\\') ||
        segments.includes('') || segments.includes('.') || segments.includes('..')) {
        throw new Error('Unexpected tracked product source path: ' + repoPath);
    }
}

function listTrackedProductSources(rootArg, sourceCommitArg) {
    const root = path.resolve(rootArg);
    const sourceCommit = validateSourceCommit(sourceCommitArg);
    const output = runGit(root, [
        'ls-tree', '-r', '-z', '--full-tree', sourceCommit, '--', 'src/electronapp/'
    ], 'Tracked product source enumeration');
    const entries = output.toString('utf8').split('\0').filter(Boolean).map(line => {
        const match = /^([0-7]{6}) ([^ ]+) ([0-9a-f]{40,64})\t([\s\S]+)$/.exec(line);
        if (!match) throw new Error('Malformed git ls-tree entry.');
        const [, mode, type, objectId, repoPath] = match;
        validateRepoPath(repoPath);
        if (type !== 'blob' || !REGULAR_FILE_MODES.has(mode)) {
            throw new Error('Tracked product source is not a regular blob: ' + repoPath);
        }
        return {
            sourcePath: repoPath,
            runtimePath: RUNTIME_PREFIX + repoPath.substring(SOURCE_PREFIX.length),
            gitMode: mode,
            gitBlobObjectId: objectId
        };
    }).sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));
    if (!entries.length) throw new Error('No tracked product sources found in sourceCommit.');
    const uniquePaths = new Set(entries.map(entry => entry.sourcePath));
    if (uniquePaths.size !== entries.length) throw new Error('Duplicate tracked product source path.');
    return entries;
}

function readBlob(rootArg, objectId) {
    const root = path.resolve(rootArg);
    if (!/^[0-9a-f]{40,64}$/.test(objectId || '')) throw new Error('Invalid Git blob object id.');
    return runGit(root, ['cat-file', 'blob', objectId], 'Git blob read');
}

function materializeTrackedProductSources(rootArg, sourceCommitArg, runtimeArg) {
    const root = path.resolve(rootArg);
    const runtime = path.resolve(runtimeArg);
    const sourceCommit = validateSourceCommit(sourceCommitArg);
    const entries = listTrackedProductSources(root, sourceCommit).map(entry => {
        const value = readBlob(root, entry.gitBlobObjectId);
        const runtimeFile = path.join(runtime, entry.runtimePath);
        fs.mkdirSync(path.dirname(runtimeFile), {recursive: true});
        fs.writeFileSync(runtimeFile, value);
        return Object.assign({}, entry, {sourceSha256: sha256(value)});
    });
    return {schemaVersion: 1, status: 'passed', sourceCommit, fileCount: entries.length, entries};
}

if (require.main === module) {
    const [root, sourceCommit, runtime] = process.argv.slice(2);
    if (!root || !sourceCommit || !runtime) {
        throw new Error('Usage: copy-tracked-product-sources.cjs <root> <sourceCommit> <runtime>');
    }
    const result = materializeTrackedProductSources(root, sourceCommit, runtime);
    process.stdout.write(JSON.stringify({
        schemaVersion: result.schemaVersion,
        status: result.status,
        sourceCommit: result.sourceCommit,
        fileCount: result.fileCount
    }) + '\n');
}

module.exports = {
    listTrackedProductSources,
    materializeTrackedProductSources,
    readBlob,
    sha256
};
