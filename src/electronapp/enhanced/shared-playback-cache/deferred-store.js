'use strict';

// Network forwarding can start while this single owned store recovers. Only
// metadata ownership operations wait; an unavailable store never supplies hits.
function createDeferredStore(options, {create = value => require('./store').createStore(value)} = {}) {
    let backend, failed = false, closing = false, closed = false, closePromise;
    let tail = Promise.resolve();
    const unavailable = () => Error('shared-cache-unavailable');
    const ready = Promise.resolve().then(() => create(options)).then(value => {
        backend = value;
        return value;
    }, () => {failed = true; throw unavailable();});
    ready.catch(() => {});
    function enqueue(action) {
        if (closing) return Promise.reject(unavailable());
        const result = tail.then(async () => {
            const store = await ready;
            if (closing) throw unavailable();
            return action(store);
        });
        tail = result.catch(() => {});
        return result;
    }
    const usable = () => backend && !closing && !failed;
    return {
        open(identity, metadata, role, options = {}) {
            return enqueue(store => {
                if (typeof options.isCurrent === 'function' && !options.isCurrent()) throw unavailable();
                return store.open(identity, metadata, role, options);
            });
        },
        actual(key, options = {}) {
            return enqueue(store => {
                if (typeof options.isCurrent === 'function' && !options.isCurrent()) return false;
                return store.actual(key, options);
            });
        },
        put: (...args) => usable() ? backend.put(...args) : Promise.resolve(false),
        read: (...args) => usable() ? backend.read(...args) : Promise.resolve(null),
        span: (...args) => usable() ? backend.span(...args) : Promise.resolve(null),
        nextOffset: (...args) => usable() ? backend.nextOffset(...args) : Promise.resolve(null),
        coverage: key => usable() ? backend.coverage(key) : {bytes: 0, total: 0, verifiedBytes: 0},
        invalidate: key => enqueue(store => store.invalidate(key)),
        discardNext: () => enqueue(store => store.discardNext()),
        forgetActualUnlessMedia: (identity, options = {}) => enqueue(store => store.forgetActualUnlessMedia(identity, options)),
        status() {
            const empty = {committed: 0, reserved: 0, pending: 0, pendingCount: 0, peak: 0,
                readers: 0, current: 0, next: 0, currentKey: null, entries: 0, blocks: 0, faulted: failed, closed};
            return {...(backend ? backend.status() : empty), initializing: !backend && !failed && !closed,
                available: !!usable(), closed: closed || !!backend?.status().closed};
        },
        close() {
            if (closePromise) return closePromise;
            closing = true;
            closePromise = (async () => {
                const store = await ready.catch(() => null);
                await tail;
                if (store) await store.close();
                closed = true;
            })();
            return closePromise;
        }
    };
}

module.exports = {createDeferredStore};
