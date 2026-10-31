'use strict';

// Fresh-process recovery comparison for an already-owned synthetic quota tree.
// Called by quota.runScenario's optional recoveryProbe hook; no default path or
// product setting is created here.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {fork} = require('node:child_process');
const {performance} = require('node:perf_hooks');

const CHILD_TIMEOUT_MS = 120_000;
const MODES = ['verified', 'on-demand'];
const fixedFailure = code => Object.assign(new Error(code), {code});
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

async function sourceHashes() {
  const root = path.resolve(__dirname, '../../src/electronapp/enhanced/shared-playback-cache');
  const files = ['store.js', 'index.js'];
  const result = {};
  for (const file of files) result[file] = sha256(await fs.readFile(path.join(root, file)));
  result['recovery.cjs'] = sha256(await fs.readFile(__filename));
  result['fixture.cjs'] = sha256(await fs.readFile(path.join(__dirname, 'fixture.cjs')));
  return result;
}

function childRun(config) {
  return new Promise((resolve, reject) => {
    const child = fork(__filename, [], {execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc']});
    let settled = false, timer;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeAllListeners('message');
      if (error) reject(error); else resolve(value);
    };
    const waitExit = () => new Promise(done => {
      if (child.exitCode !== null || child.signalCode !== null) return done(true);
      const exitTimer = setTimeout(() => {child.removeListener('exit', exited); done(false);}, 5000);
      const exited = () => {clearTimeout(exitTimer); done(true);};
      child.once('exit', exited);
    });
    const stopAndFail = async code => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await waitExit();
      finish(fixedFailure(code));
    };
    timer = setTimeout(() => {stopAndFail('recovery-child-timeout');}, CHILD_TIMEOUT_MS);
    child.once('error', () => {stopAndFail('recovery-child-error');});
    child.once('message', message => {
      if (!message || message.kind !== 'result' || !message.result) {
        stopAndFail('recovery-child-invalid-result'); return;
      }
      child.once('exit', (code, signal) => {
        if (code !== 0 || signal) finish(fixedFailure('recovery-child-exit-failed'));
        else finish(null, {...message.result, processExited: true, exitCode: code});
      });
    });
    child.send({kind: 'run', config});
  });
}

async function runRecoveryProbe({root, actualKey, metadata, currentBytes, nextBytes, expectedBlockSha256}) {
  if (typeof root !== 'string' || !path.isAbsolute(root) || path.resolve(root) !== root ||
      typeof actualKey !== 'string' || !/^[a-f0-9]{64}$/.test(actualKey) ||
      !metadata || !Number.isSafeInteger(metadata.total) || metadata.total <= 0 ||
      ![currentBytes, nextBytes].every(value => Number.isSafeInteger(value) && value > 0) ||
      typeof expectedBlockSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedBlockSha256)) {
    throw fixedFailure('recovery-probe-input-invalid');
  }
  const codeHashes = await sourceHashes();
  const modes = [];
  for (const mode of MODES) {
    modes.push(await childRun({root, actualKey, metadata, currentBytes, nextBytes,
      expectedBlockSha256, mode}));
  }
  return {
    schema: 'ete-shared-cache-recovery-probe-v1',
    node: process.version,
    sourceCodeSha256: codeHashes,
    processModel: 'two-fresh-sequential-child-processes-verified-then-on-demand',
    fixture: 'owned-local-synthetic-cache-tree-existing-actual-A-no-copy',
    osPageCache: 'not-cleared-between-children',
    modes,
  };
}

async function runChild(config) {
  if (!config || !MODES.includes(config.mode)) throw fixedFailure('recovery-child-input-invalid');
  const {createStore} = require('./store.cjs');
  let mediaBytesRead = 0;
  const io = {...fs, async open(file, ...args) {
    const handle = await fs.open(file, ...args);
    if (path.dirname(file) !== path.join(config.root, 'blocks') || !String(file).endsWith('.bin')) return handle;
    return {stat: (...a) => handle.stat(...a), close: (...a) => handle.close(...a),
      async read(...a) {const result = await handle.read(...a); mediaBytesRead += result.bytesRead; return result;}};
  }};
  const rssBeforeBytes = process.memoryUsage().rss;
  let peakRssBytes = rssBeforeBytes, peakExternalBytes = process.memoryUsage().external;
  const sampler = setInterval(() => {
    const memory = process.memoryUsage();
    peakRssBytes = Math.max(peakRssBytes, memory.rss);
    peakExternalBytes = Math.max(peakExternalBytes, memory.external);
  }, 2);
  let store;
  const started = performance.now();
  try {
    store = await createStore({root: config.root, currentBytes: config.currentBytes,
      nextBytes: config.nextBytes, recoveryMode: config.mode, io});
    const startupMs = performance.now() - started;
    const afterStartup = process.memoryUsage();
    peakRssBytes = Math.max(peakRssBytes, afterStartup.rss);
    peakExternalBytes = Math.max(peakExternalBytes, afterStartup.external);
    const startupMediaBytesRead = mediaBytesRead;
    const initialStatus = store.status();
    if (initialStatus.currentKey !== config.actualKey || initialStatus.faulted ||
        initialStatus.committed > config.currentBytes + config.nextBytes) {
      throw fixedFailure('recovery-child-state-invalid');
    }
    if (config.mode === 'on-demand' && mediaBytesRead !== 0) {
      throw fixedFailure('on-demand-startup-read-media');
    }
    const candidate = await store.span(config.actualKey, 0);
    const readOffset = candidate?.start ?? await store.nextOffset(config.actualKey, 0);
    if (!Number.isSafeInteger(readOffset) || readOffset < 0) throw fixedFailure('recovery-child-candidate-missing');
    const readLength = Math.min(256 * 1024, config.metadata.total - readOffset);
    const beforeReadBytes = mediaBytesRead;
    const readStarted = performance.now();
    const data = await store.read(config.actualKey, readOffset, readLength);
    const readDurationMs = performance.now() - readStarted;
    const readMemory = process.memoryUsage();
    peakRssBytes = Math.max(peakRssBytes, readMemory.rss);
    peakExternalBytes = Math.max(peakExternalBytes, readMemory.external);
    if (!data || data.length !== readLength || sha256(data) !== config.expectedBlockSha256) {
      throw fixedFailure('recovery-child-sha-check-failed');
    }
    const afterReadStatus = store.status();
    if (afterReadStatus.faulted || afterReadStatus.pending !== 0 || afterReadStatus.readers !== 0 ||
        afterReadStatus.committed > config.currentBytes + config.nextBytes ||
        config.mode === 'on-demand' && afterReadStatus.unverifiedBytes !== initialStatus.unverifiedBytes - readLength) {
      throw fixedFailure('recovery-child-bound-check-failed');
    }
    await store.close();
    const finalStatus = store.status();
    if (!finalStatus.closed || finalStatus.pending !== 0 || finalStatus.readers !== 0) {
      throw fixedFailure('recovery-child-cleanup-failed');
    }
    return {
      mode: config.mode,
      startupMs,
      firstRead: {offset: readOffset, bytes: data.length, durationMs: readDurationMs,
        bytesPerSecond: readDurationMs > 0 ? data.length * 1000 / readDurationMs : null,
        sha256MatchesExpected: true},
      memoryBytes: {rssBefore: rssBeforeBytes, rssAfterStartup: afterStartup.rss,
        rssAfterFirstRead: readMemory.rss, peakRss: peakRssBytes,
        externalAfterStartup: afterStartup.external, externalAfterFirstRead: readMemory.external,
        peakExternal: peakExternalBytes},
      configuredDiskBudgetBytes: {current: config.currentBytes, next: config.nextBytes,
        combined: config.currentBytes + config.nextBytes},
      occupancy: {startupCommitted: initialStatus.committed, startupUnverified: initialStatus.unverifiedBytes,
        afterFirstReadCommitted: afterReadStatus.committed, afterFirstReadUnverified: afterReadStatus.unverifiedBytes},
      mediaBytesReadDuringStartup: startupMediaBytesRead,
      mediaBytesReadForFirstRead: mediaBytesRead - beforeReadBytes,
      closed: finalStatus.closed,
    };
  } finally {
    clearInterval(sampler);
    if (store && !store.status().closed) await store.close();
  }
}

if (process.send) {
  process.once('message', message => {
    if (!message || message.kind !== 'run') {process.exitCode = 1; return;}
    runChild(message.config).then(result => process.send({kind: 'result', result}), () => {
      process.send({kind: 'result', result: {failure: 'recovery-child-failed'}});
      process.exitCode = 1;
    });
  });
}

module.exports = {CHILD_TIMEOUT_MS, MODES, runRecoveryProbe};
