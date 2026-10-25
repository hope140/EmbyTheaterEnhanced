'use strict';

// Explicit real-disk quota probe. One fixed block represents a logical source;
// no source file, network request, native player, or whole-media buffer is used.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {performance} = require('node:perf_hooks');
const {createStore} = require('./store.cjs');

const BLOCK = 256 * 1024;
const MIB = 1024 * 1024;
const DEFAULT_DEADLINE_MS = 15 * 60 * 1000;
const SCENARIOS = Object.freeze([
  Object.freeze({name: 'm300-p100', currentBytes: 300 * MIB, nextBytes: 100 * MIB,
    logicalBytes: 4 * 1024 * MIB, mode: 'budgets', maxEntries: 4096}),
  Object.freeze({name: 'm3072-p500-row-limit', currentBytes: 3072 * MIB, nextBytes: 500 * MIB,
    logicalBytes: 4 * 1024 * MIB, mode: 'admission', maxEntries: 4096}),
]);
const failure = code => Object.assign(new Error(code), {code});
const safeFailure = error => ['quota-cancelled', 'quota-deadline'].includes(error.code)
  ? error.code : 'quota-experiment-failed';
const identity = item => ({server: 'owned-local-quota', account: 'anonymous-owned',
  item, mediaSource: 'fixed-logical-source', resource: 'owned-quota-' + item, representation: 'original'});

function assertBounds(status, config) {
  if (status.current > config.currentBytes || status.next > config.nextBytes ||
      status.current + status.next > config.currentBytes + config.nextBytes ||
      status.peak > config.currentBytes + config.nextBytes || status.pending > 2 * MIB ||
      status.faulted) throw failure('quota-bound-check-failed');
}

async function freshPrivateDirectory(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root) || path.resolve(root) !== root) {
    throw failure('fresh-private-output-required');
  }
  const repository = path.resolve(__dirname, '../..');
  if (root === repository || root.startsWith(repository + path.sep)) throw failure('repository-output-refused');
  const parent = path.dirname(root);
  if (await fs.realpath(parent) !== parent) throw failure('redirected-output-refused');
  await fs.mkdir(root, {mode: 0o700}); // EEXIST is deliberately never accepted.
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() ||
      process.platform !== 'win32' && (stat.mode & 0o077)) throw failure('private-output-required');
}

async function inspectDisk(root) {
  const files = await fs.readdir(root);
  const blockFiles = await fs.readdir(path.join(root, 'blocks'));
  const index = JSON.parse(await fs.readFile(path.join(root, 'index.json'), 'utf8'));
  const result = {blockFiles: 0, blockBytes: 0, indexBytes: 0, ownerBytes: 0,
    tempFiles: 0, tempBytes: 0, allocatedFileBytes: 0, indexEntryRows: index.entries.length,
    indexBlockRows: index.entries.reduce((sum, entry) => sum + entry.blocks.length, 0),
    currentIndexedBytes: 0, nextIndexedBytes: 0};
  const indexed = new Set();
  for (const entry of index.entries) for (const block of entry.blocks) {
    indexed.add(block.file);
    result[entry.role === 'current' ? 'currentIndexedBytes' : 'nextIndexedBytes'] += block.length;
  }
  const candidates = files.filter(file => file !== 'blocks').map(file => ({file, inBlocks: false}))
    .concat(blockFiles.map(file => ({file, inBlocks: true})));
  for (let offset = 0; offset < candidates.length; offset += 64) {
    const rows = await Promise.all(candidates.slice(offset, offset + 64).map(async row => {
      const stat = await fs.lstat(path.join(root, ...(row.inBlocks ? ['blocks', row.file] : [row.file])));
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw failure('unsafe-owned-file');
      return {...row, stat};
    }));
    for (const {file, inBlocks, stat} of rows) {
      if (Number.isFinite(stat.blocks)) result.allocatedFileBytes += stat.blocks * 512;
      if (inBlocks && indexed.has(file)) {result.blockFiles++; result.blockBytes += stat.size;}
      else if (!inBlocks && file === 'index.json') result.indexBytes += stat.size;
      else if (!inBlocks && file === '.owner') result.ownerBytes += stat.size;
      else if (/^\.(?:block|index)-[a-f0-9-]+\.tmp$/.test(file)) {result.tempFiles++; result.tempBytes += stat.size;}
      else throw failure('unexpected-owned-file');
    }
  }
  if (result.blockFiles !== indexed.size) throw failure('missing-indexed-block');
  result.indexRows = result.indexEntryRows + result.indexBlockRows;
  result.totalFileBytes = result.blockBytes + result.indexBytes + result.ownerBytes + result.tempBytes;
  return result;
}

function validateConfig(config) {
  if (!config || !/^[a-z0-9-]+$/.test(config.name) || !['budgets', 'admission'].includes(config.mode) ||
      ![config.currentBytes, config.nextBytes, config.logicalBytes].every(value =>
        Number.isSafeInteger(value) && value >= BLOCK && value % BLOCK === 0) ||
      config.logicalBytes < Math.max(config.currentBytes, config.nextBytes) + BLOCK ||
      !Number.isSafeInteger(config.maxEntries) || config.maxEntries < 4 || config.maxEntries > 4096) {
    throw failure('quota-scenario-invalid');
  }
}

async function runScenario(root, config, {signal, deadlineMs = DEFAULT_DEADLINE_MS} = {}) {
  validateConfig(config);
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs <= 0) throw failure('quota-deadline-invalid');
  await freshPrivateDirectory(root);
  const started = performance.now(), payload = Buffer.alloc(BLOCK, 0x5a);
  const writes = {mediaBytes: 0, indexBytes: 0, ownerBytes: 0, mediaCalls: 0, indexCalls: 0};
  const report = {name: config.name, config: {...config}, blockBytes: BLOCK, maxPendingBytes: 2 * MIB,
    logicalWriteAccounting: 'completed-writeFile-byte-lengths-not-device-physical-writes',
    boundsContract: {payloadHardLimitBytes: config.currentBytes + config.nextBytes,
      roleChecksScope: 'sequential-quiescent-workload-without-read-leases', metadataCountedSeparately: true},
    operationsChecked: 0, peakRssBytes: process.memoryUsage().rss, milestones: [], rejections: []};
  let store, closed = false, a, b;
  const checkDeadline = () => {
    if (signal?.aborted) throw failure('quota-cancelled');
    if (performance.now() - started >= deadlineMs) throw failure('quota-deadline');
  };
  const check = () => {
    const status = store.status();
    assertBounds(status, config);
    report.operationsChecked++;
    report.peakRssBytes = Math.max(report.peakRssBytes, process.memoryUsage().rss);
    return status;
  };
  const io = {...fs, async writeFile(file, data, ...args) {
    const result = await fs.writeFile(file, data, ...args);
    const length = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data);
    const name = path.basename(file);
    if (name.startsWith('.block-')) {writes.mediaBytes += length; writes.mediaCalls++;}
    else if (name.startsWith('.index-')) {writes.indexBytes += length; writes.indexCalls++;}
    else if (name === '.owner') writes.ownerBytes += length;
    return result;
  }};
  const metadata = {total: config.logicalBytes};
  const create = () => createStore({root, currentBytes: config.currentBytes, nextBytes: config.nextBytes,
    maxEntries: config.maxEntries, maxPendingBytes: 2 * MIB, io});
  const barrier = async () => {await store.open(identity('A'), metadata, 'current'); check();};
  const milestone = async stage => {
    checkDeadline();
    const status = check(), disk = await inspectDisk(root);
    if (disk.blockBytes !== status.committed || disk.currentIndexedBytes !== status.current ||
        disk.nextIndexedBytes !== status.next || disk.tempFiles || disk.indexRows > config.maxEntries) {
      throw failure('quota-disk-check-failed');
    }
    report.milestones.push({stage, elapsedMs: performance.now() - started,
      rssBytes: process.memoryUsage().rss, status, disk, completedWrites: {...writes}});
    return status;
  };
  const put = async (key, offset, role, limit) => {
    checkDeadline();
    const before = check(), accepted = await store.put(key, offset, payload);
    check();
    if (!accepted) {
      report.rejections.push({role, offset, result: 'put-returned-false',
        roleBytesBefore: before[role], candidateExceedsRoleBytes: before[role] + BLOCK > limit,
        rowsBefore: before.entries + before.blocks, admissionRowThreshold: config.maxEntries - 1,
        candidateMeetsRowRejectionGuard: before.entries + before.blocks >= config.maxEntries - 1,
        faultedBefore: before.faulted});
      await barrier(); // Admission can queue one eviction; include that completed effect.
    }
    return accepted;
  };
  try {
    checkDeadline();
    store = await create(); check();
    a = await store.open(identity('A'), metadata, 'current'); check();
    await store.actual(a); check();
    b = await store.open(identity('B'), metadata, 'next'); check();
    for (const [key, role, limit] of [[a, 'current', config.currentBytes], [b, 'next', config.nextBytes]]) {
      const attempts = Math.min(limit / BLOCK, config.maxEntries + 1);
      let accepted = 0;
      for (let index = 0; index < attempts; index++) {
        if (!await put(key, index * BLOCK, role, limit)) break;
        accepted++;
      }
      if (config.mode === 'budgets' && accepted * BLOCK !== limit) throw failure('quota-fill-incomplete');
      await milestone(role + '-fill');
    }
    if (config.mode === 'budgets') {
      const full = await milestone('both-budgets-full');
      if (full.current !== config.currentBytes || full.next !== config.nextBytes) throw failure('quota-fill-incomplete');
      if (await put(a, config.currentBytes, 'current', config.currentBytes) ||
          await put(b, config.nextBytes, 'next', config.nextBytes)) throw failure('quota-overflow-admitted');
    } else if (!report.rejections.length) throw failure('quota-rejection-not-observed');
    const beforeClose = await milestone('after-admission-refusals');
    await store.close(); closed = true; check();
    await milestone('closed-with-preload-discarded');
    store = await create(); closed = false; check();
    const reopened = await milestone('reopened-actual-A-only');
    if (reopened.currentKey !== a || reopened.current !== beforeClose.current || reopened.next !== 0 ||
        reopened.entries !== 1 || await store.span(b, 0) !== null) throw failure('quota-recovery-check-failed');
    const c = await store.open(identity('C'), metadata, 'next'); check();
    if (store.status().currentKey !== a || store.status().current !== reopened.current) throw failure('quota-early-retirement');
    if (!await put(c, 0, 'next', config.nextBytes)) throw failure('quota-C-admission-failed');
    await milestone('prepared-C-keeps-A');
    await store.actual(c); check();
    if (store.status().currentKey !== c || store.status().current !== BLOCK ||
        store.status().next !== 0 || await store.span(a, BLOCK) !== null) throw failure('quota-actual-retirement-failed');
    await milestone('actual-C-retires-A');
    await store.close(); closed = true; check();
    await milestone('final-closed');
    report.ok = true;
    report.elapsedMs = performance.now() - started;
    report.completedWrites = {...writes};
    report.closed = true;
    return report;
  } catch (error) {
    report.ok = false;
    report.failure = safeFailure(error);
    error.quotaReport = report;
    throw error;
  } finally {
    if (store && !closed) await store.close();
    report.closed = store ? store.status().closed : true;
    report.completedWrites = {...writes};
    report.elapsedMs = performance.now() - started;
  }
}

async function run(out, {deadlineMs = DEFAULT_DEADLINE_MS, signal, scenarios = SCENARIOS} = {}) {
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs <= 0 || deadlineMs > 30 * 60 * 1000) {
    throw failure('quota-deadline-invalid');
  }
  for (const config of scenarios) validateConfig(config);
  await freshPrivateDirectory(out);
  const started = performance.now();
  const hashes = Object.fromEntries(await Promise.all(['quota.cjs', 'store.cjs'].map(async file =>
    [file, crypto.createHash('sha256').update(await fs.readFile(path.join(__dirname, file))).digest('hex')])));
  const report = {schema: 'ete-shared-cache-quota-v1', node: process.version, sourceCodeSha256: hashes,
    deadlineMs, scenarioResults: [], scope: 'owned-local-real-disk-only-no-network-no-native-playback'};
  try {
    for (const config of scenarios) {
      const remaining = Math.floor(deadlineMs - (performance.now() - started));
      if (remaining <= 0) throw failure('quota-deadline');
      report.scenarioResults.push(await runScenario(path.join(out, config.name), config,
        {deadlineMs: remaining, signal}));
    }
    report.ok = true;
  } catch (error) {
    report.ok = false;
    report.failure = safeFailure(error);
    if (error.quotaReport) report.scenarioResults.push(error.quotaReport);
  }
  report.elapsedMs = performance.now() - started;
  await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx', mode: 0o600});
  return report;
}

function parseArgs(args) {
  if (args.length !== 3 && args.length !== 5 || args[0] !== '--run' || args[1] !== '--out' ||
      !path.isAbsolute(args[2]) || args.length === 5 &&
      (args[3] !== '--deadline-ms' || !/^[1-9]\d*$/.test(args[4]) || Number(args[4]) > 30 * 60 * 1000)) {
    throw failure('explicit-run-and-fresh-private-output-required');
  }
  return {out: args[2], deadlineMs: args.length === 5 ? Number(args[4]) : DEFAULT_DEADLINE_MS};
}

module.exports = {BLOCK, SCENARIOS, assertBounds, inspectDisk, parseArgs, runScenario, run};
if (require.main === module) {
  let options;
  try {options = parseArgs(process.argv.slice(2));}
  catch {process.stderr.write('explicit-run-and-fresh-private-output-required\n'); process.exitCode = 1;}
  if (options) {
    const controller = new AbortController(), cancel = () => controller.abort();
    process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
    run(options.out, {deadlineMs: options.deadlineMs, signal: controller.signal}).then(report => {
      process.stdout.write(JSON.stringify({schema: report.schema, ok: report.ok,
        scenariosCompleted: report.scenarioResults.filter(row => row.ok).length,
        failure: report.failure || null}) + '\n');
      if (!report.ok) process.exitCode = 1;
    }).catch(() => {process.stderr.write('quota-experiment-failed\n'); process.exitCode = 1;})
      .finally(() => {process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);});
  }
}
