'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process');
const input=require('../tools/libmpv-input.cjs'),prepare=require('../tools/prepare-libmpv.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function fixture(t){
    const root=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'ete-libmpv-download-')));
    t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'vendor'));
    const dll=Buffer.from('synthetic DLL, never executed'),archive=Buffer.concat([Buffer.from('377abcaf271c','hex'),Buffer.from('synthetic archive transport fixture')]);
    const m=require('./helpers/libmpv-fixture.cjs').create(root,dll);fs.rmSync(path.join(root,input.INPUT_ROOT),{recursive:true});
    m.archive={asset:'mpv-dev-x86_64-20260809-git-dd5d17d328.7z',sourceUrl:'https://sourceforge.net/projects/mpv-player-windows/files/libmpv/mpv-dev-x86_64-20260809-git-dd5d17d328.7z/download',size:archive.length,sha256:sha(archive),member:'libmpv-2.dll',sourceCommit:'dd5d17d3285a095a0f712fa9d116e22a076492de'};
    const save=()=>fs.writeFileSync(path.join(root,input.MANIFEST_PATH),JSON.stringify(m));save();
    const cache=path.join(root,'.work/libmpv-download',m.archive.asset);
    return {root,dll,archive,m,save,cache,download:(url,out,size)=>{assert.equal(url,m.archive.sourceUrl);assert.equal(size,archive.length);fs.writeFileSync(out,archive,{flag:'wx'});return{fixture:true};},extract:(file,a)=>{assert.equal(a.member,'libmpv-2.dll');assert.deepEqual(fs.readFileSync(file),archive);return dll;}};
}
test('first pinned download is verified, extracted and cached without any legacy directory',t=>{
    const f=fixture(t),r=prepare.prepare(f.root,f);assert.equal(r.acquisition,'download');assert.equal(r.archive.sha256,f.m.archive.sha256);
    assert.deepEqual(fs.readFileSync(path.join(f.root,input.INPUT_ROOT,'mpv-1.dll')),f.dll);
    for(const p of ['vendor/patch','vendor/carnival'])assert.equal(fs.existsSync(path.join(f.root,p)),false);
    assert.deepEqual(fs.readdirSync(path.dirname(f.cache)),[f.m.archive.asset]);
});
test('verified archive cache restores absent DLL with zero downloads; prepared cache is checked',t=>{
    const f=fixture(t);prepare.prepare(f.root,f);fs.rmSync(path.join(f.root,input.INPUT_ROOT),{recursive:true});
    const options={extract:f.extract,download:()=>assert.fail('network must not run')};
    assert.equal(prepare.prepare(f.root,options).acquisition,'archive-cache');
    assert.equal(prepare.prepare(f.root,options).acquisition,'prepared-cache');
    fs.appendFileSync(path.join(f.root,input.INPUT_ROOT,'mpv-1.dll'),'tampered');assert.throws(()=>prepare.prepare(f.root,options),/identity/);
});
for(const kind of ['html','wrong-hash','truncated'])test('download '+kind+' is rejected before extraction and never cached',t=>{
    const f=fixture(t);let bytes=Buffer.from(f.archive);
    if(kind==='html')bytes=Buffer.alloc(bytes.length,32),Buffer.from('<html>download page</html>').copy(bytes);
    if(kind==='wrong-hash')bytes[bytes.length-1]^=1;
    if(kind==='truncated')bytes=bytes.subarray(0,-1);
    assert.throws(()=>prepare.prepare(f.root,{download:(u,out)=>fs.writeFileSync(out,bytes),extract:()=>assert.fail('unverified archive extracted')}),/archive.*(7z|SHA256|size)/);
    assert.equal(fs.existsSync(f.cache),false);assert.equal(fs.existsSync(path.join(f.root,input.INPUT_ROOT)),false);assert.deepEqual(fs.readdirSync(path.dirname(f.cache)),[]);
});
test('corrupt cache fails without silently downloading a replacement',t=>{
    const f=fixture(t);fs.mkdirSync(path.dirname(f.cache),{recursive:true});const bytes=Buffer.from(f.archive);bytes[bytes.length-1]^=1;fs.writeFileSync(f.cache,bytes);
    assert.throws(()=>prepare.prepare(f.root,{download:()=>assert.fail('no silent fallback')}),/SHA256/);assert.deepEqual(fs.readFileSync(f.cache),bytes);
});
test('HTTP failure is clear, is not retried and leaves no component',t=>{
    const f=fixture(t);let calls=0;assert.throws(()=>prepare.prepare(f.root,{download:()=>{calls++;throw Error('HTTP 403; stopped');}}),/HTTP 403/);
    assert.equal(calls,1);assert.equal(fs.existsSync(f.cache),false);assert.equal(fs.existsSync(path.join(f.root,input.INPUT_ROOT)),false);
});
test('bad extracted DLL and failed extractor leave no component',t=>{
    const f=fixture(t);assert.throws(()=>prepare.prepare(f.root,{download:f.download,extract:()=>Buffer.from('wrong DLL')}),/DLL identity/);
    assert.throws(()=>prepare.prepare(f.root,{extract:()=>{throw Error('missing trusted bsdtar');}}),/missing trusted bsdtar/);
    assert.equal(fs.existsSync(path.join(f.root,input.INPUT_ROOT)),false);
});
test('archive links and linked cache roots are refused before network or extraction',t=>{
    const f=fixture(t),source=path.join(f.root,'archive');fs.writeFileSync(source,f.archive);fs.mkdirSync(path.dirname(f.cache),{recursive:true});fs.symlinkSync(source,f.cache);
    assert.throws(()=>prepare.prepare(f.root,{download:()=>assert.fail('network')}),/links or redirects/);
    fs.unlinkSync(f.cache);fs.renameSync(path.dirname(f.cache),path.dirname(f.cache)+'-saved');fs.symlinkSync(path.dirname(f.cache)+'-saved',path.dirname(f.cache),process.platform==='win32'?'junction':'dir');
    assert.throws(()=>prepare.prepare(f.root,{}),/links or redirects/);
});
for(const key of ['sourceCommit','sourceUrl','asset','member','sha256'])test('invalid archive lock '+key+' is refused even with prepared DLL',t=>{
    const f=fixture(t);f.m.archive[key]='untrusted';f.save();assert.throws(()=>prepare.prepare(f.root,f),/archive lock/);
});
test('transport rejects non-project URLs before network or destination writes',t=>{
    const f=fixture(t),out=path.join(f.root,'untrusted-download');
    const r=cp.spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',path.resolve(__dirname,'../tools/download-libmpv.ps1'),'-SourceUrl','https://example.invalid/other.7z','-Destination',out,'-MaximumBytes','123'],{encoding:'utf8'});
    assert.notEqual(r.status,0);assert.match(r.stderr,/Invalid pinned libmpv source URL/);assert.equal(fs.existsSync(out),false);
});
