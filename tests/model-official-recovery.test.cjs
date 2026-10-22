'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process');
const input=require('../tools/model-compatibility-input.cjs');
const {windowsIntegrationSkip}=require('./helpers/test-platform.cjs');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const ps=x=>"'"+x.replaceAll("'","''")+"'";
function powershell(code){return cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',code],{encoding:'utf8',timeout:30000});}
const RECOVERY_TOOLS=['model-compatibility-input.cjs','web-snapshot-input.cjs','runtime-exclusions.cjs','prepare-model-compatibility.ps1'];
function copyRecoveryTools(cold){
    fs.mkdirSync(path.join(cold,'tools'),{recursive:true});
    for(const file of RECOVERY_TOOLS)fs.copyFileSync(path.join(__dirname,'../tools',file),path.join(cold,'tools',file));
}
test('isolated official Model recovery fixture resolves its complete Node dependency set',t=>{
    const root=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'ete-model-loader-')));
    t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    copyRecoveryTools(root);
    const result=cp.spawnSync(process.execPath,['-e','require(process.argv[1])',path.join(root,'tools/model-compatibility-input.cjs')],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
});

test('official ZIP recovery verifies unique exact member before writes and preserves existing mismatches',
    {skip:windowsIntegrationSkip('Windows PowerShell ZIP extraction integration')},t=>{
        const root=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'ete-official-model-recovery-')));
        t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
        const manifest=require('./helpers/model-compatibility-fixture.cjs').create(root);
        const expected=fs.readFileSync(path.join(root,input.INPUT_ROOT,'MediaBrowser.Model.dll'));
        for(const mode of ['valid','wrong-case','duplicate','changed-member','existing-mismatch','wrong-archive']){
            const cold=path.join(root,mode);fs.mkdirSync(path.join(cold,'tools'),{recursive:true});fs.mkdirSync(path.join(cold,'vendor'));
            copyRecoveryTools(cold);
            const archive=path.join(cold,'official.zip');
            const members=[{name:mode==='wrong-case'?'mediabrowser.model.dll':'MediaBrowser.Model.dll',bytes:mode==='changed-member'?Buffer.alloc(expected.length,0):expected},
                {name:'unrelated.exe',bytes:Buffer.from('never execute or extract')}];
            if(mode==='duplicate')members.push(members[0]);
            const commands=members.map(e=>`$entry=$zip.CreateEntry(${ps(e.name)});$s=$entry.Open();try{$bytes=[Convert]::FromBase64String(${ps(e.bytes.toString('base64'))});$s.Write($bytes,0,$bytes.Length)}finally{$s.Dispose()}`);
            const zip=powershell(`$ErrorActionPreference='Stop';Add-Type -AssemblyName System.IO.Compression;Add-Type -AssemblyName System.IO.Compression.FileSystem;$zip=[IO.Compression.ZipFile]::Open(${ps(archive)},[IO.Compression.ZipArchiveMode]::Create);try{${commands.join(';')}}finally{$zip.Dispose()}`);
            assert.equal(zip.status,0,zip.stderr||zip.error?.message);
            const archiveBytes=fs.readFileSync(archive),lock=structuredClone(manifest);
            lock.archive={...lock.archive,size:archiveBytes.length,sha256:sha(archiveBytes)};
            fs.writeFileSync(path.join(cold,input.MANIFEST_PATH),JSON.stringify(lock));
            const component=path.join(cold,input.INPUT_ROOT),output=path.join(component,'MediaBrowser.Model.dll');
            if(mode==='existing-mismatch'){fs.mkdirSync(component,{recursive:true});fs.writeFileSync(output,'preserve existing component');}
            if(mode==='wrong-archive')fs.appendFileSync(archive,'tampered');
            const result=cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(cold,'tools/prepare-model-compatibility.ps1'),'-ArchivePath',archive],{encoding:'utf8',timeout:30000});
            if(mode==='valid'){
                assert.equal(result.status,0,result.stderr||result.error?.message);
                assert.deepEqual(fs.readFileSync(output),expected);
                assert.deepEqual(fs.readdirSync(component),['MediaBrowser.Model.dll']);
            }else{
                assert.notEqual(result.status,0,mode+' must fail');
                if(mode==='existing-mismatch')assert.equal(fs.readFileSync(output,'utf8'),'preserve existing component');
                else assert.equal(fs.existsSync(component),false,mode+' must fail before component creation');
            }
            assert.equal(fs.existsSync(path.join(cold,'vendor/carnival')),false);
        }
    });
