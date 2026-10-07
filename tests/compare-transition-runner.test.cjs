'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const test = require('node:test');

const runnerPath = path.join(__dirname, '../tools/compare-transition.ps1');
const runnerSource = fs.readFileSync(runnerPath, 'utf8');

function psLiteral(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
}

function invokePowerShell(command) {
    return spawnSync('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command
    ], {encoding: 'utf8', timeout: 15000});
}

test('runner source is ASCII and parses under Windows PowerShell 5.1 grammar', function (t) {
    if (process.platform !== 'win32') return t.skip('Windows PowerShell parser is only available on Windows.');
    assert.equal([...fs.readFileSync(runnerPath)].some(byte => byte > 0x7f), false, 'runner stays ASCII-only');
    const parse = [
        '$tokens = $null; $errors = $null;',
        '[System.Management.Automation.Language.Parser]::ParseFile(', psLiteral(runnerPath), ', [ref]$tokens, [ref]$errors) | Out-Null;',
        'if ($errors.Count -gt 0) { $errors | ForEach-Object { Write-Error $_.Message }; exit 1 }; exit 0'
    ].join('');
    const result = invokePowerShell(parse);
    assert.equal(result.error, undefined, result.error && result.error.message);
    assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('invalid relative runtime root is rejected before evidence creation or Electron launch', function (t) {
    if (process.platform !== 'win32') return t.skip('Runner uses Windows PowerShell and Electron paths.');
    const label = `preflight-${process.pid}-${Date.now().toString(36)}`;
    const evidenceRoot = path.join(path.dirname(path.dirname(runnerPath)), '.work');
    const before = fs.existsSync(evidenceRoot)
        ? new Set(fs.readdirSync(evidenceRoot).filter(name => name.startsWith(`transition-compare-${label}-`)))
        : new Set();
    const command = `& ${psLiteral(runnerPath)} -RuntimeRoot ${psLiteral('relative-runtime')} -ExpectedSourceCommit ${psLiteral('a'.repeat(40))} -Label ${psLiteral(label)}`;

    const result = invokePowerShell(command);
    assert.equal(result.error, undefined, result.error && result.error.message);
    assert.notEqual(result.status, 0, 'unsafe path must fail preflight');
    const after = fs.existsSync(evidenceRoot)
        ? fs.readdirSync(evidenceRoot).filter(name => name.startsWith(`transition-compare-${label}-`))
        : [];
    assert.deepEqual(after, Array.from(before), 'rejected input must not create an evidence directory');
    assert.doesNotMatch(result.stdout || '', /"status":"passed"/);
});

test('runner binds runtime identity before creating evidence and requires safe parameter contracts', function () {
    assert.match(runnerSource, /\$repoRoot = Split-Path -Parent \$PSScriptRoot/);
    assert.match(runnerSource, /\[ValidatePattern\('\^\[0-9a-fA-F\]\{40\}\$'\)\]/);
    assert.match(runnerSource, /\[ValidatePattern\('\^\[A-Za-z0-9\]\[A-Za-z0-9\._-\]\{0,47\}\$'\)\]/);
    assert.match(runnerSource, /\[ValidateRange\(0, 500\)\]/);
    assert.match(runnerSource, /\[switch\]\$RetainSurfaceStopProbe/);
    assert.match(runnerSource, /function Assert-RuntimeReady/);
    assert.match(runnerSource, /build\.sourceCommit -ine \$sourceCommit/);
    assert.match(runnerSource, /runtimeProv\.sourceCommit -ine \$sourceCommit/);
    assert.match(runnerSource, /Get-FileHash -LiteralPath/);
    assert.ok(runnerSource.indexOf('$identity = Assert-RuntimeReady') < runnerSource.indexOf('New-Item -ItemType Directory -Path $profileRoot'));
    assert.ok(runnerSource.indexOf('New-Item -ItemType Directory -Path $profileRoot') < runnerSource.indexOf('$startCandidate.Start()'));
});

test('runner uses isolated local-only inputs and does not copy or overwrite the historical runtime', function () {
    assert.match(runnerSource, /ETE_TEST_TRANSITION_TIMELINE/);
    assert.match(runnerSource, /ETE_TEST_TRANSITION_COMPARE/);
    assert.match(runnerSource, /ETE_TEST_TRANSITION_FULLSCREEN/);
    assert.match(runnerSource, /ETE_TEST_TRANSITION_RETAIN_SURFACE/);
    assert.match(runnerSource, /experimentalPresentation = \[bool\]\$RetainSurfaceStopProbe/);
    assert.match(runnerSource, /ETE_TEST_ARTWORK_DELAY_MS/);
    assert.match(runnerSource, /ETE_TEST_MEDIA_A/);
    assert.match(runnerSource, /ETE_TEST_MEDIA_B/);
    assert.match(runnerSource, /APPDATA/);
    assert.match(runnerSource, /MPV_HOME/);
    assert.match(runnerSource, /NO_PROXY.*127\.0\.0\.1,localhost/);
    assert.match(runnerSource, /StartsWith\('ETE_CD2_'/);
    assert.match(runnerSource, /StartsWith\('ETE_DIRECT'/);
    assert.doesNotMatch(runnerSource, /Copy-Item|Move-Item|Remove-Item|Set-Content.*RuntimeRoot/i);
    assert.doesNotMatch(runnerSource, /Stop-Process|taskkill\.exe/i);
});

test('process cleanup is scoped by exact root PID, ancestry, executable path, and creation identity', function () {
    assert.match(runnerSource, /Get-CimInstance -ClassName Win32_Process/);
    assert.match(runnerSource, /ParentProcessId/);
    assert.match(runnerSource, /CreationDate/);
    assert.match(runnerSource, /ExecutablePath/);
    assert.match(runnerSource, /rootProcessId/);
    assert.match(runnerSource, /Get-ProcessIdentityReason/);
    assert.match(runnerSource, /Test-ProcessCreationTime/);
    assert.match(runnerSource, /function Get-CreationIdentity/);
    assert.match(runnerSource, /function Test-StartTimeIdentity/);
    assert.match(runnerSource, /return 'executable-path-unavailable'/);
    assert.match(runnerSource, /StartTime\.ToUniversalTime\(\)\.Ticks/);
    assert.doesNotMatch(runnerSource, /ManagementDateTimeConverter\]::ToDateTime\(\[string\]\$Record\.CreationDate\)/);
    assert.match(runnerSource, /AddSeconds\(50\)/);
    assert.match(runnerSource, /\$target\.Kill\(\)/);
    assert.match(runnerSource, /StandardOutput\.ReadToEndAsync\(\)/);
    assert.match(runnerSource, /StandardError\.ReadToEndAsync\(\)/);
    assert.doesNotMatch(runnerSource, /DataReceivedEventHandler|BeginOutputDataLine|BeginErrorDataLine/);
    assert.doesNotMatch(runnerSource, /Get-Process\s+-Name|Stop-Process|taskkill\.exe/i);
    assert.match(runnerSource, /identityReasons = \$Cleanup\.identityReasons/);
});

test('process identity classifier distinguishes path-unavailable from real PID-reuse signals', function (t) {
    if (process.platform !== 'win32') return t.skip('Windows PowerShell parser is only available on Windows.');
    const command = [
        '$tokens=$null;$errors=$null;',
        '$ast=[System.Management.Automation.Language.Parser]::ParseFile(', psLiteral(runnerPath), ',[ref]$tokens,[ref]$errors);',
        'if($errors.Count){exit 2};',
        'foreach($name in @("Get-CreationIdentity","Get-ProcessIdentityReason","Test-StartTimeIdentity")) {',
        '$fn=$ast.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name},$true);',
        'if(-not $fn){exit 3};Invoke-Expression $fn.Extent.Text};',
        '$created=[DateTime]::UtcNow;$identity=Get-CreationIdentity $created;',
        '$expected=[pscustomobject]@{CreationIdentity=$identity;ParentProcessId=50;ExecutablePath="C:\\runtime\\electron.exe"};',
        '$missing=[pscustomobject]@{CreationDate=$created;ParentProcessId=50;ExecutablePath=$null};',
        '$wrongPath=[pscustomobject]@{CreationDate=$created;ParentProcessId=50;ExecutablePath="C:\\other\\electron.exe"};',
        '$wrongParent=[pscustomobject]@{CreationDate=$created;ParentProcessId=51;ExecutablePath="C:\\runtime\\electron.exe"};',
        '$wrongCreation=[pscustomobject]@{CreationDate=$created.AddSeconds(2);ParentProcessId=50;ExecutablePath="C:\\runtime\\electron.exe"};',
        '$nearTicks=([long]$identity)+2;$farTicks=([long]$identity)+1000000;',
        '[pscustomobject]@{pathUnavailable=(Get-ProcessIdentityReason $missing $expected);',
        'pathMismatch=(Get-ProcessIdentityReason $wrongPath $expected);',
        'parentMismatch=(Get-ProcessIdentityReason $wrongParent $expected);',
        'creationMismatch=(Get-ProcessIdentityReason $wrongCreation $expected);',
        'rootStartPrecisionAccepted=(Test-StartTimeIdentity $nearTicks $identity);',
        'rootStartReuseRejected=(Test-StartTimeIdentity $farTicks $identity)} | ConvertTo-Json -Compress'
    ].join('');
    const result = invokePowerShell(command);
    assert.equal(result.error, undefined, result.error && result.error.message);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const actual = JSON.parse(result.stdout.trim().split(/\r?\n/).slice(-1)[0]);
    assert.deepEqual(actual, {
        pathUnavailable: 'executable-path-unavailable',
        pathMismatch: 'executable-path-mismatch',
        parentMismatch: 'parent-process-id-mismatch',
        creationMismatch: 'creation-identity-mismatch',
        rootStartPrecisionAccepted: true,
        rootStartReuseRejected: false
    });
});

test('summary excludes raw frame sample arrays and emits only compact capture statistics', function () {
    assert.match(runnerSource, /function New-CompactSummary/);
    assert.match(runnerSource, /sampleCount = \$capture\.sampleCount/);
    assert.match(runnerSource, /uniqueHashes = \$capture\.uniqueHashes/);
    assert.match(runnerSource, /maxIntervalMs = \$capture\.maxIntervalMs/);
    assert.doesNotMatch(runnerSource, /samples\s*=\s*\$capture\.samples/);
    assert.match(runnerSource, /evidence = \$Evidence/);
});

test('summary binds the five transition harness files by relative path and SHA256', function () {
    for (const relativePath of [
        'tools/smoke-electron.cjs',
        'tests/pipeline-browser.js',
        'tests/transition-timeline-browser.js',
        'tools/transition-stream-capture.cjs',
        'tools/make-transition-fixtures.cjs'
    ]) {
        assert.ok(runnerSource.includes(`'${relativePath}'`), `runner identifies ${relativePath}`);
    }
    assert.match(runnerSource, /function Get-HarnessSha256/);
    assert.match(runnerSource, /runnerSha256 = \$Identity\.RunnerSha256/);
    assert.match(runnerSource, /harnessFiles = @\(\$Identity\.HarnessFiles\)/);
    assert.match(runnerSource, /harness-changed-during-run/);
});
