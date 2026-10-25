(function (factory) {
    if (typeof define === 'function' && define.amd) define(['./playback-range-renderer.js'], factory);
    else if (typeof module === 'object' && module.exports) module.exports = factory(require('./playback-range-renderer'));
}(function (contextProvider) {
    'use strict';
    async function bind(options) {
        if (!options.endpoint.retentionContext || !options.endpoint.retentionContext.enabled || options.signal.aborted) return null;
        var current = contextProvider.capture(options.connectionManager, options.item, options.mediaSource, options.options, options.source);
        var binding = options.endpoint.createRetentionContextBinding(), closed = false, closing;
        function close() {if (closing) return closing; closed = true; options.signal.removeEventListener('abort', abort); closing = Promise.resolve().then(function () {return binding.retire();}).catch(function () {}); return closing;}
        function abort() {void close();}
        options.signal.addEventListener('abort', abort, {once: true});
        try {
            if (!options.isCurrent() || !current()) {await close(); return null;}
            await binding.setContext(current());
            if (closed || options.signal.aborted || !options.isCurrent() || !current()) {await close(); return null;}
            return {close: close, started: function () {if (!closed && options.isCurrent() && current()) binding.sample().catch(function () {});}};
        } catch (_) {await close(); return null;}
    }
    return {bind: bind};
}));
