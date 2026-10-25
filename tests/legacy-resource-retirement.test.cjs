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
    'external/Anime4K/shaders/Anime4K_AutoDownscalePre_x2.glsl',
    'external/Anime4K/shaders/Anime4K_AutoDownscalePre_x4.glsl',
    'external/Anime4K/shaders/Anime4K_Clamp_Highlights.glsl',
    'external/Anime4K/shaders/Anime4K_Darken_Fast.glsl',
    'external/Anime4K/shaders/Anime4K_Darken_HQ.glsl',
    'external/Anime4K/shaders/Anime4K_Darken_VeryFast.glsl',
    'external/Anime4K/shaders/Anime4K_Deblur_DoG.glsl',
    'external/Anime4K/shaders/Anime4K_Deblur_Original.glsl',
    'external/Anime4K/shaders/Anime4K_Denoise_Bilateral_Mean.glsl',
    'external/Anime4K/shaders/Anime4K_Denoise_Bilateral_Median.glsl',
    'external/Anime4K/shaders/Anime4K_Denoise_Bilateral_Mode.glsl',
    'external/Anime4K/shaders/Anime4K_Restore_CNN_L.glsl',
    'external/Anime4K/shaders/Anime4K_Restore_CNN_M.glsl',
    'external/Anime4K/shaders/Anime4K_Restore_CNN_S.glsl',
    'external/Anime4K/shaders/Anime4K_Restore_CNN_Soft_L.glsl',
    'external/Anime4K/shaders/Anime4K_Restore_CNN_Soft_M.glsl',
    'external/Anime4K/shaders/Anime4K_Restore_CNN_Soft_S.glsl',
    'external/Anime4K/shaders/Anime4K_Restore_CNN_Soft_UL.glsl',
    'external/Anime4K/shaders/Anime4K_Restore_CNN_Soft_VL.glsl',
    'external/Anime4K/shaders/Anime4K_Restore_CNN_UL.glsl',
    'external/Anime4K/shaders/Anime4K_Restore_CNN_VL.glsl',
    'external/Anime4K/shaders/Anime4K_Thin_Fast.glsl',
    'external/Anime4K/shaders/Anime4K_Thin_HQ.glsl',
    'external/Anime4K/shaders/Anime4K_Thin_VeryFast.glsl',
    'external/Anime4K/shaders/Anime4K_Upscale_CNN_x2_L.glsl',
    'external/Anime4K/shaders/Anime4K_Upscale_CNN_x2_M.glsl',
    'external/Anime4K/shaders/Anime4K_Upscale_CNN_x2_S.glsl',
    'external/Anime4K/shaders/Anime4K_Upscale_CNN_x2_UL.glsl',
    'external/Anime4K/shaders/Anime4K_Upscale_CNN_x2_VL.glsl',
    'external/Anime4K/shaders/Anime4K_Upscale_Deblur_DoG_x2.glsl',
    'external/Anime4K/shaders/Anime4K_Upscale_Deblur_Original_x2.glsl',
    'external/Anime4K/shaders/Anime4K_Upscale_Denoise_CNN_x2_L.glsl',
    'external/Anime4K/shaders/Anime4K_Upscale_Denoise_CNN_x2_M.glsl',
    'external/Anime4K/shaders/Anime4K_Upscale_Denoise_CNN_x2_S.glsl',
    'external/Anime4K/shaders/Anime4K_Upscale_Denoise_CNN_x2_UL.glsl',
    'external/Anime4K/shaders/Anime4K_Upscale_Denoise_CNN_x2_VL.glsl',
    'external/Anime4K/shaders/Anime4K_Upscale_DoG_x2.glsl',
    'external/Anime4K/shaders/Anime4K_Upscale_DTD_x2.glsl',
    'external/Anime4K/shaders/Anime4K_Upscale_Original_x2.glsl',
    'external/Anime4K/Anime4K-off.conf',
    'external/emby.disable/www/modules/layout.css',
    'external/emby.disable/www/modules/themes/darkgradient/theme.css',
    'external/emby.enable/www/modules/layout.css',
    'external/emby.enable/www/modules/themes/darkgradient/theme.css',
    'external/Presets/fonts/Source Han Serif SC-Bold.ttf',
    'Emby.ConfigureAndUninstall.bat',
    'Emby.Dialog.bat',
    'external/Presets/mpv.conf',
    'cec-driver/cancel',
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
test('only the fifty approved resources are retired; current input selections still validate', () => {
    assert.deepEqual([...exclusions.RETIRED_COMPATIBILITY_PATHS, ...exclusions.RETIRED_SMALL_RUNTIME_PATHS].sort(), [...approved].sort());
    assert.equal(compatibility.validate(root).fileCount, 0);
    assert.equal(small.validate(root).fileCount, 2);
});
test('clean assembly omits all compatibility resources and applies the two maintained small outputs', t => {
    const output = runtime(t), expected = [];
    for (const input of [compatibility, small]) {
        const manifest = input.load(root), report = input.assemble(root, output);
        const retained = manifest.files.filter(entry => !approvedSet.has(entry.path)).map(entry => {
            const original = fs.readFileSync(path.join(root, input.INPUT_ROOT, entry.path));
            const bytes = require('./helpers/small-runtime-reference.cjs').bytes(root, entry.path, original);
            return {...entry, size: bytes.length, sha256: sha(bytes)};
        });
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
    assert.equal(expected.length, 2);
    assert.deepEqual(inventory(output), expected.sort());
    assert.equal(exclusions.verify(output).status, 'passed');
    assert.equal(fs.existsSync(path.join(output, 'cec-driver/cancel')), false);
});
test('every reintroduced retired resource is rejected by component and final runtime verification', t => {
    const output = runtime(t);
    compatibility.assemble(root, output); small.assemble(root, output);
    for (const name of approved) {
        const file = path.join(output, name), input = (name.endsWith('.txt') || name === 'cec-driver/cancel') ? small : compatibility;
        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.writeFileSync(file, 'stale resource');
        assert.throws(() => input.validateRuntime(root, output), /Retired resource present/);
        assert.deepEqual(exclusions.verify(output).presentPaths, [name]);
        fs.unlinkSync(file);
    }
});
test('final exclusion removes only listed program resources and keeps adjacent user-like files', t => {
    const output = runtime(t);
    for (const name of [...approved, 'external/Presets/personal.conf', 'config/system.xml', 'user-profile/cec-driver/cancel']) {
        fs.mkdirSync(path.dirname(path.join(output, name)), {recursive: true});
        fs.writeFileSync(path.join(output, name), 'synthetic file');
    }
    assert.deepEqual(exclusions.remove(output).removedPaths.sort(), [...approved].sort());
    assert.deepEqual(inventory(output), ['config/system.xml', 'external/Presets/personal.conf', 'user-profile/cec-driver/cancel']);
});
