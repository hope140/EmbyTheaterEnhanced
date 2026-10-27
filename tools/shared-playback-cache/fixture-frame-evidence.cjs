'use strict';

const WIDTH=320,HEIGHT=180,PREVIEW_WIDTH=160,PREVIEW_HEIGHT=90,MAX_FRAMES=192;
const MAX_MEAN_ABS_RGB_DIFF=2;
const ITEMS=Object.freeze({A:65,B:66});
const DEFAULT_FRAMES=Object.freeze(Array.from({length:MAX_FRAMES},(_,index)=>index));
const PALETTE=Object.freeze(Array.from({length:256},(_,i)=>Object.freeze({b:i,g:(i*3)&255,r:(i*7)&255})));
const samplePoints=Object.freeze([[0,0],[PREVIEW_WIDTH-1,0],[0,PREVIEW_HEIGHT-1],
  [PREVIEW_WIDTH-1,PREVIEW_HEIGHT-1],[Math.floor(PREVIEW_WIDTH/2),Math.floor(PREVIEW_HEIGHT/2)]]);
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
function paletteIndex(item,frameIndex,x,y,offsetX=0,offsetY=0){
  const sourceX=Math.min(WIDTH-1,x*2+offsetX),sourceTopY=Math.min(HEIGHT-1,y*2+offsetY);
  const bottomUpY=HEIGHT-1-sourceTopY;
  return (frameIndex*19+sourceX+bottomUpY*11+ITEMS[item])&255;
}
function expectedColor(item,frameIndex,x,y,offsetX=0,offsetY=0){return PALETTE[paletteIndex(item,frameIndex,x,y,offsetX,offsetY)];}
function renderExpected(item,frameIndex){
  validateItem(item);need(Number.isInteger(frameIndex)&&frameIndex>=0&&frameIndex<MAX_FRAMES,'frame-index-invalid');
  const pixels=Buffer.alloc(PREVIEW_WIDTH*PREVIEW_HEIGHT*4);
  for(let y=0;y<PREVIEW_HEIGHT;y++)for(let x=0;x<PREVIEW_WIDTH;x++){
    const p=(y*PREVIEW_WIDTH+x)*4,color=expectedColor(item,frameIndex,x,y);
    pixels[p]=color.b;pixels[p+1]=color.g;pixels[p+2]=color.r;pixels[p+3]=255;
  }
  return {width:PREVIEW_WIDTH,height:PREVIEW_HEIGHT,pixels};
}
function sampleDiff(frame,item,frameIndex){
  let sum=0;
  for(const [x,y] of samplePoints){
    const p=(y*PREVIEW_WIDTH+x)*4,color=expectedColor(item,frameIndex,x,y);
    sum+=Math.abs(frame.pixels[p]-color.b)+Math.abs(frame.pixels[p+1]-color.g)+Math.abs(frame.pixels[p+2]-color.r);
  }
  return sum/(samplePoints.length*3);
}
function fullDiff(frame,item,frameIndex){
  let sum=0;
  for(let y=0;y<PREVIEW_HEIGHT;y++)for(let x=0;x<PREVIEW_WIDTH;x++){
    const p=(y*PREVIEW_WIDTH+x)*4,color=expectedColor(item,frameIndex,x,y);
    sum+=Math.abs(frame.pixels[p]-color.b)+Math.abs(frame.pixels[p+1]-color.g)+Math.abs(frame.pixels[p+2]-color.r);
  }
  return sum/(PREVIEW_WIDTH*PREVIEW_HEIGHT*3);
}
function candidates(frame,indices,items){
  const rows=[];
  for(const item of items)for(const frameIndex of indices){
    const sampleMeanAbsDiff=sampleDiff(frame,item,frameIndex);
    if(sampleMeanAbsDiff>MAX_MEAN_ABS_RGB_DIFF)continue;
    const meanAbsRGBDiff=fullDiff(frame,item,frameIndex);
    if(meanAbsRGBDiff<=MAX_MEAN_ABS_RGB_DIFF)rows.push({item,frameIndex,meanAbsRGBDiff,sampleMeanAbsDiff});
  }
  return rows.sort((a,b)=>a.meanAbsRGBDiff-b.meanAbsRGBDiff||a.item.localeCompare(b.item)||a.frameIndex-b.frameIndex);
}

// This matches only the fixed palette pattern. It does not establish a media PTS or decoder timestamp.
function sampleColorPredicate(frame,{item,frameIndices}={}){
  need(validFrame(frame),'frame-invalid');validateItem(item);const indices=validateFrames(frameIndices);
  const matches=[];
  for(const frameIndex of indices){
    const meanAbsRGBDiff=sampleDiff(frame,item,frameIndex);
    if(meanAbsRGBDiff<=MAX_MEAN_ABS_RGB_DIFF)matches.push({frameIndex,meanAbsRGBDiff});
  }
  return {matched:matches.length>0,item,matches,threshold:MAX_MEAN_ABS_RGB_DIFF,basis:'five-sample-palette-pattern-only'};
}

function analyze(frame,{item,frameIndices}={}){
  need(validFrame(frame),'frame-invalid');validateItem(item);
  const targetIndices=frameIndices===undefined?null:validateFrames(frameIndices);
  const all=candidates(frame,DEFAULT_FRAMES,Object.keys(ITEMS));
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
  const classification=all.length===0?'unmatched':expected.length===0?'wrong-item':
    targetIndices&&!targetHit?'wrong-target':all.length>1?'ambiguous':'match';
  const frameNumbers=[...new Set(all.map(row=>row.frameIndex))].sort((a,b)=>a-b);
  return {classification,knownFixtureMatch:all.length>0,item,matchedFrameIndices:frameNumbers,
    matches:all.map(row=>({...row})),meanAbsRGBDiff:all[0]?.meanAbsRGBDiff??null,targetHit,
    targetOffsetFrames,ambiguous:all.length>1,threshold:MAX_MEAN_ABS_RGB_DIFF,ptsConfirmed:false,
    basis:'fixed-top-left-nearest-2x-palette-pattern-only'};
}

module.exports={analyze,sampleColorPredicate,renderExpected,MAX_MEAN_ABS_RGB_DIFF,WIDTH,HEIGHT,PREVIEW_WIDTH,PREVIEW_HEIGHT,MAX_FRAMES};
