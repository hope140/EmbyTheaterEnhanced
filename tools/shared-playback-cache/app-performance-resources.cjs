'use strict';
const path=require('node:path'),{execFile}=require('node:child_process');
const execute=(file,args,options)=>new Promise((resolve,reject)=>execFile(file,args,options,(error,stdout,stderr)=>{
  if(error){error.stderr=stderr;reject(error);}else resolve(stdout);
}));
const ACCESS_DENIED_MARKER='ETE_ACCESS_DENIED';
const CHILD_STATE=Object.freeze({LIVE:'live',EXITED:'exited',UNKNOWN:'unknown'});
function childState(child){
  if(!child||!Number.isSafeInteger(child.pid)||child.pid<=0)return CHILD_STATE.UNKNOWN;
  return child.exitCode===null?CHILD_STATE.LIVE:CHILD_STATE.EXITED;
}
function observe(callback,stage,reason,details={}){
  if(typeof callback!=='function')return;
  const safeCode=['EACCES','EPERM','ETIMEDOUT','AccessDenied'].includes(details.code)?details.code:
    Number.isInteger(details.code)&&details.code>=0&&details.code<=255?'EXIT_'+details.code:null;
  const safeSignal=['SIGTERM','SIGKILL','SIGINT'].includes(details.signal)?details.signal:null;
  const record=Object.freeze({stage,reason,exit:Number.isInteger(details.exit)&&details.exit>=0&&details.exit<=255?details.exit:null,
    code:safeCode,signal:safeSignal,childBefore:details.childBefore||CHILD_STATE.UNKNOWN,
    childAfter:details.childAfter||CHILD_STATE.UNKNOWN});
  try{callback(record);}catch(_){}
}
function failureCode(reason){
  return reason==='target-exited'?'app-owned-memory-target-exited':
    reason==='denied'?'app-owned-memory-query-denied':
      reason==='timeout'?'app-owned-memory-query-timeout':
        reason==='unknown'?'app-owned-memory-query-unknown':'app-owned-memory-query-failed';
}
function classifyError(error){
  const code=error&&error.code, signal=error&&error.signal;
  if(code==='EACCES'||code==='EPERM'||code==='AccessDenied'||
    error&&typeof error.message==='string'&&error.message==='AccessDenied'||
    error&&typeof error.stderr==='string'&&error.stderr.includes(ACCESS_DENIED_MARKER))return 'denied';
  if(code==='ETIMEDOUT'||error&&error.killed===true&&['SIGTERM','SIGKILL'].includes(signal))return 'timeout';
  return 'unknown';
}
// Called once after timed operations, only for the actual still-live owned child.
// No process enumeration, elevation, permission change or retry is performed.
async function nativePeak({child,systemRoot,run=execute,onObservation}={}) {
  const before=childState(child);
  if(before!==CHILD_STATE.LIVE||typeof systemRoot!=='string'||!path.win32.isAbsolute(systemRoot)||/[\x00-\x1f]/.test(systemRoot)){
    const reason=before===CHILD_STATE.EXITED?'target-exited':'unknown';
    observe(onObservation,'target',reason,{childBefore:before,childAfter:before});
    throw Error(failureCode(reason));
  }
  const executable=path.win32.join(systemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
  const command='$ErrorActionPreference="Stop"; try { $p=Get-Process -Id '+child.pid+' -ErrorAction Stop; [Console]::Write([string]$p.PeakWorkingSet64) } catch { if ($_.Exception -is [System.UnauthorizedAccessException] -or $_.FullyQualifiedErrorId -like "*AccessDenied*") { [Console]::Error.Write("'+ACCESS_DENIED_MARKER+'"); exit 4 }; exit 3 }';
  let text;
  try{text=await run(executable,['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,timeout:3000,maxBuffer:1024,encoding:'utf8'});}
  catch(error){
    const reason=classifyError(error), after=childState(child);
    const finalReason=reason==='denied'?'denied':after===CHILD_STATE.EXITED?'target-exited':reason;
    observe(onObservation,'query',finalReason,{exit:error&&error.code,code:error&&error.code,signal:error&&error.signal,childBefore:before,childAfter:after});
    throw Error(failureCode(finalReason));
  }
  const after=childState(child);
  if(after!==CHILD_STATE.LIVE){
    const reason=after===CHILD_STATE.EXITED?'target-exited':'unknown';
    observe(onObservation,'result',reason,{childBefore:before,childAfter:after});
    throw Error(failureCode(reason));
  }
  if(!/^[1-9][0-9]{0,14}$/.test(String(text))){
    observe(onObservation,'result','unknown',{childBefore:before,childAfter:after});
    throw Error(failureCode('unknown'));
  }
  const bytes=Number(text);if(!Number.isSafeInteger(bytes)){
    observe(onObservation,'result','unknown',{childBefore:before,childAfter:after});
    throw Error(failureCode('unknown'));
  }
  observe(onObservation,'result','measured',{exit:0,childBefore:before,childAfter:after});
  return bytes;
}
module.exports={nativePeak};
