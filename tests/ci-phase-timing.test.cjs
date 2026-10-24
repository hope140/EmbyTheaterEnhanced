'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const cp = require('node:child_process');
const {summarize} = require('../tools/ci-test-timing-summary.cjs');
const {analyze} = require('../tools/ci-build-timing-report.cjs');

test('phase timing preserves captured values and failure propagation', () => {
    const script = [
        "$ErrorActionPreference='Stop'; Set-StrictMode -Version Latest",
        '. $env:ETE_PHASE_HELPER',
        '$captured = & {',
        "$phase=Start-CIPhase 'fixture.success';$passed=$false",
        'try { Write-Output \'{"value":7}\';$passed=$true }',
        'finally { Complete-CIPhase $phase $passed }',
        '}',
        'if (@($captured).Count -ne 1 -or ($captured|ConvertFrom-Json).value -ne 7) { throw \'Captured JSON changed\' }',
        'try {',
        "$phase=Start-CIPhase 'fixture.failure';$passed=$false",
        "try { throw 'original failure' } finally { Complete-CIPhase $phase $passed }",
        "} catch { if ($_.Exception.Message -cne 'original failure') { throw };Write-Output 'FAILURE_PRESERVED' }",
        '$global:LASTEXITCODE=23',
        'Write-CITestTiming $env:ETE_TIMING_TOOL "missing-diagnostic-log"',
        'if ($global:LASTEXITCODE -ne 23) { throw "Diagnostic replaced native exit code" }'
    ].join('\n');
    const result = cp.spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', script], {
        encoding: 'utf8', env: {...process.env, ETE_PHASE_HELPER: path.resolve(__dirname, '../tools/ci-phase-timing.ps1'),
            ETE_TIMING_TOOL: path.resolve(__dirname, '../tools/ci-test-timing-summary.cjs')}
    });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    const rows = result.stdout.split(/\r?\n/).filter(s => s.startsWith('CI_PHASE ')).map(s => JSON.parse(s.slice(9)));
    assert.equal(rows.length, 4);
    for (let i = 0; i < 4; i += 2) {
        assert.equal(rows[i].event, 'start');assert.equal(rows[i + 1].event, 'end');
        assert.equal(rows[i].id, rows[i + 1].id);assert.ok(rows[i + 1].elapsedMs >= 0);
    }
    assert.equal(rows[1].status, 'passed');assert.equal(rows[3].status, 'failed');
    assert.match(result.stdout, /FAILURE_PRESERVED/);
});

test('TAP timing summary counts only top-level internal durations and requires unique complete totals', () => {
    const tap = '# Subtest: parent\n    # Subtest: child\n    ok 1 - child\n      ---\n      duration_ms: 50\n      ...\nok 1 - parent\n  ---\n  duration_ms: 70\n  ...\n# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 90\n';
    const result = summarize(tap);
    assert.deepEqual(result.hotspots, [{name: 'parent', durationMs: 70}]);
    assert.equal(result.topLevelCases, 1);assert.equal(result.totals.tests, 2);
    assert.throws(() => summarize(tap + '# tests 2\n'), /Duplicate/);
    assert.throws(() => summarize(tap.replace('# fail 0\n', '')), /Incomplete/);
});

test('offline Actions timing separates queue from execution and binds phase identities', () => {
    const run = {id: 1, head_sha: 'a'.repeat(40), created_at: '2026-10-24T00:00:00Z'};
    const job = {id: 2, run_id: 1, head_sha: run.head_sha, started_at: '2026-10-24T00:00:02Z', completed_at: '2026-10-24T00:00:07Z'};
    const begin = {schemaVersion: 1, id: 'b'.repeat(32), phase: 'inputs.prepare', event: 'start',
        sourceCommit: run.head_sha, utc: '2026-10-24T00:00:03Z'};
    const end = {schemaVersion: 1, id: begin.id, phase: begin.phase, event: 'end',
        utc: '2026-10-24T00:00:04Z', elapsedMs: 999.9, status: 'passed'};
    const line = r => '2026-10-24T00:00:04Z CI_PHASE ' + JSON.stringify(r);
    const result = analyze(run, job, [line(begin), line(end)].join('\n'));
    assert.equal(result.waitingMs, 2000);assert.equal(result.executionMs, 5000);
    assert.equal(result.phases[0].elapsedMs, 999.9);assert.deepEqual(result.incompletePhases, []);
    assert.equal(analyze(run, job, line(begin)).incompletePhases.length, 1);
    assert.throws(() => analyze(run, {...job, head_sha: 'c'.repeat(40)}, ''), /identity mismatch/);
    assert.throws(() => analyze(run, job, line(end)), /completion/);
    assert.throws(() => analyze(run, job, [line(begin), line(begin)].join('\n')), /Duplicate/);
    assert.throws(() => analyze(run, job, line({...begin, runId: '3'})), /Phase run mismatch/);
});
