param([Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z0-9_-]+$')][string]$RunLabel,[switch]$Visible)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$fixture = Join-Path $root '.work/v029-subtitle-runtime'
$electron = Join-Path $root 'vendor/electron/44.4.2/win32-x64/electron.exe'
$entry = Join-Path $PSScriptRoot 'subtitle-race-native-probe.cjs'
$output = Join-Path $fixture ($RunLabel + '.json')
foreach ($file in @($electron,$entry,(Join-Path $fixture 'media-one.mkv'),(Join-Path $fixture 'runtime/electronapp/native-helper/ete-mpv-helper.exe'),(Join-Path $fixture 'runtime/electronapp/libmpv/x64/mpv-1.dll'))) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw 'Probe input missing.' }
}
if (Test-Path -LiteralPath $output) { throw 'Probe output already exists.' }
$psi = [System.Diagnostics.ProcessStartInfo]::new()
if (-not $psi.PSObject.Properties.Match('ArgumentList')) { throw 'PowerShell 7 / .NET ArgumentList is required.' }
$psi.FileName = $electron
$psi.WorkingDirectory = $root
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
foreach ($argument in @($entry,$fixture,$output)) { [void]$psi.ArgumentList.Add($argument) }
if ($Visible) { [void]$psi.ArgumentList.Add('--visible') }
$process = [System.Diagnostics.Process]::Start($psi)
try {
    if (-not $process.WaitForExit(30000)) {
        $process.Kill($true)
        throw 'Probe timed out; owned process tree stopped.'
    }
    if (-not (Test-Path -LiteralPath $output -PathType Leaf)) { throw 'Probe result missing.' }
    $result = Get-Content -Raw -Encoding UTF8 -LiteralPath $output | ConvertFrom-Json
    if ($process.ExitCode -ne 0 -or $result.status -ne 'passed') { throw ('Probe failed: ' + $result.error.message) }
    [pscustomobject]@{runLabel=$RunLabel;status=$result.status;cases=$result.cases.Count;exitCode=$process.ExitCode} | ConvertTo-Json -Compress
} finally {
    $process.Dispose()
}
