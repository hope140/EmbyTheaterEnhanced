param([string]$Mode)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../../prototypes/fn-connect/client/runner-preparation.ps1')
$root=Join-Path ([IO.Path]::GetTempPath()) ('ete-fn-budget-test-'+[Guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory $root
try {
    $progress=Join-Path $root 'progress.json'; $status=Join-Path $root 'status.json'; $result=Join-Path $root 'result.json'; $archive=Join-Path $root 'archive.zip'
    $run='a'*32; $source='a'*40; $script:fnProgressFile=$progress
    $script:fnSource=$source; $script:fnRun=$run; $script:fnMode=$Mode; $script:fnExitReads=0; $script:fnStatusWrites=0
    $originalWriter=(Get-Command Write-FnAtomicJson).ScriptBlock
    function Write-FnAtomicJson($Path,$Value,[switch]$Exclusive) {
        & $originalWriter $Path $Value -Exclusive:$Exclusive
        if($Path -eq $status){$script:fnStatusWrites++}
        if($script:fnMode -eq 'final-status-stall' -and $Path -eq $status -and $script:fnStatusWrites -eq 2){$script:fnClock=1500}
        if($script:fnMode -eq 'status-stall' -and $Path -eq $status){$script:fnClock=1500}
    }
    if($Mode -eq 'status-fails'){$null=New-Item -ItemType Directory $status}
    $script:fnClock=0; $script:fnExited=$false; $script:fnKilled=0; $script:fnWaits=0
    function Publish-TestPhase([string]$Stage, [string]$Round=$run, [string]$Commit=$source) {
        Write-FnAtomicJson $script:fnProgressFile ([ordered]@{schemaVersion=1;runId=$Round;sourceCommit=$Commit;stage=$Stage;phase=$Stage;archiveVerified=($Stage -eq 'PREPARED');exeVerified=($Stage -eq 'PREPARED')})
    }
    Publish-TestPhase 'DOWNLOAD'
    if($Mode -in @('slow-cache','cache-shared')){Publish-TestPhase 'CACHE_COPY'}
    if($Mode -eq 'cache-failed'){Write-FnAtomicJson $script:fnProgressFile ([ordered]@{schemaVersion=1;runId=$run;sourceCommit=$source;stage='FAILED';phase='CACHE_COPY';archiveVerified=$false;exeVerified=$false})}
    if($Mode -eq 'final-status-stall'){Publish-TestPhase 'PREPARED'}
    if($Mode -eq 'wrong-round'){Publish-TestPhase 'DOWNLOAD' ('b'*32)}
    if($Mode -eq 'wrong-source'){Publish-TestPhase 'DOWNLOAD' $run ('b'*40)}
    if($Mode -eq 'unknown-stage'){Publish-TestPhase 'PRIVATE_TOKEN_URL'}
    if($Mode -eq 'extra-field'){$v=Get-Content $progress -Raw|ConvertFrom-Json;$v|Add-Member secret 'PRIVATE_TOKEN_URL';Write-FnAtomicJson $progress $v}
    if($Mode -in @('early-nonzero','incomplete-zero','status-stall','final-status-stall','cache-failed')){$script:fnExited=$true}
    $watch=[pscustomobject]@{}; $watch|Add-Member ScriptProperty ElapsedMilliseconds {$script:fnClock}
    $child=[pscustomobject]@{ExitCode=$(if($Mode -eq 'early-nonzero'){1}else{0})}
    $child|Add-Member ScriptProperty HasExited {
        $script:fnExitReads++
        if($script:fnMode -eq 'race-exit' -and $script:fnExitReads -eq 2){Publish-TestPhase 'PREPARED' $script:fnRun $script:fnSource;$script:fnExited=$true}
        $script:fnExited
    }
    $child|Add-Member ScriptMethod WaitForExit {
        param($ms)
        $script:fnWaits++;$script:fnClock+=250
        [IO.File]::AppendAllText($archive,'synthetic-download-progress')
        if($Mode -in @('shared','cache-shared') -and $script:fnClock -ge 500){Publish-TestPhase 'EXTRACT'}
        if($Mode -eq 'source-changes' -and $script:fnClock -ge 250){Publish-TestPhase 'DOWNLOAD' $run ('b'*40)}
        if($Mode -eq 'alive-prepared'){Publish-TestPhase 'PREPARED'}
        if($Mode -eq 'success' -and $script:fnClock -ge 750){Publish-TestPhase 'PREPARED';$script:fnExited=$true}
        return $script:fnExited
    }
    $child|Add-Member ScriptMethod Kill {
        param($tree)
        $script:fnKilled++;if(-not $tree){throw 'WRONG_SCOPE'}
        if($Mode -eq 'unconfirmed'){throw 'PRIVATE_TOKEN_URL'}
        if($Mode -eq 'late-prepared'){Publish-TestPhase 'PREPARED'}
        $script:fnExited=$true
    }
    $outcome=Wait-FnPreparation -Child $child -Watch $watch -RunId $run -ExpectedCommit $source -ProgressPath $progress -StatusPath $status -ResultPath $result -ArchivePath $archive -BudgetMs 1000
    $before=if(Test-Path $result){Get-Content $result -Raw}else{''}
    $statusBefore=if(Test-Path $status -PathType Leaf){Get-Content $status -Raw}else{''}
    Publish-TestPhase 'PREPARED'
    $after=if(Test-Path $result){Get-Content $result -Raw}else{''}
    [ordered]@{outcome=$outcome;killCount=$script:fnKilled;waitCount=$script:fnWaits;
        resultPresent=(Test-Path $result);resultUnchanged=($before -ceq $after);statusUnchanged=($statusBefore -ceq $(if(Test-Path $status -PathType Leaf){Get-Content $status -Raw}else{''}));
        evidenceRetained=(Test-Path $root);resultSafe=($before -notmatch 'PRIVATE_TOKEN_URL|https?://|\\Users\\');
        archiveBytes=$(if(Test-Path $archive){(Get-Item $archive).Length}else{0})}|ConvertTo-Json -Depth 8 -Compress
}finally{Remove-Item $root -Recurse -Force}
