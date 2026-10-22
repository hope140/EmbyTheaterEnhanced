'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const input = require('../tools/small-runtime-input.cjs');

function fixture(t) {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-small-runtime-')));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const manifest = require('./helpers/small-runtime-fixture.cjs').create(root);
    const source = path.join(root, input.INPUT_ROOT);
    const cold = path.join(root, 'cold');
    fs.mkdirSync(path.join(cold, 'vendor'), {recursive: true});
    fs.copyFileSync(path.join(root, input.MANIFEST_PATH), path.join(cold, input.MANIFEST_PATH));
    return {root, manifest, source, cold, runtime: path.join(cold, 'dist/candidate')};
}

test('four-file cold restoration preserves opaque configuration and excludes Model', t => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.source, 'MediaBrowser.Model.dll'), 'unrelated Model must not be imported');
    assert.equal(input.importSnapshot(f.cold, f.source).fileCount, 4);
    assert.equal(fs.existsSync(path.join(f.cold, 'vendor/carnival')), false);
    assert.equal(fs.existsSync(path.join(f.cold, input.INPUT_ROOT, 'MediaBrowser.Model.dll')), false);
    fs.mkdirSync(f.runtime, {recursive: true});
    fs.writeFileSync(path.join(f.runtime, 'MediaBrowser.Model.dll'), 'unchanged Model');
    input.assemble(f.cold, f.runtime);
    for (const entry of f.manifest.files) {
        assert.deepEqual(fs.readFileSync(path.join(f.runtime, entry.path)), fs.readFileSync(path.join(f.source, entry.path)));
    }
    assert.equal(fs.statSync(path.join(f.runtime, 'cec-driver/cancel')).size, 0);
    assert.equal(input.validateRuntime(f.cold, f.runtime).fileCount, 4);
    assert.equal(fs.readFileSync(path.join(f.runtime, 'MediaBrowser.Model.dll'), 'utf8'), 'unchanged Model');
    assert.throws(() => input.assemble(f.cold, f.runtime), /already exists/);
});

for (const mutation of ['changed', 'missing', 'extra']) {
    test('prepared ' + mutation + ' small input fails before output writes', t => {
        const f = fixture(t), file = path.join(f.source, 'config/system.xml');
        if (mutation === 'changed') fs.appendFileSync(file, 'changed settings');
        if (mutation === 'missing') fs.unlinkSync(file);
        if (mutation === 'extra') fs.writeFileSync(path.join(f.source, 'extra.xml'), 'unexpected');
        assert.throws(() => input.assemble(f.root, path.join(f.root, 'dist/candidate')), /snapshot identity|snapshot input/);
        assert.equal(fs.existsSync(path.join(f.root, 'dist/candidate')), false);
    });
}

test('a bad fourth source file fails before cold destination creation', t => {
    const f = fixture(t), last = f.manifest.files.at(-1);
    fs.appendFileSync(path.join(f.source, last.path), 'changed');
    assert.throws(() => input.importSnapshot(f.cold, f.source), /import identity/);
    assert.equal(fs.existsSync(path.join(f.cold, input.INPUT_ROOT)), false);
});

test('manifest requires the exact four paths and excludes Model, aliases and traversal', t => {
    const f = fixture(t);
    for (const name of ['MediaBrowser.Model.dll', '../outside', 'config/../outside', 'CONFIG/system.xml']) {
        const manifest = structuredClone(f.manifest);
        manifest.files[0].path = name;
        fs.writeFileSync(path.join(f.root, input.MANIFEST_PATH), JSON.stringify(manifest));
        assert.throws(() => input.load(f.root), /Invalid|summary/);
    }
    const incomplete = structuredClone(f.manifest);
    incomplete.files.pop(); incomplete.fileCount--;
    fs.writeFileSync(path.join(f.root, input.MANIFEST_PATH), JSON.stringify(incomplete));
    assert.throws(() => input.load(f.root), /manifest/);
});

test('redirects, arbitrary output directories and runtime configuration tampering are rejected', t => {
    const f = fixture(t);
    assert.throws(() => input.assemble(f.root, path.join(f.root, 'src')), /dedicated dist/);
    input.assemble(f.root, path.join(f.root, 'dist/candidate'));
    fs.appendFileSync(path.join(f.root, 'dist/candidate/config/system.xml'), 'changed settings');
    assert.throws(() => input.validateRuntime(f.root, path.join(f.root, 'dist/candidate')), /runtime identity/);
    const folder = path.join(f.source, 'config'), saved = folder + '-saved';
    fs.renameSync(folder, saved);
    fs.symlinkSync(saved, folder, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => input.validate(f.root), /link|redirect/);
});
