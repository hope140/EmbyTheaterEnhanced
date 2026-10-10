'use strict';

const childProcess = require('node:child_process');
const path = require('node:path');

const ZERO_SHA = /^0+$/;

function git(root, args, input) {
    const result = childProcess.spawnSync('git', args, {
        cwd: root,
        encoding: 'utf8',
        input,
        maxBuffer: 2 * 1024 * 1024
    });
    if (result.error) throw result.error;
    return result;
}

function resolveBase(root, {eventName, pullRequestBase, pushBefore, defaultBranch}) {
    if (eventName === 'pull_request') {
        if (!/^[0-9a-fA-F]{40,64}$/.test(pullRequestBase || '')) throw new Error('Pull request base SHA is missing or invalid.');
        return pullRequestBase;
    }
    if (eventName === 'push') {
        if (!/^[0-9a-fA-F]{40,64}$/.test(pushBefore || '')) throw new Error('Push before SHA is missing or invalid.');
        if (!ZERO_SHA.test(pushBefore)) return pushBefore;
        if (!/^[A-Za-z0-9._/-]+$/.test(defaultBranch || '') || defaultBranch.startsWith('-')) {
            throw new Error('Default branch name is missing or invalid for a new branch push.');
        }
        const ref = 'refs/remotes/origin/' + defaultBranch;
        const checkedRef = git(root, ['check-ref-format', ref]);
        if (checkedRef.status !== 0) throw new Error('Default branch tracking ref is invalid.');
        const mergeBase = git(root, ['merge-base', ref, 'HEAD']);
        const base = mergeBase.stdout.trim();
        if (mergeBase.status !== 0 || !/^[0-9a-f]{40,64}$/.test(base)) {
            throw new Error('Unable to resolve the merge-base with origin/' + defaultBranch + ' for the new branch push.');
        }
        return base;
    }
    throw new Error('CI_EVENT_NAME must be pull_request or push.');
}

function safeDiffMessages(output) {
    return output.split(/\r?\n/)
        .map(line => line.match(/^(.+?):(\d+): (trailing whitespace\.|new blank line at EOF\.)$/))
        .filter(Boolean)
        .map(match => match[1] + ':' + match[2] + ': ' + match[3]);
}

function checkDiff(root, event) {
    const base = resolveBase(root, event);
    const validBase = git(root, ['cat-file', '-e', base + '^{tree}']);
    if (validBase.status !== 0) throw new Error('Diff base tree cannot be resolved.');
    const result = git(root, ['diff', '--check', base, 'HEAD']);
    return {
        status: result.status === null ? 1 : result.status,
        base,
        messages: safeDiffMessages(result.stdout + result.stderr)
    };
}

function main() {
    const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
    const result = checkDiff(root, {
        eventName: process.env.CI_EVENT_NAME,
        pullRequestBase: process.env.CI_PULL_REQUEST_BASE,
        pushBefore: process.env.CI_PUSH_BEFORE,
        defaultBranch: process.env.CI_DEFAULT_BRANCH
    });
    if (result.status !== 0) {
        for (const message of result.messages) process.stderr.write(message + '\n');
        process.stderr.write('git diff --check failed; source line contents are suppressed.\n');
        process.exitCode = 1;
    } else {
        process.stdout.write('git diff --check passed.\n');
    }
}

module.exports = {checkDiff, resolveBase, safeDiffMessages};

if (require.main === module) {
    try { main(); }
    catch (error) {
        process.stderr.write('Diff check failed: ' + error.message + '\n');
        process.exitCode = 1;
    }
}
