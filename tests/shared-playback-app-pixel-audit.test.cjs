'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const audit=require('../tools/shared-playback-cache/app-pixel-audit.cjs');
const OWNER='ETE ordinary app performance owned trial v1\n';
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function pngHeader(width,height,size=24){
  const bytes=Buffer.alloc(size);signature.copy(bytes);bytes.writeUInt32BE(size-8,8);bytes.write('IHDR',12,'ascii');bytes.writeUInt32BE(width,16);bytes.writeUInt32BE(height,20);return bytes;
}
function fakePNG({width,height,pixels}){
  const head=pngHeader(width,height,24);return Buffer.concat([head,Buffer.from(pixels)]);
}
function rgbaFrame(width=2,height=2,alpha=255){
  const pixels=Buffer.alloc(width*height*4);
  for(let i=0;i<pixels.length;i+=4){pixels[i]=i%256;pixels[i+1]=(i+1)%256;pixels[i+2]=(i+2)%256;pixels[i+3]=alpha;}
  return {width,height,pixels};
}
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ete-pixel-audit-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function oneAudit(t,index=0,encodePNG=fakePNG){const base=temp(t),root=path.join(base,'root');fs.mkdirSync(root);return {base,root,audit:audit.createAudit({root,index,encodePNG})};}
const meta={generation:7,requestMs:101.25,resolveMs:107.5};

test('synthetic PNG audit rows preserve raw BGRA hash, bounded dimensions, statistics and safe metadata',t=>{
  const f=oneAudit(t);const result=f.audit.preview('reference',rgbaFrame(),meta);
  const raw=rgbaFrame();
  assert.equal(result.name,'case-0-reference-preview.png');assert.equal(result.sourceSha256,digest(raw.pixels));
  assert.equal(result.sourceBytes,16);assert.equal(result.sourceWidth,2);assert.equal(result.sourceHeight,2);
  assert.deepEqual(result.bgr,{b:{min:0,max:12,mean:6},g:{min:1,max:13,mean:7},r:{min:2,max:14,mean:8}});
  assert.equal(result.samples.length,5);assert.deepEqual(result.samples[0],{x:0,y:0,b:0,g:1,r:2});
  assert.ok(result.samples.every(point=>Object.keys(point).sort().join(',')==='b,g,r,x,y'&&[point.x,point.y,point.b,point.g,point.r].every(Number.isFinite)));
  assert.deepEqual({generation:result.generation,requestMs:result.requestMs,resolveMs:result.resolveMs},meta);
  assert.deepEqual(f.audit.files(),[{name:result.name,sha256:result.sha256,bytes:result.bytes}]);
  assert.deepEqual(fs.readFileSync(path.join(f.root,result.name)),fakePNG({width:2,height:2,pixels:raw.pixels}));
});

test('carrier audit permits bounded larger BGRA while storing only its encoded image',t=>{
  const f=oneAudit(t);const frame=rgbaFrame(128,64,0),result=f.audit.carrier('paused-target',frame,meta);
  assert.equal(result.sourceBytes,128*64*4);assert.equal(result.sourceSha256,digest(frame.pixels));
  assert.equal(result.name,'case-0-paused-target-carrier.png');
  assert.equal(fs.statSync(path.join(f.root,result.name)).size,result.bytes);
  assert.equal(f.audit.files().length,1);
});

test('exact 3-phase by 2-kind PNG names are unique and never overwrite an existing file',t=>{
  const f=oneAudit(t),phases=['reference','paused-target','resumed'];
  for(const phase of phases){f.audit.preview(phase,rgbaFrame(),meta);f.audit.carrier(phase,rgbaFrame(),meta);}
  const files=f.audit.files();assert.equal(files.length,6);assert.equal(new Set(files.map(row=>row.name)).size,6);
  const before=fs.readFileSync(path.join(f.root,'case-0-reference-preview.png'));
  assert.throws(()=>f.audit.preview('reference',rgbaFrame(),meta),/^Error: app-pixel-audit-file-write-failed$/);
  assert.deepEqual(fs.readFileSync(path.join(f.root,'case-0-reference-preview.png')),before);
  assert.equal(files.every(row=>Object.keys(row).sort().join(',')==='bytes,name,sha256'),true);
});

test('bad phases, indexes, metadata and raw frame layouts fail closed',t=>{
  const f=oneAudit(t);
  for(const [phase,frame,metadataValue] of [
    ['other',rgbaFrame(),meta],['reference',{...rgbaFrame(),pixels:Buffer.alloc(3)},meta],
    ['reference',rgbaFrame(2,2,254),meta],['reference',rgbaFrame(),{...meta,url:'https://private.invalid/?token=secret'}],
    ['reference',rgbaFrame(),{...meta,generation:0}],['reference',rgbaFrame(),{...meta,resolveMs:NaN}],['reference',rgbaFrame(),{...meta,requestMs:200,resolveMs:100}],
  ])assert.throws(()=>f.audit.preview(phase,frame,metadataValue),/^Error: app-pixel-audit-/);
  for(const index of [-1,2,NaN,'0'])assert.throws(()=>audit.createAudit({root:f.root,index,encodePNG:fakePNG}),/^Error: app-pixel-audit-index-invalid$/);
  assert.throws(()=>audit.createAudit({root:path.join(f.root,'missing'),index:0,encodePNG:fakePNG}),/^Error: app-pixel-audit-root-invalid$/);
  assert.throws(()=>audit.createAudit({root:f.root,index:0}),/^Error: app-pixel-audit-encoder-invalid$/);
});

test('preview and carrier dimensions, raw limits, PNG signatures, dimensions and encoded byte caps are enforced',t=>{
  const f=oneAudit(t);
  assert.throws(()=>f.audit.preview('reference',rgbaFrame(161,1),meta),/^Error: app-pixel-audit-frame-invalid$/);
  assert.throws(()=>f.audit.carrier('reference',rgbaFrame(4097,1,0),meta),/^Error: app-pixel-audit-frame-invalid$/);
  assert.throws(()=>f.audit.carrier('reference',{width:2049,height:2049,pixels:Buffer.alloc(16*1024*1024+4)},meta),/^Error: app-pixel-audit-frame-invalid$/);
  const tooLargePreview=oneAudit(t,0,(frame)=>Buffer.concat([pngHeader(frame.width,frame.height,24),Buffer.alloc(128*1024+1-24)]));
  assert.throws(()=>tooLargePreview.audit.preview('reference',rgbaFrame(),meta),/^Error: app-pixel-audit-png-invalid$/);
  const tooLargeCarrier=oneAudit(t,0,(frame)=>Buffer.concat([pngHeader(frame.width,frame.height,24),Buffer.alloc(2*1024*1024+1-24)]));
  assert.throws(()=>tooLargeCarrier.audit.carrier('reference',rgbaFrame(),meta),/^Error: app-pixel-audit-png-invalid$/);
  const wrongSig=oneAudit(t,0,frame=>{const bytes=fakePNG(frame);bytes[0]=0;return bytes;});
  assert.throws(()=>wrongSig.audit.preview('reference',rgbaFrame(),meta),/^Error: app-pixel-audit-png-invalid$/);
  const wrongDimensions=oneAudit(t,0,frame=>fakePNG({...frame,width:frame.width+1}));
  assert.throws(()=>wrongDimensions.audit.preview('reference',rgbaFrame(),meta),/^Error: app-pixel-audit-png-invalid$/);
});

function completeSource(t){
  const base=temp(t),from=path.join(base,'from'),to=path.join(base,'safe');fs.mkdirSync(from);fs.mkdirSync(to);
  fs.writeFileSync(path.join(from,'owner'),OWNER,{flag:'wx'});
  for(const index of [0,1]){
    const current=audit.createAudit({root:from,index,encodePNG:fakePNG});
    for(const phase of ['reference','paused-target','resumed']){current.preview(phase,rgbaFrame(),meta);current.carrier(phase,rgbaFrame(),meta);}
    fs.writeFileSync(path.join(from,`case-${index}.json`),JSON.stringify({index,pixelAuditFiles:current.files()}),{flag:'wx'});
  }
  fs.mkdirSync(path.join(from,'profile-0'));
  fs.writeFileSync(path.join(from,'profile-0','private.bin'),'never-copy');
  return {base,from,to};
}

test('copyAudits copies only both cases’ declared fixed PNG names after owner, hardlink, size and hash validation',t=>{
  const f=completeSource(t);const copied=audit.copyAudits(f.from,f.to);
  assert.equal(copied,12);
  assert.equal(fs.existsSync(path.join(f.to,'profile-0')),false);
  assert.ok(fs.readdirSync(f.to).every(name=>/^case-[01]-(?:reference|paused-target|resumed)-(?:preview|carrier)\.png$/.test(name)));
});

test('copyAudits prevalidates both case manifests and every hash before creating any destination file',t=>{
  for(const mutate of [
    manifest=>{manifest.pixelAuditFiles[0].sha256='0'.repeat(64);},
    manifest=>{manifest.pixelAuditFiles.push({...manifest.pixelAuditFiles[0]});},
    manifest=>{manifest.pixelAuditFiles[0].sourcePath='../../private';},
    manifest=>{manifest.pixelAuditFiles[0].name='../private.bin';},
    manifest=>{manifest.pixelAuditFiles[0].bytes=2*1024*1024+1;},
  ]){
    const f=completeSource(t),file=path.join(f.from,'case-1.json'),manifest=JSON.parse(fs.readFileSync(file,'utf8'));
    mutate(manifest);fs.writeFileSync(file,JSON.stringify(manifest));
    assert.throws(()=>audit.copyAudits(f.from,f.to),/^Error: app-pixel-audit-/);
    assert.deepEqual(fs.readdirSync(f.to),[]);
  }
  const malformed=completeSource(t),auditFile=path.join(malformed.from,'case-0-reference-preview.png');
  fs.writeFileSync(auditFile,Buffer.from('not png'));const receiptPath=path.join(malformed.from,'case-0.json');
  const receipt=JSON.parse(fs.readFileSync(receiptPath,'utf8'));receipt.pixelAuditFiles[0].bytes=7;receipt.pixelAuditFiles[0].sha256=digest(fs.readFileSync(auditFile));
  fs.writeFileSync(receiptPath,JSON.stringify(receipt));
  assert.throws(()=>audit.copyAudits(malformed.from,malformed.to),/^Error: app-pixel-audit-file-invalid$/);
  assert.deepEqual(fs.readdirSync(malformed.to),[]);
});

test('copyAudits rejects wrong owner, symlinks, hardlinks and redirected roots',t=>{
  const wrong=completeSource(t);fs.writeFileSync(path.join(wrong.from,'owner'),'wrong owner\n');
  assert.throws(()=>audit.copyAudits(wrong.from,wrong.to),/^Error: app-pixel-audit-owner-invalid$/);assert.deepEqual(fs.readdirSync(wrong.to),[]);
  const linked=completeSource(t),first=path.join(linked.from,'case-0-reference-preview.png'),backup=path.join(linked.base,'hardlink.png');
  fs.linkSync(first,backup);
  assert.throws(()=>audit.copyAudits(linked.from,linked.to),/^Error: app-pixel-audit-source-file-invalid$/);assert.deepEqual(fs.readdirSync(linked.to),[]);
  const symlinked=completeSource(t),png=path.join(symlinked.from,'case-0-reference-preview.png'),old=path.join(symlinked.base,'old.png');
  fs.renameSync(png,old);
  if(process.platform==='win32'){
    // Junctions exercise a real redirected source without requiring the
    // optional Windows file-symbolic-link privilege in an offline test.
    const directory=path.join(symlinked.base,'redirected-png');fs.mkdirSync(directory);fs.symlinkSync(directory,png,'junction');
  }else fs.symlinkSync(old,png,'file');
  assert.throws(()=>audit.copyAudits(symlinked.from,symlinked.to),/^Error: app-pixel-audit-source-file-invalid$/);assert.deepEqual(fs.readdirSync(symlinked.to),[]);
  const alias=completeSource(t),redirect=path.join(alias.base,'from-link');fs.symlinkSync(alias.from,redirect,process.platform==='win32'?'junction':'dir');
  assert.throws(()=>audit.copyAudits(redirect,alias.to),/^Error: app-pixel-audit-copy-root-invalid$/);
  const parentAlias=completeSource(t),realParent=path.join(parentAlias.base,'actual'),aliasParent=path.join(parentAlias.base,'parent-link');
  fs.renameSync(parentAlias.from,realParent);fs.symlinkSync(parentAlias.base,aliasParent,process.platform==='win32'?'junction':'dir');
  const redirectedChild=path.join(aliasParent,'actual');
  assert.throws(()=>audit.copyAudits(redirectedChild,parentAlias.to),/^Error: app-pixel-audit-copy-root-invalid$/);
});

function partialSource(t){
  const f=completeSource(t),case0=path.join(f.from,'case-0.json'),manifest=JSON.parse(fs.readFileSync(case0,'utf8'));
  const keep=manifest.pixelAuditFiles.find(row=>row.name==='case-0-reference-preview.png');
  manifest.pixelAuditFiles=[keep];fs.writeFileSync(case0,JSON.stringify(manifest));fs.unlinkSync(path.join(f.from,'case-1.json'));
  return f;
}

test('partial failed A-only audit copies the one declared existing PNG without requiring B or the other phases',t=>{
  const f=partialSource(t);assert.equal(audit.copyAudits(f.from,f.to),1);
  assert.deepEqual(fs.readdirSync(f.to),['case-0-reference-preview.png']);
});

test('zero existing audit reports returns zero without creating files',t=>{
  const f=completeSource(t);fs.rmSync(path.join(f.from,'case-0.json'));fs.rmSync(path.join(f.from,'case-1.json'));
  assert.equal(audit.copyAudits(f.from,f.to),0);assert.deepEqual(fs.readdirSync(f.to),[]);
});

test('an empty existing case report is a valid zero-file partial audit',t=>{
  const f=partialSource(t);fs.writeFileSync(path.join(f.from,'case-0.json'),JSON.stringify({index:0,pixelAuditFiles:[]}));
  assert.equal(audit.copyAudits(f.from,f.to),0);assert.deepEqual(fs.readdirSync(f.to),[]);
});

test('a declared but missing file fails before copying any other declared audit',t=>{
  const f=completeSource(t);fs.unlinkSync(path.join(f.from,'case-1-resumed-carrier.png'));
  assert.throws(()=>audit.copyAudits(f.from,f.to),/^Error: app-pixel-audit-source-file-invalid$/);
  assert.deepEqual(fs.readdirSync(f.to),[]);
});

test('copy collisions preserve existing files and roll back newly created copies',t=>{
  const f=completeSource(t),first='case-0-reference-preview.png',last='case-1-resumed-carrier.png';
  fs.writeFileSync(path.join(f.to,last),'keep existing');
  assert.throws(()=>audit.copyAudits(f.from,f.to),/^Error: app-pixel-audit-copy-failed$/);
  assert.deepEqual(fs.readdirSync(f.to),[last]);assert.equal(fs.readFileSync(path.join(f.to,last),'utf8'),'keep existing');
  assert.equal(fs.existsSync(path.join(f.to,first)),false);
});

test('CLI --copy uses the same allowlisted audit copier',t=>{
  const f=completeSource(t),result=cp.spawnSync(process.execPath,[path.join(__dirname,'../tools/shared-playback-cache/app-pixel-audit.cjs'),'--copy',f.from,f.to],{encoding:'utf8'});
  assert.equal(result.status,0);assert.equal(fs.readdirSync(f.to).length,12);assert.equal(result.stdout,'app-pixel-audit-copied=12\n');assert.equal(result.stderr,'');
});
