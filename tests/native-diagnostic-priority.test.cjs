'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createNativeDiagnostics}=require('../src/electronapp/enhanced/native-diagnostics');
const diagnostics=require('../src/electronapp/enhanced/diagnostics');

function harness(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ete-priority-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const logger=diagnostics.createLogger(root),held=[],attempts=[];let now=0,hold=()=>false,failure=null;
 const observe=createNativeDiagnostics(row=>{
  attempts.push(row);
  if(failure){const mode=failure;failure=null;if(mode==='throw')throw Error('disk');if(mode==='reject')return Promise.reject(Error('disk'));return false;}
  if(hold(row))return new Promise(resolve=>held.push(()=>resolve(logger(row))));
  return logger(row);
 },{now:()=>now});
 const tick=()=>new Promise(resolve=>setImmediate(resolve));
 async function flush(){await logger.flush();await tick();}
 return {observe,attempts,held,advance:()=>{now+=61000;},hold:fn=>{hold=fn;},fail:mode=>{failure=mode;},flush,
  drain:async()=>{hold=()=>false;held.splice(0).forEach(done=>done());await tick();await flush();},
  records:async()=>{await flush();return (await logger.readRecords()).records;},
  report:async()=>{await flush();return logger.exportReport({});}};
}
function engine(h,sequence,level='error',message='CRITICAL_FAULT',generation=1,snapshotSequence=sequence){
 h.observe({name:'mpv-engine',disposition:'ACCEPT_HELPER_GLOBAL',helperRun:1,engine:{mode:'normal',phase:'startup',candidateGenerationId:generation,snapshotSequence,dropped:0,
  records:[{sequence,monotonicMicros:sequence,module:'vd',level,message}]}});
}
function operation(h,index,kind='success',generation=1){
 const common={helperRun:1,generationId:generation,disposition:'ACCEPT'};
 if(kind==='error')h.observe({...common,name:'operation-error',operation:'set-property',property:'start',errorCode:-9,error:'CRITICAL_OPERATION'});
 else h.observe({...common,name:'startup-property-result',result:{property:'start',operationSequence:index,value:'0',applied:kind==='success',errorCode:kind==='success'?0:-9}});
}
for(const pressure of ['rate','pending']){
 test(`warning ${pressure} pressure cannot consume fatal/error delivery capacity`,async t=>{
  const h=harness(t);if(pressure==='pending')h.hold(r=>r.details.mpvLevel==='warn');
  for(let i=1;i<=(pressure==='rate'?60:32);i++){engine(h,i,'warn','warning '+i);if(pressure==='rate')await h.flush();}
  engine(h,100,'error','CRITICAL_FAULT https://user:SECRET_CANARY@nas.invalid/a?token=TOKEN_CANARY');
  await h.flush();assert.ok((await h.records()).some(r=>r.details.message?.startsWith('CRITICAL_FAULT')));
  await h.drain();const report=await h.report();assert.match(report,/CRITICAL_FAULT/);assert.doesNotMatch(report,/SECRET_CANARY|TOKEN_CANARY/);
 });
 for(const kind of ['error','failed-property'])test(`successful property ${pressure} pressure cannot consume ${kind} capacity`,async t=>{
  const h=harness(t);if(pressure==='pending')h.hold(r=>r.details.applied===true);
  for(let i=1;i<=(pressure==='rate'?120:32);i++){operation(h,i);if(pressure==='rate')await h.flush();}
  operation(h,500,kind);await h.flush();
  assert.ok((await h.records()).some(r=>kind==='error'?r.event==='operation-error'&&r.details.mpvErrorCode===-9:r.event==='startup-property-result'&&r.details.applied===false));
  await h.drain();const report=await h.report();assert.match(report,kind==='error'?/CRITICAL_OPERATION/:/"applied":false/);
 });
}
test('critical engine rate suppression remains bounded and a retained failed sequence can recover after the window',async t=>{
 const h=harness(t);
 for(let i=1;i<=100;i++){engine(h,i);await h.flush();}
 let rows=await h.records();assert.equal(rows.filter(r=>r.event==='engine-message').length,60);
 h.advance();engine(h,61,'error','RECOVERED_61',1,101);await h.flush();engine(h,61,'error','RECOVERED_61',1,102);await h.flush();
 rows=await h.records();assert.equal(rows.filter(r=>r.details.message==='RECOVERED_61').length,1);
 assert.equal(rows.reduce((n,r)=>n+(r.details.diagnosticSuppressedRate||0),0),40);
 assert.match(await h.report(),/RECOVERED_61/);
});
test('critical pending pressure and failed writes do not mark engine records saved; later higher sequences cannot hide the gap',async t=>{
 const h=harness(t);h.hold(r=>r.event==='engine-message');
 for(let i=1;i<=40;i++)engine(h,i);
 assert.equal(h.held.length,32);await h.drain();
 engine(h,33,'error','RECOVERED_PENDING',1,41);await h.flush();
 assert.ok((await h.records()).some(r=>r.details.message==='RECOVERED_PENDING'));
 assert.equal((await h.records()).filter(r=>r.details.diagnosticLane==='engine-error').reduce((n,r)=>n+(r.details.diagnosticSuppressedPending||0),0),8);
 for(const [offset,mode] of ['false','throw','reject'].entries()){
  h.advance();h.fail(mode);engine(h,50,'error','RECOVERED_'+mode,2+offset,50);await h.flush();
  // Preserve a failed lower sequence in the same native snapshot while a higher one succeeds.
  const records=[51,50].map(sequence=>({sequence,monotonicMicros:sequence,module:'vd',level:'error',message:sequence===50?'RECOVERED_'+mode:'higher'}));
  h.observe({name:'mpv-engine',disposition:'ACCEPT_HELPER_GLOBAL',helperRun:1,engine:{mode:'normal',phase:'startup',candidateGenerationId:2+offset,snapshotSequence:51,dropped:0,records}});
  await h.flush();assert.ok((await h.records()).some(r=>r.details.message==='RECOVERED_'+mode));
 }
 assert.equal((await h.records()).reduce((n,r)=>n+(r.details.diagnosticWriteFailures||0),0),3);
 assert.doesNotMatch(await h.report(),/SECRET_CANARY/);
});
test('operation errors and failed property results have bounded storms, recovery and truthful suppression counts',async t=>{
 const h=harness(t);
 for(let i=1;i<=150;i++){operation(h,i,i%2?'error':'failed-property');await h.flush();}
 let rows=await h.records();assert.equal(rows.filter(r=>r.event==='operation-error'||r.event==='startup-property-result').length,120);
 h.advance();operation(h,151,'error',2);await h.flush();
 rows=await h.records();assert.equal(rows.reduce((n,r)=>n+(r.details.diagnosticSuppressedRate||0),0),30);
 assert.ok(rows.some(r=>r.event==='operation-error'&&r.details.generationId===2));
 h.advance();h.hold(r=>r.event==='operation-error'||r.event==='startup-property-result');
 for(let i=1;i<=40;i++)operation(h,i,'failed-property',3);
 assert.equal(h.held.length,32);await h.drain();operation(h,41,'error',3);await h.flush();
 rows=await h.records();assert.equal(rows.reduce((n,r)=>n+(r.details.diagnosticSuppressedPending||0),0),8);
 assert.match(await h.report(),/CRITICAL_OPERATION/);
});
test('engine delivery identities stay helper/generation scoped and duplicate in-flight snapshots are bounded',async t=>{
 const h=harness(t);h.hold(r=>r.event==='engine-message');
 engine(h,1);engine(h,1);engine(h,1,'error','GEN_TWO',2);assert.equal(h.held.length,2);
 await h.drain();engine(h,1);engine(h,1,'error','GEN_TWO',2);await h.flush();
 const rows=await h.records();assert.equal(rows.filter(r=>r.event==='engine-message').length,2);
 assert.match(await h.report(),/GEN_TWO/);
});
