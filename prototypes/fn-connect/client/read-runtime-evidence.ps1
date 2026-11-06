# Read-only metadata. No process launch, extraction, signature trust check or network.
param(
    [Parameter(Mandatory = $true)][string]$RuntimeDirectory,
    [string]$ArchivePath,
    [string]$KnownElectronPath
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
function Assert-EvidencePath([string]$Value, [bool]$Directory = $false, $Exists = $null) {
    if ($Value -match '^[\\/]{2}|["\r\n]' -or -not [IO.Path]::IsPathRooted($Value) -or
        -not [IO.Path]::GetFullPath($Value).Equals($Value, [StringComparison]::OrdinalIgnoreCase)) { throw 'EVIDENCE_PATH_INVALID' }
    if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT -and
        [IO.DriveInfo]::new([IO.Path]::GetPathRoot($Value)).DriveType -ne [IO.DriveType]::Fixed) { throw 'EVIDENCE_PATH_INVALID' }
    # Walk from the fixed-drive root: reject a link before touching its children.
    $current = [IO.Path]::GetPathRoot($Value)
    $parts = @('') + @($Value.Substring($current.Length).Split([IO.Path]::DirectorySeparatorChar) | Where-Object { $_ })
    $item = $null
    foreach ($part in $parts) {
        if ($part) { $current = Join-Path $current $part }
        try { $item = Get-Item -LiteralPath $current -Force }
        catch [Management.Automation.ItemNotFoundException] {
            if ($null -ne $Exists) { $Exists.Value = $false; return }
            throw 'EVIDENCE_PATH_INVALID'
        }
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'EVIDENCE_PATH_INVALID' }
    }
    if (($item -is [IO.DirectoryInfo]) -ne $Directory) { throw 'EVIDENCE_PATH_INVALID' }
    if ($null -ne $Exists) { $Exists.Value = $true }
}
function Get-PeEvidence([string]$File) {
    Assert-EvidencePath $File
    $stream = [IO.File]::Open($File, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try {
        $reader = [IO.BinaryReader]::new($stream)
        if ($stream.Length -lt 64 -or $reader.ReadUInt16() -ne 0x5a4d) { throw 'EVIDENCE_PE_INVALID' }
        $stream.Position = 0x3c; $pe = $reader.ReadUInt32()
        if ($pe -lt 64 -or $pe -gt 8388608 -or $pe + 24 -gt $stream.Length) { throw 'EVIDENCE_PE_INVALID' }
        $stream.Position = $pe
        if ($reader.ReadUInt32() -ne 0x4550) { throw 'EVIDENCE_PE_INVALID' }
        $machine = $reader.ReadUInt16(); $stream.Position = $pe + 20; $optionalSize = $reader.ReadUInt16()
        $optional = $pe + 24
        if ($optionalSize -lt 2 -or $optional + $optionalSize -gt $stream.Length) { throw 'EVIDENCE_PE_INVALID' }
        $stream.Position = $optional; $magic = $reader.ReadUInt16()
        $directory = if ($magic -eq 0x20b) { 112 } elseif ($magic -eq 0x10b) { 96 } else { throw 'EVIDENCE_PE_INVALID' }
        $present = $false; $rangeValid = $null
        if ($optionalSize -ge $directory + 40) {
            $stream.Position = $optional + $directory - 4; $count = $reader.ReadUInt32()
            if ($count -ge 5) {
                $stream.Position = $optional + $directory + 32
                $offset = [long]$reader.ReadUInt32(); $size = [long]$reader.ReadUInt32()
                $present = $offset -ne 0 -or $size -ne 0
                if ($present) { $rangeValid = $size -ge 8 -and $offset -ge $optional + $optionalSize -and $offset + $size -le $stream.Length }
            }
        }
        $arch = switch ($machine) { 0x8664 { 'X64' } 0x14c { 'X86' } 0xaa64 { 'ARM64' } default { 'OTHER' } }
        return @{status = 'READ'; machine = $arch; pe32Plus = ($magic -eq 0x20b);
            certificateTablePresent = $present; certificateTableRangeValid = $rangeValid; signatureTrust = 'NOT_VERIFIED'}
    } finally { $stream.Dispose() }
}
function Compare-ArchiveRuntime([string]$Zip, [string]$Runtime, [string]$ExpectedSha, [int]$ExpectedCount) {
    Assert-EvidencePath $Zip; Assert-EvidencePath $Runtime $true
    if ((Get-FileHash -LiteralPath $Zip -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ExpectedSha) { return @{status = 'ARCHIVE_SHA_MISMATCH'} }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($Zip)
    try {
        $entries = @($archive.Entries | Where-Object { -not $_.FullName.EndsWith('/') })
        if ($entries.Count -ne $ExpectedCount) { throw 'EVIDENCE_ARCHIVE_INVALID' }
        $seen = @{}
        # Validate every name before opening any target file. No extraction.
        foreach ($entry in $entries) {
            $name = $entry.FullName
            if ($name -notmatch '^[A-Za-z0-9_./-]{1,200}$' -or $name.StartsWith('/') -or
                $name.Split('/') -contains '..' -or $name.Split('/') -contains '.' -or $name.Contains('//') -or $seen.ContainsKey($name)) { throw 'EVIDENCE_ARCHIVE_INVALID' }
            $seen[$name] = $true
        }
        $matched = 0; $missing = 0; $different = 0; $issues = @()
        foreach ($entry in $entries) {
            $target = Join-Path $Runtime $entry.FullName.Replace('/', [IO.Path]::DirectorySeparatorChar)
            $reason = $null
            $exists = $false; Assert-EvidencePath $target $false ([ref]$exists)
            if (-not $exists) { $missing++; $reason = 'MISSING' }
            else {
                $zipStream = $entry.Open(); $hash = [Security.Cryptography.SHA256]::Create()
                try { $expected = [BitConverter]::ToString($hash.ComputeHash($zipStream)).Replace('-', '').ToLowerInvariant() }
                finally { $zipStream.Dispose(); $hash.Dispose() }
                if ((Get-Item -LiteralPath $target).Length -eq $entry.Length -and
                    (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ceq $expected) { $matched++ }
                else { $different++; $reason = 'DIFFERENT' }
            }
            if ($reason -and $issues.Count -lt 5) { $issues += @{file = $entry.FullName; reason = $reason} }
        }
        return @{status = $(if ($matched -eq $ExpectedCount) { 'EXPECTED_FILES_MATCH' } else { 'EXPECTED_FILES_DIFFER' });
            expectedCount = $ExpectedCount; matched = $matched; missing = $missing; different = $different; issues = $issues; unlistedFilesRead = $false}
    } finally { $archive.Dispose() }
}
function Get-BinaryEvidence([string]$File, [string]$ExpectedSha) {
    $pe = Get-PeEvidence $File
    $sha = (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant()
    $version = [Diagnostics.FileVersionInfo]::GetVersionInfo($File).FileVersion
    if ($null -eq $version -or $version -notmatch '^\d{1,4}(\.\d{1,6}){1,3}$') { $version = 'UNKNOWN' }
    return @{sha256 = $sha; matchesPinned = ($sha -ceq $ExpectedSha); fileVersion = $version; pe = $pe}
}
$report = [ordered]@{entryId = 'ETE_FN_RUNTIME_EVIDENCE_V1'; scope = 'READ_ONLY_NO_LAUNCH'; status = 'PENDING';
    stage = 'INPUT';
    runtime = $null; archive = @{status = 'NOT_PROVIDED'}; knownElectron = @{status = 'NOT_PROVIDED'};
    os = @{status = 'NOT_READ'}; environmentPresence = @{}; systemDllResolution = 'NOT_TESTED'; errorCode = $null}
try {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'EVIDENCE_WINDOWS_ONLY' }
    Assert-EvidencePath $RuntimeDirectory $true
    $pin = '0446040f3c63eb75d5b1e1663d5ef27f07730a82df3e4fa47ff77c1a33cef07c'
    $report.stage = 'RUNTIME_METADATA'
    $report.runtime = Get-BinaryEvidence (Join-Path $RuntimeDirectory 'electron.exe') $pin
    if ($ArchivePath) {
        $report.stage = 'ARCHIVE_COMPARISON'; $report.archive = @{status = 'READ_REQUESTED'}
        $report.archive = Compare-ArchiveRuntime $ArchivePath $RuntimeDirectory '6aae435b6cd5c0eedf9fd38824bae4045ffdaecd029f0b8c8328bac3f5b71f03' 73
    }
    if ($KnownElectronPath) {
        $report.stage = 'KNOWN_BINARY_METADATA'; $report.knownElectron = Get-BinaryEvidence $KnownElectronPath $pin
        $report.knownElectron.sameBytesAsRuntime = $report.knownElectron.sha256 -ceq $report.runtime.sha256
    }
    $report.stage = 'ENVIRONMENT_PRESENCE'
    foreach ($name in @('ELECTRON_RUN_AS_NODE','NODE_OPTIONS','__COMPAT_LAYER','ELECTRON_ENABLE_LOGGING','ELECTRON_ENABLE_STACK_DUMPING','CHROME_LOG_FILE')) {
        $report.environmentPresence[$name] = Test-Path ('Env:' + $name)
    }
    $report.stage = 'OS_METADATA'
    $key = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('SOFTWARE\Microsoft\Windows NT\CurrentVersion', $false)
    try {
        if ($null -eq $key) { throw 'EVIDENCE_OS_UNAVAILABLE' }
        $values = @{}
        foreach ($name in @('CurrentMajorVersionNumber','CurrentMinorVersionNumber','CurrentBuildNumber','UBR')) {
            $raw = $key.GetValue($name)
            $values[$name] = if ($null -ne $raw -and [string]$raw -match '^\d{1,8}$') { [long]$raw } else { $null }
        }
    } finally { if ($null -ne $key) { $key.Dispose() } }
    $report.os = @{status = 'READ'; version = $values; is64BitOperatingSystem = [Environment]::Is64BitOperatingSystem;
        is64BitPowerShell = [Environment]::Is64BitProcess; fullCompatibility = 'NOT_ESTABLISHED'}
    $report.status = 'COLLECTED'; $report.stage = 'DONE'
} catch {
    $allowed = @('EVIDENCE_PATH_INVALID','EVIDENCE_PE_INVALID','EVIDENCE_ARCHIVE_INVALID','EVIDENCE_WINDOWS_ONLY','EVIDENCE_OS_UNAVAILABLE')
    $report.errorCode = if ($_.Exception.Message -cin $allowed) { $_.Exception.Message }
        elseif ($_.Exception -is [UnauthorizedAccessException] -or $_.Exception -is [Security.SecurityException]) { 'EVIDENCE_ACCESS_DENIED' }
        else { 'EVIDENCE_READ_FAILED' }
    $report.status = 'INCOMPLETE_STOP'
}
# No full paths, environment values, identities, exceptions or unknown log bodies.
$report | ConvertTo-Json -Depth 8 -Compress
