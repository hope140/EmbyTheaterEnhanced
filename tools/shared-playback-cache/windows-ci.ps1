param(
    [Parameter(Mandatory=$true)][string]$ArtifactId,
    [Parameter(Mandatory=$true)][string]$ZipSha256,
    [Parameter(Mandatory=$true)][string]$InstallerSha256,
    [Parameter(Mandatory=$true)][string]$ExpectedToolSha,
    [Parameter(Mandatory=$true)][string]$OutputRoot,
    [switch]$LivenessOnly,
    [switch]$NativeLivenessOnly,
    [switch]$AppPerformanceOnly,
    [ValidateSet('entry', 'matrix')][string]$AppPerformanceMode = 'entry'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (@($LivenessOnly, $NativeLivenessOnly, $AppPerformanceOnly).Where({ $_ }).Count -gt 1) { throw 'Select one exact runtime suite.' }
if (-not $IsWindows -or $PSVersionTable.PSVersion.Major -lt 7) { throw 'Dedicated Windows PowerShell7 runner required.' }
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if ($ArtifactId -cnotmatch '^[1-9][0-9]{0,17}$' -or $ZipSha256 -cnotmatch '^[a-f0-9]{64}$' -or $InstallerSha256 -cnotmatch '^[a-f0-9]{64}$' -or $ExpectedToolSha -cnotmatch '^[a-f0-9]{40}$') { throw 'Exact artifact/tool identities required.' }
$actualToolSha = ([string](& git -C $repo rev-parse HEAD)).Trim()
if ($LASTEXITCODE -ne 0 -or $actualToolSha -cne $ExpectedToolSha -or $env:GITHUB_SHA -cne $ExpectedToolSha -or $env:GITHUB_REPOSITORY -cne 'hope140/EmbyTheaterEnhanced') { throw 'Unexpected repository/tool checkout.' }
# Check protected product bytes/ancestry before acquiring anything. The exact
# artifact may be the reviewed product anchor or this same tooling HEAD; the
# latter permits one source commit for package and Native verification.
$reviewedProduct = [string](& node -e "const c=require(process.argv[1]); console.log(c.reviewedCandidate({repo:process.argv[2],candidateCommit:c.PRODUCT_COMMIT}).productCommit);" (Join-Path $PSScriptRoot 'windows-contract.cjs') $repo)
if ($LASTEXITCODE -ne 0 -or $reviewedProduct -cnotmatch '^[a-f0-9]{40}$') { throw 'Reviewed package compatibility failed.' }
if (Test-Path -LiteralPath $OutputRoot) { throw 'Preserve previous smoke output.' }
New-Item -ItemType Directory -Path $OutputRoot | Out-Null
$safe = Join-Path $OutputRoot 'safe-receipts'
New-Item -ItemType Directory -Path $safe | Out-Null
$headers = @{Authorization=('Bearer ' + $env:GH_TOKEN); Accept='application/vnd.github+json'; 'X-GitHub-Api-Version'='2022-11-28'}
if (-not $env:GH_TOKEN) { throw 'Read-only Actions job token required; no credential creation.' }
$api = 'https://api.github.com/repos/hope140/EmbyTheaterEnhanced'
try {
    $artifact = Invoke-RestMethod -Uri "$api/actions/artifacts/$ArtifactId" -Headers $headers -Method Get
    $runId = [string]$artifact.workflow_run.id
    $candidateSource = [string]$artifact.workflow_run.head_sha
    if ($candidateSource -cnotmatch '^[a-f0-9]{40}$') { throw 'identity' }
    $productSha = [string](& node -e "const c=require(process.argv[1]); console.log(c.reviewedCandidate({repo:process.argv[2],candidateCommit:process.argv[3]}).productCommit);" (Join-Path $PSScriptRoot 'windows-contract.cjs') $repo $candidateSource)
    if ($LASTEXITCODE -ne 0 -or $productSha -cne $candidateSource) { throw 'identity' }
    if ($runId -cnotmatch '^[1-9][0-9]{0,17}$' -or $artifact.expired -or $artifact.workflow_run.head_sha -cne $productSha -or $artifact.name -notlike "ete-test-win-x64-$productSha-*" -or $artifact.size_in_bytes -gt 400MB) { throw 'identity' }
    $run = Invoke-RestMethod -Uri "$api/actions/runs/$runId" -Headers $headers -Method Get
    if ($run.head_sha -cne $productSha -or $run.conclusion -cne 'success' -or $run.event -cne 'workflow_dispatch' -or $run.path -cne '.github/workflows/public-ci.yml') { throw 'identity' }
    # Authorization is sent only to api.github.com. Follow its artifact redirect
    # with a separate client containing no headers or credentials.
    $handler = [Net.Http.HttpClientHandler]::new(); $handler.AllowAutoRedirect = $false
    $client = [Net.Http.HttpClient]::new($handler); $client.Timeout = [TimeSpan]::FromSeconds(30)
    try {
        $client.DefaultRequestHeaders.UserAgent.ParseAdd('ETE-owned-shared-cache-smoke')
        $client.DefaultRequestHeaders.Authorization = [Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $env:GH_TOKEN)
        $response = $client.GetAsync("$api/actions/artifacts/$ArtifactId/zip", [Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
        try {
            $location = $response.Headers.Location
            if ([int]$response.StatusCode -ne 302 -or -not $location.IsAbsoluteUri -or $location.Scheme -cne 'https' -or $location.UserInfo -or $location.Host -notmatch '(?:\.blob\.core\.windows\.net|\.actions\.githubusercontent\.com|\.githubusercontent\.com)$') { throw 'redirect' }
            $downloadHandler = [Net.Http.HttpClientHandler]::new(); $downloadHandler.AllowAutoRedirect = $false
            $download = [Net.Http.HttpClient]::new($downloadHandler); $download.Timeout = [TimeSpan]::FromSeconds(90)
            try {
                $body = $download.GetAsync($location, [Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
                try {
                    $body.EnsureSuccessStatusCode() | Out-Null
                    if ($body.Content.Headers.ContentLength -and $body.Content.Headers.ContentLength -ne $artifact.size_in_bytes) { throw 'length' }
                    $zip = Join-Path $OutputRoot 'candidate.zip'; $stream = [IO.File]::Open($zip, [IO.FileMode]::CreateNew)
                    try {
                        $transferDeadline = [Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds(90))
                        $inputStream = $body.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
                        try {
                            $buffer = [byte[]]::new(65536); $received = [long]0
                            while (($n = $inputStream.ReadAsync($buffer, 0, $buffer.Length, $transferDeadline.Token).GetAwaiter().GetResult()) -gt 0) {
                                $received += $n; if ($received -gt $artifact.size_in_bytes) { throw 'length' }
                                $stream.Write($buffer, 0, $n)
                            }
                            if ($received -ne $artifact.size_in_bytes) { throw 'length' }
                        } finally { $inputStream.Dispose(); $transferDeadline.Dispose() }
                    } finally { $stream.Dispose() }
                } finally { $body.Dispose() }
            } finally { $download.Dispose(); $downloadHandler.Dispose() }
        } finally { $response.Dispose() }
    } finally { $client.Dispose(); $handler.Dispose() }
} catch { throw 'Exact candidate artifact acquisition failed/expired; no alternate artifact, URL or retry.' }
finally { $headers.Clear(); Remove-Item Env:GH_TOKEN -ErrorAction SilentlyContinue }
if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ZipSha256 -or (Get-Item -LiteralPath $zip).Length -ne $artifact.size_in_bytes) { throw 'Candidate ZIP hash/size mismatch.' }
$bundle = Join-Path $OutputRoot 'bundle'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($zip)
try {
    $names = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $total = [long]0
    if ($archive.Entries.Count -gt 4096) { throw 'Candidate ZIP entry bound exceeded.' }
    foreach ($entry in $archive.Entries) {
        $name = $entry.FullName; $total += $entry.Length
        if (-not $name -or $name.Contains('\') -or $name.StartsWith('/') -or $name.Contains(':') -or @($name.Split('/')) -contains '..' -or @($name.Split('/')) -contains '.' -or -not $names.Add($name) -or $total -gt 700MB) { throw 'Unsafe/big candidate ZIP.' }
    }
} finally { $archive.Dispose() }
[IO.Compression.ZipFile]::ExtractToDirectory($zip, $bundle)
$installers = @(Get-ChildItem -LiteralPath $bundle -File -Filter '*-win-x64-setup.exe')
if ($installers.Count -ne 1 -or (Get-FileHash -LiteralPath $installers[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant() -cne $InstallerSha256) { throw 'Published installer identity mismatch.' }
# Reuse only the repository's already locked static Inno unpacker. No installer
# is executed and no compiler/FFmpeg/Model acquisition or full build is run.
$inputPlan = (& node (Join-Path $repo 'tools/ci-build-input-plan.cjs') plan $repo) | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Locked unpacker plan unavailable.' }
$entry = @($inputPlan.files | Where-Object id -eq 'innounp')
if ($entry.Count -ne 1) { throw 'Locked unpacker identity missing.' }
$unpackerZip = Join-Path $OutputRoot 'locked-unpacker.zip'
try { Invoke-WebRequest -Uri $entry[0].url -OutFile $unpackerZip -MaximumRedirection 5 -TimeoutSec 60 }
catch { throw 'Pinned unpacker acquisition failed; no alternate source or retry.' }
& node (Join-Path $repo 'tools/ci-build-input-plan.cjs') verify-file $repo $unpackerZip innounp
if ($LASTEXITCODE -ne 0) { throw 'Pinned unpacker archive mismatch.' }
$unpackerRoot = Join-Path $OutputRoot 'unpacker'
Expand-Archive -LiteralPath $unpackerZip -DestinationPath $unpackerRoot
$lock = Get-Content -LiteralPath (Join-Path $repo 'tools/build-toolchains.lock.json') -Raw | ConvertFrom-Json
$unpacker = Join-Path $unpackerRoot 'innounp.exe'
if ((Get-FileHash -LiteralPath $unpacker -Algorithm SHA256).Hash.ToLowerInvariant() -cne $lock.inno.unpackerSha256) { throw 'Pinned unpacker executable mismatch.' }
$extracted = Join-Path $OutputRoot 'payload'
& $unpacker -x -b ('-d' + $extracted) $installers[0].FullName | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Static installer extraction failed.' }
$sourceReceipt = [ordered]@{schema=1;productCommit=$productSha;toolCommit=$actualToolSha;artifactId=$ArtifactId;runId=$runId;zipSha256=$ZipSha256;installerSha256=$InstallerSha256;installed=$false;source='exact successful manual package, static extraction'}
$sourceReceipt | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $safe 'candidate-source.json') -Encoding utf8
if ($AppPerformanceOnly) {
    $ownedRoot = [string](& node -e "const h=require(process.argv[1]),c=require(process.argv[2]);console.log(h.temporaryRoot('ete-shared-app-',c.cases(process.argv[3]).map(x=>'performance/profile-'+x.index+'/userdata/shared-playback-byte-cache-v2')));" (Join-Path $repo 'tests/helpers/range-fixture-root.cjs') (Join-Path $PSScriptRoot 'app-performance-runner.cjs') $AppPerformanceMode)
    if ($LASTEXITCODE -ne 0) { throw 'Owned ordinary app preflight failed.' }
    $performanceRoot = Join-Path $ownedRoot.Trim() 'performance'
    try {
        & node (Join-Path $PSScriptRoot 'app-performance-runner.cjs') "--repo=$repo" "--runtime=$(Join-Path $extracted '{app}')" "--installer=$($installers[0].FullName)" "--installer-sha256=$InstallerSha256" "--product-sha=$productSha" "--out=$performanceRoot" "--mode=$AppPerformanceMode"
        if ($LASTEXITCODE -ne 0) { throw 'Ordinary main performance failed; no fallback or retry.' }
    } finally {
        foreach ($receipt in @(Get-ChildItem -LiteralPath $performanceRoot -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'app-performance.json' -or $_.Name -match '^case-[0-9]{1,2}\.json$' })) {
            Copy-Item -LiteralPath $receipt.FullName -Destination (Join-Path $safe $receipt.Name)
        }
    }
    return
}
if ($LivenessOnly -or $NativeLivenessOnly) {
    # Both suites avoid business servers. Native is an explicit separate suite
    # using only one generated local file; default remains strictly no-media.
    $ownedRoot = [string](& node -e "console.log(require(process.argv[1]).temporaryRoot('ete-runtime-win-'));" (Join-Path $repo 'tests/helpers/range-fixture-root.cjs'))
    if ($LASTEXITCODE -ne 0) { throw 'Owned liveness root unavailable.' }
    $auditRoot = Join-Path $ownedRoot.Trim() 'audit'
    $auditExit = 1
    try {
        $suiteArgs = @()
        if ($NativeLivenessOnly) { $suiteArgs = @('--suite=native') }
        & node (Join-Path $PSScriptRoot 'windows-liveness.cjs') "--repo=$repo" "--runtime=$(Join-Path $extracted '{app}')" "--installer=$($installers[0].FullName)" "--installer-sha256=$InstallerSha256" "--product-sha=$productSha" "--out=$auditRoot" @suiteArgs
        $auditExit = $LASTEXITCODE
    } finally {
        foreach ($name in @('liveness-summary.json','bare.json','bare.stages.json','contents.json','contents.stages.json','frame.json','frame.stages.json','helper-idle.json','helper-idle.stages.json','helper-playback.json','helper-playback.stages.json','helper-preview.json','helper-preview.stages.json')) {
            $file = Join-Path $auditRoot $name
            if (Test-Path -LiteralPath $file -PathType Leaf) { Copy-Item -LiteralPath $file -Destination (Join-Path $safe $name) }
        }
    }
    if ($auditExit -ne 0) { throw 'Selected runtime liveness failed; no fallback or retry.' }
    return
}
# Read-only canonical/Windows excluded-port preflight selects a fresh fixture
# identity BEFORE any fixed guard bind; never retries EACCES or changes its port.
$ownerRoot = [string](& node -e "const h=require(process.argv[1]); console.log(h.temporaryRoot('ete-shared-win-',['smoke/shared-profile/userdata/shared-playback-byte-cache-v2']));" (Join-Path $repo 'tests/helpers/range-fixture-root.cjs') | Select-Object -Last 1)
if ($LASTEXITCODE -ne 0) { throw 'Fresh fixture preflight failed.' }
$smokeRoot = Join-Path $ownerRoot.Trim() 'smoke'
try {
    & (Join-Path $PSScriptRoot 'windows-run.ps1') -RuntimeRoot (Join-Path $extracted '{app}') -Installer $installers[0].FullName -InstallerSha256 $InstallerSha256 -ProductCommit $productSha -OutputRoot $smokeRoot
} finally {
    foreach ($name in @('coordinator.json','baseline.json','baseline.stages.json','natural.json','natural.stages.json','reopen.json','reopen.stages.json','cancel.json','cancel.stages.json','baseline.lifecycle.json','natural.lifecycle.json','reopen.lifecycle.json','cancel.lifecycle.json')) {
        $file = Join-Path $smokeRoot $name
        if (Test-Path -LiteralPath $file -PathType Leaf) { Copy-Item -LiteralPath $file -Destination (Join-Path $safe $name) }
    }
}
