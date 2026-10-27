'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const fixtures = require('../tools/shared-playback-cache/windows-fixtures.cjs');
const evidence = require('../tools/shared-playback-cache/fixture-frame-evidence.cjs');

async function root(t) {
  const value = await fs.mkdtemp(path.join(os.tmpdir(), 'ete-opaque-avi-'));
  t.after(() => fs.rm(value, {recursive:true, force:true}));
  return value;
}
async function hash(file) {
  const h=crypto.createHash('sha256');
  for await (const part of require('node:fs').createReadStream(file)) h.update(part);
  return h.digest('hex');
}
async function frameBytes(rootPath,row,frame) {
  const fd=await fs.open(path.join(rootPath,row.file),'r');
  try {
    const b=Buffer.alloc(row.frameStride-8);
    const {bytesRead}=await fd.read(b,0,b.length,row.dataStart+frame*row.frameStride+8);
    assert.equal(bytesRead,b.length); return b;
  } finally { await fd.close(); }
}
function parseFormatHeader(buffer, row) {
  const at=row.dataStart-12; // LIST movi begins immediately after the hdrl list.
  // Locate the single strf chunk within the small AVI header, before movi.
  const end=at;
  const start=12;
  let strf=-1;
  for(let i=start;i+8<=end;i++) if(buffer.toString('ascii',i,i+4)==='strf') {strf=i+8;break;}
  assert.notEqual(strf,-1);
  return {size:buffer.readUInt32LE(strf),width:buffer.readInt32LE(strf+4),height:buffer.readInt32LE(strf+8),planes:buffer.readUInt16LE(strf+12),bits:buffer.readUInt16LE(strf+14),compression:buffer.readUInt32LE(strf+16),imageSize:buffer.readUInt32LE(strf+20),colors:buffer.readUInt32LE(strf+32),important:buffer.readUInt32LE(strf+36)};
}
function previewFromBgr(raw) {
  const pixels=Buffer.alloc(160*90*4);
  for(let y=0;y<90;y++) for(let x=0;x<160;x++) {
    const sy=179-y*2,sx=x*2,src=(sy*320+sx)*3,dst=(y*160+x)*4;
    raw.copy(pixels,dst,src,src+3); pixels[dst+3]=255;
  }
  return {width:160,height:90,pixels};
}

test('opaque BGR24 AVI encodes deterministic distinct media/frame pixels and decodes to known fixture evidence', async t => {
  const palRoot=await root(t), rgbRoot=await root(t);
  const pal=await fixtures.generateFixtures(palRoot);
  const rgb=await fixtures.generateFixtures(rgbRoot,{encoding:'uncompressed-dib-bgr24'});
  assert.equal(pal.media.A.sha256,'794aa024fb1617d531554afe96c0f9c32254661cf5ebd308e5de02dd66e90f8c','historical pal8 control stays byte-identical');
  const c=require('../tools/shared-playback-cache/app-performance-contract.cjs'),span={start:0,end:c.LIMITS.prefixBytes};
  assert.equal(c.LIMITS.prefixBytes,6*1024*1024);
  for(const scenario of ['cached-seek','boundary-seek','uncached-seek','far-seek'])c.assertCoverage(scenario,c.coverageKind(span,c.frameRange(rgb.media.A,c.TARGETS[scenario])));
  assert.deepEqual(rgb.fixtures.map(r=>[r.fps,r.durationSeconds]),[[12,16],[24,8],[24,8]]);
  assert(rgb.fixtures.every(r=>r.encoding==='uncompressed-dib-bgr24'&&r.size<40*1048576));
  assert(rgb.fixtures.every(r=>r.size<pal.fixtures[r.id==='A'?0:r.id==='B'?1:2].size*3.05));
  assert.deepEqual((await fs.readdir(rgbRoot)).sort(),['A.avi','B.avi','C.avi']);
  for(let n=0;n<3;n++) {
    const row=rgb.fixtures[n], palRow=pal.fixtures[n], bytes=await fs.readFile(path.join(rgbRoot,row.file));
    assert.equal((await fs.stat(path.join(rgbRoot,row.file))).size,row.size);
    assert.equal(await hash(path.join(rgbRoot,row.file)),row.sha256);
    assert.equal(bytes.toString('ascii',0,4),'RIFF'); assert.equal(bytes.readUInt32LE(4),row.size-8);
    const fmt=parseFormatHeader(bytes,row);
    assert.deepEqual(fmt,{size:40,width:320,height:180,planes:1,bits:24,compression:0,imageSize:320*180*3,colors:0,important:0});
    assert.equal(row.frameStride,172808); assert.equal(row.dataStart,224);
    for(const index of [6,18]) {
      const bgr=await frameBytes(rgbRoot,row,index), indices=await frameBytes(palRoot,palRow,index);
      assert.equal(bgr.length,320*180*3); assert.equal(indices.length,320*180);
      const identity=n*192+index+1;
      // Independent dot-product definition of the spatial code, with no call
      // into the generator or matcher. Validate every raw bottom-up RGB pixel.
      const expected=Buffer.alloc(bgr.length);
      for(let p=0;p<indices.length;p++) {
        const x=p%320,y=179-Math.floor(p/320),cell=Math.floor(x/10)+32*Math.floor(y*32/180);
        const odd=[...((identity&cell).toString(2))].filter(bit=>bit==='1').length%2;
        expected[p*3]=odd?224:32;expected[p*3+1]=odd?192:64;expected[p*3+2]=(17+x+y*3)%256;
      }
      assert.deepEqual(bgr,expected);
      const verdict=evidence.analyze(previewFromBgr(bgr),{item:row.id,frameIndices:[index]});
      assert.equal(verdict.classification,'match'); assert.equal(verdict.targetHit,true);
      const wrong=evidence.analyze(previewFromBgr(bgr),{item:row.id,frameIndices:[index+1]});
      assert.equal(wrong.targetHit,false,`wrong target rejected: ${row.id} frame ${index}`);
    }
  }
});

test('opaque fixture option, identity verification, and exclusive generation fail closed', async t => {
  const invalidRoot=await root(t);
  await assert.rejects(fixtures.generateFixtures(invalidRoot,{encoding:'jpeg'}),/fixture-encoding/);
  assert.deepEqual(await fs.readdir(invalidRoot),[]);
  const target=await root(t), plan=await fixtures.generateFixtures(target,{encoding:'uncompressed-dib-bgr24'});
  const before=await hash(path.join(target,'A.avi'));
  await assert.rejects(fixtures.generateFixtures(target,{encoding:'uncompressed-dib-bgr24'}),/fixture-fresh-root-required/);
  assert.equal(await hash(path.join(target,'A.avi')),before);
  const stale={...plan,fixtures:plan.fixtures.map((r,i)=>i? r:{...r,sha256:'0'.repeat(64)})};
  await assert.rejects(fixtures.startWindowsSources({plan:stale}),/fixture-file-identity/);
  assert.equal(await hash(path.join(target,'A.avi')),before);
});

test('opaque AVI source serves a bounded real HTTP range with correct identity headers', async t => {
  const target=await root(t), plan=await fixtures.generateFixtures(target,{encoding:'uncompressed-dib-bgr24'});
  const source=await fixtures.startWindowsSources({plan});
  t.after(()=>source.close());
  const response=await fetch(source.mediaOrigin+'/Videos/A/stream.avi',{headers:{'User-Agent':fixtures.USER_AGENT,Range:'bytes=0-4095'}});
  assert.equal(response.status,206); assert.equal(response.headers.get('content-range'),`bytes 0-4095/${plan.media.A.size}`);
  assert.equal(response.headers.get('etag'),plan.media.A.etag);
  const body=Buffer.from(await response.arrayBuffer());
  assert.equal(body.length,4096); assert.deepEqual(body.subarray(0,12),Buffer.from(await fs.readFile(path.join(target,'A.avi'))).subarray(0,12));
});
