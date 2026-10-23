'use strict';

const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
}

function canonicalText(value) {
    return value.toString('utf8').replace(/\r\n/g, '\n');
}

function hashTrackedTextFile(rootArg, repoPath, committedBlob) {
    const root = path.resolve(rootArg);
    const worktreeFile = path.join(root, repoPath);
    if (!fs.existsSync(worktreeFile) || !fs.statSync(worktreeFile).isFile()) {
        throw new Error('Tracked generator missing: ' + repoPath);
    }
    // The build-input inspector may supply bytes read in its own Git batch.
    // Never reuse the working-file check: every invocation reads it again.
    if (committedBlob !== undefined && !Buffer.isBuffer(committedBlob)) {
        throw new TypeError('Committed text must be a Git blob Buffer.');
    }
    if (committedBlob === undefined) {
        const blob = childProcess.spawnSync('git', ['-C', root, 'show', 'HEAD:' + repoPath], {
            encoding: null,
            maxBuffer: 16 * 1024 * 1024
        });
        if (blob.error || blob.status !== 0) throw new Error('Tracked generator is not committed: ' + repoPath);
        committedBlob = blob.stdout;
    }
    const worktree = fs.readFileSync(worktreeFile);
    if (canonicalText(worktree) !== canonicalText(committedBlob)) {
        throw new Error('Tracked generator differs from HEAD: ' + repoPath);
    }
    return sha256(committedBlob);
}

module.exports = {hashTrackedTextFile};
