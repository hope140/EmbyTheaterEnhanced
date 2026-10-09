param(
    [Parameter(Mandatory=$true)][string]$RuntimeRoot,
    [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ExpectedSourceCommit,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9-]{1,48}$')][string]$Label,
    [switch]$SurfaceFrameless
)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$runtime=(Resolve-Path -LiteralPath $RuntimeRoot).Path
$manifest=Get-Content (Join-Path $runtime 'build-manifest.json') -Raw | ConvertFrom-Json
if ($manifest.sourceCommit -ne $ExpectedSourceCommit) { throw 'source-commit-mismatch' }
foreach ($entry in $manifest.files) {
    if ((Get-FileHash -LiteralPath (Join-Path $runtime $entry.path) -Algorithm SHA256).Hash -ine $entry.sha256) { throw 'runtime-payload-mismatch' }
}
$probeRoot=Join-Path $root ('.work/fullscreen-' + $Label)
if (Test-Path -LiteralPath $probeRoot) { throw 'evidence-already-exists' }
New-Item -ItemType Directory -Path "$probeRoot/profile","$probeRoot/appdata/mpv" -Force | Out-Null
& node (Join-Path $PSScriptRoot 'make-transition-fixtures.cjs') $probeRoot
if ($LASTEXITCODE -ne 0) { throw 'fixture-generation-failed' }
[IO.File]::WriteAllText("$probeRoot/appdata/mpv/mpv.conf", "vo=gpu-next`ngpu-context=d3d11`nhwdec=no`naudio=no`n", [Text.Encoding]::ASCII)
$info=New-Object Diagnostics.ProcessStartInfo
$info.FileName=Join-Path $runtime 'x64/electron/electron.exe'
$info.Arguments='"' + (Join-Path $PSScriptRoot 'fullscreen-probe.cjs') + '" "' + "$probeRoot/profile" + '"'
$info.UseShellExecute=$false
$info.CreateNoWindow=$true
$info.WorkingDirectory=$runtime
$removeNames=@($info.EnvironmentVariables.Keys | Where-Object { $_ -match '^(ETE_|ELECTRON_|NODE_OPTIONS$|MPV_)' })
foreach($name in $removeNames) { $info.EnvironmentVariables.Remove($name) }
$info.EnvironmentVariables['ETE_TEST_RUNTIME']=$runtime
$info.EnvironmentVariables['ETE_TEST_EVIDENCE']=$probeRoot
$info.EnvironmentVariables['APPDATA']="$probeRoot/appdata"
$info.EnvironmentVariables['LOCALAPPDATA']="$probeRoot/appdata"
$info.EnvironmentVariables['MPV_HOME']="$probeRoot/appdata/mpv"
if($SurfaceFrameless) { $info.EnvironmentVariables['ETE_TEST_SURFACE_FRAMELESS']='1' }
$process=[Diagnostics.Process]::Start($info)
$record=@{pid=$process.Id;started=$process.StartTime.ToUniversalTime().ToString('o');sourceCommit=$ExpectedSourceCommit;experimentalSurface=[bool]$SurfaceFrameless;harnessSha256=(Get-FileHash (Join-Path $PSScriptRoot 'fullscreen-probe.cjs') -Algorithm SHA256).Hash}
$record | ConvertTo-Json | Set-Content (Join-Path $probeRoot 'run.json') -Encoding ASCII
$record | ConvertTo-Json -Compress
