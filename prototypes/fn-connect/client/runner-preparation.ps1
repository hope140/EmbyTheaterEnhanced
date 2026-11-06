# Test-runner supervision only; no product or authentication settings.
$FnPreparationBudgetMs = 900000
$FnPreparationStages = @('SOURCE_CHECK','MANIFEST_CHECK','DOWNLOAD','ARCHIVE_VERIFY','EXTRACT','EXE_VERIFY','SOURCE_RECHECK','PREPARED','FAILED')
function Write-FnAtomicJson($Path, $Value, [switch]$Exclusive) {
    $bytes = [Text.Encoding]::UTF8.GetBytes(($Value | ConvertTo-Json -Depth 8 -Compress) + "`n")
    $temporary = $Path + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
    try {
        [IO.File]::WriteAllBytes($temporary, $bytes)
        [IO.File]::Move($temporary, $Path, -not $Exclusive.IsPresent)
    } finally { if ([IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) } }
}
function Write-FnRunnerFailure($ResultPath, $Outcome) {
    # Written before any recursive cleanup; never replace an existing result.
    Write-FnAtomicJson $ResultPath ([ordered]@{
        schemaVersion=1; test='fn-connect-electron-loopback'; sourceCommit=$Outcome.sourceCommit
        result='FAILED'; reason=$Outcome.reason; launchState=$Outcome.reason
        preparation=[ordered]@{runId=$Outcome.runId; stage=$Outcome.stage; elapsedMs=$Outcome.elapsedMs; processExited=$Outcome.processExited}
        processExited=$Outcome.processExited; temporaryProfileRemoved=$false
        realFNConnect='NOT_TESTED'; nativeHelperPlayback='NOT_TESTED'; hlsDash='NOT_SUPPORTED'
    }) -Exclusive
}
function Wait-FnPreparation {
    param($Child, $Watch, [string]$RunId, [string]$ProgressPath, [string]$StatusPath,
        [string]$ResultPath, [string]$ArchivePath, [string]$ExpectedCommit = '', [long]$BudgetMs = $FnPreparationBudgetMs)
    $source = 'UNKNOWN'; $stage = 'RUNNER_STARTED'; $reason = $null; $index = -1; $downloadBytes = 0L
    $prepared = $false; $progress = $null
    while (-not $reason -and -not $prepared) {
        if ($Watch.ElapsedMilliseconds -ge $BudgetMs) { $reason = 'PREPARATION_TIMEOUT'; break }
        try {
            $exitObservedBeforeRead = $Child.HasExited
            if ([IO.File]::Exists($ProgressPath)) {
                if ((Get-Item -LiteralPath $ProgressPath).Length -gt 4096) { throw 'INVALID' }
                $progress = Get-Content -LiteralPath $ProgressPath -Raw | ConvertFrom-Json
                $keys = @($progress.PSObject.Properties.Name)
                if (@($keys | Where-Object { $_ -notin @('schemaVersion','runId','sourceCommit','stage','phase','archiveVerified','exeVerified') }).Count -or
                    $keys.Count -ne 7 -or $progress.schemaVersion -ne 1 -or $progress.runId -cne $RunId -or
                    $progress.stage -notin $FnPreparationStages -or $progress.phase -notin $FnPreparationStages -or $progress.phase -eq 'FAILED' -or
                    ($progress.stage -ne 'FAILED' -and $progress.phase -cne $progress.stage) -or $progress.archiveVerified -isnot [bool] -or $progress.exeVerified -isnot [bool]) { throw 'INVALID' }
                $nextSource = [string]$progress.sourceCommit
                if ($nextSource -cne 'UNKNOWN' -and $nextSource -cnotmatch '^[a-f0-9]{40}$') { throw 'INVALID' }
                if (($source -cne 'UNKNOWN' -and $nextSource -cne $source) -or ($ExpectedCommit -and $nextSource -cne 'UNKNOWN' -and $nextSource -cne $ExpectedCommit)) { throw 'INVALID' }
                if ($nextSource -cne 'UNKNOWN') { $source = $nextSource }
                $nextIndex = [Array]::IndexOf($FnPreparationStages, [string]$progress.stage)
                if ($nextIndex -lt $index) { throw 'INVALID' }
                $index = $nextIndex; $stage = [string]$progress.stage
                if ($stage -eq 'FAILED') { $stage = [string]$progress.phase; $reason = 'PREPARATION_FAILED' }
            }
            if ([IO.File]::Exists($ArchivePath)) { $downloadBytes = (Get-Item -LiteralPath $ArchivePath).Length }
        } catch { $reason = 'PREPARATION_EVIDENCE_INVALID' }
        if ($Watch.ElapsedMilliseconds -ge $BudgetMs) { $reason = 'PREPARATION_TIMEOUT' }
        if ($reason) { break }
        try {
            Write-FnAtomicJson $StatusPath ([ordered]@{schemaVersion=1; runId=$RunId; sourceCommit=$source; stage=$stage;
                elapsedMs=[long]$Watch.ElapsedMilliseconds; downloadBytes=$downloadBytes; terminal=$false; reason=$null})
        } catch { $reason = 'PREPARATION_FAILED'; break }
        if ($Watch.ElapsedMilliseconds -ge $BudgetMs) { $reason = 'PREPARATION_TIMEOUT'; break }
        if ($Child.HasExited) {
            # If exit occurred after the read, loop once more to bind the final
            # receipt after confirmed exit. Never classify a stale snapshot.
            if (-not $exitObservedBeforeRead) { continue }
            if ($Watch.ElapsedMilliseconds -ge $BudgetMs) { $reason = 'PREPARATION_TIMEOUT'; break }
            if ($Child.ExitCode -eq 0 -and $stage -eq 'PREPARED' -and $source -cne 'UNKNOWN' -and
                $progress.archiveVerified -eq $true -and $progress.exeVerified -eq $true) { $prepared = $true }
            else { $reason = 'PREPARATION_FAILED' }
            break
        }
        $null = $Child.WaitForExit(250)
    }
    $exited = $Child.HasExited
    if (-not $prepared -and -not $exited) {
        try { Write-FnAtomicJson $StatusPath ([ordered]@{schemaVersion=1; runId=$RunId; sourceCommit=$source; stage=$stage;
            elapsedMs=[long]$Watch.ElapsedMilliseconds; downloadBytes=$downloadBytes; terminal=$false; reason=$reason; stopping=$true}) } catch {}
        try { $Child.Kill($true); $null = $Child.WaitForExit(5000); $exited = $Child.HasExited } catch { $exited = $false }
        if (-not $exited) { $reason = 'PREPARATION_EXIT_UNCONFIRMED' }
    }
    $outcome = [ordered]@{runId=$RunId; sourceCommit=$source; stage=$stage; elapsedMs=[long]$Watch.ElapsedMilliseconds;
        processExited=[bool]$exited; ready=[bool]($prepared -and $exited); reason=$reason}
    try { Write-FnAtomicJson $StatusPath ([ordered]@{schemaVersion=1; runId=$RunId; sourceCommit=$source; stage=$stage;
        elapsedMs=$outcome.elapsedMs; downloadBytes=$downloadBytes; terminal=(-not $outcome.ready); reason=$reason}) } catch {}
    # Include the last receipt write in the same deadline, too.
    if ($outcome.ready -and $Watch.ElapsedMilliseconds -ge $BudgetMs) {
        $outcome.ready = $false; $outcome.reason = 'PREPARATION_TIMEOUT'; $outcome.elapsedMs = [long]$Watch.ElapsedMilliseconds
        try { Write-FnAtomicJson $StatusPath ([ordered]@{schemaVersion=1; runId=$RunId; sourceCommit=$source; stage=$stage;
            elapsedMs=$outcome.elapsedMs; downloadBytes=$downloadBytes; terminal=$true; reason=$outcome.reason}) } catch {}
    }
    if (-not $outcome.ready) { Write-FnRunnerFailure $ResultPath $outcome }
    return $outcome
}
