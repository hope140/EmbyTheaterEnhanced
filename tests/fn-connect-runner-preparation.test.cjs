'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..'),pwsh=process.platform==='win32'?'pwsh.exe':'pwsh';
function supervision(mode){const r=cp.spawnSync(pwsh,['-NoProfile','-File','tests/helpers/fn-runner-supervision.ps1','-Mode',mode],{cwd:root,encoding:'utf8',timeout:15000});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout.trim());}
for(const mode of ['slow','shared','late-prepared','alive-prepared'])test('runner uses one absolute preparation deadline: '+mode,()=>{
    const r=supervision(mode);assert.equal(r.outcome.ready,false);assert.equal(r.outcome.reason,'PREPARATION_TIMEOUT');assert.equal(r.outcome.elapsedMs,1250);assert.equal(r.killCount,1);
    assert.equal(r.resultPresent,true);assert.equal(r.evidenceRetained,true);assert.equal(r.resultUnchanged,true);assert.equal(r.statusUnchanged,true);assert.equal(r.resultSafe,true);assert(r.archiveBytes>0);
    if(mode==='shared')assert.equal(r.outcome.stage,'EXTRACT');
});
for(const mode of ['wrong-round','wrong-source','source-changes','unknown-stage','extra-field'])test('runner rejects mismatched or excessive preparation evidence: '+mode,()=>{
    const r=supervision(mode);assert.equal(r.outcome.ready,false);assert.equal(r.outcome.reason,'PREPARATION_EVIDENCE_INVALID');assert.equal(r.killCount,1);assert.equal(r.resultSafe,true);
});
for(const mode of ['early-nonzero','incomplete-zero'])test('runner never launches from an incomplete worker exit: '+mode,()=>{
    const r=supervision(mode);assert.equal(r.outcome.ready,false);assert.equal(r.outcome.reason,'PREPARATION_FAILED');assert.equal(r.killCount,0);assert.equal(r.resultPresent,true);
});
test('unconfirmed termination retains evidence and cannot become a success',()=>{const r=supervision('unconfirmed');assert.equal(r.outcome.reason,'PREPARATION_EXIT_UNCONFIRMED');assert.equal(r.outcome.processExited,false);assert.equal(r.resultPresent,true);assert.equal(r.resultSafe,true);assert.equal(r.evidenceRetained,true);});
test('only a verified, source-bound and exited worker permits Electron',()=>{const r=supervision('success');assert.equal(r.outcome.ready,true);assert.equal(r.outcome.processExited,true);assert.equal(r.resultPresent,false);assert.equal(r.killCount,0);assert.equal(r.outcome.elapsedMs,750);});
for(const size of [3,157966405])test('actual preparation worker refuses a synthetic invalid archive without extraction; expected size '+size,t=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ete-fn-worker-test-')),source=path.join(dir,'source'),temporary=path.join(dir,'temporary');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.mkdirSync(source);fs.mkdirSync(temporary);
    const manifest=JSON.parse(fs.readFileSync(path.join(root,'vendor/electron-runtime-manifest.json')));manifest.archive.size=size;
    for(const p of ['prototypes/fn-connect/client/electron-input.json','tools/electron-runtime-input.cjs']){fs.mkdirSync(path.dirname(path.join(source,p)),{recursive:true});fs.copyFileSync(path.join(root,p),path.join(source,p));}
    fs.mkdirSync(path.join(source,'vendor'));fs.writeFileSync(path.join(source,'vendor/electron-runtime-manifest.json'),JSON.stringify(manifest));
    for(const args of [['init'],['add','.'],['-c','user.name=Synthetic','-c','user.email=synthetic@example.invalid','commit','-m','fixture']]){const r=cp.spawnSync('git',args,{cwd:source,encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
    const script=path.join(dir,'run.ps1');fs.writeFileSync(script,`param($Worker,$Source,$Temporary,$Progress)\n. $Worker\n$env:GITHUB_SHA=''\n$script:downloads=0;$script:extracts=0\nfunction Invoke-WebRequest { param($Uri,$OutFile,$TimeoutSec,$MaximumRetryCount) if($Uri -cne '${manifest.archive.sourceUrl}' -or $MaximumRetryCount -ne 0){throw 'BAD_TRANSFER'}; $script:downloads++;[IO.File]::WriteAllBytes($OutFile,[byte[]](1,2,3)) }\nfunction Expand-Archive { $script:extracts++;throw 'UNEXPECTED_EXTRACT' }\n$code=Invoke-FnPrepareWorker $Source $Temporary $Progress ('a'*32)\n[ordered]@{code=$code;downloads=$script:downloads;extracts=$script:extracts;progress=(Get-Content $Progress -Raw|ConvertFrom-Json)}|ConvertTo-Json -Depth 6 -Compress\n`);
    const r=cp.spawnSync(pwsh,['-NoProfile','-File',script,'-Worker',path.join(root,'prototypes/fn-connect/client/prepare-runner-worker.ps1'),'-Source',source,'-Temporary',temporary,'-Progress',path.join(dir,'progress.json')],{encoding:'utf8',timeout:15000});assert.equal(r.status,0,r.stderr);const v=JSON.parse(r.stdout.trim());assert.equal(v.code,1);assert.equal(v.downloads,1);assert.equal(v.extracts,0);assert.equal(v.progress.stage,'FAILED');assert.equal(v.progress.phase,'ARCHIVE_VERIFY');assert.equal(v.progress.archiveVerified,false);
});
test('worker exit between receipt read and exit observation is reread before classification',()=>{const r=supervision('race-exit');assert.equal(r.outcome.ready,true);assert.equal(r.outcome.stage,'PREPARED');assert.equal(r.killCount,0);});
test('a status write that consumes the remaining deadline cannot permit Electron',()=>{const r=supervision('status-stall');assert.equal(r.outcome.ready,false);assert.equal(r.outcome.reason,'PREPARATION_TIMEOUT');assert.equal(r.resultPresent,true);});
test('persistent status failure does not prevent the independent failure result',()=>{const r=supervision('status-fails');assert.equal(r.outcome.ready,false);assert.equal(r.outcome.reason,'PREPARATION_FAILED');assert.equal(r.resultPresent,true);assert.equal(r.resultSafe,true);});
test('the final preparation receipt write is included in the same deadline',()=>{const r=supervision('final-status-stall');assert.equal(r.outcome.ready,false);assert.equal(r.outcome.reason,'PREPARATION_TIMEOUT');assert.equal(r.resultPresent,true);});
test('initial status failure still produces a fixed result without starting any worker',t=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ete-fn-initial-receipt-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
    const client=path.join(dir,'prototypes/fn-connect/client');fs.mkdirSync(client,{recursive:true});
    const helper=fs.readFileSync(path.join(root,'prototypes/fn-connect/client/runner-preparation.ps1'),'utf8');
    fs.writeFileSync(path.join(client,'runner-preparation.ps1'),helper+`\n$originalWriter=(Get-Command Write-FnAtomicJson).ScriptBlock\nfunction Write-FnAtomicJson($Path,$Value,[switch]$Exclusive){if([IO.Path]::GetFileName($Path) -eq 'runner-status.json'){throw 'PRIVATE_TOKEN_URL'};& $originalWriter $Path $Value -Exclusive:$Exclusive}\n`);
    fs.copyFileSync(path.join(root,'prototypes/fn-connect/client/run-windows-smoke.ps1'),path.join(client,'run-windows-smoke.ps1'));
    const r=cp.spawnSync(pwsh,['-NoProfile','-File',path.join(client,'run-windows-smoke.ps1')],{encoding:'utf8',timeout:15000});assert.notEqual(r.status,0);assert.doesNotMatch(r.stderr,/PRIVATE_TOKEN_URL/);
    const result=JSON.parse(fs.readFileSync(path.join(dir,'test-output/fn-connect-fixture/result.json')));assert.equal(result.result,'FAILED');assert.equal(result.reason,'PREPARATION_FAILED');assert.equal(result.sourceCommit,'UNKNOWN');assert.equal(result.preparation.stage,'RUNNER_STARTED');
});
