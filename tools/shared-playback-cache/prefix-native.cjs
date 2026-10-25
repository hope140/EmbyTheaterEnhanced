'use strict';
// Explicit Linux, owned-fixture experiment. No application entry or real account.
const fs = require('node:fs/promises');
const {createReadStream, constants} = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const {setTimeout: delay} = require('node:timers/promises');
const {createStore} = require('./store.cjs');
const {createProxy} = require('./proxy.cjs');

const MiB = 1024 * 1024, PREFIX = 300 * MiB, CURRENT = 512 * MiB, BLOCK = 256 * 1024;
const LIBRARY_SHA = 'f6fb466bbee5995f94b56505d331a34e26897c1f73b2c8982484c8bf071c45bc';
const OWNED = Object.freeze({server: 'owned-loopback', account: 'anonymous-owned', item: 'prefix-owned-B',
  mediaSource: 'generated-400-second-v1', resource: 'owned-raw-nut', representation: 'static-file'});
const now = () => process.hrtime.bigint();
const problem = code => Object.assign(new Error(code), {safeCode: code});
const emit = (phase, values = {}) => console.log(JSON.stringify({phase, ...values}));
async function digest(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(file, {highWaterMark: BLOCK})) hash.update(chunk);
  return hash.digest('hex');
}
async function save(file, value) {await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', {mode: 0o600});}

async function childRun(executable, args, {timeoutMs, signal, maxBytes = 128 * 1024}) {
  const child = spawn(executable, args, {stdio: ['ignore', 'pipe', 'pipe']});
  let output = '', stderrBytes = 0, outputBytes = 0, timedOut = false, reason = null, force;
  const stop = code => {
    reason ||= code;
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      force ||= setTimeout(() => child.kill('SIGKILL'), 1000);
    }
  };
  const aborted = () => stop('run-deadline');
  signal?.addEventListener('abort', aborted, {once: true});
  const timer = setTimeout(() => {timedOut = true; stop('child-timeout');}, timeoutMs);
  child.stdout.on('data', chunk => {
    outputBytes += chunk.length;
    if (outputBytes <= maxBytes) output += chunk.toString('utf8');
    else stop('child-output-limit');
  });
  child.stderr.on('data', chunk => {stderrBytes += chunk.length; if (stderrBytes > maxBytes) stop('child-stderr-limit');});
  child.on('error', () => {reason ||= 'child-spawn-failed';});
  if (signal?.aborted) aborted();
  const [code, childSignal] = await new Promise(resolve => child.once('close', (...args) => resolve(args)));
  clearTimeout(timer); clearTimeout(force); signal?.removeEventListener('abort', aborted);
  return {stdout: output, childExit: code, childSignal, timedOut, reason, stderrBytes, outputBytes, ownedExitConfirmed: true};
}

async function fileSource(file, metadata, runSignal) {
  const requests = [], jobs = new Set(), sockets = new Set();
  let serial = 0, closed = false;
  const server = http.createServer((req, res) => {
    const controller = new AbortController();
    const signal = AbortSignal.any([runSignal, controller.signal]);
    const abort = () => controller.abort();
    res.once('close', abort); req.once('aborted', abort);
    const row = {requestId: ++serial, start: null, end: null, createdNs: now().toString(),
      firstWriteNs: null, tailWriteNs: null, scheduledBodyBytes: 0, writeCallbackBytes: 0,
      uncertainWriteUpperBytes: 0, closed: false, finished: false};
    requests.push(row);
    const work = (async () => {
      let fd;
      try {
        if (requests.length > 256 || closed || req.url !== '/owned-binary' || req.method !== 'GET') {
          res.writeHead(403); res.end(); return;
        }
        const range = req.headers.range, match = /^bytes=(\d+)-(\d*)$/.exec(range || '');
        const start = range ? match ? Number(match[1]) : NaN : 0;
        const end = match?.[2] ? Number(match[2]) : metadata.total - 1;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end >= metadata.total) {
          res.writeHead(416); res.end(); return;
        }
        row.start = start; row.end = end;
        if (req.headers['if-match'] && req.headers['if-match'] !== metadata.etag) {res.writeHead(412); res.end(); return;}
        const headers = {'Content-Length': end - start + 1, 'Content-Type': 'application/octet-stream',
          ETag: metadata.etag, 'Last-Modified': metadata.lastModified, 'Accept-Ranges': 'bytes', Connection: 'close'};
        if (range) headers['Content-Range'] = `bytes ${start}-${end}/${metadata.total}`;
        res.writeHead(range ? 206 : 200, headers);
        fd = await fs.open(file, 'r');
        await delay(20, undefined, {signal});
        let offset = start;
        const writePart = async size => {
          const buffer = Buffer.allocUnsafe(size);
          const {bytesRead} = await fd.read(buffer, 0, size, offset);
          if (bytesRead !== size) throw problem('fixture-short-read');
          if (signal.aborted || res.destroyed) throw problem('source-cancelled');
          offset += size; row.scheduledBodyBytes += size;
          const accepted = res.write(buffer, error => {
            if (error) row.uncertainWriteUpperBytes += size;
            else row.writeCallbackBytes += size;
          });
          if (!accepted) await once(res, 'drain', {signal});
        };
        row.firstWriteNs = now().toString(); await writePart(Math.min(4096, end - start + 1));
        if (offset <= end) {
          await delay(100, undefined, {signal}); row.tailWriteNs = now().toString();
          while (offset <= end) await writePart(Math.min(65536, end - offset + 1));
        }
        if (!res.destroyed) {res.end(); await once(res, 'finish', {signal});}
      } catch {
        if (!res.destroyed) res.destroy();
      } finally {
        if (fd) await fd.close();
        row.closed = true; row.finished = res.writableFinished;
        res.removeListener('close', abort); req.removeListener('aborted', abort);
      }
    })();
    jobs.add(work); work.finally(() => jobs.delete(work)).catch(() => {});
  });
  server.maxConnections = 8; server.headersTimeout = 10000; server.requestTimeout = 30000;
  server.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
  await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
  const url = `http://127.0.0.1:${server.address().port}/owned-binary`;
  const stop = () => {for (const socket of sockets) socket.destroy();};
  runSignal.addEventListener('abort', stop, {once: true});
  return {url, requests, grant: () => ({url, origin: new URL(url).origin, metadata: {...metadata}}), async close() {
    closed = true; stop(); await new Promise(resolve => server.close(resolve));
    await Promise.allSettled([...jobs]); runSignal.removeEventListener('abort', stop);
    return {activeJobs: jobs.size, activeSockets: sockets.size, allRequestFilesClosed: requests.every(row => row.closed)};
  }};
}

function actualCounts(chunks, timeline) {
  const make = () => ({receivedBytes: 0, receivedOverlapWithPrimedPrefixBytes: 0,
    bodyReceivedBytes: 0, bodyOverlapWithPrimedPrefixBytes: 0, permissionProbeBytes: 0,
    permissionProbeOverlapWithPrimedPrefixBytes: 0, chunks: 0, requests: new Set()});
  const stages = {startup: make(), seek: make(), beforeLoad: make()};
  const total = make();
  function add(counts, row) {
    const overlap = Math.max(0, Math.min(PREFIX, row.start + row.length) - Math.max(0, row.start));
    counts.receivedBytes += row.length; counts.receivedOverlapWithPrimedPrefixBytes += overlap;
    counts.chunks++; counts.requests.add(row.requestId);
    if (row.probe) {counts.permissionProbeBytes += row.length; counts.permissionProbeOverlapWithPrimedPrefixBytes += overlap;}
    else {counts.bodyReceivedBytes += row.length; counts.bodyOverlapWithPrimedPrefixBytes += overlap;}
  }
  const load = timeline?.load && BigInt(timeline.load), seek = timeline?.seek && BigInt(timeline.seek);
  for (const row of chunks) {
    add(total, row);
    const stamp = BigInt(row.atNs);
    add(!load || stamp < load ? stages.beforeLoad : !seek || stamp < seek ? stages.startup : stages.seek, row);
  }
  for (const counts of [total, ...Object.values(stages)]) counts.requests = counts.requests.size;
  return {scope: 'validated origin BODY bytes received by proxy; not player consumption or server write callbacks',
    startupWindow: 'load through asynchronous seek command enqueue; includes brief prefetch after first frame',
    seekWindow: 'seek command enqueue through complete proxy shutdown', total, ...stages};
}

async function run({out, library, ffmpeg = '/usr/bin/ffmpeg', python = '/usr/bin/python3', cacheBytes = MiB}) {
  const repo = path.resolve(__dirname, '../..');
  if (process.platform !== 'linux' || Number(process.versions.node.split('.')[0]) !== 24 ||
      !path.isAbsolute(out || '') || path.resolve(out) !== out || out === repo || out.startsWith(repo + path.sep) ||
      !path.isAbsolute(library || '') || ffmpeg !== '/usr/bin/ffmpeg' || python !== '/usr/bin/python3' ||
      !Number.isSafeInteger(cacheBytes) || cacheBytes < MiB || cacheBytes > 3 * 1024 * MiB) throw problem('explicit-owned-linux-inputs-required');
  if (await fs.realpath(path.dirname(out)) !== path.dirname(out)) throw problem('output-parent-symlink');
  const disk = await fs.statfs(path.dirname(out));
  if (disk.bavail * disk.bsize < 8 * 1024 * MiB) throw problem('insufficient-owned-workspace-space');
  if (await digest(library) !== LIBRARY_SHA) throw problem('library-identity');
  await fs.mkdir(out, {mode: 0o700});
  const controller = new AbortController(), began = now();
  const deadline = setTimeout(() => controller.abort(), 180000);
  const signal = controller.signal;
  const check = () => {if (signal.aborted) throw problem('run-deadline');};
  const report = {schema: 1, scope: 'Linux offscreen software RGB using existing fixed libmpv standard C API; owned local synthetic source only',
    policy: {repeats: 3, seekTargetsSeconds: [60, 350], requestPolicies: ['sparse', 'coherent'],
      currentBytes: CURRENT, prefixBytes: PREFIX, nextBytes: PREFIX, seedBlockBytes: BLOCK, testDemuxBytes: cacheBytes,
      deadlineMs: 180000, nativeChildTimeoutMs: 25000, childForceKillGraceMs: 1000,
      sourceFirstDelayMs: 20, sourceFirstChunkBytes: 4096, sourceTailDelayMs: 100, sourceChunkBytes: 65536,
      preparation: 'precondition test: sequential direct owned-file-descriptor store.put, not an HTTP preload scheduler',
      samples: 'three smoke comparisons per policy and seek target; not a 20-pair confidence or acceptance benchmark',
      directReceivedBytes: 'NOT_MEASURED; direct is an engine timing and RGB reference only',
      order: 'each repeat has one direct reference followed by both policies; policy order alternates',
      sourceWriteCounters: 'separate scheduled/callback evidence; never interpreted as receiver bytes',
      coverage: 'fresh clone of the same closed 300 MiB baseline before every candidate sample'},
    librarySha256: LIBRARY_SHA, cases: [], sourceSha256: {}, status: 'RUNNING'};
  const file = path.join(out, 'owned-400s.nut'), baseline = path.join(out, 'baseline-cache');
  let phase = 'setup';
  try {
    for (const name of ['prefix-native.cjs', 'proxy.cjs', 'store.cjs', 'native-frame.py']) report.sourceSha256[name] = await digest(path.join(__dirname, name));
    await save(path.join(out, 'policy.json'), report.policy);
    const version = await childRun(ffmpeg, ['-version'], {timeoutMs: 5000, signal});
    if (version.childExit !== 0 || !version.stdout.startsWith('ffmpeg version 7.1.5-')) throw problem('ffmpeg-version');
    const args = ['-v', 'error', '-nostdin', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=24:duration=400',
      '-f', 'lavfi', '-i', 'aevalsrc=0.2*sin(2*PI*(431*t+20*t*t)):s=48000:d=400',
      '-map', '0:v', '-map', '1:a', '-c:v', 'rawvideo', '-pix_fmt', 'bgr24', '-threads', '1', '-c:a', 'pcm_s16le', file];
    report.fixture = {ffmpegVersion: version.stdout.split('\n')[0], executableSha256: await digest(ffmpeg), args};
    phase = 'generate'; emit(phase);
    const generated = await childRun(ffmpeg, args, {timeoutMs: 60000, signal});
    report.fixture.generation = {...generated, stdout: undefined};
    if (generated.childExit !== 0) throw problem(generated.reason || 'fixture-generation-failed');
    const stat = await fs.stat(file);
    if (stat.size <= PREFIX || stat.size > 600 * MiB) throw problem('fixture-size');
    report.fixture.bytes = stat.size; report.fixture.sha256 = await digest(file); check();
    emit('generation-complete', {fixtureBytes: stat.size});
    const metadata = {total: stat.size, etag: '"' + report.fixture.sha256 + '"', lastModified: 'Sun, 25 Oct 2026 00:00:00 GMT'};
    phase = 'clock-check';
    const beforeClock = now();
    const clock = await childRun(python, ['-c', 'import time; print(time.monotonic_ns())'], {timeoutMs: 5000, signal});
    const afterClock = now();
    if (clock.childExit !== 0 || !/^\d+\n?$/.test(clock.stdout)) throw problem('clock-check-failed');
    const pythonClock = BigInt(clock.stdout.trim());
    report.clockCheck = {nodeBeforeNs: beforeClock.toString(), pythonMonotonicNs: pythonClock.toString(), nodeAfterNs: afterClock.toString(), sameClockBracket: beforeClock <= pythonClock && pythonClock <= afterClock};
    if (!report.clockCheck.sameClockBracket) throw problem('clock-domain-mismatch');
    phase = 'seed'; emit(phase, {prefixMiB: 300});
    const seedStore = await createStore({root: baseline, currentBytes: CURRENT, nextBytes: PREFIX});
    const fd = await fs.open(file, 'r');
    try {
      const key = await seedStore.open(OWNED, metadata, 'current');
      if (!await seedStore.actual(key)) throw problem('seed-actual-failed');
      for (let offset = 0; offset < PREFIX; offset += BLOCK) {
        check(); const data = Buffer.allocUnsafe(BLOCK);
        const {bytesRead} = await fd.read(data, 0, BLOCK, offset);
        if (bytesRead !== BLOCK || !await seedStore.put(key, offset, data)) throw problem('seed-block-failed');
        if ((offset + BLOCK) % (64 * MiB) === 0 || offset + BLOCK === PREFIX) emit('seed-progress', {seededMiB: (offset + BLOCK) / MiB});
      }
      const span = await seedStore.span(key, 0);
      report.seed = {span, store: seedStore.status(), blocks: PREFIX / BLOCK};
      if (!span || span.start !== 0 || span.end !== PREFIX || report.seed.store.committed !== PREFIX) throw problem('seed-coverage');
    } finally {await fd.close(); await seedStore.close();}
    report.seed.closed = seedStore.status().closed;
    await save(path.join(out, 'preparation.json'), {fixture: report.fixture, clockCheck: report.clockCheck, seed: report.seed});
    emit('seed-complete', {seededMiB: 300, blocks: PREFIX / BLOCK});

    let serial = 0;
    async function sample(arm, target, repeat) {
      check(); const id = ++serial, caseRoot = path.join(out, 'sample-' + String(id).padStart(2, '0'));
      await fs.mkdir(caseRoot, {mode: 0o700});
      const receipt = {id, arm, seekTarget: target, repeat, status: 'RUNNING', stage: 'setup'};
      const chunks = []; let store, proxy, handle, origin, observerInputErrors = 0;
      emit('sample', {id, target, repeat, arm});
      try {
        origin = await fileSource(file, metadata, signal);
        if (arm !== 'direct') {
          receipt.stage = 'clone-prefix';
          const cache = path.join(caseRoot, 'cache');
          await fs.cp(baseline, cache, {recursive: true, errorOnExist: true, force: false, mode: constants.COPYFILE_FICLONE});
          await fs.chmod(cache, 0o700);
          store = await createStore({root: cache, currentBytes: CURRENT, nextBytes: PREFIX});
          proxy = await createProxy({store, requestPolicy: arm, authorize: async () => origin.grant(), onOriginChunk(row) {
            const atNs = now().toString();
            if (chunks.length >= 65536 || !Number.isSafeInteger(row.start) || !Number.isSafeInteger(row.length) || row.start < 0 || row.length <= 0 || row.start + row.length > metadata.total || !Number.isSafeInteger(row.requestId)) {observerInputErrors++; return;}
            chunks.push({atNs, requestId: row.requestId, start: row.start, length: row.length, kind: row.kind, probe: !!row.probe});
          }});
          handle = await proxy.open(OWNED, 'current'); const key = await handle.ready();
          const span = await store.span(key, 0);
          receipt.primed = {span, store: store.status()};
          if (!span || span.start !== 0 || span.end !== PREFIX || receipt.primed.store.committed !== PREFIX) throw problem('clone-coverage');
        }
        receipt.stage = 'native-child'; const beforeChild = now();
        const native = await childRun(python, [path.join(__dirname, 'native-frame.py'), '--run', '--library', library,
          '--url', handle ? handle.url : origin.url, '--root', path.join(caseRoot, 'profile'), '--seek-to', String(target),
          '--cache-bytes', String(cacheBytes)], {timeoutMs: 25000, signal});
        const afterChild = now();
        receipt.child = {...native, stdout: undefined};
        try {receipt.native = JSON.parse(native.stdout);} catch {throw problem('native-receipt-invalid');}
        const times = receipt.native.timelineNs;
        receipt.clockBracket = !!times && ['load', 'firstFrame', 'seek', 'seekFrame', 'terminated'].every(key => /^\d+$/.test(times[key] || '') && beforeChild <= BigInt(times[key]) && BigInt(times[key]) <= afterChild);
        if (native.reason || native.childExit !== 0 || !receipt.native.contextTerminated || receipt.native.status !== 'PASS') throw problem(native.reason || 'native-frame-failed');
        if (!receipt.clockBracket || !(BigInt(times.load) <= BigInt(times.firstFrame) && BigInt(times.firstFrame) <= BigInt(times.seek) && BigInt(times.seek) <= BigInt(times.seekFrame) && BigInt(times.seekFrame) <= BigInt(times.terminated))) throw problem('native-timeline-invalid');
        if (receipt.native.seekTarget !== target || receipt.native.synchronousRuntimeQueries !== 0) throw problem('native-contract');
        receipt.status = 'PASS'; receipt.stage = 'complete';
      } catch (error) {
        receipt.status = 'FAIL'; receipt.safeReason = error.safeCode || 'prefix-sample-failed';
      } finally {
        receipt.cleanupErrors = [];
        try {handle?.retire();} catch {receipt.cleanupErrors.push('route-retirement-failed');}
        if (proxy) {
          receipt.beforeClose = proxy.status();
          try {await proxy.close();} catch {receipt.cleanupErrors.push('proxy-close-failed');}
          receipt.proxy = proxy.status();
        } else if (store) {
          try {await store.close();} catch {receipt.cleanupErrors.push('store-close-failed');}
        }
        if (origin) {
          try {receipt.sourceCleanup = await origin.close();} catch {receipt.cleanupErrors.push('source-close-failed');}
          receipt.sourceRangePlans = origin.requests;
        }
        receipt.observerInputErrors = observerInputErrors;
        receipt.actualReceived = arm === 'direct' ? {status: 'NOT_MEASURED', reason: 'direct decoder has no proxy body observer'} : actualCounts(chunks, receipt.native?.timelineNs);
        receipt.clean = receipt.cleanupErrors.length === 0 && (!receipt.child || receipt.child.ownedExitConfirmed) && (!proxy || receipt.proxy.activeOrigins === 0 && receipt.proxy.activeBodies === 0 && receipt.proxy.captureBytes === 0 && receipt.proxy.readReservedBytes === 0 && receipt.proxy.writes === 0 && receipt.proxy.jobs === 0 && receipt.proxy.store.closed && receipt.proxy.store.readers === 0) && (!origin || receipt.sourceCleanup?.activeJobs === 0 && receipt.sourceCleanup.activeSockets === 0 && receipt.sourceCleanup.allRequestFilesClosed);
        if (!receipt.clean || observerInputErrors || proxy && (receipt.proxy.observerErrors !== 0 || receipt.actualReceived.total.receivedBytes !== receipt.proxy.receivedBytes)) {receipt.status = 'FAIL'; receipt.safeReason ||= 'observer-or-cleanup-contract';}
        await save(path.join(caseRoot, 'origin-chunks.json'), chunks);
        await save(path.join(caseRoot, 'receipt.json'), receipt);
      }
      report.cases.push(receipt);
      await save(path.join(out, 'checkpoint.json'), report);
      emit('sample-complete', {id, target, repeat, arm, status: receipt.status,
        prefixBodyReceivedBytes: receipt.actualReceived.total?.bodyOverlapWithPrimedPrefixBytes ?? null,
        permissionProbeBytes: receipt.actualReceived.total?.permissionProbeBytes ?? null});
      return receipt;
    }
    phase = 'samples';
    for (const target of [60, 350]) for (let repeat = 1; repeat <= 3; repeat++) {
      const direct = await sample('direct', target, repeat);
      if (direct.status !== 'PASS') throw problem('direct-reference-failed');
      for (const arm of repeat % 2 ? ['sparse', 'coherent'] : ['coherent', 'sparse']) {
        const receipt = await sample(arm, target, repeat);
        receipt.rgbMatchesDirect = receipt.status === 'PASS' && receipt.native.firstFrame.rgbSha256 === direct.native.firstFrame.rgbSha256 && receipt.native.seekFrame.rgbSha256 === direct.native.seekFrame.rgbSha256;
        if (!receipt.rgbMatchesDirect) {receipt.status = 'FAIL'; receipt.safeReason ||= 'direct-rgb-mismatch';}
        await save(path.join(out, 'sample-' + String(receipt.id).padStart(2, '0'), 'receipt.json'), receipt);
        await save(path.join(out, 'checkpoint.json'), report);
        if (receipt.status !== 'PASS') throw problem('candidate-sample-failed');
      }
    }
    report.status = 'PASS';
  } catch (error) {
    report.status = 'FAIL'; report.failure = {stage: phase, safeReason: error.safeCode || 'prefix-experiment-failed'};
  } finally {
    clearTimeout(deadline); controller.abort();
    report.elapsedMs = Number(now() - began) / 1e6;
    for (const [name, expected] of Object.entries(report.sourceSha256)) if (await digest(path.join(__dirname, name)) !== expected) report.sourceDrift = true;
    if (report.sourceDrift) {report.status = 'FAIL'; report.failure ||= {stage: 'finalize', safeReason: 'source-drift'};}
    await save(path.join(out, 'result.json'), report);
  }
  emit('complete', {status: report.status, samples: report.cases.length, elapsedMs: report.elapsedMs});
  if (report.status !== 'PASS') process.exitCode = 1;
  return report;
}

module.exports = {run, actualCounts};
if (require.main === module) {
  const args = process.argv.slice(2), options = {};
  if (args.shift() !== '--run') throw problem('explicit-run-required');
  while (args.length) {
    const key = args.shift(), value = args.shift();
    const name = key === '--cache-bytes' ? 'cacheBytes' : key.slice(2);
    if (!['--out', '--library', '--ffmpeg', '--python', '--cache-bytes'].includes(key) || !value || options[name] !== undefined ||
        key === '--cache-bytes' && !/^\d+$/.test(value)) throw problem('arguments');
    options[name] = key === '--cache-bytes' ? Number(value) : value;
  }
  run(options).catch(() => {emit('driver-failed', {status: 'FAIL'}); process.exitCode = 1;});
}
