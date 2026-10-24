'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {normalize, stages, checks, expectedVersion, expectedHash} = require('../prototypes/fn-connect/client/smoke-report.cjs');
const meta = {sourceCommit: 'a'.repeat(40), archiveHash: expectedHash, launchState: 'COMPLETED', exitCode: 0, processExited: true, profileCleanupVerified: true};
const event = value => 'ETE_FN_FIXTURE ' + JSON.stringify(value);
function evidence() {
    return [{kind: 'runtime', electronVersion: expectedVersion}, ...stages.map(stage => ({kind: 'stage', stage})),
        {kind: 'result', test: 'electron-synthetic-session', result: 'PASSED', profileCleanupOwner: 'runner', temporaryProfileRemoved: false,
            checks: {...Object.fromEntries(checks.map(key => [key, true])), realFNConnect: 'NOT_TESTED', nativeHelperPlayback: 'NOT_TESTED', hlsDash: 'NOT_SUPPORTED'}}];
}
const raw = events => events.map(event).join('\n');

test('only complete hash-bound, version-bound, drained synthetic evidence passes', () => {
    const result = normalize(raw(evidence()), meta);
    assert.equal(result.result, 'PASSED');
    assert.equal(result.realFNConnect, 'NOT_TESTED');
    assert.equal(result.electron.hashVerified, true);
    for (const change of [{archiveHash: '0'.repeat(64)}, {launchState: 'TIMEOUT'}, {exitCode: 3}, {sourceCommit: 'unknown'},
        {processExited: false}, {profileCleanupVerified: false}]) {
        assert.equal(normalize(raw(evidence()), {...meta, ...change}).result, 'FAILED');
    }
});

test('missing phases, duplicate results, missing checks and a real-NAS claim cannot pass', () => {
    const events = evidence();
    assert.equal(normalize(raw(events.filter(e => e.stage !== 'DRAINED')), meta).result, 'FAILED');
    assert.equal(normalize(raw([...events, events.at(-1)]), meta).result, 'FAILED');
    delete events.at(-1).checks.websocketSessionCookie;
    assert.equal(normalize(raw(events), meta).result, 'FAILED');
    events.at(-1).checks.websocketSessionCookie = true;
    events.at(-1).checks.realFNConnect = 'PASSED';
    assert.equal(normalize(raw(events), meta).result, 'FAILED');
});

test('normalization never copies raw diagnostics, extra fields, untrusted stages or arbitrary reasons', () => {
    const secret = 'PRIVATE_DIAGNOSTIC_CANARY';
    const events = evidence();
    events.unshift({kind: 'stage', stage: secret, cookie: secret});
    events.unshift({kind: 'diagnostic', event: 'REQUEST_ERROR', requestId: 1, errorCode: secret, cookie: secret, url: secret});
    events.unshift({kind: 'diagnostic', event: secret, message: secret});
    events.at(-1).result = 'FAILED'; events.at(-1).reason = secret; events.at(-1).private = secret;
    const result = normalize(secret + '\n' + raw(events), meta);
    assert.equal(JSON.stringify(result).includes(secret), false);
    assert.equal(result.reason, 'EVIDENCE_INCOMPLETE');
    assert.equal(result.result, 'FAILED');
});
