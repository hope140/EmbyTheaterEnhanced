param(
    [Parameter(Mandatory=$true)][string]$Directory,
    [Parameter(Mandatory=$true)][string]$Report,
    [Parameter(Mandatory=$true)][ValidateSet('A','B')][string]$Phase
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
# Cloud-only diagnostic. Loading a DLL executes its initialization code; this
# entry is never invoked on Work and does not start a helper or Electron app.
if (-not $IsWindows -or -not [Environment]::Is64BitProcess -or $env:GITHUB_ACTIONS -ne 'true') { throw 'Cloud Windows x64 loader diagnostic required.' }
if (Test-Path -LiteralPath $Report) { throw 'Preserve existing diagnostic report.' }
$probeClock = [Diagnostics.Stopwatch]::StartNew()
function Write-LoaderStage {
    param(
        [ValidateSet('entry','target-hash-start','target-hash-verified','interop-start','interop-ready','load-start','load-returned','vulkan-inspect-start','vulkan-inspect-complete','free-start','free-returned','report-write-start','report-written','completed','failed')][string]$Stage,
        [string]$Code = '',
        [Nullable[int]]$Win32Error = $null,
        [Nullable[bool]]$Loaded = $null,
        [Nullable[bool]]$Freed = $null
    )
    try {
    $row = [ordered]@{event='loader-stage';phase=$Phase;stage=$Stage;elapsedMs=$probeClock.Elapsed.TotalMilliseconds;flags=4352;code=$(if ($Code -eq 'SCRIPT_ERROR') {'SCRIPT_ERROR'} else {$null});win32Error=$Win32Error;loaded=$Loaded;freed=$Freed}
    Write-Output ('ETE_LOADER_STAGE ' + ($row | ConvertTo-Json -Compress))
    } catch {
        # A diagnostic sink failure must not skip the original DLL release.
    }
}
Write-LoaderStage 'entry'
try {
$target = Join-Path ([IO.Path]::GetFullPath($Directory)) 'mpv-1.dll'
Write-LoaderStage 'target-hash-start'
$expected = '965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c'
if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Pinned libmpv required.' }
Write-LoaderStage 'target-hash-verified'
Write-LoaderStage 'interop-start'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class EteLoaderProbe {
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern IntPtr LoadLibraryExW(string path, IntPtr reserved, uint flags);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern bool FreeLibrary(IntPtr module);
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr GetModuleHandleW(string name);
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] public static extern uint GetModuleFileNameW(IntPtr module, StringBuilder path, uint size);
 [DllImport("kernel32.dll")] public static extern uint SetErrorMode(uint mode);
 public static IntPtr LoadWithError(string path, out int error) {
   IntPtr module=LoadLibraryExW(path,IntPtr.Zero,4352);
   error=module==IntPtr.Zero ? Marshal.GetLastWin32Error() : 0;
   return module;
 }
}
'@
Write-LoaderStage 'interop-ready'
$module = [IntPtr]::Zero
$oldMode = [EteLoaderProbe]::SetErrorMode(3)
$record = [ordered]@{scope='dll-load-only-not-helper-or-video';phase=$Phase;targetExists=$true;flags=4352;win32Error=$null;loaded=$false;freed=$null;vulkanPreloaded=([EteLoaderProbe]::GetModuleHandleW('vulkan-1.dll') -ne [IntPtr]::Zero);vulkanColocated=(Test-Path -LiteralPath (Join-Path $Directory 'vulkan-1.dll') -PathType Leaf);vulkanSystemPresent=(Test-Path -LiteralPath (Join-Path ([Environment]::SystemDirectory) 'vulkan-1.dll') -PathType Leaf);vulkanLoadedFrom='none';loadedVulkanSha256=$null;helperStarted=$false;appStarted=$false;visibleAcceptance='NOT_ASSESSED'}
try {
    $loaderError = 0
    Write-LoaderStage 'load-start'
    $module = [EteLoaderProbe]::LoadWithError($target,[ref]$loaderError)
    $record.loaded = $module -ne [IntPtr]::Zero
    $record.win32Error = if ($record.loaded) { 0 } else { $loaderError }
    Write-LoaderStage 'load-returned' -Win32Error $record.win32Error -Loaded $record.loaded
    Write-LoaderStage 'vulkan-inspect-start'
    $vulkan = [EteLoaderProbe]::GetModuleHandleW('vulkan-1.dll')
    if ($vulkan -ne [IntPtr]::Zero) {
        $buffer = [Text.StringBuilder]::new(32768)
        $length = [EteLoaderProbe]::GetModuleFileNameW($vulkan,$buffer,32768)
        if ($length -gt 0 -and $length -lt 32768) {
            $loaded = $buffer.ToString()
            $record.vulkanLoadedFrom = if ($loaded -ieq (Join-Path $Directory 'vulkan-1.dll')) { 'colocated' } elseif ($loaded -ieq (Join-Path ([Environment]::SystemDirectory) 'vulkan-1.dll')) { 'system32' } else { 'other' }
            $record.loadedVulkanSha256 = (Get-FileHash -LiteralPath $loaded -Algorithm SHA256).Hash.ToLowerInvariant()
        }
    }
    Write-LoaderStage 'vulkan-inspect-complete'
} finally {
    Write-LoaderStage 'free-start'
    if ($module -ne [IntPtr]::Zero) { $record.freed = [EteLoaderProbe]::FreeLibrary($module) }
    Write-LoaderStage 'free-returned' -Freed $record.freed
    [void][EteLoaderProbe]::SetErrorMode($oldMode)
    Write-LoaderStage 'report-write-start'
    [IO.File]::WriteAllText([IO.Path]::GetFullPath($Report),($record | ConvertTo-Json -Depth 5) + "`n",[Text.UTF8Encoding]::new($false))
    Write-LoaderStage 'report-written'
}
if ($record.freed -eq $false) { throw 'Loaded module release failed.' }
    Write-LoaderStage 'completed'
} catch {
    Write-LoaderStage 'failed' -Code 'SCRIPT_ERROR'
    throw
}
