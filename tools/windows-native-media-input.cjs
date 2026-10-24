'use strict';
// Ordinary Windows package assembly for the accepted one-second preview/SMTC.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const deps=require('./windows-native-preview-deps.cjs');
const readSource=(root,source,name)=>execFileSync('git',['-C',root,'show',source+':'+name],{maxBuffer:4*1024*1024});
const {inventory}=require('./verify-installer-runtime.cjs');
const ROOT='electronapp/enhanced/native-media',PREPARED='.work/windows-native-media-dependencies',PROOF='windows-native-media-provenance.json';
const SOURCES=['native/windows-media/dwm.cjs','native/windows-media/winrt.cjs','native/windows-media/system-libraries.cjs'];
const INPUTS=[...SOURCES,'native/windows-media/package.json','native/windows-media/package-lock.json','native/windows-media/registry-input.json','native/windows-media/loader-input.json','vendor/electron-runtime-manifest.json'];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function inputs(root,source){
    if(!/^[a-f0-9]{40}$/.test(source||''))throw Error('Exact native media source required');
    const blobs=new Map(INPUTS.map(name=>[name,readSource(root,source,name)]));
    for(const [name,bytes]of blobs){
        const working=fs.readFileSync(path.join(root,name));
        if(working.toString('utf8').replace(/\r\n/g,'\n')!==bytes.toString('utf8').replace(/\r\n/g,'\n'))throw Error('Native media input differs from source');
    }
    const registry=deps.contract(root),loader=JSON.parse(blobs.get('native/windows-media/loader-input.json')),electron=JSON.parse(blobs.get('vendor/electron-runtime-manifest.json'));
    if(loader.schemaVersion!==1||loader.component!=='Electron'||loader.version!=='44.4.2'||loader.platform!=='win32'||loader.arch!=='x64'||
        loader.archiveSha256!==electron.archive.sha256||electron.version!==loader.version||electron.platform!==loader.platform||electron.arch!==loader.arch||
        loader.sourcePath!=='x64/electron/vulkan-1.dll'||loader.targetPath!=='electronapp/libmpv/x64/vulkan-1.dll'||
        !/^[a-f0-9]{64}$/.test(loader.sha256)||loader.relation!=='byte-identical-standard-payload-copy')throw Error('Native media loader contract mismatch');
    return {blobs,registry,loader};
}
function expected(root,source){
    const {blobs,registry,loader}=inputs(root,source),files=[];
    for(const name of SOURCES){const bytes=blobs.get(name);files.push({path:ROOT+'/'+path.posix.basename(name),size:bytes.length,sha256:hash(bytes),sourcePath:name,relation:'committed-source-blob'});}
    for(const item of registry.packages)for(const file of item.files)files.push({path:ROOT+'/node_modules/'+item.name+'/'+file.path,size:file.size,sha256:file.sha256,sourcePath:item.name+'@'+item.version,relation:'official-registry-locked-member'});
    return {schemaVersion:1,sourceCommit:source,defaultEnabled:true,captureIntervalMs:1000,
        registry:{url:registry.registry,lockSha256:registry.lockSha256,manifestSha256:hash(blobs.get('native/windows-media/registry-input.json')),version:'3.3.3'},
        inputs:[...blobs].map(([name,bytes])=>({path:name,sha256:hash(bytes)})),files,
        loader:{...loader,relation:'byte-identical-standard-payload-copy'}};
}
function validateFiles(runtime,record){
    const directory=path.join(runtime,ROOT),actual=inventory(directory);
    if(actual.size!==record.files.length)throw Error('Native media file set mismatch');
    for(const file of record.files){const relative=file.path.slice(ROOT.length+1),value=actual.get(relative);if(!value||value.size!==file.size||value.sha256!==file.sha256)throw Error('Native media file identity mismatch');}
    const loader=record.loader,source=fs.readFileSync(path.join(runtime,loader.sourcePath)),target=fs.readFileSync(path.join(runtime,loader.targetPath));
    if(hash(source)!==loader.sha256||!source.equals(target))throw Error('Native media loader copy mismatch');
}
function assemble(root,runtime,prepared,source){
    deps.verify(root,prepared);const record=expected(root,source),target=path.join(runtime,ROOT);
    if(fs.existsSync(target)||fs.existsSync(path.join(runtime,PROOF))||fs.existsSync(path.join(runtime,record.loader.targetPath)))throw Error('Preserve existing native media output');
    deps.assertPhysicalDirectory(runtime);fs.mkdirSync(target,{recursive:true});
    for(const file of record.files){
        const destination=path.join(runtime,file.path);fs.mkdirSync(path.dirname(destination),{recursive:true});
        if(file.relation==='committed-source-blob')fs.writeFileSync(destination,readSource(root,source,file.sourcePath),{flag:'wx'});
        else fs.copyFileSync(path.join(prepared,file.path.slice(ROOT.length+1)),destination,fs.constants.COPYFILE_EXCL);
    }
    const loader=record.loader;fs.copyFileSync(path.join(runtime,loader.sourcePath),path.join(runtime,loader.targetPath),fs.constants.COPYFILE_EXCL);
    validateFiles(runtime,record);fs.writeFileSync(path.join(runtime,PROOF),JSON.stringify(record,null,2)+'\n',{flag:'wx'});
    return verify(root,runtime,source);
}
function verify(root,runtime,source){
    const record=expected(root,source),actual=JSON.parse(fs.readFileSync(path.join(runtime,PROOF),'utf8'));
    if(JSON.stringify(actual)!==JSON.stringify(record))throw Error('Native media provenance mismatch');
    validateFiles(runtime,record);
    return {status:'passed',sourceCommit:source,defaultEnabled:true,captureIntervalMs:1000,files:record.files.length,registryVersion:'3.3.3',loaderColocated:true};
}
function selfcheck(root,runtime,source){
    if(process.platform!=='win32'||process.arch!=='x64'||process.versions.electron!=='44.4.2')throw Error('Pinned Windows Electron required');
    const result=verify(root,runtime,source),nativeRoot=path.join(runtime,ROOT),koffi=require(path.join(nativeRoot,'node_modules/koffi'));
    require(path.join(nativeRoot,'winrt.cjs')).createBindings(koffi);require(path.join(nativeRoot,'dwm.cjs')).createDwm(koffi);
    return {...result,ffiLoaded:true,visibleAcceptance:'NOT_ASSESSED'};
}
module.exports={ROOT,PREPARED,PROOF,SOURCES,INPUTS,expected,validateFiles,assemble,verify,selfcheck};
if(require.main===module){const [action,root,runtime,source]=process.argv.slice(2);try{const result=action==='assemble'?assemble(root,runtime,path.join(root,PREPARED),source):({verify,selfcheck}[action]||(()=>{throw Error('Unknown native media action');}))(root,runtime,source);console.log(JSON.stringify(result));}catch(error){console.error(error.message);process.exitCode=1;}}
