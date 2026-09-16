param(
    [Parameter(Mandatory=$true)][string]$InputRoot,
    [Parameter(Mandatory=$true)][string]$OutputRoot,
    [Parameter(Mandatory=$true)][string]$Libmpv,
    [Parameter(Mandatory=$true)][string]$Electron,
    [string]$Compiler = 'g++.exe'
)
$ErrorActionPreference = 'Stop'
$expected = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'evidence/build.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$inputs = @($Libmpv,$Electron)
$inputs += Get-ChildItem -LiteralPath $InputRoot -Recurse -File | ForEach-Object FullName
foreach ($inputFile in $inputs) {
    $entry = @($expected.files | Where-Object { $_.name -eq (Split-Path $inputFile -Leaf) })
    if ($entry.Count -ne 1 -or (Get-FileHash -LiteralPath $inputFile -Algorithm SHA256).Hash -ne $entry[0].sha256) {
        throw 'Experimental input identity mismatch.'
    }
}
if (Test-Path -LiteralPath $OutputRoot) { throw 'Choose a new output directory.' }
$null = New-Item -ItemType Directory -Path $OutputRoot
$OutputRoot = (Resolve-Path -LiteralPath $OutputRoot).Path
$InputRoot = (Resolve-Path -LiteralPath $InputRoot).Path
$source = Join-Path $PSScriptRoot 'native.cpp'
$symbols = @('napi_get_value_string_utf8','napi_get_cb_info','napi_create_string_utf8','napi_throw_error','napi_create_function','napi_set_named_property','napi_add_env_cleanup_hook')
$symbols += @('napi_create_promise','napi_resolve_deferred','napi_reject_deferred','napi_create_async_work','napi_queue_async_work','napi_delete_async_work')
# Spike-only import table targets the exact frozen executable name. Production
# integration must use Electron's standard import library + delay-load hook.
$def = Join-Path $OutputRoot 'electron-napi.def'
@('LIBRARY electron.exe','EXPORTS') + $symbols | Set-Content -LiteralPath $def -Encoding ASCII
$dlltool = Join-Path (Split-Path (Get-Command $Compiler).Source) 'dlltool.exe'
& $dlltool -d $def -l (Join-Path $OutputRoot 'electron-napi.a')
if ($LASTEXITCODE) { throw 'dlltool failed' }
$flags = @('-std=c++17','-O2','-Wall','-Wextra','-static','-static-libgcc','-static-libstdc++',"-I$InputRoot",$source,'-lopengl32','-lgdi32','-luser32')
& $Compiler @flags '-o' (Join-Path $OutputRoot 'bridge-helper.exe')
if ($LASTEXITCODE) { throw 'helper compile failed' }
& $Compiler @flags '-DADDON' '-DNAPI_VERSION=8' '-shared' (Join-Path $OutputRoot 'electron-napi.a') '-o' (Join-Path $OutputRoot 'bridge-addon.node')
if ($LASTEXITCODE) { throw 'addon compile failed' }
$files = @($source,$Libmpv,$Electron,(Join-Path $OutputRoot 'bridge-helper.exe'),(Join-Path $OutputRoot 'bridge-addon.node'))
$files += Get-ChildItem -LiteralPath $InputRoot -Recurse -File | ForEach-Object FullName
$hashes = @($files | ForEach-Object { @{name=(Split-Path $_ -Leaf); sha256=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()} })
@{architecture='Windows x64'; compiler=(& $Compiler --version | Select-Object -First 1); flags=$flags | Where-Object { $_ -notlike '-I*' -and $_ -ne $source }; files=$hashes} |
    ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $OutputRoot 'provenance.json') -Encoding UTF8
