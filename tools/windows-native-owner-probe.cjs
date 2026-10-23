'use strict';
// Explicit Windows acceptance of the new production helper method, using only
// two generated local Y4M clips. No server, profile seed, credentials or NAS.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const PLAN={version:1,electron:'44.4.2',scope:'production-helper-owner-snapshot',usesServer:false,usesKoffi:false,visibleDwmAcceptance:'NOT_ASSESSED'};
function clip(y,u,v) {
    const frame=Buffer.concat([Buffer.from('FRAME\n'),Buffer.alloc(32*18,y),Buffer.alloc(16*9,u),Buffer.alloc(16*9,v)]);
    return Buffer.concat([Buffer.from('YUV4MPEG2 W32 H18 F2:1 Ip A1:1 C420jpeg\n'),...Array(12).fill(frame)]);
}
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function run(runtimeArg,outputArg,commit) {
    if(process.platform!=='win32'||process.arch!=='x64'||process.versions.electron!==PLAN.electron)throw Error('Pinned Windows Electron required');
    if(!runtimeArg||!outputArg||!/^[a-f0-9]{40}$/.test(commit||''))throw Error('Invalid probe arguments');
    const repository=path.resolve(__dirname,'..'),runtime=path.resolve(runtimeArg),output=path.resolve(outputArg);
    if(execFileSync('git',['-C',repository,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==commit)throw Error('Checkout mismatch');
    const manifest=require('../vendor/native-helper-manifest.json');
    const provenance=JSON.parse(fs.readFileSync(path.join(runtime,manifest.provenancePath),'utf8'));
    const helper=path.join(runtime,manifest.runtimePath),dll=path.join(runtime,manifest.libmpv.runtimePath);
    const cpp=execFileSync('git',['-C',repository,'show',commit+':'+manifest.sourcePath]);
    if(provenance.sourceCommit!==commit||provenance.helper.testing||provenance.source.sha256!==sha(cpp)||
       provenance.helper.sha256!==sha(fs.readFileSync(helper))||manifest.libmpv.sha256!==sha(fs.readFileSync(dll)))throw Error('Source-bound production runtime required');
    fs.mkdirSync(output);
    const log=value=>fs.appendFileSync(path.join(output,'owner-probe.jsonl'),JSON.stringify(value)+'\n');
    const {app,BrowserWindow}=require('electron');
    for(const name of ['appData','userData','sessionData']) {const target=path.join(output,name);fs.mkdirSync(target);app.setPath(name,target);}
    log({event:'begin',...PLAN,sourceCommit:commit,helperSha256:provenance.helper.sha256,sourceSha256:sha(cpp)});
    await app.whenReady();
    const host=new BrowserWindow({width:640,height:360,show:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
    const {NativeHelperClient}=require('../src/electronapp/native-helper/controller');
    const decode=require('../src/electronapp/native-helper/preview-snapshot').decode;
    const client=new NativeHelperClient({helperPath:helper,libmpvPath:dll,parentWindowHandle:host.getNativeWindowHandle().readBigUInt64LE().toString(),expectedLibmpvVersion:manifest.libmpv.version});
    let finished=false;
    host.on('close',event=>{if(!finished)event.preventDefault();});
    try {
        await client.start();
        if(!client.handshake.capabilities.includes('preview-snapshot-v1'))throw Error('Missing production snapshot capability');
        // Only this probe-owned player: permit a natural end-file assertion.
        client.setProperty('keep-open',false);
        const files=[path.join(output,'A.y4m'),path.join(output,'B.y4m')];fs.writeFileSync(files[0],clip(81,90,240));fs.writeFileSync(files[1],clip(145,54,34));
        async function load(index) {
            const generation=client.beginGeneration(index?'B':'A',['core-idle']);await client.load(['loadfile',files[index],'replace']).promise;return generation;
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
        const a=await load(0),red=await sample(a);if(red.pixels[2]<=red.pixels[1]+40)throw Error('A frame mismatch');
        log({event:'A',ownerVerified:true,redDominant:true});
        const late=client.request('preview-snapshot',{}, {generationId:a}).then(()=>false,error=>error.state==='GENERATION_RETIRED');
        client.retireGeneration('probe-switch');if(!await late)throw Error('Old request not retired');
        const b=await load(1),green=await sample(b);if(green.pixels[1]<=green.pixels[2]+40)throw Error('B frame mismatch');
        if(JSON.stringify(client.snapshot()).includes(Buffer.from(green.pixels).toString('base64')))throw Error('Pixels retained in diagnostics');
        log({event:'B',ownerVerified:true,greenDominant:true,oldRequestRetired:true});
        await client.waitForGenerationEvent(b,'end-file',10000);
        if((await client.request('preview-snapshot',{}, {generationId:b})).ready!==false)throw Error('Ended media still produces snapshot');
        log({event:'ended',snapshotUnavailable:true});
        await client.kill();
        log({event:'end',result:'PASS',scope:PLAN.scope,ownedExitConfirmed:client.exited,visibleDwmAcceptance:'NOT_ASSESSED'});
    } finally {
        await client.kill();finished=true;if(!host.isDestroyed())host.destroy();app.quit();
    }
}
module.exports={PLAN,clip};
if(require.main===module) {
    if(process.argv[2]==='--describe')process.stdout.write(JSON.stringify(PLAN)+'\n');
    else run(...process.argv.slice(2)).catch(()=>{process.stderr.write('Owner snapshot probe failed; inspect completed fixed-stage records.\n');process.exitCode=1;if(process.versions.electron)require('electron').app.quit();});
}
