'use strict';

// A deadline bounds observation, never ownership. Pending work is retained and
// cannot be called cancelled or bypassed by a second quit request.
function createDrain(options) {
    const {steps, onReady, onBlocked} = options;
    const clock = options.clock || {setTimeout, clearTimeout};
    const pending = new Set(), failed = new Set();
    const now = options.now || Date.now;
    let deadline;
    let started = false, ready = false, busy = false, blocked = false, timer;
    const log = (event, details) => { try { const result = options.log({category: 'app', event, details}); if (result && typeof result.catch === 'function') result.catch(() => {}); } catch (_) {} };
    const snapshot = () => ({pending: [...pending], failed: [...failed]});
    async function block(reason) {
        blocked = true;
        log('shutdown-blocked', {...snapshot(), reason});
        try { await onBlocked({...snapshot(), reason}); } catch (_) { log('shutdown-notification-failed', {}); }
    }
    async function finish() {
        if (busy || ready || pending.size || failed.size) return;
        busy = true;
        try { await onReady(); ready = true; }
        catch (_) { await block('handoff-unconfirmed'); }
        finally { busy = false; }
    }
    return {
        start() {
            if (started) return;
            started = true; deadline = now() + (options.timeoutMs || 30000);
            timer = clock.setTimeout(() => { if (pending.size) { busy = true; block('cleanup-timeout').finally(() => { busy = false; }); } }, options.timeoutMs || 30000);
            for (const [step, cleanup] of Object.entries(steps)) {
                pending.add(step); log('shutdown-cleanup-started', {step});
                let work;
                try { work = cleanup(); } catch (error) { work = Promise.reject(error); }
                Promise.resolve(work).catch(() => { if (!(options.nonCritical || []).includes(step)) failed.add(step); log('shutdown-cleanup-failed', {step}); }).finally(() => {
                    pending.delete(step); log('shutdown-cleanup-settled', {step});
                    if (!pending.size) {
                        clock.clearTimeout(timer);
                        // Failed critical work is not confirmation of release.
                        if (failed.size) { if (!blocked) { busy = true; block('cleanup-failed').finally(() => { busy = false; }); } }
                        else if (!blocked) {
                            if (now() >= deadline) { busy = true; block('cleanup-timeout').finally(() => { busy = false; }); }
                            else finish();
                        }
                    }
                });
            }
        },
        retry() { if (blocked && !busy && !pending.size && !failed.size) return finish(); },
        snapshot,
        get ready() { return ready; }
    };
}
module.exports = {createDrain};
