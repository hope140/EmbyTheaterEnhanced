'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {temporaryRoot} = require('./helpers/range-fixture-root.cjs');
const crypto = require('node:crypto');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const {createStore} = require('../tools/shared-playback-cache/store.cjs');
const {BLOCK, SCENARIOS, LEGACY_SCENARIO, assertBounds, inspectDisk, parseArgs, runScenario, run} =
  require('../tools/shared-playback-cache/quota.cjs');

async function fixture(t) {
  const parent = temporaryRoot('ete-quota-unit-', ['fresh', path.join('fresh', 'scaled-budgets')]);
  t.after(() => fs.rm(parent, {recursive: true, force: true}));
  return path.join(parent, 'fresh');
}
const small = (values = {}) => ({name: 'scaled-budgets', currentBytes: 3 * BLOCK,
  nextBytes: 2 * BLOCK, logicalBytes: 32 * BLOCK, maxEntries: 32, mode: 'budgets', ...values});
const milestone = (report, stage) => report.milestones.find(row => row.stage === stage);

test('disk inspection replays the shared compact checkpoint and journal without duplicating its codec', async t => {
  const root = await fixture(t);
  await fs.mkdir(root, {mode: 0o700});
  await fs.mkdir(path.join(root, 'blocks'), {mode: 0o700});
  const {encodeCheckpoint, encodeFrame} = require('../tools/shared-playback-cache/index.cjs');
  const data = Buffer.alloc(BLOCK, 0x5a), key = 'a'.repeat(64);
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  const block = {start: 0, length: BLOCK, hash, touched: 1, file: `${key}-0-${BLOCK}-${hash}.bin`};
  const checkpoint = encodeCheckpoint({version: 1, actual: key, entries: [{key,
    baseKey: 'b'.repeat(64), meta: {total: 2 * BLOCK}, role: 'current', touched: 1, blocks: []}]}, 0);
  const frame = encodeFrame(1, 'add', key, block);
  await fs.writeFile(path.join(root, '.owner'), 'owned quota codec inspection\n');
  await fs.writeFile(path.join(root, 'index.json'), checkpoint);
  await fs.writeFile(path.join(root, 'index.log'), frame);
  await fs.writeFile(path.join(root, 'blocks', block.file), data);
  const disk = await inspectDisk(root);
  assert.equal(disk.checkpointBytes, Buffer.byteLength(checkpoint));
  assert.equal(disk.journalBytes, frame.length);
  assert.equal(disk.checkpointBlockRows, 0);
  assert.equal(disk.indexBlockRows, 1);
  assert.equal(disk.journalRecords, 1);
  assert.equal(disk.journalDiscardedTailBytes, 0);
  assert.equal(disk.currentIndexedBytes, BLOCK);
  assert.equal(disk.blockBytes, BLOCK);
});

test('quota CLI requires explicit run and fixes the two finite full-size scenarios', async () => {
  assert.throws(() => parseArgs([]), /explicit-run/);
  assert.throws(() => parseArgs(['--out', '/tmp/fresh']), /explicit-run/);
  assert.throws(() => parseArgs(['--run', '--out', 'relative']), /explicit-run/);
  assert.throws(() => parseArgs(['--run', '--out', '/tmp/fresh', '--deadline-ms', '0']), /explicit-run/);
  assert.throws(() => parseArgs(['--run', '--out', '/tmp/fresh', '--deadline-ms', '1800001']), /explicit-run/);
  assert.deepEqual(parseArgs(['--run', '--out', '/tmp/fresh', '--deadline-ms', '1000']),
    {out: '/tmp/fresh', deadlineMs: 1000});
  assert.deepEqual(SCENARIOS.map(row => [row.currentBytes, row.nextBytes, row.maxEntries]),
    [[300 * 1024 * 1024, 100 * 1024 * 1024, 16384], [3072 * 1024 * 1024, 500 * 1024 * 1024, 16384]]);
  assert.equal(SCENARIOS[1].mode, 'budgets');
  assert.equal((SCENARIOS[1].currentBytes + SCENARIOS[1].nextBytes) / BLOCK, 14288);
  assert.equal(LEGACY_SCENARIO.mode, 'admission');
  assert.equal(LEGACY_SCENARIO.maxEntries, 4096);
  assert.deepEqual(parseArgs(['--run', '--out', '/tmp/fresh', '--legacy-4096']),
    {out: '/tmp/fresh', deadlineMs: 900000, legacy4096: true});
  assert.throws(() => parseArgs(['--run', '--out', '/tmp/fresh', '--legacy-4096', '--legacy-4096']), /explicit-run/);
  assert.deepEqual(parseArgs(['--run', '--out', '/tmp/fresh', '--recovery-probe']),
    {out: '/tmp/fresh', deadlineMs: 900000, recoveryProbe: true});
  assert.throws(() => parseArgs(['--run', '--out', '/tmp/fresh', '--legacy-4096', '--recovery-probe']), /explicit-run/);
  assert.throws(() => parseArgs(['--run', '--out', '/tmp/fresh', '--recovery-probe', '--recovery-probe']), /explicit-run/);
  const script = path.resolve(__dirname, '../tools/shared-playback-cache/quota.cjs');
  await assert.rejects(promisify(execFile)(process.execPath, [script]), error =>
    error.code === 1 && error.stdout === '' && error.stderr === 'explicit-run-and-fresh-private-output-required\n');
});

test('scaled real-disk budgets account completed writes, refuse overflow, recover only actual and retire it on C', async t => {
  const root = await fixture(t), config = small();
  const report = await runScenario(root, config, {deadlineMs: 10000});
  assert.equal(report.ok, true);
  assert.equal(report.closed, true);
  const full = milestone(report, 'both-budgets-full');
  assert.equal(full.status.current, config.currentBytes);
  assert.equal(full.status.next, config.nextBytes);
  assert.equal(full.disk.blockBytes, config.currentBytes + config.nextBytes);
  assert.equal(full.disk.indexRows, 7);
  assert.equal(full.disk.tempFiles, 0);
  assert.equal(report.rejections.length, 2);
  assert.ok(report.rejections.every(row => row.result === 'put-returned-false' && row.candidateExceedsRoleBytes));
  const refused = milestone(report, 'after-admission-refusals');
  assert.equal(refused.status.current, 2 * BLOCK);
  assert.equal(refused.status.next, BLOCK);
  const reopened = milestone(report, 'reopened-actual-A-only');
  assert.equal(reopened.status.current, refused.status.current);
  assert.equal(reopened.status.next, 0);
  assert.equal(reopened.disk.blockFiles, 2);
  assert.equal(milestone(report, 'prepared-C-keeps-A').status.current, reopened.status.current);
  const actualC = milestone(report, 'actual-C-retires-A');
  assert.equal(actualC.status.current, BLOCK);
  assert.equal(actualC.disk.blockFiles, 1);
  assert.equal(report.completedWrites.mediaBytes, 6 * BLOCK);
  assert.equal(report.completedWrites.mediaCalls, 6);
  assert.ok(report.completedWrites.indexBytes > full.disk.indexBytes);
  assert.ok(report.completedWrites.indexCalls > report.completedWrites.mediaCalls);
  assert.equal(report.completedWrites.indexBytes,
    report.completedWrites.checkpointBytes + report.completedWrites.journalBytes);
  assert.equal(report.completedWrites.indexCalls,
    report.completedWrites.checkpointCalls + report.completedWrites.journalCalls);
  assert.ok(report.completedWrites.journalBytes > 0);
  assert.ok(report.completedWrites.journalTruncations > 0);
  assert.equal(report.indexTotals.checkpointWriteBytes, report.completedWrites.checkpointBytes);
  assert.equal(report.indexTotals.journalWriteBytes, report.completedWrites.journalBytes);
  assert.ok(report.indexTotals.compactions > 0);
  assert.equal(report.indexSessions.length, 2);
  assert.equal(report.filePeaks.payloadBytes, config.currentBytes + config.nextBytes);
  assert.ok(report.filePeaks.metadataBytes > 0);
  assert.ok(report.filePeaks.totalBytes > report.filePeaks.payloadBytes);
  assert.ok(report.peakRssBytes > 0);
  assert.ok(report.elapsedMs > 0);
  assert.equal(report.metadataAuthority, 'logical-total-only-no-validator');
  assert.deepEqual(report.coverage.map(row => [row.role, row.span.end]),
    [['current', config.currentBytes], ['next', config.nextBytes]]);
  assert.ok(report.readVerifications.some(row => row.role === 'next' && row.offset === config.nextBytes - BLOCK));
  assert.ok(report.readVerifications.some(row => row.stage === 'recovered-A-last-block' &&
    row.offset === config.currentBytes - BLOCK));
  assert.ok(report.readVerifications.every(row => row.length === BLOCK && /^[a-f0-9]{64}$/.test(row.sha256)));
  assert.deepEqual(report.creates.map(row => row.phase), ['initial', 'recovery']);
  assert.ok(report.creates.every(row => row.elapsedMs >= 0 && row.rssBeforeBytes > 0 && row.rssAfterBytes > 0));
  for (const row of report.milestones) {
    assertBounds(row.status, config);
    assert.equal(row.disk.blockBytes, row.status.committed);
    assert.equal(row.disk.tempFiles, 0);
    assert.ok(row.disk.checkpointBytes <= 2 * 1024 * 1024);
    assert.ok(row.disk.journalBytes <= 1024 * 1024);
    assert.equal(row.disk.journalDiscardedTailBytes, 0);
  }
  const disk = await inspectDisk(root);
  assert.equal(disk.blockBytes, BLOCK);
  assert.equal(disk.indexRows, 2);
  assert.equal(disk.journalBytes, 0, 'a successful handle truncate leaves the empty journal accounted');
});

test('scaled row admission limit reports refusal evidence and actual retained bytes instead of configured capacity', async t => {
  const root = await fixture(t);
  const config = small({name: 'scaled-row-limit', currentBytes: 16 * BLOCK,
    nextBytes: 4 * BLOCK, maxEntries: 8, mode: 'admission'});
  const report = await runScenario(root, config, {deadlineMs: 10000});
  const retained = milestone(report, 'after-admission-refusals');
  assert.equal(retained.status.current, 4 * BLOCK);
  assert.equal(retained.status.next, 0);
  assert.ok(retained.disk.blockBytes < config.currentBytes);
  assert.equal(report.rejections.length, 2);
  for (const refusal of report.rejections) {
    assert.equal(refusal.candidateExceedsRoleBytes, false);
    assert.equal(refusal.candidateMeetsRowRejectionGuard, true);
    assert.equal(refusal.faultedBefore, false);
    assert.equal(refusal.rowsBefore, 7);
  }
  assert.equal(report.completedWrites.mediaBytes, 7 * BLOCK);
  assert.equal(report.closed, true);
});

test('quota rejects existing and repository output without changing their contents', async t => {
  const root = await fixture(t);
  await fs.mkdir(root);
  await fs.writeFile(path.join(root, 'sentinel'), 'keep');
  await assert.rejects(run(root, {scenarios: [small()]}));
  assert.deepEqual(await fs.readdir(root), ['sentinel']);
  assert.equal(await fs.readFile(path.join(root, 'sentinel'), 'utf8'), 'keep');
  await assert.rejects(run(path.resolve(__dirname, '../quota-output-refused'), {scenarios: [small()]}),
    /repository-output-refused/);
  await assert.rejects(fs.stat(path.resolve(__dirname, '../quota-output-refused')), {code: 'ENOENT'});
});

test('deadline failure closes the owned store and cancellation is a safe label', async t => {
  const root = await fixture(t), config = small();
  await assert.rejects(runScenario(root, config, {deadlineMs: 1}), /quota-deadline/);
  const reopened = await createStore({root, currentBytes: config.currentBytes, nextBytes: config.nextBytes});
  await reopened.close();
  const cancelledRoot = root + '-cancelled', controller = new AbortController();
  controller.abort();
  await assert.rejects(runScenario(cancelledRoot, config, {signal: controller.signal}), /quota-cancelled/);
  assert.deepEqual(await fs.readdir(cancelledRoot), []);
  const report = await run(root + '-cancelled-report', {signal: controller.signal, scenarios: [small()]});
  assert.equal(report.ok, false);
  assert.equal(report.failure, 'quota-cancelled');
  assert.equal(report.scenarioResults.length, 1);
  assert.equal(report.scenarioResults[0].closed, true);
  assert.equal(report.scenarioResults[0].failure, 'quota-cancelled');
});

test('scaled report is private, preserves actual observations, and detects invalid bounds', async t => {
  const root = await fixture(t);
  const report = await run(root, {scenarios: [small()], deadlineMs: 10000});
  assert.equal(report.ok, true);
  const saved = JSON.parse(await fs.readFile(path.join(root, 'result.json'), 'utf8'));
  assert.equal(saved.schema, 'ete-shared-cache-quota-v1');
  assert.equal(saved.scenarioResults[0].completedWrites.mediaBytes, 6 * BLOCK);
  assert.ok(saved.peakOwnedCacheFileBytes < 5 * 1024 * 1024 * 1024);
  assert.match(saved.sourceCodeSha256['store.cjs'], /^[a-f0-9]{64}$/);
  assert.match(saved.sourceCodeSha256['index.cjs'], /^[a-f0-9]{64}$/);
  if (process.platform !== 'win32') {
    assert.equal((await fs.stat(root)).mode & 0o077, 0);
    assert.equal((await fs.stat(path.join(root, 'result.json'))).mode & 0o077, 0);
  }
  const limits = small();
  assert.throws(() => assertBounds({current: limits.currentBytes + 1, next: 0, peak: 0, pending: 0}, limits),
    /quota-bound-check-failed/);
  assert.throws(() => assertBounds({current: 0, next: limits.nextBytes + 1, peak: 0, pending: 0}, limits),
    /quota-bound-check-failed/);
  assert.throws(() => assertBounds({current: 0, next: 0, peak: limits.currentBytes + limits.nextBytes + 1, pending: 0}, limits),
    /quota-bound-check-failed/);
});
