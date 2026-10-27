'use strict';
// A fixed-source test expectation, not a fitted LUT or a playback adjustment.
// mpv dd5d17d32 screenshot.c convert_image() rebuilds a BGR0 sRGB target.
// gpu-next's sRGB input/reference screenshot is gamma2.2; default fast zimg
// maps the target RGB sRGB tag to display-referred BT709/BT1886 (gamma2.4).
// See docs/SHARED_PLAYBACK_CACHE_APP_PERFORMANCE.md for the complete derivation.
const MODEL='mpv-gpu-next-zimg-fast-g22-to-bt1886';
const PROPERTIES=Object.freeze(['current-vo','video-params','video-out-params',
  'options/treat-srgb-as-power22','options/sws-allow-zimg','options/zimg-fast','options/zimg-dither',
  'gamma','brightness','contrast','saturation','hue','glsl-shaders']);
function video(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  return {width:value.w===320?320:null,height:value.h===180?180:null,
    format:value.pixelformat==='bgr24'?'bgr24':null,
    gamma:value.gamma==='srgb'?'srgb':null,
    primaries:['bt.709','bt709'].includes(value.primaries)?'bt.709':null,
    matrix:value.colormatrix==='rgb'?'rgb':null,
    levels:value.colorlevels==='full'?'full':null,
    alpha:value.alpha==='none'?'none':null};
}
function select(values){
  const input=video(values?.['video-params']),output=video(values?.['video-out-params']);
  const observations={vo:values?.['current-vo']==='gpu-next'?'gpu-next':null,input,output,
    treatSrgb:['auto','input','both'].includes(values?.['options/treat-srgb-as-power22'])?values['options/treat-srgb-as-power22']:null,
    allowZimg:typeof values?.['options/sws-allow-zimg']==='boolean'?values['options/sws-allow-zimg']:null,
    fast:typeof values?.['options/zimg-fast']==='boolean'?values['options/zimg-fast']:null,
    dither:values?.['options/zimg-dither']==='random'?'random':null,
    adjustments:Object.fromEntries(['gamma','brightness','contrast','saturation','hue'].map(key=>[key,
      typeof values?.[key]==='number'&&Number.isFinite(values[key])&&Math.abs(values[key])<=100?values[key]:null])),
    shaderCount:Array.isArray(values?.['glsl-shaders'])&&values['glsl-shaders'].length<=64?values['glsl-shaders'].length:null};
  const complete=v=>v&&Object.values(v).every(value=>value!==null);
  const supported=!!(observations.vo&&complete(input)&&complete(output)&&observations.treatSrgb&&observations.allowZimg===true&&
    observations.fast===true&&observations.dither&&Object.values(observations.adjustments).every(value=>value===0)&&observations.shaderCount===0);
  return {supported,model:supported?MODEL:null,observations,
    basis:'fixed-mpv-screenshot-postconversion; observed-options-required; not-a-runtime-path-trace'};
}
async function readProfile(client){
  const rows=await Promise.all(PROPERTIES.map(async property=>{
    try{return[property,await client.getProperty(property,1000)];}catch(_){return[property,null];}
  }));
  return select(Object.fromEntries(rows));
}
function value(byte,model='identity'){
  if(!Number.isInteger(byte)||byte<0||byte>255)throw Error('fixture-color-byte-invalid');
  if(model==='identity')return byte;
  if(model!==MODEL)throw Error('fixture-color-model-invalid');
  return 255*Math.pow(byte/255,2.2/2.4);
}
module.exports={MODEL,PROPERTIES,readProfile,select,value};
