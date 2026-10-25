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
const MEDIA_BUFFER_BYTES = 2 * 1024 * 1024;
const PENDING_WRITE_BYTES = 512 * 1024;
const PRELOAD_BYTES = 1024 * 1024;
const TIMEOUT_MS = 120000;
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');

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
  return {status: result.status, bytes: result.body.length,
    verified: result.status === 206 && result.body.length === length &&
      result.hash === hash(expectedData.subarray(start, start + length))};
}

async function measureMode(mode, origin, root) {
  const child = fork(path.join(__dirname, 'memory-child.cjs'), [], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    serialization: 'json',
  });
  const session = new Session(child);
  try {
    session.send({type: 'setup', config: {mode, root, currentDiskBytes: CURRENT_DISK_BYTES,
      nextDiskBytes: NEXT_DISK_BYTES, mediaBufferBytes: MEDIA_BUFFER_BYTES,
      pendingWriteBytes: PENDING_WRITE_BYTES}, grant: origin.grant()});
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
    if (first.bytes + second.bytes + nextRead.bytes !== expectedClientBytes) throw new Error('workload byte count mismatch');
    return {
      mode,
      config: {mediaBytes: MEDIA_BYTES, currentDiskBytes: CURRENT_DISK_BYTES,
        nextDiskBytes: NEXT_DISK_BYTES, mediaBufferBytes: MEDIA_BUFFER_BYTES,
        pendingWriteBytes: PENDING_WRITE_BYTES},
      workload: {firstPlayback: first, repeatPlayback: second,
        preloadBytes: preloaded.spent, preloadPlayback: nextRead,
        allClientBodiesVerified: true},
      memory: {
        baseline: report.baseline,
        peak: report.peak,
        peakDelta: Object.fromEntries(['rss', 'heapUsed', 'external'].map(key => [key, report.peak[key] - report.baseline[key]])),
      },
      reservations: report.reservations,
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

async function main(outputRoot) {
  if (typeof outputRoot !== 'string' || !path.isAbsolute(outputRoot) || path.resolve(outputRoot) !== outputRoot ||
      outputRoot.startsWith(path.resolve(__dirname, '../..') + path.sep)) {
    throw new Error('fresh-private-output-required');
  }
  await fs.mkdir(outputRoot, {mode: 0o700});
  const stat = await fs.stat(outputRoot);
  if (!stat.isDirectory() || process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
    throw new Error('output directory must be private');
  }
  await fs.writeFile(path.join(outputRoot, 'owner'), 'ETE owned shared-cache memory measurement v1\n', {flag: 'wx', mode: 0o600});
  const origin = await source({bytes: MEDIA_BYTES, firstDelay: 0, tailDelay: 0, paceMs: 0});
  try {
    const forward = await measureMode('forward-only', origin, path.join(outputRoot, 'forward-only-root'));
    const cached = await measureMode('cache-enabled', origin, path.join(outputRoot, 'cache-enabled-root'));
    const sourceCodeSha256 = {};
    for (const file of ['memory.cjs', 'memory-child.cjs', 'proxy.cjs', 'store.cjs', 'fixture.cjs']) {
      sourceCodeSha256[file] = sha256(await fs.readFile(path.join(__dirname, file)));
    }
    const result = {
      schema: 'ete-shared-cache-memory-measurement-v1',
      node: process.version,
      sourceCodeSha256,
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
  } finally {
    await origin.close();
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 3 || args[0] !== '--run' || args[1] !== '--out') {
    process.stderr.write('Explicit --run --out ABSOLUTE_FRESH_PRIVATE_ROOT required\n');
    process.exitCode = 1;
  } else main(args[2]).catch(() => {
    process.stderr.write('memory-experiment-failed\n');
    process.exitCode = 1;
  });
}

module.exports = {measureMode};
