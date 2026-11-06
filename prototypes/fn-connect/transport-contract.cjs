'use strict';

// ETE-owned, memory-only design contract. This is NOT an FNConnect protocol or
// SDK implementation. Never import it from runtime: official access is unknown.
const CAPABILITIES = Object.freeze(['http', 'range', 'websocket']);

function failure(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}

function createTransport({mode = 'disabled', provider, now = Date.now} = {}) {
    if (!['disabled', 'mock'].includes(mode)) throw failure('PROTOCOL_UNAVAILABLE');
    return Object.freeze({
        async connect({deviceRef, signal} = {}) {
            if (mode === 'disabled') throw failure('TRANSPORT_DISABLED');
            if (!provider || typeof provider.open !== 'function') throw failure('PROTOCOL_UNAVAILABLE');
            if (typeof deviceRef !== 'string' || !deviceRef.trim()) throw failure('INVALID_DEVICE_REF');
            if (signal?.aborted) throw failure('CONNECTION_ABORTED');
            const controller = new AbortController();
            let closed = false;
            let lease;
            let closing;
            const close = () => {
                closed = true;
                controller.abort();
                signal?.removeEventListener('abort', cancel);
                if (!closing && typeof lease?.close === 'function') {
                    closing = Promise.resolve().then(() => lease.close())
                        .catch(() => { throw failure('CLOSE_FAILED'); });
                    // Retain the rejecting promise for explicit drain, without
                    // an unhandled rejection when invalidation initiates close.
                    closing.catch(() => {});
                }
                return closing || Promise.resolve();
            };
            const cancel = () => { void close(); };
            signal?.addEventListener('abort', cancel, {once: true});
            try {
                // Only an opaque device reference and cancellation cross this
                // boundary. No cloud/NAS/Emby account mapping is defined here.
                lease = await provider.open({deviceRef, signal: controller.signal});
                if (!lease || typeof lease.close !== 'function') throw failure('INVALID_LEASE');
                if (closed) {
                    await close();
                    throw failure('CONNECTION_ABORTED');
                }
                if (!Number.isFinite(lease.expiresAt)) throw failure('UNVERIFIED_LEASE');
            } catch (error) {
                await close();
                throw failure(closed && signal?.aborted ? 'CONNECTION_ABORTED' :
                    ['INVALID_LEASE', 'UNVERIFIED_LEASE'].includes(error?.code) ? error.code : 'OPEN_FAILED');
            }
            // Snapshot local mock declarations; missing capability stays unknown.
            const expiresAt = lease.expiresAt;
            const capabilities = Object.freeze(Object.fromEntries(CAPABILITIES.map(key =>
                [key, [true, false].includes(lease.capabilities?.[key]) ? lease.capabilities[key] : 'unknown'])));
            const live = () => {
                if (closed) throw failure('CONNECTION_CLOSED');
                if (now() >= expiresAt) {
                    void close();
                    throw failure('LEASE_EXPIRED');
                }
            };
            try { live(); } catch (error) { await close(); throw error; }
            return Object.freeze({
                capabilities,
                expiresAt,
                close,
                // Revocation events would be supplied by a documented provider.
                // This local action does not revoke an official service grant.
                invalidate: close,
                async exchange(kind, message, {signal: requestSignal} = {}) {
                    live();
                    if (!CAPABILITIES.includes(kind) || capabilities[kind] !== true) {
                        throw failure('CAPABILITY_UNVERIFIED');
                    }
                    if (typeof lease.exchange !== 'function') throw failure('CAPABILITY_UNVERIFIED');
                    if (requestSignal?.aborted) throw failure('REQUEST_ABORTED');
                    const request = new AbortController();
                    const abort = () => request.abort();
                    controller.signal.addEventListener('abort', abort, {once: true});
                    requestSignal?.addEventListener('abort', abort, {once: true});
                    try {
                        // Opaque pass-through only: no URL rewriting, decoding,
                        // token injection, replay, caching, or route selection.
                        let response;
                        try {
                            response = await lease.exchange(kind, message, {signal: request.signal});
                        } catch {
                            live();
                            throw failure(request.signal.aborted ? 'REQUEST_ABORTED' : 'EXCHANGE_FAILED');
                        }
                        live();
                        if (request.signal.aborted) throw failure('REQUEST_ABORTED');
                        return response;
                    } finally {
                        controller.signal.removeEventListener('abort', abort);
                        requestSignal?.removeEventListener('abort', abort);
                    }
                }
            });
        }
    });
}

module.exports = {createTransport};
