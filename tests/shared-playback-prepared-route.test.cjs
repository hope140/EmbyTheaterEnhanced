'use strict';
// Maintained proxy with HTTP event doubles: no sockets, Native, or latency claim.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {EventEmitter}=require('node:events'),{createRequire}=require('node:module');
const filename=require.resolve('../src/electronapp/enhanced/shared-playback-cache/proxy');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};}
async function fixture(t,{holdHeaders=false,holdBody=false,holdClose=false,status=206,etag='"v1"',bodyBytes,bodyFill=65,headerTotal=8,accessGate,readGate,refreshGate,mediaBufferBytes=8*1024*1024}={}){
 let handler,owner=true,reads=0,actuals=0,missing=false,accesses=0,authorizations=0,closed=false;
 const requests=[],heldHeaders=[],heldBodies=[],heldCloses=[],responses=[];
 const origin={status,etag,bodyBytes,bodyFill,headerTotal};
 const releaseHeaders=()=>{holdHeaders=false;for(const send of heldHeaders.splice(0))send();};
 const releaseBodies=()=>{holdBody=false;for(const send of heldBodies.splice(0))send();};
 const releaseCloses=()=>{holdClose=false;for(const close of heldCloses.splice(0))close();};
 const http={createServer(_options,callback){handler=callback;const server=new EventEmitter();server.listen=(_port,_host,done)=>done();server.address=()=>({port:19001});server.closeAllConnections=()=>{for(const r of responses)if(!r.finished)r.destroy();};server.close=done=>done();return server;},
  request(url,options){
   let incoming;const request=new EventEmitter(),row={url,headers:options.headers,closed:false};requests.push(row);request.destroyed=false;
   request.destroy=error=>{if(request.destroyed)return;request.destroyed=true;if(incoming){incoming.emit('aborted');incoming.emit('close');}if(error)request.emit('error',error);const close=()=>{row.closed=true;request.emit('close');};if(holdClose)heldCloses.push(close);else queueMicrotask(close);};
   request.end=()=>queueMicrotask(()=>{
    const emitHeaders=()=>{
      if(request.destroyed)return;
      const range=/^bytes=(\d+)-(\d+)$/.exec(options.headers.Range),start=Number(range[1]),end=Number(range[2]),length=end-start+1;
      const response=incoming=new EventEmitter();response.statusCode=origin.status;response.readableHighWaterMark=262144;response.headers={'content-range':`bytes ${start}-${end}/${origin.headerTotal}`,'content-length':String(length),etag:origin.etag};response.destroy=()=>{};response.pause=()=>{};response.resume=()=>{};
      request.emit('response',response);
      const send=()=>queueMicrotask(()=>{if(request.destroyed)return;const bytes=origin.bodyBytes??length;if(bytes)response.emit('data',Buffer.alloc(bytes,origin.bodyFill));response.emit('end');});
      if(holdBody)heldBodies.push(send);else send();
    };
    if(holdHeaders)heldHeaders.push(emitHeaders);else emitHeaders();
   });return request;
  }};
 const store={open:async()=> 'key',span:async()=>missing?null:{start:0,end:8},nextOffset:async(_key,offset)=>offset<8?8:null,
  read:async(_key,_offset,length)=>{reads++;if(readGate)await readGate.promise;return Buffer.alloc(length,65);},actual:async()=>{actuals++;return true;},
  put:async()=>false,invalidate:async()=>{missing=true;},status:()=>({currentKey:null}),close:async()=>{closed=true;}};
 const authorize=async()=>{authorizations++;if(authorizations>1&&refreshGate){await refreshGate.promise;throw Error('refresh-refused');}return {url:'http://origin.invalid/source',origin:'http://origin.invalid',metadata:{total:8,etag:'"v1"'},accessChecked:false,preparedHandoff:true,...(refreshGate?{expiresAt:0}:{})};};
 const resolveAccess=async()=>{accesses++;if(accesses>1&&accessGate)await accessGate.promise;if(!owner)throw Error('retired-owner');return{url:'http://origin.invalid/source',origin:'http://origin.invalid',expectedSize:8};};
 const module={exports:{}},originalRequire=createRequire(filename);
 new Function('require','module','exports',fs.readFileSync(filename,'utf8'))(key=>key==='node:http'||key==='node:https'?http:key==='node:perf_hooks'?{performance:{now:()=>0}}:originalRequire(key),module,module.exports);
 const proxy=await module.exports.createProxy({store,authorize,resolveAccess,timeoutMs:1000,mediaBufferBytes});
 const route=await proxy.open({server:'server',account:'account',item:'item',mediaSource:'media',resource:'resource',representation:'original'},'next');await route.ready();
 function get({target=route,holdDrain=false}={}){
  const req=new EventEmitter();req.url=new URL(target.url).pathname;req.method='GET';req.headers={host:'127.0.0.1:19001',range:'bytes=0-7'};
  const res=new EventEmitter(),done=deferred();res.chunks=[];res.headersSent=false;res.writableHighWaterMark=262144;res.finished=false;
  res.writeHead=(code,headers)=>{res.status=code;res.headers=headers;res.headersSent=true;};
  res.write=data=>{res.chunks.push(Buffer.from(data));return !holdDrain;};
  res.end=()=>{if(res.finished)return;res.finished=true;res.emit('finish');res.emit('close');done.resolve(res);};res.destroy=()=>{res.destroyed=true;res.end();};
  responses.push(res);handler(req,res);return{res,promise:done.promise};
 }
 t.after(async()=>{owner=false;accessGate?.resolve();readGate?.resolve();refreshGate?.resolve();releaseHeaders();releaseBodies();releaseCloses();await proxy.close();});
 return{proxy,route,get,requests,origin,releaseHeaders,releaseBodies,releaseCloses,stats:()=>({reads,actuals,accesses,closed}),retireOwner(){owner=false;},miss(){missing=true;}};
}

test('all responses wait for real Range headers, then ready cache wins without a separate0-0 or waiting for body',async t=>{
 const f=await fixture(t,{holdHeaders:true,holdBody:true});let promoted=false;const actual=f.route.actual().then(v=>{promoted=true;return v;});
 const a=f.get(),b=f.get();await turn();assert.equal(f.requests.length,1);assert.equal(f.requests[0].headers.Range,'bytes=0-7');assert.equal(f.requests[0].headers['If-Match'],undefined);
 assert.equal(promoted,false);assert.equal(a.res.chunks.length+b.res.chunks.length,0);
 f.releaseHeaders();const results=await Promise.all([a.promise,b.promise]);assert(results.every(r=>r.status===206&&Buffer.concat(r.chunks).equals(Buffer.alloc(8,65))));
 assert.equal(await actual,true);await f.proxy.drain();assert.equal(f.stats().actuals,1);assert.equal(f.route.status().localHitBytes,16);assert.equal(f.route.status().preparedValidation,'ready');assert.equal(f.proxy.status().preparedCacheWins,1);assert.equal(f.proxy.status().readReservedBytes,0);
});
test('ordinary source body wins immediately over slow local IO and late cache cannot alter that response',async t=>{
 const gate=deferred(),f=await fixture(t,{readGate:gate}),a=f.get();const result=await a.promise;
 assert.equal(result.status,206);assert.deepEqual(Buffer.concat(result.chunks),Buffer.alloc(8,65));assert.equal(f.route.status().localHitBytes,0);assert.equal(f.proxy.status().preparedSourceWins,1);
 gate.resolve();await f.proxy.drain();assert.equal(f.proxy.status().readReservedBytes,0);assert.deepEqual(Buffer.concat(result.chunks),Buffer.alloc(8,65));
});
test('changed version forwards that same original response without retry, old cache, or changing player URL',async t=>{
 const f=await fixture(t,{etag:'"v2"',bodyFill:66}),a=await f.get().promise;
 assert.equal(a.status,206);assert.deepEqual(Buffer.concat(a.chunks),Buffer.alloc(8,66));assert.equal(f.requests.length,1);assert.equal(f.requests[0].headers.Range,'bytes=0-7');
 assert.equal(f.route.status().localHitBytes,0);assert.equal(f.route.status().fallbackOriginal,true);assert.equal(await f.route.actual(),false);
 const again=await f.get().promise;assert.equal(again.status,206);assert.deepEqual(Buffer.concat(again.chunks),Buffer.alloc(8,66));assert.equal(f.route.status().localHitBytes,0);
 await f.proxy.drain();assert.equal(f.proxy.status().readReservedBytes,0);
});
test('unforwardable size change locks concurrent responses to307 before any bytes and never revives cache',async t=>{
 const f=await fixture(t,{headerTotal:9}),a=f.get(),b=f.get();const result=await Promise.all([a.promise,b.promise]);
 assert(result.every(r=>r.status===307&&r.headers.Location==='http://origin.invalid/source'&&r.chunks.length===0));assert.equal(f.route.status().localHitBytes,0);assert.equal(await f.route.actual(),false);
 f.origin.headerTotal=8;assert.equal((await f.get().promise).status,307);assert.equal(f.requests.length,1);await f.proxy.drain();assert.equal(f.proxy.status().readReservedBytes,0);
});
test('retired owner cannot publish a pending fallback or cached bytes',async t=>{
 const gate=deferred(),f=await fixture(t,{headerTotal:9,accessGate:gate}),a=f.get(),b=f.get();await turn();assert(f.stats().accesses>=2);f.retireOwner();gate.resolve();
 const result=await Promise.all([a.promise,b.promise]);assert(result.every(r=>r.status===502&&r.chunks.length===0));assert.equal(f.route.status().fallbackOriginal,undefined);await f.proxy.drain();assert.equal(f.proxy.status().readReservedBytes,0);
});
test('closing with an actual waiter but no request settles without network or late promotion',async t=>{
 const f=await fixture(t),actual=f.route.actual();await f.proxy.close();assert.equal(await actual,false);assert.equal(f.stats().actuals,0);assert.equal(f.requests.length,0);assert(f.stats().closed);
});
test('a later detected version change cannot redirect an already running demuxer',async t=>{
 const f=await fixture(t),first=await f.get().promise;assert.equal(first.status,206);f.miss();f.origin.etag='"v2"';
 const next=await f.get().promise;assert.equal(next.status,502);assert.equal(f.route.status().fallbackOriginal,undefined);assert.equal(next.chunks.length,0);
});
test('cache winner cancellation releases its buffer while socket teardown remains owned',async t=>{
 const f=await fixture(t,{holdHeaders:true,holdBody:true,holdClose:true}),a=f.get({holdDrain:true});await turn();f.releaseHeaders();await turn();
 assert.equal(f.proxy.status().preparedCacheWins,1);a.res.destroy();await a.promise;await turn();assert.equal(f.proxy.status().readReservedBytes,0);
 f.releaseCloses();await f.proxy.drain();assert.equal(f.proxy.status().activeOrigins,0);
});
test('request refresh failure before fetch setup releases a completed candidate',async t=>{
 const gate=deferred(),f=await fixture(t,{refreshGate:gate}),a=f.get();await turn();assert(f.stats().reads>0);f.retireOwner();gate.resolve();
 assert.equal((await a.promise).status,502);await f.proxy.drain();assert.equal(f.proxy.status().readReservedBytes,0);assert.equal(f.requests.length,0);
});
test('two prepared reads cannot reserve memory using stale pre-await availability',async t=>{
 const gate=deferred(),f=await fixture(t,{readGate:gate,mediaBufferBytes:1048576});
 const other=await f.proxy.open({server:'s2',account:'a2',item:'b',mediaSource:'b',resource:'b',representation:'b'},'next');await other.ready();
 const results=await Promise.all([f.get().promise,f.get({target:other}).promise]);assert(results.every(r=>r.status===206));assert(f.proxy.status().peakMediaReservedBytes<=1048576);
 gate.resolve();await f.proxy.drain();assert.equal(f.proxy.status().readReservedBytes,0);
});

for(const tag of [undefined,'W/"weak"'])test('unversioned initial source falls back before bytes and cannot later adopt another tag: '+tag,async t=>{
 const f=await fixture(t,{etag:tag===undefined?'"v1"':tag});if(tag===undefined)f.origin.etag=undefined;
 const first=await f.get().promise;assert.equal(first.status,307);assert.equal(first.chunks.length,0);assert.equal(f.route.status().localHitBytes,0);
 f.origin.etag='"v3"';f.origin.bodyFill=67;const later=await f.get().promise;assert.equal(later.status,307);assert.equal(later.chunks.length,0);assert.equal(f.requests.length,1);await f.proxy.drain();assert.equal(f.proxy.status().readReservedBytes,0);
});
