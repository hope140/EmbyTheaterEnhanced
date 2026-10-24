'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const plan=require('../tools/ci-source-built-host-plan.cjs'),host=require('../tools/source-built-host-input.cjs');
const root=path.resolve(__dirname,'..'),official=process.env.ETE_HOST_OFFICIAL_SOURCE||path.join(root,'.work/actions-host-build/source');
const haveOfficial=fs.existsSync(path.join(official,'Emby.Theater/Program.cs')),havePs=!cp.spawnSync(process.platform==='win32'?'pwsh.exe':'pwsh',['-NoProfile','-Command','exit 0']).error;
function work(t){const d=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'ete-host-chain-test-')));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;}
function cloneInputs(destination){
 const files=new Set([...host.sourceIdentity(root).files.map(f=>f.path),...plan.KIT_FILES.map(f=>'tools/windows-host-build/'+f),...plan.KIT_INPUTS,...require('../tools/host-verifier-input.cjs').PATHS,'vendor/windows-host-manifest.json','vendor/model-compatibility-manifest.json']);
 for(const f of files){const target=path.join(destination,f);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,f),target);}
}
const options={skip:!haveOfficial||!havePs?'Official55 source is acquired and this chain is mandatory before production compilation.':false};
test('all builder/verifier candidate files, fingerprints, references and inner/outer manifests agree',()=>{
 assert.equal(plan.verifyCandidateContract(root).builderVerifierAgreement,true);
});
test('ordinary production orchestrator enforces complete source and verifier gates before compilation and staging',()=>{
 const production=fs.readFileSync(path.join(root,'tools/ci-source-built-host.ps1'),'utf8');
 assert.ok(production.indexOf('verify-verifier $root')<production.indexOf("Start-CIPhase 'host.acquire-packages'"));
 assert.ok(production.indexOf("Start-CIPhase 'host.source-chain'")<production.indexOf("Start-CIPhase 'host.compile'"));
 assert.ok(production.indexOf("Start-CIPhase 'host.probe'")<production.indexOf("Start-CIPhase 'host.envelope-stage'"));
 assert.doesNotMatch(production,/ExecutionPolicy|Stop-Process|taskkill/);
});
for(const mutation of ['old-program','duplicate-member','schema','builder','reference','component-fingerprint','inner-manifest'])test('builder/verifier agreement rejects independently stale declaration: '+mutation,t=>{
 const d=work(t);cloneInputs(d);
 const edit=(p,fn)=>{const f=path.join(d,p),m=JSON.parse(fs.readFileSync(f));fn(m);fs.writeFileSync(f,JSON.stringify(m));};
 if(mutation==='old-program')edit('tools/windows-host-verifier/expected-candidate-files.json',m=>Object.assign(m.find(f=>f.path==='Emby.Theater/Program.cs'),{size:15471,sha256:'bbff261ac026ba55e39ebb91b767e7cc9ab237dc85538c1c8306ef06b30a2b36'}));
 if(mutation==='duplicate-member')edit('tools/windows-host-verifier/expected-candidate-files.json',m=>m[1]=m[0]);
 if(mutation==='schema')edit('tools/windows-host-build/VERIFIED-RUNTIME.schema.json',m=>m.properties.sourceIdentitySha256.const='0'.repeat(64));
 if(mutation==='builder')edit('tools/windows-host-verifier/expected-build-contract.json',m=>m.builderSha256='0'.repeat(64));
 if(mutation==='reference')edit('tools/windows-host-verifier/expected-build-contract.json',m=>m.references[0].sha256='0'.repeat(64));
 if(mutation==='component-fingerprint'){const f=path.join(d,'tools/windows-host-verifier/Run-Components.ps1');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(host.sourceIdentity(root).sha256,'0'.repeat(64)));}
 if(mutation==='inner-manifest')edit('tools/windows-host-verifier/verifier-manifest.json',m=>m.files[0].sha256='0'.repeat(64));
 assert.throws(()=>plan.verifyCandidateContract(d),/manifest mismatch|declarations mismatch|reference identity mismatch/);
});
test('actual official55 -> production patch -> real identity equals actual replacement route for all57 inputs',options,t=>{
 const d=work(t),kit=path.join(d,'kit');plan.materializeKit(root,kit);
 const r=plan.verifySourceChain(root,official,kit,path.join(d,'chain'));
 assert.equal(r.originalFiles,55);assert.equal(r.candidateFiles,57);assert.equal(r.compileInputs,46);assert.equal(r.byteEquivalentRoutes,true);assert.equal(r.hostCompiled,false);assert.equal(r.hostExecuted,false);
 assert.equal(r.sourceIdentitySha256,host.sourceIdentity(root).sha256);
});
test('old stale patch with coherent declared hashes still fails actual Program identity before compilation',options,t=>{
 const d=work(t),shadow=path.join(d,'shadow');cloneInputs(shadow);
 const oldPatch=cp.execFileSync('git',['-C',root,'show','abe1c7426f0c8d0b5d1f7febadd0d39fb9a80a1d:native/windows-host/host-retirement.patch']);
 fs.writeFileSync(path.join(shadow,'native/windows-host/host-retirement.patch'),oldPatch);
 const file=path.join(shadow,'native/windows-host/change-manifest.json'),m=JSON.parse(fs.readFileSync(file));m.patchSHA256=crypto.createHash('sha256').update(oldPatch).digest('hex');fs.writeFileSync(file,JSON.stringify(m,null,2)+'\n');
 const identity=host.sourceIdentity(shadow);fs.writeFileSync(path.join(shadow,'tools/windows-host-build/EXPECTED-SOURCE-IDENTITY.json'),JSON.stringify(identity,null,2)+'\n');
 const schemaFile=path.join(shadow,'tools/windows-host-build/VERIFIED-RUNTIME.schema.json'),schema=JSON.parse(fs.readFileSync(schemaFile));schema.properties.sourceIdentitySha256.const=identity.sha256;fs.writeFileSync(schemaFile,JSON.stringify(schema,null,2)+'\n');
 const kit=path.join(d,'kit');plan.materializeKit(shadow,kit);
 assert.throws(()=>plan.verifySourceChain(shadow,official,kit,path.join(d,'chain')),e=>!!e.stderr&&String(e.stderr).includes('Undeclared/mismatched candidate input: Emby.Theater/Program.cs'));
});
test('changed official input is rejected before creating either source output route',options,t=>{
 const d=work(t),source=path.join(d,'original');fs.cpSync(official,source,{recursive:true});fs.appendFileSync(path.join(source,'Emby.Theater/Program.cs'),'synthetic drift');
 const kit=path.join(d,'kit'),out=path.join(d,'chain');plan.materializeKit(root,kit);
 assert.throws(()=>plan.verifySourceChain(root,source,kit,out),/Original55 source chain identity/);assert.equal(fs.existsSync(out),false);
});
