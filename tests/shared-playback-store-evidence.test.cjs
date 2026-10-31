'use strict';
// Real owned filesystem and guard, executed by the normal Windows test route.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {temporaryRoot}=require('./helpers/range-fixture-root.cjs');
const {createStore}=require('../src/electronapp/enhanced/shared-playback-cache/store');
const evidence=require('../src/electronapp/enhanced/shared-playback-cache/evidence');
test('store evidence separates retained actual, cancelled next and another actual-media cleanup across reopen',async t=>{
 const root=temporaryRoot('ete-store-evidence-',['']),rows=[],meta={total:16,etag:'"synthetic-v1"'},make=item=>({server:'server',account:'account',item,mediaSource:'media',resource:'resource',representation:'original'});
 let store; t.after(async()=>{if(store)await store.close();await fs.rm(root,{recursive:true,force:true});});
 const open=()=>createStore({root,currentBytes:16,nextBytes:16,onEvidence:row=>rows.push(row)});
 store=await open();const a=await store.open(make('A'),meta,'next');assert(await store.put(a,0,Buffer.alloc(8,65)));await store.actual(a);await store.close();store=null;
 const first=rows.find(x=>x.event==='store-close');assert.equal(first.details.retainedBytes,8);assert.equal(first.details.preloadedBytes,0);
 store=await open();const b=await store.open(make('B'),meta,'next');assert(await store.put(b,0,Buffer.alloc(8,66)));await store.discardNext();
 const cancelled=rows.find(x=>x.event==='entry-retired'&&x.details.reason==='next-cancelled');assert(cancelled);assert.notEqual(cancelled.details.mediaHash,first.details.mediaHash);
 assert.equal(await store.forgetActualUnlessMedia(make('A')),false);assert.equal(rows.find(x=>x.event==='actual-preserved').details.mediaHash,first.details.mediaHash);assert.equal(rows.find(x=>x.event==='actual-promoted').details.retainedBytes,8);assert.equal(rows.filter(x=>x.event==='entry-retired'&&x.details.reason==='actual-media-changed').length,0);
 assert.equal(await store.forgetActualUnlessMedia(make('C')),true);const changed=rows.find(x=>x.event==='entry-retired'&&x.details.reason==='actual-media-changed');assert.equal(changed.details.mediaHash,first.details.mediaHash);assert.equal(changed.details.retainedBytes,8);assert.equal(changed.details.versionHash,evidence.version(meta).versionHash);
 await store.close();store=null;assert.equal(rows.at(-1).details.retainedBytes,0);assert.equal(rows.at(-1).details.refusedBlocks,0);
});
