'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path'), {pathToFileURL} = require('node:url');
const ipc = require('../src/electronapp/enhanced/cache-management-ipc');
const layout = require('../src/electronapp/enhanced/page-cache/home-layout-cache');
function gate() { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;});return {promise,resolve,reject}; }
async function flush() { for(let i=0;i<20;i++) await Promise.resolve(); }
function fixture(session) {
    const handlers=new Map(), frame={url:pathToFileURL(path.resolve(__dirname,'../src/electronapp/www/index.html')).href};
    let web={session,mainFrame:frame,isDestroyed:()=>false};
    const close=ipc.register({ipcMain:{handle:(c,f)=>handlers.set(c,f),removeHandler:c=>handlers.delete(c)},getWebContents:()=>web});
    return {handlers,close,event:()=>({sender:web,senderFrame:web.mainFrame}),invoke(c,request){return handlers.get(c)(this.event(),request);},setWeb(w){web=w;},web:()=>web};
}
test('HTTP actions use the trusted application main frame session, reject alternate senders/documents and payloads', async()=>{
    let reads=0,clears=0;const session={getCacheSize:async()=>{reads++;return 123;},clearCache:async()=>{clears++;}};
    const f=fixture(session), handler=f.handlers.get(ipc.CHANNELS.CLEAR);
    assert.equal((await handler({sender:{},senderFrame:f.web().mainFrame})).reason,'untrusted_sender');
    assert.equal((await handler({...f.event(),senderFrame:{url:f.web().mainFrame.url}})).reason,'untrusted_sender');
    f.web().mainFrame.url='https://synthetic.invalid/';assert.equal((await f.invoke(ipc.CHANNELS.CLEAR)).reason,'untrusted_sender');
    f.web().mainFrame.url=pathToFileURL(path.resolve(__dirname,'../src/electronapp/www/index.html')).href;
    assert.equal((await f.invoke(ipc.CHANNELS.CLEAR,{path:'private',all:true})).reason,'invalid_request');
    assert.equal(reads+clears,0);assert.deepEqual(await f.invoke(ipc.CHANNELS.STATUS),{status:'ok',bytes:123});
    assert.deepEqual(await f.invoke(ipc.CHANNELS.CLEAR),{status:'cleared',bytes:123});assert.equal(clears,1);await f.close();assert.equal(f.handlers.size,0);
});
test('HTTP clear coalesces repeats and owns completion across shutdown without touching storage or media', async()=>{
    const held=gate(), calls=[];const session=new Proxy({getCacheSize:async()=>{calls.push('size');return 9;},clearCache:()=>{calls.push('clear');return held.promise;}},{get(o,k){assert.ok(['getCacheSize','clearCache'].includes(k),'no other session API');return o[k];}});
    const f=fixture(session), a=f.invoke(ipc.CHANNELS.CLEAR), b=f.invoke(ipc.CHANNELS.CLEAR);assert.equal(a,b);await flush();
    assert.deepEqual(f.invoke(ipc.CHANNELS.STATUS),{status:'busy'});let closed=false;const drain=f.close().then(()=>closed=true);await flush();assert.equal(closed,false);
    held.resolve();assert.deepEqual(await a,{status:'cleared',bytes:9});await drain;assert.equal(closed,true);assert.deepEqual(calls,['clear','size']);
});
test('pending read does not let close start a queued physical clear', async()=>{
    const held=gate();let clears=0;const f=fixture({getCacheSize:()=>held.promise,clearCache:async()=>clears++});
    const read=f.invoke(ipc.CHANNELS.STATUS);await flush();const clear=f.invoke(ipc.CHANNELS.CLEAR);await flush();const drain=f.close();held.resolve(10);await read;
    assert.deepEqual(await clear,{status:'error',reason:'closed'});await drain;assert.equal(clears,0);
});
test('session changes do not return another owner read or clear', async()=>{
    const held=gate(), f=fixture({getCacheSize:async()=>11,clearCache:()=>held.promise});
    const a=f.invoke(ipc.CHANNELS.CLEAR);await flush();f.setWeb({...f.web(),session:{getCacheSize:async()=>22,clearCache:async()=>{throw Error('wrong-session');}}});
    assert.deepEqual(f.invoke(ipc.CHANNELS.CLEAR),{status:'busy'});held.resolve();await a;assert.deepEqual(await f.invoke(ipc.CHANNELS.STATUS),{status:'ok',bytes:22});await f.close();
});
for(const failure of ['read','clear','negative','fractional','oversize']) test('HTTP failures are bounded and retryable: '+failure,async()=>{
    let broken=true;const f=fixture({getCacheSize:async()=>{if(broken){if(failure==='read')throw Error('PRIVATE token');if(failure==='negative')return -1;if(failure==='fractional')return 0.5;if(failure==='oversize')return Number.MAX_SAFE_INTEGER+1;}return 5;},clearCache:async()=>{if(broken&&failure==='clear')throw Error('PRIVATE path');}});
    if(failure!=='clear') assert.deepEqual(await f.invoke(ipc.CHANNELS.STATUS),{status:'error',reason:'http_cache_unavailable'});
    const result=await f.invoke(ipc.CHANNELS.CLEAR);assert.deepEqual(result,failure==='clear'?{status:'error',reason:'http_cache_unavailable'}:{status:'cleared',measurement:'unavailable'});assert.equal(JSON.stringify(result).includes('PRIVATE'),false);
    broken=false;assert.deepEqual(await f.invoke(ipc.CHANNELS.CLEAR),{status:'cleared',bytes:5});await f.close();
});
function pageFixture() {
    let user='synthetic-user', auth=1, now=0;const timers=new Set();
    const api={isLoggedIn:()=>!!user,serverId:()=> 'synthetic-server',getCurrentUserId:()=>user,get _identityEpoch(){return auth;},getCurrentLocale:()=> 'zh-CN',serverVersion:()=> '4.10.0.40'};
    const connection={currentApiClient:()=>api},callbacks=new Map();
    const events={on(o,n,f){if(!callbacks.has(o))callbacks.set(o,new Map());const m=callbacks.get(o);if(!m.has(n))m.set(n,new Set());m.get(n).add(f);},off(o,n,f){callbacks.get(o)?.get(n)?.delete(f);},emit(o,n){for(const f of callbacks.get(o)?.get(n)||[])f();}};
    const cache=layout.create(connection,{enabled:true,ttlMs:100,maxEntries:2,maxBytes:4096,clock:{now:()=>now,setTimeout(fn,ms){const id=setTimeout(fn,ms);timers.add(id);return id;},clearTimeout(id){clearTimeout(id);timers.delete(id);}}},events);
    return {cache,load:loader=>cache.load({displayMode:'desktop'},loader||(()=>Promise.resolve([{Id:'one',Name:'safe'}]))),user(v){user=v;auth++;},jump(ms){now+=ms;},dispose(){cache.dispose();for(const id of timers)clearTimeout(id);},emit:n=>events.emit(api,n)};
}
test('page management reports only current owner serialized counts/actual limits; clears pending and rejects late data',async()=>{
    const before=layout.management.snapshot(),f=pageFixture();try {
        await f.load();let s=layout.management.snapshot();assert.equal(s.entries-before.entries,1);assert.equal(s.maxEntries-before.maxEntries,2);assert.equal(s.maxSerializedBytes-before.maxSerializedBytes,4096);assert.ok(s.serializedBytes>before.serializedBytes);
        f.cache.invalidate();const held=gate(),pending=f.load(()=>held.promise);const rejected=assert.rejects(pending,{name:'AbortError'});await flush();assert.equal(layout.management.snapshot().pending,1);
        assert.equal(layout.management.clear().entries,0);await rejected;held.resolve([{Id:'late'}]);await flush();assert.equal(layout.management.snapshot().entries,0);assert.equal(layout.management.snapshot().pending,0);
        await f.load();assert.equal(layout.management.snapshot().entries,1);f.user('other-synthetic-user');assert.equal(layout.management.snapshot().entries,0);
        await f.load();f.jump(101);assert.equal(layout.management.snapshot().entries,0);
        assert.equal(JSON.stringify(layout.management.snapshot()).includes('synthetic'),false);
    }finally{f.dispose();}assert.deepEqual(layout.management.snapshot(),before);
});
test('silent logout, external invalidation and disposed owners cannot remain counted',async()=>{
    const f=pageFixture();try{await f.load();f.emit('websocketclose');assert.equal(layout.management.snapshot().entries,0);await f.load();f.user(null);assert.equal(layout.management.snapshot().entries,0);}finally{f.dispose();}
    assert.equal(layout.management.snapshot().enabledOwners,0);
    const disabled=layout.create({},{});assert.equal(layout.management.snapshot().enabledOwners,0);disabled.dispose();
});
test('multiple page owners count actual configured limits and disposal removes only that owner',async()=>{
    const a=pageFixture(),b=pageFixture();try{await a.load();await b.load();const result=layout.management.snapshot();assert.equal(result.enabledOwners,2);assert.equal(result.entries,2);assert.equal(result.maxEntries,4);assert.equal(result.maxSerializedBytes,8192);a.dispose();assert.equal(layout.management.snapshot().entries,1);assert.equal(layout.management.snapshot().enabledOwners,1);layout.management.clear();assert.equal(layout.management.snapshot().entries,0);}finally{a.dispose();b.dispose();}
});
test('real main shutdown drain waits for a real registered HTTP clear even when another cleanup rejects',async()=>{
    const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync(path.resolve(__dirname,'../src/electronapp/main.js'),'utf8');
    const start=source.indexOf("    app.once('before-quit'"),end=source.indexOf("    ipcMain.on('enhanced-diagnostics'",start);
    const held=gate(),f=fixture({clearCache:()=>held.promise,getCacheSize:async()=>0});const request=f.invoke(ipc.CHANNELS.CLEAR);await flush();
    let handler,quit=0;const noop=()=>Promise.resolve();
    const context={app:{once(n,h){handler=h;},quit(){quit++;}},appIsShuttingDown:false,playbackPowerOwner:{shutdown(){}},enhancedLog(){},setTimeout,clearTimeout,
        unregisterDiagnosticsIpc:()=>Promise.reject(Error('synthetic failure')),unregisterMaintenanceIpc:noop,unregisterCacheManagementIpc:f.close,
        unregisterStrmConfigIpc:noop,unregisterCd2Ipc:noop,unregisterRefreshRate:noop,unregisterNativeHelperIpc:noop,unregisterMpvKernelIpc:noop,readyStartupPromise:Promise.resolve()};
    vm.runInNewContext(source.slice(start,end),context);handler({preventDefault(){}});await flush();assert.equal(quit,0);assert.equal(f.handlers.size,0);
    held.resolve();await request;await flush();assert.equal(quit,1);
});
