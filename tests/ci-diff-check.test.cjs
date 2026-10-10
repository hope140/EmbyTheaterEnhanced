'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {checkDiff} = require('../tools/ci-diff-check.cjs');

const ZERO_SHA = '0'.repeat(40);

function git(root, args, input) {
    const result = childProcess.spawnSync('git', args, {cwd: root, encoding: 'utf8', input});
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
}

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-ci-diff-'));
    git(root, ['init', '-q']);
    git(root, ['config', 'user.name', 'ETE CI Fixture']);
    git(root, ['config', 'user.email', 'ete-ci-fixture@example.invalid']);
    return root;
}

function commitFile(root, content) {
    fs.writeFileSync(path.join(root, 'fixture.txt'), content, 'utf8');
    git(root, ['add', 'fixture.txt']);
    git(root, ['commit', '-q', '-m', 'fixture']);
    return git(root, ['rev-parse', 'HEAD']);
}

function newBranchCommit(content) {
    const root = fixture();
    const base = commitFile(root, 'clean default branch\n');
    git(root, ['update-ref', 'refs/remotes/origin/main', base]);
    git(root, ['checkout', '-q', '-b', 'codex/new-branch']);
    const head = commitFile(root, content);
    return {root, base, head};
}

function twoCommits(content) {
    const root = fixture();
    const base = commitFile(root, 'clean base\n');
    const head = commitFile(root, content);
    return {root, base, head};
}

test('new branch push compares against default-branch merge-base and detects bad whitespace', t => {
    const row = newBranchCommit('bad trailing whitespace \n');
    t.after(() => fs.rmSync(row.root, {recursive: true, force: true}));
    const result = checkDiff(row.root, {eventName: 'push', pushBefore: ZERO_SHA, defaultBranch: 'main'});
    assert.notEqual(result.status, 0);
    assert.match(result.messages.join('\n'), /fixture\.txt:1: trailing whitespace\./);
});

test('new branch push accepts a clean first patch', t => {
    const row = newBranchCommit('clean\n');
    t.after(() => fs.rmSync(row.root, {recursive: true, force: true}));
    assert.equal(checkDiff(row.root, {eventName: 'push', pushBefore: ZERO_SHA, defaultBranch: 'main'}).status, 0);
});

test('new branch push fails closed when the default branch tracking ref is unavailable', t => {
    const row = newBranchCommit('clean\n');
    t.after(() => fs.rmSync(row.root, {recursive: true, force: true}));
    git(row.root, ['update-ref', '-d', 'refs/remotes/origin/main']);
    assert.throws(() => checkDiff(row.root, {eventName: 'push', pushBefore: ZERO_SHA, defaultBranch: 'main'}), /merge-base/);
});

test('ordinary push checks before-to-head changes and accepts clean whitespace', t => {
    const row = twoCommits('clean update\n');
    t.after(() => fs.rmSync(row.root, {recursive: true, force: true}));
    assert.equal(checkDiff(row.root, {eventName: 'push', pushBefore: row.base}).status, 0);
});

test('ordinary push detects bad whitespace introduced after before SHA', t => {
    const row = twoCommits('bad update \n');
    t.after(() => fs.rmSync(row.root, {recursive: true, force: true}));
    const result = checkDiff(row.root, {eventName: 'push', pushBefore: row.base});
    assert.notEqual(result.status, 0);
    assert.match(result.messages.join('\n'), /fixture\.txt:1: trailing whitespace\./);
});

test('pull request checks base-to-head changes and accepts a clean patch', t => {
    const row = twoCommits('clean pull request\n');
    t.after(() => fs.rmSync(row.root, {recursive: true, force: true}));
    assert.equal(checkDiff(row.root, {eventName: 'pull_request', pullRequestBase: row.base}).status, 0);
});

test('pull request detects bad whitespace introduced after base SHA', t => {
    const row = twoCommits('bad pull request \n');
    t.after(() => fs.rmSync(row.root, {recursive: true, force: true}));
    const result = checkDiff(row.root, {eventName: 'pull_request', pullRequestBase: row.base});
    assert.notEqual(result.status, 0);
    assert.match(result.messages.join('\n'), /fixture\.txt:1: trailing whitespace\./);
});
