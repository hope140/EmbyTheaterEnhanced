(function (factory) {
    if (typeof define === 'function' && define.amd) define(['exports'], function (exports) { exports.default = factory(); });
    else if (typeof module === 'object' && module.exports) module.exports = factory();
}(function () {
    'use strict';
    // Experimental page DTO storage only. No registration, transport wrapper or persistent storage.
    var resources = ['home-layout', 'home-items', 'media-list', 'item-summary'];
    var sensitive = /^(?:.*token|.*password|.*secret|authorization|authentication|credentials?|headers?|api[-_]?key)$/i;
    function failure(name) { var error = new Error('Page data request unavailable.'); error.name = name; return error; }
    function integer(value, fallback, maximum) {
        value = value === undefined ? fallback : value;
        if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) throw new TypeError('Invalid page cache limit.');
        return value;
    }
    // Restrict keys and values to plain JSON; normalize object keys for equivalent query deduplication.
    // Never accept request/header/auth objects. Each consumer receives its own decoded DTO.
    function encode(value) {
        var seen = new Set();
        function visit(node, depth) {
            if (depth > 64) throw failure('CacheDataError');
            if (typeof node === 'string' && /[?&](?:api[-_]?key|(?:access[-_]?)?token|x-emby-token)=/i.test(node)) throw failure('CacheDataError');
            if (node === null || typeof node === 'string' || typeof node === 'boolean') return node;
            if (typeof node === 'number' && Number.isFinite(node)) return node;
            if (!node || typeof node !== 'object' || seen.has(node)) throw failure('CacheDataError');
            var array = Array.isArray(node);
            if (!array && Object.getPrototypeOf(node) !== Object.prototype && Object.getPrototypeOf(node) !== null) throw failure('CacheDataError');
            seen.add(node);
            if (array && (Object.keys(node).length !== node.length || Object.keys(node).some(function (key) {
                return !/^(?:0|[1-9][0-9]*)$/.test(key) || Number(key) >= node.length;
            }))) throw failure('CacheDataError');
            var result = array ? [] : Object.create(null);
            Object.keys(node).sort().forEach(function (key) {
                if (sensitive.test(key) || /(?:url$|^(?:request|method|mediaSources|playbackInfo)$)/i.test(key)) throw failure('CacheDataError');
                var descriptor = Object.getOwnPropertyDescriptor(node, key);
                if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) throw failure('CacheDataError');
                result[key] = visit(descriptor.value, depth + 1);
            });
            seen.delete(node);
            return result;
        }
        return JSON.stringify(visit(value, 0));
    }
    function create(options) {
        options = options || {};
        var enabled = options.enabled === true;
        var maxEntries = integer(options.maxEntries, 32, 1024);
        var maxBytes = integer(options.maxBytes, 2 * 1024 * 1024, 32 * 1024 * 1024);
        var maxPending = integer(options.maxPending, 8, 128);
        var maxSubscribers = integer(options.maxSubscribers, 64, 1024);
        var timeoutMs = integer(options.requestTimeoutMs, 5000, 60000);
        // Window timers can reject an arbitrary receiver (unlike Node timers).
        // Call the host globals directly rather than rebinding them to clock.
        var clock = options.clock || {now: function () { return Date.now(); },
            setTimeout: function (fn, delay) { return setTimeout(fn, delay); },
            clearTimeout: function (timer) { clearTimeout(timer); }};
        var policies = Object.create(null);
        Object.keys(options.policies || {}).forEach(function (resource) {
            if (resources.indexOf(resource) < 0) throw new TypeError('Unknown page data resource.');
            policies[resource] = integer(options.policies[resource].ttlMs, undefined, 300000);
        });
        var context = null, epoch = 0, disposed = false, clearing = false, bytes = 0;
        var entries = new Map(), pending = new Map();
        function remove(key) {
            var entry = entries.get(key);
            if (entry) { entries.delete(key); bytes -= entry.bytes; }
        }
        function clear() {
            if (clearing) return;
            clearing = true;
            epoch++;
            entries.clear(); bytes = 0;
            try {
                Array.from(pending.values()).forEach(function (record) { record.finish(failure('AbortError')); });
            } finally { clearing = false; }
        }
        function bindContext(value) {
            // A fresh opaque session is mandatory on EVERY login, including the same account.
            // Bind null synchronously at logout and before switching the active client/server/user.
            if (disposed || clearing) throw failure('AbortError');
            if (value !== null && (!value || Object.keys(value).some(function (key) {
                return ['client', 'session', 'serverId', 'userId'].indexOf(key) < 0;
            }) || !value.client || typeof value.client !== 'object' || !value.session || typeof value.session !== 'object' ||
                typeof value.serverId !== 'string' || !value.serverId || typeof value.userId !== 'string' || !value.userId)) {
                context = null; clear();
                throw new TypeError('Authenticated page cache context required.');
            }
            if (value && context && value.client === context.client && value.session === context.session &&
                value.serverId === context.serverId && value.userId === context.userId) return;
            clear();
            context = value && {client: value.client, session: value.session, serverId: value.serverId, userId: value.userId};
        }
        function current(ticket) { return !disposed && !clearing && context !== null && ticket === epoch; }
        function sweep() {
            var now = clock.now();
            entries.forEach(function (entry, key) { if (now >= entry.expires) remove(key); });
        }
        function store(key, text, ttl) {
            sweep(); remove(key);
            // UTF-16 code units bound retained serialized key + data storage conservatively.
            var size = 2 * (key.length + text.length);
            if (size > maxBytes) return;
            while (entries.size >= maxEntries || bytes + size > maxBytes) remove(entries.keys().next().value);
            entries.set(key, {text: text, bytes: size, expires: clock.now() + ttl}); bytes += size;
        }
        function load(request) {
            try { return start(request); } catch (error) { return Promise.reject(error); }
        }
        function start(request) {
            if (!context || disposed || clearing || request && request.signal && request.signal.aborted) throw failure('AbortError');
            if (!request || Object.keys(request).some(function (key) { return ['resource', 'params', 'load', 'signal'].indexOf(key) < 0; }) ||
                resources.indexOf(request.resource) < 0 || typeof request.load !== 'function') throw new TypeError('Approved page data loader required.');
            var paramsText = encode(request.params === undefined ? {} : request.params);
            // Snapshot the descriptor before yielding; callers may reuse/mutate their query object.
            request = {resource: request.resource, params: JSON.parse(paramsText), load: request.load, signal: request.signal};
            var key = request.resource + ':' + paramsText, ticket = epoch;
            var ttl = enabled && policies[request.resource], signal = request.signal;
            sweep();
            var entry = ttl && entries.get(key);
            if (entry) {
                entries.delete(key); entries.set(key, entry);
                return Promise.resolve().then(function () {
                    if (!current(ticket) || signal && signal.aborted) throw failure('AbortError');
                    if (clock.now() >= entry.expires) return load(request);
                    return JSON.parse(entry.text);
                });
            }
            var record = ttl && pending.get(key), fresh = !record;
            if (record && record.subscribers.size >= maxSubscribers) throw failure('CacheCapacityError');
            if (fresh) {
                if (pending.size >= maxPending) throw failure('CacheCapacityError');
                var controller = new AbortController(), pendingKey = ttl ? key : {};
                record = {subscribers: new Set(), deadline: clock.now() + timeoutMs, done: false, timer: null};
                record.finish = function (error, value) {
                    if (record.done) return;
                    if (!current(ticket)) error = failure('AbortError');
                    else if (clock.now() >= record.deadline) error = failure('TimeoutError');
                    var text;
                    if (!error) {
                        try { text = encode(value); } catch (invalid) { error = invalid; }
                    }
                    if (!error && clock.now() >= record.deadline) error = failure('TimeoutError');
                    record.done = true;
                    clock.clearTimeout(record.timer);
                    pending.delete(pendingKey);
                    if (!error && ttl) store(key, text, ttl);
                    // Release the owner before abort handlers or consumer microtasks can re-enter.
                    if (error) controller.abort();
                    Array.from(record.subscribers).forEach(function (subscriber) { subscriber.finish(error, text); });
                };
                record.controller = controller;
                pending.set(pendingKey, record);
                record.timer = clock.setTimeout(function () { record.finish(failure('TimeoutError')); }, timeoutMs);
            }
            var promise = new Promise(function (resolve, reject) {
                var subscriber = {finish: function (error, text) {
                    record.subscribers.delete(subscriber);
                    if (signal) signal.removeEventListener('abort', cancel);
                    if (error) reject(error); else resolve(text);
                }};
                function cancel() {
                    subscriber.finish(failure('AbortError'));
                    if (!record.done && !record.subscribers.size) record.finish(failure('AbortError'));
                }
                record.subscribers.add(subscriber);
                if (signal) signal.addEventListener('abort', cancel, {once: true});
            }).then(function (text) {
                if (!current(ticket) || signal && signal.aborted) throw failure('AbortError');
                return JSON.parse(text);
            });
            if (fresh) Promise.resolve().then(function () {
                if (record.done || !current(ticket)) throw failure('AbortError');
                if (clock.now() >= record.deadline) throw failure('TimeoutError');
                return request.load(record.controller.signal, JSON.parse(paramsText));
            }).then(function (value) { record.finish(null, value); }, function (error) { record.finish(error || failure('CacheDataError')); });
            return promise;
        }
        return {
            bindContext: bindContext,
            load: load,
            // Call BEFORE a write starts (and again after it settles) or an external user/library event.
            invalidate: clear,
            dispose: function () { disposed = true; clear(); context = null; },
            stats: function () { sweep(); return {enabled: enabled, entries: entries.size, retainedBytes: bytes, pending: pending.size}; }
        };
    }
    return {create: create};
}));
