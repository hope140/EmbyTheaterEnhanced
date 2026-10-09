'use strict';

const {performance} = require('node:perf_hooks');
const REQUEST_ID = /^play-(?:[1-9][0-9]*|local)-[1-9][0-9]*$/;
const LABELS = new Set(['rapid-next', 'stop-before-load']);
const MODES = new Set(['hit', 'direct', 'miss']);
const MAX_REQUESTS = 64;
const MAX_ARMS = 8;
const MAX_EVENTS = 256;
const MAX_GATE_WAITERS = 64;
const MAX_GATE_TIMEOUT_MS = 60000;

function fail(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}

function loopbackSource(getSource) {
    if (typeof getSource !== 'function') throw fail('INVALID_OPTIONS');
    let value;
    try { value = getSource(); } catch (_) { throw fail('INVALID_SOURCE'); }
    if (typeof value !== 'string' || !value || value.length > 2048) throw fail('INVALID_SOURCE');
    let parsed;
    try { parsed = new URL(value); } catch (_) { throw fail('INVALID_SOURCE'); }
    const host = parsed.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(parsed.protocol) ||
        !['127.0.0.1', 'localhost', '[::1]'].includes(host) ||
        parsed.username || parsed.password || parsed.search || parsed.hash) {
        throw fail('INVALID_SOURCE');
    }
    return value;
}

function createFakeCd2Fixture(options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw fail('INVALID_OPTIONS');
    const mode = options.mode === undefined ? 'hit' : options.mode;
    const delayMs = options.delayMs === undefined ? 400 : options.delayMs;
    const gateTimeoutMs = options.gateTimeoutMs === undefined ? 4000 : options.gateTimeoutMs;
    const now = options.now || (() => performance.now());
    const setTimer = options.setTimeout || setTimeout;
    const clearTimer = options.clearTimeout || clearTimeout;
    if (!MODES.has(mode) || !Number.isInteger(delayMs) || delayMs < 0 || delayMs > 1000 ||
        !Number.isInteger(gateTimeoutMs) || gateTimeoutMs < 1 || gateTimeoutMs > MAX_GATE_TIMEOUT_MS ||
        typeof now !== 'function' || typeof setTimer !== 'function' || typeof clearTimer !== 'function') {
        throw fail('INVALID_OPTIONS');
    }

    const fixtureSource = loopbackSource(options.getSource);
    const requests = new Map();
    const active = new Map();
    const arms = new Map();
    const events = [];
    let sequence = 0;
    let armSequence = 0;
    let unboundArmId = null;
    let resolveCount = 0;
    let cancelCount = 0;
    let completedCount = 0;
    let gateWaiterCount = 0;
    let disposed = false;
    let closed = false;
    let lastNow = -Infinity;

    function timestamp() {
        let value;
        try { value = now(); } catch (_) { throw fail('INVALID_CLOCK'); }
        if (typeof value !== 'number' || !Number.isFinite(value) || value < lastNow) throw fail('INVALID_CLOCK');
        lastNow = value;
        return value;
    }

    function addEvent(name, request, arm, atMs) {
        if (events.length >= MAX_EVENTS) throw fail('EVENT_LIMIT');
        events.push({
            event: name,
            atMs: atMs === undefined ? timestamp() : atMs,
            sequence: request ? request.sequence : null,
            requestId: request ? request.requestId : null,
            armId: arm ? arm.armId : null,
            label: arm ? arm.label : null
        });
    }

    function makeResponse(requestId) {
        if (mode === 'miss') return {status: 'miss', reason: 'unavailable'};
        const source = fixtureSource + '?cd2=' + encodeURIComponent(requestId);
        if (mode === 'direct') {
            return {
                status: 'hit',
                type: 'url',
                sourceKind: 'direct-url',
                reason: 'direct_hit',
                source,
                requestOptions: {userAgent: 'ETE-Direct-' + requestId}
            };
        }
        return {status: 'hit', type: 'url', source};
    }

    function clearRequestTimer(request) {
        if (request.timer !== null) {
            try { clearTimer(request.timer); } catch (_) { }
            request.timer = null;
        }
    }

    function clearWaiter(waiter) {
        if (waiter.timer !== null) {
            try { clearTimer(waiter.timer); } catch (_) { }
            waiter.timer = null;
        }
    }

    function settleWaiter(arm, kind, waiter, outcome, value) {
        const list = arm.waiters[kind];
        const index = list.indexOf(waiter);
        if (index < 0) return;
        list.splice(index, 1);
        gateWaiterCount--;
        clearWaiter(waiter);
        if (outcome === 'resolve') waiter.resolve(value);
        else waiter.reject(fail(value));
    }

    function settleAll(arm, kind, outcome, value) {
        for (const waiter of [...arm.waiters[kind]]) settleWaiter(arm, kind, waiter, outcome, value);
    }

    function expireUnboundArm(arm) {
        if (arm.requestId || arm.status !== 'armed') return;
        arm.status = 'failed';
        if (unboundArmId === arm.armId) unboundArmId = null;
        settleAll(arm, 'pending', 'reject', 'GATE_TIMEOUT');
        settleAll(arm, 'cancelled', 'reject', 'GATE_TIMEOUT');
    }

    function pendingResult(request, arm) {
        return {requestId: request.requestId, pending: true, held: true, armId: arm.armId};
    }

    function notifyPending(arm, request, atMs) {
        if (arm.pendingReported) return;
        arm.pendingReported = true;
        addEvent('pending-gate-opened', request, arm, atMs);
        settleAll(arm, 'pending', 'resolve', pendingResult(request, arm));
    }

    function notifyCancelled(arm, request, atMs) {
        if (arm.cancelReported) return;
        arm.cancelReported = true;
        addEvent('cancel-gate-opened', request, arm, atMs);
        settleAll(arm, 'cancelled', 'resolve', {requestId: request.requestId, cancelled: true, armId: arm.armId});
    }

    function failTerminalWaiters(arm, request, terminalCode) {
        if (!arm.pendingReported) settleAll(arm, 'pending', 'reject', terminalCode);
        if (request.status === 'completed') settleAll(arm, 'cancelled', 'reject', 'REQUEST_COMPLETED');
        if (request.status === 'closed') settleAll(arm, 'cancelled', 'reject', 'SERVICE_CLOSED');
    }

    function finish(request, status, result, serviceCancelSucceeded = false) {
        if (request.status !== 'active' && request.status !== 'held') return false;
        const finishedAtMs = timestamp();
        clearRequestTimer(request);
        request.status = status;
        request.finishedAtMs = finishedAtMs;
        active.delete(request.requestId);
        if (status === 'completed') completedCount++;
        if (status === 'cancelled' && serviceCancelSucceeded) cancelCount++;
        const arm = request.armId ? arms.get(request.armId) : null;
        const eventName = status === 'completed' ? 'resolve-completed' : status === 'closed' ? 'resolve-closed' : 'resolve-cancelled';
        addEvent(eventName, request, arm, finishedAtMs);
        if (arm) {
            arm.status = status;
            if (status === 'cancelled' && serviceCancelSucceeded) notifyCancelled(arm, request, finishedAtMs);
            failTerminalWaiters(arm, request, 'REQUEST_NOT_ACTIVE');
        }
        request.resolve(result);
        return true;
    }

    function scheduleCompletion(request) {
        try {
            request.timer = setTimer(() => finish(request, 'completed', makeResponse(request.requestId)), delayMs);
        } catch (_) {
            request.status = 'failed';
            request.finishedAtMs = timestamp();
            active.delete(request.requestId);
            const arm = request.armId ? arms.get(request.armId) : null;
            if (arm) {
                arm.status = 'failed';
                settleAll(arm, 'pending', 'reject', 'TIMER_FAILURE');
                settleAll(arm, 'cancelled', 'reject', 'TIMER_FAILURE');
            }
            request.reject(fail('TIMER_FAILURE'));
        }
    }

    function resolve(requestInput) {
        if (disposed || closed) return Promise.reject(fail(disposed ? 'FIXTURE_DISPOSED' : 'SERVICE_CLOSED'));
        const requestId = requestInput && typeof requestInput.requestId === 'string' ? requestInput.requestId : null;
        if (!requestId || requestId.length > 64 || !REQUEST_ID.test(requestId)) return Promise.reject(fail('INVALID_REQUEST'));
        if (requests.has(requestId)) return Promise.reject(fail('DUPLICATE_REQUEST_ID'));
        if (requests.size >= MAX_REQUESTS) return Promise.reject(fail('REQUEST_LIMIT'));

        let enteredAtMs;
        try { enteredAtMs = timestamp(); } catch (error) { return Promise.reject(error); }
        sequence++;
        resolveCount++;
        let resolvePromise, rejectPromise;
        const promise = new Promise((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject; });
        const arm = unboundArmId ? arms.get(unboundArmId) : null;
        const request = {
            requestId,
            sequence,
            armId: arm ? arm.armId : null,
            status: arm ? 'held' : 'active',
            enteredAtMs,
            finishedAtMs: null,
            timer: null,
            resolve: resolvePromise,
            reject: rejectPromise
        };
        requests.set(requestId, request);
        active.set(requestId, request);
        addEvent('resolve-entered', request, arm, enteredAtMs);
        if (arm) {
            unboundArmId = null;
            arm.requestId = requestId;
            arm.status = 'held';
            addEvent('arm-bound', request, arm, enteredAtMs);
            notifyPending(arm, request, enteredAtMs);
        } else {
            scheduleCompletion(request);
        }
        return promise;
    }

    function cancel(requestId) {
        if (disposed || closed || typeof requestId !== 'string' || !REQUEST_ID.test(requestId) || requestId.length > 64) return false;
        const request = active.get(requestId);
        if (!request) return false;
        return finish(request, 'cancelled', {status: 'cancelled', reason: 'cancelled'}, true);
    }

    function makeArmWaiter(arm, kind) {
        if (kind === 'pending') {
            if (arm.requestId) {
                const request = requests.get(arm.requestId);
                if (!request || request.status !== 'held' || !active.has(request.requestId)) throw fail('REQUEST_NOT_ACTIVE');
                notifyPending(arm, request, request.enteredAtMs);
                return Promise.resolve(pendingResult(request, arm));
            }
            if (arm.status !== 'armed') throw fail('REQUEST_NOT_ACTIVE');
        } else {
            if (arm.status === 'cancelled' && arm.requestId) {
                return Promise.resolve({requestId: arm.requestId, cancelled: true, armId: arm.armId});
            }
            if (arm.status === 'completed') throw fail('REQUEST_COMPLETED');
            if (arm.status === 'failed' || arm.status === 'released') throw fail('REQUEST_NOT_ACTIVE');
        }
        return new Promise((resolve, reject) => {
            if (gateWaiterCount >= MAX_GATE_WAITERS) throw fail('GATE_WAITER_LIMIT');
            const waiter = {resolve, reject, timer: null};
            arm.waiters[kind].push(waiter);
            gateWaiterCount++;
            try {
                waiter.timer = setTimer(() => {
                    settleWaiter(arm, kind, waiter, 'reject', 'GATE_TIMEOUT');
                    expireUnboundArm(arm);
                }, gateTimeoutMs);
            } catch (_) {
                settleWaiter(arm, kind, waiter, 'reject', 'TIMER_FAILURE');
            }
        });
    }

    function exactKeys(command, expected) {
        const keys = Object.keys(command).sort();
        return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index]);
    }

    async function control(command) {
        if (!command || typeof command !== 'object' || Array.isArray(command) || typeof command.action !== 'string') throw fail('INVALID_CONTROL');
        if (command.action === 'snapshot' && exactKeys(command, ['action'])) return snapshot();
        if (disposed) throw fail('FIXTURE_DISPOSED');
        if (closed) throw fail('SERVICE_CLOSED');
        if (command.action === 'arm-next') {
            if (!exactKeys(command, ['action', 'label']) || !LABELS.has(command.label)) throw fail('INVALID_CONTROL');
            if (closed) throw fail('SERVICE_CLOSED');
            if (unboundArmId) throw fail('ARM_ALREADY_PENDING');
            if (arms.size >= MAX_ARMS) throw fail('ARM_LIMIT');
            const armId = 'arm-' + (++armSequence);
            const arm = {armId, label: command.label, status: 'armed', requestId: null,
                pendingReported: false, cancelReported: false, waiters: {pending: [], cancelled: []}};
            arms.set(armId, arm);
            unboundArmId = armId;
            addEvent('arm-created', null, arm);
            return {armId};
        }
        if (!exactKeys(command, ['action', 'armId']) || typeof command.armId !== 'string' || !/^arm-[1-8]$/.test(command.armId)) throw fail('INVALID_CONTROL');
        const arm = arms.get(command.armId);
        if (!arm) throw fail('UNKNOWN_ARM');
        if (command.action === 'wait-pending') return makeArmWaiter(arm, 'pending');
        if (command.action === 'wait-cancelled') return makeArmWaiter(arm, 'cancelled');
        if (command.action === 'release') {
            if (arm.status !== 'held' || !arm.requestId) throw fail('REQUEST_NOT_HELD');
            const request = requests.get(arm.requestId);
            if (!request || request.status !== 'held' || !active.has(request.requestId)) throw fail('REQUEST_NOT_HELD');
            addEvent('request-released', request, arm);
            finish(request, 'completed', makeResponse(request.requestId));
            return {requestId: request.requestId, released: true, armId: arm.armId};
        }
        throw fail('INVALID_CONTROL');
    }

    function snapshot() {
        return {
            resolveCount,
            cancelCount,
            completedCount,
            activeCount: active.size,
            gateWaiterCount,
            requests: Array.from(requests.values(), request => ({
                requestId: request.requestId,
                sequence: request.sequence,
                armId: request.armId,
                status: request.status,
                enteredAtMs: request.enteredAtMs,
                finishedAtMs: request.finishedAtMs
            })),
            events: events.map(event => ({...event}))
        };
    }

    function rejectAllGateWaiters(code) {
        for (const arm of arms.values()) {
            settleAll(arm, 'pending', 'reject', code);
            settleAll(arm, 'cancelled', 'reject', code);
            if (!arm.requestId && arm.status === 'armed') arm.status = 'failed';
        }
        unboundArmId = null;
    }

    function closeService() {
        if (closed) return snapshot();
        closed = true;
        rejectAllGateWaiters('SERVICE_CLOSED');
        for (const request of [...active.values()]) cancelWhileClosing(request);
        return snapshot();
    }

    function cancelWhileClosing(request) {
        finish(request, 'closed', {status: 'cancelled', reason: 'cancelled'});
    }

    function dispose() {
        if (disposed) return snapshot();
        disposed = true;
        rejectAllGateWaiters('FIXTURE_DISPOSED');
        closeService();
        return snapshot();
    }

    return {
        service: {resolve, cancel, close: closeService},
        control,
        snapshot,
        dispose
    };
}

module.exports = {createFakeCd2Fixture};
