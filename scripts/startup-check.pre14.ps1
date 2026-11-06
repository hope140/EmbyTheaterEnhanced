param(
    [Parameter(Mandatory = $true)][string]$SourceDirectory,
    [Parameter(Mandatory = $true)][string]$ElectronPath,
    [Parameter(Mandatory = $true)][string]$PrivateConfigPath,
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedMainSha256,
    [switch]$PreviousInstanceResolved
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $PreviousInstanceResolved) { throw 'PRIOR_INSTANCE_UNRESOLVED' }
$fnLock = Join-Path $env:LOCALAPPDATA 'EmbyTheaterEnhanced-FN-Prototype\application.lock'
if (Test-Path -LiteralPath $fnLock) { throw 'APPLICATION_LOCK_PRESENT' }
$fnMain = Join-Path $SourceDirectory 'electron-main.cjs'
foreach ($fnPath in @($fnMain, $ElectronPath, $PrivateConfigPath)) {
    $fnFullPath = $false
    try { $fnFullPath = [IO.Path]::IsPathRooted($fnPath) -and [IO.Path]::GetFullPath($fnPath).Equals($fnPath, [StringComparison]::OrdinalIgnoreCase) } catch {}
    if (-not $fnFullPath -or $fnPath -match '["\r\n]' -or
        -not (Test-Path -LiteralPath $fnPath -PathType Leaf)) { throw 'STARTUP_INPUT_INVALID' }
}
if ((Get-FileHash -LiteralPath $fnMain -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ExpectedMainSha256) { throw 'STARTUP_MAIN_SHA_MISMATCH' }
$fnRunId = [Guid]::NewGuid().ToString('N')
$fnRoot = Join-Path $env:TEMP ('ete-fn-startup-' + $fnRunId)
New-Item -ItemType Directory -Path $fnRoot -ErrorAction Stop | Out-Null
[IO.File]::WriteAllText((Join-Path $fnRoot '.startup-owner'), "ETE_FN_STARTUP_RECEIPT_V1`n", [Text.UTF8Encoding]::new($false))
$fnReceipt = Join-Path $fnRoot 'startup.json'
$fnRecord = [ordered]@{entryId = 'ETE_FN_STARTUP_LAUNCH_V1'; runId = $fnRunId; sourceSha = $ExpectedMainSha256;
    processId = $null; processState = 'NOT_STARTED'; exitCode = $null; entryBound = $false;
    receiptStatus = 'NONE'; stage = 'NONE'; readyReached = $false; exitObserved = $false; errorCode = $null; result = 'WAITING'}
function Read-FnStartupReceipt {
    $fnStream = [IO.File]::Open($fnReceipt, [IO.FileMode]::Open, [IO.FileAccess]::Read, ([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    try {
        $fnReader = [IO.StreamReader]::new($fnStream, [Text.Encoding]::UTF8)
        try { $fnValue = $fnReader.ReadToEnd() | ConvertFrom-Json } finally { $fnReader.Dispose() }
    } finally { $fnStream.Dispose() }
    if ($fnValue.entryId -ne 'ETE_FN_STARTUP_RECEIPT_V1' -or $fnValue.runId -ne $fnRunId -or
        $fnValue.sourceSha -ne $ExpectedMainSha256 -or $fnValue.pid -ne $fnProcess.Id -or $fnValue.electronVersion -ne '44.4.2' -or
        $fnValue.sequence -lt 1 -or $fnValue.stage -notin @('ENTRY', 'APP_CODE_STARTED', 'APP_READY', 'PANEL_READY') -or
        $fnValue.status -notin @('ENTERED', 'STARTING', 'READY', 'FAILED', 'CLOSED', 'EARLY_EXIT') -or
        $fnValue.readyReached -isnot [bool] -or $fnValue.exitObserved -isnot [bool] -or
        ($null -ne $fnValue.errorCode -and $fnValue.errorCode -notin @('PROFILE_APPLICATION_IN_USE', 'PROFILE_STORAGE_INVALID',
            'PROFILE_ROOT_INVALID', 'PROFILE_REGISTRY_BUSY', 'PROFILE_IN_USE', 'INVALID_PROFILE', 'PROFILE_TOO_LARGE',
            'FN_PROTOTYPE_DISABLED', 'MISSING_DEPENDENCY', 'SYNTAXERROR', 'TYPEERROR', 'REFERENCEERROR', 'STARTUP_FAILED'))) { throw 'STARTUP_RECEIPT_INVALID' }
    $fnRecord.entryBound = $true; $fnRecord.receiptStatus = $fnValue.status; $fnRecord.stage = $fnValue.stage
    $fnRecord.readyReached = $fnValue.readyReached; $fnRecord.exitObserved = $fnValue.exitObserved; $fnRecord.errorCode = $fnValue.errorCode
}
$fnProcess = $null
try {
    $fnArguments = @(('"' + $fnMain + '"'), '--fn-connect-prototype', '--remember-login', '--single-external-header-check',
        '--profile-config', ('"' + $PrivateConfigPath + '"'), '--startup-receipt-root', ('"' + $fnRoot + '"'))
    $fnProcess = Start-Process -FilePath $ElectronPath -ArgumentList $fnArguments -PassThru
    $null = $fnProcess.Handle; $fnRecord.processId = $fnProcess.Id
    $fnDeadline = [DateTime]::UtcNow.AddSeconds(60)
    while ([DateTime]::UtcNow -lt $fnDeadline) {
        $fnProcess.Refresh()
        if (Test-Path -LiteralPath $fnReceipt) { Read-FnStartupReceipt }
        if ($fnProcess.HasExited) { $fnRecord.result = 'PROCESS_EXITED'; break }
        if ($fnRecord.receiptStatus -eq 'FAILED') { $fnRecord.result = 'STARTUP_FAILED'; break }
        if ($fnRecord.receiptStatus -eq 'READY') { $fnRecord.result = 'READY_WITH_PROCESS_ALIVE'; break }
        Start-Sleep -Milliseconds 250
    }
    if ($fnRecord.result -eq 'WAITING') { $fnRecord.result = 'STARTUP_UNCONFIRMED' }
} catch { $fnRecord.result = 'START_OR_OBSERVE_FAILED' }
finally {
    if ($null -ne $fnProcess) {
        $fnReadFailed = $false
        if (Test-Path -LiteralPath $fnReceipt) {
            try { Read-FnStartupReceipt } catch { $fnRecord.entryBound = $false; $fnReadFailed = $true }
        } else { $fnRecord.entryBound = $false }
        try {
            $fnProcess.Refresh()
            if ($fnProcess.HasExited) { $fnRecord.processState = 'EXITED'; $fnRecord.exitCode = $fnProcess.ExitCode }
            else { $fnRecord.processState = 'ALIVE_AT_OBSERVATION' }
        } catch { $fnRecord.processState = 'UNKNOWN' }
        if ($fnRecord.processState -eq 'UNKNOWN') { $fnRecord.result = 'PROCESS_OBSERVATION_UNAVAILABLE' }
        elseif ($fnReadFailed) { $fnRecord.result = 'RECEIPT_READ_OR_BIND_FAILED' }
        elseif ($fnRecord.processState -eq 'EXITED') { $fnRecord.result = 'PROCESS_EXITED' }
        elseif (-not $fnRecord.entryBound) { $fnRecord.result = 'STARTUP_UNCONFIRMED' }
        elseif ($fnRecord.receiptStatus -eq 'FAILED') { $fnRecord.result = 'STARTUP_FAILED' }
        elseif ($fnRecord.receiptStatus -eq 'READY' -and $fnRecord.stage -eq 'PANEL_READY' -and
            $fnRecord.readyReached -and -not $fnRecord.exitObserved) { $fnRecord.result = 'READY_WITH_PROCESS_ALIVE' }
        else { $fnRecord.result = 'STARTUP_UNCONFIRMED' }
    }
    $fnJson = ($fnRecord | ConvertTo-Json -Compress) + "`n"
    $fnOutput = [IO.File]::Open(($fnRoot + '.launch.json'), [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
    try { $fnBytes = [Text.UTF8Encoding]::new($false).GetBytes($fnJson); $fnOutput.Write($fnBytes, 0, $fnBytes.Length) } finally { $fnOutput.Dispose() }
}
# File receipts are authoritative; this optional fixed summary is for convenience.
Write-Output $fnJson
