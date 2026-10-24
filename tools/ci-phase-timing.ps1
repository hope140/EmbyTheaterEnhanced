# Observability only: callers retain their command order and failure checks.
# Write-Host uses the information stream, never a captured JSON success stream.
function Start-CIPhase([string]$Name) {
    if ($Name -cnotmatch '^[a-z][a-z0-9.-]{0,79}$') { throw 'Invalid CI phase name.' }
    $identity = [guid]::NewGuid().ToString('N')
    $clock = [Diagnostics.Stopwatch]::StartNew()
    $record = [ordered]@{schemaVersion=1; event='start'; id=$identity; phase=$Name; utc=[DateTime]::UtcNow.ToString('o')}
    if ($env:GITHUB_SHA -cmatch '^[a-f0-9]{40}$') { $record.sourceCommit=$env:GITHUB_SHA }
    if ($env:GITHUB_RUN_ID -match '^\d+$') { $record.runId=$env:GITHUB_RUN_ID }
    Write-Host ('CI_PHASE ' + ($record | ConvertTo-Json -Compress))
    return [pscustomobject]@{Id=$identity; Name=$Name; Clock=$clock}
}

function Complete-CIPhase($Phase, [bool]$Succeeded) {
    $Phase.Clock.Stop()
    $record = [ordered]@{schemaVersion=1; event='end'; id=$Phase.Id; phase=$Phase.Name
        utc=[DateTime]::UtcNow.ToString('o'); elapsedMs=$Phase.Clock.Elapsed.TotalMilliseconds
        status=$(if ($Succeeded) { 'passed' } else { 'failed' })}
    Write-Host ('CI_PHASE ' + ($record | ConvertTo-Json -Compress))
}

function Write-CITestTiming([string]$Tool, [string]$Log) {
    # Diagnostics must never replace the real regression gate or its exit code.
    $previousExitCode = $global:LASTEXITCODE
    try {
        & node $Tool $Log
        if ($LASTEXITCODE -ne 0) { Write-Host 'CI_TEST_TIMING unavailable' }
    } catch {
        Write-Host 'CI_TEST_TIMING unavailable'
    } finally {
        $global:LASTEXITCODE = $previousExitCode
    }
}
