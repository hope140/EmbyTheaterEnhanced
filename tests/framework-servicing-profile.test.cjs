'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const expected='04a0018561b48efe2a4d56aff686783fd7f8b7f395f4c88c58ba2eb8e8118d41';
function evidence(){return {sha256:expected,fileHash:expected,gac:'True',referenceAssembly:'False',
    identity:'System.Configuration, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a',
    canonicalSystemPath:true,physicalPath:true,githubActions:'true',imageOS:'win22',imageVersion:'20261012.333.1',
    osBuild:'20348',osUbr:5622,frameworkRelease:533325,fileVersion:'4.8.9999.0',signatureStatus:'Valid',signatureType:'Catalog',
    signerSubject:'CN=Microsoft Windows, O=Microsoft Corporation, L=Redmond, S=Washington, C=US',signerThumbprint:'A'.repeat(40),failure:''};}
function run(script,rows){const result=cp.spawnSync('pwsh',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',input:JSON.stringify(rows),
 env:{...process.env,ETE_FRAMEWORK_PROFILE:path.join(root,'tools/windows-host-verifier/Framework-Implementation.ps1'),ETE_FINALIZER:path.join(root,'tools/windows-host-verifier/Finalize-Evidence.ps1')}});
 assert.equal(result.status,0,result.error?.message||result.stderr);return JSON.parse(result.stdout);}
test('reviewed servicing policy accepts only the exact observed image/file plus Microsoft source evidence',()=>{
 const rows=[evidence(),{...evidence(),signatureType:'Authenticode'}];
 const changes={sha256:'f'.repeat(64),fileHash:'e'.repeat(64),gac:'False',referenceAssembly:'True',identity:'untrusted',canonicalSystemPath:false,
 physicalPath:false,githubActions:'false',imageOS:'win25',imageVersion:'20261021.343.1',osBuild:'26100',osUbr:5761,frameworkRelease:0,
 fileVersion:'5.0.0.0',signatureStatus:'NotSigned',signatureType:'None',signerSubject:'CN=Other publisher, O=Other company',signerThumbprint:'bad',failure:'source-evidence-unavailable'};
 for(const [key,value]of Object.entries(changes))rows.push({...evidence(),[key]:value});
 rows.push({...evidence(),sha256:expected.toUpperCase()},{...evidence(),gac:'true'},{...evidence(),signatureStatus:'valid'},
 {...evidence(),signerSubject:'CN=Microsoft Corporation, O=Untrusted Publisher'}, {...evidence(),frameworkRelease:600000});
 const actual=run(`$ErrorActionPreference='Stop';Set-StrictMode -Version Latest;. $env:ETE_FRAMEWORK_PROFILE;$rows=@([Console]::In.ReadToEnd()|ConvertFrom-Json);$out=@(foreach($row in $rows){Test-ReviewedFrameworkEvidence $row});ConvertTo-Json -InputObject $out -Compress`,rows);
 assert.deepEqual(actual.slice(0,2),[true,true]);assert.ok(actual.slice(2).every(x=>x===false));
});
test('actual finalizer branch retains baseline/unknown rejection and requires the new source checks for the known older file',()=>{
 const rows=[{sha:'5a3d35a9a0db4f075cc073ea8e875ef6b3533e88ec610621ac400efcc7c8e663',gac:'True',evidence:evidence()},
 {sha:expected,gac:'True',evidence:evidence()}, {sha:expected,gac:'True',evidence:{...evidence(),signatureStatus:'NotSigned'}},
 {sha:expected,gac:'False',evidence:evidence()}, {sha:'0'.repeat(64),gac:'True',evidence:evidence()}];
 const script=String.raw`$ErrorActionPreference='Stop';Set-StrictMode -Version Latest;. $env:ETE_FRAMEWORK_PROFILE
 $tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($env:ETE_FINALIZER,[ref]$tokens,[ref]$errors)
 if($errors.Count){throw 'parse failed'}
 $parts=@($ast.FindAll({param($n)$n -is [Management.Automation.Language.IfStatementAst] -and $n.Extent.Text.StartsWith("if("+[char]36+"name -eq 'System.Configuration')")},$true))
 if($parts.Count -ne 1){throw 'one production gate required'};$branch=[scriptblock]::Create($parts[0].Extent.Text)
 # Only the Windows source-read boundary is synthetic; classifier and finalizer branch are production code.
 function Read-ReviewedFrameworkEvidence($Observed){return $script:fixtureEvidence}
 $rows=@([Console]::In.ReadToEnd()|ConvertFrom-Json)
 $out=@(foreach($row in $rows){$name='System.Configuration';$f=@{SHA256=$row.sha;GAC=$row.gac;ReferenceAssembly='False';Identity='synthetic';Location='synthetic'};$script:fixtureEvidence=$row.evidence
 try{$null=. $branch;[ordered]@{passed=$true}}catch{[ordered]@{passed=$false}}})
 ConvertTo-Json -InputObject $out -Compress`;
 assert.deepEqual(run(script,rows).map(x=>x.passed),[true,true,false,false,false]);
});
test('source inspection stays read-only and the profile does not silently broaden to other images or arbitrary files',()=>{
 const source=fs.readFileSync(path.join(root,'tools/windows-host-verifier/Framework-Implementation.ps1'),'utf8');
 assert.match(source,/Get-AuthenticodeSignature -LiteralPath \$actual/);assert.match(source,/Get-FileHash -LiteralPath \$actual/);
 assert.match(source,/ReparsePoint/);assert.match(source,/GAC_MSIL\\System.Configuration\\v4.0_4.0.0.0__b03f5f7f11d50a3a/);
 assert.doesNotMatch(source,/Set-ItemProperty|Install-|Invoke-WebRequest|Start-Process|Copy-Item|Set-ExecutionPolicy|Add-Type\s+-TypeDefinition|Assembly\]::Load/);
});


test('package entry validates Framework before dependency preparation, with no install or retry path',()=>{
 const source=fs.readFileSync(path.join(root,'tools/ci-windows-test-package.ps1'),'utf8');
 assert.ok(source.indexOf('Get-RunnerFrameworkPreflight')>0);
 assert.ok(source.indexOf('Get-RunnerFrameworkPreflight')<source.indexOf('& npm ci --ignore-scripts'));
 assert.match(source,/runner-framework-profile\.json/);
 assert.doesNotMatch(source,/wusa|DISM|Add-WindowsPackage|Enable-WindowsOptionalFeature|WindowsUpdate|Set-ExecutionPolicy/);
});
