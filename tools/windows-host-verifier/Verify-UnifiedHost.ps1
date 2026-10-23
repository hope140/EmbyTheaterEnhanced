[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$BuildRoot,
 [Parameter(Mandatory=$true)][string]$OutputReceipt
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if($env:OS -ne 'Windows_NT' -or $PSVersionTable.PSVersion.Major -lt 7){throw 'Existing Windows PowerShell7 host required; probes run in fresh Framework x86 processes. Do not install/fallback.'}
$BuildRoot=[IO.Path]::GetFullPath($BuildRoot)
$OutputReceipt=[IO.Path]::GetFullPath($OutputReceipt)
if(Test-Path -LiteralPath $OutputReceipt){throw 'OutputReceipt must not exist'}
if(-not(Test-Path -LiteralPath ([IO.Path]::GetDirectoryName($OutputReceipt)) -PathType Container)){throw 'Existing physical receipt parent required'}
function Get-PortableHash([string]$Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Check-PhysicalFile([string]$Path){$i=Get-Item -LiteralPath $Path -Force;if($i.PSIsContainer -or ($i.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw ('Physical input file required '+$Path)}}
$package=$PSScriptRoot
$manifest=Get-Content -LiteralPath (Join-Path $package 'verifier-manifest.json') -Raw|ConvertFrom-Json
foreach($f in $manifest.files){$p=Join-Path $package $f.path;Check-PhysicalFile $p;if((Get-Item -LiteralPath $p).Length -ne $f.size -or (Get-PortableHash $p) -cne $f.sha256){throw ('Verifier file mismatch '+$f.path)}}
$contract=Get-Content -LiteralPath (Join-Path $package 'expected-build-contract.json') -Raw|ConvertFrom-Json
$receiptPath=Join-Path $BuildRoot 'build-receipt.json'
$build=Get-Content -LiteralPath $receiptPath -Raw|ConvertFrom-Json
if($build.scope -cne 'cec-update-json-zip-unified' -or $build.sourceIdentitySha256 -cne $contract.sourceFingerprint -or $build.builderSha256 -cne $contract.builderSha256 -or $build.framework -cne 'net462' -or $build.platform -cne 'x86' -or $build.referencePackageSha256 -cne $contract.referencePackageSha256){throw 'Build identity/scope mismatch'}
if($build.files.Count -ne 2 -or $build.files[0].path -cne 'Emby.Theater.exe' -or $build.files[1].path -cne 'Emby.Theater.pdb'){throw 'Wrong EXE/PDB set'}
foreach($f in $build.files){$p=Join-Path (Join-Path $BuildRoot 'bin') $f.path;Check-PhysicalFile $p;if((Get-Item -LiteralPath $p).Length -ne $f.size -or (Get-PortableHash $p) -cne $f.sha256){throw 'Actual EXE/PDB mismatch'}}
if($build.files[0].sha256 -ceq '11abf75c8f77ddb0078e7dd62a2eaae60dba244c113bc7893a7e56bc6527163e'){throw 'Original stock Host is not the unified build'}
$sourceManifest=Get-Content -LiteralPath (Join-Path $package 'expected-candidate-files.json') -Raw|ConvertFrom-Json
foreach($f in $sourceManifest){$p=Join-Path (Join-Path $BuildRoot 'source') $f.path;Check-PhysicalFile $p;if((Get-Item -LiteralPath $p).Length -ne $f.size -or (Get-PortableHash $p) -cne $f.sha256){throw ('Candidate source mismatch '+$f.path)}}
foreach($f in $contract.references){$p=Join-Path $BuildRoot $f.path;Check-PhysicalFile $p;if((Get-Item -LiteralPath $p).Length -ne $f.size -or (Get-PortableHash $p) -cne $f.sha256){throw 'Fixed reference mismatch'}}
$private=Join-Path $BuildRoot 'verification-inputs\System.Configuration.dll'
Check-PhysicalFile $private
if((Get-PortableHash $private) -cne $contract.privateConfigSha256){throw 'Private reference test input mismatch'}
$snapshotPath=Join-Path $BuildRoot 'toolchain-snapshot.json'
if((Get-PortableHash $snapshotPath) -cne $build.toolchainSnapshotSha256){throw 'Toolchain snapshot mismatch'}
$snapshot=@(Get-Content -LiteralPath $snapshotPath -Raw|ConvertFrom-Json)
[xml]$project=Get-Content -LiteralPath (Join-Path $BuildRoot 'build\Host.Unified.csproj') -Raw
$ns=[Xml.XmlNamespaceManager]::new($project.NameTable);$ns.AddNamespace('m','http://schemas.microsoft.com/developer/msbuild/2003')
$mscorlib=@($project.SelectNodes('//m:Reference',$ns)|Where-Object{$_.GetAttribute('Include') -ceq 'mscorlib'})
if($mscorlib.Count -ne 1){throw 'One explicit reference-pack mscorlib required'}
$refPath=$mscorlib[0].SelectSingleNode('m:HintPath',$ns).InnerText
$ReferenceRoot=[IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($refPath))
foreach($f in @($snapshot|Where-Object{$_.component -ceq 'net462'})){$p=Join-Path $ReferenceRoot $f.path;Check-PhysicalFile $p;if((Get-PortableHash $p) -cne $f.sha256){throw ('Reference pack changed '+$f.path)}}
$cscRecord=@($snapshot|Where-Object{$_.component -ceq 'msbuild' -and $_.path.Replace('\','/').EndsWith('/Roslyn/csc.exe',[StringComparison]::OrdinalIgnoreCase)})
if($cscRecord.Count -ne 1){throw 'One compiler snapshot entry required'}
$compilerCandidates=@()
$cmd=Get-Command MSBuild.exe -ErrorAction SilentlyContinue
if($cmd){$compilerCandidates+=Join-Path ([IO.Path]::GetDirectoryName($cmd.Source)) 'Roslyn\csc.exe'}
foreach($edition in @('Community','Professional','Enterprise','BuildTools')){$compilerCandidates+=Join-Path $env:ProgramFiles ('Microsoft Visual Studio\2022\'+$edition+'\MSBuild\Current\Bin\Roslyn\csc.exe')}
$Compiler=$null
foreach($p in $compilerCandidates){if(Test-Path -LiteralPath $p -PathType Leaf){if((Get-PortableHash $p) -ceq $cscRecord[0].sha256){$Compiler=$p;break}}}
if(-not $Compiler){throw 'Existing compiler matching this build snapshot not found; do not install or silently substitute'}
$runId=[guid]::NewGuid().ToString('N')
$EvidenceRoot=Join-Path ([IO.Path]::GetTempPath()) ('euv-'+$runId)
if($EvidenceRoot.Length -gt 100){throw 'Use an existing short owned process TEMP path; no system setting changes'}
if(Test-Path -LiteralPath $EvidenceRoot){throw 'Fresh evidence directory required'}
[void][IO.Directory]::CreateDirectory($EvidenceRoot)
$started=[DateTime]::UtcNow.ToString('o')
try{
 foreach($dir in @('bin','references','source','verification-inputs')){[void][IO.Directory]::CreateDirectory((Join-Path $EvidenceRoot $dir))}
 foreach($f in $build.files){Copy-Item -LiteralPath (Join-Path (Join-Path $BuildRoot 'bin') $f.path) -Destination (Join-Path (Join-Path $EvidenceRoot 'bin') $f.path)}
 Copy-Item -LiteralPath (Join-Path $BuildRoot 'bin\Emby.Theater.exe.config') -Destination (Join-Path $EvidenceRoot 'bin\Emby.Theater.exe.config')
 Copy-Item -LiteralPath $receiptPath -Destination (Join-Path $EvidenceRoot 'build-receipt.json')
 foreach($f in $contract.references){Copy-Item -LiteralPath (Join-Path $BuildRoot $f.path) -Destination (Join-Path $EvidenceRoot $f.path)}
 foreach($f in $sourceManifest){$p=Join-Path (Join-Path $EvidenceRoot 'source') $f.path;[void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($p));Copy-Item -LiteralPath (Join-Path (Join-Path $BuildRoot 'source') $f.path) -Destination $p}
 Copy-Item -LiteralPath $private -Destination (Join-Path $EvidenceRoot 'verification-inputs\System.Configuration.dll')
 . (Join-Path $package 'Framework-BuildHelpers.ps1') -Compiler $Compiler -ReferenceRoot $ReferenceRoot
 $fixtureOut=Join-Path $EvidenceRoot 'fixture-generator'
 $fixture=Compile-Framework $fixtureOut 'FrameworkFixtureMaker' @((Join-Path $package 'FrameworkFixtureMaker.cs')) @() $true
 $made=Run-OwnedProbe $fixture.Path @((Join-Path $EvidenceRoot 'fixtures')) (Join-Path $EvidenceRoot 'fixture-generation.txt')
 if($made.Exit -ne 0){throw 'Synthetic fixture generation failed'}
 & (Join-Path $package 'Run-Components.ps1') -EvidenceRoot $EvidenceRoot -Compiler $Compiler -ReferenceRoot $ReferenceRoot > (Join-Path $EvidenceRoot 'components-invocation.txt') 2>&1
 & (Join-Path $package 'Run-Boundaries.ps1') -EvidenceRoot $EvidenceRoot -Compiler $Compiler -ReferenceRoot $ReferenceRoot > (Join-Path $EvidenceRoot 'boundaries-invocation.txt') 2>&1
 & (Join-Path $package 'Run-Transport.ps1') -EvidenceRoot $EvidenceRoot -Compiler $Compiler -ReferenceRoot $ReferenceRoot > (Join-Path $EvidenceRoot 'transport-invocation.txt') 2>&1
 & (Join-Path $package 'Prepare-HostPair.ps1') -EvidenceRoot $EvidenceRoot -Compiler $Compiler -ReferenceRoot $ReferenceRoot > (Join-Path $EvidenceRoot 'host-prepare.txt') 2>&1
 & (Join-Path $EvidenceRoot 'controlled-acceptance\Run-UnifiedPair.ps1') -EvidenceRoot $EvidenceRoot -Compiler $Compiler -ReferenceRoot $ReferenceRoot > (Join-Path $EvidenceRoot 'host-run.txt') 2>&1
 if($LASTEXITCODE -ne 0){throw 'Controlled Host run failed'}
 & (Join-Path $package 'Finalize-Evidence.ps1') -EvidenceRoot $EvidenceRoot -Compiler $Compiler -ReferenceRoot $ReferenceRoot > (Join-Path $EvidenceRoot 'finalize.txt') 2>&1
 $envelope=Get-Content -LiteralPath (Join-Path $EvidenceRoot 'verification-envelope.json') -Raw|ConvertFrom-Json
 if($envelope.result -cne 'passed'){throw 'Final verification did not pass'}
 $envelope|Add-Member -NotePropertyName recordedUtc -NotePropertyValue ([DateTime]::UtcNow.ToString('o'))
 $envelope|Add-Member -NotePropertyName startedUtc -NotePropertyValue $started
 $envelope|Add-Member -NotePropertyName verifierRunId -NotePropertyValue $runId
 $envelope|Add-Member -NotePropertyName inputBuildRoot -NotePropertyValue $BuildRoot
 $envelope|Add-Member -NotePropertyName evidenceRoot -NotePropertyValue $EvidenceRoot
 $envelope|Add-Member -NotePropertyName inputBuildReceiptSha256 -NotePropertyValue (Get-PortableHash $receiptPath)
 $envelope|Add-Member -NotePropertyName verifierManifestSha256 -NotePropertyValue (Get-PortableHash (Join-Path $package 'verifier-manifest.json'))
 [IO.File]::WriteAllText($OutputReceipt,(($envelope|ConvertTo-Json -Depth 16)+[char]10),[Text.UTF8Encoding]::new($false))
 Write-Output ('PASSED '+$OutputReceipt)
 Write-Output ('EvidenceRoot='+$EvidenceRoot)
}catch{
 $failure=[ordered]@{schemaVersion=1;scope='cec-update-json-zip-unified';result='failed';startedUtc=$started;recordedUtc=[DateTime]::UtcNow.ToString('o');verifierRunId=$runId;inputBuildRoot=$BuildRoot;evidenceRoot=$EvidenceRoot;error=$_.ToString()}
 [IO.File]::WriteAllText($OutputReceipt,(($failure|ConvertTo-Json -Depth 8)+[char]10),[Text.UTF8Encoding]::new($false))
 throw
}

