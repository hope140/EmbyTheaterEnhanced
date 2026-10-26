'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), vm = require('node:vm');
const {temporaryRoot} = require('./helpers/range-fixture-root.cjs');
const {performance} = require('node:perf_hooks');
const c = require('../tools/shared-playback-cache/app-performance-contract.cjs');
const runner = require('../tools/shared-playback-cache/app-performance-runner.cjs');
const fixtures = require('../tools/shared-playback-cache/windows-fixtures.cjs');
const {createEmby} = require('../tools/shared-playback-cache/app-emby-fixture.cjs');

test('ordinary app and physical-package verifier share the exact reviewed product anchor', () => {
  const physical = require('../tools/shared-playback-cache/windows-contract.cjs');
  assert.equal(c.BASE, physical.PRODUCT_COMMIT);
  assert.equal(runner.BASE, c.BASE);
  assert.notEqual(c.BASE, '7a569c8e36f3d26f65d71aead369f0e6e9f70aad');
});

test('fixed app matrix is 46 isolated arms and 230 outcomes, with entry preflight separate', () => {
  const rows=runner.cases('matrix'); assert.equal(rows.length,46);
  assert.deepEqual(rows.slice(0,4),[{index:0,pair:-3,arm:'A'},{index:1,pair:-3,arm:'B'},{index:2,pair:-2,arm:'B'},{index:3,pair:-2,arm:'A'}]);
  assert.equal(rows.filter(r=>r.pair>=0).length,40); assert.equal(c.SCENARIOS.length*rows.length,230);
  assert.equal(runner.cases('entry').length,2); assert.throws(()=>runner.cases('all'));
  assert.equal(c.LIMITS.workerMs,90000); assert.equal(c.LIMITS.pairs,20); assert.equal(c.LIMITS.warmups,3);
});

test('ordinary renderer login uses actual modules/API authentication and normal play actions', async () => {
  const calls=[];
  const api={serverId:()=> 'prefix-server',getCurrentUserId:()=> 'fixture-user',async authenticateUserByName(...args){calls.push(['authenticate',...args]);}};
  const cm={async connectToAddress(...args){calls.push(['connect',...args]);return {State:'ServerSignIn',ApiClient:api};},currentApiClient:()=>api};
  const router={async handleConnectionResult(value){assert.equal(value.ApiClient,api);calls.push(['router',value.State]);}};
  const settings={set(...args){calls.push(['set',...args]);}};
  const pm={async play(value){calls.push(['play',value]);},getCurrentPlayer:()=>({currentSrc:()=> 'local-owned'}),async seek(value){calls.push(['seek',value]);}};
  const sandbox={require:async names=>names.map(name=>({connectionManager:cm,playbackManager:pm,'./modules/approuter.js':router,appSettings:settings}[name]))};
  assert.equal((await vm.runInNewContext(c.rendererLogin('http://127.0.0.1:12345'),sandbox)).signedIn,true);
  await vm.runInNewContext(c.rendererAction('play'),sandbox);await vm.runInNewContext(c.rendererAction('seek',3),sandbox);
  assert.deepEqual(calls.map(row=>row[0]),['set','connect','authenticate','router','play','seek']);
  assert.equal(calls[4][1].fullscreen,true);assert.equal(calls[4][1].ids[0],'A');assert.equal(calls[5][1],30000000);
  assert.throws(()=>c.rendererLogin('https://example.com'));assert.throws(()=>c.rendererLogin('http://localhost:1'));assert.throws(()=>c.rendererAction('proof'));
  const script=c.rendererLogin('http://127.0.0.1:12345')+c.rendererAction('play');
  assert.doesNotMatch(script,/sourceProof|stubs|\.define\(|accessToken\s*=/);
});

test('coverage guards distinguish actual cached, missing and straddling frames without relabeling', () => {
  const layout={dataStart:1288,frameStride:57608,frames:192,fps:12};
  const cached=c.frameRange(layout,.5),boundary=c.frameRange(layout,3),far=c.frameRange(layout,14);
  const span={start:0,end:2097152};
  assert.equal(c.coverageKind(span,cached),'cached');assert.equal(c.coverageKind(span,boundary),'boundary');assert.equal(c.coverageKind(span,far),'uncached');
  c.assertCoverage('boundary-seek','boundary');assert.throws(()=>c.assertCoverage('boundary-seek','cached'));
  assert.throws(()=>c.frameRange({...layout,frameStride:0},1));
  assert.equal(runner.intersectionLength(10,20,[{start:15,end:25}]),10);
});

test('worker rows require PID/source/task and exactly five unique valid samples; failures preserve good rows', () => {
  const task={index:0,pair:-3,arm:'A'},result={spawnPid:123};
  const receipt={pid:123,index:0,pair:-3,arm:'A',productCommit:c.BASE,toolCommit:'a'.repeat(40),samples:c.SCENARIOS.map(scenario=>({scenario,pair:-3,arm:'A',status:'PASS',latencyMs:3,
    sourceBodyBytes:4,overlapBodyBytes:0,peakRssBytes:100,peakDiskBytes:200}))};
  receipt.samples[2]={...receipt.samples[2],status:'FAIL',latencyMs:null};
  assert.equal(runner.receiptRows(receipt,result,task,c.BASE,'a'.repeat(40))[0].status,'PASS');
  assert.equal(runner.receiptRows(receipt,result,task,c.BASE,'a'.repeat(40))[2].latencyMs,null);
  for(const edit of [r=>r.pid++,r=>r.samples[1].scenario=r.samples[0].scenario,r=>r.samples[0].arm='B',r=>r.samples[0].latencyMs=NaN,r=>r.samples[0].sourceProof='no']){
    const copy=structuredClone(receipt);edit(copy);assert.equal(runner.receiptRows(copy,result,task,c.BASE,'a'.repeat(40)),null);
  }
});

async function pacedFixture(t, prefix) {
  const began = performance.now(), root = temporaryRoot(prefix, ['']), events = []; let sources;
  t.diagnostic(JSON.stringify({type:'paced-fixture-stage',stage:'setup-begin'}));
  t.after(async () => {
    const before = performance.now();
    try {if (sources) {const result = await sources.close(); t.diagnostic(JSON.stringify({type:'paced-fixture-stage',stage:'cleanup',elapsedMs:performance.now()-before,...result}));
      assert.equal(result.activeMediaResponses,0); assert.equal(result.mediaSockets,0); assert.equal(result.heldRequests,0); assert.equal(result.grpcStopped,true);}}
    finally {await fs.rm(root,{recursive:true,force:true});}
  });
  const plan = await fixtures.generateFixtures(root);
  sources = await fixtures.startWindowsSources({plan,createEmby,pacing:c.LIMITS,record:(type,row)=>events.push({type,...row})});
  t.diagnostic(JSON.stringify({type:'paced-fixture-stage',stage:'setup-complete',elapsedMs:performance.now()-began}));
  return {root,plan,sources,events};
}
async function readPacedWindow(t, sources, start, events) {
  const began = performance.now(), abort = new AbortController(); let bytes = 0;
  try {
    const response = await fetch(sources.mediaOrigin+'/Videos/A/stream.avi', {
      headers:{'User-Agent':fixtures.USER_AGENT,Range:'bytes='+start+'-'}, signal:AbortSignal.any([abort.signal,t.signal])});
    assert.equal(response.status,206);
    try {for await (const part of response.body) {bytes+=part.length; if(bytes>=c.LIMITS.prefixBytes) {abort.abort(); break;}}}
    catch(error) {if(t.signal.aborted || !abort.signal.aborted) throw error; assert.equal(error.name,'AbortError');}
    assert.equal(bytes,c.LIMITS.prefixBytes,'a nonzero video offset must not truncate the final complete cache block');
    assert.ok(events.some(row=>row.type==='media-bytes'),'the real source stream produced bytes');
  } finally {
    abort.abort();
    const closeDeadline = performance.now()+2000;
    while(sources.snapshot().activeMediaResponses && performance.now()<closeDeadline) await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(sources.snapshot().activeMediaResponses,0,'abort must physically close the paced response');
    t.diagnostic(JSON.stringify({type:'paced-fixture-stage',stage:'transfer',elapsedMs:performance.now()-began,receivedBytes:bytes,testAborted:t.signal.aborted}));
  }
}

test('real generated AVI layout and paced loopback sources close held windows without outside media', {timeout:20000}, async t=>{
  const {root,plan,sources,events} = await pacedFixture(t,'ete-app-source-');
  const file=await fs.open(path.join(root,plan.media.A.file),'r');try{const header=Buffer.alloc(8);await file.read(header,0,8,plan.media.A.dataStart);assert.equal(header.toString('ascii',0,4),'00db');assert.equal(header.readUInt32LE(4),57600);}finally{await file.close();}
  const info=await fetch(sources.origin+'/System/Info/Public');assert.equal((await info.json()).Id,'prefix-server');
  const denied=await fetch(sources.origin+'/Videos/A/stream.avi');assert.equal(denied.status,403);
  await t.test('paced transfer only, independently bounded after material setup',{timeout:10000},st=>readPacedWindow(st,sources,0,events));
});

test('tool-only wrapper executes ordinary main, preserves its preload/IPC and uses normal quit', async()=>{
  const source=await fs.readFile(path.join(__dirname,'../tools/shared-playback-cache/app-performance-electron.cjs'),'utf8');
  assert.match(source,/require\(path\.join\(plan\.runtime, 'electronapp\/main\.js'\)\)/);
  assert.match(source,/app\.setAppPath\(process\.argv\[1\]\)/);assert.match(source,/app\.quit\(\)/);
  assert.doesNotMatch(source,/rendererBoot|prefixHarness|sourceProof\s*[:=]|webPreferences\s*:/);
  assert.ok(source.indexOf('native.NativeHelperClient = ObservedClient')<source.indexOf("tap(get('native-helper/service')"));
  assert.match(source,/'electronfile:'/);assert.match(source,/nativeHelperStarted = clientList\.length > 0/);
  assert.match(source,/report\.status === 'PASS' && clientList\.length !== 1/);
});


test('ordinary same-document router hash changes keep the exact trusted frame, navigation/replacement rejects', async()=>{
  const frame={url:'file:///owned/electronapp/www/index.html?autostart=false',isDestroyed:()=>false,detached:false,
    async executeJavaScript(){frame.url += '#!/home';return 7;}};
  const contents={mainFrame:frame,isDestroyed:()=>false};
  assert.equal(await c.executeAppFrame(contents,'file:///owned/electronapp/www/index.html?autostart=false','7'),7);
  frame.executeJavaScript=async()=>{frame.url='https://example.com/';return 7;};
  await assert.rejects(c.executeAppFrame(contents,'file:///owned/electronapp/www/index.html?autostart=false','7'),/app-frame-retired/);
  frame.url='file:///owned/electronapp/www/index.html?autostart=false';
  frame.executeJavaScript=async()=>{contents.mainFrame={...frame};return 7;};
  await assert.rejects(c.executeAppFrame(contents,'file:///owned/electronapp/www/index.html?autostart=false','7'),/app-frame-retired/);
});


test('worker CLI rejects duplicates and unbound plans before bootstrap',()=>{
  const args=['--plan=/owned/app-plan.json','--plan-sha256='+'a'.repeat(64),'--case=1','--deadline-ms=1793000000000'];
  assert.equal(c.workerArguments(args).case,'1');
  assert.throws(()=>c.workerArguments([...args,'--case=1']));
  assert.throws(()=>c.workerArguments([args[0],args[1],args[2],args[2]]));
  assert.throws(()=>c.workerArguments([args[0],'--plan-sha256=unknown',...args.slice(2)]));
});

test('pre-main scratch is a sibling so product trial cannot reject it or fall into a user profile', async()=>{
  const text=await fs.readFile(path.join(__dirname,'../tools/shared-playback-cache/app-performance-runner.cjs'),'utf8');
  assert.match(text,/const scratch = path\.join\(plan\.out,'bootstrap-'\+task\.index\)/);
  assert.match(text,/env\.APPDATA = path\.join\(scratch,'appdata'\)/);
  assert.doesNotMatch(text,/env\.APPDATA = path\.join\(plan\.out,'profile-'/);
});


test('actual Native source is exact A or an A-bound owned proxy; unrelated loopback/account/version rejects',()=>{
  const crypto=require('node:crypto'),origin='http://127.0.0.1:12345',media='http://127.0.0.1:23456';
  const identity={server:crypto.createHash('sha256').update(JSON.stringify([origin,'prefix-server'])).digest('hex'),account:'fixture-user',item:'A',mediaSource:'A-avi'};
  assert.equal(c.isMediaA(identity,origin),true);
  for(const change of [{account:'other'},{item:'B'},{mediaSource:'B-avi'},{server:'other'}])assert.equal(c.isMediaA({...identity,...change},origin),false);
  assert.equal(c.loadSource(media+'/Videos/A/stream.avi?fixture=synthetic',media,new Set()).proxied,false);
  const proxy='http://127.0.0.1:34567/'+ 'a'.repeat(48);assert.equal(c.loadSource(proxy,media,new Set([proxy])).proxied,true);
  for(const url of [media+'/Videos/B/stream.avi?fixture=synthetic',origin+'/Videos/A/stream.avi?fixture=synthetic',proxy,media+'/Videos/A/stream.avi?api_key=other'])assert.throws(()=>c.loadSource(url,media,new Set()),/app-native-source-identity/);
});


test('paced initial video Range preserves a full bounded window from a real AVI payload offset', {timeout:20000}, async t=>{
  const {plan,sources,events} = await pacedFixture(t,'ete-app-unaligned-source-');
  const start=plan.media.A.dataStart;
  assert.ok(start>0&&start<c.LIMITS.prefixBytes);
  await t.test('actual nonzero-offset paced transfer',{timeout:10000},st=>readPacedWindow(st,sources,start,events));
});

test('ordinary seek proof rejects overlap and waits for video coverage rather than assuming byte-zero cache',async()=>{
  const source=await fs.readFile(path.join(__dirname,'../tools/shared-playback-cache/app-performance-electron.cjs'),'utf8');
  assert.match(source,/scenario !== 'cold-first-frame' && after\.overlapBytes > before\.overlapBytes/);
  assert.match(source,/code='app-cache-body-reread'/);
  assert.match(source,/cacheStore\.span\(cacheKey, contract\.frameRange\(plan\.fixture\.media\.A, contract\.TARGETS\['cached-seek'\]\)\.start\)/);
});


test('ordinary loopback verification blocks LAN discovery and wake before native protocol handlers run',async()=>{
  const source=await fs.readFile(path.join(__dirname,'../tools/shared-playback-cache/app-performance-electron.cjs'),'utf8');
  assert.match(source,/\['electronserverdiscovery:', 'electronwakeonlan:'\]\.includes\(u\.protocol\)/);
  assert.match(source,/discoveryOrWakeRequestsBlocked\+\+; callback\(\{cancel:true\}\); return/);
  assert.ok(source.indexOf('discoveryOrWakeRequestsBlocked++')<source.indexOf("allowed = u.protocol === 'file:'"));
});


test('test-only UDP denial cannot open a socket and restores only its own wrapper',async()=>{
  const text=await fs.readFile(path.join(__dirname,'../tools/shared-playback-cache/app-performance-electron.cjs'),'utf8');
  const begin=text.indexOf("  const datagram = require('node:dgram')"),end=text.indexOf('  // Read-only observation',begin);
  assert.ok(begin>0&&end>begin);let opened=0;const original=()=>opened++,datagram={createSocket:original},restores=[],report={udpSocketsBlocked:0};
  vm.runInNewContext(text.slice(begin,end),{require:name=>{assert.equal(name,'node:dgram');return datagram;},restores,report,need:(value,code)=>{assert.ok(value,code);}});
  assert.throws(()=>datagram.createSocket('udp4'),{code:'ENETUNREACH'});assert.equal(opened,0);assert.equal(report.udpSocketsBlocked,1);
  restores[0]();assert.equal(datagram.createSocket,original);
});
