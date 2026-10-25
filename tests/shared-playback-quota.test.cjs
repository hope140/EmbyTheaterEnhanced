'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const {createStore} = require('../tools/shared-playback-cache/store.cjs');
const {BLOCK, SCENARIOS, assertBounds, inspectDisk, parseArgs, runScenario, run} =
  require('../tools/shared-playback-cache/quota.cjs');

async function fixture(t) {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'ete-quota-unit-'));
  t.after(() => fs.rm(parent, {recursive: true, force: true}));
  return path.join(parent, 'fresh');
}
const small = (values = {}) => ({name: 'scaled-budgets', currentBytes: 3 * BLOCK,
  nextBytes: 2 * BLOCK, logicalBytes: 32 * BLOCK, maxEntries: 32, mode: 'budgets', ...values});
const milestone = (report, stage) => report.milestones.find(row => row.stage === stage);

test('quota CLI requires explicit run and fixes the two finite full-size scenarios', async () => {
  assert.throws(() => parseArgs([]), /explicit-run/);
  assert.throws(() => parseArgs(['--out', '/tmp/fresh']), /explicit-run/);
  assert.throws(() => parseArgs(['--run', '--out', 'relative']), /explicit-run/);
  assert.throws(() => parseArgs(['--run', '--out', '/tmp/fresh', '--deadline-ms', '0']), /explicit-run/);
  assert.throws(() => parseArgs(['--run', '--out', '/tmp/fresh', '--deadline-ms', '1800001']), /explicit-run/);
  assert.deepEqual(parseArgs(['--run', '--out', '/tmp/fresh', '--deadline-ms', '1000']),
    {out: '/tmp/fresh', deadlineMs: 1000});
  assert.deepEqual(SCENARIOS.map(row => [row.currentBytes, row.nextBytes, row.maxEntries]),
    [[300 * 1024 * 1024, 100 * 1024 * 1024, 4096], [3072 * 1024 * 1024, 500 * 1024 * 1024, 4096]]);
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
  assert.ok(report.peakRssBytes > 0);
  assert.ok(report.elapsedMs > 0);
  for (const row of report.milestones) {
    assertBounds(row.status, config);
    assert.equal(row.disk.blockBytes, row.status.committed);
    assert.equal(row.disk.tempFiles, 0);
  }
  const disk = await inspectDisk(root);
  assert.equal(disk.blockBytes, BLOCK);
  assert.equal(disk.indexRows, 2);
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
  assert.match(saved.sourceCodeSha256['store.cjs'], /^[a-f0-9]{64}$/);
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
