(function attachPipelineCondition(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports) module.exports = api;
    else root.etePipelineCondition = api;
}(typeof globalThis === 'object' ? globalThis : this, function createModule() {
    'use strict';

    const NAME = /^[a-z0-9-]{1,64}$/;
    const MAX_WAITERS = 32;
    const MAX_HISTORY = 64;
    const MAX_TIMEOUT_MS = 2147483647;

    function fixedError(message) { return new Error(message); }

    function create(options) {
        const settings = options === undefined ? {} : options;
        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
            throw fixedError('pipeline-condition-invalid-options');
        }
        const timeoutMs = settings.timeoutMs === undefined ? 5000 : settings.timeoutMs;
        const now = settings.now || Date.now;
        const setTimer = settings.setTimeout || setTimeout;
        const clearTimer = settings.clearTimeout || clearTimeout;
        if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > MAX_TIMEOUT_MS ||
            typeof now !== 'function' || typeof setTimer !== 'function' || typeof clearTimer !== 'function') {
            throw fixedError('pipeline-condition-invalid-options');
        }

    const waiters = new Set();
    const history = [];
    let disposed = false;
    let evaluatingDepth = 0;
    let notifying = false;

        function readNow() {
            let value;
            try { value = now(); } catch (_) { throw fixedError('pipeline-condition-clock-error'); }
            if (typeof value !== 'number' || !Number.isFinite(value)) throw fixedError('pipeline-condition-clock-error');
            return value;
        }

        function remember(waiter, status) {
            let elapsed = 0;
            try { elapsed = Math.max(0, readNow() - waiter.startedAtMs); } catch (_) { }
            history.push({name: waiter.name, status, elapsedMs: elapsed});
            if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
        }

        function clearWaiterTimer(waiter) {
            if (waiter.timer !== null) {
                try { clearTimer(waiter.timer); } catch (_) { }
                waiter.timer = null;
            }
        }

        function settle(waiter, status, value) {
            if (!waiter.active) return false;
            waiter.active = false;
            waiters.delete(waiter);
            clearWaiterTimer(waiter);
            remember(waiter, status);
            if (status === 'resolved') waiter.resolve(value);
            else waiter.reject(value instanceof Error ? value : fixedError(String(value)));
            return true;
        }

        function check(waiter) {
            if (!waiter.active) return;
            if (waiter.evaluating) {
                waiter.recheckRequested = true;
                return;
            }
            waiter.evaluating = true;
            let rechecks = 0;
            try {
                do {
                    waiter.recheckRequested = false;
                    let value;
                    evaluatingDepth++;
                    try { value = waiter.predicate(); }
                    catch (error) { settle(waiter, 'predicate-error', error); return; }
                    finally { evaluatingDepth--; }
                    if (!waiter.active) return;
                    if (value) {
                        settle(waiter, 'resolved', value);
                        return;
                    }
                    if (waiter.recheckRequested && rechecks < 1) {
                        rechecks++;
                        continue;
                    }
                    break;
                } while (waiter.active);
            } finally {
                waiter.evaluating = false;
                waiter.recheckRequested = false;
            }
        }

        function wait(name, predicate) {
            if (disposed) return Promise.reject(fixedError('pipeline-condition-disposed'));
            if (typeof name !== 'string' || !NAME.test(name)) return Promise.reject(fixedError('pipeline-condition-invalid-name'));
            if (typeof predicate !== 'function') return Promise.reject(fixedError('pipeline-condition-invalid-predicate'));

            let startedAtMs;
            try { startedAtMs = readNow(); } catch (error) { return Promise.reject(error); }
            let resolvePromise;
            let rejectPromise;
            const promise = new Promise((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject; });
            const waiter = {name, predicate, startedAtMs, timer: null, active: true, evaluating: false,
                recheckRequested: false, provisional: true, resolve: resolvePromise, reject: rejectPromise};
            waiters.add(waiter);
            check(waiter);
            if (!notifying && evaluatingDepth === 0 && Array.from(waiters).some(item => item.active && item.recheckRequested)) notify();
            if (!waiter.active) return promise;

            waiter.provisional = false;
            const settledLiveCount = Array.from(waiters).filter(item => item.active && !item.provisional).length;
            if (settledLiveCount > MAX_WAITERS) {
                settle(waiter, 'limit', fixedError('pipeline-condition-waiter-limit'));
                return promise;
            }

            let elapsed;
            try { elapsed = Math.max(0, readNow() - startedAtMs); }
            catch (error) { settle(waiter, 'clock-error', error); return promise; }
            try {
                waiter.timer = setTimer(() => {
                    settle(waiter, 'timed-out', fixedError('pipeline-condition-timeout:' + name));
                }, Math.max(0, timeoutMs - elapsed));
            } catch (_) {
                settle(waiter, 'timer-error', fixedError('pipeline-condition-timer-error'));
            }
            return promise;
        }

        function notify() {
            if (disposed) return;
            if (notifying || evaluatingDepth > 0) {
                for (const waiter of waiters) if (waiter.active) waiter.recheckRequested = true;
                return;
            }
            notifying = true;
            try {
                for (let round = 0; round < 2; round++) {
                    for (const waiter of Array.from(waiters)) check(waiter);
                    if (!Array.from(waiters).some(waiter => waiter.active && waiter.recheckRequested)) break;
                }
            } finally {
                notifying = false;
            }
        }

        function snapshot() {
            return {disposed, liveWaiterCount: waiters.size, history: history.map(entry => ({...entry}))};
        }

        function dispose() {
            if (disposed) return snapshot();
            disposed = true;
            for (const waiter of Array.from(waiters)) {
                settle(waiter, 'disposed', fixedError('pipeline-condition-disposed'));
            }
            return snapshot();
        }

        return {wait, notify, snapshot, dispose};
    }

    return {create};
}));
