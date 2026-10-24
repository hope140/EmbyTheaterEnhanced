'use strict';
// Explicit cloud startup of a freshly compiled production helper. No media or
// server is loaded; real helper windows are created, so never run this on Work.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const input=require('./libmpv-input.cjs'),electron=require('./electron-runtime-input.cjs'),check=require('./templates/native-preview/verify.cjs');
const {runChild,readHandshakeReport,preserveOwnerStages}=require('./windows-native-preview-process.cjs');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function context(rootArg){
    if(process.platform!=='win32'||process.arch!=='x64'||process.env.GITHUB_ACTIONS!=='true')throw Error('Explicit cloud Windows x64 helper startup required');
    const root=path.resolve(rootArg),source=cp.execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
    if(!/^[a-f0-9]{40}$/.test(source)||source!==process.env.GITHUB_SHA)throw Error('Exact workflow source required');
    input.validate(root);electron.validatePrepared(root);
    const manifest=electron.readManifest(root),lock=check.loaderContract(JSON.parse(fs.readFileSync(path.join(root,'native/windows-media/loader-input.json'))),manifest),vulkan=path.join(root,manifest.runtime.preparedPath,'vulkan-1.dll');
    if(sha(fs.readFileSync(vulkan))!==lock.sha256)throw Error('Pinned Electron loader identity mismatch');
    return {root,source,lock,vulkan,manifest,runtime:path.join(root,'.work/native-helper-startup/runtime'),output:path.join(root,'test-output/native-helper-startup')};
}
function prepare(rootArg){
    const c=context(rootArg);if(fs.existsSync(c.runtime)||fs.existsSync(c.output))throw Error('Preserve existing helper startup');
    const target=path.join(c.runtime,'electronapp/libmpv/x64');fs.mkdirSync(target,{recursive:true});
    fs.copyFileSync(path.join(c.root,input.INPUT_ROOT,'mpv-1.dll'),path.join(target,'mpv-1.dll'),fs.constants.COPYFILE_EXCL);
    fs.copyFileSync(c.vulkan,path.join(c.runtime,c.lock.targetPath),fs.constants.COPYFILE_EXCL);
    if(sha(fs.readFileSync(path.join(c.runtime,c.lock.targetPath)))!==c.lock.sha256)throw Error('Copied loader identity mismatch');
    fs.writeFileSync(path.join(c.runtime,'loader-provenance.json'),JSON.stringify({scope:'minimal-startup-runtime-not-standard-payload',sourceCommit:c.source,sourceComponent:'pinned-Electron-44.4.2-win32-x64',sourcePreparedPath:c.manifest.runtime.preparedPath+'/vulkan-1.dll',archiveSha256:c.lock.archiveSha256,targetPath:c.lock.targetPath,sha256:c.lock.sha256,relation:'byte-identical-component-copy'},null,2)+'\n',{flag:'wx'});
    return {scope:'production-helper-startup-preparation-only',sourceCommit:c.source,vulkanSha256:c.lock.sha256};
}
async function run(rootArg){
    const c=context(rootArg);if(fs.existsSync(c.output))throw Error('Preserve existing helper startup output');fs.mkdirSync(c.output,{recursive:true});
    const probeOutput=path.join(c.root,'.work/native-helper-startup/probe-output'),exe=path.join(c.root,c.manifest.runtime.preparedPath,'electron.exe');
    const provenance=JSON.parse(fs.readFileSync(path.join(c.runtime,'native-helper-provenance.json')));
    if(provenance.sourceCommit!==c.source||provenance.helper.testing!==false)throw Error('Source-bound production helper required');
    const loaderProvenance=JSON.parse(fs.readFileSync(path.join(c.runtime,'loader-provenance.json')));
    if(loaderProvenance.sourceCommit!==c.source||loaderProvenance.sha256!==c.lock.sha256||loaderProvenance.archiveSha256!==c.lock.archiveSha256||loaderProvenance.targetPath!==c.lock.targetPath||sha(fs.readFileSync(path.join(c.runtime,c.lock.targetPath)))!==c.lock.sha256)throw Error('Prepared loader provenance mismatch');
    fs.copyFileSync(path.join(c.runtime,'loader-provenance.json'),path.join(c.output,'loader-provenance.json'),fs.constants.COPYFILE_EXCL);
    fs.copyFileSync(path.join(c.runtime,'native-helper-provenance.json'),path.join(c.output,'helper-provenance.json'),fs.constants.COPYFILE_EXCL);
    try{
        await runChild(exe,[path.join(c.root,'tools/windows-native-owner-probe.cjs'),c.runtime,probeOutput,c.source,'--handshake-only'],{directory:c.output,name:'helper-startup',timeoutMs:45000});
        const handshake=readHandshakeReport(probeOutput,c.source),result={status:'passed',scope:'production-helper-handshake-only',sourceCommit:c.source,helperSha256:provenance.helper.sha256,vulkanSha256:c.lock.sha256,loaderProvenance,handshake,snapshotAcceptance:'NOT_ASSESSED',visibleAcceptance:'NOT_ASSESSED'};
        fs.writeFileSync(path.join(c.output,'startup.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});return result;
    }finally{preserveOwnerStages(probeOutput,c.output,'helper-startup-stages.jsonl');}
}
module.exports={prepare,run};
if(require.main===module){const action=process.argv[2];Promise.resolve().then(()=>{if(action==='prepare')return prepare(process.argv[3]);if(action==='run')return run(process.argv[3]);throw Error('Unknown helper startup command');}).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1;});}
