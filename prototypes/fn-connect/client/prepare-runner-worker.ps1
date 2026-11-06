[CmdletBinding()]
param([string]$SourceRoot, [string]$TemporaryRoot, [string]$ProgressPath, [string]$RunId, [AllowEmptyString()][string]$ArchiveRoot)
$cacheRequested = $PSBoundParameters.ContainsKey('ArchiveRoot')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot 'runner-preparation.ps1')
function Invoke-FnPrepareWorker([string]$SourceRoot, [string]$TemporaryRoot, [string]$ProgressPath, [string]$RunId, [bool]$UseCache = $false, [string]$ArchiveRoot = '') {
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
            $input.sha256 -cne $product.archive.sha256 -or $input.executableSha256 -cne $product.runtime.electronExeSha256 -or
            $product.archive.size -ne 157966405 -or $input.asset -cne 'electron-v44.5.0-win32-x64.zip' -or
            $input.sha256 -cne 'b3405d8847bc5054cd16272f538d22ba5b73032945e85cef26241f7135035278') { throw 'INVALID' }
        $archive = Join-Path $TemporaryRoot $input.asset
        if ($UseCache) {
            Publish-Phase 'CACHE_COPY'
            Copy-FnLockedArchive -ArchiveRoot $ArchiveRoot -Destination $archive -ExpectedSize $product.archive.size -ExpectedSha256 $input.sha256
        } else {
            Publish-Phase 'DOWNLOAD'
            # No retry or fallback between material sources. Preparation keeps
            # the same shared deadline, including copy and verification.
            Invoke-WebRequest -Uri $input.url -OutFile $archive -TimeoutSec 90 -MaximumRetryCount 0
        }
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
    $code = Invoke-FnPrepareWorker $SourceRoot $TemporaryRoot $ProgressPath $RunId -UseCache $cacheRequested -ArchiveRoot $ArchiveRoot
    exit $code
}
