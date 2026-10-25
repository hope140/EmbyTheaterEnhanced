'use strict';

const {createRecorder} = require('./bounded-diagnostics');
const crypto = require('node:crypto');
const EVENTS = new Set(['generation-begin', 'generation-retired', 'start-file', 'file-loaded', 'core-playing', 'end-file',
    'presentation-prepare', 'presentation-arm', 'presentation-clear', 'surface-hidden']);
const DISPOSITIONS = new Set(['BEGIN_GENERATION', 'RETIRE_GENERATION', 'ACCEPT', 'DROP_STALE_GENERATION',
    'DROP_STALE_HELPER', 'DROP_TRANSPORT_TERMINAL', 'DROP_UNATTRIBUTED', 'requested', 'ready', 'unavailable', 'stale', 'cleared', 'hidden']);
const REASONS = new Set(['superseded', 'stop', 'destroy', 'renderer-destroy', 'service-destroy', 'retired',
    'minimize', 'hide', 'renderer-visibility', 'renderer-notify-visibility', 'media-error', 'load-failed',
    'helper-terminal', 'presentation-cancelled', 'maximize', 'unmaximize', 'restore', 'enter-full-screen',
    'leave-full-screen', 'show', 'focus', 'upper-play-invalidated']);
function id(value) { return Number.isSafeInteger(value) && value > 0 ? value : null; }
function mpvErrorCode(value) { return Number.isInteger(value) && value >= -2147483648 && value <= 2147483647 ? value : null; }

function createNativeDiagnostics(logger, options) {
    const emit = createRecorder(logger, 'native-helper', 120, options);
    const requests = new Map();
    // Private, memory-only key: references are comparable only within this service
    // lifetime, never across users/restarts. Do not use the stable path/ID hashes.
    let identityKey;
    function mediaReferences(identity) {
        const result = {itemRef: 'UNAVAILABLE', mediaSourceRef: 'UNAVAILABLE'};
        if (!identity || typeof identity !== 'object') return result;
        const valid = value => typeof value === 'string' && value.length > 0 && value.length <= 512;
        if (!valid(identity.serverId) || !valid(identity.itemId)) return result;
        if (!identityKey) identityKey = crypto.randomBytes(32);
        const reference = parts => 'anon-' + crypto.createHmac('sha256', identityKey)
            .update(JSON.stringify(parts)).digest('hex').slice(0, 32);
        result.itemRef = reference(['item', identity.serverId, identity.itemId]);
        if (valid(identity.mediaSourceId)) result.mediaSourceRef = reference(['media-source', identity.serverId, identity.itemId, identity.mediaSourceId]);
        return result;
    }
    return function observe(input) {
        try {
            if (!input || !EVENTS.has(input.name) || !DISPOSITIONS.has(input.disposition)) return;
            const helperRun = id(input.helperRun);
            const generationId = id(input.generationId);
            const key = helperRun + ':' + generationId;
            if (input.name === 'generation-begin' && helperRun && generationId) {
                const label = typeof input.label === 'string' && input.label.length <= 64 &&
                    /^play-(?:[1-9][0-9]*|local)-[1-9][0-9]*$/.test(input.label) ? input.label : 'UNAVAILABLE';
                requests.set(key, {requestId: label, ...mediaReferences(input.diagnosticIdentity), playbackPhase: 'loading'});
                if (requests.size > 64) requests.delete(requests.keys().next().value);
            }
            const request = input.disposition === 'DROP_STALE_HELPER' ? null : requests.get(key);
            if (request && input.name === 'core-playing' && input.disposition === 'ACCEPT') request.playbackPhase = 'playing';
            const requestId = request ? request.requestId : 'UNAVAILABLE';
            const details = {helperRun, generationId, currentGenerationId: id(input.currentGenerationId),
                requestId, association: requestId === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'available',
                itemRef: request ? request.itemRef : 'UNAVAILABLE',
                mediaSourceRef: request ? request.mediaSourceRef : 'UNAVAILABLE',
                playbackPhase: request ? request.playbackPhase : 'UNAVAILABLE',
                disposition: input.disposition};
            if (input.reason !== undefined) details.reason = REASONS.has(input.reason) ? input.reason : 'UNAVAILABLE';
            if (input.name === 'end-file') {
                details.endReason = Number.isInteger(input.endReason) && input.endReason >= 0 && input.endReason <= 5 ? input.endReason : null;
                details.mpvErrorCode = mpvErrorCode(input.mpvErrorCode);
            }
            if (input.name.startsWith('presentation-')) {
                details.transitionId = id(input.transitionId);
                details.sourceGenerationId = id(input.sourceGenerationId);
            }
            if (input.name === 'surface-hidden') details.visible = false;
            emit(input.name, details);
        } catch (_) { /* Projection and association are optional. */ }
    };
}

module.exports = {createNativeDiagnostics, mpvErrorCode};
