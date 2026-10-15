'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { validateCandidateArchive, validateCandidateMembers } = require('../src/electronapp/enhanced/mpv-kernel-package');

const helper = { sha256: 'a'.repeat(64), version: '1.0.0' };
const caps = ['private-inherited-pipe','native-child-hwnd','gpu-next','d3d11','generation-attribution'];
function hash(b) { return crypto.createHash('sha256').update(b).digest('hex'); }
function peBuffer() {
  const b=Buffer.alloc(0x700); b.writeUInt16LE(0x5a4d,0); b.writeUInt32LE(0x80,0x3c); b.writeUInt32LE(0x4550,0x80);
  const p=0x84; b.writeUInt16LE(0x8664,p+0); b.writeUInt16LE(1,p+2); b.writeUInt16LE(0xf0,p+16); b.writeUInt16LE(0x2022,p+18);
  const o=p+20; b.writeUInt16LE(0x20b,o); b.writeUInt32LE(0x2000,o+56); b.writeUInt32LE(0x200,o+60); b.writeUInt32LE(16,o+108); b.writeUInt32LE(0x1000,o+112); b.writeUInt32LE(0x80,o+116);
  const s=o+0xf0; b.writeUInt32LE(0x500,s+8); b.writeUInt32LE(0x1000,s+12); b.writeUInt32LE(0x500,s+16); b.writeUInt32LE(0x200,s+20);
  const e=0x200; b.writeUInt32LE(1,e+16); b.writeUInt32LE(18,e+20); b.writeUInt32LE(17,e+24); b.writeUInt32LE(0x1040,e+28); b.writeUInt32LE(0x1088,e+32); b.writeUInt32LE(0x10cc,e+36);
  const np=0x288, op=0x2cc, fp=0x240, namesAt=0x300;
  for(let i=0;i<17;i++){ b.writeUInt32LE(0x10e0+i*4,fp+i*4); b.writeUInt32LE(0x1100+i*32,np+i*4); b.writeUInt16LE(i,op+i*2); b.write(EXPORT_NAMES[i]+'\0',namesAt+i*32,'ascii'); }
  return b;
}
function peWithBssBeforeExports() {
  const b=peBuffer(), p=0x84, o=0x98, first=0x188, second=first+40;
  b.writeUInt16LE(2,p+2); b.writeUInt32LE(0x3000,o+56);
  b.copy(b,second,first,first+40); b.writeUInt32LE(0x100,first+8);b.writeUInt32LE(0x1000,first+12);b.writeUInt32LE(0,first+16);b.writeUInt32LE(0,first+20);
  b.writeUInt32LE(0x2000,second+12);b.writeUInt32LE(0x2000,o+112);
  for(const off of [0x200+28,0x200+32,0x200+36])b.writeUInt32LE(b.readUInt32LE(off)+0x1000,off);
  for(let i=0;i<17;i++){b.writeUInt32LE(b.readUInt32LE(0x240+i*4)+0x1000,0x240+i*4);b.writeUInt32LE(b.readUInt32LE(0x288+i*4)+0x1000,0x288+i*4);}
  return b;
}
const EXPORT_NAMES=['mpv_create','mpv_initialize','mpv_set_option_string','mpv_observe_property','mpv_unobserve_property','mpv_wait_event','mpv_terminate_destroy','mpv_command','mpv_command_async','mpv_get_property','mpv_set_property_string','mpv_get_property_string','mpv_free','mpv_free_node_contents','mpv_client_api_version','mpv_error_string','mpv_event_name'];
function makeMembers(overrides={}) {
  const dll=overrides.dll || peBuffer(), source=Buffer.from('Synthetic source fixture\n'), notice=Buffer.from('Synthetic notice fixture\n');
  const m={ schemaVersion:1, libmpv:{file:'mpv-1.dll',version:'mpv v0.42.0-example',sizeBytes:dll.length,sha256:hash(dll),machine:'x64',clientApiVersion:131077}, helperContract:{fileSha256:helper.sha256,version:helper.version,protocolVersion:1,clientApiVersion:131077,requiredCapabilities:caps}, source:{project:'Synthetic',release:'test-1',revision:'deadbeef',reference:'https://example.org/source'}, license:{spdxExpression:'GPL-3.0-or-later',redistribution:'declared-permitted'},sourceSha256:hash(source),noticeSha256:hash(notice) };
  return { 'candidate.json':Buffer.from(JSON.stringify(m)), 'mpv-1.dll':dll, 'SOURCE.txt':source, 'NOTICE.txt':notice, ...(overrides.memberOverrides || {}) };
}
function crc32(buf){let c=0xffffffff;for(const x of buf){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function zip(members, { deflate=false, nameOverride=null, corruptCrc=false, localNameMismatch=false, extraMember=false,
  compressedTailName=null, compressedTail=null }={}) {
  let locals=[], centrals=[], offset=0; const names=Object.keys(members); if(extraMember) names.push('extra.txt');
  for(const name of names){ const raw=members[name] || Buffer.from('x'); const nb=Buffer.from(nameOverride && name==='SOURCE.txt'?nameOverride:name); let packed=deflate?zlib.deflateRawSync(raw):raw; if(deflate&&compressedTailName===name&&compressedTail)packed=Buffer.concat([packed,compressedTail]); const method=deflate?8:0, crc=(crc32(raw)+(corruptCrc&&name==='SOURCE.txt'?1:0))>>>0;
    const l=Buffer.alloc(30+nb.length); l.writeUInt32LE(0x04034b50,0);l.writeUInt16LE(0x0800,6);l.writeUInt16LE(method,8);l.writeUInt32LE(crc,14);l.writeUInt32LE(packed.length,18);l.writeUInt32LE(raw.length,22);l.writeUInt16LE(nb.length,26);nb.copy(l,30);if(localNameMismatch&&name==='SOURCE.txt')l[30]^=1;
    locals.push(l,packed); const c=Buffer.alloc(46+nb.length);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(0x0314,4);c.writeUInt16LE(0x0800,8);c.writeUInt16LE(method,10);c.writeUInt32LE(crc,16);c.writeUInt32LE(packed.length,20);c.writeUInt32LE(raw.length,24);c.writeUInt16LE(nb.length,28);c.writeUInt32LE(0x81a40000,38);c.writeUInt32LE(offset,42);nb.copy(c,46);centrals.push(c);offset+=l.length+packed.length;
  }
  const cd=Buffer.concat(centrals), body=Buffer.concat(locals), end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(names.length,8);end.writeUInt16LE(names.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(body.length,16);return Buffer.concat([body,cd,end]);
}
function records(buf){const e=buf.length-22, cd=buf.readUInt32LE(e+16), count=buf.readUInt16LE(e+10), out=[];let p=cd;for(let i=0;i<count;i++){const nl=buf.readUInt16LE(p+28),xl=buf.readUInt16LE(p+30),cl=buf.readUInt16LE(p+32),name=buf.toString('ascii',p+46,p+46+nl),lo=buf.readUInt32LE(p+42),ln=buf.readUInt16LE(lo+26),lx=buf.readUInt16LE(lo+28),cs=buf.readUInt32LE(p+20);out.push({p,name,lo,nl,data:lo+30+ln+lx,cs});p+=46+nl+xl+cl;}return{e,cd:buf.readUInt32LE(e+16),out};}
function mutatedZip(change, {deflate=false}={}){const b=Buffer.from(zip(makeMembers(),{deflate}));change(b,records(b));return b;}
function expectCode(fn, code) { assert.throws(fn, e => e && e.code === code && !e.message.includes('E:\\') && !e.message.includes('candidate.json')); }

test('valid synthetic Store and Deflate packages return sanitized candidate data',()=>{
  for(const deflate of [false,true]){const result=validateCandidateArchive(zip(makeMembers(),{deflate}),helper);assert.equal(result.candidateId,hash(result.members['mpv-1.dll']));assert.deepEqual(Object.keys(result.members).sort(),['NOTICE.txt','SOURCE.txt','candidate.json','mpv-1.dll']);assert.equal(result.metadata.libmpv.machine,'x64');assert.equal(result.checks.releaseability,'NOT_ASSESSED');assert.equal(result.checks.sourceEvidence,'DECLARED_UNVERIFIED');}
});
test('members API requires exact Buffer members and validates helper identity',()=>{
  const m=makeMembers();assert.equal(validateCandidateMembers(m,helper).candidateId,hash(m['mpv-1.dll']));expectCode(()=>validateCandidateMembers({...m,unknown:Buffer.alloc(0)},helper),'zip-invalid');expectCode(()=>validateCandidateMembers(m,{sha256:'b'.repeat(64),version:'1.0.0'}),'schema-invalid');
});
test('rejects schema unknown fields, malformed source reference and mismatched hashes',()=>{
  const m=makeMembers(), meta=JSON.parse(m['candidate.json']);meta.extra=true; m['candidate.json']=Buffer.from(JSON.stringify(meta));expectCode(()=>validateCandidateMembers(m,helper),'schema-invalid');
  const n=makeMembers(), mm=JSON.parse(n['candidate.json']);mm.source.reference='https://user@example.org:443/x?q=1';n['candidate.json']=Buffer.from(JSON.stringify(mm));expectCode(()=>validateCandidateMembers(n,helper),'schema-invalid');
  const o=makeMembers();o['SOURCE.txt'][0]^=1;expectCode(()=>validateCandidateMembers(o,helper),'hash-mismatch');
});
test('rejects CRC, local-central name disagreement, extra members and hostile names',()=>{
  const m=makeMembers();expectCode(()=>validateCandidateArchive(zip(m,{corruptCrc:true}),helper),'zip-invalid');expectCode(()=>validateCandidateArchive(zip(m,{localNameMismatch:true}),helper),'zip-invalid');expectCode(()=>validateCandidateArchive(zip(m,{extraMember:true}),helper),'zip-invalid');expectCode(()=>validateCandidateArchive(zip(m,{nameOverride:'../SOURCE.txt'}),helper),'zip-invalid');
});
test('rejects ZIP version, Zip64, multidisk, descriptor/encryption flags and non-UTF8 flags',()=>{
  const cases=[
    b=>{const{out}=records(b);b.writeUInt16LE(0x0315,out[0].p+4);},
    b=>{const{out}=records(b);b.writeUInt32LE(0xffffffff,out[0].p+20);},
    b=>{const{e}=records(b);b.writeUInt16LE(1,e+4);},
    b=>{const{out}=records(b);b.writeUInt16LE(0x0808,out[0].p+8);},
    b=>{const{out}=records(b);b.writeUInt16LE(0x0801,out[0].p+8);},
    b=>{const{out}=records(b);b.writeUInt16LE(0x0802,out[0].p+8);}
  ]; for(const change of cases)expectCode(()=>validateCandidateArchive(mutatedZip(change),helper),'zip-invalid');
});
test('rejects Unix special types, DOS reparse/directory attributes and case collisions',()=>{
  for(const attr of [0xa1ff0000,0x41ed0000,0x21a40000,0x81a40010])expectCode(()=>validateCandidateArchive(mutatedZip((b,{out})=>b.writeUInt32LE(attr,out[0].p+38)),helper),'zip-invalid');
  expectCode(()=>validateCandidateArchive(mutatedZip((b,{out})=>{const a=out.find(x=>x.name==='SOURCE.txt'),z=out.find(x=>x.name==='NOTICE.txt');Buffer.from('source.txt').copy(b,a.p+46);Buffer.from('source.txt').copy(b,a.lo+30);Buffer.from('source.txt').copy(b,z.p+46);Buffer.from('source.txt').copy(b,z.lo+30);}),helper),'zip-invalid');
});
test('rejects local-record offset gaps and overlaps and corrupted deflate streams',()=>{
  expectCode(()=>validateCandidateArchive(mutatedZip((b,{out})=>b.writeUInt32LE(1,out[1].p+42)),helper),'zip-invalid');
  expectCode(()=>validateCandidateArchive(mutatedZip((b,{out})=>b.writeUInt32LE(out[0].lo,out[1].p+42)),helper),'zip-invalid');
  expectCode(()=>validateCandidateArchive(mutatedZip((b,{out})=>{b[out[0].data]^=0xff;},{deflate:true}),helper),'zip-invalid');
});
test('rejects trailing bytes and concatenated raw-deflate streams inside declared compressed size',()=>{
  const members=makeMembers();
  const garbage=zip(members,{deflate:true,compressedTailName:'SOURCE.txt',compressedTail:Buffer.from('TRAILING-COMPRESSED-DATA')});
  expectCode(()=>validateCandidateArchive(garbage,helper),'zip-invalid');
  const secondStream=Buffer.concat([zlib.deflateRawSync(Buffer.from('second stream')),Buffer.from('second stream')]);
  const concatenated=zip(members,{deflate:true,compressedTailName:'SOURCE.txt',compressedTail:secondStream});
  expectCode(()=>validateCandidateArchive(concatenated,helper),'zip-invalid');
});
test('rejects malformed PE machine, optional header and missing exports',()=>{
  const bad=peBuffer();bad.writeUInt16LE(0x14c,0x84);expectCode(()=>validateCandidateMembers(makeMembers({dll:bad}),helper),'pe-invalid');
  const bad2=peBuffer();bad2.writeUInt16LE(0x10b,0x98);expectCode(()=>validateCandidateMembers(makeMembers({dll:bad2}),helper),'pe-invalid');
  const bad3=peBuffer();bad3.writeUInt32LE(0,0x240+16*4);expectCode(()=>validateCandidateMembers(makeMembers({dll:bad3}),helper),'pe-invalid');
  const notDll=peBuffer();notDll.writeUInt16LE(0x22,0x84+18);expectCode(()=>validateCandidateMembers(makeMembers({dll:notDll}),helper),'pe-invalid');
});
test('accepts PE with zero-raw BSS section before export section',()=>{assert.equal(validateCandidateMembers(makeMembers({dll:peWithBssBeforeExports()}),helper).metadata.libmpv.machine,'x64');});
test('rejects PE virtual overlap, unmapped RVA/function, unterminated section-crossing names and undersized headers',()=>{
  const overlap=peBuffer();overlap.writeUInt16LE(2,0x86);overlap.writeUInt32LE(0x220,0x98+60);const s2=0x188+40;overlap.writeUInt32LE(0x100,s2+8);overlap.writeUInt32LE(0x1200,s2+12);overlap.writeUInt32LE(0x100,s2+16);overlap.writeUInt32LE(0x700,s2+20);expectCode(()=>validateCandidateMembers(makeMembers({dll:overlap}),helper),'pe-invalid');
  const rawOnly=peBuffer();rawOnly.writeUInt32LE(0x600,0x188+8);rawOnly.writeUInt32LE(0x1500,0x288);expectCode(()=>validateCandidateMembers(makeMembers({dll:rawOnly}),helper),'pe-invalid');
  const cross=peBuffer();cross.writeUInt16LE(2,0x86);cross.writeUInt32LE(0x220,0x98+60);const s3=0x188+40;cross.writeUInt32LE(0x100,s3+8);cross.writeUInt32LE(0x1500,s3+12);cross.writeUInt32LE(0x100,s3+16);cross.writeUInt32LE(0x700,s3+20);cross.writeUInt32LE(0x14fc,0x288);cross.write('mpv_',0x6fc,'ascii');expectCode(()=>validateCandidateMembers(makeMembers({dll:cross}),helper),'pe-invalid');
  const fn=peBuffer();fn.writeUInt32LE(0x1800,0x240);expectCode(()=>validateCandidateMembers(makeMembers({dll:fn}),helper),'pe-invalid');
  const headers=peBuffer();headers.writeUInt32LE(0x100,0x98+60);expectCode(()=>validateCandidateMembers(makeMembers({dll:headers}),helper),'pe-invalid');
  const rawOverlap=peBuffer();rawOverlap.writeUInt16LE(2,0x86);rawOverlap.writeUInt32LE(0x220,0x98+60);const s4=0x188+40;rawOverlap.writeUInt32LE(0x100,s4+8);rawOverlap.writeUInt32LE(0x2000,s4+12);rawOverlap.writeUInt32LE(0x200,s4+16);rawOverlap.writeUInt32LE(0x400,s4+20);expectCode(()=>validateCandidateMembers(makeMembers({dll:rawOverlap}),helper),'pe-invalid');
});
test('archive rejects empty, truncated and trailing bytes',()=>{expectCode(()=>validateCandidateArchive(Buffer.alloc(0),helper),'zip-invalid');const b=zip(makeMembers());expectCode(()=>validateCandidateArchive(b.subarray(0,b.length-1),helper),'zip-invalid');expectCode(()=>validateCandidateArchive(Buffer.concat([b,Buffer.from([0])]),helper),'zip-invalid');});
