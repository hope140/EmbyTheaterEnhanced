'use strict';
// Causal local experiment: real store/HTTP, explicit delayed FileHandle callbacks.
// It is not a disk benchmark or Native/ordinary-app latency measurement.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const {execFileSync}=require('node:child_process'),{createRequire}=require('node:module');
const {performance}=require('node:perf_hooks');
const {createStore}=require('./store.cjs'),{source,get,identity,hash,delay}=require('./fixture.cjs');
const {temporaryRoot}=require('../../tests/helpers/range-fixture-root.cjs');
const BASE='7a569c8e36f3d26f65d71aead369f0e6e9f70aad', SHARED='e43c3d83b2bfb04e84853759dd3ace4f52aa1012', BLOCK=262144;
const need=(v,c)=>{if(!v)throw Error(c);};
const SCENARIOS=Object.freeze({fast:{blocks:1,lag:0},'valid-20ms':{blocks:1,lag:20},'valid-50ms':{blocks:1,lag:50},
  'two-valid-20ms':{blocks:3,lag:20,slowReads:2},'two-valid-20ms-fast-origin':{blocks:3,lag:20,slowReads:2,firstDelay:0},
  'valid-50ms-fast-origin':{blocks:1,lag:50,firstDelay:0},uncached:{blocks:1,lag:0,uncached:true}});
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function load(bytes,file){const m={exports:{}};new Function('exports','require','module','__filename','__dirname',bytes.toString('utf8'))(m.exports,createRequire(file),m,file,path.dirname(file));return m.exports.createProxy;}
function p(values,fraction){if(!values.length)return null;return [...values].sort((a,b)=>a-b)[Math.ceil(fraction*values.length)-1];}
function perBlockPolicy(bytes, allowance = 10) {
  need([10,15].includes(allowance),'probe-variant-allowance');
  const text=bytes.toString('utf8');
  need(text.includes('let readGraceRemaining = 10;')&&text.includes('readGraceRemaining -= spent;'),'probe-variant-source');
  return Buffer.from(text.replace('// Additional waiting is shared by this response, not granted per block.\n        // Fast/missing reads spend none; another seek owns a separate cancellable response.',
    '// Each physical block has a finite read window. Fast/missing reads do not wait.\n        // Another seek owns a separate cancellable response; late IO retains its owner.')
    .replace('let readGraceRemaining = 10;','const readGracePerBlock = '+allowance+';').replaceAll('readGraceRemaining','readGracePerBlock').replace('readGracePerBlock -= spent; ',''));
}
async function sample(factory,scenario){
  const spec=SCENARIOS[scenario],bytes=spec.blocks*BLOCK,root=temporaryRoot('ete-read-grace-ab-',['']);
  let origin,store,proxy,slow=false,ordinal=0,measuring=false,received=0,ioBytes=0;const reads=[],wholeReads=[],receivedIntervals=[];
  try{
    origin=await source({bytes,firstDelay:spec.firstDelay??20,tailDelay:0,etag:true});
    const io={...fs,async open(file,flags,...args){const h=await fs.open(file,flags,...args);if(flags!=='r'||!String(file).endsWith('.bin'))return h;
      return {stat:(...a)=>h.stat(...a),close:(...a)=>h.close(...a),async read(...a){
        const began=performance.now(),n=++ordinal;if(slow&&spec.lag&&n<=(spec.slowReads||1))await delay(spec.lag);
        const r=await h.read(...a);if(measuring){ioBytes+=r.bytesRead;reads.push({ordinal:n,elapsedMs:performance.now()-began,bytes:r.bytesRead});}return r;
      }};}};
    store=await createStore({root,currentBytes:bytes,nextBytes:BLOCK,maxPendingBytes:bytes,io});
    const observed={...store,read(...args){const began=performance.now(),timed=measuring,pending=store.read.apply(store,args);
      pending.then(data=>{if(timed)wholeReads.push({offset:args[1],length:args[2],elapsedMs:performance.now()-began,resultBytes:data?.length||0});},()=>{});return pending;}};
    proxy=await factory({store:observed,authorize:async()=>origin.grant(),onOriginChunk:chunk=>{if(measuring&&!chunk.probe){received+=chunk.length;receivedIntervals.push({start:chunk.start,length:chunk.length});}}});
    const handle=await proxy.open(identity()),key=await handle.ready();
    if(!spec.uncached)for(let offset=0;offset<bytes;offset+=BLOCK)need(await store.put(key,offset,origin.data.subarray(offset,offset+BLOCK)),'probe-setup-write');
    await handle.actual();
    // Establish genuine access through the unchanged one-byte probe before the timed seek.
    const access=await get(handle.url,spec.uncached?bytes-1:0,1);need(access.status===206,'probe-setup-access');await proxy.drain();
    const before=proxy.status(),requests=origin.requests.length;ordinal=0;slow=true;measuring=true;
    const result=await get(handle.url,0,bytes);const bodyDone=performance.now();await proxy.drain();measuring=false;
    need(result.status===206&&result.hash===hash(origin.data)&&result.body.length===bytes,'probe-body');
    const after=proxy.status();
    return {status:'PASS',ttfbMs:result.ttfbMs,bodyMs:result.durationMs,drainAfterBodyMs:performance.now()-bodyDone,
      receivedBodyBytes:received,overlapBodyBytes:spec.uncached?0:received,originRequests:origin.requests.length-requests,
      localIoBytes:ioBytes,readCallbacks:reads,wholeReads,receivedIntervals,hitBytes:after.hitBytes-before.hitBytes,
      timeouts:after.localReadTimeouts===undefined?null:after.localReadTimeouts-before.localReadTimeouts,
      refusals:after.localReadRefusals===undefined?null:after.localReadRefusals-before.localReadRefusals,
      graceMs:after.localReadGraceMs===undefined?null:after.localReadGraceMs-before.localReadGraceMs,
      peakMediaReservedBytes:after.peakMediaReservedBytes,committed:store.status().committed,readers:store.status().readers};
  }catch(error){return {status:'FAIL',code:/^[a-z0-9-]{1,100}$/.test(error.message)?error.message:'probe-sample-failed',receivedBodyBytes:received,readCallbacks:reads};}
  finally{const outcomes=await Promise.allSettled([proxy?.close(),store?.close(),origin?.close()]);await fs.rm(root,{recursive:true,force:true});need(outcomes.every(r=>r.status==='fulfilled'),'probe-cleanup');}
}
async function run(out){
  need(typeof out==='string'&&path.isAbsolute(out),'probe-output');await fs.mkdir(out,{recursive:false});
  const file=require.resolve('../../src/electronapp/enhanced/shared-playback-cache/proxy'),repo=path.resolve(__dirname,'../..');
  const old=execFileSync('git',['show',BASE+':src/electronapp/enhanced/shared-playback-cache/proxy.js'],{cwd:repo,maxBuffer:1048576});
  const shared=execFileSync('git',['show',SHARED+':src/electronapp/enhanced/shared-playback-cache/proxy.js'],{cwd:repo,maxBuffer:1048576}),perBlock=perBlockPolicy(shared),bounded30=perBlockPolicy(shared,15);
  const factories={A:load(old,file),B:load(shared,file),C:load(perBlock,file),D:load(bounded30,file)},scenarios={};
  const report={schema:1,baseCommit:BASE,sharedAllowanceCommit:SHARED,policies:{A:'15ms per block',B:'15ms +10ms shared response allowance',C:'25ms per block',D:'30ms per block'},sourceSha256:{A:sha(old),B:sha(shared),C:sha(perBlock),D:sha(bounded30)},node:process.version,platform:process.platform,os:os.release(),
    conditions:'real owned filesystem/HTTP; explicit FileHandle.read delay;20ms or0ms configured origin first-byte delay;no Native/Emby/115;not hardware latency',
    pairedSamples:20,warmupPairs:3,order:'ABCD/DCBA alternating from warmup-3',scenarios};
  for(const name of Object.keys(SCENARIOS)){
    const rows=[];
    for(let pair=-3;pair<20;pair++)for(const arm of (pair+3)%2?['D','C','B','A']:['A','B','C','D'])rows.push({pair,arm,...await sample(factories[arm],name)});
    const measured=rows.filter(r=>r.pair>=0),arms={};
    for(const arm of ['A','B','C','D']){const all=measured.filter(r=>r.arm===arm),valid=all.filter(r=>r.status==='PASS');arms[arm]={valid:valid.length,failed:all.length-valid.length,
      ttfbMs:{p50:p(valid.map(r=>r.ttfbMs),.5),p95:p(valid.map(r=>r.ttfbMs),.95)},bodyMs:{p50:p(valid.map(r=>r.bodyMs),.5),p95:p(valid.map(r=>r.bodyMs),.95)},
      receivedBodyBytes:valid.reduce((n,r)=>n+r.receivedBodyBytes,0),overlapBodyBytes:valid.reduce((n,r)=>n+r.overlapBodyBytes,0),
      hitSamples:valid.filter(r=>r.hitBytes>0).length,timeoutSamples:valid.every(r=>r.timeouts!==null)?valid.filter(r=>r.timeouts>0).length:null,
      extraWaitMsMax:valid.length?Math.max(...valid.map(r=>r.graceMs||0)):null,
      localReadMaxMs:valid.length?Math.max(...valid.flatMap(r=>r.readCallbacks.map(q=>q.elapsedMs))):null,
      wholeReadMaxMs:valid.length?Math.max(...valid.flatMap(r=>r.wholeReads.map(q=>q.elapsedMs))):null};}
    const comparisons={};for(const [left,right] of [['B','A'],['C','A'],['C','B'],['D','A'],['D','B'],['D','C']]){
      const deltas=[];for(let pair=0;pair<20;pair++){const a=measured.find(r=>r.pair===pair&&r.arm===right),b=measured.find(r=>r.pair===pair&&r.arm===left);if(a.status==='PASS'&&b.status==='PASS')deltas.push(b.ttfbMs-a.ttfbMs);}
      comparisons[left+'minus'+right]={validPairs:deltas.length,p50:p(deltas,.5),p95:p(deltas,.95)};
    }
    scenarios[name]={arms,pairedAddedTtfbMs:comparisons,samples:rows};
    console.log('SHARED_CACHE_READ_GRACE '+JSON.stringify({scenario:name,arms,pairedAddedTtfbMs:comparisons}));
    await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  }
  return report;
}
module.exports={BASE,SHARED,SCENARIOS,perBlockPolicy,run};
if(require.main===module){const args=process.argv.slice(2);need(args.length===1&&args[0].startsWith('--out='),'probe-argument');run(args[0].slice(6)).catch(()=>{console.error('SHARED_CACHE_READ_GRACE_ERROR probe-failed');process.exitCode=1;});}
