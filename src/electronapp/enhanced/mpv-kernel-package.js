'use strict';

const crypto = require('node:crypto');
const zlib = require('node:zlib');

const LIMITS = Object.freeze({ archive: 192 * 1024 * 1024, total: 160 * 1024 * 1024, json: 32 * 1024, text: 64 * 1024, dll: 160 * 1024 * 1024 });
const NAMES = Object.freeze(['candidate.json', 'mpv-1.dll', 'SOURCE.txt', 'NOTICE.txt']);
const CAPABILITIES = Object.freeze(['private-inherited-pipe', 'native-child-hwnd', 'gpu-next', 'd3d11', 'generation-attribution']);
const EXPORTS = Object.freeze(['mpv_create', 'mpv_initialize', 'mpv_set_option_string', 'mpv_observe_property', 'mpv_unobserve_property', 'mpv_wait_event', 'mpv_terminate_destroy', 'mpv_command', 'mpv_command_async', 'mpv_get_property', 'mpv_set_property_string', 'mpv_get_property_string', 'mpv_free', 'mpv_free_node_contents', 'mpv_client_api_version', 'mpv_error_string', 'mpv_event_name']);

class ValidationError extends Error {
  constructor(code) { super(code); this.name = 'PackageValidationError'; this.code = code; }
}
function fail(code) { throw new ValidationError(code); }
function safeAdd(a, b, code = 'zip-invalid') { const n = a + b; if (!Number.isSafeInteger(n) || n < 0) fail(code); return n; }
function sha256(b) { return crypto.createHash('sha256').update(b).digest('hex'); }
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) { c ^= byte; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); }
  return (c ^ 0xffffffff) >>> 0;
}
function keysExactly(o, keys) { return o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).sort().join('\0') === [...keys].sort().join('\0'); }
function boundedString(v, max, code = 'schema-invalid') { if (typeof v !== 'string' || !v.length || v.length > max || v.trim() !== v || /[\x00-\x1f\x7f]/.test(v)) fail(code); return v; }
function validHash(v) { return typeof v === 'string' && /^[0-9a-f]{64}$/.test(v); }
function decodeUtf8(b, code) {
  let s;
  try { s = new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { fail(code); }
  if (!s.length || s.includes('\0')) fail(code);
  return s;
}

function parseZip(input) {
  if (!Buffer.isBuffer(input) || input.length > LIMITS.archive || input.length < 22) fail('zip-invalid');
  const eocd = input.length - 22;
  if (input.readUInt32LE(eocd) !== 0x06054b50) fail('zip-invalid');
  const disk = input.readUInt16LE(eocd + 4), cdDisk = input.readUInt16LE(eocd + 6), diskCount = input.readUInt16LE(eocd + 8), count = input.readUInt16LE(eocd + 10);
  const cdSize = input.readUInt32LE(eocd + 12), cdOffset = input.readUInt32LE(eocd + 16), commentLen = input.readUInt16LE(eocd + 20);
  if (disk || cdDisk || diskCount !== count || count !== 4 || commentLen !== 0 || safeAdd(eocd, 22) !== input.length) fail('zip-invalid');
  if (cdSize === 0xffffffff || cdOffset === 0xffffffff || safeAdd(cdOffset, cdSize) !== eocd) fail('zip-invalid');
  const entries = new Map(); let pos = cdOffset, total = 0, localRanges = [];
  for (let i = 0; i < count; i++) {
    if (safeAdd(pos, 46) > eocd || input.readUInt32LE(pos) !== 0x02014b50) fail('zip-invalid');
    const made = input.readUInt16LE(pos + 4), flags = input.readUInt16LE(pos + 8), method = input.readUInt16LE(pos + 10);
    const crc = input.readUInt32LE(pos + 16), csize = input.readUInt32LE(pos + 20), usize = input.readUInt32LE(pos + 24);
    const nl = input.readUInt16LE(pos + 28), xl = input.readUInt16LE(pos + 30), cl = input.readUInt16LE(pos + 32), diskStart = input.readUInt16LE(pos + 34), ext = input.readUInt32LE(pos + 38), lo = input.readUInt32LE(pos + 42);
    const end = safeAdd(pos, 46 + nl + xl + cl);
    if (end > eocd || nl === 0 || xl !== 0 || cl !== 0 || diskStart !== 0 || lo === 0xffffffff || csize === 0xffffffff || usize === 0xffffffff) fail('zip-invalid');
    if ((flags & ~0x0800) !== 0 || (method !== 0 && method !== 8)) fail('zip-invalid');
    if ((made & 0xff) > 20) fail('zip-invalid');
    const nameBytes = input.subarray(pos + 46, pos + 46 + nl);
    if ([...nameBytes].some(x => x > 0x7f) || nameBytes.includes(0)) fail('zip-invalid');
    const name = nameBytes.toString('ascii');
    if (!NAMES.includes(name) || entries.has(name) || [...entries.keys()].some(n => n.toLowerCase() === name.toLowerCase())) fail('zip-invalid');
    // Reject Unix symlink, directory and DOS reparse attributes.
    const host = made >>> 8, unixMode = ext >>> 16;
    if ((host === 3 && (unixMode & 0xf000) !== 0x8000) || (ext & 0x400) !== 0 || (ext & 0x10) !== 0) fail('zip-invalid');
    const max = name === 'candidate.json' ? LIMITS.json : name === 'mpv-1.dll' ? LIMITS.dll : LIMITS.text;
    if (usize > max) fail('zip-invalid');
    total = safeAdd(total, usize); if (total > LIMITS.total) fail('zip-invalid');
    if (method === 0 && csize !== usize) fail('zip-invalid');
    const lpos = lo;
    if (safeAdd(lpos, 30) > cdOffset || input.readUInt32LE(lpos) !== 0x04034b50) fail('zip-invalid');
    const lf = input.readUInt16LE(lpos + 6), lm = input.readUInt16LE(lpos + 8), lc = input.readUInt32LE(lpos + 14), lcs = input.readUInt32LE(lpos + 18), lus = input.readUInt32LE(lpos + 22), lnl = input.readUInt16LE(lpos + 26), lxl = input.readUInt16LE(lpos + 28);
    if (lf !== flags || lm !== method || lc !== crc || lcs !== csize || lus !== usize || lnl !== nl || lxl !== 0 || safeAdd(lpos, 30 + lnl + lxl) > cdOffset || !input.subarray(lpos + 30, lpos + 30 + lnl).equals(nameBytes)) fail('zip-invalid');
    const dataStart = lpos + 30 + lnl + lxl, dataEnd = safeAdd(dataStart, csize);
    if (dataEnd > cdOffset) fail('zip-invalid');
    localRanges.push([lpos, dataEnd]);
    entries.set(name, { method, crc, csize, usize, dataStart, dataEnd });
    pos = end;
  }
  if (pos !== eocd || entries.size !== 4) fail('zip-invalid');
  localRanges.sort((a,b)=>a[0]-b[0]);
  let cursor = 0; for (const [a,b] of localRanges) { if (a !== cursor || b < a) fail('zip-invalid'); cursor = b; }
  if (cursor !== cdOffset) fail('zip-invalid');
  const out = new Map();
  for (const [name, e] of entries) {
    const packed = input.subarray(e.dataStart, e.dataEnd); let data;
    try {
      if (e.method === 0) data = Buffer.from(packed);
      else {
        const inflated = zlib.inflateRawSync(packed, {maxOutputLength: e.usize, info: true});
        if (!inflated || !inflated.engine || inflated.engine.bytesWritten !== packed.length) fail('zip-invalid');
        data = inflated.buffer;
      }
    } catch (error) { if (error instanceof ValidationError) throw error; fail('zip-invalid'); }
    if (data.length !== e.usize || crc32(data) !== e.crc) fail('zip-invalid');
    out.set(name, data);
  }
  return out;
}

function parseMetadata(bytes, expected) {
  if (!expected || !validHash(expected.sha256) || typeof expected.version !== 'string') fail('helper-contract-invalid');
  let m; try { m = JSON.parse(decodeUtf8(bytes, 'schema-invalid')); } catch (e) { if (e instanceof ValidationError) throw e; fail('schema-invalid'); }
  if (!keysExactly(m, ['schemaVersion','libmpv','helperContract','source','license','sourceSha256','noticeSha256']) || m.schemaVersion !== 1) fail('schema-invalid');
  const l = m.libmpv, h = m.helperContract, s = m.source, lic = m.license;
  if (!keysExactly(l,['file','version','sizeBytes','sha256','machine','clientApiVersion']) || l.file !== 'mpv-1.dll' || l.machine !== 'x64' || !Number.isSafeInteger(l.sizeBytes) || l.sizeBytes <= 0 || !validHash(l.sha256) || l.clientApiVersion !== 131077) fail('schema-invalid');
  boundedString(l.version,128); if (!/^mpv v[\x20-\x7e]+$/.test(l.version)) fail('schema-invalid');
  if (!keysExactly(h,['fileSha256','version','protocolVersion','clientApiVersion','requiredCapabilities']) || h.fileSha256 !== expected.sha256 || h.version !== expected.version || h.protocolVersion !== 1 || h.clientApiVersion !== 131077 || !Array.isArray(h.requiredCapabilities) || h.requiredCapabilities.length !== CAPABILITIES.length || h.requiredCapabilities.some((x,i)=>x!==CAPABILITIES[i])) fail('schema-invalid');
  if (!keysExactly(s,['project','release','revision','reference'])) fail('schema-invalid');
  boundedString(s.project,256); boundedString(s.release,128); boundedString(s.revision,128); boundedString(s.reference,2048);
  let u; try { u = new URL(s.reference); } catch { fail('schema-invalid'); }
  if (u.protocol !== 'https:' || !u.hostname || u.username || u.password || u.port || u.search || u.hash) fail('schema-invalid');
  if (!keysExactly(lic,['spdxExpression','redistribution'])) fail('schema-invalid');
  boundedString(lic.spdxExpression,256); if (!['declared-permitted','not-assessed'].includes(lic.redistribution)) fail('schema-invalid');
  if (!validHash(m.sourceSha256) || !validHash(m.noticeSha256)) fail('schema-invalid');
  return m;
}

function parsePe(b) {
  const need = (o,n)=>{ if (!Number.isSafeInteger(o) || !Number.isSafeInteger(n) || o < 0 || n < 0 || safeAdd(o,n,'pe-invalid') > b.length) fail('pe-invalid'); };
  need(0,64); if (b.readUInt16LE(0) !== 0x5a4d) fail('pe-invalid');
  const pe = b.readUInt32LE(0x3c); need(pe,24); if (b.readUInt32LE(pe) !== 0x00004550) fail('pe-invalid');
  const machine=b.readUInt16LE(pe+4), sections=b.readUInt16LE(pe+6), optSize=b.readUInt16LE(pe+20), characteristics=b.readUInt16LE(pe+22);
  if(machine!==0x8664 || !sections || sections>96 || optSize<112 || (characteristics&0x2000)===0) fail('pe-invalid');
  const opt=pe+24; need(opt,optSize); if(b.readUInt16LE(opt)!==0x20b) fail('pe-invalid');
  const imageSize=b.readUInt32LE(opt+56), headersSize=b.readUInt32LE(opt+60), dirs=b.readUInt32LE(opt+108);
  if(!imageSize || !headersSize || headersSize>b.length || dirs<1 || optSize<112+8) fail('pe-invalid');
  const sec=opt+optSize; need(sec,sections*40); if(safeAdd(sec,sections*40,'pe-invalid')>headersSize) fail('pe-invalid');
  const sectionsTable=[];
  const spans=[];
  const virtualSpans=[];
  for(let i=0;i<sections;i++){
    const p=sec+i*40, vs=b.readUInt32LE(p+8), va=b.readUInt32LE(p+12), rs=b.readUInt32LE(p+16), rp=b.readUInt32LE(p+20);
    const extent=Math.max(vs,rs); if(extent){ if(safeAdd(va,extent,'pe-invalid')>imageSize || va<headersSize) fail('pe-invalid'); virtualSpans.push([va,va+extent]); }
    if(rs){ need(rp,rs); if(rp<headersSize) fail('pe-invalid'); spans.push([rp,rp+rs]); }
    sectionsTable.push({ va, virtualSize:vs, rawSize:rs, rawPointer:rp });
  }
  spans.sort((a,c)=>a[0]-c[0]); for(let i=1;i<spans.length;i++) if(spans[i][0]<spans[i-1][1]) fail('pe-invalid');
  virtualSpans.sort((a,c)=>a[0]-c[0]); for(let i=1;i<virtualSpans.length;i++) if(virtualSpans[i][0]<virtualSpans[i-1][1]) fail('pe-invalid');
  const exportRva=b.readUInt32LE(opt+112), exportSize=b.readUInt32LE(opt+116); if(!exportRva || exportSize<40 || safeAdd(exportRva,exportSize,'pe-invalid')>imageSize) fail('pe-invalid');
  function rva(r,n){ if(!r) fail('pe-invalid'); for(const section of sectionsTable){ if(section.rawSize && r>=section.va && safeAdd(r,n,'pe-invalid')<=safeAdd(section.va,section.rawSize,'pe-invalid')){ const file=section.rawPointer+(r-section.va); need(file,n); return file; } } fail('pe-invalid'); }
  const ep=rva(exportRva,exportSize); if(b.readUInt32LE(ep+24)>65536) fail('pe-invalid');
  const funcs=b.readUInt32LE(ep+28), names=b.readUInt32LE(ep+32), ords=b.readUInt32LE(ep+36), nf=b.readUInt32LE(ep+20), nn=b.readUInt32LE(ep+24);
  if(!nf || nn<EXPORTS.length) fail('pe-invalid');
  const fp=rva(funcs,nf*4), np=rva(names,nn*4), op=rva(ords,nn*2), found=new Set();
  for(let i=0;i<nn;i++){
    const nr=b.readUInt32LE(np+i*4), nameAt=rva(nr,1); let end=nameAt; while(end<nameAt+257 && b[end]!==0){ rva(nr,end-nameAt+2); end++; } if(end>=nameAt+257 || end>=b.length || b[end]!==0) fail('pe-invalid');
    if(b.subarray(nameAt,end).some(x=>x>0x7f)) fail('pe-invalid'); const name=b.toString('ascii',nameAt,end);
    const ord=b.readUInt16LE(op+i*2); if(ord>=nf) fail('pe-invalid'); const fr=b.readUInt32LE(fp+ord*4); if(!fr || fr>=imageSize) fail('pe-invalid'); rva(fr,1);
    if(fr>=exportRva && fr<exportRva+exportSize) fail('pe-invalid'); // forwarded exports are outside contract
    if(EXPORTS.includes(name)) { if(found.has(name)) fail('pe-invalid'); found.add(name); }
  }
  if(EXPORTS.some(x=>!found.has(x))) fail('pe-invalid');
}

function validateCandidateMembers(input, expectedHelperIdentity) {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).sort().join('\0') !== [...NAMES].sort().join('\0') || NAMES.some(n => !Buffer.isBuffer(input[n]))) fail('zip-invalid');
    if(input['candidate.json'].length>LIMITS.json || input['mpv-1.dll'].length>LIMITS.dll || input['SOURCE.txt'].length>LIMITS.text || input['NOTICE.txt'].length>LIMITS.text || NAMES.reduce((sum,n)=>safeAdd(sum,input[n].length),0)>LIMITS.total) fail('zip-invalid');
    const meta=parseMetadata(input['candidate.json'],expectedHelperIdentity), dll=input['mpv-1.dll'], source=input['SOURCE.txt'], notice=input['NOTICE.txt'];
    if(dll.length!==meta.libmpv.sizeBytes || sha256(dll)!==meta.libmpv.sha256 || sha256(source)!==meta.sourceSha256 || sha256(notice)!==meta.noticeSha256) fail('hash-mismatch');
    decodeUtf8(source,'text-invalid'); decodeUtf8(notice,'text-invalid'); parsePe(dll);
    const id=sha256(dll);
    const normalizedMembers=Object.freeze({ 'candidate.json':Buffer.from(input['candidate.json']), 'mpv-1.dll':Buffer.from(dll), 'SOURCE.txt':Buffer.from(source), 'NOTICE.txt':Buffer.from(notice) });
    return Object.freeze({ candidateId:id, metadata:JSON.parse(JSON.stringify(meta)), members:normalizedMembers, checks:Object.freeze({ packageIntegrity:'PASS', staticCompatibility:'PASS', sourceEvidence:'DECLARED_UNVERIFIED', noticeEvidence:'PRESENT_UNVERIFIED', releaseability:'NOT_ASSESSED' }) });
  } catch(e) { throw e instanceof ValidationError ? e : new ValidationError('zip-invalid'); }
}
function validateCandidateArchive(buffer, expectedHelperIdentity) {
  try { const m=parseZip(buffer); return validateCandidateMembers(Object.fromEntries(m),expectedHelperIdentity); }
  catch(e) { throw e instanceof ValidationError ? e : new ValidationError('zip-invalid'); }
}

module.exports = Object.freeze({ validateCandidateArchive, validateCandidateMembers });
