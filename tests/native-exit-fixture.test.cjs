'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path'),fs=require('node:fs');
const tool=require(process.env.ETE_NATIVE_EXIT_FIXTURE_SOURCE||'../tools/native-exit-fixture.cjs');
const {validateCommand}=require('../src/electronapp/native-helper/service');
const configuration={config:path.resolve('synthetic-case.json'),report:path.resolve('synthetic-report.json'),clip:path.resolve('synthetic.y4m')};
test('synthetic clip is generated locally and the stimulus is only an extra AMD script',()=>{
 const clip=tool.clip();assert.ok(clip.subarray(0,50).toString().startsWith('YUV4MPEG2 W32 H18 F2:1'));
 assert.equal((clip.toString('latin1').match(/FRAME\n/g)||[]).length,120);
 assert.throws(()=>tool.build({...configuration,report:'relative'}),/ABSOLUTE/);
 const source=tool.build(configuration);new vm.Script(source);
 assert.doesNotMatch(source,/app\.quit|process\.exit|BrowserWindow|spawn\(|fetch\(|https?:|ELECTRON_RUN_AS_NODE|NATIVE_TRIAL/);
 assert.throws(()=>validateCommand(['loadfile',configuration.clip,'replace']),/loadfile-shape-invalid/);
 assert.deepEqual(validateCommand(['loadfile',configuration.clip]),['loadfile',configuration.clip]);
});
for(const mode of ['playing-close','stop-close','rejected-command','private-command-error','properties-pending','properties-never-ready','property-value-limit'])test('stimulus validates appready, decoded playback and safe command errors: '+mode,async()=>{
 const files=new Map(),calls=[],sent=[],listeners=new Map(),timers=new Map();let timerId=0,now=0,propertyCalls=0;
 const object={};
 const ipc={async invoke(channel,packet){
  if(channel==='enhanced-windows-native-media-session')return{token:'01234567-1234-1234-1234-012345678901'};
  calls.push(packet);
  if(packet.operation==='create')return{status:'ok',mode:'native-helper',endpointId:'01234567-1234-1234-1234-012345678901',helperVersion:'fixture',libmpvVersion:'fixture'};
  if(packet.operation==='begin-generation')return{status:'ok',generationId:101};
  if(packet.operation==='command'){
   if(mode==='rejected-command')return{status:'error',reason:'loadfile-shape-invalid'};
   if(mode==='private-command-error')return{status:'error',reason:'PRIVATE_SYNTHETIC_PATH_CANARY'};
   try{validateCommand(packet.payload.data);}catch(error){return{status:'error',reason:error.message};}
  }
  if(packet.operation==='get-property'){
   propertyCalls++;
   if(mode==='properties-never-ready'||mode==='properties-pending'&&propertyCalls<=4)return{status:'error',reason:'property-unavailable'};
   if(mode==='property-value-limit')return{status:'error',reason:'property-value-limit'};
   return{status:'ok',value:packet.payload.name==='time-pos'?1:packet.payload.name==='core-idle'?true:{w:32,h:18}};
  }
  return{status:'accepted'};
 },send(channel,packet){sent.push({channel,packet});}};
 const context={define(_deps,factory){Object.assign(object,factory());},window:{ipc,fs:{readFileSync(){return JSON.stringify({caseId:'synthetic',mode});},writeFileSync(p,b){files.set(p,b);},renameSync(a,b){files.set(b,files.get(a));files.delete(a);}}},
  document:{addEventListener(name,fn){listeners.set(name,fn);}},setTimeout(fn,ms){const id=++timerId;if(ms===30000)timers.set(id,fn);else{now+=ms;setImmediate(fn);}return id;},clearTimeout(id){timers.delete(id);},Promise,Date:{now:()=>now},Error};
 vm.runInNewContext(tool.build(configuration),context);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,0);assert.equal(timers.size,1);
 listeners.get('appready')();
 for(let i=0;i<200;i++)await new Promise(resolve=>setImmediate(resolve));
 const report=JSON.parse(files.get(configuration.report));
 if(mode==='rejected-command'||mode==='private-command-error'){
  assert.equal(report.status,'failed');assert.equal(report.readyForClose,false);assert.equal(report.realNativePlayback,false);assert.equal(report.stage,'loadfile');
  assert.equal(report.nativeErrorReason,mode==='rejected-command'?'loadfile-shape-invalid':'UNAVAILABLE');assert.equal(report.failedOperation,'command');
  assert.equal(JSON.stringify(report).includes('PRIVATE_SYNTHETIC_PATH_CANARY'),false);return;
 }
 if(mode==='properties-never-ready'){
  assert.equal(report.status,'failed');assert.equal(report.errorCode,'DECODED_VIDEO_NOT_CONFIRMED');assert.equal(report.realNativePlayback,false);assert.equal(report.readyForClose,false);assert.ok(report.propertyUnavailableCount>0);assert.ok(now>=20000);return;
 }
 if(mode==='property-value-limit'){
  assert.equal(report.status,'failed');assert.equal(report.nativeErrorReason,'property-value-limit');assert.equal(report.realNativePlayback,false);assert.equal(propertyCalls,1);return;
 }
 assert.equal(report.status,'ready');assert.equal(report.readyForClose,true);assert.equal(report.realNativePlayback,true);assert.equal(report.stopConfirmed,mode==='stop-close');assert.equal(timers.size,0);
 assert.equal(calls[0].operation,'create');assert.ok(calls.some(c=>c.operation==='get-property'&&c.payload.name==='video-out-params'));
 assert.equal(calls.find(c=>c.operation==='command'&&c.payload.data[0]==='loadfile').payload.data.length,2);
 assert.ok(sent.some(s=>s.channel==='enhanced-windows-native-media-state'&&s.packet.active===true));
 if(mode==='stop-close')assert.ok(calls.some(c=>c.operation==='get-property'&&c.payload.name==='core-idle'&&c.payload.generationId===null));
 if(mode==='properties-pending')assert.equal(report.propertyUnavailableCount,4);
});
test('ordinary Host entry, exact release binding and failed-exit cleanup remain explicit in the real checker',()=>{
 const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
 const source=read('tools/check-v043-installed-startup.ps1'),cases=read('tools/check-v043-native-exit-cases.ps1');
 assert.match(source,/EXPLICIT_RELEASE_BINDING_REQUIRED/);assert.match(source,/0696b9f6f2c2ed845c9124771bea2a7462532908c2ddbb9ecdaca59271c6b266/);
 assert.match(cases,/Start-Process -FilePath \$Shortcut.TargetPath -WorkingDirectory \$Shortcut.WorkingDirectory/);
 assert.match(cases,/NONZERO_OWNED_EXIT/);assert.match(cases,/OWNED_EXIT_NOT_CONFIRMED/);assert.match(cases,/APP_FAILURE_EVENT/);
 assert.match(cases,/\$summary.status='failed';\$summary.forcedCleanup=\$true/);assert.match(cases,/\$current.CreationDate -eq \$tracked\[\$id\].created/);
 assert.match(cases,/Assert-OriginalPayload/);assert.doesNotMatch(cases,/app\.exit|taskkill|ExecutionPolicy|Set-MpPreference/);
 assert.match(source,/IsMainStyle\(GetWindowStyle\(h,-20\)/);assert.match(source,/extendedStyle & 0x08000000L/);
 assert.match(cases,/CommandLine -notmatch '--place-window-behind'/);
});
