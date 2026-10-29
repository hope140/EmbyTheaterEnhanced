'use strict';
// Maintained proxy with HTTP event doubles: no sockets, Native, or latency claim.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {EventEmitter}=require('node:events'),{createRequire}=require('node:module');
const filename=require.resolve('../src/electronapp/enhanced/shared-playback-cache/proxy');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};}
async function fixture(t,{holdBody=false,holdClose=false,status=206,etag='"v1"',bodyBytes,accessGate}={}){
 let handler,owner=true,reads=0,actuals=0,missing=false,accesses=0,closed=false;
 const requests=[],heldBodies=[],heldCloses=[],responses=[];
 const origin={status,etag,bodyBytes};
 const releaseBodies=()=>{holdBody=false;for(const send of heldBodies.splice(0))send();};
 const releaseCloses=()=>{holdClose=false;for(const close of heldCloses.splice(0))close();};
 const http={createServer(_options,callback){handler=callback;const server=new EventEmitter();server.listen=(_port,_host,done)=>done();server.address=()=>({port:19001});server.closeAllConnections=()=>{for(const r of responses)if(!r.finished)r.destroy();};server.close=done=>done();return server;},
  request(url,options){
   const request=new EventEmitter(),row={url,headers:options.headers,closed:false};requests.push(row);request.destroyed=false;
   request.destroy=()=>{if(request.destroyed)return;request.destroyed=true;const close=()=>{row.closed=true;request.emit('close');};if(holdClose)heldCloses.push(close);else queueMicrotask(close);};
   request.end=()=>queueMicrotask(()=>{
    if(request.destroyed)return;const response=new EventEmitter();response.statusCode=origin.status;response.readableHighWaterMark=262144;response.headers={'content-range':'bytes 0-0/8','content-length':'1',etag:origin.etag};response.destroy=()=>{};response.pause=()=>{};response.resume=()=>{};
    request.emit('response',response);
    const send=()=>queueMicrotask(()=>{if(request.destroyed)return;const length=origin.bodyBytes??1;if(length)response.emit('data',Buffer.alloc(length,65));response.emit('end');});
    if(holdBody)heldBodies.push(send);else send();
   });return request;
  }};
 const store={open:async()=> 'key',span:async()=>missing?null:{start:0,end:8},nextOffset:async(_key,offset)=>offset<8?8:null,
  read:async(_key,_offset,length)=>{reads++;return Buffer.alloc(length,65);},actual:async()=>{actuals++;return true;},
  put:async()=>false,invalidate:async()=>{missing=true;},status:()=>({currentKey:null}),close:async()=>{closed=true;}};
 const authorize=async()=>({url:'http://origin.invalid/source',origin:'http://origin.invalid',metadata:{total:8,etag:'"v1"'},accessChecked:false,preparedHandoff:true});
 const resolveAccess=async()=>{accesses++;if(accesses>1&&accessGate)await accessGate.promise;if(!owner)throw Error('retired-owner');return{url:'http://origin.invalid/source',origin:'http://origin.invalid',expectedSize:8};};
 const module={exports:{}},originalRequire=createRequire(filename);
 new Function('require','module','exports',fs.readFileSync(filename,'utf8'))(key=>key==='node:http'||key==='node:https'?http:originalRequire(key),module,module.exports);
 const proxy=await module.exports.createProxy({store,authorize,resolveAccess,timeoutMs:1000});
 const route=await proxy.open({server:'server',account:'account',item:'item',mediaSource:'media',resource:'resource',representation:'original'},'next');await route.ready();
 function get(){
  const req=new EventEmitter();req.url=new URL(route.url).pathname;req.method='GET';req.headers={host:'127.0.0.1:19001',range:'bytes=0-7'};
  const res=new EventEmitter(),done=deferred();res.chunks=[];res.headersSent=false;res.writableHighWaterMark=262144;res.finished=false;
  res.writeHead=(code,headers)=>{res.status=code;res.headers=headers;res.headersSent=true;};
  res.write=data=>{res.chunks.push(Buffer.from(data));return true;};
  res.end=()=>{if(res.finished)return;res.finished=true;res.emit('finish');res.emit('close');done.resolve(res);};res.destroy=()=>{res.destroyed=true;res.end();};
  responses.push(res);handler(req,res);return{res,promise:done.promise};
 }
 t.after(async()=>{owner=false;accessGate?.resolve();releaseBodies();releaseCloses();await proxy.close();});
 return{proxy,route,get,requests,origin,releaseBodies,releaseCloses,stats:()=>({reads,actuals,accesses,closed}),retireOwner(){owner=false;},miss(){missing=true;}};
}
test('all concurrent GETs and actual ownership wait for the same complete one-byte response and close',async t=>{
 const f=await fixture(t,{holdBody:true,holdClose:true});let promoted=false;const actual=f.route.actual().then(v=>{promoted=true;return v;});
 const a=f.get(),b=f.get();await turn();assert.equal(f.requests.length,1);assert.equal(f.stats().reads,0);assert.equal(promoted,false);assert.equal(a.res.chunks.length+b.res.chunks.length,0);
 f.releaseBodies();await turn();assert.equal(f.requests[0].closed,false);assert.equal(f.stats().reads,0);assert.equal(promoted,false);
 f.releaseCloses();const results=await Promise.all([a.promise,b.promise]);assert(results.every(r=>r.status===206&&Buffer.concat(r.chunks).equals(Buffer.alloc(8,65))));
 assert.equal(await actual,true);assert.equal(f.stats().actuals,1);assert.equal(f.route.status().localHitBytes,16);assert.equal(f.route.status().preparedValidation,'ready');
});
for(const mode of ['changed-version','short-body'])test('first prepared validation '+mode+' locks concurrent requests to authorized original without cache bytes',async t=>{
 const f=await fixture(t,mode==='changed-version'?{etag:'"v2"'}:{bodyBytes:0});const a=f.get(),b=f.get();
 const result=await Promise.all([a.promise,b.promise]);assert(result.every(r=>r.status===307&&r.headers.Location==='http://origin.invalid/source'&&r.chunks.length===0));
 assert.equal(f.stats().reads,0);assert.equal(f.route.status().localHitBytes,0);assert.equal(f.route.status().fallbackOriginal,true);assert.equal(await f.route.actual(),false);
 f.origin.etag='"v1"';f.origin.bodyBytes=1;const later=await f.get().promise;assert.equal(later.status,307);assert.equal(f.requests.length,1,'fallback never revives prepared reads');
});
test('owner retirement during fallback authorization cannot publish a redirect or cache bytes',async t=>{
 const gate=deferred();t.after(gate.resolve);const f=await fixture(t,{etag:'"v2"',accessGate:gate}),a=f.get(),b=f.get();
 await turn();assert(f.stats().accesses>=2);assert.equal(f.stats().reads,0);f.retireOwner();gate.resolve();
 const result=await Promise.all([a.promise,b.promise]);assert(result.every(r=>r.status===502&&r.chunks.length===0));assert.equal(f.route.status().fallbackOriginal,undefined);
});
test('closing a prepared route with an actual waiter but no GET settles it without network or late promotion',async t=>{
 const f=await fixture(t),actual=f.route.actual();await f.proxy.close();assert.equal(await actual,false);assert.equal(f.stats().actuals,0);assert.equal(f.requests.length,0);assert(f.stats().closed);
});
test('a detected version change after previous delivery fails rather than redirecting a running demuxer',async t=>{
 const f=await fixture(t),first=await f.get().promise;assert.equal(first.status,206);f.miss();f.origin.etag='"v2"';
 const next=await f.get().promise;assert.equal(next.status,502);assert.equal(f.route.status().fallbackOriginal,undefined);assert.equal(next.chunks.length,0);
});
