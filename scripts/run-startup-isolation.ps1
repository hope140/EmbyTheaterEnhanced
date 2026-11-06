# Exactly one offline contrast per invocation. No config or real profile input.
param(
    [Parameter(Mandatory = $true)][string]$SourceDirectory,
    [Parameter(Mandatory = $true)][string]$ElectronPath,
    [Parameter(Mandatory = $true)][string]$DiagnosticBaseDirectory,
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedEntrySha256,
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedElectronSha256,
    [Parameter(Mandatory = $true)][ValidateSet('version','entry','imports','panel-memory','panel-disk')][string]$Case,
    [switch]$PriorAttemptResolved
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$Case = $Case.ToLowerInvariant()
if (-not $PriorAttemptResolved) { throw 'PRIOR_ATTEMPT_UNRESOLVED' }
$entry = Join-Path $SourceDirectory 'startup-isolation.cjs'
foreach ($item in @($entry, $ElectronPath, $DiagnosticBaseDirectory)) {
    if ($item -match '^[\\/]{2}|["\r\n]' -or -not [IO.Path]::IsPathRooted($item) -or
        -not [IO.Path]::GetFullPath($item).Equals($item, [StringComparison]::OrdinalIgnoreCase) -or
        -not (Test-Path -LiteralPath $item)) { throw 'ISOLATION_INPUT_INVALID' }
}
if (-not (Test-Path -LiteralPath $entry -PathType Leaf) -or -not (Test-Path -LiteralPath $ElectronPath -PathType Leaf) -or
    -not (Test-Path -LiteralPath $DiagnosticBaseDirectory -PathType Container)) { throw 'ISOLATION_INPUT_INVALID' }
$ancestor = Get-Item -LiteralPath $DiagnosticBaseDirectory
while ($null -ne $ancestor) {
    if ($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'ISOLATION_BASE_INVALID' }
    $ancestor = $ancestor.Parent
}
if (-not $env:LOCALAPPDATA) { throw 'ISOLATION_PROFILE_BOUNDARY_UNKNOWN' }
$profile = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'EmbyTheaterEnhanced-FN-Prototype'))
if ($DiagnosticBaseDirectory.Equals($profile, [StringComparison]::OrdinalIgnoreCase) -or
    $DiagnosticBaseDirectory.StartsWith($profile + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'ISOLATION_BASE_INVALID' }
if ((Get-FileHash -LiteralPath $entry -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ExpectedEntrySha256 -or
    (Get-FileHash -LiteralPath $ElectronPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ExpectedElectronSha256) { throw 'ISOLATION_HASH_MISMATCH' }
$run = [Guid]::NewGuid().ToString('N')
$root = Join-Path $DiagnosticBaseDirectory ('ete-fn-isolate-' + $run)
New-Item -ItemType Directory -Path $root -ErrorAction Stop | Out-Null
$utf8 = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText((Join-Path $root '.isolation-owner'), "ETE_FN_ISOLATION_V1`n", $utf8)
$receipt = Join-Path $root 'fixture.json'
$record = [ordered]@{entryId = 'ETE_FN_ISOLATION_LAUNCH_V1'; runId = $run; mode = $Case;
    entrySha = $ExpectedEntrySha256; electronSha = $ExpectedElectronSha256; pid = $null; result = 'NOT_STARTED';
    processState = 'NOT_STARTED'; exitCode = $null; entryBound = $false; stage = 'NONE'; fixtureResult = 'UNKNOWN';
    quitObserved = $false; exitObserved = $false; errorCode = $null; failureStage = $null; blockedRequests = $null; versionMatched = $false;
    runAsNodePresent = (Test-Path Env:ELECTRON_RUN_AS_NODE); nodeOptionsPresent = (Test-Path Env:NODE_OPTIONS)}
$owned = $null
function Read-IsolationReceipt {
    $stream = [IO.File]::Open($receipt, [IO.FileMode]::Open, [IO.FileAccess]::Read, ([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    try {
        if ($stream.Length -gt 4096) { throw 'ISOLATION_RECEIPT_INVALID' }
        $reader = [IO.StreamReader]::new($stream)
        try { $value = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
    } finally { $stream.Dispose() }
    $stages = @('ENTRY','ELECTRON_IMPORTED','CONTROL_READY','APP_READY','NETWORK_GATE_READY','IMPORTS_STARTED','IMPORTS_READY',
        'SESSION_CREATE_STARTED','SESSION_READY','WINDOW_CREATE_STARTED','WINDOW_CREATED','PANEL_READY','DONE')
    if ($value.entryId -cne 'ETE_FN_ISOLATION_V1' -or $value.runId -cne $run -or $value.mode -cne $Case -or
        $value.sourceSha -cne $ExpectedEntrySha256 -or $value.pid -ne $owned.Id -or $value.electronVersion -cne '44.4.2' -or
        $value.stage -notin $stages -or
        ($null -ne $value.failureStage -and $value.failureStage -notin ($stages + 'CLEANUP')) -or
        $value.result -notin @('PENDING','PASSED','FAILED') -or $value.sequence -lt 1 -or
        $value.quitObserved -isnot [bool] -or $value.exitObserved -isnot [bool] -or
        ($value.blockedRequests -isnot [long] -and $value.blockedRequests -isnot [int]) -or
        $value.blockedRequests -lt 0 -or $value.blockedRequests -gt 32 -or
        ($null -ne $value.errorCode -and $value.errorCode -notin @('UNCAUGHT_EXCEPTION','EARLY_EXIT','FIXTURE_TIMEOUT','CLEANUP_FAILED','RENDER_PROCESS_GONE','FIXTURE_STEP_FAILED'))) { throw 'ISOLATION_RECEIPT_INVALID' }
    $record.entryBound = $true; $record.stage = $value.stage; $record.fixtureResult = $value.result
    $record.quitObserved = $value.quitObserved; $record.exitObserved = $value.exitObserved
    $record.errorCode = $value.errorCode; $record.failureStage = $value.failureStage; $record.blockedRequests = $value.blockedRequests
}
try {
    $launch = @{FilePath = $ElectronPath; WorkingDirectory = $SourceDirectory; PassThru = $true}
    if ($Case -eq 'version') { $launch.ArgumentList = @('--version'); $launch.RedirectStandardOutput = Join-Path $root 'version-output.txt' }
    else { $launch.ArgumentList = @(('"' + $entry + '"'), '--isolation-case', $Case, '--isolation-root', ('"' + $root + '"')) }
    $owned = Start-Process @launch
    $null = $owned.Handle; $record.pid = $owned.Id
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    do {
        $owned.Refresh()
        if ($owned.HasExited) { break }
        Start-Sleep -Milliseconds 250
    } while ([DateTime]::UtcNow -lt $deadline)
    $record.result = 'OBSERVED'
} catch { $record.result = 'LAUNCH_OR_OBSERVATION_FAILED' }
finally {
    if ($null -ne $owned) {
        $readFailed = $false
        if ($Case -ne 'version' -and (Test-Path -LiteralPath $receipt)) { try { Read-IsolationReceipt } catch { $readFailed = $true; $record.entryBound = $false } }
        try {
            $owned.Refresh()
            if ($owned.HasExited) { $record.processState = 'EXITED'; $record.exitCode = $owned.ExitCode }
            else { $record.processState = 'ALIVE_AT_OBSERVATION' }
        } catch { $record.processState = 'UNKNOWN' }
        if ($record.processState -ne 'EXITED') { $record.result = 'PROCESS_UNRESOLVED_STOP' }
        elseif ($record.exitCode -ne 0) { $record.result = 'PROCESS_EXIT_FAILED' }
        elseif ($Case -eq 'version') {
            $outFile = Join-Path $root 'version-output.txt'
            if ((Test-Path -LiteralPath $outFile) -and (Get-Item -LiteralPath $outFile).Length -le 128) {
                $record.versionMatched = [IO.File]::ReadAllText($outFile).Trim() -ceq 'v44.4.2'
            }
            $record.result = if ($record.versionMatched) { 'VERSION_PASSED' } else { 'VERSION_OUTPUT_UNCONFIRMED' }
        } elseif ($readFailed) { $record.result = 'RECEIPT_INVALID' }
        elseif (-not $record.entryBound) { $record.result = 'ENTRY_UNCONFIRMED' }
        elseif ($record.fixtureResult -eq 'PASSED' -and $record.stage -eq 'DONE' -and $record.quitObserved -and $record.exitObserved) { $record.result = 'FIXTURE_PASSED' }
        else { $record.result = 'FIXTURE_NOT_PASSED' }
    }
    $json = ($record | ConvertTo-Json -Compress) + "`n"
    $output = [IO.File]::Open(($root + '.launch.json'), [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
    try { $bytes = $utf8.GetBytes($json); $output.Write($bytes, 0, $bytes.Length) } finally { $output.Dispose() }
}
# Raw stdout, paths, environment values and exception messages are never printed.
Write-Output $json
