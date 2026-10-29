'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const release = require('../tools/actions-release.cjs');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const source = 'a'.repeat(40);
const notes = Buffer.from('# v0.4.6 测试版\n\nSynthetic notes.\n');
const plan = {mode: 'publish', tag: 'v0.4.6', version: '0.4.6', source, channel: 'testing', latest_tag: 'v0.4.0', latest_id: '40', notes_sha256: hash(notes)};
const originalLatest = {id: 40, tag_name: 'v0.4.0', draft: false, prerelease: false};

function fakeApi(options = {}) {
    const calls = [], assets = [];
    let draft, latest = {...originalLatest}, uploads = 0;
    const api = async (method, resource, data) => {
        calls.push({method, resource, data});
        if (/^\/actions\/runs\/123$/.test(resource)) return {status: 'completed', conclusion: 'success', event: 'workflow_dispatch',
            head_sha: options.tagSource || source, path: '.github/workflows/public-ci.yml', repository: {full_name: 'hope140/EmbyTheaterEnhanced'}, run_attempt: 1,
            ...(options.build || {})};
        if (resource === '/actions/runs/123/artifacts?per_page=100') return {artifacts: [
            {name: `ete-test-win-x64-${options.tagSource || source}-123-1`, expired: !!options.expired}
        ]};
        if (resource.startsWith('/git/ref/tags/')) return {object: {type: 'commit', sha: options.tagSource || source}};
        if (resource.startsWith('/releases/tags/')) return options.existing?.find(row => row.tag_name === plan.tag) || null;
        if (resource === '/releases/latest') return latest;
        if (resource.startsWith('/releases?')) return [...(options.existing || []), ...(draft ? [draft] : [])];
        if (resource === '/releases' && method === 'POST') return draft = {...data, id: 100, assets};
        if (resource.startsWith('/releases/100/assets?') && method === 'POST') {
            if (options.failUpload) throw Error('github-upload-403');
            uploads++;
            const name = new URL('https://fixture.invalid' + resource).searchParams.get('name');
            assets.push({name, state: 'uploaded', size: data.length, digest: 'sha256:' + hash(data)});
            if (options.driftLatest && uploads === 5) latest = {...originalLatest, id: 41};
            return assets.at(-1);
        }
        if (resource === '/releases/100' && method === 'PATCH') {
            Object.assign(draft, data);
            if (!draft.prerelease) latest = draft;
            return draft;
        }
        if (resource === '/releases/100' && method === 'GET') {
            if (options.badDigest && assets.length) assets[0].digest = 'sha256:' + '0'.repeat(64);
            return draft;
        }
        throw Error('unexpected-fixture-request');
    };
    return {api, calls, assets, draft: () => draft};
}
function sourceFile(name, override = {}) {
    const files = {
        'package.json': JSON.stringify({version: plan.version}),
        'package-lock.json': JSON.stringify({version: plan.version, packages: {'': {version: plan.version}}}),
        'docs/RELEASE_NOTES.md': notes,
        'tools/ci-windows-test-package.ps1': fs.readFileSync(path.join(__dirname, '../tools/ci-windows-test-package.ps1'), 'utf8'),
        ...override
    };
    return files[name];
}
function artifact(t, value = plan, text = notes) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-release-fixture-'));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    const installer = `EmbyTheaterEnhanced-${value.version}-win-x64-setup.exe`, exe = Buffer.from('MZ synthetic installer');
    const files = {[installer]: exe, [installer + '.provenance.json']: Buffer.from(JSON.stringify({sourceCommit: value.source, version: value.version,
        installer: {fileName: installer, size: exe.length, sha256: hash(exe)}})), [installer + '.sha256']: Buffer.from(`${hash(exe)}  ${installer}\n`), 'RELEASE_NOTES.md': text};
    files['SHA256SUMS.txt'] = Buffer.from(Object.entries(files).map(([name, bytes]) => `${hash(bytes)}  ${name}\n`).join(''));
    files['test-build-summary.json'] = Buffer.from(JSON.stringify({status: 'passed', releasePackage: true, sourceCommit: value.source,
        version: value.version, installer, runId: '123', runAttempt: '1', releasePublished: false}));
    for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(path.join(directory, name), bytes);
    return {directory, files, rows: () => release.verifyFiles(directory, value, '123', '1')};
}

test('manual inputs reject unsafe tags, nonexact source and unknown channels', () => {
    const env = {ETE_RELEASE_TAG: plan.tag, ETE_RELEASE_SOURCE: source, ETE_RELEASE_CHANNEL: 'testing', ETE_RELEASE_LATEST_TAG: 'v0.4.0'};
    assert.equal(release.inputs(env).version, '0.4.6');
    assert.equal(release.inputs(env).mode, 'verify');
    assert.equal(release.inputs({...env, ETE_RELEASE_MODE: 'publish'}).mode, 'publish');
    for (const extra of [{ETE_RELEASE_TAG: 'v0.4.6;echo bad'}, {ETE_RELEASE_SOURCE: 'main'}, {ETE_RELEASE_CHANNEL: 'other'}, {ETE_RELEASE_LATEST_TAG: 'latest'}, {ETE_RELEASE_MODE: 'dry-run-ish'}]) {
        assert.throws(() => release.inputs({...env, ...extra}), /invalid/);
    }
    assert.equal(release.newer('v0.4.10', 'v0.4.9'), true);
    assert.equal(release.newer('v0.4.0', 'v0.4.0'), false);
});
test('preflight binds tag, source versions, channel notes and current Latest without writes', async () => {
    const f = fakeApi(); const result = await release.preflight(plan, f.api, sourceFile);
    assert.equal(result.notes_sha256, hash(notes)); assert.equal(result.latest_id, '40');
    assert(f.calls.every(call => call.method === 'GET'));
});
test('annotated tags resolve to the pinned commit', async () => {
    const api = async (method, resource) => resource.includes('/git/ref/') ? {object: {type: 'tag', sha: 'b'.repeat(40)}} : {object: {type: 'commit', sha: source}};
    assert.equal(await release.resolveTag(api, plan.tag), source);
});
test('source drift, version drift and channel-note mismatch stop before any write', async () => {
    for (const [options, files, code] of [
        [{tagSource: 'b'.repeat(40)}, {}, /tag-source-changed/],
        [{}, {'package.json': JSON.stringify({version: '0.4.7'})}, /source-version-mismatch/],
        [{}, {'docs/RELEASE_NOTES.md': '# v0.4.6 正式版\n'}, /source-notes-channel-mismatch/]
    ]) {
        const f = fakeApi(options);
        await assert.rejects(release.preflight(plan, f.api, name => sourceFile(name, files)), code);
        assert(f.calls.every(call => call.method === 'GET'));
    }
});
test('the original v0.4.5 builder cannot be patched or silently used across workflow sources', async () => {
    const f = fakeApi();
    await assert.rejects(release.preflight(plan, f.api, name => sourceFile(name, {
        'tools/ci-windows-test-package.ps1': 'param([switch]$ReleasePackage)\nif ($source -ne $env:GITHUB_SHA) { throw "mismatch" }'
    })), /source-builder-does-not-support-pinned-checkout/);
    assert(f.calls.every(call => call.method === 'GET'));
});
test('an explicitly selected successful source build supports old tags without changing their builder', async () => {
    const f = fakeApi(), reuse = {...plan, build_run: '123'};
    const result = await release.preflight(reuse, f.api, name => sourceFile(name, {
        'tools/ci-windows-test-package.ps1': 'param([switch]$ReleasePackage)'
    }));
    assert.equal(result.build_run, '123'); assert.equal(result.build_attempt, '1');
    assert.equal(result.build_artifact, `ete-test-win-x64-${source}-123-1`);
    assert(f.calls.every(call => call.method === 'GET'));
});
test('reuse rejects a failed, wrong-source, PR-triggered or expired build', async () => {
    for (const options of [{build: {conclusion: 'failure'}}, {build: {head_sha: 'b'.repeat(40)}},
        {build: {event: 'pull_request'}}, {expired: true}]) {
        const f = fakeApi(options);
        await assert.rejects(release.verifiedBuild(f.api, {...plan, build_run: '123'}), /unverified-source-build|verified-build-artifact-unavailable/);
    }
});
test('existing draft and published releases are both protected', async () => {
    for (const draft of [true, false]) {
        const f = fakeApi({existing: [{id: 50, tag_name: plan.tag, draft}]});
        await assert.rejects(release.preflight(plan, f.api, sourceFile), /release-already-exists/);
        assert(f.calls.every(call => call.method === 'GET'));
    }
});
test('Latest identity drift is refused even if the tag text stays the same', async () => {
    const f = fakeApi(); await assert.rejects(release.checkRemote(f.api, {...plan, latest_id: '39'}), /latest-changed/);
});
test('verification accepts an existing published release and checks all five digests without writes', async t => {
    const files = artifact(t), rows = files.rows();
    const existing = {id:50, tag_name:plan.tag, draft:false, prerelease:true,
        name:plan.tag + ' 测试版', body:notes.toString(),
        assets:rows.map(row => ({name:row.name,size:row.size,digest:'sha256:'+row.sha256,state:'uploaded'}))};
    const f = fakeApi({existing:[existing]});
    const value = await release.preflight({...plan,mode:'verify'}, f.api, sourceFile);
    assert.equal(value.existing_release_id, '50');
    const result = await release.verifyPackage(value, rows, f.api);
    assert.equal(result.status, 'passed'); assert.equal(result.uploadVerified, false);
    assert.equal(result.files.length, 5); assert(f.calls.every(call => call.method === 'GET'));
    await assert.rejects(release.publish(value, rows, f.api), /explicit-publish-mode-required/);
    assert(f.calls.every(call => call.method === 'GET'));
});
test('verification also accepts an unpublished target and retains explicit old-build reuse', async t => {
    const f = fakeApi(), files = artifact(t);
    const value = await release.preflight({...plan,mode:'verify',build_run:'123'}, f.api, name => sourceFile(name, {
        'tools/ci-windows-test-package.ps1':'param([switch]$ReleasePackage)'
    }));
    assert.equal(value.existing_release_id, '0'); assert.equal(value.build_run, '123');
    assert.equal((await release.verifyPackage(value, files.rows(), f.api)).status, 'passed');
    assert(f.calls.every(call => call.method === 'GET'));
});
test('verification stops on a draft, replaced release, incorrect metadata or digest', async t => {
    const files = artifact(t), rows = files.rows();
    const existing = {id:50,tag_name:plan.tag,draft:false,prerelease:true,
        name:plan.tag+' 测试版',body:notes.toString(),
        assets:rows.map(row => ({name:row.name,size:row.size,digest:'sha256:'+row.sha256,state:'uploaded'}))};
    for (const [patch,code] of [[{draft:true},/invalid-verification-release/],
        [{id:51},/verification-release-changed/], [{body:'changed'},/verification-release-metadata-mismatch/],
        [{assets:[]},/release-asset-count-mismatch/]]) {
        const f = fakeApi({existing:[{...existing,...patch}]});
        await assert.rejects(release.verifyPackage({...plan,mode:'verify',existing_release_id:'50'}, rows, f.api), code);
        assert(f.calls.every(call => call.method === 'GET'));
    }
});
test('verification preserves source and Latest guards and the API rejects every write verb', async t => {
    const rows = artifact(t).rows();
    for (const options of [{tagSource:'b'.repeat(40)}]) {
        const f = fakeApi(options);
        await assert.rejects(release.verifyPackage({...plan,mode:'verify',existing_release_id:'0'}, rows, f.api), /tag-source-changed/);
        assert(f.calls.every(call => call.method === 'GET'));
    }
    const f = fakeApi();
    await assert.rejects(release.verifyPackage({...plan,mode:'verify',existing_release_id:'0',latest_id:'39'}, rows, f.api), /latest-changed/);
    const before = f.calls.length, api = release.readOnlyApi(f.api);
    for (const verb of ['POST','PATCH','PUT','DELETE']) assert.throws(() => api(verb,'/releases'), /verification-write-forbidden/);
    assert.equal(f.calls.length, before);
});
test('five-file verification binds provenance, checksums, notes and this run; evidence is not published', t => {
    const f = artifact(t); const rows = f.rows();
    assert.equal(rows.length, 5); assert(!rows.some(row => row.name === 'test-build-summary.json'));
    assert.throws(() => release.verifyFiles(f.directory, plan, '999', '1'), /build-summary-mismatch/);
    assert.throws(() => release.verifyFiles(f.directory, plan, '123', '2'), /build-summary-mismatch/);
    const summaryPath = path.join(f.directory, 'test-build-summary.json');
    const summary = JSON.parse(fs.readFileSync(summaryPath)); summary.releasePackage = false;
    fs.writeFileSync(summaryPath, JSON.stringify(summary)); assert.throws(f.rows, /build-summary-mismatch/);
});
test('tampered installer, notes and checksum list fail before publication', t => {
    for (const name of ['EmbyTheaterEnhanced-0.4.6-win-x64-setup.exe', 'RELEASE_NOTES.md', 'SHA256SUMS.txt']) {
        const f = artifact(t); fs.appendFileSync(path.join(f.directory, name), 'changed');
        assert.throws(f.rows, /mismatch/);
    }
});
test('a provenance source mismatch fails even when its checksum is updated', t => {
    const f = artifact(t), name = 'EmbyTheaterEnhanced-0.4.6-win-x64-setup.exe.provenance.json';
    const receipt = JSON.parse(f.files[name]); receipt.sourceCommit = 'c'.repeat(40);
    fs.writeFileSync(path.join(f.directory, name), JSON.stringify(receipt)); assert.throws(f.rows, /installer-provenance-mismatch/);
});
test('symlinked attachment is refused', t => {
    const f = artifact(t), name = 'SHA256SUMS.txt', backup = path.join(f.directory, 'saved-sums');
    fs.renameSync(path.join(f.directory, name), backup);
    try { fs.symlinkSync(backup, path.join(f.directory, name)); }
    catch (error) { if (process.platform === 'win32' && error.code === 'EPERM') {t.skip('Creating a symlink requires host permission'); return;} throw error; }
    assert.throws(f.rows, /physical-artifact-file-required/);
});
test('testing release stages exactly five digests and explicitly preserves Latest', async t => {
    const files = artifact(t), f = fakeApi(); const result = await release.publish(plan, files.rows(), f.api);
    assert.equal(result.files.length, 5); assert.equal(f.assets.length, 5);
    const create = f.calls.find(call => call.method === 'POST' && call.resource === '/releases').data;
    const patch = f.calls.find(call => call.method === 'PATCH').data;
    assert.equal(create.draft, true); assert.equal(create.target_commitish, source);
    assert.equal(create.prerelease, true); assert.equal(create.make_latest, 'false');
    assert.deepEqual(patch, {draft: false, prerelease: true, make_latest: 'false'});
    assert(!f.calls.some(call => call.method === 'DELETE'));
});
test('stable channel explicitly replaces only the expected older Latest', async t => {
    const text = Buffer.from('# v0.4.6 正式版\n\nSynthetic notes.\n');
    const value = {...plan, channel: 'stable', notes_sha256: hash(text)};
    const files = artifact(t, value, text), f = fakeApi();
    await release.publish(value, files.rows(), f.api);
    assert.deepEqual(f.calls.find(call => call.method === 'PATCH').data, {draft: false, prerelease: false, make_latest: 'true'});
});
test('upload denial stops once, preserves the draft and never publishes or cleans it up', async t => {
    const files = artifact(t), f = fakeApi({failUpload: true});
    await assert.rejects(release.publish(plan, files.rows(), f.api), /github-upload-403/);
    assert.equal(f.calls.filter(call => call.resource.includes('/assets?')).length, 1);
    assert.equal(f.draft().draft, true); assert(!f.calls.some(call => ['PATCH', 'DELETE'].includes(call.method)));
});
test('server digest mismatch and concurrent Latest drift both leave the new release as draft', async t => {
    for (const options of [{badDigest: true}, {driftLatest: true}]) {
        const files = artifact(t), f = fakeApi(options);
        await assert.rejects(release.publish(plan, files.rows(), f.api), /release-asset-digest-mismatch|latest-changed/);
        assert.equal(f.draft().draft, true); assert(!f.calls.some(call => call.method === 'PATCH'));
    }
});
test('API transport uses only official hosts, forbids redirects and never retries a denied upload', async () => {
    const calls = [];
    const api = release.githubApi('synthetic-token', async (url, options) => {
        calls.push({url, options}); return {status: 403, ok: false};
    });
    await assert.rejects(api('POST', '/releases/100/assets?name=test', Buffer.from('test'), {upload: true}), /github-upload-403/);
    assert.equal(calls.length, 1); assert.equal(new URL(calls[0].url).hostname, 'uploads.github.com');
    assert.equal(calls[0].options.redirect, 'error');
});
test('workflow is manual/main-only and grants write permission only after a successful build', () => {
    const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/release.yml'), 'utf8').replace(/\r\n/g, '\n');
    assert.match(workflow, /on:\n  workflow_dispatch:/);
    assert.doesNotMatch(workflow, /^  (?:push|pull_request|pull_request_target|workflow_run|schedule):/m);
    assert.match(workflow, /github.ref == 'refs\/heads\/main'/);
    assert.match(workflow, /group: ete-verified-release\n  cancel-in-progress: false/);
    const [beforePublish, publish] = workflow.split('\n  publish:\n');
    assert.doesNotMatch(beforePublish, /contents: write|actions: write|id-token: write/);
    assert.match(publish, /needs: \[preflight, build\]/);
    assert.match(workflow, /mode:\n[\s\S]*?default: verify\n        options: \[verify, publish\]/);
    assert.match(publish, /if: inputs.mode == 'publish'/);
    const verify = beforePublish.split('\n  verify:\n')[1];
    assert.match(verify, /if: inputs.mode == 'verify'/);
    assert.match(verify, /contents: read\n      actions: read/);
    assert.match(verify, /ETE_RELEASE_MODE: verify/);
    assert.match(verify, /node tools\/actions-release.cjs verify release-artifact/);
    assert.match(publish, /ETE_RELEASE_MODE: publish/);
    assert.match(publish, /contents: write\n      actions: read/);
    assert.match(publish, /ref: \$\{\{ github.sha \}\}/);
    assert.doesNotMatch(workflow, /secrets\.|PAT|--clobber|git push|git tag|gh release/);
    assert.match(workflow, /-ReleasePackage -ExpectedSourceCommit \$env:ETE_RELEASE_SOURCE/);
    assert.match(workflow, /name: ete-release-\$\{\{ needs.preflight.outputs.source \}\}-\$\{\{ github.run_id \}\}-\$\{\{ github.run_attempt \}\}/);
    for (const match of workflow.matchAll(/uses: [^@\n]+@([^\s]+)/g)) assert.match(match[1], /^[a-f0-9]{40}$/);
});
