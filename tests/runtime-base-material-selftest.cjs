'use strict';

// Explicit material test, not part of public tests/*.test.cjs discovery.
// Compares intermediate assembly using the frozen external inputs. It does not
// compile Native Helper, install npm packages, create an installer or run ETE.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const assembly = require('../tools/assemble-runtime-base.cjs');
const dependencies = require('../tools/runtime-dependency-contract.cjs');
const sources = require('../tools/copy-tracked-product-sources.cjs');
const web = require('../tools/prepare-web-overlays.cjs');
const preload = require('../tools/prepare-preload.cjs');
const exclusions = require('../tools/runtime-exclusions.cjs');
const {configOutput} = require('../tools/build-input-provenance.cjs');

const root = path.resolve(__dirname, '..');
// A complete historical oracle is optional test evidence, never a production
// acquisition path. Keep it separate from the reduced current input directory.
const oracleRoot=process.env.ETE_LEGACY_RUNTIME_ORACLE_ROOT
    ? path.resolve(process.env.ETE_LEGACY_RUNTIME_ORACLE_ROOT) : path.join(root,'vendor/carnival');
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function inventory(directory) {
    const files = [];
    function walk(current, prefix) {
        for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
            const relative = prefix ? prefix + '/' + entry.name : entry.name;
            if (entry.isDirectory()) walk(path.join(current, entry.name), relative);
            else {
                const bytes = fs.readFileSync(path.join(current, entry.name));
                files.push({path: relative, size: bytes.length, sha256: sha(bytes)});
            }
        }
    }
    walk(directory, '');
    return files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
}

test('frozen-material intermediate payload matches the legacy route after common production transforms', t => {
    const commitResult = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], {encoding: 'utf8'});
    assert.equal(commitResult.status, 0, commitResult.stderr);
    const commit = commitResult.stdout.trim();
    const id = Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex');
    const dist = path.join(root, 'dist');
    const runtimePaths = ['explicit', 'legacy'].map(kind => path.join(dist, 'base-material-' + id + '-' + kind));
    fs.mkdirSync(dist, {recursive: true});
    t.after(() => {
        for (const runtime of runtimePaths) {
            assert.equal(path.dirname(runtime), dist);
            assert.ok(path.basename(runtime).startsWith('base-material-' + id + '-'));
            if (fs.existsSync(runtime)) {
                assert.equal(fs.lstatSync(runtime).isSymbolicLink(), false);
                fs.rmSync(runtime, {recursive: true, force: true});
            }
        }
    });
    for (const runtime of runtimePaths) fs.mkdirSync(runtime);
    const token = dependencies.createOwner(root, runtimePaths[0], commit);
    const result = assembly.assemble(root, commit, runtimePaths[0], token);
    // The oracle deliberately retains the old whole-tree-copy route only here.
    const historicalManifest=JSON.parse(fs.readFileSync(path.join(root,'vendor/runtime-manifest.json')));
    assembly.verifyInputs(oracleRoot,historicalManifest.files);
    fs.cpSync(oracleRoot, runtimePaths[1], {recursive: true});
    const oracleConfig=fs.readFileSync(path.join(runtimePaths[1],'Emby.Theater.exe.config'));
    const oraclePreload=preload.buildPreparedPreload(fs.readFileSync(path.join(runtimePaths[1],'electronapp/preload.js'),'utf8'));
    preload.prepare(root);
    const selected = dependencies.loadSelectedPackages(root).packages;
    for (const runtime of runtimePaths) {
        exclusions.remove(runtime);
        fs.rmSync(path.join(runtime, 'x64/electron'), {recursive: true, force: true});
        fs.rmSync(path.join(runtime, 'electronapp/www/modules/externalplayer'), {recursive: true, force: true});
        sources.materializeTrackedProductSources(root, commit, runtime);
        fs.writeFileSync(path.join(runtime,preload.RUNTIME_PRELOAD_PATH),runtime===runtimePaths[0]?fs.readFileSync(path.join(root,preload.PREPARED_PRELOAD_PATH)):Buffer.from(oraclePreload));
        web.apply(root, runtime);
        const playback = path.join(runtime, 'electronapp/www/modules/common/playback/playbackmanager.js');
        const patched = spawnSync(process.execPath, [path.join(root, 'tools/patch-playbackmanager.cjs'), playback], {encoding: 'utf8'});
        assert.equal(patched.status, 0, patched.stderr);
        fs.copyFileSync(path.join(root, 'vendor/patch/payload/libmpv/mpv-1.dll'), path.join(runtime, 'electronapp/libmpv/x64/mpv-1.dll'));
        fs.writeFileSync(path.join(runtime, 'Emby.Theater.exe.config'), configOutput(runtime===runtimePaths[0]?require('../tools/runtime-template-input.cjs').read(root,'Emby.Theater.exe.config').bytes:oracleConfig));
        // The existing dependency stage deletes these old directories before
        // copying a fresh locked npm closure. Compare its common input boundary.
        for (const entry of selected) fs.rmSync(path.join(runtime, 'electronapp', entry.packagePath), {recursive: true, force: true});
        fs.rmSync(path.join(runtime, dependencies.OWNER_FILE), {force: true});
    }
    const actual = inventory(runtimePaths[0]);
    assert.deepEqual(actual, inventory(runtimePaths[1]));
    const receipt = {schemaVersion: 1, status: 'passed', sourceCommit: commit,
        assemblerWorkingSha256: sha(fs.readFileSync(path.join(root, 'tools/assemble-runtime-base.cjs'))),
        comparedFileCount: actual.length, comparedTreeSha256: sha(Buffer.from(JSON.stringify(actual))),
        assemblyGroups: result.groups,
        scope: 'intermediate payload after production JS/Web/preload/config/libmpv transforms; before fresh npm, official Electron and Native Helper assembly',
        notExecuted: ['npm installation', 'Native Helper compilation', 'full build gate', 'installer', 'application', 'real services']};
    const output = path.join(root, '.work/verification/runtime-base-material-' + id + '.json');
    fs.mkdirSync(path.dirname(output), {recursive: true});
    fs.writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx'});
    t.diagnostic('receipt: .work/verification/' + path.basename(output));
    t.diagnostic('compared files: ' + actual.length);
});
