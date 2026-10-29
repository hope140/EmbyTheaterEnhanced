'use strict';
// Causal local experiment: real store/HTTP, explicit delayed FileHandle callbacks.
// It is not a disk benchmark or Native/ordinary-app latency measurement.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const {createRequire}=require('node:module');
const {execFileSync}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const {createStore}=require('./store.cjs'),{source,get,identity,hash,delay}=require('./fixture.cjs');
const {temporaryRoot}=require('../../tests/helpers/range-fixture-root.cjs');
const BASE='7a569c8e36f3d26f65d71aead369f0e6e9f70aad', SHARED='e43c3d83b2bfb04e84853759dd3ace4f52aa1012', BLOCK=262144;
const HISTORICAL_SOURCE_COMMIT='f9bd1c4c271f619f54decfd36b2a4d6afefc5e4f', HISTORICAL_SOURCE_BLOB='eef7df7f0d4e7ee7ea1ccec24f94557df4954b0c';
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
const SHARED_TIMER = "              const readStarted = performance.now();\n              const deadline = readStarted + 15 + readGraceRemaining;\n              const read = track(controls, store.read(key, offset, length).finally(() => {stats.readReservedBytes -= 1048576;}));\n              let timer;\n              try {\n                const result = await waitDone(Promise.race([read.then(value => ({data: value, timedOut: false})), new Promise(resolve => {\n                  const expire = () => {\n                    const remaining = deadline - performance.now();\n                    if (remaining > 0) {timer = setTimeout(expire, Math.ceil(remaining)); return;}\n                    resolve({data: null, timedOut: true});\n                  };\n                  timer = setTimeout(expire, Math.max(1, Math.ceil(deadline - performance.now())));\n                })]), signal);\n                data = result.data;\n                if (result.timedOut) stats.localReadTimeouts++;\n                else if (!data) stats.localReadRefusals++;\n              } finally {\n                clearTimeout(timer);\n                const spent = Math.min(readGraceRemaining, Math.max(0, performance.now() - readStarted - 15));\n                readGraceRemaining -= spent; stats.localReadGraceMs += spent;\n              }";
const BASE_TIMER = "              const deadline = performance.now() + 15;\n              const read = track(controls, store.read(key, offset, length).finally(() => {stats.readReservedBytes -= 1048576;}));\n              let timer;\n              try {data = await waitDone(Promise.race([read, new Promise(resolve => {\n                const expire = () => {\n                  const remaining = deadline - performance.now();\n                  if (remaining > 0) {timer = setTimeout(expire, Math.ceil(remaining)); return;}\n                  resolve(null);\n                };\n                timer = setTimeout(expire, 15);\n              })]), signal);}\n              finally {clearTimeout(timer);}";
function sourceBinding(current) {
  need(Buffer.isBuffer(current),'probe-current-source');
  const expected='e12d4939498354bddfe19b608084328f51e666ecfd8f01a31a4a3e9caff8ee6e';
  if(sha(current)===expected)return {bytes:current,relation:'git-blob',checkoutSha256:sha(current)};
  const text=current.toString('utf8'),canonical=Buffer.from(text.replace(/\r\n/g,'\n'));
  need(Buffer.from(text,'utf8').equals(current)&&sha(canonical)===expected&&
    Buffer.from(canonical.toString('utf8').replace(/\n/g,'\r\n')).equals(current),'probe-current-source');
  return {bytes:canonical,relation:'exact-crlf-checkout',checkoutSha256:sha(current)};
}
function sourceVariants(current) {
  current=sourceBinding(current).bytes; const text=current.toString('utf8');
  const shared=Buffer.from(text.replace('// Each physical block has a finite read window. Fast/missing reads do not wait.\n        // Another seek owns a separate cancellable response; late IO retains its owner.',
    '// Additional waiting is shared by this response, not granted per block.\n        // Fast/missing reads spend none; another seek owns a separate cancellable response.')
    .replace('const readGracePerBlock = 15;','let readGraceRemaining = 10;').replaceAll('readGracePerBlock','readGraceRemaining')
    .replace('stats.localReadGraceMs += spent;','readGraceRemaining -= spent; stats.localReadGraceMs += spent;'));
  need(sha(shared)==='3d5900a0fed1688d7c97e4e62525048de3b45d4a42ba274c6a48e74491ce31f2','probe-shared-source');
  const old=Buffer.from(shared.toString('utf8').replace('localReadTimeouts: 0, localReadRefusals: 0, localReadGraceMs: 0, ','')
    .replace('        // Additional waiting is shared by this response, not granted per block.\n        // Fast/missing reads spend none; another seek owns a separate cancellable response.\n        let readGraceRemaining = 10;\n','')
    .replace(SHARED_TIMER,BASE_TIMER));
  need(sha(old)==='ac9b3b267d3e2643fe0d4fe876d0de90dcda2395497337a1840d3971eff98349','probe-base-source');
  return {A:old,B:shared,C:perBlockPolicy(shared),D:current};
}
function livePolicyBinding(current) {
  need(Buffer.isBuffer(current),'probe-current-source');
  const text=current.toString('utf8'),canonical=Buffer.from(text.replace(/\r\n/g,'\n'));
  const lf=canonical.equals(current),crlf=Buffer.from(canonical.toString('utf8').replace(/\n/g,'\r\n')).equals(current);
  need(Buffer.from(text,'utf8').equals(current)&&(lf||crlf),'probe-current-source');
  // This product changes prepared-route control flow. It is identified, never executed as a historical arm.
  if(sha(canonical)==='ee46a864ad2b90e0d5fe192dc2e830c7cd22cdf99ff977b268425f3ac8a8e020')return {relation:'prepared-handoff-v1-not-benchmarked',checkoutSha256:sha(current),canonicalSha256:sha(canonical),byteIdentical:false};
  if(sha(canonical)==='e12d4939498354bddfe19b608084328f51e666ecfd8f01a31a4a3e9caff8ee6e')return {relation:'historical-source-identical',checkoutSha256:sha(current),byteIdentical:true};
  let policy=canonical.toString('utf8');
  const retention=policy.includes('cacheForeground = true');
  if(retention)for(const [added,original] of [
    ['cacheEnabled = true, cacheForeground = true, requestPolicy','cacheEnabled = true, requestPolicy'],
    ["  if (typeof cacheForeground !== 'boolean' || resolveAccess !== undefined",'  if (resolveAccess !== undefined'],
    ["    save = save && (kind !== 'foreground' || cacheForeground);\n",'']
  ]) {need(policy.split(added).length===2,'probe-current-source');policy=policy.replace(added,original);}
  for(const [instrumented,historical] of [
    ['stats.hitBytes += data.length; record.localHitBytes += data.length;','stats.hitBytes += data.length;'],
    ['preloadReady: false, localHitBytes: 0};','preloadReady: false};'],
    ['      status: () => ({localHitBytes: record.localHitBytes}),\n','']
  ]) {need(policy.split(instrumented).length===2,'probe-current-source');policy=policy.replace(instrumented,historical);}
  need(sha(Buffer.from(policy))==='e12d4939498354bddfe19b608084328f51e666ecfd8f01a31a4a3e9caff8ee6e','probe-current-source');
  return {relation:retention?'exact-route-counter-v1-retention-write-policy-v1':'exact-route-counter-v1-only',checkoutSha256:sha(current),canonicalSha256:sha(canonical),byteIdentical:false};
}
function historicalSource(root) {
  try {
    const blob=execFileSync('git',['rev-parse',HISTORICAL_SOURCE_COMMIT+':src/electronapp/enhanced/shared-playback-cache/proxy.js'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
    need(blob===HISTORICAL_SOURCE_BLOB,'probe-historical-source-mismatch');
    const bytes=execFileSync('git',['cat-file','blob',HISTORICAL_SOURCE_BLOB],{cwd:root,stdio:['ignore','pipe','pipe']});
    sourceBinding(bytes);return bytes;
  } catch (_) {throw Error('probe-historical-source-unavailable');}
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
  const file=require.resolve('../../src/electronapp/enhanced/shared-playback-cache/proxy');
  const checkout=await fs.readFile(file),observedCheckout=livePolicyBinding(checkout),executed=historicalSource(path.resolve(__dirname,'../..'));
  const binding=sourceBinding(executed),variants=sourceVariants(executed),old=variants.A,shared=variants.B,perBlock=variants.C,bounded30=variants.D;
  const factories=Object.fromEntries(Object.entries(variants).map(([arm,source])=>[arm,load(source,file)])),scenarios={};
  const report={schema:2,scope:'historical-policy-reproduction',currentProductPerformance:'NOT_ASSESSED',baseCommit:BASE,sharedAllowanceCommit:SHARED,historicalSource:{commit:HISTORICAL_SOURCE_COMMIT,blob:HISTORICAL_SOURCE_BLOB,sha256:binding.checkoutSha256},observedCheckout,policies:{A:'15ms per block',B:'15ms +10ms shared response allowance',C:'25ms per block',D:'30ms per block'},sourceSha256:{A:sha(old),B:sha(shared),C:sha(perBlock),D:sha(bounded30)},node:process.version,platform:process.platform,os:os.release(),
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
module.exports={BASE,SHARED,HISTORICAL_SOURCE_COMMIT,HISTORICAL_SOURCE_BLOB,SCENARIOS,perBlockPolicy,sourceVariants,sourceBinding,livePolicyBinding,historicalSource,run};
if(require.main===module){const args=process.argv.slice(2);need(args.length===1&&args[0].startsWith('--out='),'probe-argument');run(args[0].slice(6)).catch(()=>{console.error('SHARED_CACHE_READ_GRACE_ERROR probe-failed');process.exitCode=1;});}
