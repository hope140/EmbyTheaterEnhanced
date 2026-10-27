'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const evidence=require('../tools/shared-playback-cache/fixture-frame-evidence.cjs');

test('frame evidence matches pixels independently extracted from the real generated AVI palette and frame payload',async t=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ete-pattern-contract-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const plan=await require('../tools/shared-playback-cache/windows-fixtures.cjs').generateFixtures(root);
  const bytes=fs.readFileSync(path.join(root,'A.avi')),strf=bytes.indexOf(Buffer.from('strf'));
  assert.ok(strf>0);const palette=strf+8+40;
  for(const index of [6,18]){
    const rawStart=plan.media.A.dataStart+index*plan.media.A.frameStride+8,pixels=Buffer.alloc(160*90*4);
    for(let y=0;y<90;y++)for(let x=0;x<160;x++){
      const color=bytes[rawStart+(179-y*2)*320+x*2],out=(y*160+x)*4;
      pixels[out]=bytes[palette+color*4];pixels[out+1]=bytes[palette+color*4+1];pixels[out+2]=bytes[palette+color*4+2];pixels[out+3]=255;
    }
    const result=evidence.analyze({width:160,height:90,pixels},{item:'A',frameIndices:[index]});
    assert.equal(result.targetHit,true);assert.equal(result.meanAbsRGBDiff,0);
    assert.equal(evidence.analyze({width:160,height:90,pixels},{item:'A',frameIndices:[index===6?18:6]}).targetHit,false);
  }
});

function perturb(frame,amount){
  const pixels=Buffer.from(frame.pixels);
  for(let i=0;i<pixels.length;i+=4)for(let c=0;c<3;c++)pixels[i+c]=Math.max(0,Math.min(255,pixels[i+c]+amount));
  return {...frame,pixels};
}
function flat(value){
  const pixels=Buffer.alloc(evidence.PREVIEW_WIDTH*evidence.PREVIEW_HEIGHT*4);
  for(let i=0;i<pixels.length;i+=4){pixels[i]=pixels[i+1]=pixels[i+2]=value;pixels[i+3]=255;}
  return {width:evidence.PREVIEW_WIDTH,height:evidence.PREVIEW_HEIGHT,pixels};
}

test('exact synthetic AVI palette frame matches the expected item/frame with zero RGB residual',()=>{
  const frame=evidence.renderExpected('A',0),result=evidence.analyze(frame,{item:'A',frameIndices:[0]});
  assert.equal(result.classification,'match');assert.equal(result.knownFixtureMatch,true);
  assert.deepEqual(result.matchedFrameIndices,[0]);assert.equal(result.meanAbsRGBDiff,0);
  assert.equal(result.targetHit,true);assert.equal(result.targetOffsetFrames,0);assert.equal(result.ptsConfirmed,false);
  const samples=evidence.sampleColorPredicate(frame,{item:'A',frameIndices:[0,1,2,3]});
  assert.equal(samples.matched,true);assert.deepEqual(samples.matches.map(row=>row.frameIndex),[0]);
});

test('bounded numeric color perturbation is accepted and its residual is reported',()=>{
  const result=evidence.analyze(perturb(evidence.renderExpected('A',6),1),{item:'A',frameIndices:[6]});
  assert.equal(result.classification,'match');assert.ok(result.meanAbsRGBDiff>0&&result.meanAbsRGBDiff<=2);
  assert.deepEqual(result.matchedFrameIndices,[6]);assert.equal(result.matches[0].sampleMeanAbsDiff,1);
});

test('wrong item source and wrong target frame are rejected with bounded evidence',()=>{
  const wrongItem=evidence.analyze(evidence.renderExpected('B',185),{item:'A',frameIndices:[185]});
  assert.equal(wrongItem.classification,'wrong-item');assert.deepEqual(wrongItem.matches.map(row=>[row.item,row.frameIndex]),[['B',185]]);
  const wrongTarget=evidence.analyze(evidence.renderExpected('A',10),{item:'A',frameIndices:[9]});
  assert.equal(wrongTarget.classification,'wrong-target');assert.deepEqual(wrongTarget.matchedFrameIndices,[10]);
  assert.equal(wrongTarget.targetHit,false);assert.equal(wrongTarget.targetOffsetFrames,1);
});

test('fixture salt/frame modular collision is reported as ambiguous, never as unique item proof',()=>{
  const result=evidence.analyze(evidence.renderExpected('A',40),{item:'A',frameIndices:[40]});
  assert.equal(result.classification,'ambiguous');assert.equal(result.ambiguous,true);
  assert.deepEqual(result.matches.map(row=>[row.item,row.frameIndex]),[['A',40],['B',13]]);
  assert.equal(result.targetHit,true);assert.equal(result.targetOffsetFrames,0);
  assert.equal(result.ptsConfirmed,false);
});

test('solid black, white and the known gray checker patterns do not satisfy the palette predicate',()=>{
  const checker=(left,right)=>{
    const frame=flat(left);
    for(let y=0;y<frame.height;y++)for(let x=0;x<frame.width;x++){
      const p=(y*frame.width+x)*4,value=((x+y)&1)?right:left;
      frame.pixels[p]=frame.pixels[p+1]=frame.pixels[p+2]=value;
    }
    return frame;
  };
  for(const frame of [flat(0),flat(255),checker(224,239)]){
    const result=evidence.analyze(frame,{item:'A',frameIndices:[0]});
    assert.equal(result.classification,'unmatched');assert.equal(result.knownFixtureMatch,false);assert.equal(result.meanAbsRGBDiff,null);
    assert.equal(evidence.sampleColorPredicate(frame,{item:'A',frameIndices:[0,1,2,3]}).matched,false);
  }
});

test('fixed top-left nearest-2x mapping is explicit and no arbitrary frame history is returned',()=>{
  const result=evidence.analyze(evidence.renderExpected('B',191),{item:'B',frameIndices:[191]});
  assert.equal(result.classification,'match');
  assert.equal(result.basis,'fixed-top-left-nearest-2x-palette-pattern-only');
  assert.ok(result.matches.length<=2*evidence.MAX_FRAMES);
  assert.equal(Object.hasOwn(result,'pixels'),false);assert.equal(Object.hasOwn(result,'rawFrame'),false);
  assert.ok(result.matches.every(row=>Object.keys(row).sort().join(',')==='frameIndex,item,meanAbsRGBDiff,sampleMeanAbsDiff'));
});

test('invalid dimensions, item labels, frame index bounds and oversized candidate sets fail closed',()=>{
  const frame=evidence.renderExpected('A',0);
  assert.throws(()=>evidence.analyze({...frame,width:320},{item:'A'}),/^Error: fixture-frame-frame-invalid$/);
  const transparent={...frame,pixels:Buffer.from(frame.pixels)};transparent.pixels[3]=0;
  assert.throws(()=>evidence.analyze(transparent,{item:'A'}),/^Error: fixture-frame-frame-invalid$/);
  assert.throws(()=>evidence.analyze(frame,{item:'C'}),/^Error: fixture-frame-item-invalid$/);
  assert.throws(()=>evidence.analyze(frame,{item:'A',frameIndices:[]}),/^Error: fixture-frame-frame-indices-invalid$/);
  assert.throws(()=>evidence.analyze(frame,{item:'A',frameIndices:[1,1]}),/^Error: fixture-frame-frame-indices-invalid$/);
  assert.throws(()=>evidence.analyze(frame,{item:'A',frameIndices:[192]}),/^Error: fixture-frame-frame-indices-invalid$/);
  assert.throws(()=>evidence.sampleColorPredicate(frame,{item:'A',frameIndices:Array(193).fill(0).map((_,i)=>i%192)}),/^Error: fixture-frame-frame-indices-invalid$/);
});
