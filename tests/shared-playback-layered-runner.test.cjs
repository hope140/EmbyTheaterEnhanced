'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm');
const {Writable}=require('node:stream');
const c=require('../tools/shared-playback-cache/layered-protocol.cjs'),runner=require('../tools/shared-playback-cache/layered-runner.cjs');
const evidence=require('../tools/shared-playback-cache/fixture-frame-evidence.cjs'),color=require('../tools/shared-playback-cache/fixture-color-profile.cjs');
const product='c'.repeat(40),tool='d'.repeat(40),worker=fs.readFileSync(require.resolve('../tools/shared-playback-cache/layered-electron.cjs'),'utf8');
const oldFiles=['app-performance-electron.cjs','app-performance-runner.cjs','app-performance-contract.cjs','app-performance-metrics.cjs','windows-contract.cjs','windows-ci.ps1','windows-ci-root.cjs'];
function owner(helper='h1',generationId=131,endpointId='endpoint-1'){return{helper,generationId,endpointId};}
const cache=new Map();
function frame(item,n){const key=item+n;if(!cache.has(key)){const f=evidence.renderExpected(item,n);for(let i=0;i<f.pixels.length;i+=4)for(let k=0;k<3;k++)f.pixels[i+k]=Math.round(color.value(f.pixels[i+k],color.MODEL));cache.set(key,evidence.analyze(f,{item,colorModel:color.MODEL}));}return structuredClone(cache.get(key));}
function phaseReceipt(task,phase,selection=task.arm==='B'?'proxy':'original'){
 const owned=phase==='cold-C'?owner():owner('h2',131,'endpoint-2'),item=c.ITEM[phase];
 const r={phase,item,selection,owner:owned,stopConfirmed:true,loadAt:10,samples:[]};
 r.budget={...owned,phase,outcome:'fulfilled',at:1,resolvedAt:3,requestGeneration:owned.generationId,requestId:1,bytes:314572800,response:{helper:owned.helper,generationId:owned.generationId,requestId:1,at:2}};
 r.source={...owned,phase,item,accepted:true,at:1,resolvedAt:3,proofHash:(item==='A'?'a':'c').repeat(64)};
 r.samples=c.SCENARIOS.map((scenario,i)=>{const t=i?c.TARGETS[phase][scenario]:null,fps=item==='C'?24:12,at=100+i*1000;
  return{phase,item,scenario,pair:task.pair,arm:task.arm,status:'PASS',latencyMs:100,sourceBodyBytes:i?0:1000,sourceStreamReadBytes:i?0:1001,oneByteReadBytes:i?0:1,localHitBytes:selection==='proxy'&&scenario==='boundary-seek'?70368:0,overlapBodyBytes:0,peakRssBytes:1024,peakDiskBytes:2048,
   frameProof:{owner:owned,hash:String(i+1).repeat(64),profile:{supported:true,model:color.MODEL},evidence:frame(item,t===null?13:t*fps),after:at+2,requestedAt:at+3,resolvedAt:at+4,deadline:at+4999,clock:{origin:0,after:at+2,requestedAt:at+3,resolvedAt:at+4,deadline:at+4999}},
   seekProof:i?{owner:owned,previousHash:'0'.repeat(64),target:t,submittedAt:at,positionAt:at+1,restartAt:at+2,deadline:at+5000,clock:{origin:0,submittedAt:at,positionAt:at+1,restartAt:at+2,deadline:at+5000}}:null};});return r;
}
function receipt(task){return{schema:2,kind:'ordinary-C-stop-A',pid:123,index:task.index,pair:task.pair,arm:task.arm,productCommit:product,toolCommit:tool,phases:Object.fromEntries(c.PHASES.map(p=>[p,phaseReceipt(task,p)]))};}

test('actual new plan retains 46 processes and 460 phase slots without changing old strict gates apart from exact product binding',()=>{
 assert.equal(c.cases('entry').length,2);const tasks=c.cases('matrix');assert.equal(tasks.length,46);assert.equal(c.slots(tasks).length,460);assert.equal(tasks.filter(t=>t.pair>=0).length,40);
 assert.equal(c.LIMITS.quietMs,5000);assert.equal(c.LIMITS.warmups,3);assert.equal(c.LIMITS.pairs,20);
 assert.equal(new Set(runner.TOOL_FILES).size,runner.TOOL_FILES.length);
 const cp=require('node:child_process');for(const file of oldFiles){const name='tools/shared-playback-cache/'+file;let committed=cp.execFileSync('git',['show','b5005a7e1f40a965c354cbfa6458c0734be2550a:'+name],{cwd:path.join(__dirname,'..'),encoding:'utf8'});if(['windows-contract.cjs','app-performance-contract.cjs'].includes(file))committed=committed.replace('c9504345e8f50239aebfd117b942c12f6f8dc7bc',c.BASE);assert.doesNotThrow(()=>require('../tools/shared-playback-cache/windows-smoke.cjs').boundToolBytes(Buffer.from(committed),fs.readFileSync(path.join(__dirname,'..',name))));}
});
test('ordinary renderer really requests C then A, with unchanged seek/pause actions and no forged source proof',async()=>{
 const calls=[],pm={async play(arg){calls.push(arg.ids[0]);},getCurrentPlayer:()=>({currentSrc:()=>true}),pause(){calls.push('pause');},async seek(v){calls.push(v);}};
 for(const phase of c.PHASES)await vm.runInNewContext(c.rendererAction('play',undefined,phase),{require:async()=>[pm]});
 await vm.runInNewContext(c.rendererAction('pause'),{require:async()=>[pm]});await vm.runInNewContext(c.rendererAction('seek',.25),{require:async()=>[pm]});
 assert.deepEqual(calls,['C','A','pause',2500000]);assert.doesNotMatch(c.rendererAction('play',undefined,'cold-C'),/sourceProof|\.define\(/);
 assert.throws(()=>c.rendererAction('play',undefined,'quiet'));
 for(const phase of c.PHASES)assert.deepEqual(c.SCENARIOS.slice(1).map(s=>c.TARGETS[phase][s]*(phase==='cold-C'?24:12)),[6,36,96,168]);
});
for(const arm of ['A','B'])test('real sequencing function keeps the same fixed quiet duration for arm '+arm,async()=>{
 let now=0;const calls=[],state={quiet:{opened:0,sourceBytes:0},aRequests:0,initialAReads:0};
 await c.runStages({arm,play:async p=>{calls.push(p);return true;},beginQuiet:async()=>{calls.push('stop-drained');},snapshot:async()=>state,backend:()=>({state:arm==='B'?'ready':'idle'}),beginReady:async()=>calls.push('ready-open'),wait:async ms=>{calls.push(ms);now+=ms;},now:()=>now});
 assert.deepEqual(calls,['cold-C','stop-drained',5000,'ready-open','ready-A']);
});
for(const [name,change]of Object.entries({'idle backend':o=>o.backend=()=>({state:'idle'}),'failed backend':o=>o.backend=()=>({state:'failed'}),'wait body':o=>o.snapshot=async()=>({quiet:{opened:0,sourceBytes:1},aRequests:0,initialAReads:0}),'wait probe':o=>o.snapshot=async()=>({quiet:{opened:1,sourceBytes:0},aRequests:0,initialAReads:0}),'A prefill':o=>o.hasTargetKey=()=>true,'service replaced':o=>o.sameService=()=>false,'C function failure':o=>o.play=async()=>false}))test('sequencing rejects '+name+' without a second or third retry',async()=>{
 let now=0,plays=[];const opts={arm:'B',play:async p=>{plays.push(p);return true;},beginQuiet:async()=>{},snapshot:async()=>({quiet:{opened:0,sourceBytes:0},aRequests:0,initialAReads:0}),backend:()=>({state:'ready'}),beginReady:async()=>{},wait:async ms=>{now+=ms;},now:()=>now};change(opts);await assert.rejects(c.runStages(opts));assert.ok(!plays.includes('ready-A'));assert.ok(plays.length<=1);
});
test('ledger retains case/request tombstones, all 1B bytes and forbids post-close/cross-phase traffic',()=>{
 let now=0;const l=c.createLedger(c.cases('entry'),{now:()=>now});l.activate(0);
 l.record('media-open',{requestId:1,item:'C',start:5,end:5});l.window('cold-C',[{start:0,end:10}]);l.record('media-bytes',{requestId:1,start:5,length:1});l.record('media-close',{requestId:1});
 assert.equal(l.snapshot().phases['cold-C'].sourceBytes,1);assert.equal(l.snapshot().phases['cold-C'].bodyBytes,1);assert.equal(l.snapshot().phases['cold-C'].overlapBytes,1);
 l.beginQuiet();now=5000;l.beginReady();l.record('media-bytes',{requestId:1,start:5,length:1});assert.equal(l.snapshot().phases['cold-C'].sourceBytes,2);assert.equal(l.snapshot().phases['ready-A'].sourceBytes,0);assert(l.snapshot().errors.includes('layered-read-after-close'));assert(l.snapshot().errors.includes('layered-cross-phase-read'));
 l.activate(1);l.record('media-open',{requestId:1,item:'C',start:0,end:0},1);l.record('media-bytes',{requestId:1,start:0,length:1},1);assert.equal(l.states[0].phases['cold-C'].sourceBytes,2);assert.equal(l.states[1].phases['cold-C'].sourceBytes,1);assert.equal(l.requests.get('0:1').sourceBytes,2);assert.equal(l.requests.get('0:1').crossPhaseBytes,1);assert.equal(l.requests.get('0:1').readAfterCloseBytes,1);assert.equal(l.requests.get('0:1').bodyBytes,2);assert.equal(l.requests.get('1:1').sourceBytes,1);
});
test('quiet forbids late old bytes and new requests; early A never becomes an authorized ready request',()=>{
 const l=c.createLedger(c.cases('entry'),{now:()=>5000});l.activate(0);l.record('media-open',{requestId:1,item:'C',start:0,end:0});l.record('media-close',{requestId:1});l.beginQuiet();
 l.record('media-bytes',{requestId:1,start:0,length:1});assert.equal(l.snapshot().quiet.sourceBytes,1);assert.equal(l.snapshot().phases['cold-C'].sourceBytes,1);
 l.record('media-open',{requestId:2,item:'A',start:0,end:0});l.record('media-bytes',{requestId:2,start:0,length:1});assert.equal(l.snapshot().aRequests,1);assert.equal(l.snapshot().initialAReads,1);assert.throws(()=>l.beginReady());
});
test('advance is phase/order owned and cannot release C responses from A',()=>{
 let now=0;const l=c.createLedger(c.cases('entry'),{now:()=>now});l.activate(0);l.record('media-open',{requestId:1,item:'C',start:0,end:100});assert.throws(()=>l.advance('ready-A','boundary-seek'));assert.throws(()=>l.advance('cold-C','uncached-seek'));l.advance('cold-C','boundary-seek');l.record('media-close',{requestId:1});l.beginQuiet();now=5000;l.beginReady();l.record('media-open',{requestId:2,item:'C',start:0,end:100});assert.throws(()=>l.advance('ready-A','boundary-seek'));
});
test('fresh helper can restart generation numbers; current Native response and current proof remain mandatory',()=>{
 const t={index:0,pair:0,arm:'B'},r=phaseReceipt(t,'ready-A');assert.equal(c.freshEvidence('ready-A',r),true);assert.equal(c.validatePhase('ready-A','B',r),true);
 for(const mutate of [r=>r.budget.response.helper='h1',r=>r.budget.requestGeneration=130,r=>r.budget.response.requestId=2,r=>r.budget.resolvedAt=11,r=>r.source.item='C',r=>r.source.generationId=130,r=>r.source.accepted=false]){const copy=structuredClone(r);mutate(copy);assert.equal(c.freshEvidence('ready-A',copy),false);}
 assert.equal(c.sameOwner(owner(),r.owner),false);
});
for(const [name,mutate]of Object.entries({'wrong media':r=>r.frameProof.evidence.matches[0].item='A','ambiguous':r=>r.frameProof.evidence.matches.push({...r.frameProof.evidence.matches[0]}),'wrong target':r=>r.frameProof.evidence.matches[0].frameIndex=100,'fitted curve':r=>r.frameProof.evidence.colorModel='identity','late frame':r=>r.frameProof.resolvedAt=r.frameProof.deadline+1,'old helper':r=>r.frameProof.owner.helper='foreign','no restart':r=>r.seekProof.restartAt=r.seekProof.submittedAt-1,'old pixels':r=>r.seekProof.previousHash=r.frameProof.hash}))test('actual fixed-pattern proof rejects '+name,()=>{
 const p=phaseReceipt({index:0,pair:0,arm:'B'},'cold-C'),r=structuredClone(p.samples[2]);mutate(r);assert.equal(c.sampleEvidence('cold-C',p,r),false);
});
test('original cold fallback can pass safety, but ready A requires selected proxy and actual boundary local bytes',()=>{
 const task={index:0,pair:0,arm:'B'},cold=phaseReceipt(task,'cold-C','original');assert.equal(c.validatePhase('cold-C','B',cold),true);
 const ready=phaseReceipt(task,'ready-A','original');assert.equal(c.validatePhase('ready-A','B',ready),false);const proxied=phaseReceipt(task,'ready-A');proxied.samples[2].localHitBytes=0;assert.equal(c.validatePhase('ready-A','B',proxied),false);
});
test('per-slot receipt merge preserves failed numeric latency and other valid observations when resources/slots are missing',()=>{
 const task={index:0,pair:0,arm:'B'},r=receipt(task);r.phases['cold-C'].samples[2].status='FAIL';r.phases['cold-C'].samples[2].latencyMs=93;r.phases['cold-C'].samples[0].peakRssBytes=null;r.phases['ready-A'].samples.pop();
 const rows=c.receiptRows(r,{spawnPid:123},task,product,tool);assert.equal(rows.length,10);assert.equal(rows[2].latencyMs,93);assert.equal(rows[0].latencyMs,100);assert.equal(rows[0].peakRssBytes,null);assert.equal(rows[1].status,'PASS');assert.equal(rows[9].latencyMs,null);assert.equal(rows[9].sourceStreamReadBytes,null);
 assert.equal(c.receiptRows({...r,pid:124},{spawnPid:123},task,product,tool),null);
});
test('full denominator statistics separate cold proxy/fallback and omit untrusted cases from quantiles without deleting raw rows',()=>{
 const tasks=c.cases('matrix'),rows=c.slots(tasks),results=[];
 for(const t of tasks){const r=receipt(t);if(t.arm==='B'&&t.pair===0)r.phases['cold-C']=phaseReceipt(t,'cold-C','original');const mapped=c.receiptRows(r,{spawnPid:123},t,product,tool);for(const v of mapped){const at=rows.findIndex(s=>s.phase===v.phase&&s.scenario===v.scenario&&s.arm===v.arm&&s.pair===v.pair);rows[at]=v;}results[t.index]={accepted:true,phaseTrust:{'cold-C':true,'ready-A':true},phases:Object.fromEntries(c.PHASES.map(p=>[p,{selection:r.phases[p].selection}]))};}
 const untrusted=tasks.find(t=>t.arm==='B'&&t.pair===1);results[untrusted.index].phaseTrust['cold-C']=false;results[untrusted.index].accepted=false;
 const summary=c.summarize(tasks,rows,results,'matrix');assert.equal(rows.length,460);assert.equal(summary.status,'FAIL');assert.equal(summary.phases['cold-C'].bDenominator,23);assert.equal(summary.phases['cold-C'].measuredBDenominator,20);assert.equal(summary.phases['cold-C'].fallbacks,1);
 const groups=summary.phases['cold-C'].scenarios['cold-first-frame'].groups;assert.equal(groups['B-original-fallback'].valid,1);assert.equal(groups['B-proxy'].valid,18);assert.equal(rows.every(r=>r.latencyMs===100),true);
 const missing=c.summarize(tasks,c.slots(tasks),[],'matrix');assert.equal(missing.phases['ready-A'].failedSamples,230);assert.equal(missing.phases['ready-A'].unclassified,23);
});
test('seek confirmation cannot borrow another helper or endpoint even when generation number is reused',()=>{
 const own=owner(),events=[{...owner('other'),name:'seek-submit',value:3,at:1},{...own,name:'time-pos',value:3,at:2},{...own,name:'playback-restart',at:3}];assert.equal(c.seekSignals(events,0,own,3),null);
 events.unshift({...own,name:'seek-submit',value:3,at:0});assert.equal(c.seekSignals(events,0,own,3).after,3);assert.equal(c.seekSignals(events,0,owner('h1',131,'other-endpoint'),3),null);
});
test('actual observer captures phase before asynchronous completion and preserves the product Promise',async()=>{
 const start=worker.indexOf('  function tap('),end=worker.indexOf('  function resourceSample()',start),records=[],restores=[];let resolve;
 const ctx={performance:{now:()=>10},phaseName:'cold-C',client:{helperInstanceId:'h1',currentGenerationId:131},ownerOf:x=>({helper:x.helperInstanceId,endpointId:'e1',generationId:x.currentGenerationId}),retired:false,started:0,observationErrors:0,mark:(t,row)=>records.push({t,...row}),restores,need:(v,code)=>{if(!v)throw Error(code);},get:()=>require('../src/electronapp/enhanced/playback-range-diagnostics')};
 const tap=vm.runInNewContext(worker.slice(start,end)+'\ntap',ctx),promise=new Promise(r=>resolve=r),seen=[];const object={op:()=>promise};tap(object,'op',(v,args,at,captured)=>seen.push(captured),'op');assert.equal(object.op(),promise);ctx.phaseName='ready-A';resolve(1);await promise;await new Promise(r=>setImmediate(r));assert.equal(seen[0].phase,'cold-C');assert.equal(records[1].phase,'cold-C');restores[0]();
});
test('actual request/dispatch overrides retain real decorated Native Promise and reject stale helper/generation response evidence',async()=>{
 const Native=require('../src/electronapp/native-helper/controller').NativeHelperClient;let parentPromise;
 class Base extends Native{request(...args){return parentPromise=super.request(...args);}}
 const reqStart=worker.indexOf('    request(method, params, options)'),reqEnd=worker.indexOf('\n  }\n  native.NativeHelperClient',reqStart),dispatchStart=worker.indexOf('    dispatch(message)'),dispatchEnd=worker.indexOf('    load(values)',dispatchStart);
 const ctx={Base,phaseName:'cold-C',ownerOf:(c,g)=>({helper:c.helperInstanceId,endpointId:'e1',generationId:g}),performance:{now:()=>10},started:0,budgetReads:[],pixelAudit:null,mark:()=>{},observationErrors:0};
 const Class=vm.runInNewContext('(class extends Base {'+worker.slice(dispatchStart,dispatchEnd)+worker.slice(reqStart,reqEnd)+'})',ctx),client=new Class({helperPath:'/unused',libmpvPath:'/unused',helperInstanceId:'owned-model-helper'});
 client.currentGenerationId=131;client.child={stdin:new Writable({write(_chunk,_encoding,done){done();}})};const p=client.request('get-property',{name:'demuxer-max-bytes'},{generationId:131,timeoutMs:50});assert.equal(p,parentPromise);assert.equal(p.generationId,131);assert.equal(p.requestId,1);
 ctx.phaseName='ready-A';client.dispatch({type:'response',helperInstanceId:'foreign',generationId:131,requestId:1,result:{value:314572800}});assert.equal(ctx.budgetReads[0].response,null);
 client.dispatch({type:'response',helperInstanceId:client.helperInstanceId,generationId:130,requestId:1,result:{value:314572800}});assert.equal(ctx.budgetReads[0].response,null);
 client.dispatch({type:'response',helperInstanceId:client.helperInstanceId,generationId:131,requestId:1,result:{value:314572800}});assert.equal((await p).value,314572800);await new Promise(r=>setImmediate(r));assert.equal(ctx.budgetReads[0].phase,'cold-C');assert.equal(ctx.budgetReads[0].response.generationId,131);assert.equal(client.pending.size,0);client.child.stdin.destroy();
});
test('concrete Windows entry and isolated workflow point at the real layered worker without enabling the old strict job too',()=>{
 const src=fs.readFileSync(require.resolve('../tools/shared-playback-cache/layered-runner.cjs'),'utf8');assert.match(src,/tools\/shared-playback-cache\/layered-electron\.cjs/);assert.doesNotMatch(src,/tools\/shared-playback-cache\/app-performance-electron\.cjs/);
 assert.match(worker,/require\(path\.join\(plan\.runtime, 'electronapp\/main\.js'\)\)/);assert.match(worker,/contract\.runStages/);assert.doesNotMatch(worker,/seekFailureControl|rendererBoot|prepareRange/);
 const yaml=fs.readFileSync(path.join(__dirname,'../.github/workflows/public-ci.yml'),'utf8');assert.match(yaml,/app-layered-entry/);assert.match(yaml,/layered-ci\.ps1/);assert.match(yaml,/contains\(fromJSON\('\["app-entry","app-matrix"\]'/);
});


test('real RGB24 fixture C traffic drains before quiet and real A traffic stays in the new phase', {timeout:20000}, async t=>{
 const fixtures=require('../tools/shared-playback-cache/windows-fixtures.cjs'),{createEmby}=require('../tools/shared-playback-cache/app-emby-fixture.cjs');
 const root=require('./helpers/range-fixture-root.cjs').temporaryRoot('ete-layered-source-',['']);let source,now=0;const ledger=c.createLedger(c.cases('entry'),{now:()=>now});ledger.activate(0);
 t.after(async()=>{try{if(source){const closed=await source.close();assert.equal(closed.mediaSockets,0);assert.equal(closed.activeMediaResponses,0);assert.equal(closed.heldRequests,0);assert.equal(closed.grpcStopped,true);}}finally{await fsp.rm(root,{recursive:true,force:true});}});
 const fixture=await fixtures.generateFixtures(root,{encoding:'uncompressed-dib-bgr24'});fixture.autoPlay=false;
 assert.equal(fixture.media.C.fps,24);assert.equal(fixture.media.C.durationSeconds,8);assert.equal(fixture.media.A.fps,12);assert.equal(fixture.media.A.durationSeconds,16);
 source=await fixtures.startWindowsSources({plan:fixture,createEmby,pacing:c.LIMITS,record:(type,data)=>ledger.record(type,data,0)});
 const read=async(item,range)=>{const r=await fetch(source.mediaOrigin+'/Videos/'+item+'/stream.avi',{headers:{'User-Agent':fixtures.USER_AGENT,Range:range}});assert.equal(r.status,206);return Buffer.from(await r.arrayBuffer());};
 assert.equal((await read('C','bytes=0-31')).length,32);
 const until=Date.now()+2000;while(ledger.snapshot().phases['cold-C'].active&&Date.now()<until)await new Promise(r=>setTimeout(r,2));
 assert.equal(ledger.snapshot().phases['cold-C'].active,0);assert.equal(ledger.snapshot().phases['cold-C'].sourceBytes,32);assert.equal(ledger.snapshot().aRequests,0);
 ledger.beginQuiet();now=5000;ledger.beginReady();assert.equal((await read('A','bytes=0-0')).length,1);assert.equal((await read('A','bytes=1-1')).length,1);
 assert.equal(ledger.snapshot().phases['ready-A'].sourceBytes,2);assert.equal(ledger.snapshot().phases['ready-A'].oneByteBytes,2);assert.equal(ledger.snapshot().phases['ready-A'].probeCandidateBytes,1);assert.equal(ledger.snapshot().phases['ready-A'].bodyBytes,1);
 assert.equal(ledger.snapshot().phases['cold-C'].sourceBytes,32);assert.deepEqual(ledger.snapshot().errors,[]);
});


test('one-clock 5000ms frame deadline is exact and rejects widened or inconsistent receipts',()=>{
 const r=phaseReceipt({arm:'B',pair:0},'cold-C'),sample=r.samples[0],proof=sample.frameProof;
 proof.clock={origin:10.000002,after:100.34567,requestedAt:101,resolvedAt:103,deadline:5100.34567};
 for(const k of ['after','requestedAt','resolvedAt','deadline'])proof[k]=proof.clock[k]-proof.clock.origin;
 assert.equal(c.sampleEvidence('cold-C',r,sample),true);
 proof.deadline+=.000001;assert.equal(c.sampleEvidence('cold-C',r,sample),false);
 proof.clock.deadline+=1;proof.deadline=proof.clock.deadline-proof.clock.origin;assert.equal(c.sampleEvidence('cold-C',r,sample),false);
});
test('cleanup revokes trust before awaiting, closes both owners and never restores after a rejection or invalid final state',async()=>{
 const good=()=>({accepted:true,evidenceGood:true,phaseTrust:{'cold-C':true,'ready-A':true}}),state=()=>({errors:[],unknown:0,phases:{'cold-C':{active:0},'ready-A':{active:0}}}),clean={activeMediaResponses:0,mediaSockets:0,heldRequests:0,grpcStopped:true};
 for(const fault of ['control','source','count','ledger','observer',null]){
  const result=good(),calls=[];const action=runner.settleCase({result,closeControl:async()=>{calls.push('control');assert.equal(result.phaseTrust['cold-C'],false);if(fault==='control')throw Error('control-error');},closeSources:async()=>{calls.push('source');if(fault==='source')throw Error('source-error');return{...clean,mediaSockets:fault==='count'?1:0};},state:()=>({...state(),errors:fault==='ledger'?['late']:[]}),observationFailed:()=>fault==='observer'});
  if(['control','source','count'].includes(fault))await assert.rejects(action);else await action;
  assert.deepEqual(calls,['control','source']);assert.equal(result.accepted,fault===null);assert.equal(result.phaseTrust['cold-C'],fault===null);
 }
});
test('restoration and unfinished/dropped bootstrap diagnostics cannot authorize phase statistics',()=>{
 const good={storeInitialization:{pendingCreates:0,observerErrors:0,dropped:0}};assert.equal(c.observerClean(good),true);
 for(const field of ['pendingCreates','observerErrors','dropped'])assert.equal(c.observerClean({storeInitialization:{...good.storeInitialization,[field]:1}}),false);
 assert.equal(c.observerClean({...good,restoreFailure:true}),false);assert.equal(c.observerClean({...good,finalizeFailure:true}),false);assert.equal(c.observerClean({}),false);
});

for(const rejection of [null,undefined,false,0,''])test('cleanup rejection '+String(rejection)+' cannot restore trusted statistics',async()=>{
 const result={accepted:true,evidenceGood:true,phaseTrust:{'cold-C':true,'ready-A':true}};let closed=false;
 await assert.rejects(runner.settleCase({result,closeControl:()=>Promise.reject(rejection),closeSources:async()=>{closed=true;return{activeMediaResponses:0,mediaSockets:0,heldRequests:0,grpcStopped:true};},state:()=>({errors:[],unknown:0,phases:{'cold-C':{active:0},'ready-A':{active:0}}}),observationFailed:()=>false}));
 assert.equal(closed,true);assert.equal(result.accepted,false);assert.equal(result.phaseTrust['ready-A'],false);
});

test('invalid media during quiet retains every byte in its request ledger as well as failing the total ledger',()=>{
 const ledger=c.createLedger(c.cases('entry'),{now:()=>5000});ledger.activate(0);ledger.beginQuiet();ledger.record('media-open',{requestId:1,item:'B',start:4,end:8});ledger.record('media-bytes',{requestId:1,start:4,length:5});
 assert.equal(ledger.requests.get('0:1').sourceBytes,5);assert.equal(ledger.requests.get('0:1').bodyBytes,5);assert.equal(ledger.snapshot().quiet.sourceBytes,5);assert(ledger.snapshot().errors.includes('layered-read-during-quiet'));assert.throws(()=>ledger.beginReady());
});

test('frozen tool comparison permits only exact LF or full CRLF checkout and rejects BOM/mixed/content drift',()=>{
 const bound=require('../tools/shared-playback-cache/windows-smoke.cjs').boundToolBytes,blob=Buffer.from("const marker='fixed';\nconst gate=2;\n"),crlf=Buffer.from(blob.toString().replace(/\n/g,'\r\n'));
 assert.doesNotThrow(()=>bound(blob,blob));assert.doesNotThrow(()=>bound(blob,crlf));
 for(const value of [Buffer.concat([Buffer.from([239,187,191]),blob]),Buffer.from("const marker='fixed';\r\nconst gate=2;\n"),Buffer.from(blob.toString().replace('gate=2','gate=3'))])assert.throws(()=>bound(blob,value));
});
