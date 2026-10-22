'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),crypto=require('node:crypto');
const input=require('../tools/inherited-npm-input.cjs'),web=require('../tools/web-snapshot-input.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function git(root,args){return cp.execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
function fixture(t){
    const root=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'ete-inherited-npm-')));
    t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    const source=path.join(root,'official');fs.mkdirSync(source);git(source,['init','-q']);
    git(source,['config','user.name','Synthetic Source']);git(source,['config','user.email','synthetic@example.invalid']);git(source,['config','core.autocrlf','false']);
    const sourcePath='node_modules/is-linux/index.js',bytes=Buffer.from('throw new Error("must never execute");\n// pinned source\n');
    fs.mkdirSync(path.dirname(path.join(source,sourcePath)),{recursive:true});fs.writeFileSync(path.join(source,sourcePath),bytes);
    git(source,['add','.']);git(source,['commit','-q','-m','synthetic source']);const commit=git(source,['rev-parse','HEAD']);
    const output=input.transform(bytes,'lf-to-crlf');const files=[{path:'electronapp/'+sourcePath,size:output.length,sha256:sha(output),sourcePath,sourceSize:bytes.length,sourceSha256:sha(bytes),sourceGitBlob:git(source,['rev-parse',commit+':'+sourcePath]),transform:'lf-to-crlf'}];
    const manifest={schemaVersion:1,version:'3.0.20',inputRoot:input.INPUT_ROOT,fileCount:1,bytes:output.length,treeSha256:web.treeHash(files),files,source:{repository:'https://github.com/MediaBrowser/emby-theater-electron',commit}};
    fs.mkdirSync(path.join(root,'vendor'));fs.writeFileSync(path.join(root,input.MANIFEST_PATH),JSON.stringify(manifest));
    return{root,source,manifest,bytes,output,prepared:path.join(root,input.INPUT_ROOT),runtime:path.join(root,'dist/candidate')};
}
function save(f){fs.writeFileSync(path.join(f.root,input.MANIFEST_PATH),JSON.stringify(f.manifest));}
test('pinned Git blobs plus explicit checkout conversion preserve bytes without old npm or source checkout reads',t=>{
    const f=fixture(t);fs.writeFileSync(path.join(f.source,f.manifest.files[0].sourcePath),'changed checkout');
    assert.equal(input.prepare(f.root,f.source).fileCount,1);
    assert.deepEqual(fs.readFileSync(path.join(f.prepared,f.manifest.files[0].path)),f.output);
    assert.equal(fs.existsSync(path.join(f.root,'vendor/carnival')),false);
    input.assemble(f.root,f.runtime);assert.equal(input.validateRuntime(f.root,f.runtime).fileCount,1);
    assert.throws(()=>input.assemble(f.root,f.runtime),/already exists/);
    assert.equal(input.prepare(f.root,f.source).status,'passed');
});
for(const mutation of ['missing-commit','source-hash','source-blob','output-hash'])test('preparation rejects '+mutation+' before component writes',t=>{
    const f=fixture(t);
    if(mutation==='missing-commit')f.manifest.source.commit='0'.repeat(40);
    if(mutation==='source-hash')f.manifest.files[0].sourceSha256='0'.repeat(64);
    if(mutation==='source-blob')f.manifest.files[0].sourceGitBlob='0'.repeat(40);
    if(mutation==='output-hash'){f.manifest.files[0].sha256='0'.repeat(64);f.manifest.treeSha256=web.treeHash(f.manifest.files);}
    save(f);assert.throws(()=>input.prepare(f.root,f.source),/unavailable|identity mismatch/);assert.equal(fs.existsSync(f.prepared),false);
});
for(const mutation of ['changed','missing','extra'])test('prepared '+mutation+' bytes are rejected before payload writes',t=>{
    const f=fixture(t);input.prepare(f.root,f.source);const file=path.join(f.prepared,f.manifest.files[0].path);
    if(mutation==='changed')fs.appendFileSync(file,'changed');
    if(mutation==='missing')fs.unlinkSync(file);
    if(mutation==='extra')fs.writeFileSync(path.join(f.prepared,'unexpected.js'),'extra');
    assert.throws(()=>input.assemble(f.root,f.runtime),/snapshot identity|snapshot input/);assert.equal(fs.existsSync(f.runtime),false);
});
test('manifest confines runtime and source paths, rejects aliases and unrecognized transforms',t=>{
    const f=fixture(t),original=structuredClone(f.manifest);
    for(const patch of [{path:'../outside'},{path:'electronapp/main.js'},{sourcePath:'../outside'},{sourcePath:'node_modules/other/index.js'},{transform:'run-script'}]){
        f.manifest=structuredClone(original);Object.assign(f.manifest.files[0],patch);f.manifest.treeSha256=web.treeHash(f.manifest.files);save(f);
        assert.throws(()=>input.load(f.root),/Invalid/);
    }
});
test('runtime tampering, component redirects and source redirects are rejected',t=>{
    const f=fixture(t);input.prepare(f.root,f.source);input.assemble(f.root,f.runtime);
    fs.appendFileSync(path.join(f.runtime,f.manifest.files[0].path),'changed');assert.throws(()=>input.validateRuntime(f.root,f.runtime),/runtime identity/);
    const saved=f.prepared+'-saved';fs.renameSync(f.prepared,saved);fs.symlinkSync(saved,f.prepared,process.platform==='win32'?'junction':'dir');
    assert.throws(()=>input.validate(f.root),/links or redirects/);
    const alias=path.join(f.root,'source-alias');fs.symlinkSync(f.source,alias,process.platform==='win32'?'junction':'dir');assert.throws(()=>input.prepare(f.root,alias),/links or redirects/);
    assert.throws(()=>input.assemble(f.root,path.join(f.root,'src')),/dedicated dist/);
});
test('newline conversion is explicit, preserves CRLF and refuses binary/non-UTF8 input',()=>{
    assert.deepEqual(input.transform(Buffer.from('a\r\nb\nc'),'lf-to-crlf'),Buffer.from('a\r\nb\r\nc'));
    assert.throws(()=>input.transform(Buffer.from([255]),'lf-to-crlf'),/text transform/);
    assert.throws(()=>input.transform(Buffer.from([0,10]),'lf-to-crlf'),/text transform/);
});
