# Black-box contract test for tools/observe-cd2-cold-warm.ps1.
# The fixture models existing sanitized client events only.  It does not call
# CD2, touch a cache, run a resolver, or start a playback client.

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

function Write-JsonUtf8 {
    param([string]$Path, [object]$Value)
    [IO.File]::WriteAllText($Path, (($Value | ConvertTo-Json -Compress -Depth 20) + "`n"), (New-Object Text.UTF8Encoding($false)))
}

function New-Record {
    param([DateTimeOffset]$Timestamp, [string]$Category, [string]$Event, [string]$Level = 'info', [object]$Details = $null)
    return [ordered]@{
        schemaVersion = 1
        timestamp = $Timestamp.ToUniversalTime().ToString('o')
        level = $Level
        category = $Category
        event = $Event
        details = if ($null -eq $Details) { [ordered]@{} } else { $Details }
    }
}

function New-Fixture {
    param([string]$Root)
    $logRoot = Join-Path $Root 'logs'
    New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
    $capture = [DateTimeOffset]::Now.ToUniversalTime().AddSeconds(-20)
    $raw = [ordered]@{
        serverUrl = 'https://fake.example.test/direct/file?token=fake-observer-token'
        mediaPath = 'C:\Users\fake-user\Media\same-media.mkv'
        itemId = 'fake-item-observer-001'
        mediaSourceId = 'fake-source-observer-002'
        ruleId = 'fake-rule-observer-003'
        requestOne = 'fake-request-observer-004'
        requestTwo = 'fake-request-observer-005'
    }
    $common = [ordered]@{
        ruleId = $raw.ruleId
        strategy = 'cloud-first'
        order = @('direct-url','cd2-http','mount','native')
        itemId = $raw.itemId
        mediaSourceId = $raw.mediaSourceId
        sourcePath = $raw.mediaPath
    }
    $records = @(
        (New-Record $capture.AddSeconds(-10) 'app' 'start' 'info' ([ordered]@{appVersion='0.2.0'; buildCommit=('c' * 40)})),
        (New-Record $capture.AddSeconds(1) 'playback' 'play-request' 'info' ([ordered]@{requestId=$raw.requestOne; playRequestId=$raw.requestOne; itemId=$raw.itemId; mediaSourceId=$raw.mediaSourceId; sourcePath=$raw.mediaPath})),
        (New-Record $capture.AddSeconds(2) 'resolver' 'context-observed' 'info' ([ordered]@{requestId=$raw.requestOne; itemId=$raw.itemId; sourcePath=$raw.mediaPath; mediaSourceContainer='strm'; playMethod='DirectPlay'})),
        (New-Record $capture.AddSeconds(3) 'cd2' 'resolve-start' 'info' ([ordered]@{requestId=$raw.requestOne; ruleId=$raw.ruleId; mode='direct'; candidateCount=1})),
        (New-Record $capture.AddSeconds(3.1) 'cd2' 'client-ready' 'info' ([ordered]@{requestId=$raw.requestOne; mode='direct'; elapsedMs=100})),
        (New-Record $capture.AddSeconds(3.2) 'cd2' 'find-file-start' 'info' ([ordered]@{requestId=$raw.requestOne; mode='direct'; elapsedMs=200})),
        (New-Record $capture.AddSeconds(3.5) 'cd2' 'find-file-end' 'info' ([ordered]@{requestId=$raw.requestOne; mode='direct'; elapsedMs=500})),
        (New-Record $capture.AddSeconds(3.6) 'cd2' 'download-url-start' 'info' ([ordered]@{requestId=$raw.requestOne; mode='direct'; elapsedMs=600})),
        (New-Record $capture.AddSeconds(3.9) 'cd2' 'download-url-end' 'info' ([ordered]@{requestId=$raw.requestOne; mode='direct'; elapsedMs=900; url=$raw.serverUrl})),
        (New-Record $capture.AddSeconds(4) 'cd2' 'resolve-hit' 'info' ([ordered]@{requestId=$raw.requestOne; ruleId=$raw.ruleId; mode='direct'; reason='direct_url_hit'; elapsedMs=1000; sourceKind='direct-url'; url=$raw.serverUrl})),
        (New-Record $capture.AddSeconds(4.1) 'resolver' 'route-selected' 'info' ([ordered]@{requestId=$raw.requestOne; ruleId=$raw.ruleId; strategy=$common.strategy; order=$common.order; route='direct-url'; reason='direct_url_hit'; sourceKind='direct-url'; cd2Reason='direct_url_hit'; itemId=$raw.itemId; mediaSourceId=$raw.mediaSourceId; sourcePath=$raw.mediaPath})),
        (New-Record $capture.AddSeconds(4.2) 'playback' 'resolver-complete' 'info' ([ordered]@{requestId=$raw.requestOne; route='direct-url'; reason='direct_url_hit'; sourceKind='direct-url'})),
        (New-Record $capture.AddSeconds(4.3) 'playback' 'loadfile-requested' 'info' ([ordered]@{requestId=$raw.requestOne; route='direct-url'; sourceKind='direct-url'})),
        (New-Record $capture.AddSeconds(4.5) 'playback' 'core-playing' 'info' ([ordered]@{requestId=$raw.requestOne})),
        (New-Record $capture.AddSeconds(10) 'playback' 'play-request' 'info' ([ordered]@{requestId=$raw.requestTwo; playRequestId=$raw.requestTwo; itemId=$raw.itemId; mediaSourceId=$raw.mediaSourceId; sourcePath=$raw.mediaPath})),
        (New-Record $capture.AddSeconds(11) 'resolver' 'context-observed' 'info' ([ordered]@{requestId=$raw.requestTwo; itemId=$raw.itemId; sourcePath=$raw.mediaPath; mediaSourceContainer='strm'; playMethod='DirectPlay'})),
        (New-Record $capture.AddSeconds(12) 'cd2' 'resolve-start' 'info' ([ordered]@{requestId=$raw.requestTwo; ruleId=$raw.ruleId; mode='direct'; candidateCount=1})),
        (New-Record $capture.AddSeconds(12.1) 'cd2' 'client-ready' 'info' ([ordered]@{requestId=$raw.requestTwo; mode='direct'; elapsedMs=100})),
        (New-Record $capture.AddSeconds(12.2) 'cd2' 'find-file-start' 'info' ([ordered]@{requestId=$raw.requestTwo; mode='direct'; elapsedMs=200})),
        (New-Record $capture.AddSeconds(12.5) 'cd2' 'find-file-end' 'info' ([ordered]@{requestId=$raw.requestTwo; mode='direct'; elapsedMs=500})),
        (New-Record $capture.AddSeconds(12.6) 'cd2' 'resolve-miss' 'warn' ([ordered]@{requestId=$raw.requestTwo; ruleId=$raw.ruleId; mode='direct'; reason='not_found'; elapsedMs=600})),
        (New-Record $capture.AddSeconds(12.7) 'mount' 'resolve-start' 'info' ([ordered]@{requestId=$raw.requestTwo; ruleId=$raw.ruleId; candidateCount=1})),
        (New-Record $capture.AddSeconds(12.9) 'mount' 'resolve-hit' 'info' ([ordered]@{requestId=$raw.requestTwo; ruleId=$raw.ruleId; reason='mount_hit'; localExists=$true; mappedPathHash='fake-mapped-hash'})),
        (New-Record $capture.AddSeconds(13) 'resolver' 'route-selected' 'info' ([ordered]@{requestId=$raw.requestTwo; ruleId=$raw.ruleId; strategy=$common.strategy; order=$common.order; route='mount'; reason='mount_hit'; sourceKind='mount'; cd2Reason='not_found'; fallback=$true; itemId=$raw.itemId; mediaSourceId=$raw.mediaSourceId; sourcePath=$raw.mediaPath})),
        (New-Record $capture.AddSeconds(13.1) 'playback' 'resolver-complete' 'info' ([ordered]@{requestId=$raw.requestTwo; route='mount'; reason='mount_hit'; sourceKind='mount'; fallback=$true})),
        (New-Record $capture.AddSeconds(13.2) 'playback' 'loadfile-requested' 'info' ([ordered]@{requestId=$raw.requestTwo; route='mount'; sourceKind='mount'})),
        (New-Record $capture.AddSeconds(13.4) 'playback' 'core-playing' 'info' ([ordered]@{requestId=$raw.requestTwo}))
    )
    $lines = @($records | ForEach-Object { $_ | ConvertTo-Json -Compress -Depth 20 })
    [IO.File]::WriteAllText((Join-Path $logRoot 'ete-client.jsonl'), (($lines -join "`n") + "`n{malformed-json`n"), (New-Object Text.UTF8Encoding($false)))
    $invalidBytes = [byte[]](0x7b, 0x22, 0x6f, 0x6b, 0x22, 0x3a, 0xff, 0xfe, 0x7d, 0x0a)
    [IO.File]::WriteAllBytes((Join-Path $logRoot 'ete-client.jsonl.1'), $invalidBytes)
    return [pscustomobject]@{LogRoot=$logRoot; Capture=$capture; Raw=$raw}
}

function Invoke-Observer {
    param([string]$ScriptPath, [string]$OutputRoot, [string]$LogRoot)
    $ps51 = 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
    $args = @('-NoProfile','-ExecutionPolicy','Bypass','-File',$ScriptPath,'-OutputRoot',$OutputRoot,'-LogRoot',$LogRoot,'-Once')
    $lines = @(& $ps51 @args 2>&1)
    $exitCode = $LASTEXITCODE
    Assert-True ($exitCode -eq 0) "Observer exited with $exitCode. Output: $($lines -join "`n")"
    $result = $null
    foreach ($line in @($lines | Select-Object -Last 8)) {
        try { $candidate = ConvertFrom-Json -InputObject ([string]$line) -ErrorAction Stop; if ($candidate.report) { $result = $candidate } } catch { }
    }
    Assert-True ($null -ne $result) 'Observer result JSON is missing.'
    $reportPath = Join-Path $OutputRoot ([string]$result.report)
    Assert-True (Test-Path -LiteralPath $reportPath -PathType Leaf) 'Observer report JSON is missing.'
    $report = Get-Content -LiteralPath $reportPath -Raw -Encoding UTF8 | ConvertFrom-Json
    return [pscustomobject]@{Result=$result; ReportPath=$reportPath; Report=$report}
}

function Invoke-ObserverRaw {
    param([string]$ScriptPath, [string]$OutputRoot, [string]$LogRoot, [string[]]$ExtraArguments)
    $ps51 = 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
    $arguments = @('-NoProfile','-ExecutionPolicy','Bypass','-File',$ScriptPath,'-OutputRoot',$OutputRoot,'-LogRoot',$LogRoot)
    $arguments += $ExtraArguments
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = @(& $ps51 @arguments 2>&1)
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorAction
    }
    return [pscustomobject]@{ExitCode=$exitCode; Output=$output}
}

function Get-TextFromPath {
    param([string]$Path)
    return [Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($Path))
}

$workspace = Join-Path ([IO.Path]::GetTempPath()) ('ete-cd2-observer-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $workspace | Out-Null
try {
    $fixture = New-Fixture $workspace
    $outputRoot = Join-Path $workspace 'output'
    New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
    $observer = Invoke-Observer -ScriptPath (Join-Path $PSScriptRoot '..\tools\observe-cd2-cold-warm.ps1') -OutputRoot $outputRoot -LogRoot $fixture.LogRoot
    Assert-True ($observer.Result.status -eq 'READY') 'Observer did not report READY.'
    Assert-True ($observer.Result.directUrlObserved -eq $true) 'DirectUrl hit was not observed.'
    Assert-True ($observer.Result.mountFallbackObserved -eq $true) 'Mount fallback was not observed.'
    Assert-True ($observer.Result.sameRule -eq 'PASS') 'Same-rule comparison did not pass.'
    Assert-True ($observer.Result.sameMedia -eq 'PASS') 'Same-media comparison did not pass.'
    Assert-True ($observer.Result.redactionPassed -eq $true) 'Observer redaction gate did not pass.'
    Assert-True ($observer.Report.directUrlHit.startupClassification -eq 'FIRST_CD2_OBSERVATION') 'DirectUrl sample was not classified as the first CD2 observation.'
    Assert-True ($observer.Report.mountFallback.startupClassification -eq 'SUBSEQUENT_CD2_OBSERVATION') 'Mount sample was not classified as a subsequent CD2 observation.'
    Assert-True ($observer.Report.directUrlHit.directoryColdWarm -eq 'UNAVAILABLE') 'DirectUrl sample exposed an unsupported directory cold/warm conclusion.'
    Assert-True ($observer.Report.mountFallback.directoryColdWarm -eq 'UNAVAILABLE') 'Mount sample exposed an unsupported directory cold/warm conclusion.'
    Assert-True ($observer.Report.directoryColdWarm -eq 'UNAVAILABLE') 'Report exposed an unsupported directory cold/warm conclusion.'
    Assert-True ($observer.Report.directUrlHit.selectedRoute -eq 'direct-url') 'DirectUrl route is incorrect.'
    Assert-True ($observer.Report.mountFallback.selectedRoute -eq 'mount') 'Mount route is incorrect.'
    Assert-True ($observer.Report.directUrlHit.cd2.findFileResult -eq 'passed_to_download') 'DirectUrl FindFile result is incorrect.'
    Assert-True ($observer.Report.mountFallback.cd2.findFileResult -eq 'not_found') 'Mount FindFile result is incorrect.'
    Assert-True ($observer.Report.directUrlHit.cd2.urlGenerated -eq $true) 'DirectUrl generated evidence is missing.'
    Assert-True ($observer.Report.mountFallback.cd2.urlGenerated -eq $false) 'Mount fallback incorrectly reports generated URL.'
    Assert-True ($observer.Report.directUrlHit.cd2.getDownloadUrlObserved -eq $true) 'DirectUrl download evidence is missing.'
    Assert-True ($observer.Report.mountFallback.cd2.getDownloadUrlObserved -eq 'UNAVAILABLE') 'Mount fallback unexpectedly reports download evidence.'
    Assert-True ($observer.Report.mountFallback.fallbackReason -eq 'not_found') 'Mount fallback reason is incorrect.'
    Assert-True ($observer.Report.mountFallback.mountSelectedReason -eq 'mount_hit') 'Mount selected reason is incorrect.'
    Assert-True ($observer.Report.directUrlHit.strategy -eq 'cloud-first') 'Strategy evidence is incorrect.'
    Assert-True (@($observer.Report.directUrlHit.order).Count -eq 4) 'Order evidence is incomplete.'
    Assert-True ($observer.Report.directUrlHit.resolverInitializationState.status -eq 'UNAVAILABLE') 'Resolver initialization was guessed.'
    Assert-True ($observer.Report.startupClassification.directUrl -eq 'FIRST_CD2_OBSERVATION') 'Top-level DirectUrl startup classification is incorrect.'
    Assert-True ($observer.Report.startupClassification.mountFallback -eq 'SUBSEQUENT_CD2_OBSERVATION') 'Top-level Mount startup classification is incorrect.'
    Assert-True ($observer.Report.source.invalidUtf8Files -eq 1) 'Invalid UTF-8 warning evidence is missing.'
    Assert-True ($observer.Report.source.malformedLinesOmitted -gt 0) 'Malformed JSONL warning evidence is missing.'

    $waitingRoot = Join-Path $workspace 'waiting-output'
    $waitingLog = Join-Path $workspace 'waiting-logs'
    New-Item -ItemType Directory -Force -Path $waitingLog | Out-Null
    $waiting = Invoke-ObserverRaw -ScriptPath (Join-Path $PSScriptRoot '..\tools\observe-cd2-cold-warm.ps1') -OutputRoot $waitingRoot -LogRoot $waitingLog -ExtraArguments @('-Once')
    Assert-True ($waiting.ExitCode -eq 3) "Insufficient evidence must return exit 3, not $($waiting.ExitCode)."
    $waitingReportPath = Get-ChildItem -LiteralPath $waitingRoot -Filter 'ETE-CD2-Observer-*.json' -File | Select-Object -First 1
    Assert-True ($null -ne $waitingReportPath) 'Waiting observer did not retain its safe report.'
    $waitingReport = Get-Content -LiteralPath $waitingReportPath.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
    Assert-True ($waitingReport.status -eq 'WAITING_FOR_DIRECT_URL_AND_MOUNT') 'Waiting observer status is incorrect.'
    Assert-True ($waitingReport.redactionPassed -eq $true) 'Waiting observer report did not pass redaction.'

    $redactionRoot = Join-Path $workspace 'redaction-output'
    $redaction = Invoke-ObserverRaw -ScriptPath (Join-Path $PSScriptRoot '..\tools\observe-cd2-cold-warm.ps1') -OutputRoot $redactionRoot -LogRoot $fixture.LogRoot -ExtraArguments @('-Once','-TestInjectUnsafeOutput')
    Assert-True ($redaction.ExitCode -eq 2) "Redaction refusal must return exit 2, not $($redaction.ExitCode)."
    Assert-True (@(Get-ChildItem -LiteralPath $redactionRoot -Filter 'ETE-CD2-Observer-*.json' -File -ErrorAction SilentlyContinue).Count -eq 0) 'Redaction refusal retained an observer report.'

    $text = Get-TextFromPath $observer.ReportPath
    foreach ($entry in $fixture.Raw.GetEnumerator()) {
        Assert-True (-not $text.Contains([string]$entry.Value)) "Raw fixture $($entry.Key) leaked into observer report."
    }
    Write-Output 'cd2 cold/warm observer self-test: PASS'
}
finally {
    if (Test-Path -LiteralPath $workspace) { Remove-Item -LiteralPath $workspace -Recurse -Force -ErrorAction SilentlyContinue }
}
