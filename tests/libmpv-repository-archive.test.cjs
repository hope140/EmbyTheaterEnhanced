'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),crypto=require('node:crypto');
const input=require('../tools/libmpv-input.cjs'),prepare=require('../tools/prepare-libmpv.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function fixture(t,commitArchive=true) {
    const root=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'ete-repository-libmpv-')));
    t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    const dll=Buffer.from('synthetic library, never executed');
    const archive=Buffer.concat([Buffer.from('377abcaf271c','hex'),Buffer.from('repository archive fixture')]);
    const m=require('./helpers/libmpv-fixture.cjs').create(root,dll);
    fs.rmSync(path.join(root,input.INPUT_ROOT),{recursive:true});
    const asset=path.basename(input.ARCHIVE_PATH);
    m.archive={asset,repositoryPath:input.ARCHIVE_PATH,
        sourceUrl:`https://sourceforge.net/projects/mpv-player-windows/files/libmpv/${asset}/download`,
        size:archive.length,sha256:sha(archive),member:'libmpv-2.dll',sourceCommit:'dd5d17d3285a095a0f712fa9d116e22a076492de'};
    const save=()=>fs.writeFileSync(path.join(root,input.MANIFEST_PATH),JSON.stringify(m));save();
    const file=path.join(root,input.ARCHIVE_PATH);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,archive);
    const git=(...args)=>cp.execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
    git('init','-q');git('config','user.name','Repository Input Test');git('config','user.email','fixture@example.invalid');
    git('config','core.autocrlf','false');git('config','commit.gpgsign','false');
    fs.writeFileSync(path.join(root,'fixture.txt'),'fixture');
    git('add','fixture.txt',...(commitArchive?[input.ARCHIVE_PATH]:[]));git('commit','-q','-m','fixture');
    const extract=(source,a)=>{assert.equal(source,file);assert.equal(a.member,'libmpv-2.dll');return dll;};
    const noNetwork=()=>assert.fail('repository mode must never invoke a downloader');
    return {root,dll,archive,file,m,save,git,extract,noNetwork};
}
test('committed archive restores an empty component without any download cache or network',t=>{
    const f=fixture(t),r=prepare.prepare(f.root,{extract:f.extract,download:f.noNetwork});
    assert.equal(r.acquisition,'repository-archive');assert.equal(r.repositoryArchive.path,input.ARCHIVE_PATH);
    assert.equal(r.repositoryArchive.gitBlobObjectId,f.git('rev-parse','HEAD:'+input.ARCHIVE_PATH));
    assert.deepEqual(fs.readFileSync(path.join(f.root,input.INPUT_ROOT,'mpv-1.dll')),f.dll);
    assert.equal(fs.existsSync(path.join(f.root,'.work/libmpv-download')),false);
    assert.equal(prepare.prepare(f.root,{download:f.noNetwork,extract:()=>assert.fail('prepared component re-extracted')}).acquisition,'prepared-cache');
});
test('missing repository input cannot fall back to an otherwise valid old archive cache',t=>{
    const f=fixture(t);const cache=path.join(f.root,'.work/libmpv-download',f.m.archive.asset);
    fs.mkdirSync(path.dirname(cache),{recursive:true});fs.writeFileSync(cache,f.archive);fs.unlinkSync(f.file);
    assert.throws(()=>prepare.prepare(f.root,{extract:f.extract,download:f.noNetwork}),/missing; no network fallback/);
    assert.equal(fs.existsSync(path.join(f.root,input.INPUT_ROOT)),false);
});
test('a prepared DLL cannot hide a corrupt committed archive',t=>{
    const f=fixture(t);prepare.prepare(f.root,{extract:f.extract,download:f.noNetwork});
    const changed=Buffer.from(f.archive);changed[changed.length-1]^=1;fs.writeFileSync(f.file,changed);
    assert.throws(()=>prepare.prepare(f.root,{download:f.noNetwork}),/archive SHA256 mismatch/);
});
test('uncommitted or dirty repository bytes are refused even if the working manifest hash matches',t=>{
    const f=fixture(t,false);
    assert.throws(()=>prepare.prepare(f.root,{extract:f.extract,download:f.noNetwork}),/must be committed at HEAD/);
    f.git('add',input.ARCHIVE_PATH);f.git('commit','-q','-m','archive');
    const changed=Buffer.from(f.archive);changed[changed.length-1]^=1;fs.writeFileSync(f.file,changed);
    f.m.archive.sha256=sha(changed);f.save();
    assert.throws(()=>prepare.prepare(f.root,{extract:f.extract,download:f.noNetwork}),/differs from HEAD/);
});
test('repository path traversal and redirected archive parents are rejected before extraction',t=>{
    const f=fixture(t);f.m.archive.repositoryPath='../outside.7z';f.save();
    assert.throws(()=>prepare.prepare(f.root,{download:f.noNetwork}),/Invalid repository.*declaration/);
    f.m.archive.repositoryPath=input.ARCHIVE_PATH;f.save();
    const directory=path.dirname(f.file),saved=directory+'-saved';fs.renameSync(directory,saved);
    fs.symlinkSync(saved,directory,process.platform==='win32'?'junction':'dir');
    assert.throws(()=>prepare.prepare(f.root,{download:f.noNetwork}),/links or redirects/);
});
test('legacy CLI-style acquisition has no implicit network fallback',t=>{
    const f=fixture(t);delete f.m.archive.repositoryPath;f.save();
    const previous=cp.execFileSync;
    cp.execFileSync=(file,...args)=>{if(file==='pwsh')assert.fail('network process must not start');return previous(file,...args);};
    try {assert.throws(()=>prepare.prepare(f.root,{extract:f.extract}),/network acquisition is disabled/);}
    finally {cp.execFileSync=previous;}
});
