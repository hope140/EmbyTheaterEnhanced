'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync, spawnSync} = require('node:child_process');
const PIN = Object.freeze({repository: 'hope140/EmbyTheaterEnhanced', toolsCommit: 'c9cd9bacf81445c9c10befd121951b1c63c86faa',
    sourceCommit: '162dc69f9c3438d99508c90321a889b693b6b10a', runId: 40067805498, artifactId: 12551020498,
    zipSize: 164367963, zipSha256: 'b35d89c4d7070bc4e56223802b0db666befbc4623a43f18b8fee5a4ec67083cc',
    installerSha256: '17df456db78dc726c27e0e882c568dbc875839cbf5f68e967b452bd62e880e6b'});
const OWNER = 'ETE isolated Actions range smoke v1\n';
function pathsFor(root) {return {artifact: path.join(root, 'candidate.zip'), unpackerZip: path.join(root, 'innounp.zip'), artifactTree: path.join(root, 'artifact'), unpackerTree: path.join(root, 'unpacker'), extracted: path.join(root, 'extracted'), smoke: path.join(root, 'smoke')};}
const tokenNames = /^(?:GITHUB_TOKEN|GH_TOKEN|GH_ENTERPRISE_TOKEN|ACTIONS_RUNTIME_TOKEN|ACTIONS_ID_TOKEN_REQUEST_TOKEN)$/i;
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function fail(code) {throw Error(code);}
function json(file) {return JSON.parse(fs.readFileSync(file, 'utf8'));}
function writeNew(file, value) {fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', {flag: 'wx', mode: 0o600});}
function git(root, args) {return execFileSync('git', args, {cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1048576}).trim();}
function cleanEnvironment(input = process.env) {return Object.fromEntries(Object.entries(input).filter(([name]) => !tokenNames.test(name)));}
function toolsAt(root) {
    if (git(root, ['rev-parse', 'HEAD']) !== PIN.toolsCommit || git(root, ['status', '--porcelain', '--untracked-files=no'])) fail('tools-checkout-drift');
    git(root, ['cat-file', '-e', PIN.sourceCommit + '^{commit}']);
    const smoke = require(path.join(root, 'tools/playback-range-windows-smoke.cjs'));
    if (smoke.CANDIDATE.commit !== PIN.sourceCommit || smoke.CANDIDATE.zipSha256 !== PIN.zipSha256 || smoke.CANDIDATE.zipSize !== PIN.zipSize || smoke.CANDIDATE.installerSha256 !== PIN.installerSha256) fail('candidate-lock-disagreement');
    return smoke;
}
function validateDispatch(mode, workflowCommit, repository, releasePackage, ref) {
    const branch = ['buffer-export', 'buffer-export-av', 'buffer-export-edl', 'buffer-export-seam'].includes(mode) ? 'refs/heads/experiment/playback-buffer-retention' : 'refs/heads/feature/playback-range-cache';
    if (ref !== branch) fail('invalid-range-branch');
    if (!['entry', 'native', 'loader-trial', 'disk-probe', 'buffer-export', 'buffer-export-av', 'buffer-export-edl', 'buffer-export-seam'].includes(mode) || releasePackage !== 'false' || repository !== PIN.repository || !/^[a-f0-9]{40}$/.test(workflowCommit || '')) fail('invalid-range-dispatch');
}
function createPlan(toolsRoot, root, mode, workflowCommit, repository, releasePackage) {
    validateDispatch(mode, workflowCommit, repository, releasePackage, process.env.GITHUB_REF);
    toolsRoot = fs.realpathSync(toolsRoot); toolsAt(toolsRoot);
    if (git(path.resolve(__dirname, '..'), ['rev-parse', 'HEAD']) !== workflowCommit) fail('workflow-checkout-drift');
    if (!path.isAbsolute(root) || fs.existsSync(root)) fail('fresh-absolute-work-root-required');
    const acquisition = require(path.join(toolsRoot, 'tools/ci-build-input-plan.cjs')).createPlan(toolsRoot), lock = json(path.join(toolsRoot, 'tools/build-toolchains.lock.json'));
    const entries = acquisition.files.filter(entry => entry.id === 'innounp');
    if (entries.length !== 1 || entries[0].sha256 !== lock.inno.unpackerArchive.sha256 || entries[0].size !== lock.inno.unpackerArchive.size) fail('unpacker-input-lock');
    fs.mkdirSync(root); root = fs.realpathSync(root); fs.writeFileSync(path.join(root, 'owner'), OWNER, {flag: 'wx'});
    const plan = {schema: 1, pin: PIN, root, toolsRoot, mode, workflowCommit, innounp: entries[0],
        unpacker: {sha256: lock.inno.unpackerSha256, tree: lock.inno.unpackerTree},
        paths: pathsFor(root)};
    writeNew(path.join(root, 'control-plan.json'), plan); return plan;
}
function readPlan(file) {
    if (fs.realpathSync(file) !== path.resolve(file)) fail('redirected-control-plan');
    const plan = json(file);
    if (plan.schema !== 1 || JSON.stringify(plan.pin) !== JSON.stringify(PIN) || !['entry', 'native', 'loader-trial', 'disk-probe', 'buffer-export', 'buffer-export-av', 'buffer-export-edl', 'buffer-export-seam'].includes(plan.mode) ||
        fs.realpathSync(plan.root) !== plan.root || path.resolve(file) !== path.join(plan.root, 'control-plan.json') || fs.readFileSync(path.join(plan.root, 'owner'), 'utf8') !== OWNER) fail('invalid-control-plan');
    toolsAt(plan.toolsRoot);
    if (JSON.stringify(plan.paths) !== JSON.stringify(pathsFor(plan.root))) fail('invalid-control-path');
    if (git(path.resolve(__dirname, '..'), ['rev-parse', 'HEAD']) !== plan.workflowCommit) fail('workflow-checkout-drift');
    const acquisition = require(path.join(plan.toolsRoot, 'tools/ci-build-input-plan.cjs')).createPlan(plan.toolsRoot), item = acquisition.files.find(entry => entry.id === 'innounp');
    const lock = json(path.join(plan.toolsRoot, 'tools/build-toolchains.lock.json'));
    if (JSON.stringify(item) !== JSON.stringify(plan.innounp) || plan.unpacker.sha256 !== lock.inno.unpackerSha256 || JSON.stringify(plan.unpacker.tree) !== JSON.stringify(lock.inno.unpackerTree)) fail('unpacker-plan-drift');
    return plan;
}
function validateMetadata(artifact, run, now = Date.now()) {
    if (artifact.expired === true || !Number.isFinite(Date.parse(artifact.expires_at)) || Date.parse(artifact.expires_at) <= now) fail('candidate-artifact-expired');
    if (artifact.id !== PIN.artifactId || artifact.expired !== false || artifact.workflow_run?.id !== PIN.runId || artifact.workflow_run?.head_sha !== PIN.sourceCommit ||
        run.id !== PIN.runId || run.head_sha !== PIN.sourceCommit || run.status !== 'completed' || run.conclusion !== 'success' ||
        artifact.digest != null && artifact.digest !== 'sha256:' + PIN.zipSha256) fail('candidate-artifact-source-mismatch');
    return {id: artifact.id, runId: run.id, sourceCommit: run.head_sha, expiresAt: artifact.expires_at, digest: artifact.digest || null};
}
function responseStatus(response, expected) {
    if ([404, 410].includes(response.status)) fail('candidate-artifact-missing-or-expired');
    if ([401, 403].includes(response.status)) fail('artifact-read-permission-denied');
    if (response.status !== expected) fail('artifact-request-failed');
}
async function api(resource, token, request = fetch) {
    if (!token) fail('download-step-token-required');
    const response = await request('https://api.github.com/repos/' + PIN.repository + '/actions/' + resource,
        {headers: {Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'}, redirect: 'manual', signal: AbortSignal.timeout(180000)});
    return response;
}
function secureLocation(raw) {
    let url; try {url = new URL(raw);} catch (_) {fail('invalid-download-location');}
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) fail('invalid-download-location'); return url.href;
}
async function downloaded(url, file, expected, request = fetch) {
    const deadline = AbortSignal.timeout(180000); let response;
    for (let redirects = 0; redirects <= 5; redirects++) {
        // Deliberately no API headers/token on signed storage or subsequent redirects.
        response = await request(secureLocation(url), {headers: {}, redirect: 'manual', signal: deadline});
        if ([301, 302, 303, 307, 308].includes(response.status)) {url = new URL(response.headers.get('location'), url).href; await response.body?.cancel(); continue;}
        break;
    }
    if (!response || response.status !== 200 || !response.body) fail('download-response-failed');
    const fd = fs.openSync(file, 'wx', 0o600), hash = crypto.createHash('sha256'); let size = 0;
    try {
        for await (const chunk of response.body) {
            size += chunk.length; if (size > expected.size) fail('download-size-exceeded');
            for (let offset = 0; offset < chunk.length;) {const written = fs.writeSync(fd, chunk, offset, chunk.length - offset); if (!written) fail('download-write-stalled'); offset += written;} hash.update(chunk);
        }
        fs.fsyncSync(fd);
    } finally {fs.closeSync(fd); if (size > expected.size) await response.body.cancel().catch(() => {});}
    if (size !== expected.size || hash.digest('hex') !== expected.sha256) fail('download-byte-identity-mismatch');
    return {size, sha256: expected.sha256};
}
async function acquire(plan, token, request = fetch) {
    const metadataResponse = await api('artifacts/' + PIN.artifactId, token, request); responseStatus(metadataResponse, 200);
    const runResponse = await api('runs/' + PIN.runId, token, request); responseStatus(runResponse, 200);
    const metadata = validateMetadata(await metadataResponse.json(), await runResponse.json());
    const redirect = await api('artifacts/' + PIN.artifactId + '/zip', token, request); responseStatus(redirect, 302);
    const location = secureLocation(redirect.headers.get('location')); await redirect.body?.cancel();
    const artifact = await downloaded(location, plan.paths.artifact, {size: PIN.zipSize, sha256: PIN.zipSha256}, request);
    const unpacker = await downloaded(plan.innounp.url, plan.paths.unpackerZip, plan.innounp, request);
    writeNew(path.join(plan.root, 'acquire.json'), {status: 'passed', metadata, artifact, unpacker}); return metadata;
}
function verifyAcquired(plan) {
    const smoke = toolsAt(plan.toolsRoot);
    if (fs.statSync(plan.paths.artifact).size !== PIN.zipSize || smoke.hashFile(plan.paths.artifact) !== PIN.zipSha256) fail('candidate-zip-byte-identity');
    require(path.join(plan.toolsRoot, 'tools/ci-build-input-plan.cjs')).verifyFile(plan.paths.unpackerZip, plan.innounp);
    return plan;
}
function files(root) {
    const result = [];
    function walk(dir) {for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {const file = path.join(dir, entry.name); const stat = fs.lstatSync(file); if (stat.isSymbolicLink()) fail('expanded-link-refused'); if (stat.isDirectory()) walk(file); else if (stat.isFile()) result.push(file); else fail('expanded-nonregular-refused');}}
    walk(root); return result;
}
function expandedInputs(plan) {
    verifyAcquired(plan); const smoke = toolsAt(plan.toolsRoot), toolchains = require(path.join(plan.toolsRoot, 'tools/build-toolchains.cjs'));
    const actual = toolchains.treeIdentity(plan.paths.unpackerTree), expected = plan.unpacker.tree;
    if (actual.fileCount !== expected.fileCount || actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) fail('unpacker-tree-mismatch');
    const unpacker = path.join(plan.paths.unpackerTree, 'innounp.exe'); if (smoke.hashFile(unpacker) !== plan.unpacker.sha256) fail('unpacker-executable-mismatch');
    const receipt = smoke.zipReceipts(plan.paths.artifact).filter(r => r.sourceCommit === PIN.sourceCommit && r.installer?.sha256 === PIN.installerSha256);
    if (receipt.length !== 1 || !/^[A-Za-z0-9._-]+\.exe$/.test(receipt[0].installer.fileName)) fail('installer-receipt-mismatch');
    const matches = files(plan.paths.artifactTree).filter(file => path.basename(file) === receipt[0].installer.fileName);
    if (matches.length !== 1 || smoke.hashFile(matches[0]) !== PIN.installerSha256 || fs.statSync(matches[0]).size !== receipt[0].installer.size) fail('installer-byte-identity');
    return {unpacker, installer: matches[0], extracted: plan.paths.extracted, runtime: path.join(plan.paths.extracted, '{app}')};
}
function noCredentials(environment) {if (Object.keys(environment).some(name => tokenNames.test(name) && environment[name])) fail('credential-present-in-execution-step');}
function runTool(plan, arguments_, label, script = path.join(plan.toolsRoot, 'tools/playback-range-windows-smoke.cjs')) {
    const environment = cleanEnvironment(); noCredentials(environment); const file = path.join(plan.root, label + '.stdout'), fd = fs.openSync(file, 'wx');
    try {
        const result = spawnSync(process.execPath, [script, ...arguments_],
            {cwd: plan.toolsRoot, env: environment, windowsHide: true, shell: false, stdio: ['ignore', fd, fd], timeout: 600000});
        if (label === 'disk-probe-driver') require('./ci-mpv-disk-probe.cjs').printSummary(plan);
        if (label === 'buffer-export-driver') require('./ci-mpv-buffer-export.cjs').printSummary(plan);
        if (result.error || result.status !== 0) fail('controlled-smoke-command-failed:' + label);
    } finally {fs.closeSync(fd);}
}
function execute(plan) {
    if (process.platform !== 'win32' || process.arch !== 'x64') fail('windows-runner-required');
    const inputs = expandedInputs(plan), smoke = toolsAt(plan.toolsRoot);
    const identity = smoke.verifyRuntime(plan.toolsRoot, inputs.runtime, plan.paths.artifact);
    writeNew(path.join(plan.root, 'unpack.json'), {status: 'passed', pin: PIN, identity});
    if (['buffer-export', 'buffer-export-av', 'buffer-export-edl', 'buffer-export-seam'].includes(plan.mode)) {
        runTool(plan, ['--control-plan=' + path.join(plan.root, 'control-plan.json')], 'buffer-export-driver', path.join(__dirname, 'ci-mpv-buffer-export.cjs'));
        writeNew(path.join(plan.root, 'execution.json'), {status: 'passed', mode: plan.mode, baseToolsCommit: PIN.toolsCommit, controlsCommit: plan.workflowCommit,
            sourceCommit: PIN.sourceCommit, evidence: 'fixed-mpv-finite-buffer-export-NOT-transparent-restore', transparentRestore: 'NOT_ASSESSED', originalPackageModified: false}); return;
    }
    if (plan.mode === 'disk-probe') {
        runTool(plan, ['--control-plan=' + path.join(plan.root, 'control-plan.json')], 'disk-probe-driver', path.join(__dirname, 'ci-mpv-disk-probe.cjs'));
        writeNew(path.join(plan.root, 'execution.json'), {status: 'observed', mode: plan.mode, baseToolsCommit: PIN.toolsCommit, controlsCommit: plan.workflowCommit,
            sourceCommit: PIN.sourceCommit, evidence: 'stock-mpv-disk-options-observation-only', restoreAssessment: 'NOT_ASSESSED', originalPackageModified: false}); return;
    }
    if (plan.mode === 'loader-trial') {
        runTool(plan, ['--control-plan=' + path.join(plan.root, 'control-plan.json')], 'loader-trial-driver', path.join(__dirname, 'playback-range-loader-trial.cjs'));
        writeNew(path.join(plan.root, 'execution.json'), {status: 'passed', mode: plan.mode, baseToolsCommit: PIN.toolsCommit, controlsCommit: plan.workflowCommit,
            sourceCommit: PIN.sourceCommit, evidence: 'derived-loader-trial-NOT-original-package', originalPackageModified: false}); return;
    }
    runTool(plan, ['prepare', '--runtime=' + inputs.runtime, '--zip=' + plan.paths.artifact, '--out=' + plan.paths.smoke], 'prepare');
    const file = path.join(plan.paths.smoke, 'plan.json');
    runTool(plan, ['entry-smoke', '--plan=' + file, '--execute-electron-entry-smoke'], 'entry-driver');
    if (plan.mode === 'native') runTool(plan, ['run', '--plan=' + file, '--execute-hidden-native'], 'native-driver');
    writeNew(path.join(plan.root, 'execution.json'), {status: 'passed', mode: plan.mode, toolsCommit: PIN.toolsCommit, sourceCommit: PIN.sourceCommit,
        evidence: plan.mode === 'entry' ? 'actual-fixed-Electron-entry-only' : 'actual-fixed-native-synthetic-transport-not-visual-or-NAS'});
}
const EVIDENCE = ['extraction-failure.json', 'acquire.json', 'unpack.json', 'execution.json', 'failure.json', 'prepare.stdout', 'entry-driver.stdout', 'native-driver.stdout', 'loader-trial-driver.stdout'];
function collect(plan, destination) {
    if (fs.existsSync(destination)) fail('fresh-evidence-output-required'); fs.mkdirSync(destination, {recursive: true});
    writeNew(path.join(destination, 'control.json'), {schema: 1, pin: PIN, mode: plan.mode, workflowCommit: plan.workflowCommit});
    const copied = [];
    function copy(file, name) {
        if (!fs.existsSync(file) || !fs.lstatSync(file).isFile()) return;
        const bytes = fs.statSync(file).size, stdout = name.endsWith('.stdout'), limit = stdout ? 524288 : 1048576;
        if (bytes <= limit) {fs.copyFileSync(file, path.join(destination, name)); copied.push({name, bytes, action: 'copied'});}
        else if (stdout) {
            const fd = fs.openSync(file, 'r'), tail = Buffer.alloc(limit);
            try {fs.readSync(fd, tail, 0, limit, bytes - limit);} finally {fs.closeSync(fd);}
            fs.writeFileSync(path.join(destination, name), tail, {flag: 'wx'}); copied.push({name, bytes, publishedBytes: limit, action: 'tail-only'});
        } else copied.push({name, bytes, action: 'omitted-too-large'});
    }
    for (const name of EVIDENCE) copy(path.join(plan.root, name), name);
    const names = ['entry-coordinator.json', 'coordinator.json', 'config.json'];
    for (const phase of ['entry', 'populate', 'reopen']) for (const suffix of ['.json', '.running.json', '.launch.json', '.stages.ndjson', '.stdout']) names.push(phase + suffix);
    for (const name of names) copy(path.join(plan.paths.smoke, name), name);
    if (plan.mode === 'loader-trial') {
        const root = path.join(plan.root, 'loader-trial');
        for (const name of ['baseline-result.json', 'derived-result.json', 'comparison.json', 'result.json']) copy(path.join(root, name), 'loader-' + name);
        copy(path.join(root, 'derived-image/loader-derivation.json'), 'loader-derivation.json');
        for (const variant of ['baseline', 'derived']) for (const phase of ['startup', 'populate', 'reopen']) for (const suffix of ['.json', '.running.json', '.launch.json', '.stages.ndjson', '.stdout']) {
            copy(path.join(root, variant, phase + suffix), 'loader-' + variant + '-' + phase + suffix);
        }
    }
    if (plan.mode === 'disk-probe') {
        const disk = require('./ci-mpv-disk-probe.cjs'); disk.printSummary(plan); copied.push(...disk.collect(plan, destination));
    }
    if (['buffer-export', 'buffer-export-av', 'buffer-export-edl', 'buffer-export-seam'].includes(plan.mode)) {
        const exporter = require('./ci-mpv-buffer-export.cjs'); exporter.printSummary(plan); copied.push(...exporter.collect(plan, destination));
    }
    const complete = !copied.some(row => row.action === 'omitted-too-large');
    writeNew(path.join(destination, 'collection.json'), {complete, files: copied}); if (!complete) fail('artifact-evidence-size-refused'); return copied;
}

function safeCode(error) {return /^(?:candidate|artifact|download|invalid|tools|workflow|fresh|unpacker|installer|expanded|credential|controlled|windows|redirected)[a-z0-9:._-]{0,160}$/.test(error.message || '') ? error.message : 'isolated-range-ci-failed';}
async function main(argv) {
    const [command, ...rest] = argv; const args = Object.fromEntries(rest.map(value => {const at = value.indexOf('='); if (at < 0) fail('invalid-argument'); return [value.slice(0, at), value.slice(at + 1)];}));
    let plan;
    try {
        if (command === 'plan') {plan = createPlan(args['--tools'], args['--root'], args['--mode'], process.env.GITHUB_SHA, process.env.GITHUB_REPOSITORY, process.env.ETE_RELEASE_PACKAGE); console.log(JSON.stringify({plan: path.join(plan.root, 'control-plan.json')})); return;}
        plan = readPlan(args['--plan']);
        if (command === 'acquire') await acquire(plan, process.env.GITHUB_TOKEN);
        else if (command === 'verify-acquired') {verifyAcquired(plan); console.log(JSON.stringify(plan.paths));}
        else if (command === 'expanded-inputs') console.log(JSON.stringify(expandedInputs(plan)));
        else if (command === 'execute') execute(plan);
        else if (command === 'extraction-failed') {
            if (!['verify-archives', 'expand-candidate', 'expand-unpacker', 'verify-expanded', 'installer-test', 'installer-extract'].includes(args['--stage'])) fail('invalid-extraction-stage');
            writeNew(path.join(plan.root, 'extraction-failure.json'), {status: 'failed', stage: args['--stage'], installerExecuted: false});
        }
        else if (command === 'collect') console.log(JSON.stringify(collect(plan, args['--out'])));
        else fail('invalid-command');
    } catch (error) {
        if (plan && !fs.existsSync(path.join(plan.root, 'failure.json'))) writeNew(path.join(plan.root, 'failure.json'), {status: 'failed', command, code: safeCode(error), nativeOutcome: /:(?:native|loader-trial|disk-probe|buffer-export)-driver$/.test(String(error.message)) ? 'UNCERTAIN' : 'NOT_ESTABLISHED'});
        throw error;
    }
}
if (require.main === module) main(process.argv.slice(2)).catch(error => {console.error(safeCode(error)); process.exitCode = 1;});
module.exports = {PIN, tokenNames, cleanEnvironment, noCredentials, validateDispatch, validateMetadata, responseStatus, secureLocation, api, downloaded, acquire, createPlan, readPlan, expandedInputs, collect, EVIDENCE, safeCode};
