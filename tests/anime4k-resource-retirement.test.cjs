'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const input = require('../tools/compatibility-resources-input.cjs');
const web = require('../tools/web-snapshot-input.cjs');
const exclusions = require('../tools/runtime-exclusions.cjs');
const root = path.resolve(__dirname, '..');
function cold(t) {
    const directory = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-no-shaders-')));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    const manifest = input.load(root);
    for (const name of [input.MANIFEST_PATH, manifest.migration.historicalManifestPath]) {
        fs.mkdirSync(path.dirname(path.join(directory, name)), {recursive: true});
        fs.copyFileSync(path.join(root, name), path.join(directory, name));
    }
    return directory;
}
test('all 39 historical shader identities are retired and no body remains in the active snapshot', () => {
    const manifest = input.load(root);
    const history = JSON.parse(fs.readFileSync(path.join(root, manifest.migration.historicalManifestPath)));
    const shaders = history.files.filter(entry => entry.path.startsWith('external/Anime4K/shaders/'));
    assert.equal(shaders.length, 39);
    assert.equal(shaders.reduce((sum, entry) => sum + entry.size, 0), 2391214);
    assert.deepEqual(exclusions.RETIRED_ANIME4K_PATHS.slice().sort(), shaders.map(entry => entry.path).sort());
    assert.deepEqual(manifest.files, []);
    assert.equal(manifest.fileCount, 0);
    assert.equal(manifest.bytes, 0);
    for (const entry of history.files) assert.equal(fs.existsSync(path.join(root, input.INPUT_ROOT, entry.path)), false);
});
test('clean clone needs only retirement metadata and assembly produces no external resources', t => {
    const directory = cold(t), runtime = path.join(directory, 'dist/candidate');
    fs.mkdirSync(runtime, {recursive: true});
    fs.writeFileSync(path.join(runtime, 'keep.txt'), 'unrelated runtime file');
    assert.equal(fs.existsSync(path.join(directory, input.INPUT_ROOT)), false);
    const report = input.assemble(directory, runtime);
    assert.equal(report.runtimeFileCount, 0);
    assert.equal(report.runtimeBytes, 0);
    assert.equal(report.runtimeTreeSha256, web.treeHash([]));
    assert.deepEqual(fs.readdirSync(runtime), ['keep.txt']);
    assert.equal(input.validateRuntime(directory, runtime).status, 'passed');
    // No source body directory is read or restored for a retired component.
    assert.equal(input.importSnapshot(directory, path.join(directory, 'nonexistent-source')).fileCount, 0);
    assert.equal(fs.existsSync(path.join(directory, input.INPUT_ROOT)), false);
});
test('empty selection does not permit unapproved historical removals', t => {
    const directory = cold(t);
    const manifest = require('./helpers/compatibility-fixture.cjs').create(directory);
    manifest.files = []; manifest.fileCount = 0; manifest.bytes = 0; manifest.treeSha256 = web.treeHash([]);
    fs.writeFileSync(path.join(directory, input.MANIFEST_PATH), JSON.stringify(manifest));
    assert.throws(() => input.load(directory), /Unapproved snapshot migration removal/);
});
for (const kind of ['stale-body', 'redirect', 'dangling-redirect']) test('zero-input validation rejects ' + kind, t => {
    const directory = cold(t), snapshot = path.join(directory, input.INPUT_ROOT);
    fs.mkdirSync(path.dirname(snapshot), {recursive: true});
    if (kind === 'stale-body') {
        fs.mkdirSync(snapshot);
        fs.writeFileSync(path.join(snapshot, 'stale.glsl'), 'unexpected');
    } else {
        const target = path.join(directory, 'elsewhere');
        if (kind === 'redirect') fs.mkdirSync(target);
        fs.symlinkSync(target, snapshot, process.platform === 'win32' ? 'junction' : 'dir');
    }
    assert.throws(() => input.validate(directory), /Unexpected|link|redirect/);
});
test('maintained startup, player, native defaults and preparation have no bundled shader/preset consumer', () => {
    for (const name of ['src/electronapp/main.js', 'src/electronapp/enhanced/bootstrap.js',
        'src/electronapp/plugins/libmpv.js', 'native/mpv-helper/ete-mpv-helper.cpp', 'src/config/system-defaults.json']) {
        assert.doesNotMatch(fs.readFileSync(path.join(root, name), 'utf8'), /Anime4K|external[\\/]Presets|\.glsl\b|\.lua\b/i, name);
    }
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'tools/prepare.ps1'), 'utf8'), /CompatibilitySnapshotRoot|compatibility-resources-input\.cjs'\) import/);
    // The active startup image belongs to maintained source and is still present.
    const index = fs.readFileSync(path.join(root, 'vendor/web-snapshot/www/index.html'), 'utf8');
    assert.match(index, /\.\.\/enhanced\/startup\.svg/);
    assert.equal(fs.existsSync(path.join(root, 'src/electronapp/enhanced/startup.svg')), true);
});
