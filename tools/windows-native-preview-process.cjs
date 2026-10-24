'use strict';
// Explicit process ownership for test acceptance, not a product launcher.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const check=require('./templates/native-preview/verify.cjs');
function failure(code){const error=Error(code);error.code=code;return error;}
async function runChild(executable,args,{directory,name,nodeMode=false,timeoutMs=60000,closeMs=5000}={}){
    const env={...process.env};if(nodeMode)env.ELECTRON_RUN_AS_NODE='1';else delete env.ELECTRON_RUN_AS_NODE;
    const streams=['stdout','stderr'].map(kind=>fs.openSync(path.join(directory,name+'.'+kind+'.log'),'wx'));
    const record={stage:name,started:false,startedAt:null,pid:null,exitCode:null,signal:null,exitedAt:null,closed:false,closedAt:null,timedOut:false,outputLimit:false,spawnError:null,bytes:{stdout:0,stderr:0}};
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
function readOwnerReport(directory,commit){
    const file=path.join(directory,'owner-probe.jsonl');if(!fs.existsSync(file))throw failure('OWNER_REPORT_MISSING_AFTER_CLOSE');
    const bytes=fs.readFileSync(file);if(bytes.length>1024*1024)throw failure('OWNER_REPORT_LIMIT');
    const rows=bytes.toString().trim().split(/\r?\n/).map(line=>JSON.parse(line)),begin=rows.filter(row=>row.event==='begin'),end=rows.filter(row=>row.event==='end');
    if(begin.length!==1||begin[0].sourceCommit!==commit||end.length!==1||rows.at(-1)!==end[0]||end[0].result!=='PASS'||end[0].ownedExitConfirmed!==true||end[0].visibleDwmAcceptance!=='NOT_ASSESSED'||rows.some(row=>row.event==='failure'))throw failure('OWNER_REPORT_NOT_ACCEPTED');
    return end[0];
}
async function accept(runtime,ownerOutput,commit,directory){
    runtime=path.resolve(runtime);ownerOutput=path.resolve(ownerOutput);directory=path.resolve(directory);
    for(const target of [ownerOutput,directory]){
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
        stage='owner';
        try{await runChild(electron,[path.join(runtime,'trial/owner-probe.cjs'),runtime,ownerOutput,commit],{directory,name:stage,timeoutMs:90000});}
        finally{snapshot('after-owner');}
        check.verify(runtime,commit,{loadNative:false});
        const owner=readOwnerReport(ownerOutput,commit);
        fs.writeFileSync(path.join(directory,'acceptance.json'),JSON.stringify({status:'passed',sourceCommit:commit,selfcheck:receipt,owner,visibleDwmAcceptance:'NOT_ASSESSED'},null,2)+'\n',{flag:'wx'});
        return receipt;
    }catch(error){
        const record={status:'failed',stage,code:error.code||'TRIAL_ACCEPTANCE_FAILED',message:error.message,details:error.details||null};
        fs.writeFileSync(path.join(directory,'failure.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});throw error;
    }
}
module.exports={runChild,readOwnerReport,accept};
if(require.main===module)accept(...process.argv.slice(2)).then(receipt=>console.log(JSON.stringify(receipt))).catch(error=>{console.error(JSON.stringify({code:error.code||'TRIAL_ACCEPTANCE_FAILED',details:error.details||null}));process.exitCode=1;});
