param([Parameter(Mandatory = $true)][string]$ArchivePath)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = Split-Path -Parent $PSScriptRoot
$tool = Join-Path $PSScriptRoot 'windows-host-input.cjs'
$metadata = & node $tool metadata $root
if ($LASTEXITCODE -ne 0) { throw 'Windows Host manifest validation failed.' }
$manifest = $metadata | ConvertFrom-Json
& node $tool validate-archive $root $ArchivePath
if ($LASTEXITCODE -ne 0) { throw 'Windows Host official archive validation failed.' }
$prepared = Join-Path $root ([string]$manifest.inputRoot)
if (Test-Path -LiteralPath $prepared) {
    & node $tool validate $root
    if ($LASTEXITCODE -ne 0) { throw 'Existing Windows Host component differs from its lock.' }
    return
}
function New-PhysicalDirectory([string]$directory) {
    $absolute = [IO.Path]::GetFullPath($directory)
    $cursor = [IO.Path]::GetPathRoot($absolute)
    foreach ($segment in $absolute.Substring($cursor.Length).Split([IO.Path]::DirectorySeparatorChar,[StringSplitOptions]::RemoveEmptyEntries)) {
        $cursor = Join-Path $cursor $segment
        if (-not (Test-Path -LiteralPath $cursor)) { [IO.Directory]::CreateDirectory($cursor) | Out-Null }
        $item = Get-Item -LiteralPath $cursor -Force
        if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Windows Host output contains a redirect or non-directory.' }
    }
}
# Read and verify the entire whitelist before creating any component output.
# No archive executable, driver installer or assembly is run.
$buffers = @()
$zip = [IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($ArchivePath))
try {
    foreach ($entry in $manifest.files) {
        $matches = @($zip.Entries | Where-Object { $_.FullName -ceq [string]$entry.path })
        if ($matches.Count -ne 1 -or $matches[0].Length -ne [long]$entry.size) { throw 'Windows Host archive member mismatch.' }
        $source = $matches[0].Open()
        $memory = New-Object IO.MemoryStream
        try { $source.CopyTo($memory); $bytes = $memory.ToArray() } finally { $source.Dispose(); $memory.Dispose() }
        $algorithm = [Security.Cryptography.SHA256]::Create()
        try { $hash = ([BitConverter]::ToString($algorithm.ComputeHash($bytes))).Replace('-','').ToLowerInvariant() } finally { $algorithm.Dispose() }
        if ($hash -ne [string]$entry.sha256) { throw 'Windows Host archive member hash mismatch.' }
        $buffers += @{ Entry=$entry; Bytes=$bytes }
    }
} finally { $zip.Dispose() }
foreach ($buffer in $buffers) {
    $target = Join-Path $prepared ([string]$buffer.Entry.path)
    New-PhysicalDirectory (Split-Path -Parent $target)
    $output = [IO.File]::Open($target,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
    try { $output.Write($buffer.Bytes,0,$buffer.Bytes.Length) } finally { $output.Dispose() }
}
& node $tool validate $root
if ($LASTEXITCODE -ne 0) { throw 'Prepared Windows Host component verification failed.' }
Write-Output 'Pinned Windows Host component prepared from the official 3.0.20 release whitelist.'
