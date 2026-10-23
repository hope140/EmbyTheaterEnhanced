[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$BuildRoot,
    [Parameter(Mandatory=$true)][string]$OutputReceipt
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT' -or $PSVersionTable.PSVersion.Major -lt 7) { throw 'Existing Windows PowerShell7 required for the portable verifier.' }
$root = Split-Path -Parent $PSScriptRoot
& node (Join-Path $PSScriptRoot 'host-verifier-input.cjs') $root
if ($LASTEXITCODE -ne 0) { throw 'Reviewed portable Host verifier identity mismatch.' }
& (Join-Path $PSScriptRoot 'windows-host-verifier/Verify-UnifiedHost.ps1') -BuildRoot $BuildRoot -OutputReceipt $OutputReceipt
if (-not $?) { throw 'Portable Host verification failed.' }
if (-not (Test-Path -LiteralPath $OutputReceipt -PathType Leaf)) { throw 'Portable Host verifier did not produce a receipt.' }
$receipt = Get-Content -LiteralPath $OutputReceipt -Raw | ConvertFrom-Json
if ($receipt.result -cne 'passed') { throw 'Portable Host verifier did not pass.' }
