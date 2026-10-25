# Dot-sourced only by the existing installer checker, on a fresh hosted runner.
function Invoke-NativeExitCases([string]$Target,$Shortcut,[string]$Profile,$Manifest,[string]$Work) {
    $ErrorActionPreference='Stop'
    $rows=[Collections.Generic.List[object]]::new()
    $summary=[ordered]@{status='failed';stimulus='temporary-script-via-existing-installed-scripts-loader';ordinaryHostLaunch=$true;releaseBytesModified=$false;playbackManagerQueueSession='NOT_ASSESSED';visibleDwmAcceptance='NOT_ASSESSED';cases=$rows;fixtureRemoved=$false;forcedCleanup=$false}
    $fixture=Join-Path $Target 'electronapp/scripts/ete-native-exit-validation.js'
    $config=Join-Path $Work 'native-case.json';$report=Join-Path $Work 'native-renderer.json';$clip=Join-Path $Work 'synthetic-exit.y4m'
    $tracked=@{}
    Require (-not (Test-Path -LiteralPath $fixture)) 'FIXTURE_PATH_ALREADY_EXISTS'
    function Assert-OriginalPayload {
        foreach($file in $Manifest.files){Require (HashMatches (Join-Path $Target $file.path) $file.sha256) 'ORIGINAL_RELEASE_PAYLOAD_CHANGED'}
    }
    function Processes {
        $all=@(Get-CimInstance Win32_Process);$owned=@{}
        foreach($row in $all){
            $id=[int]$row.ProcessId
            if(($row.ExecutablePath -and $row.ExecutablePath.StartsWith($Target+'\',[StringComparison]::OrdinalIgnoreCase)) -or
                ($tracked.ContainsKey($id) -and $tracked[$id].created -eq $row.CreationDate -and $tracked[$id].image -ieq $row.ExecutablePath)){$owned[$id]=$row}
        }
        do {
            $added=$false
            foreach($row in $all){
                $id=[int]$row.ProcessId;$parentId=[int]$row.ParentProcessId
                if($owned.ContainsKey($id)){continue}
                $parent=$null
                if($owned.ContainsKey($parentId)){$parent=$owned[$parentId].CreationDate}
                elseif($tracked.ContainsKey($parentId)){
                    $reused=@($all|Where-Object {$_.ProcessId -eq $parentId -and $_.CreationDate -ne $tracked[$parentId].created})
                    if($reused.Count -eq 0){$parent=$tracked[$parentId].created}
                }
                if($parent -and $row.CreationDate -ge $parent){$owned[$id]=$row;$added=$true}
            }
        }while($added)
        foreach($row in $owned.Values){
            $id=[int]$row.ProcessId
            if(-not $tracked.ContainsKey($id) -or $tracked[$id].created -ne $row.CreationDate){
                try{$process=[Diagnostics.Process]::GetProcessById($id);$null=$process.Handle;$tracked[$id]=@{created=$row.CreationDate;image=$row.ExecutablePath;process=$process}}catch{}
            }
        }
        return @($owned.Values)
    }
    function Snapshot($all) {
        return @($all|ForEach-Object {
            $image=if(-not $_.ExecutablePath){'UNREADABLE'}elseif($_.ExecutablePath.StartsWith($Target+'\',[StringComparison]::OrdinalIgnoreCase)){$_.ExecutablePath.Substring($Target.Length+1).Replace('\','/')}else{'<external-child>/'+[IO.Path]::GetFileName($_.ExecutablePath)}
            [ordered]@{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;createdUtc=$_.CreationDate.ToUniversalTime().ToString('o');image=$image}
        })
    }
    function Write-Config([string]$id,[string]$mode) {
        if(Test-Path -LiteralPath $report){Remove-Item -LiteralPath $report}
        [IO.File]::WriteAllText($config,(@{caseId=$id;mode=$mode}|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
    }
    $fixtureHash=$null
    try {
        Assert-OriginalPayload
        & node (Join-Path $PSScriptRoot 'native-exit-fixture.cjs') $config $report $clip $fixture
        Require ($LASTEXITCODE -eq 0) 'FIXTURE_GENERATION_FAILED'
        $fixtureHash=(Get-FileHash -LiteralPath $fixture -Algorithm SHA256).Hash.ToLowerInvariant();$summary.fixtureSha256=$fixtureHash
        foreach($spec in @(@('playing-close','playing-close'),@('stop-close','stop-close'),@('repeat-playing-close','playing-close'))) {
            $case=[ordered]@{id=$spec[0];status='failed';stage='preflight';hostStarted=$false;electronParentVerified=$false;visibleWindowObserved=$false;helperStarted=$false;normalCloseRequested=$false;functionalExitPassed=$false;hostExitCode=$null;electronExitCode=$null;helperExitCode=$null;ownedRemaining=$null;diagnosticLogPersisted=$false;snapshots=@()}
            $rows.Add($case);$hostProcess=$null;$electronProcess=$null;$helperProcess=$null
            try {
                Require (@(Processes).Count -eq 0) 'OWNED_PROCESS_BEFORE_CASE'
                Write-Config $spec[0] $spec[1]
                $case.stage='ordinary-host-start';$start=[DateTime]::UtcNow
                $hostProcess=Start-Process -FilePath $Shortcut.TargetPath -WorkingDirectory $Shortcut.WorkingDirectory -RedirectStandardOutput (Join-Path $Work ($spec[0]+'.host.stdout.log')) -RedirectStandardError (Join-Path $Work ($spec[0]+'.host.stderr.log')) -PassThru
                $null=$hostProcess.Handle
                $case.hostStarted=$true;$case.hostPid=$hostProcess.Id;$case.stage='await-real-native-playing'
                $deadline=[DateTime]::UtcNow.AddSeconds(65);$renderer=$null;$mainRow=$null;$helperRow=$null;$windows=@()
                do {
                    Require (-not $hostProcess.HasExited) 'HOST_EXITED_DURING_PLAY_START'
                    $all=@(Processes)
                    $main=@($all|Where-Object {$_.ExecutablePath -ieq (Join-Path $Target 'x64/electron/electron.exe') -and $_.ParentProcessId -eq $hostProcess.Id})
                    if($main.Count -eq 1) {
                        $mainRow=$main[0]
                        Require ($mainRow.CommandLine.Contains('"'+(Join-Path $Target 'electronapp')+'"') -and $mainRow.CommandLine -notmatch 'native-preview-trial|ete-page-cache-test') 'NON_ORDINARY_ARGUMENTS'
                        $case.electronParentVerified=$true;$case.electronPid=[int]$mainRow.ProcessId
                        $windows=@([V043Window]::Visible($mainRow.ProcessId))
                        $case.visibleWindowObserved=$windows.Count -eq 1
                        $helpers=@($all|Where-Object {$_.ExecutablePath -ieq (Join-Path $Target 'electronapp/native-helper/ete-mpv-helper.exe') -and $_.ParentProcessId -eq $mainRow.ProcessId})
                        if($helpers.Count -eq 1){$helperRow=$helpers[0];$case.helperStarted=$true;$case.helperPid=[int]$helperRow.ProcessId}
                    }
                    if(Test-Path -LiteralPath $report){try{$renderer=Get-Content -LiteralPath $report -Raw|ConvertFrom-Json}catch{$renderer=$null}}
                    if($renderer -and $renderer.caseId -ceq $spec[0] -and $renderer.status -ceq 'failed'){$case.renderer=$renderer;throw 'NATIVE_RENDERER_FIXTURE_FAILED'}
                    if($renderer -and $renderer.caseId -ceq $spec[0] -and $renderer.readyForClose -and $null -ne $helperRow -and $windows.Count -eq 1){break}
                    Start-Sleep -Milliseconds 200
                } while([DateTime]::UtcNow -lt $deadline)
                $case.renderer=$renderer
                Require ($null -ne $renderer -and $renderer.caseId -ceq $spec[0] -and $renderer.realNativePlayback -and $renderer.readyForClose -and $null -ne $mainRow -and $null -ne $helperRow -and $windows.Count -eq 1) 'NATIVE_PLAYBACK_NOT_CONFIRMED'
                if($spec[1] -ceq 'stop-close'){Require $renderer.stopConfirmed 'NATIVE_STOP_NOT_CONFIRMED'}
                $electronProcess=[Diagnostics.Process]::GetProcessById($mainRow.ProcessId);$null=$electronProcess.Handle
                $helperProcess=[Diagnostics.Process]::GetProcessById($helperRow.ProcessId);$null=$helperProcess.Handle
                Require ($mainRow.CreationDate.ToUniversalTime() -ge $start.AddSeconds(-1) -and $helperRow.CreationDate.ToUniversalTime() -ge $start.AddSeconds(-1) -and $electronProcess.MainModule.FileName -ieq $mainRow.ExecutablePath -and $helperProcess.MainModule.FileName -ieq $helperRow.ExecutablePath) 'OWNED_PROCESS_IDENTITY_MISMATCH'
                $case.beforeClose=@(Snapshot @(Processes));$case.stage='normal-os-close'
                Require ([V043Window]::Close($windows[0])) 'NORMAL_CLOSE_NOT_DELIVERED';$case.normalCloseRequested=$true
                $clock=[Diagnostics.Stopwatch]::StartNew()
                foreach($second in @(2,5,15)) {
                    while($clock.Elapsed.TotalSeconds -lt $second){Start-Sleep -Milliseconds 100}
                    $left=@(Processes);$case.snapshots+=@([ordered]@{seconds=$second;processes=@(Snapshot $left)})
                }
                $case.ownedRemaining=@(Processes).Count
                $case.hostExitCode=if($hostProcess.HasExited){$hostProcess.ExitCode}else{$null}
                $case.electronExitCode=if($electronProcess.HasExited){$electronProcess.ExitCode}else{$null}
                $case.helperExitCode=if($helperProcess.HasExited){$helperProcess.ExitCode}else{$null}
                Require ($hostProcess.HasExited -and $electronProcess.HasExited -and $helperProcess.HasExited -and $case.ownedRemaining -eq 0) 'OWNED_EXIT_NOT_CONFIRMED'
                Require ($case.hostExitCode -eq 0 -and $case.electronExitCode -eq 0 -and $case.helperExitCode -eq 0) 'NONZERO_OWNED_EXIT'
                $events=@(Get-Content -LiteralPath (Join-Path $Profile 'logs/ete-client.jsonl')|ForEach-Object {$_|ConvertFrom-Json})
                $starts=@($events|Where-Object {$_.category -ceq 'app' -and $_.event -ceq 'start'})
                Require ($starts.Count -eq $rows.Count -and $starts[-1].details.buildCommit -ceq '69e55b91a0cc6ba4b01ce60cb65d9aca41b0311e' -and $starts[-1].details.appVersion -ceq '0.4.3') 'APP_IDENTITY_MISMATCH'
                Require (@($events|Where-Object {($_.category -ceq 'windows-media' -and $_.event -ceq 'integration-unavailable') -or $_.event -in @('global-error','unhandled-rejection','shutdown-cleanup-failed','app-startup-initialization-failed')}).Count -eq 0) 'APP_FAILURE_EVENT'
                $case.diagnosticLogPersisted=@($events|Where-Object {$_.category -ceq 'app' -and $_.event -ceq 'shutdown'}).Count -gt 0
                $case.previewFrameReadyObserved=@($events|Where-Object {$_.category -ceq 'windows-media' -and $_.event -ceq 'preview-frame-ready'}).Count -gt 0
                Require $case.previewFrameReadyObserved 'REAL_PREVIEW_FRAME_NOT_OBSERVED'
                $case.functionalExitPassed=$true;$case.status='passed';$case.stage='complete'
            } catch {
                $case.errorCode=if($_.Exception.Message -cmatch '^[A-Z_]{1,100}$'){$_.Exception.Message}else{'UNEXPECTED_CASE_EXCEPTION'}
                $case.errorType=$_.Exception.GetType().Name;$case.scriptLine=$_.InvocationInfo.ScriptLineNumber
                $case.hostExitedAtFailure=$null -ne $hostProcess -and $hostProcess.HasExited
                if($case.hostExitedAtFailure){$case.hostExitCode=$hostProcess.ExitCode}
                $hostText=(ReadBoundedText (Join-Path $Work ($spec[0]+'.host.stdout.log')))+[char]10+(ReadBoundedText (Join-Path $Work ($spec[0]+'.host.stderr.log')))
                $case.hostText=ProjectHostText $hostText $Target
                $case.remainingAtFailure=@(Snapshot @(Processes))
                break
            }
        }
        Require ($rows.Count -eq 3 -and @($rows|Where-Object {$_.status -cne 'passed'}).Count -eq 0) 'NATIVE_EXIT_CASE_FAILED'
        Assert-OriginalPayload;$summary.status='passed'
    } catch {
        $summary.errorCode=if($_.Exception.Message -cmatch '^[A-Z_]{1,100}$'){$_.Exception.Message}else{'UNEXPECTED_NATIVE_EXIT_EXCEPTION'}
    } finally {
        # Cleanup is never evidence of a successful normal exit. Limit it to the
        # unique installed directory and processes captured in this fresh runner.
        $left=@(Processes)
        if($left.Count -gt 0) {
            $summary.status='failed';$summary.forcedCleanup=$true;$summary.beforeForcedCleanup=Snapshot $left
            foreach($owned in $left) {
                $current=Get-CimInstance Win32_Process -Filter ('ProcessId='+$owned.ProcessId) -ErrorAction SilentlyContinue
                $id=[int]$owned.ProcessId
                if($current -and $tracked.ContainsKey($id) -and $current.CreationDate -eq $tracked[$id].created -and $current.ExecutablePath -ieq $tracked[$id].image){try{$tracked[$id].process.Kill()}catch{}}
            }
        }
        if($fixtureHash -and (HashMatches $fixture $fixtureHash)){Remove-Item -LiteralPath $fixture;$summary.fixtureRemoved=$true}
        try{Assert-OriginalPayload}catch{$summary.status='failed';$summary.originalPayloadCheckFailed=$true}
    }
    return $summary
}
