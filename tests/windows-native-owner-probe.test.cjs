'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),path=require('node:path');
const {PLAN,clip}=require('../tools/windows-native-owner-probe.cjs');
test('production owner probe is explicit, local-only and does not imply DWM visible acceptance',()=>{
    assert.deepEqual(JSON.parse(execFileSync(process.execPath,[path.join(__dirname,'../tools/windows-native-owner-probe.cjs'),'--describe'],{encoding:'utf8'})),PLAN);
    assert.equal(PLAN.usesServer,false);assert.equal(PLAN.usesKoffi,false);assert.equal(PLAN.visibleDwmAcceptance,'NOT_ASSESSED');
});
test('red and green fixtures contain only bounded generated Y4M frames',()=>{
    for(const values of [[81,90,240],[145,54,34]]) {
        const bytes=clip(...values),header='YUV4MPEG2 W32 H18 F2:1 Ip A1:1 C420jpeg\n';
        assert.equal(bytes.subarray(0,header.length).toString(),header);
        assert.equal(bytes.length,header.length+12*(6+32*18+2*16*9));
        assert.equal(bytes[header.length+6],values[0]);assert.equal(bytes[header.length+6+32*18],values[1]);
    }
});
