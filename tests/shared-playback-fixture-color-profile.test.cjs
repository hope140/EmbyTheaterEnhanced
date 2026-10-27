'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const profile=require('../tools/shared-playback-cache/fixture-color-profile.cjs');
const evidence=require('../tools/shared-playback-cache/fixture-frame-evidence.cjs');
const ramp=require('./fixtures/shared-preview-zimg-fast-ramp.json');

function goodValues(){
  const video={w:320,h:180,pixelformat:'bgr24',gamma:'srgb',primaries:'bt.709',colormatrix:'rgb',colorlevels:'full',alpha:'none'};
  return {'current-vo':'gpu-next','video-params':{...video},'video-out-params':{...video},
    'options/treat-srgb-as-power22':'input','options/sws-allow-zimg':true,'options/zimg-fast':true,
    'options/zimg-dither':'random',gamma:0,brightness:0,contrast:0,saturation:0,hue:0,'glsl-shaders':[]};
}
function transform(frame){
  const pixels=Buffer.from(frame.pixels);
  for(let p=0;p<pixels.length;p+=4)for(let c=0;c<3;c++)pixels[p+c]=ramp.values[pixels[p+c]];
  return {...frame,pixels};
}

test('profile selects only the complete observed gpu-next/zimg configuration and emits safe evidence',()=>{
  const selected=profile.select(goodValues());
  assert.deepEqual(profile.PROPERTIES,['current-vo','video-params','video-out-params','options/treat-srgb-as-power22',
    'options/sws-allow-zimg','options/zimg-fast','options/zimg-dither','gamma','brightness','contrast','saturation','hue','glsl-shaders']);
  assert.equal(selected.supported,true); assert.equal(selected.model,profile.MODEL);
  assert.equal(selected.observations.vo,'gpu-next'); assert.equal(selected.observations.input.format,'bgr24');
  assert.equal(selected.observations.output.alpha,'none'); assert.equal(selected.observations.shaderCount,0);
  const serialized=JSON.stringify(selected);
  assert(!serialized.includes('video-params')); assert(!serialized.includes('shaderPath'));
  assert(!serialized.includes('/private/')); assert(!serialized.includes('shaderPath'));
});

test('readProfile reads each fixed property exactly once with a 1000ms timeout and never writes',async()=>{
  const calls=[];
  const client={async getProperty(name,timeout){calls.push([name,timeout]);return goodValues()[name];},
    setProperty(){assert.fail('readProfile must not mutate mpv');},command(){assert.fail('readProfile must not issue commands');}};
  const result=await profile.readProfile(client);
  assert.equal(result.supported,true); assert.deepEqual(calls,profile.PROPERTIES.map(name=>[name,1000]));
  const failures=[];
  const partial=await profile.readProfile({async getProperty(name){failures.push(name);if(name==='video-out-params')throw Error('sensitive path');return goodValues()[name];}});
  assert.deepEqual(failures,profile.PROPERTIES); assert.equal(partial.supported,false);
  assert(!JSON.stringify(partial).includes('sensitive path'));
});

test('missing, wrong, unsafe, or private profile values are unsupported',()=>{
  const base=goodValues();
  for(const [key,value] of [['current-vo','gpu'],['options/zimg-fast',false],['options/zimg-dither','none'],
    ['options/sws-allow-zimg',false],['options/treat-srgb-as-power22','unknown'],['gamma',0.1],['hue',NaN],
    ['glsl-shaders',['/private/user/shader.glsl']]]) {
    const values={...base,[key]:value},result=profile.select(values);
    assert.equal(result.supported,false,key); assert.equal(result.model,null,key);
    assert(!JSON.stringify(result).includes('/private/user/shader.glsl'));
  }
  for(const key of profile.PROPERTIES){const values={...base};delete values[key];assert.equal(profile.select(values).supported,false,key);}
  for(const [key,value] of [['video-params',{...base['video-params'],pixelformat:'rgb24'}],
    ['video-out-params',{...base['video-out-params'],colorlevels:'limited'}]]) {
    assert.equal(profile.select({...base,[key]:value}).supported,false,key);
  }
});

test('analytic transfer matches independent zimg ramp within its declared maximum error',()=>{
  assert.equal(ramp.schema,1); assert.match(ramp.purpose,/verification-only/);
  assert.equal(ramp.values.length,256); assert.equal(ramp.reference.rawBytes,1536);
  assert.equal(require('node:crypto').createHash('sha256').update(Buffer.concat(Array.from({length:6},()=>Buffer.from(ramp.values)))).digest('hex'),ramp.reference.rawSha256);
  let maximum=0;
  for(let input=0;input<256;input++)maximum=Math.max(maximum,Math.abs(profile.value(input,profile.MODEL)-ramp.values[input]));
  assert(maximum<=0.51,`maximum error ${maximum}`);
  assert.throws(()=>profile.value(-1,profile.MODEL),/fixture-color-byte-invalid/);
  assert.throws(()=>profile.value(256,profile.MODEL),/fixture-color-byte-invalid/);
  assert.throws(()=>profile.value(42,'unknown'),/fixture-color-model-invalid/);
});

test('color-model preview matching accepts only transformed fixture pixels and retains ambiguity',()=>{
  const expected=transform(evidence.renderExpected('A',34));
  const match=evidence.analyze(expected,{item:'A',frameIndices:[34],colorModel:profile.MODEL});
  assert.equal(match.knownFixtureMatch,true); assert.equal(match.targetHit,true);
  assert.equal(match.colorModel,profile.MODEL); assert.equal(match.threshold,2);
  assert.equal(match.ptsConfirmed,false);
  assert.equal(evidence.analyze(expected,{item:'A',frameIndices:[34]}).knownFixtureMatch,false,'identity and derived models are not accepted as alternatives');
  assert.equal(evidence.analyze(evidence.renderExpected('A',34),{item:'A',colorModel:profile.MODEL}).knownFixtureMatch,false);
  const ambiguous=evidence.analyze(expected,{item:'A',frameIndices:[34],colorModel:profile.MODEL});
  assert.equal(ambiguous.classification,'ambiguous'); assert(ambiguous.matches.some(row=>row.item==='A'&&row.frameIndex===34));
  assert(ambiguous.matches.some(row=>row.item==='B'&&row.frameIndex===7));
  const wrong=evidence.analyze(expected,{item:'A',frameIndices:[33],colorModel:profile.MODEL});
  assert.equal(wrong.targetHit,false);
  const gray={...expected,pixels:Buffer.from(expected.pixels)};
  for(let p=0;p<gray.pixels.length;p+=4)gray.pixels[p]=gray.pixels[p+1]=gray.pixels[p+2]=224;
  assert.equal(evidence.analyze(gray,{item:'A',frameIndices:[34],colorModel:profile.MODEL}).knownFixtureMatch,false);
  for(const value of [0,255]){
    const blank={...expected,pixels:Buffer.from(expected.pixels)};
    for(let p=0;p<blank.pixels.length;p+=4)blank.pixels[p]=blank.pixels[p+1]=blank.pixels[p+2]=value;
    assert.equal(evidence.analyze(blank,{item:'A',colorModel:profile.MODEL}).knownFixtureMatch,false);
  }
  for(const horizontal of [false,true]){
    const changed={...expected,pixels:Buffer.alloc(expected.pixels.length)};
    for(let y=0;y<90;y++)for(let x=0;x<160;x++){
      const src=((horizontal?y:89-y)*160+(horizontal?159-x:x))*4;
      expected.pixels.copy(changed.pixels,(y*160+x)*4,src,src+4);
    }
    assert.equal(evidence.analyze(changed,{item:'A',colorModel:profile.MODEL}).knownFixtureMatch,false);
  }
  assert.equal(evidence.analyze(transform(evidence.renderExpected('B',185)),{item:'A',colorModel:profile.MODEL}).classification,'wrong-item');
  const flipped={...expected,pixels:Buffer.from(expected.pixels)};
  for(let p=0;p<flipped.pixels.length;p+=4)[flipped.pixels[p],flipped.pixels[p+2]]=[flipped.pixels[p+2],flipped.pixels[p]];
  assert.equal(evidence.analyze(flipped,{item:'A',frameIndices:[34],colorModel:profile.MODEL}).knownFixtureMatch,false);
  assert.throws(()=>evidence.analyze(expected,{item:'A',colorModel:'unknown'}),/fixture-frame-color-model-invalid/);
});
