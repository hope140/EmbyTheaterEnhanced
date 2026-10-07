[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$RuntimeRoot,
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F]{40}$')]
    [string]$ExpectedSourceCommit,
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._-]{0,47}$')]
    [string]$Label,
    [switch]$Fullscreen,
    [switch]$RetainSurfaceStopProbe,
    [ValidateRange(0, 500)]
    [int]$ArtworkDelayMs = 0
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$repoRoot = Split-Path -Parent $PSScriptRoot
$sourceCommit = $ExpectedSourceCommit.ToLowerInvariant()
$runtimePath = $null
$rootProcess = $null
$rootProcessId = 0
$rootRecordObserved = $false
$rootStartIdentity = $null
$ownedProcesses = @{}
$ownershipMismatches = 0
$ownershipUnverifieds = 0
$ownershipReasons = @{}
$harnessRelativePaths = @(
    'tools/smoke-electron.cjs',
    'tests/pipeline-browser.js',
    'tests/transition-timeline-browser.js',
    'tools/transition-stream-capture.cjs',
    'tools/make-transition-fixtures.cjs'
)
$runnerShaAtStart = $null
$harnessHashesAtStart = @()
$evidenceRoot = $null
$evidenceRelative = $null
$timedOut = $false
$smokeExitCode = $null
$smokeResult = $null
$failureCode = $null
$cleanup = [ordered]@{ status = 'not-started'; ownedCount = 0; terminated = 0; alreadyExited = 0; residualCount = 0; ownershipMismatch = 0; ownershipUnverified = 0; identityReasons = @{} }

function Get-FileSha256([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw 'runtime-file-missing' }
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant()
}

function Get-HarnessSha256([string]$Root, [string[]]$RelativePaths) {
    $result = @()
    foreach ($relative in $RelativePaths) {
        $file = Join-Path $Root ($relative.Replace('/', [IO.Path]::DirectorySeparatorChar))
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw 'harness-file-missing' }
        $result += [pscustomobject]@{ path = $relative; sha256 = Get-FileSha256 $file }
    }
    return $result
}

function Get-ManifestEntry([hashtable]$Entries, [string]$RelativePath) {
    if (-not $Entries.ContainsKey($RelativePath)) { throw 'runtime-manifest-entry-missing' }
    return $Entries[$RelativePath]
}

function Assert-ManifestPath([string]$RelativePath, [string]$Root) {
    if ([string]::IsNullOrWhiteSpace($RelativePath) -or $RelativePath.Contains('\') -or
        $RelativePath.StartsWith('/') -or [IO.Path]::IsPathRooted($RelativePath) -or
        $RelativePath.Split('/').Contains('..') -or $RelativePath.Split('/').Contains('.')) {
        throw 'runtime-manifest-path-invalid'
    }
    $nativeRelative = $RelativePath.Replace('/', [IO.Path]::DirectorySeparatorChar)
    $fullPath = [IO.Path]::GetFullPath((Join-Path $Root $nativeRelative))
    $prefix = $Root.TrimEnd([char[]]@('\', '/')) + [IO.Path]::DirectorySeparatorChar
    if (-not $fullPath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'runtime-manifest-path-escaped'
    }
    return $fullPath
}

function Get-CreationIdentity($Value) {
    try {
        if ($Value -is [DateTime]) { return $Value.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture) }
        if ($Value -is [DateTimeOffset]) { return $Value.UtcDateTime.Ticks.ToString([Globalization.CultureInfo]::InvariantCulture) }
        $text = [string]$Value
        if ($text -match '^\d{14}\.') {
            $date = [System.Management.ManagementDateTimeConverter]::ToDateTime($text)
        } else {
            $date = [DateTime]::Parse($text, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AdjustToUniversal)
        }
        return $date.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture)
    } catch { return '' }
}

function Assert-RuntimeReady {
    if (-not [IO.Path]::IsPathRooted($RuntimeRoot)) { throw 'runtime-root-must-be-absolute' }
    $fullRoot = [IO.Path]::GetFullPath($RuntimeRoot)
    if (-not (Test-Path -LiteralPath $fullRoot -PathType Container)) { throw 'runtime-root-missing' }

    $buildPath = Join-Path $fullRoot 'build-manifest.json'
    $sourcePath = Join-Path $fullRoot 'source-provenance.json'
    $runtimeProvPath = Join-Path $fullRoot 'runtime-provenance.json'
    foreach ($required in @($buildPath, $sourcePath, $runtimeProvPath)) {
        if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw 'runtime-provenance-file-missing' }
    }

    try {
        $build = Get-Content -LiteralPath $buildPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $source = Get-Content -LiteralPath $sourcePath -Raw -Encoding UTF8 | ConvertFrom-Json
        $runtimeProv = Get-Content -LiteralPath $runtimeProvPath -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch { throw 'runtime-provenance-invalid-json' }

    if ([string]$build.sourceCommit -ine $sourceCommit -or [string]$source.sourceCommit -ine $sourceCommit -or
        [string]$runtimeProv.sourceCommit -ine $sourceCommit) { throw 'runtime-source-commit-mismatch' }
    if (-not ($build.files -is [System.Array]) -or $build.files.Count -eq 0 -or
        -not $build.provenance.runtime -or -not $build.provenance.source) { throw 'runtime-build-manifest-invalid' }

    foreach ($provenanceEntry in @(
        @{ record = $build.provenance.runtime; expectedPath = 'runtime-provenance.json' },
        @{ record = $build.provenance.source; expectedPath = 'source-provenance.json' }
    )) {
        if ($provenanceEntry.record.path -cne $provenanceEntry.expectedPath -or
            $provenanceEntry.record.sha256 -notmatch '^[0-9a-fA-F]{64}$') { throw 'runtime-provenance-hash-record-invalid' }
        if ((Get-FileSha256 (Join-Path $fullRoot $provenanceEntry.expectedPath)) -cne $provenanceEntry.record.sha256.ToUpperInvariant()) {
            throw 'runtime-provenance-hash-mismatch'
        }
    }

    $entries = @{}
    foreach ($entry in $build.files) {
        if ($entry.sha256 -notmatch '^[0-9a-fA-F]{64}$') { throw 'runtime-build-file-hash-invalid' }
        if ($entries.ContainsKey([string]$entry.path)) { throw 'runtime-build-file-duplicate' }
        $entryPath = Assert-ManifestPath ([string]$entry.path) $fullRoot
        if (-not (Test-Path -LiteralPath $entryPath -PathType Leaf)) { throw 'runtime-payload-file-missing' }
        if ((Get-FileSha256 $entryPath) -cne $entry.sha256.ToUpperInvariant()) { throw 'runtime-payload-file-hash-mismatch' }
        $entries[[string]$entry.path] = [string]$entry.sha256
    }

    $identities = $source.runtimeIdentities
    $electronExePath = 'x64/electron/electron.exe'
    $electronVersionPath = 'x64/electron/version'
    $electronExeHash = Get-ManifestEntry $entries $electronExePath
    [void](Get-ManifestEntry $entries $electronVersionPath)
    $electronIdentityHash = if ($identities.electron -and $identities.electron.electronExeSha256) {
        [string]$identities.electron.electronExeSha256
    } elseif ($identities.electron -and $identities.electron.sha256) {
        [string]$identities.electron.sha256
    } else { $null }
    if ($electronIdentityHash -and $electronIdentityHash -ine [string]$electronExeHash) { throw 'runtime-electron-hash-identity-mismatch' }
    $electronVersion = (Get-Content -LiteralPath (Join-Path $fullRoot 'x64/electron/version') -Raw -Encoding ASCII).Trim()
    $provenanceVersion = $null
    if ($identities.electron -and $identities.electron.version) { $provenanceVersion = [string]$identities.electron.version }
    elseif ($identities.electronVersion -and $identities.electronVersion.version) { $provenanceVersion = [string]$identities.electronVersion.version }
    if (-not $electronVersion -or $electronVersion -cne $provenanceVersion) { throw 'runtime-electron-version-mismatch' }

    $mpvPath = if ($identities.libmpv -and $identities.libmpv.runtimePath) {
        [string]$identities.libmpv.runtimePath
    } else { 'electronapp/libmpv/x64/mpv-1.dll' }
    $mpvHash = Get-ManifestEntry $entries $mpvPath
    if ($identities.libmpv.sha256 -and [string]$identities.libmpv.sha256 -ine [string]$mpvHash) {
        throw 'runtime-mpv-hash-identity-mismatch'
    }

    $pepperPath = 'electronapp/libmpv/x64/mpv-win32-x64.node'
    $helperPath = 'electronapp/native-helper/ete-mpv-helper.exe'
    $hasPepper = $entries.ContainsKey($pepperPath)
    $hasHelper = $entries.ContainsKey($helperPath)
    if ($hasPepper -eq $hasHelper) { throw 'runtime-bridge-identity-ambiguous' }
    if ($hasPepper) {
        if (-not $identities.bridge -or $identities.bridge.role -cne 'pepper-bridge' -or
            [string]$identities.bridge.runtimePath -cne $pepperPath) { throw 'runtime-pepper-provenance-mismatch' }
        if ($identities.bridge.sha256 -and [string]$identities.bridge.sha256 -ine [string]$entries[$pepperPath]) {
            throw 'runtime-pepper-hash-identity-mismatch'
        }
        $bridgeKind = 'pepper'
        $bridgeRuntimePath = $pepperPath
        $bridgeHash = [string]$entries[$pepperPath]
    } else {
        $helperProvPath = Join-Path $fullRoot 'native-helper-provenance.json'
        if (-not (Test-Path -LiteralPath $helperProvPath -PathType Leaf)) { throw 'runtime-helper-provenance-missing' }
        try { $helperProv = Get-Content -LiteralPath $helperProvPath -Raw -Encoding UTF8 | ConvertFrom-Json }
        catch { throw 'runtime-helper-provenance-invalid' }
        if ([string]$helperProv.sourceCommit -ine $sourceCommit -or
            $helperProv.helper.runtimePath -cne $helperPath -or
            [string]$helperProv.helper.sha256 -ine [string]$entries[$helperPath]) { throw 'runtime-helper-provenance-mismatch' }
        $bridgeKind = 'native-helper'
        $bridgeRuntimePath = $helperPath
        $bridgeHash = [string]$entries[$helperPath]
    }

    return [pscustomobject]@{
        RuntimeRoot = $fullRoot
        RuntimeName = [IO.Path]::GetFileName($fullRoot.TrimEnd([char[]]@('\', '/')))
        SourceCommit = $sourceCommit
        ProductVersion = [string]$build.version
        ElectronVersion = $electronVersion
        BridgeKind = $bridgeKind
        BuildFileCount = $build.files.Count
        BuildManifestSha256 = Get-FileSha256 $buildPath
        SourceProvenanceSha256 = Get-FileSha256 $sourcePath
        RuntimeProvenanceSha256 = Get-FileSha256 $runtimeProvPath
        ElectronRuntimePath = $electronExePath
        ElectronSha256 = [string]$electronExeHash
        MpvRuntimePath = $mpvPath
        MpvSha256 = [string]$mpvHash
        BridgeRuntimePath = $bridgeRuntimePath
        BridgeSha256 = $bridgeHash
        OverlayInstalled = Test-Path -LiteralPath (Join-Path $fullRoot 'electronapp/enhanced/nexttrack-transition.js') -PathType Leaf
    }
}

function Get-ProcessSnapshot {
    return @(Get-CimInstance -ClassName Win32_Process -Property ProcessId, ParentProcessId, CreationDate, ExecutablePath -ErrorAction Stop)
}

function Add-OwnershipReason([string]$Reason) {
    if (-not $script:ownershipReasons.ContainsKey($Reason)) { $script:ownershipReasons[$Reason] = 0 }
    $script:ownershipReasons[$Reason]++
}

function Get-ProcessIdentityReason($Actual, $Expected) {
    if ($null -eq $Actual) { return 'process-not-present' }
    $actualCreation = Get-CreationIdentity $Actual.CreationDate
    if (-not $actualCreation -or -not $Expected.CreationIdentity) { return 'creation-identity-unavailable' }
    if ($actualCreation -cne [string]$Expected.CreationIdentity) { return 'creation-identity-mismatch' }
    if ([int]$Actual.ParentProcessId -ne [int]$Expected.ParentProcessId) { return 'parent-process-id-mismatch' }
    $actualPath = [string]$Actual.ExecutablePath
    $expectedPath = [string]$Expected.ExecutablePath
    if (-not $actualPath -or -not $expectedPath) { return 'executable-path-unavailable' }
    if (-not $actualPath.Equals($expectedPath, [StringComparison]::OrdinalIgnoreCase)) { return 'executable-path-mismatch' }
    return 'match'
}

function Test-StartTimeIdentity([string]$ObservedIdentity, [string]$ExpectedIdentity) {
    try {
        $observedTicks = [long]$ObservedIdentity
        $expectedTicks = [long]$ExpectedIdentity
        return [Math]::Abs(($observedTicks - $expectedTicks) / [double][TimeSpan]::TicksPerSecond) -le 0.01
    } catch { return $false }
}

function Add-OwnedProcessSnapshot([object[]]$Snapshot) {
    $byId = @{}
    foreach ($record in $Snapshot) { $byId[[int]$record.ProcessId] = $record }

    $root = $byId[[int]$rootProcessId]
    if ($null -eq $root) { return }
    $rootRecord = $script:ownedProcesses[[int]$rootProcessId]
    if (-not $rootRecord) {
        $rootCreation = Get-CreationIdentity $root.CreationDate
        if (-not $rootCreation) {
            $script:ownershipUnverifieds++
            Add-OwnershipReason 'creation-identity-unavailable'
            return
        }
        if (-not $script:rootStartIdentity) {
            $script:ownershipUnverifieds++
            Add-OwnershipReason 'root-start-time-unavailable'
            return
        }
        if (-not (Test-StartTimeIdentity $rootCreation $script:rootStartIdentity)) {
            $script:ownershipMismatches++
            Add-OwnershipReason 'creation-identity-mismatch'
            return
        }
        if ([int]$root.ParentProcessId -ne [int]$PID) {
            $script:ownershipMismatches++
            Add-OwnershipReason 'parent-process-id-mismatch'
            return
        }
        $expectedRootPath = Join-Path $runtimePath 'x64/electron/electron.exe'
        $observedRootPath = [string]$root.ExecutablePath
        if ($observedRootPath -and -not $observedRootPath.Equals($expectedRootPath, [StringComparison]::OrdinalIgnoreCase)) {
            $script:ownershipMismatches++
            Add-OwnershipReason 'executable-path-mismatch'
            return
        }
        $rootRecord = [pscustomobject]@{
            ProcessId = [int]$root.ProcessId; ParentProcessId = [int]$PID
            CreationIdentity = $rootCreation; ExecutablePath = $expectedRootPath; Depth = 0
        }
        $script:ownedProcesses[[int]$rootProcessId] = $rootRecord
        $script:rootRecordObserved = $true
    }
    $rootIdentity = Get-ProcessIdentityReason $root $rootRecord
    if ($rootIdentity -ne 'match' -and $rootIdentity -ne 'executable-path-unavailable') {
        $script:ownershipMismatches++
        Add-OwnershipReason $rootIdentity
        return
    }

    $activeIds = @{}
    foreach ($ownedId in @($script:ownedProcesses.Keys)) {
        $owned = $script:ownedProcesses[[int]$ownedId]
        $current = $byId[[int]$ownedId]
        $identityReason = Get-ProcessIdentityReason $current $owned
        if ($identityReason -eq 'match' -or $identityReason -eq 'executable-path-unavailable') {
            if ($identityReason -eq 'executable-path-unavailable') { Add-OwnershipReason $identityReason }
            $activeIds[[int]$ownedId] = $true
        } elseif ($identityReason -ne 'process-not-present') {
            $script:ownershipMismatches++
            Add-OwnershipReason $identityReason
            $script:ownedProcesses.Remove([int]$ownedId)
        }
    }

    $changed = $true
    while ($changed) {
        $changed = $false
        foreach ($record in $Snapshot) {
            $processId = [int]$record.ProcessId
            $parentId = [int]$record.ParentProcessId
            if (-not $activeIds.ContainsKey($parentId) -or $activeIds.ContainsKey($processId)) { continue }
            $exePath = [string]$record.ExecutablePath
            $creationIdentity = Get-CreationIdentity $record.CreationDate
            if (-not $creationIdentity) {
                $script:ownershipUnverifieds++
                Add-OwnershipReason 'creation-identity-unavailable'
                continue
            }
            if (-not $exePath) { Add-OwnershipReason 'executable-path-unavailable' }
            $parent = $script:ownedProcesses[$parentId]
            $script:ownedProcesses[$processId] = [pscustomobject]@{
                ProcessId = $processId; ParentProcessId = $parentId; CreationIdentity = $creationIdentity
                ExecutablePath = $exePath; Depth = [int]$parent.Depth + 1
            }
            $activeIds[$processId] = $true
            $changed = $true
        }
    }
}

function Test-ProcessCreationTime($Process, $Record) {
    try {
        $expectedTicks = [long]$Record.CreationIdentity
        $actualTicks = $Process.StartTime.ToUniversalTime().Ticks
        return [Math]::Abs(($actualTicks - $expectedTicks) / [double][TimeSpan]::TicksPerSecond) -le 0.01
    } catch { return $false }
}

function Stop-OwnedProcessRecord($Record, [bool]$IsRoot) {
    try {
        $current = Get-CimInstance -ClassName Win32_Process -Filter ('ProcessId = {0}' -f [int]$Record.ProcessId) -ErrorAction Stop
    } catch { Add-OwnershipReason 'process-query-unavailable'; return 'ownership-unverified' }
    if ($null -eq $current) { return 'already-exited' }
    $identityReason = Get-ProcessIdentityReason $current $Record
    if ($identityReason -eq 'executable-path-unavailable') { Add-OwnershipReason $identityReason }
    elseif ($identityReason -eq 'creation-identity-unavailable') { Add-OwnershipReason $identityReason; return 'ownership-unverified' }
    elseif ($identityReason -ne 'match') { Add-OwnershipReason $identityReason; return 'ownership-mismatch' }
    try {
        if ($IsRoot) { $target = $script:rootProcess }
        else { $target = Get-Process -Id ([int]$Record.ProcessId) -ErrorAction Stop }
    } catch {
        try {
            $stillPresent = Get-CimInstance -ClassName Win32_Process -Filter ('ProcessId = {0}' -f [int]$Record.ProcessId) -ErrorAction Stop
            if ($null -eq $stillPresent) { return 'already-exited' }
        } catch { Add-OwnershipReason 'process-query-unavailable'; return 'ownership-unverified' }
        Add-OwnershipReason 'process-handle-unavailable'
        return 'ownership-unverified'
    }
    if (-not (Test-ProcessCreationTime $target $Record)) { Add-OwnershipReason 'process-start-time-mismatch'; return 'ownership-mismatch' }
    try {
        $target.Kill()
        [void]$target.WaitForExit(2000)
        if ($target.HasExited) { return 'terminated' }
        return 'residual'
    } catch {
        if ($target.HasExited) { return 'already-exited' }
        return 'residual'
    }
}

function Stop-OwnedProcessTree {
    $counts = @{terminated = 0; alreadyExited = 0; residual = 0; ownershipMismatch = 0; ownershipUnverified = 0}
    if ($script:rootProcess) {
        if (-not $script:rootRecordObserved) { $counts.ownershipUnverified++ }
        if (-not $script:rootProcess.HasExited) {
            $rootRecord = $script:ownedProcesses[[int]$script:rootProcessId]
            if ($rootRecord) {
                $outcome = Stop-OwnedProcessRecord $rootRecord $true
                switch ($outcome) {
                    'terminated' { $counts.terminated++ }
                    'already-exited' { $counts.alreadyExited++ }
                    'ownership-mismatch' { $counts.ownershipMismatch++ }
                    'ownership-unverified' { $counts.ownershipUnverified++ }
                    default { $counts.residual++ }
                }
            } else { $counts.ownershipUnverified++ }
        } else { $counts.alreadyExited++ }
    }
    try {
        Add-OwnedProcessSnapshot (Get-ProcessSnapshot)
    } catch { $counts.ownershipUnverified++ }
    $records = @($script:ownedProcesses.Values | Sort-Object -Property Depth -Descending)
    foreach ($record in $records) {
        if ([int]$record.ProcessId -eq [int]$script:rootProcessId) { continue }
        $outcome = Stop-OwnedProcessRecord $record $false
        switch ($outcome) {
            'terminated' { $counts.terminated++ }
            'already-exited' { $counts.alreadyExited++ }
            'ownership-mismatch' { $counts.ownershipMismatch++ }
            'ownership-unverified' { $counts.ownershipUnverified++ }
            default { $counts.residual++ }
        }
    }
    $counts.ownershipMismatch += [int]$script:ownershipMismatches
    $counts.ownershipUnverified += [int]$script:ownershipUnverifieds
    $counts.identityReasons = [ordered]@{}
    foreach ($reason in @($script:ownershipReasons.Keys | Sort-Object)) {
        $counts.identityReasons[$reason] = [int]$script:ownershipReasons[$reason]
    }
    return $counts
}

function New-CompactSummary($Identity, $Smoke, $ProcessExitCode, $TimedOut, $Cleanup, $Evidence) {
    $versions = if ($Smoke -and $Smoke.versions) { $Smoke.versions } else { $null }
    $pipeline = if ($Smoke -and $Smoke.state -and $Smoke.state.pipeline) { $Smoke.state.pipeline } else { $null }
    $captures = @()
    if ($Smoke -and $Smoke.pixel -and $Smoke.pixel.captures) {
        foreach ($capture in $Smoke.pixel.captures) {
            $captures += [ordered]@{
                action = $capture.action; classification = $capture.classification; reason = $capture.reason
                sampleCount = $capture.sampleCount; uniqueHashes = $capture.uniqueHashes
                maxIntervalMs = $capture.maxIntervalMs; armLatencyMs = $capture.armLatencyMs
            }
        }
    }
    return [ordered]@{
        status = if (-not $TimedOut -and $ProcessExitCode -eq 0 -and $Smoke -and $Smoke.ok -eq $true -and
            $versions -and $versions.electron -eq $Identity.ElectronVersion -and $Cleanup.residualCount -eq 0 -and
            $Cleanup.ownershipMismatch -eq 0 -and $Cleanup.ownershipUnverified -eq 0) { 'passed' } else { 'failed' }
        label = $Label; runtime = $Identity.RuntimeName; sourceCommit = $Identity.SourceCommit
        productVersion = $Identity.ProductVersion; electronVersion = if ($versions) { $versions.electron } else { $Identity.ElectronVersion }
        bridge = $Identity.BridgeKind; fullscreen = [bool]$Fullscreen; artworkDelayMs = $ArtworkDelayMs
        experimentalPresentation = [bool]$RetainSurfaceStopProbe
        manifest = [ordered]@{
            fileCount = $Identity.BuildFileCount; buildManifestSha256 = $Identity.BuildManifestSha256
            sourceProvenanceSha256 = $Identity.SourceProvenanceSha256; runtimeProvenanceSha256 = $Identity.RuntimeProvenanceSha256
            electronExeSha256 = $Identity.ElectronSha256; mpvDllPath = $Identity.MpvRuntimePath; mpvDllSha256 = $Identity.MpvSha256
            bridgePath = $Identity.BridgeRuntimePath; bridgeSha256 = $Identity.BridgeSha256
            runnerSha256 = $Identity.RunnerSha256; harnessFiles = @($Identity.HarnessFiles)
        }
        overlayInstalled = $Identity.OverlayInstalled
        smoke = [ordered]@{
            exitCode = $ProcessExitCode; timedOut = $TimedOut
            error = if ($Smoke -and $Smoke.error -match '^[A-Za-z0-9._:-]{1,80}$') { $Smoke.error } else { $null }
            transitionWindowMode = if ($Smoke.state) { $Smoke.state.transitionWindowMode } else { $null }
            timelineKind = if ($pipeline) { $pipeline.kind } else { $null }
            logicalChecks = if ($pipeline) { $pipeline.logicalChecks } else { $null }
            artwork = if ($pipeline) { $pipeline.artwork } else { $null }
            pixelClassification = if ($Smoke.pixel) { $Smoke.pixel.classification } else { $null }
            pixelReason = if ($Smoke.pixel -and $Smoke.pixel.reason -match '^[A-Za-z0-9._:-]{1,80}$') { $Smoke.pixel.reason } else { $null }
            captures = $captures
        }
        processCleanup = [ordered]@{
            ownedCount = $Cleanup.ownedCount; terminated = $Cleanup.terminated; alreadyExited = $Cleanup.alreadyExited
            residualCount = $Cleanup.residualCount; ownershipMismatch = $Cleanup.ownershipMismatch
            ownershipUnverified = $Cleanup.ownershipUnverified; identityReasons = $Cleanup.identityReasons
        }
        evidence = $Evidence
    }
}

# Complete all read-only identity and byte checks before creating evidence or starting Electron.
$identity = $null
try { $identity = Assert-RuntimeReady }
catch {
    $safeReason = if ($_.Exception.Message -match '^[a-z0-9-]{1,80}$') { $_.Exception.Message } else { 'runtime-preflight-failed' }
    [ordered]@{status = 'blocked'; label = $Label; reason = $safeReason; evidence = $null} | ConvertTo-Json -Compress -Depth 8 | Write-Output
    exit 1
}
$runtimePath = $identity.RuntimeRoot
try {
    $runnerShaAtStart = Get-FileSha256 $MyInvocation.MyCommand.Path
    $harnessHashesAtStart = @(Get-HarnessSha256 $repoRoot $harnessRelativePaths)
    $identity | Add-Member -MemberType NoteProperty -Name RunnerSha256 -Value $runnerShaAtStart -Force
    $identity | Add-Member -MemberType NoteProperty -Name HarnessFiles -Value $harnessHashesAtStart -Force
} catch {
    [ordered]@{status = 'blocked'; label = $Label; reason = 'harness-identity-preflight-failed'; evidence = $null} | ConvertTo-Json -Compress -Depth 8 | Write-Output
    exit 1
}

try {
    $null = Get-ProcessSnapshot
} catch {
    [ordered]@{status = 'blocked'; label = $Label; reason = 'process-ownership-query-unavailable'; evidence = $null} | ConvertTo-Json -Compress -Depth 8 | Write-Output
    exit 1
}

$workRoot = Join-Path $repoRoot '.work'
$evidenceName = 'transition-compare-' + $Label + '-' + [guid]::NewGuid().ToString('N')
$evidenceRelative = '.work/' + $evidenceName
$evidenceRoot = Join-Path $workRoot $evidenceName
$profileRoot = Join-Path $evidenceRoot 'profile'
$appDataRoot = Join-Path $evidenceRoot 'appdata'
$mpvHome = Join-Path $appDataRoot 'mpv'
$smokeResultPath = Join-Path $evidenceRoot 'electron-smoke.json'
$summaryPath = Join-Path $evidenceRoot 'runner-summary.json'
$failureCode = $null

try {
    if (Test-Path -LiteralPath $evidenceRoot) { throw 'evidence-directory-collision' }
    New-Item -ItemType Directory -Path $profileRoot, $mpvHome, (Join-Path $appDataRoot 'temp') -Force | Out-Null
    $mpvConfig = "scale=bilinear`nsub-font=ETE-CONFIG-PROBE`nvo=gpu-next`ngpu-context=d3d11`nhwdec=no`ndemuxer-max-bytes=3072MiB`n"
    [IO.File]::WriteAllText((Join-Path $mpvHome 'mpv.conf'), $mpvConfig, [Text.Encoding]::ASCII)

    $fixtureOutput = @(& node (Join-Path $repoRoot 'tools/make-transition-fixtures.cjs') $evidenceRoot 2>&1)
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $evidenceRoot 'transition-a.y4m')) -or
        -not (Test-Path (Join-Path $evidenceRoot 'transition-b.y4m'))) { throw 'fixture-generation-failed' }

    $electronPath = Join-Path $runtimePath 'x64/electron/electron.exe'
    $smokePath = Join-Path $repoRoot 'tools/smoke-electron.cjs'
    $profileArg = $profileRoot.TrimEnd([char[]]@('\', '/'))
    $startInfo = New-Object Diagnostics.ProcessStartInfo
    $startInfo.FileName = $electronPath
    $startInfo.Arguments = '"' + $smokePath.Replace('"', '\"') + '" "' + $profileArg.Replace('"', '\"') + '"'
    $startInfo.WorkingDirectory = $runtimePath
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true

    $envVars = $startInfo.EnvironmentVariables
    $removeNames = @()
    foreach ($name in $envVars.Keys) {
        $nameText = [string]$name
        if ($nameText.StartsWith('ETE_CD2_', [StringComparison]::OrdinalIgnoreCase) -or
            $nameText.StartsWith('ETE_DIRECT', [StringComparison]::OrdinalIgnoreCase) -or
            $nameText.StartsWith('ETE_TEST_', [StringComparison]::OrdinalIgnoreCase) -or
            $nameText -match '^(HTTP_PROXY|HTTPS_PROXY|ALL_PROXY)$' -or
            $nameText -match '^(http_proxy|https_proxy|all_proxy)$' -or
            $nameText -in @('ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS')) { $removeNames += $nameText }
    }
    foreach ($name in $removeNames) { [void]$envVars.Remove($name) }

    $envVars['ETE_TEST_RUNTIME'] = $runtimePath
    $envVars['ETE_TEST_EVIDENCE'] = $evidenceRoot
    $envVars['ETE_TEST_MEDIA'] = Join-Path $evidenceRoot 'transition-a.y4m'
    $envVars['ETE_TEST_MEDIA_A'] = Join-Path $evidenceRoot 'transition-a.y4m'
    $envVars['ETE_TEST_MEDIA_B'] = Join-Path $evidenceRoot 'transition-b.y4m'
    $envVars['ETE_TEST_VISIBLE'] = '1'
    $envVars['ETE_TEST_PIPELINE'] = '1'
    $envVars['ETE_TEST_TRANSITION_TIMELINE'] = '1'
    $envVars['ETE_TEST_TRANSITION_COMPARE'] = '1'
    $envVars['ETE_TEST_ARTWORK_DELAY_MS'] = [string]$ArtworkDelayMs
    $envVars['ETE_TEST_TRANSITION_FULLSCREEN'] = if ($Fullscreen) { '1' } else { '0' }
    $envVars['ETE_TEST_TRANSITION_RETAIN_SURFACE'] = if ($RetainSurfaceStopProbe) { '1' } else { '0' }
    $envVars['APPDATA'] = $appDataRoot
    $envVars['LOCALAPPDATA'] = $appDataRoot
    $envVars['MPV_HOME'] = $mpvHome
    $envVars['TEMP'] = Join-Path $appDataRoot 'temp'
    $envVars['TMP'] = Join-Path $appDataRoot 'temp'
    $envVars['NO_PROXY'] = '127.0.0.1,localhost'

    $startCandidate = New-Object Diagnostics.Process
    $startCandidate.StartInfo = $startInfo
    if (-not $startCandidate.Start()) { throw 'smoke-process-start-failed' }
    $rootProcess = $startCandidate
    $rootProcessId = [int]$rootProcess.Id
    $stdoutDrain = $rootProcess.StandardOutput.ReadToEndAsync()
    $stderrDrain = $rootProcess.StandardError.ReadToEndAsync()

    $script:runtimePath = $runtimePath
    $script:electronExePath = $electronPath
    $script:rootProcessId = $rootProcessId
    $script:rootProcess = $rootProcess
    $script:ownedProcesses = @{}
    $script:ownershipMismatches = 0
    $script:ownershipUnverifieds = 0
    $script:ownershipReasons = @{}
    $script:rootRecordObserved = $false
    $script:rootStartIdentity = Get-CreationIdentity $rootProcess.StartTime
    $deadline = [DateTime]::UtcNow.AddSeconds(50)
    while (-not $rootProcess.HasExited -and [DateTime]::UtcNow -lt $deadline) {
        try { Add-OwnedProcessSnapshot (Get-ProcessSnapshot) } catch { }
        Start-Sleep -Milliseconds 200
    }
    $timedOut = -not $rootProcess.HasExited
    try {
        Add-OwnedProcessSnapshot (Get-ProcessSnapshot)
        if (-not $rootProcess.HasExited) {
            Start-Sleep -Milliseconds 100
            Add-OwnedProcessSnapshot (Get-ProcessSnapshot)
        }
    } catch { $failureCode = 'process-ownership-snapshot-failed' }
    if ($rootProcess.HasExited) { $smokeExitCode = $rootProcess.ExitCode }
    if ($timedOut) { $failureCode = 'smoke-timeout' }
    if (Test-Path -LiteralPath $smokeResultPath -PathType Leaf) {
        try { $smokeResult = Get-Content -LiteralPath $smokeResultPath -Raw -Encoding UTF8 | ConvertFrom-Json }
        catch { if (-not $failureCode) { $failureCode = 'smoke-result-invalid' } }
    } elseif (-not $failureCode) { $failureCode = 'smoke-result-missing' }
} catch {
    if ($_.Exception.Message -match '^[a-z0-9-]{1,80}$') { $failureCode = $_.Exception.Message }
    elseif (-not $failureCode) { $failureCode = 'runner-execution-failed' }
} finally {
    if ($rootProcess) {
        $cleanupCounts = Stop-OwnedProcessTree
        $cleanup = [ordered]@{
            status = if ($cleanupCounts.residual -eq 0 -and $cleanupCounts.ownershipMismatch -eq 0 -and
                $cleanupCounts.ownershipUnverified -eq 0) { 'verified-clean' } else { 'unverified-or-residual' }
            ownedCount = $script:ownedProcesses.Count
            terminated = $cleanupCounts.terminated
            alreadyExited = $cleanupCounts.alreadyExited
            residualCount = $cleanupCounts.residual
            ownershipMismatch = $cleanupCounts.ownershipMismatch
            ownershipUnverified = $cleanupCounts.ownershipUnverified
            identityReasons = $cleanupCounts.identityReasons
        }
    }
}

try {
    $harnessHashesAfter = @(Get-HarnessSha256 $repoRoot $harnessRelativePaths)
    if ((Get-FileSha256 $MyInvocation.MyCommand.Path) -ine $runnerShaAtStart) {
        if (-not $failureCode) { $failureCode = 'runner-changed-during-run' }
    }
    for ($index = 0; $index -lt $harnessHashesAtStart.Count; $index++) {
        if ($harnessHashesAfter[$index].path -cne $harnessHashesAtStart[$index].path -or
            $harnessHashesAfter[$index].sha256 -ine $harnessHashesAtStart[$index].sha256) {
            if (-not $failureCode) { $failureCode = 'harness-changed-during-run' }
            break
        }
    }
} catch { if (-not $failureCode) { $failureCode = 'harness-identity-postflight-failed' } }

$summary = New-CompactSummary $identity $smokeResult $smokeExitCode $timedOut $cleanup $evidenceRelative
if ($failureCode) { $summary.status = 'failed' }
if ($summary.status -ne 'passed' -and -not $failureCode) {
    if ($cleanup.status -ne 'verified-clean') { $failureCode = 'owned-process-cleanup-unverified' }
    elseif ($timedOut) { $failureCode = 'smoke-timeout' }
    elseif (-not $smokeResult -or $smokeResult.ok -ne $true) { $failureCode = 'smoke-failed' }
    elseif ($smokeExitCode -ne 0) { $failureCode = 'smoke-exit-nonzero' }
    elseif (-not $smokeResult.versions -or $smokeResult.versions.electron -cne $identity.ElectronVersion) { $failureCode = 'electron-version-observation-mismatch' }
}
$summary | Add-Member -MemberType NoteProperty -Name failureCode -Value $failureCode -Force
try { [IO.File]::WriteAllText($summaryPath, ($summary | ConvertTo-Json -Compress -Depth 10), (New-Object Text.UTF8Encoding($false))) } catch { }
$summary | ConvertTo-Json -Compress -Depth 10 | Write-Output
if ($summary.status -ne 'passed') { exit 1 }
