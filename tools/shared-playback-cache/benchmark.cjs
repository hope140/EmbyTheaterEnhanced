'use strict';
// Explicit finite local experiment; no remote-source or credential arguments.
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const crypto = require('node:crypto');
const {performance} = require('node:perf_hooks');
const {createStore} = require('./store.cjs');
const {createProxy} = require('./proxy.cjs');
const {source, get, identity, hash} = require('./fixture.cjs');
const policy = require('./benchmark-policy.json');
const quantile = (values, p) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)];
const summary = values => ({p05: quantile(values, 0.05), p50: quantile(values, 0.5), p95: quantile(values, 0.95), min: Math.min(...values), max: Math.max(...values)});
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
function medianInterval(values) {
  let seed = 0x7134cafe;
  const draw = n => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % n;};
  const estimates = [];
  for (let n = 0; n < 1000; n++) estimates.push(quantile(values.map(() => values[draw(values.length)]), 0.5));
  return [quantile(estimates, 0.025), quantile(estimates, 0.975)];
}
async function benchmark(out) {
  if (!path.isAbsolute(out) || path.resolve(out) !== out || out.startsWith(path.resolve(__dirname, '../..') + path.sep)) throw Error('fresh-private-output-required');
  await fs.mkdir(out, {mode: 0o700});
  await fs.writeFile(path.join(out, 'owner'), 'ETE owned shared-cache benchmark v1\n', {flag: 'wx'});
  const report = {schema: 1, scope: policy.scope, policy, policySha256: sha(await fs.readFile(path.join(__dirname, 'benchmark-policy.json'))),
    environment: {platform: process.platform, release: os.release(), arch: process.arch, node: process.version,
      cpu: os.cpus()[0]?.model, logicalCpuCount: os.cpus().length, totalMemory: os.totalmem(),
      network: 'source, proxy and client in same process; loopback; anonymous owned bytes',
      storage: 'real temporary files on host filesystem; OS page cache not flushed',
      media: 'deterministic binary range fixture, not decoded video'}, cases: [],
    memory: {baseline: process.memoryUsage(), peak: {}}, resources: {peakSources: 0, peakBodies: 0, peakMediaReserved: 0, peakDiskBytes: 0, peakWriteJobs: 0},
    sameMetadataReplacement: 'known undetectable risk, separately reproduced by regression',
    nativeFirstFrame: 'NOT_MEASURED', nativeSeekResume: 'NOT_MEASURED', windows: 'NOT_RUN'};
  report.sourceSha256 = {};
  for (const file of ['store.cjs', 'index.cjs', '../../src/electronapp/enhanced/shared-playback-cache/store.js', '../../src/electronapp/enhanced/shared-playback-cache/index.js', '../../src/electronapp/enhanced/shared-playback-cache/proxy.js', 'proxy.cjs', 'fixture.cjs', 'benchmark.cjs']) report.sourceSha256[file] = sha(await fs.readFile(path.join(__dirname, file)));
  const memoryTimer = setInterval(() => {const now = process.memoryUsage();
    for (const key of ['rss', 'heapUsed', 'external', 'arrayBuffers']) report.memory.peak[key] = Math.max(report.memory.peak[key] || 0, now[key]);}, 5);
  const setups = [];
  let serial = 0;
  async function create(name, sourceOptions, enabled = true) {
    const origin = await source(sourceOptions);
    const store = await createStore({root: path.join(out, name), currentBytes: 64 * 1024 * 1024, nextBytes: 4 * 1024 * 1024});
    const proxy = await createProxy({store, cacheEnabled: enabled, authorize: async () => origin.grant()});
    const value = {origin, store, proxy}; setups.push(value); return value;
  }
  function observe(setup) {
    const s = setup.proxy.status();
    report.resources.peakSources = Math.max(report.resources.peakSources, s.peakOrigins);
    report.resources.peakBodies = Math.max(report.resources.peakBodies, s.peakBodies);
    report.resources.peakMediaReserved = Math.max(report.resources.peakMediaReserved, s.peakMediaReservedBytes);
    report.resources.peakWriteJobs = Math.max(report.resources.peakWriteJobs, s.peakWriteJobs);
    report.resources.peakDiskBytes = Math.max(report.resources.peakDiskBytes, s.store.peak);
  }
  async function paired(name, setup, mode, start, length, gate, extra = {}) {
    let warm;
    if (mode === 'hit' || mode === 'boundary' || mode === 'reopen') {
      warm = await setup.proxy.open(identity('warm-' + name)); await warm.ready();
      const wanted = mode === 'boundary' ? 65536 : length;
      const prepare = await get(warm.url, start, wanted);
      if (prepare.hash !== hash(setup.origin.data.subarray(start, start + wanted))) throw Error('warm-body-invalid');
      await setup.proxy.drain(); await warm.actual();
    }
    const rows = [], warmups = [];
    async function sample(arm, iteration) {
      const began = performance.now(); let handle;
      if (arm === 'B') {
        handle = warm;
        if (mode === 'reopen') handle = await setup.proxy.open(identity('warm-' + name));
        else if (!handle) handle = await setup.proxy.open(identity('sample-' + (++serial)));
      }
      const statusBefore = setup.proxy.status();
      try {
        const result = await get(handle ? handle.url : setup.origin.url, start, length);
        const ttfbIncludingOpen = result.firstAt - began;
        if (result.status !== 206 || result.body.length !== length || result.hash !== hash(setup.origin.data.subarray(start, start + length))) throw Error('body-invalid');
        return {arm, iteration, ttfbMs: result.ttfbMs, ttfbIncludingOpenMs: ttfbIncludingOpen, durationMs: performance.now() - began,
          bytesPerSecond: result.bytesPerSecond, sourceReceivedBytes: setup.proxy.status().receivedBytes - statusBefore.receivedBytes,
          cacheHitBytes: setup.proxy.status().hitBytes - statusBefore.hitBytes,
          sourceProbeRequests: setup.proxy.status().probeRequests - statusBefore.probeRequests, ok: true};
      } catch {return {arm, iteration, ok: false, reason: 'request-or-byte-validation-failed'};}
      finally {
        if (arm === 'B') {
          await setup.proxy.drain();
          if (handle !== warm) {handle.retire(); const key = await handle.ready().catch(() => null); if (key && mode !== 'reopen') await setup.store.invalidate(key);}
        }
        observe(setup);
      }
    }
    for (let n = -policy.warmupPairs; n < policy.pairedSamples; n++) {
      if (mode === 'boundary') {
        warm.retire(); await setup.store.invalidate(await warm.ready());
        warm = await setup.proxy.open(identity('boundary-' + name + '-' + n)); await warm.ready();
        const prepared = await get(warm.url, start, 65536);
        if (prepared.body.length !== 65536) throw Error('boundary-prepare-invalid');
        await setup.proxy.drain(); await warm.actual();
      }
      const order = Math.abs(n) % 2 === 0 ? ['A', 'B'] : ['B', 'A']; const pair = {};
      for (const arm of order) pair[arm] = await sample(arm, n);
      (n < 0 ? warmups : rows).push({iteration: n, order: order.join(''), ...pair});
    }
    if (warm) warm.retire();
    const valid = rows.filter(p => p.A.ok && p.B.ok), allValid = valid.length === policy.pairedSamples;
    const boundaryProven = mode !== 'boundary' || valid.every(p => p.B.cacheHitBytes === 65536 && p.B.sourceReceivedBytes === length - 65536);
    const deltas = valid.map(p => p.B.ttfbIncludingOpenMs - p.A.ttfbIncludingOpenMs);
    const ratios = valid.map(p => p.B.ttfbIncludingOpenMs / p.A.ttfbIncludingOpenMs);
    const throughputRatios = valid.map(p => p.B.bytesPerSecond / p.A.bytesPerSecond);
    const zeroSource = valid.every(p => p.B.sourceReceivedBytes === 0);
    const statistics = valid.length ? {ttfbAddedMs: summary(deltas), ttfbAddedMedian95CI: medianInterval(deltas),
      ttfbRatio: summary(ratios), ttfbRatioMedian95CI: medianInterval(ratios),
      throughputRatio: summary(throughputRatios), throughputRatioMedian95CI: medianInterval(throughputRatios),
      baselineTtfbMs: summary(valid.map(p => p.A.ttfbIncludingOpenMs)), candidateTtfbMs: summary(valid.map(p => p.B.ttfbIncludingOpenMs))} : null;
    let passed = allValid && boundaryProven;
    if (statistics && gate === 'latency') passed &&= statistics.ttfbAddedMs.p50 <= policy.gates.coldMedianAddedMs && statistics.ttfbAddedMs.p95 <= policy.gates.coldP95AddedMs;
    if (statistics && gate === 'hit') passed &&= statistics.ttfbRatio.p50 <= policy.gates.hitMedianTtfbRatio && zeroSource;
    if (statistics && gate === 'throughput') passed &&= statistics.throughputRatio.p50 >= policy.gates.pacedThroughputMedianRatio;
    let status = gate === 'diagnostic' ? 'OBSERVED' : passed ? 'PASS' : 'FAIL';
    if (allValid && boundaryProven && (gate !== 'hit' || zeroSource) && statistics) {
      const interval = gate === 'latency' ? statistics.ttfbAddedMedian95CI : gate === 'hit' ? statistics.ttfbRatioMedian95CI : statistics.throughputRatioMedian95CI;
      const boundary = gate === 'latency' ? policy.gates.coldMedianAddedMs : gate === 'hit' ? policy.gates.hitMedianTtfbRatio : policy.gates.pacedThroughputMedianRatio;
      if (gate !== 'diagnostic' && interval[0] <= boundary && interval[1] >= boundary) status = 'INCONCLUSIVE';
    }
    if (!allValid || !boundaryProven || gate === 'hit' && !zeroSource) status = 'FAIL';
    const result = {name, mode, start, length, gate, ...extra, status,
      successfulPairs: valid.length, boundaryProven, statistics, hitSourceMediaBytesZero: zeroSource, warmups, samples: rows};
    report.cases.push(result); console.log(JSON.stringify({case: name, status: result.status, successfulPairs: valid.length, statistics}));
  }
  try {
    const latency = await create('latency', {bytes: 4 * 1024 * 1024, firstDelay: 20, tailDelay: 100});
    const forwarding = await create('forwarding', {bytes: 4 * 1024 * 1024, firstDelay: 20, tailDelay: 100}, false);
    await paired('forward-only-first-byte', forwarding, 'cold', 0, 262144, 'latency');
    await paired('cold-first-byte', latency, 'cold', 0, 262144, 'latency');
    await paired('far-hole-seek-first-byte', latency, 'cold', 3 * 1024 * 1024 + 17, 65536, 'latency');
    await paired('cached-range-seek', latency, 'hit', 1024 * 1024 + 37, 65536, 'hit');
    await paired('cached-to-hole-boundary', latency, 'boundary', 2 * 1024 * 1024 + 111, 131072, 'latency');
    await paired('fresh-route-hit-with-access-probe', latency, 'reopen', 524288, 65536, 'latency', {probeIncluded: true});
    const paced = await create('paced', {bytes: 2 * 1024 * 1024, firstDelay: 0, tailDelay: 0, paceMs: 8});
    await paired('paced-cold-throughput', paced, 'cold', 0, 2 * 1024 * 1024, 'throughput');
    await paired('paced-hit-throughput', paced, 'hit', 0, 2 * 1024 * 1024, 'throughput');
    const fast = await create('unpaced', {bytes: 2 * 1024 * 1024, firstDelay: 0, tailDelay: 0});
    await paired('unpaced-loopback-cold-diagnostic', fast, 'cold', 0, 2 * 1024 * 1024, 'diagnostic');
    report.gatedProxyPath = report.cases.some(c => c.status === 'FAIL') ? 'FAIL' : report.cases.some(c => c.status === 'INCONCLUSIVE') ? 'INCONCLUSIVE' : 'PASS';
  } finally {
    for (const setup of setups) {await setup.proxy.close(); observe(setup); await setup.origin.close();}
    clearInterval(memoryTimer);
    report.afterClose = setups.map(s => ({activeOrigins: s.proxy.status().activeOrigins, activeBodies: s.proxy.status().activeBodies,
      captureBytes: s.proxy.status().captureBytes, readReservedBytes: s.proxy.status().readReservedBytes,
      storeReaders: s.store.status().readers, pending: s.store.status().pending, closed: s.store.status().closed}));
    report.resourcesWithinLimits = report.resources.peakSources <= policy.resourceLimits.sourceResponses &&
      report.resources.peakBodies <= policy.resourceLimits.localBodies && report.resources.peakMediaReserved <= policy.resourceLimits.mediaReservationBytes &&
      report.resources.peakWriteJobs <= policy.resourceLimits.captureJobs;
    report.afterCloseClean = report.afterClose.every(s => s.activeOrigins === 0 && s.activeBodies === 0 && s.captureBytes === 0 && s.readReservedBytes === 0 && s.storeReaders === 0 && s.pending === 0 && s.closed);
    for (const file of ['store.cjs', 'index.cjs', '../../src/electronapp/enhanced/shared-playback-cache/store.js', '../../src/electronapp/enhanced/shared-playback-cache/index.js', '../../src/electronapp/enhanced/shared-playback-cache/proxy.js', 'proxy.cjs', 'fixture.cjs', 'benchmark.cjs']) {
      if (report.sourceSha256[file] !== sha(await fs.readFile(path.join(__dirname, file)))) report.sourceDrift = true;
    }
    await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
  }
  if (report.gatedProxyPath !== 'PASS' || !report.resourcesWithinLimits || !report.afterCloseClean || report.sourceDrift) process.exitCode = 1;
  return report;
}
module.exports = {quantile, summary, medianInterval, benchmark};
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 3 || args[0] !== '--run' || args[1] !== '--out') {console.error('Explicit --run --out ABSOLUTE_FRESH_PRIVATE_ROOT required'); process.exitCode = 1;}
  else benchmark(args[2]).catch(() => {console.error('shared-cache-benchmark-failed; inspect owned output and frozen source'); process.exitCode = 1;});
}
