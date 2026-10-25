'use strict';
// Finite Linux offscreen decoder experiment. No app source/authentication integration.
const fs = require('node:fs/promises'), path = require('node:path');
const {spawn} = require('node:child_process');
const readline = require('node:readline');
const {source, identity, hash, get} = require('./fixture.cjs');
const {createStore} = require('./store.cjs'), {createProxy} = require('./proxy.cjs');
const {summary, medianInterval} = require('./benchmark.cjs');
const fixtures = {
  raw: '50296ffabdc3e1cce609897063a438730c4c58f0e7b09f1f038e032b28dcecf7',
  bframe: 'c89c8c79e80fccb244a4648776ff8b51c8156ded6af3b9225bed7be16da983c4'
};
async function run({out, media, variant, library, python = '/usr/bin/python3', seekMode = 'ordinary'}) {
  if (!['ordinary', 'managed'].includes(seekMode) || process.platform !== 'linux' || !fixtures[variant] || !path.isAbsolute(out) || path.resolve(out) !== out ||
      out.startsWith(path.resolve(__dirname, '../..') + path.sep)) throw Error('isolated-linux-experiment-required');
  const data = await fs.readFile(media);
  if (hash(data) !== fixtures[variant]) throw Error('synthetic-fixture-identity');
  await fs.mkdir(out, {mode: 0o700});
  const policy = {pairs: 20, warmupPairs: 3, order: 'alternating AB/BA, failures retained',
    firstDelayMs: 20, tailDelayMs: 100, softwareFrameSize: [160, 90], seekMode,
    seekCoordination: 'snapshot old foreground, submit existing async seek, await documented SEEK event, cancel snapshot; no production protocol change',
    gates: {addedMedianMs: 10, addedP95Ms: 25},
    scope: 'Linux software decoded RGB, standard C API of previously built experimental library. NOT Windows, visible presentation or ordinary app entry'};
  // Policy is written before collecting the first repeated frame sample.
  await fs.writeFile(path.join(out, 'policy.json'), JSON.stringify(policy, null, 2) + '\n', {flag: 'wx'});
  const report = {schema: 1, policy, fixture: {variant, sha256: hash(data), bytes: data.length}, cases: []};
  report.sourceSha256 = {};
  for (const name of ['proxy.cjs', 'store.cjs', 'native-frame.py', 'native-ab.cjs', 'fixture.cjs'])
    report.sourceSha256[name] = hash(await fs.readFile(path.join(__dirname, name)));
  const origin = await source({data, firstDelay: 20, tailDelay: 100});
  const store = await createStore({root: path.join(out, 'cache'), currentBytes: 16 * 1024 * 1024, nextBytes: 1024 * 1024});
  const proxy = await createProxy({store, authorize: async () => origin.grant()});
  let serial = 0;
  async function sample(arm, mode, item) {
    let handle;
    const before = proxy.status(), sourceBefore = origin.requests.length;
    try {
      if (arm === 'B') handle = await proxy.open(identity(item), 'current');
      const managed = arm === 'B' && seekMode === 'managed';
      const result = await new Promise(resolve => {
        const args = [path.join(__dirname, 'native-frame.py'), '--run', '--library', library,
          '--url', handle ? handle.url : origin.url, '--root', path.join(out, 'profile-' + (++serial)),
          ...(managed ? ['--managed-seek'] : [])];
        const child = spawn(python, args, {stdio: ['pipe', 'pipe', 'pipe']});
        let value, cancelOld, interruption, interruptResult, timedOut = false, stderrBytes = 0, bytes = 0;
        const timeout = setTimeout(() => {timedOut = true; child.kill();}, 25000);
        const hardStop = setTimeout(() => {timedOut = true; child.kill('SIGKILL');}, 30000);
        child.stderr.on('data', data => {stderrBytes += data.length;});
        child.on('error', () => {});
        const lines = readline.createInterface({input: child.stdout});
        lines.on('line', line => {
          bytes += Buffer.byteLength(line);
          if (bytes > 128 * 1024) {child.kill(); return;}
          let row; try {row = JSON.parse(line);} catch {child.kill(); return;}
          if (managed && row.event === 'prepare-seek' && !cancelOld) {
            cancelOld = handle.prepareForegroundInterruption(); child.stdin.write('ready\n');
          } else if (managed && row.event === 'seek-started' && cancelOld && !interruption) {
            interruption = cancelOld().then(result => {interruptResult = result;}, () => {interruptResult = {failed: true};});
          } else if (row.status) value = row;
          else child.kill();
        });
        child.once('close', async (code, signal) => {
          clearTimeout(timeout); clearTimeout(hardStop); lines.close();
          if (interruption) await interruption;
          const coordinationPassed = !managed || cancelOld && interruption && !interruptResult?.failed;
          resolve({...value, status: value?.status === 'PASS' && coordinationPassed ? 'PASS' : 'FAIL',
            safeReason: value?.safeReason || (coordinationPassed ? undefined : 'seek-coordination-failed'),
            childExit: code, childSignal: signal, timedOut, stderrBytes,
            ...(managed ? {interruption: interruptResult || null} : {})});
        });
      });
      const after = proxy.status();
      return {...result, hitBytes: after.hitBytes - before.hitBytes, sourceReceivedBytes: after.receivedBytes - before.receivedBytes,
        sourceRequests: origin.requests.length - sourceBefore, mode};
    } finally {
      const key = handle ? await handle.ready().catch(() => null) : null;
      handle?.retire(); await proxy.drain();
      // Each cold sample starts with an empty candidate; old sample objects
      // must not silently turn this into a near-capacity index benchmark.
      if (mode === 'cold' && key) await store.invalidate(key);
    }
  }
  try {
    for (const mode of ['cold', 'warm-disk-fresh-route']) {
      const warmItem = 'native-warm-' + variant;
      if (mode !== 'cold') {
        const handle = await proxy.open(identity(warmItem)); await handle.ready();
        // A fast whole-file response can intentionally skip optional writes.
        // Prepare bounded chunks and join each so 'warm' really means coverage.
        for (let offset = 0; offset < data.length; offset += 256 * 1024) {
          const length = Math.min(256 * 1024, data.length - offset);
          const prepared = await get(handle.url, offset, length);
          if (prepared.hash !== hash(data.subarray(offset, offset + length))) throw Error('warm-body-mismatch');
          await proxy.drain();
        }
        const span = await store.span(await handle.ready(), 0);
        report.warmPreparation = {expectedBytes: data.length, span, store: store.status()};
        if (!span || span.end !== data.length) throw Error('warm-coverage-incomplete');
        handle.retire();
      }
      const result = {mode, samples: [], warmups: []};
      for (let n = -policy.warmupPairs; n < policy.pairs; n++) {
        const pair = {}, order = (n + policy.warmupPairs) % 2 ? ['B', 'A'] : ['A', 'B'];
        for (const arm of order) pair[arm] = await sample(arm, mode, mode === 'cold' ? 'native-cold-' + serial : warmItem);
        const ok = [pair.A, pair.B].every(p => p.status === 'PASS' && p.childExit === 0 && p.contextTerminated && !p.timedOut) &&
          pair.A.firstFrame.rgbSha256 === pair.B.firstFrame.rgbSha256 && pair.A.seekFrame.rgbSha256 === pair.B.seekFrame.rgbSha256;
        pair.ok = ok;
        (n < 0 ? result.warmups : result.samples).push(pair);
      }
      const valid = result.samples.filter(p => p.ok);
      result.validPairs = valid.length;
      for (const metric of ['firstFrame', 'seekFrame']) {
        const deltas = valid.map(p => p.B[metric].elapsedMs - p.A[metric].elapsedMs);
        result[metric] = deltas.length ? {baselineMs: summary(valid.map(p => p.A[metric].elapsedMs)),
          candidateMs: summary(valid.map(p => p.B[metric].elapsedMs)), addedMs: summary(deltas), median95CI: medianInterval(deltas)} : null;
      }
      result.status = valid.length === policy.pairs && ['firstFrame', 'seekFrame'].every(k =>
        result[k].addedMs.p50 <= policy.gates.addedMedianMs && result[k].addedMs.p95 <= policy.gates.addedP95Ms) ? 'PASS' : 'FAIL';
      report.cases.push(result);
      console.log(JSON.stringify({variant, mode, status: result.status, validPairs: result.validPairs, firstFrame: result.firstFrame, seekFrame: result.seekFrame}));
    }
  } catch (error) {
    const safeCodes = new Set(['warm-body-mismatch', 'warm-coverage-incomplete']);
    report.failure = {code: safeCodes.has(error.message) ? error.message : 'native-driver-failed'};
    throw error;
  } finally {
    report.beforeClose = proxy.status();
    await proxy.close(); await origin.close();
    const final = proxy.status();
    report.final = final;
    report.clean = final.activeOrigins === 0 && final.activeBodies === 0 && final.captureBytes === 0 &&
      final.readReservedBytes === 0 && final.writes === 0 && final.jobs === 0 && final.store.closed && final.store.readers === 0;
    for (const [name, expected] of Object.entries(report.sourceSha256)) if (expected !== hash(await fs.readFile(path.join(__dirname, name)))) report.sourceDrift = true;
    await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
  }
  if (!report.clean || report.sourceDrift || report.cases.some(c => c.status !== 'PASS')) process.exitCode = 1;
  return report;
}
module.exports = {run};
if (require.main === module) {
  const args = process.argv.slice(2), options = {};
  if (args.shift() !== '--run') throw Error('explicit-run-required');
  while (args.length) {const key = args.shift(), value = args.shift(); if (!['--out', '--media', '--variant', '--library', '--python', '--seek-mode'].includes(key) || !value) throw Error('arguments'); options[key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;}
  run(options).catch(() => {console.error('shared-native-ab-failed; inspect private receipts'); process.exitCode = 1;});
}
