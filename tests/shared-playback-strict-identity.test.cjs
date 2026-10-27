'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const evidence=require('../tools/shared-playback-cache/fixture-frame-evidence.cjs');
const profile=require('../tools/shared-playback-cache/fixture-color-profile.cjs');
const ramp=require('./fixtures/shared-preview-zimg-fast-ramp.json');

test('all 576 media/frame identities match uniquely in both fixed models and reject every wrong media/target',()=>{
  const hashes=new Set(),crypto=require('node:crypto');let checked=0,negatives=0;
  for(const item of ['A','B','C'])for(let index=0;index<192;index++){
    const original=evidence.renderExpected(item,index);
    const hash=crypto.createHash('sha256').update(original.pixels).digest('hex');
    assert(!hashes.has(hash),`${item}${index} alias`);hashes.add(hash);
    for(const colorModel of ['identity',profile.MODEL]){
      const frame={...original,pixels:Buffer.from(original.pixels)};
      if(colorModel!== 'identity')for(let p=0;p<frame.pixels.length;p+=4)for(let c=0;c<3;c++)frame.pixels[p+c]=ramp.values[frame.pixels[p+c]];
      const result=evidence.analyze(frame,{item,frameIndices:[index],colorModel});
      assert.equal(result.classification,'match',`${item}${index}/${colorModel}`);
      assert.equal(result.ambiguous,false);assert.equal(result.matches.length,1);
      assert.equal(result.matches[0].item,item);assert.equal(result.matches[0].frameIndex,index);
      for(const other of ['A','B','C']){
        assert.equal(evidence.accepts(result,{item:other,targetFrame:index}),other===item);negatives+=other===item?0:1;
      }
      for(let target=0;target<192;target++){
        assert.equal(evidence.accepts(result,{item,targetFrame:target}),Math.abs(target-index)<=1);negatives+=Math.abs(target-index)>1?1:0;
      }
      checked++;
    }
  }
  assert.equal(hashes.size,576);assert.equal(checked,1152);assert(negatives>219000);
});

test('all 165600 unordered identity pairs have disjoint full-image tolerance-2 balls under both fixed models',t=>{
  // Compute weighted support for every XOR difference on the ACTUAL nearest-2x
  // preview grid; unequal tile heights are included. A difference of >4 makes
  // two mean-absolute-error <=2 matches impossible by the triangle inequality.
  const weights=Array(1024).fill(0);
  for(let y=0;y<90;y++)for(let x=0;x<160;x++)weights[Math.floor(x/5)+32*Math.floor(y*64/180)]++;
  const support=Array(1024).fill(0);
  for(let mask=1;mask<1024;mask++)for(let cell=0;cell<1024;cell++){
    if([...((mask&cell).toString(2))].filter(bit=>bit==='1').length%2)support[mask]+=weights[cell];
  }
  for(const model of ['identity',profile.MODEL]){
    const channelDelta=Math.abs(profile.value(224,model)-profile.value(32,model))+Math.abs(profile.value(192,model)-profile.value(64,model));
    let minimum=Infinity,pairs=0;
    for(let a=1;a<=576;a++)for(let b=a+1;b<=576;b++){
      const distance=support[a^b]*channelDelta/(160*90*3);
      assert(distance>2*evidence.MAX_MEAN_ABS_RGB_DIFF);minimum=Math.min(minimum,distance);pairs++;
    }
    assert.equal(pairs,165600);t.diagnostic(JSON.stringify({model,pairs,minimumMeanAbsRGBDistance:minimum,threshold:2}));
  }
});

test('full-image gate rejects sample-only impostors and accepts the unchanged exact tolerance boundary',()=>{
  const frame=evidence.renderExpected('A',96),changed={...frame,pixels:Buffer.from(frame.pixels)};
  for(let p=0;p<changed.pixels.length;p+=4)for(let c=0;c<3;c++)changed.pixels[p+c]=Math.min(255,changed.pixels[p+c]+2);
  const boundary=evidence.analyze(changed,{item:'A'});assert.equal(boundary.classification,'match');assert(boundary.meanAbsRGBDiff<=2);
  // Leave all sample rows intact while corrupting the rest of the image.
  for(let y=60;y<90;y++)for(let x=0;x<160;x++){
    const p=(y*160+x)*4;changed.pixels[p]=255-changed.pixels[p];changed.pixels[p+1]=255-changed.pixels[p+1];
  }
  assert.equal(evidence.sampleColorPredicate(changed,{item:'A',frameIndices:[96]}).matched,true);
  assert.equal(evidence.analyze(changed,{item:'A'}).classification,'unmatched');
  assert.throws(()=>evidence.accepts(boundary,{item:'A',targetFrame:192}),/target-invalid/);
});
