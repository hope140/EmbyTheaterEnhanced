# Shared privacy-safe serialization and redaction contract for diagnostic tools.
# This file contains no collection or playback behavior; it only turns already
# selected evidence into bounded, allowlisted diagnostic values.

$script:MaxStringLength = 4096
$script:MaxArrayLength = 128
$script:MaxObjectKeys = 128
$script:HashKey = New-Object byte[] 32
$diagnosticRng = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $diagnosticRng.GetBytes($script:HashKey) } finally { $diagnosticRng.Dispose() }
$script:utf8NoBom = New-Object Text.UTF8Encoding($false)

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
        'endpointid' = 'endpointIdHash'; 'helperinstanceid' = 'helperInstanceIdHash';
        'endpointidhash' = 'endpointIdHash'; 'helperinstanceidhash' = 'helperInstanceIdHash';
        'pathhash' = 'pathHash'; 'mappedpathhash' = 'mappedPathHash'; 'hosthash' = 'hostHash';
        'host' = 'hostHash'; 'hostname' = 'hostHash'; 'serverhost' = 'hostHash';
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
    [IO.File]::WriteAllText($Path, $Text, $script:utf8NoBom)
}

function Write-JsonFile {
    param([Parameter(Mandatory=$true)][string]$Path, [Parameter(Mandatory=$true)][object]$Value)
    $safe = Protect-DiagnosticValue $Value
    $json = $safe | ConvertTo-Json -Depth 24
    Write-Utf8File $Path ($json + "`n")
}

function Get-DiagnosticRedactionPatterns {
    return [ordered]@{
        'raw_url' = '(?i)\b[a-z][a-z0-9+.-]*://'
        'bearer_value' = '(?i)\bBearer\s+[A-Za-z0-9._~+/-]+'
        'secret_assignment' = '(?i)(authorization|x-emby-token|api[_-]?key|access[_-]?token|token|password|cookie|secret|pickcode)\s*[:=]\s*(?!\[redacted\])[^\s,;]+'
        'absolute_windows_path' = '(?i)(?:[A-Za-z]:[\\/]|\\\\)[^\s"'']+'
        'absolute_posix_json_path' = '"\s*:\s*"/(?:[^"/]+/)+[^"/]+"'
        'sensitive_json_key' = '(?i)"(?:authorization|x-emby-token|api[_-]?key|access[_-]?token|token|password|cookie|secret|credential|username|pickcode|commandline)"\s*:'
        'raw_sensitive_id_key' = '(?i)"(?:deviceid|sessionid|playsessionid|mediasourceid|itemid|userid|requestid|endpointid|helperinstanceid)"\s*:'
    }
}

function Test-DiagnosticRedaction {
    param(
        [string]$Directory,
        [string]$File
    )
    $targets = if ($File) { @(Get-Item -LiteralPath $File -ErrorAction Stop) } else { @(Get-ChildItem -LiteralPath $Directory -File -Recurse -ErrorAction Stop) }
    $failures = New-Object System.Collections.Generic.List[string]
    $patterns = Get-DiagnosticRedactionPatterns
    foreach ($target in $targets) {
        $text = [IO.File]::ReadAllText($target.FullName)
        foreach ($entry in $patterns.GetEnumerator()) {
            if ([regex]::IsMatch($text, $entry.Value)) {
                $code = $entry.Key + ':' + $target.Name
                if (-not $failures.Contains($code)) { $failures.Add($code) }
            }
        }
    }
    return @($failures)
}

function Test-BundleRedaction {
    param([Parameter(Mandatory=$true)][string]$Directory)
    return @(Test-DiagnosticRedaction -Directory $Directory)
}

function Test-SnapshotRedaction {
    param([Parameter(Mandatory=$true)][string]$File)
    return @(Test-DiagnosticRedaction -File $File)
}
