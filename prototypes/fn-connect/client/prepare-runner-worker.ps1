[CmdletBinding()]
param([string]$SourceRoot, [string]$TemporaryRoot, [string]$ProgressPath, [string]$RunId)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot 'runner-preparation.ps1')
function Invoke-FnPrepareWorker([string]$SourceRoot, [string]$TemporaryRoot, [string]$ProgressPath, [string]$RunId) {
    $sourceCommit = 'UNKNOWN'; $archiveVerified = $false; $exeVerified = $false; $workerState = @{phase='SOURCE_CHECK'}
    function Publish-Phase([string]$Stage) {
        if ($Stage -ne 'FAILED') { $workerState.phase = $Stage }
        Write-FnAtomicJson $ProgressPath ([ordered]@{schemaVersion=1; runId=$RunId; sourceCommit=$sourceCommit;
            stage=$Stage; phase=$workerState.phase; archiveVerified=$archiveVerified; exeVerified=$exeVerified})
    }
    function Read-CleanCommit {
        $commit = (& git -C $SourceRoot rev-parse HEAD 2>$null | Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or $commit -cnotmatch '^[a-f0-9]{40}$') { throw 'INVALID' }
        $state = & git -C $SourceRoot status --porcelain=v1 --untracked-files=normal 2>$null
        if ($LASTEXITCODE -ne 0 -or $state) { throw 'INVALID' }
        if ($env:GITHUB_SHA -and $commit -cne $env:GITHUB_SHA) { throw 'INVALID' }
        return $commit
    }
    try {
        Publish-Phase 'SOURCE_CHECK'; $sourceCommit = Read-CleanCommit
        Publish-Phase 'MANIFEST_CHECK'
        $input = Get-Content -LiteralPath (Join-Path $SourceRoot 'prototypes/fn-connect/client/electron-input.json') -Raw | ConvertFrom-Json
        & node (Join-Path $SourceRoot 'tools/electron-runtime-input.cjs') validate-manifest $SourceRoot *> $null
        if ($LASTEXITCODE -ne 0) { throw 'INVALID' }
        $product = Get-Content -LiteralPath (Join-Path $SourceRoot 'vendor/electron-runtime-manifest.json') -Raw | ConvertFrom-Json
        if ($input.version -cne $product.version -or $input.platform -cne 'win32-x64' -or
            $input.asset -cne $product.archive.name -or $input.url -cne $product.archive.sourceUrl -or
            $input.sha256 -cne $product.archive.sha256 -or $input.executableSha256 -cne $product.runtime.electronExeSha256) { throw 'INVALID' }
        $archive = Join-Path $TemporaryRoot $input.asset
        Publish-Phase 'DOWNLOAD'
        # One fixed official transfer. The supervisor owns the shared wall-clock
        # deadline; these cmdlet timeouts are not treated as the total budget.
        Invoke-WebRequest -Uri $input.url -OutFile $archive -TimeoutSec 90 -MaximumRetryCount 0
        Publish-Phase 'ARCHIVE_VERIFY'
        if ((Get-Item -LiteralPath $archive).Length -ne $product.archive.size -or
            (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -cne $input.sha256) { throw 'INVALID' }
        $archiveVerified = $true
        Publish-Phase 'EXTRACT'
        $runtime = Join-Path $TemporaryRoot 'electron'
        Expand-Archive -LiteralPath $archive -DestinationPath $runtime
        Publish-Phase 'EXE_VERIFY'
        if ((Get-FileHash -LiteralPath (Join-Path $runtime 'electron.exe') -Algorithm SHA256).Hash.ToLowerInvariant() -cne $input.executableSha256) { throw 'INVALID' }
        $exeVerified = $true
        Publish-Phase 'SOURCE_RECHECK'
        if ((Read-CleanCommit) -cne $sourceCommit) { throw 'INVALID' }
        Publish-Phase 'PREPARED'; return 0
    } catch { Publish-Phase 'FAILED'; return 1 }
}
if ($MyInvocation.InvocationName -ne '.') {
    $code = Invoke-FnPrepareWorker $SourceRoot $TemporaryRoot $ProgressPath $RunId
    exit $code
}
