[CmdletBinding()]
param(
    [string]$OutputRoot = (Get-Location).Path,
    [string]$LogRoot,
    [string]$InstallRoot,
    [DateTimeOffset]$CaptureTime = [DateTimeOffset]::Now,
    [ValidateRange(1, 120)][int]$LookbackMinutes = 20,
    [string]$ProblemTime,
    [ValidateRange(1, 30)][int]$ProblemWindowMinutes = 5,
    [ValidateRange(1, 20000)][int]$MaxLogLines = 5000,
    [string]$IssueCorrelationId,
    [switch]$NoZip,
    [switch]$SkipWindowsEvents
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$script:ToolName = 'ETE Sanitized Diagnostic Bundle Collector'
$script:ToolVersion = '1.0.0'
$script:SchemaVersion = 1
$script:CollectionWarnings = New-Object System.Collections.Generic.List[string]

function Add-CollectionWarning {
    param([string]$Code)
    if ($Code -and -not $script:CollectionWarnings.Contains($Code)) {
        $script:CollectionWarnings.Add($Code)
    }
}
function Resolve-CaptureWindow {
    $end = $CaptureTime.ToUniversalTime()
    if ($ProblemTime) {
        $problem = [DateTimeOffset]::MinValue
        if (-not [DateTimeOffset]::TryParse($ProblemTime, [ref]$problem)) { throw 'ProblemTime must be an ISO-8601 timestamp.' }
        $problem = $problem.ToUniversalTime()
        return [ordered]@{ mode = 'problem-time'; start = $problem.AddMinutes(-$ProblemWindowMinutes); end = $problem.AddMinutes($ProblemWindowMinutes) }
    }
    return [ordered]@{ mode = 'recent'; start = $end.AddMinutes(-$LookbackMinutes); end = $end.AddMinutes(1) }
}

function Resolve-LogDirectory {
    if ($LogRoot) {
        $candidate = [IO.Path]::GetFullPath($LogRoot)
        if ((Split-Path -Leaf $candidate) -ieq 'logs') { return $candidate }
        $nested = Join-Path $candidate 'logs'
        if (Test-Path -LiteralPath $nested -PathType Container) { return $nested }
        return $candidate
    }
    $appData = [Environment]::GetFolderPath('ApplicationData')
    return Join-Path $appData 'EmbyTheaterEnhanced\logs'
}

function Read-BoundedClientLog {
    param([string]$Directory, [System.Collections.IDictionary]$Window)
    $records = New-Object System.Collections.Generic.List[object]
    $malformed = 0
    $outside = 0
    $filesRead = 0
    $base = Join-Path $Directory 'ete-client.jsonl'
    $files = @($base + '.3'; $base + '.2'; $base + '.1'; $base)
    foreach ($file in $files) {
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { continue }
        $filesRead++
        try { $lines = @(Get-Content -LiteralPath $file -Encoding UTF8 -Tail $MaxLogLines -ErrorAction Stop) }
        catch { Add-CollectionWarning 'client_log_read_failed'; continue }
        foreach ($line in $lines) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            try { $record = $line | ConvertFrom-Json -ErrorAction Stop }
            catch { $malformed++; continue }
            $stamp = [DateTimeOffset]::MinValue
            if (-not $record.PSObject.Properties['timestamp'] -or -not [DateTimeOffset]::TryParse([string]$record.timestamp, [ref]$stamp)) { $malformed++; continue }
            $stamp = $stamp.ToUniversalTime()
            if ($stamp -lt $Window.start -or $stamp -gt $Window.end) { $outside++; continue }
            $records.Add($record)
        }
    }
    if ($filesRead -eq 0) { Add-CollectionWarning 'client_log_not_found' }
    if ($malformed -gt 0) { Add-CollectionWarning 'client_log_malformed_lines_omitted' }
    $orderedRecords = @($records | Sort-Object { ([DateTimeOffset]::Parse([string]$_.timestamp)).UtcDateTime.Ticks })
    if (@($orderedRecords).Count -gt $MaxLogLines) { $orderedRecords = @($orderedRecords | Select-Object -Last $MaxLogLines); Add-CollectionWarning 'client_log_line_limit_applied' }
    return [ordered]@{ records = $orderedRecords; filesRead = $filesRead; malformedLinesOmitted = $malformed; outsideWindowOmitted = $outside }
}

function Get-FieldValue {
    param([AllowNull()][object]$Object, [string]$Name)
    if ($null -eq $Object) { return $null }
    if ($Object -is [System.Collections.IDictionary]) {
        foreach ($key in $Object.Keys) { if ([string]$key -ieq $Name) { return $Object[$key] } }
        return $null
    }
    $property = $Object.PSObject.Properties | Where-Object { $_.Name -ieq $Name } | Select-Object -First 1
    if ($property) { return $property.Value }
    return $null
}

function Find-LastRecord {
    param([object[]]$Records, [string]$Category, [string[]]$Events)
    $eventNames = @($Events)
    return @($Records | Where-Object {
        (Get-FieldValue $_ 'category') -eq $Category -and (($eventNames.Count -eq 0) -or $eventNames -contains (Get-FieldValue $_ 'event'))
    } | Select-Object -Last 1)[0]
}

function Get-Details {
    param([AllowNull()][object]$Record)
    $details = Get-FieldValue $Record 'details'
    if ($null -eq $details) { return [ordered]@{} }
    return $details
}

function Find-InstallRoot {
    param([object[]]$Processes)
    if ($InstallRoot) {
        $resolved = [IO.Path]::GetFullPath($InstallRoot)
        if (Test-Path -LiteralPath $resolved -PathType Container) { return $resolved }
        Add-CollectionWarning 'install_root_not_found'
    }
    $appProcess = @($Processes | Where-Object { $_.Name -ieq 'Emby.Theater.exe' -and $_.ExecutablePath } | Select-Object -First 1)
    if (@($appProcess).Count) { return Split-Path -Parent ([string]$appProcess[0].ExecutablePath) }
    $registryKeys = @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{868314CE-1253-46A3-A4EA-55CDE71BCF0A}_is1',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\{868314CE-1253-46A3-A4EA-55CDE71BCF0A}_is1',
        'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{868314CE-1253-46A3-A4EA-55CDE71BCF0A}_is1'
    )
    foreach ($key in $registryKeys) {
        try {
            $location = [string](Get-ItemProperty -LiteralPath $key -ErrorAction Stop).InstallLocation
            if ($location -and (Test-Path -LiteralPath $location -PathType Container)) { return [IO.Path]::GetFullPath($location) }
        } catch { }
    }
    $programFiles = [Environment]::GetFolderPath('ProgramFiles')
    $standard = Join-Path $programFiles 'Emby Theater Enhanced'
    if (Test-Path -LiteralPath $standard -PathType Container) { return $standard }
    Add-CollectionWarning 'installed_runtime_not_found'
    return $null
}

function Get-ProcessSnapshot {
    $all = @()
    try { $all = @(Get-CimInstance Win32_Process -ErrorAction Stop) }
    catch { Add-CollectionWarning 'process_inventory_unavailable'; return [ordered]@{ raw = @(); safe = [ordered]@{ status = 'UNAVAILABLE'; appPids = @(); electronPids = @(); nativeHelperPids = @(); helperProcessCount = 0; residualProcessStatus = 'UNKNOWN' } } }
    $roots = @($all | Where-Object { $_.Name -ieq 'Emby.Theater.exe' })
    $ownedIds = New-Object 'System.Collections.Generic.HashSet[int]'
    foreach ($root in $roots) { [void]$ownedIds.Add([int]$root.ProcessId) }
    $changed = $true
    while ($changed) {
        $changed = $false
        foreach ($process in $all) {
            if ($ownedIds.Contains([int]$process.ParentProcessId) -and -not $ownedIds.Contains([int]$process.ProcessId)) {
                [void]$ownedIds.Add([int]$process.ProcessId); $changed = $true
            }
        }
    }
    $owned = @($all | Where-Object { $ownedIds.Contains([int]$_.ProcessId) })
    $allHelpers = @($all | Where-Object { $_.Name -ieq 'ete-mpv-helper.exe' })
    $ownedHelpers = @($owned | Where-Object { $_.Name -ieq 'ete-mpv-helper.exe' })
    $unownedHelpers = @($allHelpers | Where-Object { -not $ownedIds.Contains([int]$_.ProcessId) })
    $safeEntries = @($owned | Where-Object { $_.Name -in @('Emby.Theater.exe', 'electron.exe', 'ete-mpv-helper.exe') } | ForEach-Object {
        [ordered]@{ name = $_.Name; pid = [int]$_.ProcessId; parentPid = [int]$_.ParentProcessId; startedAt = if ($_.CreationDate) { ([DateTimeOffset]$_.CreationDate).ToUniversalTime().ToString('o') } else { $null } }
    })
    $safe = [ordered]@{
        status = 'OK'
        processes = $safeEntries
        appPids = @($roots | ForEach-Object { [int]$_.ProcessId })
        electronPids = @($owned | Where-Object { $_.Name -ieq 'electron.exe' } | ForEach-Object { [int]$_.ProcessId })
        nativeHelperPids = @($ownedHelpers | ForEach-Object { [int]$_.ProcessId })
        helperProcessCount = @($ownedHelpers).Count
        unownedHelperProcessCount = @($unownedHelpers).Count
        residualProcessStatus = if (@($roots).Count -eq 0 -and @($unownedHelpers).Count -gt 0) { 'HELPER_WITHOUT_APP' } elseif (@($unownedHelpers).Count -gt 0) { 'UNOWNED_HELPER_OBSERVED' } elseif (@($roots).Count -gt 0) { 'APP_RUNNING' } else { 'NONE_OBSERVED' }
    }
    return [ordered]@{ raw = $all; safe = $safe }
}

function Read-JsonIfPresent {
    param([string[]]$Candidates)
    foreach ($candidate in $Candidates) {
        if (-not $candidate -or -not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
        try { return (Get-Content -LiteralPath $candidate -Raw -Encoding UTF8 | ConvertFrom-Json -ErrorAction Stop) }
        catch { Add-CollectionWarning 'product_metadata_invalid' }
    }
    return $null
}

function Get-ProductSnapshot {
    param([string]$RuntimeRoot, [object[]]$Records)
    $appStart = Find-LastRecord $Records 'app' @('start')
    $startDetails = Get-Details $appStart
    $helperReady = Find-LastRecord $Records 'native-helper' @('helper-ready')
    $helperDetails = Get-Details $helperReady
    $package = $null; $provenance = $null; $build = $null
    if ($RuntimeRoot) {
        $package = Read-JsonIfPresent @((Join-Path $RuntimeRoot 'electronapp\package.json'), (Join-Path $RuntimeRoot 'package.json'))
        $provenance = Read-JsonIfPresent @((Join-Path $RuntimeRoot 'runtime-provenance.json'), (Join-Path $RuntimeRoot 'electronapp\runtime-provenance.json'))
        $build = Read-JsonIfPresent @((Join-Path $RuntimeRoot 'build-manifest.json'))
    }
    $repoRoot = Split-Path -Parent $PSScriptRoot
    if (-not $package) { $package = Read-JsonIfPresent @((Join-Path $repoRoot 'package.json')) }
    $appVersion = Get-FieldValue $startDetails 'appVersion'
    if (-not $appVersion) { $appVersion = Get-FieldValue $package 'version' }
    $sourceCommit = Get-FieldValue $startDetails 'buildCommit'
    if (-not $sourceCommit -or $sourceCommit -eq 'UNKNOWN') { $sourceCommit = Get-FieldValue $provenance 'sourceCommit' }
    if (-not $sourceCommit) { $sourceCommit = Get-FieldValue $build 'sourceCommit' }
    $helperPresent = if ($RuntimeRoot) { Test-Path -LiteralPath (Join-Path $RuntimeRoot 'electronapp\native-helper\ete-mpv-helper.exe') -PathType Leaf } else { $false }
    $pepperPresent = if ($RuntimeRoot) { Test-Path -LiteralPath (Join-Path $RuntimeRoot 'electronapp\libmpv\x64\mpv-win32-x64.node') -PathType Leaf } else { $false }
    $bridgeMode = if ($helperReady) { 'native-helper' } elseif ($helperPresent -and -not $pepperPresent) { 'native-helper-artifacts-only' } else { 'UNKNOWN' }
    $windows = [ordered]@{ platform = [Environment]::OSVersion.Platform.ToString(); version = [Environment]::OSVersion.Version.ToString() }
    try {
        $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
        $windows = [ordered]@{ platform = 'Windows'; version = [string]$os.Version; build = [string]$os.BuildNumber }
    } catch { Add-CollectionWarning 'windows_version_detail_unavailable' }
    return [ordered]@{
        status = 'OK'
        appVersion = if ($appVersion) { [string]$appVersion } else { 'UNKNOWN' }
        sourceCommit = if ($sourceCommit -and [string]$sourceCommit -match '^[0-9a-fA-F]{40}$') { ([string]$sourceCommit).ToLowerInvariant() } else { 'UNKNOWN' }
        runtimeProvenance = [ordered]@{
            present = ($null -ne $provenance)
            buildManifestPresent = ($null -ne $build)
            sourceCommitPresent = ($null -ne (Get-FieldValue $provenance 'sourceCommit'))
        }
        bridgeMode = $bridgeMode
        bridgeArtifacts = [ordered]@{ nativeHelperPresent = $helperPresent; legacyPepperPresent = $pepperPresent }
        nativeHelper = [ordered]@{
            protocolVersion = Get-FieldValue $helperDetails 'protocolVersion'
            helperVersion = Get-FieldValue $helperDetails 'helperVersion'
            libmpvVersion = Get-FieldValue $helperDetails 'libmpvVersion'
        }
        electronVersion = if (Get-FieldValue $startDetails 'electron') { Get-FieldValue $startDetails 'electron' } else { 'UNKNOWN' }
        chromiumVersion = if (Get-FieldValue $startDetails 'chromium') { Get-FieldValue $startDetails 'chromium' } else { 'UNKNOWN' }
        nodeVersion = if (Get-FieldValue $startDetails 'node') { Get-FieldValue $startDetails 'node' } else { 'UNKNOWN' }
        windows = $windows
    }
}

function Get-PlaybackSnapshot {
    param([object[]]$Records)
    $play = Find-LastRecord $Records 'playback' @('play-request')
    $route = Find-LastRecord $Records 'resolver' @('route-selected')
    $resolver = Find-LastRecord $Records 'playback' @('resolver-complete')
    $core = Find-LastRecord $Records 'playback' @('core-playing')
    $events = @($Records | Where-Object { (Get-FieldValue $_ 'category') -eq 'playback' } | Select-Object -Last 64)
    $routeDetails = Get-Details $route
    $playDetails = Get-Details $play
    $coreDetails = Get-Details $core
    return [ordered]@{
        status = if ($route -or $play -or $core) { 'OBSERVED' } else { 'UNAVAILABLE' }
        lastPlayRequest = $play
        route = Get-FieldValue $routeDetails 'route'
        reason = Get-FieldValue $routeDetails 'reason'
        sourceKind = Get-FieldValue $routeDetails 'sourceKind'
        resolverResult = $resolver
        currentPlayer = if (Get-FieldValue $playDetails 'currentPlayer') { Get-FieldValue $playDetails 'currentPlayer' } else { 'UNAVAILABLE' }
        corePlaying = [bool]($null -ne $core)
        generationId = if (Get-FieldValue $coreDetails 'generationId') { Get-FieldValue $coreDetails 'generationId' } elseif (Get-FieldValue $playDetails 'generationId') { Get-FieldValue $playDetails 'generationId' } else { $null }
        recentEvents = $events
    }
}

function Get-Cd2Snapshot {
    param([object[]]$Records)
    $events = @($Records | Where-Object { (Get-FieldValue $_ 'category') -eq 'cd2' } | Select-Object -Last 96)
    $latest = @($events | Select-Object -Last 1)
    $details = if (@($latest).Count) { Get-Details $latest[0] } else { [ordered]@{} }
    return [ordered]@{
        status = if (@($events).Count) { 'OBSERVED' } else { 'UNAVAILABLE' }
        latestRule = Get-FieldValue $details 'ruleId'
        findFile = @($events | Where-Object { (Get-FieldValue $_ 'event') -match '^find-file-' } | Select-Object -Last 8)
        downloadUrl = @($events | Where-Object { (Get-FieldValue $_ 'event') -match '^download-url-' } | Select-Object -Last 8)
        directUrl = @($events | Where-Object { (Get-FieldValue (Get-Details $_) 'sourceKind') -eq 'direct-url' -or (Get-FieldValue (Get-Details $_) 'reason') -match 'direct' } | Select-Object -Last 8)
        cd2Reason = Get-FieldValue $details 'reason'
        requestDurationMs = Get-FieldValue $details 'elapsedMs'
        recentEvents = $events
    }
}

function Get-SessionSnapshot {
    param([object[]]$Records)
    $events = @($Records | Where-Object { (Get-FieldValue $_ 'category') -in @('session', 'websocket', 'report') } | Select-Object -Last 64)
    if (-not @($events).Count) {
        Add-CollectionWarning 'session_websocket_observability_unavailable_in_v0_2_0_client_log'
        return [ordered]@{ status = 'UNAVAILABLE'; ownSessionPresent = 'UNAVAILABLE'; supportsRemoteControl = 'UNAVAILABLE'; nowPlayingPresent = 'UNAVAILABLE'; webSocketState = 'UNAVAILABLE'; reportStart = 'UNAVAILABLE'; reportProgress = 'UNAVAILABLE'; reportStop = 'UNAVAILABLE'; recentEvents = @() }
    }
    $latest = $events[-1]
    $details = Get-Details $latest
    return [ordered]@{
        status = 'OBSERVED'
        ownSessionPresent = Get-FieldValue $details 'ownSessionPresent'
        supportsRemoteControl = Get-FieldValue $details 'supportsRemoteControl'
        nowPlayingPresent = Get-FieldValue $details 'nowPlayingPresent'
        webSocketState = Get-FieldValue $details 'webSocketState'
        reportStart = Get-FieldValue $details 'reportStart'
        reportProgress = Get-FieldValue $details 'reportProgress'
        reportStop = Get-FieldValue $details 'reportStop'
        recentEvents = $events
    }
}

function Get-WindowsCrashEvents {
    param([System.Collections.IDictionary]$Window)
    if ($SkipWindowsEvents) { Add-CollectionWarning 'windows_event_collection_skipped'; return @() }
    try {
        $events = @(Get-WinEvent -FilterHashtable @{LogName='Application'; StartTime=$Window.start.LocalDateTime; EndTime=$Window.end.LocalDateTime; Id=1000,1001,1026} -MaxEvents 100 -ErrorAction Stop)
        return @($events | Where-Object { $_.Message -match '(?i)Emby\.Theater|electron\.exe|ete-mpv-helper\.exe' } | ForEach-Object {
            [ordered]@{ timestamp = ([DateTimeOffset]$_.TimeCreated).ToUniversalTime().ToString('o'); provider = [string]$_.ProviderName; eventId = [int]$_.Id; level = [string]$_.LevelDisplayName; productMatch = 'EmbyTheaterEnhanced' }
        })
    } catch { Add-CollectionWarning 'windows_event_collection_unavailable'; return @() }
}

function Get-ErrorSnapshot {
    param([object[]]$Records, [object[]]$CrashEvents)
    $events = @($Records | Where-Object {
        (Get-FieldValue $_ 'level') -eq 'error' -or (Get-FieldValue $_ 'event') -match '(?i)error|crash|unhandled|generation-required|bridge-error|bridge_error|rejection'
    } | Select-Object -Last 128)
    $crashArray = @($CrashEvents | Where-Object { $null -ne $_ })
    return [ordered]@{ status = if (@($events).Count -or @($crashArray).Count) { 'OBSERVED' } else { 'NONE_OBSERVED' }; clientEvents = $events; windowsCrashEvents = $crashArray }
}

function Get-IncludedFiles {
    param([string]$Directory)
    return @(Get-ChildItem -LiteralPath $Directory -File -Recurse | Where-Object { $_.Name -ne 'manifest.json' } | Sort-Object FullName | ForEach-Object {
        $relative = $_.FullName.Substring($Directory.Length).TrimStart([char]'\', [char]'/').Replace('\', '/')
        $sha = [Security.Cryptography.SHA256]::Create()
        $stream = [IO.File]::OpenRead($_.FullName)
        try { $hash = ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
        finally { $stream.Dispose(); $sha.Dispose() }
        [ordered]@{ name = $relative; bytes = [int64]$_.Length; sha256 = $hash }
    })
}

. (Join-Path $PSScriptRoot 'diagnostics-common.ps1')
if ($IssueCorrelationId -and $IssueCorrelationId -notmatch '^[0-9a-fA-F]{32}$') {
    throw 'IssueCorrelationId must be a random 32-character hexadecimal value.'
}

$stopwatch = [Diagnostics.Stopwatch]::StartNew()
$captureWindow = Resolve-CaptureWindow
$safeOutputRoot = [IO.Path]::GetFullPath($OutputRoot)
if (-not (Test-Path -LiteralPath $safeOutputRoot -PathType Container)) { New-Item -ItemType Directory -Path $safeOutputRoot -Force | Out-Null }
$stamp = $CaptureTime.LocalDateTime.ToString('yyyyMMdd-HHmmss')
$bundleName = 'ETE-Diagnostics-' + $stamp
$bundleDirectory = Join-Path $safeOutputRoot $bundleName
$zipPath = $bundleDirectory + '.zip'
if (Test-Path -LiteralPath $bundleDirectory) { throw 'Diagnostic output directory already exists; choose another capture time or output root.' }
if (-not $NoZip -and (Test-Path -LiteralPath $zipPath)) { throw 'Diagnostic ZIP already exists; choose another capture time or output root.' }
New-Item -ItemType Directory -Path $bundleDirectory | Out-Null
New-Item -ItemType Directory -Path (Join-Path $bundleDirectory 'logs') | Out-Null

$processSnapshot = Get-ProcessSnapshot
$runtimeRoot = Find-InstallRoot $processSnapshot.raw
$logDirectory = Resolve-LogDirectory
$logSnapshot = Read-BoundedClientLog $logDirectory $captureWindow
$records = @($logSnapshot.records)
$product = Get-ProductSnapshot $runtimeRoot $records
$playback = Get-PlaybackSnapshot $records
$cd2 = Get-Cd2Snapshot $records
$session = Get-SessionSnapshot $records
$crashes = Get-WindowsCrashEvents $captureWindow
$errors = Get-ErrorSnapshot $records $crashes

Write-JsonFile (Join-Path $bundleDirectory 'product.json') $product
Write-JsonFile (Join-Path $bundleDirectory 'processes.json') $processSnapshot.safe
Write-JsonFile (Join-Path $bundleDirectory 'playback.json') $playback
Write-JsonFile (Join-Path $bundleDirectory 'cd2.json') $cd2
Write-JsonFile (Join-Path $bundleDirectory 'session.json') $session
Write-JsonFile (Join-Path $bundleDirectory 'errors.json') $errors
Write-JsonFile (Join-Path $bundleDirectory 'collection.json') ([ordered]@{
    clientLogFilesRead = $logSnapshot.filesRead
    clientLogRecordsIncluded = @($records).Count
    malformedLinesOmitted = $logSnapshot.malformedLinesOmitted
    outsideWindowOmitted = $logSnapshot.outsideWindowOmitted
    maxLogLines = $MaxLogLines
})
$safeLogLines = @($records | ForEach-Object { (Protect-DiagnosticValue $_) | ConvertTo-Json -Depth 24 -Compress })
Write-Utf8File (Join-Path $bundleDirectory 'logs\client.jsonl') (($safeLogLines -join "`n") + $(if (@($safeLogLines).Count) { "`n" } else { '' }))

$manifestPath = Join-Path $bundleDirectory 'manifest.json'
$manifest = [ordered]@{
    schemaVersion = $script:SchemaVersion
    tool = [ordered]@{ name = $script:ToolName; version = $script:ToolVersion }
    issueCorrelationId = if ($IssueCorrelationId) { $IssueCorrelationId.ToLowerInvariant() } else { $null }
    captureTime = $CaptureTime.ToUniversalTime().ToString('o')
    appVersion = $product.appVersion
    sourceCommit = $product.sourceCommit
    logTimeRange = [ordered]@{ mode = $captureWindow.mode; start = $captureWindow.start.ToString('o'); end = $captureWindow.end.ToString('o') }
    filesIncluded = Get-IncludedFiles $bundleDirectory
    collectionWarnings = @($script:CollectionWarnings)
    redactionStatus = 'pending'
    redactionPassed = $false
    redactionWarnings = @()
    redaction = [ordered]@{ algorithm = 'HMAC-SHA256'; hashLength = 16; scope = 'bundle-only'; saltPersisted = $false; rulesVersion = 1 }
    archiveRequested = (-not $NoZip)
    elapsedMs = 0
}
Write-JsonFile $manifestPath $manifest
$redactionFailures = @(Test-BundleRedaction $bundleDirectory)
if (@($redactionFailures).Count -eq 0) {
    $manifest.redactionStatus = 'passed'
    $manifest.redactionPassed = $true
    $manifest.redactionWarnings = @()
    $manifest.elapsedMs = $stopwatch.ElapsedMilliseconds
    Write-JsonFile $manifestPath $manifest
    $secondPassFailures = @(Test-BundleRedaction $bundleDirectory)
    if (@($secondPassFailures).Count -gt 0) {
        $manifest.redactionStatus = 'failed'
        $manifest.redactionPassed = $false
        $manifest.redactionWarnings = $secondPassFailures
        Write-JsonFile $manifestPath $manifest
        [Console]::Error.WriteLine('Diagnostic bundle failed the final redaction gate; ZIP was not generated.')
        exit 2
    }
} else {
    $manifest.redactionStatus = 'failed'
    $manifest.redactionPassed = $false
    $manifest.redactionWarnings = $redactionFailures
    $manifest.elapsedMs = $stopwatch.ElapsedMilliseconds
    Write-JsonFile $manifestPath $manifest
    [Console]::Error.WriteLine('Diagnostic bundle failed the redaction gate; ZIP was not generated.')
    exit 2
}

if (-not $NoZip) {
    Compress-Archive -LiteralPath $bundleDirectory -DestinationPath $zipPath -CompressionLevel Optimal
}
$stopwatch.Stop()
[ordered]@{
    status = 'READY'
    bundle = $bundleDirectory
    zip = if ($NoZip) { $null } else { $zipPath }
    redactionPassed = $true
    elapsedMs = $stopwatch.ElapsedMilliseconds
} | ConvertTo-Json -Compress
