'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync, spawnSync} = require('node:child_process');
const PIN = Object.freeze({repository: 'hope140/EmbyTheaterEnhanced', toolsCommit: 'c9cd9bacf81445c9c10befd121951b1c63c86faa',
    sourceCommit: 'b8938f4ba9149e700ea1437b3f5fbe3535a2f5e5', runId: 40124678404, runAttempt: 1, artifactId: 12573411870,
    zipSize: 165275527, zipSha256: '60eb9f6eb306df3e03db910f4f5af7bd05c1a9237c73b5688df12da3ed5dad94',
    installerFileName: 'EmbyTheaterEnhanced-0.4.3-test-b8938f4ba914-40124678404-1-win-x64-setup.exe',
    installerSha256: '40a99cc4281c9a7d958d424902982f781c12072a183013b9002713fa24c7af62'});
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
    const smoke = require('./playback-range-windows-smoke.cjs');
    if (smoke.CANDIDATE.commit !== PIN.sourceCommit || smoke.CANDIDATE.zipSha256 !== PIN.zipSha256 || smoke.CANDIDATE.zipSize !== PIN.zipSize || smoke.CANDIDATE.installerSha256 !== PIN.installerSha256) fail('candidate-lock-disagreement');
    return smoke;
}
function validateDispatch(mode, workflowCommit, repository, releasePackage, ref) {
    if (ref !== 'refs/heads/verify/next-prefix-v043-native-20261024') fail('invalid-range-branch');
    if (mode !== 'next-auto' || releasePackage !== 'false' || repository !== PIN.repository || !/^[a-f0-9]{40}$/.test(workflowCommit || '')) fail('invalid-range-dispatch');
}
function createPlan(toolsRoot, root, mode, workflowCommit, repository, releasePackage) {
    validateDispatch(mode, workflowCommit, repository, releasePackage, process.env.GITHUB_REF);
    toolsRoot = fs.realpathSync.native(toolsRoot); toolsAt(toolsRoot);
    if (git(path.resolve(__dirname, '..'), ['rev-parse', 'HEAD']) !== workflowCommit) fail('workflow-checkout-drift');
    if (!path.isAbsolute(root) || fs.existsSync(root)) fail('fresh-absolute-work-root-required');
    const acquisition = require(path.join(toolsRoot, 'tools/ci-build-input-plan.cjs')).createPlan(toolsRoot), lock = json(path.join(toolsRoot, 'tools/build-toolchains.lock.json'));
    const entries = acquisition.files.filter(entry => entry.id === 'innounp');
    if (entries.length !== 1 || entries[0].sha256 !== lock.inno.unpackerArchive.sha256 || entries[0].size !== lock.inno.unpackerArchive.size) fail('unpacker-input-lock');
    fs.mkdirSync(root); root = fs.realpathSync.native(root); fs.writeFileSync(path.join(root, 'owner'), OWNER, {flag: 'wx'});
    const plan = {schema: 1, pin: PIN, root, toolsRoot, mode, workflowCommit, innounp: entries[0],
        unpacker: {sha256: lock.inno.unpackerSha256, tree: lock.inno.unpackerTree},
        paths: pathsFor(root)};
    writeNew(path.join(root, 'control-plan.json'), plan); return plan;
}
function readPlan(file) {
    if (fs.realpathSync.native(file) !== path.resolve(file)) fail('redirected-control-plan');
    const plan = json(file);
    if (plan.schema !== 1 || JSON.stringify(plan.pin) !== JSON.stringify(PIN) || plan.mode !== 'next-auto' ||
        fs.realpathSync.native(plan.root) !== plan.root || path.resolve(file) !== path.join(plan.root, 'control-plan.json') || fs.readFileSync(path.join(plan.root, 'owner'), 'utf8') !== OWNER) fail('invalid-control-plan');
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
        run.id !== PIN.runId || run.run_attempt !== PIN.runAttempt || run.head_sha !== PIN.sourceCommit || run.status !== 'completed' || run.conclusion !== 'success' ||
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
    if (receipt.length !== 1 || receipt[0].installer.fileName !== PIN.installerFileName) fail('installer-receipt-mismatch');
    const matches = files(plan.paths.artifactTree).filter(file => path.basename(file) === receipt[0].installer.fileName);
    if (matches.length !== 1 || smoke.hashFile(matches[0]) !== PIN.installerSha256 || fs.statSync(matches[0]).size !== receipt[0].installer.size) fail('installer-byte-identity');
    return {unpacker, installer: matches[0], extracted: plan.paths.extracted, runtime: path.join(plan.paths.extracted, '{app}')};
}
function noCredentials(environment) {if (Object.keys(environment).some(name => tokenNames.test(name) && environment[name])) fail('credential-present-in-execution-step');}
const AUTO_CODES = new Set(['actual-source-chain-missing', 'automatic-chain-order-missing', 'prefix-target-not-proven',
    'B-native-decode-not-proven', 'B-prefix-read-not-observed', 'B-prefix-hit-or-native-miss-not-proven', 'unexpected-play-count',
    'renderer-failed', 'renderer-chain-failed', 'unexpected-visible-window', 'next-prefix-status-contract', 'automatic-native-deadline',
    'service-destroy-failed', 'helper-exit-UNCERTAIN', 'origin-close-failed', 'temporary-prefix-cleanup-failed',
    'owned-Electron-exit-failed', 'phase-receipt-invalid', 'native-helper-exit-receipt-invalid', 'actual-entry-required', 'joint-preview-owner-unavailable', 'joint-preview-native-decode-missing', 'joint-work-not-pending', 'joint-preview-owner-not-retired', 'joint-late-preview-published', ...require('./playback-prefix-windows-auto.cjs').MATRIX_CODES]);
const AUTO_EVENTS = new Set(['profile-isolated', 'app-ready', 'helper-ready', 'module-loaded', 'manager-play-invocation',
    'initial-play-resolved', 'native-property', 'load', 'range-preload', 'prefix-ready', 'manager-next-track', 'origin-media',
    'prefix-read', 'decoded-B', 'renderer-failure', 'matrix-held', 'matrix-action', 'matrix-checked', 'matrix-exit-request', 'matrix-policy', 'matrix-preempt-stage', 'origin-client-open', 'origin-client-closed', 'joint-preview-decoded', 'joint-drained']);
function preparationFailureSummary(file) {
    const {PREPARE_STAGES, PREPARE_CODES, prepareFailure} = require('./playback-prefix-windows-auto.cjs');
    let text;
    try {
        const stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536) throw Error('bounded-log-required');
        text = fs.readFileSync(file, 'utf8');
    } catch (_) {return {status: 'not-recorded', stage: 'not-recorded', code: 'prepare-reason-unavailable'};}
    let stage = 'not-recorded', reason;
    for (const line of text.split(/\r?\n/)) {
        let row; try {row = JSON.parse(line);} catch (_) {}
        if (row?.type === 'next-auto-prepare-stage' && PREPARE_STAGES.includes(row.stage)) stage = row.stage;
        if (row?.type === 'next-auto-prepare-failure') {
            const error = {message: PREPARE_CODES.includes(row.code) ? row.code : 'prepare-unexpected-error',
                code: row.systemCode, status: row.gitExitCode, prepareStage: row.stage};
            reason = prepareFailure(error);
        } else if (PREPARE_CODES.includes(line.trim())) {
            // Compatibility with a pre-stage driver: only an exact fixed reason,
            // never a raw exception, path, URL, stdout tail or stack is echoed.
            reason = prepareFailure({message: line.trim(), prepareStage: line.trim() === 'driver-source-mismatch' ? 'driver-source' : stage});
        }
    }
    return reason ? {status: 'failed', stage: reason.stage, code: reason.code, systemCode: reason.systemCode, gitExitCode: reason.gitExitCode}
        : {status: 'not-recorded', stage, code: 'prepare-reason-unavailable'};
}
function automaticFailureSummary(root, commandLog, selectedPhase) {
    function read(name, limit, parse) {
        try {const file = path.join(root, name), stat = fs.lstatSync(file);
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit) return null;
            return parse(fs.readFileSync(file, 'utf8'));
        } catch (_) {return null;}
    }
    const code = value => AUTO_CODES.has(value) ? value : 'unclassified';
    const exitCode = value => Number.isSafeInteger(value) && value >= -2147483648 && value <= 0xffffffff ? value : null;
    const phases = ['entry', 'native', ...require('./playback-prefix-windows-auto.cjs').MATRIX_PHASES].map(phase => {
        const coordinator = read(phase + '-coordinator.json', 65536, JSON.parse), receipt = read(phase + '.json', 65536, JSON.parse);
        return {phase, coordinatorStatus: ['passed', 'failed'].includes(coordinator?.status) ? coordinator.status : 'not-recorded', status: ['passed', 'failed'].includes(receipt?.status) ? receipt.status : 'not-recorded',
            code: code(receipt?.code || coordinator?.code), timedOut: coordinator?.exit?.timedOut === true,
            exitCode: exitCode(coordinator?.exit?.code), streamsClosed: coordinator?.exit?.streamsClosed === true,
            cleanup: Array.isArray(receipt?.cleanup) ? receipt.cleanup.map(code).slice(0, 8) : [],
            helpers: Array.isArray(receipt?.helpers) ? receipt.helpers.filter(helper => helper && typeof helper === 'object').slice(0, 4).map(helper => ({exited: helper.exited === true,
                exitCode: exitCode(helper.diagnostics?.processExitCode), streamsClosed: helper.diagnostics?.streamsClosed === true,
                labels: (Array.isArray(helper.diagnostics?.labels) ? helper.diagnostics.labels : []).filter(label =>
                    ['invalid-parent-window', 'surface-create-failed', 'dll-load-failed', 'mpv-create-failed', 'mpv-initialize-failed', 'missing-export', 'option-failed'].includes(label)).slice(0, 8),
                systemCodes: (Array.isArray(helper.diagnostics?.systemCodes) ? helper.diagnostics.systemCodes : []).filter(value => exitCode(value) !== null).slice(0, 8)})) : []};
    });
    const activePhase = phases.some(row => row.phase === selectedPhase) ? selectedPhase : phases.findLast(row => row.status === 'failed')?.phase || 'native';
    const trace = read(activePhase + '.trace.ndjson', 1048576, text => text.trim().split(/\r?\n/).filter(Boolean).map(JSON.parse));
    const events = (trace || []).filter(row => row && AUTO_EVENTS.has(row.type)).slice(-16).map(row => ({type: row.type,
        seq: Number.isSafeInteger(row.seq) ? row.seq : null, generation: Number.isSafeInteger(row.generation) ? row.generation : null, item: ['A', 'B', 'C'].includes(row.item) ? row.item : null,
        property: ['duration', 'time-pos', 'core-idle', 'eof-reached', 'file-loaded'].includes(row.name) ? row.name : null,
        value: typeof row.value === 'boolean' || Number.isFinite(row.value) ? row.value : null,
        operation: ['pause', 'cancel', 'replace', 'seek-back', 'unpause'].includes(row.operation) ? row.operation : null,
        ...Object.fromEntries(['clientRequest', 'requestId', 'start', 'end', 'backgroundActive'].filter(key => Number.isSafeInteger(row[key])).map(key => [key, row[key]]))}));
    const preemptStages = (trace || []).filter(row => row?.type === 'matrix-preempt-stage' && ['held-observed', 'cache-observed', 'seek-requested', 'foreground-miss-observed', 'playback-resumed'].includes(row.stage)).slice(-6).map(row => ({stage: row.stage, generation: Number.isSafeInteger(row.generation) ? row.generation : null, heldClosed: row.heldClosed === true,
        ...Object.fromEntries(['position', 'target', 'forwardCacheBytes', 'backwardCacheBytes', 'foregroundOpenCount'].filter(key => Number.isFinite(row[key])).map(key => [key, row[key]])),
        ranges: (Array.isArray(row.ranges) ? row.ranges : []).filter(range => Number.isFinite(range?.start) && Number.isFinite(range?.end)).slice(0, 4).map(range => ({start: range.start, end: range.end}))}));
    const lastLoads = (trace || []).filter(row => row?.type === 'load' && ['A', 'B', 'C'].includes(row.item)).slice(-3).map(row => ({item: row.item, generation: Number.isSafeInteger(row.generation) ? row.generation : null, seq: Number.isSafeInteger(row.seq) ? row.seq : null}));
    return {type: 'next-auto-failure-summary', preemptStages, lastLoads, prepare: preparationFailureSummary(commandLog), phases, events};
}
function automaticCaseSummary(root, phase) {
    const file = path.join(root, phase + '.json'), summary = automaticFailureSummary(root, undefined, phase), state = summary.phases.find(row => row.phase === phase);
    let checks = {}, orderDiagnostics = {};
    try {
        const stat = fs.lstatSync(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536) throw Error('bounded-receipt-required');
        const receipt = json(file), allowed = new Set(['defaultPreloadMB', 'actualThreshold', 'foregroundCacheBytes', 'backwardCacheBytes', 'seekTargetSeconds', 'explicitNativeSeek', 'peakBackgroundRequests', 'candidateBytes', 'heldRequestClosed', 'lateBytes', 'beforeActionBytes', 'diskPeak',
            'progressPercent', 'aDurationSeconds', 'thresholdSeconds', 'preloadSeq', 'readySeq', 'naturalEOFSeq', 'originalNextSeq', 'bLoadSeq', 'aGeneration', 'bGeneration', 'sampledPeakBytes', 'firstPrefixRefetches', 'prefixReadCount', 'decodedWidth', 'decodedHeight', 'targetBytes', 'observedBOriginProbeCount', 'observedBNativeMissCount', 'decoded', 'automatic', 'nativePreviewDecoded', 'previewWidth', 'previewHeight', 'previewPromisePendingAtDestroy', 'latePreviewDropped', 'jointDrainCompleted', 'foregroundPreempted', 'candidateReplaced', 'exitDuringUnplayedNext', 'noBLoad', 'unsupportedOriginalSource', 'weakEtagDeclined', 'originalSourceDecoded', 'nextUnavailable']);
        const orderKeys = new Set(Object.keys(require('./playback-prefix-windows-auto.cjs').automaticOrder([])));
        orderDiagnostics = Object.fromEntries(Object.entries(receipt.orderDiagnostics || {}).filter(([key, value]) => orderKeys.has(key) && (value === null || Number.isFinite(value))));
        checks = Object.fromEntries(Object.entries(receipt.checks || {}).filter(([key, value]) => allowed.has(key) && (typeof value === 'boolean' || Number.isFinite(value))));
    } catch (_) {}
    const complete = state?.status === 'passed' && state.coordinatorStatus === 'passed' && state.exitCode === 0 && state.streamsClosed && !state.timedOut && state.helpers.length > 0 && state.helpers.every(helper => helper.exited && helper.exitCode === 0 && helper.streamsClosed);
    return {type: 'next-prefix-matrix-case-result', ...state, status: complete ? 'passed' : state?.status === 'not-recorded' ? 'not-recorded' : 'failed', code: complete ? 'passed' : state?.code, checks, orderDiagnostics, ...(phase === 'matrix-preempt' ? {preemptStages: summary.preemptStages, lastLoads: summary.lastLoads} : {}), payloadClearGatePassed: complete};
}
function runTool(plan, arguments_, label, script = path.join(plan.toolsRoot, 'tools/playback-range-windows-smoke.cjs')) {
    const environment = cleanEnvironment(); noCredentials(environment); const file = path.join(plan.root, label + '.stdout'), fd = fs.openSync(file, 'wx');
    try {
        const result = spawnSync(process.execPath, [script, ...arguments_],
            {cwd: plan.toolsRoot, env: environment, windowsHide: true, shell: false, stdio: ['ignore', fd, fd], timeout: 600000});
        if (result.error || result.status !== 0) {
            if (plan.mode === 'next-auto') console.error(JSON.stringify(automaticFailureSummary(plan.paths.smoke, file)));
            fail('controlled-smoke-command-failed:' + label);
        }
    } finally {fs.closeSync(fd);}
}
function execute(plan) {
    if (process.platform !== 'win32' || process.arch !== 'x64') fail('windows-runner-required');
    const inputs = expandedInputs(plan), smoke = toolsAt(plan.toolsRoot);
    const identity = smoke.verifyRuntime(plan.toolsRoot, inputs.runtime, plan.paths.artifact);
    writeNew(path.join(plan.root, 'unpack.json'), {status: 'passed', pin: PIN, identity});
    if (plan.mode === 'next-auto') {
        const script = path.join(__dirname, 'playback-prefix-windows-auto.cjs'), source = path.resolve(__dirname, '..');
        runTool(plan, ['prepare', '--tools=' + plan.toolsRoot, '--source=' + source, '--source-commit=' + plan.workflowCommit,
            '--runtime=' + inputs.runtime, '--zip=' + plan.paths.artifact, '--out=' + plan.paths.smoke], 'prepare', script);
        const file = path.join(plan.paths.smoke, 'auto-plan.json');
        runTool(plan, ['entry-smoke', '--plan=' + file, '--execute-electron-entry'], 'entry-driver', script);
        try {runTool(plan, ['run', '--plan=' + file, '--execute-native'], 'native-driver', script);}
        finally {console.log(JSON.stringify(automaticCaseSummary(plan.paths.smoke, 'native')));}
        try {runTool(plan, ['joint-exit', '--plan=' + file, '--execute-native-joint-exit'], 'joint-exit-driver', script);}
        finally {console.log(JSON.stringify(automaticCaseSummary(plan.paths.smoke, 'matrix-exit')));}
        writeNew(path.join(plan.root, 'execution.json'), {status: 'passed', mode: plan.mode, toolsCommit: PIN.toolsCommit,
            baseSourceCommit: PIN.sourceCommit, overlaySourceCommit: plan.workflowCommit,
            evidence: 'derived-043-runtime-actual-helper-natural-next-and-joint-exit; not-ordinary-install-or-Host-launch-or-NAS'}); return;
    }
    fail('invalid-range-dispatch');
}

const EVIDENCE = ['extraction-failure.json', 'acquire.json', 'unpack.json', 'execution.json', 'failure.json', 'prepare.stdout', 'entry-driver.stdout', 'native-driver.stdout', 'loader-trial-driver.stdout', 'matrix-driver.stdout', 'joint-exit-driver.stdout'];
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
    if (plan.mode === 'next-auto') {
        for (const phase of ['entry', 'native', ...require('./playback-prefix-windows-auto.cjs').MATRIX_PHASES]) for (const suffix of ['.json', '.running.json', '.launch.json', '.trace.ndjson', '.stdout', '-coordinator.json']) copy(path.join(plan.paths.smoke, phase + suffix), 'auto-' + phase + suffix);
    }
    if (plan.mode === 'loader-trial') {
        const root = path.join(plan.root, 'loader-trial');
        for (const name of ['baseline-result.json', 'derived-result.json', 'comparison.json', 'result.json']) copy(path.join(root, name), 'loader-' + name);
        copy(path.join(root, 'derived-image/loader-derivation.json'), 'loader-derivation.json');
        for (const variant of ['baseline', 'derived']) for (const phase of ['startup', 'populate', 'reopen']) for (const suffix of ['.json', '.running.json', '.launch.json', '.stages.ndjson', '.stdout']) {
            copy(path.join(root, variant, phase + suffix), 'loader-' + variant + '-' + phase + suffix);
        }
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
        if (plan && !fs.existsSync(path.join(plan.root, 'failure.json'))) writeNew(path.join(plan.root, 'failure.json'), {status: 'failed', command, code: safeCode(error), nativeOutcome: /:(?:native|loader-trial|matrix)-driver$/.test(String(error.message)) ? 'UNCERTAIN' : 'NOT_ESTABLISHED'});
        throw error;
    }
}
if (require.main === module) main(process.argv.slice(2)).catch(error => {console.error(safeCode(error)); process.exitCode = 1;});
module.exports = {PIN, tokenNames, cleanEnvironment, validateDispatch, validateMetadata, responseStatus, secureLocation, api, downloaded, acquire, createPlan, readPlan, expandedInputs, collect, EVIDENCE, safeCode, preparationFailureSummary, automaticFailureSummary, automaticCaseSummary};
