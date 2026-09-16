param(
    [Parameter(Mandatory=$true)][string]$InputRoot,
    [Parameter(Mandatory=$true)][string]$Libmpv,
    [Parameter(Mandatory=$true)][string]$OutputRoot
)

$ErrorActionPreference = 'Stop'
$expectedHeader = '1acf99ee77c8c2a6f1d1993bd81bbc8a91d27fb5924e80171670e6139a4bd353'
$expectedLibmpv = '965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c'
$header = Join-Path $InputRoot 'mpv\client.h'
$source = Join-Path $PSScriptRoot 'native-helper.cpp'
$output = Join-Path $OutputRoot 'helper-native-pipe.exe'

if (-not (Test-Path -LiteralPath $header -PathType Leaf)) { throw "Missing pinned mpv header: $header" }
if (-not (Test-Path -LiteralPath $Libmpv -PathType Leaf)) { throw "Missing libmpv: $Libmpv" }
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $header).Hash.ToLowerInvariant() -ne $expectedHeader) { throw 'Pinned client.h SHA256 mismatch' }
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $Libmpv).Hash.ToLowerInvariant() -ne $expectedLibmpv) { throw 'Pinned libmpv SHA256 mismatch' }

New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null
$compiler = (Get-Command g++.exe -ErrorAction Stop).Source
$arguments = @(
    '-std=c++17', '-O2', '-Wall', '-Wextra', '-Werror', '-Wno-cast-function-type',
    '-static', '-static-libgcc', '-static-libstdc++',
    ('-I' + $InputRoot), $source, '-o', $output
)
& $compiler @arguments
if ($LASTEXITCODE -ne 0) { throw "g++ failed with exit code $LASTEXITCODE" }

$provenance = [ordered]@{
    schemaVersion = 1
    architecture = 'Windows x64'
    compilerPath = $compiler
    compilerVersion = (& $compiler --version | Select-Object -First 1)
    flags = $arguments[0..8]
    source = [ordered]@{ path = 'experiments/helper-native-pipe/native-helper.cpp'; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $source).Hash.ToLowerInvariant() }
    clientHeader = [ordered]@{ path = $header; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $header).Hash.ToLowerInvariant() }
    libmpv = [ordered]@{ path = (Resolve-Path -LiteralPath $Libmpv).Path; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $Libmpv).Hash.ToLowerInvariant(); fileVersion = (Get-Item -LiteralPath $Libmpv).VersionInfo.FileVersion }
    helper = [ordered]@{ path = $output; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $output).Hash.ToLowerInvariant(); size = (Get-Item -LiteralPath $output).Length }
    buildCommand = 'g++ -std=c++17 -O2 -Wall -Wextra -Werror -Wno-cast-function-type -static -static-libgcc -static-libstdc++ -I<InputRoot> native-helper.cpp -o helper-native-pipe.exe'
}
$provenanceJson = $provenance | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText((Join-Path $OutputRoot 'runtime-provenance.json'), $provenanceJson + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
$provenance | ConvertTo-Json -Depth 8
