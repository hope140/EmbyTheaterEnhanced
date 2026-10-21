param([Parameter(Mandatory)][string]$SourceUrl, [Parameter(Mandatory)][string]$Destination, [Parameter(Mandatory)][long]$MaximumBytes)
$ErrorActionPreference = 'Stop'
# No browser emulation or challenge bypass. Only the official SourceForge route.
$initial = [uri]$SourceUrl
$asset = [uri]::UnescapeDataString(($initial.AbsolutePath -split '/')[-2])
if ($initial.Scheme -ne 'https' -or $initial.Host -ne 'sourceforge.net' -or $initial.UserInfo -or
    $initial.AbsolutePath -cne "/projects/mpv-player-windows/files/libmpv/$asset/download" -or
    $asset -cnotmatch '^mpv-dev-x86_64-\d{8}-git-[a-f0-9]{10}\.7z$') { throw 'Invalid pinned libmpv source URL.' }
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
$route = [System.Collections.Generic.List[object]]::new()
try {
    $uri = $initial
    for ($hop = 0; $hop -le 5; $hop++) {
        Assert-OfficialRoute $uri
        $response = $client.GetAsync($uri, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
        try {
            $status = [int]$response.StatusCode
            $mime = [string]$response.Content.Headers.ContentType.MediaType
            $route.Add(@{ host = $uri.Host; path = $uri.AbsolutePath; status = $status; contentType = $mime })
            if ($status -in @(301,302,303,307,308)) {
                if (-not $response.Headers.Location) { throw 'libmpv redirect has no Location.' }
                $uri = [uri]::new($uri, $response.Headers.Location)
                continue
            }
            if ($status -ne 200) { throw "libmpv HTTP $status; stopped without retry or alternate source." }
            if ($mime -notin @('application/x-7z-compressed','application/octet-stream','binary/octet-stream')) {
                throw "libmpv download returned unexpected content type '$mime' (HTML/download pages are not archives)."
            }
            if ($response.Content.Headers.ContentLength -and $response.Content.Headers.ContentLength -ne $MaximumBytes) { throw 'libmpv Content-Length differs from the pinned archive.' }
            $input = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
            $output = [System.IO.File]::Open($Destination,[System.IO.FileMode]::CreateNew,[System.IO.FileAccess]::Write,[System.IO.FileShare]::None)
            try {
                $buffer = [byte[]]::new(65536)
                [long]$total = 0
                while (($read = $input.Read($buffer,0,$buffer.Length)) -gt 0) {
                    $total += $read
                    if ($total -gt $MaximumBytes) { throw 'libmpv response exceeds pinned archive size.' }
                    $output.Write($buffer,0,$read)
                }
            } finally { $output.Dispose(); $input.Dispose() }
            @{ route = $route.ToArray(); bytes = $total } | ConvertTo-Json -Depth 5 -Compress
            return
        } finally { $response.Dispose() }
    }
    throw 'libmpv redirect limit reached; no automatic retry.'
} finally { $client.Dispose(); $handler.Dispose() }
