# Test-only synthetic process boundary. Never packaged with the reporter.
[CmdletBinding()]
param(
    [ValidateSet('Inventory', 'Reporter')][string]$Mode = 'Inventory',
    [ValidateSet('Empty', 'Running', 'Unrelated', 'Orphan', 'Unowned', 'Unavailable')][string]$Case = 'Empty',
    [string]$ArgumentsFile
)
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$reporterPath = Join-Path $PSScriptRoot '../../tools/report-playback-issue.ps1'
$script:Warnings = New-Object 'System.Collections.Generic.List[string]'
function New-SyntheticProcess {
    param([string]$Name, [int]$ProcessId, [int]$ParentProcessId)
    $row = [pscustomobject]@{Name=$Name; ProcessId=$ProcessId; ParentProcessId=$ParentProcessId}
    # Inventory needs names and relationships only. Detect accidental reads.
    $row | Add-Member ScriptProperty CommandLine { throw 'FIXTURE_COMMAND_LINE_READ' }
    $row | Add-Member ScriptProperty ExecutablePath { throw 'FIXTURE_EXECUTABLE_PATH_READ' }
    return $row
}
$script:Rows = @()
switch ($Case) {
    'Running' {
        # Deliberately not in parent-first order; include a second root and
        # unrelated Electron so a global-name count cannot pass.
        $script:Rows = @(
            (New-SyntheticProcess 'ete-mpv-helper.exe' 13 12),
            (New-SyntheticProcess 'electron.exe' 12 11),
            (New-SyntheticProcess 'synthetic-intermediate.exe' 11 10),
            (New-SyntheticProcess 'Emby.Theater.exe' 10 0),
            (New-SyntheticProcess 'electron.exe' 99 0),
            (New-SyntheticProcess 'Emby.Theater.exe' 20 0),
            (New-SyntheticProcess 'electron.exe' 21 20),
            (New-SyntheticProcess 'ete-mpv-helper.exe' 22 20)
        )
    }
    'Unrelated' {$script:Rows = @((New-SyntheticProcess 'electron.exe' 99 0))}
    'Orphan' {$script:Rows = @((New-SyntheticProcess 'ete-mpv-helper.exe' 70 71), (New-SyntheticProcess 'electron.exe' 71 0))}
    'Unowned' {$script:Rows = @((New-SyntheticProcess 'Emby.Theater.exe' 10 0),
        (New-SyntheticProcess 'ete-mpv-helper.exe' 13 10), (New-SyntheticProcess 'ete-mpv-helper.exe' 99 0))}
}
$fixtureState = [pscustomobject]@{Rows=$script:Rows; Case=$Case; QueryCount=0}
$query = {
    [CmdletBinding()]
    param([Parameter(Position=0)][string]$ClassName)
    if ($ClassName -ne 'Win32_Process') {throw 'UNEXPECTED_FIXTURE_QUERY'}
    $fixtureState.QueryCount++
    if ($fixtureState.Case -eq 'Unavailable') {throw 'SYNTHETIC_INVENTORY_UNAVAILABLE'}
    return $fixtureState.Rows
}.GetNewClosure()
Set-Item -Path function:Get-CimInstance -Value $query
if ($Mode -eq 'Reporter') {
    if ($Case -ne 'Empty' -or -not $ArgumentsFile) {throw 'INVALID_REPORTER_FIXTURE'}
    $reporterArguments = @(ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($ArgumentsFile)))
    foreach ($argument in $reporterArguments) {if ($argument -isnot [string]) {throw 'INVALID_REPORTER_FIXTURE_ARGUMENT'}}
    $parameters = @{}
    $switches = @('NoZip', 'SkipWindowsEvents', 'EmptyUserNote')
    $values = @('OutputRoot', 'LogRoot', 'InstallRoot', 'IssueType', 'CaptureTime', 'MaxLogLines', 'UserNote', 'TestCollectorPath')
    for ($index = 0; $index -lt $reporterArguments.Count; $index++) {
        $key = $reporterArguments[$index]
        if ($key -notmatch '^-[A-Za-z]+$') {throw 'INVALID_REPORTER_FIXTURE_ARGUMENT'}
        $key = $key.Substring(1)
        if ($parameters.ContainsKey($key)) {throw 'DUPLICATE_REPORTER_FIXTURE_ARGUMENT'}
        if ($switches -contains $key) {$parameters[$key] = $true}
        elseif ($values -contains $key -and $index + 1 -lt $reporterArguments.Count) {$parameters[$key] = $reporterArguments[++$index]}
        else {throw 'INVALID_REPORTER_FIXTURE_ARGUMENT'}
    }
    # This launcher accepts only the self-test's marked synthetic tree, not
    # real install/log locations or a general user diagnostic invocation.
    $fixtureRoot = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($ArgumentsFile))
    $marker = Join-Path $fixtureRoot '.synthetic-reporter-fixture'
    if ((Split-Path -Leaf $fixtureRoot) -notmatch '^ete-issue-snapshot-[0-9a-f]{32}$' -or
        -not (Test-Path -LiteralPath $marker -PathType Leaf) -or
        [IO.File]::ReadAllText($marker) -cne 'SYNTHETIC_REPORTER_FIXTURE') {throw 'INVALID_SYNTHETIC_REPORTER_ROOT'}
    foreach ($name in @('LogRoot', 'InstallRoot')) {
        $leaf = if ($name -eq 'LogRoot') {'logs'} else {'install'}
        if (-not $parameters.ContainsKey($name) -or @((Join-Path $fixtureRoot $leaf), (Join-Path (Join-Path $fixtureRoot 'missing') $leaf)) -notcontains [IO.Path]::GetFullPath($parameters[$name])) {throw 'NON_SYNTHETIC_REPORTER_INPUT'}
    }
    foreach ($name in @('OutputRoot', 'TestCollectorPath')) {
        if ($parameters.ContainsKey($name)) {
            $full = [IO.Path]::GetFullPath($parameters[$name])
            if (-not $full.StartsWith($fixtureRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {throw 'NON_SYNTHETIC_REPORTER_OUTPUT'}
        } elseif ($name -eq 'OutputRoot') {throw 'MISSING_SYNTHETIC_REPORTER_OUTPUT'}
    }
    Write-Output 'SYNTHETIC_REPORTER_PROCESS_FIXTURE=EMPTY'
    $global:LASTEXITCODE = 0
    & $reporterPath @parameters
    $reporterExit = $LASTEXITCODE
    if ($fixtureState.QueryCount -ne 1) {throw 'UNEXPECTED_REPORTER_QUERY_COUNT'}
    exit $reporterExit
}
if ($ArgumentsFile) {throw 'INVALID_INVENTORY_FIXTURE_ARGUMENT'}
# Load just the real inventory and warning functions, not the reporter entry,
# collector, log reader or any real process/network API.
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($reporterPath, [ref]$tokens, [ref]$errors)
if (@($errors).Count) {throw 'FIXTURE_REPORTER_PARSE_FAILED'}
foreach ($name in @('Add-SnapshotWarning', 'Get-IssueProcessInventory')) {
    $functions = @($ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name}, $true))
    if ($functions.Count -ne 1) {throw 'FIXTURE_FUNCTION_BOUNDARY_INVALID'}
    . ([scriptblock]::Create($functions[0].Extent.Text))
}
$inventory = Get-IssueProcessInventory
[ordered]@{fixture='SYNTHETIC_PROCESS_INVENTORY'; case=$Case; queryCount=$fixtureState.QueryCount;
    rawCount=@($inventory.raw).Count; safe=$inventory.safe; warnings=@($script:Warnings)} | ConvertTo-Json -Depth 8 -Compress
