'use strict';

// A synchronous admission gate keeps optional diagnostics out of playback
// promises and bounds queued writes even when the filesystem is slow.
function createRecorder(logger, category, limit, options) {
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

module.exports = {createRecorder};
