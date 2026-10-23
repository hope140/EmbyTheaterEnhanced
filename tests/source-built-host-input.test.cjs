'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),crypto=require('node:crypto');
const component=require('../tools/source-built-host-input.cjs'),host=require('../tools/windows-host-input.cjs'),web=require('../tools/web-snapshot-input.cjs');
const repo=path.resolve(__dirname,'..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function write(root,name,data){const p=path.join(root,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,data);}
function fixture(t){
 const root=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'ete-built-host-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(const name of ['change-manifest.json','upstream-source-manifest.json','host-retirement.patch','Apply-SourceChanges.ps1'])write(root,'native/windows-host/'+name,fs.readFileSync(path.join(repo,'native/windows-host',name)));
 fs.cpSync(path.join(repo,'native/windows-host/changes'),path.join(root,'native/windows-host/changes'),{recursive:true});
 const jsonInput=require('../tools/host-json-input.cjs'),jsonBytes=Buffer.from('synthetic Newtonsoft for source-built input tests');
 const jsonManifest=JSON.parse(fs.readFileSync(path.join(repo,jsonInput.MANIFEST_PATH)));
 jsonManifest.file.size=jsonBytes.length;jsonManifest.file.sha256=sha(jsonBytes);write(root,jsonInput.MANIFEST_PATH,JSON.stringify(jsonManifest));write(root,jsonInput.INPUT_ROOT+'/Newtonsoft.Json.dll',jsonBytes);
 write(root,'vendor/model-compatibility-manifest.json',fs.readFileSync(path.join(repo,'vendor/model-compatibility-manifest.json')));
 const original=component.OUTPUTS.map(p=>({path:p,bytes:Buffer.from('synthetic ORIGINAL '+p)}));const files=original.map(x=>({path:x.path,size:x.bytes.length,sha256:sha(x.bytes)}));
 write(root,host.MANIFEST_PATH,JSON.stringify({schemaVersion:1,version:'3.0.20',inputRoot:host.INPUT_ROOT,files,fileCount:2,bytes:files.reduce((n,x)=>n+x.size,0),treeSha256:web.treeHash(files),archive:{size:1,sha256:'0'.repeat(64)}}));
 const candidate=component.OUTPUTS.map(p=>({path:p,bytes:Buffer.from('synthetic DERIVED '+p)}));
 const lock={schemaVersion:1,mode:'source-built-host',sourceIdentitySha256:component.sourceIdentity(root).sha256,framework:'net462',platform:'x86',modelSha256:JSON.parse(fs.readFileSync(path.join(root,'vendor/model-compatibility-manifest.json'))).files[0].sha256,files:candidate.map(x=>({path:x.path,size:x.bytes.length,sha256:sha(x.bytes)})),toolchainSnapshotSha256:'1'.repeat(64),buildReceiptSha256:'2'.repeat(64)};
 write(root,component.LOCK_PATH,JSON.stringify(lock));for(const f of candidate)write(root,component.INPUT_ROOT+'/'+f.path,f.bytes);
 write(root,'.gitignore','/vendor/source-built-host/\n/dist/\n');
 const git=args=>cp.execFileSync('git',['-C',root,...args],{stdio:'pipe'});git(['init','-q']);git(['config','user.name','Host fixture']);git(['config','user.email','host@example.invalid']);git(['config','core.autocrlf','false']);git(['add','.']);git(['commit','-qm','synthetic source-built input fixture']);
 const runtime=path.join(root,'dist/candidate');fs.mkdirSync(runtime,{recursive:true});const sourceCommit=git(['rev-parse','HEAD']).toString().trim();const token=require('../tools/runtime-dependency-contract.cjs').createOwner(root,runtime,sourceCommit);for(const f of original)write(runtime,f.path,f.bytes);return{root,runtime,lock,candidate,original,sourceCommit,token};
}
test('verified source-built Host replaces only original EXE/PDB in fresh dist and binds source identity',t=>{
 const f=fixture(t);assert.equal(component.validatePrepared(f.root).sourceIdentity.sha256,f.lock.sourceIdentitySha256);const report=component.stage(f.root,f.runtime,f.sourceCommit,f.token);assert.equal(report.mode,'source-built-host');assert.equal(report.newtonsoft.version,'13.0.4');assert.equal(fs.readFileSync(path.join(f.runtime,'Newtonsoft.Json.dll'),'utf8'),'synthetic Newtonsoft for source-built input tests');
 for(const x of f.candidate)assert.deepEqual(fs.readFileSync(path.join(f.runtime,x.path)),x.bytes);
 assert.throws(()=>component.stage(f.root,f.runtime,f.sourceCommit,f.token),/not the original fresh assembly|not the original/);
});
for(const mutation of ['missing-lock','edited-lock','changed-source','changed-output','extra-output','input-redirect','wrong-runtime-original'])test('source-built Host fails closed before replacement: '+mutation,t=>{
 const f=fixture(t);
 if(mutation==='missing-lock')fs.unlinkSync(path.join(f.root,component.LOCK_PATH));
 if(mutation==='edited-lock')fs.appendFileSync(path.join(f.root,component.LOCK_PATH),' ');
 if(mutation==='changed-source')fs.appendFileSync(path.join(f.root,'native/windows-host/changes/Emby.Theater/Program.cs'),'changed');
 if(mutation==='changed-output')fs.appendFileSync(path.join(f.root,component.INPUT_ROOT,'Emby.Theater.exe'),'changed');
 if(mutation==='extra-output')write(f.root,component.INPUT_ROOT+'/unknown.dll','unknown');
 if(mutation==='input-redirect'){const p=path.join(f.root,component.INPUT_ROOT,'Emby.Theater.exe');fs.renameSync(p,p+'.saved');fs.symlinkSync(p+'.saved',p,'file');}
 if(mutation==='wrong-runtime-original')write(f.runtime,'Emby.Theater.pdb','unknown preserved PDB');
 const before=f.original.map(x=>fs.readFileSync(path.join(f.runtime,x.path)));
 assert.throws(()=>component.stage(f.root,f.runtime,f.sourceCommit,f.token));for(const [i,x]of f.original.entries())assert.deepEqual(fs.readFileSync(path.join(f.runtime,x.path)),before[i]);
});
test('source-built replacement requires the current build owner token and source commit',t=>{
 const f=fixture(t);assert.throws(()=>component.stage(f.root,f.runtime,f.sourceCommit,'0'.repeat(64)),/ownership marker/);assert.throws(()=>component.stage(f.root,f.runtime,'0'.repeat(40),f.token),/source commit mismatch/);
 for(const x of f.original)assert.deepEqual(fs.readFileSync(path.join(f.runtime,x.path)),x.bytes);
});
test('source-built inputs changing after preflight are rejected before either output is replaced',t=>{
 const f=fixture(t),originalRead=fs.readFileSync,target=path.join(f.root,component.INPUT_ROOT,'Emby.Theater.pdb');let reads=0;
 fs.readFileSync=function(file,...args){const value=originalRead.call(this,file,...args);if(file===target && ++reads===2)return Buffer.concat([value,Buffer.from('changed-after-validation')]);return value;};
 try {assert.throws(()=>component.stage(f.root,f.runtime,f.sourceCommit,f.token),/input changed during replacement/);}
 finally {fs.readFileSync=originalRead;}
 for(const x of f.original)assert.deepEqual(fs.readFileSync(path.join(f.runtime,x.path)),x.bytes);
});

for(const mutation of ['json-input-changed','json-input-extra','json-input-link','json-target-present','json-target-alias'])test('JSON dependency fails before EXE/PDB replacement: '+mutation,t=>{
 const f=fixture(t),json=require('../tools/host-json-input.cjs'),file=path.join(f.root,json.INPUT_ROOT,'Newtonsoft.Json.dll');
 if(mutation==='json-input-changed')fs.appendFileSync(file,'changed');
 if(mutation==='json-input-extra')write(f.root,json.INPUT_ROOT+'/unknown.dll','unknown');
 if(mutation==='json-input-link'){fs.renameSync(file,file+'.real');fs.symlinkSync(file+'.real',file);}
 if(mutation==='json-target-present')write(f.runtime,'Newtonsoft.Json.dll','preserve unknown existing bytes');
 if(mutation==='json-target-alias')write(f.runtime,'NEWTONSOFT.JSON.DLL','preserve unknown existing alias');
 assert.throws(()=>component.stage(f.root,f.runtime,f.sourceCommit,f.token),/Host JSON/);
 for(const original of f.original)assert.deepEqual(fs.readFileSync(path.join(f.runtime,original.path)),original.bytes);
});
