'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pwsh = process.platform === 'win32' ? 'pwsh.exe' : 'pwsh';
function copyFixture(mode) {
    const result = cp.spawnSync(pwsh, ['-NoProfile', '-File', 'tests/helpers/fn-runner-cache.ps1', '-Mode', mode],
        {cwd: root, encoding: 'utf8', timeout: 15000});
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout.trim());
}
test('cache copy validates and copies locked synthetic bytes without altering the input', () => {
    const value = copyFixture('hit');
    assert.equal(value.success, true); assert.equal(value.networkCalls, 0);
    assert.equal(value.sourceUnchanged, true); assert.equal(value.targetBytes, 3);
});
for (const mode of ['missing-root', 'missing-file', 'wrong-name', 'runtime-tree', 'empty', 'url', 'relative', 'unc',
    'size', 'hash', 'occupied', 'destination-exists', 'network-drive', 'linked-root', 'linked-parent', 'linked-file', 'changed']) {
    test('cache failure is closed without network or input changes: ' + mode, () => {
        const value = copyFixture(mode);
        assert.equal(value.success, false); assert.equal(value.networkCalls, 0);
        assert.equal(value.sourceUnchanged, true); assert.equal(value.neighborPreserved, true);
        if (mode === 'network-drive') assert.equal(value.directoryReads, 0, 'mapped network drive is rejected before probing its path');
        if (mode === 'linked-parent') assert.equal(value.unsafeChildReads, 0, 'linked parent is rejected before querying its child');
        if (mode === 'changed') assert.equal(value.targetBytes, 3, 'metadata changed after a completed copy still rejects');
    });
}
for (const mode of ['missing', 'empty', 'entry-missing', 'entry-empty', 'post-copy-changed']) test('real worker cache branch cannot fall back or skip final verification: ' + mode, t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-fn-cache-worker-'));
    t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
    const source = path.join(dir, 'source'), temporary = path.join(dir, 'temporary');
    fs.mkdirSync(source); fs.mkdirSync(temporary);
    for (const file of ['prototypes/fn-connect/client/electron-input.json', 'tools/electron-runtime-input.cjs', 'vendor/electron-runtime-manifest.json']) {
        fs.mkdirSync(path.dirname(path.join(source, file)), {recursive: true});
        fs.copyFileSync(path.join(root, file), path.join(source, file));
    }
    for (const args of [['init'], ['add', '.'], ['-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '-m', 'fixture']]) {
        const result = cp.spawnSync('git', args, {cwd: source, encoding: 'utf8'}); assert.equal(result.status, 0, result.stderr);
    }
    const script = path.join(dir, 'test.ps1');
    const marker = path.join(dir, 'network-attempt.txt');
    fs.writeFileSync(script, `param($Worker,$Source,$Temporary,$Progress,$Mode,$Marker)
. $Worker
$env:GITHUB_SHA=''
$script:networkCalls=0;$script:extracts=0
function Invoke-WebRequest {$script:networkCalls++;[IO.File]::WriteAllText($Marker,'synthetic');throw 'UNEXPECTED_NETWORK'}
function Expand-Archive {$script:extracts++;throw 'UNEXPECTED_EXTRACT'}
if($Mode -eq 'post-copy-changed') {
    function Copy-FnLockedArchive {param($ArchiveRoot,$Destination,$ExpectedSize,$ExpectedSha256) [IO.File]::WriteAllBytes($Destination,[byte[]](1,2,3))}
}
$cache=if($Mode -in @('empty','entry-empty')){''}else{Join-Path $Temporary 'missing'}
if($Mode -in @('entry-missing','entry-empty')){& $Worker -SourceRoot $Source -TemporaryRoot $Temporary -ProgressPath $Progress -RunId ('a'*32) -ArchiveRoot $cache;exit $LASTEXITCODE}
$code=Invoke-FnPrepareWorker $Source $Temporary $Progress ('a'*32) -UseCache $true -ArchiveRoot $cache
[ordered]@{code=$code;networkCalls=$script:networkCalls;extracts=$script:extracts;progress=(Get-Content $Progress -Raw|ConvertFrom-Json)}|ConvertTo-Json -Depth 6 -Compress
`);
    const result = cp.spawnSync(pwsh, ['-NoProfile', '-File', script, '-Worker', path.join(root, 'prototypes/fn-connect/client/prepare-runner-worker.ps1'),
        '-Source', source, '-Temporary', temporary, '-Progress', path.join(dir, 'progress.json'), '-Mode', mode, '-Marker', marker], {encoding: 'utf8', timeout: 15000});
    assert.equal(fs.existsSync(marker), false);
    if (mode.startsWith('entry-')) {
        assert.equal(result.status, 1); const progress = JSON.parse(fs.readFileSync(path.join(dir, 'progress.json')));
        assert.equal(progress.stage, 'FAILED'); assert.equal(progress.phase, 'CACHE_COPY'); return;
    }
    assert.equal(result.status, 0, result.stderr); const value = JSON.parse(result.stdout.trim());
    assert.equal(value.code, 1); assert.equal(value.networkCalls, 0); assert.equal(value.extracts, 0);
    assert.equal(value.progress.stage, 'FAILED'); assert.equal(value.progress.archiveVerified, false);
    assert.equal(value.progress.phase, mode === 'post-copy-changed' ? 'ARCHIVE_VERIFY' : 'CACHE_COPY');
});
