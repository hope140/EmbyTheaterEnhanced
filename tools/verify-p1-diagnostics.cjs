'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MAX_LOG_BYTES = 2 * 1024 * 1024;
const MAX_LINES = 4096;
const CANARY = 'P1_PRIVATE_CANARY';
const NATIVE_EVENTS = [
    'generation-begin', 'generation-retired', 'start-file', 'file-loaded', 'end-file', 'surface-hidden'
];
const RENDERER_EVENTS = ['global-error', 'unhandled-rejection'];
const REQUEST_ID_PATTERN = /^play-(?:[1-9][0-9]*|local)-[1-9][0-9]*$/;
const SAFE_SCRIPT_PATTERN = /^[A-Za-z0-9_./-]+\.(?:js|cjs)$/;

function emptyCounts() {
    const counts = Object.create(null);
    for (const event of NATIVE_EVENTS) counts[`native-helper/${event}`] = 0;
    for (const event of RENDERER_EVENTS) counts[`renderer/${event}`] = 0;
    return counts;
}

function baseResult(status, failureCodes) {
    return {
        schemaVersion: 1,
        status,
        failureCodes,
        totalLines: 0,
        validRecords: 0,
        malformedLines: 0,
        eventCounts: emptyCounts(),
        accurateRequestAssociations: 0,
        safeRendererFrameCounts: {globalError: 0, unhandledRejection: 0},
        rawCanaryAbsent: false,
        sourceCommitMatched: false,
        injectionMarkerValid: false,
        realFirstFrameVerified: false,
        realFirstFrameStatus: 'NOT_VERIFIED'
    };
}

function isSafePosition(value) {
    return Number.isSafeInteger(value) && value > 0 && value <= 10000000;
}

function safeFrame(frame) {
    if (!frame || typeof frame !== 'object' || Array.isArray(frame)) return false;
    if (frame.script === 'UNAVAILABLE') return frame.line === null && frame.column === null;
    return typeof frame.script === 'string' && frame.script.length <= 240 && !frame.script.startsWith('/') &&
        !frame.script.split('/').some(part => part === '..' || part === '.') && SAFE_SCRIPT_PATTERN.test(frame.script) &&
        isSafePosition(frame.line) && isSafePosition(frame.column);
}

function hasExpectedPackageFrame(details, expectedLocation) {
    const location = details && details.location;
    const frames = details && details.frames;
    if (!location) return false;
    if (expectedLocation) {
        if (location.script !== 'plugins/libmpv.js' || location.line !== 123 || location.column !== 4) return false;
    } else if (location.script !== 'UNAVAILABLE' || location.line !== null || location.column !== null) {
        return false;
    }
    if (!Array.isArray(frames) || frames.length < 1 || frames.length > 8 || !frames.every(safeFrame)) return false;
    return frames.some(frame => frame.script === 'plugins/libmpv.js' && frame.line === 123 && frame.column === 4);
}

function positiveSafeInteger(value) {
    return Number.isSafeInteger(value) && value > 0;
}

function recordDetails(record) {
    return record && record.details && typeof record.details === 'object' && !Array.isArray(record.details)
        ? record.details : null;
}

function validateText(text, expectedSourceCommit) {
    const result = baseResult('FAIL', []);
    result.rawCanaryAbsent = !text.includes(CANARY);
    if (!result.rawCanaryAbsent) result.failureCodes.push('RAW_CANARY_PRESENT');

    const lines = text.split(/\r?\n/).filter(line => line.trim());
    result.totalLines = lines.length;
    if (lines.length > MAX_LINES) {
        result.failureCodes.push('LOG_LINE_LIMIT_EXCEEDED');
        lines.length = MAX_LINES;
    }
    const records = [];
    for (const line of lines) {
        try {
            const record = JSON.parse(line);
            if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('invalid-record');
            records.push(record);
        } catch (_) {
            result.malformedLines++;
        }
    }
    result.validRecords = records.length;
    if (result.malformedLines) result.failureCodes.push('MALFORMED_JSONL_LINES');

    const appStart = records.find(record => record.category === 'app' && record.event === 'start');
    const appStartDetails = recordDetails(appStart);
    const buildCommit = appStartDetails && appStartDetails.buildCommit;
    if (typeof buildCommit !== 'string' || !/^[0-9a-f]{40}$/i.test(buildCommit)) {
        result.failureCodes.push('APP_START_BUILD_COMMIT_MISSING_OR_INVALID');
    } else if (expectedSourceCommit !== undefined) {
        if (typeof expectedSourceCommit !== 'string' || !/^[0-9a-f]{40}$/i.test(expectedSourceCommit)) {
            result.failureCodes.push('EXPECTED_SOURCE_COMMIT_INVALID');
        } else if (buildCommit.toLowerCase() !== expectedSourceCommit.toLowerCase()) {
            result.failureCodes.push('APP_START_BUILD_COMMIT_MISMATCH');
        } else {
            result.sourceCommitMatched = true;
        }
    } else {
        result.sourceCommitMatched = true;
    }

    const nativeRecords = [];
    const rendererRecords = {globalError: [], unhandledRejection: []};
    for (const record of records) {
        const category = record.category;
        const event = record.event;
        const details = recordDetails(record);
        if (category === 'native-helper' && NATIVE_EVENTS.includes(event)) {
            result.eventCounts[`native-helper/${event}`]++;
            nativeRecords.push({event, details});
        }
        if (category === 'renderer' && RENDERER_EVENTS.includes(event)) {
            result.eventCounts[`renderer/${event}`]++;
            const key = event === 'global-error' ? 'globalError' : 'unhandledRejection';
            rendererRecords[key].push(details);
        }
    }

    for (const required of NATIVE_EVENTS) {
        if (result.eventCounts[`native-helper/${required}`] === 0) result.failureCodes.push(`MISSING_NATIVE_${required.toUpperCase().replace(/-/g, '_')}`);
    }
    for (const required of RENDERER_EVENTS) {
        if (result.eventCounts[`renderer/${required}`] === 0) result.failureCodes.push(`MISSING_RENDERER_${required.toUpperCase().replace(/-/g, '_')}`);
    }

    const expectedDispositions = {
        'generation-begin': new Set(['BEGIN_GENERATION']),
        'generation-retired': new Set(['RETIRE_GENERATION']),
        'start-file': new Set(['ACCEPT', 'DROP_STALE_GENERATION', 'DROP_STALE_HELPER', 'DROP_TRANSPORT_TERMINAL', 'DROP_UNATTRIBUTED']),
        'file-loaded': new Set(['ACCEPT', 'DROP_STALE_GENERATION', 'DROP_STALE_HELPER', 'DROP_TRANSPORT_TERMINAL', 'DROP_UNATTRIBUTED']),
        'end-file': new Set(['ACCEPT', 'DROP_STALE_GENERATION', 'DROP_STALE_HELPER', 'DROP_TRANSPORT_TERMINAL', 'DROP_UNATTRIBUTED']),
        'surface-hidden': new Set(['hidden'])
    };
    const beginRequests = new Map();
    for (const {event, details} of nativeRecords) {
        if (!details || !expectedDispositions[event].has(details.disposition)) {
            result.failureCodes.push(`INVALID_NATIVE_${event.toUpperCase().replace(/-/g, '_')}`);
            continue;
        }
        if (event === 'surface-hidden') {
            if (details.visible !== false) result.failureCodes.push('INVALID_NATIVE_SURFACE_HIDDEN');
            continue;
        }
        if (event !== 'surface-hidden' && details.disposition.startsWith('DROP_')) continue;
        if (!positiveSafeInteger(details.helperRun) || !positiveSafeInteger(details.generationId)) {
            result.failureCodes.push(`INVALID_NATIVE_${event.toUpperCase().replace(/-/g, '_')}_IDENTITY`);
            continue;
        }
        if (event === 'generation-begin' && details.association === 'available' &&
            typeof details.requestId === 'string' && REQUEST_ID_PATTERN.test(details.requestId)) {
            beginRequests.set(`${details.helperRun}:${details.generationId}`, details.requestId);
        }
    }
    for (const {event, details} of nativeRecords) {
        if (!details || event === 'surface-hidden' || event === 'generation-begin' || details.disposition !== 'ACCEPT') continue;
        const expectedRequest = positiveSafeInteger(details.helperRun) && positiveSafeInteger(details.generationId)
            ? beginRequests.get(`${details.helperRun}:${details.generationId}`) : null;
        if (expectedRequest && details.association === 'available' && details.requestId === expectedRequest) {
            result.accurateRequestAssociations++;
        }
    }
    if (!nativeRecords.some(({event, details}) => event === 'start-file' && details && details.disposition === 'ACCEPT' &&
        positiveSafeInteger(details.helperRun) && positiveSafeInteger(details.generationId) &&
        beginRequests.get(`${details.helperRun}:${details.generationId}`) === details.requestId && details.association === 'available')) {
        result.failureCodes.push('NO_ACCURATE_ACCEPTED_START_FILE_ASSOCIATION');
    }
    if (!nativeRecords.some(({event, details}) => event === 'file-loaded' && details && details.disposition === 'ACCEPT' &&
        positiveSafeInteger(details.helperRun) && positiveSafeInteger(details.generationId) &&
        beginRequests.get(`${details.helperRun}:${details.generationId}`) === details.requestId && details.association === 'available')) {
        result.failureCodes.push('NO_ACCURATE_ACCEPTED_FILE_LOADED_ASSOCIATION');
    }
    if (result.accurateRequestAssociations === 0) result.failureCodes.push('NO_ACCURATE_REQUEST_ASSOCIATION');

    for (const [key, label] of [['globalError', 'global-error'], ['unhandledRejection', 'unhandled-rejection']]) {
        const detailsList = rendererRecords[key];
        const valid = detailsList.filter(details => {
            return details && ['Error', 'ReferenceError', 'TypeError', 'SyntaxError', 'RangeError', 'URIError', 'EvalError', 'AggregateError'].includes(details.errorType) &&
                ['reference-not-defined', 'type-error', 'syntax-error', 'UNAVAILABLE'].includes(details.messageKind) &&
                hasExpectedPackageFrame(details, key === 'globalError');
        });
        result.safeRendererFrameCounts[key] = valid.length;
        if (valid.length === 0) result.failureCodes.push(`NO_SAFE_RENDERER_FRAME_${label.toUpperCase().replace(/-/g, '_')}`);
    }

    result.failureCodes = Array.from(new Set(result.failureCodes));
    result.status = result.failureCodes.length === 0 ? 'PASS' : 'FAIL';
    return result;
}

function validateLogFile(logPath, expectedSourceCommit) {
    try {
        const stat = fs.statSync(logPath);
        if (!stat.isFile()) return baseResult('UNAVAILABLE', ['CLIENT_LOG_NOT_FILE']);
        if (stat.size > MAX_LOG_BYTES) return baseResult('UNAVAILABLE', ['CLIENT_LOG_TOO_LARGE']);
        return validateText(fs.readFileSync(logPath, 'utf8'), expectedSourceCommit);
    } catch (error) {
        return baseResult('UNAVAILABLE', [error && error.code === 'ENOENT' ? 'CLIENT_LOG_MISSING' : 'CLIENT_LOG_UNREADABLE']);
    }
}

function readRuntimeSourceCommit(runtimeRoot) {
    try {
        const manifest = JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'runtime-provenance.json'), 'utf8'));
        const commit = manifest && manifest.sourceCommit;
        return typeof commit === 'string' && /^[0-9a-f]{40}$/i.test(commit) ? commit.toLowerCase() : null;
    } catch (_) {
        return null;
    }
}

function validateInjectionMarker(evidenceRoot) {
    try {
        const marker = JSON.parse(fs.readFileSync(path.join(evidenceRoot, 'p1-diagnostics-injection.json'), 'utf8'));
        const valid = marker.applicationDocumentMatched === true && marker.applicationWindowInjected === true &&
            marker.auxiliaryWindowInjected === false && marker.errorEventDispatched === true &&
            marker.promiseRejectionEventDispatched === true && marker.appDataIsolated === true && marker.userDataIsolated === true &&
            marker.aboutVersionMatched === true && marker.aboutSourceCommitMatched === true;
        return {valid, code: valid ? null : 'INJECTION_MARKER_INCOMPLETE'};
    } catch (error) {
        return {valid: false, code: error && error.code === 'ENOENT' ? 'INJECTION_MARKER_MISSING' : 'INJECTION_MARKER_INVALID'};
    }
}

function validateP1Diagnostics(runtimeRoot, evidenceRoot) {
    const sourceCommit = readRuntimeSourceCommit(runtimeRoot);
    if (!sourceCommit) return baseResult('UNAVAILABLE', ['RUNTIME_SOURCE_COMMIT_UNAVAILABLE']);
    const logPath = path.join(evidenceRoot, 'appdata', 'EmbyTheaterEnhanced', 'logs', 'ete-client.jsonl');
    const result = validateLogFile(logPath, sourceCommit);
    const marker = validateInjectionMarker(evidenceRoot);
    result.injectionMarkerValid = marker.valid;
    if (!marker.valid) result.failureCodes.push(marker.code);
    result.failureCodes = Array.from(new Set(result.failureCodes));
    if (result.failureCodes.length) result.status = 'FAIL';
    return result;
}

function main(runtimeArgument, evidenceArgument) {
    if (!runtimeArgument || !evidenceArgument) {
        process.stderr.write('Usage: node verify-p1-diagnostics.cjs <runtime> <evidence>\n');
        return 2;
    }
    const runtime = path.resolve(runtimeArgument);
    const evidence = path.resolve(evidenceArgument);
    const result = validateP1Diagnostics(runtime, evidence);
    try {
        fs.writeFileSync(path.join(evidence, 'p1-diagnostics-result.json'), JSON.stringify(result, null, 2) + '\n', 'utf8');
    } catch (error) {
        process.stderr.write(`Unable to write P1 diagnostics result: ${error.code || 'write-error'}\n`);
        return 2;
    }
    process.stdout.write(JSON.stringify(result) + '\n');
    return result.status === 'PASS' ? 0 : 1;
}

if (require.main === module) process.exitCode = main(process.argv[2], process.argv[3]);

module.exports = {validateText, validateLogFile, readRuntimeSourceCommit, validateInjectionMarker, validateP1Diagnostics};
