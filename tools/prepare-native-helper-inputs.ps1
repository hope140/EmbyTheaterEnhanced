param([string]$DestinationRoot)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $root 'vendor/native-helper-manifest.json') | ConvertFrom-Json
if (-not $DestinationRoot) { $DestinationRoot = Join-Path $root 'vendor/native-helper-inputs' }
$header = Join-Path $DestinationRoot 'mpv/client.h'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $header) | Out-Null
$temporary = $header + '.download'
try {
    Invoke-WebRequest -UseBasicParsing -Uri $manifest.clientHeader.source -OutFile $temporary
    $actual = (Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $manifest.clientHeader.sha256) { throw 'Pinned mpv client.h SHA256 mismatch.' }
    Move-Item -LiteralPath $temporary -Destination $header -Force
} finally {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
}
Write-Output "Prepared pinned native helper header: $header"
