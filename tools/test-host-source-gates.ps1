[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$OutputRoot)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if(-not $IsWindows){throw 'Existing Windows runner required.'}
$root=Split-Path -Parent $PSScriptRoot
$OutputRoot=[IO.Path]::GetFullPath($OutputRoot)
if(Test-Path -LiteralPath $OutputRoot){throw 'Fresh result directory required.'}
[void][IO.Directory]::CreateDirectory($OutputRoot)
$source=([string](& git -C $root rev-parse HEAD)).Trim()
if($LASTEXITCODE -ne 0 -or $source -cne $env:GITHUB_SHA){throw 'Exact workflow checkout required.'}
$stage='preflight'
$result=[ordered]@{schemaVersion=1;scope='source-host-compile-probe-envelope';sourceCommit=$source;status='failed';stage=$stage;hostCompiled=$null;hostVerified=$null;envelopeStaged=$null;installerExecuted=$false;electronLaunched=$false}
try {
    & node (Join-Path $PSScriptRoot 'ci-source-built-host-plan.cjs') verify-verifier $root
    if($LASTEXITCODE -ne 0){throw 'Builder/verifier source contract rejected.'}
    $stage='official-host-input'
    # Acquire only the existing official Host archive, never Electron/Inno/MSYS.
    $plan=& node (Join-Path $PSScriptRoot 'ci-build-input-plan.cjs') plan $root
    if($LASTEXITCODE -ne 0){throw 'Locked archive plan rejected.'}
    $entry=@(($plan|ConvertFrom-Json).files|Where-Object {$_.id -ceq 'windows-host'})
    if($entry.Count -ne 1){throw 'One official Host archive required.'}
    $archive=Join-Path $OutputRoot $entry[0].file
    Invoke-WebRequest -Uri $entry[0].url -OutFile $archive -MaximumRedirection 5 -TimeoutSec 240
    & node (Join-Path $PSScriptRoot 'ci-build-input-plan.cjs') verify-file $root $archive windows-host
    if($LASTEXITCODE -ne 0){throw 'Official Host archive rejected.'}
    & (Join-Path $PSScriptRoot 'prepare-windows-host.ps1') -ArchivePath $archive
    if(-not $?){throw 'Official Host whitelist preparation failed.'}
    & node (Join-Path $PSScriptRoot 'model-compatibility-input.cjs') validate $root
    if($LASTEXITCODE -ne 0){throw 'Committed official Model rejected.'}
    $stage='source-compile-probe-envelope'
    # Exact production orchestrator: original55 -> patch -> source identity ->
    # Framework compile -> real portable probes -> New-VerifiedRuntime -> staging.
    & (Join-Path $PSScriptRoot 'ci-source-built-host.ps1')
    if(-not $?){throw 'Production Host compile/probe/envelope failed.'}
    $stage='staged-receipt-check'
    $verified=& node -e "const r=require('./tools/runner-host-receipt.cjs').load(process.cwd());console.log(JSON.stringify({sourceIdentitySha256:r.sourceIdentitySha256,files:r.files}));"
    if($LASTEXITCODE -ne 0){throw 'Actual staged runner receipt rejected.'}
    $record=$verified|ConvertFrom-Json
    $result.hostCompiled=$true;$result.hostVerified=$true;$result.envelopeStaged=$true
    $result.sourceIdentitySha256=$record.sourceIdentitySha256;$result.files=$record.files
    $result.status='passed';$stage='complete'
} finally {
    $result.stage=$stage
    $json=$result|ConvertTo-Json -Depth 8
    [IO.File]::WriteAllText((Join-Path $OutputRoot 'host-source-gates.json'),$json+[char]10,[Text.UTF8Encoding]::new($false))
    Write-Output ('HOST_SOURCE_GATES '+($result|ConvertTo-Json -Depth 8 -Compress))
}
