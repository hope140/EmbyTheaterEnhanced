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
