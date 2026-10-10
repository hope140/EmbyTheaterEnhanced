'use strict';

// Test-only observation around the real packaged application's trusted IPC.
// It never submits a Native command or starts a helper/player.
const fs = require('node:fs');
const path = require('node:path');
const {performance} = require('node:perf_hooks');
const {AsyncLocalStorage} = require('node:async_hooks');
const childProcess = require('node:child_process');
let observation = null;

const INFO_KEYS = ['appVersion', 'sourceCommit', 'nativeHelper', 'libmpv', 'nativeHelperState', 'runningNativeHelper', 'runningLibmpv'];
function project(info) {
    return Object.fromEntries(INFO_KEYS.map(key => [key, info && info[key]]));
}

function validInfo(info, expected) {
    if (!info || !expected.appVersion || info.appVersion !== expected.appVersion || info.sourceCommit !== expected.sourceCommit ||
        info.nativeHelper !== expected.helper.version || info.libmpv !== expected.libmpv.version ||
        !['idle', 'starting', 'ready', 'failed', 'destroyed', 'stopped', 'NOT AVAILABLE'].includes(info.nativeHelperState)) return false;
    return info.nativeHelperState === 'ready' ? info.runningNativeHelper === expected.helper.version &&
        info.runningLibmpv === 'mpv ' + expected.libmpv.version :
        info.runningNativeHelper === 'NOT AVAILABLE' && info.runningLibmpv === 'NOT AVAILABLE';
}

async function waitWithDeadline(pending, timeoutMs, timers = {setTimeout, clearTimeout}) {
    let timer;
    try {
        return await Promise.race([pending.then(() => true), new Promise(resolve => {
            timer = timers.setTimeout(() => resolve(false), timeoutMs);
        })]);
    } finally { timers.clearTimeout(timer); }
}

function install({electron, runtime, evidence, expectedIndex}) {
    if (observation) throw new Error('about-observation-already-installed');
    const appRoot = path.join(runtime, 'electronapp');
    const expected = JSON.parse(fs.readFileSync(path.join(runtime, 'native-helper-provenance.json'), 'utf8'));
    const build = JSON.parse(fs.readFileSync(path.join(runtime, 'build-manifest.json'), 'utf8'));
    const metadata = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
    if (build.sourceCommit !== expected.sourceCommit || build.version !== metadata.version ||
        !/^\d+\.\d+\.\d+$/.test(build.version || '')) throw new Error('about-observation-package-identity-mismatch');
    expected.appVersion = build.version;
    const maintenance = require(path.join(appRoot, 'enhanced/maintenance.js'));
    const report = {schemaVersion: 1, sourceCommit: expected.sourceCommit, status: 'PENDING',
        testBoundaries: {clipboard: 'IN_MEMORY_CAPTURE', saveDialog: 'FIXED_EVIDENCE_FILE', updateTransport: 'LOCAL_RELEASE_FIXTURE'},
        stages: {}, helperStartsInInformationContext: 0, nativeCallsInInformationContext: 0, errors: []};
    const context = new AsyncLocalStorage();
    let sealed = false;
    let application = null;
    let readyStarted = false;
    let resolveInitial;
    const initialDone = new Promise(resolve => { resolveInitial = resolve; });
    let resolveReady;
    const readyDone = new Promise(resolve => { resolveReady = resolve; });
    let clipboardText = null;
    let exportCount = 0;
    let updateRequests = 0;
    let lastExportSnapshot = null;
    const originalSpawn = childProcess.spawn;
    childProcess.spawn = function (file) {
        if (context.getStore() && path.basename(String(file)).toLowerCase() === 'ete-mpv-helper.exe') report.helperStartsInInformationContext++;
        return originalSpawn.apply(this, arguments);
    };
    function informationOptions(options) {
        const original = options.getAppInfo;
        return {...options, getAppInfo: () => context.run('information-query', () => original())};
    }
    const maintenanceIpc = require(path.join(appRoot, 'enhanced/maintenance-ipc.js'));
    const registerMaintenance = maintenanceIpc.register;
    maintenanceIpc.register = function (options) {
        return registerMaintenance({...informationOptions(options),
            clipboard: {writeText(text) { clipboardText = text; }},
            requestJson: async () => { updateRequests++; return {tag_name: 'v' + expected.appVersion, html_url: maintenance.RELEASES_URL}; }});
    };
    const diagnosticsIpc = require(path.join(appRoot, 'enhanced/diagnostics-ipc.js'));
    const registerDiagnostics = diagnosticsIpc.register;
    diagnosticsIpc.register = function (options) {
        const exportReport = options.logger.exportReport;
        options.logger.exportReport = function (info) {
            const status = info.nativeHelper || {};
            lastExportSnapshot = {sourceCommit: info.buildCommit, state: status.state || 'UNKNOWN',
                helperVersion: status.helperVersion || 'UNKNOWN', libmpvVersion: status.libmpvVersion || 'UNKNOWN'};
            return exportReport.apply(this, arguments);
        };
        return registerDiagnostics({...informationOptions(options), dialog: {showSaveDialog: async () => ({
            canceled: false, filePath: path.join(evidence, 'about-export-' + (++exportCount) + '.txt')
        })}});
    };
    async function measure(action) {
        const start = performance.now();
        let previous = start;
        let ticks = 0;
        let maxGapMs = 0;
        let timerDelayMs = null;
        const timerDone = new Promise(resolve => setTimeout(() => { timerDelayMs = performance.now() - start; resolve(); }, 0));
        const interval = setInterval(() => {
            const now = performance.now(); maxGapMs = Math.max(maxGapMs, now - previous); previous = now; ticks++;
        }, 1);
        try {
            const value = await action();
            const elapsedMs = performance.now() - start;
            const ticksBeforeComplete = ticks;
            await timerDone;
            return {value, elapsedMs, ticksBeforeComplete, timerDelayMs, maxGapMs};
        } finally { clearInterval(interval); }
    }
    function invoke(channel, count = 1) {
        if (sealed) return Promise.reject(new Error('about-observation-completed'));
        let timer;
        const request = application.webContents.executeJavaScript('Promise.all(Array.from({length:' + count +
            '},function(){return window.ipc.invoke(' + JSON.stringify(channel) + ')}))');
        return Promise.race([request, new Promise((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error('about-ipc-deadline')), 5000);
        })]).finally(() => clearTimeout(timer));
    }
    async function capture(name, ready) {
        const first = await measure(() => invoke(maintenanceIpc.CHANNELS.GET_INFO));
        const concurrent = await measure(() => invoke(maintenanceIpc.CHANNELS.GET_INFO, 3));
        const [copied] = await invoke(maintenanceIpc.CHANNELS.COPY_ENVIRONMENT);
        const copyMatches = copied.status === 'copied' && clipboardText === maintenance.formatEnvironmentText(copied.info);
        const [update] = await invoke(maintenanceIpc.CHANNELS.CHECK_UPDATE);
        const [exported] = await invoke(diagnosticsIpc.CHANNELS.EXPORT);
        const exportFile = exported.status === 'exported' && /^about-export-\d+\.txt$/.test(exported.fileName) ? exported.fileName : null;
        const exportText = exportFile ? await fs.promises.readFile(path.join(evidence, exportFile), 'utf8') : '';
        const snapshots = [...first.value, ...concurrent.value];
        const metrics = [first, concurrent].map(({value, ...metrics}) => metrics);
        report.stages[name] = {
            snapshots: snapshots.map(result => project(result.info)), copiedSnapshot: project(copied.info),
            snapshotVersionsMatched: snapshots.every(result => result.status === 'ok' && validInfo(result.info, expected)),
            expectedStageStateObserved: ready ? first.value[0].info.nativeHelperState === 'ready' :
                [...snapshots.map(result => result.info), copied.info].every(info => info.nativeHelperState !== 'ready'),
            copyMatches, copiedVersionMatched: validInfo(copied.info, expected), updateStatus: update.status,
            exportStatus: exported.status, exportFile, exportSourceCommitMatched: exportText.includes(expected.sourceCommit),
            exportSnapshot: lastExportSnapshot,
            exportRunningStateMatched: !!lastExportSnapshot && lastExportSnapshot.sourceCommit === expected.sourceCommit &&
                (lastExportSnapshot.state !== 'ready' || lastExportSnapshot.helperVersion === expected.helper.version &&
                    lastExportSnapshot.libmpvVersion === 'mpv ' + expected.libmpv.version) &&
                exportText.includes('Helper Instance State: ' + lastExportSnapshot.state) &&
                exportText.includes('Helper Version: ' + lastExportSnapshot.helperVersion) &&
                exportText.includes('libmpv Version: ' + lastExportSnapshot.libmpvVersion),
            metrics, responsive: metrics.every(metric => metric.ticksBeforeComplete > 0 && metric.timerDelayMs < 100 && metric.maxGapMs < 100)
        };
    }
    function startJob(name, ready) {
        if (sealed) return Promise.resolve();
        const job = capture(name, ready).catch(() => { report.errors.push(name + '-query-failed'); });
        return job;
    }
    const serviceModule = require(path.join(appRoot, 'native-helper/service.js'));
    const createService = serviceModule.createService;
    serviceModule.createService = function (options) {
        const originalLogger = options.logger;
        const service = createService({...options, logger(record) {
            if (originalLogger) originalLogger(record);
            if (record && record.event === 'helper-ready' && !readyStarted) {
                readyStarted = true;
                setImmediate(() => startJob('ready', true).finally(resolveReady));
            }
        }});
        const call = service.call;
        service.call = function () {
            if (context.getStore()) report.nativeCallsInInformationContext++;
            return call.apply(this, arguments);
        };
        return service;
    };
    electron.app.on('browser-window-created', (_event, window) => {
        window.webContents.on('did-finish-load', () => {
            if (application) return;
            let actual;
            try { actual = require('node:url').fileURLToPath(window.webContents.getURL()); } catch (_) { return; }
            if (path.resolve(actual).toLowerCase() !== path.resolve(expectedIndex).toLowerCase()) return;
            application = window;
            startJob('initial', false).finally(resolveInitial);
        });
    });
    observation = {
        initialDone,
        async complete() {
            const requiresReady = process.env.ETE_TEST_NORMAL_CLOSE !== 'idle';
            const finished = await waitWithDeadline(Promise.all([initialDone, requiresReady ? readyDone : Promise.resolve()]), 15000);
            sealed = true;
            if (!finished) report.errors.push('query-deadline');
            const stages = Object.values(report.stages);
            const passed = stages.length === (requiresReady ? 2 : 1) && !report.errors.length &&
                report.helperStartsInInformationContext === 0 && report.nativeCallsInInformationContext === 0 &&
                stages.every(stage => stage.snapshotVersionsMatched && stage.expectedStageStateObserved && stage.copyMatches && stage.copiedVersionMatched &&
                    stage.responsive && stage.updateStatus === 'latest' && stage.exportStatus === 'exported' &&
                    stage.exportSourceCommitMatched && stage.exportRunningStateMatched);
            report.updateFixtureRequests = updateRequests;
            report.status = passed ? 'PASS' : 'FAIL';
            const snapshot = JSON.parse(JSON.stringify(report));
            fs.writeFileSync(path.join(evidence, 'about-async-ipc.json'), JSON.stringify(snapshot, null, 2) + '\n');
            return snapshot;
        }
    };
    return observation;
}

module.exports = {install, current: () => observation, project, validInfo, waitWithDeadline};
