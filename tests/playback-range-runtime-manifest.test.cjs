'use strict';
const {temporaryRoot} = require('./helpers/range-fixture-root.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {CANDIDATE, sha, hashFile, verifyPayload} = require('../tools/playback-range-windows-smoke.cjs');
const fixture = require('./helpers/range-runtime-v3-fixture.cjs');
const inputs = JSON.parse(fs.readFileSync(fixture.filesPath));
function setup(t) {
    const root = temporaryRoot('ete-v3-payload-');
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    for (const [name, encoded] of Object.entries(inputs.payload)) {const file = path.join(root, name); fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, Buffer.from(encoded, 'base64'));}
    fs.copyFileSync(fixture.manifestPath, path.join(root, 'build-manifest.json'));
    const manifest = JSON.parse(fs.readFileSync(fixture.manifestPath));
    const write = () => {
        manifest.payload.fileCount = manifest.files.length;
        manifest.payload.payloadSetSha256 = sha(manifest.files.map(row => row.path + '\0' + row.sha256 + '\n').join(''));
        fs.writeFileSync(path.join(root, 'build-manifest.json'), JSON.stringify(manifest));
    };
    return {root, manifest, write, check: () => verifyPayload(root, hashFile(path.join(root, 'build-manifest.json')))};
}
test('real-format v3 fixture was emitted by the pinned production PowerShell generator, not a size-bearing mock', () => {
    assert.equal(inputs.generator.commit, CANDIDATE.commit); assert.equal(inputs.generator.path, 'tools/build.ps1');
    assert.equal(sha(fixture.generator()), inputs.generator.blockSha256);
    const manifest = JSON.parse(fs.readFileSync(fixture.manifestPath));
    assert.equal(manifest.schemaVersion, 3); assert.equal(manifest.sourceCommit, CANDIDATE.commit);
    for (const row of manifest.files) assert.deepEqual(Object.keys(row), ['path', 'sha256']);
});
test('production-generator v3 rows without size pass complete path/hash/set/source validation', t => {
    const f = setup(t), result = f.check(); assert.equal(result.inventory.size, f.manifest.files.length + 1);
    for (const row of f.manifest.files) assert.equal(result.inventory.get(row.path).sha256, row.sha256);
});
test('optional correct sizes are additional assertions and mixed size/hash-only rows pass', t => {
    const f = setup(t); f.manifest.files[0].size = fs.statSync(path.join(f.root, f.manifest.files[0].path)).size; f.write(); f.check();
    for (const row of f.manifest.files) row.size = fs.statSync(path.join(f.root, row.path)).size; f.write(); f.check();
});
for (const size of [0, -1, 0.5, null, '21', 999999]) test('present invalid or mismatched size is refused: ' + JSON.stringify(size), t => {
    const f = setup(t); f.manifest.files[0].size = size; f.write(); assert.throws(f.check, /candidate-runtime-file/);
});
test('payload byte tampering is refused when the manifest has no size field', t => {
    const f = setup(t); fs.appendFileSync(path.join(f.root, f.manifest.files[0].path), 'tampered'); assert.throws(f.check, /candidate-runtime-file/);
});
test('tampered manifest hash is refused even with a recomputed aggregate and receipt binding', t => {
    const f = setup(t); f.manifest.files[0].sha256 = '0'.repeat(64); f.write(); assert.throws(f.check, /candidate-runtime-file/);
});
test('missing row hash is refused rather than making a hash-only row unchecked', t => {
    const f = setup(t); delete f.manifest.files[0].sha256; f.write(); assert.throws(f.check, /candidate-runtime-path/);
});
test('a changed otherwise safe path cannot substitute for the listed file', t => {
    const f = setup(t); f.manifest.files[0].path = 'renamed.json'; f.write(); assert.throws(f.check, /candidate-runtime-file/);
});
for (const unsafe of ['/outside', '../outside', 'a/../outside', 'a/./outside', 'a//outside', 'C:/outside', 'a\\outside', 'build-manifest.json']) test('unsafe or self-listing path is refused: ' + unsafe, t => {
    const f = setup(t); f.manifest.files[0].path = unsafe; f.write(); assert.throws(f.check, /candidate-runtime-path/);
});
test('extra actual file is refused', t => {
    const f = setup(t); fs.writeFileSync(path.join(f.root, 'extra.txt'), 'unexpected'); assert.throws(f.check, /candidate-runtime-set/);
});
test('missing actual file is refused', t => {
    const f = setup(t); fs.unlinkSync(path.join(f.root, f.manifest.files[0].path)); assert.throws(f.check, /candidate-runtime-file/);
});
test('removing a listed row cannot hide an extra actual file', t => {
    const f = setup(t); f.manifest.files.shift(); f.write(); assert.throws(f.check, /candidate-runtime-set/);
});
for (const fold of [false, true]) test('duplicate manifest path is refused, case-fold=' + fold, t => {
    const f = setup(t), row = f.manifest.files.find(r => r.path === 'LICENSE.txt');
    f.manifest.files.push({...row, path: fold ? row.path.toLowerCase() : row.path}); f.write(); assert.throws(f.check, /candidate-runtime-path/);
});
for (const schema of [2, 4, '3']) test('unsupported schema fails closed: ' + JSON.stringify(schema), t => {
    const f = setup(t); f.manifest.schemaVersion = schema; f.write(); assert.throws(f.check, /candidate-runtime-source/);
});
test('incorrect source commit is refused despite matching payload hashes', t => {
    const f = setup(t); f.manifest.sourceCommit = 'a'.repeat(40); f.write(); assert.throws(f.check, /candidate-runtime-source/);
});
for (const field of ['fileCount', 'payloadSetSha256']) test('incorrect aggregate ' + field + ' is refused', t => {
    const f = setup(t); f.manifest.payload[field] = field === 'fileCount' ? 999 : '0'.repeat(64);
    fs.writeFileSync(path.join(f.root, 'build-manifest.json'), JSON.stringify(f.manifest)); assert.throws(f.check, /candidate-runtime-set/);
});
test('the archive receipt must still bind the exact manifest bytes', t => {
    const f = setup(t), oldHash = hashFile(path.join(f.root, 'build-manifest.json')); fs.appendFileSync(path.join(f.root, 'build-manifest.json'), '\n');
    assert.throws(() => verifyPayload(f.root, oldHash), /candidate-runtime-manifest/);
});
