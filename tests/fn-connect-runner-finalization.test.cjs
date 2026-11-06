'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const {finalize, normalize, stages, checks, expectedVersion, expectedHash} = require('../prototypes/fn-connect/client/smoke-report.cjs');
const meta = {runId: 'a'.repeat(32), sourceCommit: 'b'.repeat(40), archiveHash: expectedHash,
    launchState: 'COMPLETED', exitCode: 0, processExited: true, profileCleanupVerified: true, elapsedMs: 1234};
function evidence() {
    return [{kind: 'binding', runId: meta.runId, sourceCommit: meta.sourceCommit}, {kind: 'runtime', electronVersion: expectedVersion},
        ...stages.map(stage => ({kind: 'stage', stage})), {kind: 'result', test: 'electron-synthetic-session', result: 'PASSED', profileCleanupOwner: 'runner',
            checks: {...Object.fromEntries(checks.map(key => [key, true])), realFNConnect: 'NOT_TESTED', nativeHelperPlayback: 'NOT_TESTED', hlsDash: 'NOT_SUPPORTED'}}];
}
const raw = value => value.map(event => 'ETE_FN_FIXTURE ' + JSON.stringify(event)).join('\n');
function fixture(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-fn-finalization-'));
    t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
    const files = {resultPath: path.join(dir, 'result.json'), statusPath: path.join(dir, 'runner-status.json')};
    fs.writeFileSync(files.statusPath, JSON.stringify({schemaVersion: 1, runId: meta.runId, sourceCommit: meta.sourceCommit, stage: 'ELECTRON_START', terminal: false}));
    return {...files, dir, result: () => JSON.parse(fs.readFileSync(files.resultPath)), status: () => JSON.parse(fs.readFileSync(files.statusPath))};
}
test('complete evidence finalizes both receipts with the same run/source owner', t => {
    const f = fixture(t), outcome = finalize(raw(evidence()), meta, f);
    assert.equal(outcome.passed, true);
    for (const value of [f.result(), f.status()]) { assert.equal(value.runId, meta.runId); assert.equal(value.sourceCommit, meta.sourceCommit); assert.equal(value.bindingVerified, true); }
    assert.equal(f.status().terminal, true); assert.equal(f.status().stage, 'FINISHED'); assert.equal(f.status().result, 'PASSED'); assert.equal(f.status().receiptWritten, true);
});
for (const reason of ['TIMEOUT', 'PROCESS_EXIT_UNCONFIRMED']) test('runtime failure also finalizes status: ' + reason, t => {
    const f = fixture(t), outcome = finalize('', {...meta, launchState: reason, processExited: reason !== 'PROCESS_EXIT_UNCONFIRMED'}, f);
    assert.equal(outcome.passed, false); assert.equal(f.result().result, 'FAILED'); assert.equal(f.status().terminal, true); assert.equal(f.status().reason, reason);
});
for (const field of ['runId', 'sourceCommit']) test('foreign status owner is never overwritten: ' + field, t => {
    const f = fixture(t), value = f.status(); value[field] = 'c'.repeat(field === 'runId' ? 32 : 40); fs.writeFileSync(f.statusPath, JSON.stringify(value));
    const before = fs.readFileSync(f.statusPath);
    assert.equal(finalize(raw(evidence()), meta, f).passed, false);
    assert.deepEqual(fs.readFileSync(f.statusPath), before); assert.equal(fs.existsSync(f.resultPath), false);
});
for (const change of ['missing', 'duplicate', 'round', 'source']) test('a missing or mismatched Electron binding cannot pass: ' + change, () => {
    const events = evidence();
    if (change === 'missing') events.shift();
    if (change === 'duplicate') events.push(events[0]);
    if (change === 'round') events[0].runId = 'c'.repeat(32);
    if (change === 'source') events[0].sourceCommit = 'c'.repeat(40);
    const result = normalize(raw(events), meta); assert.equal(result.result, 'FAILED'); assert.equal(result.bindingVerified, false);
});
test('result-write failure still records an owned terminal failure without leaking the error', t => {
    const f = fixture(t), io = {...fs, writeFileSync(file, ...args) { if (file === f.resultPath) throw Error('PRIVATE_CANARY'); return fs.writeFileSync(file, ...args); }};
    const outcome = finalize(raw(evidence()), meta, f, io);
    assert.equal(outcome.passed, false); assert.equal(outcome.reason, 'RESULT_WRITE_FAILED');
    assert.equal(f.status().terminal, true); assert.equal(f.status().result, 'FAILED'); assert.equal(f.status().receiptWritten, false);
    assert.doesNotMatch(JSON.stringify(f.status()), /PRIVATE_CANARY/);
});
test('status-write failure cannot claim whole-run success even when the fixture result passed', t => {
    const f = fixture(t), io = {...fs, renameSync() { throw Error('PRIVATE_CANARY'); }};
    const outcome = finalize(raw(evidence()), meta, f, io);
    assert.equal(outcome.passed, false); assert.equal(outcome.reason, 'STATUS_WRITE_FAILED');
    assert.equal(f.result().result, 'PASSED'); assert.equal(f.status().terminal, false);
});
test('late and concurrent finalizations cannot replace the first terminal result', t => {
    const f = fixture(t); let attempted = false, late;
    const io = {...fs, writeFileSync(file, ...args) {
        if (file === f.resultPath && !attempted) { attempted = true; late = finalize('', {...meta, launchState: 'TIMEOUT'}, f); }
        return fs.writeFileSync(file, ...args);
    }};
    assert.equal(finalize(raw(evidence()), meta, f, io).passed, true); assert.equal(late.passed, false);
    const resultBefore = fs.readFileSync(f.resultPath), statusBefore = fs.readFileSync(f.statusPath);
    assert.equal(finalize('', {...meta, launchState: 'TIMEOUT'}, f).passed, false);
    assert.deepEqual(fs.readFileSync(f.resultPath), resultBefore); assert.deepEqual(fs.readFileSync(f.statusPath), statusBefore);
});
test('CLI unreadable input still produces a bound terminal failure', t => {
    const f = fixture(t), report = path.resolve(__dirname, '../prototypes/fn-connect/client/smoke-report.cjs');
    const child = cp.spawnSync(process.execPath, [report, path.join(f.dir, 'missing.txt'), f.resultPath, meta.sourceCommit, meta.archiveHash,
        'COMPLETED', '0', 'true', 'true', meta.runId, f.statusPath, '1234'], {encoding: 'utf8'});
    assert.equal(child.status, 1); assert.equal(f.status().terminal, true); assert.equal(f.result().runId, meta.runId); assert.equal(f.result().result, 'FAILED');
});
for (const mode of ['success', 'result-failed', 'node-throws', 'unconfirmed', 'profile-incomplete', 'foreign-status', 'claimed-then-failed', 'preterminal', 'fallback-result-fails']) {
    test('actual runner reporting tail only removes confirmed successful evidence: ' + mode, () => {
        const child = cp.spawnSync(process.platform === 'win32' ? 'pwsh.exe' : 'pwsh', ['-NoProfile', '-File', path.join(__dirname, 'helpers/fn-runner-report-tail.ps1'), '-Mode', mode],
            {encoding: 'utf8', timeout: 15000});
        assert.equal(child.status, 0, child.stderr); const value = JSON.parse(child.stdout.trim());
        assert.equal(value.nodeCalls, 1); assert.equal(value.neighborPreserved, true);
        assert.equal(value.temporaryRetained, mode !== 'success');
        if (['result-failed','node-throws'].includes(mode)) { assert.equal(value.terminal,true); assert.equal(value.resultReason,'REPORT_FAILED'); assert.equal(value.resultRunId,value.statusRunId); }
        if (['foreign-status','claimed-then-failed','preterminal'].includes(mode)) assert.equal(value.statusUnchanged,true);
        if (mode === 'fallback-result-fails') { assert.equal(value.terminal,true); assert.equal(value.receiptWritten,false); }
        assert.equal(value.failed, ['result-failed', 'node-throws', 'foreign-status', 'claimed-then-failed', 'preterminal', 'fallback-result-fails'].includes(mode));
    });
}
