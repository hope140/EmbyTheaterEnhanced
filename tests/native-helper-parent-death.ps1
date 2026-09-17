param(
    [Parameter(Mandatory=$true)][string]$Electron,
    [Parameter(Mandatory=$true)][string]$Helper,
    [Parameter(Mandatory=$true)][string]$Libmpv,
    [Parameter(Mandatory=$true)][string]$Media,
    [Parameter(Mandatory=$true)][string]$OutputRoot
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path -Parent $PSScriptRoot
$script = Join-Path $root 'tools/native-helper-parent-under-test.cjs'
foreach ($file in @($Electron,$Helper,$Libmpv,$Media,$script)) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Required input missing: $file" }
}
New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null
$readyPath = Join-Path $OutputRoot 'ready.json'
$reportPath = Join-Path $OutputRoot 'parent-death.json'
if (Test-Path -LiteralPath $readyPath) { Remove-Item -LiteralPath $readyPath -Force }
$arguments = @($script,$Helper,$Libmpv,$Media,$readyPath) | ForEach-Object { '"' + $_.Replace('"','\"') + '"' }
$process = Start-Process -FilePath $Electron -ArgumentList $arguments -WindowStyle Hidden -PassThru
$deadline = (Get-Date).AddSeconds(20)
while ((Get-Date) -lt $deadline -and -not (Test-Path -LiteralPath $readyPath)) { Start-Sleep -Milliseconds 100 }
if (-not (Test-Path -LiteralPath $readyPath)) { throw 'Parent-under-test did not become ready.' }
$ready = Get-Content -Raw -LiteralPath $readyPath | ConvertFrom-Json
if ($ready.PSObject.Properties.Name -contains 'error') { throw "Parent-under-test failed: $($ready.error)" }
if ([int]$ready.parentPid -ne $process.Id) { throw 'Started parent PID does not match ready record.' }
$actualParent = Get-CimInstance Win32_Process -Filter "ProcessId=$($process.Id)"
if (-not $actualParent -or [IO.Path]::GetFullPath($actualParent.ExecutablePath) -ne [IO.Path]::GetFullPath($Electron)) { throw 'Refusing to terminate an unverified process.' }
$helperPid = [int]$ready.helperPid
$helperBefore = Get-CimInstance Win32_Process -Filter "ProcessId=$helperPid"
if (-not $helperBefore -or [IO.Path]::GetFullPath($helperBefore.ExecutablePath) -ne [IO.Path]::GetFullPath($Helper)) { throw 'Helper process identity mismatch.' }
Stop-Process -Id $process.Id -Force
$exitDeadline = (Get-Date).AddSeconds(5)
do {
    Start-Sleep -Milliseconds 100
    $helperAfter = Get-CimInstance Win32_Process -Filter "ProcessId=$helperPid"
} while ($helperAfter -and (Get-Date) -lt $exitDeadline)
$record = [ordered]@{
    schemaVersion = 1
    status = if ($helperAfter) { 'failed' } else { 'passed' }
    parentPid = $process.Id
    helperPid = $helperPid
    parentTerminated = $true
    helperExitedAfterParentDeath = -not [bool]$helperAfter
    residualHelperProcess = if ($helperAfter) { 1 } else { 0 }
}
$utf8 = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText($reportPath, ($record | ConvertTo-Json -Depth 5) + "`n", $utf8)
$record | ConvertTo-Json -Depth 5
if ($helperAfter) { exit 1 }
