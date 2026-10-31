'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,waitFor,gate,BLOCK}=require('./helpers/source-session-fixture.cjs');
const {createStore}=require('../src/electronapp/enhanced/shared-playback-cache/store');
async function cachedA(t,options={}){const f=await fixture(t,options),a=await f.bind(f.context('A',true));await f.read(a,'A');await f.session.started(f.helper,1);await waitFor(()=>f.session.status().diskBytes===BLOCK);return f;}
async function legacyActual(f,item='B'){f.nextGeneration();const selected=await f.bind(f.context(item));await f.read(selected,item);return{starting:f.session.started(f.helper,2)};}
async function inspect(f){return createStore({root:f.config.sharedRoot,currentBytes:BLOCK,nextBytes:100*1048576,recoveryMode:'on-demand'});}
test('committed actual cleanup runs before a waiting newer Play becomes actual',{timeout:10000},async t=>{
 const hold=gate(),f=await cachedA(t,{cleanupReadyGate:hold}),{starting}=await legacyActual(f);await waitFor(()=>f.cleanupAcquired===1);
 f.nextGeneration();let loaded=false;const next=f.bind(f.context('C',true)).then(value=>{loaded=true;return value;});await new Promise(resolve=>setImmediate(resolve));assert.equal(loaded,false);
 hold.release();await starting;const c=await next;assert(c);assert.equal(f.maintenanceStore.status().current,0,'old A is gone before C started can hide the stale-actual bug');assert.equal(f.cleanupCloses,1);assert.equal(f.session.status().kind,'shared-byte-trial');
});
test('retired committed same-media maintenance preserves its existing M without fetching a body',{timeout:10000},async t=>{
 const hold=gate(),f=await cachedA(t,{cleanupReadyGate:hold}),{starting}=await legacyActual(f,'A');await waitFor(()=>f.cleanupAcquired===1);
 const before=f.requests.length;f.budget.retire();const closing=f.session.close();hold.release();await starting;await closing;
 assert.equal(f.requests.length,before);const store=await inspect(f);try{assert.equal(store.status().current,BLOCK);assert.equal(store.status().next,0);}finally{await store.close();}
});
test('committed maintenance cannot revive cancelled next after Stop',{timeout:10000},async t=>{
 const hold=gate(),f=await cachedA(t,{cleanupReadyGate:hold}),{starting}=await legacyActual(f);await waitFor(()=>f.cleanupAcquired===1);
 const before=f.requests.length,next=f.session.preload(f.context('C'),f.helper,2);f.budget.retire();const stopping=f.session.retire();hold.release();await starting;await stopping;
 assert.equal((await next).state,'cancelled');assert.equal(f.requests.length,before);assert.equal(f.session.status().current.route,'idle');await f.session.close();const store=await inspect(f);try{assert.equal(store.status().current,0);assert.equal(store.status().next,0);}finally{await store.close();}
});
test('actual helper exit after commit still joins owned cleanup and performs no source IO',{timeout:10000},async t=>{
 const hold=gate(),f=await cachedA(t,{cleanupReadyGate:hold}),{starting}=await legacyActual(f);await waitFor(()=>f.cleanupAcquired===1);
 const before=f.requests.length;f.helper.exited=true;f.budget.retire();const closing=f.session.close();hold.release();await starting;await closing;assert.equal(f.requests.length,before);assert.equal(f.cleanupCloses,1);
 const store=await inspect(f);try{assert.equal(store.status().current,0);}finally{await store.close();}
});
test('preparing B without its actual-start signal must preserve last actual A',{timeout:10000},async t=>{
 const f=await cachedA(t);f.nextGeneration();const b=await f.bind(f.context('B'));await f.read(b,'B');await f.session.close();assert.equal(f.cleanupAcquired,0);
 const store=await inspect(f);try{assert.equal(store.status().current,BLOCK);}finally{await store.close();}
});
test('retirement before a valid budget commit performs no late maintenance; old retention remains a known limit',{timeout:10000},async t=>{
 const f=await cachedA(t);f.nextGeneration();const b=await f.bind(f.context('B'));await f.read(b,'B');const hold=gate();let requested=false;
 f.helper.getProperty=async()=>{requested=true;await hold.promise;return BLOCK;};t.after(hold.release);
 const starting=f.session.started(f.helper,2);await waitFor(()=>requested);const before=f.requests.length;f.budget.retire();const stopping=f.session.retire();hold.release();await assert.rejects(starting,/budget-unavailable/);await stopping;await f.session.close();
 assert.equal(f.requests.length,before);assert.equal(f.cleanupAcquired,0);const store=await inspect(f);try{assert.equal(store.status().current,BLOCK,'explicit remaining limitation, not full last-actual-only acceptance');}finally{await store.close();}
});
