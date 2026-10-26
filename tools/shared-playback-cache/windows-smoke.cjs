'use strict';
// Tooling-only coordinator. Never installs, fetches an artifact or starts a user profile.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {spawn, execFileSync} = require('node:child_process');
const contract = require('./windows-contract.cjs');
const fixtures = require('./windows-fixtures.cjs');
const OWNER = 'ETE shared cache Windows owned smoke v1\n';
const PHASES = Object.freeze(['baseline', 'natural', 'reopen', 'cancel']);
const TOOL_FILES = Object.freeze(['tools/shared-playback-cache/windows-smoke.cjs',
  'tools/shared-playback-cache/windows-electron.cjs', 'tools/shared-playback-cache/windows-preload.cjs',
  'tools/shared-playback-cache/windows-contract.cjs', 'tools/shared-playback-cache/windows-fixtures.cjs',
  'tools/shared-playback-cache/windows-run.ps1', 'tools/shared-playback-cache/windows-ci.ps1',
  '.github/workflows/public-ci.yml', 'tests/helpers/next-prefix-alameda.cjs']);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const need = (v, c) => {if (!v) throw Error(c);};
// The coordinator's phase clock includes synchronous candidate verification.
function watchdogDelay(startedAt, observedAt, phaseDeadlineMs) {
  need([startedAt, observedAt, phaseDeadlineMs].every(Number.isFinite) && observedAt >= startedAt && phaseDeadlineMs > 1000,
    'worker-clock-invalid');
  return Math.max(1, phaseDeadlineMs - 1000 - (observedAt - startedAt));
}
function within(task, timeoutMs, code) {
  need(typeof task === 'function' && Number.isFinite(timeoutMs) && timeoutMs > 0 && /^[a-z-]{1,100}$/.test(code), 'worker-wait-invalid');
  let timer;
  const deadline = new Promise((_, reject) => {timer = setTimeout(() => reject(Error(code)), timeoutMs);});
  return Promise.race([Promise.resolve().then(task), deadline]).finally(() => clearTimeout(timer));
}
// Invoke only the already loaded trusted frame. WebContents.executeJavaScript
// has an additional loading gate; this owned harness must observe its commands.
async function executeStableFrame(contents, expectedUrl, script, expectedFrame) {
  need(contents && !contents.isDestroyed(), 'worker-frame-untrusted');
  const frame = expectedFrame || contents.mainFrame;
  need(frame && contents.mainFrame === frame && !frame.isDestroyed() && !frame.detached && frame.url === expectedUrl, 'worker-frame-untrusted');
  const result = await frame.executeJavaScript(script);
  need(!contents.isDestroyed() && contents.mainFrame === frame && !frame.isDestroyed() &&
    !frame.detached && frame.url === expectedUrl, 'worker-frame-retired');
  return result;
}
// Observe script entry, synchronous return and Promise settlement without
// replacing its return value or swallowing its rejection.
function observeExpression(script, label) {
  need(typeof script === 'string' && /^[a-z-]{1,80}$/.test(label), 'worker-evaluation-invalid');
  const probe = code => 'window.prefixHarness.report({type:"evaluation-probe",operation:' + JSON.stringify(label) + ',code:' + JSON.stringify(code) + '});';
  return '(() => {' + probe('entered') + 'const value = (' + script + ');' + probe('returned') +
    'Promise.resolve(value).then(() => {' + probe('settled') + '}, () => {' + probe('rejected') + '}); return value;})()';
}
function voidCommandExpression(script, sequence) {
  need(typeof script === 'string' && Number.isSafeInteger(sequence) && sequence > 0 && sequence <= 32, 'worker-void-invalid');
  return '(() => { if ((window.__ownedSmokeVoidSequence || 0) !== ' + (sequence - 1) +
    ') throw Error("worker-void-sequence"); return Promise.resolve((' + script + ')).then(value => {' +
    ' if (typeof value !== "undefined") throw Error("worker-command-not-void");' +
    ' window.__ownedSmokeVoidSequence = ' + sequence + '; window.__ownedSmokeVoidType = typeof value; return value; }); })()';
}
function voidCommandAckExpression(sequence) {
  need(Number.isSafeInteger(sequence) && sequence > 0 && sequence <= 32, 'worker-void-invalid');
  return '(window.__ownedSmokeVoidSequence === ' + sequence + ' && window.__ownedSmokeVoidType === "undefined") ? ' + (1000 + sequence) + ' : -1';
}
async function executeAcknowledgedVoid(contents, expectedUrl, script, label, sequence, timeoutMs, isActive = () => true) {
  need(typeof isActive === 'function' && Number.isFinite(timeoutMs) && timeoutMs > 0 && /^[a-z-]{1,80}$/.test(label), 'worker-evaluation-invalid');
  const deadline = Date.now() + timeoutMs;
  const budget = () => {need(isActive(), 'worker-evaluation-retired'); const left = deadline - Date.now(); need(left > 0, label + '-timeout'); return left;};
  need(contents && !contents.isDestroyed(), 'worker-frame-untrusted');
  const frame = contents.mainFrame;
  const expression = observeExpression(voidCommandExpression(script, sequence), label);
  const value = await within(() => {budget(); return executeStableFrame(contents, expectedUrl, expression, frame);}, budget(), label + '-timeout');
  const wireResultType = value === null ? 'null' : typeof value;
  const completionAck = await within(() => {budget(); return executeStableFrame(contents, expectedUrl, voidCommandAckExpression(sequence), frame);}, budget(), label + '-ack-timeout');
  budget(); need(completionAck === 1000 + sequence, 'worker-command-ack-missing');
  return {wireResultType, completionAck, rendererResultType: 'undefined'};
}
function write(file, value, exclusive = true) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', {flag: exclusive ? 'wx' : 'w', mode: 0o600});
}
function physical(value, directory = false) {
  need(typeof value === 'string' && path.isAbsolute(value), 'owned-absolute-path-required');
  const absolute = path.resolve(value), same = s => process.platform === 'win32' ? s.toLowerCase() : s;
  let cursor = path.parse(absolute).root;
  for (const part of path.relative(cursor, absolute).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    need(!fs.lstatSync(cursor).isSymbolicLink() && same(fs.realpathSync.native(cursor)) === same(cursor), 'owned-path-redirected');
  }
  const st = fs.lstatSync(absolute);
  need(directory ? st.isDirectory() : st.isFile() && st.nlink === 1, 'owned-path-kind');
  return absolute;
}
function boundToolBytes(source, checkout) {
  const sourceSha256 = sha(source), checkoutSha256 = sha(checkout);
  if (source.equals(checkout)) return {sourceSha256, checkoutSha256, relation: 'git-blob'};
  const text = source.toString('utf8');
  need(Buffer.from(text, 'utf8').equals(source) && !text.includes('\r') && !text.startsWith('\ufeff') &&
    Buffer.from(text.replace(/\n/g, '\r\n'), 'utf8').equals(checkout), 'tool-source-changed');
  return {sourceSha256, checkoutSha256, relation: 'exact-crlf-checkout'};
}
function toolsIdentity(repo) {
  const toolCommit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repo, encoding: 'utf8', windowsHide: true}).trim();
  need(/^[a-f0-9]{40}$/.test(toolCommit), 'tool-commit-invalid');
  const files = TOOL_FILES.map(member => {
    const actual = fs.readFileSync(physical(path.join(repo, member)));
    const expected = execFileSync('git', ['show', toolCommit + ':' + member], {cwd: repo, maxBuffer: 4 * 1048576, windowsHide: true});
    return {member, ...boundToolBytes(expected, actual)};
  });
  return {toolCommit, files};
}
async function prepare({repo, runtime, installer, installerSha256, productCommit, out}) {
  repo = physical(repo, true);
  const identity = contract.verifyCandidate({repo, runtime, installer, installerSha256, candidateCommit: productCommit});
  const tools = toolsIdentity(repo);
  need(path.isAbsolute(out) && !fs.existsSync(out), 'fresh-output-required');
  physical(path.dirname(out), true); fs.mkdirSync(out, {mode: 0o700}); out = physical(out, true);
  fs.writeFileSync(path.join(out, 'owner'), OWNER, {flag: 'wx', mode: 0o600});
  fs.mkdirSync(path.join(out, 'media'));
  const fixture = await fixtures.generateFixtures(path.join(out, 'media'));
  const trial = require('../../src/electronapp/enhanced/shared-playback-cache/trial');
  for (const name of ['baseline-profile', 'shared-profile']) trial.createProfile({root: path.join(out, name)});
  const plan = {schema: 1, productCommit: identity.productCommit, repo, runtime: physical(runtime, true),
    installer: physical(installer), installerSha256, out, identity, tools, fixture, phases: PHASES,
    limits: {totalDeadlineMs: 120000, phaseDeadlineMs: 40000, cacheBytes: 314572800,
      progressPercent: 70, preloadMB: 300}, scope: 'owned loopback; actual renderer/IPC/authority/native helper; harness shell, not ordinary bootstrap or visible UI'};
  write(path.join(out, 'plan.json'), plan);
  return plan;
}
function readPlan(file, expectedHash) {
  file = physical(file); const bytes = fs.readFileSync(file);
  need(bytes.length <= 128 * 1024 && (!expectedHash || sha(bytes) === expectedHash), 'owned-plan-hash');
  const p = JSON.parse(bytes);
  need(p.schema === 1 && /^[a-f0-9]{40}$/.test(p.productCommit) &&
    JSON.stringify(p.phases) === JSON.stringify(PHASES) && path.join(p.out, 'plan.json') === file &&
    fs.readFileSync(physical(path.join(p.out, 'owner')), 'utf8') === OWNER, 'owned-plan-invalid');
  physical(p.out, true);
  validateProfile(p, 'baseline'); validateProfile(p, 'natural');
  need(JSON.stringify(toolsIdentity(p.repo)) === JSON.stringify(p.tools), 'tool-plan-changed');
  need(JSON.stringify(contract.verifyCandidate({...p, candidateCommit: p.productCommit})) === JSON.stringify(p.identity), 'candidate-plan-changed');
  need(JSON.stringify(p.limits) === JSON.stringify({totalDeadlineMs: 120000, phaseDeadlineMs: 40000,
    cacheBytes: 314572800, progressPercent: 70, preloadMB: 300}), 'owned-limits-changed');
  return p;
}
function validateProfile(plan, phase) {
  need(PHASES.includes(phase), 'profile-phase-invalid');
  const root = physical(path.join(plan.out, phase === 'baseline' ? 'baseline-profile' : 'shared-profile'), true);
  const marker = physical(path.join(root, '.shared-playback-cache-trial-owner'));
  need(fs.readFileSync(marker, 'utf8') === 'ETE shared playback cache trial v1\n', 'worker-profile-owner');
  for (const member of ['appdata', 'userdata', 'session', 'localappdata', 'mpv', 'temp', 'logs', 'crashes']) physical(path.join(root, member), true);
  const relative = path.relative(plan.runtime, root), reverse = path.relative(root, plan.runtime);
  need(relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative), 'profile-runtime-overlap');
  need(reverse.startsWith('..' + path.sep) || reverse === '..' || path.isAbsolute(reverse), 'profile-runtime-overlap');
  return root;
}
function coloredFrame(frame) {
  return !!frame && Number.isInteger(frame.width) && frame.width > 0 && Number.isInteger(frame.height) && frame.height > 0 &&
    Buffer.isBuffer(frame.pixels) && frame.pixels.length === frame.width * frame.height * 4 &&
    frame.pixels.some((n, i) => i % 4 !== 3 && n !== 0);
}
// Identity is the owned fixture's PlaybackInfo contract, never a real account.
function matchesStoppedReport(row, item) {
  return /^[ABC]$/.test(item || '') && row?.type === 'server-report' && row.method === 'stop' && row.item === item &&
    row.session === 'synthetic-session-' + item && row.mediaSource === item + '-avi';
}
function validatePhaseEvidence(result, events) {
  const phase = result.phase;
  need(Number.isSafeInteger(result.spawnPid) && result.spawnPid > 0 && Number.isSafeInteger(result.coordinatorPid) && result.coordinatorPid > 0 && result.receipt?.workerPid === result.spawnPid &&
    result.receipt?.workerParentPid === result.coordinatorPid && result.receipt?.workerType === 'browser', 'worker-pid-binding');
  need(PHASES.includes(phase) && result.exitConfirmed === true && result.exitCode === 0 && result.exitSignal === null && result.terminationReason === null && result.streamsClosed && !result.timedOut &&
    result.receipt?.status === 'PASS' && result.receipt.ownedHelpersClosed === true, 'worker-phase-failed');
  const expected = phase === 'baseline' || phase === 'natural' ? ['renderer-boot', 'seek-forward-pause-command',
    'seek-forward-unpause-command', 'seek-back-pause-command', 'seek-back-unpause-command', 'stop-command'] : ['renderer-boot', 'stop-command'];
  need(result.receipt.afterHelper === 17 && Array.isArray(result.receipt.evaluations) && result.receipt.evaluations.length === expected.length &&
    result.receipt.evaluations.every((row, i) => row && row.operation === expected[i] && row.sequence === i + 1 &&
      row.completionAck === 1001 + i && row.rendererResultType === 'undefined' &&
      ['null', 'undefined', 'boolean', 'number', 'string', 'object', 'bigint', 'symbol', 'function'].includes(row.wireResultType)), 'worker-command-evidence-missing');
  if (phase === 'natural') {
    const loadB = result.receipt.trace.find(r => r.type === 'load' && r.item === 'B' && r.proxied);
    need(loadB && result.receipt.checks.preloaded && !events.some(r => r.phase === phase && r.type === 'media-open' && r.item === 'B' &&
      r.wallClockMs >= loadB.wallClockMs && !(r.start === 0 && r.end === 0)), 'next-body-reread');
  }
  if (phase === 'reopen') {
    const reads = events.filter(r => r.phase === phase && r.type === 'media-open' && r.item === 'B');
    need(reads.length >= 1 && reads.every(r => r.start === 0 && r.end === 0), 'reopen-body-reread');
  }
  if (phase === 'cancel') {
    const held = events.find(r => r.phase === phase && r.type === 'media-held' && r.item === 'B');
    need(held && events.some(r => r.phase === phase && r.type === 'media-close' && r.requestId === held.requestId && r.actualResponseClosed), 'held-source-not-closed');
    return held.requestId;
  }
  return null;
}
function childEnvironment(profile, inherited = process.env) {
  const env = {...inherited};
  for (const key of Object.keys(env)) if (/^(?:ELECTRON_RUN_AS_NODE|NODE_OPTIONS|NODE_PATH|NODE_USE_ENV_PROXY|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|GH_TOKEN|GITHUB_TOKEN|ACTIONS_RUNTIME_TOKEN|ACTIONS_ID_TOKEN_REQUEST_TOKEN)$/i.test(key)) delete env[key];
  Object.assign(env, {APPDATA: path.join(profile, 'appdata'), LOCALAPPDATA: path.join(profile, 'localappdata'),
    MPV_HOME: path.join(profile, 'mpv'), TMP: path.join(profile, 'temp'), TEMP: path.join(profile, 'temp'),
    TMPDIR: path.join(profile, 'temp'), NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost'});
  return env;
}
function observeCacheBudgetRead(read, report, clock = () => performance.now()) {
  const started = clock();
  const emit = data => {try {report(data);} catch (_) { /* Observation cannot change the Native request. */ }};
  emit({operation: 'read-begin'});
  const requestState = error => {
    try {const state = error?.state; return ['TIMED_OUT', 'GENERATION_RETIRED', 'HELPER_DIED', 'CANCELLED', 'REJECTED'].includes(state) ? state : null;}
    catch (_) {return null;}
  };
  const settled = (outcome, shapeValid = false, state = null) => emit({operation: 'read-settled', outcome,
    shapeValid, elapsedMs: Math.max(0, clock() - started), ...(state ? {requestState: state} : {})});
  let pending;
  try {pending = read();} catch (error) {settled('threw'); throw error;}
  pending.then(value => settled('resolved', (typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value)) &&
    Number.isSafeInteger(Number(value)) && Number(value) >= 256 * 1024 && Number(value) <= 3072 * 1024 * 1024),
  error => settled('rejected', false, requestState(error)));
  return pending;
}

function cacheSelectionSnapshot(status) {
  const currentStates = ['idle', 'original', 'preparing', 'active'];
  const nextStates = ['idle', 'preparing', 'warming', 'ready', 'partial', 'unavailable'];
  const number = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  const diagnostic = value => value ? require('../../src/electronapp/enhanced/playback-range-diagnostics').snapshot(value) : null;
  return {current: {state: currentStates.includes(status?.current?.state) ? status.current.state : 'unknown',
    diagnostic: diagnostic(status?.current?.diagnostic)},
    next: {state: nextStates.includes(status?.next?.state) ? status.next.state : 'unknown',
      bytes: number(status?.next?.bytes), targetBytes: number(status?.next?.targetBytes), diagnostic: diagnostic(status?.next?.diagnostic)},
    diskBytes: number(status?.diskBytes)};
}

function safeNativeTags(chunks) {
  const text = Buffer.concat(chunks.filter(Buffer.isBuffer)).toString('utf8');
  const match = /helper-fatal:dll-load-failed:win32-(\d{1,10}):target-file-([01]):absolute-([01])/.exec(text);
  return {fatalObserved: text.includes('helper-fatal:'), dllLoadFailure: !!match,
    win32Error: match ? Number(match[1]) : null, targetFile: match ? match[2] === '1' : null,
    absoluteTarget: match ? match[3] === '1' : null};
}
function safeFailure(error) {
  if (/^[a-z0-9-]{1,100}$/.test(error?.message || '')) return error.message;
  if (/^[a-z0-9-]{1,80}$/.test(error?.code || '')) return 'windows-contract-' + error.code;
  return 'shared-cache-smoke-failed';
}
async function child(plan, phase, sessionFile, deadline) {
  const executable = path.join(plan.runtime, 'x64/electron/electron.exe');
  // Keep collection/termination inside the unchanged overall 120-second bound.
  const phaseDeadlineAt = Math.min(deadline - 2000, Date.now() + plan.limits.phaseDeadlineMs);
  const args = [path.join(plan.repo, 'tools/shared-playback-cache/windows-electron.cjs'),
    '--plan=' + path.join(plan.out, 'plan.json'), '--plan-sha256=' + sha(fs.readFileSync(path.join(plan.out, 'plan.json'))),
    '--session=' + sessionFile, '--session-sha256=' + sha(fs.readFileSync(sessionFile)), '--deadline-ms=' + phaseDeadlineAt, '--phase=' + phase];
  const profile = validateProfile(plan, phase);
  return new Promise(resolve => {
    const owned = spawn(executable, args, {env: childEnvironment(profile), windowsHide: true, detached: false,
      shell: false, stdio: ['ignore', 'pipe', 'pipe']});
    const spawnPid = owned.pid, coordinatorPid = process.pid, startedAt = Date.now(), processTimeline = [];
    const mark = (event, facts = {}) => {if (processTimeline.length < 24) processTimeline.push({event, elapsedMs: Date.now() - startedAt, ...facts});};
    const listeners = [];
    const listen = (target, event, fn, once = false) => {target[once ? 'once' : 'on'](event, fn); listeners.push({target, event, fn});};
    function ignoreLateError() {}
    let spawnSeen = false, denied = false, done = false, timer, force, final;
    mark('spawn-requested', {pid: spawnPid || null});
    listen(owned, 'spawn', () => {spawnSeen = true; mark('spawn', {pid: owned.pid || null});}, true);
    let terminationReason = null, exitConfirmed = false;
    let timedOut = false, stderrBytes = 0, stdoutBytes = 0, exitCode = null, exitSignal = null, stdoutTail = ''; const workerStages = [];
    const finish = closed => {
      if (done) return; done = true; clearTimeout(timer); clearTimeout(force); clearTimeout(final);
      let receipt = null, lifecycle = null;
      try {const bytes = fs.readFileSync(path.join(plan.out, phase + '.json')); if (bytes.length <= 256 * 1024) receipt = JSON.parse(bytes);} catch (_) {}
      try {const bytes = fs.readFileSync(path.join(plan.out, phase + '.lifecycle.json')); if (bytes.length <= 32768) lifecycle = JSON.parse(bytes);} catch (_) {}
      for (const {target, event, fn} of listeners) target.removeListener(event, fn);
      if (!closed) {
        for (const target of [owned, owned.stdout, owned.stderr]) target.on('error', ignoreLateError);
        owned.stdout.destroy(); owned.stderr.destroy(); owned.unref();
      } // Observation released after FAIL/unknown; never invent an exit/close.
      resolve({phase, spawnPid, coordinatorPid, processTimeline, terminationReason, lifecycle, exitCode, exitSignal, exitConfirmed,
        streamsClosed: closed, timedOut, stderrBytes, stdoutBytes, workerStages,
        helperExitAssessment: receipt?.ownedHelpersClosed ? 'CONFIRMED' : 'UNCERTAIN', receipt});
    };
    const kill = signal => {
      if (denied || exitConfirmed) return false;
      try {return owned.kill(signal);} catch (error) {
        denied ||= error.code === 'EPERM' || error.code === 'EACCES'; mark('terminate-error'); return false;
      }
    };
    const stop = reason => {
      if (timedOut || done) return; timedOut = true; terminationReason = reason;
      mark('terminate', {reason, requested: kill()});
      force = setTimeout(() => {if (!exitConfirmed && !denied) mark('force-terminate', {requested: kill('SIGKILL')});}, 1000);
      final = setTimeout(() => {mark('collection-unconfirmed'); finish(false);}, Math.min(2000, Math.max(1, deadline - Date.now())));
    };
    listen(owned.stdout, 'data', b => {
      stdoutBytes += b.length; if (stdoutBytes > 128 * 1024) {stop('stdout-limit'); return;}
      stdoutTail += b.toString('utf8'); const lines = stdoutTail.split(/\r?\n/); stdoutTail = lines.pop();
      for (const line of lines) {const match = /^SHARED_CACHE_WORKER ([a-z-]{1,100})$/.exec(line);
        if (match && workerStages.length < 64) workerStages.push(match[1]);}
      if (stdoutTail.length > 8192) stop('stdout-line-limit');
    });
    listen(owned.stderr, 'data', b => {stderrBytes += b.length; if (stderrBytes > 256 * 1024) stop('stderr-limit');});
    listen(owned.stdout, 'close', () => mark('stdout-close'), true);
    listen(owned.stderr, 'close', () => mark('stderr-close'), true);
    listen(owned, 'error', error => {
      denied ||= error.code === 'EPERM' || error.code === 'EACCES';
      const reason = spawnSeen ? 'process-error' : 'spawn-error'; terminationReason ||= reason;
      mark(reason, {code: /^[A-Z0-9_]{1,40}$/.test(error.code || '') ? error.code : null});
    });
    listen(owned, 'exit', (code, signal) => {exitConfirmed = true; exitCode = code; exitSignal = signal; mark('exit', {code, signal});}, true);
    listen(owned, 'close', () => {mark('close'); finish(true);}, true);
    timer = setTimeout(() => stop('deadline'), Math.max(1, phaseDeadlineAt - Date.now()));
  });
}
async function run({planFile}) {
  need(process.platform === 'win32', 'windows-runner-required');
  const plan = readPlan(planFile), deadline = Date.now() + plan.limits.totalDeadlineMs;
  need(!fs.existsSync(path.join(plan.out, 'coordinator.json')), 'preserve-prior-run');
  let phase = 'sources', sources; const events = [], results = [];
  const report = {schema: 1, productCommit: plan.productCommit, toolCommit: plan.tools.toolCommit,
    identity: plan.identity, status: 'FAIL', cases: results, real115Requests: 0,
    scope: plan.scope, firstFrameMeaning: 'native decoded preview; hidden HWND, not visible presentation'};
  try {
    sources = await fixtures.startWindowsSources({plan: plan.fixture, record(type, data) {
      if (events.length < 8192) events.push({phase, type, wallClockMs: Date.now(), ...data}); else throw Error('source-event-limit');
    }});
    const sessionFile = path.join(plan.out, 'sources.json');
    write(sessionFile, {schema: 1, origin: sources.origin, mediaOrigin: sources.mediaOrigin, cd2Endpoint: sources.cd2Endpoint});
    for (phase of PHASES) {
      need(Date.now() < deadline - 2000, 'run-deadline');
      sources.setHoldNext?.(phase === 'cancel' ? 'B' : null);
      const result = await child(plan, phase, sessionFile, deadline); results.push(result);
      const heldRequest = validatePhaseEvidence(result, events);
      if (phase === 'natural') result.preloadReusedWithoutBodyRefetch = true;
      if (phase === 'reopen') result.reopenFreshProbeOnly = true;
      if (phase === 'cancel') {
        need(sources.snapshot().heldRequests === 0, 'held-source-still-active');
        const released = await sources.releaseHeld?.();
        need(released === 0 && events.some(r => r.phase === phase && r.type === 'media-late-release-attempt' &&
          r.requestId === heldRequest && r.latewriteacceptedbytes === 0), 'late-source-write');
        report.cancelLateWriteAcceptedBytes = released;
      }
    }
    report.status = 'PASS';
  } catch (error) {report.stage = phase; report.code = safeFailure(error);}
  finally {
    try {report.sourceCleanup = await sources?.close();}
    catch (_) {report.status = 'FAIL'; report.code = 'source-cleanup-failed';}
    report.sourceEvents = events;
    write(path.join(plan.out, 'coordinator.json'), report);
    // Safe receipt has no source URL, private path, token, or raw stderr.
    console.log('SHARED_CACHE_WINDOWS ' + JSON.stringify({status: report.status, productCommit: report.productCommit,
      toolCommit: report.toolCommit, stage: report.stage || 'complete', code: report.code || null,
      cases: results.map(r => ({phase: r.phase, spawnPid: r.spawnPid, coordinatorPid: r.coordinatorPid,
        processTimeline: r.processTimeline, terminationReason: r.terminationReason, lifecycle: r.lifecycle, exitCode: r.exitCode, exitSignal: r.exitSignal,
        exitConfirmed: r.exitConfirmed, streamsClosed: r.streamsClosed, timedOut: r.timedOut,
        workerStages: r.workerStages, code: r.receipt?.code || r.receipt?.cleanupCode || null,
        ownedHelpersClosed: r.receipt?.ownedHelpersClosed, checks: r.receipt?.checks, afterHelper: r.receipt?.afterHelper,
        evaluations: r.receipt?.evaluations || [],
        cacheSelections: (r.receipt?.trace || []).filter(e => e.type === 'load' || e.type === 'preload').slice(-8)
          .map(({type, item, generation, proxied, state, bytes, cache, at}) => ({type, item, generation, proxied, state, bytes, cache, at})),
        cacheBudgetReads: (r.receipt?.trace || []).filter(e => e.type === 'cache-budget').slice(-12)
          .map(({item, generation, property, operation, outcome, shapeValid, requestState, elapsedMs, at}) => ({item, generation, property, operation, outcome, shapeValid, requestState, elapsedMs, at})),
        serverReports: (r.receipt?.trace || []).filter(e => e.type === 'server-report').slice(-12)
          .map(({method, item, session, mediaSource}) => ({method, item, session, mediaSource})),
        receiptOrigin: r.receipt?.receiptOrigin || null, evaluationTrace: (r.receipt?.trace || []).filter(e => e.type === 'evaluation-probe').slice(-24)
          .map(({operation, code}) => ({operation, code})), hiddenHarnessBackgroundThrottling: r.receipt?.hiddenHarnessBackgroundThrottling,
        stopTrace: (r.receipt?.trace || []).filter(e => ['stop-stage', 'destroy-ipc'].includes(e.type)).slice(-12)
          .map(({type, operation, ok}) => ({type, operation, ok})), seekObservations: r.receipt?.seekObservations || [],
        rendererDispatch: (r.receipt?.trace || []).filter(e => e.type === 'renderer-dispatch').slice(-6)
          .map(({operation, loading, loadingMainFrame, backgroundThrottling, destroyed, requestedMs, effectiveMs, remainingPhaseMs}) =>
            ({operation, loading, loadingMainFrame, backgroundThrottling, destroyed, requestedMs, effectiveMs, remainingPhaseMs}))})), cleanup: report.sourceCleanup}));
  }
  return report;
}
function argumentsOf(argv) {
  const [mode, ...args] = argv, values = {};
  need(['prepare', 'run'].includes(mode), 'invalid-mode');
  const allowed = mode === 'prepare' ? ['repo', 'runtime', 'installer', 'installer-sha256', 'product-sha', 'out'] : ['plan'];
  for (const arg of args) {const m = /^--([a-z][a-z0-9-]*)=(.+)$/.exec(arg);
    need(m && allowed.includes(m[1]) && !Object.hasOwn(values, m[1]), 'invalid-argument'); values[m[1]] = m[2];}
  need(allowed.every(k => values[k]), 'missing-argument');
  return {mode, values};
}
module.exports = {OWNER, PHASES, TOOL_FILES, watchdogDelay, within, executeStableFrame, observeExpression, voidCommandExpression, voidCommandAckExpression, executeAcknowledgedVoid, prepare, readPlan, childEnvironment, safeFailure, argumentsOf, validateProfile, coloredFrame, matchesStoppedReport, cacheSelectionSnapshot, observeCacheBudgetRead, validatePhaseEvidence, safeNativeTags, boundToolBytes};
if (require.main === module) (async () => {
  const {mode, values: v} = argumentsOf(process.argv.slice(2));
  if (mode === 'prepare') {await prepare({repo: v.repo, runtime: v.runtime, installer: v.installer,
    installerSha256: v['installer-sha256'], productCommit: v['product-sha'], out: v.out}); console.log('SHARED_CACHE_WINDOWS_PREPARE PASS');}
  else if ((await run({planFile: v.plan})).status !== 'PASS') process.exitCode = 1;
})().catch(error => {console.error('SHARED_CACHE_WINDOWS_ERROR ' + safeFailure(error)); process.exitCode = 1;});
