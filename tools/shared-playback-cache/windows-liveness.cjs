'use strict';
// Independent bounded probe coordinator. Does not import the playback driver,
// business fixtures or services. Native-only workers require an explicit suite.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {spawn, execFileSync} = require('node:child_process');
const contract = require('./windows-contract.cjs');
const trial = require('../../src/electronapp/enhanced/shared-playback-cache/trial');
const CASES = Object.freeze(['bare', 'contents', 'frame']);
const NATIVE_CASES = Object.freeze(['helper-idle', 'helper-playback', 'helper-preview']);
const LIMITS = Object.freeze({caseMs: 35000, totalMs: 120000});
const FILES = ['tools/shared-playback-cache/windows-liveness.cjs', 'tools/shared-playback-cache/windows-liveness-electron.cjs',
  'tools/shared-playback-cache/windows-liveness-preload.cjs', 'tools/shared-playback-cache/windows-contract.cjs',
  'tools/shared-playback-cache/windows-ci.ps1', '.github/workflows/public-ci.yml'];
const OWNER = 'ETE no-media runtime liveness v1\n';
const NATIVE_FILES = ['tools/shared-playback-cache/windows-native-liveness-electron.cjs', 'tools/make-fixture.cjs'];
const casesFor = plan => plan.suite === 'native' ? NATIVE_CASES : CASES;
const need = (v, code) => {if (!v) throw Error(code);};
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const safe = e => /^[a-z0-9-]{1,100}$/.test(e?.message || '') ? e.message : 'liveness-failed';
function write(file, value) {fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', {mode: 0o600});}
function toolsIdentity(repo, suite) {
  const gitEnv = {...process.env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0'};
  const gitArgs = ['-c', 'protocol.allow=never', '-c', 'core.fsmonitor=false', '-C', repo];
  const toolCommit = execFileSync('git', [...gitArgs, 'rev-parse', 'HEAD'], {encoding: 'utf8', windowsHide: true, timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'], env: gitEnv}).trim();
  need(/^[a-f0-9]{40}$/.test(toolCommit), 'tool-commit');
  return {toolCommit, files: [...FILES, ...(suite === 'native' ? NATIVE_FILES : [])].map(member => {
    const source = execFileSync('git', [...gitArgs, 'show', toolCommit + ':' + member], {windowsHide: true, timeout: 10000, maxBuffer: 4 * 1048576, stdio: ['ignore', 'pipe', 'pipe'], env: gitEnv});
    const checkout = fs.readFileSync(contract.physical(path.join(repo, member)));
    need(source.equals(checkout) || (!source.includes(13) && Buffer.from(source.toString('utf8')).equals(source) && !source.toString('utf8').startsWith('\ufeff') &&
      Buffer.from(source.toString('utf8').replace(/\n/g, '\r\n')).equals(checkout)), 'tool-bytes');
    return {member, sourceSha256: sha(source), checkoutSha256: sha(checkout)};
  })};
}
function outside(parent, child) {const r = path.relative(parent, child); return r === '..' || r.startsWith('..' + path.sep) || path.isAbsolute(r);}
function profileFor(plan, name) {
  need(casesFor(plan).includes(name), 'case-invalid');
  const root = contract.physical(path.join(plan.out, name + '-profile'), true);
  need(outside(plan.runtime, root) && outside(root, plan.runtime), 'profile-runtime-overlap');
  need(fs.readFileSync(contract.physical(path.join(root, trial.OWNER_FILE)), 'utf8') === trial.OWNER, 'profile-owner');
  for (const name of ['appdata', 'userdata', 'session', 'localappdata', 'mpv', 'temp', 'logs', 'crashes']) contract.physical(path.join(root, name), true);
  return root;
}
function createPlan({repo, runtime, installer, installerSha256, productCommit, out, suite}) {
  need(suite === undefined || suite === 'native', 'suite-invalid');
  repo = contract.physical(repo, true);
  const identity = contract.verifyCandidate({repo, runtime, installer, installerSha256, candidateCommit: productCommit});
  need(path.isAbsolute(out) && !fs.existsSync(out), 'fresh-output-required');
  contract.physical(path.dirname(out), true); fs.mkdirSync(out, {mode: 0o700}); out = contract.physical(out, true);
  fs.writeFileSync(path.join(out, 'owner'), OWNER, {flag: 'wx', mode: 0o600});
  const plan = {schema: 1, kind: 'runtime-liveness', repo, runtime: contract.physical(runtime, true),
    installer: contract.physical(installer), installerSha256, productCommit, out, identity, tools: toolsIdentity(repo, suite), cases: suite === 'native' ? NATIVE_CASES : CASES, limits: LIMITS,
    ...(suite ? {suite} : {})};
  for (const name of casesFor(plan)) trial.createProfile({root: path.join(out, name + '-profile')});
  if (suite === 'native') {
    const file = path.join(out, 'owned.y4m');
    execFileSync(process.execPath, [path.join(repo, 'tools/make-fixture.cjs'), file, '5'],
      {windowsHide: true, timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'], env: environment(profileFor(plan, NATIVE_CASES[0]))});
    plan.fixture = {file, size: fs.statSync(file).size, sha256: sha(fs.readFileSync(file))};
    verifyFixture(plan);
  }
  write(path.join(out, 'plan.json'), plan); return plan;
}
function readPlan(file, expectedHash) {
  file = contract.physical(file); const bytes = fs.readFileSync(file);
  need(bytes.length <= 128 * 1024 && sha(bytes) === expectedHash, 'plan-hash');
  const plan = JSON.parse(bytes);
  need(plan.schema === 1 && plan.kind === 'runtime-liveness' && path.join(plan.out, 'plan.json') === file &&
    (plan.suite === undefined || plan.suite === 'native') && JSON.stringify(plan.cases) === JSON.stringify(casesFor(plan)) && JSON.stringify(plan.limits) === JSON.stringify(LIMITS), 'plan-contract');
  contract.physical(plan.out, true);
  need(fs.readFileSync(contract.physical(path.join(plan.out, 'owner')), 'utf8') === OWNER, 'plan-owner');
  need(JSON.stringify(toolsIdentity(plan.repo, plan.suite)) === JSON.stringify(plan.tools), 'tool-plan-changed');
  need(JSON.stringify(contract.verifyCandidate({...plan, candidateCommit: plan.productCommit})) === JSON.stringify(plan.identity), 'candidate-plan-changed');
  for (const name of casesFor(plan)) profileFor(plan, name);
  if (plan.suite === 'native') verifyFixture(plan);
  return plan;
}
function verifyFixture(plan) {
  const f = plan.fixture;
  need(f && f.file === path.join(plan.out, 'owned.y4m') && Number.isSafeInteger(f.size) && f.size > 0 && f.size < 2 * 1048576 && /^[a-f0-9]{64}$/.test(f.sha256), 'fixture-contract');
  const file = contract.physical(f.file), bytes = fs.readFileSync(file);
  need(bytes.length === f.size && sha(bytes) === f.sha256, 'fixture-changed');
  return file;
}
function environment(root) {
  const env = {...process.env};
  for (const key of Object.keys(env)) if (/^(?:ELECTRON_RUN_AS_NODE|NODE_OPTIONS|NODE_PATH|NODE_USE_ENV_PROXY|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|GH_TOKEN|GITHUB_TOKEN|ACTIONS_RUNTIME_TOKEN|ACTIONS_ID_TOKEN_REQUEST_TOKEN)$/i.test(key)) delete env[key];
  Object.assign(env, {APPDATA: path.join(root, 'appdata'), LOCALAPPDATA: path.join(root, 'localappdata'), MPV_HOME: path.join(root, 'mpv'),
    TMP: path.join(root, 'temp'), TEMP: path.join(root, 'temp'), TMPDIR: path.join(root, 'temp'), NO_PROXY: '127.0.0.1,localhost'});
  return env;
}
function validateResult(r, name) {
  if (!r || typeof r !== 'object') return false;
  const p = r.receipt;
  if (![...CASES, ...NATIVE_CASES].includes(name) || !r.exitConfirmed || r.exitCode !== 0 || r.exitSignal !== null || r.timedOut || !r.streamsClosed ||
    !Number.isSafeInteger(r.spawnPid) || r.spawnPid <= 0 || !Number.isSafeInteger(r.coordinatorPid) || r.coordinatorPid <= 0 ||
    !p || p.kind !== 'runtime-liveness-case' || p.case !== name || p.status !== 'PASS' || p.pid !== r.spawnPid ||
    p.ppid !== r.coordinatorPid || p.processType !== 'browser' || p.browserProcess !== true || p.ready !== true || !Array.isArray(p.scripts) || !Array.isArray(p.ipcCounts) || p.ipcCounts.length !== 4) return false;
  if (name === 'bare') return p.windowsCreated === 0 && p.scripts.length === 0 && p.ipcCounts.every(n => n === 0);
  if (NATIVE_CASES.includes(name) && !validNative(p, name)) return false;
  const expected = [['primitive', 11], ['promise', 12], ['echo-one', 1], ['async-void', 14], ['awaited', 7], ['microtask', 16]];
  return p.windowsCreated === (NATIVE_CASES.includes(name) ? 2 : 1) && p.hidden === true && p.backgroundThrottling === false &&
    Array.isArray(p.scripts) && p.scripts.length === 6 && p.scripts.every((s, i) => s && typeof s === 'object' && s.label === expected[i][0] && s.result === expected[i][1]) &&
    JSON.stringify(p.ipcCounts) === '[1,1,1,1]' && Array.isArray(p.observations) && p.observations.length === (NATIVE_CASES.includes(name) ? 24 : 18) &&
    ['entered', 'returned', 'settled'].every(label => p.observations.filter(v => v === label).length === (NATIVE_CASES.includes(name) ? 8 : 6));
}
function validNative(p, name) {
  return !!p && typeof p === 'object' && p.suite === 'native' && p.native && p.native.created === true && p.native.closed === true &&
    p.ownedHelpersClosed === true && p.beforeHelper === 11 && p.afterHelper === 17 && Array.isArray(p.undefinedScripts) && p.undefinedScripts.length === 2 &&
    p.undefinedScripts.every((row, i) => row && row.label === ['undefined-promise', 'undefined-timer'][i] && row.dispatched === true &&
      row.rendererResultType === 'undefined' && row.completionAck === 21 + i &&
      ['null', 'undefined', 'boolean', 'number', 'string', 'object', 'bigint', 'symbol', 'function'].includes(row.wireResultType)) &&
    Array.isArray(p.helpers) && p.helpers.length === 1 && p.helpers.every(h => h && Number.isSafeInteger(h.pid) && h.pid > 0 && h.ready === true && h.exited === true && h.exitCode === 0 && h.signal === false && h.streamsClosed === true && h.pendingRequests === 0 && h.protocolFailure === false && h.operationErrorCount === 0 && h.fatal === false) &&
    (name === 'helper-idle' ? p.native.loaded === false && p.previewCalls === 0 :
      p.native.loaded === true && p.native.playbackAdvanced === true &&
      (name === 'helper-preview' ? p.previewCalls === 1 && p.preview?.colored === true && Number.isInteger(p.preview.width) && p.preview.width > 0 && p.preview.width <= 160 && Number.isInteger(p.preview.height) && p.preview.height > 0 && p.preview.height <= 90 : p.previewCalls === 0));
}
function collect(plan, name, globalDeadline) {
  const deadline = Math.min(Date.now() + LIMITS.caseMs, globalDeadline - 2000);
  const planFile = path.join(plan.out, 'plan.json'), root = profileFor(plan, name);
  const worker = plan.suite === 'native' ? 'windows-native-liveness-electron.cjs' : 'windows-liveness-electron.cjs';
  const args = [path.join(plan.repo, 'tools/shared-playback-cache', worker), '--plan=' + planFile,
    '--plan-sha256=' + sha(fs.readFileSync(planFile)), '--case=' + name, '--deadline-ms=' + deadline];
  return new Promise(resolve => {
    const child = spawn(path.join(plan.runtime, 'x64/electron/electron.exe'), args,
      {env: environment(root), windowsHide: true, detached: false, shell: false, stdio: ['ignore', 'pipe', 'pipe']});
    const result = {case: name, spawnPid: child.pid || null, coordinatorPid: process.pid, exitCode: null, exitSignal: null,
      exitConfirmed: false, streamsClosed: false, timedOut: false, terminationReason: null, timeline: [], stdoutBytes: 0, stderrBytes: 0};
    const started = Date.now(); let done = false, timer, force, final, denied = false, tail = '';
    const listeners = [];
    const listen = (target, event, fn, once = false) => {target[once ? 'once' : 'on'](event, fn); listeners.push({target, event, fn});};
    function ignoreLateError() {}
    const mark = (event, facts = {}) => {if (result.timeline.length < 32) result.timeline.push({event, elapsedMs: Date.now() - started, ...facts});};
    const finish = closed => {
      if (done) return; done = true; clearTimeout(timer); clearTimeout(force); clearTimeout(final); result.streamsClosed = closed;
      for (const [field, suffix] of [['receipt', '.json'], ['stages', '.stages.json']]) {
        try {const bytes = fs.readFileSync(path.join(plan.out, name + suffix)); if (bytes.length <= 65536) result[field] = JSON.parse(bytes);} catch (_) {}
      }
      result.status = validateResult(result, name) ? 'PASS' : 'FAIL';
      for (const {target, event, fn} of listeners) target.removeListener(event, fn);
      if (!closed) {
        for (const target of [child, child.stdout, child.stderr]) target.on('error', ignoreLateError);
        child.stdout.destroy(); child.stderr.destroy(); child.unref();
      } // FAIL/unknown; never invent closure.
      resolve(result);
    };
    const terminate = reason => {
      if (result.terminationReason) return; result.timedOut = true; result.terminationReason = reason;
      try {mark('terminate', {requested: child.kill()});} catch (_) {mark('terminate-error');}
      force = setTimeout(() => {if (!result.exitConfirmed && !denied) {try {mark('force-terminate', {requested: child.kill('SIGKILL')});} catch (_) {mark('force-error');}}}, 1000);
      final = setTimeout(() => {mark('collection-unconfirmed'); finish(false);}, Math.min(2000, Math.max(1, globalDeadline - Date.now())));
    };
    listen(child, 'spawn', () => mark('spawn'), true);
    listen(child.stdout, 'data', b => {
      result.stdoutBytes += b.length; if (result.stdoutBytes > 65536) {terminate('stdout-limit'); return;}
      tail += b.toString('utf8'); const lines = tail.split(/\r?\n/); tail = lines.pop();
      for (const line of lines) {const m = /^ETE_LIVENESS_STARTUP_FAIL ([a-z0-9-]{1,100})$/.exec(line); if (m) result.startupError = m[1];}
      if (tail.length > 8192) terminate('stdout-line-limit');
    });
    listen(child.stderr, 'data', b => {result.stderrBytes += b.length; if (result.stderrBytes > 131072) terminate('stderr-limit');});
    listen(child.stdout, 'close', () => mark('stdout-close'), true); listen(child.stderr, 'close', () => mark('stderr-close'), true);
    listen(child, 'error', e => {denied ||= e.code === 'EPERM' || e.code === 'EACCES'; mark('process-error', {code: /^[A-Z0-9_]{1,40}$/.test(e.code || '') ? e.code : null});});
    listen(child, 'exit', (code, signal) => {result.exitConfirmed = true; result.exitCode = code; result.exitSignal = signal; mark('exit', {code, signal});}, true);
    listen(child, 'close', () => {mark('close'); finish(true);}, true);
    timer = setTimeout(() => terminate('deadline'), Math.max(1, deadline - Date.now()));
  });
}
async function run(plan) {
  need(process.platform === 'win32', 'windows-required');
  const deadline = Date.now() + LIMITS.totalMs, results = [];
  for (const name of casesFor(plan)) {
    if (Date.now() >= deadline - 2000) break;
    const result = await collect(plan, name, deadline); results.push(result);
    console.log('ETE_RUNTIME_LIVENESS_CASE ' + JSON.stringify(result));
    if (!result.exitConfirmed || !result.streamsClosed) break;
  }
  const report = {schema: 1, kind: 'runtime-liveness', productCommit: plan.productCommit, toolCommit: plan.tools.toolCommit,
    status: results.length === casesFor(plan).length && results.every(r => r.status === 'PASS') ? 'PASS' : 'FAIL', cases: results,
    noMedia: plan.suite !== 'native', nativeHelperStarted: results.some(r => r.receipt?.helpers?.some(h => Number.isSafeInteger(h.pid) && h.pid > 0)), real115Requests: 0,
    ...(plan.suite ? {suite: plan.suite} : {})};
  write(path.join(plan.out, 'liveness-summary.json'), report);
  console.log('ETE_RUNTIME_LIVENESS ' + JSON.stringify(report)); return report;
}
function parseArgs(argv) {
  const keys = ['repo', 'runtime', 'installer', 'installer-sha256', 'product-sha', 'out'], values = {};
  for (const arg of argv) {const m = /^--([a-z0-9-]+)=(.+)$/.exec(arg); need(m && [...keys, 'suite'].includes(m[1]) && !Object.hasOwn(values, m[1]), 'arguments-invalid'); values[m[1]] = m[2];}
  need(keys.every(k => values[k]) && (values.suite === undefined || values.suite === 'native') && /^[a-f0-9]{64}$/.test(values['installer-sha256']) && /^[a-f0-9]{40}$/.test(values['product-sha']), 'arguments-invalid');
  return {repo: values.repo, runtime: values.runtime, installer: values.installer, installerSha256: values['installer-sha256'], productCommit: values['product-sha'], out: values.out, ...(values.suite ? {suite: values.suite} : {})};
}
module.exports = {CASES, NATIVE_CASES, LIMITS, parseArgs, validateResult, validNative, verifyFixture, readPlan, profileFor, createPlan, environment, run, collect};
if (require.main === module) (async () => {const plan = createPlan(parseArgs(process.argv.slice(2))); const report = await run(plan); if (report.status !== 'PASS') process.exitCode = 1;})()
  .catch(error => {console.error('ETE_RUNTIME_LIVENESS_ERROR ' + safe(error)); process.exitCode = 1;});
