'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const probe=require('../tools/shared-playback-cache/read-grace-ab.cjs');
test('adopted finite per-block policy is byte-identical to the measured variant, not the depleted shared-response experiment',()=>{
 const root=path.resolve(__dirname,'..'),shared=cp.execFileSync('git',['show',probe.SHARED+':src/electronapp/enhanced/shared-playback-cache/proxy.js'],{cwd:root});
 const expected=probe.perBlockPolicy(shared,15),actual=fs.readFileSync(path.join(root,'src/electronapp/enhanced/shared-playback-cache/proxy.js'));
 assert.deepEqual(actual,expected);assert.equal(crypto.createHash('sha256').update(actual).digest('hex'),'e12d4939498354bddfe19b608084328f51e666ecfd8f01a31a4a3e9caff8ee6e');
 assert.match(actual.toString(),/const deadline = readStarted \+ 15 \+ readGracePerBlock/);assert.doesNotMatch(actual.toString(),/readGracePerBlock -=/);
 assert.throws(()=>probe.perBlockPolicy(shared,100));assert.throws(()=>probe.perBlockPolicy(Buffer.from('unknown'),15));
});
test('controlled comparison covers both ordinary and fast origins without replacing media or invoking Native',()=>{
 assert.equal(probe.BASE,'7a569c8e36f3d26f65d71aead369f0e6e9f70aad');
 assert.equal(probe.SCENARIOS['two-valid-20ms'].slowReads,2);assert.equal(probe.SCENARIOS['valid-50ms'].lag,50);
 assert.equal(probe.SCENARIOS['two-valid-20ms-fast-origin'].firstDelay,0);
 const source=fs.readFileSync(path.join(__dirname,'../tools/shared-playback-cache/read-grace-ab.cjs'),'utf8');
 assert.match(source,/chunk\.probe/);assert.match(source,/receivedIntervals\.push/);assert.doesNotMatch(source,/imagegen|dispatch|GH_TOKEN|powershell|\.exe/);
});
