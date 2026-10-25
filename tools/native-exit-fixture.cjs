'use strict';
// Test stimulus only, loaded through the installed application's existing scripts loader.
// Never replaces main/preload, changes launch arguments, or creates a second player.
const fs=require('node:fs'),path=require('node:path');
function clip() {
    const frame=Buffer.concat([Buffer.from('FRAME\n'),Buffer.alloc(32*18,90),Buffer.alloc(16*9,54),Buffer.alloc(16*9,240)]);
    return Buffer.concat([Buffer.from('YUV4MPEG2 W32 H18 F2:1 Ip A1:1 C420jpeg\n'),...Array(120).fill(frame)]);
}
function build(configuration) {
    for(const key of ['config','report','clip'])if(typeof configuration[key]!=='string'||!path.isAbsolute(configuration[key]))throw Error('ABSOLUTE_FIXTURE_PATH_REQUIRED');
    return `define([],function(){'use strict';
const paths=${JSON.stringify(configuration)},fs=window.fs,ipc=window.ipc;
const configuration=JSON.parse(fs.readFileSync(paths.config,'utf8'));
const result={version:1,caseId:configuration.caseId,mode:configuration.mode,status:'running',stage:'await-appready',readyForClose:false,realNativePlayback:false,stopConfirmed:false,previewStateSent:false,queueSessionUi:'NOT_ASSESSED'};
let endpointId=null,generationId=null,sequence=1000000,sessionToken=null;
function write(){fs.writeFileSync(paths.report+'.tmp',JSON.stringify(result));fs.renameSync(paths.report+'.tmp',paths.report);}
function requireValue(value,code){if(!value)throw Error(code);}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function call(operation,payload={}){const value=await ipc.invoke('enhanced-native-helper-call',{operation,payload,endpointId});if(value&&value.status==='error'){const known=['loadfile-shape-invalid','loadfile-options-invalid','loadfile-source-invalid','command-invalid','command-not-allowed','generation-superseded','stale-endpoint','stale-generation','native-helper-unavailable'];result.nativeErrorReason=known.includes(value.reason)?value.reason:'UNAVAILABLE';result.failedOperation=operation;}requireValue(value&&value.status!=='error','NATIVE_'+operation.toUpperCase().replace(/-/g,'_')+'_FAILED');return value;}
async function property(name,generation=generationId){return (await call('get-property',{name,generationId:generation})).value;}
function state(active,position){ipc.send('enhanced-windows-native-media-state',{version:4,nativeOwner:active?{endpointId,generationId}:null,playbackEpoch:1,active,paused:false,title:active?'Synthetic native exit check':'',mediaKey:active?'a'.repeat(64):'',mediaType:active?'Video':'',duration:60,position:active?Math.min(60,Math.max(0,position)):0,rate:1,sequence:++sequence,sessionToken,canPrevious:false,canNext:false});}
async function run(){
 write();requireValue(ipc&&fs,'PRELOAD_BRIDGE_MISSING');
 result.stage='native-create';write();const created=await call('create');endpointId=created.endpointId;
 requireValue(created.mode==='native-helper'&&typeof endpointId==='string','REAL_NATIVE_ENDPOINT_REQUIRED');
 result.helperVersion=created.helperVersion;result.libmpvVersion=created.libmpvVersion;
 result.stage='begin-generation';write();generationId=(await call('begin-generation',{label:'synthetic-exit-check',requestEpoch:1000000})).generationId;
 requireValue(Number.isSafeInteger(generationId)&&generationId>0,'NATIVE_GENERATION_REQUIRED');
 result.stage='loadfile';write();await call('command',{data:['loadfile',paths.clip],generationId});
 ipc.send('enhanced-native-helper-notify',{operation:'set-visible',payload:{visible:true,generationId},endpointId});
 result.stage='await-decoded-playing';write();const deadline=Date.now()+20000;
 let position=null,params=null;
 while(Date.now()<deadline){position=await property('time-pos');params=await property('video-out-params');if(typeof position==='number'&&position>0.1&&params&&params.w===32&&params.h===18)break;await sleep(150);}
 requireValue(typeof position==='number'&&position>0.1&&params&&params.w===32&&params.h===18,'DECODED_VIDEO_NOT_CONFIRMED');
 result.realNativePlayback=true;result.position=position;result.width=params.w;result.height=params.h;
 sessionToken=(await ipc.invoke('enhanced-windows-native-media-session')).token;
 requireValue(typeof sessionToken==='string','NATIVE_MEDIA_SESSION_REQUIRED');state(true,position);result.previewStateSent=true;write();
 await sleep(1400);
 if(configuration.mode==='stop-close'){
  result.stage='stop';write();await call('command',{data:'stop',generationId});
  const deadline=Date.now()+5000;let idle=false;
  while(Date.now()<deadline){idle=await property('core-idle',null);if(idle===true)break;await sleep(100);}
  requireValue(idle===true,'STOP_NOT_CONFIRMED');result.stopConfirmed=true;state(false,0);
 }
 result.status='ready';result.stage='await-os-window-close';result.readyForClose=true;write();
}
write();
new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('APP_READY_EVENT_TIMEOUT')),30000);document.addEventListener('appready',()=>{clearTimeout(timer);resolve();},{once:true});}).then(run).catch(error=>{result.status='failed';result.stage=result.stage||'unknown';result.errorCode=typeof error.message==='string'&&/^[A-Z_]{1,100}$/.test(error.message)?error.message:'FIXTURE_FAILED';try{write();}catch(_){};});
return {};
});\n`;
}
module.exports={clip,build};
if(require.main===module){const [config,report,media,out]=process.argv.slice(2);fs.writeFileSync(out,build({config,report,clip:media}),{flag:'wx'});fs.writeFileSync(media,clip(),{flag:'wx'});}
