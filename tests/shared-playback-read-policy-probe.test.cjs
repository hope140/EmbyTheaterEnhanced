'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const probe=require('../tools/shared-playback-cache/read-grace-ab.cjs');
test('adopted finite per-block policy is byte-identical to the measured variant, not the depleted shared-response experiment',()=>{
 const root=path.resolve(__dirname,'..'),actual=fs.readFileSync(path.join(root,'src/electronapp/enhanced/shared-playback-cache/proxy.js'));
 const variants=probe.sourceVariants(actual),shared=variants.B,expected=probe.perBlockPolicy(shared,15);
 assert.equal(crypto.createHash('sha256').update(variants.A).digest('hex'),'ac9b3b267d3e2643fe0d4fe876d0de90dcda2395497337a1840d3971eff98349');
 assert.equal(crypto.createHash('sha256').update(shared).digest('hex'),'3d5900a0fed1688d7c97e4e62525048de3b45d4a42ba274c6a48e74491ce31f2');
 assert.deepEqual(probe.sourceBinding(actual).bytes,expected);assert.equal(crypto.createHash('sha256').update(probe.sourceBinding(actual).bytes).digest('hex'),'e12d4939498354bddfe19b608084328f51e666ecfd8f01a31a4a3e9caff8ee6e');
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


test('comparison permits only the exact Git LF-to-CRLF checkout relation, not altered or mixed source',()=>{
 const actual=probe.sourceBinding(fs.readFileSync(path.join(__dirname,'../src/electronapp/enhanced/shared-playback-cache/proxy.js'))).bytes;
 const crlf=Buffer.from(actual.toString('utf8').replace(/\n/g,'\r\n'));
 assert.equal(probe.sourceBinding(crlf).relation,'exact-crlf-checkout');
 assert.deepEqual(probe.sourceVariants(crlf).D,actual);
 for(const bytes of [Buffer.concat([Buffer.from([239,187,191]),actual]),Buffer.from(crlf.toString('utf8').replace('\r\n','\n')),Buffer.concat([actual,Buffer.from(' ')])])assert.throws(()=>probe.sourceVariants(bytes),/probe-current-source/);
});
