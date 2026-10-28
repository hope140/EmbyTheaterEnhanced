'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const fixture=require('../tools/shared-playback-cache/windows-fixtures.cjs'),c=require('../tools/shared-playback-cache/layered-protocol.cjs');
const {createEmby}=require('../tools/shared-playback-cache/app-emby-fixture.cjs'),{createStore}=require('../src/electronapp/enhanced/shared-playback-cache/store'),{createProxy}=require('../src/electronapp/enhanced/shared-playback-cache/proxy');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function prefix(url,headers,length,held){return new Promise((resolve,reject)=>{
 let res,done=false,receiving=true,bytes=0;const chunks=[];
 const fail=e=>{if(done)return;done=true;clearTimeout(timer);request.destroy();res?.destroy();reject(e);};
 const request=http.get(url,{headers},incoming=>{res=incoming;incoming.on('data',part=>{
  if(!receiving){fail(Error('prefix-after-stop'));return;}bytes+=part.length;chunks.push(part);
  if(bytes>=length){receiving=false;incoming.pause();if(bytes!==length){fail(Error('prefix-overrun'));return;}
   const result={status:incoming.statusCode,headers:incoming.headers,bytes,hash:hash(Buffer.concat(chunks)),ended:incoming.readableEnded};
   Promise.resolve().then(held).then(()=>{if(done)return;done=true;clearTimeout(timer);incoming.once('close',()=>resolve(result));request.destroy();},fail);
  }
 });incoming.on('error',e=>{if(!done)fail(e);});});
 const timer=setTimeout(()=>fail(Error('prefix-timeout')),10000);request.on('error',e=>{if(!done)fail(e);});
});}
test('layered equal-time fixture preserves legacy bodies and supply while accurately retiming C', {timeout:40000}, async t=>{
 const root=require('./helpers/range-fixture-root.cjs').temporaryRoot('ete-layered-timing-',['cache']);let source,proxy,store;
 t.after(async()=>{const results=await Promise.allSettled([proxy?.close(),source?.close(),store?.close()]);await fs.rm(root,{recursive:true,force:true});for(const r of results)if(r.status==='rejected')throw r.reason;});
 const oldRoot=path.join(root,'old'),newRoot=path.join(root,'new');await fs.mkdir(oldRoot);await fs.mkdir(newRoot);
 const legacy=await fixture.generateFixtures(oldRoot,{encoding:'uncompressed-dib-bgr24'}),equal=await fixture.generateFixtures(newRoot,{encoding:'uncompressed-dib-bgr24',timing:c.FIXTURE_TIMING});
 const before=await fs.readFile(path.join(oldRoot,'C.avi')),after=await fs.readFile(path.join(newRoot,'C.avi'));
 store=await createStore({root:path.join(root,'cache'),currentBytes:32*1048576,nextBytes:8*1048576});
 const verify=async plan=>{const source=await fixture.startWindowsSources({plan,createEmby});const closed=await source.close();assert.equal(closed.activeMediaResponses,0);assert.equal(closed.grpcStopped,true);};
 await t.test('actual AVI changes only the three timing fields; body, index, frame IDs and byte sizes remain identical',async()=>{
  assert.equal(legacy.timing,undefined);assert.equal(legacy.media.C.fps,24);assert.equal(legacy.media.C.durationSeconds,8);assert.equal(equal.media.C.fps,12);assert.equal(equal.media.C.durationSeconds,16);c.assertFixtureTiming(equal);
  assert.equal(before.length,after.length);assert(before.subarray(224).equals(after.subarray(224)));const allowed=new Set([32,33,34,35,36,37,38,39,132,133,134,135]);
  for(let i=0;i<before.length;i++)if(before[i]!==after[i])assert(allowed.has(i),'unreviewed AVI byte change '+i);
  for(const [offset,oldValue,newValue]of [[32,41667,83333],[36,4147200,2073600],[132,24,12]]){assert.equal(before.readUInt32LE(offset),oldValue);assert.equal(after.readUInt32LE(offset),newValue);}
  assert.equal(after.readUInt32LE(140),192);assert.equal(equal.media.C.sha256,hash(after));assert.notEqual(equal.media.C.sha256,legacy.media.C.sha256);assert.equal(equal.media.C.etag,'"'+hash(after)+'"');
  for(const id of ['A','B'])assert.equal(equal.media[id].sha256,legacy.media[id].sha256);await verify(legacy);await verify(equal);
 });
 await t.test('metadata-only relabeling, wrong headers, stale ETag and unsupported timing fail closed',async()=>{
  const wrong=structuredClone(legacy);wrong.timing=c.FIXTURE_TIMING;wrong.mediaMetadata.C={...equal.mediaMetadata.C};Object.assign(wrong.fixtures.find(x=>x.id==='C'),{fps:12,durationSeconds:16});await assert.rejects(verify(wrong),/fixture-timing-header/);
  for(const mutate of [p=>p.timing='unknown',p=>p.media.C.fps=24,p=>p.media.C.frames=191]){const p=structuredClone(equal);mutate(p);assert.throws(()=>c.assertFixtureTiming(p));}
  for(const key of ['size','dataStart','frameStride','sha256']){const p=JSON.parse(JSON.stringify(equal));p.media.C[key]=key==='sha256'?'f'.repeat(64):p.media.C[key]+1;assert.throws(()=>c.assertFixtureTiming(p));await assert.rejects(verify(p),/fixture-timing-projection/);}
  const wrongEtag=structuredClone(equal);wrongEtag.fixtures.find(x=>x.id==='C').etag='"stale"';await assert.rejects(verify(wrongEtag),/fixture-timing-header/);
  const changed=Buffer.from(after);changed.writeUInt32LE(24,132);await fs.writeFile(path.join(newRoot,'C.avi'),changed);const forged=structuredClone(equal),row=forged.fixtures.find(x=>x.id==='C');row.sha256=hash(changed);row.etag='"'+row.sha256+'"';try{await assert.rejects(verify(forged),/fixture-timing-header/);}finally{await fs.writeFile(path.join(newRoot,'C.avi'),after);}
 });
 await t.test('both phases retain identical wall-time targets, frame18 reference and 70368-byte boundary; no gate is lowered',()=>{
  const end=224+c.LIMITS.prefixBytes;assert.equal(c.LIMITS.prefixBytes,6291456);assert.equal(c.LIMITS.gapBytes,786432);assert.equal(c.LIMITS.quietMs,5000);assert.deepEqual(c.TARGETS['cold-C'],c.TARGETS['ready-A']);
  for(const id of ['A','C']){const f=equal.media[id];assert.equal(Math.floor((c.TARGETS['cold-C']['cached-seek']+1)*f.fps),18);assert(c.frameRange(f,1.5).end<=end);assert(c.frameRange(f,1.25).end<=end);assert.equal(c.frameRange(f,3).start,6221312);assert.equal(end-c.frameRange(f,3).start,70368);assert(c.frameRange(f,8).start>end);assert(c.frameRange(f,14).start>end);}
  assert.deepEqual(c.SCENARIOS.slice(1).map(x=>c.TARGETS['cold-C'][x]),[.5,3,8,14]);assert.equal(Math.floor((.25+1)*legacy.media.C.fps),30);assert(c.frameRange(legacy.media.C,1.25).end<=end,'old bytes cover frame30; cannot claim target bytes were absent');
 });
 await t.test('real source and unchanged sparse proxy deliver the identical full C prefix and keep A untouched',async()=>{
  const events=[];source=await fixture.startWindowsSources({plan:equal,createEmby,pacing:c.LIMITS,record:(type,data)=>events.push({type,...data})});
  const file=equal.media.C,url=source.mediaOrigin+'/Videos/C/stream.avi?fixture=synthetic';
  proxy=await createProxy({store,requestPolicy:'sparse',authorize:async()=>({url,origin:source.mediaOrigin,userAgent:fixture.USER_AGENT,metadata:{total:file.size,etag:file.etag}})});
  const route=await proxy.open({server:'owned-fixture',account:'fixture-user',item:'C',mediaSource:'C-avi',resource:'fixture:C',representation:'rgb24'});await route.ready();
  const held=n=>async()=>{const until=Date.now()+3000;while(events.filter(e=>e.type==='media-paced-wait').length<n&&Date.now()<until)await new Promise(r=>setTimeout(r,1));assert.equal(events.filter(e=>e.type==='media-paced-wait').length,n);};
  const direct=await prefix(url,{'User-Agent':fixture.USER_AGENT,Range:'bytes=224-'},c.LIMITS.prefixBytes,held(1)),cached=await prefix(route.url,{Range:'bytes=224-'},c.LIMITS.prefixBytes,held(2));
  const expected=hash(after.subarray(224,224+c.LIMITS.prefixBytes));for(const r of [direct,cached]){assert.equal(r.status,206);assert.equal(r.hash,expected);assert.equal(r.ended,false);assert.equal(Number(r.headers['content-length']),file.size-224);assert.equal(r.headers['content-range'],`bytes 224-${file.size-1}/${file.size}`);}
  assert.equal(proxy.status().hitBytes,0);assert.equal(cached.bytes,direct.bytes);assert(events.filter(e=>e.type==='media-open').every(e=>e.item==='C'));assert(events.some(e=>e.type==='media-paced-wait'&&e.writtenBytes===6291456));await proxy.close();await store.close();const cleanup=await source.close();assert.equal(cleanup.activeMediaResponses,0);assert.equal(cleanup.mediaSockets,0);assert.equal(cleanup.heldRequests,0);assert.equal(cleanup.grpcStopped,true);
 });
});
