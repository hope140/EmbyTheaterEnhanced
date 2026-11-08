'use strict';

// A synchronous admission gate keeps optional diagnostics out of playback
// promises and bounds queued writes even when the filesystem is slow.
function createRecorder(logger, category, limit, options) {
    if (options && options.deliveryReceipts) return createAcknowledgedRecorder(logger, category, limit, options);
    const now = options && options.now || Date.now;
    let start = null;
    let count = 0;
    let pendingCount = 0;
    let pendingDrops = 0;
    const seen = new Set();
    return function record(event, details, deduplicate) {
        try {
            if (pendingCount >= 32) { pendingDrops = Math.min(pendingDrops + 1, 1000000); return; }
            const time = now();
            if (start === null || time - start >= 60000 || time < start) {
                start = time;
                count = 0;
                seen.clear();
            }
            if (count > limit) return;
            const key = deduplicate ? JSON.stringify({event, details}) : null;
            if (key && seen.has(key)) return;
            if (count++ === limit) {
                event = 'diagnostics-suppressed';
                details = {reason: 'rate-limit', limitPerMinute: limit};
            } else if (key) {
                if (seen.size >= 64) seen.delete(seen.values().next().value);
                seen.add(key);
            }
            const carriedDrops = pendingDrops;
            if (carriedDrops) details = Object.assign({}, details, {diagnosticPendingDrops: carriedDrops});
            pendingDrops = 0;
            function restoreDrops() { pendingDrops = Math.min(pendingDrops + carriedDrops, 1000000); }
            try {
                const pending = logger({category, event, details});
                if (pending && typeof pending.then === 'function') {
                    pendingCount++;
                    Promise.resolve(pending).then(function (written) {
                        pendingCount--;
                        if (written === false) restoreDrops();
                    }, function () { pendingCount--; restoreDrops(); });
                } else if (pending === false) restoreDrops();
            } catch (_) { restoreDrops(); }
        } catch (_) { /* Logging cannot change the observed operation. */ }
    };
}

// Separate instances provide independent priority lanes. A receipt means the
// logger completed its write, never merely that admission was attempted.
function createAcknowledgedRecorder(logger, category, limit, options) {
    const now = options.now || Date.now;
    let start = null, count = 0, pending = 0, marked = false;
    let counters = {};
    function add(target, key, amount) {
        const total = (target[key] || 0) + amount;
        target[key] = Math.min(total, Number.MAX_SAFE_INTEGER);
        if (total > Number.MAX_SAFE_INTEGER) target.diagnosticCountersSaturated = true;
    }
    return function record(event, details) {
        try {
            if (pending >= 32) { add(counters, 'diagnosticSuppressedPending', 1); return false; }
            const time = now();
            if (start === null || time - start >= 60000 || time < start) {
                start = time; count = 0; marked = false;
            }
            let admitted = true;
            if (count >= limit) {
                add(counters, 'diagnosticSuppressedRate', 1);
                if (marked) return false;
                marked = true; admitted = false;
                event = 'diagnostics-suppressed';
                details = {reason: 'rate-limit', limitPerMinute: limit};
            } else count++;
            const carried = counters; counters = {};
            const row = {category, event, details: {...details, ...carried, diagnosticLane: options.lane}};
            pending++;
            function complete(written) {
                pending--;
                if (written === false) {
                    for (const key of Object.keys(carried)) {
                        if (key === 'diagnosticCountersSaturated') counters[key] = true;
                        else add(counters, key, carried[key]);
                    }
                    add(counters, 'diagnosticWriteFailures', 1);
                    return false;
                }
                return admitted;
            }
            try {
                const result = logger(row);
                return result && typeof result.then === 'function'
                    ? Promise.resolve(result).then(complete, () => complete(false)) : complete(result);
            } catch (_) { return complete(false); }
        } catch (_) { return false; }
    };
}

module.exports = {createRecorder};
