'use strict';
// Real main issuance + session/authority logic; cache IO and Native are doubles.
// No sockets, real origin, OS cache guard, decode or performance claim.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {createRequire}=require('node:module'),{EventEmitter}=require('node:events');
const authorityModule=require('../src/electronapp/enhanced/preload-source-authority');
const diagnostics=require('../src/electronapp/enhanced/playback-range-diagnostics');
const range=require('../src/electronapp/enhanced/playback-range-session');
const {createSourceSession}=require('../src/electronapp/enhanced/playback-range-source-session');
const {createBudgetReader}=require('../src/electronapp/native-helper/shared-cache-budget');
const serviceFile=require.resolve('../src/electronapp/native-helper/service'),source=fs.readFileSync(serviceFile,'utf8');
function fixture(t,{openGate}={}){
 const authority=authorityModule.createAuthority(),web=new EventEmitter();web.isDestroyed=()=>false;const helper={currentGenerationId:1},budgetCalls=[],opens=[],promoted=[],stops=[];let ordinaryCalls=0,closes=0,clock=0,stored=0;
 helper.getProperty=async(...args)=>{budgetCalls.push(args);return 300*1048576;};
 const budget=createBudgetReader((c,g)=>c===helper&&g===helper.currentGenerationId);
 const sandbox={settings:{sourceAuthority:authority},crypto,preloadDiagnostics:diagnostics,getWebContents:()=>web,require:createRequire(serviceFile),rangeGenerationOwner:{helper,generationId:1,label:'play-1',scope:crypto.randomUUID(),principal:authority.principalFor(web)}};
 const a=source.indexOf('  function authorizeRange('),b=source.indexOf('  const sharedBudget =',a);assert(a>0&&b>a);vm.runInNewContext(source.slice(a,b)+'\nordinary=authorizeOrdinaryRange;cd2=authorizeRange;',sandbox);
 const cache={status:()=>({backendState:'ready',bytes:stored}),async close(){closes++;},async discardNext(){},async markUncachedPlaying(){},async open(value){
  opens.push(value);if(openGate)await openGate.promise;let stopped=false;
  return{source:'http://127.0.0.1:19001/no-network-route',async ready(){},status:()=>({bytes:value.role==='next'?32:0,total:32}),async markPlaying(){promoted.push(value.identity.itemId);},async stop(){stopped=true;stops.push(value.identity.itemId);},async prefetch(){assert.equal(stopped,false);stored=32;return{bytes:32};}};
 }};
 const config={kind:'source-aware',root:path.resolve('/workspace/ordinary-unit-unused/legacy'),sharedRoot:path.resolve('/workspace/ordinary-unit-unused/shared'),progressPercent:70,preloadMB:300,timeoutMs:30000};
 const authorizeOrdinary=(...args)=>{ordinaryCalls++;return sandbox.ordinary(...args);};
 const create=options=>range.createSession({...options,create:async()=>cache,now:()=>clock});
 sandbox.authorizeOrdinaryRange=authorizeOrdinary;sandbox.readSharedCurrentBytes=budget.read;sandbox.reportPreload=()=>{};
 sandbox.require=name=>name==='../enhanced/playback-range-source-session'?{createSourceSession:options=>createSourceSession(options,{createSession:create})}:name==='../enhanced/playback-range-session'?{...range,createSession:create}:createRequire(serviceFile)(name);
 const factoryStart=source.indexOf('  function createRangeSession(config)'),factoryEnd=source.indexOf('  function rangeKey(',factoryStart);assert(factoryStart>0&&factoryEnd>factoryStart);
 vm.runInNewContext(source.slice(factoryStart,factoryEnd)+'\nfactory=createRangeSession;',sandbox);
 const session=sandbox.factory(config);
 t.after(async()=>{if(openGate)openGate.release();await session.close();authority.close();});
 function context(item,extra={}){return{source:'https://emby.invalid/Videos/'+item+'/stream.avi?Static=true&MediaSourceId='+item+'-avi&api_key=synthetic',serverOrigin:'https://emby.invalid',serverId:'server',accountId:'account',itemId:item,mediaSourceId:item+'-avi',playSessionId:'session',mode:'DirectStream',mediaType:'Video',container:'avi',...extra};}
 function branded(item,next=false){const value=context(item,{source:'https://cd2.invalid/'+item+'.avi?sig=synthetic',container:'strm'});value.sourceProof=authority.issue({principal:sandbox.rangeGenerationOwner.principal,requestId:next?sandbox.rangeGenerationOwner.scope+'-next-1':sandbox.rangeGenerationOwner.label,source:value.source,sourceKind:'direct-url',resourceKey:'cd2-'+item,expectedSize:32});return value;}
 async function select(value){await session.setContext(value,helper,helper.currentGenerationId);return session.select(value.source,helper,helper.currentGenerationId,['loadfile',value.source]);}
 async function play(value){const selected=await select(value);selected?.commit?.();await session.started(helper,helper.currentGenerationId);return selected;}
 function nextGeneration(){helper.currentGenerationId++;budget.retire();sandbox.rangeGenerationOwner={helper,generationId:helper.currentGenerationId,label:'play-'+helper.currentGenerationId,scope:crypto.randomUUID(),principal:authority.principalFor(web)};}
 return{session,helper,authority,sandbox,web,context,branded,select,play,nextGeneration,budgetCalls,opens,promoted,stops,ordinary:authorizeOrdinary,get ordinaryCalls(){return ordinaryCalls;},get closes(){return closes;},setClock:v=>{clock=v;}};
}
test('qualified ordinary source selects the existing shared M/P path and reauthorizes a new actual Play',async t=>{
 const f=fixture(t);assert(await f.play(f.context('A')));assert.equal(f.session.status().kind,'shared-byte-trial');assert.equal(f.budgetCalls.length,1);assert.deepEqual(f.budgetCalls[0],['demuxer-max-bytes',50]);
 assert.equal((await f.session.preload(f.context('B'),f.helper,1)).state,'ready');assert.equal(f.session.status().next.bytes,32);assert(f.opens.every(v=>authorityModule.isOrdinaryTransport(v.transport)));assert.equal(f.opens[1].role,'next');
 f.nextGeneration();assert(await f.play(f.context('B')));assert.equal(f.budgetCalls.length,2);assert.deepEqual(f.promoted,['A','B']);assert.notEqual(f.opens[1].transport,f.opens[2].transport);assert.equal(f.opens[1].transport.representation,f.opens[2].transport.representation);await f.session.close();assert.equal(f.closes,1);
});
test('ordinary and CD2 next remain on the same shared engine in either source order',async t=>{
 for(const first of ['ordinary','cd2']){const f=fixture(t),a=first==='ordinary'?f.context('A'):f.branded('A');assert(await f.play(a));const b=first==='ordinary'?f.branded('B',true):f.context('B');assert.equal((await f.session.preload(b,f.helper,1)).state,'ready');assert.equal(f.session.status().kind,'shared-byte-trial');assert.equal(f.opens.length,2);assert.notEqual(authorityModule.isOrdinaryTransport(f.opens[0].transport),authorityModule.isOrdinaryTransport(f.opens[1].transport));}
});
test('ordinary capabilities use actual main role/owner checks and never accept a supplied invalid proof',async t=>{
 const f=fixture(t),ctx=f.context('A'),signal=new AbortController().signal;
 f.helper.currentGenerationId=2;assert.throws(()=>f.ordinary(ctx,'current',signal,f.helper,1),/source-proof-invalid/);f.helper.currentGenerationId=1;
 f.helper.transportTerminated=true;assert.throws(()=>f.ordinary(ctx,'current',signal,f.helper,1),/source-proof-invalid/);f.helper.transportTerminated=false;
 assert.throws(()=>f.ordinary(ctx,'current',signal,{},1),/source-proof-invalid/);assert.throws(()=>f.ordinary(ctx,'next',signal,f.helper,2),/source-proof-invalid/);assert.throws(()=>f.ordinary(ctx,'other',signal,f.helper,1),/source-proof-invalid/);
 const before=f.ordinaryCalls;assert.equal(await f.play({...ctx,sourceProof:'invalid'}),null);assert.equal(f.ordinaryCalls,before);assert.equal(f.opens.length,0);
 f.web.emit('did-start-navigation',{isMainFrame:true,isSameDocument:false});assert.throws(()=>f.ordinary(ctx,'current',signal,f.helper,1),/source-proof-invalid/);
});
test('ordinary identity keeps token renewal stable but isolates account, item, source and representation',async t=>{
 const f=fixture(t),signal=new AbortController().signal;
 const issue=ctx=>f.ordinary(ctx,'current',signal,f.helper,1),baseline=issue(f.context('A'));
 assert(authorityModule.isOrdinaryTransport(baseline));assert.equal(authorityModule.isOrdinaryTransport({...baseline}),false);assert.equal(authorityModule.isTransport({...baseline}),false);
 assert.equal(issue(f.context('A',{source:f.context('A').source.replace('api_key=synthetic','api_key=renewed')})).representation,baseline.representation);
 for(const change of [{accountId:'other'},{mediaSourceId:'other'},{itemId:'other'},{source:f.context('A').source+'&AudioStreamIndex=1'}])assert.notEqual(issue(f.context('A',change)).representation,baseline.representation);
 assert.equal((await baseline.access()).expectedSize,undefined,'renderer metadata cannot supply total');assert.equal(baseline.matchesLoadOptions(['loadfile',f.context('A').source]),true);assert.equal(baseline.matchesLoadOptions(['loadfile',f.context('A').source,'replace','-1','user-agent=untrusted']),false);
});
test('ordinary admission preserves the existing same-origin/static/media eligibility',async t=>{
 const f=fixture(t),signal=new AbortController().signal;
 for(const fields of [{source:'https://other.invalid/a.avi?Static=true'},{mode:'Transcode'},{live:true},{container:'strm'},{source:'file:///a.avi'},{source:'https://emby.invalid/a.avi'},{size:32}])assert.throws(()=>f.ordinary(f.context('A',fields),'current',signal,f.helper,1),/source-proof-invalid/);
 assert(await f.play(f.context('A')));assert.equal((await f.session.preload(f.context('B',{accountId:'other'}),f.helper,1)).state,'unavailable');assert.equal(f.opens.length,1);
});
test('ordinary descriptors cannot impersonate CD2 size, refresh or file-local UA authority',t=>{
 const f=fixture(t),base={principal:f.sandbox.rangeGenerationOwner.principal,requestId:'play',source:f.context('A').source,sourceKind:'emby-http',resourceKey:'ordinary'};
 for(const extra of [{expectedSize:32},{requestOptions:{userAgent:'Agent'}},{refresh:()=>{}},{acquiredAt:1},{expiresAt:2}])assert.throws(()=>f.authority.issue({...base,...extra}),/source-proof-invalid/);
 const proof=f.authority.issue({...base,sourceKind:'direct-url',expectedSize:32}),transport=f.authority.bind({sourceProof:proof,source:base.source,principal:base.principal,requestId:'play',signal:new AbortController().signal});assert(authorityModule.isTransport(transport));assert.equal(authorityModule.isOrdinaryTransport(transport),false);
});
test('late ordinary preparation retains the 50ms deadline, stops its route and cannot revive original fallback',async t=>{
 let release,entered;const promise=new Promise(r=>{release=r;}),began=new Promise(r=>{entered=r;});const f=fixture(t,{openGate:{promise,release}}),ctx=f.context('A');
 // Wait on an in-memory factory event, not a network or wall-clock delay.
 const original=f.opens.push;f.opens.push=function(value){const n=original.call(this,value);entered();return n;};
 const selecting=f.select(ctx);await began;f.setClock(51);release();assert.equal(await selecting,null);assert.equal(f.session.status().current.route,'original');assert.equal(f.session.status().current.diagnostic.reason,'timeout');assert.equal(await f.session.select(ctx.source,f.helper,1,['loadfile',ctx.source]),null);assert.equal(f.opens.length,1);assert.deepEqual(f.stops,['A']);
 await f.session.started(f.helper,1);assert.equal((await f.session.preload(f.context('B'),f.helper,1)).state,'ready');assert.equal(f.session.status().current.route,'original','next work cannot revive expired current');
});
