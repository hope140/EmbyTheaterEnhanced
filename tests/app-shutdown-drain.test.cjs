'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm'),{EventEmitter}=require('events');
const source=fs.readFileSync(path.join(process.env.ETE_TEST_SOURCE_ROOT || path.join(__dirname,'..'),'src/electronapp/main.js'),'utf8'),start=source.indexOf("    app.once('before-quit'"),end=source.indexOf("    ipcMain.on('enhanced-diagnostics'",start);
assert.ok(start>=0&&end>start);
const names={diagnostics:'unregisterDiagnosticsIpc',maintenance:'unregisterMaintenanceIpc','http-cache':'unregisterCacheManagementIpc',downloads:'unregisterDownloadIpc','fn-connect':'unregisterFnConnect','strm-config':'unregisterStrmConfigIpc',cd2:'unregisterCd2Ipc','refresh-rate':'unregisterRefreshRate','native-helper':'unregisterNativeHelperIpc','mpv-kernel':'unregisterMpvKernelIpc','windows-media':'disposeWindowsNativeMedia'};
const turn=()=>new Promise(r=>setImmediate(r));
function fixture(failure,mode='reject',lease=null){
 const app=new EventEmitter(),calls=[],logs=[],gates={};let exits=0,notices=0;
 app.quit=()=>{let prevented=false;app.emit('before-quit',{preventDefault(){prevented=true;}});if(!prevented)exits++;return prevented;};
 const context={app,appIsShuttingDown:false,updateShutdownLease:lease,mainWindow:null,electron:{dialog:{showMessageBox:()=>{notices++;return Promise.resolve();}}},enhancedLog:r=>logs.push(r),require:()=>require('../src/electronapp/enhanced/shutdown-drain'),playbackPowerOwner:{shutdown(){calls.push('power');}},readyStartupPromise:Promise.resolve()};
 for(const [name,fn]of Object.entries(names)){let done;const promise=new Promise(r=>done=r);gates[name]=done;context[fn]=()=>{calls.push(name);if(name===failure){if(mode==='throw')throw Error('PRIVATE_CANARY');return Promise.reject(Error('PRIVATE_CANARY'));}return promise;};}
 vm.runInNewContext(source.slice(start,end),context);
 return {app,calls,logs,gates,context,settle:()=>Object.values(gates).forEach(done=>done()),get exits(){return exits;},get notices(){return notices;}};
}
test('actual main holds repeated quit behind one drain and releases every owner once',async()=>{
 const f=fixture();assert.equal(f.app.quit(),true);assert.equal(f.app.quit(),true);await turn();assert.equal(f.exits,0);assert.deepEqual(f.calls,['power',...Object.keys(names)]);f.settle();await turn();assert.equal(f.exits,1);assert.equal(f.context.appIsShuttingDown,true);
});
for(const step of Object.keys(names))for(const mode of ['throw','reject'])test('actual main safely handles '+step+' '+mode+' without outrunning another owner',async()=>{
 const f=fixture(step,mode);f.app.quit();await turn();assert.equal(f.exits,0);assert.equal(f.calls.length,1+Object.keys(names).length);f.settle();await turn();assert.equal(f.exits,step==='diagnostics'?1:0);assert.equal(f.notices,step==='diagnostics'?0:1);assert.doesNotMatch(JSON.stringify(f.logs),/PRIVATE_CANARY/);
});
test('actual main authorizes launch only after cleanup, then quits',async()=>{
 const calls=[],f=fixture(null,'reject',{release:async()=>{assert.equal(f.exits,0);calls.push('release');},abort:async()=>calls.push('abort')});f.app.quit();await turn();assert.deepEqual(calls,[]);f.settle();await turn();assert.deepEqual(calls,['release']);assert.equal(f.exits,1);
});
test('failed final release cancels only with confirmed exit, and allows a later normal quit',async()=>{
 const calls=[],f=fixture(null,'reject',{release:async()=>{throw Error('PRIVATE_CANARY');},abort:async()=>calls.push('confirmed')});f.app.quit();f.settle();await turn();assert.equal(f.exits,0);assert.deepEqual(calls,['confirmed']);assert.equal(f.context.updateShutdownLease,null);f.app.quit();await turn();assert.equal(f.exits,1);
});
test('unconfirmed guard cancellation never becomes a successful quit or cancelled result',async()=>{
 const f=fixture(null,'reject',{release:async()=>{throw Error('private');},abort:async()=>{throw Error('private');}});f.app.quit();f.settle();await turn();assert.equal(f.exits,0);assert.notEqual(f.context.updateShutdownLease,null);assert.ok(f.logs.some(r=>r.details&&r.details.guardCancellation==='unconfirmed'));f.app.quit();await turn();assert.equal(f.exits,0);
});

test('actual window close remains visible while an update drain is blocked',()=>{
 const a=source.indexOf('    function onWindowClose(event)'),b=source.indexOf('    function parseCommandLine()',a);let prevented=0,retries=0;
 const context={appShutdownOwner:{retry(){retries++;}},appShutdownDrained:false};vm.runInNewContext(source.slice(a,b),context);
 context.onWindowClose({preventDefault(){prevented++;}});assert.equal(prevented,1);assert.equal(retries,1);
});
