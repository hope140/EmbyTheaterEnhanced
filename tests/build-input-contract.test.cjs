'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const contract = require('../tools/build-input-contract.cjs');
const provenance = require('../tools/build-input-provenance.cjs');
const {readBlob} = require('../tools/copy-tracked-product-sources.cjs');

const CONFIG_PATH = 'Emby.Theater.exe.config';
const CONFIG_ANCHOR = '<add key="ProgramDataPath" value=""/>';
const CONFIG_REPLACEMENT = '<add key="ProgramDataPath" value="%ApplicationData%\\EmbyTheaterEnhanced"/>';

function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function write(root, relative, value) {
    const file = path.join(root, ...relative.split('/'));
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, value);
    return file;
}
function json(root, relative, value) { return write(root, relative, JSON.stringify(value, null, 2) + '\n'); }
function git(root, args) {
    const result = spawnSync('git', ['-C', root, ...args], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr || result.error && result.error.message);
    return result.stdout.trim();
}
function setup(t) {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'build-input-contract-'));
    t.after(() => fs.rmSync(base, {recursive: true, force: true}));
    const repo = path.join(base, 'repo');
    const runtime = path.join(base, 'runtime');
    fs.mkdirSync(repo, {recursive: true});
    fs.mkdirSync(runtime, {recursive: true});
    git(repo, ['init', '-q']);
    git(repo, ['config', 'user.name', 'Build Input Test']);
    git(repo, ['config', 'user.email', 'build-input@example.invalid']);
    git(repo, ['config', 'core.autocrlf', 'false']);

    for (const relativePath of contract.INPUT_PATHS) write(repo, relativePath, 'fixture input: ' + relativePath + '\n');
    json(repo, 'package.json', {name: 'build-input-fixture', version: '1.0.0'});
    json(repo, 'package-lock.json', {name: 'build-input-fixture', version: '1.0.0', lockfileVersion: 3, packages: {'': {version: '1.0.0'}}});
    const configBase = Buffer.from('<configuration>\n  ' + CONFIG_ANCHOR + '\n</configuration>\n', 'utf8');
    json(repo, 'vendor/runtime-manifest.json', {schemaVersion: 1, files: [{path: CONFIG_PATH, sha256: sha(configBase)}]});
    write(repo, 'vendor/carnival/' + CONFIG_PATH, configBase);
    write(repo, 'docs/UNRELATED.md', 'unrelated committed documentation\n');
    git(repo, ['add', '--all']);
    git(repo, ['commit', '-q', '-m', 'fixture']);
    return {base, repo, runtime, sourceCommit: git(repo, ['rev-parse', 'HEAD']), configBase};
}

test('build input directory junctions are rejected even when their bytes match', t => {
    const fixture = setup(t);
    const docs = path.join(fixture.repo, 'docs');
    const redirected = path.join(fixture.base, 'redirected-docs');
    fs.renameSync(docs, redirected);
    fs.symlinkSync(redirected, docs, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => contract.inspect(fixture.repo, fixture.sourceCommit), /links or redirects are forbidden/);
});

test('every declared build input rejects dirty working text', t => {
    const fixture = setup(t);
    for (const [index, relativePath] of contract.INPUT_PATHS.entries()) {
        const file = path.join(fixture.repo, ...relativePath.split('/'));
        const original = fs.readFileSync(file);
        fs.writeFileSync(file, Buffer.concat([original, Buffer.from('dirty-' + index + '\n')]));
        assert.throws(() => contract.inspect(fixture.repo, fixture.sourceCommit), /differs from HEAD/,
            'expected dirty input rejection for ' + relativePath);
        fs.writeFileSync(file, original);
    }
});

test('staged input changes are rejected', t => {
    const fixture = setup(t);
    write(fixture.repo, 'package-lock.json', '{"staged":true}\n');
    git(fixture.repo, ['add', 'package-lock.json']);
    assert.throws(() => contract.inspect(fixture.repo, fixture.sourceCommit), /differs from HEAD/);
});

test('missing and linked build inputs are rejected', t => {
    const missingFixture = setup(t);
    const missingPath = contract.INPUT_PATHS[0];
    fs.rmSync(path.join(missingFixture.repo, ...missingPath.split('/')));
    assert.throws(() => contract.inspect(missingFixture.repo, missingFixture.sourceCommit), error => error && error.code === 'ENOENT');

    const linkedFixture = setup(t);
    const linkedPath = contract.INPUT_PATHS[0];
    const linkedFile = path.join(linkedFixture.repo, ...linkedPath.split('/'));
    const target = path.join(linkedFixture.base, 'link-target.txt');
    fs.writeFileSync(target, fs.readFileSync(linkedFile));
    fs.rmSync(linkedFile);
    try { fs.symlinkSync(target, linkedFile, 'file'); }
    catch (error) { t.skip('This Windows environment does not permit creating a file symlink fixture.'); return; }
    assert.throws(() => contract.inspect(linkedFixture.repo, linkedFixture.sourceCommit), /links or redirects are forbidden/);
});

test('sourceCommit must identify the current HEAD', t => {
    const fixture = setup(t);
    const previousCommit = fixture.sourceCommit;
    write(fixture.repo, 'docs/UNRELATED.md', 'second committed documentation revision\n');
    git(fixture.repo, ['add', 'docs/UNRELATED.md']);
    git(fixture.repo, ['commit', '-q', '-m', 'advance head']);
    assert.throws(() => contract.inspect(fixture.repo, previousCommit), /sourceCommit must equal HEAD/);
    assert.doesNotThrow(() => contract.inspect(fixture.repo, git(fixture.repo, ['rev-parse', 'HEAD'])));
});

test('unrelated dirty documentation is outside the build input contract', t => {
    const fixture = setup(t);
    write(fixture.repo, 'docs/UNRELATED.md', 'dirty but unrelated documentation\n');
    const result = contract.inspect(fixture.repo, fixture.sourceCommit);
    assert.equal(result.files.length, contract.INPUT_PATHS.length);
    assert.equal(result.files.some(item => item.path === 'docs/UNRELATED.md'), false);
});

test('CRLF working text matches the committed LF blob', t => {
    const fixture = setup(t);
    const initial = contract.inspect(fixture.repo, fixture.sourceCommit);
    const entry = initial.files.find(item => readBlob(fixture.repo, item.gitBlobObjectId).includes(0x0a));
    assert.ok(entry);
    const blob = readBlob(fixture.repo, entry.gitBlobObjectId);
    write(fixture.repo, entry.path, blob.toString('utf8').replace(/\n/g, '\r\n'));
    const result = contract.inspect(fixture.repo, fixture.sourceCommit);
    assert.equal(result.files.find(item => item.path === entry.path).sha256, sha(blob));
});

test('notice materialization writes raw committed blob bytes', t => {
    const fixture = setup(t);
    const initial = contract.inspect(fixture.repo, fixture.sourceCommit);
    const noticePath = contract.NOTICE_PATHS[0];
    const entry = initial.files.find(item => item.path === noticePath);
    const blob = readBlob(fixture.repo, entry.gitBlobObjectId);
    const crlf = Buffer.from(blob.toString('utf8').replace(/\n/g, '\r\n'), 'utf8');
    assert.notDeepEqual(crlf, blob);
    write(fixture.repo, noticePath, crlf);
    const inspected = contract.inspect(fixture.repo, fixture.sourceCommit);
    contract.materializeNotices(fixture.repo, fixture.runtime, inspected);
    assert.deepEqual(fs.readFileSync(path.join(fixture.runtime, ...noticePath.split('/'))), blob);
    assert.notDeepEqual(fs.readFileSync(path.join(fixture.runtime, ...noticePath.split('/'))), crlf);
});

test('config transform requires exactly one canonical anchor and preserves surrounding text', () => {
    const base = Buffer.from('before\n' + CONFIG_ANCHOR + '\nafter\n', 'utf8');
    assert.equal(provenance.configOutput(base).toString('utf8'), 'before\n' + CONFIG_REPLACEMENT + '\nafter\n');
    assert.throws(() => provenance.configOutput(Buffer.from('no anchor\n')), /exactly one canonical anchor/);
    assert.throws(() => provenance.configOutput(Buffer.from(CONFIG_ANCHOR + '\n' + CONFIG_ANCHOR)), /exactly one canonical anchor/);
});

test('provenance write and validate bind inputs, transformed config and notices', t => {
    const fixture = setup(t);
    const written = provenance.run('write', fixture.repo, fixture.runtime, fixture.sourceCommit);
    assert.deepEqual(written, {status: 'passed', sourceCommit: fixture.sourceCommit,
        fileCount: contract.INPUT_PATHS.length, notices: contract.NOTICE_PATHS.length});
    assert.deepEqual(fs.readFileSync(path.join(fixture.runtime, CONFIG_PATH)), provenance.configOutput(fixture.configBase));
    const output = JSON.parse(fs.readFileSync(path.join(fixture.runtime, provenance.NAME), 'utf8'));
    assert.equal(output.files.length, contract.INPUT_PATHS.length);
    assert.equal(output.notices.length, contract.NOTICE_PATHS.length);
    assert.equal(output.configTransform.generatorPath, 'tools/build-input-provenance.cjs');
    assert.deepEqual(provenance.run('validate', fixture.repo, fixture.runtime, fixture.sourceCommit), written);
    output.schemaVersion = 99;
    json(fixture.runtime, provenance.NAME, output);
    assert.throws(() => provenance.run('validate', fixture.repo, fixture.runtime, fixture.sourceCommit), /provenance mismatch/);
});

test('config base, generated output and generator tampering are rejected', t => {
    const baseFixture = setup(t);
    write(baseFixture.repo, 'vendor/carnival/' + CONFIG_PATH, Buffer.concat([baseFixture.configBase, Buffer.from('tampered')]));
    assert.throws(() => provenance.run('write', baseFixture.repo, baseFixture.runtime, baseFixture.sourceCommit), /Config base does not match/);

    const outputFixture = setup(t);
    provenance.run('write', outputFixture.repo, outputFixture.runtime, outputFixture.sourceCommit);
    write(outputFixture.runtime, CONFIG_PATH, 'tampered generated output');
    assert.throws(() => provenance.run('validate', outputFixture.repo, outputFixture.runtime, outputFixture.sourceCommit), /generated output mismatch/);

    const generatorFixture = setup(t);
    const generatorPath = 'tools/build-input-provenance.cjs';
    const generatorFile = path.join(generatorFixture.repo, ...generatorPath.split('/'));
    fs.appendFileSync(generatorFile, 'tampered generator\n');
    assert.throws(() => provenance.run('write', generatorFixture.repo, generatorFixture.runtime, generatorFixture.sourceCommit), /differs from HEAD/);
});
