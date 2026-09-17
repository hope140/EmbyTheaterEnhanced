# Black-box contract test for tools/report-playback-issue.ps1.
# All media, URL, ID and token values below are synthetic and must not leave
# the temporary fixture in raw form.

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

function Write-JsonUtf8 {
    param([string]$Path, [object]$Value)
    [IO.File]::WriteAllText($Path, (($Value | ConvertTo-Json -Compress -Depth 16) + "`n"), (New-Object Text.UTF8Encoding($false)))
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
    $installRoot = Join-Path $Root 'install'
    New-Item -ItemType Directory -Force -Path $logRoot, (Join-Path $installRoot 'electronapp') | Out-Null
    $capture = [DateTimeOffset]::Now.ToUniversalTime().AddSeconds(-20)
    $raw = [ordered]@{
        token = 'fake-token-issue-snapshot-7b31'
        serverUrl = 'https://fake.example.test/Items/fake-item?api_key=fake-api-key&token=fake-token-issue-snapshot-7b31'
        windowsPath = 'C:\Users\fake-user\Media\Movie\fake-media.mkv'
        uncPath = '\\fake-host\share\Media\fake-media.mkv'
        posixPath = '/media/Movie/fake-media.mkv'
        deviceId = 'fake-device-id-001'
        sessionId = 'fake-session-id-002'
        playSessionId = 'fake-play-session-id-003'
        mediaSourceId = 'fake-media-source-id-004'
        itemId = 'fake-item-id-005'
        pickcode = 'fake-pickcode-006'
        userNote = 'issue https://fake.example.test/Items/fake-item?token=fake-token-issue-snapshot-7b31 at C:\Users\fake-user\Media\Movie\fake-media.mkv'
    }
    $records = @(
        (New-Record $capture.AddSeconds(-8) 'app' 'start' 'info' ([ordered]@{appVersion='0.2.0'; buildCommit=('a' * 40); bridgeMode='native-helper'; windowState='Fullscreen'})),
        (New-Record $capture.AddSeconds(-7) 'native-helper' 'helper-ready' 'info' ([ordered]@{protocolVersion=1; helperVersion='fake-helper'; libmpvVersion='fake-mpv'; helperInstanceId='fake-helper-instance'})),
        (New-Record $capture.AddSeconds(-6) 'playback' 'play-request' 'info' ([ordered]@{requestId='fake-request-100'; generationId='fake-generation-101'; currentPlayer='native-helper'; ItemId=$raw.itemId; sourcePath=$raw.windowsPath})),
        (New-Record $capture.AddSeconds(-5) 'resolver' 'route-selected' 'info' ([ordered]@{requestId='fake-request-100'; playRequestId='fake-request-100'; ruleId='fake-rule-102'; strategy='custom'; order=@('direct-url','cd2-http','mount','native'); route='mount'; reason='mount_hit'; sourceKind='mount'; fallback='native'; cd2Reason='direct_url_miss'; sourcePath=$raw.windowsPath; directUrl=$raw.serverUrl; ItemId=$raw.itemId})),
        (New-Record $capture.AddSeconds(-4) 'cd2' 'resolve-start' 'info' ([ordered]@{requestId='fake-request-100'; ruleId='fake-rule-102'; mode='direct-url'; sourcePath=$raw.windowsPath; SessionId=$raw.sessionId})),
        (New-Record $capture.AddSeconds(-3) 'cd2' 'find-file-start' 'info' ([ordered]@{requestId='fake-request-100'; ruleId='fake-rule-102'; sourcePath=$raw.windowsPath; pickcode=$raw.pickcode})),
        (New-Record $capture.AddSeconds(-2) 'cd2' 'find-file-end' 'info' ([ordered]@{requestId='fake-request-100'; ruleId='fake-rule-102'; result='miss'; reason='not-found'; elapsedMs=210; pickcode=$raw.pickcode})),
        (New-Record $capture.AddSeconds(-1) 'cd2' 'download-url-end' 'warn' ([ordered]@{requestId='fake-request-100'; ruleId='fake-rule-102'; sourceKind='direct-url'; reason='direct_url_unavailable'; elapsedMs=320; url=$raw.serverUrl})),
        (New-Record $capture 'cd2' 'resolve-error' 'error' ([ordered]@{requestId='fake-request-100'; ruleId='fake-rule-102'; reason='transport-failure'; elapsedMs=380; Authorization=('Bearer ' + $raw.token)})),
        (New-Record $capture.AddSeconds(1) 'mount' 'resolve-start' 'info' ([ordered]@{requestId='fake-request-100'; ruleId='fake-rule-102'; mappedPath=$raw.uncPath})),
        (New-Record $capture.AddSeconds(2) 'mount' 'resolve-hit' 'info' ([ordered]@{requestId='fake-request-100'; ruleId='fake-rule-102'; reason='mount_hit'; localExists=$true; mappedPath=$raw.uncPath})),
        (New-Record $capture.AddSeconds(3) 'playback' 'core-playing' 'info' ([ordered]@{requestId='fake-request-100'; generationId='fake-generation-101'; currentPlayer='native-helper'; MediaSourceId=$raw.mediaSourceId})),
        (New-Record $capture.AddSeconds(4) 'session' 'playing' 'info' ([ordered]@{ownSessionPresent=$true; nowPlayingPresent=$true; webSocketState='connected'; reportStart='ok'; reportProgress='ok'; ItemId=$raw.itemId; SessionId=$raw.sessionId; PlaySessionId=$raw.playSessionId})),
        (New-Record $capture.AddSeconds(5) 'native-helper' 'operation-error' 'error' ([ordered]@{reason='generation-required'; helperInstanceId='fake-helper-instance'; message='bridge_error generation-required'})),
        (New-Record $capture.AddSeconds(6) 'renderer' 'unhandled-rejection' 'error' ([ordered]@{message='renderer ReferenceError at ' + $raw.windowsPath; ItemId=$raw.itemId})),
        (New-Record $capture.AddSeconds(7) 'native-helper' 'process-close' 'error' ([ordered]@{reason='helper-terminal'; helperInstanceId='fake-helper-instance'})),
        (New-Record $capture.AddSeconds(8) 'app' 'window-state' 'info' ([ordered]@{state='Fullscreen'; fullscreen=$true}))
    )
    $currentLines = @($records | ForEach-Object { $_ | ConvertTo-Json -Compress -Depth 16 })
    $currentText = (($currentLines -join "`n") + "`n{malformed-json`n")
    [IO.File]::WriteAllText((Join-Path $logRoot 'ete-client.jsonl'), $currentText, (New-Object Text.UTF8Encoding($false)))
    $rotated = New-Record $capture.AddSeconds(-9) 'playback' 'rotation-marker' 'info' ([ordered]@{ItemId=$raw.itemId})
    [IO.File]::WriteAllText((Join-Path $logRoot 'ete-client.jsonl.1'), (($rotated | ConvertTo-Json -Compress -Depth 16) + "`n"), (New-Object Text.UTF8Encoding($false)))
    $invalidBytes = [byte[]](0x7b, 0x22, 0x6f, 0x6b, 0x22, 0x3a, 0xff, 0xfe, 0x7d, 0x0a)
    [IO.File]::WriteAllBytes((Join-Path $logRoot 'ete-client.jsonl.2'), $invalidBytes)
    $package = [ordered]@{name='fake-runtime'; version='0.2.0'}
    $provenance = [ordered]@{sourceCommit=('b' * 40)}
    Write-JsonUtf8 (Join-Path $installRoot 'electronapp\package.json') $package
    Write-JsonUtf8 (Join-Path $installRoot 'electronapp\runtime-provenance.json') $provenance
    return [pscustomobject]@{ LogRoot=$logRoot; InstallRoot=$installRoot; Capture=$capture; Raw=$raw }
}

function Invoke-Reporter {
    param(
        [string]$ScriptPath,
        [string]$OutputRoot,
        [string]$TargetLogRoot,
        [string]$TargetInstallRoot,
        [DateTimeOffset]$Capture,
        [string]$Type,
        [AllowEmptyString()][string]$Note,
        [switch]$Zip
    )
    $args = @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $ScriptPath,
        '-OutputRoot', $OutputRoot,
        '-LogRoot', $TargetLogRoot,
        '-InstallRoot', $TargetInstallRoot,
        '-IssueType', $Type,
        '-CaptureTime', $Capture.ToString('o'),
        '-MaxLogLines', '256',
        '-SkipWindowsEvents'
    )
    if ([string]::IsNullOrEmpty($Note)) { $args += '-EmptyUserNote' } else { $args += @('-UserNote', $Note) }
    if (-not $Zip) { $args += '-NoZip' }
    $ps51 = 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
    $output = @(& $ps51 @args 2>&1)
    $exitCode = $LASTEXITCODE
    $result = $null
    foreach ($line in @($output | Select-Object -Last 8)) {
        try {
            $candidate = ConvertFrom-Json -InputObject ([string]$line) -ErrorAction Stop
            if ($candidate.status) { $result = $candidate }
        } catch { }
    }
    Assert-True ($exitCode -eq 0) "Reporter exited with $exitCode. Output: $($output -join "`n")"
    Assert-True ($null -ne $result) 'Reporter did not return a result JSON.'
    $stamp = $Capture.LocalDateTime.ToString('yyyyMMdd-HHmmss')
    $issuePath = Join-Path $OutputRoot ('ETE-Issue-' + $stamp + '.json')
    Assert-True (Test-Path -LiteralPath $issuePath -PathType Leaf) 'Issue snapshot JSON is missing.'
    $issue = Get-Content -LiteralPath $issuePath -Raw -Encoding UTF8 | ConvertFrom-Json
    $bundlePath = if ($result.bundle) { Join-Path $OutputRoot ([string]$result.bundle) } else { $null }
    $manifest = if ($bundlePath) { Get-Content -LiteralPath (Join-Path $bundlePath 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json } else { $null }
    return [pscustomobject]@{ Result=$result; IssuePath=$issuePath; Issue=$issue; BundlePath=$bundlePath; Manifest=$manifest; ZipPath=if ($result.zip) { Join-Path $OutputRoot ([string]$result.zip) } else { $null } }
}

function Get-TextFromFiles {
    param([string[]]$Paths)
    $parts = foreach ($path in $Paths) {
        if (Test-Path -LiteralPath $path -PathType Leaf) { [Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($path)) }
        elseif (Test-Path -LiteralPath $path -PathType Container) {
            foreach ($file in Get-ChildItem -LiteralPath $path -File -Recurse) { [Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($file.FullName)) }
        }
    }
    return ($parts -join "`n")
}

function Assert-NoRawSecrets {
    param([string]$Text, [System.Collections.IDictionary]$Raw)
    foreach ($entry in $Raw.GetEnumerator()) {
        Assert-True (-not [string]::IsNullOrEmpty([string]$entry.Value)) "Fixture value for $($entry.Key) is empty."
        Assert-True (-not $Text.Contains([string]$entry.Value)) "Raw $($entry.Key) leaked into diagnostic output."
    }
}

function Assert-ZipNoRawSecrets {
    param([string]$ZipPath, [System.Collections.IDictionary]$Raw)
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($ZipPath)
    try {
        foreach ($entry in $archive.Entries) {
            $reader = New-Object IO.StreamReader($entry.Open(), [Text.Encoding]::UTF8, $true)
            try { Assert-NoRawSecrets -Text $reader.ReadToEnd() -Raw $Raw } finally { $reader.Dispose() }
        }
    } finally { $archive.Dispose() }
}

$workspace = Join-Path ([IO.Path]::GetTempPath()) ('ete-issue-snapshot-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $workspace | Out-Null
try {
    . (Join-Path $PSScriptRoot '..\tools\diagnostics-common.ps1')
    $fixture = New-Fixture -Root $workspace
    $reporter = Join-Path $PSScriptRoot '..\tools\report-playback-issue.ps1'
    $outputRoot = Join-Path $workspace 'outputs'
    New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
    $types = @('startup','playback-failure','seek','pause-resume','next-track','cd2-or-mount','mount-fallback','remote-control','fullscreen-ui','crash-exit','other')
    $runs = New-Object System.Collections.Generic.List[object]
    for ($index = 0; $index -lt $types.Count; $index++) {
        $typeNote = if ($types[$index] -eq 'other') { '' } else { 'fixture note' }
        $run = Invoke-Reporter -ScriptPath $reporter -OutputRoot $outputRoot -TargetLogRoot $fixture.LogRoot -TargetInstallRoot $fixture.InstallRoot -Capture $fixture.Capture.AddSeconds($index * 2) -Type $types[$index] -Note $typeNote
        Assert-True ($run.Result.status -eq 'READY') "Issue type $($types[$index]) was not ready."
        Assert-True ($run.Issue.issueType -eq $types[$index]) "Issue type mismatch for $($types[$index])."
        Assert-True ([string]$run.Issue.issueCorrelationId -match '^[0-9a-f]{32}$') 'Correlation ID is not a random hexadecimal value.'
        $noteOkay = $types[$index] -ne 'other' -or [string]$run.Issue.userNote -eq ''
        Assert-True $noteOkay 'Empty Other note was not preserved.'
        Assert-True ($run.Issue.snapshotElapsedMs -lt 2000) "Snapshot elapsed exceeded 2 seconds for $($types[$index])."
        Assert-True ($run.Result.correlationMatches -eq $true) "Correlation linkage failed for $($types[$index])."
        Assert-True ($run.Result.redactionPassed -eq $true) "Redaction did not pass for $($types[$index])."
        [void]$runs.Add($run)
    }
    $rich = $runs[0]
    Assert-True ($rich.Issue.product.appVersion -eq '0.2.0') 'Product appVersion was not observed.'
    Assert-True ($rich.Issue.product.bridgeMode -eq 'native-helper') 'Product bridgeMode was not observed.'
    Assert-True ($rich.Issue.processState.embyHostRunning -eq $false) 'Program-not-running evidence is incorrect.'
    Assert-True ($rich.Issue.processState.electronCount -eq 0) 'Electron count is not zero when the program is not running.'
    Assert-True ($rich.Issue.processState.nativeHelperCount -eq 0) 'Native Helper count is not zero when the program is not running.'
    Assert-True (@('NONE_OBSERVED', 'UNOWNED_HELPER_OBSERVED', 'HELPER_WITHOUT_APP') -contains [string]$rich.Issue.processState.residualStatus) 'Residual process status is not an allowlisted observation.'
    Assert-True ($rich.Issue.processState.appWindowState -eq 'Fullscreen') 'Existing app window state was not captured.'
    Assert-True (@($rich.Issue.processState.nativeHelperEvents).Count -gt 0) 'Native Helper event evidence is missing.'
    Assert-True ($rich.Issue.playbackState.route -eq 'mount') 'Playback route was not captured.'
    Assert-True ($rich.Issue.playbackState.sourceKind -eq 'mount') 'Playback sourceKind was not captured.'
    Assert-True ($rich.Issue.playbackState.currentPlayer -eq 'native-helper') 'Current player was not captured.'
    Assert-True ($rich.Issue.playbackState.corePlaying -eq $true) 'Core-playing evidence was not captured.'
    Assert-True ([string]$rich.Issue.playbackState.requestHash -match '^[0-9a-f]{16}$') 'Request hash is missing.'
    Assert-True ([string]$rich.Issue.playbackState.generationHash -match '^[0-9a-f]{16}$') 'Generation hash is missing.'
    Assert-True ($rich.Issue.resolverState.strategy -eq 'custom') 'Resolver strategy was not captured.'
    Assert-True (@($rich.Issue.resolverState.order).Count -eq 4) 'Resolver order was not captured.'
    Assert-True ([string]$rich.Issue.resolverState.ruleHash -match '^[0-9a-f]{16}$') 'Resolver rule hash is missing.'
    Assert-True ($rich.Issue.cd2State.attemptObserved -eq $true) 'CD2 attempt evidence is missing.'
    Assert-True ($rich.Issue.cd2State.findFileObserved -eq $true) 'FindFile evidence is missing.'
    Assert-True ($rich.Issue.cd2State.findFileResult -eq 'miss') 'FindFile result was not captured.'
    Assert-True ($rich.Issue.cd2State.directUrlObserved -eq $true) 'DirectUrl evidence is missing.'
    Assert-True ($rich.Issue.cd2State.mountHitObserved -eq $true) 'Mount hit evidence is missing.'
    Assert-True ($rich.Issue.sessionState.ownSession -eq $true) 'Session ownSession evidence is missing.'
    Assert-True ($rich.Issue.sessionState.nowPlaying -eq $true) 'NowPlaying evidence is missing.'
    Assert-True ($rich.Issue.sessionState.webSocket -eq 'connected') 'WebSocket evidence is missing.'
    Assert-True ($rich.Issue.errorState.bridgeError -eq $true) 'bridge_error evidence is missing.'
    Assert-True ($rich.Issue.errorState.generationRequired -eq $true) 'generation-required evidence is missing.'
    Assert-True ($rich.Issue.errorState.rendererError -eq $true) 'Renderer error evidence is missing.'
    Assert-True ($rich.Issue.errorState.helperTerminal -eq $true) 'Helper terminal evidence is missing.'
    Assert-True ($rich.Issue.errorState.unhandledRejection -eq $true) 'Unhandled rejection evidence is missing.'
    Assert-True ($rich.Issue.evidenceAvailability.session -eq 'OBSERVED') 'Session evidence availability is incorrect.'
    Assert-True ($rich.Manifest.logTimeRange.mode -eq 'problem-time') 'Collector did not receive ProblemTime.'
    $expectedStart = $fixture.Capture.ToUniversalTime().AddMinutes(-5)
    $actualStart = [DateTimeOffset]::Parse([string]$rich.Manifest.logTimeRange.start)
    Assert-True ([Math]::Abs(($actualStart - $expectedStart).TotalSeconds) -lt 2) 'Collector ProblemTime start was not forwarded.'

    foreach ($run in $runs.ToArray()) {
        Assert-NoRawSecrets -Text (Get-TextFromFiles @($run.IssuePath)) -Raw $fixture.Raw
        Assert-NoRawSecrets -Text (Get-TextFromFiles @($run.BundlePath)) -Raw $fixture.Raw
    }

    $noteRun = Invoke-Reporter -ScriptPath $reporter -OutputRoot $outputRoot -TargetLogRoot $fixture.LogRoot -TargetInstallRoot $fixture.InstallRoot -Capture $fixture.Capture.AddMinutes(1) -Type 'other' -Note $fixture.Raw.userNote
    Assert-True ($noteRun.Result.status -eq 'READY') 'Other with a user note was not ready.'
    Assert-NoRawSecrets -Text (Get-TextFromFiles @($noteRun.IssuePath, $noteRun.BundlePath)) -Raw $fixture.Raw

    $zipRun = Invoke-Reporter -ScriptPath $reporter -OutputRoot $outputRoot -TargetLogRoot $fixture.LogRoot -TargetInstallRoot $fixture.InstallRoot -Capture $fixture.Capture.AddMinutes(2) -Type 'cd2-or-mount' -Note 'zip fixture' -Zip
    Assert-True ($zipRun.Result.bundleStatus -eq 'READY') 'Collector success did not produce a ready bundle.'
    Assert-True (Test-Path -LiteralPath $zipRun.ZipPath -PathType Leaf) 'Collector success did not produce a ZIP.'
    Assert-ZipNoRawSecrets -ZipPath $zipRun.ZipPath -Raw $fixture.Raw

    $missingRoot = Join-Path $workspace 'missing'
    $missingLog = Join-Path $missingRoot 'logs'
    $missingInstall = Join-Path $missingRoot 'install'
    New-Item -ItemType Directory -Force -Path $missingLog, $missingInstall | Out-Null
    $warningRun = Invoke-Reporter -ScriptPath $reporter -OutputRoot (Join-Path $workspace 'warning-output') -TargetLogRoot $missingLog -TargetInstallRoot $missingInstall -Capture $fixture.Capture.AddMinutes(3) -Type 'other' -Note ''
    Assert-True ($warningRun.Result.bundleStatus -eq 'READY') 'Missing-log warning did not still generate a bundle.'
    Assert-True (@($warningRun.Issue.collectionWarnings) -contains 'client_log_not_found') 'Snapshot missing-log warning is absent.'
    Assert-True ($warningRun.Issue.sessionState.ownSession -eq 'UNAVAILABLE') 'Missing Session evidence was guessed.'

    $unsafeFile = Join-Path $workspace 'unsafe-snapshot.json'
    [IO.File]::WriteAllText($unsafeFile, 'https://unsafe.invalid/media?token=unsafe-token', (New-Object Text.UTF8Encoding($false)))
    $refusal = @(Test-SnapshotRedaction -File $unsafeFile)
    Assert-True (@($refusal).Count -gt 0) 'Shared redaction refusal did not detect an unsafe snapshot.'

    $allOutput = Get-TextFromFiles @($outputRoot, (Join-Path $workspace 'warning-output'))
    Assert-NoRawSecrets -Text $allOutput -Raw $fixture.Raw
    Write-Output 'playback issue snapshot self-test: PASS'
}
finally {
    if (Test-Path -LiteralPath $workspace) { Remove-Item -LiteralPath $workspace -Recurse -Force -ErrorAction SilentlyContinue }
}
