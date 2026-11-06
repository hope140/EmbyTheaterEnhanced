[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$prototypeRoot = $PSScriptRoot
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $prototypeRoot '../../..'))
$outputRoot = Join-Path $sourceRoot 'test-output/fn-connect-fixture'
if (Test-Path -LiteralPath $outputRoot) { throw 'FN_FIXTURE_OUTPUT_ALREADY_EXISTS' }
$null = New-Item -ItemType Directory -Path $outputRoot
$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ('ete-fn-runner-' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $temporaryRoot
$stdoutFile = Join-Path $temporaryRoot 'runtime-stdout.txt'
$profilesRoot = Join-Path $temporaryRoot 'profiles'
$resultFile = Join-Path $outputRoot 'result.json'
$archiveHash = 'UNVERIFIED'
$launchState = 'HARNESS_FAILED'
$runtimeExit = -1
$sourceCommit = 'UNKNOWN'
$child = $null
$childStarted = $false
$terminationAttempted = $false
$processExited = $true
$profileCleanupVerified = $false
$rawOutput = ''
try {
    $sourceCommit = (& git -C $sourceRoot rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $sourceCommit -notmatch '^[a-f0-9]{40}$') { throw 'FN_FIXTURE_SOURCE_UNKNOWN' }
    $sourceState = & git -C $sourceRoot status --porcelain=v1 --untracked-files=normal
    if ($LASTEXITCODE -ne 0 -or $sourceState) { throw 'FN_FIXTURE_SOURCE_DIRTY' }
    if ($env:GITHUB_SHA -and $sourceCommit -ne $env:GITHUB_SHA) { throw 'FN_FIXTURE_SOURCE_MISMATCH' }
    if (-not $IsWindows) { $launchState = 'PLATFORM_UNSUPPORTED'; throw 'FN_FIXTURE_WINDOWS_REQUIRED' }
    $null = New-Item -ItemType Directory -Path $profilesRoot
    $electronInput = Get-Content -LiteralPath (Join-Path $prototypeRoot 'electron-input.json') -Raw | ConvertFrom-Json
    & node (Join-Path $sourceRoot 'tools/electron-runtime-input.cjs') validate-manifest $sourceRoot | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'FN_FIXTURE_INPUT_MISMATCH' }
    $product = Get-Content -LiteralPath (Join-Path $sourceRoot 'vendor/electron-runtime-manifest.json') -Raw | ConvertFrom-Json
    if ($electronInput.version -cne $product.version -or $electronInput.platform -cne 'win32-x64' -or
        $electronInput.asset -cne $product.archive.name -or $electronInput.url -cne $product.archive.sourceUrl -or
        $electronInput.sha256 -cne $product.archive.sha256 -or
        $electronInput.executableSha256 -cne $product.runtime.electronExeSha256) { throw 'FN_FIXTURE_INPUT_MISMATCH' }
    $archive = Join-Path $temporaryRoot $electronInput.asset
    $launchState = 'DOWNLOAD_FAILED'
    Invoke-WebRequest -Uri $electronInput.url -OutFile $archive -TimeoutSec 90
    $archiveHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($archiveHash -ne $electronInput.sha256) { $launchState = 'HASH_MISMATCH'; throw 'FN_ELECTRON_HASH_MISMATCH' }
    $launchState = 'EXTRACT_FAILED'
    $runtimeRoot = Join-Path $temporaryRoot 'electron'
    Expand-Archive -LiteralPath $archive -DestinationPath $runtimeRoot
    if ((Get-FileHash -LiteralPath (Join-Path $runtimeRoot 'electron.exe') -Algorithm SHA256).Hash.ToLowerInvariant() -cne $electronInput.executableSha256) { throw 'FN_FIXTURE_EXE_MISMATCH' }
    $launchState = 'PROCESS_START_FAILED'
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = Join-Path $runtimeRoot 'electron.exe'
    $start.WorkingDirectory = $sourceRoot
    $start.UseShellExecute = $false
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.ArgumentList.Add((Join-Path $prototypeRoot 'electron-main.cjs'))
    $start.ArgumentList.Add('--fn-connect-prototype')
    $start.ArgumentList.Add('--fixture-smoke')
    $start.Environment['ETE_FN_FIXTURE_PROFILE_ROOT'] = $profilesRoot
    # Normal sandbox. No proxy, certificate, port or system permission changes.
    $child = [Diagnostics.Process]::new()
    $child.StartInfo = $start
    if (-not $child.Start()) { throw 'FN_FIXTURE_START_FAILED' }
    $childStarted = $true
    $processExited = $false
    $stdoutTask = $child.StandardOutput.ReadToEndAsync()
    $stderrTask = $child.StandardError.ReadToEndAsync()
    $launchState = 'TIMEOUT'
    if (-not $child.WaitForExit(90000)) {
        $terminationAttempted = $true
        $child.Kill($true)
        $processExited = $child.WaitForExit(5000)
    } else { $launchState = 'COMPLETED' }
    $processExited = $child.HasExited
    if ($processExited) { $runtimeExit = $child.ExitCode } else { $launchState = 'PROCESS_EXIT_UNCONFIRMED' }
    $pipes = [Threading.Tasks.Task]::WhenAll([Threading.Tasks.Task[]]@($stdoutTask, $stderrTask))
    if (-not $pipes.Wait(5000) -and $launchState -eq 'COMPLETED') { $launchState = 'PIPE_EOF_TIMEOUT' }
    if ($stdoutTask.IsCompletedSuccessfully) { $rawOutput = $stdoutTask.GetAwaiter().GetResult() }
} catch {
    # Only fixed result states leave the runner; no exception text, URLs, paths,
    # environment values or raw Chromium stderr are printed or uploaded.
    if ($launchState -eq 'COMPLETED') { $launchState = 'HARNESS_FAILED' }
} finally {
    if ($child) {
        if ($childStarted) {
            try {
                if (-not $child.HasExited -and -not $terminationAttempted) {
                    $terminationAttempted = $true
                    $child.Kill($true)
                    $null = $child.WaitForExit(5000)
                }
                $processExited = $child.HasExited
            } catch { $processExited = $false }
            if (-not $processExited) { $launchState = 'PROCESS_EXIT_UNCONFIRMED' }
        }
        $child.Dispose()
    }
}
if ($processExited) {
    try {
        if (Test-Path -LiteralPath $profilesRoot) { Remove-Item -LiteralPath $profilesRoot -Recurse -Force }
        $profileCleanupVerified = -not (Test-Path -LiteralPath $profilesRoot)
    } catch { $profileCleanupVerified = $false }
}
[IO.File]::WriteAllText($stdoutFile, $rawOutput, [Text.UTF8Encoding]::new($false))
try {
    & node (Join-Path $prototypeRoot 'smoke-report.cjs') $stdoutFile $resultFile $sourceCommit $archiveHash $launchState ([string]$runtimeExit) ([string]$processExited).ToLowerInvariant() ([string]$profileCleanupVerified).ToLowerInvariant()
    $reportExit = $LASTEXITCODE
} finally {
    if ($processExited -and $profileCleanupVerified) { Remove-Item -LiteralPath $temporaryRoot -Recurse -Force -ErrorAction SilentlyContinue }
}
if ($reportExit -ne 0) { throw 'FN_FIXTURE_VALIDATION_FAILED' }
