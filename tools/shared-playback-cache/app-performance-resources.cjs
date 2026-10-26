'use strict';
const path=require('node:path'),{execFile}=require('node:child_process');
const execute=(file,args,options)=>new Promise((resolve,reject)=>execFile(file,args,options,(error,stdout)=>error?reject(error):resolve(stdout)));
// Called once after timed operations, only for the actual still-live owned child.
// No process enumeration, elevation, permission change or retry is performed.
async function nativePeak({child,systemRoot,run=execute}) {
  if(!child||!Number.isSafeInteger(child.pid)||child.pid<=0||child.exitCode!==null||typeof systemRoot!=='string'||
    !path.win32.isAbsolute(systemRoot)||/[\x00-\x1f]/.test(systemRoot))throw Error('app-owned-memory-target');
  const executable=path.win32.join(systemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
  const command='$ErrorActionPreference="Stop"; try { $p=Get-Process -Id '+child.pid+' -ErrorAction Stop; [Console]::Write([string]$p.PeakWorkingSet64) } catch { exit 3 }';
  let text;try{text=await run(executable,['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,timeout:3000,maxBuffer:1024,encoding:'utf8'});}catch(_){throw Error('app-owned-memory-query-failed');}
  if(!/^[1-9][0-9]{0,14}$/.test(String(text)))throw Error('app-owned-memory-result');
  const bytes=Number(text);if(!Number.isSafeInteger(bytes))throw Error('app-owned-memory-result');return bytes;
}
module.exports={nativePeak};
