'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const contract=require('./windows-contract.cjs');

const OWNER='ETE ordinary app performance owned trial v1\n';
const PHASES=new Set(['reference','paused-target','resumed']);
const PREVIEW={width:160,height:90,rawBytes:160*90*4,pngBytes:128*1024};
const CARRIER={width:4096,height:2160,rawBytes:16*1024*1024,pngBytes:2*1024*1024};
const CASE_TOTAL_BYTES=8*1024*1024;
const MAX_CASE_MANIFEST=1024*1024;
const PNG_SIGNATURE=Buffer.from([137,80,78,71,13,10,26,10]);
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function fail(code){throw Error('app-pixel-audit-'+code);}
function isDirectory(root){
  try{contract.physical(root,true);return true;}catch(_){return false;}
}
function sameDirectory(left,right){
  try{
    const a=fs.realpathSync(path.resolve(left)),b=fs.realpathSync(path.resolve(right));
    return process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
  }catch(_){return true;}
}
function openRead(file,limit){
  let fd;
  try{
    const before=fs.lstatSync(file);
    if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size>limit)fail('source-file-invalid');
    const noFollow=fs.constants.O_NOFOLLOW||0;
    fd=fs.openSync(file,fs.constants.O_RDONLY|noFollow);
    const after=fs.fstatSync(fd);
    if(!after.isFile()||after.nlink!==1||after.size!==before.size||after.dev!==before.dev||after.ino!==before.ino)fail('source-file-invalid');
    return {fd,stat:after};
  }catch(error){if(fd!==undefined)try{fs.closeSync(fd);}catch(_){} if(error.message?.startsWith('app-pixel-audit-'))throw error;fail('source-file-invalid');}
}
function readBounded(file,limit){
  const opened=openRead(file,limit);
  try{
    const bytes=fs.readFileSync(opened.fd);
    if(bytes.length!==opened.stat.size||bytes.length>limit)fail('source-file-invalid');
    return bytes;
  }finally{fs.closeSync(opened.fd);}
}
function frameInfo(kind,frame){
  const limit=kind==='preview'?PREVIEW:CARRIER;
  if(!frame||!Number.isInteger(frame.width)||!Number.isInteger(frame.height)||frame.width<1||frame.height<1||
    frame.width>limit.width||frame.height>limit.height||!Buffer.isBuffer(frame.pixels))fail('frame-invalid');
  const rawBytes=frame.width*frame.height*4;
  if(!Number.isSafeInteger(rawBytes)||rawBytes!==frame.pixels.length||rawBytes>limit.rawBytes)fail('frame-invalid');
  if(kind==='preview')for(let i=3;i<frame.pixels.length;i+=4)if(frame.pixels[i]!==255)fail('preview-alpha-invalid');
  let bMin=255,bMax=0,gMin=255,gMax=0,rMin=255,rMax=0,bSum=0,gSum=0,rSum=0;
  for(let i=0;i<frame.pixels.length;i+=4){
    const b=frame.pixels[i],g=frame.pixels[i+1],r=frame.pixels[i+2];
    if(b<bMin)bMin=b;if(b>bMax)bMax=b;if(g<gMin)gMin=g;if(g>gMax)gMax=g;if(r<rMin)rMin=r;if(r>rMax)rMax=r;
    bSum+=b;gSum+=g;rSum+=r;
  }
  const pixels=frame.width*frame.height;
  const points=[[0,0],[frame.width-1,0],[0,frame.height-1],[frame.width-1,frame.height-1],
    [Math.floor(frame.width/2),Math.floor(frame.height/2)]];
  return {width:frame.width,height:frame.height,bytes:rawBytes,sha256:hash(frame.pixels),bgr:{
    b:{min:bMin,max:bMax,mean:bSum/pixels},g:{min:gMin,max:gMax,mean:gSum/pixels},r:{min:rMin,max:rMax,mean:rSum/pixels}},
    samples:points.map(([x,y])=>{const offset=(y*frame.width+x)*4;return {x,y,b:frame.pixels[offset],g:frame.pixels[offset+1],r:frame.pixels[offset+2]};})};
}
function metadata(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['generation','requestMs','resolveMs'].includes(key))||
    !Number.isSafeInteger(value.generation)||value.generation<=0||!Number.isFinite(value.requestMs)||value.requestMs<0||
    !Number.isFinite(value.resolveMs)||value.resolveMs<value.requestMs)fail('metadata-invalid');
  return {generation:value.generation,requestMs:value.requestMs,resolveMs:value.resolveMs};
}
function pngMatches(png,width,height){
  return Buffer.isBuffer(png)&&png.length>=24&&png.subarray(0,8).equals(PNG_SIGNATURE)&&png.toString('ascii',12,16)==='IHDR'&&
    png.readUInt32BE(16)===width&&png.readUInt32BE(20)===height;
}
function pngWithinLimits(png,kind){
  if(!Buffer.isBuffer(png)||png.length<24||!png.subarray(0,8).equals(PNG_SIGNATURE)||png.toString('ascii',12,16)!=='IHDR')return false;
  const limits=kind==='preview'?PREVIEW:CARRIER,width=png.readUInt32BE(16),height=png.readUInt32BE(20);
  return width>0&&height>0&&width<=limits.width&&height<=limits.height;
}
function createAudit({root,index,encodePNG}={}){
  if(!Number.isInteger(index)||![0,1].includes(index))fail('index-invalid');
  if(!isDirectory(root))fail('root-invalid');
  if(typeof encodePNG!=='function')fail('encoder-invalid');
  const rows=[];let totalBytes=0;
  function record(kind,phase,frame,meta){
    if(!PHASES.has(phase))fail('phase-invalid');
    const source=frameInfo(kind,frame),safeMeta=metadata(meta);
    let png;try{png=encodePNG({width:source.width,height:source.height,pixels:frame.pixels});}catch(_){fail('png-encode-failed');}
    const limit=kind==='preview'?PREVIEW:CARRIER;
    if(!pngMatches(png,source.width,source.height)||png.length>limit.pngBytes)fail('png-invalid');
    const name=`case-${index}-${phase}-${kind}.png`,pngHash=hash(png),nextTotal=totalBytes+png.length;
    if(nextTotal>CASE_TOTAL_BYTES)fail('case-size-limit');
    const destination=path.join(root,name);let fd,created=false;
    try{
      fd=fs.openSync(destination,'wx',0o600);
      created=true;
      fs.writeFileSync(fd,png);
      fs.closeSync(fd);fd=undefined;
    }catch(_){
      if(fd!==undefined)try{fs.closeSync(fd);}catch(_){}
      if(created)try{fs.unlinkSync(destination);}catch(_){}
      fail('file-write-failed');
    }
    const row={name,kind,phase,width:source.width,height:source.height,bytes:png.length,sha256:pngHash,
      sourceWidth:source.width,sourceHeight:source.height,sourceBytes:source.bytes,sourceSha256:source.sha256,bgr:source.bgr,samples:source.samples,...safeMeta};
    rows.push(Object.freeze(row));totalBytes=nextTotal;return {...row,bgr:{b:{...row.bgr.b},g:{...row.bgr.g},r:{...row.bgr.r}},samples:row.samples.map(point=>({...point}))};
  }
  return Object.freeze({
    preview(phase,frame,meta){return record('preview',phase,frame,meta);},
    carrier(phase,frame,meta){return record('carrier',phase,frame,meta);},
    files(){return rows.map(({name,sha256,bytes})=>({name,sha256,bytes}));}
  });
}
function auditName(index,name){return typeof name==='string'&&new RegExp(`^case-${index}-(?:reference|paused-target|resumed)-(?:preview|carrier)\\.png$`).test(name);}
function declaredAudits(caseFile,index){
  try{fs.lstatSync(caseFile);}catch(error){if(error.code==='ENOENT')return [];fail('manifest-invalid');}
  let manifest;try{manifest=JSON.parse(readBounded(caseFile,MAX_CASE_MANIFEST).toString('utf8'));}catch(error){if(error.message?.startsWith('app-pixel-audit-'))throw error;fail('manifest-invalid');}
  if(!manifest||typeof manifest!=='object'||Array.isArray(manifest)||manifest.index!==index||!Array.isArray(manifest.pixelAuditFiles)||manifest.pixelAuditFiles.length>6)fail('manifest-invalid');
  const names=new Set();
  const rows=manifest.pixelAuditFiles.map(row=>{
    if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(key=>!['name','sha256','bytes'].includes(key))||
      Object.keys(row).length!==3||!auditName(index,row.name)||names.has(row.name)||
      !/^[a-f0-9]{64}$/.test(row.sha256||'')||!Number.isSafeInteger(row.bytes)||row.bytes<1)fail('manifest-invalid');
    names.add(row.name);
    const kind=row.name.endsWith('-preview.png')?'preview':'carrier';
    const max=kind==='preview'?PREVIEW.pngBytes:CARRIER.pngBytes;
    if(row.bytes>max)fail('manifest-invalid');
    return {name:row.name,sha256:row.sha256,bytes:row.bytes,kind,index};
  });
  return rows;
}
function copyAudits(from,to){
  if(!isDirectory(from)||!isDirectory(to))fail('copy-root-invalid');
  if(sameDirectory(from,to))fail('copy-root-invalid');
  const owner=readBounded(path.join(from,'owner'),256);
  if(owner.toString('utf8')!==OWNER)fail('owner-invalid');
  const declared=[...declaredAudits(path.join(from,'case-0.json'),0),...declaredAudits(path.join(from,'case-1.json'),1)];
  const globalNames=new Set();let totals=[0,0];
  const validated=declared.map(row=>{
    if(globalNames.has(row.name))fail('manifest-invalid');globalNames.add(row.name);
    totals[row.index]+=row.bytes;if(totals[row.index]>CASE_TOTAL_BYTES)fail('manifest-invalid');
    const bytes=readBounded(path.join(from,row.name),row.kind==='preview'?PREVIEW.pngBytes:CARRIER.pngBytes);
    if(bytes.length!==row.bytes||hash(bytes)!==row.sha256)fail('file-hash-mismatch');
    if(!pngWithinLimits(bytes,row.kind))fail('file-invalid');
    return {...row,data:bytes};
  });
  const created=[];
  try{
    for(const row of validated){
      const destination=path.join(to,row.name);let fd,createdFile=false;
      try{fd=fs.openSync(destination,'wx',0o600);createdFile=true;fs.writeFileSync(fd,row.data);fs.closeSync(fd);fd=undefined;created.push(destination);}
      catch(_){if(fd!==undefined)try{fs.closeSync(fd);}catch(_){}if(createdFile)try{fs.unlinkSync(destination);}catch(_){}fail('copy-failed');}
    }
  }catch(error){for(const file of created)try{fs.unlinkSync(file);}catch(_){}throw error;}
  return validated.length;
}
if(require.main===module){
  const args=process.argv.slice(2);
  if(args.length!==3||args[0]!=='--copy')fail('usage');
  try{const count=copyAudits(path.resolve(args[1]),path.resolve(args[2]));process.stdout.write('app-pixel-audit-copied='+count+'\n');}
  catch(_){process.stderr.write('app-pixel-audit-copy-failed\n');process.exitCode=1;}
}
module.exports={createAudit,copyAudits};
