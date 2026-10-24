'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {validOwner, sameOwner, decode} = require('../src/electronapp/native-helper/preview-snapshot');
const owner = {endpointId:'a'.repeat(8)+'-aaaa-aaaa-aaaa-'+'a'.repeat(12), generationId:12};
const frame = extra => ({ready:true,generationId:12,format:'bgr24',width:2,height:1,pixels:Buffer.from([19,67,213,0,0,0]).toString('base64'),...extra});
test('snapshot decoder preserves nonzero colors and gives genuine black pixels opaque alpha', () => {
    assert.deepEqual([...decode(frame(),12).pixels],[19,67,213,255,0,0,0,255]);
});
test('snapshot bounds, canonical bytes and generation are strict', () => {
    for (const extra of [{generationId:11},{format:'bgra'},{width:161},{height:91},{width:0},{pixels:'!!!!'},{pixels:'E0PVAAAA\n'},{pixels:''},{path:'arbitrary'}]) assert.equal(decode(frame(extra),12),null);
    assert.equal(decode({ready:false},12),null);
    const maximum=frame({width:160,height:90,pixels:Buffer.alloc(43200).toString('base64')});
    assert.equal(decode(maximum,12).pixels.length,57600);
});
test('owner equality requires endpoint and Native generation rather than media title or playback delay', () => {
    assert.equal(validOwner(owner),true); assert.equal(sameOwner(owner,{...owner}),true);
    assert.equal(sameOwner(owner,{...owner,generationId:13}),false);
    assert.equal(sameOwner(owner,{...owner,endpointId:'b'.repeat(36)}),false);
    assert.equal(validOwner({...owner,path:'arbitrary'}),false);
});

test('optional profiling fields are strictly bounded, copied, and do not change decoded pixels',()=>{
    const timing={waitMicros:10000,copyMicros:2000,resizeMicros:100,encodeMicros:200};
    const result=decode(frame({timing}),12);assert.deepEqual([...result.pixels],[19,67,213,255,0,0,0,255]);
    assert.deepEqual(result.timing,timing);timing.waitMicros=99;assert.equal(result.timing.waitMicros,10000);
    for(const value of [null,{}, {...timing,extra:0},{...timing,waitMicros:-1},{...timing,copyMicros:Infinity},{...timing,resizeMicros:1.5},{...timing,encodeMicros:60000001}])assert.equal(decode(frame({timing:value}),12),null);
    assert.equal(Object.hasOwn(decode(frame(),12),'timing'),false);
});
