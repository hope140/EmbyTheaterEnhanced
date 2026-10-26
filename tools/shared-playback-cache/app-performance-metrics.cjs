'use strict';

const SCENARIOS = Object.freeze(['cold-first-frame', 'cached-seek', 'uncached-seek', 'boundary-seek', 'far-seek']);
const PAIRS = Object.freeze(Array.from({length: 23}, (_, index) => index - 3));
const FIELDS = Object.freeze(['scenario', 'pair', 'arm', 'status', 'latencyMs', 'sourceBodyBytes',
  'overlapBodyBytes', 'peakRssBytes', 'peakDiskBytes']);
const fail = code => {throw Error(code);};
function expectedSchedule() {
  const rows = [];
  for (const scenario of SCENARIOS) for (let index = 0; index < PAIRS.length; index++) {
    const pair = PAIRS[index], order = index % 2 === 0 ? ['A', 'B'] : ['B', 'A'];
    for (const arm of order) rows.push(Object.freeze({scenario, pair, arm}));
  }
  return rows;
}

const schedule = expectedSchedule();
function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(fraction * sorted.length) - 1];
}
function validate(samples) {
  if (!Array.isArray(samples)) fail('app-performance-samples-invalid');
  if (samples.length !== schedule.length) fail('app-performance-samples-incomplete');
  const seen = new Set();
  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index];
    if (!sample || typeof sample !== 'object' || Array.isArray(sample) ||
        Object.keys(sample).sort().join('\0') !== [...FIELDS].sort().join('\0')) fail('app-performance-sample-invalid');
    if (!SCENARIOS.includes(sample.scenario) || !Number.isInteger(sample.pair) || sample.pair < -3 || sample.pair > 19 ||
        !['A', 'B'].includes(sample.arm) || !['PASS', 'FAIL'].includes(sample.status) ||
        (sample.status === 'PASS' ? !Number.isFinite(sample.latencyMs) || sample.latencyMs < 0 :
          sample.latencyMs !== null && (!Number.isFinite(sample.latencyMs) || sample.latencyMs < 0)) ||
        ['sourceBodyBytes', 'overlapBodyBytes', 'peakRssBytes', 'peakDiskBytes'].some(key =>
          !Number.isSafeInteger(sample[key]) || sample[key] < 0)) fail('app-performance-sample-invalid');
    const key = `${sample.scenario}\0${sample.pair}\0${sample.arm}`;
    if (seen.has(key)) fail('app-performance-sample-duplicate');
    seen.add(key);
    const expected = schedule[index];
    if (sample.scenario !== expected.scenario || sample.pair !== expected.pair || sample.arm !== expected.arm) {
      fail('app-performance-sample-order-invalid');
    }
  }
}

function summarizeGroup(samples) {
  const warmups = samples.filter(sample => sample.pair < 0);
  const measured = samples.filter(sample => sample.pair >= 0);
  const valid = measured.filter(sample => sample.status === 'PASS');
  const failures = samples.filter(sample => sample.status === 'FAIL').map(sample => ({...sample}));
  const arms = {};
  for (const arm of ['A', 'B']) {
    const rows = valid.filter(sample => sample.arm === arm);
    const observed = measured.filter(sample => sample.arm === arm);
    arms[arm] = {
      validSampleCount: rows.length,
      latencyMs: {p50: percentile(rows.map(row => row.latencyMs), 0.5), p95: percentile(rows.map(row => row.latencyMs), 0.95)},
      sourceBodyBytesPeak: observed.length ? Math.max(...observed.map(row => row.sourceBodyBytes)) : null,
      overlapBodyBytesPeak: observed.length ? Math.max(...observed.map(row => row.overlapBodyBytes)) : null,
      peakRssBytes: observed.length ? Math.max(...observed.map(row => row.peakRssBytes)) : null,
      peakDiskBytes: observed.length ? Math.max(...observed.map(row => row.peakDiskBytes)) : null
    };
  }
  const completePairs = [];
  const pairKeys = [...new Set(measured.map(row => `${row.scenario}\0${row.pair}`))];
  for (const key of pairKeys) {
    const [scenario, pairText] = key.split('\0'), pair = Number(pairText);
    const a = measured.find(row => row.scenario === scenario && row.pair === pair && row.arm === 'A');
    const b = measured.find(row => row.scenario === scenario && row.pair === pair && row.arm === 'B');
    if (a?.status === 'PASS' && b?.status === 'PASS') completePairs.push(b.latencyMs - a.latencyMs);
  }
  const validSampleCount = valid.length;
  const failureCount = failures.length;
  return {
    sampleCount: samples.length,
    warmupSampleCount: warmups.length,
    intentSampleCount: measured.length,
    passCount: samples.length - failureCount,
    failureCount,
    validIntentSampleCount: validSampleCount,
    arms,
    pairedAddedLatencyMsBMinusA: {
      validPairCount: completePairs.length,
      p50: percentile(completePairs, 0.5),
      p95: percentile(completePairs, 0.95)
    },
    failures
  };
}

function summarize(samples) {
  validate(samples);
  const scenarios = Object.fromEntries(SCENARIOS.map(scenario => [scenario,
    summarizeGroup(samples.filter(sample => sample.scenario === scenario))]));
  const all = summarizeGroup(samples);
  return {schema: 1, status: all.failureCount ? 'FAIL' : 'PASS', complete: true,
    sampleCount: all.sampleCount, warmupSampleCount: all.warmupSampleCount,
    intentSampleCount: all.intentSampleCount, passCount: all.passCount,
    failureCount: all.failureCount, validIntentSampleCount: all.validIntentSampleCount,
    arms: all.arms, pairedAddedLatencyMsBMinusA: all.pairedAddedLatencyMsBMinusA,
    failures: all.failures, scenarios};
}

module.exports = {summarize, expectedSchedule};
