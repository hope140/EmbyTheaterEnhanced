'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const trial = require('../src/electronapp/enhanced/shared-playback-cache/trial');

function fixture(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-shared-trial-unit-'));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    const runtimeRoot = path.join(directory, 'runtime'), root = path.join(directory, 'trial');
    const put = (file, bytes) => {fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, bytes);};
    const files = trial.SOURCE_FILES.map((file, index) => {
        const bytes = '// Synthetic runtime fixture ' + index + '\n'; put(path.join(runtimeRoot, file), bytes);
        const digest = crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
        return {sourcePath: 'src/' + file, runtimePath: file, sourceSha256: digest, runtimeSha256: digest};
    });
    const execPath = path.join(runtimeRoot, 'x64/electron/electron.exe'); put(execPath, 'synthetic executable; never launched');
    const sourceCommit = 'a'.repeat(40);
    const manifest = {sourceCommit, validatedProductScope: {sourceCommit, sourceSelection: 'git-commit-blobs', files}};
    const saveManifest = () => put(path.join(runtimeRoot, 'runtime-provenance.json'), JSON.stringify(manifest)); saveManifest();
    trial.createProfile({root});
    const originalPaths = {appData: path.join(directory, 'ordinary-appdata'), userData: path.join(directory, 'ordinary-profile'),
        sessionData: 'old-session', logs: 'old-logs', temp: 'old-temp', crashDumps: 'old-crashes'};
    const paths = {...originalPaths}, calls = [], environment = {APPDATA: 'ordinary', TEMP: 'ordinary-temp', UNRELATED: 'keep'};
    const options = {app: {isReady: () => false, getPath: name => paths[name], setPath: (name, value) => {calls.push([name, value]); paths[name] = value;}},
        argv: [execPath, path.join(runtimeRoot, 'electronapp'), originalPaths.userData, '--ete-shared-cache-trial=' + root],
        execPath, platform: 'win32', environment, runtimeRoot};
    function rejected() {
        const before = {...environment};
        const ordinaryExisted = [originalPaths.userData, originalPaths.appData].map(file => fs.existsSync(file));
        assert.throws(() => trial.prepare(options), /shared playback cache trial startup rejected/);
        assert.equal(calls.length, 0); assert.deepEqual(paths, originalPaths); assert.deepEqual(environment, before);
        assert.deepEqual([originalPaths.userData, originalPaths.appData].map(file => fs.existsSync(file)), ordinaryExisted);
    }
    return {directory, root, runtimeRoot, options, paths, calls, environment, originalPaths, manifest, saveManifest, rejected, put};
}

test('ordinary startup returns null without filesystem, app or environment work', () => {
    const methods = ['lstatSync', 'statSync', 'readFileSync', 'writeFileSync', 'mkdirSync'];
    const originals = methods.map(name => fs[name]);
    try {
        methods.forEach(name => {fs[name] = () => {throw Error('unexpected filesystem access');};});
        const forbidden = new Proxy({}, {get() {throw Error('unexpected app/environment access');}, set() {throw Error('unexpected environment mutation');}});
        assert.equal(trial.prepare({app: forbidden, environment: forbidden, argv: ['electron', 'app', 'ordinary-profile'], platform: 'linux'}), null);
    } finally {methods.forEach((name, index) => {fs[name] = originals[index];});}
});

test('explicit profile creation is private, new-only and has fixed ownership', t => {
    const f = fixture(t);
    assert.equal(fs.readFileSync(path.join(f.root, trial.OWNER_FILE), 'utf8'), trial.OWNER);
    assert.throws(() => trial.createProfile({root: f.root}));
    assert.throws(() => trial.createProfile({root: 'relative-trial'}));
    const unowned = path.join(f.directory, 'unowned'); fs.mkdirSync(unowned); fs.writeFileSync(path.join(unowned, 'sentinel'), 'keep');
    assert.throws(() => trial.createProfile({root: unowned}));
    assert.equal(fs.readFileSync(path.join(unowned, 'sentinel'), 'utf8'), 'keep');
    assert.equal(fs.existsSync(path.join(unowned, trial.OWNER_FILE)), false);
    if (process.platform !== 'win32') {
        assert.equal(fs.statSync(f.root).mode & 0o777, 0o700);
        assert.equal(fs.statSync(path.join(f.root, trial.OWNER_FILE)).mode & 0o777, 0o600);
    }
});

test('Windows positional ordinary profile is overridden; owned restart preserves cache', t => {
    const f = fixture(t), cache = path.join(f.root, 'userdata', 'cached-payload'); fs.writeFileSync(cache, 'retained');
    const result = trial.prepare(f.options);
    assert.equal(result.root, f.root); assert.equal(result.userDataPath, path.join(f.root, 'userdata'));
    assert.equal(result.sourceCommit, f.manifest.sourceCommit); assert.equal(Object.isFrozen(result), true);
    assert.equal(f.calls.length, 6);
    assert.deepEqual(f.paths, {appData: path.join(f.root, 'appdata'), userData: path.join(f.root, 'userdata'), sessionData: path.join(f.root, 'session'),
        logs: path.join(f.root, 'logs'), temp: path.join(f.root, 'temp'), crashDumps: path.join(f.root, 'crashes')});
    assert.deepEqual(f.environment, {APPDATA: f.paths.appData, LOCALAPPDATA: path.join(f.root, 'localappdata'), MPV_HOME: path.join(f.root, 'mpv'),
        TMP: f.paths.temp, TEMP: f.paths.temp, TMPDIR: f.paths.temp, UNRELATED: 'keep'});
    Object.assign(f.paths, f.originalPaths); f.calls.length = 0;
    assert.deepEqual(trial.prepare(f.options), result);
    assert.equal(fs.readFileSync(cache, 'utf8'), 'retained');
    assert.equal(fs.existsSync(f.originalPaths.userData), false);
});

test('malformed, duplicate and mixed experiment flags reject before mutations', async t => {
    const variants = [f => ['--ete-shared-cache-trial'], f => ['--ete-shared-cache-trial='],
        f => ['--ete-shared-cache-trial=relative'], f => ['--ete-shared-cache-trial-other=' + f.root],
        f => ['--ete-shared-cache-trial=' + f.root, '--ete-shared-cache-trial=' + f.root],
        f => ['--ete-shared-cache-trial=' + f.root, '--ete-page-cache-enabled=true']];
    for (const [index, variant] of variants.entries()) await t.test(String(index), t => {
        const f = fixture(t); f.options.argv = f.options.argv.slice(0, 3).concat(variant(f)); f.rejected();
    });
});

test('unprepared, damaged and incomplete profiles reject without creating directories', async t => {
    for (const kind of ['missing', 'owner-missing', 'owner-wrong', 'subdirectory-missing', 'subdirectory-file']) await t.test(kind, t => {
        const f = fixture(t);
        if (kind === 'missing') f.options.argv[3] = '--ete-shared-cache-trial=' + path.join(f.directory, 'not-created');
        if (kind === 'owner-missing') fs.unlinkSync(path.join(f.root, trial.OWNER_FILE));
        if (kind === 'owner-wrong') fs.writeFileSync(path.join(f.root, trial.OWNER_FILE), 'not ours\n');
        if (kind.startsWith('subdirectory')) {fs.rmdirSync(path.join(f.root, 'session')); if (kind.endsWith('file')) fs.writeFileSync(path.join(f.root, 'session'), 'file');}
        f.rejected(); assert.equal(fs.existsSync(path.join(f.directory, 'not-created')), false);
    });
});

test('non-Windows, post-ready and wrong executable/application positions reject', async t => {
    for (const kind of ['platform', 'ready', 'executable', 'application', 'runtime-missing']) await t.test(kind, t => {
        const f = fixture(t);
        if (kind === 'platform') f.options.platform = 'linux';
        if (kind === 'ready') f.options.app.isReady = () => true;
        if (kind === 'executable') {f.options.execPath = path.join(f.directory, 'other.exe'); fs.writeFileSync(f.options.execPath, 'other');}
        if (kind === 'application') f.options.argv[1] = f.directory;
        if (kind === 'runtime-missing') fs.rmSync(f.runtimeRoot, {recursive: true});
        f.rejected();
    });
});

test('ordinary userData, product appData and runtime overlap reject in both directions', async t => {
    for (const kind of ['user-equal', 'user-parent', 'user-child', 'product-equal', 'runtime-child']) await t.test(kind, t => {
        const f = fixture(t);
        const originalGet = f.options.app.getPath;
        if (kind === 'user-equal') f.options.app.getPath = name => name === 'userData' ? f.root : originalGet(name);
        if (kind === 'user-parent') f.options.app.getPath = name => name === 'userData' ? f.directory : originalGet(name);
        if (kind === 'user-child') f.options.app.getPath = name => name === 'userData' ? path.join(f.root, 'ordinary') : originalGet(name);
        if (kind === 'product-equal') {
            const root = path.join(f.directory, 'ordinary-appdata', 'EmbyTheaterEnhanced'); fs.mkdirSync(path.dirname(root)); trial.createProfile({root});
            f.options.argv[3] = '--ete-shared-cache-trial=' + root;
        }
        if (kind === 'runtime-child') {const root = path.join(f.runtimeRoot, 'trial'); trial.createProfile({root}); f.options.argv[3] = '--ete-shared-cache-trial=' + root;}
        f.rejected();
    });
});

test('each required candidate source is mandatory and hash-bound', async t => {
    for (const file of trial.SOURCE_FILES) await t.test(file, t => {
        const f = fixture(t); fs.appendFileSync(path.join(f.runtimeRoot, file), '// tampered'); f.rejected();
    });
});

test('missing source or inconsistent provenance rejects before path changes', async t => {
    for (const kind of ['manifest-missing', 'manifest-invalid', 'commit-invalid', 'scope-commit', 'selection', 'row-missing', 'row-duplicate',
        'source-path', 'runtime-hash', 'source-missing']) await t.test(kind, t => {
        const f = fixture(t), scope = f.manifest.validatedProductScope;
        if (kind === 'commit-invalid') f.manifest.sourceCommit = 'not-a-commit';
        if (kind === 'scope-commit') scope.sourceCommit = 'b'.repeat(40);
        if (kind === 'selection') scope.sourceSelection = 'worktree';
        if (kind === 'row-missing') scope.files.pop();
        if (kind === 'row-duplicate') scope.files.push({...scope.files[0]});
        if (kind === 'source-path') scope.files[0].sourcePath = 'src/unrelated.js';
        if (kind === 'runtime-hash') scope.files[0].runtimeSha256 = '0'.repeat(64);
        f.saveManifest();
        if (kind === 'source-missing') fs.unlinkSync(path.join(f.runtimeRoot, trial.SOURCE_FILES[0]));
        if (kind === 'manifest-missing') fs.unlinkSync(path.join(f.runtimeRoot, 'runtime-provenance.json'));
        if (kind === 'manifest-invalid') fs.writeFileSync(path.join(f.runtimeRoot, 'runtime-provenance.json'), '{');
        f.rejected();
    });
});

test('profile, owner, subdirectory and candidate symlinks are rejected', {skip: process.platform === 'win32' ? 'synthetic link fixture needs Unix symlink support' : false}, async t => {
    for (const kind of ['profile', 'owner', 'subdirectory', 'source', 'manifest', 'executable']) await t.test(kind, t => {
        const f = fixture(t);
        const target = kind === 'profile' ? f.root : kind === 'owner' ? path.join(f.root, trial.OWNER_FILE) :
            kind === 'subdirectory' ? path.join(f.root, 'session') : kind === 'source' ? path.join(f.runtimeRoot, trial.SOURCE_FILES[0]) :
            kind === 'manifest' ? path.join(f.runtimeRoot, 'runtime-provenance.json') : f.options.execPath;
        fs.renameSync(target, target + '.real'); fs.symlinkSync(target + '.real', target); f.rejected();
    });
});

test('hard-linked owner and candidate source are rejected', t => {
    const f = fixture(t), owner = path.join(f.root, trial.OWNER_FILE);
    fs.linkSync(owner, path.join(f.directory, 'owner-link')); f.rejected();
    fs.unlinkSync(path.join(f.directory, 'owner-link'));
    fs.linkSync(path.join(f.runtimeRoot, trial.SOURCE_FILES[0]), path.join(f.directory, 'source-link')); f.rejected();
});
