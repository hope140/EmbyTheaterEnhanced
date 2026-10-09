'use strict';

const {performance} = require('node:perf_hooks');

const MAX_DURATION_MS = 180000;
const STAGES = Object.freeze([
    'modules-loading',
    'modules-loaded',
    'ordinary-play',
    'ordinary-core-playing',
    'ordinary-getstats',
    'ordinary-stop',
    'strm-play',
    'strm-core-playing',
    'strm-getstats',
    'strm-stop',
    'queue-play',
    'nexttrack-1',
    'nexttrack-2',
    'nexttrack-serial',
    'generation-tests',
    'pipeline-complete'
]);
const STAGE_SET = new Set(STAGES);

function validateDuration(value, fallback) {
    const duration = value === undefined ? fallback : value;
    if (!Number.isInteger(duration) || duration <= 0 || duration > MAX_DURATION_MS) {
        throw new Error('Pipeline deadline duration is invalid.');
    }
    return duration;
}

function createPipelineDeadline(options) {
    const settings = options || {};
    const startupMs = validateDuration(settings.startupMs, 15000);
    const stageMs = validateDuration(settings.stageMs, 15000);
    const totalMs = validateDuration(settings.totalMs, 90000);
    if (totalMs < startupMs || totalMs < stageMs) {
        throw new Error('Pipeline totalMs must cover startupMs and stageMs.');
    }
    const onTimeout = settings.onTimeout === undefined ? function () {} : settings.onTimeout;
    const now = settings.now === undefined ? function () { return performance.now(); } : settings.now;
    const setTimer = settings.setTimeout === undefined ? setTimeout : settings.setTimeout;
    const clearTimer = settings.clearTimeout === undefined ? clearTimeout : settings.clearTimeout;
    if (typeof onTimeout !== 'function' || typeof now !== 'function' ||
        typeof setTimer !== 'function' || typeof clearTimer !== 'function') {
        throw new Error('Pipeline deadline callbacks are invalid.');
    }

    const startedAt = now();
    if (!Number.isFinite(startedAt)) throw new Error('Pipeline deadline clock is invalid.');

    let startupTimer = null;
    let stageTimer = null;
    let totalTimer = null;
    let stageTimerGeneration = 0;
    let currentStage = null;
    let stageStartedAt = null;
    let terminalAt = null;
    let timeoutRecord = null;
    let timedOut = false;
    let completed = false;
    let disposed = false;
    let startupEntered = false;
    const history = [];

    function readNow() {
        const value = now();
        if (!Number.isFinite(value)) throw new Error('Pipeline deadline clock is invalid.');
        return value;
    }

    function elapsedAt(at) {
        return Math.max(0, at - startedAt);
    }

    function stageElapsedAt(at) {
        return stageStartedAt === null ? null : Math.max(0, at - stageStartedAt);
    }

    function clearOne(timer) {
        if (timer !== null) {
            try { clearTimer(timer); } catch (_) { /* A timer callback remains guarded by terminal state. */ }
        }
    }

    function stopTimers() {
        clearOne(startupTimer);
        clearOne(stageTimer);
        clearOne(totalTimer);
        startupTimer = null;
        stageTimer = null;
        totalTimer = null;
        stageTimerGeneration += 1;
    }

    function snapshot() {
        const at = terminalAt === null ? readNow() : terminalAt;
        const elapsedMs = elapsedAt(at);
        return {
            elapsedMs,
            stage: currentStage,
            stageStartedElapsedMs: stageStartedAt === null ? null : elapsedAt(stageStartedAt),
            stageElapsedMs: stageElapsedAt(at),
            history: history.map(function (entry) {
                return {stage: entry.stage, elapsedMs: entry.elapsedMs};
            }),
            timedOut,
            timeout: timeoutRecord && Object.assign({}, timeoutRecord),
            completed,
            disposed
        };
    }

    function fireTimeout(kind) {
        if (timedOut || completed || disposed) return;
        if (kind === 'startup' && startupEntered) return;
        const at = readNow();
        const record = {
            kind,
            stage: currentStage,
            elapsedMs: elapsedAt(at),
            stageElapsedMs: stageElapsedAt(at)
        };
        timedOut = true;
        timeoutRecord = record;
        terminalAt = at;
        stopTimers();
        try {
            const result = onTimeout(Object.assign({}, record));
            if (result && typeof result.then === 'function') Promise.resolve(result).catch(function () {});
        } catch (_) { /* Timeout notification must not escape the watchdog. */ }
    }

    function pushHistory(stage, at) {
        history.push({stage, elapsedMs: elapsedAt(at)});
        if (history.length > 32) history.shift();
    }

    startupTimer = setTimer(function () { fireTimeout('startup'); }, startupMs);
    totalTimer = setTimer(function () { fireTimeout('total'); }, totalMs);

    function enter(stage) {
        if (typeof stage !== 'string' || !STAGE_SET.has(stage)) {
            throw new Error('Pipeline deadline stage is invalid.');
        }
        if (timedOut || completed || disposed) return snapshot();
        if (stage === currentStage) return snapshot();

        const at = readNow();
        startupEntered = true;
        clearOne(startupTimer);
        startupTimer = null;
        clearOne(stageTimer);
        stageTimer = null;
        stageTimerGeneration += 1;
        currentStage = stage;
        stageStartedAt = at;
        pushHistory(stage, at);

        if (stage === 'pipeline-complete') {
            completed = true;
            terminalAt = at;
            stopTimers();
            return snapshot();
        }

        const generation = stageTimerGeneration;
        stageTimer = setTimer(function () {
            if (generation !== stageTimerGeneration || currentStage !== stage) return;
            fireTimeout('stage');
        }, stageMs);
        return snapshot();
    }

    function dispose() {
        if (disposed) return snapshot();
        const at = readNow();
        stopTimers();
        disposed = true;
        if (terminalAt === null) terminalAt = at;
        return snapshot();
    }

    return {enter, snapshot, dispose};
}

module.exports = {createPipelineDeadline, STAGES, MAX_DURATION_MS};