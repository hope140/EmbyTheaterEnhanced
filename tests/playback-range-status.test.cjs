'use strict';
// Controlled state/diagnostic integration only; no real account or Native helper.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createSession,contextDiagnostic}=require('../src/electronapp/enhanced/playback-range-session');
const diagnostics=require('../src/electronapp/enhanced/playback-range-diagnostics');
const renderer=require('../src/electronapp/enhanced/playback-range-renderer');
const routeStats=require('../src/electronapp/enhanced/playback-route-stats');
const origin='http://127.0.0.1:19000';
function context(overrides={}) {return {source:origin+'/a.mp4?Static=true',serverOrigin:origin,serverId:'s',accountId:'u',itemId:'A',mediaSourceId:'mA',playSessionId:'p',mode:'DirectStream',mediaType:'Video',container:'mp4',live:false,...overrides};}
const config={kind:'next-prefix',root:path.resolve('unused-controlled-root'),progressPercent:70,preloadMB:300,timeoutMs:1000};
function fixture(t,{currentError,nextError,prefetch}={}) {
    const events=[],helper={currentGenerationId:1},calls=[];
    const handle=()=>({source:'http://127.0.0.1:19001/proxy',status:()=>({total:40,bytes:0}),stop:async()=>{},markPlaying:async()=>{},prefetch:prefetch|| (async()=>({bytes:40}))});
    const cache={open:async input=>{calls.push(input);const error=calls.length===1?currentError:nextError;if(error)throw error;return handle();},discardNext:async()=>{},close:async()=>{},status:()=>({bytes:0})};
    const session=createSession({config,create:async()=>cache,onDiagnostic:value=>events.push(value)});t.after(()=>session.close());
    return {session,helper,calls,events};
}
async function start(f,value=context()) {await f.session.setContext(value,f.helper,1);const selected=await f.session.select(value.source,f.helper,1);await f.session.started(f.helper,1);return selected;}
test('current external resolved source preserves its specific refusal before any next Range request',async t=>{
    const f=fixture(t),value=context({source:'http://127.0.0.1:19002/a.mp4?private=synthetic-canary'});
    assert.equal(await start(f,value),null);assert.equal(f.calls.length,0);
    const result=await f.session.preload(context({itemId:'B',mediaSourceId:'mB'}),f.helper,1);
    assert.equal(result.state,'unavailable');assert.deepEqual(result.diagnostic,{stage:'current-context',reason:'source-cross-origin'});
    assert.equal(f.calls.length,0,'do not remove current proxy ownership prerequisite');
    assert(!JSON.stringify([result,f.session.status(),f.events]).includes('synthetic-canary'));
});
test('STRM container and extended file options retain distinct current-context reasons',async t=>{
    const f=fixture(t);assert.equal(contextDiagnostic(context({container:'strm'})).reason,'container-unsupported');
    await f.session.setContext(context(),f.helper,1);f.session.unproxied('file-options-unproxied',f.helper,1);await f.session.started(f.helper,1);
    const result=await f.session.preload(context({itemId:'B',mediaSourceId:'mB'}),f.helper,1);
    assert.equal(result.diagnostic.reason,'file-options-unproxied');assert.equal(f.calls.length,0);
});
test('unproxied file option observation cannot erase the earlier concrete context refusal',async t=>{
    const f=fixture(t);await f.session.setContext(context({source:'file:///synthetic.avi'}),f.helper,1);
    f.session.unproxied('file-options-unproxied',f.helper,1);assert.equal(f.session.status().current.diagnostic.reason,'source-not-http');
});
test('current probe diagnosis survives until next refusal and unknown exception data never escapes',async t=>{
    const error=diagnostics.error('auth-required','private URL/token must not escape',403),f=fixture(t,{currentError:error});
    assert.equal(await start(f),null);const result=await f.session.preload(context({itemId:'B',mediaSourceId:'mB'}),f.helper,1);
    assert.deepEqual(result.diagnostic,{stage:'current-probe',reason:'auth-required',httpStatus:403});
    assert(!JSON.stringify([f.events,result,f.session.status()]).includes('private URL'));
});
for(const point of ['probe','prefix'])test('next '+point+' refusal keeps the exact safe phase and reason',async t=>{
    const error=diagnostics.error('etag-weak','arbitrary-sensitive-source'),f=fixture(t,point==='probe'?{nextError:error}:{prefetch:async()=>{throw error;}});
    assert(await start(f));const result=await f.session.preload(context({itemId:'B',mediaSourceId:'mB'}),f.helper,1);
    assert.equal(result.state,'unavailable');assert.deepEqual(result.diagnostic,{stage:'next-'+point,reason:'etag-weak'});
    assert.deepEqual(f.session.status().next.diagnostic,result.diagnostic);
});
test('a retired next job cannot publish its late rejection into cancellation or another generation',async t=>{
    let reject,started;const begun=new Promise(resolve=>{started=resolve;}),f=fixture(t,{prefetch:()=>{started();return new Promise((_,fail)=>{reject=fail;});}});
    await start(f);const work=f.session.preload(context({itemId:'B',mediaSourceId:'mB'}),f.helper,1);await begun;
    await f.session.cancelNext();reject(diagnostics.error('etag-weak','late private body'));await work;
    assert.equal(f.session.status().next.state,'idle');assert.equal(f.session.status().next.diagnostic,undefined);
    f.helper.currentGenerationId=2;const retired=await f.session.preload(context({itemId:'C',mediaSourceId:'mC'}),f.helper,1);
    assert.equal(retired.diagnostic.reason,'generation-retired');assert.equal(f.session.status().next.diagnostic,undefined);
});
function rendererFixture(t,mutate,fetchFailure) {
    const abort=new AbortController(),item={Id:'A',ServerId:'s',Type:'Episode',MediaType:'Video',SeriesId:'series'},next={...item,Id:'B'};
    const media={Id:'mA',Container:'mp4'},options={playSessionId:'p',playMethod:'DirectStream'},events=[];
    const api={_identityEpoch:0,serverAddress:()=>origin,serverId:()=> 's',getCurrentUserId:()=> 'u',deviceId:()=> 'd',accessToken:()=> 'never-log-this',getUrl:value=>new URL(value,origin+'/').href,setAuthorizationInfoIntoRequest:()=>{}};
    const player={getDeviceProfile:async()=>({})},binding={setContext:async()=>({value:{state:'ready'}}),cancelNext:async()=>{},retire:async()=>{},status:async()=>({value:{enabled:true,next:{state:'idle'},current:{state:'active'}}}),preload:async()=>({value:{state:'ready'}})};
    const candidate={...next,MediaSources:[{Id:'mB',Container:'mp4',SupportsDirectStream:true}]};if(mutate)mutate(candidate);
    const input={endpoint:{rangeCache:{enabled:true,progressPercent:70,timeoutMs:1000},createRangeBinding:()=>binding},connectionManager:{getApiClient:()=>api},playbackManager:{getCurrentPlayer:()=>player,_playQueueManager:{getNextItemInfo:()=>({item:next})}},player,item,mediaSource:media,options,source:context().source,signal:abort.signal,isCurrent:()=>true,position:()=>({positionTicks:75,durationTicks:100}),onDiagnostic:value=>events.push(value),resolveSource:async value=>({source:value.nativeSource}),fetch:async(url,request)=>{if(fetchFailure)throw Error('private token raw error');const response=new Response(JSON.stringify(request.method==='POST'?{MediaSources:candidate.MediaSources}:candidate));Object.defineProperty(response,'url',{value:origin+'/metadata/B'});return response;}};
    t.after(()=>abort.abort());return {input,events,binding};
}
for(const [kind,mutate,expected] of [['source-count',v=>v.MediaSources.push({...v.MediaSources[0]}),'source-count'],['direct',v=>v.MediaSources[0].SupportsDirectStream=false,'directstream-required'],['identity',v=>v.SeriesId='other','next-identity'],['cross-origin',v=>v.MediaSources[0].DirectStreamUrl='http://127.0.0.1:19002/b','source-cross-origin']])test('metadata rejection '+kind+' is visible and finite',async t=>{
    const f=rendererFixture(t,mutate),controller=await renderer.bind(f.input);t.after(()=>controller.close());controller.started();await controller.tick();await new Promise(setImmediate);
    const category=await controller.category();assert.equal(category.name,'Emby Theater Enhanced');assert.equal(category.stats[0].label,'预载:');
    assert(category.stats[0].value.includes('[next-metadata/'+expected+']'));assert.equal(f.events.at(-1).reason,expected);
    assert(!JSON.stringify(category).includes('never-log-this'));
});
test('raw renderer network errors become a fixed reason instead of leaking or asserting a redirect',async t=>{
    const f=rendererFixture(t,null,true),controller=await renderer.bind(f.input);t.after(()=>controller.close());controller.started();await controller.tick();await new Promise(setImmediate);
    const result=await controller.category();assert(result.stats[0].value.includes('network-failed'));assert(!JSON.stringify([result,f.events]).includes('raw error'));assert(!JSON.stringify(result).includes('metadata-redirect'));
});
test('preload status shares one Enhanced group, retains route/MB data and does not mutate route snapshot',()=>{
    const route=routeStats.makeStats({isStrm:true,route:'cd2-http'}),before=JSON.stringify(route),status=renderer.category('warming',null,{bytes:120000000,targetBytes:300000000});
    const merged=routeStats.mergePreload(route,status);assert.equal(merged.type,'enhanced');assert.equal(merged.name,'Emby Theater Enhanced');
    assert.equal(merged.stats.filter(row=>row.label==='预载:').length,1);assert(merged.stats.at(-1).value.includes('120.0 MB / 300.0 MB'));assert.equal(JSON.stringify(route),before);
});
test('getStats discards delayed old-request preload results, while disabled playback stays explicit',async()=>{
    const body=fs.readFileSync(path.join(__dirname,'../src/electronapp/plugins/libmpv.js'),'utf8'),start=body.indexOf('        self.getStats = function () {'),end=body.indexOf('\n        function mapRange(',start);
    let resolve;const a={rangeCache:{category:()=>new Promise(done=>{resolve=done;})}},scope={self:{},Promise,activePlayRequest:a,libmpv:{rangeCache:{enabled:true}},getMediaStats:async()=>({type:'media'}),getVideoStats:async()=>({type:'video'}),getAudioStats:async()=>({type:'audio'}),enhancedRouteState:{category:()=>routeStats.makeStats({route:'native'})},playbackRouteStats:routeStats};
    vm.createContext(scope);vm.runInContext(body.slice(start,end),scope);const pending=scope.self.getStats();await new Promise(setImmediate);scope.activePlayRequest={};resolve(renderer.category('ready',null,{bytes:40,targetBytes:40}));
    const old=await pending;assert.equal(old.categories.length,3);assert(!JSON.stringify(old).includes('预载完成'));
    scope.libmpv.rangeCache=null;const disabled=await scope.self.getStats();const enhanced=disabled.categories.filter(value=>value.type==='enhanced');assert.equal(enhanced.length,1);assert.equal(enhanced[0].stats.at(-1).value,'未启用');
});

test('known current-source refusal is shown before next metadata and cannot be replaced by a later guessed cause',async t=>{
    const f=rendererFixture(t),expected={stage:'current-context',reason:'source-cross-origin'};let fetches=0;
    f.input.fetch=async()=>{fetches++;throw Error('should not read next metadata');};
    f.binding.status=async()=>({value:{enabled:true,current:{state:'original',diagnostic:expected},next:{state:'idle'}}});
    const controller=await renderer.bind(f.input);t.after(()=>controller.close());controller.started();await controller.tick();await new Promise(setImmediate);
    assert.equal(fetches,0);assert((await controller.category()).stats[0].value.includes('current-context/source-cross-origin'));
});

test('current owned status-query failure remains visible without arbitrary exception text',async t=>{
    const f=rendererFixture(t),controller=await renderer.bind(f.input);t.after(()=>controller.close());
    f.binding.status=async()=>{throw Error('private-transport-url-token');};controller.started();await controller.tick();await new Promise(setImmediate);
    const value=await controller.category();assert(value.stats[0].value.includes('proxy-unavailable'));assert(!JSON.stringify(value).includes('private-transport'));
});

test('a next Emby source never inherits the current CD2 source proof',async t=>{
    const f=rendererFixture(t);f.input.sourceProof='current-only-opaque-proof';let selected;
    f.binding.preload=async value=>{selected=value;return {value:{state:'ready'}};};
    const controller=await renderer.bind(f.input);t.after(()=>controller.close());controller.started();await controller.tick();await new Promise(setImmediate);
    assert(selected);assert.equal(Object.hasOwn(selected,'sourceProof'),false);
});
