param([string]$Mode)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../../prototypes/fn-connect/client/runner-preparation.ps1')
$root = Join-Path ([IO.Path]::GetTempPath()) ('ete-fn-cache-test-' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory $root
$held = $null
try {
    $cache = Join-Path $root 'cache'; $null = New-Item -ItemType Directory $cache
    $name = 'electron-v44.5.0-win32-x64.zip'; $source = Join-Path $cache $name
    $target = Join-Path $root $name; $bytes = [byte[]](1,2,3)
    [IO.File]::WriteAllBytes($source, $bytes)
    $expectedHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
    $length = 3L; $selectedRoot = $cache
    $script:networkCalls = 0; $script:directoryReads = 0; $script:unsafeChildReads = 0
    $originalAttributes = (Get-Command Get-FnCacheDirectoryAttributes).ScriptBlock
    function Get-FnCacheDirectoryAttributes([string]$Path) {
        $script:directoryReads++
        if ($Mode -eq 'linked-parent' -and $Path -eq $selectedRoot) { $script:unsafeChildReads++; throw 'UNEXPECTED_CHILD' }
        return (& $originalAttributes $Path)
    }
    function Invoke-WebRequest { $script:networkCalls++; throw 'UNEXPECTED_NETWORK' }
    switch ($Mode) {
        'network-drive' { function Get-FnCacheDriveType { return [IO.DriveType]::Network } }
        'missing-root' { $selectedRoot = Join-Path $root 'missing' }
        'missing-file' { [IO.File]::Delete($source) }
        'wrong-name' { [IO.File]::Move($source, (Join-Path $cache 'other.zip')) }
        'runtime-tree' { [IO.File]::Delete($source); $null = New-Item -ItemType Directory $source }
        'empty' { $selectedRoot = '' }
        'url' { $selectedRoot = 'https://example.invalid/cache' }
        'relative' { $selectedRoot = 'relative-cache' }
        'unc' { $selectedRoot = '\\example.invalid\cache' }
        'size' { $length = 4 }
        'hash' { $expectedHash = '0'*64 }
        'occupied' { $held = [IO.FileStream]::new($source,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None) }
        'destination-exists' { [IO.File]::WriteAllText($target, 'synthetic-neighbor') }
        'linked-root' {
            $selectedRoot = Join-Path $root 'linked'
            if ($IsWindows) { $null = New-Item -ItemType Junction -Path $selectedRoot -Target $cache }
            else { $null = New-Item -ItemType SymbolicLink -Path $selectedRoot -Target $cache }
        }
        'linked-parent' {
            $alias = Join-Path $root 'alias'; $child = Join-Path $cache 'child'; $null = New-Item -ItemType Directory $child
            if ($IsWindows) { $null = New-Item -ItemType Junction -Path $alias -Target $cache }
            else { $null = New-Item -ItemType SymbolicLink -Path $alias -Target $cache }
            $selectedRoot = Join-Path $alias 'child'
        }
        'linked-file' {
            $original = Join-Path $root 'original.zip'; [IO.File]::Move($source, $original)
            if ($IsWindows) { $originalDirectory = Join-Path $root 'original-dir'; $null = New-Item -ItemType Directory $originalDirectory; $null = New-Item -ItemType Junction -Path $source -Target $originalDirectory }
            else { $null = New-Item -ItemType SymbolicLink -Path $source -Target $original }
        }
        'changed' {
            $originalStamp = (Get-Command Get-FnArchiveStamp).ScriptBlock; $script:stampReads = 0
            function Get-FnArchiveStamp([string]$Path) {
                $value = & $originalStamp $Path; $script:stampReads++
                if ($script:stampReads -eq 2) { $value.written++ }
                return $value
            }
        }
    }
    $success = $false
    try { Copy-FnLockedArchive $selectedRoot $target $length $expectedHash; $success = $true } catch { }
    if ($held) { $held.Dispose(); $held = $null }
    $sourceUnchanged = if ($Mode -eq 'linked-file') { $true } elseif ([IO.File]::Exists($source)) { [Convert]::ToHexString([IO.File]::ReadAllBytes($source)) -ceq '010203' } else { $true }
    [ordered]@{success=$success;networkCalls=$script:networkCalls;sourceUnchanged=$sourceUnchanged;
        directoryReads=$script:directoryReads;unsafeChildReads=$script:unsafeChildReads;targetExists=[IO.File]::Exists($target);targetBytes=$(if([IO.File]::Exists($target)){(Get-Item $target).Length}else{0});
        neighborPreserved=$(if($Mode -eq 'destination-exists'){[IO.File]::ReadAllText($target) -ceq 'synthetic-neighbor'}else{$true})} | ConvertTo-Json -Compress
} finally { if ($held) { $held.Dispose() }; Remove-Item $root -Recurse -Force }
