'use strict';

const {buildPipelineSessionChecks} = require('./pipeline-browser.js');
const NEXT_CHECKS = ['selected','overlapEstablished','staleMetadataIgnored','exactPendingCancelled','priorStopped',
    'nextStarted','rapidNextSettled','rapidNewestLoaded','serialSelected','serialPriorStopped','serialSourceLoaded','serialSessionPreserved'];
const PLAYER_CHECKS = ['paused','sought','resumed','itemSidecarPreserved','sourcePreserved',
    'mountSourceUsed','mountCandidateExists','sessionPreserved','hasStart','hasProgress','hasStop',
    'pauseReported','seekReported','enhancedCategoryPresent','enhancedStatsMatch'];
const GENERATION_CHECKS = ['firstSuperseded','secondPlayed','oldCoreListenerIgnored',
    'stopSuperseded','stopPreventedLateLoad','exactStopPendingCancelled','noUnhandledRejection'];
const allTrue = (record, names) => !!record && names.every(name => record[name] === true);

const SESSION_GROUPS = {ordinary:1,strm:1,queue:3};
const SESSION_ZERO_CHECKS = ['pendingStopped','unmatchedStopped','incompleteStarted','incompleteStopped',
    'duplicateStarted','duplicateStopped','unpairedStarted','unpairedStopped','mismatchedStopped'];
const SESSION_TRUE_CHECKS = ['startedStoppedOneToOne','ordinaryStartedStopped','strmStartedStopped',
    'queueStartedStopped','requiredStartedStopped','passed'];

function sessionChecksPassed(pipeline) {
    const actual = pipeline && pipeline.sessionChecks;
    if (!actual || !Array.isArray(pipeline.records) || typeof buildPipelineSessionChecks !== 'function') return false;
    if (!actual.requiredItems || typeof actual.requiredItems !== 'object') return false;
    for (const [name, expectedLength] of Object.entries(SESSION_GROUPS)) {
        if (!Array.isArray(actual.requiredItems[name]) || actual.requiredItems[name].length !== expectedLength) return false;
    }
    if (SESSION_ZERO_CHECKS.some(name => actual[name] !== 0) || SESSION_TRUE_CHECKS.some(name => actual[name] !== true)) return false;
    const derived = buildPipelineSessionChecks(pipeline.records, actual.requiredItems);
    return JSON.stringify(actual) === JSON.stringify(derived);
}

// Independently bind renderer claims to the main fake service's terminal receipts.
// Cleanup is not cancellation; both gates must identify distinct, actually held requests.
function validCancelGate(pending, cancelled, label, snapshot) {
    if (!pending || !cancelled || pending.pending !== true || pending.held !== true ||
        cancelled.cancelled !== true || pending.requestId !== cancelled.requestId || pending.armId !== cancelled.armId) return false;
    const request = snapshot.requests.find(value => value.requestId === pending.requestId && value.armId === pending.armId);
    if (!request || request.status !== 'cancelled') return false;
    return snapshot.events.some(value => value.event === 'pending-gate-opened' && value.label === label && value.requestId === pending.requestId && value.armId === pending.armId) &&
        snapshot.events.some(value => value.event === 'resolve-cancelled' && value.label === label && value.requestId === pending.requestId && value.armId === pending.armId);
}

function pipelinePassed(pipeline, mode, snapshot) {
    if (!pipeline || !sessionChecksPassed(pipeline) || !allTrue(pipeline.next, NEXT_CHECKS) || !Array.isArray(pipeline.results) ||
        pipeline.results.length !== 2 || !['video','strm'].every(kind => pipeline.results.filter(result => result.kind === kind).length === 1) ||
        !pipeline.results.every(result => result.playerId === 'libmpvmediaplayer' && allTrue(result, PLAYER_CHECKS))) return false;
    if (mode !== 'hit' && mode !== 'direct') return pipeline.generation === null;
    if (!allTrue(pipeline.generation, GENERATION_CHECKS) || !snapshot || snapshot.cancelCount < 2 ||
        snapshot.activeCount !== 0 || snapshot.gateWaiterCount !== 0 || !Array.isArray(snapshot.requests) || !Array.isArray(snapshot.events)) return false;
    const gates = pipeline.gateEvidence || {};
    const observer = pipeline.generation.observer;
    const stop = observer && Array.isArray(observer.fixtures) && observer.fixtures.find(value => value.fixtureId === 'fixtureStop#1-play');
    if (!stop || !gates.stopPending || stop.cd2RequestId !== gates.stopPending.requestId ||
        stop.cd2PendingAtGate !== true || stop.cd2CancelSent !== true) return false;
    return validCancelGate(gates.rapidPending, gates.rapidCancelled, 'rapid-next', snapshot) &&
        validCancelGate(gates.stopPending, gates.stopCancelled, 'stop-before-load', snapshot) &&
        gates.rapidPending.requestId !== gates.stopPending.requestId;
}

module.exports = {pipelinePassed, sessionChecksPassed, buildPipelineSessionChecks,
    NEXT_CHECKS, PLAYER_CHECKS, GENERATION_CHECKS};
