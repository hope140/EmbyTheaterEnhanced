'use strict';
// Compiles selected production exit methods into an isolated real WinForms test.
// This is source-level lifecycle evidence, not the complete Host or installer.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
function method(source,signature){
 const start=source.indexOf(signature);if(start<0)return null;
 const open=source.indexOf('{',start);let depth=0;
 for(let i=open;i<source.length;i++){if(source[i]==='{')depth++;else if(source[i]==='}'&&--depth===0)return source.slice(start,i+1);}
 throw Error('Unbalanced exit method');
}
function build(source){
 const signatures=['private static void InitializeExitDispatcher()','private static void OnExitIdle(object sender, EventArgs e)','private static void ExitWhenMessageLoopReady()','private static void RunApplicationLoop(ApplicationContext context)','public static void Exit()'];
 const parts=signatures.map(s=>method(source,s));if(!parts[4])throw Error('Production Exit missing');
 const fixed=parts.slice(0,4).some(Boolean);if(fixed&&parts.some(x=>!x))throw Error('Incomplete exit coordinator');
 const fields=fixed?'private static Dispatcher _exitDispatcher; private static int _exitRequested; private static int _exitLoopStarted;':'';
 const body=fields+'\n'+parts.filter(Boolean).join('\n')+'\ninternal static void InitializeForHarness(){'+(fixed?'InitializeExitDispatcher();':'')+'}\ninternal static void RunForHarness(ApplicationContext context){'+(fixed?'RunApplicationLoop(context);':'Application.Run(context);')+'}';
 return {fixed,methodSha256:crypto.createHash('sha256').update(body).digest('hex'),code:String.raw`
using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Windows.Forms;
using System.Windows.Threading;
namespace Emby.Theater {
static class Program { __BODY__ }
static class ExitHarness {
 static ManualResetEvent callbackDone=new ManualResetEvent(false);
 static Process child; static bool callbackError,watchdog,loopTick,loopReturned,exitOnMain=true;
 static int mainThread,callbackThread,exitCount; static string testCase;
 static string B(bool b){return b?"true":"false";}
 static void StartChild(){
  child=new Process {StartInfo=new ProcessStartInfo {FileName=Path.Combine(Environment.SystemDirectory,"cmd.exe"),Arguments="/c exit 0",UseShellExecute=false,CreateNoWindow=true},EnableRaisingEvents=true};
  child.Exited+=(s,e)=>{callbackThread=Thread.CurrentThread.ManagedThreadId;try{Program.Exit();if(testCase=="repeated-after-loop")Program.Exit();}catch{callbackError=true;}finally{callbackDone.Set();}};
  child.Start();
 }
 [STAThread] static int Main(string[] args){
  testCase=args[0];mainThread=Thread.CurrentThread.ManagedThreadId;Program.InitializeForHarness();
  Application.ApplicationExit+=(s,e)=>{exitCount++;exitOnMain &= Thread.CurrentThread.ManagedThreadId==mainThread;};
  bool early=testCase=="before-loop"||testCase=="before-loop-nested-pump";
  if(early){StartChild();if(!callbackDone.WaitOne(5000))return 7;}
  Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
  var dispatcher=Dispatcher.CurrentDispatcher;
  if(testCase=="before-loop-nested-pump"){
   var frame=new DispatcherFrame();dispatcher.BeginInvoke(DispatcherPriority.Background,new Action(()=>frame.Continue=false));Dispatcher.PushFrame(frame);
  }
  using(var start=new System.Windows.Forms.Timer {Interval=30})
  using(var deadline=new System.Windows.Forms.Timer {Interval=1500}){
   start.Tick+=(s,e)=>{start.Stop();loopTick=true;if(!early)StartChild();};
   deadline.Tick+=(s,e)=>{deadline.Stop();watchdog=true;Application.ExitThread();};
   start.Start();deadline.Start();Program.RunForHarness(new ApplicationContext());loopReturned=true;
  }
  bool observed=callbackDone.WaitOne(1000),childExited=child!=null&&child.WaitForExit(1000);
  int childCode=childExited?child.ExitCode:-1;
  bool normal=loopReturned&&!watchdog&&!callbackError&&observed&&childExited&&childCode==0;
  string report="{\"case\":\""+testCase+"\",\"normalLoopExit\":"+B(normal)+",\"watchdogCleanup\":"+B(watchdog)+",\"loopTickObserved\":"+B(loopTick)+",\"loopReturned\":"+B(loopReturned)+",\"callbackObserved\":"+B(observed)+",\"callbackOnWorker\":"+B(callbackThread!=mainThread)+",\"callbackError\":"+B(callbackError)+",\"applicationExitOnMain\":"+B(exitOnMain)+",\"applicationExitEvents\":"+exitCount+",\"childExited\":"+B(childExited)+",\"childExitCode\":"+childCode+"}";
  File.WriteAllText(args[1],report);if(child!=null)child.Dispose();return normal?0:3;
 }
}
}
`.replace('__BODY__',body)};
}
function emit(root,out){
 if(fs.existsSync(out))throw Error('Preserve harness output');fs.mkdirSync(out,{recursive:true});
 const file='native/windows-host/changes/Emby.Theater/Program.cs',rows=[];
 for(const [variant,ref]of [['baseline','abe1c7426f0c8d0b5d1f7febadd0d39fb9a80a1d'],['candidate','HEAD']]){
  const bytes=cp.execFileSync('git',['-C',root,'show',ref+':'+file]);const r=build(bytes.toString('utf8').replace(/^\uFEFF/,''));
  fs.writeFileSync(path.join(out,variant+'.cs'),r.code,{flag:'wx'});rows.push({variant,sourceCommit:cp.execFileSync('git',['-C',root,'rev-parse',ref],{encoding:'utf8'}).trim(),sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex'),methodSha256:r.methodSha256,fixed:r.fixed});
 }
 fs.writeFileSync(path.join(out,'source.json'),JSON.stringify({scope:'selected-production-exit-methods-real-framework-loop',variants:rows},null,2)+'\n',{flag:'wx'});return rows;
}
module.exports={method,build,emit};
if(require.main===module)try{console.log(JSON.stringify(emit(path.resolve(process.argv[2]),path.resolve(process.argv[3]))));}catch(_){console.error('HOST_EXIT_HARNESS_INPUT_FAILED');process.exitCode=1;}
