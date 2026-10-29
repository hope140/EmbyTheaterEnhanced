'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const evidence = require('../src/electronapp/enhanced/shared-playback-cache/evidence');
const {createRecorder} = require('../src/electronapp/enhanced/bounded-diagnostics');
const {createSession} = require('../src/electronapp/enhanced/playback-range-session');
const identity = {serverOrigin:'https://server.invalid',serverId:'server-private',accountId:'account-private',itemId:'item-private',mediaSourceId:'media-private',representation:'resource-private'};
test('cross-session fingerprints are stable, scoped by account and representation, and never contain source identifiers', () => {
 const rows = [], sink = row => rows.push(row), a = evidence.create(sink, identity), b = evidence.create(sink, identity);
 a('play-open'); b('play-open');
 const mapped = {server:evidence.digest([identity.serverOrigin,identity.serverId]),account:identity.accountId,item:identity.itemId,mediaSource:identity.mediaSourceId,resource:identity.representation,representation:'authorized-original-bytes-v1'};
 evidence.create(sink,mapped)('route-open');
 assert.equal(rows[0].details.mediaHash,rows[1].details.mediaHash);assert.equal(rows[0].details.mediaHash,rows[2].details.mediaHash);assert.equal(rows[0].details.representationHash,rows[2].details.representationHash);assert.notEqual(rows[0].details.trace,rows[1].details.trace);
 evidence.create(sink,{...identity,accountId:'another'})('play-open');assert.notEqual(rows[0].details.mediaHash,rows[3].details.mediaHash);
 evidence.create(sink,{...identity,representation:'another'})('play-open');assert.equal(rows[0].details.mediaHash,rows[4].details.mediaHash);assert.notEqual(rows[0].details.representationHash,rows[4].details.representationHash);
 for(const value of Object.values(identity))assert(!JSON.stringify(rows).includes(value));
});
test('version evidence names validator strength and hashes metadata without leaking validators', () => {
 const a=evidence.version({total:64,etag:'"private-tag"',lastModified:'private-date'}),b=evidence.version({total:64,etag:'"other-tag"',lastModified:'private-date'});
 assert.equal(a.validator,'strong-etag');assert.notEqual(a.versionHash,b.versionHash);assert(!JSON.stringify(a).includes('private'));
 assert.equal(evidence.version({total:64,etag:'W/"tag"'}).validator,'weak-etag');assert.equal(evidence.version({total:64,lastModified:'date'}).validator,'last-modified-only');assert.equal(evidence.version({total:64}).validator,'none');
});
test('unknown fields, private errors, invalid counters and decoder strings cannot escape the finite schema', () => {
 const rows=[],emit=evidence.create(row=>rows.push(row),identity);
 emit('source-headers',{url:'https://private.invalid/api?token=private',authorization:'Bearer private',error:'private',versionHash:'private',rangeStart:-1,rangeEnd:Infinity,totalBytes:NaN,codec:'private',hardware:'private',phase:'private',reason:'private',queuedLocalBytes:8});
 assert.deepEqual(Object.keys(rows[0].details).sort(),['schema','trace','mediaHash','representationHash','queuedLocalBytes'].sort());assert(!JSON.stringify(rows).includes('private'));
 emit('unknown-private-event',{source:'private'});assert.equal(rows.length,1);
});
test('per-owner cap retains a single terminal total, reports omissions, and tolerates throwing or rejected sinks', async () => {
 const rows=[],emit=evidence.create(row=>rows.push(row),identity);
 for(let n=0;n<100;n++)emit('range-end',{rangeOrdinal:n+1});emit('route-end',{rangeCount:100,selectedLocalBytes:800,flushedLocalBytes:790});emit('route-end',{rangeCount:101});
 assert.equal(rows.length,33);assert.equal(rows.at(-1).details.omittedEvents,68);assert.equal(rows.at(-1).details.rangeCount,100);assert.equal(rows.at(-1).details.flushedLocalBytes,790);
 assert.doesNotThrow(()=>evidence.create(()=>{throw Error('private');},identity)('play-open'));
 evidence.create(()=>Promise.reject(Error('private')),identity)('play-open');await new Promise(resolve=>setImmediate(resolve));
});
test('the existing shared recorder bounds pending log writes and reports drops without waiting for the logger', async () => {
 const pending=[],rows=[],emit=createRecorder(row=>{rows.push(row);return new Promise(resolve=>pending.push(resolve));},'playback-cache',120);
 for(let i=0;i<60;i++)emit('range-end',{rangeOrdinal:i});assert.equal(rows.length,32);
 for(const resolve of pending.splice(0))resolve(true);await new Promise(resolve=>setImmediate(resolve));emit('route-end',{rangeCount:60});assert.equal(rows.at(-1).details.diagnosticPendingDrops,28);for(const resolve of pending)resolve(true);
});
test('session evidence associates actual events and observed decoder properties, ignores stale owners and does not query Native', async t => {
 const rows=[],helper={currentGenerationId:1,exited:false,transportTerminated:false};let gets=0;
 helper.getProperty=()=>{gets++;throw Error('must-not-query');};
 const session=createSession({config:{kind:'next-prefix',root:'/tmp/evidence-unused',preloadMB:100},onEvidence:row=>rows.push(row)});t.after(()=>session.close());
 const {representation, ...contextIdentity}=identity;
 const contextResult=await session.setContext({...contextIdentity,source:'https://server.invalid/Videos/item/stream?static=true',playSessionId:'session-private',mode:'DirectPlay',mediaType:'Video',container:'mkv'},helper,1);assert.equal(contextResult.state,'ready');
 session.mediaProperty('video-codec',null);session.mediaProperty('hwdec-current','private');session.mediaProperty('video-out-params',{});session.mediaProperty('decoder-frame-drop-count',NaN);assert.equal(rows.filter(x=>x.event==='decode-state').length,0);
 session.mediaEvent('file-loaded');session.mediaEvent('seek-requested',25);session.mediaEvent('playback-restart',25.2);session.mediaProperty('video-codec','hevc');session.mediaProperty('video-codec','private');session.mediaProperty('hwdec-current','d3d11va');session.mediaProperty('video-out-params',{w:3840,h:1920,pixelformat:'p010',private:'private'});
 assert.equal(gets,0);assert.equal(rows.filter(x=>x.event==='decode-state').length,3);assert.equal(rows.find(x=>x.event==='playback-restart').details.positionSeconds,25.2);assert(!JSON.stringify(rows).includes('private'));
 helper.currentGenerationId=2;const before=rows.length;session.mediaEvent('file-loaded');session.mediaProperty('decoder-frame-drop-count',999);assert.equal(rows.length,before);await session.retire();assert.equal(rows.at(-1).event,'play-end');assert.equal(rows.at(-1).details.decoderObserved,true);
});
