'use strict';
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const {physical} = require('./ci-source-built-host-plan.cjs');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const RECEIPTS = '.work/source-built-host';
const LOCK_PATH = RECEIPTS + '/verified-runtime.json';
const OUTPUTS = ['Emby.Theater.exe', 'Emby.Theater.pdb'];
const BUILD_TOOLS = ['Build-UnifiedHost.ps1', 'Get-SourceIdentity.ps1', 'New-VerifiedRuntime.ps1'];
const read = p => {physical(p); if (!fs.lstatSync(p).isFile()) throw Error('Runner Host ordinary receipt required.'); return fs.readFileSync(p);};
const json = p => JSON.parse(read(p));
function verifyEnvelope(root, lock, record, v, toolBytes, projectBytes, receiptBytes) {
    const identity = require('./source-built-host-input.cjs').sourceIdentity(root).sha256;
    const model = 'db22f8ea6cb6afdfab184f80d8b85a10d8a9f148ff4cae167db87ce9cd245153';
    if (lock.schemaVersion !== 1 || lock.mode !== 'source-built-host' || lock.sourceIdentitySha256 !== identity || lock.framework !== 'net462' || lock.platform !== 'x86' || lock.modelSha256 !== model ||
        lock.buildReceiptSha256 !== sha(receiptBytes.record) || lock.verificationReceiptSha256 !== sha(receiptBytes.verification) || lock.toolchainSnapshotSha256 !== sha(toolBytes)) throw Error('Runner Host lock/receipts mismatch.');
    if (record.schemaVersion !== 1 || record.scope !== 'cec-update-json-zip-unified' || record.containsJsonZipReplacements !== true || record.sourceIdentitySha256 !== identity || record.framework !== 'net462' || record.platform !== 'x86' || record.modelSha256 !== model ||
        !/^17\./.test(record.compilerVersion || '') || record.builderSha256 !== sha(read(path.join(root, 'tools/windows-host-build/Build-UnifiedHost.ps1'))) || record.generatedProjectSha256 !== sha(projectBytes) || record.toolchainSnapshotSha256 !== sha(toolBytes) || record.referencePackageSha256 !== 'ee692a845743500910855d4c330ca6e9ef87c16e16f740e4474d187185d66e21') throw Error('Runner Host build identity mismatch.');
    if (!Array.isArray(lock.files) || lock.files.length !== 2 || JSON.stringify(lock.files) !== JSON.stringify(record.files)) throw Error('Runner Host outputs mismatch.');
    for (const [i, f] of lock.files.entries()) if (f.path !== OUTPUTS[i] || !Number.isSafeInteger(f.size) || f.size <= 0 || !/^[a-f0-9]{64}$/.test(f.sha256)) throw Error('Runner Host output contract mismatch.');
    if (v.schemaVersion !== 1 || v.scope !== record.scope || v.result !== 'passed' || v.sourceIdentitySha256 !== identity || v.hostExeSha256 !== lock.files[0].sha256 || v.hostPdbSha256 !== lock.files[1].sha256 || v.modelSha256 !== model || v.loadedModelSha256 !== model || !v.loadedModelLocation || v.probePointerSize !== 4 || !/^mscorlib, Version=4\.0\.0\.0,/.test(v.clrObjectAssembly || '')) throw Error('Runner Host actual Framework probe mismatch.');
    for (const k of ['directUpdateCheck', 'interfaceUpdateCheck', 'reflectionUpdateCheck']) if (v[k] !== 'no-update') throw Error('Runner Host no-update contract failed.');
    if (v.canSelfUpdate !== false || v.legacyTaskAbsent !== true || v.installUpdate !== 'NotSupportedException' || v.noCecOrUpdaterLaunch !== true || v.loadedNewtonsoftSha256 !== 'f0c07af0e84d4dd4da4bd7823ba4535bc0481b3bf623ed40b659b68147a6bb75' || !v.loadedNewtonsoftLocation || v.compiledHostJsonDtos !== 'passed-10' || v.malformedJsonDocuments !== 'JsonReaderException' || v.nullArraySlots !== 'compatible' || v.zipStoredDeflateFixtures !== 'passed') throw Error('Runner Host retired/JSON/ZIP contract failed.');
    if (!Array.isArray(v.startupCases) || v.startupCases.length !== 2) throw Error('Runner Host two startup cases required.');
    for (const c of v.startupCases) if (c.passed !== true || c.local8154 !== true || c.xmlSave !== true || c.exitCode !== 0 || c.pendingPreserved !== true || c.argumentShape !== 'app/data/mpv' || c.usesCancelMask !== false || c.usesTaskSuppression !== false) throw Error('Runner Host startup contract failed.');
    const official = require('./windows-host-input.cjs').load(root);
    if (lock.files.some(f => official.files.some(o => o.path === f.path && o.sha256 === f.sha256))) throw Error('Runner Host cannot reuse original Host or PDB.');
    return lock;
}
function head(root) {return cp.execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();}
function load(root) {
    const base = path.join(root, RECEIPTS), provenance = json(path.join(base, 'runner-provenance.json'));
    if (provenance.schemaVersion !== 1 || provenance.sourceCommit !== head(root) || provenance.mode !== 'compiled-and-verified-on-this-runner') throw Error('Runner Host checkout ownership mismatch.');
    if (process.env.GITHUB_ACTIONS === 'true' && (provenance.runId !== process.env.GITHUB_RUN_ID || provenance.runAttempt !== process.env.GITHUB_RUN_ATTEMPT)) throw Error('Runner Host run ownership mismatch.');
    const expected = ['verified-runtime.json', 'build-receipt.json', 'runner-verification.json', 'toolchain-snapshot.json', 'generated-host.csproj'];
    if (!Array.isArray(provenance.files) || provenance.files.length !== expected.length) throw Error('Runner Host provenance file set mismatch.');
    for (const [i, p] of expected.entries()) {
        const f = provenance.files[i], b = read(path.join(base, p));
        if (f.path !== p || f.size !== b.length || f.sha256 !== sha(b)) throw Error('Runner Host provenance identity mismatch.');
    }
    for (const name of BUILD_TOOLS.concat('Test-SourceBuiltHost.ps1')) {
        const p = name === 'Test-SourceBuiltHost.ps1' ? 'tools/' + name : 'tools/windows-host-build/' + name;
        if (provenance.generators[p] !== sha(read(path.join(root, p)))) throw Error('Runner Host generator changed.');
    }
    const record = read(path.join(base, 'build-receipt.json')), verification = read(path.join(base, 'runner-verification.json'));
    const lock = verifyEnvelope(root, json(path.join(base, 'verified-runtime.json')), JSON.parse(record), JSON.parse(verification), read(path.join(base, 'toolchain-snapshot.json')), read(path.join(base, 'generated-host.csproj')), {record, verification});
    return {...lock,runnerProvenance:{path:RECEIPTS+'/runner-provenance.json',sha256:sha(read(path.join(base,'runner-provenance.json'))),sourceCommit:provenance.sourceCommit,runId:provenance.runId,runAttempt:provenance.runAttempt}};
}
function install(root, buildRoot) {
    // Only called by the runner orchestrator after its own compiler and probe exit successfully.
    const sourceFiles = ['verified-runtime.json', 'build-receipt.json', 'runner-verification.json', 'toolchain-snapshot.json', 'build/Host.Unified.csproj'];
    const buffers = sourceFiles.map(p => read(path.join(buildRoot, p)));
    const lock = verifyEnvelope(root, JSON.parse(buffers[0]), JSON.parse(buffers[1]), JSON.parse(buffers[2]), buffers[3], buffers[4], {record: buffers[1], verification: buffers[2]});
    const outputs = lock.files.map(f => {const b = read(path.join(buildRoot, 'bin', f.path)); if (b.length !== f.size || sha(b) !== f.sha256) throw Error('Runner Host compiled bytes mismatch.'); return b;});
    const jsonManifest = require('./host-json-input.cjs').load(root), jsonBytes = read(path.join(buildRoot, 'references/Newtonsoft.Json.dll'));
    if (jsonBytes.length !== jsonManifest.file.size || sha(jsonBytes) !== jsonManifest.file.sha256) throw Error('Runner Host JSON reference changed.');
    const targets = [RECEIPTS, 'vendor/source-built-host', 'vendor/host-json'];
    for (const rel of targets) {physical(path.dirname(path.join(root, rel))); if (fs.existsSync(path.join(root, rel))) throw Error('Runner Host output already exists; preserve evidence.');}
    const provenance = {schemaVersion: 1, sourceCommit: head(root), mode: 'compiled-and-verified-on-this-runner', runId: process.env.GITHUB_RUN_ID || null, runAttempt: process.env.GITHUB_RUN_ATTEMPT || null, generators: {}, files: []};
    for (const name of BUILD_TOOLS.concat('Test-SourceBuiltHost.ps1')) {const p = name === 'Test-SourceBuiltHost.ps1' ? 'tools/' + name : 'tools/windows-host-build/' + name; provenance.generators[p] = sha(read(path.join(root, p)));}
    fs.mkdirSync(path.join(root, RECEIPTS));
    const names = ['verified-runtime.json', 'build-receipt.json', 'runner-verification.json', 'toolchain-snapshot.json', 'generated-host.csproj'];
    for (const [i, p] of names.entries()) {fs.writeFileSync(path.join(root, RECEIPTS, p), buffers[i], {flag: 'wx'}); provenance.files.push({path: p, size: buffers[i].length, sha256: sha(buffers[i])});}
    fs.writeFileSync(path.join(root, RECEIPTS, 'runner-provenance.json'), JSON.stringify(provenance, null, 2) + '\n', {flag: 'wx'});
    for (const rel of ['vendor/source-built-host/snapshot-v1', jsonManifest.inputRoot]) fs.mkdirSync(path.join(root, rel), {recursive: true});
    for (const [i, p] of OUTPUTS.entries()) fs.writeFileSync(path.join(root, 'vendor/source-built-host/snapshot-v1', p), outputs[i], {flag: 'wx'});
    fs.writeFileSync(path.join(root, jsonManifest.inputRoot, jsonManifest.file.path), jsonBytes, {flag: 'wx'});
    load(root); return {lockPath: LOCK_PATH, sourceIdentitySha256: lock.sourceIdentitySha256};
}
module.exports = {LOCK_PATH, RECEIPTS, verifyEnvelope, load, install};
