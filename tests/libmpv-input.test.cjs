'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const input=require('../tools/libmpv-input.cjs');
function fixture(t){const root=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'ete-libmpv-input-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const bytes=Buffer.from('synthetic DLL bytes, never executed');fs.mkdirSync(path.join(root,'vendor'));const manifest=require('./helpers/libmpv-fixture.cjs').create(root,bytes);const source=path.join(root,'fixed-snapshot.dll');fs.writeFileSync(source,bytes);return{root,bytes,source,manifest,runtime:path.join(root,'dist/candidate')};}
test('single fixed snapshot imports and assembles exact runtime path without old patch or online recovery',t=>{
    const f=fixture(t),cold=path.join(f.root,'cold');fs.mkdirSync(path.join(cold,'vendor'),{recursive:true});fs.copyFileSync(path.join(f.root,input.MANIFEST_PATH),path.join(cold,input.MANIFEST_PATH));
    assert.equal(input.importSnapshot(cold,f.source).status,'passed');assert.equal(fs.existsSync(path.join(cold,'vendor/patch')),false);
    const runtime=path.join(cold,'dist/candidate');input.assemble(cold,runtime);assert.deepEqual(fs.readFileSync(path.join(runtime,input.RUNTIME_PATH)),f.bytes);assert.equal(fs.existsSync(path.join(runtime,'mpv-1.dll')),false);
    assert.equal(input.validateRuntime(cold,runtime).inputSha256,f.manifest.files[0].sha256.toUpperCase());assert.throws(()=>input.assemble(cold,runtime),/already exists/);
});
for(const mutation of ['changed','missing','extra'])test('snapshot '+mutation+' input is rejected before payload writes',t=>{
    const f=fixture(t),file=path.join(f.root,input.INPUT_ROOT,'mpv-1.dll');if(mutation==='changed')fs.appendFileSync(file,'changed');if(mutation==='missing')fs.unlinkSync(file);if(mutation==='extra')fs.writeFileSync(path.join(f.root,input.INPUT_ROOT,'unexpected.dll'),'extra');
    assert.throws(()=>input.assemble(f.root,f.runtime),/snapshot identity|snapshot input/);assert.equal(fs.existsSync(f.runtime),false);
});
test('wrong import source cannot replace the existing pinned snapshot',t=>{const f=fixture(t);fs.writeFileSync(f.source,'wrong DLL');assert.throws(()=>input.importSnapshot(f.root,f.source),/source identity mismatch/);assert.equal(input.validate(f.root).status,'passed');});
test('source links, component links and arbitrary output locations are rejected',t=>{
    const f=fixture(t),alias=path.join(f.root,'alias.dll');fs.symlinkSync(f.source,alias);assert.throws(()=>input.importSnapshot(f.root,alias),/links or redirects/);
    const prepared=path.join(f.root,input.INPUT_ROOT),saved=prepared+'-saved';fs.renameSync(prepared,saved);fs.symlinkSync(saved,prepared,process.platform==='win32'?'junction':'dir');assert.throws(()=>input.validate(f.root),/links or redirects/);
    assert.throws(()=>input.assemble(f.root,path.join(f.root,'src')),/dedicated dist/);
});
test('runtime tampering and manifest path redirection are rejected',t=>{
    const f=fixture(t);input.assemble(f.root,f.runtime);fs.appendFileSync(path.join(f.runtime,input.RUNTIME_PATH),'changed');assert.throws(()=>input.validateRuntime(f.root,f.runtime),/runtime identity/);
    f.manifest.files[0].path='../outside.dll';fs.writeFileSync(path.join(f.root,input.MANIFEST_PATH),JSON.stringify(f.manifest));assert.throws(()=>input.load(f.root),/Invalid/);
});
