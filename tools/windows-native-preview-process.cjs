'use strict';
// Explicit process ownership for test acceptance, not a product launcher.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const check=require('./templates/native-preview/verify.cjs');
const {acceptsNativeExit}=require('./templates/native-preview/exit-policy.cjs');
function failure(code){const error=Error(code);error.code=code;return error;}
async function runChild(executable,args,{directory,name,nodeMode=false,timeoutMs=60000,closeMs=5000,previewPreset=null}={}){
    const env={...process.env};if(nodeMode)env.ELECTRON_RUN_AS_NODE='1';else delete env.ELECTRON_RUN_AS_NODE;
    if(previewPreset!==null){if(![550,1000].includes(previewPreset))throw failure('PREVIEW_PRESET_INVALID');env.ETE_WINDOWS_PREVIEW_PROFILE='1';env.ETE_WINDOWS_PREVIEW_INTERVAL_MS=String(previewPreset);if(previewPreset===1000)env.ETE_WINDOWS_PREVIEW_BASELINE='1';else delete env.ETE_WINDOWS_PREVIEW_BASELINE;}
    const streams=['stdout','stderr'].map(kind=>fs.openSync(path.join(directory,name+'.'+kind+'.log'),'wx'));
    // These are only source-bound local probe arguments, never playback URLs,
    // account data or an existing user's profile.
    const record={stage:name,executable,argv:args.slice(),mode:nodeMode?'node':'gui',started:false,startedAt:null,pid:null,exitCode:null,signal:null,exitedAt:null,closed:false,closedAt:null,timedOut:false,outputLimit:false,spawnError:null,bytes:{stdout:0,stderr:0}};
    let child,timer,closeTimer;
    try{
        await new Promise((resolve,reject)=>{
            let settled=false;
            const finish=()=>{if(settled)return;settled=true;clearTimeout(timer);clearTimeout(closeTimer);resolve();};
            try{child=spawn(executable,args,{cwd:directory,env,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});}
            catch(error){record.spawnError=error.code||'SPAWN_FAILED';finish();return;}
            const terminate=()=>{
                if(closeTimer)return;
                try{child.kill();}catch(_){ }
                closeTimer=setTimeout(()=>{if(settled)return;child.stdout?.destroy();child.stderr?.destroy();child.unref();finish();},closeMs);
            };
            child.once('spawn',()=>{record.started=true;record.startedAt=new Date().toISOString();record.pid=child.pid;});
            child.once('error',error=>{record.spawnError=error.code||'SPAWN_FAILED';});
            for(const [index,kind]of ['stdout','stderr'].entries())child[kind].on('data',bytes=>{
                const prior=record.bytes[kind];record.bytes[kind]+=bytes.length;
                if(prior<8*1024*1024)fs.writeSync(streams[index],bytes.subarray(0,8*1024*1024-prior));
                if(!record.outputLimit&&record.bytes[kind]>8*1024*1024){record.outputLimit=true;terminate();}
            });
            child.once('exit',(code,signal)=>{record.exitCode=code;record.signal=signal;record.exitedAt=new Date().toISOString();});
            child.once('close',()=>{record.closed=true;record.closedAt=new Date().toISOString();finish();});
            timer=setTimeout(()=>{record.timedOut=true;terminate();},timeoutMs);
        });
    }finally{
        clearTimeout(timer);clearTimeout(closeTimer);for(const fd of streams)fs.closeSync(fd);
        fs.writeFileSync(path.join(directory,name+'.process.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});
    }
    if(record.spawnError||record.timedOut||record.outputLimit||!record.closed||record.exitCode!==0){const error=failure('TRIAL_CHILD_FAILED');error.details=record;throw error;}
    return record;
}
function readProbeReport(directory,commit,scope){
    const file=path.join(directory,'owner-probe.jsonl');if(!fs.existsSync(file))throw failure('OWNER_REPORT_MISSING_AFTER_CLOSE');
    const bytes=fs.readFileSync(file);if(bytes.length>1024*1024)throw failure('OWNER_REPORT_LIMIT');
    const rows=bytes.toString().trim().split(/\r?\n/).map(line=>JSON.parse(line)),begin=rows.filter(row=>row.event==='begin'),end=rows.filter(row=>row.event==='end');
    if(begin.length!==1||begin[0].sourceCommit!==commit||begin[0].scope!==scope||end.length!==1||rows.at(-1)!==end[0]||end[0].scope!==scope||end[0].result!=='PASS'||end[0].ownedExitConfirmed!==true||end[0].nativeExitAccepted!==true||!acceptsNativeExit(end[0].nativeExit)||end[0].visibleDwmAcceptance!=='NOT_ASSESSED'||rows.some(row=>row.event==='failure'))throw failure('OWNER_REPORT_NOT_ACCEPTED');
    return end[0];
}
function readOwnerReport(directory,commit){return readProbeReport(directory,commit,'production-helper-owner-snapshot');}
function readHandshakeReport(directory,commit){
    const end=readProbeReport(directory,commit,'production-helper-handshake-only'),baseline=require('../src/electronapp/native-helper/service');
    const handshake=end.handshake,required=['private-inherited-pipe','native-child-hwnd','gpu-next','d3d11','generation-attribution','preview-snapshot-v1'];
    if(end.handshakeVerified!==true||end.snapshotAcceptance!=='NOT_ASSESSED'||handshake?.protocolVersion!==1||handshake?.libmpvVersion!==baseline.EXPECTED_LIBMPV_VERSION||handshake?.mpvClientApiVersion!==131077||handshake?.surfaceAttached!==true||!Array.isArray(handshake.capabilities)||!required.every(value=>handshake.capabilities.includes(value)))throw failure('HANDSHAKE_REPORT_NOT_ACCEPTED');
    return end;
}
function preserveOwnerStages(ownerOutput,directory,name='owner-stages.jsonl'){
    if(!['owner-stages.jsonl','helper-startup-stages.jsonl'].includes(name))throw failure('STAGE_REPORT_NAME_INVALID');
    const file=path.join(ownerOutput,'owner-probe.jsonl');if(!fs.existsSync(file))return false;
    const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)throw failure('OWNER_STAGE_REPORT_NOT_PHYSICAL');
    fs.copyFileSync(file,path.join(directory,name),fs.constants.COPYFILE_EXCL);return true;
}
async function accept(runtime,ownerOutput,commit,directory){
    runtime=path.resolve(runtime);ownerOutput=path.resolve(ownerOutput);directory=path.resolve(directory);
    const startupOutput=ownerOutput+'-startup';
    for(const target of [ownerOutput,startupOutput,directory]){
        const relative=path.relative(runtime,target),parent=path.dirname(target);
        if(!relative||(!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative))||fs.realpathSync.native(parent).toLowerCase()!==parent.toLowerCase()||fs.existsSync(target))throw failure('NEW_EXTERNAL_PROBE_PATH_REQUIRED');
    }
    fs.mkdirSync(directory);
    let stage='extracted',before;
    const report=JSON.parse(fs.readFileSync(path.join(runtime,'native-preview-trial.json')));
    function snapshot(name){const actual=check.inventory(runtime);actual.delete('native-preview-trial.json');const result={stage:name,manifestDelta:check.difference(actual,report.files),previousDelta:before?check.difference(actual,[...before].map(([name,value])=>({path:name,...value}))):null,files:[...actual].map(([name,value])=>({path:name,...value}))};fs.writeFileSync(path.join(directory,name+'.inventory.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.error(JSON.stringify({event:'TRIAL_PHYSICAL_INVENTORY',stage:name,manifestDelta:result.manifestDelta,previousDelta:result.previousDelta}));before=actual;}
    try{
        snapshot(stage);check.verify(runtime,commit,{loadNative:false});
        const electron=path.join(runtime,'x64/electron/electron.exe');stage='selfcheck';
        try{await runChild(electron,[path.join(runtime,'trial/verify.cjs'),commit],{directory,name:stage,nodeMode:true,timeoutMs:45000});}
        finally{snapshot('after-selfcheck');}
        check.verify(runtime,commit,{loadNative:false});
        const receipt=JSON.parse(fs.readFileSync(path.join(directory,'selfcheck.stdout.log'),'utf8').trim());
        if(receipt.status!=='passed'||receipt.sourceCommit!==commit||receipt.ffiLoaded!==true||receipt.defaultEnabled!==false||receipt.standardPayloadUnchanged!==true)throw failure('SELFCHECK_RECEIPT_NOT_ACCEPTED');
        // Exercise the actual GUI/default_app -> ESM-imported CJS entry before
        // starting the full owner probe. Describing scope does not accept video.
        stage='entry-smoke';
        try{await runChild(electron,[path.join(runtime,'trial/owner-probe.cjs'),'--describe'],{directory,name:stage,timeoutMs:15000});}
        finally{snapshot('after-entry-smoke');}
        check.verify(runtime,commit,{loadNative:false});
        const entry=JSON.parse(fs.readFileSync(path.join(directory,'entry-smoke.stdout.log'),'utf8').trim());
        if(entry.electron!=='44.4.2'||entry.scope!=='production-helper-owner-snapshot'||entry.visibleDwmAcceptance!=='NOT_ASSESSED')throw failure('GUI_ENTRY_RECEIPT_NOT_ACCEPTED');
        stage='exit-lifecycle';
        const exitLifecycle=await require('./windows-native-exit-probe.cjs').accept(electron,path.join(runtime,'electronapp/enhanced/windows-native-media.js'),path.join(directory,'exit-lifecycle'));
        snapshot('after-exit-lifecycle');check.verify(runtime,commit,{loadNative:false});
        stage='helper-startup';
        try{await runChild(electron,[path.join(runtime,'trial/owner-probe.cjs'),runtime,startupOutput,commit,'--handshake-only'],{directory,name:stage,timeoutMs:45000});}
        finally{snapshot('after-helper-startup');preserveOwnerStages(startupOutput,directory,'helper-startup-stages.jsonl');}
        check.verify(runtime,commit,{loadNative:false});
        const helperStartup=readHandshakeReport(startupOutput,commit);
        stage='owner';
        try{await runChild(electron,[path.join(runtime,'trial/owner-probe.cjs'),runtime,ownerOutput,commit],{directory,name:stage,timeoutMs:90000});}
        finally{snapshot('after-owner');preserveOwnerStages(ownerOutput,directory);}
        check.verify(runtime,commit,{loadNative:false});
        const owner=readOwnerReport(ownerOutput,commit);
        fs.writeFileSync(path.join(directory,'acceptance.json'),JSON.stringify({status:'passed',sourceCommit:commit,selfcheck:receipt,guiEntry:entry,exitLifecycle,helperStartup,owner,visibleDwmAcceptance:'NOT_ASSESSED'},null,2)+'\n',{flag:'wx'});
        return receipt;
    }catch(error){
        const record={status:'failed',stage,code:error.code||'TRIAL_ACCEPTANCE_FAILED',message:error.message,details:error.details||null};
        fs.writeFileSync(path.join(directory,'failure.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});throw error;
    }
}
module.exports={readProbeReport,runChild,readOwnerReport,readHandshakeReport,preserveOwnerStages,accept};
if(require.main===module)accept(...process.argv.slice(2)).then(receipt=>console.log(JSON.stringify(receipt))).catch(error=>{console.error(JSON.stringify({code:error.code||'TRIAL_ACCEPTANCE_FAILED',details:error.details||null}));process.exitCode=1;});
