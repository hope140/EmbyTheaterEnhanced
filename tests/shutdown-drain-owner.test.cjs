'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createDrain}=require('../src/electronapp/enhanced/shutdown-drain');
const turn=()=>new Promise(r=>setImmediate(r));
function fixture(steps,extra={}){let ready=0,blocked=0,timer;const logs=[];const owner=createDrain({steps,log:r=>logs.push(r),clock:{setTimeout:f=>{timer=f;return 1;},clearTimeout:()=>{timer=null;}},onReady:()=>{ready++;},onBlocked:()=>{blocked++;},...extra});return {owner,logs,timeout:()=>timer(),get ready(){return ready;},get blocked(){return blocked;}};}
test('deadline reports pending work once and retains it until actual settlement and explicit retry',async()=>{
 let done,calls=0;const held=new Promise(r=>done=r),f=fixture({native:()=>{calls++;return held;}});
 f.owner.start();f.owner.start();f.timeout();await turn();assert.equal(f.blocked,1);assert.equal(f.ready,0);assert.deepEqual(f.owner.snapshot().pending,['native']);
 f.owner.retry();assert.equal(f.ready,0);done();await turn();assert.equal(f.ready,0);await f.owner.retry();assert.equal(f.ready,1);assert.equal(calls,1);
});
test('critical failure waits for other owners and never authorizes exit; diagnostic errors may finish',async()=>{
 let done;const f=fixture({native:()=>{throw Error('PRIVATE_CANARY');},other:()=>new Promise(r=>done=r)});f.owner.start();await turn();assert.equal(f.blocked,0);done();await turn();assert.equal(f.blocked,1);assert.equal(f.ready,0);await f.owner.retry();assert.equal(f.ready,0);assert.doesNotMatch(JSON.stringify(f.logs),/PRIVATE_CANARY/);
 const g=fixture({diagnostics:()=>Promise.reject(Error('private'))},{nonCritical:['diagnostics']});g.owner.start();await turn();assert.equal(g.ready,1);
});
test('release failure blocks, and concurrent retries cannot launch multiple handoffs',async()=>{
 let calls=0,release;const f=fixture({native:()=>{}},{onReady:()=>{calls++;if(calls===1)throw Error('private');return new Promise(r=>release=r);}});f.owner.start();await turn();assert.equal(f.blocked,1);f.owner.retry();f.owner.retry();assert.equal(calls,2);release();await turn();assert.equal(f.owner.ready,true);
});

test('late settlement cannot beat an already expired absolute deadline',async()=>{
 let now=0,done;const f=fixture({native:()=>new Promise(r=>done=r)},{now:()=>now,timeoutMs:30});f.owner.start();now=31;done();await turn();assert.equal(f.ready,0);assert.equal(f.blocked,1);await f.owner.retry();assert.equal(f.ready,1);
});
