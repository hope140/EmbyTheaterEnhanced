'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
const outcome=require('../src/electronapp/enhanced/update-handoff-outcome'),cache=require('../src/electronapp/enhanced/update-install-cache');
function temporary(t){const root=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'ete-outcome-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
test('bounded persisted outcome survives reopening and projects only fixed safe fields',t=>{
 const root=temporary(t),dir=path.join(root,'update-'+'a'.repeat(32)),proof=outcome.prepare(root,dir),file=path.join(root,proof.name);
 fs.writeFileSync(file,JSON.stringify({schemaVersion:1,stage:'host-timeout',elapsedMs:120000,exitCode:7,path:'PRIVATE_CANARY',url:'https://private.invalid/token=PRIVATE_CANARY'}));
 assert.deepEqual(outcome.read(root,proof),{stage:'host-timeout',elapsedMs:120000,exitCode:7});assert.doesNotMatch(JSON.stringify(outcome.read(root,proof)),/PRIVATE_CANARY/);
 outcome.cancelled(root,proof);assert.equal(outcome.read(root,proof).stage,'cancelled');
 assert.deepEqual(outcome.prepare(root,dir,proof),proof);
});
for(const mutation of ['unknown-stage','oversize','replacement','hardlink','symlink'])test('outcome refuses '+mutation+' and never overwrites a foreign target',t=>{
 const root=temporary(t),dir=path.join(root,'update-'+'b'.repeat(32)),proof=outcome.prepare(root,dir),file=path.join(root,proof.name),foreign=path.join(root,'foreign');fs.writeFileSync(foreign,'PRIVATE_CANARY');
 if(mutation==='unknown-stage')fs.writeFileSync(file,JSON.stringify({schemaVersion:1,stage:'PRIVATE_CANARY',elapsedMs:0}));
 if(mutation==='oversize')fs.writeFileSync(file,'x'.repeat(1025));
 if(['replacement','symlink'].includes(mutation)){fs.renameSync(file,file+'.original');if(mutation==='replacement')fs.writeFileSync(file,'foreign replacement');else fs.symlinkSync(foreign,file);}
 if(mutation==='hardlink')fs.linkSync(file,path.join(root,'other-link'));
 assert.throws(()=>outcome.read(root,proof));if(mutation!=='unknown-stage')assert.throws(()=>outcome.prepare(root,dir,proof));assert.equal(fs.readFileSync(foreign,'utf8'),'PRIVATE_CANARY');
});
function managed(t){const root=temporary(t),bytes=Buffer.from('never executable'),name='EmbyTheaterEnhanced-9.1.0-win-x64-setup.exe';let transfers=0,releases=0,aborts=0;
 const asset={id:1,name,url:'https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v9.1.0/'+name,size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
 const options={profileRoot:root,executable:path.join(root,'electron.exe'),handoff:{prepare:async record=>({commit:async()=>{},release:async()=>{releases++;},abort:async()=>{aborts++;}}),cleanup:async()=>{}},downloadInstaller:async(a,dir)=>{transfers++;fs.writeFileSync(path.join(dir,a.name),bytes);return{source:'github'};}};
 return{root,bytes,asset,options,store:cache.createStore(options),request:{currentVersion:'9.0.0',targetVersion:'9.1.0',tag:'v9.1.0'},get transfers(){return transfers;},get releases(){return releases;},get aborts(){return aborts;}};
}
test('armed is still cancellable, confirmed cancellation persists, and a retry revalidates and reuses good bytes',async t=>{
 const f=managed(t),r=await f.store.download(f.asset,f.request),lease=await f.store.prepare(r);await lease.commit();assert.equal(f.releases,0);await lease.abort();assert.equal(f.store.recovery('9.0.0'),'handoff-cancelled');
 const reopened=cache.createStore(f.options);assert.equal(reopened.outcomes()[0].stage,'cancelled');assert.equal((await reopened.download(f.asset,f.request)).reused,true);assert.equal(f.transfers,1);
 const retry=await reopened.prepare(r);await retry.commit();await retry.release();assert.equal(f.releases,1);await assert.rejects(retry.abort(),{code:'handoff-cancel-unconfirmed'});
});
test('unconfirmed cancellation is not persisted as cancelled and cannot clear its armed intent',async t=>{
 const f=managed(t);f.options.handoff.prepare=async()=>({commit:async()=>{},abort:async()=>{throw Error('unconfirmed');}});
 const r=await f.store.download(f.asset,f.request),lease=await f.store.prepare(r);await lease.commit();await assert.rejects(lease.abort());assert.equal(f.store.recovery('9.0.0'),'handoff-preparing');assert.equal(fs.existsSync(path.join(r.directory,f.asset.name)),true);
});
test('bad retained bytes are preserved but a fresh independently verified attempt can recover',async t=>{
 const f=managed(t),r=await f.store.download(f.asset,f.request),old=path.join(r.directory,f.asset.name);fs.writeFileSync(old,Buffer.alloc(f.bytes.length));
 const replacement=await f.store.download(f.asset,f.request);assert.notEqual(replacement.directory,r.directory);assert.equal(replacement.replacedInvalidCache,true);assert.equal(f.transfers,2);assert.deepEqual(fs.readFileSync(old),Buffer.alloc(f.bytes.length));assert.deepEqual(fs.readFileSync(path.join(replacement.directory,f.asset.name)),f.bytes);
});

test('an uncertain previous shell launch blocks a different cached attempt until its outcome is known',async t=>{
 const f=managed(t),first=await f.store.download(f.asset,f.request);await f.store.prepare(first);const receipt=JSON.parse(fs.readFileSync(path.join(first.directory,'receipt.json')));
 const file=path.join(f.root,'updates',receipt.outcome.name);fs.writeFileSync(file,JSON.stringify({schemaVersion:1,stage:'shell-started',elapsedMs:3}));
 const next={...f.asset,id:2,name:f.asset.name.replace('9.1.0','9.2.0'),url:f.asset.url.replaceAll('9.1.0','9.2.0')},record=await f.store.download(next,{...f.request,targetVersion:'9.2.0',tag:'v9.2.0'});
 await assert.rejects(f.store.prepare(record),{code:'handoff-cancel-unconfirmed'});assert.equal(f.store.outcomes().some(r=>r.stage==='shell-started'),true);
 fs.writeFileSync(file,JSON.stringify({schemaVersion:1,stage:'wizard-exited',elapsedMs:5,exitCode:1}));const lease=await f.store.prepare(record);await lease.abort();
});
