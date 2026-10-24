param([Parameter(Mandatory=$true)][string]$OutputRoot)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if ($env:OS -ne 'Windows_NT' -or $PSVersionTable.PSEdition -ne 'Desktop') { throw 'Framework Windows PowerShell5.1 required.' }
$root=Split-Path -Parent $PSScriptRoot
$sourceRoot=Join-Path $OutputRoot 'generated'
if(Test-Path -LiteralPath $OutputRoot){throw 'Preserve existing lifecycle evidence.'}
New-Item -ItemType Directory -Path $OutputRoot | Out-Null
& node (Join-Path $PSScriptRoot 'host-exit-harness.cjs') $root $sourceRoot
if($LASTEXITCODE -ne 0){throw 'Harness source generation failed.'}
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework/v4.0.30319/csc.exe'
$forms=[Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms').Location
$wpf=[Reflection.Assembly]::LoadWithPartialName('WindowsBase').Location
$signature=Get-AuthenticodeSignature -LiteralPath $compiler
if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft'){throw 'Microsoft Framework compiler signature required.'}
$rows=@()
foreach($variant in @('baseline','candidate')){
 $exe=Join-Path $sourceRoot ($variant+'.exe')
 & $compiler /nologo /target:exe /platform:x86 ('/reference:'+$forms) ('/reference:'+$wpf) ('/out:'+$exe) (Join-Path $sourceRoot ($variant+'.cs'))
 if($LASTEXITCODE -ne 0){throw 'Framework harness compilation failed.'}
 foreach($caseName in @('before-loop','before-loop-nested-pump','after-loop','repeated-after-loop')){
  $report=Join-Path $OutputRoot ($variant+'-'+$caseName+'.json')
  $proc=Start-Process -FilePath $exe -ArgumentList @($caseName,('"'+$report+'"')) -PassThru -WindowStyle Hidden
  if(-not $proc.WaitForExit(8000)){throw 'Harness process timeout; do not count cleanup as success.'}
  if(-not(Test-Path -LiteralPath $report)){throw 'Harness report missing.'}
  $value=Get-Content -LiteralPath $report -Raw | ConvertFrom-Json
  $rows+=@([ordered]@{variant=$variant;case=$caseName;exitCode=$proc.ExitCode;result=$value})
 }
}
$baselineEarly=@($rows|Where-Object{$_.variant -eq 'baseline' -and $_.case -like 'before-*'})
$candidate=@($rows|Where-Object{$_.variant -eq 'candidate'})
$reproduced=@($baselineEarly|Where-Object{-not $_.result.normalLoopExit -and $_.result.watchdogCleanup -and $_.result.callbackObserved -and $_.result.childExitCode -eq 0}).Count -eq 2
$passed=@($candidate|Where-Object{$_.exitCode -ne 0 -or -not $_.result.normalLoopExit -or $_.result.watchdogCleanup -or -not $_.result.callbackOnWorker -or -not $_.result.applicationExitOnMain}).Count -eq 0
$summary=[ordered]@{scope='selected-production-exit-methods-real-framework-loop';baselineEarlyReproduced=$reproduced;candidatePassed=$passed;fullHostAcceptance='NOT_ASSESSED';fullHostLaunched=$false;installerExecuted=$false;compilerSha256=(Get-FileHash -LiteralPath $compiler).Hash.ToLowerInvariant();compilerSignature=[string]$signature.Status;formsSha256=(Get-FileHash -LiteralPath $forms).Hash.ToLowerInvariant();windowsBaseSha256=(Get-FileHash -LiteralPath $wpf).Hash.ToLowerInvariant();cases=$rows}
$summary|ConvertTo-Json -Depth 7|Set-Content -LiteralPath (Join-Path $OutputRoot 'summary.json') -Encoding UTF8
$summary|ConvertTo-Json -Depth 7 -Compress|Write-Output
if(-not $reproduced -or -not $passed){throw 'Real Framework lifecycle contract did not pass; no full Host claim.'}
