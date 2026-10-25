# Loaded only for an explicit update click or confirmed-installed local cleanup.
# Fixed source is passed by main; no execution-policy or language-mode override.
$ErrorActionPreference = 'Stop'
try {
    $line = [Console]::In.ReadLine()
    if (-not $line -or $line.Length -gt 32768) { throw 'invalid-input' }
    $request = $line | ConvertFrom-Json
    Add-Type -TypeDefinition $eteGuardSource
    $guard = New-Object EteUpdateGuard($request.root, $request.rootIno, $request.rootDev, $request.directory, $request.directoryIno, ($request.mode -eq 'cleanup'))
    try {
        if ($request.mode -eq 'cleanup') {
            $guard.ValidateCleanup([string[]]@($request.files | ForEach-Object { $_.name }))
            foreach ($file in $request.files) {
                $guard.DeleteOwned($file.name, $file.ino, [long]$file.size, $file.sha256)
            }
            $guard.RemoveEmptyDirectory()
            [Console]::Out.WriteLine('ETE_CLEANUP_DONE')
            [Console]::Out.Flush()
        } elseif ($request.mode -eq 'install') {
            # Capture the real parent process handle before signalling readiness.
            $parent = [Diagnostics.Process]::GetProcessById([int]$request.parentPid)
            $null = $parent.Handle
            if (-not [String]::Equals($parent.MainModule.FileName, $request.mainExecutable, [StringComparison]::OrdinalIgnoreCase)) { throw 'parent-changed' }
            $hostProcess = $null
            try {
                $possibleHost = [Diagnostics.Process]::GetProcessById([int]$request.hostPid)
                if ([String]::Equals($possibleHost.MainModule.FileName, $request.hostPath, [StringComparison]::OrdinalIgnoreCase)) {
                    $hostProcess = $possibleHost
                    $null = $hostProcess.Handle
                } else { $possibleHost.Dispose() }
                $guard.Prepare($request.name, $request.ino, [long]$request.size, $request.sha256, $request.zone)
                [Console]::Out.WriteLine('ETE_INSTALL_READY')
                [Console]::Out.Flush()
                if ([Console]::In.ReadLine() -ne 'commit') { throw 'not-committed' }
                [Console]::Out.WriteLine('ETE_INSTALL_ARMED')
                [Console]::Out.Flush()
                # Never terminate the client. An obstructed normal quit aborts
                # this handoff; a later unrelated client exit cannot install.
                $wait = [Diagnostics.Stopwatch]::StartNew()
                if (-not $parent.WaitForExit(120000)) { throw 'client-still-running' }
                if ($parent.ExitCode -ne 0) { throw 'client-exit-failed' }
                if ($hostProcess -and -not $hostProcess.WaitForExit([Math]::Max(0, 120000 - [int]$wait.ElapsedMilliseconds))) { throw 'host-still-running' }
                if ($hostProcess -and $hostProcess.ExitCode -ne 0) { throw 'host-exit-failed' }
                $guard.OpenWizard()
            } finally { if ($hostProcess) { $hostProcess.Dispose() }; $parent.Dispose() }
        } else { throw 'invalid-mode' }
    } finally { $guard.Dispose() }
    exit 0
} catch {
    # Keep the verified installer/receipt for another explicit click. Do not
    # expose paths, raw native exceptions or credentials in public diagnostics.
    exit 1
}
