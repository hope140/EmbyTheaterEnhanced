param(
    [string]$ArtifactId,
    [string]$ArtifactZipSha256,
    [string]$InstallerSha256,
    [switch]$ContractSelfTest
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$source = 'abe1c7426f0c8d0b5d1f7febadd0d39fb9a80a1d'
$buildRun = '40110950621'
$repository = 'hope140/EmbyTheaterEnhanced'
$version = '0.4.3'
function Require([bool]$Condition, [string]$Code) { if (-not $Condition) { throw $Code } }
function SafeRelative([string]$Name) {
    Require (-not [string]::IsNullOrEmpty($Name) -and $Name -notmatch '[<>:"\\|?*\x00-\x1f]') 'UNSAFE_MEMBER'
    foreach ($part in $Name.Split('/')) {
        Require ($part.Length -gt 0 -and $part -ne '.' -and $part -ne '..' -and -not $part.EndsWith('.') -and -not $part.EndsWith(' ') -and $part -notmatch '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)') 'UNSAFE_MEMBER'
    }
    return $Name
}
function HashMatches([string]$File, [string]$Expected) {
    return (Test-Path -LiteralPath $File -PathType Leaf) -and (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant() -ceq $Expected
}
function ProjectHostText([string]$Text, [string]$InstallRoot = '') {
    $kinds = @('FileNotFoundException','FileLoadException','BadImageFormatException','TypeInitializationException','ConfigurationErrorsException','Win32Exception','UnauthorizedAccessException','DllNotFoundException','NullReferenceException','IOException','TypeError','SyntaxError','Cannot find module')
    $missing = @([regex]::Matches($Text, "Cannot find module '([^'\r\n]{1,2048})'") | Select-Object -First 4 | ForEach-Object {
        $name=$_.Groups[1].Value.Replace('\','/');$prefix=$InstallRoot.Replace('\','/').TrimEnd('/') + '/'
        if ($InstallRoot -and $name.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) {
            $relative=$name.Substring($prefix.Length);try{SafeRelative $relative | Out-Null;'<install>/' + $relative}catch{'OMITTED'}
        } elseif ($name -cmatch '^[.@A-Za-z0-9_/-]{1,160}$' -and -not $name.StartsWith('/')) { $name }
        else { 'OMITTED' }
    })
    return [ordered]@{fatalKinds=@($kinds | Where-Object { $Text.Contains($_) });missingModules=$missing;electronLaunchMentioned=$Text.Contains('x64\electron\electron.exe')}

}
function ReadBoundedText([string]$File) {
    if (-not (Test-Path -LiteralPath $File -PathType Leaf)) { return '' }
    $stream = [IO.File]::Open($File,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite)
    try { $null=$stream.Seek([Math]::Max(0,$stream.Length-65536),[IO.SeekOrigin]::Begin);$reader=[IO.StreamReader]::new($stream);return $reader.ReadToEnd() }
    finally { $stream.Dispose() }
}
function InitializeWindowsApi {
    Add-Type @'
using System;
using System.Collections.Generic;
using System.Text;
using System.Runtime.InteropServices;
public static class V043Window {
 delegate bool Callback(IntPtr h, IntPtr p);
 [DllImport("user32.dll")] static extern bool EnumWindows(Callback callback, IntPtr p);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
 [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint command);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder value, int length);
 [DllImport("user32.dll", SetLastError=true)] static extern IntPtr SendMessageTimeout(IntPtr h,uint message,IntPtr w,IntPtr l,uint flags,uint timeout,out IntPtr result);
 public static IntPtr[] Visible(uint wanted) {
  var list=new List<IntPtr>(); EnumWindows((h,p)=>{uint pid;GetWindowThreadProcessId(h,out pid);var kind=new StringBuilder(256);GetClassName(h,kind,kind.Capacity);if(pid==wanted&&IsWindowVisible(h)&&GetWindow(h,4)==IntPtr.Zero&&kind.ToString().StartsWith("Chrome_WidgetWin_",StringComparison.Ordinal))list.Add(h);return true;},IntPtr.Zero);return list.ToArray();
 }
 public static int[] VisibleKinds(uint wanted) {
  var counts=new int[3];EnumWindows((h,p)=>{uint pid;GetWindowThreadProcessId(h,out pid);if(pid==wanted&&IsWindowVisible(h)){var kind=new StringBuilder(256);GetClassName(h,kind,kind.Capacity);var name=kind.ToString();counts[name.StartsWith("Chrome_WidgetWin_",StringComparison.Ordinal)?0:name=="#32770"?1:2]++;}return true;},IntPtr.Zero);return counts;
 }
 public static bool Close(IntPtr h) {IntPtr result;return SendMessageTimeout(h,0x10,IntPtr.Zero,IntPtr.Zero,3,2000,out result)!=IntPtr.Zero;}
}
'@
}
if ($ContractSelfTest) {
    InitializeWindowsApi
    Require ((SafeRelative 'electronapp/node_modules/@grpc/grpc-js/file.js') -ceq 'electronapp/node_modules/@grpc/grpc-js/file.js') 'SELFTEST_SAFE'
    foreach ($name in @('../escape', '/root', 'C:/escape', 'a\b', 'a/../b', 'a/./b', 'a:b', 'a.', 'a ', 'a/NUL.txt', 'a/COM1', 'a//b', '')) {
        $rejected = $false; try { SafeRelative $name | Out-Null } catch { $rejected = $true }
        Require $rejected 'SELFTEST_TRAVERSAL'
    }
    $tempFile = [IO.Path]::GetTempFileName()
    try {
        [IO.File]::WriteAllText($tempFile, 'synthetic-only')
        $digest = (Get-FileHash -LiteralPath $tempFile -Algorithm SHA256).Hash.ToLowerInvariant()
        Require (HashMatches $tempFile $digest) 'SELFTEST_HASH'
        Require (-not (HashMatches $tempFile ('0' * 64))) 'SELFTEST_DRIFT'
    } finally { Remove-Item -LiteralPath $tempFile }
    $safe = ProjectHostText 'FileNotFoundException: C:\PRIVATE_SYNTHETIC_CANARY\account-token=PRIVATE_SYNTHETIC_CANARY'
    Require ($safe.fatalKinds -contains 'FileNotFoundException' -and ($safe | ConvertTo-Json -Compress) -notmatch 'PRIVATE_SYNTHETIC_CANARY|account-token') 'SELFTEST_PRIVATE_PROJECTION'
    $moduleFacts=ProjectHostText "Cannot find module 'C:\owned\electronapp\enhanced\fixture.js'" 'C:\owned'
    Require ($moduleFacts.missingModules[0] -ceq '<install>/electronapp/enhanced/fixture.js') 'SELFTEST_MODULE_PROJECTION'
    $privateFacts=ProjectHostText "Cannot find module 'C:\PRIVATE_SYNTHETIC_CANARY\secret.js'" 'C:\owned'
    Require (($privateFacts | ConvertTo-Json -Compress) -notmatch 'PRIVATE_SYNTHETIC_CANARY|secret.js') 'SELFTEST_EXTERNAL_MODULE_OMITTED'
    Write-Output 'CONTRACT_SELFTEST_PASSED (no install, launch or network)'
    return
}
Require ($IsWindows -and $env:GITHUB_ACTIONS -ceq 'true' -and $env:RUNNER_ENVIRONMENT -ceq 'github-hosted') 'HOSTED_WINDOWS_REQUIRED'
Require ($env:GITHUB_REPOSITORY -ceq $repository) 'REPOSITORY_MISMATCH'
Require ($ArtifactId -match '^[1-9][0-9]{0,15}$' -and $ArtifactZipSha256 -cmatch '^[a-f0-9]{64}$' -and $InstallerSha256 -cmatch '^[a-f0-9]{64}$') 'EXACT_INPUTS_REQUIRED'
$work = Join-Path $env:RUNNER_TEMP ('v043-installed-' + $env:GITHUB_RUN_ID + '-' + $env:GITHUB_RUN_ATTEMPT)
Require (-not (Test-Path -LiteralPath $work)) 'PRESERVE_EXISTING_OUTPUT'
$reportDir = Join-Path $work 'report'
New-Item -ItemType Directory -Path $reportDir | Out-Null
$result = [ordered]@{schemaVersion=1;scope='ordinary-installed-startup-close-only';sourceCommit=$source;version=$version;buildRun=$buildRun;artifactId=$ArtifactId;artifactZipSha256=$ArtifactZipSha256;installerSha256=$InstallerSha256;status='failed';stage='preflight';installed=$false;shortcutVerified=$false;hostStarted=$false;electronParentVerified=$false;visibleWindow=$false;normalCloseRequested=$false;ownedExitConfirmed=$false;hostExitCode=$null;electronExitCode=$null;realSmtcPlayback='NOT_ASSESSED';visibleDwmPlayback='NOT_ASSESSED';rendererDomReady='NOT_ASSESSED';forcedTermination=$false;installerExitCode=$null;ownedElectronCandidates=0;visibleWindowCount=0;ownedRemainingCount=$null}
$launcher=$null; $target=$null; $profile=$null; $windowsApiReady=$false
try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    Require ([Security.Principal.WindowsPrincipal]::new($identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) 'RUNNER_NOT_ALREADY_ADMIN'
    $key = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{868314CE-1253-46A3-A4EA-55CDE71BCF0A}_is1'
    $userKey = $key.Replace('HKLM:', 'HKCU:')
    $profile = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'EmbyTheaterEnhanced'
    $menu = Join-Path ([Environment]::GetFolderPath('CommonPrograms')) 'Emby Theater Enhanced/Emby Theater Enhanced.lnk'
    $userMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Emby Theater Enhanced/Emby Theater Enhanced.lnk'
    foreach ($existing in @($key,$userKey,$profile,$menu,$userMenu)) { Require (-not (Test-Path -LiteralPath $existing)) 'EXISTING_INSTALL_OR_PROFILE' }
    Require (@(Get-Process -Name 'Emby.Theater' -ErrorAction SilentlyContinue).Count -eq 0) 'EXISTING_HOST'
    $result.stage = 'artifact'
    $headers = @{Authorization=('Bearer ' + $env:GH_TOKEN);Accept='application/vnd.github+json'}
    $api = 'https://api.github.com/repos/' + $repository
    $run = Invoke-RestMethod -Uri ($api + '/actions/runs/' + $buildRun) -Headers $headers
    Require ($run.head_sha -ceq $source -and $run.status -ceq 'completed' -and $run.conclusion -ceq 'success') 'BUILD_NOT_VERIFIED'
    $artifact = Invoke-RestMethod -Uri ($api + '/actions/artifacts/' + $ArtifactId) -Headers $headers
    Require (-not $artifact.expired -and [string]$artifact.workflow_run.id -ceq $buildRun -and $artifact.workflow_run.head_sha -ceq $source -and $artifact.digest -ceq ('sha256:' + $ArtifactZipSha256)) 'ARTIFACT_IDENTITY_MISMATCH'
    $archive = Join-Path $work 'original-artifact.zip'
    Invoke-WebRequest -Uri ($api + '/actions/artifacts/' + $ArtifactId + '/zip') -Headers $headers -OutFile $archive
    $headers.Clear(); $env:GH_TOKEN = $null; $env:GITHUB_TOKEN = $null
    Require (HashMatches $archive $ArtifactZipSha256) 'ARTIFACT_DIGEST_MISMATCH'
    $payload = Join-Path $work 'attachments'; New-Item -ItemType Directory -Path $payload | Out-Null
    $setupName = 'EmbyTheaterEnhanced-' + $version + '-win-x64-setup.exe'
    $wanted = @($setupName,($setupName + '.provenance.json'),($setupName + '.sha256'),'SHA256SUMS.txt','RELEASE_NOTES.md')
    $zip = [IO.Compression.ZipFile]::OpenRead($archive)
    try {
        Require ($zip.Entries.Count -le 128) 'ARTIFACT_ENTRY_LIMIT'
        $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
        [long]$total = 0
        foreach ($entry in $zip.Entries) {
            SafeRelative $entry.FullName | Out-Null
            Require ($seen.Add($entry.FullName)) 'ARTIFACT_DUPLICATE_MEMBER'
            $total += $entry.Length; Require ($total -le 2GB) 'ARTIFACT_SIZE_LIMIT'
            if ($wanted -ccontains $entry.FullName) { [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,(Join-Path $payload $entry.FullName),$false) }
        }
        foreach ($name in $wanted) { Require (Test-Path -LiteralPath (Join-Path $payload $name) -PathType Leaf) 'ATTACHMENT_MISSING' }
    } finally { $zip.Dispose() }
    $setup = Join-Path $payload $setupName
    $receipt = Get-Content -LiteralPath ($setup + '.provenance.json') -Raw | ConvertFrom-Json
    Require (HashMatches $setup $InstallerSha256) 'INSTALLER_DIGEST_MISMATCH'
    Require ($receipt.sourceCommit -ceq $source -and $receipt.version -ceq $version -and $receipt.installer.fileName -ceq $setupName -and $receipt.installer.sha256 -ceq $InstallerSha256 -and $receipt.installer.size -eq (Get-Item -LiteralPath $setup).Length) 'INSTALLER_PROVENANCE_MISMATCH'
    $result.stage = 'install'
    $target = Join-Path $work 'installed'
    $setupProcess = Start-Process -FilePath $setup -ArgumentList ('/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP- /TASKS="" /DIR="' + $target + '" /LOG="' + (Join-Path $work 'install.log') + '"') -PassThru
    Require ($setupProcess.WaitForExit(90000)) 'INSTALL_TIMEOUT'
    $result.installerExitCode = $setupProcess.ExitCode
    Require ($setupProcess.ExitCode -eq 0) 'INSTALL_FAILED'
    $result.installed = $true
    $record = Get-ItemProperty -LiteralPath $key
    Require ([IO.Path]::GetFullPath($record.InstallLocation).TrimEnd('\') -ieq $target -and $record.DisplayVersion -ceq $version) 'INSTALL_RECORD_MISMATCH'
    $manifestFile = Join-Path $target 'build-manifest.json'
    Require (HashMatches $manifestFile $receipt.runtimeManifestSha256) 'INSTALLED_MANIFEST_MISMATCH'
    $manifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
    Require ($manifest.sourceCommit -ceq $source -and $manifest.version -ceq $version -and $manifest.files.Count -le 10000) 'INSTALLED_SOURCE_MISMATCH'
    foreach ($file in $manifest.files) {
        SafeRelative $file.path | Out-Null
        Require (HashMatches (Join-Path $target $file.path) $file.sha256) 'INSTALLED_PAYLOAD_MISMATCH'
    }
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($menu)
    $hostExe = Join-Path $target 'Emby.Theater.exe'
    $electronExe = Join-Path $target 'x64/electron/electron.exe'
    Require ($shortcut.TargetPath -ieq $hostExe -and $shortcut.WorkingDirectory.TrimEnd('\') -ieq $target -and [string]$shortcut.Arguments -ceq '') 'SHORTCUT_MISMATCH'
    $result.shortcutVerified = $true
    # Remove inherited probe options only in this CI process; no setx or system change.
    foreach ($name in @('ELECTRON_RUN_AS_NODE','NODE_OPTIONS','ETE_WINDOWS_NATIVE_TRIAL','ETE_WINDOWS_PREVIEW_INTERVAL_MS','ETE_MPV_BRIDGE_MODE')) { [Environment]::SetEnvironmentVariable($name,$null,'Process') }
    $result.stage = 'ordinary-start'
    $launcher = Start-Process -FilePath $shortcut.TargetPath -WorkingDirectory $shortcut.WorkingDirectory -RedirectStandardOutput (Join-Path $work 'host.stdout.log') -RedirectStandardError (Join-Path $work 'host.stderr.log') -PassThru
    $result.hostStarted = $true
    function OwnedProcesses { return @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($target + '\',[StringComparison]::OrdinalIgnoreCase) }) }
    InitializeWindowsApi; $windowsApiReady=$true
    $deadline = [DateTime]::UtcNow.AddSeconds(60); $mainElectron = $null; $windows = @()
    do {
        if ($launcher.HasExited) { $result.hostExitCode = $launcher.ExitCode }
        Require (-not $launcher.HasExited) 'HOST_EXITED_BEFORE_WINDOW'
        $candidates = @(OwnedProcesses | Where-Object { $_.ExecutablePath -ieq $electronExe -and $_.ParentProcessId -eq $launcher.Id })
        $result.ownedElectronCandidates = $candidates.Count
        if ($candidates.Count -eq 1) {
            Require ($candidates[0].CommandLine.Contains('"' + (Join-Path $target 'electronapp') + '"') -and $candidates[0].CommandLine -notmatch 'native-preview-trial|ete-page-cache-test') 'NON_ORDINARY_ARGUMENTS'
            $mainElectron = [Diagnostics.Process]::GetProcessById($candidates[0].ProcessId); $null = $mainElectron.Handle
            $windows = @([V043Window]::Visible($mainElectron.Id))
        }
        $result.visibleWindowCount = $windows.Count
        if ($windows.Count -eq 1) { break }
        Start-Sleep -Milliseconds 250
    } while ([DateTime]::UtcNow -lt $deadline)
    Require ($null -ne $mainElectron -and $windows.Count -eq 1) 'VISIBLE_WINDOW_NOT_CONFIRMED'
    $result.electronParentVerified = $true; $result.visibleWindow = $true
    Start-Sleep -Seconds 2
    $diag = Join-Path $profile 'logs/ete-client.jsonl'
    Require (Test-Path -LiteralPath $diag -PathType Leaf) 'DIAGNOSTIC_LOG_MISSING'
    $events = @(Get-Content -LiteralPath $diag | ForEach-Object { $_ | ConvertFrom-Json })
    Require (@($events | Where-Object { $_.category -ceq 'app' -and $_.event -ceq 'start' -and $_.details.appVersion -ceq $version -and $_.details.buildCommit -ceq $source }).Count -eq 1) 'APP_IDENTITY_MISMATCH'
    $result.stage = 'normal-close'
    Require ([V043Window]::Close($windows[0])) 'NORMAL_CLOSE_NOT_DELIVERED'
    $result.normalCloseRequested = $true
    $deadline = [DateTime]::UtcNow.AddSeconds(25)
    while ([DateTime]::UtcNow -lt $deadline -and (@(OwnedProcesses).Count -gt 0 -or -not $launcher.HasExited -or -not $mainElectron.HasExited)) { Start-Sleep -Milliseconds 250 }
    $result.ownedRemainingCount = @(OwnedProcesses).Count
    Require ($launcher.HasExited -and $mainElectron.HasExited -and $result.ownedRemainingCount -eq 0) 'OWNED_EXIT_NOT_CONFIRMED'
    $result.hostExitCode = $launcher.ExitCode; $result.electronExitCode = $mainElectron.ExitCode
    Require ($launcher.ExitCode -eq 0 -and $mainElectron.ExitCode -eq 0) 'NONZERO_EXIT'
    $result.ownedExitConfirmed = $true
    $events = @(Get-Content -LiteralPath $diag | ForEach-Object { $_ | ConvertFrom-Json })
    Require (@($events | Where-Object { ($_.category -ceq 'windows-media' -and $_.event -ceq 'integration-unavailable') -or ($_.category -ceq 'renderer' -and $_.event -in @('global-error','unhandled-rejection')) -or ($_.category -ceq 'app' -and $_.event -ceq 'shutdown-cleanup-failed') -or $_.event -ceq 'app-startup-initialization-failed' }).Count -eq 0) 'APP_FAILURE_EVENT'
    Require (@($events | Where-Object { $_.category -ceq 'app' -and $_.event -ceq 'shutdown' }).Count -eq 1) 'SHUTDOWN_EVENT_MISSING'
    $result.status = 'passed'; $result.stage = 'complete'
} catch {
    $result.errorCode = if ($_.Exception.Message -cmatch '^[A-Z][A-Z0-9_]+$') { $_.Exception.Message } else { 'UNEXPECTED_EXCEPTION' }
    $result.errorType = $_.Exception.GetType().Name
    $result.scriptLine = $_.InvocationInfo.ScriptLineNumber
} finally {
    if ($result.status -cne 'passed' -and $null -ne $launcher) {
        try {
            $all = @(Get-CimInstance Win32_Process)
            $owned = @($all | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($target + '\',[StringComparison]::OrdinalIgnoreCase) })
            $direct = @($all | Where-Object { $_.ParentProcessId -eq $launcher.Id -and $_.Name -ieq 'electron.exe' })
            $result.processFacts = [ordered]@{hostExited=$launcher.HasExited;ownedHostCount=@($owned | Where-Object { $_.Name -ieq 'Emby.Theater.exe' }).Count;ownedElectronCount=@($owned | Where-Object { $_.Name -ieq 'electron.exe' }).Count;directElectronNameCount=$direct.Count;directElectronPathMissing=@($direct | Where-Object { -not $_.ExecutablePath }).Count}
            if ($windowsApiReady -and -not $launcher.HasExited) { $result.hostWindowKinds = @([V043Window]::VisibleKinds($launcher.Id)) }
            if ($launcher.HasExited) { $result.hostExitCode=$launcher.ExitCode }
            $stdout=Join-Path $work 'host.stdout.log';$stderr=Join-Path $work 'host.stderr.log'
            $result.hostStreamFacts=[ordered]@{stdoutBytes=if(Test-Path -LiteralPath $stdout){(Get-Item -LiteralPath $stdout).Length}else{0};stderrBytes=if(Test-Path -LiteralPath $stderr){(Get-Item -LiteralPath $stderr).Length}else{0};projection=(ProjectHostText ((ReadBoundedText $stdout) + "`n" + (ReadBoundedText $stderr)) $target)}
            $logDir=Join-Path $profile 'logs'
            $hostLogs=@(Get-ChildItem -LiteralPath $logDir -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'ete-client.jsonl' } | Select-Object -First 4)
            $text=($hostLogs | ForEach-Object { ReadBoundedText $_.FullName }) -join "`n"
            $diag=Join-Path $logDir 'ete-client.jsonl'
            $result.profileFacts=[ordered]@{exists=(Test-Path -LiteralPath $profile);clientLogExists=(Test-Path -LiteralPath $diag);hostLogFileCount=$hostLogs.Count;hostProjection=(ProjectHostText $text $target)}
            if (Test-Path -LiteralPath $diag) {
                $clientEvents=@((ReadBoundedText $diag) -split '\r?\n' | Where-Object { $_ } | ForEach-Object { $_ | ConvertFrom-Json })
                $result.profileFacts.appStartCount=@($clientEvents | Where-Object { $_.category -ceq 'app' -and $_.event -ceq 'start' }).Count
                $result.profileFacts.failureEventCount=@($clientEvents | Where-Object { $_.event -in @('global-error','unhandled-rejection','integration-unavailable','app-startup-initialization-failed') }).Count
            }
        } catch { $result.failureProjectionIncomplete=$true }
    }
    # Report only fixed fields. Raw installer/client logs and profiles stay on the disposable runner.
    [IO.File]::WriteAllText((Join-Path $reportDir 'installed-startup.json'),($result | ConvertTo-Json -Depth 5) + "`n",[Text.UTF8Encoding]::new($false))
    Write-Output ($result | ConvertTo-Json -Depth 5 -Compress)
}
if ($result.status -cne 'passed') { exit 1 }
