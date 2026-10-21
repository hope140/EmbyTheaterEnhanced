'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const host=require('../tools/windows-host-input.cjs'),web=require('../tools/web-snapshot-input.cjs');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function fixture(t) {
    const root=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'ete-host-component-')));
    t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    const data=new Map([['Emby.Theater.exe',Buffer.from([0,255,13,10])],['cec/cec.dll',Buffer.from('fixed bytes')]]);
    const files=[...data].map(([path,bytes])=>({path,size:bytes.length,sha256:sha(bytes)}));
    for(const [name,bytes]of data){const target=path.join(root,host.INPUT_ROOT,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);}
    const archive=Buffer.from('synthetic archive identity');
    const manifest={schemaVersion:1,version:'3.0.20',inputRoot:host.INPUT_ROOT,fileCount:files.length,
        bytes:files.reduce((n,f)=>n+f.size,0),treeSha256:web.treeHash(files),files,archive:{size:archive.length,sha256:sha(archive)}};
    fs.writeFileSync(path.join(root,host.MANIFEST_PATH),JSON.stringify(manifest));
    return{root,data,manifest,archive,output:path.join(root,'dist/candidate')};
}
test('official component assembles exact bytes without Carnival and leaves Model untouched',t=>{
    const f=fixture(t);fs.mkdirSync(f.output,{recursive:true});fs.writeFileSync(path.join(f.output,'MediaBrowser.Model.dll'),'unchanged Model');
    assert.equal(host.assemble(f.root,f.output).fileCount,2);
    for(const [name,bytes]of f.data)assert.deepEqual(fs.readFileSync(path.join(f.output,name)),bytes);
    assert.equal(fs.readFileSync(path.join(f.output,'MediaBrowser.Model.dll'),'utf8'),'unchanged Model');
    assert.equal(host.validateRuntime(f.root,f.output).fileCount,2);
    assert.equal(fs.existsSync(path.join(f.root,'vendor/carnival')),false);
    assert.throws(()=>host.assemble(f.root,f.output),/already exists/);
});
for(const mutation of ['changed','missing','extra'])test('component rejects '+mutation+' before output writes',t=>{
    const f=fixture(t),input=path.join(f.root,host.INPUT_ROOT);
    if(mutation==='changed')fs.writeFileSync(path.join(input,'Emby.Theater.exe'),'changed');
    if(mutation==='missing')fs.unlinkSync(path.join(input,'Emby.Theater.exe'));
    if(mutation==='extra')fs.writeFileSync(path.join(input,'unknown.dll'),'extra');
    assert.throws(()=>host.assemble(f.root,f.output),/snapshot identity|snapshot input/);
    assert.equal(fs.existsSync(f.output),false);
});
test('archive hash and size are pinned independently of prepared files',t=>{
    const f=fixture(t),archive=path.join(f.root,'official.zip');fs.writeFileSync(archive,f.archive);
    assert.equal(host.validateArchive(f.root,archive).status,'passed');
    fs.appendFileSync(archive,'changed');assert.throws(()=>host.validateArchive(f.root,archive),/archive identity/);
});
test('manifest rejects Model, duplicate aliases and escaping entries',t=>{
    const f=fixture(t);
    for(const name of ['mediabrowser.model.dll','Emby.Theater.EXE','../outside']) {
        const files=[...f.manifest.files,{...f.manifest.files[0],path:name}];
        fs.writeFileSync(path.join(f.root,host.MANIFEST_PATH),JSON.stringify({...f.manifest,files,fileCount:files.length,
            bytes:files.reduce((n,f)=>n+f.size,0),treeSha256:web.treeHash(files)}));
        assert.throws(()=>host.validate(f.root),/Invalid Windows Host/);
    }
});
test('runtime tampering is detected and arbitrary output roots are rejected',t=>{
    const f=fixture(t);assert.throws(()=>host.assemble(f.root,path.join(f.root,'src')),/dedicated dist/);
    host.assemble(f.root,f.output);fs.appendFileSync(path.join(f.output,'Emby.Theater.exe'),'changed');
    assert.throws(()=>host.validateRuntime(f.root,f.output),/runtime identity/);
});
test('component input and output redirects are rejected without changing outside files',t=>{
    const f=fixture(t),input=path.join(f.root,host.INPUT_ROOT),saved=path.join(f.root,'saved');
    fs.renameSync(input,saved);fs.symlinkSync(saved,input,process.platform==='win32'?'junction':'dir');
    assert.throws(()=>host.validate(f.root),/links or redirects/);
});
