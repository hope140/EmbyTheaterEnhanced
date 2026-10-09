'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {validateText, validateLogFile, validateP1Diagnostics} = require('../tools/verify-p1-diagnostics.cjs');

function record(category, event, details) {
    return JSON.stringify({schemaVersion: 1, timestamp: '2026-10-09T12:00:00.000Z', level: 'info', category, event, details});
}

function completeFixture(sourceCommit = 'a'.repeat(40)) {
    const requestId = 'play-7-1';
    const nativeDetails = {helperRun: 2, generationId: 1, currentGenerationId: 1, requestId, association: 'available'};
    const rows = [
        record('app', 'start', {buildCommit: sourceCommit}),
        record('native-helper', 'generation-begin', {...nativeDetails, disposition: 'BEGIN_GENERATION'}),
        record('native-helper', 'start-file', {...nativeDetails, disposition: 'ACCEPT'}),
        record('native-helper', 'file-loaded', {...nativeDetails, disposition: 'ACCEPT'}),
        record('native-helper', 'end-file', {...nativeDetails, disposition: 'ACCEPT', endReason: 0}),
        record('native-helper', 'generation-retired', {...nativeDetails, currentGenerationId: null, disposition: 'RETIRE_GENERATION'}),
        record('native-helper', 'surface-hidden', {visible: false, disposition: 'hidden', reason: 'stop'}),
        ...['global-error', 'unhandled-rejection'].map(event => record('renderer', event, {
            errorType: 'ReferenceError',
            messageKind: 'reference-not-defined',
            location: event === 'global-error'
                ? {script: 'plugins/libmpv.js', line: 123, column: 4}
                : {script: 'UNAVAILABLE', line: null, column: null},
            frames: [
                {script: 'plugins/libmpv.js', line: 123, column: 4},
                {script: 'UNAVAILABLE', line: null, column: null}
            ]
        }))
    ];
    return rows.join('\n') + '\n';
}

test('valid synthetic runtime log passes with safe renderer frames and linked native lifecycle', () => {
    const result = validateText(completeFixture(), 'a'.repeat(40));
    assert.equal(result.status, 'PASS');
    assert.equal(result.rawCanaryAbsent, true);
    assert.equal(result.accurateRequestAssociations, 3);
    assert.deepEqual(result.safeRendererFrameCounts, {globalError: 1, unhandledRejection: 1});
    assert.equal(result.realFirstFrameVerified, false);
});

test('documented stale lifecycle dispositions may lack identity while accepted playback evidence remains required', () => {
    const staleRows = [
        record('native-helper', 'start-file', {helperRun: null, generationId: null, requestId: 'UNAVAILABLE', association: 'UNAVAILABLE', disposition: 'DROP_UNATTRIBUTED'}),
        record('native-helper', 'end-file', {helperRun: null, generationId: null, requestId: 'UNAVAILABLE', association: 'UNAVAILABLE', disposition: 'DROP_STALE_HELPER'})
    ];
    const result = validateText(completeFixture() + staleRows.join('\n') + '\n', 'a'.repeat(40));
    assert.equal(result.status, 'PASS');
    assert.equal(result.eventCounts['native-helper/start-file'], 2);
    assert.equal(result.eventCounts['native-helper/end-file'], 2);

    const missingAcceptedFileLoaded = completeFixture()
        .replace(record('native-helper', 'file-loaded', {helperRun: 2, generationId: 1, currentGenerationId: 1, requestId: 'play-7-1', association: 'available', disposition: 'ACCEPT'}),
            record('native-helper', 'file-loaded', {helperRun: null, generationId: null, requestId: 'UNAVAILABLE', association: 'UNAVAILABLE', disposition: 'DROP_UNATTRIBUTED'}));
    const failed = validateText(missingAcceptedFileLoaded, 'a'.repeat(40));
    assert.equal(failed.status, 'FAIL');
    assert.ok(failed.failureCodes.includes('NO_ACCURATE_ACCEPTED_FILE_LOADED_ASSOCIATION'));
});

test('app start build commit must match the runtime provenance source commit', () => {
    const result = validateText(completeFixture('b'.repeat(40)), 'a'.repeat(40));
    assert.equal(result.status, 'FAIL');
    assert.ok(result.failureCodes.includes('APP_START_BUILD_COMMIT_MISMATCH'));
});

test('missing log is unavailable and missing events fail', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-p1-validator-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    assert.equal(validateLogFile(path.join(root, 'missing.jsonl')).status, 'UNAVAILABLE');

    const result = validateText(record('app', 'start', {}));
    assert.equal(result.status, 'FAIL');
    assert.ok(result.failureCodes.includes('MISSING_NATIVE_GENERATION_BEGIN'));
    assert.ok(result.failureCodes.includes('MISSING_RENDERER_GLOBAL_ERROR'));
});

test('malformed JSONL rows are counted and prevent a pass', () => {
    const result = validateText(completeFixture() + '{malformed-json}\n');
    assert.equal(result.status, 'FAIL');
    assert.equal(result.malformedLines, 1);
    assert.ok(result.failureCodes.includes('MALFORMED_JSONL_LINES'));
});

test('validator rejects absolute or traversal script locations even without a known canary', () => {
    for (const script of ['/private/account.js', '../private/account.js']) {
        const rows = completeFixture().trim().split('\n').map(line => JSON.parse(line));
        for (const row of rows.filter(record => record.category === 'renderer')) {
            row.details.frames.push({script, line: 10, column: 1});
        }
        assert.equal(validateText(rows.map(row => JSON.stringify(row)).join('\n')).status, 'FAIL');
    }
});

test('raw canary in any log row prevents a pass', () => {
    const result = validateText(completeFixture() + record('renderer', 'debug', {message: 'P1_PRIVATE_CANARY'}) + '\n');
    assert.equal(result.status, 'FAIL');
    assert.equal(result.rawCanaryAbsent, false);
    assert.ok(result.failureCodes.includes('RAW_CANARY_PRESENT'));
});

test('CLI validation requires matching provenance, log commit, and complete isolation marker', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-p1-cli-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const runtime = path.join(root, 'runtime');
    const evidence = path.join(root, 'evidence');
    const log = path.join(evidence, 'appdata', 'EmbyTheaterEnhanced', 'logs', 'ete-client.jsonl');
    fs.mkdirSync(path.dirname(log), {recursive: true});
    fs.mkdirSync(runtime, {recursive: true});
    fs.writeFileSync(path.join(runtime, 'runtime-provenance.json'), JSON.stringify({sourceCommit: 'a'.repeat(40)}));
    fs.writeFileSync(log, completeFixture('a'.repeat(40)));
    fs.writeFileSync(path.join(evidence, 'p1-diagnostics-injection.json'), JSON.stringify({
        applicationDocumentMatched: true,
        applicationWindowInjected: true,
        auxiliaryWindowInjected: false,
        errorEventDispatched: true,
        promiseRejectionEventDispatched: true,
        appDataIsolated: true,
        userDataIsolated: true,
        aboutVersionMatched: true,
        aboutSourceCommitMatched: true
    }));
    assert.equal(validateP1Diagnostics(runtime, evidence).status, 'PASS');

    const markerPath = path.join(evidence, 'p1-diagnostics-injection.json');
    fs.writeFileSync(markerPath, JSON.stringify({applicationDocumentMatched: true, applicationWindowInjected: true, auxiliaryWindowInjected: true}));
    const invalidMarker = validateP1Diagnostics(runtime, evidence);
    assert.equal(invalidMarker.status, 'FAIL');
    assert.equal(invalidMarker.injectionMarkerValid, false);
    assert.ok(invalidMarker.failureCodes.includes('INJECTION_MARKER_INCOMPLETE'));
});
