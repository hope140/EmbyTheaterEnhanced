'use strict';
// Adapter protocol tests with request/response events and proxy/store IO doubles.
// No real socket, origin, disk cache, Native decode or latency claim.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {EventEmitter}=require('node:events'),{createRequire}=require('node:module');
const authorityModule=require('../src/electronapp/enhanced/preload-source-authority');
const filename=require.resolve('../src/electronapp/enhanced/shared-playback-cache/adapter');
const source=fs.readFileSync(filename,'utf8');
async function fixture(t,{response={},hold=false,holdClose=false,preparedHandoff=false}={}){
 const authority=authorityModule.createAuthority(),web=new EventEmitter();web.isDestroyed=()=>false;const principal=authority.principalFor(web),requests=[],grants=[];let proxyOptions,closed=false,proxyClosed=0,storeCreates=0,release,releaseClose;
 const barrier=new Promise(resolve=>{release=resolve;}),closeBarrier=new Promise(resolve=>{releaseClose=resolve;});
 const http={request(url,options){const request=new EventEmitter();request.destroyed=false;const row={url,options,closed:false};requests.push(row);
  request.destroy=()=>{if(request.destroyed)return;request.destroyed=true;row.closing=true;queueMicrotask(()=>{(async()=>{if(holdClose)await closeBarrier;row.closed=true;request.emit('close');})().catch(error=>request.emit('error',error));});};
  request.end=()=>{(async()=>{if(hold)await barrier;else await Promise.resolve();if(request.destroyed)return;const incoming=new EventEmitter();incoming.statusCode=response.status??206;incoming.headers={'content-range':'bytes 0-0/64','content-length':'1',etag:'"ordinary-v1"',...response.headers};incoming.destroy=()=>{};request.emit('response',incoming);if(!request.destroyed){incoming.emit('data',Buffer.alloc(response.bytes??1,65));if(!request.destroyed)incoming.emit('end');}})().catch(error=>{request.emit('error',error);request.destroy();});};return request;
 }};
 const originalRequire=createRequire(filename),module={exports:{}};
 const requireFor=key=>key==='node:http'||key==='node:https'?http:key==='./proxy'?{async createProxy(options){proxyOptions=options;return{async open(identity){const grant=await options.authorize(identity,{signal:new AbortController().signal});grants.push({identity,grant});return{url:'http://127.0.0.1:19001/event-double-route',async ready(){},async actual(){return true;},async stop(){},async preload(){},async coverage(){return{bytes:grant.metadata.total};}};},status:()=>({hitBytes:0}),async close(){proxyClosed++;await options.store.close();}};}}:originalRequire(key);
 new Function('require','module','exports',source)(requireFor,module,module.exports);
 const cache=await module.exports.createCache({kind:'shared-byte-trial',preparedHandoff,root:path.resolve('/workspace/ordinary-probe-unit-unused'),progressPercent:70,preloadMB:100,timeoutMs:30000},{createStore:async()=>{storeCreates++;return {status:()=>({closed,committed:0,current:0,next:0}),async close(){closed=true;},async forgetActualUnlessMedia(){}};}});
 t.after(async()=>{release();releaseClose();await cache.close();authority.close();});
 function context({kind='emby-http',size,token='synthetic'}={}){const url='https://emby.invalid/Videos/A/stream.avi?Static=true&api_key='+token;
  const proof=authority.issue({principal,source:url,requestId:'play',sourceKind:kind,resourceKey:'opaque-main-identity',...(size===undefined?{}:{expectedSize:size})});
  const owner=new AbortController(),transport=authority.bind({principal,source:url,sourceProof:proof,requestId:'play',signal:owner.signal});return{source:url,identity:{serverOrigin:'https://emby.invalid',serverId:'server',accountId:'account',itemId:'A',mediaSourceId:'A-avi',representation:transport.representation},transport,owner};}
 async function open(ctx){return cache.open({...ctx,currentBytes:300*1048576,isCurrent:()=>!ctx.owner.signal.aborted,signal:ctx.owner.signal});}
 return{cache,requests,grants,context,open,release,releaseClose,get proxyOptions(){return proxyOptions;},stats:()=>({closed,proxyClosed,storeCreates})};
}
test('ordinary size comes from exactly one closed 0-0 probe and is pinned for all later access',async t=>{
 const f=await fixture(t),ctx=f.context(),phases=[];ctx.onPreparationPhase=value=>{phases.push(value);throw Error('synthetic-observer-failure');};
 const handle=await f.open(ctx);await handle.ready();assert.deepEqual(phases,['source-probe','backend','metadata']);assert.equal(f.requests.length,1);assert(f.requests[0].closed);assert.deepEqual(f.requests[0].options.headers,{Range:'bytes=0-0','Accept-Encoding':'identity',Connection:'close'});
 assert.equal(f.grants.length,1);assert.equal(f.grants[0].grant.metadata.total,64);assert.equal(f.grants[0].grant.metadata.etag,'"ordinary-v1"');assert.equal(handle.status().total,64);
 const access=await f.proxyOptions.resolveAccess(f.grants[0].identity,null,{signal:new AbortController().signal});assert.equal(access.expectedSize,64);assert.equal(f.requests.length,1,'no duplicate size probe');await handle.markPlaying();await handle.stop();await f.cache.close();assert(f.stats().closed);assert.equal(f.stats().proxyClosed,1);
});
for(const [name,response] of [
 ['redirect',{status:302,headers:{location:'https://other.invalid/media'}}],['auth',{status:401}],['not206',{status:200}],
 ['missing-range',{headers:{'content-range':undefined}}],['wrong-range',{headers:{'content-range':'bytes 1-1/64'}}],
 ['unsafe-total',{headers:{'content-range':'bytes 0-0/9007199254740993'}}],['zero-total',{headers:{'content-range':'bytes 0-0/0'}}],
 ['wrong-length',{headers:{'content-length':'2'}}],['encoding',{headers:{'content-encoding':'gzip'}}],
 ['missing-etag',{headers:{etag:undefined}}],['weak-etag',{headers:{etag:'W/"ordinary-v1"'}}],['invalid-etag',{headers:{etag:'bad'}}],
 ['empty-body',{bytes:0}],['extra-body',{bytes:2}]
])test('ordinary probe refuses '+name+' before publishing a cache grant or route',async t=>{
 const f=await fixture(t,{response});await assert.rejects(f.open(f.context()));assert.equal(f.requests.length,1);assert(f.requests[0].closed);assert.equal(f.grants.length,0);
});
test('CD2 missing declared size still fails; its known size must exactly match the HTTP total',async t=>{
 const f=await fixture(t);await assert.rejects(f.open(f.context({kind:'direct-url'})),/file-size-unavailable/);assert.equal(f.requests.length,0);
 await assert.rejects(f.open(f.context({kind:'direct-url',size:32})),/representation-changed/);assert.equal(f.requests.length,1);assert.equal(f.grants.length,0);
 const good=await f.open(f.context({kind:'direct-url',size:64}));assert.equal(good.status().total,64);assert.equal(f.requests.length,2);await good.stop();
});
test('a copied or renderer-shaped transport cannot opt into unknown-size admission',async t=>{
 const f=await fixture(t),ctx=f.context();ctx.transport={...ctx.transport,probeSize:true};await assert.rejects(f.open(ctx),/source-proof-invalid/);assert.equal(f.requests.length,0);assert.equal(f.grants.length,0);
});
test('retiring an ordinary owner cancels a held probe and late response cannot publish a route',async t=>{
 const f=await fixture(t,{hold:true}),ctx=f.context(),opening=f.open(ctx);opening.catch(()=>{});for(let n=0;n<20&&!f.requests.length;n++)await new Promise(resolve=>setImmediate(resolve));assert.equal(f.requests.length,1);ctx.owner.abort();await assert.rejects(opening,/request-cancelled/);assert(f.requests[0].closed);f.release();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.grants.length,0);await f.cache.close();assert(f.stats().closed);
});
test('a later explicit ordinary open re-probes a changed size/version without rewriting the old grant',async t=>{
 const response={headers:{}},f=await fixture(t,{response}),first=await f.open(f.context());await first.stop();
 response.headers={'content-range':'bytes 0-0/96',etag:'"ordinary-v2"'};
 const next=await f.open(f.context({token:'renewed'}));assert.equal(f.requests.length,2);assert(f.requests.every(r=>r.closed));
 assert.equal(f.grants.length,2);assert.equal(f.grants[0].grant.metadata.total,64);assert.equal(f.grants[0].grant.metadata.etag,'"ordinary-v1"');assert.equal(f.grants[1].grant.metadata.total,96);assert.equal(f.grants[1].grant.metadata.etag,'"ordinary-v2"');assert.equal(next.status().total,96);
 const access=await f.proxyOptions.resolveAccess(f.grants[1].identity,null,{signal:new AbortController().signal});assert.equal(access.expectedSize,96);await next.stop();
});
test('a complete ordinary one-byte response cannot publish a route before request close',async t=>{
 const f=await fixture(t,{holdClose:true});let resolved=false;const opening=f.open(f.context()).then(value=>{resolved=true;return value;});
 for(let n=0;n<20&&!f.requests[0]?.closing;n++)await new Promise(resolve=>setImmediate(resolve));assert.equal(f.requests[0].closing,true);assert.equal(f.requests[0].closed,false);assert.equal(resolved,false);assert.equal(f.grants.length,0);
 f.releaseClose();const handle=await opening;assert(f.requests[0].closed);assert.equal(f.grants.length,1);await handle.stop();
});

function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
test('event-double probe completes while budget is pending with no store/key and then advances through budget/backend',async t=>{
 const budget=deferred();t.after(()=>budget.resolve(262144));const f=await fixture(t),ctx=f.context(),phases=[];
 const opening=f.cache.open({...ctx,currentBytesReady:budget.promise,isCurrent:()=>true,signal:ctx.owner.signal,onPreparationPhase:phase=>phases.push(phase)});opening.catch(()=>{});
 for(let n=0;n<20&&!f.requests[0]?.closed;n++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.requests.length,1);assert.equal(f.requests[0].closed,true);assert.equal(f.stats().storeCreates,0);assert.equal(f.grants.length,0);assert.equal(phases.at(-1),'budget');
 budget.resolve(262144);const handle=await opening;assert.equal(f.stats().storeCreates,1);assert.equal(f.grants.length,1);assert.deepEqual(phases,['source-probe','budget','backend','metadata']);await handle.stop();
});
for(const outcome of ['budget-rejection','retired-owner','invalid-budget'])test('pending preparation '+outcome+' cannot create store/key and closes the one probe',async t=>{
 const budget=deferred();t.after(()=>budget.resolve(262144));const f=await fixture(t,{hold:true}),ctx=f.context();
 const opening=f.cache.open({...ctx,currentBytesReady:budget.promise,isCurrent:()=>!ctx.owner.signal.aborted,signal:ctx.owner.signal});opening.catch(()=>{});
 for(let n=0;n<20&&!f.requests.length;n++)await new Promise(resolve=>setImmediate(resolve));assert.equal(f.requests.length,1);
 if(outcome==='budget-rejection')budget.reject(Error('synthetic-budget-unavailable'));
 else if(outcome==='retired-owner'){ctx.owner.abort();budget.resolve(262144);}else budget.resolve(-1);
 await assert.rejects(opening);assert.equal(f.requests[0].closed,true);assert.equal(f.grants.length,0);assert.equal(f.stats().storeCreates,0);
 f.release();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.requests.length,1);assert.equal(f.grants.length,0);
});
test('source refusal finishes without waiting for pending budget or admitting a late store',async t=>{
 const budget=deferred();t.after(()=>budget.resolve(262144));const f=await fixture(t,{response:{status:403}}),ctx=f.context();
 const opening=f.cache.open({...ctx,currentBytesReady:budget.promise,isCurrent:()=>true,signal:ctx.owner.signal});await assert.rejects(opening,/auth-required/);
 assert.equal(f.requests.length,1);assert.equal(f.requests[0].closed,true);assert.equal(f.stats().storeCreates,0);assert.equal(f.grants.length,0);
 budget.resolve(262144);await new Promise(resolve=>setImmediate(resolve));assert.equal(f.stats().storeCreates,0);
});

test('prepared metadata is claimed by a new transport without another selection probe and is consumed once',async t=>{
 const f=await fixture(t,{preparedHandoff:true}),old=f.context();const next=await f.open(old);
 await next.prefetch({maxBytes:64,signal:new AbortController().signal});await next.stop();old.owner.abort();
 assert.equal(f.requests.length,1);const fresh=f.context({token:'new-authorized-token'});fresh.role='current';
 const current=await f.open(fresh);await current.ready();assert.equal(f.requests.length,1);assert.equal(f.grants.length,2);
 assert.equal(f.grants[1].grant.preparedHandoff,true);assert.equal(f.grants[1].grant.accessChecked,false);
 assert.equal(f.grants[1].grant.url,fresh.source);assert.equal(f.grants[1].grant.metadata.etag,'"ordinary-v1"');
 assert.equal(current.status().preparedHandoff,true);await current.stop();
 const again=f.context({token:'another-request'});again.role='current';const handle=await f.open(again);
 assert.equal(f.requests.length,2,'the consumed snapshot is not reused a second time');assert.equal(f.grants.at(-1).grant.preparedHandoff,undefined);await handle.stop();
});
test('different account cannot claim another prepared identity',async t=>{
 const response={},f=await fixture(t,{preparedHandoff:true,response}),next=await f.open(f.context());
 await next.prefetch({maxBytes:64,signal:new AbortController().signal});await next.stop();response.status=403;
 const fresh=f.context();fresh.role='current';fresh.identity.accountId='another-account';
 await assert.rejects(f.open(fresh),/auth-required/);assert.equal(f.requests.length,2);assert.equal(f.grants.length,1);
});
test('failed budget consumes the claimed metadata and cannot revive its old route or skip the next fresh probe',async t=>{
 const f=await fixture(t,{preparedHandoff:true}),next=await f.open(f.context());await next.prefetch({maxBytes:64,signal:new AbortController().signal});await next.stop();
 const fresh=f.context();await assert.rejects(f.cache.open({...fresh,role:'current',currentBytesReady:Promise.reject(Error('owned-budget-failure')),isCurrent:()=>true,signal:fresh.owner.signal}));
 assert.equal(f.requests.length,1);assert.equal(f.grants.length,1);
 const again=f.context();again.role='current';const current=await f.open(again);assert.equal(f.requests.length,2);assert.equal(f.grants.at(-1).grant.preparedHandoff,undefined);await current.stop();
});

test('a weak validator cannot produce a prepared handoff even for an otherwise supported known-size source',async t=>{
 const f=await fixture(t,{preparedHandoff:true,response:{headers:{etag:'W/"known-v1"'}}}),ctx=f.context({kind:'direct-url',size:64});
 const next=await f.open(ctx);await next.prefetch({maxBytes:64,signal:new AbortController().signal});await next.stop();
 const fresh=f.context({kind:'direct-url',size:64});fresh.role='current';const handle=await f.open(fresh);
 assert.equal(f.requests.length,2);assert.equal(f.grants.at(-1).grant.preparedHandoff,undefined);await handle.stop();
});
