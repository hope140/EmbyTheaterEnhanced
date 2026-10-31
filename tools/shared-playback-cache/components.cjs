'use strict';

// Finite owned-loopback comparison of the proxy forwarding path, capture-copy
// path, and real store write path. This is not a native playback measurement.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {performance} = require('node:perf_hooks');
const {createStore} = require('./store.cjs');
const {createProxy} = require('./proxy.cjs');
const {source, get, identity, hash} = require('./fixture.cjs');

const SOURCE_BYTES = 8 * 1024 * 1024;
const PAYLOADS = [2 * 1024 * 1024, 8 * 1024 * 1024];
const PAIRED_SAMPLES = 20;
const WARMUP_PAIRS = 3;
const CURRENT_DISK_BYTES = 32 * 1024 * 1024;
const NEXT_DISK_BYTES = 8 * 1024 * 1024;
const MEDIA_BUFFER_BYTES = 8 * 1024 * 1024;
const PENDING_WRITE_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 120000;
const COMPONENTS = ['proxy-forward', 'capture-discard', 'full-realdisk'];
const NETWORK_PROFILES = {
  unpaced: {chunkBytes: 65536, paceMs: 0, label: 'unpaced-loopback-source'},
  paced: {chunkBytes: 262144, paceMs: 2, label: 'paced-loopback-source'},
};
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');

function quantile(values, p) {
  if (!values.length) return null;
  return [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)];
}
function summary(values) {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return {count: 0, p50: null, p95: null, min: null, max: null};
  return {count: valid.length, p50: quantile(valid, 0.5), p95: quantile(valid, 0.95),
    min: Math.min(...valid), max: Math.max(...valid)};
}
function sourceHashes() {
  return Promise.all(['components.cjs', 'proxy.cjs', 'store.cjs', 'index.cjs', '../../src/electronapp/enhanced/shared-playback-cache/store.js', '../../src/electronapp/enhanced/shared-playback-cache/index.js', '../../src/electronapp/enhanced/shared-playback-cache/proxy.js', 'fixture.cjs'].map(async file =>
    [file, sha256(await fs.readFile(path.join(__dirname, file)))]));
}
async function createComponent(name, mode, origin, out) {
  const root = path.join(out, name + '-root');
  const store = await createStore({root, currentBytes: CURRENT_DISK_BYTES,
    nextBytes: NEXT_DISK_BYTES, maxPendingBytes: PENDING_WRITE_BYTES});
  let discardedPuts = 0;
  if (mode === 'capture-discard') {
    store.put = async () => {discardedPuts++; return false;};
  }
  const proxy = await createProxy({store, cacheEnabled: mode !== 'proxy-forward',
    mediaBufferBytes: MEDIA_BUFFER_BYTES, authorize: async () => origin.grant()});
  return {name, mode, root, store, proxy, get discardedPuts() {return discardedPuts;}};
}

async function samplePath({name, direct, setup, origin, payloadBytes, index, kind}) {
  const startTime = performance.now();
  const requestsBefore = origin.requests.length;
  const proxyBefore = setup?.proxy.status();
  let handle = null, result = null, failure = null;
  let openMs = 0;
  try {
    if (!direct) {
      const openAt = performance.now();
      const item = `components-${name}-${payloadBytes}-${kind}-${index}`;
      handle = await setup.proxy.open(identity(item));
      await handle.ready();
      openMs = performance.now() - openAt;
    }
    const requestAt = performance.now();
    result = await get(direct ? origin.url : handle.url, 0, payloadBytes);
    const totalMs = performance.now() - startTime;
    const verified = result.status === 206 && result.body.length === payloadBytes &&
      result.hash === hash(origin.data.subarray(0, payloadBytes));
    if (!verified) failure = 'response-or-body-verification-failed';
    const firstByteMs = result.firstAt === null ? null : result.firstAt - startTime;
    const requestFirstByteMs = result.firstAt === null ? null : result.firstAt - requestAt;
    const row = {
      path: name, ok: verified, failure,
      payloadBytes, openMs,
      firstByteMs, requestFirstByteMs,
      totalMs,
      throughputBytesPerSecond: verified && totalMs > 0 ? payloadBytes * 1000 / totalMs : null,
      requestTtfbMs: result.ttfbMs,
      requestDurationMs: result.durationMs,
      requestThroughputBytesPerSecond: verified ? result.bytesPerSecond : null,
      bytesReceivedByClient: result.body.length,
      bodySha256: result.hash,
      ownedSourceRequests: origin.requests.length - requestsBefore,
      proxyOriginRequests: setup ? setup.proxy.status().originRequests - proxyBefore.originRequests : 0,
    };
    if (!verified) {row.ok = false; row.throughputBytesPerSecond = null;}
    return row;
  } catch {
    failure = 'request-failed';
    return {path: name, ok: false, failure, payloadBytes, openMs,
      firstByteMs: null, requestFirstByteMs: null,
      totalMs: performance.now() - startTime, throughputBytesPerSecond: null,
      requestTtfbMs: null, requestDurationMs: null, requestThroughputBytesPerSecond: null,
      bytesReceivedByClient: result?.body?.length || 0, bodySha256: null,
      ownedSourceRequests: origin.requests.length - requestsBefore,
      proxyOriginRequests: setup ? setup.proxy.status().originRequests - proxyBefore.originRequests : 0};
  } finally {
    if (handle) {
      await setup.proxy.drain();
      handle.retire();
      const key = await handle.ready().catch(() => null);
      if (key) await setup.store.invalidate(key);
    }
  }
}

async function comparePayload(payloadBytes, setup, origin) {
  const warmups = [], samples = [];
  for (let n = -WARMUP_PAIRS; n < PAIRED_SAMPLES; n++) {
    const order = Math.abs(n) % 2 === 0 ? ['direct', 'component'] : ['component', 'direct'];
    const rows = {};
    for (const arm of order) {
      const index = `${payloadBytes}-${n}-${arm}`;
      rows[arm] = arm === 'direct'
        ? await samplePath({name: 'direct', direct: true, origin, payloadBytes, index, kind: n < 0 ? 'warmup' : 'pair'})
        : await samplePath({name: setup.name, direct: false, setup, origin, payloadBytes, index, kind: n < 0 ? 'warmup' : 'pair'});
    }
    const pair = {iteration: n, order: order.join(''), direct: rows.direct, component: rows.component};
    (n < 0 ? warmups : samples).push(pair);
  }
  const valid = samples.filter(pair => pair.direct.ok && pair.component.ok);
  const componentPath = samples.map(pair => pair.component);
  const directMetrics = samples.map(pair => pair.direct);
  const allPairs = [...warmups, ...samples];
  const ratio = key => valid.map(pair => {
    const a = pair.direct[key], b = pair.component[key];
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0) return null;
    return b / a;
  }).filter(Number.isFinite);
  const proxyStats = setup.proxy.status();
  return {
    payloadBytes,
      component: setup.name,
    warmupPairs: warmups,
    samples,
    counts: {paired: samples.length, successfulPairs: valid.length,
      failedPairs: samples.length - valid.length,
      componentFailures: componentPath.filter(row => !row.ok).length,
      directFailures: directMetrics.filter(row => !row.ok).length},
    sourceRequestCounts: {
      directOwnedSourceRequests: allPairs.reduce((count, pair) => count + pair.direct.ownedSourceRequests, 0),
      componentOwnedSourceRequests: allPairs.reduce((count, pair) => count + pair.component.ownedSourceRequests, 0),
      componentProxyOriginRequests: allPairs.reduce((count, pair) => count + pair.component.proxyOriginRequests, 0),
    },
    latencyAndThroughput: {
      direct: {
        endToEndFirstByteMs: summary(directMetrics.filter(x => x.ok).map(x => x.firstByteMs)),
        endToEndTotalMs: summary(directMetrics.filter(x => x.ok).map(x => x.totalMs)),
        endToEndThroughputBytesPerSecond: summary(directMetrics.filter(x => x.ok).map(x => x.throughputBytesPerSecond)),
        requestTtfbMs: summary(directMetrics.filter(x => x.ok).map(x => x.requestTtfbMs)),
        requestDurationMs: summary(directMetrics.filter(x => x.ok).map(x => x.requestDurationMs)),
        requestThroughputBytesPerSecond: summary(directMetrics.filter(x => x.ok).map(x => x.requestThroughputBytesPerSecond)),
        firstByteMs: summary(directMetrics.filter(x => x.ok).map(x => x.firstByteMs)),
        totalMs: summary(directMetrics.filter(x => x.ok).map(x => x.totalMs)),
        throughputBytesPerSecond: summary(directMetrics.filter(x => x.ok).map(x => x.throughputBytesPerSecond)),
      },
      component: {
        endToEndFirstByteMs: summary(componentPath.filter(x => x.ok).map(x => x.firstByteMs)),
        endToEndTotalMs: summary(componentPath.filter(x => x.ok).map(x => x.totalMs)),
        endToEndThroughputBytesPerSecond: summary(componentPath.filter(x => x.ok).map(x => x.throughputBytesPerSecond)),
        requestTtfbMs: summary(componentPath.filter(x => x.ok).map(x => x.requestTtfbMs)),
        requestDurationMs: summary(componentPath.filter(x => x.ok).map(x => x.requestDurationMs)),
        requestThroughputBytesPerSecond: summary(componentPath.filter(x => x.ok).map(x => x.requestThroughputBytesPerSecond)),
        firstByteMs: summary(componentPath.filter(x => x.ok).map(x => x.firstByteMs)),
        totalMs: summary(componentPath.filter(x => x.ok).map(x => x.totalMs)),
        throughputBytesPerSecond: summary(componentPath.filter(x => x.ok).map(x => x.throughputBytesPerSecond)),
      },
      ratiosToDirect: {
        firstByte: summary(ratio('firstByteMs')),
        total: summary(ratio('totalMs')),
        throughput: summary(ratio('throughputBytesPerSecond')),
        requestTtfb: summary(ratio('requestTtfbMs')),
        requestDuration: summary(ratio('requestDurationMs')),
        requestThroughput: summary(ratio('requestThroughputBytesPerSecond')),
      },
    },
    resources: {
      peakMediaReservedBytes: proxyStats.peakMediaReservedBytes,
      peakCaptureBytes: proxyStats.peakCaptureBytes,
      skippedWrites: proxyStats.skippedWrites,
      peakWriteJobs: proxyStats.peakWriteJobs,
      localWrites: proxyStats.localWrites,
      backpressureWrites: proxyStats.backpressureWrites,
      originReadHighWaterMarkBytes: proxyStats.originReadHighWaterMarkBytes,
      localWriteHighWaterMarkBytes: proxyStats.localWriteHighWaterMarkBytes,
      originRequests: proxyStats.originRequests,
      committedBytes: proxyStats.committedBytes,
      discardedPutCalls: setup.discardedPuts,
      storePeakBytes: proxyStats.store.peak,
    },
  };
}

async function run(out, networkProfile = 'unpaced') {
  if (typeof out !== 'string' || !path.isAbsolute(out) || path.resolve(out) !== out ||
      out.startsWith(path.resolve(__dirname, '../..') + path.sep)) throw new Error('fresh-private-output-required');
  if (!Object.hasOwn(NETWORK_PROFILES, networkProfile)) throw new Error('invalid-network-profile');
  await fs.mkdir(out, {mode: 0o700});
  const outStat = await fs.stat(out);
  if (!outStat.isDirectory() || process.platform !== 'win32' && (outStat.mode & 0o077) !== 0) {
    throw new Error('private-output-required');
  }
  await fs.writeFile(path.join(out, 'owner'), 'ETE owned shared-cache components v1\n', {flag: 'wx', mode: 0o600});
  const sourceCodeSha256 = Object.fromEntries(await sourceHashes());
  const profile = NETWORK_PROFILES[networkProfile];
  const origin = await source({bytes: SOURCE_BYTES, firstDelay: 0, tailDelay: 0,
    chunkBytes: profile.chunkBytes, paceMs: profile.paceMs});
  const setups = [];
  const results = [];
  let stage = 'component-setup';
  let failureStage = null;
  try {
    for (const name of COMPONENTS) {
      const mode = name === 'proxy-forward' ? 'proxy-forward'
        : name === 'capture-discard' ? 'capture-discard' : 'full-realdisk';
      const setup = await createComponent(name, mode, origin, out);
      setups.push(setup);
      for (const payloadBytes of PAYLOADS) {
        stage = `${name}-${payloadBytes}-workload`;
        results.push(await comparePayload(payloadBytes, setup, origin));
      }
    }
    stage = 'report-assembly';
    const report = {
      schema: 'ete-shared-cache-components-v1',
      node: process.version,
      sourceCodeSha256,
      fixtureDataSha256: hash(origin.data),
      networkProfile: {
        name: networkProfile,
        label: profile.label,
        sourceChunkBytes: profile.chunkBytes,
        interChunkDelayMs: profile.paceMs,
        nominalChunkDeliveryBytesPerSecond: profile.paceMs ? profile.chunkBytes * 1000 / profile.paceMs : null,
        observedDirectRequestThroughputByPayload: results.map(result => ({
          component: result.component,
          payloadBytes: result.payloadBytes,
          medianBytesPerSecond: result.latencyAndThroughput.direct.requestThroughputBytesPerSecond.p50,
          p95BytesPerSecond: result.latencyAndThroughput.direct.requestThroughputBytesPerSecond.p95,
        })),
      },
      scope: {
        fixtureBytes: SOURCE_BYTES,
        payloadBytes: PAYLOADS,
        pairedSamples: PAIRED_SAMPLES,
        warmupPairs: WARMUP_PAIRS,
        ordering: 'alternating-direct-first-and-component-first',
        currentDiskBytes: CURRENT_DISK_BYTES,
        nextDiskBytes: NEXT_DISK_BYTES,
        mediaBufferBytes: MEDIA_BUFFER_BYTES,
        pendingWriteBytes: PENDING_WRITE_BYTES,
        source: 'anonymous-owned-loopback-deterministic-fixture',
        clientSourceAndComponentsShareProcess: true,
      },
      results,
      caveats: [
        'Source, proxy, store, and client run in this same Node process; this isolates component timings, not process memory.',
        'Loopback results do not represent LAN, native decode/presentation, Emby service, or any external media source.',
        'The paced source uses chunk delay timers; its nominal chunk rate is approximate and measured direct throughput is reported separately.',
        'The capture-discard path copies capture blocks and rejects store puts; it intentionally excludes block hashing and disk writes.',
        'Failed samples remain in the raw pair arrays and are excluded only from successful-pair summaries.',
      ],
    };
    const hashesAfter = Object.fromEntries(await sourceHashes());
    report.sourceCodeSha256After = hashesAfter;
    report.sourceDrift = Object.keys(sourceCodeSha256).some(file => sourceCodeSha256[file] !== hashesAfter[file]);
    report.sourceRequestsTotal = origin.requests.length;
    report.afterClose = [];
    for (const setup of setups) {
      await setup.proxy.close();
      const status = setup.proxy.status();
      report.afterClose.push({path: setup.name,
        activeOrigins: status.activeOrigins, activeBodies: status.activeBodies,
        captureBytes: status.captureBytes, readReservedBytes: status.readReservedBytes,
        routes: status.routes, writes: status.writes, jobs: status.jobs,
        storeClosed: status.store.closed});
    }
    report.afterCloseClean = report.afterClose.every(item => item.activeOrigins === 0 && item.activeBodies === 0 &&
      item.captureBytes === 0 && item.readReservedBytes === 0 && item.routes === 0 &&
      item.writes === 0 && item.jobs === 0 && item.storeClosed);
    stage = 'write-result';
    await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx', mode: 0o600});
    return report;
  } catch {
    failureStage = stage;
    throw new Error('components-experiment-failed');
  } finally {
    for (const setup of setups) {
      if (!setup.store.status().closed) await setup.proxy.close().catch(() => {});
    }
    await origin.close().catch(() => {});
    if (failureStage) {
      const partial = {
        schema: 'ete-shared-cache-components-partial-v1',
        node: process.version,
        networkProfile: networkProfile,
        sourceCodeSha256,
        fixtureDataSha256: hash(origin.data),
        sourceRequestsTotal: origin.requests.length,
        failureCode: 'components-experiment-failed',
        failureStage,
        completedPayloadResults: results,
      };
      await fs.writeFile(path.join(out, 'failure.json'), JSON.stringify(partial, null, 2) + '\n', {flag: 'wx', mode: 0o600}).catch(() => {});
    }
  }
}

module.exports = {run, quantile, summary};
if (require.main === module) {
  const args = process.argv.slice(2);
  let outputRoot = null, networkProfile = 'unpaced', networkSeen = false, invalid = args[0] !== '--run';
  for (let index = 1; index < args.length && !invalid;) {
    const flag = args[index++], value = args[index++];
    if (value === undefined) {invalid = true; break;}
    if (flag === '--out' && outputRoot === null) outputRoot = value;
    else if (flag === '--network' && !networkSeen && ['paced', 'unpaced'].includes(value)) {
      networkProfile = value; networkSeen = true;
    }
    else invalid = true;
  }
  if (invalid || outputRoot === null) {
    process.stderr.write('Explicit --run --out ABSOLUTE_FRESH_PRIVATE_ROOT [--network paced|unpaced] required\n');
    process.exitCode = 1;
  } else run(outputRoot, networkProfile).then(report => {
    process.stdout.write(JSON.stringify({schema: report.schema, node: report.node,
      networkProfile: report.networkProfile.name, resultCount: report.results.length, afterCloseClean: report.afterCloseClean,
      sourceDrift: report.sourceDrift}, null, 2) + '\n');
    if (report.sourceDrift || !report.afterCloseClean) process.exitCode = 1;
  }).catch(() => {
    process.stderr.write('components-experiment-failed\n');
    process.exitCode = 1;
  });
}
