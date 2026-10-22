'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const compatibility = require('../tools/compatibility-resources-input.cjs');
const small = require('../tools/small-runtime-input.cjs');
const exclusions = require('../tools/runtime-exclusions.cjs');
const root = path.resolve(__dirname, '..');
// Independent review boundary: every other manifest entry must survive unchanged.
const approved = [
    'external/Anime4K/Anime4K-off.conf',
    'external/emby.disable/www/modules/layout.css',
    'external/emby.disable/www/modules/themes/darkgradient/theme.css',
    'external/emby.enable/www/modules/layout.css',
    'external/emby.enable/www/modules/themes/darkgradient/theme.css',
    'external/Presets/fonts/Source Han Serif SC-Bold.ttf',
    'Emby.ConfigureAndUninstall.bat',
    'Emby.Dialog.bat',
    'external/Presets/mpv.conf',
    '\u6ce8\u610f\u4e8b\u9879.txt'
];
const approvedSet = new Set(approved);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function runtime(t) {
    const dist = path.join(root, 'dist');
    fs.mkdirSync(dist, {recursive: true});
    const output = fs.mkdtempSync(path.join(dist, 'resource-retirement-'));
    t.after(() => fs.rmSync(output, {recursive: true}));
    return output;
}
function inventory(directory, prefix = '') {
    return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
        const name = prefix + entry.name, full = path.join(directory, entry.name);
        return entry.isDirectory() ? inventory(full, name + '/') : [name];
    }).sort();
}
test('only the ten approved resources are retired; immutable input trees still validate', () => {
    assert.deepEqual([...exclusions.RETIRED_COMPATIBILITY_PATHS, ...exclusions.RETIRED_SMALL_RUNTIME_PATHS].sort(), [...approved].sort());
    assert.equal(compatibility.validate(root).fileCount, 48);
    assert.equal(small.validate(root).fileCount, 4);
});
test('clean assembly preserves all 42 retained files byte for byte and reports both source and runtime identities', t => {
    const output = runtime(t), expected = [];
    for (const input of [compatibility, small]) {
        const manifest = input.load(root), report = input.assemble(root, output);
        const retained = manifest.files.filter(entry => !approvedSet.has(entry.path));
        assert.equal(report.fileCount, manifest.files.length, 'archive identity remains complete');
        assert.equal(report.runtimeFileCount, retained.length);
        assert.equal(report.runtimeBytes, retained.reduce((sum, entry) => sum + entry.size, 0));
        assert.equal(report.runtimeTreeSha256, require('../tools/web-snapshot-input.cjs').treeHash(retained));
        for (const entry of retained) {
            const bytes = fs.readFileSync(path.join(output, entry.path));
            assert.equal(bytes.length, entry.size);
            assert.equal(sha(bytes), entry.sha256, entry.path);
            expected.push(entry.path);
        }
        assert.equal(input.validateRuntime(root, output).status, 'passed');
    }
    assert.equal(expected.length, 42);
    assert.deepEqual(inventory(output), expected.sort());
    assert.equal(exclusions.verify(output).status, 'passed');
    assert.equal(fs.statSync(path.join(output, 'cec-driver/cancel')).size, 0);
});
test('every reintroduced retired resource is rejected by component and final runtime verification', t => {
    const output = runtime(t);
    compatibility.assemble(root, output); small.assemble(root, output);
    for (const name of approved) {
        const file = path.join(output, name), input = name.endsWith('.txt') ? small : compatibility;
        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.writeFileSync(file, 'stale resource');
        assert.throws(() => input.validateRuntime(root, output), /Retired resource present/);
        assert.deepEqual(exclusions.verify(output).presentPaths, [name]);
        fs.unlinkSync(file);
    }
});
test('final exclusion removes only listed program resources and keeps adjacent user-like files', t => {
    const output = runtime(t);
    for (const name of [...approved, 'external/Presets/personal.conf', 'config/system.xml', 'cec-driver/cancel']) {
        fs.mkdirSync(path.dirname(path.join(output, name)), {recursive: true});
        fs.writeFileSync(path.join(output, name), 'synthetic file');
    }
    assert.deepEqual(exclusions.remove(output).removedPaths.sort(), [...approved].sort());
    assert.deepEqual(inventory(output), ['cec-driver/cancel', 'config/system.xml', 'external/Presets/personal.conf']);
});
