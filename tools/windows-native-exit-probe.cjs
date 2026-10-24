'use strict';
// Lifecycle-only regression: real Electron BrowserWindow/WebContents/nativeImage;
// controlled SMTC/DWM/capture and IPC sender validation, no FFI or application UI.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createRequire}=require('node:module'),{EventEmitter}=require('node:events'),crypto=require('node:crypto');
const drain=()=>new Promise(resolve=>setImmediate(resolve));
const CASES=['playing-close','playing-destroy','stop-close','pending-startup','pending-frame','rejected-frame'];
const STEPS=new Set(['adapter-load','window-create','visibility-fixture','adapter-attach','state-send','capture-request-started',
    'initial-frame-resolve','stop-send','window-remains-hidden','window-close','await-closed','window-destroyed-after-closed',
    'closed-webcontents-getter-throws','dispose-begin','dispose-promise-shared','pending-drain-unsettled','late-work-resolve',
    'await-dispose','dispose-promise-stable','smtc-released-once','thumbnail-released-once','session-handler-removed',
    'state-listener-removed','navigation-listener-removed','crash-listener-removed','preview-retired','no-late-refresh',
    'no-late-session-update','no-late-pixels','no-windows-remain','unexpected-command','app-ready','lifecycle-timeout']);
const NODE_FRAMES=new Set(['node:assert','node:assert/strict','node:events','node:internal/assert/assertion_error',
    'node:internal/process/task_queues','node:internal/timers']);
function scalar(value){
    if(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
    if(typeof value==='string'&&['function','undefined','object','boolean','number'].includes(value))return value;
    if(value instanceof RegExp&&String(value)==='/destroyed/i')return '/destroyed/i';
    return {type:typeof value};
}
function projectError(error,report){
    const step=STEPS.has(error?.probeStep)?error.probeStep:STEPS.has(report.step)?report.step:null;
    const message=typeof error?.message==='string'?error.message:'';
    const result={name:['AssertionError','TypeError','Error','AggregateError'].includes(error?.name)?error.name:'Error',
        code:error?.code==='ERR_ASSERTION'?'ERR_ASSERTION':null,stage:CASES.includes(report.stage)?report.stage:null,step,
        message:step,messageSha256:crypto.createHash('sha256').update(message).digest('hex')};
    if(error?.code==='ERR_ASSERTION')result.assertion={
        operator:['strictEqual','deepStrictEqual','throws','fail'].includes(error.operator)?error.operator:null,
        actual:scalar(error.actual),expected:scalar(error.expected)};
    // Only our two source locations and Node builtins are retained. Never copy
    // absolute account/profile paths or arbitrary frames/messages into reports.
    result.stack=[];
    for(const line of String(error?.stack||'').split(/\r?\n/)){
        if(!/^\s+at /.test(line))continue;
        const match=line.match(/(?:[\\/])(tools[\\/]windows-native-exit-probe\.cjs|(?:src[\\/])?electronapp[\\/]enhanced[\\/]windows-native-media\.js):(\d+):(\d+)\)?$/)||
            line.match(/\b(node:[a-zA-Z0-9_./-]+):(\d+):(\d+)\)?$/);
        if(match&&(!match[1].startsWith('node:')||NODE_FRAMES.has(match[1]))){
            const file=match[1].replace(/\\/g,'/');
            result.stack.push({file:file.startsWith('electronapp/')?'src/'+file:file,line:Number(match[2]),column:Number(match[3])});
        }
        if(result.stack.length===8)break;
    }
    return result;
}
function loadAdapter(file){
    const nativeRequire=createRequire(file),module={exports:{}};
    // Deliberate test seam: no renderer document, network, account or full app is
    // loaded. Production sender authentication remains covered by Node tests.
    const requireFixture=name=>name==='./renderer-boundary'?{isTrusted:(event,expected)=>event.sender===expected&&!expected.isDestroyed()}:nativeRequire(name);
    vm.runInThisContext('(function(require,module,exports){'+fs.readFileSync(file,'utf8')+'\n})',{filename:file})(requireFixture,module,module.exports);
    return module.exports;
}
async function run(electron,adapterFile,report){
    report.step='adapter-load';
    const {app,BrowserWindow,nativeImage}=electron,adapter=loadAdapter(adapterFile);
    const owner={endpointId:'12345678-1234-1234-1234-123456789abc',generationId:1},results=[];
    report.cases=results;
    function check(step,operation){report.step=step;try{operation(step);}catch(error){error.probeStep=step;throw error;}}
    for(const name of CASES){
        report.stage=name;report.step='window-create';
        report.observations={closedEventObserved:false,destroyedDuringClosed:null,closeReturned:false,destroyedAfterCloseCall:null};
        report.listenerBaseline=null;
        const window=new BrowserWindow({show:false,focusable:false,skipTaskbar:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
        report.step='visibility-fixture';
        const physicallyVisible=window.isVisible.bind(window);
        // Exercise a pending capture without ever showing/focusing the window.
        window.isVisible=()=>true;
        const webContents=window.webContents,ipc=new EventEmitter(),handlers=new Map();
        report.listenerBaseline={navigation:webContents.listenerCount('did-start-navigation'),crash:webContents.listenerCount('render-process-gone')};
        ipc.handle=(key,handler)=>handlers.set(key,handler);ipc.removeHandler=key=>handlers.delete(key);
        const keys=require(path.join(path.dirname(adapterFile),'windows-media-renderer'));
        let releases=0,thumbnailReleases=0,refreshes=0,updates=0,completeStartup,completeFrame,rejectFrame;
        report.step='adapter-attach';
        const controller=adapter.attach({window,ipcMain:ipc,nativeImage,koffi:{},sendCommand(){check('unexpected-command',label=>assert.fail(label));},
            createBindings:()=>({}),createDwm:()=>({}),isPreviewOwner:()=>true,
            clock:{now:()=>0,setInterval:()=>1,clearInterval(){}},
            capturePreview:()=>new Promise((resolve,reject)=>{completeFrame=resolve;rejectFrame=reject;}),
            attachThumbnail:()=>({submitted:0,clear(){},refresh(){refreshes++;},dispose(){thumbnailReleases++;},requestedRecently:()=>true}),
            createSmtc:async()=>{const session={update(){updates++;},dispose(){releases++;}};
                return name==='pending-startup'?new Promise(resolve=>{completeStartup=()=>resolve(session);}):session;}});
        const event={sender:webContents},token=handlers.get(keys.NATIVE_SESSION_CHANNEL)(event).token;
        const state={version:4,canPrevious:false,canNext:false,nativeOwner:owner,playbackEpoch:1,active:true,paused:false,title:'Lifecycle fixture',mediaKey:'a'.repeat(64),mediaType:'Video',duration:1,position:0,rate:1,sequence:1,sessionToken:token};
        report.step='state-send';ipc.emit(keys.NATIVE_CHANNEL,event,state);await drain();
        check('capture-request-started',label=>assert.equal(typeof completeFrame,'function',label));
        if(!['pending-frame','rejected-frame'].includes(name)){report.step='initial-frame-resolve';completeFrame({owner,width:1,height:1,pixels:Buffer.from([1,2,3,255])});await drain();}
        if(name==='stop-close'){report.step='stop-send';ipc.emit(keys.NATIVE_CHANNEL,event,{...state,active:false,paused:false,title:'',mediaKey:'',mediaType:'',duration:0,position:0,sequence:2});await drain();}
        check('window-remains-hidden',label=>assert.equal(physicallyVisible(),false,label));
        const closed=new Promise(resolve=>window.once('closed',()=>{report.observations.closedEventObserved=true;report.observations.destroyedDuringClosed=window.isDestroyed();resolve();}));
        report.step='window-close';
        if(name==='playing-destroy')window.destroy();else window.close();
        report.observations.closeReturned=true;report.observations.destroyedAfterCloseCall=window.isDestroyed();
        report.step='await-closed';await closed;
        check('window-destroyed-after-closed',label=>assert.equal(window.isDestroyed(),true,label));
        check('closed-webcontents-getter-throws',label=>assert.throws(()=>window.webContents,/destroyed/i,label));
        report.step='dispose-begin';const closing=controller.dispose();
        check('dispose-promise-shared',label=>assert.equal(controller.dispose(),closing,label));
        let settled=false;closing.then(()=>{settled=true;});await drain();
        const pending=['pending-startup','pending-frame','rejected-frame'].includes(name);
        if(pending)check('pending-drain-unsettled',label=>assert.equal(settled,false,label));
        const before=refreshes;
        report.step='late-work-resolve';
        if(name==='pending-startup')completeStartup();
        if(name==='pending-frame')completeFrame({owner,width:1,height:1,pixels:Buffer.from([1,2,3,255])});
        if(name==='rejected-frame')rejectFrame(Error('fixture capture retired'));
        report.step='await-dispose';await closing;
        check('dispose-promise-stable',label=>assert.equal(controller.dispose(),closing,label));
        check('smtc-released-once',label=>assert.equal(releases,1,label));
        check('thumbnail-released-once',label=>assert.equal(thumbnailReleases,1,label));
        check('session-handler-removed',label=>assert.equal(handlers.size,0,label));
        check('state-listener-removed',label=>assert.equal(ipc.listenerCount(keys.NATIVE_CHANNEL),0,label));
        check('navigation-listener-removed',label=>assert.equal(webContents.listenerCount('did-start-navigation'),0,label));
        check('crash-listener-removed',label=>assert.equal(webContents.listenerCount('render-process-gone'),0,label));
        check('preview-retired',label=>assert.equal(controller.previewImage(),null,label));
        check('no-late-refresh',label=>assert.equal(refreshes,before,label));
        if(name==='pending-startup')check('no-late-session-update',label=>assert.equal(updates,0,label));
        if(['pending-frame','rejected-frame'].includes(name))check('no-late-pixels',label=>assert.equal(controller.status().captured,0,label));
        results.push({name,status:'passed',ownedResourcesReleased:true});
    }
    check('no-windows-remain',label=>assert.equal(BrowserWindow.getAllWindows().length,0,label));
    return results;
}
async function main(){
    const electron=require('electron'),{app}=electron,args=process.argv.slice(2);
    if(args.length!==3||!path.isAbsolute(args[0])||!path.isAbsolute(args[1])||!path.isAbsolute(args[2]))throw Error('Explicit absolute adapter, new profile and report required');
    const [adapterFile,profile,output]=args;
    if(fs.existsSync(profile)||fs.existsSync(output))throw Error('Preserve existing lifecycle output');
    fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);
    app.on('window-all-closed',()=>{});
    const report={reportVersion:2,scope:'electron-window-lifecycle-only',status:'running',stage:'app-ready',step:'app-ready',electron:process.versions.electron,platform:process.platform,
        toolSha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
        adapterSha256:crypto.createHash('sha256').update(fs.readFileSync(adapterFile)).digest('hex'),
        doubles:['SMTC','DWM','capture','capture-visibility','IPC-sender-validation'],visibleDwmAcceptance:'NOT_ASSESSED'};
    let finished=false;
    function finish(error){if(finished)return;finished=true;clearTimeout(timer);report.status=error?'failed':'passed';
        if(error)report.error=projectError(error,report);
        fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});app.exit(error?1:0);}
    process.once('uncaughtException',finish);process.once('unhandledRejection',finish);
    const timer=setTimeout(()=>{report.step='lifecycle-timeout';finish(Error('Lifecycle timeout'));},30000);
    try{await app.whenReady();report.cases=await run(electron,adapterFile,report);finish();}catch(error){finish(error);}
}
async function accept(executable,adapterFile,directory){
    executable=path.resolve(executable);adapterFile=path.resolve(adapterFile);directory=path.resolve(directory);
    if(fs.existsSync(directory))throw Error('Preserve existing lifecycle diagnostic');
    fs.mkdirSync(directory,{recursive:true});
    const output=path.join(directory,'lifecycle.json'),profile=path.join(require('node:os').tmpdir(),'ete-exit-'+crypto.randomUUID());
    await require('./windows-native-preview-process.cjs').runChild(executable,[__filename,adapterFile,profile,output],{directory,name:'lifecycle',timeoutMs:45000});
    const report=JSON.parse(fs.readFileSync(output,'utf8'));
    if(report.reportVersion!==2||report.status!=='passed'||report.scope!=='electron-window-lifecycle-only'||report.electron!=='44.4.2'||
        report.toolSha256!==crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')||
        report.adapterSha256!==crypto.createHash('sha256').update(fs.readFileSync(adapterFile)).digest('hex')||
        report.visibleDwmAcceptance!=='NOT_ASSESSED'||!Array.isArray(report.cases)||report.cases.length!==CASES.length||
        report.cases.some((row,index)=>row.name!==CASES[index]||row.status!=='passed'||row.ownedResourcesReleased!==true))throw Error('Lifecycle report not accepted');
    return report;
}
module.exports={loadAdapter,run,accept,projectError,CASES,STEPS};
if(process.versions.electron&&process.type==='browser')main().catch(()=>{require('electron').app.exit(1);});
else if(require.main===module)accept(...process.argv.slice(2)).then(report=>console.log(JSON.stringify(report))).catch(()=>{console.error('ELECTRON_LIFECYCLE_FAILED');process.exitCode=1;});
