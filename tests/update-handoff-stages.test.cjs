'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');
// Actual shipped PS orchestration; only process observations and guard are
// explicitly replaced in memory. This guard cannot execute any application.
const source=fs.readFileSync(path.join(__dirname,'../src/electronapp/enhanced/update-install-handoff.ps1'),'utf8');
const stub=`using System;using System.IO;
public sealed class ProbeModule {public string FileName {get{return "probe";}}}
public sealed class ProbeProcess:IDisposable {
 int id; public static ProbeProcess GetProcessById(int id){return new ProbeProcess{id=id};}
 public IntPtr Handle {get{return IntPtr.Zero;}} public ProbeModule MainModule {get{return new ProbeModule();}}
 public int ExitCode {get{return Environment.GetEnvironmentVariable("ETE_STAGE_CASE")==((id==11)?"client-nonzero":"host-nonzero")?7:0;}}
 public bool WaitForExit(int ms){return Environment.GetEnvironmentVariable("ETE_STAGE_CASE")!=((id==11)?"client-timeout":"host-timeout");}
 public void Dispose(){}
}
public sealed class EteUpdateGuard:IDisposable {
 public EteUpdateGuard(string a,string b,string c,string d,string e,bool f){}
 public void AcquireInstallation(string executable){} public void OpenOutcome(string a,string b){}
 public void Prepare(string a,string b,long c,string d,string e){}
 public void WriteOutcome(string s){File.AppendAllText(Environment.GetEnvironmentVariable("ETE_STAGE_TRACE"),s+"\\n");}
 public void OpenWizard(){if(Environment.GetEnvironmentVariable("ETE_STAGE_CASE")=="shell-failed")throw new Exception("PRIVATE_CANARY");WriteOutcome("marker-only");}
 public void Dispose(){}
}`;
for(const name of ['normal','client-timeout','host-timeout','client-nonzero','host-nonzero','shell-failed','cancelled'])test('PS handoff persists synthetic '+name+' without installer execution',()=>{
 const root=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'ete-stage-'))),trace=path.join(root,'trace');
 try{
  const command="$eteGuardSource=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('"+Buffer.from(stub).toString('base64')+"'))\n"+source.replaceAll('[Diagnostics.Process]','[ProbeProcess]');
  const record={mode:'install',outcome:{name:'synthetic',ino:'1'},root:'inert',rootIno:'1',rootDev:'1',directory:'inert',directoryIno:'1',parentPid:11,hostPid:22,mainExecutable:'probe',hostPath:'probe',name:'inert',ino:'1',size:1,sha256:'a'.repeat(64),zone:'synthetic'};
  const exe=process.platform==='win32'?path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'):'pwsh';
  const r=cp.spawnSync(exe,['-NoLogo','-NoProfile','-NonInteractive','-Command',command],{input:JSON.stringify(record)+'\ncommit\n'+(name==='cancelled'?'abort':'launch')+'\n',env:{...process.env,ETE_STAGE_CASE:name,ETE_STAGE_TRACE:trace},encoding:'utf8',timeout:15000,windowsHide:true});
  assert.ifError(r.error);assert.equal(r.status,name==='normal'?0:1,r.stderr);const stages=fs.readFileSync(trace,'utf8').trim().split('\n');
  assert.equal(stages.at(-1),name==='normal'?'marker-only':name);assert.equal(stages.includes('marker-only'),name==='normal');
  assert.equal(r.stdout.includes('ETE_INSTALL_RELEASED'),name!=='cancelled');assert.doesNotMatch(r.stdout+r.stderr,/PRIVATE_CANARY/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
