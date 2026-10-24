'use strict';
// Explicit Windows acceptance of the new production helper method, using only
// two generated local Y4M clips. No server, profile seed, credentials or NAS.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const PLAN={version:1,electron:'44.4.2',scope:'production-helper-owner-snapshot',usesServer:false,snapshotUsesKoffi:false,packagedSelfcheckUsesKoffi:true,visibleDwmAcceptance:'NOT_ASSESSED'};
function clip(y,u,v) {
    const frame=Buffer.concat([Buffer.from('FRAME\n'),Buffer.alloc(32*18,y),Buffer.alloc(16*9,u),Buffer.alloc(16*9,v)]);
    return Buffer.concat([Buffer.from('YUV4MPEG2 W32 H18 F2:1 Ip A1:1 C420jpeg\n'),...Array(12).fill(frame)]);
}
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const {POLICY,acceptsNativeExit}=require(fs.existsSync(path.join(__dirname,'registry-input.json'))?'./exit-policy.cjs':'./templates/native-preview/exit-policy.cjs');
function trace(stage,fields={}) {process.stderr.write(JSON.stringify({event:'owner-probe-stage',stage,at:new Date().toISOString(),...fields})+'\n');}
function probeFailure(code) {const error=Error(code);error.code=code;return error;}
function probeConfiguration(manifest,baseline) {
    if(manifest.libmpv.sha256!==baseline.EXPECTED_LIBMPV_SHA256||manifest.libmpv.clientApi!=='2.5'||baseline.EXPECTED_LIBMPV_VERSION!=='mpv '+manifest.libmpv.version)throw probeFailure('OWNER_BASELINE_CONTRACT_MISMATCH');
    return {expectedLibmpvVersion:baseline.EXPECTED_LIBMPV_VERSION};
}
function targetEvidence(runtime,dll){
    const normalize=value=>process.platform==='win32'?value.toLowerCase():value;
    return {absolute:path.isAbsolute(dll),physicalPathMatch:normalize(fs.realpathSync.native(dll))===normalize(path.resolve(dll)),productionBaselinePathMatch:normalize(dll)===normalize(path.join(runtime,'electronapp','libmpv','x64','mpv-1.dll')),characters:dll.length};
}
function auditSourceContract() {
    const packaged=fs.existsSync(path.join(__dirname,'registry-input.json'));
    const manifest=packaged?require('./native-helper-manifest.json'):require('../vendor/native-helper-manifest.json');
    const baseline=require(packaged?'../electronapp/native-helper/service':'../src/electronapp/native-helper/service');
    const configuration=probeConfiguration(manifest,baseline);
    return {scope:'static-source-contract-only',status:'passed',componentVersion:manifest.libmpv.version,expectedRuntimeVersion:configuration.expectedLibmpvVersion,expectedDllSha256:baseline.EXPECTED_LIBMPV_SHA256,nativeHelperStarted:false,dllLoaded:false,visibleDwmAcceptance:'NOT_ASSESSED'};
}
function startupEvidence(client,error) {
    const scalar=(value,pattern)=>typeof value==='string'&&pattern.test(value)?value:null,number=value=>Number.isSafeInteger(value)?value:null;
    const knownCapabilities=['private-inherited-pipe','native-child-hwnd','gpu-next','d3d11','generation-attribution','preview-snapshot-v1'];
    const ready=client.handshake,stderr=Buffer.concat((client.stderrChunks||[]).filter(Buffer.isBuffer)).subarray(-8192),text=stderr.toString('utf8');
    const message=String(error?.message||'').slice(0,4096);
    const safeMessage=scalar(message,/^(?:helper-start-failed:[A-Za-z0-9_.:-]{1,160}|timeout:helper-ready|invalid-helper-handshake|missing-helper-capability|unexpected-libmpv-version|OWNER_SNAPSHOT_CAPABILITY_MISSING)$/);
    const systemError=['ENOENT','EACCES','EPERM','EINVAL','ENOMEM','ENOTDIR','EIO','EPIPE'].find(code=>new RegExp('\\b'+code+'\\b').test(message))||null;
    return {error:{name:scalar(error?.name,/^[A-Za-z0-9_]{1,64}$/),code:scalar(error?.code,/^[A-Za-z0-9_-]{1,80}$/),state:scalar(error?.state,/^[A-Z_]{1,64}$/),systemError,message:safeMessage,messageSha256:sha(message)},
        expectedRuntimeVersion:client.expectedLibmpvVersion,pid:number(client.child?.pid),exitCode:number(client.child?.exitCode),signal:scalar(client.child?.signalCode,/^[A-Z0-9]{1,16}$/),exited:client.exited===true,transportTerminated:client.transportTerminated===true,
        protocolFailure:scalar(client.protocolFailure,/^[a-z0-9-]{1,80}$/),
        handshake:ready?{protocolVersion:number(ready.protocolVersion),helperVersion:scalar(ready.helperVersion,/^[A-Za-z0-9._+-]{1,64}$/),libmpvVersion:scalar(ready.libmpvVersion,/^mpv v[A-Za-z0-9._+-]{1,128}$/),mpvClientApiVersion:number(ready.mpvClientApiVersion),surfaceAttached:ready.surfaceAttached===true,capabilities:knownCapabilities.filter(value=>Array.isArray(ready.capabilities)&&ready.capabilities.includes(value)),queueLimits:{maxPendingFrames:number(ready.queueLimits?.maxPendingFrames),maxPendingBytes:number(ready.queueLimits?.maxPendingBytes)}}:null,
        stderr:{observedBytes:number(client.stderrObservedBytes),retainedBytes:number(client.stderrRetainedBytes),inspectedTailBytes:stderr.length,tailSha256:sha(stderr),fatalTags:text.split(/\r?\n/).filter(line=>/^helper-fatal:[A-Za-z0-9_.: -]{1,160}$/.test(line)).slice(-4)},
        closeOrdering:(client.closeOrdering||[]).slice(-16).map(row=>({name:scalar(row.name,/^[a-z0-9-]{1,80}$/),code:number(row.detail?.code),signal:scalar(row.detail?.signal,/^[A-Z0-9]{1,16}$/)}))};
}
async function waitForHelperClose(client){
    if(client.closeOrdering?.some(row=>row.name==='process-close'))return true;
    if(!client.child)return false;
    return new Promise(resolve=>{const child=client.child;let timer;const done=()=>{clearTimeout(timer);child.removeListener('close',closed);resolve(client.closeOrdering?.some(row=>row.name==='process-close')===true);};const closed=()=>done();child.once('close',closed);timer=setTimeout(done,1000);});
}
function noteProbeTerminal(state,record){if(!state.shutdownRequested&&!state.unexpectedTerminal)state.unexpectedTerminal=/^[a-z0-9-]{1,80}$/.test(record.name)?record.name:'unknown-terminal';}
async function finishOwnerProbe(client,state){
    const early=state.unexpectedTerminal||(client.exited||client.transportTerminated?'already-terminal':null),child=client.child,originalKill=child?.kill;
    const termination={attempted:false,succeeded:false,signal:null,error:null};
    state.shutdownRequested=true;
    if(child&&typeof originalKill==='function')child.kill=function(signal){termination.attempted=true;termination.signal=signal||'SIGTERM';try{const result=originalKill.call(this,signal);termination.succeeded=result===true;return result;}catch(error){termination.error=startupEvidence(client,error).error;throw error;}};
    let result,killError=null;
    try{result=await client.kill();}catch(error){killError=error;}finally{if(child&&typeof originalKill==='function')child.kill=originalKill;}
    const streamsClosed=await waitForHelperClose(client),terminalErrors=[...new Set((client.closeOrdering||[]).map(row=>row.name).filter(name=>['stdin-error','stdout-error','process-error','protocol-failure','outbound-queue-limit'].includes(name)))];
    const code=Number.isInteger(result?.code)?result.code:null,signal=typeof result?.signal==='string'?result.signal:null;
    const exit={policy:POLICY,requested:true,exited:client.exited===true,streamsClosed,code,signal,errorPresent:result?.error!=null||killError!==null,protocolFailure:client.protocolFailure??null,unexpectedTerminal:Boolean(early||state.unexpectedTerminal),terminalErrors,controllerTermination:termination,
        kind:code===0&&signal===null&&!termination.succeeded?'graceful':code===null&&signal==='SIGTERM'&&termination.succeeded?'controller-terminated':'rejected'};
    if(!acceptsNativeExit(exit)){const error=probeFailure('OWNER_NATIVE_EXIT_NOT_ACCEPTED');if(killError)error.cause=killError;error.details={nativeExit:exit,earlyTerminal:early,startup:startupEvidence(client,killError)};throw error;}
    return {event:'end',result:'PASS',scope:PLAN.scope,ownedExitConfirmed:true,nativeExitAccepted:true,nativeExit:exit,visibleDwmAcceptance:'NOT_ASSESSED'};
}
function stageErrorProjection(error,stage){
    const messages={'Snapshot unavailable':'snapshot-unavailable','A frame mismatch':'a-color-mismatch','B frame mismatch':'b-color-mismatch','Old request not retired':'old-request-not-retired','Pixels retained in diagnostics':'pixels-in-diagnostics','Ended media still produces snapshot':'ended-snapshot-available','load-command-failed-or-unattributed':'load-command-failed-or-unattributed'};
    const codes=new Set(['OWNER_NATIVE_EXIT_NOT_ACCEPTED','OWNER_HELPER_START_FAILED','OWNER_SNAPSHOT_CAPABILITY_MISSING','OWNER_BASELINE_CONTRACT_MISMATCH','OWNER_GUI_MODE_REQUIRED','invalid-helper-handshake','missing-helper-capability','unexpected-libmpv-version']);
    const states=new Set(['FAILED','HELPER_DIED','TIMED_OUT','GENERATION_RETIRED','CANCELLED']);
    const stages=new Set(['handshake','sample-A','retire-A','sample-B','end-file','owned-exit']);
    const message=String(error?.message||'').slice(0,4096);
    return {stage:stages.has(stage)?stage:null,reason:Object.hasOwn(messages,message)?messages[message]:(/^timeout:[1-9][0-9]*:end-file$/.test(message)?'end-file-timeout':null),code:codes.has(error?.code)?error.code:null,state:states.has(error?.state)?error.state:null,messageSha256:sha(message)};
}
async function startProbeHelper(client) {
    let step='controller-start';
    try {
        await client.start();trace('controller-ready');step='preview-capability';
        if(!client.handshake.capabilities.includes('preview-snapshot-v1'))throw probeFailure('OWNER_SNAPSHOT_CAPABILITY_MISSING');
        trace('helper-ready',{snapshotCapability:true});
    } catch(error) {
        trace('helper-start-rejected',{step,startup:startupEvidence(client,error)});
        let cleanupError=null;
        try{await client.kill();}catch(failure){cleanupError=startupEvidence(client,failure).error;}
        // exitPromise settles on exit, earlier than stdout/stderr close. Allow
        // a bounded drain before projecting native fatal tags and final status.
        await waitForHelperClose(client);
        const wrapped=probeFailure(error.code||'OWNER_HELPER_START_FAILED');wrapped.cause=error;wrapped.details={step,startup:startupEvidence(client,error),cleanupError};throw wrapped;
    }
}
function isDirectInvocation() {
    if(require.main===module)return true;
    // Electron 44 default_app imports the CJS entry through the ESM loader.
    // require.main then names the launcher (or is undefined), not this module.
    if(!process.versions.electron||!process.defaultApp||!process.argv[1])return false;
    const normalize=value=>{const physical=fs.realpathSync.native(value);return process.platform==='win32'?physical.toLowerCase():physical;};
    try{return normalize(process.argv[1])===normalize(__filename);}catch(_){return false;}
}
async function loadProbeClip(client,label,file) {
    const generation=client.beginGeneration(label,['core-idle']);
    // Only this probe-owned generation: permit natural end-file. Property
    // commands require an activated generation even before the first load.
    client.setProperty('keep-open',false);
    await client.load(['loadfile',file,'replace']).promise;
    return generation;
}
function assertNoSnapshotDiagnostics(snapshot) {
    // The wire DTO is BGR24 base64, while decode returns BGRA. Comparing their
    // encodings would miss retained DTOs; reject the pixel field itself.
    if (/"pixels"\s*:/.test(JSON.stringify(snapshot)))throw Error('Pixels retained in diagnostics');
}
async function run(runtimeArg,outputArg,commit) {
    if(process.platform!=='win32'||process.arch!=='x64'||process.versions.electron!==PLAN.electron)throw Error('Pinned Windows Electron required');
    if(process.type!=='browser')throw probeFailure('OWNER_GUI_MODE_REQUIRED');
    if(!runtimeArg||!outputArg||!/^[a-f0-9]{40}$/.test(commit||''))throw Error('Invalid probe arguments');
    const repository=path.resolve(__dirname,'..'),runtime=path.resolve(runtimeArg),output=path.resolve(outputArg);
    const packaged=fs.existsSync(path.join(__dirname,'registry-input.json'));
    trace('preflight-start',{packaged});
    if(packaged) {
        require('./verify.cjs').verify(runtime,commit);
        trace('bundle-selfcheck-passed',{ffiLoaded:true});
        const relative=path.relative(runtime,output),parent=path.dirname(output);
        if(!relative||(!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative))||fs.realpathSync.native(parent).toLowerCase()!==parent.toLowerCase())throw Error('Probe output must be new and outside bundle');
    }
    else if(execFileSync('git',['-C',repository,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==commit)throw Error('Checkout mismatch');
    const manifest=packaged?require('./native-helper-manifest.json'):require('../vendor/native-helper-manifest.json');
    const provenance=JSON.parse(fs.readFileSync(path.join(runtime,manifest.provenancePath),'utf8'));
    const helper=path.join(runtime,manifest.runtimePath),dll=path.join(runtime,manifest.libmpv.runtimePath);
    const cpp=packaged?fs.readFileSync(path.join(__dirname,'helper-source.cpp')):execFileSync('git',['-C',repository,'show',commit+':'+manifest.sourcePath]);
    if(provenance.sourceCommit!==commit||provenance.helper.testing||provenance.source.sha256!==sha(cpp)||
       provenance.helper.sha256!==sha(fs.readFileSync(helper))||manifest.libmpv.sha256!==sha(fs.readFileSync(dll)))throw Error('Source-bound production runtime required');
    trace('source-bound',{dllTarget:targetEvidence(runtime,dll)});
    fs.mkdirSync(output);
    const log=value=>fs.appendFileSync(path.join(output,'owner-probe.jsonl'),JSON.stringify(value)+'\n');
    const {app,BrowserWindow}=require('electron');
    for(const name of ['appData','userData','sessionData']) {const target=path.join(output,name);fs.mkdirSync(target);app.setPath(name,target);}
    trace('profile-configured');
    log({event:'begin',...PLAN,packagedSelfcheck:packaged,sourceCommit:commit,helperSha256:provenance.helper.sha256,sourceSha256:sha(cpp)});
    trace('app-ready-wait',{alreadyReady:app.isReady()});
    await app.whenReady();trace('app-ready');
    trace('window-create');
    const host=new BrowserWindow({width:640,height:360,show:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
    trace('window-created');
    const {NativeHelperClient}=require(packaged?'../electronapp/native-helper/controller':'../src/electronapp/native-helper/controller');
    const baseline=require(packaged?'../electronapp/native-helper/service':'../src/electronapp/native-helper/service');
    const decode=require(packaged?'../electronapp/native-helper/preview-snapshot':'../src/electronapp/native-helper/preview-snapshot').decode;
    const exitState={shutdownRequested:false,unexpectedTerminal:null};
    const client=new NativeHelperClient({helperPath:helper,libmpvPath:dll,parentWindowHandle:host.getNativeWindowHandle().readBigUInt64LE().toString(),...probeConfiguration(manifest,baseline),onTerminal:record=>{noteProbeTerminal(exitState,record);trace('helper-terminal',{name:record.name,startup:startupEvidence(client,null)});}});
    let finished=false,stage='handshake';
    host.on('close',event=>{if(!finished)event.preventDefault();});
    try {
        trace('helper-start');
        await startProbeHelper(client);
        const files=[path.join(output,'A.y4m'),path.join(output,'B.y4m')];fs.writeFileSync(files[0],clip(81,90,240));fs.writeFileSync(files[1],clip(145,54,34));
        async function load(index) {
            return loadProbeClip(client,index?'B':'A',files[index]);
        }
        async function sample(generation) {
            for(let attempt=0;attempt<6;attempt++) {
                const value=await client.request('preview-snapshot',{}, {generationId:generation,timeoutMs:1800});
                const frame=decode(value,generation);if(frame)return frame;
                // Retry pacing only. Readiness is proven by the helper owner
                // contract; elapsed time never makes a frame acceptable.
                await new Promise(resolve=>setTimeout(resolve,1000));
            }
            throw Error('Snapshot unavailable');
        }
        stage='sample-A';trace(stage);const a=await load(0),red=await sample(a);if(red.pixels[2]<=red.pixels[1]+40)throw Error('A frame mismatch');
        log({event:'A',ownerVerified:true,redDominant:true});
        stage='retire-A';const late=client.request('preview-snapshot',{}, {generationId:a}).then(()=>false,error=>error.state==='GENERATION_RETIRED');
        client.retireGeneration('probe-switch');if(!await late)throw Error('Old request not retired');
        stage='sample-B';trace(stage);const b=await load(1),green=await sample(b);if(green.pixels[1]<=green.pixels[2]+40)throw Error('B frame mismatch');
        assertNoSnapshotDiagnostics(client.snapshot());
        log({event:'B',ownerVerified:true,greenDominant:true,oldRequestRetired:true});
        stage='end-file';trace(stage);await client.waitForGenerationEvent(b,'end-file',10000);
        if((await client.request('preview-snapshot',{}, {generationId:b})).ready!==false)throw Error('Ended media still produces snapshot');
        log({event:'ended',snapshotUnavailable:true});
        stage='owned-exit';trace(stage);log(await finishOwnerProbe(client,exitState));
    } catch(error) {
        const projection=stageErrorProjection(error,stage),details={stageError:projection,evidence:error.details||null};
        trace('failure',{failedStage:stage,details});log({event:'failure',stage,details});
        const wrapped=probeFailure(projection.code||'OWNER_STAGE_FAILED');wrapped.cause=error;wrapped.details=details;throw wrapped;
    } finally {
        trace('cleanup-start');await client.kill();trace('helper-exit-confirmed',{exited:client.exited});finished=true;if(!host.isDestroyed())host.destroy();trace('app-quit');app.quit();
    }
}
module.exports={PLAN,clip,loadProbeClip,assertNoSnapshotDiagnostics,probeConfiguration,targetEvidence,auditSourceContract,startupEvidence,startProbeHelper,noteProbeTerminal,finishOwnerProbe,stageErrorProjection};
const directInvocation=isDirectInvocation();
if(process.versions.electron&&process.defaultApp&&process.type==='browser')trace('module-evaluated',{directInvocation,argv1Basename:process.argv[1]?path.basename(process.argv[1]):null});
if(directInvocation) {
    if(process.argv[2]==='--audit-contract'){try{process.stdout.write(JSON.stringify(auditSourceContract())+'\n',()=>{if(process.type==='browser')require('electron').app.exit(0);});}catch(error){console.error(JSON.stringify({code:error.code||'SOURCE_CONTRACT_AUDIT_FAILED'}));process.exitCode=1;if(process.type==='browser')require('electron').app.exit(1);}}
    else if(process.argv[2]==='--describe'){trace('entry-describe',{defaultApp:process.defaultApp===true,processType:process.type||null,electron:process.versions.electron||null});process.stdout.write(JSON.stringify(PLAN)+'\n',()=>{if(process.type==='browser')require('electron').app.exit(0);});}
    else {trace('entry',{argumentCount:process.argv.length-2,sourceCommitValid:/^[a-f0-9]{40}$/.test(process.argv[4]||''),defaultApp:process.defaultApp===true,processType:process.type||null,electron:process.versions.electron||null});run(...process.argv.slice(2)).catch(error=>{process.stderr.write(JSON.stringify({event:'probe-failed',code:error.code||'OWNER_PROBE_FAILED',details:error.details||null})+'\n');process.exitCode=1;if(process.type==='browser')require('electron').app.exit(1);});}
}
