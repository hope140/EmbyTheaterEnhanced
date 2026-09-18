$ErrorActionPreference = 'Stop'

# Black-box contract test for tools/collect-diagnostics.ps1.  The fixture is
# deliberately synthetic and is always created below the temporary directory.
$repoRoot = Split-Path -Parent $PSScriptRoot
$collector = Join-Path $repoRoot 'tools/collect-diagnostics.ps1'
if (-not (Test-Path -LiteralPath $collector -PathType Leaf)) {
    throw "Collector is missing: $collector"
}

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

function New-Fixture {
    param([string]$Root)

    $logRoot = Join-Path $Root 'logs'
    $installRoot = Join-Path $Root 'install'
    New-Item -ItemType Directory -Force -Path $logRoot, $installRoot | Out-Null

    # Keep these values unique to this test.  A raw occurrence in the output
    # is a redaction failure, even though none of them are real credentials.
    $capture = [DateTimeOffset]::Parse('2026-09-17T12:00:00+08:00')
    $raw = [ordered]@{
        token = 'fake-token-collector-8f2a'
        serverUrl = 'https://fake-user:fake-password@example.invalid:8920/library/item?id=fake-item-001&api_key=fake-token-collector-8f2a'
        username = 'fake-user-collector'
        windowsPath = 'C:\Users\fixture\Movies\fake-movie.mkv'
        uncPath = '\\fake-server\fake-share\fake-movie.mkv'
        posixPath = '/media/fake-library/fake-movie.mkv'
        mediaFilename = 'fake-private-movie-name.mkv'
        pickcode = 'fake-pickcode-collector-8f2a'
        deviceId = 'fake-device-id-collector-8f2a'
        sessionId = 'fake-session-id-collector-8f2a'
        playSessionId = 'fake-play-session-id-collector-8f2a'
        mediaSourceId = 'fake-media-source-id-collector-8f2a'
        itemId = 'fake-item-id-collector-8f2a'
    }

    $event1 = [ordered]@{
        timestamp = $capture.ToString('o')
        category = 'resolver'
        event = 'route-selected'
        token = $raw.token
        serverUrl = $raw.serverUrl
        username = $raw.username
        windowsPath = $raw.windowsPath
        uncPath = $raw.uncPath
        posixPath = $raw.posixPath
        mediaFilename = $raw.mediaFilename
        pickcode = $raw.pickcode
        DeviceId = $raw.deviceId
        SessionId = $raw.sessionId
        PlaySessionId = $raw.playSessionId
        MediaSourceId = $raw.mediaSourceId
        ItemId = $raw.itemId
        route = 'native'
    }
    $event2 = [ordered]@{
        timestamp = $capture.AddSeconds(1).ToString('o')
        category = 'session'
        event = 'playing'
        ItemId = $raw.itemId
        SessionId = $raw.sessionId
        route = 'native'
    }
    $json1 = $event1 | ConvertTo-Json -Compress -Depth 8
    $json2 = $event2 | ConvertTo-Json -Compress -Depth 8
    $logPath = Join-Path $logRoot 'ete-client.jsonl'
    $filler = 1..480 | ForEach-Object {
        [ordered]@{
            timestamp = $capture.AddSeconds($_).ToString('o')
            category = 'playback'
            event = 'progress'
            ItemId = "filler-item-$($_)"
            route = 'native'
        } | ConvertTo-Json -Compress -Depth 8
    }
    $prefix = (($filler -join "`n") + "`n{malformed-json`n")
    $suffix = ($json1 + "`n" + $json2 + "`n")
    $prefixBytes = [Text.Encoding]::UTF8.GetBytes($prefix)
    $invalidBytes = [byte[]](0x7b, 0x22, 0x6f, 0x6b, 0x22, 0x3a, 0xff, 0xfe, 0x7d, 0x0a)
    $suffixBytes = [Text.Encoding]::UTF8.GetBytes($suffix)
    $allBytes = New-Object byte[] ($prefixBytes.Length + $invalidBytes.Length + $suffixBytes.Length)
    [Array]::Copy($prefixBytes, 0, $allBytes, 0, $prefixBytes.Length)
    [Array]::Copy($invalidBytes, 0, $allBytes, $prefixBytes.Length, $invalidBytes.Length)
    [Array]::Copy($suffixBytes, 0, $allBytes, $prefixBytes.Length + $invalidBytes.Length, $suffixBytes.Length)
    [IO.File]::WriteAllBytes($logPath, $allBytes)
    (Get-Item -LiteralPath $logPath).LastWriteTimeUtc = $capture.UtcDateTime.AddSeconds(-1)

    $rotationInside = [ordered]@{
        timestamp = $capture.AddMinutes(-1).ToString('o')
        category = 'playback'
        event = 'rotation-marker'
        ItemId = $raw.itemId
    } | ConvertTo-Json -Compress -Depth 8
    $rotationOutside = [ordered]@{
        timestamp = $capture.AddMinutes(-10).ToString('o')
        category = 'playback'
        event = 'outside-window-marker'
        ItemId = $raw.itemId
    } | ConvertTo-Json -Compress -Depth 8
    [IO.File]::WriteAllText($logPath + '.1', ($rotationOutside + "`n" + $rotationInside + "`n"), (New-Object Text.UTF8Encoding($false)))

    # These decoys contain the same sensitive fixture values.  A collector
    # reading arbitrary files below LogRoot would fail the redaction scan;
    # the supported input is only ete-client.jsonl and .1/.2/.3.
    Set-Content -LiteralPath (Join-Path $logRoot 'events.jsonl') -Value $raw.serverUrl -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $logRoot 'encoding.log') -Value $raw.token -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $logRoot 'large.log') -Value $raw.windowsPath -Encoding UTF8

    Set-Content -LiteralPath (Join-Path $installRoot 'mpv-win32-x64.node') -Value 'historical fixture' -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $installRoot 'old-wrapper.js') -Value $raw.windowsPath -Encoding UTF8

    [pscustomobject]@{ LogRoot = $logRoot; InstallRoot = $installRoot; Raw = $raw; Capture = $capture }
}

function Invoke-Collector {
    param(
        [string]$OutputRoot,
        [string]$LogRoot,
        [string]$InstallRoot,
        [DateTimeOffset]$Capture,
        [switch]$NoZip
    )
    $arguments = @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $collector,
        '-OutputRoot', $OutputRoot,
        '-LogRoot', $LogRoot,
        '-InstallRoot', $InstallRoot,
        '-CaptureTime', $Capture.ToString('o'),
        '-LookbackMinutes', '20',
        '-ProblemTime', $Capture.ToString('o'),
        '-ProblemWindowMinutes', '5',
        '-MaxLogLines', '25',
        '-SkipWindowsEvents'
    )
    if ($NoZip) { $arguments += '-NoZip' }
    & powershell.exe @arguments | Out-Null
    $exitCode = $LASTEXITCODE
    Assert-True ($exitCode -eq 0) "Collector exited with $exitCode."
    $directory = Get-ChildItem -LiteralPath $OutputRoot -Directory |
        Where-Object { $_.Name -match '^ETE-Diagnostics-\d{8}-\d{6}$' } |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    Assert-True ($null -ne $directory) 'Expected ETE-Diagnostics-YYYYMMDD-HHMMSS output directory.'
    Assert-True ($directory.Name -match '^ETE-Diagnostics-\d{8}-\d{6}$') 'Output directory name is not timestamped.'
    [pscustomobject]@{ Directory = $directory.FullName; Zip = Join-Path $OutputRoot ($directory.Name + '.zip') }
}

function Get-OutputText {
    param([string]$Directory)
    $parts = foreach ($file in Get-ChildItem -LiteralPath $Directory -File -Recurse) {
        [Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($file.FullName))
    }
    return ($parts -join "`n")
}

function Assert-NoRawSecrets {
    param([string]$Text, [hashtable]$Raw)
    foreach ($entry in $Raw.GetEnumerator()) {
        Assert-True (-not [string]::IsNullOrEmpty($entry.Value)) "Fixture value for $($entry.Key) is empty."
        Assert-True (-not $Text.Contains([string]$entry.Value)) "Raw $($entry.Key) leaked into diagnostics output."
    }
}

function Assert-ZipNoRawSecrets {
    param([string]$ZipPath, [hashtable]$Raw)
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($ZipPath)
    try {
        foreach ($entry in $archive.Entries) {
            $reader = New-Object IO.StreamReader($entry.Open(), [Text.Encoding]::UTF8, $true)
            try { Assert-NoRawSecrets -Text $reader.ReadToEnd() -Raw $Raw } finally { $reader.Dispose() }
        }
    } finally { $archive.Dispose() }
}

$workspace = Join-Path ([IO.Path]::GetTempPath()) ('ete-diagnostics-collector-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $workspace | Out-Null
try {
    $fixture = New-Fixture -Root $workspace

    $noZipRoot = Join-Path $workspace 'no-zip-output'
    New-Item -ItemType Directory -Force -Path $noZipRoot | Out-Null
    $noZip = Invoke-Collector -OutputRoot $noZipRoot -LogRoot $fixture.LogRoot -InstallRoot $fixture.InstallRoot -Capture $fixture.Capture -NoZip
    $manifestPath = Join-Path $noZip.Directory 'manifest.json'
    Assert-True (Test-Path -LiteralPath $manifestPath -PathType Leaf) 'manifest.json is missing.'
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    Assert-True ($manifest.redactionPassed -eq $true) 'manifest.redactionPassed must be true.'
    Assert-True ($null -ne $manifest.filesIncluded) 'manifest.filesIncluded is missing.'
    Assert-True (@($manifest.filesIncluded).Count -gt 0) 'manifest.filesIncluded must not be empty.'
    Assert-True (-not (Test-Path -LiteralPath $noZip.Zip)) '-NoZip unexpectedly generated a zip.'
    foreach ($included in @($manifest.filesIncluded)) {
        $includedPath = Join-Path $noZip.Directory ([string]$included.name).Replace('/', '\')
        Assert-True (Test-Path -LiteralPath $includedPath -PathType Leaf) "Manifest file is missing: $($included.name)"
        $sha = [Security.Cryptography.SHA256]::Create()
        $stream = [IO.File]::OpenRead($includedPath)
        try { $actualHash = ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
        finally { $stream.Dispose(); $sha.Dispose() }
        Assert-True ($actualHash -eq [string]$included.sha256) "Manifest hash mismatch: $($included.name)"
    }

    $text = Get-OutputText -Directory $noZip.Directory
    Assert-NoRawSecrets -Text $text -Raw $fixture.Raw
    Assert-True ($text -notmatch 'https?://[^\s"'']+[?&][^\s"'']+') 'A URL query-bearing URL was preserved.'
    Assert-True ($text -match '(?i)(pathHash|rootClass|segmentCount|path class)') 'No path redaction metadata was found.'
    Assert-True ($text -match '(?i)(hostHash|queryPresent|scheme)') 'No URL redaction metadata was found.'
    Assert-True ($text -match '(?i)itemIdHash') 'No stable itemIdHash field was found.'

    $clientRecords = @(Get-Content -LiteralPath (Join-Path $noZip.Directory 'logs\client.jsonl') | ForEach-Object { $_ | ConvertFrom-Json })
    Assert-True (@($clientRecords | Where-Object { $_.event -eq 'rotation-marker' }).Count -eq 1) 'In-window rotated log event was not included exactly once.'
    Assert-True (@($clientRecords | Where-Object { $_.event -eq 'outside-window-marker' }).Count -eq 0) 'Out-of-window rotated event was included.'
    $sensitiveRecord = $clientRecords | Where-Object { $_.category -eq 'resolver' -and $_.event -eq 'route-selected' } | Select-Object -Last 1
    Assert-True ($null -ne $sensitiveRecord) 'Sanitized resolver fixture record was not captured.'
    Assert-True ($sensitiveRecord.windowsPath.kind -eq 'WINDOWS_DRIVE') 'Windows path kind was not preserved safely.'
    Assert-True ($sensitiveRecord.windowsPath.rootClass -eq 'media') 'Windows media root classification is incorrect.'
    Assert-True ($sensitiveRecord.windowsPath.segmentCount -eq 4) 'Windows path segment count is incorrect.'
    Assert-True ($sensitiveRecord.windowsPath.extension -eq 'mkv') 'Windows path extension is incorrect.'
    Assert-True ($sensitiveRecord.uncPath.kind -eq 'UNC') 'UNC path kind was not preserved safely.'
    Assert-True ($sensitiveRecord.uncPath.rootClass -eq 'network') 'UNC root classification is incorrect.'
    Assert-True ($sensitiveRecord.uncPath.segmentCount -eq 3) 'UNC path segment count is incorrect.'
    Assert-True ($sensitiveRecord.posixPath.kind -eq 'POSIX') 'POSIX path kind was not preserved safely.'
    Assert-True ($sensitiveRecord.posixPath.rootClass -eq 'media') 'POSIX media root classification is incorrect.'
    Assert-True ($sensitiveRecord.posixPath.segmentCount -eq 3) 'POSIX path segment count is incorrect.'
    Assert-True ($sensitiveRecord.mediaFilename.kind -eq 'RELATIVE') 'Relative media filename was not summarized.'
    Assert-True ($sensitiveRecord.mediaFilename.segmentCount -eq 1) 'Relative media filename segment count is incorrect.'
    Assert-True ($sensitiveRecord.mediaFilename.extension -eq 'mkv') 'Relative media filename extension is incorrect.'
    Assert-True ($sensitiveRecord.serverUrl.scheme -eq 'https') 'URL scheme summary is incorrect.'
    Assert-True ($sensitiveRecord.serverUrl.queryPresent -eq $true) 'URL query presence summary is incorrect.'
    Assert-True ([string]$sensitiveRecord.serverUrl.hostHash -match '^[0-9a-f]{16}$') 'URL host hash is missing or malformed.'

    $hashes = [regex]::Matches($text, '(?i)"itemIdHash"\s*:\s*"([0-9a-f]{8,64})"') | ForEach-Object { $_.Groups[1].Value }
    Assert-True (@($hashes | Select-Object -Unique).Count -eq 1) 'Repeated ItemId values did not retain one stable hash.'
    Assert-True (@($hashes).Count -ge 2) 'Stable hash test did not observe repeated ItemId events.'

    $capturedLogs = Get-ChildItem -LiteralPath $noZip.Directory -File -Recurse |
        Where-Object { $_.Extension -in @('.log', '.jsonl') -and $_.Name -ne 'manifest.json' }
    foreach ($file in $capturedLogs) {
        $lineCount = @(Get-Content -LiteralPath $file.FullName).Count
        Assert-True ($lineCount -le 25) "Log tail bound exceeded in $($file.Name): $lineCount lines."
    }
    $collection = Get-Content -LiteralPath (Join-Path $noZip.Directory 'collection.json') -Raw | ConvertFrom-Json
    Assert-True ($collection.clientLogFilesRead -eq 2) 'Current and rotated client log file count is incorrect.'
    Assert-True ($collection.outsideWindowOmitted -gt 0) 'ProblemTime window did not omit out-of-window events.'

    $zipRoot = Join-Path $workspace 'zip-output'
    New-Item -ItemType Directory -Force -Path $zipRoot | Out-Null
    $zipped = Invoke-Collector -OutputRoot $zipRoot -LogRoot $fixture.LogRoot -InstallRoot $fixture.InstallRoot -Capture $fixture.Capture
    Assert-True (Test-Path -LiteralPath $zipped.Zip -PathType Leaf) 'Default collection did not generate a zip.'
    Assert-ZipNoRawSecrets -ZipPath $zipped.Zip -Raw $fixture.Raw

    # Inject an unsafe file after bundle creation but before the collector's
    # final scan.  The safety gate must leave the directory for inspection,
    # set redactionPassed=false, return exit 2 and refuse the ZIP.
    $gateRoot = Join-Path $workspace 'gate-output'
    New-Item -ItemType Directory -Force -Path $gateRoot | Out-Null
    $gateArguments = @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $collector,
        '-OutputRoot', $gateRoot,
        '-LogRoot', $fixture.LogRoot,
        '-InstallRoot', $fixture.InstallRoot,
        '-CaptureTime', $fixture.Capture.ToString('o'),
        '-ProblemTime', $fixture.Capture.ToString('o'),
        '-MaxLogLines', '25',
        '-SkipWindowsEvents'
    )
    $gateProcess = Start-Process -FilePath 'powershell.exe' -ArgumentList $gateArguments -WindowStyle Hidden -PassThru
    $gateBundle = $null
    $gateDeadline = [DateTime]::UtcNow.AddSeconds(10)
    while (-not $gateBundle -and -not $gateProcess.HasExited -and [DateTime]::UtcNow -lt $gateDeadline) {
        $gateBundle = Get-ChildItem -LiteralPath $gateRoot -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $gateBundle) { Start-Sleep -Milliseconds 10 }
    }
    Assert-True ($null -ne $gateBundle) 'Redaction gate test could not observe the bundle directory before collection finished.'
    [IO.File]::WriteAllText((Join-Path $gateBundle.FullName 'unsafe-injected.txt'), 'https://unsafe.invalid/media?token=unsafe-test-token', (New-Object Text.UTF8Encoding($false)))
    Assert-True ($gateProcess.WaitForExit(30000)) 'Redaction gate failure test did not exit in 30 seconds.'
    Assert-True ($gateProcess.ExitCode -eq 2) "Redaction gate failure returned $($gateProcess.ExitCode), expected 2."
    $gateManifest = Get-Content -LiteralPath (Join-Path $gateBundle.FullName 'manifest.json') -Raw | ConvertFrom-Json
    Assert-True ($gateManifest.redactionPassed -eq $false) 'Unsafe injected output did not fail manifest redaction.'
    Assert-True (@($gateManifest.redactionWarnings).Count -gt 0) 'Unsafe injected output did not record a redaction warning.'
    Assert-True (-not (Test-Path -LiteralPath ($gateBundle.FullName + '.zip'))) 'Unsafe injected output was zipped.'

    $missingLogRoot = Join-Path $workspace 'missing-log-root'
    $emptyOutputRoot = Join-Path $workspace 'empty-output'
    New-Item -ItemType Directory -Force -Path $missingLogRoot, $emptyOutputRoot | Out-Null
    $empty = Invoke-Collector -OutputRoot $emptyOutputRoot -LogRoot $missingLogRoot -InstallRoot $fixture.InstallRoot -Capture $fixture.Capture -NoZip
    $emptyManifest = Get-Content -LiteralPath (Join-Path $empty.Directory 'manifest.json') -Raw | ConvertFrom-Json
    $emptyCollection = Get-Content -LiteralPath (Join-Path $empty.Directory 'collection.json') -Raw | ConvertFrom-Json
    Assert-True ($emptyManifest.redactionPassed -eq $true) 'Missing logs must still produce a redaction-passed manifest.'
    Assert-True ($emptyCollection.clientLogFilesRead -eq 0) 'Missing logs unexpectedly reported a source file.'
    Assert-True ($emptyCollection.clientLogRecordsIncluded -eq 0) 'Missing logs unexpectedly produced client records.'
    Assert-True (@($emptyManifest.collectionWarnings) -contains 'client_log_not_found') 'Missing logs did not emit client_log_not_found.'

    Write-Output 'diagnostics collector self-test: PASS'
}
finally {
    if (Test-Path -LiteralPath $workspace) { Remove-Item -LiteralPath $workspace -Recurse -Force -ErrorAction SilentlyContinue }
}
