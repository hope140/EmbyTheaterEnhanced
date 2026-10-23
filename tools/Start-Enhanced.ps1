param([switch]$Wait)
$ErrorActionPreference = 'Stop'
$profileRoot = Join-Path $env:APPDATA 'EmbyTheaterEnhanced'
# Seed only missing settings; the source-built Host has no CEC installation entry.
New-Item -ItemType Directory -Path (Join-Path $profileRoot 'config') -Force | Out-Null
$systemConfig = Join-Path $profileRoot 'config/system.xml'
if (-not (Test-Path -LiteralPath $systemConfig)) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'config/system.xml') -Destination $systemConfig }
$process = Start-Process -FilePath (Join-Path $PSScriptRoot 'Emby.Theater.exe') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
if ($Wait) { $process.WaitForExit(); exit $process.ExitCode }
