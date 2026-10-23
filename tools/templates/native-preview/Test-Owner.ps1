param([Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$commit = (Get-Content -Raw -LiteralPath (Join-Path $root 'native-preview-trial.json') | ConvertFrom-Json).sourceCommit
$priorNode = $env:ELECTRON_RUN_AS_NODE
try {
    $env:ELECTRON_RUN_AS_NODE = $null
    & (Join-Path $root 'x64/electron/electron.exe') (Join-Path $root 'trial/owner-probe.cjs') $root ([IO.Path]::GetFullPath($OutputDirectory)) $commit
    if ($LASTEXITCODE -ne 0) { throw 'Production owner probe failed.' }
} finally { $env:ELECTRON_RUN_AS_NODE = $priorNode }
