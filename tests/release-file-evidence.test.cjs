'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),crypto=require('node:crypto');
const builder=path.resolve(__dirname,'../tools/ci-windows-test-package.ps1');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function fixture(t,mutation){
    const root=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'ete-release-evidence-')));
    t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    const git=args=>{const r=cp.spawnSync('git',['-C',root,...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
    git(['init','-q']);git(['config','user.name','Release Evidence Test']);git(['config','user.email','release-test@example.invalid']);
    fs.mkdirSync(path.join(root,'docs'));fs.writeFileSync(path.join(root,'.gitattributes'),'docs/RELEASE_NOTES.md -text\n');
    const notes=Buffer.from('\uFEFF# Synthetic release notes\r\n保留原始字节\r\n');fs.writeFileSync(path.join(root,'docs/RELEASE_NOTES.md'),notes);
    git(['add','.gitattributes','docs/RELEASE_NOTES.md']);git(['commit','-qm','synthetic notes']);const source=git(['rev-parse','HEAD']);
    const output=path.join(root,'output'),name='EmbyTheaterEnhanced-0.4.0-win-x64-setup.exe';fs.mkdirSync(output);
    const names=[name,name+'.provenance.json',name+'.sha256','RELEASE_NOTES.md','SHA256SUMS.txt'];
    const exe=Buffer.from('synthetic installer; never execute');
    const receipt={sourceCommit:mutation==='source'?'0'.repeat(40):source,version:mutation==='version'?'0.3.16':'0.4.0',installer:{fileName:name,size:exe.length,sha256:hash(exe)}};
    const data=[exe,Buffer.from(JSON.stringify(receipt)),Buffer.from(hash(exe)+'  '+name+'\n'),notes];
    if(mutation==='installer')data[0]=Buffer.from('changed synthetic installer');
    if(mutation==='notes')data[3]=Buffer.from('changed notes');
    if(mutation==='installer-sum')data[2]=Buffer.from('0'.repeat(64)+'  '+name+'\n');
    let sums=data.map((b,i)=>hash(b)+'  '+names[i]).join('\n')+'\n';if(mutation==='sums')sums='changed sums\n';
    data.push(Buffer.from(sums));for(let i=0;i<data.length;i++)fs.writeFileSync(path.join(output,names[i]),data[i]);
    if(mutation==='missing')fs.unlinkSync(path.join(output,names[4]));
    return{root,output,source,names,data};
}
function run(f){
    const command=String.raw`
        $ErrorActionPreference='Stop';Set-StrictMode -Version Latest
        $tokens=$null;$errors=$null
        $ast=[Management.Automation.Language.Parser]::ParseFile($env:ETE_BUILDER,[ref]$tokens,[ref]$errors)
        if($errors.Count){throw 'Package script parse error'}
        $blocks=@($ast.FindAll({param($n) $n -is [Management.Automation.Language.IfStatementAst] -and $n.Extent.Text.StartsWith('if ($ReleasePackage)') -and $n.Extent.Text.Contains('RELEASE_FILE_EVIDENCE')},$true))
        if($blocks.Count -ne 1){throw 'One production release evidence block required'}
        Set-Location -LiteralPath $env:ETE_ROOT
        $ReleasePackage=$true;$output=$env:ETE_OUTPUT;$source=$env:ETE_SOURCE;$version='0.4.0'
        $releaseFiles=@('EmbyTheaterEnhanced-0.4.0-win-x64-setup.exe','EmbyTheaterEnhanced-0.4.0-win-x64-setup.exe.provenance.json','EmbyTheaterEnhanced-0.4.0-win-x64-setup.exe.sha256','RELEASE_NOTES.md')
        . ([scriptblock]::Create($blocks[0].Extent.Text))
    `;
    return cp.spawnSync('pwsh',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',env:{...process.env,ETE_BUILDER:builder,ETE_ROOT:f.root,ETE_OUTPUT:f.output,ETE_SOURCE:f.source,GITHUB_RUN_ID:'synthetic-run',GITHUB_RUN_ATTEMPT:'1'}});
}
test('release evidence logs the exact five attachments and source-bound raw notes after all checks',t=>{
    const f=fixture(t),r=run(f);assert.equal(r.status,0,r.error?.message||r.stderr);
    const prefix='RELEASE_FILE_EVIDENCE ';assert.ok(r.stdout.trim().startsWith(prefix));const e=JSON.parse(r.stdout.trim().slice(prefix.length));
    assert.deepEqual(e,{schemaVersion:1,status:'passed',sourceCommit:f.source,version:'0.4.0',runId:'synthetic-run',runAttempt:'1',files:f.names.map((name,i)=>({name,size:f.data[i].length,sha256:hash(f.data[i])})),releasePublished:false});
});
for(const mutation of ['source','version','installer','notes','installer-sum','sums','missing'])test('release evidence refuses attachment drift before any success log: '+mutation,t=>{
    const f=fixture(t,mutation),before=fs.readdirSync(f.output).map(n=>[n,fs.readFileSync(path.join(f.output,n))]),r=run(f);
    assert.notEqual(r.status,0);assert.doesNotMatch(r.stdout,/RELEASE_FILE_EVIDENCE/);
    for(const[n,b]of before)assert.deepEqual(fs.readFileSync(path.join(f.output,n)),b);
});
