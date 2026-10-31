'use strict';
// Finite offline test diagnostics, not a retry, package build or native launch.
const fs = require('node:fs'), path = require('node:path');
const {spawn} = require('node:child_process');
const FILES = Object.freeze(['tests/shared-playback-app-adapter.test.cjs', 'tests/shared-playback-app-session.test.cjs',
  'tests/playback-prefix-alameda-auto.test.cjs', 'tests/shared-playback-on-demand.test.cjs',
  'tests/shared-playback-store.test.cjs', 'tests/shared-playback-proxy.test.cjs', 'tests/shared-playback-flow.test.cjs',
  'tests/shared-playback-index.test.cjs', 'tests/shared-playback-quota.test.cjs']);
async function runFile({repo, file, output, timeoutMs = 25000, echo = true, namePattern}) {
  if (!path.isAbsolute(repo) || !path.isAbsolute(output) || !/^tests\/[a-z0-9-]+\.test\.cjs$/.test(file)) throw Error('diagnostic-owned-path-required');
  if (namePattern !== undefined && namePattern !== 'trusted-cd2-shared') throw Error('diagnostic-pattern-not-reviewed');
  const environment = {...process.env}; delete environment.NODE_TEST_CONTEXT; delete environment.NODE_OPTIONS; delete environment.NODE_PATH;
  // No Node test-file subprocess layer: deadline owns the exact process running
  // this file. Never --test-force-exit, which could conceal a leaked resource.
  const fd = fs.openSync(output, 'wx', 0o600);
  return new Promise(resolve => {
    const child = spawn(process.execPath, ['--test', '--test-isolation=none', '--test-reporter=tap', '--test-concurrency=1', ...(namePattern ? ['--test-name-pattern=' + namePattern] : []), file],
      {cwd: repo, env: environment, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
    let bytes = 0, timedOut = false, overflow = false, forced, code = null, signal = null;
    const started = Date.now();
    const stop = () => {if (timedOut) return; timedOut = true; child.kill(); forced = setTimeout(() => {if (child.exitCode === null) child.kill('SIGKILL');}, 1000);};
    const timer = setTimeout(stop, timeoutMs);
    const copy = chunk => {bytes += chunk.length;
      if (bytes > 2 * 1048576) {overflow = true; stop(); return;}
      fs.writeSync(fd, chunk); if (echo) process.stdout.write(chunk);
    };
    child.stdout.on('data', copy); child.stderr.on('data', copy); child.on('error', () => {});
    child.once('exit', (value, reason) => {code = value; signal = reason;});
    child.once('close', () => {clearTimeout(timer); clearTimeout(forced); fs.closeSync(fd);
      resolve({file, code, signal, timedOut, overflow, streamsClosed: true, elapsedMs: Date.now() - started,
        cleanupAssessment: timedOut ? 'OWNED_TEST_EXITED_DESCENDANTS_NOT_INSPECTED' : 'TEST_PROCESS_EXITED',
        status: code === 0 && !timedOut && !overflow ? 'PASS' : 'FAIL'});
    });
  });
}
async function run({out}) {
  if (!path.isAbsolute(out) || fs.existsSync(out)) throw Error('diagnostic-fresh-output-required');
  const repo = path.resolve(__dirname, '../..'), started = Date.now(), results = [];
  fs.mkdirSync(out, {mode: 0o700});
  for (const file of FILES) {
    const remaining = 150000 - (Date.now() - started);
    if (remaining <= 0) {results.push({file, status: 'NOT_RUN', reason: 'diagnostic-total-deadline'}); continue;}
    console.log('SHARED_CACHE_DIAGNOSTIC_BEGIN ' + file);
    const result = await runFile({repo, file, output: path.join(out, path.basename(file) + '.tap'), timeoutMs: Math.min(25000, remaining)});
    results.push(result); console.log('SHARED_CACHE_DIAGNOSTIC_RESULT ' + JSON.stringify(result));
  }
  const report = {schema: 1, scope: 'owned synthetic offline tests only; no Windows native/app acceptance',
    real115Requests: 0, elapsedMs: Date.now() - started, status: results.every(r => r.status === 'PASS') ? 'PASS' : 'FAIL', results};
  fs.writeFileSync(path.join(out, 'diagnostics.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
  return report;
}
module.exports = {FILES, runFile, run};
if (require.main === module) (async () => {
  if (process.argv.length !== 3 || !process.argv[2].startsWith('--out=')) throw Error('diagnostic-out-required');
  if ((await run({out: process.argv[2].slice(6)})).status !== 'PASS') process.exitCode = 1;
})().catch(() => {console.error('SHARED_CACHE_DIAGNOSTIC_FAILED'); process.exitCode = 1;});
