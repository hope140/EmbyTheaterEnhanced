# Test-runner supervision only; no product or authentication settings.
$FnPreparationBudgetMs = 900000
$FnPreparationStages = @('SOURCE_CHECK','MANIFEST_CHECK','CACHE_COPY','DOWNLOAD','ARCHIVE_VERIFY','EXTRACT','EXE_VERIFY','SOURCE_RECHECK','PREPARED','FAILED')
function Write-FnAtomicJson($Path, $Value, [switch]$Exclusive) {
    $bytes = [Text.Encoding]::UTF8.GetBytes(($Value | ConvertTo-Json -Depth 8 -Compress) + "`n")
    $temporary = $Path + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
    try {
        [IO.File]::WriteAllBytes($temporary, $bytes)
        [IO.File]::Move($temporary, $Path, -not $Exclusive.IsPresent)
    } finally { if ([IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) } }
}
function Read-FnPreparationProgress([string]$Path) {
    # Allow atomic replacement while reading the old snapshot on Windows.
    $share = [IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete
    $stream = [IO.FileStream]::new($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, $share)
    try {
        if ($stream.Length -gt 4096) { throw 'INVALID' }
        $reader = [IO.StreamReader]::new($stream, [Text.UTF8Encoding]::new($false, $true))
        try { return ($reader.ReadToEnd() | ConvertFrom-Json) } finally { $reader.Dispose() }
    } finally { $stream.Dispose() }
}
function Get-FnArchiveStamp([string]$Path) {
    $attributes = [IO.File]::GetAttributes($Path)
    if ($attributes -band ([IO.FileAttributes]::ReparsePoint -bor [IO.FileAttributes]::Directory)) { throw 'CACHE_INVALID' }
    $info = [IO.FileInfo]::new($Path); $info.Refresh()
    if (-not $info.Exists) { throw 'CACHE_INVALID' }
    return @{length=$info.Length; created=$info.CreationTimeUtc.Ticks; written=$info.LastWriteTimeUtc.Ticks}
}
function Get-FnCacheDriveType([string]$Root) { return [IO.DriveInfo]::new($Root).DriveType }
function Get-FnCacheDirectoryAttributes([string]$Path) { return [IO.File]::GetAttributes($Path) }
function Copy-FnLockedArchive([string]$ArchiveRoot, [string]$Destination, [long]$ExpectedSize, [string]$ExpectedSha256) {
    # The caller pins the original ZIP contract. There is no executable-tree or
    # arbitrary filename/URL input, and no network fallback from this function.
    if (-not [IO.Path]::IsPathFullyQualified($ArchiveRoot) -or $ArchiveRoot.StartsWith('\\') -or
        $ArchiveRoot.StartsWith('//') -or $ArchiveRoot -match '[\r\n]') { throw 'CACHE_INVALID' }
    $root = [IO.Path]::GetFullPath($ArchiveRoot)
    $driveRoot = [IO.Path]::GetPathRoot($root)
    if ((Get-FnCacheDriveType $driveRoot) -ne [IO.DriveType]::Fixed) { throw 'CACHE_INVALID' }
    # Root-first: never query a child until its parent has passed the local
    # directory/reparse gate. A mapped drive is rejected before any path probe.
    $current = $driveRoot
    $segments = @('') + @($root.Substring($driveRoot.Length).Split([char[]]@([IO.Path]::DirectorySeparatorChar,[IO.Path]::AltDirectorySeparatorChar), [StringSplitOptions]::RemoveEmptyEntries))
    foreach ($segment in $segments) {
        if ($segment) { $current = Join-Path $current $segment }
        $attributes = Get-FnCacheDirectoryAttributes $current
        if (-not ($attributes -band [IO.FileAttributes]::Directory) -or ($attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'CACHE_INVALID' }
    }
    $sourcePath = Join-Path $root 'electron-v44.5.0-win32-x64.zip'
    $before = Get-FnArchiveStamp $sourcePath
    if ($before.length -ne $ExpectedSize) { throw 'CACHE_INVALID' }
    $source = $null; $target = $null; $algorithm = [Security.Cryptography.SHA256]::Create()
    try {
        # Windows denies existing readers/writers and replacement while held.
        $source = [IO.FileStream]::new($sourcePath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None)
        if ($source.Length -ne $ExpectedSize) { throw 'CACHE_CHANGED' }
        $hash = [Convert]::ToHexString($algorithm.ComputeHash($source)).ToLowerInvariant()
        if ($hash -cne $ExpectedSha256) { throw 'CACHE_INVALID' }
        $source.Position = 0
        $target = [IO.FileStream]::new($Destination, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
        $source.CopyTo($target); $target.Flush($true); $target.Position = 0
        $copiedHash = [Convert]::ToHexString($algorithm.ComputeHash($target)).ToLowerInvariant()
        $after = Get-FnArchiveStamp $sourcePath
        if ($source.Length -ne $ExpectedSize -or $target.Length -ne $ExpectedSize -or $copiedHash -cne $ExpectedSha256 -or
            $before.length -ne $after.length -or $before.created -ne $after.created -or $before.written -ne $after.written) { throw 'CACHE_CHANGED' }
    } finally {
        if ($target) { $target.Dispose() }; if ($source) { $source.Dispose() }; $algorithm.Dispose()
    }
}
function Write-FnRunnerFailure($ResultPath, $Outcome) {
    # Written before any recursive cleanup; never replace an existing result.
    Write-FnAtomicJson $ResultPath ([ordered]@{
        schemaVersion=1; test='fn-connect-electron-loopback'; sourceCommit=$Outcome.sourceCommit; runId=$Outcome.runId; bindingVerified=$false
        result='FAILED'; reason=$Outcome.reason; launchState=$Outcome.reason
        preparation=[ordered]@{runId=$Outcome.runId; stage=$Outcome.stage; elapsedMs=$Outcome.elapsedMs; processExited=$Outcome.processExited}
        processExited=$Outcome.processExited; temporaryProfileRemoved=$false
        realFNConnect='NOT_TESTED'; nativeHelperPlayback='NOT_TESTED'; hlsDash='NOT_SUPPORTED'
    }) -Exclusive
}
function Fail-FnRunnerReport([string]$ResultPath, [string]$StatusPath, [string]$RunId, [string]$SourceCommit,
    [long]$ElapsedMs, [bool]$ProcessExited, [bool]$ProfileRemoved) {
    # Use exactly the Node finalizer's one-shot ownership protocol. A reporter
    # that already claimed the output (even if interrupted) is never replaced.
    if ($RunId -cnotmatch '^[a-f0-9]{32}$' -or $SourceCommit -cnotmatch '^[a-f0-9]{40}$') { return $false }
    try {
        $current = Read-FnPreparationProgress $StatusPath
        if ($current.schemaVersion -ne 1 -or $current.runId -cne $RunId -or $current.sourceCommit -cne $SourceCommit -or
            $current.terminal -isnot [bool] -or $current.terminal -ne $false -or $current.stage -cne 'ELECTRON_START') { return $false }
        Write-FnAtomicJson ($StatusPath + '.final-owner') ([ordered]@{runId=$RunId;sourceCommit=$SourceCommit}) -Exclusive
    } catch { return $false }
    $written = $false
    try {
        Write-FnAtomicJson $ResultPath ([ordered]@{schemaVersion=1;test='fn-connect-electron-loopback';runId=$RunId;sourceCommit=$SourceCommit;
            bindingVerified=$false;result='FAILED';reason='REPORT_FAILED';processExited=$ProcessExited;temporaryProfileRemoved=$ProfileRemoved;
            realFNConnect='NOT_TESTED';nativeHelperPlayback='NOT_TESTED';hlsDash='NOT_SUPPORTED'}) -Exclusive
        $written = $true
    } catch {} # Failure status must not depend on a writable result target.
    try {
        $latest = Read-FnPreparationProgress $StatusPath
        if ($latest.runId -cne $RunId -or $latest.sourceCommit -cne $SourceCommit -or $latest.terminal -ne $false) { return $false }
        Write-FnAtomicJson $StatusPath ([ordered]@{schemaVersion=1;runId=$RunId;sourceCommit=$SourceCommit;stage='FINISHED';
            elapsedMs=[Math]::Max(0,$ElapsedMs);terminal=$true;result='FAILED';reason='REPORT_FAILED';receiptWritten=$written;
            bindingVerified=$false;processExited=$ProcessExited;temporaryProfileRemoved=$ProfileRemoved})
        return $true
    } catch { return $false }
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
                $progress = Read-FnPreparationProgress $ProgressPath
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
