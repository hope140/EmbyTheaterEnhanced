param([Parameter(Mandatory=$true)][string]$ProfileRoot)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$commit = (Get-Content -Raw -LiteralPath (Join-Path $root 'native-preview-trial.json') | ConvertFrom-Json).sourceCommit
$electron = Join-Path $root 'x64/electron/electron.exe'
$priorNode = $env:ELECTRON_RUN_AS_NODE
try {
    $env:ELECTRON_RUN_AS_NODE = '1'
    & $electron (Join-Path $root 'trial/verify.cjs') $commit
    if ($LASTEXITCODE -ne 0) { throw 'Trial selfcheck failed.' }
    $env:ELECTRON_RUN_AS_NODE = $null
    & $electron (Join-Path $root 'electronapp/native-preview-trial.cjs') ([IO.Path]::GetFullPath($ProfileRoot))
    if ($LASTEXITCODE -ne 0) { throw 'Trial process failed.' }
} finally { $env:ELECTRON_RUN_AS_NODE = $priorNode }
