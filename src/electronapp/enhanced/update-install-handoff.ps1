# Loaded only for an explicit update click or confirmed-installed local cleanup.
# Fixed source is passed by main; no execution-policy or language-mode override.
$ErrorActionPreference = 'Stop'
Import-Module ([IO.Path]::Combine($PSHOME,'Modules','Microsoft.PowerShell.Utility','Microsoft.PowerShell.Utility.psd1')) -ErrorAction Stop
if (-not $eteUpdateInput) { $eteUpdateInput = [Console]::In }
if (-not $eteUpdateOutput) { $eteUpdateOutput = [Console]::Out }
try {
    [Console]::Error.WriteLine('ETE_GUARD_STAGE request-read')
    $line = $eteUpdateInput.ReadLine()
    [Console]::Error.WriteLine('ETE_GUARD_STAGE request-received')
    if (-not $line -or $line.Length -gt 32768) { throw 'invalid-input' }
    $request = $line | ConvertFrom-Json
    Add-Type -TypeDefinition $eteGuardSource
    [Console]::Error.WriteLine('ETE_GUARD_STAGE compiled')
    $guard = [EteUpdateGuard]::new($request.root, $request.rootIno, $request.rootDev, $request.directory, $request.directoryIno, ($request.mode -eq 'cleanup'))
    try {
        $failureStage = 'handoff-failed'
        if ($request.mode -eq 'cleanup') {
            if ($request.outcome) { $guard.PrepareOutcomeCleanup($request.outcome.name, $request.outcome.ino) }
            $guard.ValidateCleanup([string[]]@($request.files | ForEach-Object { $_.name }))
            foreach ($file in $request.files) {
                $guard.DeleteOwned($file.name, $file.ino, [long]$file.size, $file.sha256)
            }
            if ($request.outcome) { $guard.DeleteOutcome() }
            $guard.RemoveEmptyDirectory()
            $eteUpdateOutput.WriteLine('ETE_CLEANUP_DONE')
            $eteUpdateOutput.Flush()
        } elseif ($request.mode -eq 'install') {
            if (-not $request.outcome) { throw 'missing-outcome' }
            # Capture the real parent process handle before signalling readiness.
            $parent = [Diagnostics.Process]::GetProcessById([int]$request.parentPid)
            $null = $parent.Handle
            if (-not [String]::Equals($parent.MainModule.FileName, $request.mainExecutable, [StringComparison]::OrdinalIgnoreCase)) { throw 'parent-changed' }
            $guard.AcquireInstallation($request.mainExecutable)
            $guard.OpenOutcome($request.outcome.name, $request.outcome.ino)
            $hostProcess = $null
            try {
                $possibleHost = [Diagnostics.Process]::GetProcessById([int]$request.hostPid)
                if ([String]::Equals($possibleHost.MainModule.FileName, $request.hostPath, [StringComparison]::OrdinalIgnoreCase)) {
                    $hostProcess = $possibleHost
                    $null = $hostProcess.Handle
                } else { $possibleHost.Dispose() }
                $guard.Prepare($request.name, $request.ino, [long]$request.size, $request.sha256, $request.zone)
                $eteUpdateOutput.WriteLine('ETE_INSTALL_READY')
                $eteUpdateOutput.Flush()
                if ($eteUpdateInput.ReadLine() -ne 'commit') { throw 'not-committed' }
                $guard.WriteOutcome('waiting-release')
                $eteUpdateOutput.WriteLine('ETE_INSTALL_ARMED')
                $eteUpdateOutput.Flush()
                # Arming never authorizes installation. Keep cancellation safe
                # until main has confirmed all critical cleanup and requests launch.
                $release = $eteUpdateInput.ReadLineAsync()
                if (-not $release.Wait(60000)) { $failureStage = 'release-timeout'; throw 'release-timeout' }
                if ($release.Result -ne 'launch') { $failureStage = 'cancelled'; throw 'cancelled' }
                $eteUpdateOutput.WriteLine('ETE_INSTALL_RELEASED')
                $eteUpdateOutput.Flush()
                $guard.WriteOutcome('waiting-client')
                # Never terminate the client. An obstructed normal quit aborts
                # this handoff; a later unrelated client exit cannot install.
                $wait = [Diagnostics.Stopwatch]::StartNew()
                if (-not $parent.WaitForExit(120000)) { $failureStage = 'client-timeout'; throw 'client-still-running' }
                if ($parent.ExitCode -ne 0) { $failureStage = 'client-nonzero'; throw 'client-exit-failed' }
                $guard.WriteOutcome('client-exited')
                if ($hostProcess) { $guard.WriteOutcome('waiting-host') }
                if ($hostProcess -and -not $hostProcess.WaitForExit([Math]::Max(0, 120000 - [int]$wait.ElapsedMilliseconds))) { $failureStage = 'host-timeout'; throw 'host-still-running' }
                if ($hostProcess -and $hostProcess.ExitCode -ne 0) { $failureStage = 'host-nonzero'; throw 'host-exit-failed' }
                if ($hostProcess) { $guard.WriteOutcome('host-exited') }
                $failureStage = 'shell-failed'
                $guard.OpenWizard()
            } finally { if ($hostProcess) { $hostProcess.Dispose() }; $parent.Dispose() }
        } else { throw 'invalid-mode' }
    } catch { $guard.WriteOutcome($failureStage); throw } finally { $guard.Dispose() }
    exit 0
} catch {
    # Keep the verified installer/receipt for another explicit click. Do not
    # expose paths, raw native exceptions or credentials in public diagnostics.
    exit 1
}
