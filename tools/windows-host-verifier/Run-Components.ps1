param([Parameter(Mandatory=$true)][string]$EvidenceRoot,[Parameter(Mandatory=$true)][string]$Compiler,[Parameter(Mandatory=$true)][string]$ReferenceRoot)
$ErrorActionPreference='Stop'; Set-StrictMode -Version Latest
$r=$PSScriptRoot
$root=$EvidenceRoot
. (Join-Path $r 'Framework-BuildHelpers.ps1') -Compiler $Compiler -ReferenceRoot $ReferenceRoot
$build=Get-Content -LiteralPath (Join-Path $root 'build-receipt.json') -Raw|ConvertFrom-Json
if($build.sourceIdentitySha256 -cne 'fef4cbfdb15a52b32a21edb33039833b5fc523ac594fcf3b871b78080dc8be9b'){throw 'Source identity mismatch'}
$out=Join-Path $root 'contracts';if(Test-Path -LiteralPath $out){throw 'Fresh contracts required'};[void][IO.Directory]::CreateDirectory($out)
foreach($file in Get-ChildItem -LiteralPath (Join-Path $root 'bin') -File){Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $out $file.Name)}
foreach($entry in $build.references){$p=Join-Path $root $entry.path;if((Hash $p) -cne $entry.sha256){throw 'Reference changed'};Copy-Item -LiteralPath $p -Destination (Join-Path $out ([IO.Path]::GetFileName($p)))}
$extra=@(Get-ChildItem -LiteralPath $out -Filter '*.dll' -File|ForEach-Object{$_.FullName})+@((Join-Path $out 'Emby.Theater.exe'))
$results=@()
foreach($spec in @(
 @('RuntimeIdentity',(Join-Path $r 'RuntimeIdentity.cs'),'identity.json'),
 @('OfficialModelContractProbe',(Join-Path $r 'OfficialModelContractProbe.cs'),'update-contract.txt'),
 @('RealModelJsonProbe',(Join-Path $r 'RealModelJsonProbe.ApprovedStrict.cs'),'actual-model-tests.json'),
 @('ExactJsonDifferenceCases',(Join-Path $r 'ExactJsonDifferenceCasesV2.cs'),'exact-json-cases.json'),
 @('UnifiedZipProbe',(Join-Path $r 'UnifiedZipProbe.cs'),'host-zip-contract.txt')
)){
 $compiled=Compile-Framework $out $spec[0] @($spec[1]) $extra $true
 $argsForProbe=@();if($spec[0] -eq 'UnifiedZipProbe'){$argsForProbe=@((Join-Path $root 'fixtures'))}
 $result=Run-OwnedProbe $compiled.Path $argsForProbe (Join-Path $out $spec[2])
 $results+=[ordered]@{Name=$spec[0];Compile=$compiled;Run=$result}
 if($result.Exit -ne 0){Save-Json (Join-Path $out 'failed-probes.json') $results;throw ('Probe failed '+$spec[0])}
}
$unitOut=Join-Path $root 'json-contracts';[void][IO.Directory]::CreateDirectory($unitOut)
Copy-Item -LiteralPath (Join-Path $out 'Newtonsoft.Json.dll') -Destination (Join-Path $unitOut 'Newtonsoft.Json.dll')
$jsonSource=Join-Path $root 'source\Emby.Theater\Serialization'
$unit=Compile-Framework $unitOut 'UnifiedJsonContracts' @((Join-Path $jsonSource 'CompatibleJsonCodec.cs'),(Join-Path $jsonSource 'JsonSerializer.cs'),(Join-Path $r 'JsonContractStubs.cs'),(Join-Path $r 'JsonUnitProgram.cs')) @((Join-Path $out 'Newtonsoft.Json.dll')) $true
$unitRun=Run-OwnedProbe $unit.Path @() (Join-Path $unitOut 'unit-tests.json')
$zipOut=Join-Path $root 'zip-contracts';[void][IO.Directory]::CreateDirectory($zipOut)
$zipSource=Join-Path $root 'source\Emby.Theater\Archiving'
$zip=Compile-Framework $zipOut 'UnifiedZipContracts' @((Join-Path $zipSource 'FrameworkZipExtractor.cs'),(Join-Path $zipSource 'ZipClient.cs'),(Join-Path $r 'ZipContractStubs.cs'),(Join-Path $r 'ZipUnitProgram.cs')) @() $true
$zipRun=Run-OwnedProbe $zip.Path @((Join-Path $root 'fixtures')) (Join-Path $zipOut 'test-output.txt')
$dto=Get-Content -LiteralPath (Join-Path $out 'actual-model-tests.json') -Raw|ConvertFrom-Json
$units=Get-Content -LiteralPath $unitRun.Log -Raw|ConvertFrom-Json
$exact=Get-Content -LiteralPath (Join-Path $out 'exact-json-cases.json') -Raw|ConvertFrom-Json
$bad=@($exact.cases|Where-Object{$_.label -in @('truncated-after-Name-colon','two-adjacent-empty-objects')})
if($dto.total -ne 10 -or $dto.failures -ne 0 -or $unitRun.Exit -ne 0 -or $units.total -ne 28 -or $units.failures -ne 0 -or $zipRun.Exit -ne 0 -or @($bad|Where-Object{$_.exceptionType -cne 'Newtonsoft.Json.JsonReaderException'}).Count){throw 'Contract assertion failed'}
$pdb=& (Join-Path $r 'Read-ExePdbMatch.ps1') -Exe (Join-Path $root 'bin\Emby.Theater.exe') -Pdb (Join-Path $root 'bin\Emby.Theater.pdb')
if(-not $pdb.Matched){throw 'EXE/PDB do not match'}
$receipt=[ordered]@{SourceFingerprint=$build.sourceIdentitySha256;ProbeResults=$results;JsonUnits=$units.total;ActualModelDtos=$dto.total;ZipUnits=$zipRun;PdbMatch=$pdb;HostExeSHA256=$build.files[0].sha256;HostPdbSHA256=$build.files[1].sha256;Passed=$true}
Save-Json (Join-Path $root 'component-verification.json') $receipt
$receipt|ConvertTo-Json -Depth 8

