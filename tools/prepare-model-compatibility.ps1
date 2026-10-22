param([Parameter(Mandatory = $true)][string]$ArchivePath)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = Split-Path -Parent $PSScriptRoot
$tool = Join-Path $PSScriptRoot 'model-compatibility-input.cjs'
$metadata = & node $tool metadata $root
if ($LASTEXITCODE -ne 0) { throw 'Official Model manifest validation failed.' }
$manifest = $metadata | ConvertFrom-Json
& node $tool validate-archive $root $ArchivePath
if ($LASTEXITCODE -ne 0) { throw 'Official Model archive validation failed.' }
$prepared = Join-Path $root ([string]$manifest.inputRoot)
if (Test-Path -LiteralPath $prepared) {
    & node $tool validate $root
    if ($LASTEXITCODE -ne 0) { throw 'Existing Model component differs from its official lock; preserve it and stop.' }
    return
}
function New-PhysicalDirectory([string]$directory) {
    $absolute = [IO.Path]::GetFullPath($directory)
    $cursor = [IO.Path]::GetPathRoot($absolute)
    foreach ($segment in $absolute.Substring($cursor.Length).Split([IO.Path]::DirectorySeparatorChar,[StringSplitOptions]::RemoveEmptyEntries)) {
        $cursor = Join-Path $cursor $segment
        if (-not (Test-Path -LiteralPath $cursor)) { [IO.Directory]::CreateDirectory($cursor) | Out-Null }
        $item = Get-Item -LiteralPath $cursor -Force
        if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Official Model output contains a redirect or non-directory.' }
    }
}
# Validate the complete archive and unique exact member before any output.
# No assembly, installer, updater or other archive member is executed.
$entry = $manifest.files[0]
$zip = [IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($ArchivePath))
try {
    $matches = @($zip.Entries | Where-Object { $_.FullName -ceq [string]$entry.path })
    if ($matches.Count -ne 1 -or $matches[0].Length -ne [long]$entry.size) { throw 'Official Model archive member mismatch.' }
    $source = $matches[0].Open()
    $memory = New-Object IO.MemoryStream
    try { $source.CopyTo($memory); $bytes = $memory.ToArray() } finally { $source.Dispose(); $memory.Dispose() }
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { $hash = ([BitConverter]::ToString($algorithm.ComputeHash($bytes))).Replace('-','').ToLowerInvariant() } finally { $algorithm.Dispose() }
    if ($hash -ne [string]$entry.sha256) { throw 'Official Model archive member hash mismatch.' }
} finally { $zip.Dispose() }
$target = Join-Path $prepared ([string]$entry.path)
New-PhysicalDirectory (Split-Path -Parent $target)
$output = [IO.File]::Open($target,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
try { $output.Write($bytes,0,$bytes.Length) } finally { $output.Dispose() }
& node $tool validate $root
if ($LASTEXITCODE -ne 0) { throw 'Prepared official Model component verification failed.' }
Write-Output 'Pinned official Windows 3.0.20 Model component prepared.'
