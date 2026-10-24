'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ci = require('../tools/ci-playback-range-smoke.cjs');
const source = fs.readFileSync(path.join(__dirname, '../tools/ci-playback-range-smoke.cjs'), 'utf8');
const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/public-ci.yml'), 'utf8').replace(/\r\n/g, '\n');
const job = workflow.slice(workflow.indexOf('\n  manual-playback-range-smoke:'), workflow.indexOf('\n  manual-windows-test-package:'));
function root(t) {const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-ci-range-'))); t.after(() => fs.rmSync(dir, {recursive: true, force: true})); return dir;}
function metadata() {return {id: ci.PIN.artifactId, expired: false, expires_at: '2099-01-01T00:00:00Z', digest: 'sha256:' + ci.PIN.zipSha256, workflow_run: {id: ci.PIN.runId, head_sha: ci.PIN.sourceCommit}};}
function run() {return {id: ci.PIN.runId, head_sha: ci.PIN.sourceCommit, status: 'completed', conclusion: 'success'};}
test('manual range route keeps the exact tool commit and leaves public/package routes and old concurrency independent', () => {
    assert.match(workflow, /range_smoke:\n[\s\S]*?type: choice\n        default: 'off'/);
    assert.match(job, /if: github.event_name == 'workflow_dispatch' && \(inputs.range_smoke == 'entry' \|\| inputs.range_smoke == 'native' \|\| inputs.range_smoke == 'loader-trial' \|\| inputs.range_smoke == 'disk-probe' \|\| inputs.range_smoke == 'buffer-export' \|\| inputs.range_smoke == 'buffer-export-av' \|\| inputs.range_smoke == 'buffer-export-edl'\)/);
    assert.match(job, /runs-on: windows-2022/); assert.match(job, /ref: c9cd9bacf81445c9c10befd121951b1c63c86faa/);
    assert.match(job, /group: ete-manual-playback-range-smoke/); assert.match(job, /cancel-in-progress: false/); assert.match(job, /timeout-minutes: 15/);
    assert.match(workflow, /group: ete-manual-windows-test-package/); assert.match(workflow, /^permissions:\n  contents: read$/m);
    assert.doesNotMatch(job, /prepare-ci-build-inputs|ci-windows-test-package|release\/|gh release|gh workflow run|createWorkflowDispatch|self-hosted|larger/);
    assert.match(job, /node-version: 24\.18\.1/); assert(job.includes('persist-credentials: false'));
});
test('only the acquisition step receives the standard token, with job-local read permissions and no new secrets', () => {
    assert.match(job, /permissions:\n      contents: read\n      actions: read/); assert.doesNotMatch(job, /write|secrets\.|GITHUB_ENV/);
    assert.equal((job.match(/GITHUB_TOKEN:/g) || []).length, 1);
    const tokenAt = job.indexOf('GITHUB_TOKEN:'); assert(tokenAt > job.indexOf('- name: Download only exact')); assert(tokenAt < job.indexOf('- name: Statically extract'));
    const input = {PATH: 'system', GITHUB_TOKEN: 'synthetic-inert', GH_TOKEN: 'synthetic-inert', ACTIONS_RUNTIME_TOKEN: 'synthetic-inert', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'synthetic-inert'};
    assert.deepEqual(ci.cleanEnvironment(input), {PATH: 'system'}); assert.equal(input.GITHUB_TOKEN, 'synthetic-inert');
});
test('new route requires explicit scope, task branch, own repository and no release staging', () => {
    for (const mode of ['entry', 'native', 'loader-trial', 'disk-probe']) ci.validateDispatch(mode, 'a'.repeat(40), ci.PIN.repository, 'false', 'refs/heads/feature/playback-range-cache');
    for (const [mode, commit, repo, release, ref] of [
        ['off', 'a'.repeat(40), ci.PIN.repository, 'false', 'refs/heads/feature/playback-range-cache'],
        ['entry', 'branch-name', ci.PIN.repository, 'false', 'refs/heads/feature/playback-range-cache'],
        ['entry', 'a'.repeat(40), 'other/repository', 'false', 'refs/heads/feature/playback-range-cache'],
        ['entry', 'a'.repeat(40), ci.PIN.repository, 'true', 'refs/heads/feature/playback-range-cache'],
        ['entry', 'a'.repeat(40), ci.PIN.repository, 'false', 'refs/heads/main']]) assert.throws(() => ci.validateDispatch(mode, commit, repo, release, ref));
});
test('metadata binds exact artifact, source run and successful source SHA', () => {
    const result = ci.validateMetadata(metadata(), run()); assert.equal(result.id, ci.PIN.artifactId); assert.equal(result.sourceCommit, ci.PIN.sourceCommit);
});
for (const change of ['expired', 'past', 'no-expiry', 'artifact-id', 'run-id', 'artifact-source', 'run-source', 'run-failed', 'run-pending', 'digest']) test('metadata refusal has no latest-artifact fallback: ' + change, () => {
    const a = metadata(), r = run();
    if (change === 'expired') a.expired = true; if (change === 'past') a.expires_at = '2000-01-01T00:00:00Z'; if (change === 'no-expiry') delete a.expires_at;
    if (change === 'artifact-id') a.id++; if (change === 'run-id') a.workflow_run.id++; if (change === 'artifact-source') a.workflow_run.head_sha = 'b'.repeat(40);
    if (change === 'run-source') r.head_sha = 'b'.repeat(40); if (change === 'run-failed') r.conclusion = 'failure'; if (change === 'run-pending') r.status = 'in_progress'; if (change === 'digest') a.digest = 'sha256:' + 'b'.repeat(64);
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
    assert(source.indexOf("runTool(plan, ['entry-smoke'") < source.indexOf("if (plan.mode === 'native') runTool"));
});
