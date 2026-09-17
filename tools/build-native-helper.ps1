param(
    [Parameter(Mandatory=$true)][string]$SourceCommit,
    [Parameter(Mandatory=$true)][string]$RuntimeRoot,
    [switch]$Testing
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path -Parent $PSScriptRoot
if ($SourceCommit -notmatch '^[0-9a-fA-F]{40}$') { throw 'SourceCommit must be a 40-character Git commit.' }
$manifestPath = Join-Path $root 'vendor/native-helper-manifest.json'
$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestPath | ConvertFrom-Json
$head = ([string]((& git -C $root rev-parse HEAD 2>$null) | Select-Object -First 1)).Trim().ToLowerInvariant()
if ($head -ne $SourceCommit.ToLowerInvariant()) { throw 'Native helper source commit must equal HEAD.' }
$contractJson = & node (Join-Path $root 'tools/native-helper-contract.cjs') $root
if ($LASTEXITCODE -ne 0) { throw 'Native helper build contract differs from HEAD.' }
$contract = $contractJson | ConvertFrom-Json
$header = Join-Path $root $manifest.clientHeader.path
$libmpv = Join-Path $RuntimeRoot $manifest.libmpv.runtimePath
if (-not (Test-Path -LiteralPath $header -PathType Leaf)) { throw 'Pinned helper header missing. Run tools/prepare-native-helper-inputs.ps1.' }
if ((Get-FileHash -LiteralPath $header -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.clientHeader.sha256) { throw 'Pinned helper header hash mismatch.' }
if (-not (Test-Path -LiteralPath $libmpv -PathType Leaf)) { throw 'Runtime libmpv is missing.' }
if ((Get-FileHash -LiteralPath $libmpv -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.libmpv.sha256) { throw 'Runtime libmpv hash mismatch.' }

$work = Join-Path $root ('.work/native-helper-build-' + [guid]::NewGuid().ToString('N'))
$source = Join-Path $work 'ete-mpv-helper.cpp'
$output = Join-Path $RuntimeRoot $manifest.runtimePath
New-Item -ItemType Directory -Force -Path $work,(Split-Path -Parent $output) | Out-Null
$utf8 = New-Object Text.UTF8Encoding($false)
$materializedJson = & node (Join-Path $root 'tools/materialize-native-helper-source.cjs') $root $SourceCommit $manifest.sourcePath $source
if ($LASTEXITCODE -ne 0) { throw 'Unable to materialize native helper source from the source commit.' }
$materialized = $materializedJson | ConvertFrom-Json
$compiler = (Get-Command $manifest.compiler.command -ErrorAction Stop).Source
$compilerVersion = (& $compiler --version | Select-Object -First 1)
$compilerSha256 = (Get-FileHash -LiteralPath $compiler -Algorithm SHA256).Hash.ToLowerInvariant()
if ($compilerVersion -ne $manifest.compiler.version -or $compilerSha256 -ne $manifest.compiler.sha256) { throw 'Native helper compiler identity mismatch.' }
$flags = @($manifest.compiler.flags)
$linkerFlags = @($manifest.compiler.linkerFlags)
if ($Testing) { $flags += '-DETE_HELPER_TESTING'; $linkerFlags += '-lgdi32' }
$includeArgument = '-I' + (Split-Path -Parent (Split-Path -Parent $header))
$arguments = @($flags) + @($includeArgument, $source) + $linkerFlags + @('-o', $output)
try {
    & $compiler @arguments
    if ($LASTEXITCODE -ne 0) { throw "Native helper compiler failed with exit code $LASTEXITCODE" }
    $record = [ordered]@{
        schemaVersion = 1
        protocolVersion = [int]$manifest.protocolVersion
        sourceCommit = $SourceCommit.ToLowerInvariant()
        source = [ordered]@{ path=$manifest.sourcePath; gitBlobObjectId=$materialized.objectId; sha256=$materialized.sha256; size=[int64]$materialized.size; relation='git-commit-blob' }
        clientHeader = [ordered]@{ source=$manifest.clientHeader.source; sha256=$manifest.clientHeader.sha256 }
        compiler = [ordered]@{ fileName=(Split-Path $compiler -Leaf); sha256=$compilerSha256; version=$compilerVersion; flags=@($flags + $linkerFlags) }
        libmpv = [ordered]@{ runtimePath=$manifest.libmpv.runtimePath; sha256=$manifest.libmpv.sha256; version=$manifest.libmpv.version; clientApi=$manifest.libmpv.clientApi }
        helper = [ordered]@{ runtimePath=$manifest.runtimePath; sha256=(Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant(); size=(Get-Item -LiteralPath $output).Length; testing=[bool]$Testing }
        contract = $contract
    }
    [IO.File]::WriteAllText((Join-Path $RuntimeRoot $manifest.provenancePath), ($record | ConvertTo-Json -Depth 8) + "`n", $utf8)
    $record | ConvertTo-Json -Depth 8
} finally {
    if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }
}
