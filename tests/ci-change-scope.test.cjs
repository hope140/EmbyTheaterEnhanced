'use strict';

const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const scope = require('../tools/ci-change-scope.cjs');
const docs = require('../tools/ci-docs-check.cjs');
const {INPUT_PATHS} = require('../tools/build-input-contract.cjs');

function git(root, args) { return scope.git(root, args).trim(); }
function write(root, file, content = '# Document\n') {
    fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
    fs.writeFileSync(path.join(root, file), content);
}
function commit(root) {
    git(root, ['add', '-A']);
    git(root, ['-c', 'core.hooksPath=', 'commit', '-qm', 'fixture']);
    return git(root, ['rev-parse', 'HEAD']);
}
function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-ci-scope-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    git(root, ['init', '-q']);
    git(root, ['config', 'user.name', 'CI fixture']);
    git(root, ['config', 'user.email', 'ci@example.invalid']);
    git(root, ['config', 'core.autocrlf', 'false']);
    write(root, 'README.md');
    write(root, 'docs/USER_GUIDE.md');
    write(root, 'src/code.js', '// code\n');
    const base = commit(root);
    return {root, base};
}
function push(row, head = git(row.root, ['rev-parse', 'HEAD'])) {
    return {eventName: 'push', pushBefore: row.base, pushHead: head};
}
function pr(row, head = git(row.root, ['rev-parse', 'HEAD'])) {
    return {eventName: 'pull_request', pullRequestBase: row.base, pullRequestHead: head};
}

test('documentation whitelist excludes every declared build input and unknown Markdown path', () => {
    assert.deepEqual(scope.DOC_PATHS.filter(file => INPUT_PATHS.includes(file)), []);
    for (const file of ['THIRD_PARTY_NOTICES.md', 'docs/LICENSING.md', 'docs/LIBMPV_INPUT.md',
        'vendor/README.md', 'installer/languages/SOURCE.md', 'native/windows-media/README.md',
        'tests/fixture.md', 'src/input.md', 'docs/new-unknown.md', 'package.json', '.github/workflows/public-ci.yml']) {
        assert.equal(scope.DOC_PATHS.includes(file), false, file);
    }
});

test('pure documentation passes lightweight checks for both PR and push', t => {
    const row = fixture(t);
    write(row.root, 'README.md', '# Updated\n\n[Guide](docs/USER_GUIDE.md)\n');
    commit(row.root);
    for (const event of [push(row), pr(row)]) {
        const result = scope.classify(row.root, event);
        assert.equal(result.mode, 'docs');
        assert.equal(docs.checkDocs(row.root, result), 1);
    }
});

for (const file of ['src/code.js', 'package-lock.json', '.github/workflows/public-ci.yml',
    'docs/LICENSING.md', 'tests/input.md', 'docs/unknown.md']) {
    test('code, configuration and unaudited documentation require full regression: ' + file, t => {
        const row = fixture(t);
        write(row.root, file, 'changed\n');
        commit(row.root);
        assert.equal(scope.classify(row.root, push(row)).mode, 'full');
    });
}

test('entire PR and push include code followed by a final docs-only commit', t => {
    const row = fixture(t);
    write(row.root, 'src/code.js', '// changed\n');
    const code = commit(row.root);
    write(row.root, 'README.md', '# Last commit is docs\n');
    commit(row.root);
    assert.equal(scope.classify(row.root, pr(row)).mode, 'full');
    assert.equal(scope.classify(row.root, push(row)).mode, 'full');
    assert.equal(scope.classify(row.root, {...push(row), pushBefore: code}).mode, 'docs');
});

test('PR uses event head across a synthetic merge checkout', t => {
    const row = fixture(t);
    write(row.root, 'README.md', '# PR docs\n');
    const head = commit(row.root);
    git(row.root, ['checkout', '-qb', 'base-moved', row.base]);
    write(row.root, 'upstream.txt', 'base advanced\n');
    commit(row.root);
    git(row.root, ['merge', '--no-ff', '-qm', 'synthetic merge', head]);
    assert.equal(scope.classify(row.root, pr(row, head)).mode, 'docs');
    assert.equal(scope.classify(row.root, push(row, head)).mode, 'full');
});

test('force push compares before/head even when before is not an ancestor', t => {
    const row = fixture(t);
    write(row.root, 'src/code.js', '// previous branch\n');
    const before = commit(row.root);
    git(row.root, ['checkout', '-qb', 'rewritten', row.base]);
    write(row.root, 'README.md', '# Rewritten\n');
    commit(row.root);
    assert.equal(scope.classify(row.root, {...push(row), pushBefore: before}).mode, 'full');
});

for (const [from, to, mode] of [
    ['README.md', 'TODO.md', 'docs'],
    ['src/code.js', 'TODO.md', 'full'],
    ['README.md', 'src/input.md', 'full']
]) {
    test('rename checks both endpoints: ' + from + ' to ' + to, t => {
        const row = fixture(t);
        fs.renameSync(path.join(row.root, from), path.join(row.root, to));
        commit(row.root);
        const result = scope.classify(row.root, push(row));
        assert.equal(result.mode, mode);
        assert.ok(result.changes.some(change => change.status.startsWith('R')));
        if (mode === 'docs') assert.equal(docs.checkDocs(row.root, result), 1);
    });
}

for (const [file, mode] of [['README.md', 'docs'], ['src/code.js', 'full']]) {
    test('deletion retains path responsibility: ' + file, t => {
        const row = fixture(t);
        fs.unlinkSync(path.join(row.root, file));
        commit(row.root);
        const result = scope.classify(row.root, push(row));
        assert.equal(result.mode, mode);
        if (mode === 'docs') assert.equal(docs.checkDocs(row.root, result), 0);
    });
}

test('missing/zero/unresolvable refs, unknown event and empty diff fail closed', t => {
    const row = fixture(t);
    const head = row.base;
    const events = [push(row), {...push(row), pushBefore: undefined}, {...push(row), pushBefore: '0'.repeat(40)},
        {...push(row), pushBefore: 'f'.repeat(40)}, {...push(row), pushHead: undefined},
        {...pr(row), pullRequestBase: undefined}, {...pr(row), pullRequestHead: undefined},
        {...pr(row), pullRequestBase: 'HEAD~1'}, {eventName: 'unknown'}];
    for (const event of events) assert.equal(scope.classify(row.root, event).mode, 'full', JSON.stringify(event));
    const output = path.join(row.root, 'output');
    const cli = cp.spawnSync(process.execPath, [path.resolve(__dirname, '../tools/ci-change-scope.cjs'), row.root],
        {env: {...process.env, CI_EVENT_NAME: 'push', CI_PUSH_BEFORE: '0'.repeat(40), CI_PUSH_HEAD: head, GITHUB_OUTPUT: output}, encoding: 'utf8'});
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(fs.readFileSync(output, 'utf8'), 'mode=full\n');
});

test('shallow clone cannot take the documentation shortcut', t => {
    const row = fixture(t);
    write(row.root, 'README.md', '# Changed\n');
    const head = commit(row.root);
    fs.writeFileSync(path.join(row.root, '.git', 'shallow'), row.base + '\n');
    assert.equal(scope.classify(row.root, pr(row, head)).mode, 'full');
});

test('NUL parser preserves unusual paths and rejects unknown/truncated statuses', () => {
    assert.deepEqual(scope.parseChanges('R100\0docs/old\nname.md\0docs/new name.md\0'),
        [{status: 'R100', paths: ['docs/old\nname.md', 'docs/new name.md']}]);
    for (const value of ['', 'M\0README.md', 'R100\0README.md\0', 'T\0README.md\0', 'M\0../README.md\0']) {
        assert.throws(() => scope.parseChanges(value));
    }
});

for (const [content, error] of [
    ['# Bad \n', /whitespace/],
    ['# No final newline', /final newline/],
    ['[Missing](docs/absent.md)\n', /link is invalid/],
    ['[Escape](../outside.md)\n', /link is invalid/],
    ['[Reference][ref]\n\n[ref]: docs/missing.md\n', /link is invalid/],
    [Buffer.from([0xff, 0x0a]), /encoded data/],
    ['nul\0\n', /UTF-8/],
    ['-----BEGIN ' + 'PRIVATE KEY-----\n', /credential-pattern/]
]) {
    test('lightweight gate rejects invalid document: ' + error, t => {
        const row = fixture(t);
        write(row.root, 'README.md', content);
        commit(row.root);
        assert.throws(() => docs.checkDocs(row.root, scope.classify(row.root, push(row))), error);
    });
}

test('local link parser handles inline images, definitions, encoded files and fenced examples', t => {
    const row = fixture(t);
    write(row.root, 'docs/a b.md');
    const text = '# Links\n\n![Guide](docs/USER_GUIDE.md#anchor)\n[File](docs/a%20b.md)\n[ref]: <docs/USER_GUIDE.md>\n' +
        '[External](https://example.invalid/a)\n`[Code](missing.md)`\n```md\n[Example](missing.md)\n```\n';
    write(row.root, 'README.md', text);
    // New unknown docs path intentionally requires full regression; commit the
    // target first, then exercise just the README change.
    git(row.root, ['add', 'docs/a b.md']);
    git(row.root, ['commit', '-qm', 'link target']);
    row.base = git(row.root, ['rev-parse', 'HEAD']);
    commit(row.root);
    assert.equal(docs.checkDocs(row.root, scope.classify(row.root, push(row))), 1);
});

test('historical unchanged link debt is not silently rewritten or treated as a new failure', t => {
    const row = fixture(t);
    write(row.root, 'README.md', '[Archived](missing-history.md)\n');
    row.base = commit(row.root);
    write(row.root, 'README.md', '# New heading\n\n[Archived](missing-history.md)\n');
    commit(row.root);
    assert.equal(docs.checkDocs(row.root, scope.classify(row.root, push(row))), 1);
});

test('documentation checker refuses a full or unresolved scope', () => {
    assert.throws(() => docs.checkDocs('.', {mode: 'full'}), /complete documentation-only range/);
});

test('deleting a document cannot leave a broken link in unchanged audited prose', t => {
    const row = fixture(t);
    write(row.root, 'README.md', '[Guide](docs/USER_GUIDE.md)\n');
    row.base = commit(row.root);
    fs.unlinkSync(path.join(row.root, 'docs/USER_GUIDE.md'));
    commit(row.root);
    assert.throws(() => docs.checkDocs(row.root, scope.classify(row.root, push(row))), /deleted or renamed/);
});

test('renaming prose into another directory rechecks relative link destinations', t => {
    const row = fixture(t);
    write(row.root, 'README.md', '[Guide](docs/USER_GUIDE.md)\n');
    row.base = commit(row.root);
    fs.renameSync(path.join(row.root, 'README.md'), path.join(row.root, 'docs/README.md'));
    commit(row.root);
    assert.throws(() => docs.checkDocs(row.root, scope.classify(row.root, push(row))), /link is invalid/);
});

test('summary explicitly reports documentation regression as NOT EXECUTED', t => {
    const row = fixture(t);
    const summary = path.join(row.root, 'summary');
    const result = cp.spawnSync(process.execPath, [path.resolve(__dirname, '../tools/ci-change-scope.cjs'), 'summary'],
        {env: {...process.env, CI_SCOPE_MODE: 'docs', CI_DOCS_OUTCOME: 'failure', GITHUB_STEP_SUMMARY: summary}, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const content = fs.readFileSync(summary, 'utf8');
    assert.match(content, /Documentation checks: failure/);
    assert.match(content, /regression: \*\*NOT EXECUTED\*\*/);
});

test('symlink in an allowlisted path requires full regression', t => {
    const row = fixture(t);
    // A Git index entry avoids requiring Windows symlink privileges.
    const blob = cp.spawnSync('git', ['hash-object', '-w', '--stdin'], {cwd: row.root, input: 'src/code.js', encoding: 'utf8'});
    assert.equal(blob.status, 0, blob.stderr);
    git(row.root, ['update-index', '--cacheinfo', '120000,' + blob.stdout.trim() + ',README.md']);
    git(row.root, ['commit', '-qm', 'symlink fixture']);
    assert.equal(scope.classify(row.root, push(row)).mode, 'full');
});
