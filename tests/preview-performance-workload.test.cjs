'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {workload}=require('../tools/benchmark-preview-work.cjs');
test('same-source controlled workloads reduce redundant work without increasing moving capture rate',async()=>{
    const root=path.resolve(__dirname,'..');
    for(const scenario of ['moving','static','paused']){
        const baseline=await workload(root,scenario,{savings:false}),candidate=await workload(root,scenario,{savings:true});
        assert.equal(baseline.adapterSha256,candidate.adapterSha256);assert.equal(baseline.dwmSha256,candidate.dwmSha256);
        assert.deepEqual(baseline.window,candidate.window);assert.equal(baseline.content,candidate.content);
        assert.ok(candidate.counts.resizes<baseline.counts.resizes);
        if(scenario==='paused')assert.ok(candidate.counts.captures<baseline.counts.captures);
        else assert.equal(candidate.counts.captures,baseline.counts.captures);
        if(scenario==='static'){
            assert.ok(candidate.counts.nativeImages<baseline.counts.nativeImages);
            assert.equal(candidate.counts.invalidations,baseline.counts.invalidations,'keep the feedback needed to detect later motion');
        }
    }
});
