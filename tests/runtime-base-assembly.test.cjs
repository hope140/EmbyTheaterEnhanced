'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const assembly = require('../tools/assemble-runtime-base.cjs');
const dependencies = require('../tools/runtime-dependency-contract.cjs');
const sources = require('../tools/copy-tracked-product-sources.cjs');
const overlays = require('../tools/prepare-web-overlays.cjs');
const inputContract = require('../tools/build-input-contract.cjs');
const tool = path.resolve(__dirname, '../tools/assemble-runtime-base.cjs');

function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function write(root, relative, bytes) {
    const target = path.join(root, ...relative.split('/'));
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, bytes);
}
function json(root, relative, value) { write(root, relative, JSON.stringify(value) + '\n'); }
function git(root, args) {
    const result = spawnSync('git', ['-C', root, ...args], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr || String(result.error));
    return result.stdout.trim();
}
function inventory(root) {
    const result = [];
    function walk(directory, prefix) {
        for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
            const relative = prefix ? prefix + '/' + entry.name : entry.name;
            if (entry.isDirectory()) walk(path.join(directory, entry.name), relative);
            else {
                const bytes = fs.readFileSync(path.join(directory, entry.name));
                result.push({path: relative, size: bytes.length, sha256: sha(bytes)});
            }
        }
    }
    walk(root, '');
    return result.sort((a, b) => a.path.localeCompare(b.path, 'en'));
}
function fixture(t) {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-base-assembly-')));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const vendor = path.join(root, 'vendor/carnival');
    const runtime = path.join(root, 'dist/candidate');
    const source = path.join(root, '.work/runtime-dependencies-fixture');
    fs.mkdirSync(runtime, {recursive: true});
    fs.mkdirSync(source, {recursive: true});
    const baseline = {
        'Emby.Theater.exe': 'host bytes',
        'Emby.Theater.exe.config': 'config base',
        'electronapp/main.js': 'old main',
        'electronapp/package.json': '{"name":"old","version":"1.0.0"}',
        'electronapp/preload.js': 'preload base',
        'electronapp/libmpv/x64/mpv-1.dll': 'old mpv',
        'electronapp/libmpv/x64/mpv-win32-x64.node': 'retired bridge',
        'electronapp/www/index.html': 'web base',
        'electronapp/www/unchanged.js': 'unchanged Web',
        'electronapp/www/modules/common/playback/playbackmanager.js': 'playback base',
        'electronapp/www/modules/externalplayer/old.js': 'retired Web',
        'x64/electron/electron.exe': 'retired electron',
        'external/retained.glsl': 'retained shader',
        'electronapp/node_modules/long/package.json': '{"name":"long","version":"3.2.0"}',
        'electronapp/node_modules/long/legacy.js': 'old dependency residue'
    };
    for (const [name, value] of Object.entries(baseline)) write(vendor, name, value);
    for (const item of dependencies.RETAINED_PACKAGES) {
        json(vendor, 'electronapp/' + item.packagePath + '/package.json',
            {name: item.packagePath.split('/').at(-1), version: item.version});
        write(vendor, 'electronapp/' + item.packagePath + '/index.js', 'retained ' + item.version);
    }
    json(root, 'package.json', {name: 'fixture', version: '1.0.0', dependencies: {long: '5.3.2'}});
    json(root, 'package-lock.json', {lockfileVersion: 3, packages: {
        '': {name: 'fixture', version: '1.0.0', dependencies: {long: '5.3.2'}},
        'node_modules/long': {version: '5.3.2', integrity: 'sha512-YWJjZA=='}
    }});
    json(source, 'package.json', JSON.parse(fs.readFileSync(path.join(root, 'package.json'))));
    json(source, 'package-lock.json', JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'))));
    json(source, 'node_modules/long/package.json', {name: 'long', version: '5.3.2'});
    write(source, 'node_modules/long/index.js', 'new dependency');
    const legacyFiles = inventory(vendor);
    json(root, 'vendor/runtime-manifest.json', {schemaVersion: 1, files: legacyFiles,patchFiles:[]});
    fs.mkdirSync(path.join(root,'vendor/patch'),{recursive:true});
    const web = require('../tools/web-snapshot-input.cjs');
    const webFiles = legacyFiles.filter(item => item.path.startsWith('electronapp/www/') &&
        !item.path.startsWith('electronapp/www/modules/externalplayer/')).map(item => ({
        ...item, originalPath:item.path, path:'www/'+item.path.slice('electronapp/www/'.length)
    }));
    for (const item of webFiles) write(root,'vendor/web-snapshot/'+item.path,
        fs.readFileSync(path.join(vendor,item.originalPath)));
    json(root, web.MANIFEST_PATH, {schemaVersion:1,inputRoot:web.INPUT_ROOT,files:webFiles,userPatches:[],
        fileCount:webFiles.length,bytes:webFiles.reduce((n,f)=>n+f.size,0),treeSha256:web.treeHash(webFiles)});
    write(root, 'src/electronapp/main.js', 'committed main');
    write(root, '.gitignore', '/vendor/carnival/\n/dist/\n/.work/\n');
    git(root, ['init', '-q']);
    git(root, ['config', 'user.name', 'Assembly Fixture']);
    git(root, ['config', 'user.email', 'assembly@example.invalid']);
    git(root, ['config', 'core.autocrlf', 'false']);
    git(root, ['add', '.']);
    git(root, ['commit', '-q', '-m', 'synthetic assembly fixture']);
    const commit = git(root, ['rev-parse', 'HEAD']);
    const token = dependencies.createOwner(root, runtime, commit);
    return {root, vendor, runtime, source, commit, token};
}

test('manifest-derived assembly equals legacy assembly after the same replacement stages', t => {
    const f = fixture(t);
    assembly.assemble(f.root, f.commit, f.runtime, f.token);
    const oracle = path.join(f.root, 'dist/oracle');
    fs.mkdirSync(oracle);
    const oracleToken = dependencies.createOwner(f.root, oracle, f.commit);
    fs.cpSync(f.vendor, oracle, {recursive: true});
    for (const [runtime, token] of [[f.runtime, f.token], [oracle, oracleToken]]) {
        sources.materializeTrackedProductSources(f.root, f.commit, runtime);
        for (const name of ['x64/electron', 'electronapp/www/modules/externalplayer', 'electronapp/libmpv/x64/mpv-win32-x64.node']) {
            fs.rmSync(path.join(runtime, name), {recursive: true, force: true});
        }
        for (const [name, value] of Object.entries({
            'x64/electron/electron.exe': 'pinned electron',
            'electronapp/preload.js': 'generated preload',
            'electronapp/www/index.html': 'generated Web',
            'electronapp/www/modules/common/playback/playbackmanager.js': 'patched playback',
            'electronapp/libmpv/x64/mpv-1.dll': 'pinned mpv',
            'Emby.Theater.exe.config': 'generated config'
        })) write(runtime, name, value);
        dependencies.copyRuntimeDependencies(f.root, runtime, f.source, token);
        assert.equal(dependencies.inspectRuntime(f.root, runtime, f.commit).valid, true);
    }
    assert.deepEqual(inventory(f.runtime), inventory(oracle));
});

test('plan identifies retained inputs, templates, replacements and retired files without materializing them', t => {
    const f = fixture(t);
    const plan = assembly.plan(f.root, f.commit);
    const byPath = new Map(plan.entries.map(entry => [entry.path, entry]));
    assert.equal(byPath.get('Emby.Theater.exe').action, 'copy');
    assert.equal(byPath.get('electronapp/main.js').reason, 'committed-product-source');
    assert.equal(byPath.has('electronapp/www/index.html'), false);
    assert.equal(byPath.has('electronapp/www/modules/common/playback/playbackmanager.js'), false);
    assert.equal(plan.webSnapshot.fileCount, 3);
    assert.equal(byPath.get('electronapp/node_modules/long/legacy.js').action, 'replace');
    assert.equal(byPath.get('external/retained.glsl').action, 'copy');
    assert.equal(plan.groups.reduce((total, group) => total + group.fileCount, 0), plan.entries.length);
    assert.deepEqual(fs.readdirSync(f.runtime), [dependencies.OWNER_FILE]);
    assert.equal(overlays.WEB_OVERLAY_CONTRACT.some(item => item.runtimePath === 'electronapp/www/index.html'), true);
});

test('production material gate and base assembly work when old www is absent',t=>{
    const f=fixture(t);
    fs.rmSync(path.join(f.vendor,'electronapp/www'),{recursive:true});
    const materials=require('../tools/validate-build-materials.cjs');
    assert.equal(materials.validate(f.root).status,'passed');
    assert.equal(assembly.assemble(f.root,f.commit,f.runtime,f.token).webInput.fileCount,3);
    assert.equal(fs.readFileSync(path.join(f.runtime,'electronapp/www/unchanged.js'),'utf8'),'unchanged Web');
    assert.equal(fs.existsSync(path.join(f.runtime,'electronapp/www/modules/externalplayer')),false);
    assert.equal(fs.existsSync(path.join(f.vendor,'electronapp/www')),false);
});

for (const mutation of ['changed-retained', 'changed-excluded', 'extra', 'missing']) {
    test('preflight rejects ' + mutation + ' input before writing any payload', t => {
        const f = fixture(t);
        if (mutation === 'changed-retained') write(f.vendor, 'Emby.Theater.exe', 'changed');
        if (mutation === 'changed-excluded') write(f.vendor, 'x64/electron/electron.exe', 'changed');
        if (mutation === 'extra') write(f.vendor, 'unexpected.js', 'extra');
        if (mutation === 'missing') fs.unlinkSync(path.join(f.vendor, 'Emby.Theater.exe'));
        assert.throws(() => assembly.assemble(f.root, f.commit, f.runtime, f.token), /input/);
        assert.deepEqual(fs.readdirSync(f.runtime), [dependencies.OWNER_FILE]);
    });
}

test('assembly refuses wrong ownership, commit, occupied destinations and repeat attempts', t => {
    const f = fixture(t);
    assert.throws(() => assembly.assemble(f.root, f.commit, f.runtime, '0'.repeat(64)), /ownership marker/);
    assert.throws(() => assembly.assemble(f.root, '0'.repeat(40), f.runtime, f.token), /source commit mismatch/);
    write(f.runtime, 'existing.txt', 'preserve');
    assert.throws(() => assembly.assemble(f.root, f.commit, f.runtime, f.token), /fresh owned runtime/);
    assert.equal(fs.readFileSync(path.join(f.runtime, 'existing.txt'), 'utf8'), 'preserve');
    fs.unlinkSync(path.join(f.runtime, 'existing.txt'));
    assembly.assemble(f.root, f.commit, f.runtime, f.token);
    assert.throws(() => assembly.assemble(f.root, f.commit, f.runtime, f.token), /fresh owned runtime/);
});

test('input and runtime junctions are rejected without touching their targets', t => {
    const f = fixture(t);
    const external = path.join(f.root, 'external-target');
    fs.mkdirSync(external);
    write(external, 'sentinel', 'preserve');
    fs.renameSync(path.join(f.vendor, 'external'), path.join(f.root, 'saved-input'));
    fs.symlinkSync(external, path.join(f.vendor, 'external'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => assembly.assemble(f.root, f.commit, f.runtime, f.token), /link or redirect/);
    assert.deepEqual(fs.readdirSync(f.runtime), [dependencies.OWNER_FILE]);
    const linkedRuntime = path.join(f.root, 'dist/linked');
    fs.symlinkSync(external, linkedRuntime, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => assembly.assemble(f.root, f.commit, linkedRuntime, f.token), /symlink or junction/);
    assert.deepEqual(fs.readdirSync(external), ['sentinel']);
});

test('classification rejects traversal, ambiguous names, marker collisions and invalid identities', () => {
    const entry = {path: 'safe', size: 1, sha256: 'a'.repeat(64)};
    for (const name of ['../outside', '/absolute', 'a\\b', 'C:/outside', 'a//b', dependencies.OWNER_FILE]) {
        assert.throws(() => assembly.classify([{...entry, path: name}], [], [], []), /assembly input path/);
    }
    assert.throws(() => assembly.classify([entry, {...entry, path: 'SAFE'}], [], [], []), /Duplicate/);
    assert.throws(() => assembly.classify([{...entry, sha256: 'bad'}], [], [], []), /identity/);
});

test('the CLI reports its plan and production build binds the assembler to committed inputs', t => {
    const f = fixture(t);
    const result = spawnSync(process.execPath, [tool, 'plan', f.root, f.commit], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).sourceCommit, f.commit);
    const summary = spawnSync(process.execPath, [tool, 'summary', f.root, f.commit], {encoding: 'utf8'});
    assert.equal(summary.status, 0, summary.stderr);
    assert.equal(JSON.parse(summary.stdout).entries, undefined);
    assert.ok(inputContract.INPUT_PATHS.includes('tools/assemble-runtime-base.cjs'));
    const build = fs.readFileSync(path.resolve(__dirname, '../tools/build.ps1'), 'utf8');
    assert.match(build, /assemble-runtime-base\.cjs'\) assemble \$root \$sourceCommit \$destination \$dependencyOwner/);
    assert.doesNotMatch(build, /Get-ChildItem[^\r\n]*vendor\/carnival[^\r\n]*Copy-Item/);
});
