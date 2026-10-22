param([Parameter(Mandatory)][string]$SourceUrl, [Parameter(Mandatory)][string]$Destination, [Parameter(Mandatory)][long]$MaximumBytes)
$ErrorActionPreference = 'Stop'

function Get-SafeLibmpvResponseHeaders($Response) {
    $safe = [ordered]@{}
    $values = $null
    if ($Response.Headers.TryGetValues('Server', [ref]$values)) {
        $value = [string]::Join(' ', @($values))
        # Report a known product family, never arbitrary server-supplied text.
        $safe.server = if ($value -match '^(?i:cloudflare|nginx|apache|envoy|microsoft-iis|ats|squid)(?:/[0-9.]{1,16})?(?:\s|$)') {
            ($Matches[0].Trim() -split '/')[0].ToLowerInvariant()
        } else { 'other' }
    }
    $values = $null
    if ($Response.Headers.TryGetValues('CF-Ray', [ref]$values)) {
        $value = [string]::Join(',', @($values))
        $safe.cfRay = if ($value -cmatch '^[0-9a-fA-F]{16,32}-[A-Z]{3}$') { $value } else { 'redacted' }
    }
    $values = $null
    if ($Response.Headers.TryGetValues('Retry-After', [ref]$values)) {
        $value = [string]::Join(',', @($values))
        $date = [DateTimeOffset]::MinValue
        if ($value -cmatch '^[0-9]{1,8}$') { $safe.retryAfter = ([long]$value).ToString([Globalization.CultureInfo]::InvariantCulture) }
        elseif ([DateTimeOffset]::TryParseExact($value, 'r', [Globalization.CultureInfo]::InvariantCulture,
                [Globalization.DateTimeStyles]::AssumeUniversal, [ref]$date)) {
            $safe.retryAfter = $date.UtcDateTime.ToString('r', [Globalization.CultureInfo]::InvariantCulture)
        } else { $safe.retryAfter = 'redacted' }
    }
    return $safe
}

function Invoke-PinnedLibmpvDownload {
    param([string]$SourceUrl, [string]$Destination, [long]$MaximumBytes,
        # Library-only test seam. The command-line entry exposes no transport override.
        [scriptblock]$SendRequest = $null)
    $attemptId = [guid]::NewGuid().ToString('D')
    $route = [System.Collections.Generic.List[object]]::new()
    $requestCount = 0; $responseCount = 0; $redirectCount = 0
    $client = $null; $handler = $null
    $reason = 'invalid-source'; $safeMessage = 'Invalid pinned libmpv source URL.'
    try {
        # No browser emulation or challenge bypass. Only the original official route.
        $initial = [uri]$SourceUrl
        $asset = [uri]::UnescapeDataString(($initial.AbsolutePath -split '/')[-2])
        if ($initial.Scheme -ne 'https' -or $initial.Host -ne 'sourceforge.net' -or $initial.UserInfo -or
            $initial.AbsolutePath -cne "/projects/mpv-player-windows/files/libmpv/$asset/download" -or
            $asset -cnotmatch '^mpv-dev-x86_64-\d{8}-git-[a-f0-9]{10}\.7z$') { throw $safeMessage }
        function Assert-OfficialRoute([uri]$Uri) {
            if ($Uri.Scheme -ne 'https' -or $Uri.UserInfo -or -not $Uri.IsDefaultPort) { throw 'Unsafe libmpv redirect refused.' }
            if ($Uri.Host -eq 'sourceforge.net' -and $Uri.AbsolutePath -ceq $initial.AbsolutePath) { return }
            if (($Uri.Host -eq 'downloads.sourceforge.net' -or $Uri.Host -match '^[a-z0-9-]+\.dl\.sourceforge\.net$') -and
                $Uri.AbsolutePath -ceq "/project/mpv-player-windows/libmpv/$asset") { return }
            throw 'Non-project libmpv redirect refused.'
        }
        $handler = [System.Net.Http.HttpClientHandler]::new()
        $handler.AllowAutoRedirect = $false
        $client = [System.Net.Http.HttpClient]::new($handler)
        $client.Timeout = [TimeSpan]::FromMinutes(5)
        if (-not $SendRequest) {
            $SendRequest = { param($Uri) $client.GetAsync($Uri, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult() }
        }
        $uri = $initial
        for ($hop = 0; $hop -le 5; $hop++) {
            $reason = 'route-refused'; $safeMessage = 'Non-project or unsafe libmpv redirect refused.'
            Assert-OfficialRoute $uri
            $requestCount++
            # Only validated public host/path are retained; query, fragment and user info are never logged.
            $entry = [ordered]@{ requestIndex=$requestCount; host=$uri.Host; path=$uri.AbsolutePath;
                status=$null; contentType=$null; responseHeaders=[ordered]@{} }
            $route.Add($entry)
            $reason = 'transport'; $safeMessage = 'libmpv transport failed; stopped without retry or alternate source.'
            $response = & $SendRequest $uri
            try {
                $responseCount++
                $reason = 'response-metadata'; $safeMessage = 'Invalid libmpv response metadata.'
                $status = [int]$response.StatusCode
                $mime = [string]$response.Content.Headers.ContentType.MediaType
                $entry.status = $status
                $entry.contentType = if ($mime -in @('text/html','text/plain','application/json','application/x-7z-compressed','application/octet-stream','binary/octet-stream')) { $mime.ToLowerInvariant() } else { 'other' }
                $entry.responseHeaders = Get-SafeLibmpvResponseHeaders $response
                if ($status -in @(301,302,303,307,308)) {
                    $reason = 'invalid-redirect'; $safeMessage = 'libmpv redirect has no valid Location.'
                    if (-not $response.Headers.Location) { throw $safeMessage }
                    $uri = [uri]::new($uri, $response.Headers.Location)
                    $redirectCount++
                    continue
                }
                $reason = 'http-status'; $safeMessage = "libmpv HTTP $status; stopped without retry or alternate source."
                if ($status -ne 200) { throw $safeMessage }
                $reason = 'content-type'; $safeMessage = 'libmpv returned unexpected content type (HTML/download pages are not archives).'
                if ($mime -notin @('application/x-7z-compressed','application/octet-stream','binary/octet-stream')) { throw $safeMessage }
                $reason = 'content-length'; $safeMessage = 'libmpv Content-Length differs from the pinned archive.'
                if ($response.Content.Headers.ContentLength -and $response.Content.Headers.ContentLength -ne $MaximumBytes) { throw $safeMessage }
                $reason = 'transfer'; $safeMessage = 'libmpv bounded archive transfer failed.'
                $input = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
                $output = $null
                try {
                    $output = [System.IO.File]::Open($Destination,[System.IO.FileMode]::CreateNew,[System.IO.FileAccess]::Write,[System.IO.FileShare]::None)
                    $buffer = [byte[]]::new(65536)
                    [long]$total = 0
                    while (($read = $input.Read($buffer,0,$buffer.Length)) -gt 0) {
                        $total += $read
                        if ($total -gt $MaximumBytes) { $reason='response-size'; $safeMessage='libmpv response exceeds pinned archive size.'; throw $safeMessage }
                        $output.Write($buffer,0,$read)
                    }
                } finally { if ($output) { $output.Dispose() }; $input.Dispose() }
                # Preserve the successful transport receipt shape.
                return @{ route=@($route.ToArray() | ForEach-Object { @{host=$_.host;path=$_.path;status=$_.status;contentType=$_.contentType} }); bytes=$total }
            } finally { if ($response) { $response.Dispose() } }
        }
        $reason = 'redirect-limit'; $safeMessage = 'libmpv redirect limit reached; no automatic retry.'
        throw $safeMessage
    } catch {
        # Never echo exception text: transports and file errors may contain URLs or private paths.
        $diagnostic = [ordered]@{ schemaVersion=1; event='libmpv-http-failure'; attemptId=$attemptId;
            reason=$reason; requestCount=$requestCount; responseCount=$responseCount;
            requestCountScope='explicit-transport-invocations'; redirectCount=$redirectCount; retryCount=0; route=$route.ToArray() }
        throw ($safeMessage + ' LIBMPV_HTTP_DIAGNOSTIC ' + ($diagnostic | ConvertTo-Json -Depth 7 -Compress))
    } finally {
        if ($client) { $client.Dispose() }
        if ($handler) { $handler.Dispose() }
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    try {
        Invoke-PinnedLibmpvDownload -SourceUrl $SourceUrl -Destination $Destination -MaximumBytes $MaximumBytes | ConvertTo-Json -Depth 5 -Compress
    } catch {
        [Console]::Error.WriteLine($_.Exception.Message)
        exit 1
    }
}
