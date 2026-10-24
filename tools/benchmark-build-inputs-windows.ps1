[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{40}$')][string]$ExpectedSourceCommit,
    [Parameter(Mandatory)][string]$OutputRoot,
    [string]$HostObjectStore,
    [ValidateSet(2,4,6,8)][int]$Trials = 4,
    [ValidateRange(1,10)][int]$WarmCalls = 3
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
if (-not $IsWindows -or $PSVersionTable.PSVersion.Major -ne 7) {
    throw 'Windows and PowerShell 7 required.'
}
$benchmarkArgs = @(
    (Join-Path $PSScriptRoot 'benchmark-build-inputs-windows.cjs'),
    '--source-sha', $ExpectedSourceCommit, '--output', $OutputRoot,
    '--trials', [string]$Trials, '--warm-calls', [string]$WarmCalls,
    '--powershell-version', $PSVersionTable.PSVersion.ToString()
)
if ($HostObjectStore) { $benchmarkArgs += @('--host-store', $HostObjectStore) }
& node @benchmarkArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
