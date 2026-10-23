param([switch]$PrepareOnly)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path -Parent $PSScriptRoot
if (-not $IsWindows) { throw 'Source-built Host runner preparation requires Windows.' }
$tool = Join-Path $PSScriptRoot 'ci-source-built-host-plan.cjs'
$planJson = & node $tool plan $root
if ($LASTEXITCODE -ne 0) { throw 'Source-built Host acquisition plan mismatch.' }
$plan = $planJson | ConvertFrom-Json
$work = Join-Path $root '.work/actions-host-build'
if (Test-Path -LiteralPath $work) { throw 'Host runner work must be new; preserve existing evidence.' }
# All network acquisitions are pinned, read-only and verified before extraction.
& node $tool new-work $root $work
if ($LASTEXITCODE -ne 0) { throw 'Host runner work is not a new physical directory.' }
$packages = Join-Path $work 'packages'
New-Item -ItemType Directory -Path $packages | Out-Null
foreach ($entry in $plan.files) {
    $partial = Join-Path $packages ($entry.name + '.partial')
    Invoke-WebRequest -Uri $entry.url -OutFile $partial -MaximumRedirection 5 -TimeoutSec 240
    & node $tool verify-package $root $partial $entry.id
    if ($LASTEXITCODE -ne 0) { throw ('Pinned Host package failed validation: ' + $entry.id) }
    [IO.File]::Move($partial, (Join-Path $packages $entry.name))
}
$objects = Join-Path $work 'official-host.git'
& git init --bare $objects
if ($LASTEXITCODE -ne 0) { throw 'Host source object store creation failed.' }
& git -C $objects fetch --depth=1 --no-tags $plan.repository $plan.commit
if ($LASTEXITCODE -ne 0) { throw 'Fixed Host source fetch failed; no branch/version substitution.' }
$source = Join-Path $work 'source'
& node $tool source $root $objects $source
if ($LASTEXITCODE -ne 0) { throw 'Original55 Host source recovery failed.' }
$kit = Join-Path $work 'kit'
& node $tool kit $root $kit
if ($LASTEXITCODE -ne 0) { throw 'Current source-bound Host kit preparation failed.' }

Add-Type -AssemblyName System.IO.Compression.FileSystem
function Read-Member($entry) {
    $stream = $entry.Open(); $memory = [IO.MemoryStream]::new()
    try { $stream.CopyTo($memory); return ,($memory.ToArray()) } finally { $stream.Dispose(); $memory.Dispose() }
}
$jsonManifest = Get-Content -LiteralPath (Join-Path $root 'vendor/host-json-manifest.json') -Raw | ConvertFrom-Json
$jsonPackage = Join-Path $packages 'newtonsoft.json.13.0.4.nupkg'
$zip = [IO.Compression.ZipFile]::OpenRead($jsonPackage)
try {
    $members = @($zip.Entries | Where-Object { $_.FullName -ceq $jsonManifest.package.selectedMember })
    if ($members.Count -ne 1) { throw 'Ambiguous Newtonsoft selected member.' }
    $jsonBytes = Read-Member $members[0]
} finally { $zip.Dispose() }
$jsonStage = Join-Path $work 'json'
New-Item -ItemType Directory -Path $jsonStage | Out-Null
$jsonDll = Join-Path $jsonStage 'Newtonsoft.Json.dll'
[IO.File]::WriteAllBytes($jsonDll, $jsonBytes)
if ($jsonBytes.Length -ne $jsonManifest.file.size -or (Get-FileHash -LiteralPath $jsonDll -Algorithm SHA256).Hash.ToLowerInvariant() -cne $jsonManifest.file.sha256) { throw 'Newtonsoft DLL identity mismatch.' }
$referencePackage = Join-Path $packages 'microsoft.netframework.referenceassemblies.net462.1.0.3.nupkg'
$framework = Join-Path $work 'net462'
New-Item -ItemType Directory -Path $framework | Out-Null
$zip = [IO.Compression.ZipFile]::OpenRead($referencePackage)
try {
    $anchors = @($zip.Entries | Where-Object { $_.FullName.EndsWith('/v4.6.2/mscorlib.dll', [StringComparison]::Ordinal) })
    if ($anchors.Count -ne 1) { throw 'Ambiguous net462 reference pack root.' }
    $prefix = $anchors[0].FullName.Substring(0, $anchors[0].FullName.Length - 'mscorlib.dll'.Length)
    $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($entry in $zip.Entries) {
        if (-not $entry.FullName.StartsWith($prefix, [StringComparison]::Ordinal) -or $entry.FullName.EndsWith('/')) { continue }
        $relative = $entry.FullName.Substring($prefix.Length)
        if (-not $relative -or $relative.Contains('\') -or $relative.Contains(':') -or $relative.StartsWith('/') -or @($relative.Split('/') | Where-Object { -not $_ -or $_ -eq '.' -or $_ -eq '..' -or $_ -match '[. ]$|^(?i:con|prn|aux|nul|com\d|lpt\d)(\.|$)' }).Count -or -not $seen.Add($relative)) { throw 'Unsafe/duplicate reference pack member.' }
        $destination = Join-Path $framework $relative
        New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
        [IO.File]::WriteAllBytes($destination, (Read-Member $entry))
    }
    if ($seen.Count -lt 10 -or -not $seen.Contains('System.Configuration.dll')) { throw 'Incomplete reference pack.' }
} finally { $zip.Dispose() }
if ($PrepareOnly) { Write-Output 'Prepared exact source/packages/kit only; no Host compilation, execution or verified lock.'; return }

# Validate the reviewed probe before compilation; never import an external envelope.
$probe = Join-Path $PSScriptRoot 'Test-SourceBuiltHost.ps1'
if (-not (Test-Path -LiteralPath $probe)) { throw 'Runner Host verification harness is missing; no compiled/accepted runtime or package is produced.' }
& node $tool verify-verifier $root
if ($LASTEXITCODE -ne 0) { throw 'Reviewed Host verifier inputs failed validation.' }
$verifierPowerShell = (Get-Command pwsh.exe -ErrorAction Stop).Source
& $verifierPowerShell -NoProfile -NonInteractive -Command 'if ($PSVersionTable.PSVersion.Major -lt 7) { exit 1 }'
if ($LASTEXITCODE -ne 0) { throw 'Existing PowerShell7 verifier host unavailable; no install/fallback.' }
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere)) { throw 'Existing VS2022 locator unavailable; no compiler install/fallback.' }
$msbuild = @(& $vswhere -version '[17.0,18.0)' -products '*' -requires Microsoft.Component.MSBuild -find 'MSBuild\**\Bin\MSBuild.exe')
if ($LASTEXITCODE -ne 0 -or $msbuild.Count -eq 0) { throw 'Existing MSBuild17 unavailable.' }
$buildRoot = Join-Path ([IO.Path]::GetTempPath()) ('ete-host-unified-' + [guid]::NewGuid().ToString('N'))
$windowsPowerShell = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
& $windowsPowerShell -NoProfile -NonInteractive -File (Join-Path $kit 'Build-UnifiedHost.ps1') -SourceRoot $source -OfficialHostRoot (Join-Path $root 'vendor/windows-host/3.0.20') -ModelPath (Join-Path $root 'vendor/model-compatibility/snapshot-v1/MediaBrowser.Model.dll') -NewtonsoftDllPath $jsonDll -NewtonsoftPackage $jsonPackage -MSBuildPath $msbuild[0] -ReferenceAssembliesPackage $referencePackage -ReferenceAssembliesPath $framework -OutputRoot $buildRoot
if ($LASTEXITCODE -ne 0) { throw 'Runner Host compilation failed; no old Host fallback.' }
& node $tool verification-input $root $buildRoot
if ($LASTEXITCODE -ne 0) { throw 'Official private-versus-omitted probe input failed validation.' }
$receipt = Join-Path $buildRoot 'runner-verification.json'
& $verifierPowerShell -NoProfile -NonInteractive -File $probe -BuildRoot $buildRoot -OutputReceipt $receipt
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $receipt)) { throw 'This runner has not verified these exact Host bytes.' }
& $windowsPowerShell -NoProfile -NonInteractive -File (Join-Path $kit 'New-VerifiedRuntime.ps1') -BuildRoot $buildRoot -VerificationReceipt $receipt
if ($LASTEXITCODE -ne 0) { throw 'Runner verification envelope rejected.' }
& node $tool install-runner $root $buildRoot
if ($LASTEXITCODE -ne 0) { throw 'Verified runner output staging failed.' }
& node (Join-Path $PSScriptRoot 'source-built-host-input.cjs') preflight $root
if ($LASTEXITCODE -ne 0) { throw 'Generated runner lock/artifacts failed preflight.' }
