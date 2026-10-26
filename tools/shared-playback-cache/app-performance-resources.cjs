'use strict';
const {performance}=require('node:perf_hooks');
const PROCESS_QUERY_LIMITED_INFORMATION=0x1000;
const MEMORY_COUNTERS_BYTES=72;
const MEMORY_COUNTERS_PEAK_WORKING_SET_OFFSET=8;
const ACCEPT_MS=3000;
const CHILD_STATE=Object.freeze({LIVE:'live',EXITED:'exited',UNKNOWN:'unknown'});
function childState(child){
  if(!child||!Number.isSafeInteger(child.pid)||child.pid<=0||child.pid>0xffffffff)return CHILD_STATE.UNKNOWN;
  return child.exitCode===null?CHILD_STATE.LIVE:CHILD_STATE.EXITED;
}
function observe(callback,stage,reason,details={}){
  if(typeof callback!=='function')return;
  const code=Number.isInteger(details.code)&&details.code>=0&&details.code<=65535?'WIN32_'+details.code:null;
  const record=Object.freeze({stage,reason,exit:null,code,signal:null,
    childBefore:details.childBefore||CHILD_STATE.UNKNOWN,childAfter:details.childAfter||CHILD_STATE.UNKNOWN,
    handleOpened:details.handleOpened===true,handleClosed:details.handleClosed===true});
  try{callback(record);}catch(_){}
}
function failureCode(reason){
  return reason==='target-exited'?'app-owned-memory-target-exited':
    reason==='denied'?'app-owned-memory-query-denied':
      reason==='timeout'?'app-owned-memory-query-timeout':'app-owned-memory-query-unknown';
}
function isNullHandle(handle){return handle===null||handle===undefined||handle===0||handle===0n;}
function nativePeak({child,koffi,onObservation,now=()=>performance.now()}={}){
  const before=childState(child);
  if(before!==CHILD_STATE.LIVE||!koffi||typeof koffi.load!=='function'||typeof now!=='function'){
    const reason=before===CHILD_STATE.EXITED?'target-exited':'unknown';
    observe(onObservation,'target',reason,{childBefore:before,childAfter:before});
    throw Error(failureCode(reason));
  }
  let started;
  try{started=now();}catch(_){started=NaN;}
  if(!Number.isFinite(started)){
    observe(onObservation,'target','unknown',{childBefore:before,childAfter:childState(child)});
    throw Error(failureCode('unknown'));
  }

  let stage='load', win32Error=null, reason='unknown', handle=null, counters=null, peak=0,
    querySucceeded=false, closeSucceeded=true, denied=false, kernel=null, closeHandleFn=null, lastErrorFn=null;
  try{
    // Kernel32 is a Windows KnownDLL. This query opens only the validated owned PID and never enumerates processes.
    kernel=koffi.load('kernel32.dll');
    if(!kernel||typeof kernel.func!=='function')throw Error('binding-unavailable');
    const openProcess=kernel.func('void * __stdcall OpenProcess(uint32_t dwDesiredAccess, int bInheritHandle, uint32_t dwProcessId)');
    const getProcessMemoryInfo=kernel.func('int __stdcall K32GetProcessMemoryInfo(void *process, void *counters, uint32_t cb)');
    closeHandleFn=kernel.func('int __stdcall CloseHandle(void *object)');
    // Bind before the failing call: resolving a new function afterwards must
    // not clobber the thread's last-error state before it is read.
    lastErrorFn=kernel.func('uint32_t __stdcall GetLastError(void)');
    stage='open';
    handle=openProcess(PROCESS_QUERY_LIMITED_INFORMATION,0,child.pid);
    if(isNullHandle(handle)){
      win32Error=lastErrorFn(); denied=win32Error===5; reason=denied?'denied':'unknown';
    }else{
      counters=Buffer.alloc(MEMORY_COUNTERS_BYTES);
      counters.writeUInt32LE(MEMORY_COUNTERS_BYTES,0);
      stage='read';
      const result=getProcessMemoryInfo(handle,counters,MEMORY_COUNTERS_BYTES);
      if(!result){
        win32Error=lastErrorFn(); denied=win32Error===5; reason=denied?'denied':'unknown';
      }else if(counters.readUInt32LE(0)!==MEMORY_COUNTERS_BYTES){
        reason='unknown';
      }else{
        const peakBig=counters.readBigUInt64LE(MEMORY_COUNTERS_PEAK_WORKING_SET_OFFSET);
        if(peakBig>0n&&peakBig<=BigInt(Number.MAX_SAFE_INTEGER)){peak=Number(peakBig);querySucceeded=true;reason='measured';}
      }
    }
  }catch(_){reason='unknown';}
  finally{
    if(!isNullHandle(handle)){
      try{
        stage='close';
        closeSucceeded=!!closeHandleFn(handle);
        if(!closeSucceeded){
          // Do not overwrite an earlier access denial with cleanup failure.
          if(!denied){win32Error=lastErrorFn();denied=win32Error===5;} reason='unknown'; querySucceeded=false;
        }
      }catch(_){closeSucceeded=false;reason='unknown';querySucceeded=false;}
    }
  }

  let ended;
  try{ended=now();}catch(_){ended=NaN;}
  const after=childState(child);
  if(denied)reason='denied';
  // Synchronous FFI cannot be killed by a 3-second timer. This accepts a value
  // only within 3 seconds, closes the handle first, and relies on the outer
  // owned-worker deadline as the hard stop if the Win32 call itself stalls.
  if(reason!=='denied'&&after===CHILD_STATE.EXITED)reason='target-exited';
  else if(reason!=='denied'&&(after!==CHILD_STATE.LIVE||!Number.isFinite(ended)||ended<started))reason='unknown';
  else if(reason!=='denied'&&ended-started>=ACCEPT_MS)reason='timeout';
  else if(!closeSucceeded||!querySucceeded)reason=reason==='denied'?'denied':'unknown';
  const finalStage=reason==='timeout'?'deadline':stage;
  observe(onObservation,finalStage,reason,{code:win32Error,childBefore:before,childAfter:after,
    handleOpened:!isNullHandle(handle),handleClosed:!isNullHandle(handle)&&closeSucceeded});
  if(reason!=='measured')throw Error(failureCode(reason));
  return peak;
}
module.exports={nativePeak};
