'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const fixtures = require('../tools/shared-playback-cache/windows-fixtures.cjs');
const contract = require('../tools/shared-playback-cache/app-performance-contract.cjs');
const metrics = require('../tools/shared-playback-cache/app-performance-metrics.cjs');
const pacing = {chunkBytes:16384,chunkDelayMs:8,firstByteDelayMs:20,prefixBytes:2097152,gapBytes:262144};
async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'ete-paced-advance-')), events=[];
  const bytes = Buffer.alloc(3*1048576);for(let i=0;i<bytes.length;i++)bytes[i]=(i*19+(i>>>16))&255;
  await fs.writeFile(path.join(root,'A.bin'),bytes);
  let source;
  t.after(async()=>{try{await source?.close();}finally{await fs.rm(root,{recursive:true,force:true});}});
  source=await fixtures.__testOnlyCreateMediaServer(root,{A:{file:'A.bin',size:bytes.length,etag:'"owned"'}},fixtures.USER_AGENT,(type,row)=>events.push({type,...row}),pacing);
  const open=async start=>fetch(source.origin+'/Videos/A/stream.avi',{headers:{'User-Agent':fixtures.USER_AGENT,Range:`bytes=${start}-`},signal:t.signal});
  return {source,events,bytes,open};
}
async function until(fn,t) {
  const end=Date.now()+1500;while(!fn()&&Date.now()<end&&!t.signal.aborted)await new Promise(r=>setTimeout(r,5));assert(fn());
}
async function take(reader,n) {
  const chunks=[];let size=0;while(size<n){const value=await reader.read();assert.equal(value.done,false);chunks.push(Buffer.from(value.value));size+=value.value.length;}assert.equal(size,n);return Buffer.concat(chunks);
}

test('paced continuation releases only an existing stalled response, preserving exact bytes and headers', {timeout:10000},async t=>{
  const {source,events,bytes,open}=await setup(t);
  assert.equal(source.advancePaced().advancedResponses,0,'an early grant never credits future requests');
  const response=await open(0),reader=response.body.getReader();
  assert.equal(response.status,206);assert.equal(Number(response.headers.get('content-length')),bytes.length);
  assert.equal(response.headers.get('content-range'),`bytes 0-${bytes.length-1}/${bytes.length}`);
  assert.deepEqual(await take(reader,pacing.prefixBytes),bytes.subarray(0,pacing.prefixBytes));
  await until(()=>events.some(e=>e.type==='media-paced-wait'),t);
  let settled=false;const pending=reader.read().then(value=>{settled=true;return value;});
  await new Promise(r=>setTimeout(r,40));assert.equal(settled,false,'old hold has no EOF or new bytes without an explicit source-window grant');
  assert.deepEqual(source.advancePaced(),{advancedResponses:1,maxAdditionalBytesPerResponse:pacing.gapBytes});
  const first=await pending;assert.equal(first.done,false);
  const rest=await take(reader,pacing.gapBytes-first.value.length);
  assert.deepEqual(Buffer.concat([Buffer.from(first.value),rest]),bytes.subarray(pacing.prefixBytes,pacing.prefixBytes+pacing.gapBytes));
  await until(()=>events.filter(e=>e.type==='media-paced-wait').length===2,t);
  assert.equal(events.filter(e=>e.type==='media-open').length,1,'continuation is the same response, no target Range fetched by the fixture');
  assert.equal(events.filter(e=>e.type==='media-bytes').reduce((n,e)=>n+e.length,0),pacing.prefixBytes+pacing.gapBytes);
  await reader.cancel();await until(()=>events.some(e=>e.type==='media-close'),t);
  assert.equal(events.find(e=>e.type==='media-close').complete,false,'the long response is cancelled, never fabricated complete');
  assert.equal(source.advancePaced().advancedResponses,0,'closed waiters cannot accept late bytes');
  // The first grant must not spill into a subsequent independently opened Range.
  const later=await open(pacing.prefixBytes+2*pacing.gapBytes),laterReader=later.body.getReader();
  assert.deepEqual(await take(laterReader,pacing.gapBytes),bytes.subarray(pacing.prefixBytes+2*pacing.gapBytes,pacing.prefixBytes+3*pacing.gapBytes));
  await until(()=>events.filter(e=>e.type==='media-paced-wait').length===3,t);
  let laterSettled=false;const laterRead=laterReader.read().then(v=>{laterSettled=true;return v;});
  await new Promise(r=>setTimeout(r,40));assert.equal(laterSettled,false,'a future request gets only its normal initial window');
  await laterReader.cancel();await laterRead;
  await until(()=>source.snapshot().activeMediaResponses===0,t);
  const cleanup=await source.close();assert.equal(cleanup.mediaSockets,0);assert.equal(cleanup.heldRequests,0);
});

test('ordinary source advance is after actual seek dispatch, uses one bounded grant, and keeps the original event deadline',async()=>{
  const source=await fs.readFile(path.join(__dirname,'../tools/shared-playback-cache/app-performance-electron.cjs'),'utf8');
  const seek=source.indexOf("await evalCode(contract.rendererAction('seek', target))"),advance=source.indexOf("plan.controlOrigin + '/advance/'"),signals=source.indexOf('previewEvidence.seekSignals(events, start, owner, target)');
  assert(seek>0&&advance>seek&&signals>advance);
  assert.match(source,/seekDeadline = Math.min\(deadline, performance.now\(\) \+ 5000\)/);
  assert.match(source,/Math.max\(0,seekDeadline-performance.now\(\)\)/);
  assert.deepEqual(contract.SCENARIOS,['cold-first-frame','cached-seek','boundary-seek','uncached-seek','far-seek']);
  assert.deepEqual([...new Set(metrics.expectedSchedule().map(row=>row.scenario))],contract.SCENARIOS);
  assert.match(source,/contract.assertCoverage\(scenario, kind\)/,'real coverage must still be measured before each B seek');
  assert.match(source,/after.overlapBytes > before.overlapBytes/,'continuation bytes are never exempted from the zero-reread gate');
});

test('actual coordinator advance branch rejects duplicate, skipped, cached or extra-field grants',async()=>{
  const vm=require('node:vm'),text=await fs.readFile(path.join(__dirname,'../tools/shared-playback-cache/app-performance-runner.cjs'),'utf8');
  const begin=text.indexOf("      if(match[1]==='advance') {"),end=text.indexOf("      need(Object.keys(value).join(',')==='ranges'",begin);
  assert(begin>0&&end>begin);const body=text.slice(begin,end),state={advances:0},events=[];let calls=0;
  const run=value=>vm.runInNewContext('(function(){'+body+'})()',{
    match:['','advance'],value,state,active:0,events,Date,need:(v,c)=>{if(!v)throw Error(c);},
    sources:{advancePaced(){calls++;return{advancedResponses:0,maxAdditionalBytesPerResponse:786432};}},
    res:{setHeader(){},end(value){assert.equal(JSON.parse(value).advancedResponses,0);}}
  });
  for(const value of [{scenario:'cached-seek'},{scenario:'uncached-seek'},{scenario:'boundary-seek',ranges:[]}])assert.throws(()=>run(value),/control-advance/);
  assert.equal(calls,0);assert.equal(state.advances,0);
  run({scenario:'boundary-seek'});assert.throws(()=>run({scenario:'boundary-seek'}),/control-advance/);
  run({scenario:'uncached-seek'});run({scenario:'far-seek'});assert.equal(calls,3);
  assert.throws(()=>run({scenario:'far-seek'}),/control-advance/);assert.equal(calls,3);
  assert.deepEqual(events.map(e=>e.scenario),['boundary-seek','uncached-seek','far-seek']);
});
