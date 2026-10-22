'use strict';

// Explicit current-material regression. The reference copies only manifest-listed
// independent components, never a complete historical package. The optional
// historical-copy comparison remains in audits/runtime-base-legacy-oracle.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const assembly = require('../tools/assemble-runtime-base.cjs');
const dependencies = require('../tools/runtime-dependency-contract.cjs');
const sources = require('../tools/copy-tracked-product-sources.cjs');
const web = require('../tools/prepare-web-overlays.cjs');
const preload = require('../tools/prepare-preload.cjs');
const templates = require('../tools/runtime-template-input.cjs');
const exclusions = require('../tools/runtime-exclusions.cjs');
const libmpv = require('../tools/libmpv-input.cjs');
const {configOutput} = require('../tools/build-input-provenance.cjs');

const root = path.resolve(__dirname, '..');
// Review-approved delta from the frozen manifests, independent of production selection.
const approvedRetirements = new Set([
    'electronapp/www/modules/CustomCssJS.js',
    'electronapp/www/modules/themes/logo.png',
    'electronapp/www/settings/cameraupload.js',
    'electronapp/www/settings/cameraupload.html',
    'electronapp/www/components/directorybrowser/directorybrowser.css',
    'electronapp/www/modules/emby-apiclient/appstorage-cache.js',
    'electronapp/www/serviceworker-app.js',
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
    '注意事项.txt'
]);
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function inventory(directory) {
    const files = [];
    function walk(current, prefix) {
        for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
            const relative = prefix ? prefix + '/' + entry.name : entry.name;
            if (entry.isDirectory()) walk(path.join(current, entry.name), relative);
            else {
                assert.equal(entry.isFile(), true, 'Unexpected non-file: ' + relative);
                const bytes = fs.readFileSync(path.join(current, entry.name));
                files.push({path: relative, size: bytes.length, sha256: sha(bytes)});
            }
        }
    }
    walk(directory, '');
    return files.filter(entry => entry.path !== dependencies.OWNER_FILE)
        .sort((a, b) => a.path.localeCompare(b.path, 'en'));
}
function writeExclusive(runtime, name, bytes) {
    const target = path.join(runtime, name);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, bytes, {flag: 'wx'});
}
function referenceBase(runtime) {
    // Deliberately do not call assemble/plan/classify or component assemblers:
    // this side's file selection comes directly from the independent manifests.
    const components = ['web-snapshot', 'windows-host', 'inherited-npm',
        'compatibility-resources', 'small-runtime', 'model-compatibility'];
    for (const name of components) {
        const manifest = JSON.parse(fs.readFileSync(path.join(root, 'vendor', name + '-manifest.json')));
        for (const entry of manifest.files) {
            const bytes = fs.readFileSync(path.join(root, manifest.inputRoot, entry.path));
            assert.equal(bytes.length, entry.size, name + ': ' + entry.path);
            assert.equal(sha(bytes), entry.sha256.toLowerCase(), name + ': ' + entry.path);
            const runtimePath = name === 'web-snapshot' ? 'electronapp/' + entry.path : entry.path;
            if (!approvedRetirements.has(runtimePath)) {
                const output = require('./helpers/small-runtime-reference.cjs').bytes(root, runtimePath, bytes);
                writeExclusive(runtime, runtimePath, output);
            }
        }
    }
    // Preload and Host config are generated later; only package is a base file.
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'vendor/runtime-templates-manifest.json')));
    const entry = manifest.files.find(entry => entry.kind === 'package');
    assert.ok(entry);
    const source = fs.readFileSync(path.join(root, entry.sourcePath), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(Buffer.byteLength(source), entry.sourceSize);
    assert.equal(sha(source), entry.sourceSha256);
    const bytes = Buffer.from(entry.transform === 'lf-to-crlf' ? source.replace(/\n/g, '\r\n') : source);
    assert.equal(bytes.length, entry.size);
    assert.equal(sha(bytes), entry.sha256);
    writeExclusive(runtime, entry.runtimePath, bytes);
}

test('current fixed components preserve the complete base and transformed intermediate payload', t => {
    const commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
    const dist = path.join(root, 'dist');
    fs.mkdirSync(dist, {recursive: true});
    const runtimePaths = ['assembled', 'reference'].map(kind => fs.mkdtempSync(path.join(dist, 'base-material-' + kind + '-')));
    t.after(() => {
        for (const runtime of runtimePaths) {
            assert.equal(path.dirname(runtime), dist);
            assert.ok(path.basename(runtime).startsWith('base-material-'));
            assert.equal(fs.lstatSync(runtime).isSymbolicLink(), false);
            fs.rmSync(runtime, {recursive: true});
        }
    });
    const token = dependencies.createOwner(root, runtimePaths[0], commit);
    const result = assembly.assemble(root, commit, runtimePaths[0], token);
    referenceBase(runtimePaths[1]);
    // Compare before transforms too, so replacement cannot mask omitted inputs.
    const base = inventory(runtimePaths[0]);
    assert.deepEqual(base, inventory(runtimePaths[1]));

    const generated = preload.prepare(root);
    const referencePreload = preload.buildPreparedPreload(templates.read(root, preload.RUNTIME_PRELOAD_PATH).bytes.toString('utf8'));
    const selected = dependencies.loadSelectedPackages(root).packages;
    const mpv = libmpv.load(root).files[0];
    const referenceMpv = fs.readFileSync(path.join(root, libmpv.INPUT_ROOT, mpv.path));
    assert.equal(referenceMpv.length, mpv.size);
    assert.equal(sha(referenceMpv), mpv.sha256);
    for (const runtime of runtimePaths) {
        exclusions.remove(runtime);
        fs.rmSync(path.join(runtime, 'x64/electron'), {recursive: true, force: true});
        fs.rmSync(path.join(runtime, 'electronapp/www/modules/externalplayer'), {recursive: true, force: true});
        sources.materializeTrackedProductSources(root, commit, runtime);
        writeExclusive(runtime, preload.RUNTIME_PRELOAD_PATH, runtime === runtimePaths[0]
            ? fs.readFileSync(path.join(root, generated.preparedPath)) : Buffer.from(referencePreload));
        web.apply(root, runtime);
        execFileSync(process.execPath, [path.join(root, 'tools/patch-playbackmanager.cjs'),
            path.join(runtime, 'electronapp/www/modules/common/playback/playbackmanager.js')]);
        if (runtime === runtimePaths[0]) libmpv.assemble(root, runtime);
        else writeExclusive(runtime, libmpv.RUNTIME_PATH, referenceMpv);
        writeExclusive(runtime, 'Emby.Theater.exe.config', configOutput(templates.read(root, 'Emby.Theater.exe.config').bytes));
        for (const entry of selected) fs.rmSync(path.join(runtime, 'electronapp', entry.packagePath), {recursive: true, force: true});
    }
    const actual = inventory(runtimePaths[0]);
    assert.deepEqual(actual, inventory(runtimePaths[1]));
    t.diagnostic('compared base files: ' + base.length + '; transformed intermediate files: ' + actual.length);
    t.diagnostic('intermediate tree SHA256: ' + sha(Buffer.from(JSON.stringify(actual))));
    assert.equal(result.status, 'passed');
});
