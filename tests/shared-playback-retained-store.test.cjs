'use strict';
// Real store/guard/filesystem coverage for the normal permitted Windows route.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {temporaryRoot}=require('./helpers/range-fixture-root.cjs');
const {createStore}=require('../src/electronapp/enhanced/shared-playback-cache/store');
const identity=item=>({server:'server-owned',account:'account-owned',item,mediaSource:'source-owned',resource:'resource-owned',representation:'original'});
const metadata={total:16,etag:'"SYNTHETIC-STRONG-VALIDATOR-FOR-RETAINED"',lastModified:'Wed, 21 Oct 2026 08:00:00 GMT'};
async function fixture(t){
 const roots=[],stores=[];t.after(async()=>{const done=await Promise.allSettled(stores.map(s=>s.close()));await Promise.all(roots.map(r=>fs.rm(r,{recursive:true,force:true})));for(const x of done)if(x.status==='rejected')throw x.reason;});
 const root=temporaryRoot('ete-retained-',['']);roots.push(root);
 const create=async(directory=root)=>{const s=await createStore({root:directory,currentBytes:32,nextBytes:32,recoveryMode:'on-demand'});stores.push(s);return s;};
 const seed=await create(),key=await seed.open(identity('A'),metadata,'next');assert(await seed.put(key,0,Buffer.from('01234567')));await seed.actual(key);await seed.close();
 const store=await create();return{root,key,store,create,roots};
}
test('retained candidates survive process-style reopen without raw validators or any role/key mutation',async t=>{
 const f=await fixture(t),before=f.store.status(),candidate=await f.store.retainedCandidate(identity('A'));
 assert(candidate);assert(Object.isFrozen(candidate));assert.equal(candidate.total,16);assert(!JSON.stringify(candidate).includes('SYNTHETIC-STRONG'));assert(!JSON.stringify(candidate).includes('Wed,'));
 assert.equal(await f.store.openRetained(identity('A'),candidate),f.key);assert.equal(f.store.status().currentKey,before.currentKey);assert.equal(f.store.status().current,before.current);
 assert.equal(f.store.matchRetained(candidate,{total:16,etag:metadata.etag}),true,'strong ETag proves the bytes without requiring identical date metadata');
 for(const meta of [{total:17,etag:metadata.etag},{total:16,etag:'"new"'},{total:16},{total:16,etag:'W/'+metadata.etag}])assert.equal(f.store.matchRetained(candidate,meta),false);
 assert.deepEqual(await f.store.read(f.key,3,4),Buffer.from('3456'));
 const disk=await fs.readFile(f.root+'/index.json','utf8');assert(!disk.includes('SYNTHETIC-STRONG'));assert(!disk.includes('server-owned'));
});
test('retained proof cannot be cloned, transferred to another store, or used for another full identity',async t=>{
 const f=await fixture(t),candidate=await f.store.retainedCandidate(identity('A'));
 await assert.rejects(f.store.openRetained(identity('A'),{...candidate}));assert.equal(f.store.matchRetained({...candidate},{total:16,etag:metadata.etag}),false);
 for(const patch of [{account:'another'},{server:'another'},{mediaSource:'another'},{resource:'another'},{representation:'another'}]){assert.equal(await f.store.retainedCandidate({...identity('A'),...patch}),null);await assert.rejects(f.store.openRetained({...identity('A'),...patch},candidate));}
 const otherRoot=temporaryRoot('ete-retained-other-',['']);f.roots.push(otherRoot);const other=await f.create(otherRoot);await assert.rejects(other.openRetained(identity('A'),candidate));
});
test('delete and same-key recreation cannot revive an old entry proof or invalidate its replacement',async t=>{
 const f=await fixture(t),candidate=await f.store.retainedCandidate(identity('A'));assert(await f.store.invalidate(f.key));
 const replacement=await f.store.open(identity('A'),metadata,'next');assert.equal(replacement,f.key);assert(await f.store.put(replacement,0,Buffer.from('01234567')));await f.store.actual(replacement);
 assert.equal(f.store.matchRetained(candidate,{total:16,etag:metadata.etag}),false);await assert.rejects(f.store.openRetained(identity('A'),candidate));assert.equal(await f.store.invalidateRetained(candidate),false);assert.equal(f.store.status().currentKey,replacement);assert.equal(f.store.coverage(replacement).bytes,8);
});
test('retirement and queued actual changes reject late claims and cannot purge the new actual',async t=>{
 const f=await fixture(t);let live=true;const cancelled=await f.store.retainedCandidate(identity('A'),{isCurrent:()=>live});live=false;assert.equal(f.store.matchRetained(cancelled,{total:16,etag:metadata.etag}),false);live=true;await assert.rejects(f.store.openRetained(identity('A'),cancelled),'an observed retired proof remains retired');
 const candidate=await f.store.retainedCandidate(identity('A')),b=await f.store.open(identity('B'),metadata,'next');assert(await f.store.put(b,0,Buffer.from('abcdefgh')));
 const actual=f.store.actual(b),late=f.store.openRetained(identity('A'),candidate);await actual;await assert.rejects(late);assert.equal(await f.store.invalidateRetained(candidate),false);assert.equal(f.store.status().currentKey,b);assert.equal(f.store.coverage(b).bytes,8);
 await f.store.close();assert.equal(f.store.matchRetained(candidate,{total:16,etag:metadata.etag}),false);
});
