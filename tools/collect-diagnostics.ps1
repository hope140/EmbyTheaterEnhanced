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
    [switch]$NoZip,
    [switch]$SkipWindowsEvents
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$script:ToolName = 'ETE Sanitized Diagnostic Bundle Collector'
$script:ToolVersion = '1.0.0'
$script:SchemaVersion = 1
$script:MaxStringLength = 4096
$script:MaxArrayLength = 128
$script:MaxObjectKeys = 128
$script:CollectionWarnings = New-Object System.Collections.Generic.List[string]
$script:HashKey = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($script:HashKey) } finally { $rng.Dispose() }
$utf8NoBom = New-Object Text.UTF8Encoding($false)

trap {
    $line = if ($_.InvocationInfo -and $_.InvocationInfo.ScriptLineNumber) { [int]$_.InvocationInfo.ScriptLineNumber } else { 0 }
    Write-Error ('Diagnostic collector failed safely at line {0} ({1}, {2}). No ZIP was generated.' -f $line, $_.Exception.GetType().Name, $_.FullyQualifiedErrorId)
    exit 1
}

function Add-CollectionWarning {
    param([string]$Code)
    if ($Code -and -not $script:CollectionWarnings.Contains($Code)) {
        $script:CollectionWarnings.Add($Code)
    }
}

function Get-StableHash {
    param([AllowNull()][object]$Value)
    if ($null -eq $Value) { return $null }
    $text = [string]$Value
    $hmac = New-Object Security.Cryptography.HMACSHA256 -ArgumentList (,$script:HashKey)
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes($text)
        $digest = $hmac.ComputeHash($bytes)
        return ([BitConverter]::ToString($digest)).Replace('-', '').ToLowerInvariant().Substring(0, 16)
    } finally {
        $hmac.Dispose()
    }
}

function Get-FileSha256 {
    param([Parameter(Mandatory=$true)][string]$Path)
    $sha = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($Path)
    try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $sha.Dispose() }
}

function Get-PathKind {
    param([string]$Value)
    if ($Value -match '^[A-Za-z]:[\\/]') { return 'WINDOWS_DRIVE' }
    if ($Value -match '^\\\\') { return 'UNC' }
    if ($Value -match '^/') { return 'POSIX' }
    return 'RELATIVE'
}

function Get-PathSummary {
    param([Parameter(Mandatory=$true)][string]$Value)
    $kind = Get-PathKind $Value
    $normalized = $Value.Replace('\', '/').Trim()
    $segments = @($normalized -split '/' | Where-Object { $_ -and $_ -notmatch '^[A-Za-z]:$' })
    $lowerSegments = @($segments | ForEach-Object { $_.ToLowerInvariant() })
    $rootClass = 'other'
    if (@($lowerSegments | Where-Object { $_ -match '^(media|movie|movies|tv|video|videos|films?|series)$' }).Count -gt 0) {
        $rootClass = 'media'
    } elseif (@($lowerSegments | Where-Object { $_ -match '^(users?|documents and settings)$' }).Count -gt 0) {
        $rootClass = 'user'
    } elseif (@($lowerSegments | Where-Object { $_ -match '^(program files|program files \(x86\)|windows|applications?)$' }).Count -gt 0) {
        $rootClass = 'application'
    } elseif ($kind -eq 'UNC') {
        $rootClass = 'network'
    } elseif ($kind -eq 'WINDOWS_DRIVE') {
        $rootClass = 'drive'
    } elseif ($kind -eq 'POSIX' -and @($segments).Count -eq 0) {
        $rootClass = 'root'
    }
    $extension = [IO.Path]::GetExtension($normalized)
    if ($extension) { $extension = $extension.TrimStart('.').ToLowerInvariant() }
    if ($extension -notmatch '^[a-z0-9]{1,12}$') { $extension = $null }
    return [ordered]@{
        kind = $kind
        rootClass = $rootClass
        segmentCount = @($segments).Count
        pathHash = Get-StableHash $normalized.ToLowerInvariant()
        extension = $extension
    }
}

function Get-UrlPathClass {
    param([Uri]$Uri)
    $path = [string]$Uri.AbsolutePath
    if (-not $path -or $path -eq '/') { return 'root' }
    if ($path -match '(?i)/(videos?|audio|items?)(/|$)') { return 'media' }
    if ($path -match '(?i)/(download|stream|direct)(/|$)') { return 'download' }
    if ($path -match '(?i)\.(mkv|mp4|avi|mov|ts|m2ts|mp3|flac|strm)(/|$)') { return 'media-file' }
    return 'other'
}

function Get-UrlSummary {
    param([Parameter(Mandatory=$true)][string]$Value)
    $uri = $null
    if (-not [Uri]::TryCreate($Value, [UriKind]::Absolute, [ref]$uri)) {
        return [ordered]@{ scheme = 'other'; hostHash = $null; pathClass = 'other'; queryPresent = ($Value -match '\?') }
    }
    $hostHash = if ($uri.Host) { Get-StableHash $uri.Host.ToLowerInvariant() } else { $null }
    return [ordered]@{
        scheme = $uri.Scheme.ToLowerInvariant()
        hostHash = $hostHash
        pathClass = Get-UrlPathClass $uri
        queryPresent = -not [string]::IsNullOrEmpty($uri.Query)
    }
}

function Format-SafeSummary {
    param([Parameter(Mandatory=$true)][System.Collections.IDictionary]$Summary, [string]$Type)
    if ($Type -eq 'url') {
        $hostHash = if ($Summary.hostHash) { $Summary.hostHash } else { 'none' }
        return '[url scheme={0} hostHash={1} pathClass={2} queryPresent={3}]' -f $Summary.scheme, $hostHash, $Summary.pathClass, ([string]$Summary.queryPresent).ToLowerInvariant()
    }
    $extension = if ($Summary.extension) { $Summary.extension } else { 'none' }
    return '[path kind={0} rootClass={1} segmentCount={2} pathHash={3} extension={4}]' -f $Summary.kind, $Summary.rootClass, $Summary.segmentCount, $Summary.pathHash, $extension
}

function Protect-DiagnosticText {
    param([AllowNull()][object]$Value)
    if ($null -eq $Value) { return $null }
    $text = [string]$Value
    if ($text.Length -gt $script:MaxStringLength) { $text = $text.Substring(0, $script:MaxStringLength) + '...[truncated]' }
    $text = [regex]::Replace($text, '(?i)\bBearer\s+[^\s,;]+', '[redacted-auth]')
    $text = [regex]::Replace($text, '(?i)((?:authorization|x-emby-token|api[_-]?key|access[_-]?token|token|password|cookie|secret|pickcode|deviceid|sessionid|playsessionid|mediasourceid|itemid)\s*[:=]\s*)[^\s,;&]+', '$1[redacted]')
    $text = [regex]::Replace($text, '(?i)\b[a-z][a-z0-9+.-]*://[^\s"''<>]+', {
        param($match)
        $candidate = $match.Value.TrimEnd(')', ']', '}', ',', '.', ';', '!', '?')
        return Format-SafeSummary (Get-UrlSummary $candidate) 'url'
    })
    $text = [regex]::Replace($text, '(?:[A-Za-z]:[\\/]|\\\\)[^\s"''<>|]+', {
        param($match)
        return Format-SafeSummary (Get-PathSummary $match.Value) 'path'
    })
    $text = [regex]::Replace($text, '(^|[\s=(,:])/(?!/)(?:[^\s"''<>|]+/)*[^\s"''<>|]+', {
        param($match)
        $prefixLength = if ($match.Groups[1].Success) { $match.Groups[1].Value.Length } else { 0 }
        $prefix = if ($prefixLength) { $match.Value.Substring(0, $prefixLength) } else { '' }
        $raw = $match.Value.Substring($prefixLength)
        return $prefix + (Format-SafeSummary (Get-PathSummary $raw) 'path')
    })
    return $text
}

function Get-NormalizedKey {
    param([string]$Key)
    return ([regex]::Replace(([string]$Key).ToLowerInvariant(), '[^a-z0-9]', ''))
}

function Get-IdentifierOutputKey {
    param([string]$Key)
    $normalized = Get-NormalizedKey $Key
    $map = @{
        'id' = 'idHash'; 'deviceid' = 'deviceIdHash'; 'devicename' = 'deviceNameHash';
        'idhash' = 'idHash'; 'deviceidhash' = 'deviceIdHash'; 'devicenamehash' = 'deviceNameHash';
        'sessionid' = 'sessionIdHash'; 'playsessionid' = 'playSessionIdHash';
        'sessionidhash' = 'sessionIdHash'; 'playsessionidhash' = 'playSessionIdHash';
        'mediasourceid' = 'mediaSourceIdHash'; 'itemid' = 'itemIdHash';
        'mediasourceidhash' = 'mediaSourceIdHash'; 'itemidhash' = 'itemIdHash';
        'userid' = 'userIdHash'; 'requestid' = 'requestIdHash';
        'useridhash' = 'userIdHash'; 'requestidhash' = 'requestIdHash';
        'playrequestid' = 'playRequestIdHash'; 'playbackrequestid' = 'playbackRequestIdHash';
        'playrequestidhash' = 'playRequestIdHash'; 'playbackrequestidhash' = 'playbackRequestIdHash';
        'endpointid' = 'endpointIdHash'; 'helperinstanceid' = 'helperInstanceIdHash'
        'endpointidhash' = 'endpointIdHash'; 'helperinstanceidhash' = 'helperInstanceIdHash'
        'pathhash' = 'pathHash'; 'mappedpathhash' = 'mappedPathHash'; 'hosthash' = 'hostHash'
        'host' = 'hostHash'; 'hostname' = 'hostHash'; 'serverhost' = 'hostHash'
        'serverid' = 'serverIdHash'; 'serveridhash' = 'serverIdHash'; 'servername' = 'serverNameHash'
    }
    if ($map.ContainsKey($normalized)) { return $map[$normalized] }
    return $null
}

function Test-SensitiveDropKey {
    param([string]$Key)
    $normalized = Get-NormalizedKey $Key
    return $normalized -match '(token|authorization|bearer|password|cookie|secret|credential|apikey|accesskey|username|pickcode|commandline|environment)'
}

function Test-LocationKey {
    param([string]$Key)
    $normalized = Get-NormalizedKey $Key
    return $normalized -match '(url|uri|path|file|filename|directory|folder|location|source|origin|host)'
}

function Test-StrongPathKey {
    param([string]$Key)
    $normalized = Get-NormalizedKey $Key
    return $normalized -match '^(path|filepath|windowspath|uncpath|posixpath|filename|file|directory|folder|location|(?:media|source|sidecar|mapped|local|remote|error)(?:path|filepath|filename|file|directory|folder|location))$'
}

function Protect-DiagnosticValue {
    param([AllowNull()][object]$Value, [string]$Key = '')
    if ($null -eq $Value) { return $null }
    if ($Value -is [bool] -or $Value -is [byte] -or $Value -is [int16] -or $Value -is [int32] -or $Value -is [int64] -or $Value -is [decimal] -or $Value -is [double] -or $Value -is [single]) { return $Value }
    if ($Value -is [DateTime] -or $Value -is [DateTimeOffset]) { return ([DateTimeOffset]$Value).ToUniversalTime().ToString('o') }
    if ($Value -is [string]) {
        $identifierKey = Get-IdentifierOutputKey $Key
        if ($identifierKey) { return Get-StableHash $Value }
        if (Test-LocationKey $Key) {
            if ($Value -match '^(?i:[a-z][a-z0-9+.-]*)://') { return Get-UrlSummary $Value }
            if ((Get-PathKind $Value) -ne 'RELATIVE' -or (Test-StrongPathKey $Key)) { return Get-PathSummary $Value }
        }
        return Protect-DiagnosticText $Value
    }
    if ($Value -is [System.Collections.IDictionary]) {
        $output = [ordered]@{}
        $count = 0
        foreach ($entry in $Value.GetEnumerator()) {
            if ($count -ge $script:MaxObjectKeys) { $output['_truncated'] = $true; break }
            $name = [string]$entry.Key
            if (Test-SensitiveDropKey $name) { continue }
            $identifierKey = Get-IdentifierOutputKey $name
            $safeName = if ($identifierKey) { $identifierKey } else { ([regex]::Replace($name, '[^A-Za-z0-9._-]', '_')).Substring(0, [Math]::Min(96, ([regex]::Replace($name, '[^A-Za-z0-9._-]', '_')).Length)) }
            if (-not $safeName) { $safeName = 'field' }
            if ($identifierKey -and $null -ne $entry.Value) { $output[$safeName] = Get-StableHash $entry.Value }
            else { $output[$safeName] = Protect-DiagnosticValue $entry.Value $name }
            $count++
        }
        return $output
    }
    if ($Value -is [System.Collections.IEnumerable] -and -not ($Value -is [string])) {
        $array = New-Object System.Collections.Generic.List[object]
        $index = 0
        foreach ($item in $Value) {
            if ($index -ge $script:MaxArrayLength) { $array.Add('[truncated]'); break }
            $array.Add((Protect-DiagnosticValue $item $Key))
            $index++
        }
        $result = @($array | ForEach-Object { $_ })
        return ,$result
    }
    if ($Value -is [Management.Automation.PSCustomObject] -or $Value.PSObject.Properties.Count -gt 0) {
        $dictionary = [ordered]@{}
        foreach ($property in $Value.PSObject.Properties) { $dictionary[$property.Name] = $property.Value }
        return Protect-DiagnosticValue $dictionary $Key
    }
    return Protect-DiagnosticText $Value
}

function Write-Utf8File {
    param([Parameter(Mandatory=$true)][string]$Path, [Parameter(Mandatory=$true)][AllowEmptyString()][string]$Text)
    [IO.File]::WriteAllText($Path, $Text, $utf8NoBom)
}

function Write-JsonFile {
    param([Parameter(Mandatory=$true)][string]$Path, [Parameter(Mandatory=$true)][object]$Value)
    $safe = Protect-DiagnosticValue $Value
    $json = $safe | ConvertTo-Json -Depth 24
    Write-Utf8File $Path ($json + "`n")
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

function Test-BundleRedaction {
    param([string]$Directory)
    $failures = New-Object System.Collections.Generic.List[string]
    $patterns = [ordered]@{
        'raw_url' = '(?i)\b[a-z][a-z0-9+.-]*://'
        'bearer_value' = '(?i)\bBearer\s+[A-Za-z0-9._~+/-]+'
        'secret_assignment' = '(?i)(authorization|x-emby-token|api[_-]?key|access[_-]?token|token|password|cookie|secret|pickcode)\s*[:=]\s*(?!\[redacted\])[^\s,;]+'
        'absolute_windows_path' = '(?i)(?:[A-Za-z]:[\\/]|\\\\)[^\s"'']+'
        'absolute_posix_json_path' = '"\s*:\s*"/(?:[^"/]+/)+[^"/]+"'
        'sensitive_json_key' = '(?i)"(?:authorization|x-emby-token|api[_-]?key|access[_-]?token|token|password|cookie|secret|credential|username|pickcode|commandline)"\s*:'
        'raw_sensitive_id_key' = '(?i)"(?:deviceid|sessionid|playsessionid|mediasourceid|itemid|userid|requestid|endpointid|helperinstanceid)"\s*:'
    }
    foreach ($file in Get-ChildItem -LiteralPath $Directory -File -Recurse) {
        $text = [IO.File]::ReadAllText($file.FullName)
        foreach ($entry in $patterns.GetEnumerator()) {
            if ([regex]::IsMatch($text, $entry.Value)) {
                $code = $entry.Key + ':' + $file.Name
                if (-not $failures.Contains($code)) { $failures.Add($code) }
            }
        }
    }
    return @($failures)
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
