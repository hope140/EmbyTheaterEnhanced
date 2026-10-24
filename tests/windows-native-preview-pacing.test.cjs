'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const tool=require('../tools/windows-native-preview-pacing.cjs');
const fixture={sha256:'a'.repeat(64),width:1280,height:720,frames:120,frameRate:4,durationMs:30000};
async function simulated(intervalMs,extra={}){
    let time=0,pending=0,maximum=0,calls=0;
    const result=await tool.sample({intervalMs,now:()=>time,sleep:async ms=>{time+=ms;},generation:12,
        client:{async request(method,params,options){assert.equal(method,'preview-snapshot');assert.equal(options.generationId,12);maximum=Math.max(maximum,++pending);time+=10;pending--;return {generationId:12,tick:++calls};}},
        decode:value=>({pixels:Buffer.from([value.tick]),timing:{waitMicros:100,copyMicros:10,resizeMicros:20,encodeMicros:30}}),...extra});
    return {result,maximum};
}
test('serial synthetic sampler measures completed replies and keeps all fixed native timing stages',async()=>{
    const a=await simulated(1000),b=await simulated(550);
    assert.equal(a.maximum,1);assert.equal(b.maximum,1);assert.equal(a.result.valid,10);assert.equal(b.result.valid,19);
    assert.equal(a.result.averageValidIntervalMs,1000);assert.equal(b.result.averageValidIntervalMs,550);
    assert.equal(b.result.metrics.stages.nativeCopy.count,19);assert.equal(b.result.changes,19);
    assert.equal(b.result.elapsedMs,10000);assert.equal(b.result.validPerSecond,1.9,'completed sample count / actual observation time, not rendered FPS');
});
test('snapshot decoder generation contract, missing timing and unavailable samples fail closed',async()=>{
    await assert.rejects(simulated(500),/PACING_ARGUMENTS/);
    await assert.rejects(simulated(550,{decode:()=>null}),/VALID_SAMPLES/);
    await assert.rejects(simulated(550,{decode:()=>({pixels:Buffer.alloc(4)})}),/TIMING_REQUIRED/);
    await assert.rejects(simulated(550,{client:{async request(){return {generationId:11};}}}),/OWNER_MISMATCH/);
    await assert.rejects(simulated(550,{client:{async request(){throw Object.assign(Error('retired'),{state:'GENERATION_RETIRED'});}}}),/retired/);
});
test('strict report cannot convert capture measurement into owner, DWM, GPU or whole-application acceptance',async()=>{
    const measurement={scope:tool.SCOPE,intervalMs:550,fixture,captures:(await simulated(550)).result,cpu:{status:'UNAVAILABLE',scope:'helper-only-one-core-percent'},mainCpu:'NOT_ASSESSED',gpuCost:'NOT_ASSESSED',dwmPresentation:'NOT_ASSESSED'};
    const accept=value=>tool.validateReport({scope:tool.SCOPE,pacing:value},value,550);
    assert.equal(accept(measurement),measurement);
    for(const mutate of [v=>v.scope='production-helper-owner-snapshot',v=>v.intervalMs=1000,v=>v.fixture.sha256='bad',v=>v.captures.valid=0,v=>v.captures.requests=200,v=>v.captures.averageValidIntervalMs=300,v=>v.captures.metrics.stages.nativeWait.count=0,v=>v.cpu.status='passed',v=>v.dwmPresentation='passed',v=>v.mainCpu='passed',v=>v.gpuCost='passed']){
        const bad=structuredClone(measurement);mutate(bad);assert.throws(()=>accept(bad),/PACING_REPORT/);
    }
});
test('fixed 720p local fixture is bounded moving luminance, without media or external input',t=>{
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ete-pacing-fixture-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
    const file=path.join(directory,'generated.y4m'),value=tool.writeFixture(file),fd=fs.openSync(file,'r');
    const header=Buffer.from('YUV4MPEG2 W1280 H720 F4:1 Ip A1:1 C420jpeg\n'),frameBytes=1280*720*3/2+6;
    try{
        const bytes=Buffer.alloc(header.length+7);fs.readSync(fd,bytes,0,bytes.length,0);assert.deepEqual(bytes.subarray(0,header.length),header);assert.equal(bytes.at(-1),55);
        const second=Buffer.alloc(7);fs.readSync(fd,second,0,7,header.length+frameBytes);assert.equal(second.at(-1),190);
        assert.equal(fs.statSync(file).size,header.length+120*frameBytes);assert.equal(value.durationMs,30000);assert.match(value.sha256,/^[a-f0-9]{64}$/);
        assert.throws(()=>tool.writeFixture(file),{code:'EEXIST'});
    }finally{fs.closeSync(fd);}
});
test('cloud-only short route is explicit, mutually exclusive, source-bound and does not run Host/package acquisition',()=>{
    const root=path.resolve(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
    const ci=read('tools/ci-windows-test-package.ps1'),prepare=read('tools/prepare-native-loader-probe.ps1'),workflow=read('.github/workflows/public-ci.yml');
    assert.match(workflow,/native_preview_pacing_only:[\s\S]*?default: false/);
    assert.match(ci,/Preview pacing must be selected alone/);
    const begin=ci.indexOf('if ($NativePreviewPacingOnly) {'),end=ci.indexOf('\n}',begin);assert.ok(begin>0&&end<ci.indexOf('& npm ci'));
    assert.match(ci.slice(begin,end),/-HelperStartup -PreviewPacing[\s\S]*return/);
    assert.match(prepare,/GITHUB_ACTIONS -ne 'true'/);assert.match(prepare,/-NativeOnly/);assert.match(prepare,/build-native-helper\.ps1/);
    assert.doesNotMatch(prepare,/build-source-host|SetDllDirectory|AddDllDirectory|Set-ExecutionPolicy/);
    assert.match(workflow,/if: always\(\) && \(inputs.native_helper_only \|\| inputs.native_preview_pacing_only\)/);
    const owner=read('tools/windows-native-owner-probe.cjs');assert.match(owner,/pacing&&\(packaged\|\|process.env.GITHUB_ACTIONS!=='true'/);
    assert.match(owner,/await finishOwnerProbe\(client,exitState\),scope,pacing:result/);
    const startup=read('tools/windows-native-helper-startup.cjs');assert.match(startup,/for\(const intervalMs of \[1000,550\]\)/);
    assert.match(startup,/fixture.sha256!==candidate.fixture.sha256/);assert.doesNotMatch(startup,/copyFileSync\([^\n]*synthetic/);
});
