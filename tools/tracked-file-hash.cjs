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

function hashTrackedTextFile(rootArg, repoPath) {
    const root = path.resolve(rootArg);
    const worktreeFile = path.join(root, repoPath);
    if (!fs.existsSync(worktreeFile) || !fs.statSync(worktreeFile).isFile()) {
        throw new Error('Tracked generator missing: ' + repoPath);
    }
    const blob = childProcess.spawnSync('git', ['-C', root, 'show', 'HEAD:' + repoPath], {
        encoding: null,
        maxBuffer: 16 * 1024 * 1024
    });
    if (blob.error || blob.status !== 0) throw new Error('Tracked generator is not committed: ' + repoPath);
    const worktree = fs.readFileSync(worktreeFile);
    if (canonicalText(worktree) !== canonicalText(blob.stdout)) {
        throw new Error('Tracked generator differs from HEAD: ' + repoPath);
    }
    return sha256(blob.stdout);
}

module.exports = {hashTrackedTextFile};
