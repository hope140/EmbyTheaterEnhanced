'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {run}=require('./helpers/media-network-test-process.cjs');
test('material subprocess failure exposes bounded stage and exit information without raw child secrets',async()=>{
    const canary='PRIVATE_PROCESS_CANARY';
    const execute=(_exe,_args,_options,done)=>done(Object.assign(Error(canary),{code:3,signal:'PRIVATE',killed:false,cmd:canary}),canary,canary);
    await assert.rejects(run(canary,[canary],{stage:'http-403'},execute),error=>{
        assert.equal(error.message,'native-network-test-http-403-failed:exit=3,spawn=unknown,signal=unknown,killed=false');
        assert.ok(!JSON.stringify(Object.getOwnPropertyDescriptors(error)).includes(canary));return true;
    });
    await assert.rejects(run(canary,[],{stage:canary},(_a,_b,_c,done)=>done({code:'ENOENT',signal:'SIGTERM',killed:true},canary,canary)),
        /native-network-test-unknown-failed:exit=unknown,spawn=ENOENT,signal=SIGTERM,killed=true/);
});
test('successful material subprocess output still reaches the original safety assertions unchanged',async()=>{
    const result=await run('synthetic',[],{stage:'projection'},(_a,_b,options,done)=>{
        assert.equal(options.windowsHide,true);assert.equal(options.timeout,20000);assert.equal(options.stage,undefined);done(null,'original-output','original-stderr');
    });
    assert.deepEqual(result,{stdout:'original-output',stderr:'original-stderr'});
});
