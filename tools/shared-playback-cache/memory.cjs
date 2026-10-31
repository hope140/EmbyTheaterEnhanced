'use strict';

// Parent-side memory experiment. The deterministic source and both HTTP
// clients stay here; only the proxy and store run in memory-child.cjs.
const fs = require('node:fs/promises');
const path = require('node:path');
const {fork} = require('node:child_process');
const crypto = require('node:crypto');
const {source, get, hash} = require('./fixture.cjs');

const MEDIA_BYTES = 8 * 1024 * 1024;
const CURRENT_DISK_BYTES = 8 * 1024 * 1024;
const NEXT_DISK_BYTES = 1024 * 1024;
const MEDIA_BUFFER_BYTES = 8 * 1024 * 1024;
const PENDING_WRITE_BYTES = 2 * 1024 * 1024;
const PRELOAD_BYTES = 1024 * 1024;
const TIMEOUT_MS = 120000;
const MIB = 1024 * 1024;
const MATRIX_RESERVATIONS = [1, 4, 8, 16, 32].map(value => value * MIB);
const MATRIX_REPLICATES = 3;
const MATRIX_DISK_BYTES = 8 * MIB;
const MATRIX_NEXT_DISK_BYTES = 1 * MIB;
const MATRIX_MAX_PENDING_BYTES = 2 * MIB;
const SOURCE_PROFILES = {
  unpaced: {chunkBytes: 65536, paceMs: 0},
  paced: {chunkBytes: 65536, paceMs: 2},
};
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');

function pendingLimitForReservation(mediaBufferBytes) {
  if (!Number.isSafeInteger(mediaBufferBytes) || mediaBufferBytes <= 0) throw new TypeError('invalid media reservation');
  return Math.min(Math.floor(mediaBufferBytes / 2), MATRIX_MAX_PENDING_BYTES);
}
function matrixPlan() {
  return MATRIX_RESERVATIONS.map(mediaBufferBytes => ({mediaBufferBytes,
    pendingWriteBytes: pendingLimitForReservation(mediaBufferBytes), replicates: MATRIX_REPLICATES}));
}
function matrixArmOrder(replicateIndex) {
  if (!Number.isSafeInteger(replicateIndex) || replicateIndex < 0) throw new TypeError('invalid replicate index');
  return replicateIndex % 2 === 0 ? ['forward-only', 'cache-enabled'] : ['cache-enabled', 'forward-only'];
}
function playbackMetrics(bytes, durationMs) {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || !Number.isFinite(durationMs) || durationMs < 0) {
    throw new TypeError('invalid playback measurement');
  }
  return {bytes, actualBytes: bytes, durationMs,
    megabytesPerSecond: durationMs > 0 ? bytes / (durationMs * 1000) : null};
}

function timeout(promise, label, ms = TIMEOUT_MS) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label + ' timeout')), ms);
  })]).finally(() => clearTimeout(timer));
}

class Session {
  constructor(child) {
    this.child = child;
    this.queue = [];
    this.waiters = [];
    child.on('message', message => {
      if (message?.type === 'failure') {
        const error = new Error('memory worker failure: ' + (message.error || 'unknown'));
        for (const waiter of this.waiters.splice(0)) waiter.reject(error);
        this.queue.push({type: 'failure', error: message.error || 'unknown'});
        return;
      }
      const index = this.waiters.findIndex(waiter => waiter.type === message?.type);
      if (index >= 0) this.waiters.splice(index, 1)[0].resolve(message);
      else this.queue.push(message);
    });
    child.on('error', () => {
      for (const waiter of this.waiters.splice(0)) waiter.reject(new Error('memory worker process error'));
    });
    child.on('exit', (code, signal) => {
      this.exitResult = {code, signal};
      for (const waiter of this.waiters.splice(0)) waiter.reject(new Error('memory worker exited before reply'));
    });
  }
  send(message) {
    if (!this.child.connected) throw new Error('memory worker IPC closed');
    this.child.send(message);
  }
  wait(type) {
    const index = this.queue.findIndex(item => item?.type === type || item?.type === 'failure');
    if (index >= 0) {
      const item = this.queue.splice(index, 1)[0];
      if (item.type === 'failure') return Promise.reject(new Error('memory worker failure: ' + item.error));
      return Promise.resolve(item);
    }
    if (this.exitResult) return Promise.reject(new Error('memory worker already exited'));
    return new Promise((resolve, reject) => this.waiters.push({type, resolve, reject}));
  }
  async request(message, expected) {
    const answer = this.wait(expected);
    this.send(message);
    return timeout(answer, expected);
  }
  async exit(ms = TIMEOUT_MS) {
    if (this.exitResult) return this.exitResult;
    return timeout(new Promise(resolve => this.child.once('exit', (code, signal) => resolve({code, signal}))), 'worker exit', ms);
  }
}

async function stopAndJoin(session) {
  const child = session.child;
  if (child.exitCode !== null || child.signalCode !== null || session.exitResult) return session.exit();
  child.kill();
  try {return await session.exit(5000);}
  catch {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    return session.exit(5000);
  }
}

async function readAndVerify(url, start, length, expectedData) {
  const result = await get(url, start, length);
  return {status: result.status, ...playbackMetrics(result.body.length, result.durationMs),
    verified: result.status === 206 && result.body.length === length &&
      result.hash === hash(expectedData.subarray(start, start + length))};
}

async function measureMode(mode, origin, root, {
  mediaBufferBytes = MEDIA_BUFFER_BYTES,
  pendingWriteBytes = PENDING_WRITE_BYTES,
  currentDiskBytes = CURRENT_DISK_BYTES,
  nextDiskBytes = NEXT_DISK_BYTES,
} = {}) {
  const child = fork(path.join(__dirname, 'memory-child.cjs'), [], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    serialization: 'json',
  });
  const session = new Session(child);
  try {
    session.send({type: 'setup', config: {mode, root, currentDiskBytes,
      nextDiskBytes, mediaBufferBytes, pendingWriteBytes}, grant: origin.grant()});
    const ready = await timeout(session.wait('ready'), 'worker setup');
    const first = await readAndVerify(ready.currentUrl, 0, MEDIA_BYTES, origin.data);
    if (!first.verified) throw new Error('first playback integrity check failed');
    await session.request({type: 'drain'}, 'drained');
    const second = await readAndVerify(ready.currentUrl, 0, MEDIA_BYTES, origin.data);
    if (!second.verified) throw new Error('repeat playback integrity check failed');
    const preloaded = await session.request({type: 'preload'}, 'preloaded');
    if (preloaded.spent !== PRELOAD_BYTES) throw new Error('preload budget was not consumed exactly');
    const nextRead = await readAndVerify(ready.nextUrl, 0, 256 * 1024, origin.data);
    if (!nextRead.verified) throw new Error('preload playback integrity check failed');
    const measured = await session.request({type: 'status'}, 'status');
    const finished = session.wait('finished');
    session.send({type: 'finish'});
    const {report} = await timeout(finished, 'worker close');
    const exit = await session.exit();
    if (exit.code !== 0 || exit.signal !== null) throw new Error('memory worker did not exit cleanly');
    const expectedClientBytes = MEDIA_BYTES * 2 + 256 * 1024;
    if (first.actualBytes + second.actualBytes + nextRead.actualBytes !== expectedClientBytes) throw new Error('workload byte count mismatch');
    const checks = {
      mediaReservationWithinCap: report.reservations.peakMediaBytes <= mediaBufferBytes,
      storePeakWithinDiskBudgets: report.disk.peakStoreBytes <= currentDiskBytes + nextDiskBytes,
      pendingWritePeakWithinCap: report.writePressure.peakPendingBytes <= pendingWriteBytes,
      pendingAndReservedAtDrainZero: report.disk.pendingBytesAtDrain === 0 && report.disk.reservedBytesAtDrain === 0,
      logicalMediaWritesMatchSuccessfulProxyCommits: report.completedLogicalWrites.mediaBlockTempBytes === report.activity.committedBytes,
      storeCommittedWithinDiskBudgets: report.disk.committedBytes <= currentDiskBytes + nextDiskBytes,
      proxyDrainedAtClose: report.activity.activeOriginsAtClose === 0 && report.activity.activeBodiesAtClose === 0 &&
        report.activity.routesAtClose === 0 && report.activity.openingsAtClose === 0 &&
        report.activity.pendingKeysAtClose === 0 && report.activity.queuedAtClose === 0 &&
        report.activity.writesAtClose === 0 && report.activity.jobsAtClose === 0 &&
        report.activity.captureBytesAtClose === 0 && report.activity.readReservedBytesAtClose === 0,
      storeDrainedAtClose: report.activity.storeReservedBytesAtClose === 0 &&
        report.activity.storePendingBytesAtClose === 0 && report.activity.storePendingCountAtClose === 0 &&
        report.activity.storeReadersAtClose === 0 && report.activity.storeClosed,
    };
    if (Object.values(checks).some(value => !value)) throw new Error('memory-resource-invariant-failed');
    return {
      mode,
      config: {mediaBytes: MEDIA_BYTES, currentDiskBytes, nextDiskBytes,
        mediaBufferBytes, pendingWriteBytes},
      workload: {firstPlayback: first, repeatPlayback: second,
        preloadBytes: preloaded.spent, preloadPlayback: nextRead,
        allClientBodiesVerified: true},
      memory: {
        baseline: report.baseline,
        peak: report.peak,
        peakDelta: Object.fromEntries(['rss', 'heapUsed', 'external'].map(key => [key, report.peak[key] - report.baseline[key]])),
      },
      reservations: report.reservations,
      disk: report.disk,
      completedLogicalWrites: report.completedLogicalWrites,
      writePressure: report.writePressure,
      resourceChecks: checks,
      activity: {...report.activity,
        statusHitBytes: measured.hitBytes,
        statusReceivedBytes: measured.receivedBytes,
        statusOriginRequests: measured.originRequests,
        statusCommittedBytes: measured.committedBytes,
        processExited: exit.code === 0},
    };
  } catch (error) {
    await stopAndJoin(session).catch(() => {});
    throw error;
  }
}

async function createOutputRoot(outputRoot, ownerText) {
  if (typeof outputRoot !== 'string' || !path.isAbsolute(outputRoot) || path.resolve(outputRoot) !== outputRoot ||
      outputRoot.startsWith(path.resolve(__dirname, '../..') + path.sep)) {
    throw new Error('fresh-private-output-required');
  }
  await fs.mkdir(outputRoot, {mode: 0o700});
  const stat = await fs.stat(outputRoot);
  if (!stat.isDirectory() || process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
    throw new Error('output directory must be private');
  }
  await fs.writeFile(path.join(outputRoot, 'owner'), ownerText, {flag: 'wx', mode: 0o600});
}

async function sourceHashes() {
  const hashes = {};
  for (const file of ['memory.cjs', 'memory-child.cjs', 'proxy.cjs', 'store.cjs', 'index.cjs', '../../src/electronapp/enhanced/shared-playback-cache/store.js', '../../src/electronapp/enhanced/shared-playback-cache/index.js', '../../src/electronapp/enhanced/shared-playback-cache/proxy.js', 'fixture.cjs']) {
    hashes[file] = sha256(await fs.readFile(path.join(__dirname, file)));
  }
  return hashes;
}

async function main(outputRoot) {
  await createOutputRoot(outputRoot, 'ETE owned shared-cache memory measurement v1\n');
  const sourceCodeSha256Before = await sourceHashes();
  const origin = await source({bytes: MEDIA_BYTES, firstDelay: 0, tailDelay: 0, paceMs: 0});
  try {
    const forward = await measureMode('forward-only', origin, path.join(outputRoot, 'forward-only-root'));
    const cached = await measureMode('cache-enabled', origin, path.join(outputRoot, 'cache-enabled-root'));
    const sourceCodeSha256After = await sourceHashes();
    const result = {
      schema: 'ete-shared-cache-memory-measurement-v1',
      node: process.version,
      sourceCodeSha256Before,
      sourceCodeSha256After,
      sourceDrift: Object.keys(sourceCodeSha256Before).some(file => sourceCodeSha256Before[file] !== sourceCodeSha256After[file]),
      sourceRequestsTotal: origin.requests.length,
      constraints: {
        fixtureDataSha256: hash(origin.data),
        sourceBytes: MEDIA_BYTES,
        currentDiskBytes: CURRENT_DISK_BYTES,
        nextDiskBytes: NEXT_DISK_BYTES,
        mediaBufferBytes: MEDIA_BUFFER_BYTES,
        pendingWriteBytes: PENDING_WRITE_BYTES,
        source: 'anonymous-loopback-deterministic-fixture',
        clientAndSourceOutsideMeasuredProcess: true,
        freshPrivateRootPerMode: true,
      },
      measurements: [forward, cached],
      interpretation: {
        caveats: [
          'RSS includes the Node runtime allocator, code, and socket buffers; it is not a cache-buffer-only measurement.',
          'Memory peaks are sampled every 2 ms and can miss shorter-lived peaks.',
          'mediaBufferBytes bounds the proxy-managed capture/read reservations; it does not assert a whole-process RAM ceiling.',
        ],
      },
    };
    const serialized = JSON.stringify(result, null, 2) + '\n';
    await fs.writeFile(path.join(outputRoot, 'receipt.json'), serialized, {flag: 'wx', mode: 0o600});
    process.stdout.write(serialized);
    return result;
  } finally {
    await origin.close();
  }
}

async function runMatrix(outputRoot, network = 'unpaced') {
  if (!Object.hasOwn(SOURCE_PROFILES, network)) throw new Error('invalid-network-profile');
  await createOutputRoot(outputRoot, 'ETE owned shared-cache memory reservation matrix v1\n');
  const sourceCodeSha256Before = await sourceHashes();
  const profile = SOURCE_PROFILES[network];
  const origin = await source({bytes: MEDIA_BYTES, firstDelay: 0, tailDelay: 0,
    chunkBytes: profile.chunkBytes, paceMs: profile.paceMs});
  const measurements = [];
  try {
    for (const {mediaBufferBytes, pendingWriteBytes, replicates} of matrixPlan()) {
      for (let replicate = 0; replicate < replicates; replicate++) {
        const armOrder = matrixArmOrder(replicate);
        const directSourcePlayback = await readAndVerify(origin.url, 0, MEDIA_BYTES, origin.data);
        if (!directSourcePlayback.verified) throw new Error('direct-source-baseline-invalid');
        for (const mode of armOrder) {
          const root = path.join(outputRoot,
            `B-${mediaBufferBytes / MIB}MiB-rep-${replicate + 1}-${mode}-root`);
          const measurement = await measureMode(mode, origin, root, {
            mediaBufferBytes,
            pendingWriteBytes,
            currentDiskBytes: MATRIX_DISK_BYTES,
            nextDiskBytes: MATRIX_NEXT_DISK_BYTES,
          });
          measurements.push({mediaBufferBytes, pendingWriteBytes, replicate: replicate + 1,
            armOrder, armPosition: armOrder.indexOf(mode), mode, directSourcePlayback, measurement,
            directSourceBaselineOrder: 'before-both-worker-arms',
            reservationUtilization: {
              bytes: measurement.reservations.peakMediaBytes,
              fractionOfBudget: measurement.reservations.peakMediaBytes / mediaBufferBytes,
            }});
        }
      }
    }
    const sourceCodeSha256After = await sourceHashes();
    const result = {
      schema: 'ete-shared-cache-memory-matrix-v1',
      node: process.version,
      sourceCodeSha256Before,
      sourceCodeSha256After,
      sourceDrift: Object.keys(sourceCodeSha256Before).some(file => sourceCodeSha256Before[file] !== sourceCodeSha256After[file]),
      constraints: {
        fixtureDataSha256: hash(origin.data),
        mediaBytes: MEDIA_BYTES,
        mediaReservationBytes: MATRIX_RESERVATIONS,
        pendingWriteBytesRule: 'min(mediaReservationBytes / 2, 2 MiB)',
        currentDiskBytes: MATRIX_DISK_BYTES,
        nextDiskBytes: MATRIX_NEXT_DISK_BYTES,
        replicatesPerArmAndReservation: MATRIX_REPLICATES,
        arms: ['forward-only', 'cache-enabled'],
        armOrder: 'alternates by replicate within each reservation value',
        captureJobs: 8,
        network: {name: network, chunkBytes: profile.chunkBytes, interChunkDelayMs: profile.paceMs,
          nominalChunkDeliveryBytesPerSecond: profile.paceMs ? profile.chunkBytes * 1000 / profile.paceMs : null,
          nominalChunkDeliveryMegabitsPerSecond: profile.paceMs ? profile.chunkBytes * 8 / profile.paceMs / 1000 : null},
        sourceAndClientsOutsideMeasuredWorker: true,
      },
      measurements,
      interpretation: {caveats: [
        'mediaReservationBytes is a proxy-managed reservation cap, not a whole-process RSS limit.',
        'Caps above the 8 MiB fixture size may not be fully used; measured peak reservations show actual use.',
        'RSS includes runtime allocator, code, and sockets. Peak memory is sampled every 2 ms.',
        'Disk write byte totals are logical completed temporary-file write lengths, not physical disk sectors.',
        'Paced rates are approximate Node timer pacing; playback bytes, duration, and decimal MB/s are measured from each GET.',
        'The origin direct-source read precedes both worker arms and is diagnostic; it is not a native A/B gate.',
      ]},
    };
    await fs.writeFile(path.join(outputRoot, 'matrix-receipt.json'), JSON.stringify(result, null, 2) + '\n',
      {flag: 'wx', mode: 0o600});
    return result;
  } finally {
    await origin.close();
  }
}

function parseCli(args) {
  const command = args[0];
  if (!['--run', '--matrix'].includes(command)) return null;
  let outputRoot = null, network = null;
  for (let index = 1; index < args.length;) {
    const flag = args[index++], value = args[index++];
    if (value === undefined) return null;
    if (flag === '--out' && outputRoot === null) outputRoot = value;
    else if (flag === '--network' && network === null && ['unpaced', 'paced'].includes(value)) network = value;
    else return null;
  }
  if (outputRoot === null || command === '--run' && network !== null || command === '--matrix' && network === null) return null;
  return {command, outputRoot, network};
}

if (require.main === module) {
  const args = parseCli(process.argv.slice(2));
  if (!args) {
    process.stderr.write('Use --run --out ABSOLUTE_FRESH_PRIVATE_ROOT or --matrix --network unpaced|paced --out ABSOLUTE_FRESH_PRIVATE_ROOT\n');
    process.exitCode = 1;
  } else (args.command === '--run' ? main(args.outputRoot) : runMatrix(args.outputRoot, args.network)).then(result => {
    process.stdout.write(JSON.stringify({schema: result.schema, node: result.node,
      measurementCount: result.measurements.length, sourceDrift: result.sourceDrift}, null, 2) + '\n');
    if (result.sourceDrift) process.exitCode = 1;
  }).catch(() => {
    process.stderr.write('memory-experiment-failed\n');
    process.exitCode = 1;
  });
}

module.exports = {main, runMatrix, measureMode, matrixPlan, matrixArmOrder, pendingLimitForReservation, playbackMetrics, parseCli};
