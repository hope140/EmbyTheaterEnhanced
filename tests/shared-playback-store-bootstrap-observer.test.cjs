'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {install,unionMs}=require('../tools/shared-playback-cache/store-bootstrap-observer.cjs');
const {temporaryRoot}=require('./helpers/range-fixture-root.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const gate=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const header="'use strict'; const fs = require('node:fs/promises'); const {acquireGuard} = require('../playback-range-identity');\n";
function fixture(body,{io={},identity={acquireGuard:()=>Promise.resolve({})},emit,maxOperations}={}){
  const source=Buffer.from(header+body),root=path.resolve('/owned/private-cache'),rows=[];let clock=0,failures=0;
  const original=(...args)=>({outside:args}),target={createStore:original};
  const observer=install({target,filename:path.resolve(__dirname,'../src/electronapp/enhanced/shared-playback-cache/store.js'),source,expectedSha256:sha(source),root,
    context:()=>({generation:131}),now:()=>clock,emit:emit||((r)=>rows.push(r)),onFailure:()=>failures++,maxOperations},
    {requireModule:id=>id==='node:fs/promises'?io:id==='../playback-range-identity'?identity:require(id),utilization:()=>({active:clock/4,idle:clock*3/4})});
  return {target,observer,rows,root,original,setTime:v=>{clock=v;},failures:()=>failures};
}

test('store source mismatch and unsupported source reject before target mutation',()=>{
  const source=Buffer.from(header+'exports.createStore=()=>null;'),original=()=>{},target={createStore:original};
  const options={target,filename:__filename,source,expectedSha256:'0'.repeat(64),root:path.resolve('/owned')};
  assert.throws(()=>install(options),/source-mismatch/);assert.equal(target.createStore,original);
  const unknown=Buffer.from('exports.createStore=()=>null;');
  assert.throws(()=>install({...options,source:unknown,expectedSha256:sha(unknown)}),/source-contract/);assert.equal(target.createStore,original);
});

test('lexical I/O preserves the exact Promise, receiver, arguments, value and finite path-free records',async()=>{
  const pending=gate(),bytes=Buffer.from('PRIVATE_CANARY'),options={flag:'wx'};let calls=0;
  const io={writeFile(...args){calls++;assert.equal(this,io);assert.equal(args[1],bytes);assert.equal(args[2],options);return pending.promise;}};
  const h=fixture('exports.createStore=function(options){return fs.writeFile(options.root+"/index.json",options.bytes,options.flags);};',{io});
  const input={root:h.root,bytes,flags:options};const result=h.target.createStore(input);
  assert.equal(result,pending.promise);assert.equal(calls,1);h.setTime(201);pending.resolve(bytes);assert.equal(await result,bytes);await tick();
  const summary=h.observer.snapshot().summaries[0];assert.equal(summary.elapsedMs,201);assert.equal(summary.longestOperation.operation,'fs.writeFile');
  assert.equal(summary.longestOperation.role,'checkpoint');assert.equal(summary.observedOperationUnionMs,201);assert.equal(summary.unattributedMs,0);
  assert.equal(summary.processWindow.scope,'whole-process-during-create');assert.equal(summary.processWindow.activeMs,50.25);
  assert.doesNotMatch(JSON.stringify(h.rows),/PRIVATE_CANARY|private-cache|index\.json|\/owned/);
  h.observer.restore();assert.equal(h.target.createStore,h.original);
});

test('guard acquisition and each owned FileHandle call remain original operations with safe failure codes',async()=>{
  const failure=Object.assign(Error('PRIVATE_CANARY secret path'),{code:'EACCES'}),closed=gate(),stat=gate();let returned,reads=0,closes=0,guardRoot;
  const handle={stat(){assert.equal(this,handle);return stat.promise;},read(){reads++;return Promise.reject(failure);},truncate(){return Promise.resolve();},close(){closes++;return closed.promise;}};
  const originalMethods={...handle};
  const h=fixture('exports.createStore=async function({root,expectedError}){await acquireGuard(root);const h=await fs.open(root+"/index.log","wx");const p=h.stat();await p;try{await h.read();}catch(e){if(e!==expectedError)throw Error("changed rejection");}await h.truncate(0);await h.close();return h;};',{
    io:{open(){returned=Promise.resolve(handle);return returned;}},identity:{acquireGuard(root){guardRoot=root;return Promise.resolve({});}}});
  const result=h.target.createStore({root:h.root,expectedError:failure});await tick();assert.equal(guardRoot,h.root);assert.notEqual(handle.stat,originalMethods.stat);
  h.setTime(20);stat.resolve({});await tick();assert.equal(reads,1);assert.equal(closes,1);h.setTime(30);closed.resolve();assert.equal(await result,handle);await tick();
  assert.equal(handle.stat,originalMethods.stat);assert.equal(handle.close,originalMethods.close);
  assert(h.rows.some(r=>r.operation==='guard.acquire'));assert(h.rows.some(r=>r.operation==='handle.truncate'));
  assert(h.rows.some(r=>r.operation==='handle.read'&&r.outcome==='rejected'&&r.code==='EACCES'));
  assert.doesNotMatch(JSON.stringify(h.rows),/PRIVATE_CANARY|secret path/);h.observer.restore();
});

test('original I/O rejection remains the identical rejection and observer failures do not alter it',async()=>{
  const failure=Object.assign(Error('PRIVATE_CANARY'),{code:'not-public-code'}),pending=gate();
  const h=fixture('exports.createStore=({root})=>fs.mkdir(root);',{io:{mkdir:()=>pending.promise},emit(){throw Error('observer-failure');}});
  const result=h.target.createStore({root:h.root});assert.equal(result,pending.promise);pending.reject(failure);
  await assert.rejects(result,error=>error===failure);await tick();assert(h.failures()>0);assert(h.observer.snapshot().observerErrors>0);h.observer.restore();
});

test('restore while an operation is pending never cancels it or emits late rows',async()=>{
  const pending=gate(),h=fixture('exports.createStore=({root})=>fs.readdir(root);',{io:{readdir:()=>pending.promise}});
  const result=h.target.createStore({root:h.root});h.observer.restore();const count=h.rows.length;
  assert.equal(h.target.createStore,h.original);pending.resolve(['PRIVATE_CANARY']);assert.deepEqual(await result,['PRIVATE_CANARY']);await tick();
  assert.equal(h.rows.length,count);assert.equal(h.observer.snapshot().pendingCreates,0);
});

test('bounded collection and foreign/explicit-I/O calls preserve operations and mark incomplete coverage',async()=>{
  let calls=0;const h=fixture('exports.createStore=async({root})=>{await fs.lstat(root);await fs.lstat(root);return 7;};',{
    io:{lstat(){calls++;return Promise.resolve({});}},maxOperations:1});
  assert.equal(await h.target.createStore({root:h.root}),7);await tick();assert.equal(calls,2);
  assert.equal(h.observer.snapshot().dropped,1);assert.equal(h.observer.snapshot().summaries[0].truncated,true);
  const foreign={root:path.resolve('/outside')};assert.equal(h.target.createStore(foreign).outside[0],foreign);
  const explicit={root:h.root,io:{}};assert.equal(h.target.createStore(explicit).outside[0],explicit);assert(h.failures()>0);
  h.target.createStore=()=>{};assert.throws(()=>h.observer.restore(),/owner/);
});

test('operation interval union separates unobserved gaps without double-counting overlap',()=>{
  assert.equal(unionMs([{start:2,end:10},{start:4,end:8},{start:20,end:25},{start:24,end:30},{start:31,end:null}]),18);
});

test('actual verified store initializes unchanged, reports its bootstrap I/O, and observes no later cache work',async t=>{
  const root=temporaryRoot('ete-bootstrap-real-', ['cache']),cacheRoot=path.join(root,'cache');let store,observer;
  t.after(async()=>{if(store)await store.close();observer?.restore();await fsp.rm(root,{recursive:true,force:true});});
  const filename=require.resolve('../src/electronapp/enhanced/shared-playback-cache/store.js'),source=fs.readFileSync(filename),actual=require(filename),rows=[];
  const target={createStore:actual.createStore};observer=install({target,filename,source,expectedSha256:sha(source),root:cacheRoot,emit:r=>rows.push(r)});
  store=await target.createStore({root:cacheRoot,currentBytes:1048576,nextBytes:1048576,recoveryMode:'on-demand'});await tick();
  const summary=observer.snapshot().summaries[0];assert.equal(summary.outcome,'fulfilled');assert.equal(summary.pendingOperations,0);assert.equal(summary.truncated,false);
  assert(rows.some(r=>r.operation==='guard.acquire'));assert(rows.some(r=>r.operation==='fs.rename'));assert(rows.some(r=>r.operation==='handle.truncate'));
  assert.equal(observer.snapshot().observerErrors,0);const before=rows.length;await store.close();store=null;assert.equal(rows.length,before);
  observer.restore();assert.equal(target.createStore,actual.createStore);
  assert(!JSON.stringify(rows).includes(cacheRoot));
});
