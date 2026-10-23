[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$BuildRoot,
 [Parameter(Mandatory=$true)][string]$VerificationReceipt
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
function Hash-File([string]$p){return (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
$root=[IO.Path]::GetFullPath($BuildRoot)
$recordPath=Join-Path $root 'build-receipt.json';$record=Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
if($record.builderSha256 -cne (Hash-File (Join-Path $PSScriptRoot 'Build-UnifiedHost.ps1')) -or $record.generatedProjectSha256 -cne (Hash-File (Join-Path $root 'build/Host.Unified.csproj')) -or $record.compilerVersion -notmatch '^17\.' -or $record.referencePackageSha256 -cne 'ee692a845743500910855d4c330ca6e9ef87c16e16f740e4474d187185d66e21'){throw 'Build receipt must bind this builder/project and approved compiler/reference-package scope.'}
$expected=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'EXPECTED-SOURCE-IDENTITY.json') -Raw | ConvertFrom-Json
$identity=(& (Join-Path $PSScriptRoot 'Get-SourceIdentity.ps1') -CandidateSourceRoot (Join-Path $root 'source') | ConvertFrom-Json)
if($record.scope -ne 'cec-update-json-zip-unified' -or $record.containsJsonZipReplacements -ne $true -or $record.sourceIdentitySha256 -cne $identity.sha256 -or $record.sourceIdentitySha256 -cne $expected.sha256 -or $record.framework -ne 'net462' -or $record.platform -ne 'x86' -or $record.modelSha256 -cne 'db22f8ea6cb6afdfab184f80d8b85a10d8a9f148ff4cae167db87ce9cd245153'){throw 'Build scope/source/Model mismatch; never reuse earlier CEC-only or differently fingerprinted combination receipts.'}
if((Hash-File (Join-Path $root 'toolchain-snapshot.json')) -cne $record.toolchainSnapshotSha256){throw 'Toolchain receipt identity mismatch.'}
$referenceManifest=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'REFERENCES.json') -Raw | ConvertFrom-Json
foreach($f in $referenceManifest.files){if((Hash-File (Join-Path $root $f.path)) -cne $f.sha256){throw 'Build reference DLL changed.'}}
if($record.files.Count -ne 2 -or $record.files[0].path -ne 'Emby.Theater.exe' -or $record.files[1].path -ne 'Emby.Theater.pdb'){throw 'Wrong output file set/order.'}
foreach($f in $record.files){$p=Join-Path (Join-Path $root 'bin') $f.path;$i=Get-Item -LiteralPath $p -Force;if($i.PSIsContainer -or ($i.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $i.Length -ne $f.size -or (Hash-File $p) -cne $f.sha256){throw 'Compiled EXE/PDB identity changed.'}}
$v=Get-Content -LiteralPath $VerificationReceipt -Raw | ConvertFrom-Json
if($v.loadedModelSha256 -cne $record.modelSha256 -or !$v.loadedModelLocation -or $v.probePointerSize -ne 4){throw 'Actual loaded Model path/hash and x86 Framework probe are required, not only disk/version/MVID.'}
if($v.schemaVersion -ne 1 -or $v.scope -ne 'cec-update-json-zip-unified' -or $v.result -ne 'passed' -or $v.sourceIdentitySha256 -cne $identity.sha256 -or $v.hostExeSha256 -cne $record.files[0].sha256 -or $v.hostPdbSha256 -cne $record.files[1].sha256 -or $v.modelSha256 -cne $record.modelSha256 -or $v.clrObjectAssembly -notmatch '^mscorlib, Version=4\.0\.0\.0,'){throw 'Verification envelope must match these actual Framework build bytes.'}
foreach($name in @('directUpdateCheck','interfaceUpdateCheck','reflectionUpdateCheck')){if($v.$name -ne 'no-update'){throw 'v1 no-update contract has not passed all three call paths.'}}
if($v.canSelfUpdate -ne $false -or $v.legacyTaskAbsent -ne $true -or $v.installUpdate -ne 'NotSupportedException' -or $v.noCecOrUpdaterLaunch -ne $true){throw 'Retired functionality checks not passed.'}
if($v.startupCases.Count -ne 2){throw 'Two controlled startup cases required.'}
foreach($c in $v.startupCases){if($c.passed -ne $true -or $c.local8154 -ne $true -or $c.xmlSave -ne $true -or $c.exitCode -ne 0 -or $c.pendingPreserved -ne $true -or $c.argumentShape -ne 'app/data/mpv' -or $c.usesCancelMask -ne $false -or $c.usesTaskSuppression -ne $false){throw 'A controlled startup/persistence case did not pass without masking.'}}
if($v.loadedNewtonsoftSha256 -cne 'f0c07af0e84d4dd4da4bd7823ba4535bc0481b3bf623ed40b659b68147a6bb75' -or !$v.loadedNewtonsoftLocation -or $v.compiledHostJsonDtos -ne 'passed-10' -or $v.malformedJsonDocuments -ne 'JsonReaderException' -or $v.nullArraySlots -ne 'compatible' -or $v.zipStoredDeflateFixtures -ne 'passed'){throw 'Matched unified JSON/ZIP backend/Host checks remain pending.'}
$out=Join-Path $root 'verified-runtime.json'
if(Test-Path -LiteralPath $out){throw 'Verified lock already exists; never overwrite it.'}
$lock=[ordered]@{schemaVersion=1;mode='source-built-host';sourceIdentitySha256=$identity.sha256;framework='net462';platform='x86';modelSha256=$record.modelSha256;toolchainSnapshotSha256=$record.toolchainSnapshotSha256;buildReceiptSha256=(Hash-File $recordPath);verificationReceiptSha256=(Hash-File $VerificationReceipt);files=$record.files}
[IO.File]::WriteAllText($out,((ConvertTo-Json -InputObject $lock -Depth 8)+"`n"),(New-Object Text.UTF8Encoding($false)))
Write-Output ("Wrote matched, evidence-bound lock: "+$out)
