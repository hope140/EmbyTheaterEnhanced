param(
    [Parameter(Mandatory=$true)][string]$RuntimeRoot,
    [Parameter(Mandatory=$true)][string]$Installer,
    [Parameter(Mandatory=$true)][string]$InstallerSha256,
    [Parameter(Mandatory=$true)][string]$ProductCommit,
    [Parameter(Mandatory=$true)][string]$OutputRoot
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $IsWindows) { throw 'Dedicated Windows runner required.' }
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$version = [string](& node --version)
if ($LASTEXITCODE -ne 0 -or $version.Trim() -cne 'v24.18.1') { throw 'Fixed Node24.18.1 required.' }
if ($InstallerSha256 -cnotmatch '^[a-f0-9]{64}$') { throw 'Exact installer SHA256 required.' }
# These commands verify before any native launch. They neither install the
# installer nor copy/import an existing profile. Output must not exist.
& node (Join-Path $PSScriptRoot 'windows-smoke.cjs') prepare "--repo=$repo" "--runtime=$RuntimeRoot" "--installer=$Installer" "--installer-sha256=$InstallerSha256" "--product-sha=$ProductCommit" "--out=$OutputRoot"
if ($LASTEXITCODE -ne 0) { throw 'Owned Windows smoke preparation failed; no native fallback.' }
& node (Join-Path $PSScriptRoot 'windows-smoke.cjs') run "--plan=$(Join-Path $OutputRoot 'plan.json')"
if ($LASTEXITCODE -ne 0) { throw 'Owned Windows smoke failed; preserve safe receipts and inspect the first stage.' }
