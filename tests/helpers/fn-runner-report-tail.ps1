param([string]$Mode)
$ErrorActionPreference = 'Stop'
$root = Join-Path ([IO.Path]::GetTempPath()) ('ete-fn-report-tail-' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory $root
try {
    $temporaryRoot = Join-Path $root 'owned'; $null = New-Item -ItemType Directory $temporaryRoot
    $neighbor = Join-Path $root 'neighbor.txt'; [IO.File]::WriteAllText($neighbor, 'synthetic')
    $prototypeRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../prototypes/fn-connect/client'))
    . (Join-Path $prototypeRoot 'runner-preparation.ps1')
    $source = (Get-Content (Join-Path $prototypeRoot 'run-windows-smoke.ps1') -Raw).Replace("`r`n", "`n")
    $marker = '$reportExit = 1' + "`ntry {"
    $offset = $source.IndexOf($marker)
    if ($offset -lt 0 -or $source.IndexOf($marker, $offset + 1) -ge 0) { throw 'TAIL_BOUNDARY_INVALID' }
    $stdoutFile = Join-Path $temporaryRoot 'stdout.txt'; $rawOutput = 'synthetic'
    $resultFile = Join-Path $root 'result.json'; $statusPath = Join-Path $root 'status.json'
    $sourceCommit = 'a'*40; $archiveHash = 'b'*64; $runId = 'c'*32; $runtimeExit = 0; $launchState = 'COMPLETED'
    $watch = [Diagnostics.Stopwatch]::StartNew()
    $processExited = $Mode -ne 'unconfirmed'; $profileCleanupVerified = $Mode -ne 'profile-incomplete'
    Write-FnAtomicJson $statusPath ([ordered]@{schemaVersion=1;runId=$runId;sourceCommit=$sourceCommit;stage='ELECTRON_START';terminal=$false})
    if($Mode -eq 'foreign-status'){$v=Read-FnPreparationProgress $statusPath;$v.runId='d'*32;Write-FnAtomicJson $statusPath $v}
    if($Mode -eq 'claimed-then-failed'){Write-FnAtomicJson ($statusPath+'.final-owner') ([ordered]@{runId=$runId;sourceCommit=$sourceCommit}) -Exclusive}
    if($Mode -eq 'preterminal'){$v=Read-FnPreparationProgress $statusPath;$v.terminal=$true;$v.stage='FINISHED';Write-FnAtomicJson $statusPath $v}
    if($Mode -eq 'fallback-result-fails'){$null=New-Item -ItemType Directory $resultFile}
    $statusBefore=[IO.File]::ReadAllText($statusPath)
    $script:nodeCalls = 0
    function node {
        $script:nodeCalls++
        if ($Mode -eq 'node-throws') { throw 'SYNTHETIC_FIXED_FAILURE' }
        $global:LASTEXITCODE = if ($Mode -in @('result-failed','foreign-status','claimed-then-failed','preterminal','fallback-result-fails')) { 1 } else { 0 }
    }
    $failed = $false
    try { Invoke-Expression $source.Substring($offset) } catch { $failed = $true }
    $finalStatus=Read-FnPreparationProgress $statusPath
    $result=if([IO.File]::Exists($resultFile)){Read-FnPreparationProgress $resultFile}else{$null}
    [ordered]@{receiptWritten=$finalStatus.receiptWritten;terminal=$finalStatus.terminal;statusUnchanged=($statusBefore -ceq [IO.File]::ReadAllText($statusPath));resultReason=$result.reason;resultRunId=$result.runId;statusRunId=$finalStatus.runId;nodeCalls=$script:nodeCalls;failed=$failed;temporaryRetained=(Test-Path $temporaryRoot);
        neighborPreserved=([IO.File]::ReadAllText($neighbor) -ceq 'synthetic')} | ConvertTo-Json -Compress
} finally { Remove-Item $root -Recurse -Force }
