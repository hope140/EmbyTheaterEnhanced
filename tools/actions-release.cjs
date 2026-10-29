'use strict';

// Release control code runs from the dispatched main commit, separately from
// the read-only build checkout. No target/artifact script executes here.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const REPO = 'hope140/EmbyTheaterEnhanced';
const TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SHA = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const requireThat = (value, code) => { if (!value) throw new Error(code); };

function inputs(env) {
    const tag = env.ETE_RELEASE_TAG, source = env.ETE_RELEASE_SOURCE, channel = env.ETE_RELEASE_CHANNEL;
    const latest_tag = env.ETE_RELEASE_LATEST_TAG;
    requireThat(TAG.test(tag || '') && SHA.test(source || '') && ['testing', 'stable'].includes(channel), 'invalid-release-input');
    requireThat(latest_tag === 'NONE' || TAG.test(latest_tag || ''), 'invalid-expected-latest');
    const build_run = env.ETE_RELEASE_BUILD_RUN || '0';
    requireThat(/^(0|[1-9]\d*)$/.test(build_run), 'invalid-build-run');
    const mode = env.ETE_RELEASE_MODE || 'verify';
    requireThat(['verify', 'publish'].includes(mode), 'invalid-release-mode');
    return {tag, source, channel, version: tag.slice(1), latest_tag, build_run, mode};
}
function newer(tag, prior) {
    if (prior === 'NONE') return true;
    const a = tag.slice(1).split('.').map(BigInt), b = prior.slice(1).split('.').map(BigInt);
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
    return false;
}
function latestIdentity(release) {
    if (!release) return {latest_id: '0', latest_tag: 'NONE'};
    requireThat(Number.isSafeInteger(release.id) && release.id > 0 && TAG.test(release.tag_name) &&
        release.draft === false && release.prerelease === false, 'invalid-latest-release');
    return {latest_id: String(release.id), latest_tag: release.tag_name};
}
async function resolveTag(api, tag) {
    let value = (await api('GET', `/git/ref/tags/${tag}`)).object;
    for (let depth = 0; value?.type === 'tag' && depth < 5; depth++) {
        requireThat(SHA.test(value.sha), 'invalid-tag-object');
        value = (await api('GET', `/git/tags/${value.sha}`)).object;
    }
    requireThat(value?.type === 'commit' && SHA.test(value.sha), 'tag-does-not-resolve-to-commit');
    return value.sha;
}
async function noExistingRelease(api, tag, allowedId) {
    for (let page = 1; ; page++) {
        const releases = await api('GET', `/releases?per_page=100&page=${page}`);
        requireThat(Array.isArray(releases), 'invalid-release-list');
        requireThat(!releases.some(release => release.tag_name === tag && release.id !== allowedId), 'release-already-exists');
        if (releases.length < 100) return;
    }
}
async function checkRemote(api, plan, allowedId) {
    requireThat(await resolveTag(api, plan.tag) === plan.source, 'tag-source-changed');
    await noExistingRelease(api, plan.tag, allowedId);
    const latest = latestIdentity(await api('GET', '/releases/latest', undefined, {allow404: true}));
    requireThat(latest.latest_tag === plan.latest_tag &&
        (plan.latest_id === undefined || latest.latest_id === plan.latest_id), 'latest-changed');
    return latest;
}
function readOnlyApi(api) {
    return (method, ...args) => {
        requireThat(method === 'GET', 'verification-write-forbidden');
        return api(method, ...args);
    };
}
async function verificationRemote(api, plan, rows) {
    api = readOnlyApi(api);
    const existing = await api('GET', `/releases/tags/${plan.tag}`, undefined, {allow404: true});
    if (existing) requireThat(Number.isSafeInteger(existing.id) && existing.id > 0 &&
        existing.draft === false && existing.tag_name === plan.tag, 'invalid-verification-release');
    const existing_release_id = String(existing?.id || 0);
    requireThat(plan.existing_release_id === undefined || plan.existing_release_id === existing_release_id, 'verification-release-changed');
    const latest = await checkRemote(api, plan, existing?.id);
    if (existing && rows) {
        verifyAssets(existing, rows);
        requireThat(existing.name === `${plan.tag} ${plan.channel === 'testing' ? '测试版' : '正式版'}` &&
            existing.prerelease === (plan.channel === 'testing') &&
            existing.body === rows.find(row => row.name === 'RELEASE_NOTES.md').bytes.toString('utf8'), 'verification-release-metadata-mismatch');
    }
    return {...latest, existing_release_id};
}
async function verifiedBuild(api, plan) {
    requireThat(/^[1-9]\d*$/.test(plan.build_run || ''), 'invalid-build-run');
    const run = await api('GET', `/actions/runs/${plan.build_run}`);
    requireThat(run.status === 'completed' && run.conclusion === 'success' && run.event === 'workflow_dispatch' &&
        run.head_sha === plan.source && run.path === '.github/workflows/public-ci.yml' &&
        run.repository?.full_name === REPO && Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0, 'unverified-source-build');
    const artifact = `ete-test-win-x64-${plan.source}-${plan.build_run}-${run.run_attempt}`;
    // The old manual build publishes exactly one artifact. Its summary must
    // additionally attest releasePackage=true in verifyFiles, not merely CI success.
    const list = await api('GET', `/actions/runs/${plan.build_run}/artifacts?per_page=100`);
    requireThat(Array.isArray(list.artifacts) && list.artifacts.filter(row => row.name === artifact && row.expired === false).length === 1, 'verified-build-artifact-unavailable');
    return {build_attempt: String(run.run_attempt), build_artifact: artifact};
}
async function preflight(plan, api, readSource) {
    requireThat(['verify', 'publish'].includes(plan.mode), 'invalid-release-mode');
    if (plan.mode === 'publish') requireThat(newer(plan.tag, plan.latest_tag), 'version-must-exceed-latest');
    const latest = plan.mode === 'verify' ? await verificationRemote(api, plan) : await checkRemote(api, plan);
    const pkg = JSON.parse(readSource('package.json'));
    const lock = JSON.parse(readSource('package-lock.json'));
    requireThat(pkg.version === plan.version && lock.version === plan.version && lock.packages?.['']?.version === plan.version, 'source-version-mismatch');
    const notes = Buffer.from(readSource('docs/RELEASE_NOTES.md'));
    const title = `${plan.tag} ${plan.channel === 'testing' ? '测试版' : '正式版'}`;
    requireThat(notes.toString('utf8').split(/\r?\n/)[0] === '# ' + title, 'source-notes-channel-mismatch');
    // Older tags (including the original v0.4.5) use GITHUB_SHA only. Never
    // replace a GitHub identity variable or patch a tagged build to work around it.
    const build_run = plan.build_run || '0';
    let build = {build_attempt: '0', build_artifact: ''};
    if (build_run === '0') {
        requireThat(/param\([^\n]*\[string\]\$ExpectedSourceCommit\s*=\s*\$env:GITHUB_SHA\)/.test(
            readSource('tools/ci-windows-test-package.ps1').toString()), 'source-builder-does-not-support-pinned-checkout');
    } else build = await verifiedBuild(api, plan);
    return {...plan, build_run, ...build, ...latest, notes_sha256: sha256(notes)};
}
function regularBytes(directory, name) {
    requireThat(fs.lstatSync(directory).isDirectory() && !fs.lstatSync(directory).isSymbolicLink(), 'physical-artifact-directory-required');
    const file = path.join(directory, name), info = fs.lstatSync(file);
    requireThat(info.isFile() && !info.isSymbolicLink(), 'physical-artifact-file-required');
    return fs.readFileSync(file);
}
function verifyFiles(directory, plan, runId, runAttempt) {
    requireThat(HASH.test(plan.notes_sha256 || '') && /^[1-9]\d*$/.test(runId) && /^[1-9]\d*$/.test(runAttempt), 'invalid-build-binding');
    const installer = `EmbyTheaterEnhanced-${plan.version}-win-x64-setup.exe`;
    const names = [installer, installer + '.provenance.json', installer + '.sha256', 'RELEASE_NOTES.md', 'SHA256SUMS.txt'];
    const rows = names.map(name => { const bytes = regularBytes(directory, name); return {name, bytes, size: bytes.length, sha256: sha256(bytes)}; });
    const [exe, provenance, checksum, notes, sums] = rows;
    requireThat(exe.bytes.subarray(0, 2).toString() === 'MZ', 'installer-not-pe');
    const receipt = JSON.parse(provenance.bytes.toString('utf8'));
    requireThat(receipt.sourceCommit === plan.source && receipt.version === plan.version &&
        receipt.installer?.fileName === installer && receipt.installer.size === exe.size && receipt.installer.sha256 === exe.sha256, 'installer-provenance-mismatch');
    requireThat(checksum.bytes.toString('utf8') === `${exe.sha256}  ${installer}\n`, 'installer-checksum-mismatch');
    requireThat(notes.sha256 === plan.notes_sha256, 'notes-source-mismatch');
    requireThat(sums.bytes.toString('utf8') === rows.slice(0, 4).map(row => `${row.sha256}  ${row.name}\n`).join(''), 'five-file-checksum-mismatch');
    const summary = JSON.parse(regularBytes(directory, 'test-build-summary.json').toString('utf8'));
    requireThat(summary.status === 'passed' && summary.releasePackage === true && summary.sourceCommit === plan.source &&
        summary.version === plan.version && summary.installer === installer && String(summary.runId) === runId &&
        String(summary.runAttempt) === runAttempt && summary.releasePublished === false, 'build-summary-mismatch');
    return rows;
}
function verifyAssets(release, rows) {
    requireThat(Array.isArray(release.assets) && release.assets.length === rows.length, 'release-asset-count-mismatch');
    for (const row of rows) {
        const matches = release.assets.filter(asset => asset.name === row.name);
        requireThat(matches.length === 1 && matches[0].state === 'uploaded' && matches[0].size === row.size &&
            matches[0].digest === 'sha256:' + row.sha256, 'release-asset-digest-mismatch');
    }
}
async function publish(plan, rows, api, onDraft = () => {}) {
    requireThat(plan.mode === 'publish', 'explicit-publish-mode-required');
    await checkRemote(api, plan);
    const testing = plan.channel === 'testing';
    const name = `${plan.tag} ${testing ? '测试版' : '正式版'}`;
    const body = rows.find(row => row.name === 'RELEASE_NOTES.md').bytes.toString('utf8');
    const draft = await api('POST', '/releases', {tag_name: plan.tag, target_commitish: plan.source,
        name, body, draft: true, prerelease: testing, make_latest: 'false'});
    requireThat(Number.isSafeInteger(draft.id) && draft.id > 0 && draft.draft === true && draft.tag_name === plan.tag, 'invalid-created-draft');
    onDraft(draft.id);
    for (const row of rows) await api('POST', `/releases/${draft.id}/assets?name=${encodeURIComponent(row.name)}`, row.bytes, {upload: true});
    const staged = await api('GET', `/releases/${draft.id}`);
    verifyAssets(staged, rows);
    requireThat(staged.draft === true && staged.tag_name === plan.tag && staged.name === name && staged.body === body && staged.prerelease === testing, 'draft-metadata-changed');
    await checkRemote(api, plan, draft.id);
    await api('PATCH', `/releases/${draft.id}`, {draft: false, prerelease: testing, make_latest: testing ? 'false' : 'true'});
    const result = await api('GET', `/releases/${draft.id}`);
    verifyAssets(result, rows);
    requireThat(result.draft === false && result.tag_name === plan.tag && result.name === name && result.body === body && result.prerelease === testing, 'published-metadata-mismatch');
    requireThat(await resolveTag(api, plan.tag) === plan.source, 'published-tag-source-changed');
    const latest = latestIdentity(await api('GET', '/releases/latest', undefined, {allow404: true}));
    requireThat(testing ? latest.latest_id === plan.latest_id && latest.latest_tag === plan.latest_tag : latest.latest_id === String(draft.id) && latest.latest_tag === plan.tag, 'published-latest-mismatch');
    return {id: result.id, tag: plan.tag, source: plan.source, channel: plan.channel,
        url: `https://github.com/${REPO}/releases/tag/${plan.tag}`, files: rows.map(({name: file, size, sha256: digest}) => ({name: file, size, sha256: digest}))};
}
async function verifyPackage(plan, rows, api) {
    requireThat(plan.mode === 'verify' && /^(0|[1-9]\d*)$/.test(plan.existing_release_id || ''), 'verification-plan-required');
    const remote = await verificationRemote(api, plan, rows);
    return {mode: 'verify', status: 'passed', tag: plan.tag, source: plan.source, ...remote,
        uploadVerified: false, files: rows.map(({name, size, sha256}) => ({name, size, sha256}))};
}
function githubApi(token, fetcher = fetch) {
    requireThat(typeof token === 'string' && token.length > 0, 'github-token-required');
    return async (method, resource, data, options = {}) => {
        const upload = options.upload === true;
        requireThat(resource.startsWith('/') && !resource.includes('..') && (!upload || method === 'POST' && /^\/releases\/\d+\/assets\?name=/.test(resource)), 'invalid-api-resource');
        const response = await fetcher(`https://${upload ? 'uploads' : 'api'}.github.com/repos/${REPO}${resource}`, {
            method, redirect: 'error', signal: AbortSignal.timeout(120000),
            headers: {Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28', ...(data === undefined ? {} : {'Content-Type': upload ? 'application/octet-stream' : 'application/json'})},
            ...(data === undefined ? {} : {body: upload ? data : JSON.stringify(data)})
        });
        if (response.status === 404 && options.allow404) return null;
        requireThat(response.ok, `github-${upload ? 'upload' : 'api'}-${response.status}`);
        return response.json();
    };
}
async function main(command, directory, env = process.env) {
    requireThat(env.GITHUB_ACTIONS === 'true' && env.GITHUB_EVENT_NAME === 'workflow_dispatch' &&
        env.GITHUB_REF === 'refs/heads/main' && env.GITHUB_REPOSITORY === REPO && SHA.test(env.GITHUB_SHA || ''), 'manual-main-workflow-required');
    const plan = inputs(env);
    requireThat(command === 'preflight' || command === plan.mode, 'release-mode-command-mismatch');
    const transport = githubApi(env.GH_TOKEN), api = plan.mode === 'verify' ? readOnlyApi(transport) : transport;
    if (command === 'preflight') {
        const git = args => cp.execFileSync('git', args);
        requireThat(git(['rev-parse', 'HEAD']).toString().trim() === env.GITHUB_SHA, 'control-checkout-mismatch');
        cp.execFileSync('git', ['merge-base', '--is-ancestor', plan.source, 'origin/main']);
        const result = await preflight(plan, api, name => git(['show', `${plan.source}:${name}`]));
        for (const [key, value] of Object.entries(result)) fs.appendFileSync(env.GITHUB_OUTPUT, `${key}=${value}\n`);
        console.log(JSON.stringify(result));
    } else {
        plan.latest_id = env.ETE_RELEASE_LATEST_ID;
        plan.notes_sha256 = env.ETE_RELEASE_NOTES_SHA256;
        plan.existing_release_id = env.ETE_RELEASE_EXISTING_ID;
        requireThat(/^(0|[1-9]\d*)$/.test(plan.latest_id || ''), 'invalid-latest-id');
        let buildRun = env.GITHUB_RUN_ID, buildAttempt = env.GITHUB_RUN_ATTEMPT;
        if (plan.build_run !== '0') {
            const build = await verifiedBuild(api, plan);
            requireThat(build.build_attempt === env.ETE_RELEASE_BUILD_ATTEMPT, 'source-build-attempt-changed');
            buildRun = plan.build_run; buildAttempt = build.build_attempt;
        }
        const rows = verifyFiles(directory, plan, buildRun, buildAttempt);
        const result = command === 'verify' ? await verifyPackage(plan, rows, api) :
            await publish(plan, rows, api, id => console.log(`Created draft release ${id}; failures leave it for explicit review.`));
        console.log(JSON.stringify(result));
    }
}
module.exports = {inputs, newer, preflight, verifyFiles, verifyAssets, publish, verifyPackage, readOnlyApi, githubApi, resolveTag, checkRemote, verifiedBuild};
if (require.main === module) main(process.argv[2], process.argv[3]).catch(error => {
    // Do not print response bodies, request URLs, authentication or raw errors.
    const code = /^[a-z][a-z0-9-]+$/.test(error.message || '') ? error.message : 'release-operation-failed';
    console.error(`Release stopped: ${code}. Inspect the run and any created draft before retrying; no automatic retry or cleanup.`);
    process.exitCode = 1;
});
