'use strict';
const cp=require('node:child_process');
const stages=new Set(['compile','projection','loader-missing','loader-present','http-401','http-403','http-404','http-500','http-206','redirect','forged','truncated','reset','connect','tls-keygen','tls','cancel']);
function run(exe,args,options={},execute=cp.execFile){
    const {stage:requested,...childOptions}=options,stage=stages.has(requested)?requested:'unknown';
    return new Promise((resolve,reject)=>execute(exe,args,{windowsHide:true,timeout:20000,...childOptions},(error,stdout,stderr)=>{
        if(!error)return resolve({stdout,stderr});
        const exit=Number.isSafeInteger(error.code)?String(error.code):'unknown';
        const spawn=['ENOENT','EACCES','EPERM','ETIMEDOUT'].includes(error.code)?error.code:'unknown';
        const signal=['SIGTERM','SIGKILL','SIGABRT'].includes(error.signal)?error.signal:'unknown';
        // Never retain raw message, command, arguments or child output in an error.
        reject(Error(`native-network-test-${stage}-failed:exit=${exit},spawn=${spawn},signal=${signal},killed=${error.killed===true}`));
    }));
}
module.exports={run};
