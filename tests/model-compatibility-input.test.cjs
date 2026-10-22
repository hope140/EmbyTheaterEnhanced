'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const input=require('../tools/model-compatibility-input.cjs');
function fixture(t){
    const root=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'ete-model-component-')));
    t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    const manifest=require('./helpers/model-compatibility-fixture.cjs').create(root),source=path.join(root,input.INPUT_ROOT),cold=path.join(root,'cold');
    fs.mkdirSync(path.join(cold,'vendor'),{recursive:true});fs.copyFileSync(path.join(root,input.MANIFEST_PATH),path.join(cold,input.MANIFEST_PATH));
    return{root,source,cold,manifest,runtime:path.join(root,'dist/candidate')};
}
test('cold Model import preserves current bytes without old package or official substitution',t=>{
    const f=fixture(t);fs.writeFileSync(path.join(f.source,'unrelated-config.xml'),'do not import');
    assert.equal(input.importSnapshot(f.cold,f.source).fileCount,1);
    assert.equal(fs.existsSync(path.join(f.cold,'vendor/carnival')),false);
    assert.equal(fs.existsSync(path.join(f.cold,input.INPUT_ROOT,'unrelated-config.xml')),false);
    const runtime=path.join(f.cold,'dist/candidate');input.assemble(f.cold,runtime);
    assert.deepEqual(fs.readFileSync(path.join(runtime,'MediaBrowser.Model.dll')),fs.readFileSync(path.join(f.source,'MediaBrowser.Model.dll')));
    assert.equal(input.validateRuntime(f.cold,runtime).fileCount,1);
    assert.throws(()=>input.assemble(f.cold,runtime),/already exists/);
});
for(const mutation of ['changed','missing','extra'])test('Model '+mutation+' input is rejected before output writes',t=>{
    const f=fixture(t),file=path.join(f.source,'MediaBrowser.Model.dll');
    if(mutation==='changed')fs.appendFileSync(file,'different DLL');
    if(mutation==='missing')fs.unlinkSync(file);
    if(mutation==='extra')fs.writeFileSync(path.join(f.source,'extra.dll'),'extra');
    assert.throws(()=>input.assemble(f.root,f.runtime),/snapshot identity|snapshot input/);
    assert.equal(fs.existsSync(f.runtime),false);
});
test('invalid source Model fails before cold input creation',t=>{
    const f=fixture(t);fs.appendFileSync(path.join(f.source,'MediaBrowser.Model.dll'),'different');
    assert.throws(()=>input.importSnapshot(f.cold,f.source),/import identity/);
    assert.equal(fs.existsSync(path.join(f.cold,input.INPUT_ROOT)),false);
});
test('Model manifest forbids traversal, aliases, unrelated files and empty selections',t=>{
    const f=fixture(t);
    for(const name of ['../outside','mediabrowser.model.dll','config/system.xml']){
        const manifest=structuredClone(f.manifest);manifest.files[0].path=name;
        fs.writeFileSync(path.join(f.root,input.MANIFEST_PATH),JSON.stringify(manifest));
        assert.throws(()=>input.load(f.root),/Invalid|summary/);
    }
    fs.writeFileSync(path.join(f.root,input.MANIFEST_PATH),JSON.stringify({...f.manifest,files:[],fileCount:0}));
    assert.throws(()=>input.load(f.root),/manifest/);
});
test('Model redirects, arbitrary outputs and runtime substitution are rejected',t=>{
    const f=fixture(t);assert.throws(()=>input.assemble(f.root,path.join(f.root,'src')),/dedicated dist/);
    input.assemble(f.root,f.runtime);fs.appendFileSync(path.join(f.runtime,'MediaBrowser.Model.dll'),'substituted');
    assert.throws(()=>input.validateRuntime(f.root,f.runtime),/runtime identity/);
    const saved=f.source+'-saved';fs.renameSync(f.source,saved);fs.symlinkSync(saved,f.source,process.platform==='win32'?'junction':'dir');
    assert.throws(()=>input.validate(f.root),/link|redirect/);
});
