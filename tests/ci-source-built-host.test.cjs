'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto'), cp = require('node:child_process');
const plan = require('../tools/ci-source-built-host-plan.cjs');
const receipt = require('../tools/runner-host-receipt.cjs');
const verifier = require('../tools/host-verifier-input.cjs');
const root = path.resolve(__dirname, '..'), sha = b => crypto.createHash('sha256').update(b).digest('hex');
function temp(t) {const d = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-runner-host-'))); t.after(() => fs.rmSync(d, {recursive: true, force: true})); return d;}
test('Windows autocrlf checkout preserves all fixed Host source identity bytes', () => {
    const expected = JSON.parse(fs.readFileSync(path.join(root, 'tools/windows-host-build/EXPECTED-SOURCE-IDENTITY.json')));
    for (const f of expected.files) {
        const checkoutBytes = cp.execFileSync('git', ['-c', 'core.autocrlf=true', 'cat-file', '--filters', 'HEAD:' + f.path], {cwd: root});
        assert.equal(sha(checkoutBytes), f.sha256, 'checkout changed fixed source input: ' + f.path);
    }
});
test('runner acquisition pins exact official commit, all55 raw source members and two package identities', () => {
    const p = plan.createPlan(root);
    assert.equal(p.repository, 'https://github.com/MediaBrowser/emby-theater-windows');
    assert.equal(p.commit, '708fadc068cbf66ced6aece4a32f3e12bb2c4e13');
    assert.equal(p.sourceFiles.length, 55);
    assert.deepEqual(p.sourceFiles.find(f => f.path === 'README.md'), {path: 'README.md', gitBlob: '23872f96cd2e4a5923358490829d003b19dcecfd', size: 323, sha256: 'bbb39e190eaa36c8c2ce718bbf8d6ac6bad7c344c099a34da4dd196e63d2c54b'});
    assert.deepEqual(p.files.map(f => [f.id, f.sha256]), [
        ['newtonsoft', 'f09081d457405baf35a973fa0c50d6bf272ed683f2568c5a620a49da952f6529'],
        ['net462', 'ee692a845743500910855d4c330ca6e9ef87c16e16f740e4474d187185d66e21']]);
    assert.equal(p.sourceIdentitySha256, require('../tools/source-built-host-input.cjs').sourceIdentity(root).sha256);
});
test('published Host lock schema and build identity describe the same unified source selection', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(root, 'tools/windows-host-build/VERIFIED-RUNTIME.schema.json')));
    const expected = JSON.parse(fs.readFileSync(path.join(root, 'tools/windows-host-build/EXPECTED-SOURCE-IDENTITY.json')));
    assert.equal(schema.properties.sourceIdentitySha256.const, expected.sha256);
    assert.equal(schema.properties.sourceIdentitySha256.const, plan.createPlan(root).sourceIdentitySha256);
    assert.equal(schema.properties.framework.const, 'net462');
    assert.equal(schema.properties.platform.const, 'x86');
});
test('runner materializes a byte-bound current kit without importing any binary or acceptance envelope', t => {
    const out = path.join(temp(t), 'kit'), m = plan.materializeKit(root, out);
    for (const f of m.files) {const b = fs.readFileSync(path.join(out, f.path)); assert.equal(b.length, f.size); assert.equal(sha(b), f.sha256);}
    assert.deepEqual(m.files.map(f => f.path).sort(), [...plan.KIT_FILES, ...plan.KIT_INPUTS].sort());
    assert.ok(!m.files.some(f => /\.(exe|dll|pdb)$|runner-verification|VERIFICATION-ENVELOPE|verified-runtime\.json/.test(f.path)));
    assert.throws(() => plan.materializeKit(root, out), /must be absent/);
});
test('runner builder exactly matches the Work-validated parameter/facade/metadata delta', () => {
    const b = fs.readFileSync(path.join(root, 'tools/windows-host-build/Build-UnifiedHost.ps1'));
    assert.equal(b.length, 16941);
    assert.equal(sha(b), 'ad98235870d72c4e5ce48227fcae6b8f01d8a0500dadc3e69cd55ae2deb926ed');
    const s = b.toString('utf8'); assert.match(s, /AssemblySearchPaths='\{HintPathFromItem\};\{TargetFrameworkDirectory\}'/);
    assert.match(s, /NoStdLib='true'/); assert.doesNotMatch(s, /'\/p:AssemblySearchPaths=/);
    assert.match(s, /\$machine=\[Reflection\.ImageFileMachine\]::I386/);
});
test('reviewed portable verifier retains all32 Git-delivered inputs and every input is source-bound', () => {
    assert.deepEqual(verifier.validate(root), {files: 32, bytes: 196010});
    const inputs = require('../tools/build-input-contract.cjs').INPUT_PATHS;
    for (const p of verifier.PATHS) {
        assert.ok(inputs.includes(p), 'missing build input ' + p);
        assert.ok(receipt.GENERATOR_PATHS.includes(p), 'missing runner generator ' + p);
    }
    assert.ok(inputs.includes('tools/Test-SourceBuiltHost.ps1'));
    assert.ok(inputs.includes('tools/host-verifier-input.cjs'));
});
for (const mutation of ['changed-script', 'changed-zip', 'extra-file', 'redirect']) test('portable verifier rejects unreviewed input: ' + mutation, t => {
    const r = temp(t);
    fs.cpSync(path.join(root, 'tools/windows-host-verifier'), path.join(r, 'tools/windows-host-verifier'), {recursive: true});
    const file = path.join(r, mutation === 'changed-zip' ? verifier.BINARY_PATHS[0] : 'tools/windows-host-verifier/Verify-UnifiedHost.ps1');
    if (mutation === 'extra-file') fs.writeFileSync(path.join(r, 'tools/windows-host-verifier/unreviewed.ps1'), 'unreviewed');
    else if (mutation === 'redirect') {fs.renameSync(file, file + '.original'); fs.symlinkSync(file + '.original', file, 'file');}
    else fs.appendFileSync(file, 'changed');
    assert.throws(() => verifier.validate(r), /Host verifier/);
});
test('private configuration probe input rejects a different build scope before creating output', t => {
    const build = path.join(temp(t), 'actual-build'); fs.mkdirSync(build);
    fs.writeFileSync(path.join(build, 'build-receipt.json'), JSON.stringify({scope: 'cec-update-json-zip-unified', sourceIdentitySha256: '0'.repeat(64)}));
    assert.throws(() => plan.prepareVerificationInput(root, build), /scope mismatch/);
    assert.equal(fs.existsSync(path.join(build, 'verification-inputs')), false);
});
for (const p of ['../x', '/x', 'x\\y', 'x:y', 'x//y', 'x/./y', 'x/NUL.dll', 'x/name.', 'x/a\0b']) test('runner recovery rejects unsafe member path: ' + JSON.stringify(p), () => assert.throws(() => plan.safeRelative(p), /Unsafe/));
test('runner package recovery rejects wrong bytes and redirects before extraction', t => {
    const d = temp(t), p = path.join(d, 'package'); fs.writeFileSync(p, 'wrong package');
    assert.throws(() => plan.verifyPackage(root, p, 'newtonsoft'), /identity mismatch/);
    const link = path.join(d, 'redirect'); fs.symlinkSync(p, link, 'file');
    assert.throws(() => plan.verifyPackage(root, link, 'net462'), /redirects/);
});
function envelope(inputRoot = root) {
    const identity = require('../tools/source-built-host-input.cjs').sourceIdentity(inputRoot).sha256;
    const tools = Buffer.from('synthetic tool snapshot'), project = Buffer.from('synthetic generated project');
    const files = ['Emby.Theater.exe', 'Emby.Theater.pdb'].map(p => ({path: p, size: 123, sha256: sha(Buffer.from('synthetic compiled ' + p))}));
    const record = {schemaVersion: 1, scope: 'cec-update-json-zip-unified', containsJsonZipReplacements: true, sourceIdentitySha256: identity, framework: 'net462', platform: 'x86', modelSha256: 'db22f8ea6cb6afdfab184f80d8b85a10d8a9f148ff4cae167db87ce9cd245153', compilerVersion: '17.14.synthetic', builderSha256: sha(fs.readFileSync(path.join(inputRoot, 'tools/windows-host-build/Build-UnifiedHost.ps1'))), generatedProjectSha256: sha(project), toolchainSnapshotSha256: sha(tools), referencePackageSha256: 'ee692a845743500910855d4c330ca6e9ef87c16e16f740e4474d187185d66e21', files};
    const v = {schemaVersion: 1, scope: record.scope, result: 'passed', sourceIdentitySha256: identity, hostExeSha256: files[0].sha256, hostPdbSha256: files[1].sha256, modelSha256: record.modelSha256, loadedModelSha256: record.modelSha256, loadedModelLocation: 'synthetic-model', probePointerSize: 4, clrObjectAssembly: 'mscorlib, Version=4.0.0.0, synthetic', directUpdateCheck: 'no-update', interfaceUpdateCheck: 'no-update', reflectionUpdateCheck: 'no-update', canSelfUpdate: false, legacyTaskAbsent: true, installUpdate: 'NotSupportedException', noCecOrUpdaterLaunch: true, loadedNewtonsoftSha256: 'f0c07af0e84d4dd4da4bd7823ba4535bc0481b3bf623ed40b659b68147a6bb75', loadedNewtonsoftLocation: 'synthetic-json', compiledHostJsonDtos: 'passed-10', malformedJsonDocuments: 'JsonReaderException', nullArraySlots: 'compatible', zipStoredDeflateFixtures: 'passed', startupCases: Array.from({length: 2}, () => ({passed: true, local8154: true, xmlSave: true, exitCode: 0, pendingPreserved: true, argumentShape: 'app/data/mpv', usesCancelMask: false, usesTaskSuppression: false}))};
    const bytes = {record: Buffer.from(JSON.stringify(record)), verification: Buffer.from(JSON.stringify(v))};
    const lock = {schemaVersion: 1, mode: 'source-built-host', sourceIdentitySha256: identity, framework: 'net462', platform: 'x86', modelSha256: record.modelSha256, files, buildReceiptSha256: sha(bytes.record), verificationReceiptSha256: sha(bytes.verification), toolchainSnapshotSha256: sha(tools)};
    return {record, v, lock, tools, project, bytes};
}
test('generated lock verifies all matching synthetic receipts; no product execution is claimed', () => {
    const e = envelope(); assert.equal(receipt.verifyEnvelope(root, e.lock, e.record, e.v, e.tools, e.project, e.bytes), e.lock);
});
for (const mutation of ['different-source', 'stale-builder', 'missing-verification-hash', 'framework-corelib', 'wrong-model', 'masked-startup', 'bad-json', 'old-updater', 'different-pdb']) test('runner rejects acceptance drift: ' + mutation, () => {
    const e = envelope();
    if (mutation === 'different-source') e.lock.sourceIdentitySha256 = '0'.repeat(64);
    if (mutation === 'stale-builder') e.record.builderSha256 = '0'.repeat(64);
    if (mutation === 'missing-verification-hash') delete e.lock.verificationReceiptSha256;
    if (mutation === 'framework-corelib') e.v.clrObjectAssembly = 'System.Private.CoreLib, Version=7.0.0.0';
    if (mutation === 'wrong-model') e.v.loadedModelSha256 = '0'.repeat(64);
    if (mutation === 'masked-startup') e.v.startupCases[1].usesCancelMask = true;
    if (mutation === 'bad-json') e.v.malformedJsonDocuments = 'default-object';
    if (mutation === 'old-updater') e.v.canSelfUpdate = true;
    if (mutation === 'different-pdb') e.v.hostPdbSha256 = '0'.repeat(64);
    assert.throws(() => receipt.verifyEnvelope(root, e.lock, e.record, e.v, e.tools, e.project, e.bytes), /Runner Host/);
});
test('manual package route requires runner compiler/probe before assembly and never passes execution-policy bypass', () => {
    const script = fs.readFileSync(path.join(root, 'tools/ci-windows-test-package.ps1'), 'utf8');
    assert.ok(script.indexOf("'ci-source-built-host.ps1'") > script.indexOf("'prepare-ci-build-inputs.ps1'"));
    assert.ok(script.indexOf("'ci-source-built-host.ps1'") < script.indexOf("'build.ps1'"));
    const runner = fs.readFileSync(path.join(root, 'tools/ci-source-built-host.ps1'), 'utf8');
    assert.match(runner, /Test-SourceBuiltHost\.ps1/); assert.match(runner, /runner-verification\.json/);
    assert.doesNotMatch(runner, /ExecutionPolicy|download-artifact|libfile_|Invoke-Expression/);
    assert.ok(runner.indexOf('if (-not (Test-Path -LiteralPath $probe))') < runner.indexOf("-File (Join-Path $kit 'Build-UnifiedHost.ps1')"));
    assert.match(runner, /& \$windowsPowerShell .*?-File \(Join-Path \$kit 'Build-UnifiedHost.ps1'\)/);
    assert.match(runner, /& \$verifierPowerShell .*?-File \$probe/);
    assert.match(runner, /Get-Command pwsh\.exe -ErrorAction Stop/);
    assert.ok(runner.indexOf('verification-input $root $buildRoot') < runner.indexOf('-File $probe'));
    const wrapper = fs.readFileSync(path.join(root, 'tools/Test-SourceBuiltHost.ps1'), 'utf8');
    assert.match(wrapper, /host-verifier-input\.cjs/);
    assert.match(wrapper, /windows-host-verifier\/Verify-UnifiedHost\.ps1/);
    assert.match(wrapper, /\$receipt\.result -cne 'passed'/);
    assert.doesNotMatch(wrapper, /ExecutionPolicy|Invoke-Expression|download-artifact/);
});
function stagedRunner(t, install = true) {
    const dir = temp(t), r = path.join(dir, 'repo'), build = path.join(dir, 'build'); fs.mkdirSync(r); fs.mkdirSync(build);
    const write = (base, p, b) => {fs.mkdirSync(path.dirname(path.join(base, p)), {recursive: true}); fs.writeFileSync(path.join(base, p), b);};
    for (const p of ['native/windows-host', 'tools/windows-host-build', 'tools/windows-host-verifier']) fs.cpSync(path.join(root, p), path.join(r, p), {
        recursive: true,
        filter: source => path.relative(root, source).replaceAll(path.sep, '/') !== 'native/windows-host/verified-runtime.json'
    });
    write(r, 'tools/host-verifier-input.cjs', fs.readFileSync(path.join(root, 'tools/host-verifier-input.cjs')));
    for (const p of ['vendor/windows-host-manifest.json', 'vendor/model-compatibility-manifest.json', 'vendor/host-json-manifest.json']) write(r, p, fs.readFileSync(path.join(root, p)));
    write(r, 'tools/Test-SourceBuiltHost.ps1', '# synthetic probe bytes for receipt/staging tests; never executed\n');
    const jsonBytes = Buffer.from('synthetic JSON dependency'), m = JSON.parse(fs.readFileSync(path.join(r, 'vendor/host-json-manifest.json')));
    m.file.size = jsonBytes.length; m.file.sha256 = sha(jsonBytes); write(r, 'vendor/host-json-manifest.json', JSON.stringify(m));
    const e = envelope(r), outputBytes = ['Emby.Theater.exe', 'Emby.Theater.pdb'].map(p => Buffer.from('synthetic compiled ' + p));
    e.lock.files.forEach((f, i) => f.size = outputBytes[i].length); // record shares the exact files array.
    e.bytes.record = Buffer.from(JSON.stringify(e.record)); e.lock.buildReceiptSha256 = sha(e.bytes.record);
    for (const [i, f] of e.lock.files.entries()) write(build, 'bin/' + f.path, outputBytes[i]);
    for (const [p, b] of [['verified-runtime.json', JSON.stringify(e.lock)], ['build-receipt.json', e.bytes.record], ['runner-verification.json', e.bytes.verification], ['toolchain-snapshot.json', e.tools], ['build/Host.Unified.csproj', e.project], ['references/Newtonsoft.Json.dll', jsonBytes]]) write(build, p, b);
    write(r, '.gitignore', '.work/\nvendor/source-built-host/\nvendor/host-json/\n');
    const git = args => cp.execFileSync('git', ['-C', r, ...args], {stdio: 'pipe'});
    git(['init', '-q']); git(['config', 'user.name', 'Runner fixture']); git(['config', 'user.email', 'runner@example.invalid']); git(['config', 'core.autocrlf', 'false']); git(['add', '.']); git(['commit', '-qm', 'synthetic receipt fixture']);
    fs.mkdirSync(path.join(r, '.work')); if (install) receipt.install(r, build); return {root: r, build, git};
}
function runnerCli(f) {
    return cp.spawnSync(process.execPath, ['--trace-warnings', path.join(root, 'tools/ci-source-built-host-plan.cjs'), 'install-runner', f.root, f.build], {encoding: 'utf8'});
}
test('runner CLI stages matching synthetic receipts in a fresh process without circular initialization warnings', t => {
    const f = stagedRunner(t, false), result = runnerCli(f);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.equal(JSON.parse(result.stdout).lockPath, receipt.LOCK_PATH);
    const p = require('../tools/source-built-host-input.cjs').validatePrepared(f.root);
    assert.equal(p.runnerProvenance.sourceCommit, f.git(['rev-parse', 'HEAD']).toString().trim());
});
test('runner CLI rejects mismatched receipt bytes before creating outputs', t => {
    const f = stagedRunner(t, false);
    fs.appendFileSync(path.join(f.build, 'runner-verification.json'), ' ');
    const result = runnerCli(f);
    assert.equal(result.status, 1); assert.match(result.stderr, /Runner Host lock\/receipts mismatch/);
    assert.doesNotMatch(result.stderr, /circular dependency|physical is not a function/);
    assert.equal(fs.existsSync(path.join(f.root, receipt.RECEIPTS)), false);
});
test('runner CLI rejects redirected receipt paths before creating outputs', t => {
    const f = stagedRunner(t, false), file = path.join(f.build, 'toolchain-snapshot.json');
    fs.renameSync(file, file + '.original'); fs.symlinkSync(file + '.original', file, 'file');
    const result = runnerCli(f);
    assert.equal(result.status, 1); assert.match(result.stderr, /Host recovery redirects forbidden/);
    assert.doesNotMatch(result.stderr, /circular dependency|physical is not a function/);
    assert.equal(fs.existsSync(path.join(f.root, receipt.RECEIPTS)), false);
});
test('runner CLI preserves an existing output directory and its evidence', t => {
    const f = stagedRunner(t, false), output = path.join(f.root, receipt.RECEIPTS);
    fs.mkdirSync(output); fs.writeFileSync(path.join(output, 'existing-evidence.txt'), 'preserve');
    const result = runnerCli(f);
    assert.equal(result.status, 1); assert.match(result.stderr, /Runner Host output already exists; preserve evidence/);
    assert.doesNotMatch(result.stderr, /circular dependency|physical is not a function/);
    assert.deepEqual(fs.readdirSync(output), ['existing-evidence.txt']);
    assert.equal(fs.readFileSync(path.join(output, 'existing-evidence.txt'), 'utf8'), 'preserve');
});
test('generated runner receipt stages exact outputs and contributes runtime provenance without a committed lock', t => {
    const f = stagedRunner(t), c = require('../tools/source-built-host-input.cjs');
    assert.equal(fs.existsSync(path.join(f.root, c.LOCK_PATH)), false);
    const p = c.validatePrepared(f.root); assert.equal(p.runnerProvenance.sourceCommit, f.git(['rev-parse', 'HEAD']).toString().trim());
    const runtime = path.join(temp(t), 'runtime'); fs.mkdirSync(runtime);
    for (const file of c.OUTPUTS) fs.copyFileSync(path.join(f.root, c.INPUT_ROOT, file), path.join(runtime, file));
    fs.copyFileSync(path.join(f.root, 'vendor/host-json/snapshot-v1/Newtonsoft.Json.dll'), path.join(runtime, 'Newtonsoft.Json.dll'));
    const result = c.validateRuntime(f.root, runtime); assert.equal(result.manifestPath, receipt.LOCK_PATH); assert.equal(result.verificationReceiptSha256.length, 64); assert.equal(result.runnerProvenance.sha256.length, 64);
    assert.throws(() => receipt.install(f.root, f.build), /already exists/);
});
for (const mutation of ['receipt-bytes', 'probe-bytes', 'checkout', 'ambiguous-lock', 'run-identity']) test('staged runner rejects changed receipt ownership: ' + mutation, t => {
    const f = stagedRunner(t), c = require('../tools/source-built-host-input.cjs');
    if (mutation === 'receipt-bytes') fs.appendFileSync(path.join(f.root, receipt.RECEIPTS, 'runner-verification.json'), ' ');
    if (mutation === 'probe-bytes') fs.appendFileSync(path.join(f.root, 'tools/Test-SourceBuiltHost.ps1'), 'changed');
    if (mutation === 'checkout') f.git(['commit', '--allow-empty', '-qm', 'different source commit']);
    if (mutation === 'ambiguous-lock') fs.copyFileSync(path.join(f.root, receipt.LOCK_PATH), path.join(f.root, c.LOCK_PATH));
    const old = {actions: process.env.GITHUB_ACTIONS, id: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT};
    if (mutation === 'run-identity') {process.env.GITHUB_ACTIONS = 'true'; process.env.GITHUB_RUN_ID = 'different-run'; process.env.GITHUB_RUN_ATTEMPT = '99';}
    try {assert.throws(() => c.validatePrepared(f.root), /Runner Host|Ambiguous/);} finally {for (const [key, value] of [['GITHUB_ACTIONS', old.actions], ['GITHUB_RUN_ID', old.id], ['GITHUB_RUN_ATTEMPT', old.attempt]]) {if (value === undefined) delete process.env[key]; else process.env[key] = value;}}
});
