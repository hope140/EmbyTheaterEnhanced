'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sourceContract = require('../tools/copy-tracked-product-sources.cjs');

function git(root, args) {
    const result = childProcess.spawnSync('git', ['-C', root, ...args], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
}

function writeFile(root, relativePath, value) {
    const file = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, value);
}

function createRepository() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-git-source-'));
    git(root, ['init']);
    git(root, ['config', 'user.name', 'ETE Test']);
    git(root, ['config', 'user.email', 'ete-test@example.invalid']);
    const text = Buffer.from('line-one\nline-two\n', 'utf8');
    const binary = Buffer.from([0x00, 0x0d, 0x0a, 0xff, 0x80, 0x41]);
    writeFile(root, 'src/electronapp/example.js', text);
    writeFile(root, 'src/electronapp/icon.bin', binary);
    git(root, ['add', 'src/electronapp']);
    git(root, ['commit', '-m', 'fixture']);
    return {root, sourceCommit: git(root, ['rev-parse', 'HEAD']), text, binary};
}

function fileSha256(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test('dirty tracked worktree bytes are ignored in favor of committed Git blobs', () => {
    const fixture = createRepository();
    const runtime = path.join(fixture.root, 'runtime-dirty');
    try {
        writeFile(fixture.root, 'src/electronapp/example.js', 'dirty and uncommitted\r\n');
        writeFile(fixture.root, 'src/electronapp/icon.bin', Buffer.from([0xde, 0xad, 0xbe, 0xef]));

        const result = sourceContract.materializeTrackedProductSources(
            fixture.root, fixture.sourceCommit, runtime
        );
        assert.equal(result.fileCount, 2);
        assert.deepEqual(fs.readFileSync(path.join(runtime, 'electronapp/example.js')), fixture.text);
        assert.deepEqual(fs.readFileSync(path.join(runtime, 'electronapp/icon.bin')), fixture.binary);
        assert.notDeepEqual(
            fs.readFileSync(path.join(runtime, 'electronapp/example.js')),
            fs.readFileSync(path.join(fixture.root, 'src/electronapp/example.js'))
        );
    } finally {
        fs.rmSync(fixture.root, {recursive: true, force: true});
    }
});

test('LF and CRLF worktree representations produce the same runtime bytes', () => {
    const fixture = createRepository();
    const runtimeLf = path.join(fixture.root, 'runtime-lf');
    const runtimeCrlf = path.join(fixture.root, 'runtime-crlf');
    try {
        sourceContract.materializeTrackedProductSources(fixture.root, fixture.sourceCommit, runtimeLf);
        writeFile(fixture.root, 'src/electronapp/example.js', 'line-one\r\nline-two\r\n');
        sourceContract.materializeTrackedProductSources(fixture.root, fixture.sourceCommit, runtimeCrlf);

        const lfFile = path.join(runtimeLf, 'electronapp/example.js');
        const crlfFile = path.join(runtimeCrlf, 'electronapp/example.js');
        assert.equal(fileSha256(lfFile), fileSha256(crlfFile));
        assert.deepEqual(fs.readFileSync(crlfFile), fixture.text);
        assert.deepEqual(
            fs.readFileSync(path.join(runtimeCrlf, 'electronapp/icon.bin')),
            fixture.binary
        );
    } finally {
        fs.rmSync(fixture.root, {recursive: true, force: true});
    }
});
