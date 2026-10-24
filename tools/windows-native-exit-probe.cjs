'use strict';
// Lifecycle-only regression: real Electron BrowserWindow/WebContents/nativeImage;
// controlled SMTC/DWM/capture and IPC sender validation, no FFI or application UI.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createRequire}=require('node:module'),{EventEmitter}=require('node:events'),crypto=require('node:crypto');
const drain=()=>new Promise(resolve=>setImmediate(resolve));
const CASES=['playing-close','playing-destroy','stop-close','pending-startup','pending-frame','rejected-frame'];
function loadAdapter(file){
    const nativeRequire=createRequire(file),module={exports:{}};
    // Deliberate test seam: no renderer document, network, account or full app is
    // loaded. Production sender authentication remains covered by Node tests.
    const requireFixture=name=>name==='./renderer-boundary'?{isTrusted:(event,expected)=>event.sender===expected&&!expected.isDestroyed()}:nativeRequire(name);
    vm.runInThisContext('(function(require,module,exports){'+fs.readFileSync(file,'utf8')+'\n})',{filename:file})(requireFixture,module,module.exports);
    return module.exports;
}
async function run(electron,adapterFile,report){
    const {app,BrowserWindow,nativeImage}=electron,adapter=loadAdapter(adapterFile);
    const owner={endpointId:'12345678-1234-1234-1234-123456789abc',generationId:1},results=[];
    for(const name of CASES){
        report.stage=name;
        const window=new BrowserWindow({show:false,focusable:false,skipTaskbar:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
        const physicallyVisible=window.isVisible.bind(window);
        // Exercise a pending capture without ever showing/focusing the window.
        window.isVisible=()=>true;
        const webContents=window.webContents,ipc=new EventEmitter(),handlers=new Map();
        ipc.handle=(key,handler)=>handlers.set(key,handler);ipc.removeHandler=key=>handlers.delete(key);
        const keys=require(path.join(path.dirname(adapterFile),'windows-media-renderer'));
        let releases=0,thumbnailReleases=0,refreshes=0,updates=0,completeStartup,completeFrame,rejectFrame;
        const controller=adapter.attach({window,ipcMain:ipc,nativeImage,koffi:{},sendCommand(){assert.fail('unexpected command');},
            createBindings:()=>({}),createDwm:()=>({}),isPreviewOwner:()=>true,
            clock:{now:()=>0,setInterval:()=>1,clearInterval(){}},
            capturePreview:()=>new Promise((resolve,reject)=>{completeFrame=resolve;rejectFrame=reject;}),
            attachThumbnail:()=>({submitted:0,clear(){},refresh(){refreshes++;},dispose(){thumbnailReleases++;},requestedRecently:()=>true}),
            createSmtc:async()=>{const session={update(){updates++;},dispose(){releases++;}};
                return name==='pending-startup'?new Promise(resolve=>{completeStartup=()=>resolve(session);}):session;}});
        const event={sender:webContents},token=handlers.get(keys.NATIVE_SESSION_CHANNEL)(event).token;
        const state={version:3,nativeOwner:owner,playbackEpoch:1,active:true,paused:false,title:'Lifecycle fixture',mediaKey:'a'.repeat(64),mediaType:'Video',duration:1,position:0,rate:1,sequence:1,sessionToken:token};
        ipc.emit(keys.NATIVE_CHANNEL,event,state);await drain();
        assert.equal(typeof completeFrame,'function');
        if(!['pending-frame','rejected-frame'].includes(name)){completeFrame({owner,width:1,height:1,pixels:Buffer.from([1,2,3,255])});await drain();}
        if(name==='stop-close'){ipc.emit(keys.NATIVE_CHANNEL,event,{...state,active:false,paused:false,title:'',mediaKey:'',mediaType:'',duration:0,position:0,sequence:2});await drain();}
        assert.equal(physicallyVisible(),false);
        const closed=new Promise(resolve=>window.once('closed',resolve));
        if(name==='playing-destroy')window.destroy();else window.close();
        await closed;assert.equal(window.isDestroyed(),true);
        assert.throws(()=>window.webContents,/destroyed/i);
        const closing=controller.dispose();assert.equal(controller.dispose(),closing);
        let settled=false;closing.then(()=>{settled=true;});await drain();
        const pending=['pending-startup','pending-frame','rejected-frame'].includes(name);
        if(pending)assert.equal(settled,false);
        const before=refreshes;
        if(name==='pending-startup')completeStartup();
        if(name==='pending-frame')completeFrame({owner,width:1,height:1,pixels:Buffer.from([1,2,3,255])});
        if(name==='rejected-frame')rejectFrame(Error('fixture capture retired'));
        await closing;assert.equal(controller.dispose(),closing);assert.equal(releases,1);assert.equal(thumbnailReleases,1);
        assert.equal(handlers.size,0);assert.equal(ipc.listenerCount(keys.NATIVE_CHANNEL),0);
        assert.equal(webContents.listenerCount('did-start-navigation'),0);assert.equal(webContents.listenerCount('render-process-gone'),0);
        assert.equal(controller.previewImage(),null);assert.equal(refreshes,before);
        if(name==='pending-startup')assert.equal(updates,0);
        if(['pending-frame','rejected-frame'].includes(name))assert.equal(controller.status().captured,0);
        results.push({name,status:'passed',ownedResourcesReleased:true});
    }
    assert.equal(BrowserWindow.getAllWindows().length,0);
    return results;
}
async function main(){
    const electron=require('electron'),{app}=electron,args=process.argv.slice(2);
    if(args.length!==3||!path.isAbsolute(args[0])||!path.isAbsolute(args[1])||!path.isAbsolute(args[2]))throw Error('Explicit absolute adapter, new profile and report required');
    const [adapterFile,profile,output]=args;
    if(fs.existsSync(profile)||fs.existsSync(output))throw Error('Preserve existing lifecycle output');
    fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);
    app.on('window-all-closed',()=>{});
    const report={scope:'electron-window-lifecycle-only',status:'running',stage:'app-ready',electron:process.versions.electron,platform:process.platform,
        adapterSha256:crypto.createHash('sha256').update(fs.readFileSync(adapterFile)).digest('hex'),
        doubles:['SMTC','DWM','capture','capture-visibility','IPC-sender-validation'],visibleDwmAcceptance:'NOT_ASSESSED'};
    let finished=false;
    function finish(error){if(finished)return;finished=true;clearTimeout(timer);report.status=error?'failed':'passed';
        if(error)report.error={name:error.name,code:error.code||null,stage:report.stage};
        fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});app.exit(error?1:0);}
    process.once('uncaughtException',finish);process.once('unhandledRejection',finish);
    const timer=setTimeout(()=>finish(Error('Lifecycle timeout')),30000);
    try{await app.whenReady();report.cases=await run(electron,adapterFile,report);finish();}catch(error){finish(error);}
}
async function accept(executable,adapterFile,directory){
    executable=path.resolve(executable);adapterFile=path.resolve(adapterFile);directory=path.resolve(directory);
    if(fs.existsSync(directory))throw Error('Preserve existing lifecycle diagnostic');
    fs.mkdirSync(directory,{recursive:true});
    const output=path.join(directory,'lifecycle.json'),profile=path.join(require('node:os').tmpdir(),'ete-exit-'+crypto.randomUUID());
    await require('./windows-native-preview-process.cjs').runChild(executable,[__filename,adapterFile,profile,output],{directory,name:'lifecycle',timeoutMs:45000});
    const report=JSON.parse(fs.readFileSync(output,'utf8'));
    if(report.status!=='passed'||report.scope!=='electron-window-lifecycle-only'||report.electron!=='44.4.2'||
        report.adapterSha256!==crypto.createHash('sha256').update(fs.readFileSync(adapterFile)).digest('hex')||
        report.visibleDwmAcceptance!=='NOT_ASSESSED'||!Array.isArray(report.cases)||report.cases.length!==CASES.length||
        report.cases.some((row,index)=>row.name!==CASES[index]||row.status!=='passed'||row.ownedResourcesReleased!==true))throw Error('Lifecycle report not accepted');
    return report;
}
module.exports={loadAdapter,run,accept,CASES};
if(process.versions.electron&&process.type==='browser')main().catch(()=>{require('electron').app.exit(1);});
else if(require.main===module)accept(...process.argv.slice(2)).then(report=>console.log(JSON.stringify(report))).catch(()=>{console.error('ELECTRON_LIFECYCLE_FAILED');process.exitCode=1;});
