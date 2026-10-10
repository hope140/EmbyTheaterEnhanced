$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$files = @(& git -C $root ls-files -- src tools tests | Where-Object { $_ -match '\.(ps1|psm1)$' } | Sort-Object)
if ($LASTEXITCODE -ne 0) { throw 'git ls-files failed.' }

$failures = @()
foreach ($relative in $files) {
    $fullPath = Join-Path $root $relative
    $tokens = $null
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($fullPath, [ref]$tokens, [ref]$parseErrors) | Out-Null
    foreach ($parseError in $parseErrors) {
        $failures += [pscustomobject]@{ Path = $relative; Line = $parseError.Extent.StartLineNumber; Message = $parseError.Message }
    }
}

if ($failures.Count -gt 0) {
    foreach ($failure in $failures) { Write-Error ("{0}:{1}: {2}" -f $failure.Path, $failure.Line, $failure.Message) }
    throw ("PowerShell syntax failed for {0} errors across {1} tracked files." -f $failures.Count, $files.Count)
}
Write-Output ("PowerShell syntax passed for {0} tracked src/tools/tests files." -f $files.Count)
