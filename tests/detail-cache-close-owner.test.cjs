'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {EventEmitter} = require('node:events');
const {pathToFileURL} = require('node:url');
const closeOwnerModule = require('../src/electronapp/enhanced/detail-cache/close-owner');
const boundary = require('../src/electronapp/enhanced/renderer-boundary');

const documentUrl = pathToFileURL(path.resolve(__dirname, '../src/electronapp/www/index.html')).href;
const CHANNELS = closeOwnerModule.CHANNELS;

function fakeClock() {
    let serial=0; const timers=new Map(), cleared=[];
    return {setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,ms});return id;},clearTimeout(id){cleared.push(id);timers.delete(id);},fire(id){const timer=timers.get(id);assert.ok(timer,'expected active timer');timers.delete(id);timer.fn();},active(){return [...timers.values()];},ids(){return [...timers.keys()];},cleared};
}
function fixture(options={}) {
    const ipcMain=new EventEmitter(),clock=options.clock||fakeClock();
    class Web extends EventEmitter {
        constructor(){super();this.mainFrame={url:documentUrl};this.dead=false;this.sent=[];this.throwSend=false;}
        isDestroyed(){return this.dead;}
        send(...args){this.sent.push(args);if(this.throwSend)throw Error('synthetic send failure');options.onSend?.(...args);}
        destroy(){this.dead=true;this.emit('destroyed');}
    }
    const web=options.web||new Web();
    const owner=closeOwnerModule.register({ipcMain,getWebContents:()=>options.getWebContents?options.getWebContents():web,clock});
    const event=(sender=web,frame=sender.mainFrame)=>({sender,senderFrame:frame,prevented:0,preventDefault(){this.prevented++;}});
    const ready=(evt=event())=>ipcMain.emit(CHANNELS.READY,evt);
    const done=(value,evt=event())=>ipcMain.emit(CHANNELS.DONE,evt,value);
    return {ipcMain,clock,web,owner,event,ready,done};
}
async function drain(){for(let i=0;i<30;i++)await Promise.resolve();}

test('close is not delayed before a trusted renderer READY handshake',()=>{
    const f=fixture(),evt=f.event();let closes=0;
    assert.equal(f.owner.beforeClose(evt,()=>closes++),false);
    assert.equal(evt.prevented,0);assert.equal(closes,0);assert.equal(f.web.sent.length,0);
    const other={mainFrame:{url:documentUrl},isDestroyed:()=>false};
    f.ready(f.event(other,other.mainFrame));
    assert.equal(f.owner.beforeClose(evt,()=>closes++),false);
    assert.equal(f.ipcMain.listenerCount(CHANNELS.READY),1);
    f.owner.dispose();
});

test('READY and FLUSHED require the trusted exact main frame, document, id and payload shape',async()=>{
    const f=fixture(),foreign={mainFrame:{url:documentUrl},isDestroyed:()=>false};let closes=0;
    f.ready(f.event(foreign,foreign.mainFrame));
    f.ready(f.event(f.web,{url:documentUrl}));
    const frame=f.web.mainFrame,oldUrl=frame.url;frame.url='https://synthetic.invalid/';f.ready(f.event());frame.url=oldUrl;
    let evt=f.event();assert.equal(f.owner.beforeClose(evt,()=>closes++),false);assert.equal(evt.prevented,0);
    f.ready();evt=f.event();assert.equal(f.owner.beforeClose(evt,()=>closes++),true);assert.equal(evt.prevented,1);
    const [channel,id]=f.web.sent[0];assert.equal(channel,CHANNELS.FLUSH);assert.match(id,/^detail-close-\d+$/);
    const bad=[{id,status:'flushed',extra:true},{id:'detail-close-999',status:'flushed'},{id,status:'done'},{id,status:'unavailable',extra:undefined}];
    for(const payload of bad)f.done(payload);
    f.done({id,status:'flushed'},f.event(foreign,foreign.mainFrame));
    f.done({id,status:'flushed'},f.event(f.web,{url:documentUrl}));
    await drain();assert.equal(closes,0);
    f.done({id,status:'flushed'});await drain();
    assert.equal(closes,1);assert.equal(f.clock.active().length,0);
    f.done({id,status:'unavailable'});await drain();assert.equal(closes,1);
    f.owner.dispose();
});

test('a new renderer document must READY again; an acknowledgement from its previous frame cannot close it',async()=>{
    const f=fixture();let closes=0;f.ready();
    const oldFrame=f.web.mainFrame;
    f.web.mainFrame={url:documentUrl};
    const beforeReady=f.event();
    assert.equal(f.owner.beforeClose(beforeReady,()=>closes++),false);
    assert.equal(beforeReady.prevented,0);assert.equal(f.web.sent.length,0);
    f.ready();
    const closeEvent=f.event();assert.equal(f.owner.beforeClose(closeEvent,()=>closes++),true);
    const id=f.web.sent[0][1];
    f.done({id,status:'flushed'},f.event(f.web,oldFrame));await drain();
    assert.equal(closes,0);
    f.done({id,status:'flushed'},f.event());await drain();
    assert.equal(closes,1);f.owner.dispose();
});

test('repeated close events prevent each native close but issue one renderer flush and close once',async()=>{
    const f=fixture();f.ready();let closes=0,statuses=[];
    const a=f.event(),b=f.event();
    assert.equal(f.owner.beforeClose(a,status=>{closes++;statuses.push(status);}),true);
    assert.equal(f.owner.beforeClose(b,status=>{closes++;statuses.push(status);}),true);
    assert.equal(a.prevented,1);assert.equal(b.prevented,1);assert.equal(f.web.sent.length,1);
    f.done({id:f.web.sent[0][1],status:'flushed'});await drain();
    assert.equal(closes,1);assert.deepEqual(statuses,['flushed']);f.owner.dispose();
});

test('the one second deadline closes once as unavailable and ignores a late acknowledgement',async()=>{
    const clock=fakeClock(),f=fixture({clock});f.ready();let statuses=[];
    const evt=f.event();assert.equal(f.owner.beforeClose(evt,status=>statuses.push(status)),true);
    const timer=clock.ids()[0];assert.equal(clock.active()[0].ms,1000);
    clock.fire(timer);await drain();assert.deepEqual(statuses,['unavailable']);
    f.done({id:f.web.sent[0][1],status:'flushed'});await drain();
    assert.deepEqual(statuses,['unavailable']);assert.ok(clock.cleared.includes(timer));f.owner.dispose();
});

test('renderer destruction and a throwing FLUSH send settle the close as unavailable',async t=>{
    await t.test('destroyed pending renderer',async()=>{
        const clock=fakeClock(),f=fixture({clock});f.ready();let status;
        f.owner.beforeClose(f.event(),value=>status=value);f.web.destroy();await drain();
        assert.equal(status,'unavailable');assert.equal(clock.active().length,0);f.owner.dispose();
    });
    await t.test('send throws',async()=>{
        const f=fixture();f.ready();f.web.throwSend=true;let status;
        assert.equal(f.owner.beforeClose(f.event(),value=>status=value),true);await drain();
        assert.equal(status,'unavailable');assert.equal(f.clock.active().length,0);f.owner.dispose();
    });
});

test('dispose unregisters IPC listeners and settles a pending close exactly once',async()=>{
    const f=fixture();f.ready();let statuses=[];
    f.owner.beforeClose(f.event(),status=>statuses.push(status));
    assert.equal(f.ipcMain.listenerCount(CHANNELS.READY),1);assert.equal(f.ipcMain.listenerCount(CHANNELS.DONE),1);
    f.owner.dispose();await drain();
    assert.equal(f.ipcMain.listenerCount(CHANNELS.READY),0);assert.equal(f.ipcMain.listenerCount(CHANNELS.DONE),0);
    assert.deepEqual(statuses,['unavailable']);
});

test('actual main onWindowClose fragment keeps normal persistence and shortcut cleanup once after flush acknowledgement',async()=>{
    const source=fs.readFileSync(path.resolve(__dirname,'../src/electronapp/main.js'),'utf8');
    const start=source.indexOf('    function onWindowClose(event) {');
    const end=source.indexOf('\n    function parseCommandLine()',start);
    assert.ok(start>=0&&end>start,'main.js must retain the onWindowClose integration point');
    const fragment=source.slice(start,end);
    const ipcMain=new EventEmitter(),clock=fakeClock(),expected={url:documentUrl};
    const rendererListeners=new Map();
    let closeCount=0,writes=0,shortcuts=0,warnings=0,preventCount=0;
    const web=new EventEmitter();web.mainFrame=expected;web.dead=false;web.isDestroyed=()=>web.dead;
    web.send=(channel,id)=>{rendererListeners.get(channel)?.({},id);};
    const owner=closeOwnerModule.register({ipcMain,getWebContents:()=>web,clock});
    const oldWindowEvent={sender:web,senderFrame:expected,preventDefault(){preventCount++;}};
    const context={
        detailCacheCloseOwner:owner,hasAppLoaded:true,fullscreenActive:false,previousBounds:{x:1,y:2,width:800,height:600},currentWindowState:'normal',
        getWindowStateDataPath:()=>'/synthetic/windowstate.json',
        mainWindow:{isDestroyed:()=>false,getBounds:()=>({x:3,y:4,width:1000,height:700}),close(){closeCount++;context.onWindowClose(oldWindowEvent);}},
        electron:{globalShortcut:{unregisterAll(){shortcuts++;}}},
        enhancedLog(entry){if(entry.event==='detail-cache-flush-unavailable')warnings++;},
        require(name){assert.equal(name,'fs');return {writeFileSync(file,contents){assert.equal(file,'/synthetic/windowstate.json');const value=JSON.parse(contents);assert.equal(value.state,'normal');writes++;}};}
    };
    vm.runInNewContext(fragment,context,{filename:'src/electronapp/main.js:onWindowClose'});
    const storePath=require.resolve('../src/electronapp/enhanced/detail-cache/store');
    const previousWindow=global.window,previousIndexedDB=global.indexedDB;
    delete require.cache[storePath];
    try {
        global.indexedDB=undefined;
        global.window={ipc:{on(channel,listener){rendererListeners.set(channel,listener);},send(channel,payload){
            if(channel===CHANNELS.READY)ipcMain.emit(CHANNELS.READY,{sender:web,senderFrame:expected});
            else if(channel===CHANNELS.DONE)ipcMain.emit(CHANNELS.DONE,{sender:web,senderFrame:expected},payload);
        }}};
        const store=require(storePath).shared();
        assert.equal(typeof store.flush,'function');
        assert.equal(rendererListeners.has(CHANNELS.FLUSH),true);
        context.onWindowClose(oldWindowEvent);
        assert.equal(preventCount,1);assert.equal(closeCount,0);assert.equal(writes,0);assert.equal(shortcuts,0);
        await drain();
        assert.equal(closeCount,1);assert.equal(writes,1);assert.equal(shortcuts,1);assert.equal(warnings,0);
        store.flush();
    } finally {
        if(previousWindow===undefined)delete global.window;else global.window=previousWindow;
        if(previousIndexedDB===undefined)delete global.indexedDB;else global.indexedDB=previousIndexedDB;
        delete require.cache[storePath];owner.dispose();
    }
});

test('trusted renderer boundary requires the exact current main frame and app document',()=>{
    const f=fixture();
    assert.equal(boundary.isTrusted(f.event(),f.web),true);
    assert.equal(boundary.isTrusted(f.event(f.web,{url:documentUrl}),f.web),false);
    const previous=f.web.mainFrame.url;f.web.mainFrame.url='https://synthetic.invalid/';
    assert.equal(boundary.isTrusted(f.event(),f.web),false);f.web.mainFrame.url=previous;
    f.web.dead=true;assert.equal(boundary.isTrusted(f.event(),f.web),false);
    f.owner.dispose();
});

for (const navigation of ['details', 'legacy']) test('same-document and subframe navigation preserve READY; full navigation retires it: '+navigation,()=>{
    const f=fixture();f.ready();
    function navigate(same,main){if(navigation==='details')f.web.emit('did-start-navigation',{isSameDocument:same,isMainFrame:main});else f.web.emit('did-start-navigation',{},documentUrl,same,main);}
    navigate(true,true);navigate(false,false);
    assert.equal(f.web.listenerCount('did-start-navigation'),1);
    navigate(false,true);
    const event=f.event();assert.equal(f.owner.beforeClose(event,()=>assert.fail('no pending close')),false);assert.equal(event.prevented,0);
    assert.equal(f.web.listenerCount('did-start-navigation'),0);
    f.ready();assert.equal(f.web.listenerCount('did-start-navigation'),1);f.owner.dispose();assert.equal(f.web.listenerCount('did-start-navigation'),0);
});
for (const eventName of ['did-start-navigation','render-process-gone']) test('pending close retires once when its document/process is lost: '+eventName,async()=>{
    const f=fixture();f.ready();let statuses=[];f.owner.beforeClose(f.event(),value=>statuses.push(value));const id=f.web.sent[0][1];
    f.web.emit(eventName,{isMainFrame:true,isSameDocument:false});await drain();assert.deepEqual(statuses,['unavailable']);assert.equal(f.clock.active().length,0);
    f.done({id,status:'flushed'});await drain();assert.deepEqual(statuses,['unavailable']);f.owner.dispose();
});
test('a renderer loss before closing requires a new READY without delaying close',()=>{
    const f=fixture();f.ready();f.web.emit('render-process-gone',{},{});const event=f.event();assert.equal(f.owner.beforeClose(event,()=>assert.fail()),false);assert.equal(event.prevented,0);f.owner.dispose();
});
test('flush waits for a failed IndexedDB transaction abort terminal rather than its earlier error event',async()=>{
    let request,transaction;
    const database={transaction(){transaction={objectStore:()=>({getAll:()=>({})})};return transaction;}};
    const indexedDB={open(){request={};return request;}};
    const store=require('../src/electronapp/enhanced/detail-cache/store').create(indexedDB,'synthetic-abort-terminal',null);
    const operation=store.snapshot();request.result=database;request.onsuccess();await drain();assert.ok(transaction);
    let settled=false;const flushing=store.flush().then(value=>{settled=true;return value;});
    transaction.onerror({preventDefault(){assert.fail('default abort must remain enabled');}});await drain();assert.equal(settled,false);
    transaction.onabort();assert.equal((await operation).status,'unavailable');assert.equal((await flushing).status,'unavailable');
});
