'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {summarize, expectedSchedule} = require('../tools/shared-playback-cache/app-performance-metrics.cjs');

function samplesForSchedule() {
  return expectedSchedule().map((row, index) => ({...row,
    status: row.scenario === 'cold-first-frame' && row.pair === 4 && row.arm === 'B' ? 'FAIL' : 'PASS',
    latencyMs: row.pair < 0 ? 1 : row.pair * 10 + (row.arm === 'A' ? 100 : 103),
    sourceBodyBytes: index + 10, overlapBodyBytes: index + 5,
    peakRssBytes: 1000 + index, peakDiskBytes: 2000 + index}));
}

test('fixed schedule contains five scenarios, three warmup pairs and twenty alternating intent pairs', () => {
  const schedule = expectedSchedule();
  assert.equal(schedule.length, 230);
  for (const scenario of ['cold-first-frame', 'cached-seek', 'uncached-seek', 'boundary-seek', 'far-seek']) {
    const rows = schedule.filter(row => row.scenario === scenario);
    assert.equal(rows.length, 46);
    for (let pair = -3; pair <= 19; pair++) {
      const order = (pair + 3) % 2 === 0 ? ['A', 'B'] : ['B', 'A'];
      assert.deepEqual(rows.filter(row => row.pair === pair).map(row => row.arm), order);
    }
  }
});

test('summary separates warmups, preserves failure samples, and reports valid paired percentiles and peaks', () => {
  const samples = samplesForSchedule();
  const failed = samples.find(row => row.status === 'FAIL');
  Object.assign(failed, {latencyMs: null, overlapBodyBytes: 900000, peakRssBytes: 800000, peakDiskBytes: 700000});
  const result = summarize(samples);
  assert.equal(result.status, 'FAIL');
  assert.equal(result.complete, true, 'all scheduled results exist even though one action failed');
  assert.equal(result.sampleCount, 230);
  assert.equal(result.warmupSampleCount, 30);
  assert.equal(result.intentSampleCount, 200);
  assert.equal(result.passCount, 229);
  assert.equal(result.failureCount, 1);
  assert.equal(result.validIntentSampleCount, 199);
  assert.equal(result.arms.A.validSampleCount, 100);
  assert.deepEqual(result.arms.A.latencyMs, {p50: 190, p95: 280});
  assert.equal(result.arms.B.validSampleCount, 99);
  assert.deepEqual(result.arms.B.latencyMs, {p50: 203, p95: 293}, 'the null failure latency is excluded from percentiles');
  assert.equal(result.arms.B.sourceBodyBytesPeak, Math.max(...samples.filter(row => row.pair >= 0 && row.arm === 'B').map(row => row.sourceBodyBytes)));
  assert.equal(result.arms.B.overlapBodyBytesPeak, 900000, 'observed failure bytes remain visible in the peak');
  assert.equal(result.arms.B.peakRssBytes, 800000, 'failed attempts still contribute measured resource peaks');
  assert.equal(result.arms.B.peakDiskBytes, 700000);
  assert.equal(result.pairedAddedLatencyMsBMinusA.validPairCount, 99);
  assert.deepEqual({p50: result.pairedAddedLatencyMsBMinusA.p50, p95: result.pairedAddedLatencyMsBMinusA.p95}, {p50: 3, p95: 3});
  assert.equal(result.arms.A.sourceBodyBytesPeak, Math.max(...samples.filter(row => row.pair >= 0 && row.arm === 'A').map(row => row.sourceBodyBytes)));
  assert.deepEqual(result.failures, [failed]);
  assert.equal(result.scenarios['cold-first-frame'].warmupSampleCount, 6);
  assert.equal(result.scenarios['cold-first-frame'].failureCount, 1);
  assert.equal(result.scenarios['cold-first-frame'].pairedAddedLatencyMsBMinusA.validPairCount, 19);
});

test('all passing scheduled samples report PASS without applying an unrequested performance threshold', () => {
  const samples = samplesForSchedule().map(row => ({...row, status: 'PASS', latencyMs: row.pair < 0 ? 1 : 600000}));
  const result = summarize(samples);
  assert.equal(result.status, 'PASS');
  assert.equal(result.failureCount, 0);
  assert.equal(result.validIntentSampleCount, 200);
  assert.equal(result.pairedAddedLatencyMsBMinusA.validPairCount, 100);
  assert.equal(result.arms.A.latencyMs.p50, 600000);
});

test('rejects incomplete, duplicate, reordered, and malformed schedules or measurements', () => {
  const base = samplesForSchedule();
  assert.throws(() => summarize(base.slice(0, -1)), /app-performance-samples-incomplete/);
  const duplicate = base.slice(); duplicate[1] = {...duplicate[0]};
  assert.throws(() => summarize(duplicate), /app-performance-sample-duplicate/);
  const reordered = base.slice(); [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
  assert.throws(() => summarize(reordered), /app-performance-sample-order-invalid/);
  for (const mutate of [
    row => {row.latencyMs = Infinity;},
    row => {row.latencyMs = null;},
    row => {row.sourceBodyBytes = -1;},
    row => {row.peakRssBytes = Number.MAX_SAFE_INTEGER + 1;},
    row => {row.status = 'SKIP';},
    row => {row.unexpected = true;},
    row => {row.pair = 20;}
  ]) {
    const invalid = base.map(row => ({...row})); mutate(invalid[0]);
    assert.throws(() => summarize(invalid), /app-performance-sample-invalid/);
  }
  assert.throws(() => summarize(null), /app-performance-samples-invalid/);
});
