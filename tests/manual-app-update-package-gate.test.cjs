'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {materializeTrackedProductSources} = require('../tools/copy-tracked-product-sources.cjs');

// Execute the actual package-script statements, not a JavaScript copy of their
// conditions. This is a source projection with a synthetic manifest, not a built
// Windows runtime. The Windows-only builder/bootstrap/install steps never run.
const command = String.raw`
    $ErrorActionPreference='Stop'; Set-StrictMode -Version Latest
    $tokens=$null; $errors=$null
    $ast=[Management.Automation.Language.Parser]::ParseFile($env:ETE_UPDATE_BUILDER,[ref]$tokens,[ref]$errors)
    if($errors.Count){throw 'Package script parse error'}
    $statements=@($ast.EndBlock.Statements)
    $starts=@($statements | Where-Object { $_.Extent.Text.StartsWith('$updateSelftestText = & node ') })
    $ends=@($statements | Where-Object { $_ -is [Management.Automation.Language.IfStatementAst] -and $_.Extent.Text.StartsWith('if ($updateSelftest.status ') })
    $writers=@($statements | Where-Object { $_.Extent.Text.StartsWith('[IO.File]::WriteAllText(') -and $_.Extent.Text.Contains("'manual-app-update-selftest.json'") })
    if($starts.Count -ne 1 -or $ends.Count -ne 1 -or $writers.Count -ne 1){throw 'One production selftest gate and receipt writer required'}
    $runtime=$env:ETE_UPDATE_RUNTIME; $source=$env:ETE_UPDATE_SOURCE; $output=$env:ETE_UPDATE_OUTPUT
    $span=@($statements | Where-Object { $_.Extent.StartOffset -ge $starts[0].Extent.StartOffset -and $_.Extent.EndOffset -le $ends[0].Extent.EndOffset })
    if($span.Count -ne 4){throw 'Production selftest gate structure changed'}
    foreach($statement in $span){ . ([scriptblock]::Create($statement.Extent.Text)) }
    . ([scriptblock]::Create($writers[0].Extent.Text))
`;

for (const mutation of ['none', 'source', 'module', 'manifest']) {
    test('production package gate and receipt on an offline source projection: ' + mutation, t => {
        const root = path.resolve(__dirname, '..');
        const resolved = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], {encoding: 'utf8'});
        assert.equal(resolved.status, 0, resolved.stderr);
        const source = resolved.stdout.trim();
        const scratch = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-update-package-gate-')));
        t.after(() => fs.rmSync(scratch, {recursive: true, force: true}));
        const runtime = path.join(scratch, 'projection'), output = path.join(scratch, 'evidence');
        fs.mkdirSync(output);
        const projection = materializeTrackedProductSources(root, source, runtime);
        const manifest = path.join(runtime, 'build-manifest.json');
        fs.writeFileSync(manifest, JSON.stringify({sourceCommit: source, files: projection.entries.map(entry => ({
            path: entry.runtimePath, sha256: entry.sourceSha256.toLowerCase()
        }))}));
        if (mutation === 'module') fs.appendFileSync(path.join(runtime, 'electronapp/enhanced/manual-app-update.js'), '\n// synthetic drift\n');
        if (mutation === 'manifest') fs.unlinkSync(manifest);
        const result = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', command], {
            encoding: 'utf8', timeout: 30000,
            env: {...process.env, ETE_UPDATE_BUILDER: path.join(root, 'tools/ci-windows-test-package.ps1'),
                ETE_UPDATE_RUNTIME: runtime, ETE_UPDATE_OUTPUT: output, ETE_UPDATE_SOURCE: mutation === 'source' ? '0'.repeat(40) : source}
        });
        if (mutation !== 'none') {
            assert.notEqual(result.status, 0, result.error?.message);
            assert.match(result.stderr, /Packaged manual update (?:offline selftest failed|selftest evidence does not match)/);
            assert.deepEqual(fs.readdirSync(output), []);
            return;
        }
        assert.equal(result.status, 0, result.error?.message || result.stderr);
        const receipt = JSON.parse(fs.readFileSync(path.join(output, 'manual-app-update-selftest.json'), 'utf8'));
        assert.equal(receipt.status, 'passed');
        assert.deepEqual(receipt.packageManifestBinding, {status: 'matched', sourceCommit: source});
        assert.equal(receipt.checks.length, 9);
        assert.equal(receipt.platform, process.platform);
        assert.equal(receipt.realNetworkRequests, 0);
        assert.equal(receipt.appBootstrap, false);
        assert.equal(receipt.profileAccess, false);
        assert.equal(receipt.installerExecuted, false);
        assert.equal(receipt.temporaryFilesRemoved, true);
        assert.deepEqual(fs.readdirSync(output), ['manual-app-update-selftest.json']);
    });
}
