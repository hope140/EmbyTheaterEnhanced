'use strict';
// One explicit bounded export probe. No build, dispatch or production import.
const fs = require('node:fs'), path = require('node:path');
const probe = require('./playback-buffer-export-probe.cjs');
const safe = require('./ci-mpv-disk-probe.cjs');
function read(file) {try {return require('./playback-buffer-disk-probe.cjs').boundedJson(file);} catch (_) {return null;}}
function readFailure(file) {
    try {
        require('./playback-range-windows-smoke.cjs').regular(file);
        const size = fs.statSync(file).size, bytes = Buffer.alloc(Math.min(size, 65536)), fd = fs.openSync(file, 'r');
        try {fs.readSync(fd, bytes, 0, bytes.length, size - bytes.length);} finally {fs.closeSync(fd);}
        for (const line of bytes.toString('utf8').split(/\r?\n/).reverse()) if (line.startsWith('mpv-buffer-export-failure:')) {
            const row = JSON.parse(line.slice('mpv-buffer-export-failure:'.length));
            return probe.safeFailure({message: row.code, code: row.systemCode, avi: row.format}, row.stage);
        }
    } catch (_) {}
    return null;
}
function summary(plan) {
    const root = path.join(plan.root, 'buffer-export'), observation = read(path.join(root, 'probe/observations.json')), receipt = read(path.join(root, 'probe/run.json'));
    const n = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
    const boolean = value => typeof value === 'boolean' ? value : null;
    return {scope: probe.SCOPE, variant: ['video', 'av', 'edl'].includes(observation?.variant) ? observation.variant : null,
        status: observation?.status === 'PASS' && receipt?.status === 'PASS' ? 'PASS' : 'UNKNOWN',
        stage: probe.STAGES.has(observation?.stage) ? observation.stage : 'preflight',
        failure: observation?.failure ? probe.safeFailure({message: observation.failure.code, code: observation.failure.systemCode, avi: observation.failure.format}, observation.failure.stage) :
            receipt?.failure ? probe.safeFailure({message: receipt.failure.code, code: receipt.failure.systemCode, avi: receipt.failure.format}, receipt.failure.stage) :
                readFailure(path.join(root, 'probe/worker.log')) || readFailure(path.join(plan.root, 'buffer-export-driver.stdout')),
        workerPid: n(receipt?.pid), exitCode: n(receipt?.code), streamsClosed: boolean(receipt?.streamsClosed), timedOut: boolean(receipt?.timedOut),
        exportMs: n(observation?.exportMs), clipBytes: n(observation?.clip?.bytes),
        pendingOption: Object.hasOwn(probe.optionsFor('av'), observation?.pendingOption) ? observation.pendingOption : null,
        optionStatus: probe.projectOptionStatus(observation?.optionStatus),
        testExcerptRetirement: {nativeReaders: n(receipt?.excerptRetirement?.nativeReaders), removed: Array.isArray(receipt?.excerptRetirement?.removed) ? receipt.excerptRetirement.removed.filter(name => ['excerpt.avi', 'retained.edl'].includes(name)) : []},
        clipFormat: Object.fromEntries(['ticksPerSecond', 'nonemptyPackets', 'emptyVideoSlots', 'containerSlots'].map(k => [k, n(observation?.clipFormat?.[k])])),
        checks: Object.fromEntries(['newRequests', 'newScheduledSourceBytes', 'completedBytesDelta'].map(k => [k, n(observation?.checks?.[k])]).concat(
            ['clipDecoded', 'audioDecoded', 'seekMappingVerified', 'clipReachedEOF', 'unchangedAfterStop', 'unchangedAfterExit', 'unchangedAfterReopen', 'edlTimelineAndTracks', 'unchangedAfterEDL'].map(k => [k, boolean(observation?.checks?.[k])]))),
        edl: {virtualDuration: n(observation?.edl?.virtualDuration), maxBackstepSeconds: n(observation?.edl?.maxBackstepSeconds), startFiles: n(observation?.edl?.startFiles),
            seamSourceSeconds: n(observation?.edl?.range?.end), sampleCount: Array.isArray(observation?.edl?.samples) ? observation.edl.samples.length : null,
            assessment: ['COMPLETED_SAVED_PAYLOAD_REREAD', 'SCHEDULED_SAVED_PAYLOAD_REREAD_DELIVERY_UNCERTAIN', 'NO_SAVED_PAYLOAD_REREAD_OBSERVED'].includes(observation?.edl?.network?.assessment) ? observation.edl.network.assessment : 'NOT_ASSESSED',
            ...Object.fromEntries(['requests', 'sourceFileBytes', 'savedPayloadBytes', 'scheduledSourceBytes', 'scheduledUniqueSourceBytes', 'completedUniqueSourceBytes', 'scheduledSavedPayloadBytes', 'completedSavedPayloadBytes'].map(k => [k, n(observation?.edl?.network?.[k])])),
            ...Object.fromEntries(['scheduledAllSavedPayloadReread', 'completedAllSavedPayloadReread', 'completedWholeSourceRead'].map(k => [k, boolean(observation?.edl?.network?.[k])])),
            ...Object.fromEntries(['callbackFlushedUniqueSourceBytes', 'callbackFlushedSavedPayloadBytes', 'failedWriteCallbacks', 'pendingClosedCallbacks', 'callbackUnknownSavedPayloadBytes'].map(k => [k, n(observation?.edl?.network?.[k])])),
            writeCallbacksMeasured: boolean(observation?.edl?.network?.writeCallbacksMeasured), callbackFlushedAllSavedPayload: boolean(observation?.edl?.network?.callbackFlushedAllSavedPayload),
            callbackObservationsComplete: boolean(observation?.edl?.network?.callbackObservationsComplete),
            transferAssessment: ['SAVED_PAYLOAD_FLUSHED_TO_UNDERLYING_SYSTEM', 'NO_SAVED_PAYLOAD_SUCCESSFUL_CALLBACK_OBSERVED', 'SAVED_PAYLOAD_DELIVERY_UNKNOWN_AFTER_CLOSE'].includes(observation?.edl?.network?.transferAssessment) ? observation.edl.network.transferAssessment : 'NOT_MEASURED',
            stop: {resolution: ['PHYSICAL_AND_CALLBACKS_SETTLED', 'PHYSICAL_CLOSED_CALLBACK_DELIVERY_UNKNOWN'].includes(observation?.edl?.stop?.resolution) ? observation.edl.stop.resolution : 'UNKNOWN',
                legacyWaitTimedOut: boolean(observation?.edl?.stop?.legacyWaitTimedOut), snapshots: Array.isArray(observation?.edl?.stop?.snapshots) ? observation.edl.stop.snapshots.slice(0, 4).map(s => ({
                    label: ['before-stop', 'stop-replied', 'settled', 'deadline'].includes(s.label) ? s.label : 'unknown',
                    ...Object.fromEntries(['activeResponses', 'openSockets', 'openSourceStreams'].map(k => [k, n(s.resources?.[k])])),
                    allPending: n(s.all?.pendingCallbacks), livePending: n(s.all?.pendingOpenCallbacks), closedPending: n(s.all?.pendingClosedCallbacks),
                    historyClosedPending: n(s.history?.pendingClosedCallbacks), currentClosedPending: n(s.current?.pendingClosedCallbacks)})) : []},
            clientConsumption: 'NOT_MEASURED',
            audioContinuity: 'NOT_SAMPLE_CAPTURED'},
        fallback: {scope: 'synthetic-retention-preflight-fallback-NOT-product-authorization', reason: observation?.fallback?.reason === 'excerpt-unavailable-or-changed' ? observation.fallback.reason : null,
            decodeAndTimelinePassed: boolean(observation?.fallback?.decodeAndTimelinePassed),
            ...Object.fromEntries(['targetSourceSeconds', 'landedSourceSeconds', 'advancedSourceSeconds', 'duration', 'startFiles', 'sourceRequests'].map(k => [k, n(observation?.fallback?.[k])])),
            ...Object.fromEntries(['activeResponses', 'openSockets', 'openSourceStreams'].map(k => [k, n(observation?.fallback?.stop?.resources?.[k])]))},
        seek: Object.fromEntries(['targetLocalSeconds', 'landedLocalSeconds', 'mappedSourceSeconds'].map(k => [k, n(observation?.seek?.[k])])),
        audioMapping: {commonMappingWithinOneSample: boolean(observation?.audioMapping?.commonMappingWithinOneSample),
            ...Object.fromEntries(['samples', 'sourceStartSeconds', 'sourceEndSeconds', 'localStartSeconds', 'sourceMinusLocalSeconds', 'videoMinusLocalSeconds', 'offsetDeltaSeconds'].map(k => [k, n(observation?.audioMapping?.[k])]))},
        mapping: Object.fromEntries(['packets', 'firstSourceFrame', 'lastSourceFrame', 'sourceStartSeconds', 'sourceEndExclusiveSeconds', 'localStartSeconds', 'sourceMinusLocalSeconds', 'containerTicksPerSecond', 'emptyVideoSlots', 'containerSlots'].map(k => [k, n(observation?.mapping?.[k])])),
        helpers: Array.isArray(observation?.helpers) ? observation.helpers.slice(0, 3).map(h => ({pid: n(h.pid), exited: boolean(h.exited),
            exitCode: n(h.diagnostics?.processExitCode), streamsClosed: boolean(h.diagnostics?.streamsClosed)})) : [],
        transparentRestore: 'NOT_ASSESSED'};
}
function printSummary(plan) {console.log('mpv-buffer-export-summary:' + JSON.stringify(summary(plan)));}
async function run(file) {
    if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('export-explicit-Windows-required');
    const ci = require('./ci-playback-range-smoke.cjs'), plan = ci.readPlan(file), repo = path.resolve(__dirname, '..');
    if (!['buffer-export', 'buffer-export-av', 'buffer-export-edl'].includes(plan.mode)) throw Error('export-input-invalid');
    ci.noCredentials(process.env);
    const inputs = ci.expandedInputs(plan), root = path.join(plan.root, 'buffer-export');
    if (fs.existsSync(root)) throw Error('export-fresh-root'); fs.mkdirSync(root);
    const trial = require('./playback-range-loader-trial.cjs'), support = require('./playback-range-windows-smoke.cjs');
    const derived = trial.derive(repo, inputs.runtime, plan.toolsRoot, plan.paths.artifact, path.join(root, 'derived-image'), plan.workflowCommit);
    const source = support.prepare({repo, runtime: derived.runtime, zip: plan.paths.artifact, out: path.join(root, 'source'), loaderTrial: derived.descriptor});
    const sourceFile = path.join(source.out, 'plan.json');
    support.writeNew(path.join(root, 'input.json'), {schema: 1, scope: probe.SCOPE, controlsCommit: plan.workflowCommit,
        baseToolsCommit: ci.PIN.toolsCommit, baseSourceCommit: ci.PIN.sourceCommit, identity: derived.identity,
        loader: derived.identity.derivation.addition, originalPackageModified: false, transparentRestore: 'NOT_ASSESSED'});
    await support.entrySmoke(sourceFile, true);
    probe.prepare(sourceFile, path.join(root, 'probe'), plan.mode === 'buffer-export-edl' ? 'edl' : plan.mode === 'buffer-export-av' ? 'av' : 'video');
    await probe.run(path.join(root, 'probe/probe.json'), true);
    trial.verifyRuntime(repo, derived.runtime, plan.paths.artifact, derived.descriptor); return summary(plan);
}
function collect(plan, destination) {
    const root = path.join(plan.root, 'buffer-export'), rows = [];
    const roots = [[root, '<buffer-export>'], [plan.root, '<owned>'], [plan.toolsRoot, '<immutable-tools>'], [path.resolve(__dirname, '..'), '<controls>']].sort((a, b) => b[0].length - a[0].length);
    // Only safe semantic JSON, never media, credentials, environment or stderr.
    for (const [relative, name] of [['input.json', 'export-input.json'], ['derived-image/loader-derivation.json', 'export-derivation.json'],
        ['source/entry.json', 'export-entry.json'], ['source/entry-coordinator.json', 'export-entry-coordinator.json'],
        ['probe/probe.json', 'export-plan.json'], ['probe/observations.json', 'export-observations.json'], ['probe/run.json', 'export-run.json']]) {
        const file = path.join(root, relative);
        if (!fs.existsSync(file)) continue;
        require('./playback-range-windows-smoke.cjs').regular(file);
        if (fs.statSync(file).size > 2097152) throw Error('export-receipt-invalid');
        const raw = fs.readFileSync(file), bytes = Buffer.from(JSON.stringify(safe.redact(JSON.parse(raw), roots), null, 2) + '\n');
        if (bytes.length > 2097152) throw Error('export-receipt-invalid');
        fs.writeFileSync(path.join(destination, name), bytes, {flag: 'wx', mode: 0o600});
        const sha = data => require('node:crypto').createHash('sha256').update(data).digest('hex');
        rows.push({name, bytes: raw.length, publishedBytes: bytes.length, sourceSha256: sha(raw), publishedSha256: sha(bytes), action: 'redacted-json'});
    }
    return rows;
}
if (require.main === module) {
    if (process.argv.length !== 3 || !process.argv[2].startsWith('--control-plan=')) {console.error('export-input-invalid'); process.exitCode = 1;}
    else run(process.argv[2].slice('--control-plan='.length)).then(() => console.log('finite-buffer-export-PASS-NOT-transparent-restore'))
        .catch(error => {console.error('mpv-buffer-export-failure:' + JSON.stringify(probe.safeFailure(error, 'preflight'))); process.exitCode = 1;});
}
module.exports = {summary, printSummary, readFailure, run, collect};
