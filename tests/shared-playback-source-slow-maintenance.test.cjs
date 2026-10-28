'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,waitFor,gate,BLOCK}=require('./helpers/source-session-fixture.cjs');
const {createStore}=require('../src/electronapp/enhanced/shared-playback-cache/store');
async function actualLegacy(t,options){
 const f=await fixture(t,options),a=await f.bind(f.context('A',true));a.commit?.();await f.read(a,'A');await f.session.started(f.helper,1);
 await waitFor(()=>f.session.status().diskBytes===BLOCK);f.nextGeneration();const b=await f.bind(f.context('B'));await f.read(b,'B');const starting=f.session.started(f.helper,2);
 return{f,starting};
}
async function reopen(f){return createStore({root:f.config.sharedRoot,currentBytes:BLOCK,nextBytes:100*1048576,recoveryMode:'on-demand'});}
for(const action of ['stop','exit'])test('different actual B must retire retained A when '+action+' interrupts an acquired maintenance factory', {timeout:10000},async t=>{
 const hold=gate(),{f,starting}=await actualLegacy(t,{cleanupReadyGate:hold});await waitFor(()=>f.cleanupAcquired===1);
 assert.equal(f.maintenanceStore.status().closed,false);assert.equal(f.maintenanceStore.status().current,BLOCK,'A still exists while maintenance is held');
 let done=false;f.budget.retire();const stopping=(action==='exit'?f.session.close():f.session.retire()).then(()=>{done=true;});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(done,false,'physical maintenance remains joined');
 hold.release();await starting;await stopping;if(action==='stop')await f.session.close();
 assert.equal(f.cleanupCloses,1);const restored=await reopen(f);
 try{assert.equal(restored.status().current,0,'different B was actually started: A must not survive cancellation/exit');assert.equal(restored.status().currentKey,null);assert.equal(restored.status().next,0);}finally{await restored.close();}
});
test('maintenance close gate keeps its guard until real close, and exits without stale A', {timeout:10000},async t=>{
 const hold=gate(),{f,starting}=await actualLegacy(t,{cleanupCloseGate:hold});await waitFor(()=>f.cleanupCloseEntered===1);
 assert.equal(f.maintenanceStore.status().closed,false);assert.equal(f.maintenanceStore.status().current,0,'actual B cleanup already completed before close gate');
 await assert.rejects(reopen(f),'another store cannot acquire the held maintenance root');
 let closed=false;f.budget.retire();const closing=f.session.close().then(()=>{closed=true;});await new Promise(resolve=>setImmediate(resolve));assert.equal(closed,false);
 hold.release();await starting;await closing;assert.equal(f.cleanupCloses,1);const restored=await reopen(f);try{assert.equal(restored.status().current,0);assert.equal(restored.status().next,0);}finally{await restored.close();}
});
test('a new shared Play cannot acquire the root before a slow maintenance store really closes', {timeout:10000},async t=>{
 const hold=gate(),{f,starting}=await actualLegacy(t,{cleanupCloseGate:hold});await waitFor(()=>f.cleanupCloseEntered===1);
 f.nextGeneration();let selected=false;const playing=f.bind(f.context('C',true)).then(value=>{selected=!!value;return value;});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(selected,false);assert.equal(f.cleanupCloses,0);
 hold.release();await starting;const c=await playing;assert(c);
 assert.equal(f.maintenanceStore.status().current,0,'B was actual before C: old A must be gone before C becomes actual');
 c.commit?.();await f.read(c,'C');await f.session.started(f.helper,3);
 assert.equal(f.cleanupCloses,1);assert.equal(f.session.status().kind,'shared-byte-trial');await f.session.close();
});
