'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const plan = require('../tools/ci-build-input-plan.cjs');
const host = require('../tools/ci-source-built-host-plan.cjs');
const committed = require('../tools/build-input-contract.cjs');
const root = path.resolve(__dirname, '..');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

function git(repo, args) { return cp.execFileSync('git', ['-C', repo, ...args], {encoding: 'utf8'}).trim(); }
function write(repo, name, bytes) {
    const target = path.join(repo, name);fs.mkdirSync(path.dirname(target), {recursive: true});fs.writeFileSync(target, bytes);
}
function fixture(t, authorities = true) {
    const repo = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-fixed-git-')));
    t.after(() => fs.rmSync(repo, {recursive: true, force: true}));
    git(repo, ['init', '-q']);git(repo, ['config', 'user.name', 'Fixed input fixture']);
    git(repo, ['config', 'user.email', 'fixture@example.invalid']);git(repo, ['config', 'core.autocrlf', 'false']);
    if (authorities) for (const p of plan.AUTHORITIES) write(repo, p, fs.readFileSync(path.join(root, p)));
    else for (let i = 0; i < 55; i++) write(repo, 'source/file-' + i, Buffer.from('source-' + i + '\r\n\0blob 17\n'));
    git(repo, ['add', '--all']);git(repo, ['commit', '-qm', 'fixed synthetic input']);
    return repo;
}

test('CI authority batch has identical output with four Git calls and raw committed parsing', t => {
    const repo = fixture(t), expected = plan.createPlan(repo), original = cp.spawnSync, calls = [];
    const mock = t.mock.method(cp, 'spawnSync', (command, args, options) => {
        if (command === 'git') calls.push(args[2]);
        return original(command, args, options);
    });
    assert.deepEqual(plan.createPlan(repo), expected);mock.mock.restore();
    assert.deepEqual(calls, ['rev-parse', 'ls-tree', 'cat-file', 'rev-parse']);
    for (const file of plan.AUTHORITIES) {
        const bytes = fs.readFileSync(path.join(repo, file));
        fs.appendFileSync(path.join(repo, file), '\ndirty');
        assert.throws(() => plan.createPlan(repo), /differs from HEAD/);
        fs.writeFileSync(path.join(repo, file), bytes);
    }
    // Windows checkouts can already contain CRLF. Repeating this preparation
    // must not turn CRLF into CRCRLF or change the committed input identity.
    for (let round = 0; round < 2; round++) {
        for (const file of plan.AUTHORITIES) {
            const p = path.join(repo, file);
            fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'));
        }
        assert.deepEqual(plan.createPlan(repo), expected);
    }
    const target = path.join(repo, plan.AUTHORITIES[0]), correct = fs.readFileSync(target);
    fs.writeFileSync(target, correct.toString('utf8').replace(/\n/g, '\r\n'));
    assert.throws(() => plan.createPlan(repo), /differs from HEAD/);
    fs.writeFileSync(target, correct);
});

test('CI authorities recheck HEAD, ordinary committed mode and physical paths on every call', t => {
    const repo = fixture(t), file = plan.AUTHORITIES[0], target = path.join(repo, file);
    const bytes = fs.readFileSync(target);
    git(repo, ['rm', file]);git(repo, ['commit', '-qm', 'remove authority']);fs.writeFileSync(target, bytes);
    assert.throws(() => plan.createPlan(repo), /committed regular blob/);
    git(repo, ['add', file]);git(repo, ['commit', '-qm', 'restore authority']);
    const object = git(repo, ['rev-parse', 'HEAD:' + file]);
    git(repo, ['update-index', '--cacheinfo', '120000,' + object + ',' + file]);git(repo, ['commit', '-qm', 'link mode']);
    assert.throws(() => plan.createPlan(repo), /committed regular blob/);
    git(repo, ['update-index', '--cacheinfo', '100644,' + object + ',' + file]);git(repo, ['commit', '-qm', 'ordinary mode']);
    fs.renameSync(target, target + '.saved');fs.symlinkSync(target + '.saved', target, 'file');
    assert.throws(() => plan.createPlan(repo), /links or redirects/);
    fs.unlinkSync(target);fs.renameSync(target + '.saved', target);
    const original = cp.spawnSync;let heads = 0;
    const mock = t.mock.method(cp, 'spawnSync', (command, args, options) => {
        const result = original(command, args, options);
        return command === 'git' && args[2] === 'rev-parse' && ++heads === 2 ? {...result, stdout: '0'.repeat(40) + '\n'} : result;
    });
    assert.throws(() => plan.createPlan(repo), /HEAD changed during validation/);mock.mock.restore();
});

test('CI malformed batches use verified per-blob fallback and still reject dirty bytes', t => {
    const repo = fixture(t), expected = plan.createPlan(repo), original = cp.spawnSync;
    const file = plan.AUTHORITIES[0], target = path.join(repo, file), bytes = fs.readFileSync(target);
    const variants = [
        r => ({...r, stdout: r.stdout.subarray(0, -1)}),
        r => ({...r, stdout: Buffer.concat([r.stdout, Buffer.from('extra')])}),
        r => { const b = Buffer.from(r.stdout), end = b.indexOf(10);b[end + 1] ^= 1;return {...r, stdout: b}; },
        r => ({...r, error: new Error('combined output limit'), status: null}),
        () => { throw new Error('batch startup failure'); }
    ];
    for (const corrupt of variants) {
        const mock = t.mock.method(cp, 'spawnSync', (command, args, options) => {
            const result = original(command, args, options);
            return command === 'git' && args[2] === 'cat-file' && args[3] === '--batch' ? corrupt(result) : result;
        });
        try {
            assert.deepEqual(plan.createPlan(repo), expected);
            fs.appendFileSync(target, 'dirty');
            assert.throws(() => plan.createPlan(repo), /differs from HEAD/);
        } finally { fs.writeFileSync(target, bytes);mock.mock.restore(); }
    }
});

test('CI fallback rejects bytes that do not match the tree OID even if working bytes match them', t => {
    const repo = fixture(t), file = 'tools/ci-build-input-plan.cjs', target = path.join(repo, file);
    const changed = Buffer.concat([fs.readFileSync(target), Buffer.from('\n// wrong object bytes\n')]);
    const object = git(repo, ['rev-parse', 'HEAD:' + file]);
    fs.writeFileSync(target, changed);
    const original = cp.spawnSync, originalExec = cp.execFileSync;
    const one = t.mock.method(cp, 'spawnSync', (command, args, options) =>
        command === 'git' && args[2] === 'cat-file' && args[3] === '--batch'
            ? {status: 1, stdout: Buffer.alloc(0)} : original(command, args, options));
    const two = t.mock.method(cp, 'execFileSync', (command, args, options) =>
        command === 'git' && args[2] === 'cat-file' && args[4] === object
            ? changed : originalExec(command, args, options));
    assert.throws(() => plan.createPlan(repo), /Git blob identity mismatch/);
    one.mock.restore();two.mock.restore();
});

test('fixed source batch binds all 55 paths, OIDs, raw bytes and per-member hashes', t => {
    const repo = fixture(t, false), commit = git(repo, ['rev-parse', 'HEAD']);
    const sourceFiles = Array.from({length: 55}, (_, i) => {
        const p = 'source/file-' + i, b = fs.readFileSync(path.join(repo, p));
        return {path: p, gitBlob: git(repo, ['rev-parse', commit + ':' + p]), size: b.length, sha256: sha(b)};
    });
    const selection = {commit, sourceFiles}, original = cp.spawnSync, originalExec = cp.execFileSync, calls = [];
    const one = t.mock.method(cp, 'spawnSync', (command, args, options) => {
        if (command === 'git') calls.push(args[2]);return original(command, args, options);
    });
    const two = t.mock.method(cp, 'execFileSync', (command, args, options) => {
        if (command === 'git') calls.push(args[2]);return originalExec(command, args, options);
    });
    const result = host.readSourceBuffers(repo, selection);one.mock.restore();two.mock.restore();
    assert.deepEqual(calls, ['rev-parse', 'ls-tree', 'cat-file']);
    for (const {f, b} of result) assert.deepEqual(b, fs.readFileSync(path.join(repo, f.path)));
    const changed = structuredClone(selection);changed.sourceFiles[54].sha256 = '0'.repeat(64);
    assert.throws(() => host.readSourceBuffers(repo, changed), /source bytes mismatch/);
    changed.sourceFiles[54].sha256 = sourceFiles[54].sha256;changed.sourceFiles[54].gitBlob = '0'.repeat(40);
    assert.throws(() => host.readSourceBuffers(repo, changed), /Git blob mismatch/);
    for (const corrupt of [
        () => { throw new Error('batch startup failure'); },
        r => ({...r, stdout: r.stdout.subarray(0, -1)}),
        r => ({...r, stdout: Buffer.concat([r.stdout, Buffer.from('trailing')])})
    ]) {
        const mock = t.mock.method(cp, 'spawnSync', (command, args, options) => {
            const r = original(command, args, options);
            return command === 'git' && args[2] === 'cat-file' && args[3] === '--batch' ? corrupt(r) : r;
        });
        try {
            assert.deepEqual(host.readSourceBuffers(repo, selection), result);
            assert.throws(() => host.readSourceBuffers(repo, changed), /Git blob mismatch/);
        } finally { mock.mock.restore(); }
    }
    const missing = structuredClone(selection);missing.sourceFiles[0].path = 'source/absent';
    assert.throws(() => host.readSourceBuffers(repo, missing), /Git blob mismatch/);
    git(repo, ['update-index', '--cacheinfo', '120000,' + sourceFiles[0].gitBlob + ',source/file-0']);git(repo, ['commit', '-qm', 'non-regular source']);
    assert.throws(() => host.readSourceBuffers(repo, {...selection, commit: git(repo, ['rev-parse', 'HEAD'])}), /Git blob mismatch/);
    const object = sourceFiles[54].gitBlob;
    fs.unlinkSync(path.join(repo, '.git/objects', object.slice(0, 2), object.slice(2)));
    assert.throws(() => host.readSourceBuffers(repo, selection));
});

test('explicit batch selections cannot become Git expressions or unsafe paths', t => {
    const repo = fixture(t), commit = git(repo, ['rev-parse', 'HEAD']);
    for (const paths of [['../x'], ['x\\y'], ['x:y'], ['/x'], ['x\n'], ['x', 'x']]) {
        assert.throws(() => committed.committedInputs(repo, commit, paths), /Invalid committed input selection/);
    }
});
