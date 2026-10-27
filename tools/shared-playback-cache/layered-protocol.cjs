'use strict';
const crypto=require('node:crypto');
const base=require('./app-performance-contract.cjs');
const PHASES=Object.freeze(['cold-C','ready-A']);
const ITEM=Object.freeze({'cold-C':'C','ready-A':'A'});
const TARGETS=Object.freeze({'cold-C':Object.freeze({'cached-seek':.25,'boundary-seek':1.5,'uncached-seek':4,'far-seek':7}),'ready-A':base.TARGETS});
const LIMITS=Object.freeze({...base.LIMITS,workerMs:180000,suiteMs:7200000,quietMs:5000,stopMs:5000});
const OWNER='ETE ordinary C-stop-A layered trial v1\n';
const need=(v,c)=>{if(!v)throw Error(c);};
const empty=()=>({sourceBytes:0,bodyBytes:0,oneByteBytes:0,probeCandidateBytes:0,overlapBytes:0,opened:0,active:0,stoppedReports:0,ranges:[],advances:0});
const sameOwner=(a,b)=>!!a&&!!b&&a.helper===b.helper&&a.endpointId===b.endpointId&&a.generationId===b.generationId;
function cases(mode){need(['entry','matrix'].includes(mode),'layered-mode');const rows=[];for(let pair=-3;pair<=(mode==='entry'?-3:19);pair++)for(const arm of(pair+3)%2?['B','A']:['A','B'])rows.push({index:rows.length,pair,arm});return rows;}
function blank(task,phase,code='layered-not-run'){return base.SCENARIOS.map(scenario=>({phase,item:ITEM[phase],scenario,pair:task.pair,arm:task.arm,status:'FAIL',latencyMs:null,sourceBodyBytes:null,sourceStreamReadBytes:null,oneByteReadBytes:null,localHitBytes:null,overlapBodyBytes:null,peakRssBytes:null,peakDiskBytes:null,code}));}
function slots(tasks){return tasks.flatMap(t=>PHASES.flatMap(p=>blank(t,p)));}
function rendererAction(operation,seconds,phase){if(operation!=='play')return base.rendererAction(operation,seconds);need(PHASES.includes(phase),'layered-phase');return base.rendererAction('play').replace("ids:['A']","ids:['"+ITEM[phase]+"']");}
function isMedia(identity,origin,item){const server=crypto.createHash('sha256').update(JSON.stringify([origin,'prefix-server'])).digest('hex');return ['C','A'].includes(item)&&identity?.server===server&&identity.account==='fixture-user'&&identity.item===item&&identity.mediaSource===item+'-avi';}
function loadSource(source,origin,proxyItems,item){let url;try{url=new URL(source);}catch(_){throw Error('app-native-source-identity');}need(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&!url.username&&!url.password&&!url.hash,'app-native-source-identity');const mapped=proxyItems.get(url.href),proxied=mapped===item;need(proxied||url.href===origin+'/Videos/'+item+'/stream.avi?fixture=synthetic','app-native-source-identity');return{proxied,item};}
function seekSignals(events,start,owner,target){const rows=events.slice(start).filter(e=>sameOwner(e,owner)),submitted=rows.find(e=>e.name==='seek-submit'&&Math.abs(e.value-target)<1e-6);if(!submitted)return null;const position=rows.find(e=>e.at>=submitted.at&&e.name==='time-pos'&&Number.isFinite(e.value)&&Math.abs(e.value-target)<.2),restart=rows.find(e=>e.at>=submitted.at&&e.name==='playback-restart');return position&&restart?{submitAt:submitted.at,positionAt:position.at,restartAt:restart.at,after:Math.max(position.at,restart.at)}:null;}
function intersection(start,length,ranges){return ranges.reduce((n,r)=>n+Math.max(0,Math.min(start+length,r.end)-Math.max(start,r.start)),0);}
function createLedger(tasks,{now=()=>performance.now()}={}){
 const states=tasks.map(()=>({phase:'cold-C',phases:Object.fromEntries(PHASES.map(p=>[p,empty()])),quiet:{started:null,ended:null,sourceBytes:0,opened:0},unknown:0,errors:[],initialAReads:0})),requests=new Map();let active=-1;
 const state=()=>{need(active>=0&&active<states.length,'layered-case-owner');return states[active];};
 return {states,requests,activate(index){need(Number.isInteger(index)&&index>=0&&index<states.length,'layered-case-owner');active=index;},deactivate(){active=-1;},
  record(type,data,caseIndex=active){
   if(type.startsWith('media-')){
    if(type==='media-open'){
     need(Number.isInteger(caseIndex)&&states[caseIndex],'layered-case-owner');const s=states[caseIndex],key=caseIndex+':'+data.requestId;need(!requests.has(key),'layered-request-reused');const phase=data.item==='C'?'cold-C':data.item==='A'?'ready-A':s.phase;const r={case:caseIndex,phase,item:data.item,start:data.start,end:data.end,closed:false,openedAt:now(),closedAt:null,sourceBytes:0,bodyBytes:0,oneByteBytes:0,readAfterCloseBytes:0,crossPhaseBytes:0};requests.set(key,r);
     if(s.phase==='quiet'){s.quiet.opened++;s.errors.push('layered-request-during-quiet');}
     const p=s.phases[r.phase];if(p){p.opened++;p.active++;}else s.errors.push('layered-wrong-media');
     if(data.item!==ITEM[s.phase])s.errors.push('layered-wrong-media');return r;
    }
    const r=requests.get(caseIndex+':'+data.requestId);need(r,'layered-unknown-request');const s=states[r.case],p=s.phases[r.phase];
    if(type==='media-bytes'){
     need(Number.isSafeInteger(data.length)&&data.length>0,'layered-byte-count');
     if(s.phase==='quiet')s.quiet.sourceBytes+=data.length;
     r.sourceBytes+=data.length;if(r.start===r.end)r.oneByteBytes+=data.length;if(r.start!==0||r.end!==0)r.bodyBytes+=data.length;
     if(r.phase==='quiet'){s.errors.push('layered-read-during-quiet');return r;}
     if(r.closed){r.readAfterCloseBytes+=data.length;s.errors.push('layered-read-after-close');}if(s.phase!==r.phase){r.crossPhaseBytes+=data.length;s.errors.push('layered-cross-phase-read');}
     p.sourceBytes+=data.length;if(r.start===r.end)p.oneByteBytes+=data.length;
     if(r.start===0&&r.end===0)p.probeCandidateBytes+=data.length;else{p.bodyBytes+=data.length;p.overlapBytes+=intersection(data.start,data.length,p.ranges);}
     if(r.item==='A'&&s.phase!=='ready-A')s.initialAReads+=data.length;
    }
    if(type==='media-close'){need(!r.closed,'layered-duplicate-close');r.closed=true;r.closedAt=now();if(p)p.active--;}
    return r; // Tombstones remain: a late byte/event can never acquire the next phase.
   }
   if(caseIndex<0||!states[caseIndex])return null;const s=states[caseIndex];
   if(type==='emby-fixture'&&data.category==='unknown')s.unknown++;
   if(type==='emby-fixture'&&data.category==='playing-report'&&data.phase==='stopped'){
    const phase=data.item==='C'?'cold-C':data.item==='A'?'ready-A':null;if(phase)s.phases[phase].stoppedReports++;
   }
   return{case:caseIndex,phase:s.phase};
  },
  beginQuiet(){const s=state();need(s.phase==='cold-C'&&s.phases['cold-C'].active===0,'layered-stop-not-drained');s.phase='quiet';s.quiet.started=now();},
  beginReady(){const s=state();need(s.phase==='quiet'&&now()-s.quiet.started>=LIMITS.quietMs,'layered-quiet-too-short');need(s.quiet.opened===0&&s.quiet.sourceBytes===0&&s.initialAReads===0&&s.errors.length===0,'layered-quiet-or-prefill');s.quiet.ended=now();s.phase='ready-A';},
  snapshot(){const s=state();return structuredClone({...s,quiet:{...s.quiet,elapsedMs:s.quiet.started===null?null:now()-s.quiet.started},aRequests:[...requests.values()].filter(r=>r.case===active&&r.item==='A').length});},
  window(phase,ranges){const s=state();need(s.phase===phase&&PHASES.includes(phase),'layered-control-phase');s.phases[phase].ranges=ranges;},
  advance(phase,scenario){const s=state();need(s.phase===phase&&PHASES.includes(phase),'layered-control-phase');need(['boundary-seek','uncached-seek','far-seek'][s.phases[phase].advances]===scenario,'layered-control-order');need([...requests.values()].filter(r=>r.case===active&&!r.closed).every(r=>r.phase===phase&&r.item===ITEM[phase]),'layered-foreign-held');s.phases[phase].advances++;}
 };
}
function validClock(proof,start,fields){
 const c=proof?.clock;return !!c&&Number.isFinite(c.origin)&&fields.every(k=>Number.isFinite(c[k])&&proof[k]===c[k]-c.origin)&&c.deadline<=c[start]+5000;
}
function observerClean(receipt){return !!receipt&&receipt.restoreFailure!==true&&receipt.finalizeFailure!==true&&!!receipt.storeInitialization&&['pendingCreates','observerErrors','dropped'].every(k=>receipt.storeInitialization[k]===0);}
function sampleEvidence(phase,receipt,sample){
 const proof=sample?.frameProof,expected=receipt?.owner;
 if(!proof||!sameOwner(proof.owner,expected)||!proof.profile?.supported||proof.profile.model!==require('./fixture-color-profile.cjs').MODEL||proof.evidence?.colorModel!==proof.profile.model||proof.evidence?.threshold!==2||
   !/^[a-f0-9]{64}$/.test(proof.hash||'')||!Number.isFinite(proof.requestedAt)||!Number.isFinite(proof.resolvedAt)||!Number.isFinite(proof.after)||!Number.isFinite(proof.deadline)||proof.requestedAt<proof.after||proof.resolvedAt<proof.requestedAt||proof.resolvedAt>proof.deadline||!validClock(proof,'after',['after','requestedAt','resolvedAt','deadline']))return false;
 const target=sample.scenario==='cold-first-frame'?null:TARGETS[phase]?.[sample.scenario]*(phase==='cold-C'?24:12);
 if(!require('./fixture-frame-evidence.cjs').accepts(proof.evidence,{item:ITEM[phase],targetFrame:target}))return false;
 if(target!==null){const seek=sample.seekProof;if(!seek||!sameOwner(seek.owner,expected)||seek.target!==TARGETS[phase][sample.scenario]||
   ![seek.submittedAt,seek.positionAt,seek.restartAt,seek.deadline].every(Number.isFinite)||seek.positionAt<seek.submittedAt||seek.restartAt<seek.submittedAt||proof.after<Math.max(seek.positionAt,seek.restartAt)||proof.deadline>seek.deadline||!validClock(seek,'submittedAt',['submittedAt','positionAt','restartAt','deadline'])||seek.clock.origin!==proof.clock.origin||seek.previousHash===proof.hash||!/^[a-f0-9]{64}$/.test(seek.previousHash||''))return false;}
 return true;
}
function freshEvidence(phase,receipt){const owner=receipt?.owner,b=receipt?.budget,s=receipt?.source;return !!(b&&s&&sameOwner(b,owner)&&sameOwner(s,owner)&&b.phase===phase&&s.phase===phase&&b.outcome==='fulfilled'&&b.requestGeneration===owner.generationId&&b.response?.helper===owner.helper&&b.response.generationId===owner.generationId&&b.response.requestId===b.requestId&&Number.isSafeInteger(b.requestId)&&b.requestId>0&&[b.at,b.response.at,b.resolvedAt,receipt.loadAt,s.at,s.resolvedAt].every(Number.isFinite)&&b.at<=b.response.at&&b.response.at<=b.resolvedAt&&b.resolvedAt<=receipt.loadAt&&s.resolvedAt<=receipt.loadAt&&Number.isSafeInteger(b.bytes)&&b.bytes>=262144&&b.bytes<=3072*1048576&&s.item===ITEM[phase]&&s.accepted===true&&/^[a-f0-9]{64}$/.test(s.proofHash||''));}
function validatePhase(phase,arm,receipt){
 if(!receipt||receipt.phase!==phase||receipt.item!==ITEM[phase]||!Array.isArray(receipt.samples)||receipt.samples.length!==5)return false;
 if(!receipt.owner||typeof receipt.owner.helper!=='string'||typeof receipt.owner.endpointId!=='string'||!Number.isSafeInteger(receipt.owner.generationId)||receipt.owner.generationId<=0)return false;
 if(arm==='B'&&(phase==='ready-A'||receipt.selection==='proxy')&&!freshEvidence(phase,receipt))return false;
 if(arm==='B'&&phase==='ready-A'&&receipt.selection!=='proxy')return false;
 if(arm==='A'&&receipt.selection!=='original')return false;
 if(!['original','proxy'].includes(receipt.selection))return false;
 return receipt.stopConfirmed===true&&receipt.samples.every((s,i)=>s.phase===phase&&s.scenario===base.SCENARIOS[i]&&s.status==='PASS'&&sampleEvidence(phase,receipt,s)&&Number.isFinite(s.latencyMs)&&s.latencyMs>=0&&Number.isSafeInteger(s.sourceStreamReadBytes)&&s.sourceStreamReadBytes>=0&&Number.isSafeInteger(s.localHitBytes)&&s.localHitBytes>=0&&
  (receipt.selection!=='original'||s.localHitBytes===0)&&(arm!=='B'||s.overlapBodyBytes===0)&&(phase!=='ready-A'||arm!=='B'||s.scenario!=='boundary-seek'||s.localHitBytes>0));
}
function receiptRows(receipt,process,task,productCommit,toolCommit){
 if(receipt?.schema!==2||receipt.kind!=='ordinary-C-stop-A'||receipt.pid!==process.spawnPid||receipt.index!==task.index||receipt.pair!==task.pair||receipt.arm!==task.arm||receipt.productCommit!==productCommit||receipt.toolCommit!==toolCommit)return null;
 return PHASES.flatMap(phase=>base.SCENARIOS.map((scenario,i)=>{
  const rows=receipt.phases?.[phase]?.samples,matching=Array.isArray(rows)?rows.filter(s=>s?.scenario===scenario):[],raw=matching.length===1?matching[0]:null;
  if(!raw||raw.phase!==phase||raw.item!==ITEM[phase]||raw.pair!==task.pair||raw.arm!==task.arm)return blank(task,phase,'layered-invalid-slot')[i];
  const row={...raw,reportedStatus:raw.status};let good=['PASS','FAIL'].includes(raw.status)&&
    (raw.latencyMs===null&&raw.status==='FAIL'||Number.isFinite(raw.latencyMs)&&raw.latencyMs>=0);
  for(const key of ['sourceBodyBytes','sourceStreamReadBytes','oneByteReadBytes','localHitBytes','overlapBodyBytes','peakRssBytes','peakDiskBytes']){
    if(raw[key]===null){if(raw.status==='PASS')good=false;}else if(!Number.isSafeInteger(raw[key])||raw[key]<0){row[key]=null;good=false;}
  }
  if(row.status==='PASS'&&!sampleEvidence(phase,receipt.phases?.[phase],row)){good=false;row.code='layered-sample-evidence';}
  if(!good){row.status='FAIL';row.code='layered-invalid-sample';if(!Number.isFinite(row.latencyMs)||row.latencyMs<0)row.latencyMs=null;}
  return row;
 }));
}
function quantile(a,p){if(!a.length)return null;return[...a].sort((x,y)=>x-y)[Math.ceil(a.length*p)-1];}
function summarize(tasks,rows,results,mode){
 const perPhase={},eligible=(r,phase)=>r.status==='PASS'&&results[tasks.find(t=>t.pair===r.pair&&t.arm===r.arm)?.index]?.phaseTrust?.[phase]===true;
 for(const phase of PHASES){
  const ordered=base.SCENARIOS.flatMap(s=>tasks.map(t=>rows.find(r=>r.phase===phase&&r.scenario===s&&r.pair===t.pair&&r.arm===t.arm)||blank(t,phase)[base.SCENARIOS.indexOf(s)])),failures=ordered.filter(r=>r.status==='FAIL'),measured=ordered.filter(r=>r.pair>=0),b=tasks.filter(t=>t.arm==='B'),bm=b.filter(t=>t.pair>=0);
  const selection=t=>results[t.index]?.phases?.[phase]?.selection,selected=b.filter(t=>selection(t)==='proxy'),fallback=b.filter(t=>selection(t)==='original');
  const scenarios=Object.fromEntries(base.SCENARIOS.map(s=>{
   const groups={};for(const [name,match]of Object.entries({'A-original':t=>t.arm==='A','B-proxy':t=>t.arm==='B'&&selection(t)==='proxy','B-original-fallback':t=>t.arm==='B'&&selection(t)==='original'})){
    const group=measured.filter(r=>r.scenario===s&&match(tasks.find(t=>t.pair===r.pair&&t.arm===r.arm))),good=group.filter(r=>eligible(r,phase));
    groups[name]={observed:group.length,valid:good.length,p50:mode==='matrix'?quantile(good.map(r=>r.latencyMs),.5):null,p95:mode==='matrix'?quantile(good.map(r=>r.latencyMs),.95):null};
   }
   const paired={};for(const choice of ['proxy','original']){
    const differences=[];for(const pair of [...new Set(bm.map(t=>t.pair))]){const a=measured.find(r=>r.scenario===s&&r.pair===pair&&r.arm==='A'),v=measured.find(r=>r.scenario===s&&r.pair===pair&&r.arm==='B'),bt=bm.find(t=>t.pair===pair);if(a&&v&&selection(bt)===choice&&eligible(a,phase)&&eligible(v,phase))differences.push(v.latencyMs-a.latencyMs);}
    paired[choice]={denominator:bm.length,validPairs:differences.length,p50:mode==='matrix'?quantile(differences,.5):null,p95:mode==='matrix'?quantile(differences,.95):null};
   }
   return[s,{groups,pairedBMinusA:paired}];
  }));
  perPhase[phase]={item:ITEM[phase],plannedCases:tasks.length,observedCases:results.filter(Boolean).length,plannedSamples:tasks.length*5,measuredSamples:measured.length,failedSamples:failures.length,failures,
    bDenominator:b.length,selected:selected.length,fallbacks:fallback.length,unclassified:b.length-selected.length-fallback.length,admissionRate:selected.length/b.length,fallbackRate:fallback.length/b.length,
    measuredBDenominator:bm.length,measuredSelected:bm.filter(t=>selection(t)==='proxy').length,measuredFallbacks:bm.filter(t=>selection(t)==='original').length,scenarios};
 }
 return{schema:2,slotCount:rows.length,plannedSlotCount:tasks.length*10,observedCases:results.filter(Boolean).length,status:rows.every(r=>r.status==='PASS')&&results.length===tasks.length&&results.every(r=>r?.accepted)?'PASS':'FAIL',performanceAssessment:mode==='entry'?'NOT_ASSESSED_ENTRY_IO':'DESCRIPTIVE_TRUSTED_SUBSETS_ALL_FAILURES_RETAINED',phases:perPhase};
}
async function runStages({arm,play,beginQuiet,snapshot,backend,beginReady,wait,now=()=>performance.now(),sameService=()=>true,hasTargetKey=()=>false,onQuiet=()=>{}}) {
 need(await play('cold-C'),'layered-cold-function-failed');
 const before=await beginQuiet(),started=now();
 while(now()-started<LIMITS.quietMs)await wait(Math.max(1,LIMITS.quietMs-(now()-started)));
 const after=await snapshot(),quiet={durationMs:now()-started,source:after.quiet,aRequests:after.aRequests,aReadBytes:after.initialAReads,backend:backend(),before};
 onQuiet(quiet);
 need(quiet.durationMs>=LIMITS.quietMs&&sameService()&&after.quiet.opened===0&&after.quiet.sourceBytes===0&&after.aRequests===0&&after.initialAReads===0&&!hasTargetKey(),'layered-quiet-or-prefill');
 if(arm==='B')need(quiet.backend?.state==='ready','layered-backend-not-ready');
 await beginReady();return await play('ready-A');
}
const CODES=new Set(['layered-local-not-drained','layered-local-read-during-quiet','layered-load-count','layered-fresh-budget-source','layered-owner-reused','layered-quiet-or-prefill','layered-backend-not-ready','layered-control-phase','layered-stop-unconfirmed','layered-cold-function-failed','layered-boundary-no-local-hit','layered-original-revived','layered-not-run']);
function failureCode(error,fallback){return CODES.has(error?.message)?error.message:base.failureCode(error,fallback);}
function recordTerminalFailure(report,error){base.recordTerminalFailure(report,error);report.terminalFailure.code=failureCode(error,'app-worker-failed');report.code=report.firstFailure?.code||report.terminalFailure.code;}
module.exports={...base,failureCode,recordTerminalFailure,PHASES,ITEM,TARGETS,LIMITS,OWNER,cases,blank,slots,runStages,rendererAction,isMedia,loadSource,sameOwner,seekSignals,createLedger,observerClean,sampleEvidence,freshEvidence,validatePhase,receiptRows,summarize};
