'use strict';

const {createRecorder} = require('./bounded-diagnostics');
const EVENTS = new Set(['generation-begin', 'generation-retired', 'start-file', 'file-loaded', 'end-file',
    'presentation-prepare', 'presentation-arm', 'presentation-clear', 'surface-hidden']);
const DISPOSITIONS = new Set(['BEGIN_GENERATION', 'RETIRE_GENERATION', 'ACCEPT', 'DROP_STALE_GENERATION',
    'DROP_STALE_HELPER', 'DROP_TRANSPORT_TERMINAL', 'DROP_UNATTRIBUTED', 'requested', 'ready', 'unavailable', 'stale', 'cleared', 'hidden']);
const REASONS = new Set(['superseded', 'stop', 'destroy', 'renderer-destroy', 'service-destroy', 'retired',
    'minimize', 'hide', 'renderer-visibility', 'renderer-notify-visibility', 'media-error', 'load-failed',
    'helper-terminal', 'presentation-cancelled', 'maximize', 'unmaximize', 'restore', 'enter-full-screen',
    'leave-full-screen', 'show', 'focus']);
function id(value) { return Number.isSafeInteger(value) && value > 0 ? value : null; }

function createNativeDiagnostics(logger, options) {
    const emit = createRecorder(logger, 'native-helper', 120, options);
    const requests = new Map();
    return function observe(input) {
        try {
            if (!input || !EVENTS.has(input.name) || !DISPOSITIONS.has(input.disposition)) return;
            const helperRun = id(input.helperRun);
            const generationId = id(input.generationId);
            const key = helperRun + ':' + generationId;
            if (input.name === 'generation-begin' && helperRun && generationId) {
                const label = typeof input.label === 'string' && input.label.length <= 64 &&
                    /^play-(?:[1-9][0-9]*|local)-[1-9][0-9]*$/.test(input.label) ? input.label : 'UNAVAILABLE';
                requests.set(key, label);
                if (requests.size > 64) requests.delete(requests.keys().next().value);
            }
            const requestId = input.disposition === 'DROP_STALE_HELPER' ? 'UNAVAILABLE' : requests.get(key) || 'UNAVAILABLE';
            const details = {helperRun, generationId, currentGenerationId: id(input.currentGenerationId),
                requestId, association: requestId === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'available',
                disposition: input.disposition};
            if (input.reason !== undefined) details.reason = REASONS.has(input.reason) ? input.reason : 'UNAVAILABLE';
            if (input.name === 'end-file') details.endReason = Number.isInteger(input.endReason) && input.endReason >= 0 && input.endReason <= 5 ? input.endReason : null;
            if (input.name.startsWith('presentation-')) {
                details.transitionId = id(input.transitionId);
                details.sourceGenerationId = id(input.sourceGenerationId);
            }
            if (input.name === 'surface-hidden') details.visible = false;
            emit(input.name, details);
        } catch (_) { /* Projection and association are optional. */ }
    };
}

module.exports = {createNativeDiagnostics};
