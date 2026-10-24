'use strict';
// Source-bound synthetic work counts, plus a real host CPU decoder benchmark.
// No Electron, FFI, helper, desktop/window capture, account, or network access.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{EventEmitter}=require('node:events');
const {pathToFileURL}=require('node:url'),{performance}=require('node:perf_hooks');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function workload(rootArg,scenario,options={}){
    const root=path.resolve(rootArg),appFile=path.join(root,'src/electronapp/enhanced/windows-native-media.js'),dwmFile=path.join(root,'native/windows-media/dwm.cjs');
    const adapter=require(appFile),{attachThumbnail}=require(dwmFile),keys=require(path.join(root,'src/electronapp/enhanced/windows-media-renderer'));
    const window=new EventEmitter(),web=new EventEmitter(),ipc=new EventEmitter(),handlers=new Map(),hooks=new Map(),pending=[];
    window.webContents=web;web.isDestroyed=()=>false;web.mainFrame={url:pathToFileURL(path.join(root,'src/electronapp/www/index.html')).href};
    window.isDestroyed=()=>false;window.isMinimized=()=>false;window.isVisible=()=>true;
    window.getNativeWindowHandle=()=>Buffer.from([4,0,0,0,0,0,0,0]);window.hookWindowMessage=(id,work)=>hooks.set(id,work);window.unhookWindowMessage=id=>hooks.delete(id);
    ipc.handle=(id,work)=>handlers.set(id,work);ipc.removeHandler=id=>handlers.delete(id);
    const counts={captures:0,nativeImages:0,resizes:0,invalidations:0,submissions:0};let now=0,timer,color=19;
    function image(width,height){return {isEmpty:()=>false,getSize:()=>({width,height}),resize(size){counts.resizes++;return image(size.width,size.height);}};}
    const packed=Buffer.alloc(8);packed.writeBigUInt64LE(BigInt(160<<16|100));
    const dwm={configure(){},clientSize:()=>({width:1200,height:800}),thumbnail(){counts.submissions++;},livePreview(){counts.submissions++;},invalidate(){
        counts.invalidations++;pending.push(()=>{for(let i=0;i<5;i++){hooks.get(0x323)?.(null,packed);hooks.get(0x326)?.();}});
    }};
    const owner={endpointId:'12345678-1234-1234-1234-123456789abc',generationId:1};
    const controller=adapter.attach({window,ipcMain:ipc,koffi:{},nativeImage:{createFromBitmap:(_pixels,size)=>{counts.nativeImages++;return image(size.width,size.height);}},
        previewSavings:options.savings,
        createBindings:()=>({}),createDwm:()=>dwm,attachThumbnail,sendCommand(){throw Error('unexpected synthetic command');},
        createSmtc:async()=>({update(){},dispose(){}}),isPreviewOwner:()=>true,capturePreview:async()=>{
            counts.captures++;const pixels=Buffer.alloc(160*90*4);for(let i=0;i<pixels.length;i+=4)pixels.set([color,67,213,255],i);return {owner,width:160,height:90,pixels};},
        clock:{now:()=>now,setInterval(work){timer=work;return 1;},clearInterval(){timer=null;}}});
    const event={sender:web,senderFrame:web.mainFrame},token=handlers.get(keys.NATIVE_SESSION_CHANNEL)(event).token;
    function send(sequence){ipc.emit(keys.NATIVE_CHANNEL,event,{version:4,nativeOwner:owner,canPrevious:false,canNext:false,playbackEpoch:1,
        active:true,paused:scenario==='paused',title:'Synthetic fixture',mediaKey:'a'.repeat(64),mediaType:'Video',duration:100,
        position:scenario==='paused'?1:now/1000,rate:1,sequence,sessionToken:token});}
    async function settle(){for(let pass=0;pass<8;pass++){for(const work of pending.splice(0))work();await new Promise(resolve=>setImmediate(resolve));if(!pending.length&&!controller.status().performance.inFlight)return;}throw Error('Synthetic work did not settle');}
    send(1);await settle();for(let i=1;i<=30;i++){now=i*1000;if(scenario==='moving')color=(19+i)%256;send(i+1);timer();await settle();}
    const data={scenario,content:'synthetic-160x90-bgra',window:{visible:true,minimized:false,width:1200,height:800},simulatedMs:now,
        wmRequestsPerInvalidation:10,savings:options.savings,counts:{...counts},counters:controller.status().performance.counters,
        adapterSha256:sha(appFile),dwmSha256:sha(dwmFile)};
    await controller.dispose();return data;
}
function decodeCpu(rootArg){
    const root=path.resolve(rootArg),file=path.join(root,'src/electronapp/native-helper/preview-snapshot.js'),{decode}=require(file);
    const payload={ready:true,generationId:1,format:'bgr24',width:160,height:90,pixels:Buffer.alloc(43200,67).toString('base64')};
    for(let i=0;i<100;i++)decode(payload,1);const times=[];
    for(let i=0;i<1000;i++){const begin=performance.now();if(!decode(payload,1))throw Error('Decoder rejected synthetic input');times.push(performance.now()-begin);}
    times.sort((a,b)=>a-b);return {sourceSha256:sha(file),samples:times.length,medianMs:times[500],p95Ms:times[950],maxMs:times.at(-1)};
}
module.exports={workload,decodeCpu};
if(require.main===module)(async()=>{
    if(process.argv.length!==4)throw Error('Provide instrumented baseline and candidate source roots');
    const result={scope:'synthetic-work-counts-and-host-decoder-only',platform:process.platform,node:process.versions.node,
        doesNotMeasure:['GPU/readback','real NativeImage resize','DWM presentation/FPS','Windows performance'],baseline:[],candidate:[]};
    for(const scenario of ['moving','static','paused']){result.baseline.push(await workload(process.argv[2],scenario,{savings:false}));result.candidate.push(await workload(process.argv[3],scenario,{savings:true}));}
    result.hostDecodeCpu=decodeCpu(process.argv[3]);console.log(JSON.stringify(result,null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
