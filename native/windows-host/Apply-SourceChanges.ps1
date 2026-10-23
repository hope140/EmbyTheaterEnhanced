[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$SourceRoot,
    [Parameter(Mandatory=$true)][string]$DestinationRoot
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
function Assert-Physical([string]$Path, [bool]$Directory) {
    $item = Get-Item -LiteralPath $Path -Force
    if ([bool]$item.PSIsContainer -ne $Directory) { throw "Unexpected input type: $Path" }
    $cursor = [IO.Path]::GetFullPath($Path)
    while ($cursor) {
        $entry = Get-Item -LiteralPath $cursor -Force
        if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Redirected input: $Path" }
        $parent = [IO.Directory]::GetParent($cursor)
        if ($null -eq $parent) { break }
        $cursor = $parent.FullName
    }
}
function Assert-Relative([string]$Path) {
    if ($Path -notmatch '^[A-Za-z0-9_./-]+$' -or $Path.StartsWith('/') -or @($Path.Split('/') | Where-Object {$_ -eq '' -or $_ -eq '.' -or $_ -eq '..'}).Count) { throw "Unsafe relative path: $Path" }
}
function Get-SHA256([byte[]]$Bytes) {
    $hash = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($hash.ComputeHash($Bytes))).Replace('-','').ToLowerInvariant() }
    finally { $hash.Dispose() }
}
$source = [IO.Path]::GetFullPath($SourceRoot).TrimEnd([IO.Path]::DirectorySeparatorChar)
$destination = [IO.Path]::GetFullPath($DestinationRoot).TrimEnd([IO.Path]::DirectorySeparatorChar)
Assert-Physical $source $true
if (Test-Path -LiteralPath $destination) { throw 'DestinationRoot must be new and absent.' }
if ($destination.StartsWith($source+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'DestinationRoot must be outside preserved source.' }
$ancestor = [IO.Directory]::GetParent($destination)
while (!(Test-Path -LiteralPath $ancestor.FullName)) { $ancestor = $ancestor.Parent }
Assert-Physical $ancestor.FullName $true
$originalManifestPath = Join-Path $PSScriptRoot 'upstream-source-manifest.json'
$changeManifestPath = Join-Path $PSScriptRoot 'change-manifest.json'
Assert-Physical $originalManifestPath $false
Assert-Physical $changeManifestPath $false
$originals = Get-Content -LiteralPath $originalManifestPath -Raw | ConvertFrom-Json
$changes = Get-Content -LiteralPath $changeManifestPath -Raw | ConvertFrom-Json
if ($originals.commit -ne '708fadc068cbf66ced6aece4a32f3e12bb2c4e13' -or $originals.files.Count -ne 55 -or $changes.changes.Count -ne 6 -or $changes.addedSources.Count -ne 2 -or $changes.compileInputCount -ne 46 -or $changes.candidateSourceFileCount -ne 57) { throw 'Unexpected source/change contract.' }
$cache = @{}
# Validate EVERY fixed original and EVERY replacement before creating output.
foreach ($f in $originals.files) {
    Assert-Relative $f.path
    if ($cache.ContainsKey($f.path)) { throw "Duplicate source path: $($f.path)" }
    $p = Join-Path $source $f.path
    Assert-Physical $p $false
    $bytes = [IO.File]::ReadAllBytes($p)
    if ($bytes.Length -ne $f.size -or (Get-SHA256 $bytes) -cne $f.sha256) { throw "Original identity mismatch: $($f.path)" }
    $cache[$f.path] = $bytes
}
foreach ($c in $changes.changes) {
    Assert-Relative $c.path
    if (!$cache.ContainsKey($c.path) -or (Get-SHA256 $cache[$c.path]) -cne $c.originalSHA256) { throw "Unmatched original change path: $($c.path)" }
    $p = Join-Path (Join-Path $PSScriptRoot 'changes') $c.path
    Assert-Physical $p $false
    $bytes = [IO.File]::ReadAllBytes($p)
    if ($bytes.Length -ne $c.candidateSize -or (Get-SHA256 $bytes) -cne $c.candidateSHA256) { throw "Replacement identity mismatch: $($c.path)" }
    $cache[$c.path] = $bytes
}
foreach ($c in $changes.addedSources) {
    Assert-Relative $c.path
    if ($cache.ContainsKey($c.path)) { throw "Added source collides with original: $($c.path)" }
    $p = Join-Path (Join-Path $PSScriptRoot 'changes') $c.path
    Assert-Physical $p $false
    $bytes = [IO.File]::ReadAllBytes($p)
    if ($bytes.Length -ne $c.candidateSize -or (Get-SHA256 $bytes) -cne $c.candidateSHA256) { throw "Added source identity mismatch: $($c.path)" }
    $cache[$c.path] = $bytes
}
$patch = Join-Path $PSScriptRoot 'host-retirement.patch'
Assert-Physical $patch $false
if ((Get-SHA256 ([IO.File]::ReadAllBytes($patch))) -cne $changes.patchSHA256) { throw 'Patch identity mismatch.' }
# Copy only55 original source/resource/license files plus2 declared helper sources.
New-Item -ItemType Directory -Path $destination | Out-Null
$records = @()
foreach ($f in @($originals.files) + @($changes.addedSources)) {
    $p = Join-Path $destination $f.path
    New-Item -ItemType Directory -Path (Split-Path -Parent $p) -Force | Out-Null
    [IO.File]::WriteAllBytes($p,$cache[$f.path])
    $records += [ordered]@{path=$f.path;size=$cache[$f.path].Length;sha256=(Get-SHA256 $cache[$f.path])}
}
[ordered]@{upstreamCommit=$originals.commit;kind='ETE source-modified Host candidate; not official unchanged binary';originalSourceManifestSHA256=(Get-SHA256 ([IO.File]::ReadAllBytes($originalManifestPath)));changeManifestSHA256=(Get-SHA256 ([IO.File]::ReadAllBytes($changeManifestPath)));patchSHA256=$changes.patchSHA256;compileInputCount=46;files=$records;compiled=$false;executed=$false} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $destination 'ete-host-source-provenance.json') -Encoding UTF8
Write-Output 'Prepared57-source candidate with6 replacements+2 additions /46 Compile inputs. No compilation or Host execution. Five locked binary dependencies, including pinned Newtonsoft; final Windows build/verification pending.'
