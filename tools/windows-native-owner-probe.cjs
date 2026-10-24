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
function trace(stage,fields={}) {process.stderr.write(JSON.stringify({event:'owner-probe-stage',stage,at:new Date().toISOString(),...fields})+'\n');}
function probeFailure(code) {const error=Error(code);error.code=code;return error;}
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
    trace('source-bound');
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
    const decode=require(packaged?'../electronapp/native-helper/preview-snapshot':'../src/electronapp/native-helper/preview-snapshot').decode;
    const client=new NativeHelperClient({helperPath:helper,libmpvPath:dll,parentWindowHandle:host.getNativeWindowHandle().readBigUInt64LE().toString(),expectedLibmpvVersion:manifest.libmpv.version});
    let finished=false,stage='handshake';
    host.on('close',event=>{if(!finished)event.preventDefault();});
    try {
        trace('helper-start');
        await client.start();
        if(!client.handshake.capabilities.includes('preview-snapshot-v1'))throw Error('Missing production snapshot capability');
        trace('helper-ready',{snapshotCapability:true});
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
        stage='owned-exit';trace(stage);await client.kill();
        log({event:'end',result:'PASS',scope:PLAN.scope,ownedExitConfirmed:client.exited,visibleDwmAcceptance:'NOT_ASSESSED'});
    } catch(error) {
        trace('failure',{failedStage:stage,state:['FAILED','HELPER_DIED','TIMED_OUT','GENERATION_RETIRED'].includes(error.state)?error.state:null});log({event:'failure',stage});throw error;
    } finally {
        trace('cleanup-start');await client.kill();trace('helper-exit-confirmed',{exited:client.exited});finished=true;if(!host.isDestroyed())host.destroy();trace('app-quit');app.quit();
    }
}
module.exports={PLAN,clip,loadProbeClip,assertNoSnapshotDiagnostics};
const directInvocation=isDirectInvocation();
if(process.versions.electron&&process.defaultApp&&process.type==='browser')trace('module-evaluated',{directInvocation,argv1Basename:process.argv[1]?path.basename(process.argv[1]):null});
if(directInvocation) {
    if(process.argv[2]==='--describe'){trace('entry-describe',{defaultApp:process.defaultApp===true,processType:process.type||null,electron:process.versions.electron||null});process.stdout.write(JSON.stringify(PLAN)+'\n',()=>{if(process.type==='browser')require('electron').app.exit(0);});}
    else {trace('entry',{argumentCount:process.argv.length-2,sourceCommitValid:/^[a-f0-9]{40}$/.test(process.argv[4]||''),defaultApp:process.defaultApp===true,processType:process.type||null,electron:process.versions.electron||null});run(...process.argv.slice(2)).catch(error=>{process.stderr.write(JSON.stringify({event:'probe-failed',code:error.code||'OWNER_PROBE_FAILED',details:error.details||null})+'\n');process.exitCode=1;if(process.type==='browser')require('electron').app.exit(1);});}
}
