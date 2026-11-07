'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {spawnSync} = require('node:child_process');
const {powerShell7, windowsIntegrationSkip} = require('./helpers/test-platform.cjs');
const root = path.resolve(__dirname, '..');
const helper = path.join(root, 'tests/helpers/report-playback-process-fixture.ps1');
function run(script, args, shell = powerShell7()) {
    // Match the existing PS5.1 black-box launcher; no system policy is changed.
    const policy = path.basename(shell).toLowerCase() === 'powershell.exe' ? ['-ExecutionPolicy', 'Bypass'] : [];
    return spawnSync(shell, ['-NoProfile', '-NonInteractive', ...policy, '-File', script, ...args], {encoding: 'utf8', timeout: 15000, windowsHide: true});
}
const empty = {status: 'OK', embyHostRunning: false, electronCount: 0, nativeHelperCount: 0,
    unownedNativeHelperCount: 0, residualStatus: 'NONE_OBSERVED', appWindowState: 'UNAVAILABLE', nativeHelperEvents: []};
const cases = [
    ['Empty', 0, empty],
    ['Unrelated', 1, empty],
    ['Running', 8, {...empty, embyHostRunning: true, electronCount: 2, nativeHelperCount: 2, residualStatus: 'APP_RUNNING'}],
    ['Orphan', 2, {...empty, unownedNativeHelperCount: 1, residualStatus: 'HELPER_WITHOUT_APP'}],
    ['Unowned', 3, {...empty, embyHostRunning: true, nativeHelperCount: 1, unownedNativeHelperCount: 1, residualStatus: 'UNOWNED_HELPER_OBSERVED'}],
    ['Unavailable', 0, {status: 'UNAVAILABLE', embyHostRunning: 'UNAVAILABLE', electronCount: 'UNAVAILABLE',
        nativeHelperCount: 'UNAVAILABLE', residualStatus: 'UNAVAILABLE', appWindowState: 'UNAVAILABLE', nativeHelperEvents: []}]
];
for (const [name, rawCount, safe] of cases) test('real reporter inventory has a strict synthetic process oracle: ' + name, () => {
    const r = run(helper, ['-Case', name]); assert.equal(r.error, undefined); assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), {fixture: 'SYNTHETIC_PROCESS_INVENTORY', case: name, queryCount: 1, rawCount, safe,
        warnings: name === 'Unavailable' ? ['process_inventory_unavailable'] : []});
    assert.doesNotMatch(r.stdout, /commandline|executablepath|Emby\.Theater\.exe|synthetic-intermediate|https:|token/i);
});
const shells = [
    {name: 'PowerShell7', executable: powerShell7(), skip: false},
    {name: 'WindowsPowerShell51', executable: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'),
        skip: windowsIntegrationSkip('Requires actual Windows PowerShell 5.1 launcher; PS7 is not a substitute.')}
];
function launcherFixture(t, exit = 0, expectedMajor = 7) {
    const fixture = path.join(os.tmpdir(), 'ete-issue-snapshot-' + randomUUID().replaceAll('-', ''));
    fs.mkdirSync(fixture); fs.writeFileSync(path.join(fixture, '.synthetic-reporter-fixture'), 'SYNTHETIC_REPORTER_FIXTURE');
    t.after(() => fs.rmSync(fixture, {recursive: true, force: true}));
    const helpers = path.join(fixture, 'tests/helpers'), tools = path.join(fixture, 'tools');
    fs.mkdirSync(helpers, {recursive: true}); fs.mkdirSync(tools);
    fs.copyFileSync(helper, path.join(helpers, path.basename(helper)));
    // A synthetic entry tests the launcher itself. It is not a replacement
    // for the Windows black-box test of the actual reporter/collector.
    fs.writeFileSync(path.join(tools, 'report-playback-issue.ps1'), String.raw`
param([string]$UserNote, [string]$LogRoot, [string]$InstallRoot, [string]$OutputRoot, [switch]$NoZip, [switch]$EmptyUserNote)
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ne ${expectedMajor} -or (${expectedMajor} -eq 5 -and $PSVersionTable.PSVersion.Minor -ne 1)) {throw 'TEST_SHELL_VERSION_MISMATCH'}
if (@(Get-CimInstance Win32_Process -ErrorAction Stop).Count -ne 0) {throw 'UNEXPECTED_PROCESS_DATA'}
if ($UserNote -cne 'synthetic spaces "quotes" and $literal' -or $OutputRoot -cne [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../synthetic output with spaces')) -or -not $NoZip -or -not $EmptyUserNote) {throw 'ARGUMENTS_CHANGED'}
Write-Output 'SYNTHETIC_ENTRY_OK'
${exit === 0 ? '' : 'exit ' + exit}
`);
    const argsFile = path.join(fixture, 'arguments.json');
    const args = ['-UserNote', 'synthetic spaces "quotes" and $literal', '-LogRoot', path.join(fixture, 'logs'), '-InstallRoot', path.join(fixture, 'install'), '-OutputRoot', path.join(fixture, 'synthetic output with spaces'), '-NoZip', '-EmptyUserNote'];
    fs.writeFileSync(argsFile, JSON.stringify(args));
    return {argsFile, args, helper: path.join(helpers, path.basename(helper))};
}
for (const shell of shells) for (const exit of [0, 2, 3]) test(shell.name + ' launcher preserves root string array, arguments, query and exit code: ' + exit, {skip: shell.skip}, t => {
    const f = launcherFixture(t, exit, shell.name === 'WindowsPowerShell51' ? 5 : 7);
    const r = run(f.helper, ['-Mode', 'Reporter', '-ArgumentsFile', f.argsFile], shell.executable);
    assert.equal(r.error, undefined); assert.equal(r.status, exit, r.stderr);
    assert.match(r.stdout, /SYNTHETIC_REPORTER_PROCESS_FIXTURE=EMPTY/); assert.match(r.stdout, /SYNTHETIC_ENTRY_OK/);
});
const invalid = [
    ['root string', () => JSON.stringify('-NoZip')],
    ['root object', () => JSON.stringify({argument: '-NoZip'})],
    ['root null', () => 'null'],
    ['array null', () => '[null]'],
    ['array number', () => '[123]'],
    ['array boolean', () => '[false]'],
    ['nested complete argument array', args => JSON.stringify([args])],
    ['mixed nested argument array', args => JSON.stringify(['-NoZip', args])],
    ['malformed JSON', () => '["-NoZip",'],
    ['multiple root values', () => '[] []']
];
for (const shell of shells) for (const [name, input] of invalid) test(shell.name + ' launcher rejects before entry without flattening: ' + name, {skip: shell.skip}, t => {
    const f = launcherFixture(t, 0, shell.name === 'WindowsPowerShell51' ? 5 : 7);
    fs.writeFileSync(f.argsFile, input(f.args));
    const r = run(f.helper, ['-Mode', 'Reporter', '-ArgumentsFile', f.argsFile], shell.executable);
    assert.equal(r.error, undefined); assert.equal(r.status, 1);
    assert.match(r.stderr, /INVALID_REPORTER_FIXTURE_ARGUMENT/);
    assert.doesNotMatch(r.stdout, /SYNTHETIC_REPORTER_PROCESS_FIXTURE=EMPTY|SYNTHETIC_ENTRY_OK/);
});
