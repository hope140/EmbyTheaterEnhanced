[CmdletBinding()]
param(
    [string]$OutputRoot = (Get-Location).Path,
    [string]$LogRoot,
    [ValidateRange(1, 3600)][int]$DurationSeconds = 300,
    [ValidateRange(50, 5000)][int]$PollMilliseconds = 250,
    [ValidateRange(1, 20000)][int]$MaxLogLines = 5000,
    [ValidateRange(1, 240)][int]$LookbackMinutes = 30,
    [DateTimeOffset]$Since,
    [switch]$Once,
    [switch]$TestInjectUnsafeOutput
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$script:ToolName = 'ETE CD2 Route Timeline Observer'
$script:ToolVersion = '1.0.0'
$script:SchemaVersion = 1
$script:ObserverWarnings = New-Object System.Collections.Generic.List[string]

. (Join-Path $PSScriptRoot 'diagnostics-common.ps1')

trap {
    $line = if ($_.InvocationInfo -and $_.InvocationInfo.ScriptLineNumber) { [int]$_.InvocationInfo.ScriptLineNumber } else { 0 }
    [Console]::Error.WriteLine(('CD2 observer failed safely at line {0} ({1}, {2}). No production action was performed.' -f $line, $_.Exception.GetType().Name, $_.FullyQualifiedErrorId))
    exit 1
}

function Add-ObserverWarning {
    param([string]$Code)
    if ($Code -and -not $script:ObserverWarnings.Contains($Code)) { $script:ObserverWarnings.Add($Code) }
}

function Get-OField {
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

function Get-ODetails {
    param([AllowNull()][object]$Record)
    $details = Get-OField $Record 'details'
    if ($null -eq $details) { return [ordered]@{} }
    return $details
}

function Get-OTimestamp {
    param([AllowNull()][object]$Record)
    $value = Get-OField $Record 'timestamp'
    $parsed = [DateTimeOffset]::MinValue
    if ($null -ne $value -and [DateTimeOffset]::TryParse([string]$value, [ref]$parsed)) { return $parsed.ToUniversalTime() }
    return [DateTimeOffset]::MinValue
}

function Get-OEventName {
    param([AllowNull()][object]$Record)
    return [string](Get-OField $Record 'event')
}

function Get-OCategory {
    param([AllowNull()][object]$Record)
    return [string](Get-OField $Record 'category')
}

function Get-ORequestId {
    param([AllowNull()][object]$Record)
    $details = Get-ODetails $Record
    $value = Get-OField $details 'requestId'
    if ($null -eq $value) { $value = Get-OField $details 'playRequestId' }
    if ($null -eq $value) { $value = Get-OField $details 'playbackRequestId' }
    if ($null -eq $value) { return $null }
    return [string]$value
}

function Get-ORoute {
    param([AllowNull()][object]$Record)
    $details = Get-ODetails $Record
    $route = Get-OField $details 'route'
    if ($null -ne $route) { return [string]$route }
    $sourceKind = Get-OField $details 'sourceKind'
    if ($sourceKind -eq 'direct-url') { return 'direct-url' }
    return $null
}

function Get-OSafeLabel {
    param([AllowNull()][object]$Value)
    if ($null -eq $Value) { return 'UNAVAILABLE' }
    $text = [string]$Value
    if (-not $text) { return 'UNAVAILABLE' }
    $safe = [regex]::Replace($text, '[^A-Za-z0-9_.:-]', '_')
    if ($safe.Length -gt 96) { $safe = $safe.Substring(0, 96) }
    if (-not $safe) { return 'UNAVAILABLE' }
    return $safe
}

function Get-OElapsedMs {
    param([AllowNull()][object]$Record, [DateTimeOffset]$Start)
    $details = Get-ODetails $Record
    $value = Get-OField $details 'elapsedMs'
    $number = 0.0
    if ($null -ne $value -and [double]::TryParse([string]$value, [ref]$number) -and $number -ge 0) { return [Math]::Round($number, 3) }
    $stamp = Get-OTimestamp $Record
    if ($Start -ne [DateTimeOffset]::MinValue -and $stamp -ne [DateTimeOffset]::MinValue) {
        return [Math]::Max(0, [Math]::Round(($stamp - $Start).TotalMilliseconds, 3))
    }
    return $null
}

function Resolve-OLogDirectory {
    if ($LogRoot) {
        $candidate = [IO.Path]::GetFullPath($LogRoot)
        if ((Split-Path -Leaf $candidate) -ieq 'logs') { return $candidate }
        $nested = Join-Path $candidate 'logs'
        if (Test-Path -LiteralPath $nested -PathType Container) { return $nested }
        return $candidate
    }
    return Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'EmbyTheaterEnhanced\logs'
}

function Read-ORecords {
    param([string]$Directory, [DateTimeOffset]$ReferenceTime)
    $records = New-Object System.Collections.Generic.List[object]
    $filesRead = 0
    $malformed = 0
    $invalidUtf8 = 0
    $outside = 0
    $windowStart = $ReferenceTime.ToUniversalTime().AddMinutes(-$LookbackMinutes)
    $windowEnd = $ReferenceTime.ToUniversalTime().AddMinutes(1)
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
            Add-ObserverWarning 'client_log_read_failed'
            continue
        }
        foreach ($line in $lines) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            try { $record = ConvertFrom-Json -InputObject $line -ErrorAction Stop }
            catch { $malformed++; continue }
            $stamp = Get-OTimestamp $record
            if ($stamp -eq [DateTimeOffset]::MinValue) { $malformed++; continue }
            if ($stamp -lt $windowStart -or $stamp -gt $windowEnd) { $outside++; continue }
            $records.Add($record)
        }
    }
    if ($filesRead -eq 0) { Add-ObserverWarning 'client_log_not_found' }
    if ($malformed -gt 0) { Add-ObserverWarning 'client_log_malformed_lines_omitted' }
    if ($invalidUtf8 -gt 0) { Add-ObserverWarning 'client_log_invalid_utf8' }

    $seen = @{}
    $ordered = New-Object System.Collections.Generic.List[object]
    foreach ($record in @($records | Sort-Object { (Get-OTimestamp $_).UtcDateTime.Ticks })) {
        $key = Get-StableHash (($record | ConvertTo-Json -Compress -Depth 24))
        if ($seen.ContainsKey($key)) { continue }
        $seen[$key] = $true
        $ordered.Add($record)
    }
    return [ordered]@{
        records = @($ordered | ForEach-Object { $_ })
        filesRead = $filesRead
        malformedLinesOmitted = $malformed
        invalidUtf8Files = $invalidUtf8
        outsideWindowOmitted = $outside
    }
}

function Get-ORecordsForRequest {
    param([object[]]$Records, [string]$Category, [string]$RequestId)
    if ([string]::IsNullOrEmpty($RequestId)) { return @() }
    return @($Records | Where-Object {
        (Get-OCategory $_) -eq $Category -and (Get-ORequestId $_) -eq $RequestId
    } | Sort-Object { (Get-OTimestamp $_).UtcDateTime.Ticks })
}

function Get-ORecordsByCategory {
    param([object[]]$Records, [string]$Category)
    return @($Records | Where-Object { (Get-OCategory $_) -eq $Category } | Sort-Object { (Get-OTimestamp $_).UtcDateTime.Ticks })
}

function Get-OFirstField {
    param([object[]]$Records, [string[]]$Names)
    $namesArray = @($Names)
    foreach ($record in @($Records)) {
        $details = Get-ODetails $record
        foreach ($name in $namesArray) {
            $value = Get-OField $details $name
            if ($null -ne $value -and [string]$value) { return $value }
        }
    }
    return $null
}

function Get-OMediaIdentity {
    param([object[]]$Records)
    $names = @('itemId', 'itemIdHash', 'mediaSourceId', 'mediaSourceIdHash', 'sourcePath', 'sidecarPath', 'nativeSource', 'path', 'url')
    foreach ($record in @($Records)) {
        $details = Get-ODetails $record
        foreach ($name in $names) {
            $value = Get-OField $details $name
            if ($null -ne $value -and [string]$value) {
                return [ordered]@{ field = $name; mediaHash = Get-StableHash $value }
            }
        }
    }
    return [ordered]@{ field = 'UNAVAILABLE'; mediaHash = 'UNAVAILABLE' }
}

function Get-OAppContext {
    param([object[]]$Records, [DateTimeOffset]$SampleTime)
    $starts = @($Records | Where-Object { (Get-OCategory $_) -eq 'app' -and (Get-OEventName $_) -eq 'start' -and (Get-OTimestamp $_) -le $SampleTime } | Sort-Object { (Get-OTimestamp $_).UtcDateTime.Ticks })
    $appStart = if ($starts.Count) { $starts[-1] } else { $null }
    $appStartTime = if ($appStart) { (Get-OTimestamp $appStart).ToString('o') } else { 'UNAVAILABLE' }
    $runRecords = if ($appStart) { @($Records | Where-Object { (Get-OTimestamp $_) -ge (Get-OTimestamp $appStart) -and (Get-OTimestamp $_) -le $SampleTime }) } else { @($Records | Where-Object { (Get-OTimestamp $_) -le $SampleTime }) }
    $playbacks = @($runRecords | Where-Object { (Get-OCategory $_) -eq 'playback' -and (Get-OEventName $_) -eq 'play-request' } | Sort-Object { (Get-OTimestamp $_).UtcDateTime.Ticks })
    $firstPlayback = if ($playbacks.Count) { (Get-OTimestamp $playbacks[0]).ToString('o') } else { 'UNAVAILABLE' }
    $resolverEvents = @($runRecords | Where-Object { (Get-OCategory $_) -eq 'resolver' -and (Get-OEventName $_) -in @('context-observed','route-selected','invalid-context') })
    $initEvents = @($runRecords | Where-Object { (Get-OCategory $_) -eq 'resolver' -and (Get-OEventName $_) -match '(?i)^(init|initialized|ready|initialization)' })
    $initialization = if ($initEvents.Count) {
        [ordered]@{ status = 'OBSERVED'; event = Get-OEventName $initEvents[0]; timestamp = (Get-OTimestamp $initEvents[0]).ToString('o') }
    } else {
        [ordered]@{ status = 'UNAVAILABLE'; reason = 'no resolver-initialized event in existing client log'; firstResolverEvidenceAt = if ($resolverEvents.Count) { (Get-OTimestamp $resolverEvents[0]).ToString('o') } else { 'UNAVAILABLE' } }
    }
    return [ordered]@{
        appStartTime = $appStartTime
        firstPlaybackTime = $firstPlayback
        resolverInitializationState = $initialization
        runRecords = $runRecords
        appRunKey = if ($appStart) { Get-StableHash ((Get-OTimestamp $appStart).ToString('o')) } else { 'UNAVAILABLE' }
    }
}

function Get-OEventProjection {
    param([object]$Record, [DateTimeOffset]$TimelineStart, [string]$RequestId)
    $stamp = Get-OTimestamp $Record
    $details = Get-ODetails $Record
    $projection = [ordered]@{
        timestamp = $stamp.ToString('o')
        offsetMs = if ($TimelineStart -ne [DateTimeOffset]::MinValue) { [Math]::Max(0, [Math]::Round(($stamp - $TimelineStart).TotalMilliseconds, 3)) } else { $null }
        category = Get-OCategory $Record
        event = Get-OEventName $Record
    }
    $elapsed = Get-OElapsedMs $Record $TimelineStart
    if ($null -ne $elapsed) { $projection.elapsedMs = $elapsed }
    foreach ($name in @('mode','route','reason','sourceKind','cd2Reason','directReason','fallback','localExists','timeout','cancelled','candidateCount','isStrm','metadataRecoveryAttempted','strmIdentitySource','mediaSourceContainer','playMethod')) {
        $value = Get-OField $details $name
        if ($null -ne $value) {
            if ($name -in @('reason','sourceKind','cd2Reason','directReason','mode','route','strmIdentitySource','mediaSourceContainer','playMethod')) { $value = Get-OSafeLabel $value }
            $projection[$name] = $value
        }
    }
    $rule = Get-OField $details 'ruleId'
    if ($null -ne $rule) { $projection.ruleHash = Get-StableHash $rule }
    if ($RequestId) { $projection.requestHash = Get-StableHash $RequestId }
    return $projection
}

function Get-OStageList {
    param([object[]]$Records, [string]$Category, [string[]]$Events, [string]$RequestId, [DateTimeOffset]$Start)
    $names = @($Events)
    $selected = @($Records | Where-Object { (Get-OCategory $_) -eq $Category -and $names -contains (Get-OEventName $_) -and (Get-ORequestId $_) -eq $RequestId } | Sort-Object { (Get-OTimestamp $_).UtcDateTime.Ticks })
    return @($selected | ForEach-Object { Get-OEventProjection $_ $Start $RequestId })
}

function Get-OCd2Timeline {
    param([object[]]$Records, [string]$RequestId, [DateTimeOffset]$RouteTime)
    $events = @(Get-ORecordsForRequest $Records 'cd2' $RequestId)
    $startRecord = @($events | Where-Object { (Get-OEventName $_) -eq 'resolve-start' } | Select-Object -First 1)
    $terminal = @($events | Where-Object { (Get-OEventName $_) -in @('resolve-hit','resolve-miss','resolve-error','resolve-cancelled') } | Select-Object -Last 1)
    $startTime = if ($startRecord.Count) { Get-OTimestamp $startRecord[0] } else { [DateTimeOffset]::MinValue }
    $terminalDetails = if ($terminal.Count) { Get-ODetails $terminal[0] } else { [ordered]@{} }
    $findEvents = @(Get-OStageList $events 'cd2' @('find-file-start','find-file-end') $RequestId $startTime)
    $downloadEvents = @(Get-OStageList $events 'cd2' @('download-url-start','download-url-end') $RequestId $startTime)
    $findEnd = @($events | Where-Object { (Get-OEventName $_) -eq 'find-file-end' } | Select-Object -Last 1)
    $downloadStart = @($events | Where-Object { (Get-OEventName $_) -eq 'download-url-start' })
    $findResult = 'UNAVAILABLE'
    if ($findEnd.Count -and $downloadStart.Count) { $findResult = 'passed_to_download' }
    elseif ($terminal.Count -and -not $downloadStart.Count) { $findResult = Get-OSafeLabel (Get-OField $terminalDetails 'reason') }
    $hitSourceKind = if ($terminal.Count) { Get-OField $terminalDetails 'sourceKind' } else { $null }
    $urlGenerated = if ($terminal.Count -and (Get-OEventName $terminal[0]) -eq 'resolve-hit' -and $hitSourceKind) { $true } elseif ($terminal.Count) { $false } else { 'UNAVAILABLE' }
    $terminalReason = if ($terminal.Count) { Get-OSafeLabel (Get-OField $terminalDetails 'reason') } else { 'UNAVAILABLE' }
    $elapsed = if ($terminal.Count) { Get-OElapsedMs $terminal[0] $startTime } else { $null }
    if ($null -eq $elapsed -and $startTime -ne [DateTimeOffset]::MinValue -and $RouteTime -ne [DateTimeOffset]::MinValue) { $elapsed = [Math]::Max(0, [Math]::Round(($RouteTime - $startTime).TotalMilliseconds, 3)) }
    return [ordered]@{
        attemptObserved = if (@($events).Count) { $true } else { 'UNAVAILABLE' }
        resolveStart = if (@($startRecord).Count) { Get-OEventProjection $startRecord[0] $startTime $RequestId } else { $null }
        findFileObserved = if (@($findEvents).Count) { $true } else { 'UNAVAILABLE' }
        findFileResult = $findResult
        findFile = $findEvents
        getDownloadUrlObserved = if (@($downloadEvents).Count) { $true } else { 'UNAVAILABLE' }
        getDownloadUrl = $downloadEvents
        urlGenerated = $urlGenerated
        generatedSourceKind = if ($hitSourceKind) { Get-OSafeLabel $hitSourceKind } else { 'UNAVAILABLE' }
        terminalEvent = if (@($terminal).Count) { Get-OEventProjection $terminal[0] $startTime $RequestId } else { $null }
        terminalReason = $terminalReason
        elapsedMs = if ($null -ne $elapsed) { $elapsed } else { 'UNAVAILABLE' }
        recentEvents = @($events | ForEach-Object { Get-OEventProjection $_ $startTime $RequestId })
    }
}

function Get-OMountTimeline {
    param([object[]]$Records, [string]$RequestId, [DateTimeOffset]$TimelineStart)
    $events = @(Get-ORecordsForRequest $Records 'mount' $RequestId)
    $hits = @($events | Where-Object { (Get-OEventName $_) -eq 'resolve-hit' })
    $hit = if (@($hits).Count) { @($hits[@($hits).Count - 1]) } else { @() }
    $details = if (@($hit).Count) { Get-ODetails $hit[0] } elseif (@($events).Count) { Get-ODetails $events[@($events).Count - 1] } else { [ordered]@{} }
    return [ordered]@{
        observed = if (@($events).Count) { $true } else { 'UNAVAILABLE' }
        selected = if (@($hit).Count) { $true } else { $false }
        selectedReason = if (@($hit).Count) { Get-OSafeLabel (Get-OField $details 'reason') } else { 'UNAVAILABLE' }
        events = @($events | ForEach-Object { Get-OEventProjection $_ $TimelineStart $RequestId })
    }
}

function Get-OSample {
    param([object]$RouteRecord, [object[]]$Records, [string]$SampleName)
    $routeTime = Get-OTimestamp $RouteRecord
    $routeDetails = Get-ODetails $RouteRecord
    $requestId = Get-ORequestId $RouteRecord
    $requestRecords = if ($requestId) { @($Records | Where-Object { (Get-ORequestId $_) -eq $requestId } | Sort-Object { (Get-OTimestamp $_).UtcDateTime.Ticks }) } else { @() }
    $context = Get-OAppContext $Records $routeTime
    $runRecords = @($context.runRecords)
    $sampleCd2Start = @($requestRecords | Where-Object { (Get-OCategory $_) -eq 'cd2' -and (Get-OEventName $_) -eq 'resolve-start' } | Select-Object -First 1)
    $classificationTime = if (@($sampleCd2Start).Count) { Get-OTimestamp $sampleCd2Start[0] } else { $routeTime }
    $priorCd2 = @($runRecords | Where-Object { (Get-OCategory $_) -eq 'cd2' -and (Get-OEventName $_) -eq 'resolve-start' -and (Get-OTimestamp $_) -lt $classificationTime }).Count
    $priorReady = @($runRecords | Where-Object { (Get-OCategory $_) -eq 'cd2' -and (Get-OEventName $_) -eq 'client-ready' -and (Get-OTimestamp $_) -lt $classificationTime }).Count
    $startupClassification = if ($priorCd2 -eq 0 -and $priorReady -eq 0) { 'FIRST_CD2_OBSERVATION' } else { 'SUBSEQUENT_CD2_OBSERVATION' }
    $timelineStartRecord = @($requestRecords | Where-Object { (Get-OCategory $_) -eq 'playback' -and (Get-OEventName $_) -eq 'play-request' } | Select-Object -First 1)
    $timelineStart = if ($timelineStartRecord.Count) { Get-OTimestamp $timelineStartRecord[0] } elseif ($routeTime -ne [DateTimeOffset]::MinValue) { $routeTime } else { [DateTimeOffset]::MinValue }
    $media = Get-OMediaIdentity $requestRecords
    if ($media.mediaHash -eq 'UNAVAILABLE') { $media = Get-OMediaIdentity @($Records | Where-Object { (Get-OTimestamp $_) -le $routeTime }) }
    $rule = Get-OField $routeDetails 'ruleId'
    $strategy = Get-OFirstField $requestRecords @('strategy')
    $order = Get-OFirstField $requestRecords @('order','strategyOrder')
    $cd2 = Get-OCd2Timeline $Records $requestId $routeTime
    $mount = Get-OMountTimeline $Records $requestId $timelineStart
    $fallbackReason = Get-OField $routeDetails 'cd2Reason'
    if ($null -eq $fallbackReason) { $fallbackReason = Get-OField $routeDetails 'directReason' }
    if ($null -eq $fallbackReason -and $cd2.terminalReason -ne 'UNAVAILABLE') { $fallbackReason = $cd2.terminalReason }
    $requestProjection = if ($timelineStartRecord.Count) { Get-OEventProjection $timelineStartRecord[0] $timelineStart $requestId } else { $null }
    $routeProjection = Get-OEventProjection $RouteRecord $timelineStart $requestId
    $resolverEvents = @($requestRecords | Where-Object { (Get-OCategory $_) -eq 'resolver' -or (Get-OCategory $_) -eq 'playback' -or (Get-OCategory $_) -eq 'mount' } | Where-Object { (Get-OTimestamp $_) -le $routeTime } | Sort-Object { (Get-OTimestamp $_).UtcDateTime.Ticks })
    return [ordered]@{
        sample = $SampleName
        startupClassification = $startupClassification
        startupClassificationEvidence = [ordered]@{ priorCd2ResolveCount = $priorCd2; priorClientReadyCount = $priorReady; sampleCd2StartAt = if (@($sampleCd2Start).Count) { $classificationTime.ToString('o') } else { 'UNAVAILABLE' }; sameAppRun = ($context.appRunKey -ne 'UNAVAILABLE'); appRunKey = $context.appRunKey }
        directoryColdWarm = 'UNAVAILABLE'
        appStartTime = $context.appStartTime
        firstPlaybackTime = $context.firstPlaybackTime
        resolverInitializationState = $context.resolverInitializationState
        requestHash = if ($requestId) { Get-StableHash $requestId } else { 'UNAVAILABLE' }
        mediaIdentity = $media
        ruleMatched = if ($rule) { $true } else { 'UNAVAILABLE' }
        ruleHash = if ($rule) { Get-StableHash $rule } else { 'UNAVAILABLE' }
        strategy = if ($strategy) { Get-OSafeLabel $strategy } else { 'UNAVAILABLE' }
        order = if ($order) { @($order | ForEach-Object { Get-OSafeLabel $_ }) } else { @('UNAVAILABLE') }
        selectedRoute = Get-OSafeLabel (Get-ORoute $RouteRecord)
        routeReason = Get-OSafeLabel (Get-OField $routeDetails 'reason')
        fallbackReason = Get-OSafeLabel $fallbackReason
        mountSelectedReason = $mount.selectedReason
        cd2 = $cd2
        mount = $mount
        timeline = [ordered]@{
            start = if ($timelineStart -ne [DateTimeOffset]::MinValue) { $timelineStart.ToString('o') } else { 'UNAVAILABLE' }
            playRequest = $requestProjection
            events = @($resolverEvents | ForEach-Object { Get-OEventProjection $_ $timelineStart $requestId })
            routeSelected = $routeProjection
        }
    }
}

function Get-ORouteCandidates {
    param([object[]]$Records, [DateTimeOffset]$SelectionStart)
    return @($Records | Where-Object {
        (Get-OCategory $_) -eq 'resolver' -and (Get-OEventName $_) -eq 'route-selected' -and
        (Get-OTimestamp $_) -ge $SelectionStart -and
        (Get-ORoute $_) -in @('direct-url','mount')
    } | Sort-Object { (Get-OTimestamp $_).UtcDateTime.Ticks })
}

function Select-OPair {
    param([object[]]$DirectCandidates, [object[]]$MountCandidates, [object[]]$Records)
    $best = $null
    foreach ($direct in $DirectCandidates) {
        foreach ($mount in $MountCandidates) {
            $directSample = Get-OSample $direct $Records 'direct-url-hit'
            $mountSample = Get-OSample $mount $Records 'mount-fallback'
            $sameRule = $directSample.ruleHash -ne 'UNAVAILABLE' -and $directSample.ruleHash -eq $mountSample.ruleHash
            $sameMedia = $directSample.mediaIdentity.mediaHash -ne 'UNAVAILABLE' -and $directSample.mediaIdentity.mediaHash -eq $mountSample.mediaIdentity.mediaHash
            $score = if ($sameRule -and $sameMedia) { 3 } elseif ($sameRule) { 2 } elseif ($sameMedia) { 1 } else { 0 }
            if ($null -eq $best -or $score -gt $best.score) { $best = [pscustomobject]@{ score=$score; direct=$directSample; mount=$mountSample } }
        }
    }
    return $best
}

function New-OReport {
    param([object[]]$Records, [DateTimeOffset]$ObserverStartedAt, [DateTimeOffset]$ObservedUntil, [DateTimeOffset]$SelectionStart, [System.Collections.IDictionary]$ReadStats)
    $directCandidates = Get-ORouteCandidates $Records $SelectionStart | Where-Object { (Get-ORoute $_) -eq 'direct-url' }
    $mountCandidates = Get-ORouteCandidates $Records $SelectionStart | Where-Object { (Get-ORoute $_) -eq 'mount' }
    $pair = Select-OPair @($directCandidates) @($mountCandidates) $Records
    $status = if ($pair) { 'READY' } else { 'WAITING_FOR_DIRECT_URL_AND_MOUNT' }
    $comparison = [ordered]@{
        sameRule = if ($pair -and $pair.direct.ruleHash -ne 'UNAVAILABLE' -and $pair.direct.ruleHash -eq $pair.mount.ruleHash) { 'PASS' } elseif ($pair -and $pair.direct.ruleHash -ne 'UNAVAILABLE' -and $pair.mount.ruleHash -ne 'UNAVAILABLE') { 'FAIL' } else { 'UNAVAILABLE' }
        sameMedia = if ($pair -and $pair.direct.mediaIdentity.mediaHash -ne 'UNAVAILABLE' -and $pair.direct.mediaIdentity.mediaHash -eq $pair.mount.mediaIdentity.mediaHash) { 'PASS' } elseif ($pair -and $pair.direct.mediaIdentity.mediaHash -ne 'UNAVAILABLE' -and $pair.mount.mediaIdentity.mediaHash -ne 'UNAVAILABLE') { 'FAIL' } else { 'UNAVAILABLE' }
        directoryColdWarm = 'UNAVAILABLE'
        selectionBasis = if ($pair -and $pair.score -eq 3) { 'same-rule-and-media' } elseif ($pair -and $pair.score -eq 2) { 'same-rule-only' } elseif ($pair -and $pair.score -eq 1) { 'same-media-only' } elseif ($pair) { 'first-observed-pair' } else { 'UNAVAILABLE' }
        explanation = if ($pair) {
            @(
                ('direct-url route: cd2Reason={0}, cd2Terminal={1}, urlGenerated={2}' -f $pair.direct.fallbackReason, $pair.direct.cd2.terminalReason, $pair.direct.cd2.urlGenerated),
                ('mount route: cd2Reason={0}, cd2Terminal={1}, mountSelectedReason={2}' -f $pair.mount.fallbackReason, $pair.mount.cd2.terminalReason, $pair.mount.mountSelectedReason),
                'The observer reports existing evidence only; startup first/subsequent observation is not a directory hydration or cache conclusion.'
            )
        } else { @('A direct-url hit and a mount route have not both been observed in the selected window.') }
    }
    return [ordered]@{
        schemaVersion = $script:SchemaVersion
        tool = [ordered]@{ name = $script:ToolName; version = $script:ToolVersion }
        status = $status
        observerMode = if ($Once) { 'once' } else { 'live-read-only' }
        observerStartedAt = $ObserverStartedAt.ToString('o')
        observedUntil = $ObservedUntil.ToString('o')
        selectionStart = if ($SelectionStart -eq [DateTimeOffset]::MinValue) { 'LOOKBACK_START' } else { $SelectionStart.ToString('o') }
        source = [ordered]@{ logFilesRead = $ReadStats.filesRead; malformedLinesOmitted = $ReadStats.malformedLinesOmitted; invalidUtf8Files = $ReadStats.invalidUtf8Files; outsideWindowOmitted = $ReadStats.outsideWindowOmitted }
        candidates = [ordered]@{ directUrlCount = @($directCandidates).Count; mountCount = @($mountCandidates).Count }
        directUrlHit = if ($pair) { $pair.direct } else { $null }
        mountFallback = if ($pair) { $pair.mount } else { $null }
        startupClassification = [ordered]@{
            directUrl = if ($pair) { $pair.direct.startupClassification } else { 'UNAVAILABLE' }
            mountFallback = if ($pair) { $pair.mount.startupClassification } else { 'UNAVAILABLE' }
        }
        directoryColdWarm = 'UNAVAILABLE'
        comparison = $comparison
        warnings = @($script:ObserverWarnings)
        limitations = @(
            'No production observer, retry, cache warm, resolver call, CD2 call or fallback-order change is performed.',
            'Current client diagnostics do not emit resolver-initialized events; that field remains UNAVAILABLE unless future existing evidence provides it.',
            'Current client diagnostics do not provide parent-directory identity, enumerate, hydration or cache evidence; directoryColdWarm remains UNAVAILABLE.',
            'A same-media conclusion is PASS only when an existing ItemId, MediaSourceId or source identity is present in the selected log records; strategy/order remain UNAVAILABLE unless logged.'
        )
    }
}

function Write-OReport {
    param([System.Collections.IDictionary]$Report, [string]$TargetOutputRoot, [DateTimeOffset]$ObservedUntil, [switch]$InjectUnsafeOutput)
    $safeRoot = [IO.Path]::GetFullPath($TargetOutputRoot)
    if (-not (Test-Path -LiteralPath $safeRoot -PathType Container)) { New-Item -ItemType Directory -Path $safeRoot -Force | Out-Null }
    $name = 'ETE-CD2-Observer-' + $ObservedUntil.LocalDateTime.ToString('yyyyMMdd-HHmmss') + '.json'
    $path = Join-Path $safeRoot $name
    if (Test-Path -LiteralPath $path -PathType Leaf) { throw 'CD2 observer output already exists; choose another output root or second.' }
    $Report.redactionPassed = $false
    $Report.redactionWarnings = @()
    Write-JsonFile $path $Report
    if ($InjectUnsafeOutput) {
        [IO.File]::AppendAllText($path, "`nhttps://unsafe.invalid/media?token=observer-test-token`n", (New-Object Text.UTF8Encoding($false)))
    }
    $failures = @(Test-SnapshotRedaction -File $path)
    if ($failures.Count) {
        $Report.redactionWarnings = $failures
        Write-JsonFile $path $Report
        Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
        [Console]::Error.WriteLine('CD2 observer report failed the redaction gate; report was not retained.')
        exit 2
    }
    $Report.redactionPassed = $true
    $Report.redactionWarnings = @()
    Write-JsonFile $path $Report
    $secondPassFailures = @(Test-SnapshotRedaction -File $path)
    if ($secondPassFailures.Count) {
        Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
        [Console]::Error.WriteLine('CD2 observer report failed the final redaction gate; report was not retained.')
        exit 2
    }
    return $path
}

$observerStartedAt = [DateTimeOffset]::Now.ToUniversalTime()
$selectionStart = if ($PSBoundParameters.ContainsKey('Since')) { $Since.ToUniversalTime() } elseif ($Once) { [DateTimeOffset]::MinValue } else { $observerStartedAt }
$referenceTime = $observerStartedAt
$logDirectory = Resolve-OLogDirectory
$deadline = $observerStartedAt.AddSeconds($DurationSeconds)
$report = $null
$readStats = [ordered]@{ filesRead = 0; malformedLinesOmitted = 0; invalidUtf8Files = 0; outsideWindowOmitted = 0 }
do {
    $referenceTime = [DateTimeOffset]::Now.ToUniversalTime()
    $read = Read-ORecords $logDirectory $referenceTime
    $readStats = $read
    $report = New-OReport @($read.records) $observerStartedAt $referenceTime $selectionStart $read
    if ($report.status -eq 'READY' -or $Once) { break }
    if ($referenceTime -ge $deadline) { break }
    Start-Sleep -Milliseconds $PollMilliseconds
} while ($true)

$reportPath = Write-OReport $report $OutputRoot $referenceTime -InjectUnsafeOutput:$TestInjectUnsafeOutput
$result = [ordered]@{
    status = $report.status
    report = Split-Path -Leaf $reportPath
    directUrlObserved = ($null -ne $report.directUrlHit)
    mountFallbackObserved = ($null -ne $report.mountFallback)
    sameRule = $report.comparison.sameRule
    sameMedia = $report.comparison.sameMedia
    directStartupClassification = if ($report.directUrlHit) { $report.directUrlHit.startupClassification } else { 'UNAVAILABLE' }
    mountStartupClassification = if ($report.mountFallback) { $report.mountFallback.startupClassification } else { 'UNAVAILABLE' }
    directoryColdWarm = 'UNAVAILABLE'
    redactionPassed = [bool]$report.redactionPassed
    warnings = @($script:ObserverWarnings)
}
$result | ConvertTo-Json -Compress
if ($report.status -ne 'READY') { exit 3 }
