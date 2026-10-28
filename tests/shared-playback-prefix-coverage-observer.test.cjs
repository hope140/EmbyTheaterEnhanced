'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {create}=require('../tools/shared-playback-cache/prefix-coverage-observer.cjs');
const fixture=require('../tools/shared-playback-cache/windows-fixtures.cjs'),contract=require('../tools/shared-playback-cache/layered-protocol.cjs');
const {createEmby}=require('../tools/shared-playback-cache/app-emby-fixture.cjs');
const {createStore}=require('../src/electronapp/enhanced/shared-playback-cache/store');
const {createProxy}=require('../src/electronapp/enhanced/shared-playback-cache/proxy');
const tick=()=>new Promise(setImmediate),key='a'.repeat(64);
const identity={server:'private-server-canary',account:'private-account-canary',item:'C',mediaSource:'C-avi',resource:'private-source-canary',representation:'raw'};
const owner={helper:'owned-helper',generationId:131,endpointId:'owned-endpoint'};
function observer(){let at=0,failures=0;const o=create({now:()=>++at,context:()=>({phase:'cold-C',item:'C',...owner}),onFailure:()=>failures++});return{o,failures:()=>failures};}
test('prefix observer preserves put receiver, argument buffers and exact return Promise; stores only hashed identity',async()=>{
 const {o,failures}=observer();let resolve,reject,calls=0,spanCalls=0;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;}),data=Buffer.from('fixture bytes');
 const store={put(...args){assert.equal(this,store);assert.deepEqual(args,[key,224,data]);assert.equal(args[2],data);calls++;return promise;},status:()=>({pending:11,pendingCount:1,currentKey:key}),span:async(k,offset)=>{spanCalls++;assert.equal(k,key);assert.equal(offset,224);return{start:224,end:1234};}};
 const original=store.put;o.watch(store);o.bind(key,identity,{total:9999,etag:'private-validator-canary'},'C',owner,store);
 assert.equal(store.put(key,224,data),promise);assert.equal(calls,1);resolve(false);await tick();
 const result=await o.sample({store,proxy:{status:()=>({skippedWrites:1})},key,offset:224,threshold:6291456,owner,item:'C',phase:'cold-C'});assert.deepEqual(result.span,{start:224,end:1234});assert.equal(spanCalls,1);
 let receipt=o.snapshot();assert.equal(receipt.puts[0].accepted,false);assert.equal(receipt.lastSample.binding.key,key);assert.equal(receipt.lastSample.binding.item,'C');assert.equal(receipt.lastSample.offset,224);assert.equal(receipt.lastSample.threshold,6291456);assert.equal(receipt.lastSample.proxy.skippedWrites,1);assert.equal(receipt.pending,0);
 assert.doesNotMatch(JSON.stringify(receipt),/private-(server|account|source|validator)-canary/);o.restore();assert.equal(store.put,original);assert.equal(o.snapshot().restored,true);assert.equal(failures(),0);assert.equal(typeof reject,'function');
});
test('missing key, key mismatch and span holes remain distinct negative observations; no retry or repair',async()=>{
 const {o}=observer();let calls=0;const store={status:()=>({currentKey:'b'.repeat(64),faulted:false,pending:0}),span:async k=>{calls++;return k===key?{start:224,end:1000}:null;}};
 const base={store,proxy:null,offset:1037120,threshold:6291456,owner,item:'C',phase:'cold-C'};
 assert.equal((await o.sample({...base,key:null})).span,null);assert.equal(calls,0);
 await o.sample({...base,key:'b'.repeat(64)});assert.equal(o.snapshot().lastSample.binding,null);assert.equal(o.snapshot().lastSample.span,null);
 await o.sample({...base,key});assert.deepEqual(o.snapshot().lastSample.span,{start:224,end:1000});assert.equal(calls,2);assert.equal(o.snapshot().puts.length,0);
});
test('put throws/rejections stay caller-owned and bounded observation overflow fails evidence',async()=>{
 const {o,failures}=observer();const failure=Error('private-error-canary');let mode='throw';const store={put(){if(mode==='throw')throw failure;return Promise.reject(failure);},status:()=>({})};o.watch(store);
 assert.throws(()=>store.put(key,0,Buffer.alloc(1)),e=>e===failure);mode='reject';await assert.rejects(store.put(key,0,Buffer.alloc(1)),e=>e===failure);await tick();assert.deepEqual(o.snapshot().puts.map(r=>r.outcome),['threw','rejected']);assert.equal(o.snapshot().pending,0);assert.doesNotMatch(JSON.stringify(o.snapshot()),/private-error-canary/);
 for(let n=0;n<513;n++)o.bind(key,identity,{total:1},'C',owner);assert(o.snapshot().dropped>0);assert(failures()>0);o.restore();
});
test('same key in different store instances and changed full identities/versions cannot share a diagnostic binding',async()=>{
 const {o}=observer(),make=()=>({put:()=>true,status:()=>({currentKey:key}),span:async()=>null}),first=make(),second=make();o.watch(first);o.watch(second);
 o.bind(key,identity,{total:9999,etag:'old'},'C',owner,first);
 const args={store:second,proxy:null,key,offset:1037072,threshold:6291456,owner,item:'C',phase:'cold-C'};
 await o.sample(args);assert.equal(o.snapshot().lastSample.binding,null);assert.equal(o.snapshot().lastSample.storeInstance,2);
 o.bind(key,{...identity,representation:'different-representation'},{total:9999,etag:'new'},'C',{...owner,generationId:132},second);
 await o.sample(args);const receipt=o.snapshot();assert.equal(receipt.lastSample.binding.storeInstance,2);assert.equal(receipt.lastSample.binding.owner.generationId,132);assert.notEqual(receipt.bindings[0].identityHash,receipt.bindings[1].identityHash);assert.notEqual(receipt.bindings[0].metadataHash,receipt.bindings[1].metadataHash);o.restore();
});
test('unchanged sparse proxy can deliver all paced prefix bytes while slow durable writes leave a permanent coverage hole', {timeout:30000},async t=>{
 const root=require('./helpers/range-fixture-root.cjs').temporaryRoot('ete-prefix-observation-',['cache']);let store,proxy,source,request,response,release;const gate=new Promise(resolve=>{release=resolve;});
 t.after(async()=>{release();request?.destroy();response?.destroy();const results=await Promise.allSettled([proxy?.close(),source?.close(),store?.close()]);await fs.rm(root,{recursive:true,force:true});for(const row of results)if(row.status==='rejected')throw row.reason;});
 const fixtureRoot=path.join(root,'fixture');await fs.mkdir(fixtureRoot);const plan=await fixture.generateFixtures(fixtureRoot,{encoding:'uncompressed-dib-bgr24',timing:contract.FIXTURE_TIMING});
 const events=[],io={...fs,writeFile:async(file,...args)=>{if(path.basename(file).startsWith('.block-'))await gate;return fs.writeFile(file,...args);}};
 store=await createStore({root:path.join(root,'cache'),currentBytes:32*1048576,nextBytes:8*1048576,io});
 const {o,failures}=observer();o.watch(store);const originalOpen=store.open;store.open=function(...args){const promise=originalOpen.apply(this,args);promise.then(k=>o.bind(k,args[0],args[1],'C',owner,store));return promise;};
 source=await fixture.startWindowsSources({plan,createEmby,pacing:contract.LIMITS,record:(type,row)=>events.push({type,...row})});
 const file=plan.media.C,url=source.mediaOrigin+'/Videos/C/stream.avi?fixture=synthetic';
 proxy=await createProxy({store,requestPolicy:'sparse',authorize:async()=>({url,origin:source.mediaOrigin,userAgent:fixture.USER_AGENT,metadata:{total:file.size,etag:file.etag}})});
 const route=await proxy.open(identity);await route.ready();let bytes=0;const chunks=[];
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{request.destroy();reject(Error('prefix-reproduction-timeout'));},10000);
  request=http.get(route.url,{headers:{Range:'bytes=224-'}},res=>{response=res;res.on('data',chunk=>{bytes+=chunk.length;chunks.push(chunk);if(bytes===contract.LIMITS.prefixBytes){clearTimeout(timeout);res.pause();resolve();}else if(bytes>contract.LIMITS.prefixBytes)reject(Error('prefix-overrun'));});res.on('error',reject);});request.on('error',reject);
 });
 const until=Date.now()+2000;while(!events.some(r=>r.type==='media-paced-wait')&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,2));assert(events.some(r=>r.type==='media-paced-wait'&&r.writtenBytes===6291456));
 assert.equal(bytes,6291456);assert(Buffer.concat(chunks).equals((await fs.readFile(path.join(fixtureRoot,'C.avi'))).subarray(224,224+6291456)));assert.equal(response.readableEnded,false);
 const bound=o.snapshot().bindings.at(-1);assert(bound);const args={store,proxy,key:bound.key,offset:contract.frameRange(file,.5).start,threshold:contract.LIMITS.prefixBytes,owner,item:'C',phase:'cold-C'};
 await o.sample(args);assert.equal(o.snapshot().lastSample.span,null);assert.equal(proxy.status().writes,8);assert.equal(proxy.status().skippedWrites,16);assert.equal(store.status().pending,2097152);
 release();const drainDeadline=Date.now()+5000;while(proxy.status().writes&&Date.now()<drainDeadline)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(proxy.status().writes,0);
 const after=await o.sample(args);assert.deepEqual(after.span,{start:224,end:224+8*262144});assert(after.span.end<contract.LIMITS.prefixBytes);assert.equal(proxy.status().skippedWrites,16);assert.equal(store.status().pending,0);assert.equal(store.status().faulted,false);
 await tick();await o.sample(args);assert.equal(o.snapshot().puts.length,8);assert(o.snapshot().puts.every(r=>r.accepted));assert.equal(o.snapshot().lastSample.proxy.skippedWrites,16);assert.equal(o.snapshot().lastSample.store.currentKey,null);assert.equal(o.snapshot().pending,0);assert.equal(failures(),0);
 assert(events.filter(r=>r.type==='media-open').every(r=>r.item==='C'));request.destroy();response.destroy();await proxy.close();await source.close();o.restore();assert.equal(o.snapshot().restored,true);assert.equal(source.snapshot().activeMediaResponses,0);assert.equal(source.snapshot().mediaSockets,0);assert.equal(source.snapshot().heldRequests,0);
});
