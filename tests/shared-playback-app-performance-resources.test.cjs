'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {nativePeak}=require('../tools/shared-playback-cache/app-performance-resources.cjs');

const HANDLE={owned:true};
const target=()=>({pid:1234,exitCode:null});
const signatures=Object.freeze({
  open:'void * __stdcall OpenProcess(uint32_t dwDesiredAccess, int bInheritHandle, uint32_t dwProcessId)',
  read:'int __stdcall K32GetProcessMemoryInfo(void *process, void *counters, uint32_t cb)',
  close:'int __stdcall CloseHandle(void *object)',
  lastError:'uint32_t __stdcall GetLastError(void)',
});
function mockKoffi({peak=1048576,openHandle=HANDLE,openError=0,readResult=1,readError=0,mutateCb,closeResult=1,closeError=0,onOpen,onRead,onClose}={}){
  const log={loads:[],bound:[],open:[],read:[],close:[],lastError:[],currentError:0};
  return {log,koffi:{load(name){log.loads.push(name);assert.equal(name,'kernel32.dll');return {func(signature){
    log.bound.push(signature);assert.ok(Object.values(signatures).includes(signature));
    if(signature===signatures.open)return (access,inherit,pid)=>{log.open.push({access,inherit,pid});onOpen?.();log.currentError=openError;return openHandle;};
    if(signature===signatures.read)return (handle,buffer,cb)=>{log.read.push({handle,buffer,cb});onRead?.(buffer,cb);if(mutateCb!==undefined)buffer.writeUInt32LE(mutateCb,0);else if(readResult)buffer.writeBigUInt64LE(BigInt(peak),8);log.currentError=readError;return readResult;};
    if(signature===signatures.close)return handle=>{log.close.push(handle);onClose?.();log.currentError=closeError;return closeResult;};
    if(signature===signatures.lastError)return ()=>{log.lastError.push(log.currentError);return log.currentError;};
    assert.fail('unrecognized Win32 binding');
  }};}}};
}

test('reads one owned PID peak through Kernel32 with the minimum query right and exact x64 layout',()=>{
  const {koffi,log}=mockKoffi({peak:987654321012});const observations=[];
  const bytes=nativePeak({child:target(),koffi,now:()=>100,onObservation:row=>observations.push(row)});
  assert.equal(bytes,987654321012);
  assert.deepEqual(log.loads,['kernel32.dll']);
  assert.deepEqual(log.bound,[signatures.open,signatures.read,signatures.close,signatures.lastError]);
  assert.deepEqual(log.open,[{access:0x1000,inherit:0,pid:1234}]);
  assert.equal(log.read.length,1);assert.equal(log.read[0].handle,HANDLE);assert.equal(log.read[0].cb,72);
  assert.equal(log.read[0].buffer.length,72);assert.equal(log.read[0].buffer.readUInt32LE(0),72);
  assert.equal(log.read[0].buffer.readBigUInt64LE(8),987654321012n);
  assert.deepEqual(log.close,[HANDLE]);assert.equal(log.lastError.length,0);
  assert.deepEqual(observations,[{stage:'close',reason:'measured',exit:null,code:null,signal:null,childBefore:'live',childAfter:'live',handleOpened:true,handleClosed:true}]);
});

test('OpenProcess access denied is classified from Win32 code 5 with no retry or fallback',()=>{
  const {koffi,log}=mockKoffi({openHandle:null,openError:5});const observations=[];
  assert.throws(()=>nativePeak({child:target(),koffi,now:()=>0,onObservation:row=>observations.push(row)}),/^Error: app-owned-memory-query-denied$/);
  assert.deepEqual(log.open,[{access:0x1000,inherit:0,pid:1234}]);assert.equal(log.read.length,0);assert.equal(log.close.length,0);
  assert.deepEqual(log.loads,['kernel32.dll']);assert.deepEqual(log.lastError,[5]);
  assert.deepEqual(observations,[{stage:'open',reason:'denied',exit:null,code:'WIN32_5',signal:null,childBefore:'live',childAfter:'live',handleOpened:false,handleClosed:false}]);
});

test('GetProcessMemoryInfo denial closes its owned handle exactly once and never retries',()=>{
  const {koffi,log}=mockKoffi({readResult:0,readError:5});const observations=[];
  assert.throws(()=>nativePeak({child:target(),koffi,now:()=>0,onObservation:row=>observations.push(row)}),/^Error: app-owned-memory-query-denied$/);
  assert.equal(log.open.length,1);assert.equal(log.read.length,1);assert.deepEqual(log.close,[HANDLE]);assert.deepEqual(log.lastError,[5]);
  assert.equal(observations[0].reason,'denied');assert.equal(observations[0].code,'WIN32_5');
});

test('other Win32 errors and malformed counters fail as unknown after cleanup',()=>{
  for(const options of [{openHandle:null,openError:87},{readResult:0,readError:87},{mutateCb:68},{peak:0},{peak:Number.MAX_SAFE_INTEGER+1}]){
    const {koffi,log}=mockKoffi(options);const observations=[];
    assert.throws(()=>nativePeak({child:target(),koffi,now:()=>0,onObservation:row=>observations.push(row)}),/^Error: app-owned-memory-query-unknown$/);
    if(options.openHandle===null){assert.equal(log.read.length,0);assert.equal(log.close.length,0);}
    else {assert.equal(log.read.length,1);assert.deepEqual(log.close,[HANDLE]);}
    assert.equal(observations.length,1);assert.equal(observations[0].reason,'unknown');
  }
});

test('CloseHandle failure invalidates an otherwise good sample',()=>{
  const {koffi,log}=mockKoffi({closeResult:0,closeError:6});const observations=[];
  assert.throws(()=>nativePeak({child:target(),koffi,now:()=>0,onObservation:row=>observations.push(row)}),/^Error: app-owned-memory-query-unknown$/);
  assert.equal(log.read.length,1);assert.deepEqual(log.close,[HANDLE]);assert.deepEqual(log.lastError,[6]);
  assert.equal(observations[0].reason,'unknown');assert.equal(observations[0].code,'WIN32_6');
});

test('a late synchronous Win32 result closes first, then fails the three-second acceptance deadline',()=>{
  let clock=0;const {koffi,log}=mockKoffi({onRead:()=>{clock=3001;}});const observations=[];
  assert.throws(()=>nativePeak({child:target(),koffi,now:()=>clock,onObservation:row=>observations.push(row)}),/^Error: app-owned-memory-query-timeout$/);
  assert.equal(log.read.length,1);assert.deepEqual(log.close,[HANDLE]);
  assert.deepEqual(observations,[{stage:'deadline',reason:'timeout',exit:null,code:null,signal:null,childBefore:'live',childAfter:'live',handleOpened:true,handleClosed:true}]);
});

test('owned child exit during the single query is reported and its handle is still closed',()=>{
  const child=target(),{koffi,log}=mockKoffi({onRead:()=>{child.exitCode=9;}});const observations=[];
  assert.throws(()=>nativePeak({child,koffi,now:()=>0,onObservation:row=>observations.push(row)}),/^Error: app-owned-memory-target-exited$/);
  assert.equal(log.read.length,1);assert.deepEqual(log.close,[HANDLE]);assert.equal(observations[0].reason,'target-exited');
});

test('explicit access denial stays denied if the child then exits',()=>{
  const child=target(),{koffi,log}=mockKoffi({readResult:0,readError:5,onRead:()=>{child.exitCode=1;}});const observations=[];
  assert.throws(()=>nativePeak({child,koffi,now:()=>0,onObservation:row=>observations.push(row)}),/^Error: app-owned-memory-query-denied$/);
  assert.deepEqual(log.close,[HANDLE]);assert.equal(observations[0].reason,'denied');assert.equal(observations[0].childAfter,'exited');
});

test('read denial is not overwritten by a later failed close',()=>{
  const {koffi,log}=mockKoffi({readResult:0,readError:5,closeResult:0,closeError:6}),observations=[];
  assert.throws(()=>nativePeak({child:target(),koffi,now:()=>0,onObservation:row=>observations.push(row)}),/^Error: app-owned-memory-query-denied$/);
  assert.equal(log.read.length,1);assert.equal(log.close.length,1);assert.equal(observations[0].reason,'denied');
  assert.equal(observations[0].handleClosed,false);
});

test('dead or malformed targets and invalid inputs are rejected before loading a library',()=>{
  for(const child of [{pid:1234,exitCode:0},{pid:0,exitCode:null},{pid:'1234',exitCode:null},{pid:0x100000000,exitCode:null}]){
    const mock=mockKoffi(),observations=[];
    assert.throws(()=>nativePeak({child,koffi:mock.koffi,now:()=>0,onObservation:row=>observations.push(row)}));
    assert.equal(mock.log.loads.length,0);assert.equal(observations.length,1);
  }
  const mock=mockKoffi(),observations=[];
  assert.throws(()=>nativePeak({child:target(),koffi:null,now:()=>0,onObservation:row=>observations.push(row)}));
  assert.equal(mock.log.loads.length,0);assert.equal(observations.length,1);
});

test('invalid clock is rejected without opening the process',()=>{
  const {koffi,log}=mockKoffi();
  assert.throws(()=>nativePeak({child:target(),koffi,now:()=>NaN}),/^Error: app-owned-memory-query-unknown$/);
  assert.equal(log.loads.length,0);assert.equal(log.open.length,0);
});

test('invalid final clock is unknown rather than an invented timeout, and still closes',()=>{
  const {koffi,log}=mockKoffi();let calls=0;
  assert.throws(()=>nativePeak({child:target(),koffi,now:()=>++calls===1?5:4}),/^Error: app-owned-memory-query-unknown$/);
  assert.equal(log.close.length,1);
});
