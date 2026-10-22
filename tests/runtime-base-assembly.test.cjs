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
        'MediaBrowser.Model.dll': 'unchanged Model fixture',
        'cec-driver/cancel': '',
        'config/system.xml': '<synthetic-config autoUpdate="unchanged"/>',
        'electronapp/plugins/mpvplayer/strings/zh-CN.json': '{"synthetic":"translation"}',
        '\u6ce8\u610f\u4e8b\u9879.txt': 'synthetic historical notice',
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
    const patchBytes=Buffer.from('current libmpv fixture');
    write(root,'vendor/patch/payload/libmpv/mpv-1.dll',patchBytes);
    write(root,'vendor/patch/install-all.bat','historical script');
    const patchFiles=[{path:'payload/libmpv/mpv-1.dll',sha256:sha(patchBytes)},
        {path:'install-all.bat',sha256:sha(Buffer.from('historical script'))}];
    json(root, 'vendor/runtime-manifest.json', {schemaVersion: 1, files: legacyFiles,patchFiles});
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
    const host=require('../tools/windows-host-input.cjs');
    const hostFiles=legacyFiles.filter(item=>item.path==='Emby.Theater.exe');
    for(const item of hostFiles)write(root,host.INPUT_ROOT+'/'+item.path,fs.readFileSync(path.join(vendor,item.path)));
    json(root,host.MANIFEST_PATH,{schemaVersion:1,version:'3.0.20',inputRoot:host.INPUT_ROOT,files:hostFiles,
        fileCount:hostFiles.length,bytes:hostFiles.reduce((n,f)=>n+f.size,0),treeSha256:web.treeHash(hostFiles),
        archive:{size:1,sha256:'0'.repeat(64)}});
    require('./helpers/inherited-npm-fixture.cjs').create(root);
    require('./helpers/runtime-template-fixture.cjs').create(root);
    require('./helpers/libmpv-fixture.cjs').create(root);
    require('./helpers/small-runtime-fixture.cjs').create(root,true);
    require('./helpers/model-compatibility-fixture.cjs').create(root,true);
    require('./helpers/compatibility-fixture.cjs').create(root,legacyFiles.filter(e=>require('../tools/compatibility-resources-input.cjs').isCompatibility(e.path)));
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
        require('../tools/runtime-exclusions.cjs').remove(runtime);
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
        // The oracle applies the same intentional official Model replacement.
        fs.copyFileSync(path.join(f.root,require('../tools/model-compatibility-input.cjs').INPUT_ROOT,'MediaBrowser.Model.dll'),path.join(runtime,'MediaBrowser.Model.dll'));
        dependencies.copyRuntimeDependencies(f.root, runtime, f.source, token);
        assert.equal(dependencies.inspectRuntime(f.root, runtime, f.commit).valid, true);
    }
    assert.deepEqual(inventory(f.runtime), inventory(oracle));
});

test('plan identifies retained inputs, templates, replacements and retired files without materializing them', t => {
    const f = fixture(t);
    const plan = assembly.plan(f.root, f.commit);
    const byPath = new Map(plan.entries.map(entry => [entry.path, entry]));
    assert.equal(byPath.has('Emby.Theater.exe'), false);
    assert.equal(plan.windowsHost.fileCount,1);
    assert.equal(byPath.has('electronapp/main.js'),false);
    assert.equal(plan.historicalEntries.find(item=>item.path==='electronapp/main.js').reason,'committed-product-source');
    assert.equal(byPath.has('electronapp/www/index.html'), false);
    assert.equal(byPath.has('electronapp/www/modules/common/playback/playbackmanager.js'), false);
    assert.equal(plan.webSnapshot.fileCount, 3);
    assert.equal(byPath.has('electronapp/node_modules/long/legacy.js'),false);
    assert.equal(plan.historicalEntries.find(item=>item.path==='electronapp/node_modules/long/legacy.js').action,'replace');
    assert.equal(byPath.has('external/retained.glsl'),false);
    assert.equal(plan.compatibilityResources.fileCount,1);
    assert.equal(plan.smallRuntime.fileCount,4);
    assert.deepEqual(plan.entries,[]);
    assert.equal(plan.modelCompatibility.fileCount,1);
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

test('official Host component replaces old Host input in the production material gate and assembly',t=>{
    const f=fixture(t);
    fs.unlinkSync(path.join(f.vendor,'Emby.Theater.exe'));
    assert.equal(require('../tools/validate-build-materials.cjs').validate(f.root).hostInput.fileCount,1);
    assert.equal(assembly.assemble(f.root,f.commit,f.runtime,f.token).hostInput.fileCount,1);
    assert.equal(fs.readFileSync(path.join(f.runtime,'Emby.Theater.exe'),'utf8'),'host bytes');
    assert.equal(fs.existsSync(path.join(f.vendor,'Emby.Theater.exe')),false);
});

test('independent inherited npm replaces the complete absent old npm directory',t=>{
    const f=fixture(t),npm=require('../tools/inherited-npm-input.cjs');
    fs.rmSync(path.join(f.vendor,'electronapp/node_modules'),{recursive:true});
    const material=require('../tools/validate-build-materials.cjs').validate(f.root);
    const report=assembly.assemble(f.root,f.commit,f.runtime,f.token);
    assert.equal(material.inheritedNpm.fileCount,npm.load(f.root).fileCount);
    assert.equal(report.inheritedNpm.treeSha256,npm.validateRuntime(f.root,f.runtime).treeSha256);
    assert.equal(fs.existsSync(path.join(f.vendor,'electronapp/node_modules')),false);
});

test('maintained templates replace all three absent old template inputs',t=>{
    const f=fixture(t),templates=require('../tools/runtime-template-input.cjs');
    for(const name of Object.keys(templates.FILES))fs.unlinkSync(path.join(f.vendor,name));
    const material=require('../tools/validate-build-materials.cjs').validate(f.root);
    assembly.assemble(f.root,f.commit,f.runtime,f.token);
    assert.equal(material.runtimeTemplates.fileCount,3);
    assert.deepEqual(fs.readFileSync(path.join(f.runtime,'electronapp/package.json')),templates.read(f.root,'electronapp/package.json').bytes);
    for(const name of Object.keys(templates.FILES))assert.equal(fs.existsSync(path.join(f.vendor,name)),false);
});

test('official resource whitelist replaces old XML, sync and English language inputs without changing bytes',t=>{
    const f=fixture(t),host=require('../tools/windows-host-input.cjs');
    const manifest=JSON.parse(fs.readFileSync(path.join(f.root,'vendor/runtime-manifest.json')));
    const component=host.load(f.root),added=['ServiceStack.Text.xml','SimpleInjector.xml','System.Configuration.xml','electronapp/scripts/windowsync.js','electronapp/plugins/mpvplayer/strings/en-US.json'];
    for(const name of added){const bytes=Buffer.from('synthetic official resource: '+name),entry={path:name,size:bytes.length,sha256:sha(bytes)};
        manifest.files.push(entry);component.files.push(entry);write(f.root,host.INPUT_ROOT+'/'+name,bytes);
    }
    component.fileCount=component.files.length;component.bytes=component.files.reduce((n,e)=>n+e.size,0);component.treeSha256=require('../tools/web-snapshot-input.cjs').treeHash(component.files);
    json(f.root,'vendor/runtime-manifest.json',manifest);json(f.root,host.MANIFEST_PATH,component);
    git(f.root,['add','vendor/runtime-manifest.json',host.MANIFEST_PATH]);git(f.root,['commit','-q','-m','synthetic official resource whitelist']);
    const commit=git(f.root,['rev-parse','HEAD']),runtime=path.join(f.root,'dist/resources-candidate');fs.mkdirSync(runtime);const token=dependencies.createOwner(f.root,runtime,commit);
    assert.equal(require('../tools/validate-build-materials.cjs').validate(f.root).hostInput.fileCount,6);
    assembly.assemble(f.root,commit,runtime,token);
    for(const name of added){assert.equal(fs.existsSync(path.join(f.vendor,name)),false);assert.deepEqual(fs.readFileSync(path.join(runtime,name)),fs.readFileSync(path.join(f.root,host.INPUT_ROOT,name)));}
});

for (const mutation of ['changed-retained', 'extra', 'missing']) {
    test('preflight rejects ' + mutation + ' input before writing any payload', t => {
        const f = fixture(t);
        if (mutation === 'changed-retained') write(f.root, 'vendor/compatibility-resources/snapshot-v1/external/retained.glsl', 'changed');
        if (mutation === 'extra') write(f.root, 'vendor/model-compatibility/snapshot-v1/unexpected.js', 'extra');
        if (mutation === 'missing') fs.unlinkSync(path.join(f.root,'vendor/compatibility-resources/snapshot-v1/external/retained.glsl'));
        assert.throws(() => assembly.assemble(f.root, f.commit, f.runtime, f.token), /input|identity/);
        assert.deepEqual(fs.readdirSync(f.runtime), [dependencies.OWNER_FILE]);
    });
}

test('all gate-only predecessor files and unused patch scripts may be absent',t=>{
    const f=fixture(t),plan=assembly.plan(f.root,f.commit);
    for(const item of plan.historicalEntries)fs.unlinkSync(path.join(f.vendor,item.path));
    fs.unlinkSync(path.join(f.root,'vendor/patch/install-all.bat'));
    const material=require('../tools/validate-build-materials.cjs').validate(f.root);
    assert.equal(material.remainingCarnivalFiles,plan.entries.length);
    assert.equal(material.remainingPatchFiles,0);
    assert.equal(material.historicalPatchFiles,2);
    assembly.assemble(f.root,f.commit,f.runtime,f.token);
    assert.equal(fs.existsSync(path.join(f.runtime,'x64/electron/electron.exe')),false);
    assert.equal(fs.existsSync(path.join(f.runtime,'electronapp/libmpv/x64/mpv-win32-x64.node')),false);
});

test('changed retired files are not read or copied, while consumed templates remain checked',t=>{
    const f=fixture(t);
    write(f.vendor,'x64/electron/electron.exe','changed historical body');
    write(f.vendor,'electronapp/main.js','changed historical source');
    write(f.vendor,'electronapp/libmpv/x64/mpv-1.dll','changed historical mpv');
    assert.equal(require('../tools/validate-build-materials.cjs').validate(f.root).status,'passed');
    write(f.root,'tools/templates/runtime/preload.js','changed consumed template');
    assert.throws(()=>assembly.assemble(f.root,f.commit,f.runtime,f.token),/identity mismatch/);
    assert.deepEqual(fs.readdirSync(f.runtime),[dependencies.OWNER_FILE]);
});

test('current independent libmpv hashes and component extras stay strict',t=>{
    const f=fixture(t),materials=require('../tools/validate-build-materials.cjs');
    write(f.root,'vendor/libmpv/20260809/unexpected.dll','extra');
    assert.throws(()=>materials.validate(f.root),/Unexpected Web snapshot input/);
    fs.unlinkSync(path.join(f.root,'vendor/libmpv/20260809/unexpected.dll'));
    write(f.root,'vendor/libmpv/20260809/mpv-1.dll','changed current libmpv');
    assert.throws(()=>materials.validate(f.root),/identity mismatch/);
});

test('the entire old patch directory may be absent through validation and current DLL assembly',t=>{
    const f=fixture(t),libmpv=require('../tools/libmpv-input.cjs');fs.rmSync(path.join(f.root,'vendor/patch'),{recursive:true});
    const report=require('../tools/validate-build-materials.cjs').validate(f.root);assert.equal(report.remainingPatchFiles,0);assert.equal(report.historicalPatchDirectoryRead,false);
    assembly.assemble(f.root,f.commit,f.runtime,f.token);libmpv.assemble(f.root,f.runtime);
    assert.equal(libmpv.validateRuntime(f.root,f.runtime).status,'passed');assert.equal(fs.existsSync(path.join(f.root,'vendor/patch')),false);
});

test('old external resource directories may be absent while exact snapshot output remains checked',t=>{
    const f=fixture(t),compatibility=require('../tools/compatibility-resources-input.cjs');fs.rmSync(path.join(f.vendor,'external'),{recursive:true});
    assert.equal(require('../tools/validate-build-materials.cjs').validate(f.root).compatibilityResources.fileCount,1);assembly.assemble(f.root,f.commit,f.runtime,f.token);
    assert.equal(compatibility.validateRuntime(f.root,f.runtime).status,'passed');assert.equal(fs.existsSync(path.join(f.vendor,'external')),false);
});

test('all four old small paths may be absent while configuration and Model remain unchanged',t=>{
    const f=fixture(t),small=require('../tools/small-runtime-input.cjs');
    const expectedConfig=fs.readFileSync(path.join(f.vendor,'config/system.xml'));
    for(const name of small.SMALL_PATHS)fs.unlinkSync(path.join(f.vendor,name));
    const report=require('../tools/validate-build-materials.cjs').validate(f.root);
    assert.equal(report.remainingCarnivalFiles,0);
    assert.equal(report.remainingPatchFiles,0);
    assert.equal(report.smallRuntimeInput.fileCount,4);
    assembly.assemble(f.root,f.commit,f.runtime,f.token);
    assert.equal(small.validateRuntime(f.root,f.runtime).status,'passed');
    assert.deepEqual(fs.readFileSync(path.join(f.runtime,'config/system.xml')),expectedConfig);
    const modelPath=require('../tools/model-compatibility-input.cjs').INPUT_ROOT+'/MediaBrowser.Model.dll';
    assert.deepEqual(fs.readFileSync(path.join(f.runtime,'MediaBrowser.Model.dll')),fs.readFileSync(path.join(f.root,modelPath)));
    assert.notDeepEqual(fs.readFileSync(path.join(f.runtime,'MediaBrowser.Model.dll')),fs.readFileSync(path.join(f.vendor,'MediaBrowser.Model.dll')));
    for(const name of small.SMALL_PATHS)assert.equal(fs.existsSync(path.join(f.vendor,name)),false);
});

test('remaining Model identity and independent configuration keep strict preflight validation',t=>{
    const f=fixture(t),small=require('../tools/small-runtime-input.cjs');
    const modelInput=path.join(f.root,'vendor/model-compatibility/snapshot-v1/MediaBrowser.Model.dll');
    const model=fs.readFileSync(modelInput);
    fs.writeFileSync(modelInput,'changed Model');
    assert.throws(()=>assembly.assemble(f.root,f.commit,f.runtime,f.token),/identity/);
    assert.deepEqual(fs.readdirSync(f.runtime),[dependencies.OWNER_FILE]);
    fs.writeFileSync(modelInput,model);
    write(f.root,small.INPUT_ROOT+'/config/system.xml','changed configuration');
    assert.throws(()=>assembly.assemble(f.root,f.commit,f.runtime,f.token),/snapshot identity/);
    assert.deepEqual(fs.readdirSync(f.runtime),[dependencies.OWNER_FILE]);
});

test('normal assembly and material gate ignore entirely absent old directories',t=>{
    const f=fixture(t),model=require('../tools/model-compatibility-input.cjs');
    fs.renameSync(f.vendor,path.join(f.root,'historical-material-not-an-input'));
    fs.renameSync(path.join(f.root,'vendor/patch'),path.join(f.root,'historical-patch-not-an-input'));
    const report=require('../tools/validate-build-materials.cjs').validate(f.root);
    assert.equal(report.remainingCarnivalFiles,0);assert.equal(report.remainingPatchFiles,0);
    assembly.assemble(f.root,f.commit,f.runtime,f.token);
    assert.equal(model.validateRuntime(f.root,f.runtime).status,'passed');
    assert.equal(fs.existsSync(f.vendor),false);
});

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
    fs.renameSync(path.join(f.root,'vendor/compatibility-resources/snapshot-v1/external'), path.join(f.root, 'saved-input'));
    fs.symlinkSync(external, path.join(f.root,'vendor/compatibility-resources/snapshot-v1/external'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => assembly.assemble(f.root, f.commit, f.runtime, f.token), /link.*redirect|symlink|junction/);
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
