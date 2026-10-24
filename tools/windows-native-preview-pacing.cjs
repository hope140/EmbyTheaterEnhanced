'use strict';
// Cloud-only synthetic production-helper capture measurement. No DWM, server,
// account, user profile or real media; helper CPU is not total application/GPU cost.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const {performance}=require('node:perf_hooks');
const {create}=require('../src/electronapp/enhanced/preview-performance');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const SCOPE='production-helper-preview-pacing';
function writeFixture(file){
    const width=1280,height=720,frames=120,fd=fs.openSync(file,'wx'),hash=crypto.createHash('sha256');
    const write=bytes=>{fs.writeSync(fd,bytes);hash.update(bytes);};
    try{
        write(Buffer.from(`YUV4MPEG2 W${width} H${height} F4:1 Ip A1:1 C420jpeg\n`));
        const y=Buffer.alloc(width*height),uv=Buffer.alloc(width*height/2,128);
        for(let frame=0;frame<frames;frame++){
            for(let x=0;x<width;x++)y[x]=((Math.floor(x/80)+frame)%2)?190:55;
            for(let row=1;row<height;row++)y.copy(y,row*width,0,width);
            write(Buffer.from('FRAME\n'));write(y);write(uv);
        }
    }finally{fs.closeSync(fd);}
    return {sha256:hash.digest('hex'),width,height,frames,frameRate:4,durationMs:30000};
}
function ownedCpu(pid){
    if(process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true'||!Number.isSafeInteger(pid)||pid<1)throw Error('CLOUD_OWNED_CPU_REQUIRED');
    // Only the numeric PID of the helper just spawned by this probe. Read-only,
    // no elevation, window launch, process termination or system configuration.
    const command=`$ErrorActionPreference='Stop';$p=Get-Process -Id ${pid};[pscustomobject]@{cpuMs=$p.TotalProcessorTime.TotalMilliseconds;workingSetBytes=$p.WorkingSet64}|ConvertTo-Json -Compress`;
    try{
        const value=JSON.parse(cp.execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true,timeout:5000}));
        if(!Number.isFinite(value.cpuMs)||value.cpuMs<0||!Number.isSafeInteger(value.workingSetBytes)||value.workingSetBytes<0)throw Error('CPU_SHAPE');
        return {status:'measured',...value};
    }catch(_){return {status:'UNAVAILABLE'};}
}
async function sample({client,generation,decode,intervalMs,durationMs=10000,now=()=>performance.now(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
    if(![550,1000].includes(intervalMs)||!Number.isFinite(durationMs)||durationMs<1000||durationMs>15000)throw Error('PACING_ARGUMENTS');
    const start=now(),metrics=create(['roundTrip','nativeWait','nativeCopy','nativeResize','nativeEncode'],now);
    let requests=0,valid=0,unavailable=0,changes=0,previousHash=null,firstAt=null,lastAt=null,intervalTotal=0;
    while(now()-start<durationMs){
        const begin=now();requests++;
        const value=await client.request('preview-snapshot',{}, {generationId:generation,timeoutMs:1800}),frame=decode(value,generation);
        metrics.record('roundTrip',Math.max(0,now()-begin));
        if(frame){
            if(value.generationId!==generation)throw Error('PACING_OWNER_MISMATCH');
            const at=now(),digest=sha(frame.pixels);if(firstAt===null)firstAt=at;if(lastAt!==null)intervalTotal+=at-lastAt;lastAt=at;
            if(digest!==previousHash){changes++;previousHash=digest;}valid++;
            const names={waitMicros:'nativeWait',copyMicros:'nativeCopy',resizeMicros:'nativeResize',encodeMicros:'nativeEncode'};
            if(!frame.timing)throw Error('PACING_TIMING_REQUIRED');
            for(const [key,name]of Object.entries(names))metrics.record(name,frame.timing[key]/1000);
        }else unavailable++;
        const delay=Math.min(Math.max(0,intervalMs-(now()-begin)),Math.max(0,durationMs-(now()-start)));
        if(delay)await sleep(delay);
    }
    const elapsedMs=now()-start;
    if(valid<2)throw Error('PACING_VALID_SAMPLES_REQUIRED');
    return {requests,valid,unavailable,changes,elapsedMs,validPerSecond:valid*1000/elapsedMs,averageValidIntervalMs:intervalTotal/(valid-1),metrics:metrics.snapshot()};
}
async function measure({client,generation,decode,output,intervalMs,fixture}){
    // Wait for an owner-confirmed first frame. Retry delays do not prove ownership.
    let ready=false;
    for(let i=0;i<6;i++){
        if(decode(await client.request('preview-snapshot',{}, {generationId:generation,timeoutMs:1800}),generation)){ready=true;break;}
        await new Promise(resolve=>setTimeout(resolve,1000));
    }
    if(!ready)throw Error('PACING_FIRST_FRAME_REQUIRED');
    await new Promise(resolve=>setTimeout(resolve,1100));
    const cpuStartAt=performance.now(),before=ownedCpu(client.child.pid);
    const captures=await sample({client,generation,decode,intervalMs});
    const after=ownedCpu(client.child.pid),cpuElapsedMs=performance.now()-cpuStartAt;
    const cpu=before.status==='measured'&&after.status==='measured'&&after.cpuMs>=before.cpuMs?
        {status:'measured',scope:'helper-only-one-core-percent',elapsedMs:cpuElapsedMs,cpuMs:after.cpuMs-before.cpuMs,oneCorePercent:100*(after.cpuMs-before.cpuMs)/cpuElapsedMs,workingSetBefore:before.workingSetBytes,workingSetAfter:after.workingSetBytes}:
        {status:'UNAVAILABLE',scope:'helper-only-one-core-percent'};
    const result={scope:SCOPE,intervalMs,fixture,captures,cpu,mainCpu:'NOT_ASSESSED',gpuCost:'NOT_ASSESSED',dwmPresentation:'NOT_ASSESSED'};
    fs.writeFileSync(path.join(output,'pacing.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});return result;
}
function validateReport(end,measurement,intervalMs){
    const c=measurement?.captures,fixture=measurement?.fixture;
    if(end.scope!==SCOPE||JSON.stringify(end.pacing)!==JSON.stringify(measurement)||end.pacing?.intervalMs!==intervalMs||measurement?.scope!==SCOPE||measurement.intervalMs!==intervalMs||
        measurement.dwmPresentation!=='NOT_ASSESSED'||measurement.mainCpu!=='NOT_ASSESSED'||measurement.gpuCost!=='NOT_ASSESSED'||
        !/^[a-f0-9]{64}$/.test(fixture?.sha256||'')||fixture.width!==1280||fixture.height!==720||fixture.frames!==120||fixture.frameRate!==4||
        !c||!['requests','valid','unavailable','changes'].every(key=>Number.isSafeInteger(c[key])&&c[key]>=0)||c.valid+c.unavailable!==c.requests||c.changes>c.valid||!Number.isInteger(c.valid)||c.valid<2||c.valid>c.requests||c.requests>Math.ceil(c.elapsedMs/intervalMs)+1||
        !Number.isFinite(c.elapsedMs)||c.elapsedMs<10000||c.elapsedMs>15000||!Number.isFinite(c.averageValidIntervalMs)||c.averageValidIntervalMs<(intervalMs===550?500:950)||
        !Number.isFinite(c.validPerSecond)||Math.abs(c.validPerSecond-c.valid*1000/c.elapsedMs)>1e-9||
        !['nativeWait','nativeCopy','nativeResize','nativeEncode'].every(name=>c.metrics?.stages?.[name]?.count===c.valid)||
        !['measured','UNAVAILABLE'].includes(measurement.cpu?.status)||measurement.cpu?.scope!=='helper-only-one-core-percent'||
        measurement.cpu?.status==='measured'&&!['elapsedMs','cpuMs','oneCorePercent','workingSetBefore','workingSetAfter'].every(key=>Number.isFinite(measurement.cpu[key])&&measurement.cpu[key]>=0))throw Error('PACING_REPORT_NOT_ACCEPTED');
    return measurement;
}
module.exports={SCOPE,writeFixture,sample,measure,validateReport};
