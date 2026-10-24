'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const {runChild,readOwnerReport,readHandshakeReport,preserveOwnerStages}=require('../tools/windows-native-preview-process.cjs');
const commit='a'.repeat(40);
function fixture(t){const directory=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'ete-preview process ')));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));return directory;}
function nativeExit(){return {policy:'owned-shutdown-v1',requested:true,exited:true,streamsClosed:true,code:0,signal:null,errorPresent:false,protocolFailure:null,unexpectedTerminal:false,terminalErrors:[],controllerTermination:{attempted:false,succeeded:false,signal:null,error:null},kind:'graceful'};}
function records(){return [{event:'begin',sourceCommit:commit,scope:'production-helper-owner-snapshot'},{event:'end',scope:'production-helper-owner-snapshot',result:'PASS',ownedExitConfirmed:true,nativeExitAccepted:true,nativeExit:nativeExit(),visibleDwmAcceptance:'NOT_ASSESSED'}];}
test('acceptance waits for actual close and captures late stdout/stderr before reading a delayed report',async t=>{
 const directory=fixture(t),file=path.join(directory,'owner-probe.jsonl');
 const script=`const fs=require('node:fs');console.log('started');setTimeout(()=>{fs.writeFileSync(process.argv[1],${JSON.stringify(records().map(row=>JSON.stringify(row)).join('\n'))});console.log('late stdout');console.error('late stderr');},120);`;
 const result=await runChild(process.execPath,['-e',script,file],{directory,name:'late'});
 assert.equal(result.closed,true);assert.equal(result.exitCode,0);assert.equal(readOwnerReport(directory,commit).result,'PASS');
 assert.equal(result.executable,process.execPath);assert.deepEqual(result.argv,['-e',script,file]);assert.equal(result.mode,'gui');
 assert.match(fs.readFileSync(path.join(directory,'late.stdout.log'),'utf8'),/late stdout/);assert.match(fs.readFileSync(path.join(directory,'late.stderr.log'),'utf8'),/late stderr/);
});
test('failure diagnostics retain only the bounded owner stage report, never its media or profile',t=>{
 const directory=fixture(t),output=path.join(directory,'owner'),diagnostics=path.join(directory,'diagnostics');fs.mkdirSync(output);fs.mkdirSync(diagnostics);
 assert.equal(preserveOwnerStages(output,diagnostics),false);
 const body=JSON.stringify({event:'begin',sourceCommit:commit})+'\n';fs.writeFileSync(path.join(output,'owner-probe.jsonl'),body);fs.writeFileSync(path.join(output,'A.y4m'),'synthetic');fs.mkdirSync(path.join(output,'userData'));
 assert.equal(preserveOwnerStages(output,diagnostics),true);assert.deepEqual(fs.readdirSync(diagnostics),['owner-stages.jsonl']);assert.equal(fs.readFileSync(path.join(diagnostics,'owner-stages.jsonl'),'utf8'),body);
});
test('an early PASS file cannot mask a later nonzero process exit',async t=>{
 const directory=fixture(t),file=path.join(directory,'owner-probe.jsonl');
 const script=`require('node:fs').writeFileSync(process.argv[1],${JSON.stringify(records().map(row=>JSON.stringify(row)).join('\n'))});setTimeout(()=>{console.error('late failure');process.exit(7);},100);`;
 await assert.rejects(runChild(process.execPath,['-e',script,file],{directory,name:'failed'}),error=>error.code==='TRIAL_CHILD_FAILED'&&error.details.closed&&error.details.exitCode===7);
 assert.match(fs.readFileSync(path.join(directory,'failed.stderr.log'),'utf8'),/late failure/);
});
test('only the spawned process is terminated on timeout and the real close outcome is recorded',async t=>{
 const directory=fixture(t);
 await assert.rejects(runChild(process.execPath,['-e','setInterval(()=>{},1000)'],{directory,name:'timeout',timeoutMs:150}),error=>error.code==='TRIAL_CHILD_FAILED'&&error.details.timedOut===true&&error.details.closed===true);
 assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'timeout.process.json'))).timedOut,true);
});
test('spawn failure is diagnosed and cannot inherit a prior successful exit code',async t=>{
 const directory=fixture(t);await assert.rejects(runChild(path.join(directory,'missing.exe'),[],{directory,name:'missing'}),error=>error.code==='TRIAL_CHILD_FAILED'&&error.details.spawnError==='ENOENT');
});
test('reports require one matching begin and final PASS, confirmed helper exit, and no failure',t=>{
 const directory=fixture(t),file=path.join(directory,'owner-probe.jsonl');
 assert.throws(()=>readOwnerReport(directory,commit),/OWNER_REPORT_MISSING_AFTER_CLOSE/);
 for(const rows of [[...records(),{event:'failure'}],[records()[0]],records().map(row=>row.event==='end'?{...row,ownedExitConfirmed:false}:row),[{...records()[0],sourceCommit:'b'.repeat(40)},records()[1]]]){
  fs.writeFileSync(file,rows.map(row=>JSON.stringify(row)).join('\n'));assert.throws(()=>readOwnerReport(directory,commit),/OWNER_REPORT_NOT_ACCEPTED/);
 }
});
test('new owned-shutdown policy rejects Native errors, unowned signals and incomplete evidence despite PASS',t=>{
 const directory=fixture(t),file=path.join(directory,'owner-probe.jsonl');
 for(const change of [{code:20},{code:21},{code:22},{code:23},{code:0,signal:'SIGTERM'},{code:null,signal:'SIGTERM',kind:'controller-terminated'},{streamsClosed:false},{unexpectedTerminal:true},{errorPresent:true},{protocolFailure:'invalid-json'},{terminalErrors:['stdin-error']},{policy:'unknown'},{requested:false},{exited:false},{controllerTermination:{attempted:false,succeeded:false,signal:'SIGTERM',error:null}},null]){
  const rows=records();rows[1].nativeExit=change?{...nativeExit(),...change}:null;fs.writeFileSync(file,rows.map(row=>JSON.stringify(row)).join('\n'));
  assert.throws(()=>readOwnerReport(directory,commit),/OWNER_REPORT_NOT_ACCEPTED/);
 }
});
test('new policy accepts graceful EOF and separately proved controller SIGTERM escalation',t=>{
 const directory=fixture(t),file=path.join(directory,'owner-probe.jsonl');
 for(const value of [nativeExit(),{...nativeExit(),code:null,signal:'SIGTERM',kind:'controller-terminated',controllerTermination:{attempted:true,succeeded:true,signal:'SIGTERM',error:null}}]){
  const rows=records();rows[1].nativeExit=value;fs.writeFileSync(file,rows.map(row=>JSON.stringify(row)).join('\n'));assert.equal(readOwnerReport(directory,commit).result,'PASS');
 }
});
test('handshake-only receipt verifies the real ready contract and cannot satisfy owner acceptance',t=>{
 const directory=fixture(t),file=path.join(directory,'owner-probe.jsonl'),rows=records();
 for(const row of rows)row.scope='production-helper-handshake-only';
 Object.assign(rows[1],{handshakeVerified:true,snapshotAcceptance:'NOT_ASSESSED',handshake:{protocolVersion:1,libmpvVersion:require('../src/electronapp/native-helper/service').EXPECTED_LIBMPV_VERSION,mpvClientApiVersion:131077,surfaceAttached:true,capabilities:['private-inherited-pipe','native-child-hwnd','gpu-next','d3d11','generation-attribution','preview-snapshot-v1']}});
 fs.writeFileSync(file,rows.map(row=>JSON.stringify(row)).join('\n'));assert.equal(readHandshakeReport(directory,commit).handshakeVerified,true);assert.throws(()=>readOwnerReport(directory,commit),/OWNER_REPORT_NOT_ACCEPTED/);
 for(const change of [{protocolVersion:2},{libmpvVersion:'v0.41.0'},{mpvClientApiVersion:0},{surfaceAttached:false},{capabilities:'preview-snapshot-v1'},{capabilities:[]}]){
  const invalid=structuredClone(rows);Object.assign(invalid[1].handshake,change);fs.writeFileSync(file,invalid.map(row=>JSON.stringify(row)).join('\n'));assert.throws(()=>readHandshakeReport(directory,commit),/HANDSHAKE_REPORT_NOT_ACCEPTED/);
 }
 fs.writeFileSync(file,records().map(row=>JSON.stringify(row)).join('\n'));assert.throws(()=>readHandshakeReport(directory,commit),/OWNER_REPORT_NOT_ACCEPTED/);
});
test('Windows GUI-subsystem process is awaited using its actual exit rather than shell LASTEXITCODE',{skip:process.platform!=='win32'},async t=>{
 const directory=fixture(t),source=path.join(directory,'delayed.cs'),executable=path.join(directory,'delayed.exe'),file=path.join(directory,'gui-report.json');
 fs.writeFileSync(source,'using System; using System.IO; using System.Threading; class Program { static void Main(string[] args) { Thread.Sleep(250); File.WriteAllText(args[0], "completed"); Console.WriteLine("gui stdout"); Console.Error.WriteLine("gui stderr"); Environment.Exit(7); } }');
 const compiler=path.join(process.env.SystemRoot,'Microsoft.NET/Framework/v4.0.30319/csc.exe');
 cp.execFileSync(compiler,['/nologo','/target:winexe','/out:'+executable,source],{stdio:'pipe'});
 await assert.rejects(runChild(executable,[file],{directory,name:'gui'}),error=>error.details.closed&&error.details.exitCode===7);
 assert.equal(fs.readFileSync(file,'utf8'),'completed');
});


test('pacing child gets only fixed diagnostic presets and does not mutate the parent environment',async t=>{
 const directory=fixture(t),prior={profile:process.env.ETE_WINDOWS_PREVIEW_PROFILE,interval:process.env.ETE_WINDOWS_PREVIEW_INTERVAL_MS,baseline:process.env.ETE_WINDOWS_PREVIEW_BASELINE};
 const script="console.log(JSON.stringify([process.env.ETE_WINDOWS_PREVIEW_PROFILE,process.env.ETE_WINDOWS_PREVIEW_INTERVAL_MS,process.env.ETE_WINDOWS_PREVIEW_BASELINE||null]))";
 for(const preset of [1000,550]){
  await runChild(process.execPath,['-e',script],{directory,name:'preset-'+preset,previewPreset:preset});
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory,'preset-'+preset+'.stdout.log'))),['1',String(preset),preset===1000?'1':null]);
 }
 assert.deepEqual({profile:process.env.ETE_WINDOWS_PREVIEW_PROFILE,interval:process.env.ETE_WINDOWS_PREVIEW_INTERVAL_MS,baseline:process.env.ETE_WINDOWS_PREVIEW_BASELINE},prior);
 await assert.rejects(runChild(process.execPath,['-e',script],{directory,name:'invalid',previewPreset:500}),{code:'PREVIEW_PRESET_INVALID'});
 assert.equal(fs.existsSync(path.join(directory,'invalid.stdout.log')),false);
});
