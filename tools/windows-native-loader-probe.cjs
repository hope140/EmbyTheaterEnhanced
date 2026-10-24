'use strict';
// An explicit cloud-only loader experiment, not helper/video acceptance.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function peImports(bytes){
    function bounds(offset,size){if(!Number.isSafeInteger(offset)||offset<0||offset+size>bytes.length)throw Error('PE bounds invalid');return offset;}
    const u16=offset=>bytes.readUInt16LE(bounds(offset,2)),u32=offset=>bytes.readUInt32LE(bounds(offset,4));
    if(bytes.length<64||u16(0)!==0x5a4d)throw Error('PE header invalid');
    const pe=u32(60),optional=pe+24,count=u16(pe+6),optionalSize=u16(pe+20);
    if(u32(pe)!==0x4550||u16(pe+4)!==0x8664||u16(optional)!==0x20b||count<1||count>96||optionalSize<128)throw Error('PE x64 required');
    const sections=optional+optionalSize;bounds(sections,count*40);
    function offset(rva,size){
        if(rva<u32(optional+60))return bounds(rva,size);
        for(let i=0;i<count;i++){const section=sections+i*40,base=u32(section+12),rawSize=u32(section+16),raw=u32(section+20);
            if(rva>=base&&rva-base+size<=rawSize)return bounds(raw+rva-base,size);}
        throw Error('PE RVA invalid');
    }
    const rva=u32(optional+120),size=u32(optional+124),names=[];
    if(!rva&&!size)return names;
    if(!rva||size<20||size>128*20)throw Error('PE import directory invalid');
    for(let i=0;i<Math.floor(size/20);i++){
        const at=offset(rva+i*20,20);if(bytes.subarray(at,at+20).every(value=>value===0))return names;
        const nameRva=u32(at+12),chars=[];
        for(let j=0;j<256;j++){const value=bytes[offset(nameRva+j,1)];if(!value)break;chars.push(value);}
        const name=Buffer.from(chars).toString('ascii');
        if(chars.length===256||chars.some(value=>value>127)||!/^[-A-Za-z0-9_.]+\.dll$/i.test(name))throw Error('PE import name invalid');
        names.push(name);
    }
    throw Error('PE imports unterminated');
}
function assess(a,b,vulkanSha){
    const valid=row=>row&&row.scope==='dll-load-only-not-helper-or-video'&&row.flags===4352&&row.targetExists===true&&row.helperStarted===false&&row.appStarted===false&&row.visibleAcceptance==='NOT_ASSESSED'&&typeof row.vulkanPreloaded==='boolean'&&typeof row.vulkanSystemPresent==='boolean'&&typeof row.loaded==='boolean'&&Number.isInteger(row.win32Error)&&row.win32Error>=0&&(row.loaded?row.win32Error===0&&row.freed===true:row.win32Error!==0&&row.freed===null);
    if(!valid(a)||!valid(b)||a.phase!=='A'||b.phase!=='B'||a.vulkanColocated!==false||b.vulkanColocated!==true)throw Error('Loader report invalid');
    return {scope:'dependency-colocation-experiment-only',baselineLoaded:a.loaded,colocatedLoaded:b.loaded,
        vulkanDependencyCauseSupported:a.loaded===false&&a.win32Error===126&&!a.vulkanPreloaded&&!b.vulkanPreloaded&&b.loaded===true&&b.vulkanLoadedFrom==='colocated'&&b.loadedVulkanSha256===vulkanSha,
        productionHelperAcceptance:'NOT_ASSESSED',visibleAcceptance:'NOT_ASSESSED'};
}
const STAGES=['entry','target-hash-start','target-hash-verified','interop-start','interop-ready','load-start','load-returned','vulkan-inspect-start','vulkan-inspect-complete','free-start','free-returned','report-write-start','report-written','completed','failed'];
const STAGE_KEYS=['event','phase','stage','elapsedMs','flags','code','win32Error','loaded','freed'];
function childStages(stdout,phase){
    const rows=[];
    for(const line of String(stdout||'').slice(0,65536).split(/\r?\n/)){
        if(!line.startsWith('ETE_LOADER_STAGE ')||line.length>2048)continue;
        let row;try{row=JSON.parse(line.slice(17));}catch(_){continue;}
        if(!row||Object.keys(row).length!==STAGE_KEYS.length||!STAGE_KEYS.every(key=>Object.hasOwn(row,key))||
            row.event!=='loader-stage'||row.phase!==phase||!STAGES.includes(row.stage)||row.flags!==4352||
            !Number.isFinite(row.elapsedMs)||row.elapsedMs<0||row.elapsedMs>60000||
            ![null,'SCRIPT_ERROR'].includes(row.code)||!(row.win32Error===null||Number.isInteger(row.win32Error)&&row.win32Error>=0&&row.win32Error<=0xffffffff)||
            ![null,true,false].includes(row.loaded)||![null,true,false].includes(row.freed))continue;
        rows.push({...row});if(rows.length===32)break;
    }
    return rows;
}
function loadFacts(row,phase){
    if(!row||row.scope!=='dll-load-only-not-helper-or-video'||row.phase!==phase||row.flags!==4352||
        !['targetExists','loaded','vulkanPreloaded','vulkanColocated','vulkanSystemPresent'].every(key=>typeof row[key]==='boolean')||
        !Number.isInteger(row.win32Error)||row.win32Error<0||row.win32Error>0xffffffff||![null,true,false].includes(row.freed)||
        !['none','colocated','system32','other'].includes(row.vulkanLoadedFrom))return null;
    return Object.fromEntries(['flags','targetExists','loaded','win32Error','freed','vulkanPreloaded','vulkanColocated','vulkanSystemPresent','vulkanLoadedFrom'].map(key=>[key,row[key]]));
}
function childEvidence(result,phase,{reportExists=false,loadReport=null,elapsedMs=null}={}){
    if(!['A','B'].includes(phase))throw Error('Loader phase invalid');
    const errors=['ETIMEDOUT','ENOENT','EACCES','EPERM','EINVAL','ENOBUFS','ENOMEM'];
    const stages=childStages(result.stdout,phase),last=stages.at(-1),errorCode=result.error?(errors.includes(result.error.code)?result.error.code:'OTHER'):null;
    return {phase,timeoutMs:15000,elapsedMs:Number.isFinite(elapsedMs)&&elapsedMs>=0?elapsedMs:null,
        exitCode:Number.isInteger(result.status)?result.status:null,signal:result.signal?(['SIGTERM','SIGKILL','SIGABRT','SIGSEGV'].includes(result.signal)?result.signal:'OTHER'):null,
        errorCode,timedOut:errorCode==='ETIMEDOUT',reportExists:reportExists===true,
        stdoutBytes:Buffer.byteLength(String(result.stdout||'')),stderrBytes:Buffer.byteLength(String(result.stderr||'')),
        lastStage:last?.stage||'NO_STAGE',failedAt:last?.stage==='failed'?(stages.at(-2)?.stage||'NO_STAGE'):null,stages,loadFacts:loadFacts(loadReport,phase)};
}
function run(rootArg){
    if(process.platform!=='win32'||process.arch!=='x64'||process.env.GITHUB_ACTIONS!=='true')throw Error('Cloud Windows x64 loader diagnostic required');
    const root=path.resolve(rootArg),source=cp.execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
    if(!/^[a-f0-9]{40}$/.test(source)||source!==process.env.GITHUB_SHA)throw Error('Exact workflow source required');
    const input=require('./libmpv-input.cjs'),electron=require('./electron-runtime-input.cjs');input.validate(root);electron.validatePrepared(root);
    const mpv=path.join(root,input.INPUT_ROOT,'mpv-1.dll'),manifest=electron.readManifest(root),vulkan=path.join(root,manifest.runtime.preparedPath,'vulkan-1.dll');
    const imports=peImports(fs.readFileSync(mpv)),vulkanSha=sha(fs.readFileSync(vulkan));
    const lock=require('./templates/native-preview/verify.cjs').loaderContract(JSON.parse(fs.readFileSync(path.join(root,'native/windows-media/loader-input.json'))),manifest);
    if(vulkanSha!==lock.sha256)throw Error('Pinned Electron loader identity mismatch');
    if(!imports.some(name=>name.toLowerCase()==='vulkan-1.dll'))throw Error('Pinned import contract differs');
    const output=path.join(root,'test-output','native-loader-diagnostic'),staging=path.join(root,'.work','native-loader-diagnostic');
    if(fs.existsSync(output)||fs.existsSync(staging))throw Error('Preserve existing loader diagnostic');
    fs.mkdirSync(output,{recursive:true});fs.mkdirSync(staging,{recursive:true});
    const report={sourceCommit:source,scope:'dll-load-only-not-helper-or-video',libmpvSha256:sha(fs.readFileSync(mpv)),vulkanSource:'pinned-Electron-44.4.2-runtime',vulkanSha256:vulkanSha,imports,stages:[],completed:false};
    const powershell=path.join(process.env.ProgramFiles,'PowerShell','7','pwsh.exe');
    try{
        for(const phase of ['A','B']){
            const directory=path.join(staging,phase),file=path.join(output,phase+'.json');fs.mkdirSync(directory);
            fs.copyFileSync(mpv,path.join(directory,'mpv-1.dll'),fs.constants.COPYFILE_EXCL);
            if(phase==='B')fs.copyFileSync(vulkan,path.join(directory,'vulkan-1.dll'),fs.constants.COPYFILE_EXCL);
            const started=Date.now();
            const result=cp.spawnSync(powershell,['-NoProfile','-NonInteractive','-File',path.join(root,'tools/Test-NativeDllLoad.ps1'),'-Directory',directory,'-Report',file,'-Phase',phase],{cwd:directory,encoding:'utf8',timeout:15000,maxBuffer:65536,windowsHide:true,shell:false});
            let loadReport=null;const reportExists=fs.existsSync(file);
            if(reportExists){try{if(fs.statSync(file).size<=8192)loadReport=JSON.parse(fs.readFileSync(file,'utf8'));}catch(_){}}
            const evidence=childEvidence(result,phase,{reportExists,loadReport,elapsedMs:Date.now()-started});
            report.stages.push(evidence);
            // Only fixed enums, numeric values and booleans reach the public log.
            // Never replay raw child stdout/stderr or exception/path text.
            console.error(JSON.stringify({event:'NATIVE_LOADER_CHILD',...evidence}));
            fs.writeFileSync(path.join(output,phase+'.stdout.log'),result.stdout||'',{flag:'wx'});fs.writeFileSync(path.join(output,phase+'.stderr.log'),result.stderr||'',{flag:'wx'});
            if(result.error||result.status!==0){const error=Error('Loader diagnostic child failed');error.code='LOADER_CHILD_FAILED';error.phase=phase;throw error;}
        }
        const [a,b]=['A','B'].map(phase=>JSON.parse(fs.readFileSync(path.join(output,phase+'.json'))));
        report.assessment=assess(a,b,vulkanSha);report.completed=true;return report;
    }finally{fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
}
module.exports={peImports,assess,childStages,loadFacts,childEvidence,run};
if(require.main===module){try{console.log(JSON.stringify(run(process.argv[2])));}catch(error){console.error(JSON.stringify({event:'NATIVE_LOADER_FAILED',code:error.code==='LOADER_CHILD_FAILED'?'LOADER_CHILD_FAILED':'LOADER_PROBE_FAILED',phase:['A','B'].includes(error.phase)?error.phase:null}));process.exitCode=1;}}
