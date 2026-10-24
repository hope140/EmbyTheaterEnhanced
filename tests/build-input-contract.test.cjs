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
const fixtureFactory = require('./helpers/build-input-fixture.cjs').createFactory(process.env.ETE_BUILD_INPUT_FIXTURE_MODE || 'seed');
let fixturePreparations = 0;
function setup(t, temporaryRoot = os.tmpdir()) {
    const started = performance.now();
    const state = fixturePreparations++ === 0 ? 'first-in-process' : 'warm-in-process';
    const fixture = fixtureFactory.create(temporaryRoot);
    t.after(fixture.cleanup);
    t.diagnostic('CI_FIXTURE_PREP ' + JSON.stringify({mode: process.env.ETE_BUILD_INPUT_FIXTURE_MODE || 'seed',
        state, elapsedMs: performance.now() - started}));
    return fixture;
}
test.after(() => fixtureFactory.dispose());

test('temporary parent aliases produce a physical build input fixture', t => {
    const parent = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'build-input-temp-alias-')));
    t.after(() => fs.rmSync(parent, {recursive: true, force: true}));
    const physical = path.join(parent, 'physical');
    const alias = path.join(parent, 'alias');
    fs.mkdirSync(physical);
    fs.symlinkSync(physical, alias, process.platform === 'win32' ? 'junction' : 'dir');
    const fixture = setup(t, alias);
    assert.equal(path.dirname(fixture.base), physical);
    assert.equal(fs.lstatSync(fixture.base).isSymbolicLink(), false);
    assert.equal(fs.realpathSync.native(fixture.repo), fixture.repo);
    assert.equal(contract.inspect(fixture.repo, fixture.sourceCommit).files.length, contract.INPUT_PATHS.length);
    const docs = path.join(fixture.repo, 'docs');
    const redirected = path.join(fixture.base, 'redirected-docs');
    fs.renameSync(docs, redirected);
    fs.symlinkSync(redirected, docs, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => contract.inspect(fixture.repo, fixture.sourceCommit), /links or redirects are forbidden/);
});

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

test('Web overlay patchers are consumed and source-bound build inputs', t => {
    const patcherPaths = [
        'tools/patch-videoosd-lifecycle.cjs', 'tools/patch-connectionmanager-transport.cjs',
        'tools/patch-externalplayer-residue.cjs',
        'tools/patch-item-controls.cjs',
        'tools/patch-content-width.cjs',
        'tools/patch-actionsheet-layout.cjs',
        'tools/patch-item-lifecycle.cjs',
        'tools/patch-search-ui.cjs', 'tools/patch-select-cancel.cjs',
        'tools/patch-startup.cjs',
        'tools/patch-server-home.cjs',
        'tools/patch-movie-browser.cjs'
    ];
    const overlayPath = path.join(__dirname, '..', 'tools', 'prepare-web-overlays.cjs');
    const overlaySource = fs.readFileSync(overlayPath, 'utf8');
    const preparation = require('../tools/prepare-web-overlays.cjs');
    for (const patcherPath of patcherPaths) {
        assert.ok(overlaySource.includes("require('./" + path.basename(patcherPath) + "')"),
            'overlay builder must directly consume ' + patcherPath);
        assert.ok(contract.INPUT_PATHS.includes(patcherPath), 'build input contract omits ' + patcherPath);
        assert.ok(preparation.WEB_OVERLAY_CONTRACT.some(item => item.generatorPaths.includes(patcherPath)),
            'overlay source relation omits ' + patcherPath);

        const fixture = setup(t);
        const result = contract.inspect(fixture.repo, fixture.sourceCommit);
        const patcherInput = result.files.find(item => item.path === patcherPath);
        assert.ok(patcherInput);
        assert.equal(patcherInput.sha256, sha(fs.readFileSync(path.join(fixture.repo, ...patcherPath.split('/')))));

        const patcherFile = path.join(fixture.repo, ...patcherPath.split('/'));
        fs.appendFileSync(patcherFile, 'tampered patcher\n');
        assert.throws(() => contract.inspect(fixture.repo, fixture.sourceCommit), /differs from HEAD/);
    }
});

test('synthetic ZIP build input rejects byte drift hidden by UTF-8 decoding or newline normalization', t => {
    const fixture = setup(t);
    const file = 'tools/windows-host-verifier/fixtures-pending/emby-theater.zip';
    const original = Buffer.from([0xff, 0x0d, 0x0a]);
    write(fixture.repo, file, original);
    git(fixture.repo, ['add', file]); git(fixture.repo, ['commit', '-qm', 'binary fixture']);
    fixture.sourceCommit = git(fixture.repo, ['rev-parse', 'HEAD']);
    assert.equal(contract.inspect(fixture.repo, fixture.sourceCommit).files.find(f => f.path === file).sha256, sha(original));
    for (const changed of [Buffer.from([0xfe, 0x0d, 0x0a]), Buffer.from([0xff, 0x0a])]) {
        write(fixture.repo, file, changed);
        assert.throws(() => contract.inspect(fixture.repo, fixture.sourceCommit), /differs from HEAD/);
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

test('build input and provenance CLIs consume the same committed inputs in fresh processes', t => {
    const fixture = setup(t);
    function cli(name, args) {
        const result = spawnSync(process.execPath, ['--trace-warnings', path.resolve(__dirname, '../tools/' + name), ...args], {encoding: 'utf8'});
        assert.equal(result.status, 0, result.stderr); assert.equal(result.stderr, ''); return JSON.parse(result.stdout);
    }
    const inputs = cli('build-input-contract.cjs', [fixture.repo, fixture.sourceCommit]);
    assert.equal(inputs.sourceCommit, fixture.sourceCommit); assert.equal(inputs.files.length, contract.INPUT_PATHS.length);
    const written = cli('build-input-provenance.cjs', ['write', fixture.repo, fixture.runtime, fixture.sourceCommit]);
    assert.equal(written.status, 'passed');
    assert.deepEqual(cli('build-input-provenance.cjs', ['validate', fixture.repo, fixture.runtime, fixture.sourceCommit]), written);
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

test('write preflight rejects linked config, notice and provenance targets without changing outside canaries', t => {
    for (const relative of [CONFIG_PATH, 'LICENSE', provenance.NAME]) {
        const fixture = setup(t);
        const outside = path.join(fixture.base, 'outside-canary.bin');
        const canary = relative === CONFIG_PATH ? fixture.configBase : Buffer.from('outside-original');
        if (relative !== CONFIG_PATH) write(fixture.runtime, CONFIG_PATH, fixture.configBase);
        fs.writeFileSync(outside, canary);
        const target = path.join(fixture.runtime, ...relative.split('/'));
        fs.mkdirSync(path.dirname(target), {recursive: true});
        try { fs.linkSync(outside, target); }
        catch (error) {
            if (['EPERM', 'EACCES', 'ENOTSUP', 'EOPNOTSUPP', 'EMLINK'].includes(error.code)) {
                t.skip('This filesystem does not permit hardlink fixtures.'); return;
            }
            throw error;
        }
        assert.throws(() => provenance.run('write', fixture.repo, fixture.runtime, fixture.sourceCommit));
        assert.deepEqual(fs.readFileSync(outside), canary);
        assert.deepEqual(fs.readFileSync(path.join(fixture.runtime, CONFIG_PATH)), fixture.configBase);
        assert.equal(fs.existsSync(path.join(fixture.runtime, 'THIRD_PARTY_NOTICES.md')), false);
    }
});

test('write preflight rejects file symlinks without changing outside canaries', t => {
    for (const relative of [CONFIG_PATH, 'LICENSE', provenance.NAME]) {
        const fixture = setup(t);
        const outside = path.join(fixture.base, 'outside-canary.bin');
        const canary = relative === CONFIG_PATH ? fixture.configBase : Buffer.from('outside-original');
        if (relative !== CONFIG_PATH) write(fixture.runtime, CONFIG_PATH, fixture.configBase);
        fs.writeFileSync(outside, canary);
        const target = path.join(fixture.runtime, ...relative.split('/'));
        fs.mkdirSync(path.dirname(target), {recursive: true});
        try { fs.symlinkSync(outside, target, 'file'); }
        catch (error) {
            if (['EPERM', 'EACCES', 'ENOTSUP', 'EOPNOTSUPP'].includes(error.code)) {
                t.skip('This Windows environment does not permit file symlink fixtures.'); return;
            }
            throw error;
        }
        assert.throws(() => provenance.run('write', fixture.repo, fixture.runtime, fixture.sourceCommit));
        assert.deepEqual(fs.readFileSync(outside), canary);
        assert.deepEqual(fs.readFileSync(path.join(fixture.runtime, CONFIG_PATH)), fixture.configBase);
        assert.equal(fs.existsSync(path.join(fixture.runtime, 'THIRD_PARTY_NOTICES.md')), false);
    }
});

test('runtime root and docs junctions are rejected before any output write', t => {
    const runtimeFixture = setup(t);
    const outsideRuntime = path.join(runtimeFixture.base, 'outside-runtime');
    fs.mkdirSync(outsideRuntime);
    fs.rmdirSync(runtimeFixture.runtime);
    try { fs.symlinkSync(outsideRuntime, runtimeFixture.runtime, 'junction'); }
    catch (error) { t.skip('This Windows environment does not permit junction fixtures.'); return; }
    const outsideCanary = path.join(outsideRuntime, 'canary.txt');
    fs.writeFileSync(outsideCanary, 'runtime-root-canary');
    assert.throws(() => provenance.run('write', runtimeFixture.repo, runtimeFixture.runtime, runtimeFixture.sourceCommit));
    assert.equal(fs.readFileSync(outsideCanary, 'utf8'), 'runtime-root-canary');
    assert.deepEqual(fs.readdirSync(outsideRuntime), ['canary.txt']);

    const docsFixture = setup(t);
    const outsideDocs = path.join(docsFixture.base, 'outside-docs');
    fs.mkdirSync(outsideDocs);
    fs.writeFileSync(path.join(outsideDocs, 'canary.txt'), 'docs-junction-canary');
    write(docsFixture.runtime, CONFIG_PATH, docsFixture.configBase);
    try { fs.symlinkSync(outsideDocs, path.join(docsFixture.runtime, 'docs'), 'junction'); }
    catch (error) { t.skip('This Windows environment does not permit docs junction fixtures.'); return; }
    assert.throws(() => provenance.run('write', docsFixture.repo, docsFixture.runtime, docsFixture.sourceCommit));
    assert.equal(fs.readFileSync(path.join(outsideDocs, 'canary.txt'), 'utf8'), 'docs-junction-canary');
    assert.deepEqual(fs.readFileSync(path.join(docsFixture.runtime, CONFIG_PATH)), docsFixture.configBase);
    assert.equal(fs.existsSync(path.join(docsFixture.runtime, 'LICENSE')), false);
});

test('completed runtime and late notice targets fail before config or earlier notices change', t => {
    for (const marker of ['build-manifest.json', provenance.NAME]) {
        const fixture = setup(t);
        write(fixture.runtime, CONFIG_PATH, fixture.configBase);
        write(fixture.runtime, marker, 'completed');
        assert.throws(() => provenance.run('write', fixture.repo, fixture.runtime, fixture.sourceCommit), /Completed runtime outputs/);
        assert.deepEqual(fs.readFileSync(path.join(fixture.runtime, CONFIG_PATH)), fixture.configBase);
        assert.equal(fs.existsSync(path.join(fixture.runtime, 'LICENSE')), false);
    }

    const fixture = setup(t);
    write(fixture.runtime, CONFIG_PATH, fixture.configBase);
    const late = Buffer.from('existing late notice');
    write(fixture.runtime, 'docs/SOURCE_MATERIALS.md', late);
    assert.throws(() => provenance.run('write', fixture.repo, fixture.runtime, fixture.sourceCommit), /Notice output already exists/);
    assert.deepEqual(fs.readFileSync(path.join(fixture.runtime, CONFIG_PATH)), fixture.configBase);
    assert.equal(fs.existsSync(path.join(fixture.runtime, 'LICENSE')), false);
    assert.equal(fs.existsSync(path.join(fixture.runtime, 'THIRD_PARTY_NOTICES.md')), false);
    assert.deepEqual(fs.readFileSync(path.join(fixture.runtime, 'docs/SOURCE_MATERIALS.md')), late);

    const direct = setup(t);
    const inputs = contract.inspect(direct.repo, direct.sourceCommit);
    write(direct.runtime, 'docs/SOURCE_MATERIALS.md', late);
    assert.throws(() => contract.materializeNotices(direct.repo, direct.runtime, inputs), /Notice output already exists/);
    assert.equal(fs.existsSync(path.join(direct.runtime, 'LICENSE')), false);
    assert.deepEqual(fs.readFileSync(path.join(direct.runtime, 'docs/SOURCE_MATERIALS.md')), late);
});

test('write refuses a non-base config and leaves it and all notices untouched', t => {
    const fixture = setup(t);
    const existing = Buffer.from('user-owned config bytes');
    write(fixture.runtime, CONFIG_PATH, existing);
    assert.throws(() => provenance.run('write', fixture.repo, fixture.runtime, fixture.sourceCommit), /verified Carnival base/);
    assert.deepEqual(fs.readFileSync(path.join(fixture.runtime, CONFIG_PATH)), existing);
    assert.equal(fs.existsSync(path.join(fixture.runtime, 'LICENSE')), false);
    assert.equal(fs.existsSync(path.join(fixture.runtime, 'THIRD_PARTY_NOTICES.md')), false);
});

test('normal write atomically transforms the base config and copies raw notice blobs', t => {
    const fixture = setup(t);
    write(fixture.runtime, CONFIG_PATH, fixture.configBase);
    const result = provenance.run('write', fixture.repo, fixture.runtime, fixture.sourceCommit);
    assert.equal(result.status, 'passed');
    assert.deepEqual(fs.readFileSync(path.join(fixture.runtime, CONFIG_PATH)), provenance.configOutput(fixture.configBase));
    const expectedNotice = readBlob(fixture.repo, contract.inspect(fixture.repo, fixture.sourceCommit).files.find(item => item.path === 'LICENSE').gitBlobObjectId);
    assert.deepEqual(fs.readFileSync(path.join(fixture.runtime, 'LICENSE')), expectedNotice);
    assert.equal(fs.existsSync(path.join(fixture.runtime, provenance.NAME)), true);
    assert.equal(fs.readdirSync(fixture.runtime).some(name => name.startsWith('.ete-config-') && name.endsWith('.tmp')), false);
    assert.deepEqual(provenance.run('validate', fixture.repo, fixture.runtime, fixture.sourceCommit), result);
});

test('config base, generated output and generator tampering are rejected', t => {
    const baseFixture = setup(t);
    write(baseFixture.repo, 'tools/templates/runtime/' + CONFIG_PATH, Buffer.concat([baseFixture.configBase, Buffer.from('tampered')]));
    assert.throws(() => provenance.run('write', baseFixture.repo, baseFixture.runtime, baseFixture.sourceCommit), /differs from HEAD|template source identity mismatch/);

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

test('batched inspection preserves exact Git identities and bytes with three Git calls', t => {
    const fixture = setup(t);
    const values = [Buffer.alloc(0), Buffer.from('多行\nblob 17\n\0tail\r\n'), Buffer.from([0xff, 0x00, 0x0a])];
    values.forEach((value, index) => write(fixture.repo, contract.INPUT_PATHS[index], value));
    git(fixture.repo, ['add', '--all']);
    git(fixture.repo, ['update-index', '--chmod=+x', contract.INPUT_PATHS[1]]);
    git(fixture.repo, ['commit', '-q', '-m', 'framing fixtures']);
    fixture.sourceCommit = git(fixture.repo, ['rev-parse', 'HEAD']);
    const cp = require('node:child_process');
    const original = cp.spawnSync;
    const calls = [];
    const mock = t.mock.method(cp, 'spawnSync', (command, args, options) => {
        if (command === 'git') calls.push(args.slice(2));
        return original(command, args, options);
    });
    const result = contract.inspect(fixture.repo, fixture.sourceCommit);
    mock.mock.restore();
    assert.equal(calls.length, 3);
    assert.deepEqual(calls.map(args => args[0]), ['rev-parse', 'ls-tree', 'cat-file']);
    assert.ok(calls[1].includes('-z'));
    assert.deepEqual(calls[2], ['cat-file', '--batch']);
    assert.deepEqual(result, {
        schemaVersion: 1, sourceCommit: fixture.sourceCommit,
        relation: 'HEAD Git blobs; working text must match after CRLF-to-LF normalization',
        files: contract.INPUT_PATHS.map(relativePath => {
            const value = fs.readFileSync(path.join(fixture.repo, ...relativePath.split('/')));
            const objectId = crypto.createHash('sha1').update('blob ' + value.length + '\0').update(value).digest('hex');
            return {path: relativePath, gitBlobObjectId: objectId, sha256: sha(value)};
        })
    });
});

test('invocation-local batches never cache successful working text or a previous HEAD', t => {
    const fixture = setup(t);
    const relative = contract.INPUT_PATHS.at(-1);
    const file = path.join(fixture.repo, ...relative.split('/'));
    const original = fs.readFileSync(file);
    assert.doesNotThrow(() => contract.inspect(fixture.repo, fixture.sourceCommit));
    fs.appendFileSync(file, 'new dirty bytes\n');
    assert.throws(() => contract.inspect(fixture.repo, fixture.sourceCommit), /differs from HEAD/);
    fs.writeFileSync(file, original);
    fs.appendFileSync(file, 'new committed bytes\n');
    git(fixture.repo, ['add', relative]);
    git(fixture.repo, ['commit', '-q', '-m', 'advance bound input']);
    assert.throws(() => contract.inspect(fixture.repo, fixture.sourceCommit), /sourceCommit must equal HEAD/);
    const next = git(fixture.repo, ['rev-parse', 'HEAD']);
    const result = contract.inspect(fixture.repo, next);
    assert.equal(result.files.find(item => item.path === relative).sha256, sha(fs.readFileSync(file)));
});

test('untracked replacement and committed non-regular input retain the regular-blob refusal', t => {
    const fixture = setup(t);
    const relative = contract.INPUT_PATHS[0];
    const file = path.join(fixture.repo, ...relative.split('/'));
    const original = fs.readFileSync(file);
    git(fixture.repo, ['rm', '--', relative]);
    git(fixture.repo, ['commit', '-q', '-m', 'remove tracked input']);
    write(fixture.repo, relative, original);
    let head = git(fixture.repo, ['rev-parse', 'HEAD']);
    assert.throws(() => contract.inspect(fixture.repo, head),
        {message: 'Build input must be a committed regular blob: ' + relative});
    git(fixture.repo, ['add', relative]);
    git(fixture.repo, ['commit', '-q', '-m', 'restore tracked input']);
    const objectId = git(fixture.repo, ['rev-parse', 'HEAD:' + relative]);
    // Set a committed link mode without requiring a Windows symlink privilege.
    git(fixture.repo, ['update-index', '--cacheinfo', '120000,' + objectId + ',' + relative]);
    git(fixture.repo, ['commit', '-q', '-m', 'non-regular tracked input']);
    head = git(fixture.repo, ['rev-parse', 'HEAD']);
    assert.throws(() => contract.inspect(fixture.repo, head),
        {message: 'Build input must be a committed regular blob: ' + relative});
});

test('missing Git blob retains its error and cannot supersede an earlier dirty input', t => {
    const fixture = setup(t);
    const relative = contract.INPUT_PATHS.at(-1);
    const objectId = git(fixture.repo, ['rev-parse', 'HEAD:' + relative]);
    fs.unlinkSync(path.join(fixture.repo, '.git', 'objects', objectId.slice(0, 2), objectId.slice(2)));
    assert.throws(() => contract.inspect(fixture.repo, fixture.sourceCommit),
        {message: 'Tracked generator is not committed: ' + relative});
    const earlier = contract.INPUT_PATHS[0];
    fs.appendFileSync(path.join(fixture.repo, ...earlier.split('/')), 'dirty before missing object\n');
    assert.throws(() => contract.inspect(fixture.repo, fixture.sourceCommit),
        {message: 'Tracked generator differs from HEAD: ' + earlier});
});

test('unusable batch data falls back to original reads without accepting dirty bytes', t => {
    const fixture = setup(t);
    const cp = require('node:child_process');
    const original = cp.spawnSync;
    const first = contract.INPUT_PATHS[0];
    const file = path.join(fixture.repo, ...first.split('/'));
    const bytes = fs.readFileSync(file);
    const variants = [
        result => { const stdout = Buffer.from(result.stdout); stdout[0] |= 0x80; return {...result, stdout}; },
        result => ({...result, stdout: result.stdout.subarray(0, -1)}),
        result => ({...result, stdout: Buffer.concat([result.stdout, Buffer.from('trailing')])}),
        result => ({...result, stdout: Buffer.from(result.stdout.toString('binary').replace(/^[0-9a-f]{40}/, '0'.repeat(40)), 'binary')}),
        result => ({...result, stdout: Buffer.from(result.stdout.toString('binary').replace(' blob ', ' tree '), 'binary')}),
        result => ({...result, stdout: Buffer.from(result.stdout.toString('binary').replace(/ blob \d+\n/, ' blob 999999999999999999\n'), 'binary')}),
        result => ({...result, error: new Error('simulated combined maxBuffer limit'), status: null}),
        () => { throw new Error('simulated batch startup failure'); }
    ];
    for (const corrupt of variants) {
        let fallbackReads = 0;
        const mock = t.mock.method(cp, 'spawnSync', (command, args, options) => {
            const result = original(command, args, options);
            if (command === 'git' && args[2] === 'show') fallbackReads++;
            return command === 'git' && args[2] === 'cat-file' && args[3] === '--batch' ? corrupt(result) : result;
        });
        try {
            assert.equal(contract.inspect(fixture.repo, fixture.sourceCommit).files.length, contract.INPUT_PATHS.length);
            assert.equal(fallbackReads, contract.INPUT_PATHS.length);
            fs.appendFileSync(file, 'dirty after unusable batch\n');
            assert.throws(() => contract.inspect(fixture.repo, fixture.sourceCommit),
                {message: 'Tracked generator differs from HEAD: ' + first});
        } finally {
            fs.writeFileSync(file, bytes);
            mock.mock.restore();
        }
    }
});

test('failed combined tree read keeps the original per-path checks and errors', t => {
    const fixture = setup(t);
    const cp = require('node:child_process');
    const original = cp.spawnSync;
    const mock = t.mock.method(cp, 'spawnSync', (command, args, options) => {
        if (command === 'git' && args[2] === 'ls-tree' && args.includes('-z')) return {status: 1, stdout: '', stderr: 'simulated batch failure'};
        return original(command, args, options);
    });
    try {
        assert.equal(contract.inspect(fixture.repo, fixture.sourceCommit).files.length, contract.INPUT_PATHS.length);
        const first = contract.INPUT_PATHS[0];
        fs.appendFileSync(path.join(fixture.repo, ...first.split('/')), 'dirty with unavailable tree batch\n');
        assert.throws(() => contract.inspect(fixture.repo, fixture.sourceCommit),
            {message: 'Tracked generator differs from HEAD: ' + first});
    } finally { mock.mock.restore(); }
});


test('fixture seeds remain isolated from dirty files, new commits and runtime output', t => {
    const a = setup(t), b = setup(t);
    const file = contract.INPUT_PATHS[0];
    const original = fs.readFileSync(path.join(b.repo, file));
    const head = b.sourceCommit;
    const tree = git(b.repo, ['rev-parse', 'HEAD^{tree}']);
    const blob = git(b.repo, ['rev-parse', 'HEAD:' + file]);
    fs.appendFileSync(path.join(a.repo, file), 'dirty isolation canary\n');
    assert.throws(() => contract.inspect(a.repo, a.sourceCommit), /differs from HEAD/);
    git(a.repo, ['add', file]);
    git(a.repo, ['commit', '-qm', 'advance isolated copy']);
    fs.unlinkSync(path.join(a.repo, 'docs/UNRELATED.md'));
    write(a.runtime, 'canary', 'private runtime');
    const c = setup(t);
    for (const copy of [b, c]) {
        assert.deepEqual(fs.readFileSync(path.join(copy.repo, file)), original);
        assert.equal(git(copy.repo, ['rev-parse', 'HEAD']), copy.sourceCommit);
        assert.equal(git(copy.repo, ['rev-parse', 'HEAD^{tree}']), tree);
        assert.equal(git(copy.repo, ['rev-parse', 'HEAD:' + file]), blob);
        assert.deepEqual(fs.readdirSync(copy.runtime), []);
        assert.equal(fs.existsSync(path.join(copy.repo, '.git/objects/info/alternates')), false);
        assert.equal(fs.existsSync(path.join(copy.repo, 'docs/UNRELATED.md')), true);
        for (const relative of [file, '.git/HEAD', '.git/index', '.git/objects/' + blob.slice(0, 2) + '/' + blob.slice(2)]) {
            const target = path.join(copy.repo, relative), stat = fs.lstatSync(target);
            assert.equal(stat.isSymbolicLink(), false);
            assert.equal(stat.nlink, 1);
            assert.equal(fs.realpathSync.native(target), target);
        }
    }
    assert.equal(git(b.repo, ['rev-parse', 'HEAD']), head);
});
