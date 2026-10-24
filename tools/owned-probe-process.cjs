'use strict';
// Owned child wait/exit/output contract from the accepted one-second probe.
// A CI tool dependency only; no trial assembly or product startup behavior.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
function failure(code){const error=Error(code);error.code=code;return error;}
async function runChild(executable,args,{directory,name,nodeMode=false,timeoutMs=60000,closeMs=5000}={}){
    const env={...process.env};if(nodeMode)env.ELECTRON_RUN_AS_NODE='1';else delete env.ELECTRON_RUN_AS_NODE;
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
module.exports={runChild};
