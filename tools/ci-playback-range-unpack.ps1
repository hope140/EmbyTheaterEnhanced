param([Parameter(Mandatory=$true)][string]$PlanPath)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
# Process-local removal only; downloader credentials never reach extraction children.
foreach ($name in @('GITHUB_TOKEN','GH_TOKEN','GH_ENTERPRISE_TOKEN','ACTIONS_RUNTIME_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN')) { Remove-Item -LiteralPath ('Env:' + $name) -ErrorAction SilentlyContinue }
$driver = Join-Path $PSScriptRoot 'ci-playback-range-smoke.cjs'
$stage = 'verify-archives'
try {
$pathsJson = & node $driver verify-acquired ("--plan=" + $PlanPath)
if ($LASTEXITCODE -ne 0) { throw 'Pinned archives failed verification; extraction refused.' }
$paths = $pathsJson | ConvertFrom-Json
foreach ($target in @($paths.artifactTree, $paths.unpackerTree, $paths.extracted)) {
    if (Test-Path -LiteralPath $target) { throw 'Extraction target already exists; preserve evidence and use a fresh run.' }
}
$stage = 'expand-candidate'
Expand-Archive -LiteralPath $paths.artifact -DestinationPath $paths.artifactTree
$stage = 'expand-unpacker'
Expand-Archive -LiteralPath $paths.unpackerZip -DestinationPath $paths.unpackerTree
$stage = 'verify-expanded'
$verifiedJson = & node $driver expanded-inputs ("--plan=" + $PlanPath)
if ($LASTEXITCODE -ne 0) { throw 'Pinned unpacker/installer failed verification; execution refused.' }
$verified = $verifiedJson | ConvertFrom-Json
# Execute only the locked unpacker. The installer/Host is never launched.
$stage = 'installer-test'
& $verified.unpacker -t $verified.installer
if ($LASTEXITCODE -ne 0) { throw 'Installer archive integrity check failed.' }
$stage = 'installer-extract'
& $verified.unpacker -x -b ("-d" + $verified.extracted) $verified.installer | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Static installer extraction failed.' }

} catch {
    & node $driver extraction-failed ("--plan=" + $PlanPath) ("--stage=" + $stage)
    throw ("Controlled static extraction failed at " + $stage + '. Inspect owned receipts.')
}
