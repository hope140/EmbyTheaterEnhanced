'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),path=require('node:path');
const {PLAN,clip,loadProbeClip,assertNoSnapshotDiagnostics}=require('../tools/windows-native-owner-probe.cjs');
test('production owner probe is explicit, local-only and does not imply DWM visible acceptance',()=>{
    assert.deepEqual(JSON.parse(execFileSync(process.execPath,[path.join(__dirname,'../tools/windows-native-owner-probe.cjs'),'--describe'],{encoding:'utf8'})),PLAN);
    assert.equal(PLAN.usesServer,false);assert.equal(PLAN.snapshotUsesKoffi,false);assert.equal(PLAN.packagedSelfcheckUsesKoffi,true);assert.equal(PLAN.visibleDwmAcceptance,'NOT_ASSESSED');
});
test('probe activates its own generation before changing keep-open and loading each clip',async()=>{
    const {NativeHelperClient}=require('../src/electronapp/native-helper/controller');
    const client=new NativeHelperClient({}),commands=[];
    // Execute the production client's generation-required guards. Capture only
    // transport output: this does not execute a helper or libmpv.
    client.command=(method,params,generation)=>commands.push({method,params,generation});
    client.request=async(method,params,options)=>{commands.push({method,params,generation:options.generationId});return {};};
    for(const label of ['A','B']){
        const generation=await loadProbeClip(client,label,label+'.y4m');
        const property=commands.findLast(command=>command.method==='set-property');
        const load=commands.at(-1);assert.equal(property.generation,generation);assert.equal(load.generation,generation);
        assert.deepEqual(property.params,{name:'keep-open',value:false});assert.deepEqual(load.params.args,['loadfile',label+'.y4m','replace']);
        assert.ok(commands.indexOf(property)<commands.indexOf(load));
    }
});
test('red and green fixtures contain only bounded generated Y4M frames',()=>{
    for(const values of [[81,90,240],[145,54,34]]) {
        const bytes=clip(...values),header='YUV4MPEG2 W32 H18 F2:1 Ip A1:1 C420jpeg\n';
        assert.equal(bytes.subarray(0,header.length).toString(),header);
        assert.equal(bytes.length,header.length+12*(6+32*18+2*16*9));
        assert.equal(bytes[header.length+6],values[0]);assert.equal(bytes[header.length+6+32*18],values[1]);
    }
});
test('diagnostic guard detects wire BGR24 payloads as well as decoded BGRA',()=>{
    assert.doesNotThrow(()=>assertNoSnapshotDiagnostics({requests:[{method:'load',state:'RESOLVED'}]}));
    for(const pixels of [Buffer.from([19,67,213]).toString('base64'),Buffer.from([19,67,213,255])])
        assert.throws(()=>assertNoSnapshotDiagnostics({requests:[{detail:{pixels}}]}),/Pixels retained/);
});
