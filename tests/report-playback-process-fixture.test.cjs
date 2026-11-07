'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const helper = path.join(root, 'tests/helpers/report-playback-process-fixture.ps1');
function run(script, args) {
    return spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-File', script, ...args], {encoding: 'utf8', timeout: 15000, windowsHide: true});
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
for (const exit of [0, 2, 3]) test('test-only reporter launcher preserves arguments, synthetic query and exit code: ' + exit, t => {
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
if (@(Get-CimInstance Win32_Process -ErrorAction Stop).Count -ne 0) {throw 'UNEXPECTED_PROCESS_DATA'}
if ($UserNote -cne 'synthetic spaces "quotes" and $literal' -or $OutputRoot -cne [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../synthetic output with spaces')) -or -not $NoZip -or -not $EmptyUserNote) {throw 'ARGUMENTS_CHANGED'}
Write-Output 'SYNTHETIC_ENTRY_OK'
${exit === 0 ? '' : 'exit ' + exit}
`);
    const argsFile = path.join(fixture, 'arguments.json');
    fs.writeFileSync(argsFile, JSON.stringify(['-UserNote', 'synthetic spaces "quotes" and $literal', '-LogRoot', path.join(fixture, 'logs'), '-InstallRoot', path.join(fixture, 'install'), '-OutputRoot', path.join(fixture, 'synthetic output with spaces'), '-NoZip', '-EmptyUserNote']));
    const r = run(path.join(helpers, path.basename(helper)), ['-Mode', 'Reporter', '-ArgumentsFile', argsFile]);
    assert.equal(r.error, undefined); assert.equal(r.status, exit, r.stderr);
    assert.match(r.stdout, /SYNTHETIC_REPORTER_PROCESS_FIXTURE=EMPTY/); assert.match(r.stdout, /SYNTHETIC_ENTRY_OK/);
});
