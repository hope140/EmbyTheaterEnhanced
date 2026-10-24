'use strict';
const {temporaryRoot} = require('./helpers/range-fixture-root.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ci = require('../tools/ci-playback-range-smoke.cjs');
const source = fs.readFileSync(path.join(__dirname, '../tools/ci-playback-range-smoke.cjs'), 'utf8');
const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/public-ci.yml'), 'utf8').replace(/\r\n/g, '\n');
const job = workflow.slice(workflow.indexOf('\n  manual-playback-range-smoke:'),workflow.indexOf('\n  manual-windows-test-package:'));
function root(t) {const dir = temporaryRoot('ete-ci-range-'); t.after(() => fs.rmSync(dir, {recursive: true, force: true})); return dir;}
function metadata() {return {id: ci.PIN.artifactId, expired: false, expires_at: '2099-01-01T00:00:00Z', digest: 'sha256:' + ci.PIN.zipSha256, workflow_run: {id: ci.PIN.runId, head_sha: ci.PIN.sourceCommit}};}
function run() {return {id: ci.PIN.runId, head_sha: ci.PIN.sourceCommit, run_attempt: 1, status: 'completed', conclusion: 'success'};}
test('existing manual route reuses locked tools and cannot enter packaging in next-auto mode', () => {
    assert.match(workflow,/workflow_dispatch:/); assert.match(workflow,/range_smoke:[\s\S]*?default: 'off'/);
    assert.equal((workflow.match(/inputs\.range_smoke != 'next-auto'/g)||[]).length,2);
    assert.match(job,/ref: c9cd9bacf81445c9c10befd121951b1c63c86faa/);
    assert.match(job,/runs-on: windows-2022/); assert.match(job,/group: ete-manual-next-prefix-auto/);
    assert.match(job,/cancel-in-progress: false/); assert.match(job,/timeout-minutes: 15/);
    assert.doesNotMatch(job,/prepare-ci-build-inputs|ci-windows-test-package|build-native|git push|gh release|workflow_dispatch.*post/i);
    assert.match(job,/include-hidden-files: false/); assert.match(job,/node-version: 24\.18\.1/);
});
test('only the acquisition step receives the standard token, with job-local read permissions and no new secrets', () => {
    assert.match(job, /permissions:\n      contents: read\n      actions: read/); assert.doesNotMatch(job, /(?:contents|actions|id-token):\s*write|write-all|secrets\.|GITHUB_ENV/);
    assert.equal((job.match(/GITHUB_TOKEN:/g) || []).length, 1);
    const tokenAt = job.indexOf('GITHUB_TOKEN:'); assert(tokenAt > job.indexOf('- name: Download only exact')); assert(tokenAt < job.indexOf('- name: Statically extract'));
    const input = {PATH: 'system', GITHUB_TOKEN: 'synthetic-inert', GH_TOKEN: 'synthetic-inert', ACTIONS_RUNTIME_TOKEN: 'synthetic-inert', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'synthetic-inert'};
    assert.deepEqual(ci.cleanEnvironment(input), {PATH: 'system'}); assert.equal(input.GITHUB_TOKEN, 'synthetic-inert');
});
test('route requires exact independent task branch, explicit scope and no release', () => {
    ci.validateDispatch('next-auto','a'.repeat(40),ci.PIN.repository,'false','refs/heads/verify/next-prefix-v043-native-20261024');
    for(const [mode,commit,repo,release,ref] of [
        ['native','a'.repeat(40),ci.PIN.repository,'false','refs/heads/verify/next-prefix-v043-native-20261024'],
        ['next-auto','a'.repeat(40),ci.PIN.repository,'true','refs/heads/verify/next-prefix-v043-native-20261024'],
        ['next-auto','branch',ci.PIN.repository,'false','refs/heads/verify/next-prefix-v043-native-20261024'],
        ['next-auto','a'.repeat(40),'other/repo','false','refs/heads/verify/next-prefix-v043-native-20261024'],
        ['next-auto','a'.repeat(40),ci.PIN.repository,'false','refs/heads/main']
    ]) assert.throws(()=>ci.validateDispatch(mode,commit,repo,release,ref));
});
test('metadata binds exact artifact, source run and successful source SHA', () => {
    const result = ci.validateMetadata(metadata(), run()); assert.equal(result.id, ci.PIN.artifactId); assert.equal(result.sourceCommit, ci.PIN.sourceCommit);
});
for (const change of ['expired', 'past', 'no-expiry', 'artifact-id', 'run-id', 'artifact-source', 'run-source', 'run-failed', 'run-pending', 'run-attempt', 'digest']) test('metadata refusal has no latest-artifact fallback: ' + change, () => {
    const a = metadata(), r = run();
    if (change === 'expired') a.expired = true; if (change === 'past') a.expires_at = '2000-01-01T00:00:00Z'; if (change === 'no-expiry') delete a.expires_at;
    if (change === 'artifact-id') a.id++; if (change === 'run-id') a.workflow_run.id++; if (change === 'artifact-source') a.workflow_run.head_sha = 'b'.repeat(40);
    if (change === 'run-source') r.head_sha = 'b'.repeat(40); if (change === 'run-attempt') r.run_attempt = 2; if (change === 'run-failed') r.conclusion = 'failure'; if (change === 'run-pending') r.status = 'in_progress'; if (change === 'digest') a.digest = 'sha256:' + 'b'.repeat(64);
    assert.throws(() => ci.validateMetadata(a, r));
});
for (const status of [401, 403, 404, 410]) test('API refusal stops once without a retry or download: ' + status, async t => {
    const directory = root(t); let calls = 0;
    await assert.rejects(ci.acquire({root: directory}, 'synthetic-inert', async () => {calls++; return new Response(null, {status});}));
    assert.equal(calls, 1); assert.deepEqual(fs.readdirSync(directory), []);
});
test('API credentials are limited to the fixed API request and excluded from every signed-storage request', async t => {
    const directory = root(t), calls = [], token = 'synthetic-inert-no-credential', body = Buffer.from('fixture');
    const response = await ci.api('artifacts/' + ci.PIN.artifactId + '/zip', token, async (url, options) => {calls.push({url, options}); return new Response(null, {status: 302, headers: {Location: 'https://storage.invalid/file?sig=synthetic'}});});
    const expected = {size: body.length, sha256: require('node:crypto').createHash('sha256').update(body).digest('hex')};
    await ci.downloaded(response.headers.get('location'), path.join(directory, 'file.zip'), expected, async (url, options) => {
        calls.push({url, options}); return calls.length === 2 ? new Response(null, {status: 302, headers: {Location: 'https://other-storage.invalid/file?sig=synthetic'}}) : new Response(body);
    });
    assert.equal(calls[0].options.headers.Authorization, 'Bearer ' + token); assert.match(calls[0].url, /^https:\/\/api\.github\.com\/repos\/hope140\/EmbyTheaterEnhanced\/actions\//);
    for (const call of calls.slice(1)) assert.deepEqual(call.options.headers, {});
    assert(fs.readFileSync(path.join(directory, 'file.zip')).equals(body));
});
for (const failure of ['oversize', 'short', 'wrong-hash']) test('download byte gate refuses ' + failure + ' before extraction', async t => {
    const directory = root(t), body = Buffer.from('abcdef'), size = failure === 'oversize' ? 5 : failure === 'short' ? 7 : 6;
    await assert.rejects(ci.downloaded('https://storage.invalid/pinned', path.join(directory, 'file.zip'), {size, sha256: '0'.repeat(64)}, async () => new Response(body)), /download-/);
});
for (const url of ['http://storage.invalid/file', 'https://user:password@storage.invalid/file', 'file:///tmp/file', 'https://storage.invalid/file#fragment']) test('unsafe signed location is refused: ' + url.split(':')[0], () => assert.throws(() => ci.secureLocation(url)));
test('collection excludes binaries/profile/env and records truncated logs and omitted oversize JSON explicitly', t => {
    const directory = root(t), smoke = path.join(directory, 'smoke'); fs.mkdirSync(smoke); fs.mkdirSync(path.join(smoke, 'profile')); fs.writeFileSync(path.join(smoke, 'profile', 'secret.json'), 'never upload');
    fs.writeFileSync(path.join(directory, 'candidate.zip'), 'never upload'); fs.writeFileSync(path.join(directory, 'acquire.json'), '{}'); fs.writeFileSync(path.join(smoke, 'entry.stdout'), Buffer.alloc(600000, 65));
    fs.writeFileSync(path.join(smoke, 'entry.json'), '{}'); const plan = {root: directory, paths: {smoke}, mode: 'entry', workflowCommit: 'a'.repeat(40)}, destination = path.join(directory, 'evidence');
    const rows = ci.collect(plan, destination); assert(rows.some(row => row.name === 'entry.stdout' && row.action === 'tail-only'));
    assert.equal(fs.statSync(path.join(destination, 'entry.stdout')).size, 524288); assert(!fs.existsSync(path.join(destination, 'candidate.zip'))); assert(!fs.existsSync(path.join(destination, 'profile')));
    fs.writeFileSync(path.join(smoke, 'entry.json'), Buffer.alloc(1048577)); const other = path.join(directory, 'other-evidence');
    assert.throws(() => ci.collect(plan, other), /artifact-evidence-size-refused/); assert.equal(JSON.parse(fs.readFileSync(path.join(other, 'collection.json'))).complete, false);
});
test('workflow and static extraction retain hash gates, bounded receipts and no Work process/system queries', () => {
    const ps = fs.readFileSync(path.join(__dirname, '../tools/ci-playback-range-unpack.ps1'), 'utf8');
    assert(ps.indexOf('verify-acquired') < ps.indexOf('Expand-Archive')); assert(ps.indexOf('expanded-inputs') < ps.indexOf('& $verified.unpacker -t'));
    assert.match(ps, /extraction-failed/); assert(ci.EVIDENCE.includes('extraction-failure.json'));
    assert.doesNotMatch(source + ps + job, /Get-Process|Win32_Process|Get-CimInstance|Stop-Process|taskkill|runas|DispatchWorkflow/);
    assert.match(job, /path: range-smoke-evidence\/\*/); assert.match(job, /retention-days: 1/); assert.match(job, /include-hidden-files: false/);
    assert(source.indexOf("runTool(plan, ['entry-smoke'") < source.indexOf("runTool(plan, ['run'"));
});

test('043 route runs only natural automatic chain and existing held-exit with real preview drain', () => {
    assert.match(source,/baseSourceCommit: PIN.sourceCommit, overlaySourceCommit: plan.workflowCommit/);
    assert.match(source,/'--execute-electron-entry'/); assert.match(source,/'--execute-native'/);
    assert.match(source,/'--execute-native-joint-exit'/); assert.doesNotMatch(source,/runTool\(plan, \['run-matrix/);
    assert.equal(ci.PIN.sourceCommit,'b8938f4ba9149e700ea1437b3f5fbe3535a2f5e5');
    assert.equal(ci.PIN.artifactId,12573411870); assert.equal(ci.PIN.runAttempt,1);
});
test('automatic collection includes natural chain receipts while omitting plan/profile/media', t => {
    const directory = root(t), smoke = path.join(directory, 'smoke'); fs.mkdirSync(smoke);
    for (const name of ['native.trace.ndjson', 'native.json', 'entry-coordinator.json', 'native-coordinator.json', 'auto-plan.json', 'B.avi']) fs.writeFileSync(path.join(smoke, name), '{}');
    const destination = path.join(directory, 'evidence'), plan = {root: directory, paths: {smoke}, mode: 'next-auto', workflowCommit: 'a'.repeat(40)};
    ci.collect(plan, destination);
    const names = fs.readdirSync(destination);
    for (const name of ['auto-native.trace.ndjson', 'auto-native.json', 'auto-entry-coordinator.json', 'auto-native-coordinator.json']) assert(names.includes(name));
    assert(!names.some(name => /plan|avi|profile/.test(name)));
});


test('job-visible automatic failure summary preserves fixed native reasons and excludes arbitrary receipt data', t => {
    const directory = root(t), canary = 'synthetic-sensitive-canary-no-real-data';
    fs.writeFileSync(path.join(directory, 'native-coordinator.json'), JSON.stringify({status: 'failed', code: 'owned-Electron-exit-failed', exit: {code: 1, timedOut: false, streamsClosed: true}, private: canary}));
    fs.writeFileSync(path.join(directory, 'native.json'), JSON.stringify({status: 'failed', code: 'automatic-native-deadline', detail: canary,
        cleanup: ['helper-exit-UNCERTAIN', canary], helpers: [null, {exited: true, path: canary, diagnostics: {
            processExitCode: 23, streamsClosed: true, labels: ['dll-load-failed', canary], systemCodes: [126, canary], stderr: canary}}]}));
    fs.writeFileSync(path.join(directory, 'native.trace.ndjson'), [null, {seq: 1, type: 'load', item: 'A', source: canary},
        {seq: 2, type: 'native-property', name: 'time-pos', value: 11.3, detail: canary},
        {seq: 3, type: 'renderer-failure', name: canary, value: canary, detail: canary}, {seq: 4, type: canary}].map(row => JSON.stringify(row)).join('\n'));
    const summary = ci.automaticFailureSummary(directory), native = summary.phases.find(row => row.phase === 'native');
    assert.equal(native.code, 'automatic-native-deadline'); assert.equal(native.exitCode, 1); assert.equal(native.streamsClosed, true);
    assert.deepEqual(native.helpers[0].labels, ['dll-load-failed']); assert.deepEqual(native.helpers[0].systemCodes, [126]);
    assert.equal(summary.events.length, 3); assert.equal(summary.events[1].value, 11.3);
    assert(!JSON.stringify(summary).includes(canary));
    assert.match(source, /console\.error\(JSON\.stringify\(automaticFailureSummary\(plan\.paths\.smoke, file\)\)\)/);
});
test('missing, malformed and oversize phase evidence stays unrecorded and bounded in job logs', t => {
    const directory = root(t);
    fs.writeFileSync(path.join(directory, 'native.json'), '{malformed');
    fs.writeFileSync(path.join(directory, 'entry.json'), Buffer.alloc(65537));
    fs.writeFileSync(path.join(directory, 'native.trace.ndjson'), Buffer.alloc(1048577));
    const summary = ci.automaticFailureSummary(directory);
    assert(summary.phases.every(row => row.status === 'not-recorded' && row.exitCode === null));
    assert.deepEqual(summary.events, []); assert(JSON.stringify(summary).length < 4000);
});

test('prepare failure is surfaced from command stdout even before owned output or Electron receipts exist', t => {
    const directory = root(t), file = path.join(directory, 'prepare.stdout'), canary = 'synthetic-private-prepare-canary';
    fs.writeFileSync(file, 'driver-source-mismatch\n');
    let summary = ci.automaticFailureSummary(path.join(directory, 'uncreated-output'), file);
    assert.deepEqual(summary.prepare, {status: 'failed', stage: 'driver-source', code: 'driver-source-mismatch', systemCode: null, gitExitCode: null});
    assert(summary.phases.every(row => row.status === 'not-recorded'));
    fs.writeFileSync(file, [JSON.stringify({type: 'next-auto-prepare-stage', stage: 'loader-validation', private: canary}),
        JSON.stringify({type: 'next-auto-prepare-failure', stage: 'loader-validation', code: 'prepare-filesystem-error', systemCode: 'ENOENT', gitExitCode: null, message: canary}), canary].join('\n'));
    summary = ci.automaticFailureSummary(path.join(directory, 'uncreated-output'), file);
    assert.equal(summary.prepare.stage, 'loader-validation'); assert.equal(summary.prepare.code, 'prepare-filesystem-error'); assert.equal(summary.prepare.systemCode, 'ENOENT');
    assert(!JSON.stringify(summary).includes(canary));
});

test('unrequested matrix modes stay disabled while existing safe scalar summaries remain usable', t => {
    assert.throws(() => ci.validateDispatch('next-matrix', 'a'.repeat(40), ci.PIN.repository, 'false', 'refs/heads/verify/next-prefix-v043-native-20261024'));
    assert.throws(() => ci.validateDispatch('next-matrix', 'a'.repeat(40), ci.PIN.repository, 'false', 'refs/heads/main'));
    assert.doesNotMatch(source, /runTool\(plan, \['run-matrix/);
    const directory = root(t), canary = 'synthetic-private-matrix-canary';
    fs.writeFileSync(path.join(directory, 'matrix-cancel.json'), JSON.stringify({status: 'passed', code: canary, helpers: [{exited: true, diagnostics: {processExitCode: 0, streamsClosed: true}}], checks: {defaultPreloadMB: 300, heldRequestClosed: true, lateBytes: 0, private: canary}}));
    fs.writeFileSync(path.join(directory, 'matrix-cancel-coordinator.json'), JSON.stringify({status: 'passed', exit: {code: 0, streamsClosed: true}}));
    const summary = ci.automaticCaseSummary(directory, 'matrix-cancel');
    assert.equal(summary.status, 'passed'); assert.equal(summary.checks.defaultPreloadMB, 300); assert.equal(summary.payloadClearGatePassed, true);
    assert(!JSON.stringify(summary).includes(canary));
});

test('preempt failure exposes bounded cache/seek stages and load generations without arbitrary trace fields', t => {
    const directory = root(t), canary = 'synthetic-private-preempt-canary';
    fs.writeFileSync(path.join(directory, 'matrix-preempt.json'), JSON.stringify({status: 'failed', code: 'matrix-seek-target-cached'}));
    fs.writeFileSync(path.join(directory, 'matrix-preempt.trace.ndjson'), [
        {seq: 1, type: 'load', item: 'A', generation: 101, source: canary},
        {seq: 2, type: 'matrix-preempt-stage', stage: 'cache-observed', generation: 101, heldClosed: false, position: 11.25, forwardCacheBytes: 1048576, backwardCacheBytes: 0, ranges: [{start: 0, end: 16, path: canary}], detail: canary},
        {seq: 3, type: 'matrix-preempt-stage', stage: canary, detail: canary}
    ].map(JSON.stringify).join('\n'));
    const result = ci.automaticFailureSummary(directory);
    assert.equal(result.preemptStages.length, 1);
    assert.deepEqual(result.preemptStages[0].ranges, [{start: 0, end: 16}]);
    assert.equal(result.preemptStages[0].position, 11.25);
    assert.deepEqual(ci.automaticCaseSummary(directory, 'matrix-preempt').preemptStages, result.preemptStages);
    assert.deepEqual(result.lastLoads, [{item: 'A', generation: 101, seq: 1}]);
    assert(!JSON.stringify(result).includes(canary));
});
