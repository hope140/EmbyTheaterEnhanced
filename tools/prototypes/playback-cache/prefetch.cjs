'use strict';

// Scheduling/budget prototype only. An injected, trusted offline job supplies
// bytes; this module has no network transport, credentials or playback hooks.
function fail(code) { const error = new Error(code); error.code = code; throw error; }
const positive = value => Number.isSafeInteger(value) && value > 0;

function abortableDelay(ms, signal) {
    return new Promise((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(Object.assign(new Error('prefetch-cancelled'), {code: 'prefetch-cancelled'})); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
        if (signal.aborted) abort(); else signal.addEventListener('abort', abort, {once: true});
    });
}

function createScheduler(options = {}) {
    if (options.enabled !== true) return Object.freeze({enabled: false});
    const policy = options.policy;
    const fields = ['bytesPerSecond', 'burstBytes', 'maxBytes', 'maxDurationMs'];
    if (!policy || Object.keys(policy).sort().join('|') !== fields.slice().sort().join('|') ||
        fields.some(field => !positive(policy[field])) || policy.burstBytes > 65536 ||
        policy.maxDurationMs > 2147483647) fail('prefetch-policy-required');
    const limits = {...policy};
    const clock = options.now || Date.now;
    const now = () => { const value = clock(); if (!Number.isSafeInteger(value) || value < 0) fail('prefetch-clock-invalid'); return value; };
    const delay = options.delay || abortableDelay;
    const setTimer = options.setTimer || setTimeout;
    const clearTimer = options.clearTimer || clearTimeout;
    let closed = false;
    let foregroundBusy = false;
    let epoch = 0;
    let selected = null;
    let pending = null;
    let active = null;
    let draining = null;
    let lastOutcome = 'idle';

    function cancel() {
        const retiredEpoch = ++epoch; pending = null; selected = null;
        if (active) active.controller.abort();
        return retiredEpoch;
    }
    function makeBudget(task, deadline) {
        let claimed = 0;
        let consumed = 0;
        let tokens = 0;
        let lastRefill = now();
        function check() {
            if (closed || foregroundBusy || active !== task || task.done || task.epoch !== epoch || task.controller.signal.aborted) fail('prefetch-cancelled');
            if (now() >= deadline) { task.controller.abort(); fail('prefetch-expired'); }
        }
        async function claim(bytes) {
            if (!positive(bytes) || bytes > limits.burstBytes) fail('prefetch-claim-invalid');
            while (true) {
                check();
                if (bytes > limits.maxBytes - claimed) fail('prefetch-byte-limit');
                const time = now();
                if (time < lastRefill) fail('prefetch-clock-invalid');
                tokens = Math.min(limits.burstBytes, tokens + (time - lastRefill) * limits.bytesPerSecond / 1000);
                lastRefill = time;
                if (tokens >= bytes) { tokens -= bytes; claimed += bytes; return bytes; }
                const wait = Math.ceil((bytes - tokens) * 1000 / limits.bytesPerSecond);
                // Never start a read that cannot obtain its grant before expiry.
                if (wait >= deadline - time) fail('prefetch-expired');
                await delay(wait, task.controller.signal);
            }
        }
        return Object.freeze({
            signal: task.controller.signal,
            claim(bytes) {
                const promise = claim(bytes);
                // A completed job may abandon a pending claim; still return the
                // original rejection to callers that await it.
                promise.catch(() => {});
                return promise;
            },
            append(writer, offset, bytes) {
                check();
                if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > claimed - consumed) fail('prefetch-unbudgeted-write');
                // No await between owner check and the synchronous store commit.
                const result = writer.append(offset, bytes); consumed += bytes.length; return result;
            },
            assertCurrent: check
        });
    }

    async function drain() {
        try {
            while (!closed && !foregroundBusy && pending) {
                const candidate = pending; pending = null;
                const start = now();
                if (start >= candidate.confirmedUntil) { lastOutcome = 'expired'; continue; }
                const deadline = Math.min(candidate.confirmedUntil, start + limits.maxDurationMs);
                if (!Number.isSafeInteger(deadline)) { lastOutcome = 'failed'; continue; }
                const task = {epoch, done: false, controller: new AbortController()}; active = task;
                let timer;
                try {
                    timer = setTimer(() => task.controller.abort(), deadline - start);
                    const budget = makeBudget(task, deadline);
                    budget.assertCurrent();
                    await candidate.run(budget);
                    budget.assertCurrent(); lastOutcome = 'completed';
                } catch {
                    lastOutcome = task.controller.signal.aborted || task.epoch !== epoch ? 'cancelled' : 'failed';
                } finally {
                    clearTimer(timer);
                    // Release ownership before this drain's Promise can settle.
                    task.done = true;
                    if (active === task) active = null;
                    task.controller.abort();
                }
            }
        } finally {
            draining = null;
        }
    }
    function kick() {
        if (!draining && !closed && !foregroundBusy && pending) {
            draining = Promise.resolve().then(drain);
            // A rejected clock/test timer must not leak an unhandled rejection.
            draining.catch(() => { lastOutcome = 'failed'; });
        }
    }
    function update(candidate) {
        if (closed) fail('prefetch-closed');
        if (!candidate || candidate.confirmed !== true) { cancel(); return 'unconfirmed'; }
        if (typeof candidate.owner !== 'string' || !candidate.owner.length || candidate.owner.length > 512 ||
            typeof candidate.nextKey !== 'string' || !candidate.nextKey.length || candidate.nextKey.length > 512 ||
            !Number.isSafeInteger(candidate.confirmedUntil) || candidate.confirmedUntil <= now() ||
            typeof candidate.run !== 'function') { cancel(); fail('prefetch-candidate-invalid'); }
        if (selected && selected.owner === candidate.owner && selected.nextKey === candidate.nextKey &&
            selected.confirmedUntil === candidate.confirmedUntil) return 'duplicate';
        const updateEpoch = cancel();
        // Abort listeners can synchronously submit a newer confirmation.
        if (updateEpoch !== epoch || closed) return 'superseded';
        // Retain only the latest explicit confirmation, no queue/episode inference.
        selected = {owner: candidate.owner, nextKey: candidate.nextKey, confirmedUntil: candidate.confirmedUntil};
        pending = {...selected, run: candidate.run}; kick(); return 'queued';
    }
    return Object.freeze({enabled: true, update,
        setForegroundBusy(value) {
            if (closed) fail('prefetch-closed');
            if (typeof value !== 'boolean') fail('prefetch-priority-invalid');
            foregroundBusy = value;
            if (value) cancel(); else kick();
        },
        cancel,
        status() { return Object.freeze({active: !!active, pending: !!pending, foregroundBusy, closed, lastOutcome}); },
        async whenIdle() { while (draining) await draining; },
        async close() { closed = true; cancel(); while (draining) await draining; }
    });
}

module.exports = {createScheduler};
