'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const {execFileSync} = require('node:child_process');
const input = require('../tools/native-loader-input.cjs'), electron = require('../tools/electron-runtime-input.cjs');
const sha = x => require('node:crypto').createHash('sha256').update(x).digest('hex');
function fixture(t) {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-loader-input-'))); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const runtime = path.join(root, 'dist/candidate'), directory = path.join(runtime, 'x64/electron'), lock = require('./helpers/native-loader-fixture.cjs').create(root, directory);
    fs.writeFileSync(path.join(directory, 'electron.exe'), 'synthetic exe'); fs.writeFileSync(path.join(directory, 'version'), '44.4.2');
    const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../vendor/electron-runtime-manifest.json'))), tree = electron.treeIdentity(directory);
    Object.assign(manifest.archive, {sha256: lock.archiveSha256}); Object.assign(manifest.runtime, {electronExeSha256: sha('synthetic exe'), fileCount: tree.fileCount, treeSha256: tree.sha256});
    fs.mkdirSync(path.join(root, 'vendor')); fs.writeFileSync(path.join(root, electron.MANIFEST_PATH), JSON.stringify(manifest));
    fs.mkdirSync(path.join(root, 'tools')); fs.copyFileSync(path.resolve(__dirname, '../tools/native-loader-input.cjs'), path.join(root, 'tools/native-loader-input.cjs'));
    const git = args => execFileSync('git', args, {cwd: root, stdio: 'pipe'});
    git(['init', '-q']); git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'add', 'native', 'tools', 'vendor']);
    git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'synthetic fixture']);
    return {root, runtime, directory, lock};
}
test('production lock fixes reviewed exact source, hash, size, archive and copy relation', () => {
    const lock = input.load(path.resolve(__dirname, '..'));
    assert.equal(lock.size, 939008); assert.equal(lock.sha256, '7611034fc1bc24fa103b4c6bf923974cdec46fa506952d6f82cfef836db99fd1');
    assert.equal(lock.sha256, require('../tools/playback-range-loader-lock.json').sha256);
});
test('assembly copies one official member, preserves complete Electron tree and records notices', t => {
    const f = fixture(t), before = electron.treeIdentity(f.directory); const result = input.assemble(f.root, f.runtime);
    assert.deepEqual(electron.treeIdentity(f.directory), before); assert.equal(result.relation, 'byte-identical-standard-payload-copy');
    assert.equal(result.notices.length, 2); assert.deepEqual(fs.readFileSync(path.join(f.runtime, input.SOURCE)), fs.readFileSync(path.join(f.runtime, input.TARGET)));
    assert.deepEqual(input.validateRuntime(f.root, f.runtime), result); assert.throws(() => input.assemble(f.root, f.runtime), /target-exists/);
});
for (const mutation of ['source', 'source-missing', 'source-extra', 'notice-missing', 'lock', 'dirty-tool', 'target-link', 'outside-dist']) test('assembly refuses ' + mutation + ' before adding a loader', t => {
    const f = fixture(t), target = path.join(f.runtime, input.TARGET);
    if (mutation === 'source') fs.appendFileSync(path.join(f.directory, 'vulkan-1.dll'), 'wrong');
    if (mutation === 'source-missing') fs.unlinkSync(path.join(f.directory, 'vulkan-1.dll'));
    if (mutation === 'source-extra') fs.writeFileSync(path.join(f.directory, 'extra.dll'), 'wrong');
    if (mutation === 'notice-missing') fs.unlinkSync(path.join(f.directory, 'LICENSE'));
    if (mutation === 'lock') {f.lock.targetPath = '../outside'; fs.writeFileSync(path.join(f.root, input.LOCK_PATH), JSON.stringify(f.lock));}
    if (mutation === 'dirty-tool') fs.appendFileSync(path.join(f.root, 'tools/native-loader-input.cjs'), '//wrong');
    if (mutation === 'target-link') {fs.mkdirSync(path.dirname(target), {recursive: true}); fs.symlinkSync(path.join(f.directory, 'vulkan-1.dll'), target);}
    assert.throws(() => input.assemble(f.root, mutation === 'outside-dist' ? f.root : f.runtime));
    if (mutation !== 'target-link') assert(!fs.existsSync(target));
});
for (const mutation of ['missing', 'changed', 'source-changed', 'lock-changed', 'notice-changed']) test('runtime/package dependency gate refuses ' + mutation, t => {
    const f = fixture(t); input.assemble(f.root, f.runtime);
    if (mutation === 'missing') fs.unlinkSync(path.join(f.runtime, input.TARGET));
    if (mutation === 'changed') fs.appendFileSync(path.join(f.runtime, input.TARGET), 'wrong');
    if (mutation === 'source-changed') fs.appendFileSync(path.join(f.runtime, input.SOURCE), 'wrong');
    if (mutation === 'lock-changed') fs.appendFileSync(path.join(f.root, input.LOCK_PATH), ' ');
    if (mutation === 'notice-changed') fs.appendFileSync(path.join(f.directory, 'LICENSES.chromium.html'), 'wrong');
    assert.throws(() => input.validateRuntime(f.root, f.runtime));
});
test('build/package gates bind the lock and enforce validation before packaging', () => {
    const contract = require('../tools/build-input-contract.cjs');
    assert(contract.INPUT_PATHS.includes(input.LOCK_PATH)); assert(contract.INPUT_PATHS.includes('tools/native-loader-input.cjs'));
    const build = fs.readFileSync(path.resolve(__dirname, '../tools/build.ps1'), 'utf8'), runtime = fs.readFileSync(path.resolve(__dirname, '../tools/runtime-provenance.cjs'), 'utf8'), pack = fs.readFileSync(path.resolve(__dirname, '../tools/package.ps1'), 'utf8');
    assert.match(build, /native-loader-input.cjs'\) assemble/); assert.match(runtime, /nativeLoader: nativeLoader.validateRuntime/); assert.match(runtime, /native-loader-invalid/); assert.match(pack, /runtime-provenance.cjs'\) validate/);
});
