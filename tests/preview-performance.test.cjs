'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../src/electronapp/enhanced/preview-performance');
test('preview metrics keep fixed aggregates and distinguish no observations from zero-duration samples',()=>{
    let now=0;const metrics=create(['capture','copy'],()=>now);
    assert.equal(metrics.snapshot().stages.capture.averageMs,null);
    metrics.record('capture',0);metrics.record('capture',2);metrics.record('capture',10);
    for(const value of [-1,Infinity,NaN,60001])metrics.record('capture',value);
    metrics.record('untrusted-media-name',1);now=1000;
    const data=metrics.snapshot();assert.equal(data.elapsedMs,1000);assert.deepEqual(Object.keys(data.stages),['capture','copy']);
    assert.deepEqual(data.stages.capture,{count:3,totalMs:12,maxMs:10,averageMs:4,p95UpperMs:16});
    assert.throws(()=>metrics.measure('copy',()=>{now+=4;throw Error('fixture');}));
    assert.equal(metrics.snapshot().stages.copy.totalMs,4);data.stages.capture.count=200;assert.equal(metrics.snapshot().stages.capture.count,3);
    assert.doesNotMatch(JSON.stringify(metrics.snapshot()),/pixels|owner|url|media-name/);
});
