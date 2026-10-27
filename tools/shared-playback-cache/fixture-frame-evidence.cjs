'use strict';

const WIDTH=320,HEIGHT=180,PREVIEW_WIDTH=160,PREVIEW_HEIGHT=90,MAX_FRAMES=192;
const MAX_MEAN_ABS_RGB_DIFF=2;
const ITEMS=Object.freeze({A:0,B:1,C:2});
const DEFAULT_FRAMES=Object.freeze(Array.from({length:MAX_FRAMES},(_,index)=>index));
const colorProfile=require('./fixture-color-profile.cjs');
// Ten independent Walsh coordinates distinguish all 576 nonzero media/frame
// codewords. Samples only reject; every candidate still needs a full RGB diff.
const samplePoints=Object.freeze(Array.from({length:10},(_,bit)=>{
  const cell=1<<bit;return Object.freeze([(cell%32)*5+2,Math.ceil(Math.floor(cell/32)*90/32)+1]);
}));
const TRANSFER=Object.freeze(Array.from({length:256},(_,byte)=>colorProfile.value(byte,colorProfile.MODEL)));
const need=(value,code)=>{if(!value)throw Error('fixture-frame-'+code);};

function validFrame(frame){
  if(!frame||frame.width!==PREVIEW_WIDTH||frame.height!==PREVIEW_HEIGHT||!Buffer.isBuffer(frame.pixels)||
    frame.pixels.length!==PREVIEW_WIDTH*PREVIEW_HEIGHT*4)return false;
  for(let i=3;i<frame.pixels.length;i+=4)if(frame.pixels[i]!==255)return false;
  return true;
}
function validateItem(item){need(Object.hasOwn(ITEMS,item),'item-invalid');}
function validateFrames(frameIndices){
  const indices=frameIndices===undefined?DEFAULT_FRAMES:frameIndices;
  need(Array.isArray(indices)&&indices.length>0&&indices.length<=MAX_FRAMES,'frame-indices-invalid');
  const seen=new Set();
  for(const index of indices){need(Number.isInteger(index)&&index>=0&&index<MAX_FRAMES&&!seen.has(index),'frame-indices-invalid');seen.add(index);}
  return indices;
}
function expectedColor(item,frameIndex,x,y,model='identity'){
  const sx=x*2,sy=y*2,cell=Math.floor(sx/10)+32*Math.floor(sy*32/HEIGHT);
  let bits=(ITEMS[item]*MAX_FRAMES+frameIndex+1)&cell,parity=0;
  while(bits){parity^=bits&1;bits>>>=1;}
  const color={b:parity?224:32,g:parity?192:64,r:(17+sx+sy*3)&255};
  return model==='identity'?color:{b:TRANSFER[color.b],g:TRANSFER[color.g],r:TRANSFER[color.r]};
}
function validateModel(model){need(model==='identity'||model===colorProfile.MODEL,'color-model-invalid');}
function renderExpected(item,frameIndex){
  validateItem(item);need(Number.isInteger(frameIndex)&&frameIndex>=0&&frameIndex<MAX_FRAMES,'frame-index-invalid');
  const pixels=Buffer.alloc(PREVIEW_WIDTH*PREVIEW_HEIGHT*4);
  for(let y=0;y<PREVIEW_HEIGHT;y++)for(let x=0;x<PREVIEW_WIDTH;x++){
    const p=(y*PREVIEW_WIDTH+x)*4,color=expectedColor(item,frameIndex,x,y);
    pixels[p]=color.b;pixels[p+1]=color.g;pixels[p+2]=color.r;pixels[p+3]=255;
  }
  return {width:PREVIEW_WIDTH,height:PREVIEW_HEIGHT,pixels};
}
function sampleDiff(frame,item,frameIndex,model){
  let sum=0;
  for(const [x,y] of samplePoints){
    const p=(y*PREVIEW_WIDTH+x)*4,color=expectedColor(item,frameIndex,x,y,model);
    sum+=Math.abs(frame.pixels[p]-color.b)+Math.abs(frame.pixels[p+1]-color.g)+Math.abs(frame.pixels[p+2]-color.r);
  }
  return sum/(samplePoints.length*3);
}
function fullDiff(frame,item,frameIndex,model){
  let sum=0;
  for(let y=0;y<PREVIEW_HEIGHT;y++)for(let x=0;x<PREVIEW_WIDTH;x++){
    const p=(y*PREVIEW_WIDTH+x)*4,color=expectedColor(item,frameIndex,x,y,model);
    sum+=Math.abs(frame.pixels[p]-color.b)+Math.abs(frame.pixels[p+1]-color.g)+Math.abs(frame.pixels[p+2]-color.r);
  }
  return sum/(PREVIEW_WIDTH*PREVIEW_HEIGHT*3);
}
function candidates(frame,indices,items,model){
  const rows=[];
  for(const item of items)for(const frameIndex of indices){
    const sampleMeanAbsDiff=sampleDiff(frame,item,frameIndex,model);
    if(sampleMeanAbsDiff>MAX_MEAN_ABS_RGB_DIFF)continue;
    const meanAbsRGBDiff=fullDiff(frame,item,frameIndex,model);
    if(meanAbsRGBDiff<=MAX_MEAN_ABS_RGB_DIFF)rows.push({item,frameIndex,meanAbsRGBDiff,sampleMeanAbsDiff});
  }
  return rows.sort((a,b)=>a.meanAbsRGBDiff-b.meanAbsRGBDiff||a.item.localeCompare(b.item)||a.frameIndex-b.frameIndex);
}

// This matches only the fixed spatial identity pattern. It does not establish a media PTS or decoder timestamp.
function sampleColorPredicate(frame,{item,frameIndices,colorModel='identity'}={}){
  need(validFrame(frame),'frame-invalid');validateItem(item);validateModel(colorModel);const indices=validateFrames(frameIndices);
  const matches=[];
  for(const frameIndex of indices){
    const meanAbsRGBDiff=sampleDiff(frame,item,frameIndex,colorModel);
    if(meanAbsRGBDiff<=MAX_MEAN_ABS_RGB_DIFF)matches.push({frameIndex,meanAbsRGBDiff});
  }
  return {matched:matches.length>0,item,matches,colorModel,threshold:MAX_MEAN_ABS_RGB_DIFF,basis:'ten-sample-spatial-code-only'};
}

function analyze(frame,{item,frameIndices,colorModel='identity'}={}){
  need(validFrame(frame),'frame-invalid');validateItem(item);validateModel(colorModel);
  const targetIndices=frameIndices===undefined?null:validateFrames(frameIndices);
  const all=candidates(frame,DEFAULT_FRAMES,Object.keys(ITEMS),colorModel);
  const expected=all.filter(row=>row.item===item);
  let targetOffsetFrames=null,targetHit=null;
  if(targetIndices){
    targetHit=expected.some(row=>targetIndices.includes(row.frameIndex));
    if(expected.length){
      const nearest=row=>Math.min(...targetIndices.map(target=>Math.abs(row.frameIndex-target)));
      const closest=[...expected].sort((a,b)=>a.meanAbsRGBDiff-b.meanAbsRGBDiff||nearest(a)-nearest(b)||a.frameIndex-b.frameIndex)[0];
      const target=targetIndices.reduce((best,value)=>Math.abs(value-closest.frameIndex)<Math.abs(best-closest.frameIndex)?value:best,targetIndices[0]);
      targetOffsetFrames=closest.frameIndex-target;
    }
  }
  const classification=all.length===0?'unmatched':all.length>1?'ambiguous':expected.length===0?'wrong-item':
    targetIndices&&!targetHit?'wrong-target':'match';
  const frameNumbers=[...new Set(all.map(row=>row.frameIndex))].sort((a,b)=>a-b);
  return {classification,knownFixtureMatch:all.length>0,item,colorModel,matchedFrameIndices:frameNumbers,
    matches:all.map(row=>({...row})),meanAbsRGBDiff:all[0]?.meanAbsRGBDiff??null,targetHit,
    targetOffsetFrames,ambiguous:all.length>1,threshold:MAX_MEAN_ABS_RGB_DIFF,ptsConfirmed:false,
    basis:'fixed-top-left-nearest-2x-walsh10-rgb-v1'};
}

// Both ordinary-entry and Native smoke use this fail-closed gate. Never accept
// a convenient row from an ambiguous set, including the historical A36/B9 alias.
function accepts(result,{item,targetFrame=null}={}){
  validateItem(item);
  need(targetFrame===null||Number.isFinite(targetFrame)&&targetFrame>=0&&targetFrame<MAX_FRAMES,'target-invalid');
  if(!result||result.classification!=='match'||result.ambiguous!==false||result.matches?.length!==1)return false;
  const row=result.matches[0];
  return row.item===item&&Number.isInteger(row.frameIndex)&&row.frameIndex>=0&&row.frameIndex<MAX_FRAMES&&
    Number.isFinite(row.meanAbsRGBDiff)&&row.meanAbsRGBDiff<=MAX_MEAN_ABS_RGB_DIFF&&row.meanAbsRGBDiff>=0&&
    (targetFrame===null||Math.abs(row.frameIndex-targetFrame)<=1);
}

module.exports={accepts,analyze,sampleColorPredicate,renderExpected,MAX_MEAN_ABS_RGB_DIFF,WIDTH,HEIGHT,PREVIEW_WIDTH,PREVIEW_HEIGHT,MAX_FRAMES};
