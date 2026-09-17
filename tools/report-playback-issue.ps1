[CmdletBinding()]
param(
    [string]$OutputRoot = (Get-Location).Path,
    [string]$LogRoot,
    [string]$InstallRoot,
    [ValidateRange(1, 2000)][int]$MaxLogLines = 256,
    [string]$IssueType,
    [AllowEmptyString()][string]$UserNote,
    [DateTimeOffset]$CaptureTime,
    [switch]$EmptyUserNote,
    [switch]$NoZip,
    [switch]$SkipWindowsEvents
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$script:ToolName = 'ETE Playback Issue Snapshot'
$script:ToolVersion = '1.0.0'
$script:SchemaVersion = 1
$script:Warnings = New-Object System.Collections.Generic.List[string]
$script:IssueTypes = [ordered]@{
    '1' = 'startup'
    '2' = 'playback-failure'
    '3' = 'seek'
    '4' = 'pause-resume'
    '5' = 'next-track'
    '6' = 'cd2-or-mount'
    '7' = 'mount-fallback'
    '8' = 'remote-control'
    '9' = 'fullscreen-ui'
    '10' = 'crash-exit'
    '11' = 'other'
}
$script:IssueTypeValues = @($script:IssueTypes.Values)

. (Join-Path $PSScriptRoot 'diagnostics-common.ps1')

trap {
    $line = if ($_.InvocationInfo -and $_.InvocationInfo.ScriptLineNumber) { [int]$_.InvocationInfo.ScriptLineNumber } else { 0 }
    [Console]::Error.WriteLine(('Issue snapshot failed safely at line {0} ({1}, {2}). No collector ZIP was requested after this failure.' -f $line, $_.Exception.GetType().Name, $_.FullyQualifiedErrorId))
    exit 1
}

function Add-SnapshotWarning {
    param([string]$Code)
    if ($Code -and -not $script:Warnings.Contains($Code)) { $script:Warnings.Add($Code) }
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

function Get-Details {
    param([AllowNull()][object]$Record)
    $details = Get-FieldValue $Record 'details'
    if ($null -eq $details) { return [ordered]@{} }
    return $details
}

function Get-RecordTimestamp {
    param([AllowNull()][object]$Record)
    $value = Get-FieldValue $Record 'timestamp'
    if ($value) { return [string]$value }
    return 'UNAVAILABLE'
}

function Get-LastRecord {
    param([object[]]$Records, [string]$Category, [string[]]$Events)
    $eventNames = @($Events)
    return @($Records | Where-Object {
        (Get-FieldValue $_ 'category') -eq $Category -and (($eventNames.Count -eq 0) -or $eventNames -contains (Get-FieldValue $_ 'event'))
    } | Select-Object -Last 1)[0]
}

function Get-Records {
    param([object[]]$Records, [string]$Category, [string[]]$Events)
    $eventNames = @($Events)
    return @($Records | Where-Object {
        (Get-FieldValue $_ 'category') -eq $Category -and (($eventNames.Count -eq 0) -or $eventNames -contains (Get-FieldValue $_ 'event'))
    })
}

function Get-LastFieldValue {
    param([object[]]$Records, [string[]]$Names)
    $fieldNames = @($Names)
    $array = @($Records)
    for ($index = $array.Count - 1; $index -ge 0; $index--) {
        $details = Get-Details $array[$index]
        foreach ($name in $fieldNames) {
            $value = Get-FieldValue $details $name
            if ($null -ne $value) { return $value }
        }
    }
    return $null
}

function Get-ObservedValue {
    param([AllowNull()][object]$Value)
    if ($null -eq $Value) { return 'UNAVAILABLE' }
    return $Value
}

function Get-EventSummary {
    param([AllowNull()][object]$Record)
    if ($null -eq $Record) { return $null }
    return [ordered]@{
        timestamp = Get-RecordTimestamp $Record
        level = Get-FieldValue $Record 'level'
        category = Get-FieldValue $Record 'category'
        event = Get-FieldValue $Record 'event'
        details = Get-Details $Record
    }
}

function Get-RedactedEventSummaries {
    param([object[]]$Records, [int]$Limit = 32)
    if ($Limit -lt 1) { return @() }
    $array = @($Records | Where-Object { $null -ne $_ })
    $start = [Math]::Max(0, $array.Count - $Limit)
    $result = New-Object System.Collections.Generic.List[object]
    for ($index = $start; $index -lt $array.Count; $index++) { $result.Add((Get-EventSummary $array[$index])) }
    return @($result | ForEach-Object { $_ })
}

function Resolve-IssueType {
    param([string]$Requested)
    if ($Requested) {
        if ($script:IssueTypeValues -contains $Requested) { return $Requested }
        $matchingKey = @($script:IssueTypes.Keys | Where-Object { $script:IssueTypes[$_] -eq $Requested } | Select-Object -First 1)
        if (@($matchingKey).Count) { return $script:IssueTypes[$matchingKey[0]] }
        throw ('Unknown IssueType: {0}' -f $Requested)
    }
    Write-Host ''
    Write-Host '请选择问题类型 / Select issue type:'
    foreach ($key in $script:IssueTypes.Keys) {
        $label = switch ($key) {
            '1' { 'Startup / 起播' }
            '2' { 'Playback Failure / 播放失败' }
            '3' { 'Seek' }
            '4' { 'Pause / Resume' }
            '5' { 'NextTrack' }
            '6' { 'CD2 / DirectUrl' }
            '7' { 'Mount fallback' }
            '8' { 'Remote Control' }
            '9' { 'Fullscreen / UI' }
            '10' { 'Crash / Exit' }
            default { 'Other' }
        }
        Write-Host ('  {0}  {1}' -f $key, $label)
    }
    do { $choice = Read-Host '输入编号 / Enter number' } while (-not $script:IssueTypes.Contains([string]$choice))
    return $script:IssueTypes[[string]$choice]
}

function Read-IssueNote {
    param([bool]$Explicit, [bool]$ExplicitEmpty)
    if ($ExplicitEmpty) { return '' }
    if ($Explicit) { return [string]$UserNote }
    return [string](Read-Host '一句简短描述，可留空 / Short note, optional')
}

function Resolve-IssueLogDirectory {
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

function Read-IssueClientLog {
    param([string]$Directory, [DateTimeOffset]$CapturedAt)
    $records = New-Object System.Collections.Generic.List[object]
    $malformed = 0
    $outside = 0
    $invalidUtf8 = 0
    $filesRead = 0
    $windowStart = $CapturedAt.ToUniversalTime().AddMinutes(-5)
    $windowEnd = $CapturedAt.ToUniversalTime().AddMinutes(5)
    $base = Join-Path $Directory 'ete-client.jsonl'
    $files = @($base + '.3'; $base + '.2'; $base + '.1'; $base)
    foreach ($file in $files) {
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { continue }
        $filesRead++
        try {
            $decoder = New-Object System.Text.UTF8Encoding($true, $true)
            $text = $decoder.GetString([IO.File]::ReadAllBytes($file))
            if ($text.Length -gt 0 -and $text[0] -eq [char]0xfeff) { $text = $text.Substring(1) }
            $lines = @($text -split "`r?`n" | Select-Object -Last $MaxLogLines)
        } catch [System.Text.DecoderFallbackException] {
            $invalidUtf8++
            continue
        } catch {
            Add-SnapshotWarning 'client_log_read_failed'
            continue
        }
        foreach ($line in $lines) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            try { $record = ConvertFrom-Json -InputObject $line -ErrorAction Stop }
            catch { $malformed++; continue }
            $stamp = [DateTimeOffset]::MinValue
            $timestamp = Get-FieldValue $record 'timestamp'
            if ($null -eq $timestamp -or -not [DateTimeOffset]::TryParse([string]$timestamp, [ref]$stamp)) { $malformed++; continue }
            $stamp = $stamp.ToUniversalTime()
            if ($stamp -lt $windowStart -or $stamp -gt $windowEnd) { $outside++; continue }
            $records.Add($record)
        }
    }
    if ($filesRead -eq 0) { Add-SnapshotWarning 'client_log_not_found' }
    if ($malformed -gt 0) { Add-SnapshotWarning 'client_log_malformed_lines_omitted' }
    if ($invalidUtf8 -gt 0) { Add-SnapshotWarning 'client_log_invalid_utf8' }
    $ordered = @($records | Sort-Object { ([DateTimeOffset]::Parse([string](Get-FieldValue $_ 'timestamp'))).UtcDateTime.Ticks })
    if (@($ordered).Count -gt $MaxLogLines) { $ordered = @($ordered | Select-Object -Last $MaxLogLines); Add-SnapshotWarning 'client_log_line_limit_applied' }
    return [ordered]@{
        records = $ordered
        filesRead = $filesRead
        malformedLinesOmitted = $malformed
        invalidUtf8Files = $invalidUtf8
        outsideWindowOmitted = $outside
    }
}

function Get-IssueProcessInventory {
    $all = @()
    try { $all = @(Get-CimInstance Win32_Process -ErrorAction Stop) }
    catch {
        Add-SnapshotWarning 'process_inventory_unavailable'
        return [ordered]@{ raw = @(); safe = [ordered]@{ status = 'UNAVAILABLE'; embyHostRunning = 'UNAVAILABLE'; electronCount = 'UNAVAILABLE'; nativeHelperCount = 'UNAVAILABLE'; residualStatus = 'UNAVAILABLE'; appWindowState = 'UNAVAILABLE'; nativeHelperEvents = @() } }
    }
    $roots = @($all | Where-Object { $_.Name -ieq 'Emby.Theater.exe' })
    $ownedIds = New-Object 'System.Collections.Generic.HashSet[int]'
    foreach ($root in $roots) { [void]$ownedIds.Add([int]$root.ProcessId) }
    $changed = $true
    while ($changed) {
        $changed = $false
        foreach ($process in $all) {
            if ($ownedIds.Contains([int]$process.ParentProcessId) -and -not $ownedIds.Contains([int]$process.ProcessId)) {
                [void]$ownedIds.Add([int]$process.ProcessId)
                $changed = $true
            }
        }
    }
    $owned = @($all | Where-Object { $ownedIds.Contains([int]$_.ProcessId) })
    $helpers = @($all | Where-Object { $_.Name -ieq 'ete-mpv-helper.exe' })
    $ownedHelpers = @($owned | Where-Object { $_.Name -ieq 'ete-mpv-helper.exe' })
    $unownedHelpers = @($helpers | Where-Object { -not $ownedIds.Contains([int]$_.ProcessId) })
    $residual = if (@($roots).Count -eq 0 -and @($unownedHelpers).Count -gt 0) { 'HELPER_WITHOUT_APP' } elseif (@($unownedHelpers).Count -gt 0) { 'UNOWNED_HELPER_OBSERVED' } elseif (@($roots).Count -gt 0) { 'APP_RUNNING' } else { 'NONE_OBSERVED' }
    return [ordered]@{
        raw = $all
        safe = [ordered]@{
            status = 'OK'
            embyHostRunning = (@($roots).Count -gt 0)
            electronCount = @($owned | Where-Object { $_.Name -ieq 'electron.exe' }).Count
            nativeHelperCount = @($ownedHelpers).Count
            unownedNativeHelperCount = @($unownedHelpers).Count
            residualStatus = $residual
            appWindowState = 'UNAVAILABLE'
            nativeHelperEvents = @()
        }
    }
}

function Find-IssueInstallRoot {
    param([object[]]$Processes)
    if ($InstallRoot) {
        $resolved = [IO.Path]::GetFullPath($InstallRoot)
        if (Test-Path -LiteralPath $resolved -PathType Container) { return $resolved }
        Add-SnapshotWarning 'install_root_not_found'
    }
    $app = @($Processes | Where-Object { $_.Name -ieq 'Emby.Theater.exe' -and $_.ExecutablePath } | Select-Object -First 1)
    if (@($app).Count) { return Split-Path -Parent ([string]$app[0].ExecutablePath) }
    $programFiles = [Environment]::GetFolderPath('ProgramFiles')
    $standard = Join-Path $programFiles 'Emby Theater Enhanced'
    if (Test-Path -LiteralPath $standard -PathType Container) { return $standard }
    Add-SnapshotWarning 'installed_runtime_not_found'
    return $null
}

function Read-IssueJsonIfPresent {
    param([string[]]$Candidates)
    foreach ($candidate in $Candidates) {
        if (-not $candidate -or -not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
        try { return ConvertFrom-Json -InputObject (Get-Content -LiteralPath $candidate -Raw -Encoding UTF8) -ErrorAction Stop }
        catch { Add-SnapshotWarning 'product_metadata_invalid' }
    }
    return $null
}

function Get-ProductState {
    param([object[]]$Records, [string]$RuntimeRoot)
    $start = Get-LastRecord $Records 'app' @('start')
    $startDetails = Get-Details $start
    $helperReady = Get-LastRecord $Records 'native-helper' @('helper-ready')
    $helperDetails = Get-Details $helperReady
    $package = $null
    $provenance = $null
    if ($RuntimeRoot) {
        $package = Read-IssueJsonIfPresent @((Join-Path $RuntimeRoot 'electronapp\package.json'), (Join-Path $RuntimeRoot 'package.json'))
        $provenance = Read-IssueJsonIfPresent @((Join-Path $RuntimeRoot 'runtime-provenance.json'), (Join-Path $RuntimeRoot 'electronapp\runtime-provenance.json'))
    }
    $repoRoot = Split-Path -Parent $PSScriptRoot
    if (-not $package) { $package = Read-IssueJsonIfPresent @((Join-Path $repoRoot 'package.json')) }
    $appVersion = Get-FieldValue $startDetails 'appVersion'
    if ($null -eq $appVersion) { $appVersion = Get-FieldValue $package 'version' }
    $sourceCommit = Get-FieldValue $startDetails 'buildCommit'
    if ($null -eq $sourceCommit) { $sourceCommit = Get-FieldValue $startDetails 'sourceCommit' }
    if ($null -eq $sourceCommit) { $sourceCommit = Get-FieldValue $provenance 'sourceCommit' }
    if ($null -eq $sourceCommit -or [string]$sourceCommit -notmatch '^[0-9a-fA-F]{40}$') { $sourceCommit = 'UNKNOWN' }
    $bridgeMode = Get-FieldValue $startDetails 'bridgeMode'
    if ($null -eq $bridgeMode) { $bridgeMode = Get-FieldValue $startDetails 'bridge' }
    if ($null -eq $bridgeMode -and $helperReady) { $bridgeMode = 'native-helper' }
    return [ordered]@{
        status = if ($start -or $package) { 'OBSERVED' } else { 'UNAVAILABLE' }
        appVersion = if ($null -ne $appVersion) { [string]$appVersion } else { 'UNKNOWN' }
        sourceCommit = $sourceCommit
        bridgeMode = if ($null -ne $bridgeMode) { [string]$bridgeMode } else { 'UNAVAILABLE' }
    }
}

function Get-PlaybackState {
    param([object[]]$Records)
    $play = Get-LastRecord $Records 'playback' @('play-request')
    $route = Get-LastRecord $Records 'resolver' @('route-selected')
    $complete = Get-LastRecord $Records 'playback' @('resolver-complete')
    $corePlayingRecord = Get-LastRecord $Records 'playback' @('core-playing')
    $coreIdleRecord = Get-LastRecord $Records 'playback' @('core-idle')
    $playDetails = Get-Details $play
    $routeDetails = Get-Details $route
    $completeDetails = Get-Details $complete
    $request = Get-FieldValue $routeDetails 'requestId'
    if ($null -eq $request) { $request = Get-FieldValue $routeDetails 'playRequestId' }
    if ($null -eq $request) { $request = Get-FieldValue $playDetails 'requestId' }
    if ($null -eq $request) { $request = Get-FieldValue $playDetails 'playRequestId' }
    $generation = Get-FieldValue $routeDetails 'generationId'
    if ($null -eq $generation) { $generation = Get-FieldValue $playDetails 'generationId' }
    if ($null -eq $generation) { $generation = Get-FieldValue (Get-Details $corePlayingRecord) 'generationId' }
    $currentPlayer = Get-FieldValue $playDetails 'currentPlayer'
    if ($null -eq $currentPlayer) { $currentPlayer = Get-FieldValue $routeDetails 'currentPlayer' }
    $corePlaying = if ($corePlayingRecord) { $true } elseif ($coreIdleRecord) { $false } else { 'UNAVAILABLE' }
    return [ordered]@{
        status = if ($play -or $route -or $complete -or $corePlayingRecord) { 'OBSERVED' } else { 'UNAVAILABLE' }
        requestHash = if ($null -ne $request) { Get-StableHash $request } else { 'UNAVAILABLE' }
        generationHash = if ($null -ne $generation) { Get-StableHash $generation } else { 'UNAVAILABLE' }
        route = Get-ObservedValue (Get-FieldValue $routeDetails 'route')
        reason = if ($null -ne (Get-FieldValue $routeDetails 'reason')) { Get-FieldValue $routeDetails 'reason' } else { Get-ObservedValue (Get-FieldValue $completeDetails 'reason') }
        sourceKind = Get-ObservedValue (Get-FieldValue $routeDetails 'sourceKind')
        currentPlayer = Get-ObservedValue $currentPlayer
        corePlaying = $corePlaying
        latestEvidence = Get-RedactedEventSummaries @($play, $route, $complete, $corePlayingRecord, $coreIdleRecord)
    }
}

function Get-ResolverState {
    param([object[]]$Records)
    $route = Get-LastRecord $Records 'resolver' @('route-selected')
    $details = Get-Details $route
    $rule = Get-FieldValue $details 'ruleId'
    if ($null -eq $rule) { $rule = Get-FieldValue $details 'rule' }
    $order = Get-FieldValue $details 'order'
    if ($null -eq $order) { $order = Get-FieldValue $details 'strategyOrder' }
    return [ordered]@{
        status = if ($route) { 'OBSERVED' } else { 'UNAVAILABLE' }
        ruleHash = if ($null -ne $rule) { Get-StableHash $rule } else { 'UNAVAILABLE' }
        strategy = Get-ObservedValue (Get-FieldValue $details 'strategy')
        order = Get-ObservedValue $order
        route = Get-ObservedValue (Get-FieldValue $details 'route')
        reason = Get-ObservedValue (Get-FieldValue $details 'reason')
        fallback = Get-ObservedValue (Get-FieldValue $details 'fallback')
        sourceKind = Get-ObservedValue (Get-FieldValue $details 'sourceKind')
        requestHash = if ($null -ne (Get-FieldValue $details 'requestId')) { Get-StableHash (Get-FieldValue $details 'requestId') } else { 'UNAVAILABLE' }
    }
}

function Get-Cd2State {
    param([object[]]$Records)
    $cd2Events = Get-Records $Records 'cd2' @()
    $mountEvents = Get-Records $Records 'mount' @()
    $findEvents = @($cd2Events | Where-Object { [string](Get-FieldValue $_ 'event') -match '^find-file-' })
    $directEvents = @($cd2Events | Where-Object {
        [string](Get-FieldValue $_ 'event') -match '(?i)direct' -or
        [string](Get-FieldValue (Get-Details $_) 'sourceKind') -eq 'direct-url' -or
        [string](Get-FieldValue (Get-Details $_) 'directReason')
    })
    $latestCd2 = @($cd2Events | Select-Object -Last 1)
    $latestDetails = if (@($latestCd2).Count) { Get-Details $latestCd2[0] } else { [ordered]@{} }
    $findEnd = @($findEvents | Where-Object { [string](Get-FieldValue $_ 'event') -eq 'find-file-end' } | Select-Object -Last 1)
    $findDetails = if (@($findEnd).Count) { Get-Details $findEnd[0] } else { [ordered]@{} }
    $directLatest = @($directEvents | Select-Object -Last 1)
    $directDetails = if (@($directLatest).Count) { Get-Details $directLatest[0] } else { [ordered]@{} }
    $latestMount = @($mountEvents | Select-Object -Last 1)
    $mountDetails = if (@($latestMount).Count) { Get-Details $latestMount[0] } else { [ordered]@{} }
    $mountHit = if (-not @($mountEvents).Count) { 'UNAVAILABLE' } elseif (@($mountEvents | Where-Object { (Get-FieldValue $_ 'event') -eq 'resolve-hit' }).Count -gt 0) { $true } elseif (@($mountEvents | Where-Object { (Get-FieldValue $_ 'event') -eq 'resolve-miss' }).Count -gt 0) { $false } else { 'UNAVAILABLE' }
    $findResult = Get-FieldValue $findDetails 'result'
    if ($null -eq $findResult) { $findResult = Get-FieldValue $findDetails 'found' }
    if ($null -eq $findResult) { $findResult = Get-FieldValue $findDetails 'hit' }
    if ($null -eq $findResult) { $findResult = Get-FieldValue $findDetails 'reason' }
    $directResult = Get-FieldValue $directDetails 'result'
    if ($null -eq $directResult) { $directResult = Get-FieldValue $directDetails 'reason' }
    if ($null -eq $directResult) { $directResult = Get-FieldValue $directDetails 'sourceKind' }
    $rule = Get-FieldValue $latestDetails 'ruleId'
    if ($null -eq $rule) { $rule = Get-FieldValue $mountDetails 'ruleId' }
    return [ordered]@{
        status = if (@($cd2Events).Count -or @($mountEvents).Count) { 'OBSERVED' } else { 'UNAVAILABLE' }
        attemptObserved = if (@($cd2Events).Count) { $true } else { 'UNAVAILABLE' }
        ruleHash = if ($null -ne $rule) { Get-StableHash $rule } else { 'UNAVAILABLE' }
        findFileObserved = if (@($findEvents).Count) { $true } else { 'UNAVAILABLE' }
        findFileResult = Get-ObservedValue $findResult
        directUrlObserved = if (@($directEvents).Count) { $true } else { 'UNAVAILABLE' }
        directUrlResult = Get-ObservedValue $directResult
        cd2Reason = Get-ObservedValue (Get-FieldValue $latestDetails 'reason')
        elapsedMs = Get-ObservedValue (Get-FieldValue $latestDetails 'elapsedMs')
        mountHitObserved = $mountHit
        mountReason = Get-ObservedValue (Get-FieldValue $mountDetails 'reason')
        mountEvidence = Get-RedactedEventSummaries $mountEvents 16
        cd2Evidence = Get-RedactedEventSummaries $cd2Events 32
    }
}

function Get-SessionState {
    param([object[]]$Records)
    $events = @($Records | Where-Object { (Get-FieldValue $_ 'category') -in @('session', 'websocket', 'report') })
    if (-not @($events).Count) {
        Add-SnapshotWarning 'session_websocket_observability_unavailable'
        return [ordered]@{
            status = 'UNAVAILABLE'
            ownSession = 'UNAVAILABLE'
            nowPlaying = 'UNAVAILABLE'
            webSocket = 'UNAVAILABLE'
            report = [ordered]@{ start = 'UNAVAILABLE'; progress = 'UNAVAILABLE'; stop = 'UNAVAILABLE' }
            evidence = @()
        }
    }
    return [ordered]@{
        status = 'OBSERVED'
        ownSession = Get-ObservedValue (Get-LastFieldValue $events @('ownSession', 'ownSessionPresent'))
        nowPlaying = Get-ObservedValue (Get-LastFieldValue $events @('nowPlaying', 'nowPlayingPresent'))
        webSocket = Get-ObservedValue (Get-LastFieldValue $events @('webSocket', 'webSocketState', 'websocketState'))
        report = [ordered]@{
            start = Get-ObservedValue (Get-LastFieldValue $events @('reportStart', 'reportStarted'))
            progress = Get-ObservedValue (Get-LastFieldValue $events @('reportProgress', 'progressReported'))
            stop = Get-ObservedValue (Get-LastFieldValue $events @('reportStop', 'reportStopped'))
        }
        evidence = Get-RedactedEventSummaries $events 32
    }
}

function Get-AppWindowState {
    param([object[]]$Records)
    $events = @($Records | Where-Object { (Get-FieldValue $_ 'category') -eq 'app' })
    $value = Get-LastFieldValue $events @('windowState', 'state', 'fullscreen', 'isFullscreen')
    return Get-ObservedValue $value
}

function Get-WindowsCrashEvidence {
    param([DateTimeOffset]$CapturedAt)
    if ($SkipWindowsEvents) {
        Add-SnapshotWarning 'windows_event_collection_skipped'
        return [ordered]@{ status = 'UNAVAILABLE'; events = @() }
    }
    try {
        $start = $CapturedAt.ToUniversalTime().AddMinutes(-5).LocalDateTime
        $end = $CapturedAt.ToUniversalTime().AddMinutes(5).LocalDateTime
        $events = @(Get-WinEvent -FilterHashtable @{LogName='Application'; StartTime=$start; EndTime=$end; Id=1000,1001,1026} -MaxEvents 100 -ErrorAction Stop)
        $matches = @($events | Where-Object { $_.Message -match '(?i)Emby\.Theater|electron\.exe|ete-mpv-helper\.exe' } | ForEach-Object {
            [ordered]@{
                timestamp = if ($_.TimeCreated) { ([DateTimeOffset]$_.TimeCreated).ToUniversalTime().ToString('o') } else { 'UNAVAILABLE' }
                provider = [string]$_.ProviderName
                eventId = [int]$_.Id
                level = [string]$_.LevelDisplayName
                productMatch = 'EmbyTheaterEnhanced'
            }
        })
        return [ordered]@{ status = 'AVAILABLE'; events = $matches }
    } catch {
        Add-SnapshotWarning 'windows_event_collection_unavailable'
        return [ordered]@{ status = 'UNAVAILABLE'; events = @() }
    }
}

function Get-ErrorState {
    param([object[]]$Records, [System.Collections.IDictionary]$CrashEvidence)
    $hasLog = @($Records).Count -gt 0
    $errorRecords = @($Records | Where-Object {
        (Get-FieldValue $_ 'level') -eq 'error' -or [string](Get-FieldValue $_ 'event') -match '(?i)error|crash|unhandled|generation-required|bridge-error|bridge_error|rejection'
    })
    $bridge = @($errorRecords | Where-Object {
        [string](Get-FieldValue $_ 'event') -match '(?i)bridge-error|bridge_error' -or
        [string](Get-FieldValue (Get-Details $_) 'message') -match '(?i)bridge-error|bridge_error' -or
        [string](Get-FieldValue (Get-Details $_) 'reason') -match '(?i)bridge-error|bridge_error'
    })
    $generation = @($errorRecords | Where-Object { [string](Get-FieldValue $_ 'event') -match '(?i)generation-required' -or [string](Get-FieldValue (Get-Details $_) 'reason') -eq 'generation-required' })
    $renderer = @($errorRecords | Where-Object { [string](Get-FieldValue $_ 'category') -match '(?i)renderer' -or [string](Get-FieldValue $_ 'event') -match '(?i)renderer' })
    $helperTerminal = @($errorRecords | Where-Object { [string](Get-FieldValue $_ 'category') -eq 'native-helper' -and [string](Get-FieldValue $_ 'event') -match '(?i)close|exit|fatal|crash|error|death' })
    $unhandled = @($errorRecords | Where-Object { [string](Get-FieldValue $_ 'event') -match '(?i)unhandled|rejection' })
    $crashEvents = @($CrashEvidence.events)
    return [ordered]@{
        status = if (-not $hasLog -and $CrashEvidence.status -eq 'UNAVAILABLE') { 'UNAVAILABLE' } elseif ($errorRecords.Count -or $crashEvents.Count) { 'OBSERVED' } else { 'NONE_OBSERVED' }
        bridgeError = if (-not $hasLog) { 'UNAVAILABLE' } else { $bridge.Count -gt 0 }
        generationRequired = if (-not $hasLog) { 'UNAVAILABLE' } else { $generation.Count -gt 0 }
        rendererError = if (-not $hasLog) { 'UNAVAILABLE' } else { $renderer.Count -gt 0 }
        helperTerminal = if (-not $hasLog) { 'UNAVAILABLE' } else { $helperTerminal.Count -gt 0 }
        unhandledRejection = if (-not $hasLog) { 'UNAVAILABLE' } else { $unhandled.Count -gt 0 }
        crashEvidence = if ($CrashEvidence.status -eq 'UNAVAILABLE') { 'UNAVAILABLE' } else { $crashEvents.Count -gt 0 }
        clientEvents = Get-RedactedEventSummaries $errorRecords 64
        windowsEvents = $crashEvents
    }
}

function Invoke-CollectorForIssue {
    param(
        [string]$CollectorPath,
        [string]$TargetOutputRoot,
        [string]$TargetLogRoot,
        [string]$TargetInstallRoot,
        [DateTimeOffset]$CapturedAt,
        [string]$CorrelationId
    )
    $collectorArgs = @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $CollectorPath,
        '-OutputRoot', $TargetOutputRoot,
        '-CaptureTime', $CapturedAt.ToString('o'),
        '-ProblemTime', $CapturedAt.ToString('o'),
        '-ProblemWindowMinutes', '5',
        '-IssueCorrelationId', $CorrelationId
    )
    if ($TargetLogRoot) { $collectorArgs += @('-LogRoot', $TargetLogRoot) }
    if ($TargetInstallRoot) { $collectorArgs += @('-InstallRoot', $TargetInstallRoot) }
    if ($NoZip) { $collectorArgs += '-NoZip' }
    if ($SkipWindowsEvents) { $collectorArgs += '-SkipWindowsEvents' }
    $watch = [Diagnostics.Stopwatch]::StartNew()
    $lines = @()
    $exitCode = 1
    try {
        $lines = @(& powershell.exe @collectorArgs 2>&1)
        $exitCode = $LASTEXITCODE
    } catch {
        Add-SnapshotWarning 'collector_invocation_failed'
        return [ordered]@{ status = 'NOT_GENERATED'; exitCode = 1; elapsedMs = $watch.ElapsedMilliseconds; collectorElapsedMs = $null; correlationMatches = $false; redactionPassed = $false; bundleName = $null; zipName = $null }
    }
    $watch.Stop()
    $result = $null
    $recentLines = @($lines | Select-Object -Last 8)
    for ($lineIndex = $recentLines.Count - 1; $lineIndex -ge 0; $lineIndex--) {
        $line = $recentLines[$lineIndex]
        try {
            $candidate = ConvertFrom-Json -InputObject ([string]$line) -ErrorAction Stop
            if ($candidate.status) { $result = $candidate; break }
        } catch { }
    }
    $bundleName = if ($result -and $result.bundle) { Split-Path -Leaf ([string]$result.bundle) } else { $null }
    $zipName = if ($result -and $result.zip) { Split-Path -Leaf ([string]$result.zip) } else { $null }
    if ($exitCode -ne 0 -or $null -eq $result -or $result.redactionPassed -ne $true) {
        Add-SnapshotWarning ('collector_failed_exit_{0}' -f $exitCode)
        return [ordered]@{ status = if ($exitCode -eq 2) { 'REDACTION_REFUSED' } else { 'NOT_GENERATED' }; exitCode = $exitCode; elapsedMs = $watch.ElapsedMilliseconds; collectorElapsedMs = if ($result -and $result.elapsedMs) { [int64]$result.elapsedMs } else { $null }; correlationMatches = $false; redactionPassed = $false; bundleName = $bundleName; zipName = $zipName }
    }
    $manifestPath = Join-Path (Join-Path $TargetOutputRoot $bundleName) 'manifest.json'
    $manifest = $null
    try { $manifest = ConvertFrom-Json -InputObject (Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8) -ErrorAction Stop } catch { Add-SnapshotWarning 'collector_manifest_unreadable' }
    $matches = $manifest -and [string]$manifest.issueCorrelationId -eq $CorrelationId -and $manifest.redactionPassed -eq $true
    if (-not $matches) { Add-SnapshotWarning 'collector_correlation_mismatch' }
    return [ordered]@{
        status = if ($matches) { 'READY' } else { 'NOT_GENERATED' }
        exitCode = $exitCode
        elapsedMs = $watch.ElapsedMilliseconds
        collectorElapsedMs = if ($result.elapsedMs) { [int64]$result.elapsedMs } else { $null }
        correlationMatches = $matches
        bundleName = $bundleName
        zipName = $zipName
        redactionPassed = if ($manifest) { [bool]$manifest.redactionPassed } else { $false }
    }
}

$selectedIssueType = Resolve-IssueType $IssueType
$note = Read-IssueNote ($PSBoundParameters.ContainsKey('UserNote')) $EmptyUserNote
$capturedAt = if ($PSBoundParameters.ContainsKey('CaptureTime')) { $CaptureTime.ToUniversalTime() } else { [DateTimeOffset]::Now.ToUniversalTime() }
$correlationId = [Guid]::NewGuid().ToString('N')
$snapshotWatch = [Diagnostics.Stopwatch]::StartNew()

$inventory = Get-IssueProcessInventory
$logDirectory = Resolve-IssueLogDirectory
$logSnapshot = Read-IssueClientLog $logDirectory $capturedAt
$records = @($logSnapshot.records)
$runtimeRoot = Find-IssueInstallRoot $inventory.raw
$product = Get-ProductState $records $runtimeRoot
$playback = Get-PlaybackState $records
$resolver = Get-ResolverState $records
$cd2 = Get-Cd2State $records
$session = Get-SessionState $records
$windowState = Get-AppWindowState $records
$helperEvents = Get-Records $records 'native-helper' @()
$inventory.safe.appWindowState = $windowState
$inventory.safe.nativeHelperEvents = Get-RedactedEventSummaries $helperEvents 16
$crashes = Get-WindowsCrashEvidence $capturedAt
$errors = Get-ErrorState $records $crashes
$snapshotWatch.Stop()

$safeOutputRoot = [IO.Path]::GetFullPath($OutputRoot)
if (-not (Test-Path -LiteralPath $safeOutputRoot -PathType Container)) { New-Item -ItemType Directory -Path $safeOutputRoot -Force | Out-Null }
$stamp = $capturedAt.LocalDateTime.ToString('yyyyMMdd-HHmmss')
$snapshotName = 'ETE-Issue-' + $stamp + '.json'
$snapshotPath = Join-Path $safeOutputRoot $snapshotName
if (Test-Path -LiteralPath $snapshotPath -PathType Leaf) { throw 'Issue snapshot already exists; choose another capture time or output root.' }

$snapshot = [ordered]@{
    schemaVersion = $script:SchemaVersion
    toolVersion = $script:ToolVersion
    capturedAt = $capturedAt.ToString('o')
    issueType = $selectedIssueType
    userNote = $note
    issueCorrelationId = $correlationId
    product = $product
    processState = $inventory.safe
    playbackState = $playback
    resolverState = $resolver
    cd2State = $cd2
    sessionState = $session
    errorState = $errors
    evidenceAvailability = [ordered]@{
        clientLog = if ($logSnapshot.filesRead -gt 0) { 'AVAILABLE' } else { 'UNAVAILABLE' }
        process = $inventory.safe.status
        product = $product.status
        playback = $playback.status
        resolver = $resolver.status
        cd2 = $cd2.status
        session = $session.status
        windowsEvents = $crashes.status
    }
    collectionWarnings = @($script:Warnings)
    snapshotElapsedMs = $snapshotWatch.ElapsedMilliseconds
}

Write-JsonFile $snapshotPath $snapshot
$snapshotFailures = @(Test-SnapshotRedaction -File $snapshotPath)
if (@($snapshotFailures).Count -gt 0) {
    Remove-Item -LiteralPath $snapshotPath -Force -ErrorAction SilentlyContinue
    [Console]::Error.WriteLine('ISSUE SNAPSHOT = FAIL; redaction gate refused the snapshot. Collector ZIP was not generated.')
    exit 2
}

$collectorPath = Join-Path $PSScriptRoot 'collect-diagnostics.ps1'
$collector = Invoke-CollectorForIssue -CollectorPath $collectorPath -TargetOutputRoot $safeOutputRoot -TargetLogRoot $LogRoot -TargetInstallRoot $InstallRoot -CapturedAt $capturedAt -CorrelationId $correlationId
$snapshotResult = [ordered]@{
    status = 'READY'
    snapshot = $snapshotName
    issueCorrelationId = $correlationId
    snapshotElapsedMs = $snapshot.snapshotElapsedMs
    bundleStatus = $collector.status
    bundle = $collector.bundleName
    zip = $collector.zipName
    bundleElapsedMs = $collector.elapsedMs
    collectorElapsedMs = $collector.collectorElapsedMs
    correlationMatches = $collector.correlationMatches
    redactionPassed = $collector.redactionPassed
    warnings = @($script:Warnings)
}
$snapshotResult | ConvertTo-Json -Compress
if ($collector.status -eq 'NOT_GENERATED' -or $collector.status -eq 'REDACTION_REFUSED') { exit 3 }
