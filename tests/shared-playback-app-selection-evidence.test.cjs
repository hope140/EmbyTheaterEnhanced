'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const smoke=require('../tools/shared-playback-cache/windows-smoke.cjs');
const diagnostics=require('../src/electronapp/enhanced/playback-range-diagnostics');
const source=fs.readFileSync(require.resolve('../tools/shared-playback-cache/app-performance-electron.cjs'),'utf8');
const start=source.indexOf('  function tap(object, name, settled, stage = null)'),end=source.indexOf('  function resourceSample()',start);
assert(start>0&&end>start);
function harness(){
  const marks=[],restores=[];let clock=10;
  const context={performance:{now:()=>clock},client:{currentGenerationId:131},retired:false,started:0,observationErrors:0,restores,
    mark:(type,facts)=>marks.push({type,...facts}),get:name=>{assert.equal(name,'enhanced/playback-range-diagnostics');return diagnostics;},need:(v,c)=>{if(!v)throw Error(c);}};
  const tap=vm.runInNewContext(source.slice(start,end)+'\ntap;',context);
  return {tap,context,marks,restores,setTime:value=>{clock=value;}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('actual selection observer preserves Promise identity, this, arguments, result and one invocation',async()=>{
  const h=harness();let resolve,calls=0;const promise=new Promise(done=>{resolve=done;}),arg={synthetic:true};
  const object={open(value){assert.equal(this,object);assert.equal(value,arg);calls++;return promise;}},original=object.open,seen=[];
  h.tap(object,'open',value=>seen.push(value),'adapter-open');
  assert.equal(object.open(arg),promise);assert.equal(calls,1);assert.equal(h.marks[0].outcome,'begin');
  h.setTime(45);const result={source:'PRIVATE_SOURCE'};resolve(result);assert.equal(await promise,result);await settle();
  assert.equal(seen[0],result);assert.equal(calls,1);
  assert.equal(h.marks[1].outcome,'fulfilled');assert.equal(h.marks[1].elapsedMs,35);assert.equal(h.marks[1].generation,131);
  assert.doesNotMatch(JSON.stringify(h.marks),/PRIVATE_SOURCE|synthetic/);
  h.restores[0]();assert.equal(object.open,original);
});

test('actual observer preserves synchronous throws and rejected promises while recording only safe reasons',async()=>{
  for(const synchronous of [false,true])for(const failure of [undefined,Error('PRIVATE_CANARY https://private.invalid/'),diagnostics.error('source-proof-invalid','PRIVATE_CANARY')]){
    const h=harness(),object={open(){if(synchronous)throw failure;return Promise.reject(failure);}};
    h.tap(object,'open',()=>assert.fail('rejection must not enter fulfillment'),'adapter-open');
    if(synchronous){let caught=false;try{object.open();}catch(error){caught=true;assert.equal(error,failure);}assert(caught);}
    else{const pending=object.open();await assert.rejects(pending,error=>error===failure);await settle();}
    assert.equal(h.marks.length,2);assert.equal(h.marks[1].outcome,synchronous?'threw':'rejected');
    assert.equal(h.marks[1].diagnostic.reason,failure?.preloadReason==='source-proof-invalid'?'source-proof-invalid':'cache-unavailable');
    assert.doesNotMatch(JSON.stringify(h.marks),/PRIVATE_CANARY|private\.invalid/);
  }
});

test('observation exceptions and retirement cannot replace or delay the original operation',async()=>{
  const h=harness(),result={owned:true},promise=Promise.resolve(result),object={open:()=>promise};
  h.tap(object,'open',()=>{throw Error('observer-failure');},'store-open');
  assert.equal(object.open(),promise);assert.equal(await promise,result);await settle();assert.equal(h.context.observationErrors,1);
  h.context.retired=true;const before=h.marks.length;assert.equal(await object.open(),result);await settle();assert.equal(h.marks.length,before);
  object.open=()=>promise;assert.throws(()=>h.restores[0](),/app-observer-owner/);
});

test('actual Native load receipt retains the real fallback diagnostic without changing the source or its dispatch',()=>{
  const begin=source.indexOf('    load(values) {'),close=source.indexOf('    getProperty(name, timeoutMs)',begin);
  assert(begin>0&&close>begin);
  for(const reason of ['timeout','source-options-changed','source-proof-invalid','cache-unavailable']){
    const marks=[],args=['loadfile','http://127.0.0.1/synthetic'],status={enabled:true,current:{state:'original',diagnostic:{stage:'current-probe',reason,source:'PRIVATE_URL'}},next:{state:'idle'},diskBytes:461};
    const context={Base:class{load(value){assert.equal(value,args);return 'original-result';}},service:{rangeStatus:()=>status},
      contract:{loadSource:()=>({proxied:false})},plan:{sources:{mediaOrigin:'http://127.0.0.1'}},proxyUrls:new Set(),smoke,
      observationErrors:0,generation:null,lastAuditableFrame:{},lastFixtureEvidence:{},frameColorProfile:{},mark:(type,data)=>marks.push({type,...data})};
    const Class=vm.runInNewContext('(class extends Base {'+source.slice(begin,close)+'})',context),client=new Class();client.currentGenerationId=131;
    assert.equal(client.load(args),'original-result');assert.equal(marks.length,1);assert.equal(marks[0].proxied,false);
    assert.equal(marks[0].cacheEnabled,true);assert.equal(marks[0].cache.current.diagnostic.reason,reason);
    assert.doesNotMatch(JSON.stringify(marks),/PRIVATE_URL/);
  }
});

test('ordinary wrapper observes all actual selection stages and records native budget reads without configuration writes',()=>{
  for(const stage of ['context','select','adapter-create','adapter-open','adapter-ready','proxy-create','proxy-open','proxy-ready','store-create','store-open'])assert(source.includes("'"+stage+"'"),stage);
  assert.match(source,/smoke\.observeCacheBudgetRead\(\(\) => super\.getProperty\(name, timeoutMs\)/);
  assert.match(source,/cache-selection-result.*selected: !!selected/);
  const runner=fs.readFileSync(require.resolve('../tools/shared-playback-cache/app-performance-runner.cjs'),'utf8');
  assert.match(runner,/spatial media\/frame identity RGB content differs from historical pal8/);
  assert.doesNotMatch(runner,/same RGB frame content and fps as historical pal8/);
});

test('Native status observation failure preserves the original dispatch and remains a failed observation',()=>{
  const begin=source.indexOf('    load(values) {'),close=source.indexOf('    getProperty(name, timeoutMs)',begin),args=['loadfile','http://127.0.0.1/synthetic'],marks=[];
  const context={Base:class{load(value){assert.equal(value,args);return 'original-result';}},service:{rangeStatus(){throw Error('PRIVATE_CANARY');}},
    contract:{loadSource:()=>({proxied:false})},plan:{sources:{mediaOrigin:'http://127.0.0.1'}},proxyUrls:new Set(),smoke,
    observationErrors:0,generation:null,lastAuditableFrame:{},lastFixtureEvidence:{},frameColorProfile:{},mark:(type,data)=>marks.push({type,...data})};
  const Class=vm.runInNewContext('(class extends Base {'+source.slice(begin,close)+'})',context),client=new Class();client.currentGenerationId=131;
  assert.equal(client.load(args),'original-result');assert.equal(context.observationErrors,1);
  assert.equal(marks[0].cache,null);assert.equal(marks[0].cacheEnabled,null);assert.doesNotMatch(JSON.stringify(marks),/PRIVATE_CANARY/);
});
