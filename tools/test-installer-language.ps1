param(
    [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$Compiler = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = [IO.Path]::GetFullPath($RepoRoot)
$lockPath = Join-Path $RepoRoot 'tools/build-toolchains.lock.json'
$lock = Get-Content -LiteralPath $lockPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $Compiler) {
    $Compiler = Join-Path (Join-Path $RepoRoot ([string]$lock.inno.compilerRoot)) ([string]$lock.inno.compilerRelativePath)
}
$Compiler = [IO.Path]::GetFullPath($Compiler)
if (-not (Test-Path -LiteralPath $Compiler -PathType Leaf)) { throw 'Pinned Inno compiler is unavailable.' }
$toolchainJson = & node (Join-Path $RepoRoot 'tools/build-toolchains.cjs') inno $RepoRoot $Compiler
if ($LASTEXITCODE -ne 0) { throw 'Pinned Inno compiler identity check failed.' }
$null = $toolchainJson | ConvertFrom-Json

$fixtureSource = Join-Path (Split-Path -Parent $PSScriptRoot) 'tests/fixtures/installer-language-probe.iss'
$languageSource = Join-Path $RepoRoot 'installer/languages/ChineseSimplified.isl'
if (-not (Test-Path -LiteralPath $fixtureSource -PathType Leaf)) { throw 'Installer language probe fixture is missing.' }
if (-not (Test-Path -LiteralPath $languageSource -PathType Leaf)) { throw 'Simplified Chinese Inno language source is unavailable.' }

$workRoot = Join-Path $RepoRoot '.work'
if (-not (Test-Path -LiteralPath $workRoot -PathType Container)) { New-Item -ItemType Directory -Path $workRoot | Out-Null }
$runName = 'installer-language-probe-' + [guid]::NewGuid().ToString('N')
$runRoot = Join-Path $workRoot $runName
if (Test-Path -LiteralPath $runRoot) { throw 'Probe output already exists; no files were changed.' }
New-Item -ItemType Directory -Path $runRoot | Out-Null
$stageRoot = Join-Path $runRoot 'source'
$outputRoot = Join-Path $runRoot 'output'
New-Item -ItemType Directory -Path $stageRoot,$outputRoot | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stageRoot 'languages') | Out-Null
Copy-Item -LiteralPath $languageSource -Destination (Join-Path $stageRoot 'languages/ChineseSimplified.isl')

$script:AppGuid = [guid]::NewGuid().ToString().ToUpperInvariant()
$script:AppId = '{' + $script:AppGuid + '}'
$script:RegistryRelativePath = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\' + $script:AppId + '_is1'
$script:RegistryParentPath = 'Software\Microsoft\Windows\CurrentVersion\Uninstall'
$script:RegistryLeafName = $script:AppId + '_is1'
$script:OwnerValueName = 'ETE Installer Language Probe Owner'
$script:LanguageValueName = 'Inno Setup: Language'
$script:RegistryRoot = [Microsoft.Win32.RegistryKey]::OpenBaseKey(
    [Microsoft.Win32.RegistryHive]::CurrentUser, [Microsoft.Win32.RegistryView]::Registry64)

# Only the compiled probe copy receives a newly generated AppId. The template's
# all-zero GUID is never compiled or executed.
$sourceText = [IO.File]::ReadAllText($fixtureSource)
$sourceText = $sourceText.Replace('AppId={{00000000-0000-0000-0000-000000000000}', ('AppId={{' + $script:AppGuid + '}'))
if ($sourceText -notmatch ('AppId=\{\{' + [regex]::Escape($script:AppGuid) + '\}')) {
    throw 'Probe fixture AppId substitution failed.'
}
[IO.File]::WriteAllText((Join-Path $stageRoot 'installer-language-probe.iss'), $sourceText, (New-Object Text.UTF8Encoding($false)))

function Assert-AllowedRegistryTarget {
    $guidPattern = '^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$'
    if ($script:AppGuid -cnotmatch $guidPattern -or $script:AppId -cne ('{' + $script:AppGuid + '}')) {
        throw 'Synthetic AppId failed its ownership allowlist.'
    }
    $expected = $script:RegistryParentPath + '\' + $script:AppId + '_is1'
    if ($script:RegistryRelativePath -cne $expected -or
        $script:RegistryParentPath -cne 'Software\Microsoft\Windows\CurrentVersion\Uninstall') {
        throw 'Registry target failed its ownership allowlist.'
    }
}

function Get-ExistingSyntheticKey {
    Assert-AllowedRegistryTarget
    return $script:RegistryRoot.OpenSubKey($script:RegistryRelativePath, $false)
}

function Assert-NoSyntheticKey {
    Assert-AllowedRegistryTarget
    $key = Get-ExistingSyntheticKey
    if ($null -ne $key) {
        $key.Dispose()
        throw 'The random synthetic registry key already exists; refusing to use it.'
    }
}

function Assert-OwnedSyntheticKey {
    param([bool]$Writable = $false)
    Assert-AllowedRegistryTarget
    $key = $script:RegistryRoot.OpenSubKey($script:RegistryRelativePath, $Writable)
    if ($null -eq $key) { throw 'The owned synthetic registry key is missing.' }
    try {
        if ([string]$key.GetValue($script:OwnerValueName, '') -cne $script:AppGuid) {
            throw 'The synthetic registry ownership sentinel does not match.'
        }
        $allowedNames = @($script:OwnerValueName, $script:LanguageValueName)
        foreach ($name in $key.GetValueNames()) {
            if ($name -cnotin $allowedNames) { throw 'The synthetic registry key contains an unexpected value.' }
        }
        if (@($key.GetSubKeyNames()).Count -ne 0) { throw 'The synthetic registry key is not a leaf.' }
        return $key
    } catch {
        $key.Dispose()
        throw
    }
}

function Assert-PreviousLanguageValue {
    param([AllowNull()][string]$ExpectedValue)
    $key = Assert-OwnedSyntheticKey
    try {
        $actual = $key.GetValue($script:LanguageValueName, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
        if ($null -eq $ExpectedValue) {
            if ($null -ne $actual) { throw 'Unexpected synthetic previous-language value appeared.' }
        } elseif ([string]$actual -cne $ExpectedValue) {
            throw 'The synthetic previous-language value changed unexpectedly.'
        }
    } finally { $key.Dispose() }
}

function Set-PreviousLanguageValue {
    param([string]$Value)
    $key = Assert-OwnedSyntheticKey $true
    try {
        $key.SetValue($script:LanguageValueName, $Value, [Microsoft.Win32.RegistryValueKind]::String)
        $key.Flush()
    } finally { $key.Dispose() }
    Assert-PreviousLanguageValue $Value
}

function New-OwnedSyntheticKey {
    Assert-AllowedRegistryTarget
    $parent = $script:RegistryRoot.OpenSubKey($script:RegistryParentPath, $false)
    if ($null -eq $parent) { throw 'The standard HKCU uninstall-key parent is unavailable; refusing to create parent keys.' }
    $parent.Dispose()
    Assert-NoSyntheticKey
    $key = $script:RegistryRoot.CreateSubKey($script:RegistryRelativePath)
    if ($null -eq $key) { throw 'Unable to create the isolated synthetic registry key.' }
    try {
        if (@($key.GetValueNames()).Count -ne 0 -or @($key.GetSubKeyNames()).Count -ne 0) {
            throw 'The newly created synthetic key was not empty; refusing to claim it.'
        }
        $key.SetValue($script:OwnerValueName, $script:AppGuid, [Microsoft.Win32.RegistryValueKind]::String)
        $key.Flush()
    } finally { $key.Dispose() }
    $owned = Assert-OwnedSyntheticKey
    $owned.Dispose()
}

function Remove-OwnedSyntheticLeaf {
    Assert-AllowedRegistryTarget
    $key = Assert-OwnedSyntheticKey
    try {
        if (@($key.GetSubKeyNames()).Count -ne 0) { throw 'The owned synthetic key is not a leaf; refusing cleanup.' }
    } finally { $key.Dispose() }
    $parent = $script:RegistryRoot.OpenSubKey($script:RegistryParentPath, $true)
    if ($null -eq $parent) { throw 'The standard uninstall-key parent disappeared; refusing cleanup.' }
    try {
        # Recheck sentinel immediately before deleting only the exact owned leaf.
        $key = Assert-OwnedSyntheticKey
        $key.Dispose()
        $parent.DeleteSubKey($script:RegistryLeafName, $false)
        $parent.Flush()
    } finally { $parent.Dispose() }
    $remaining = Get-ExistingSyntheticKey
    if ($null -ne $remaining) {
        $remaining.Dispose()
        throw 'The owned synthetic leaf key remained after cleanup.'
    }
}

$script:ExpectedUiLanguage = ''
if (-not ('EteInstallerLanguageProbe.Native' -as [type])) {
    Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
namespace EteInstallerLanguageProbe {
    public static class Native {
        [DllImport("kernel32.dll")]
        public static extern ushort GetUserDefaultUILanguage();
    }
}
'@
}
$uiLanguageId = [int][EteInstallerLanguageProbe.Native]::GetUserDefaultUILanguage()
$primaryLanguageId = $uiLanguageId -band 0x03ff
if ($primaryLanguageId -eq 0x0004) {
    try {
        $uiCodePage = [Globalization.CultureInfo]::GetCultureInfo($uiLanguageId).TextInfo.ANSICodePage
        if ($uiCodePage -eq 936) { $script:ExpectedUiLanguage = 'chinesesimplified' }
    } catch { }
} elseif ($primaryLanguageId -eq 0x0009) {
    $script:ExpectedUiLanguage = 'english'
}
if (-not $script:ExpectedUiLanguage) { $script:ExpectedUiLanguage = 'english' }

$probeExe = Join-Path $outputRoot 'ete-installer-language-probe.exe'
& $Compiler '/Qp' ("/O" + $outputRoot) '/Fete-installer-language-probe' (Join-Path $stageRoot 'installer-language-probe.iss')
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $probeExe -PathType Leaf)) {
    throw 'Isolated language probe fixture compilation failed.'
}

function Invoke-LanguageProbe {
    param([string]$Label, [string]$LanguageParameter = '')

    $resultPath = Join-Path $runRoot ($Label + '.result.txt')
    $logPath = Join-Path $runRoot ($Label + '.log')
    if ((Test-Path -LiteralPath $resultPath) -or (Test-Path -LiteralPath $logPath)) {
        throw 'Probe evidence output already exists; refusing to overwrite it.'
    }
    Assert-AllowedRegistryTarget
    if ($script:OwnedKeyCreated) {
        $owned = Assert-OwnedSyntheticKey
        $owned.Dispose()
    } else {
        Assert-NoSyntheticKey
    }
    $previousResult = $env:ETE_LANGUAGE_PROBE_RESULT
    try {
        $env:ETE_LANGUAGE_PROBE_RESULT = $resultPath
        $arguments = @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', ('/LOG="' + $logPath + '"'))
        if ($LanguageParameter) { $arguments += ('/LANG=' + $LanguageParameter) }
        $process = Start-Process -FilePath $probeExe -ArgumentList $arguments -PassThru -WindowStyle Hidden
        if (-not $process.WaitForExit(15000)) {
            $process.Kill()
            $null = $process.WaitForExit(5000)
            throw 'Language probe exceeded its bounded 15 second run.'
        }
        if (-not (Test-Path -LiteralPath $resultPath -PathType Leaf)) {
            throw 'Language probe did not record its selection.'
        }
        return [IO.File]::ReadAllText($resultPath).Trim()
    } finally {
        if ($null -eq $previousResult) { Remove-Item Env:ETE_LANGUAGE_PROBE_RESULT -ErrorAction SilentlyContinue }
        else { $env:ETE_LANGUAGE_PROBE_RESULT = $previousResult }
    }
}

function Assert-SelectedLanguage {
    param([string]$Label, [string]$Expected, [string]$LanguageParameter = '')

    $selected = Invoke-LanguageProbe $Label $LanguageParameter
    if ($selected -cne $Expected) { throw ('Unexpected language selection for scenario: ' + $Label + '.') }
    Write-Output ('PASS: ' + $Label + ' selected ' + $selected + '.')
}

$script:OwnedKeyCreated = $false
$failure = $null
$script:ScenarioLabel = 'synthetic-record-setup'
try {
    Assert-AllowedRegistryTarget
    Assert-NoSyntheticKey
    $script:ScenarioLabel = 'no-previous-record'
    Assert-SelectedLanguage 'no-previous-record' $script:ExpectedUiLanguage
    Assert-NoSyntheticKey

    $script:OwnedKeyCreated = $true
    New-OwnedSyntheticKey

    $script:ScenarioLabel = 'legacy-default-fallback'
    Set-PreviousLanguageValue 'default'
    Assert-SelectedLanguage 'legacy-default-fallback' $script:ExpectedUiLanguage
    Assert-PreviousLanguageValue 'default'

    $script:ScenarioLabel = 'unknown-language-fallback'
    Set-PreviousLanguageValue 'future-language-name'
    Assert-SelectedLanguage 'unknown-language-fallback' $script:ExpectedUiLanguage
    Assert-PreviousLanguageValue 'future-language-name'

    $script:ScenarioLabel = 'saved-english-preference'
    Set-PreviousLanguageValue 'english'
    Assert-SelectedLanguage 'saved-english-preference' 'english'
    Assert-PreviousLanguageValue 'english'

    $script:ScenarioLabel = 'saved-chinese-preference'
    Set-PreviousLanguageValue 'chinesesimplified'
    Assert-SelectedLanguage 'saved-chinese-preference' 'chinesesimplified'
    Assert-PreviousLanguageValue 'chinesesimplified'

    $script:ScenarioLabel = 'explicit-english-overrides-saved-chinese'
    Set-PreviousLanguageValue 'chinesesimplified'
    Assert-SelectedLanguage 'explicit-english-overrides-saved-chinese' 'english' 'english'
    Assert-PreviousLanguageValue 'chinesesimplified'

    $script:ScenarioLabel = 'explicit-chinese-overrides-saved-english'
    Set-PreviousLanguageValue 'english'
    Assert-SelectedLanguage 'explicit-chinese-overrides-saved-english' 'chinesesimplified' 'chinesesimplified'
    Assert-PreviousLanguageValue 'english'
} catch {
    $failure = $script:ScenarioLabel
} finally {
    if ($script:OwnedKeyCreated) {
        try { Remove-OwnedSyntheticLeaf }
        catch { if (-not $failure) { $failure = 'Owned synthetic registry leaf cleanup could not be verified.' } }
    }
}

$script:RegistryRoot.Dispose()
if ($failure) {
    [Console]::Error.WriteLine('Installer language probe failed at scenario: ' + $failure + '.')
    [Console]::Error.WriteLine('Evidence retained under .work/' + $runName)
    exit 1
}
Write-Output ('Windows UI-language fallback expected: ' + $script:ExpectedUiLanguage + '.')
Write-Output ('Evidence retained under .work/' + $runName)
