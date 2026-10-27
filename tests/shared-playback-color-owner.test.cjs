'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const fixtureColor=require('../tools/shared-playback-cache/fixture-color-profile.cjs');
const fixtureEvidence=require('../tools/shared-playback-cache/fixture-frame-evidence.cjs');
const ramp=require('./fixtures/shared-preview-zimg-fast-ramp.json');

const workerSource=fs.readFileSync(require.resolve('../tools/shared-playback-cache/app-performance-electron.cjs'),'utf8');
const acceptedStart=workerSource.indexOf('        const accepted = async () => {');
const acceptedClose='\n        };';
const acceptedEnd=workerSource.indexOf(acceptedClose,acceptedStart);
assert(acceptedStart>=0&&acceptedEnd>acceptedStart,'actual decoded accepted closure must remain extractable');
const acceptedDeclaration=workerSource.slice(acceptedStart,acceptedEnd+acceptedClose.length);

function goodProfileValues(){
  const video={w:320,h:180,pixelformat:'bgr24',gamma:'srgb',primaries:'bt.709',colormatrix:'rgb',colorlevels:'full',alpha:'none'};
  return {'current-vo':'gpu-next','video-params':{...video},'video-out-params':{...video},
    'options/treat-srgb-as-power22':'input','options/sws-allow-zimg':true,'options/zimg-fast':true,
    'options/zimg-dither':'random',gamma:0,brightness:0,contrast:0,saturation:0,hue:0,'glsl-shaders':[]};
}
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};}
function makeFrame(frameIndex=34){
  const frame=fixtureEvidence.renderExpected('A',frameIndex);
  for(let at=0;at<frame.pixels.length;at+=4)for(let channel=0;channel<3;channel++)frame.pixels[at+channel]=ramp.values[frame.pixels[at+channel]];
  return frame;
}
function makeHarness({frame=makeFrame(),targetSeconds=34/12,profileValues=goodProfileValues(),deadline=100,now=0,readGate=null}={}){
  const owner={endpointId:'owned-endpoint',generationId:7},marks=[],profileCalls=[],
    hash=crypto.createHash('sha256').update(frame.pixels).digest('hex');
  let clock=now,previewCalls=0,evidenceCalls=0,profileReads=0;
  const client={currentGenerationId:owner.generationId,async getProperty(name,timeout){
    profileCalls.push([name,timeout]);
    if(readGate)await readGate.promise;
    return profileValues[name];
  }};
  const state={owner,endpoint:owner.endpointId,client,retired:false,frameColorProfile:null,lastFixtureEvidence:null,
    lastAuditableFrame:{width:frame.width,height:frame.height,owner:{...owner},pixels:Buffer.from(frame.pixels)},frameDeadline:deadline,targetSeconds,after:0,previousHash:null,
    plan:{fixture:{media:{A:{fps:12}}}},marks,profileCalls,
    setNow(value){clock=value;},retire(){this.retired=true;},changeGeneration(){client.currentGenerationId++;},
    get profileReads(){return profileReads;},get evidenceCalls(){return evidenceCalls;},get previewCalls(){return previewCalls;}};
  const preview={frame(requestOwner){return requestOwner.endpointId===owner.endpointId&&requestOwner.generationId===owner.generationId?{hash}:null;},
    probeDue(){return false;}};
  const service={isPreviewOwner(requestOwner){return !state.retired&&requestOwner.endpointId===state.endpoint&&requestOwner.generationId===client.currentGenerationId;},
    async capturePreview(){previewCalls++;}};
  const context={
    owner,endpoint:state.endpoint,client,service,retired:false,lastAuditableFrame:state.lastAuditableFrame,
    frameColorProfile:null,lastFixtureEvidence:null,frameDeadline:deadline,targetSeconds,after:0,previousHash:null,
    plan:state.plan,preview,fixtureColor,
    fixtureEvidence:{accepts:fixtureEvidence.accepts,analyze(...args){evidenceCalls++;return fixtureEvidence.analyze(...args);}},
    crypto,performance:{now:()=>clock},
    mark(type,data){marks.push({type,data});},
    need(condition,code){if(!condition)throw Error(code);}
  };
  state.setNow=value=>{clock=value;};
  state.retire=()=>{state.retired=true;context.retired=true;};
  state.changeGeneration=()=>{client.currentGenerationId++;};
  const readProfile=fixtureColor.readProfile;
  context.fixtureColor={...fixtureColor,async readProfile(activeClient){profileReads++;const value=await readProfile(activeClient);
    if(typeof state.onProfileResolved==='function')state.onProfileResolved();return value;}};
  const accepted=vm.runInNewContext(`(function(){ let result; ${acceptedDeclaration}; return accepted; })()`,context,
    {filename:'app-performance-electron.cjs#decoded.accepted'});
  return{state,context,accepted,hash,frame,owner,marks,profileCalls};
}

test('late profile responses from retired owner or changed generation are rejected before caching evidence',async t=>{
  for(const mode of ['retired','generation-change']){
    const gate=deferred(),h=makeHarness({readGate:gate});
    const pending=h.accepted();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.profileCalls.length,fixtureColor.PROPERTIES.length);
    if(mode==='retired')h.state.retire();else h.state.changeGeneration();
    gate.resolve(goodProfileValues());
    await assert.rejects(pending,/app-preview-owner-retired/);
    assert.equal(h.context.frameColorProfile,null);
    assert.equal(h.context.lastFixtureEvidence,null);
    assert.equal(h.marks.some(row=>row.type==='fixture-color-profile'),false);
    assert.equal(h.marks.some(row=>row.type==='fixture-preview-evidence'),false);
    assert.equal(h.state.evidenceCalls,0);
  }
});

test('unsupported observed profile fails closed without identity-model fallback',async()=>{
  const values={...goodProfileValues(),'current-vo':'gpu'};
  const h=makeHarness({profileValues:values});
  await assert.rejects(h.accepted(),/app-fixture-color-profile-unavailable/);
  assert.equal(h.context.frameColorProfile,null);
  assert.equal(h.context.lastFixtureEvidence,null);
  assert.equal(h.state.evidenceCalls,0);
  assert.equal(h.marks.find(row=>row.type==='fixture-color-profile')?.data.model,null);
  assert.equal(h.marks.some(row=>row.type==='fixture-preview-evidence'),false);
});

test('profile completion at the frame deadline cannot accept or cache late frame evidence',async()=>{
  const h=makeHarness({deadline:50});
  h.state.onProfileResolved=()=>h.state.setNow(50);
  assert.equal(await h.accepted(),false);
  assert.equal(h.context.frameColorProfile,null);
  assert.equal(h.context.lastFixtureEvidence,null);
  assert.equal(h.state.evidenceCalls,0);
  assert.equal(h.marks.some(row=>row.type==='fixture-color-profile'),false);
  assert.equal(h.marks.some(row=>row.type==='fixture-color-profile-late'),true);
  assert.equal(h.marks.some(row=>row.type==='fixture-preview-evidence'),false);
});

test('supported profile is cached within its generation and only a known target pattern is accepted',async()=>{
  const h=makeHarness();
  assert.equal(await h.accepted(),true);
  assert.equal(h.context.frameColorProfile.model,fixtureColor.MODEL);
  assert.equal(h.state.profileReads,1);
  assert.equal(h.profileCalls.length,fixtureColor.PROPERTIES.length);
  const evidence=h.context.lastFixtureEvidence.evidence;
  assert.equal(evidence.knownFixtureMatch,true);
  assert.equal(evidence.targetHit,null,'accepted() verifies the explicit requested target itself');
  assert(evidence.matches.some(row=>row.item==='A'&&row.frameIndex===34));
  assert.equal(await h.accepted(),true);
  assert.equal(h.state.profileReads,1,'profile is reused for the same owner generation');
  assert.equal(h.profileCalls.length,fixtureColor.PROPERTIES.length);
  assert.equal(h.state.evidenceCalls,1,'identical frame evidence is reused');

  const wrongTarget=makeHarness({targetSeconds:40/12});
  assert.equal(await wrongTarget.accepted(),false);
  assert.equal(wrongTarget.context.lastFixtureEvidence.evidence.knownFixtureMatch,true);
  assert.equal(wrongTarget.context.lastFixtureEvidence.evidence.matches.some(row=>row.item==='A'&&Math.abs(row.frameIndex-40)<=1),false);
});

test('real ordinary acceptance rejects legacy aliases, wrong media and wrong targets including cold frames',async()=>{
  const row={item:'A',frameIndex:36,meanAbsRGBDiff:0,sampleMeanAbsDiff:0};
  for(const targetSeconds of [null,3])for(const mutation of ['ambiguous','inconsistent','wrong-item','wrong-target','unmatched']){
    const h=makeHarness({frame:makeFrame(36),targetSeconds});
    h.context.fixtureEvidence.analyze=()=>{
      const result={classification:'match',ambiguous:false,matches:[{...row}]};
      if(mutation==='ambiguous'||mutation==='inconsistent'){
        result.matches.push({...row,item:'B',frameIndex:9});
        if(mutation==='ambiguous'){result.classification='ambiguous';result.ambiguous=true;}
      } else if(mutation==='wrong-item')result.matches[0].item='B';
      else if(mutation==='wrong-target'){
        result.matches[0].frameIndex=96;
        if(targetSeconds===null)result.classification='wrong-target';
      } else {result.classification='unmatched';result.matches=[];}
      return result;
    };
    assert.equal(await h.accepted(),false,`${mutation}/${targetSeconds}`);
  }
});

test('real ordinary acceptance permits only the existing one-frame seek tolerance',async()=>{
  for(const index of [34,35,36,37,38]){
    const h=makeHarness({frame:makeFrame(index),targetSeconds:3});
    assert.equal(await h.accepted(),Math.abs(index-36)<=1,`A${index} target36`);
  }
});

test('the real ordinary acceptance rechecks the absolute cutoff after full-image analysis',async()=>{
  const h=makeHarness({deadline:50});
  const analyze=h.context.fixtureEvidence.analyze;
  h.context.fixtureEvidence.analyze=(...args)=>{const result=analyze(...args);h.state.setNow(50);return result;};
  assert.equal(await h.accepted(),false);
});
