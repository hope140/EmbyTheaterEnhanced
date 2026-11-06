'use strict';
// Run with the pinned Electron binary. Hidden synthetic service only; no user profile/server.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {app,BrowserWindow}=require('electron');
const {NativeHelperClient}=require('../src/electronapp/native-helper/controller');
const {createNativeDiagnostics}=require('../src/electronapp/enhanced/native-diagnostics');
const {decimalWindowHandle,EXPECTED_LIBMPV_VERSION}=require('../src/electronapp/native-helper/service');
const [helperPath,libmpvPath,outputPath,profileRoot]=process.argv.slice(2);
if(![helperPath,libmpvPath,outputPath,profileRoot].every(v=>v&&path.isAbsolute(v)))throw Error('absolute-smoke-paths-required');
if(fs.existsSync(outputPath)||fs.existsSync(profileRoot))throw Error('fresh-smoke-output-required');
fs.mkdirSync(profileRoot,{recursive:true});app.setPath('userData',profileRoot);app.setPath('sessionData',profileRoot);
const canary='ETE_HELPER_NETWORK_CANARY';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(predicate,ms,reason){const end=Date.now()+ms;while(Date.now()<end){if(predicate())return;await wait(10);}throw Error(reason);}
let client,host,server,failed=false;const records=[],events=[];let leaked=false,wireTail='',stderrBytes=0;
const observe=createNativeDiagnostics(row=>records.push(row));
const wav=Buffer.alloc(44+96000*3);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(48000,24);wav.writeUInt32LE(96000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
const result={scope:'full-production-helper-hidden-loopback',passed:false};
app.whenReady().then(async()=>{
    let requests=0;
    server=http.createServer((req,res)=>{requests++;if(req.url.startsWith('/denied')){res.writeHead(403,{'Set-Cookie':canary,'X-Private':canary});res.end(canary);}else{res.writeHead(200,{'Content-Type':'audio/wav','Content-Length':wav.length});res.end(wav);}});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
    host=new BrowserWindow({show:false,focusable:false,width:320,height:180,frame:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
    client=new NativeHelperClient({helperPath,libmpvPath,parentWindowHandle:decimalWindowHandle(host),expectedLibmpvVersion:EXPECTED_LIBMPV_VERSION,
        onDiagnostic:row=>observe({...row,helperRun:1}),onEvent:row=>events.push({name:row.name,generationId:row.generationId,value:row.value})});
    const startup=client.start();
    client.child.stdout.on('data',chunk=>{const text=wireTail+chunk.toString('utf8');if(text.includes(canary))leaked=true;wireTail=text.slice(-4096);});
    client.child.stderr.on('data',chunk=>{stderrBytes+=chunk.length;if(chunk.toString('utf8').includes(canary))leaked=true;});
    await startup;const helperPid=client.child.pid;
    const a=client.beginGeneration('play-1-1',['core-idle','pause','time-pos','duration']);
    client.setProperty('volume',0);client.load(['loadfile',base+'/denied?token='+canary]).promise.catch(()=>{});
    await until(()=>records.some(r=>r.category==='media-network'&&r.details.httpStatus===403),7000,'full-helper-http-observation-missing');
    const b=client.beginGeneration('play-2-2',['core-idle','pause','time-pos','duration']);
    client.setProperty('volume',0);await client.load(['loadfile',base+'/ok?signature='+canary]).promise;
    await until(()=>events.some(e=>e.generationId===b&&e.name==='core-idle'&&e.value===false),7000,'full-helper-core-playing-missing');
    client.setProperty('pause',true);if(await client.getProperty('pause',2000)!==true)throw Error('pause-control-failed');
    client.setProperty('volume',17);if(await client.getProperty('volume',2000)!==17)throw Error('volume-control-failed');
    client.setProperty('pause',false);if(await client.getProperty('pause',2000)!==false)throw Error('resume-control-failed');
    await client.stop();await client.kill();
    if(!client.exited||leaked||stderrBytes)throw Error('full-helper-cleanup-or-privacy-failed');
    const network=records.filter(r=>r.category==='media-network');
    if(network.some(r=>r.event==='engine-observation'&&(r.details.generationId!==null||r.details.association!=='helper-only')))throw Error('network-generation-claim');
    if(JSON.stringify(records).includes(canary))throw Error('diagnostic-secret-retained');
    Object.assign(result,{passed:true,helperPid,helperExited:client.exited,hostWasVisible:host.isVisible(),requests,
        generations:[a,b],http403ReachedParentDiagnostics:true,corePlaying:true,pauseResumeVolume:true,stderrBytes,
        stdoutCanaryAbsent:!leaked,networkObservations:network.map(r=>r.details)});
}).catch(error=>{failed=true;result.failure=String(error?.message||'smoke-failed').replace(/https?:\/\/\S+/g,'[omitted]').slice(0,150);}).finally(async()=>{
    try{if(client&&!client.exited)await client.kill();}catch(_){failed=true;result.cleanupFailure=true;}
    if(host&&!host.isDestroyed())host.destroy();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
    fs.writeFileSync(outputPath,JSON.stringify(result,null,2)+'\n',{flag:'wx'});app.exit(failed?1:0);
});
