'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process'),path=require('node:path');
const script=path.resolve(__dirname,'../tools/check-v043-installed-startup.ps1');
const available=cp.spawnSync('pwsh',['-NoProfile','-Command','$PSVersionTable.PSVersion.ToString()'],{encoding:'utf8'});
test('installed-startup pure contracts reject traversal/device names/digest drift and compile the exact Windows declarations without installing', {skip:!!available.error},()=>{
 const r=cp.spawnSync('pwsh',['-NoProfile','-File',script,'-ContractSelfTest'],{encoding:'utf8',timeout:30000});
 assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/CONTRACT_SELFTEST_PASSED/);
});
test('normal entry with no artifact identity fails before creating output or attempting installation', {skip:!!available.error},()=>{
 const r=cp.spawnSync('pwsh',['-NoProfile','-File',script],{encoding:'utf8',timeout:30000});
 assert.equal(r.error,undefined);assert.notEqual(r.status,0);assert.match(r.stderr,/HOSTED_WINDOWS_REQUIRED|REPOSITORY_MISMATCH|EXACT_INPUTS_REQUIRED/);
});
test('actual pre-install binding guards reject unreviewed source, wrong run/name and path injection without executing the installer', {skip:!!available.error},()=>{
 const code=String.raw`
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($env:CHECK_BINDING_SCRIPT,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'PARSE_FAILED'}
$require=@($ast.FindAll({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Require'},$true))[0]
. ([scriptblock]::Create($require.Extent.Text))
$guard=@($ast.FindAll({param($n)$n -is [Management.Automation.Language.CommandAst] -and $n.Extent.Text.EndsWith("'EXACT_INPUTS_REQUIRED'")},$true))
$branch=@($ast.FindAll({param($n)$n -is [Management.Automation.Language.IfStatementAst] -and $n.Extent.Text.StartsWith('if($testPackage)')},$true))
if($guard.Count -ne 1 -or $branch.Count -ne 1){throw 'BINDING_GUARD_MISSING'}
$cases=@(
 @('b8938f4ba9149e700ea1437b3f5fbe3535a2f5e5','123','EmbyTheaterEnhanced-0.4.3-test-b8938f4ba914-123-1-win-x64-setup.exe',$true),
 @('b8938f4ba9149e700ea1437b3f5fbe3535a2f5e5','124','EmbyTheaterEnhanced-0.4.3-test-b8938f4ba914-123-1-win-x64-setup.exe',$false),
 @('b8938f4ba9149e700ea1437b3f5fbe3535a2f5e5','123','EmbyTheaterEnhanced-0.4.3-test-ca7ae841af87-123-1-win-x64-setup.exe',$false),
 @('ca7ae841af8748091580259db1853e3c5e1c471f','123','EmbyTheaterEnhanced-0.4.3-test-ca7ae841af87-123-1-win-x64-setup.exe',$true),
 @('3a02339ab5011f2544df5b24b1da9b22d0df8d4a','123','EmbyTheaterEnhanced-0.4.3-test-3a02339ab501-123-1-win-x64-setup.exe',$true),
 @('3a02339ab5011f2544df5b24b1da9b22d0df8d4a','124','EmbyTheaterEnhanced-0.4.3-test-3a02339ab501-123-1-win-x64-setup.exe',$false),
 @('3a02339ab5011f2544df5b24b1da9b22d0df8d4a','123','C:\synthetic.exe',$false),
 @('3a02339ab5011f2544df5b24b1da9b22d0df8d4a','123','EmbyTheaterEnhanced-0.4.3-win-x64-setup.exe',$false),
 @('abe1c7426f0c8d0b5d1f7febadd0d39fb9a80a1d','40110950621','EmbyTheaterEnhanced-0.4.3-win-x64-setup.exe',$true),
 @('abe1c7426f0c8d0b5d1f7febadd0d39fb9a80a1d','123','EmbyTheaterEnhanced-0.4.3-win-x64-setup.exe',$false),
 @('0000000000000000000000000000000000000000','123','EmbyTheaterEnhanced-0.4.3-win-x64-setup.exe',$false))
foreach($case in $cases){
 $source=$case[0];$buildRun=$case[1];$setupName=$case[2];$version='0.4.3';$ArtifactId='1';$ArtifactZipSha256='0'*64;$InstallerSha256='0'*64
 $testPackage=$source -cne 'abe1c7426f0c8d0b5d1f7febadd0d39fb9a80a1d';$accepted=$true
 try{. ([scriptblock]::Create($guard[0].Extent.Text));. ([scriptblock]::Create($branch[0].Extent.Text))}catch{$accepted=$false}
 if($accepted -ne $case[3]){throw 'BINDING_ACCEPTANCE_MISMATCH'}
}
Write-Output 'EXACT_BINDING_GUARDS_PASSED'
`;
 const r=cp.spawnSync('pwsh',['-NoProfile','-Command',code],{encoding:'utf8',timeout:30000,env:{...process.env,CHECK_BINDING_SCRIPT:script}});
 assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/EXACT_BINDING_GUARDS_PASSED/);
});
