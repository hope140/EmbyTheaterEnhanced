'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),path=require('node:path');
const probe=require('../tools/windows-native-exit-probe.cjs');
test('lifecycle harness exercises every scenario with strict destroyed getter doubles (not real Electron)',async()=>{
    const windows=new Set();
    class Window extends EventEmitter{
        constructor(options){super();assert.equal(options.show,false);assert.equal(options.focusable,false);assert.equal(options.webPreferences.sandbox,true);
            this.contents=new EventEmitter();this.contents.isDestroyed=()=>this.destroyed;windows.add(this);}
        get webContents(){if(this.destroyed)throw TypeError('Object has been destroyed');return this.contents;}
        getNativeWindowHandle(){return Buffer.from([1,0,0,0,0,0,0,0]);}
        isDestroyed(){return !!this.destroyed;}isVisible(){return false;}isMinimized(){return false;}
        destroy(){this.destroyed=true;windows.delete(this);this.emit('closed');}close(){this.destroy();}
        static getAllWindows(){return [...windows];}
    }
    const report={},adapter=path.resolve(__dirname,'../src/electronapp/enhanced/windows-native-media.js');
    const rows=await probe.run({app:{},BrowserWindow:Window,nativeImage:{createFromBitmap:()=>({})}},adapter,report);
    assert.deepEqual(rows.map(row=>row.name),probe.CASES);assert.ok(rows.every(row=>row.status==='passed'));
});

test('assertion projection preserves step operator actual expected and relative source stack only',()=>{
    let failure;try{assert.equal(false,true,'window-destroyed-after-closed');}catch(error){failure=error;}
    failure.probeStep='window-destroyed-after-closed';
    failure.stack='AssertionError: fixture\n    at run (C:\\Users\\private-account\\checkout\\tools\\windows-native-exit-probe.cjs:77:12)\n    at dispose (/private/home/account/src/electronapp/enhanced/windows-native-media.js:148:9)\n    at task (node:internal/process/task_queues:105:5)\n    at unknown (C:\\Users\\private-account\\profile\\secret.js:3:2)';
    const error=probe.projectError(failure,{stage:'playing-close',step:'await-closed'});
    assert.equal(error.step,'window-destroyed-after-closed');assert.equal(error.message,'window-destroyed-after-closed');
    assert.deepEqual(error.assertion,{operator:'strictEqual',actual:false,expected:true});
    assert.deepEqual(error.stack,[{file:'tools/windows-native-exit-probe.cjs',line:77,column:12},
        {file:'src/electronapp/enhanced/windows-native-media.js',line:148,column:9},{file:'node:internal/process/task_queues',line:105,column:5}]);
    assert.doesNotMatch(JSON.stringify(error),/private-account|private\/home|secret\.js|C:|profile/);
});

test('missing exception and unknown errors keep useful bounded diagnostics without payload strings',()=>{
    let failure;try{assert.throws(()=>{},/destroyed/i,'closed-webcontents-getter-throws');}catch(error){failure=error;}
    const result=probe.projectError(failure,{stage:'playing-close',step:'closed-webcontents-getter-throws'});
    assert.equal(result.message,'closed-webcontents-getter-throws');assert.equal(result.assertion.expected,'/destroyed/i');
    assert.deepEqual(result.assertion.actual,{type:'undefined'});assert.equal(result.assertion.operator,'throws');
    const unknown=Object.assign(Error('https://private.example/path?token=fixture-private'),{actual:'fixture-private',expected:{token:'fixture-private'},code:'private-error'});
    const projected=probe.projectError(unknown,{stage:'playing-close',step:'adapter-attach'});
    assert.equal(projected.message,'adapter-attach');assert.match(projected.messageSha256,/^[a-f0-9]{64}$/);
    assert.doesNotMatch(JSON.stringify(projected),/private\.example|token|fixture-private|private-error/);
});

test('realistic close event before destruction is diagnosed rather than weakening the destroyed assertion',async()=>{
    class Window extends EventEmitter{
        constructor(){super();this.contents=new EventEmitter();this.contents.isDestroyed=()=>false;}
        get webContents(){return this.contents;}getNativeWindowHandle(){return Buffer.from([1,0,0,0,0,0,0,0]);}
        isDestroyed(){return false;}isVisible(){return false;}isMinimized(){return false;}
        close(){this.emit('closed');}static getAllWindows(){return [];}
    }
    const report={},adapter=path.resolve(__dirname,'../src/electronapp/enhanced/windows-native-media.js');
    await assert.rejects(probe.run({app:{},BrowserWindow:Window,nativeImage:{createFromBitmap:()=>({})}},adapter,report),error=>{
        const projected=probe.projectError(error,report);
        assert.equal(projected.step,'window-destroyed-after-closed');assert.deepEqual(projected.assertion,{operator:'strictEqual',actual:false,expected:true});
        assert.deepEqual(report.observations,{closedEventObserved:true,destroyedDuringClosed:false,closeReturned:true,destroyedAfterCloseCall:false});
        return true;
    });
    assert.equal(report.cases.length,0);
});

test('a message or forged node prefix cannot smuggle account paths into stack projection',()=>{
    for(const message of ['node:/Users/private-account/profile/secret:3:2','C:/private/tools/windows-native-exit-probe.cjs:3:2']){
        const error=Error(message);
        error.stack+='\n    at forged (node:/Users/private-account/profile/secret:3:2)';
        const result=probe.projectError(error,{stage:'playing-close',step:'window-close'});
        assert.deepEqual(result.stack,[]);assert.doesNotMatch(JSON.stringify(result),/private-account|profile|secret|C:|Users/);
    }
});

test('runtime adapter frames use the canonical source label without leaking the runtime directory',()=>{
    const error=Error('fixture');error.stack='Error: fixture\n    at dispose (C:\\Users\\private-account\\runtime\\electronapp\\enhanced\\windows-native-media.js:150:12)';
    assert.deepEqual(probe.projectError(error,{stage:'playing-close',step:'await-dispose'}).stack,
        [{file:'src/electronapp/enhanced/windows-native-media.js',line:150,column:12}]);
});

test('a later scenario failing before close cannot inherit earlier close observations',async()=>{
    let count=0;const windows=new Set();
    class Window extends EventEmitter{
        constructor(){super();if(++count===2)throw Error('fixture second create failed');this.contents=new EventEmitter();this.contents.isDestroyed=()=>!!this.destroyed;windows.add(this);}
        get webContents(){if(this.destroyed)throw TypeError('Object has been destroyed');return this.contents;}
        getNativeWindowHandle(){return Buffer.from([1,0,0,0,0,0,0,0]);}isDestroyed(){return !!this.destroyed;}isVisible(){return false;}isMinimized(){return false;}
        destroy(){this.destroyed=true;windows.delete(this);this.emit('closed');}close(){this.destroy();}static getAllWindows(){return [...windows];}
    }
    const report={};await assert.rejects(probe.run({app:{},BrowserWindow:Window,nativeImage:{createFromBitmap:()=>({})}},
        path.resolve(__dirname,'../src/electronapp/enhanced/windows-native-media.js'),report));
    assert.equal(report.stage,'playing-destroy');assert.equal(report.step,'window-create');assert.equal(report.cases.length,1);
    assert.deepEqual(report.observations,{closedEventObserved:false,destroyedDuringClosed:null,closeReturned:false,destroyedAfterCloseCall:null});
});

test('all six lifecycle cases remove only owned listeners and preserve the Electron crash listener',async()=>{
    const windows=new Set();
    class Window extends EventEmitter{
        constructor(){super();this.contents=new EventEmitter();this.contents.isDestroyed=()=>!!this.destroyed;
            this.contents.on('render-process-gone',()=>{});windows.add(this);}
        get webContents(){if(this.destroyed)throw TypeError('Object has been destroyed');return this.contents;}
        getNativeWindowHandle(){return Buffer.from([1,0,0,0,0,0,0,0]);}isDestroyed(){return !!this.destroyed;}isVisible(){return false;}isMinimized(){return false;}
        destroy(){this.destroyed=true;windows.delete(this);this.emit('closed');}close(){this.destroy();}static getAllWindows(){return [...windows];}
    }
    const report={};const rows=await probe.run({app:{},BrowserWindow:Window,nativeImage:{createFromBitmap:()=>({})}},
        path.resolve(__dirname,'../src/electronapp/enhanced/windows-native-media.js'),report);
    assert.equal(rows.length,6);
    for(const row of rows){
        assert.deepEqual(row.listenerOwnership.crash,{baseline:1,ownedAttached:1,totalRemaining:1,ownedRemaining:0,externalPreserved:true});
        assert.deepEqual(row.listenerOwnership.navigation,{baseline:0,ownedAttached:1,totalRemaining:0,ownedRemaining:0,externalPreserved:true});
    }
    assert.deepEqual(report.listenerBaseline,{navigation:0,crash:1});

});

for(const fault of ['none','owned-leak','external-missing','external-replaced','leak-and-external-missing','external-reordered'])test('listener ownership detects '+fault+' by callback identity',()=>{
    const emitter=new EventEmitter(),first=()=>{},second=()=>{},owned=()=>{};
    emitter.on('fixture',first);emitter.on('fixture',second);
    const owner=probe.listenerOwner(emitter,'fixture');emitter.on('fixture',owned);assert.equal(owner.attach(),1);
    if(!['owned-leak','leak-and-external-missing'].includes(fault))emitter.removeListener('fixture',owned);
    if(['external-missing','external-replaced','leak-and-external-missing'].includes(fault))emitter.removeListener('fixture',first);
    if(fault==='external-replaced')emitter.prependListener('fixture',()=>{});
    if(fault==='external-reordered'){emitter.removeListener('fixture',first);emitter.on('fixture',first);}
    const state=owner.inspect();assert.equal(state.ownedRemaining,['owned-leak','leak-and-external-missing'].includes(fault)?1:0);
    assert.equal(state.externalPreserved,fault==='none');
    if(['external-replaced','leak-and-external-missing','external-reordered'].includes(fault))assert.equal(state.totalRemaining,state.baseline,'same count must not hide a changed listener');
});

test('duplicate external callbacks retain their original multiplicity and order',()=>{
    const emitter=new EventEmitter(),external=()=>{},owned=()=>{};emitter.on('fixture',external);emitter.on('fixture',external);
    const owner=probe.listenerOwner(emitter,'fixture');emitter.on('fixture',owned);assert.equal(owner.attach(),1);
    emitter.removeListener('fixture',owned);assert.deepEqual(owner.inspect(),{baseline:2,ownedAttached:1,totalRemaining:2,ownedRemaining:0,externalPreserved:true});
    emitter.removeListener('fixture',external);assert.equal(owner.inspect().externalPreserved,false);
});
