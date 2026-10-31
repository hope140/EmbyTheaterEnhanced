'use strict';
// Actual accept() + actual OS processes; the child report is an explicit
// synthetic fixture. This is not Electron/Windows/DWM acceptance evidence.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {runChild}=require('../tools/owned-probe-process.cjs');
const entry=path.resolve(__dirname,'../tools/windows-native-exit-probe.cjs'),adapter=path.resolve(__dirname,'../src/electronapp/enhanced/windows-native-media.js');
function temporary(t){const dir=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'ete-exit-accept-')));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function controlledAccept(t,mode){
 const directory=temporary(t),output=path.join(directory,'acceptance'),hook=path.join(directory,'synthetic-child.cjs');
 fs.writeFileSync(hook,`'use strict';
if(process.argv[1]===${JSON.stringify(entry)}){
 const fs=require('node:fs'),crypto=require('node:crypto'),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
 const mode=process.env.ETE_ACCEPT_FIXTURE_MODE,output=process.argv[4];
 const owner={baseline:1,ownedAttached:1,ownedRemaining:0,totalRemaining:1,externalPreserved:true};
 const cases=['playing-close','playing-destroy','stop-close','pending-startup','pending-frame','rejected-frame'].map(name=>({name,status:'passed',ownedResourcesReleased:true,listenerOwnership:{navigation:{...owner},crash:{...owner}}}));
 const report={reportVersion:3,listenerContract:'owned-listeners-v1',status:'passed',scope:'electron-window-lifecycle-only',electron:'44.5.0',toolSha256:hash(process.argv[1]),adapterSha256:hash(process.argv[2]),visibleDwmAcceptance:'NOT_ASSESSED',cases};
 if(mode==='bad-hash')report.adapterSha256='0'.repeat(64);
 if(mode==='owned-leak')report.cases[0].listenerOwnership.crash.ownedRemaining=1;
 process.stdout.write('early-fixture-output\\n');
 // Exit this controlled fixture before Node evaluates the real CLI module.
 Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,75);
 if(mode!=='missing-report')fs.writeFileSync(output,JSON.stringify(report));
 fs.writeSync(1,'late-fixture-output\\n');fs.writeSync(2,'fixture-stderr\\n');process.exit(mode==='nonzero'?7:0);
}
`);
 const code=`const p=require(${JSON.stringify(entry)});p.accept(process.execPath,${JSON.stringify(adapter)},${JSON.stringify(output)}).then(r=>console.log(JSON.stringify({status:'accepted-synthetic-fixture',cases:r.cases.length})),e=>{console.log(JSON.stringify({status:'rejected',code:e.code||null,message:e.message}));process.exitCode=1;});`;
 const result=cp.spawnSync(process.execPath,['-e',code],{encoding:'utf8',timeout:10000,env:{...process.env,NODE_OPTIONS:'--require='+JSON.stringify(hook),ETE_ACCEPT_FIXTURE_MODE:mode,ELECTRON_RUN_AS_NODE:'1'}});
 assert.equal(result.error,undefined,result.error?.message);const summary=JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));return {directory,output,result,summary};
}
test('accept entry reaches the neutral process boundary, waits for actual close and then validates a late synthetic report',t=>{
 const f=controlledAccept(t,'valid');assert.equal(f.result.status,0,f.result.stderr);assert.equal(f.summary.cases,6);
 const record=JSON.parse(fs.readFileSync(path.join(f.output,'lifecycle.process.json')));assert.equal(record.closed,true);assert.equal(record.exitCode,0);assert.equal(record.timedOut,false);
 assert.ok(fs.readFileSync(path.join(f.output,'lifecycle.stdout.log'),'utf8').includes('late-fixture-output'));assert.ok(fs.readFileSync(path.join(f.output,'lifecycle.stderr.log'),'utf8').includes('fixture-stderr'));
});
for(const mode of ['nonzero','missing-report','bad-hash','owned-leak'])test('actual accept entry rejects '+mode+' despite a child producing output',t=>{
 const f=controlledAccept(t,mode);assert.equal(f.result.status,1);assert.equal(f.summary.status,'rejected');assert.notEqual(f.summary.code,'MODULE_NOT_FOUND');
 if(mode==='nonzero')assert.equal(f.summary.code,'TRIAL_CHILD_FAILED');
 if(mode==='bad-hash'||mode==='owned-leak')assert.equal(f.summary.message,'Lifecycle report not accepted');
});
test('neutral process boundary preserves accepted timeout/spawn/output rejection without trial dependencies',async t=>{
 const dir=temporary(t);
 await assert.rejects(runChild(process.execPath,['-e',"setInterval(()=>{},1000)"],{directory:dir,name:'timeout',timeoutMs:200}),{code:'TRIAL_CHILD_FAILED'});
 const timeout=JSON.parse(fs.readFileSync(path.join(dir,'timeout.process.json')));assert.equal(timeout.timedOut,true);assert.equal(timeout.closed,true);
 await assert.rejects(runChild(path.join(dir,'missing-executable'),[],{directory:dir,name:'missing',timeoutMs:1000}),{code:'TRIAL_CHILD_FAILED'});
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'missing.process.json'))).spawnError,'ENOENT');
 await assert.rejects(runChild(process.execPath,['-e',"process.stdout.write(Buffer.alloc(8*1024*1024+1))"],{directory:dir,name:'limit'}),{code:'TRIAL_CHILD_FAILED'});
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'limit.process.json'))).outputLimit,true);assert.equal(fs.statSync(path.join(dir,'limit.stdout.log')).size,8*1024*1024);
});
test('canonical LF contract body stays byte-identical to accepted old10; the actual dependency resolves without importing trial assembly',()=>{
 const source=fs.readFileSync(require.resolve('../tools/owned-probe-process.cjs'),'utf8');
 for(const checkout of [source,source.replace(/(?<!\r)\n/g,'\r\n')]){
  const canonical=checkout.replace(/\r\n/g,'\n'),body=canonical.slice(canonical.indexOf('function failure(code)'),canonical.indexOf('module.exports={runChild};'));
  assert.equal(crypto.createHash('sha256').update(body).digest('hex'),'618864fe0db024cc65ebb9a7e7f59ba8428ec75b32941088b7649a50d6e5d4d4');
 }
 assert.doesNotMatch(source,/native-preview|previewPreset|550|readOwnerReport|acceptsNativeExit/);
 assert.match(fs.readFileSync(entry,'utf8'),/require\('\.\/owned-probe-process.cjs'\)\.runChild/);
});
