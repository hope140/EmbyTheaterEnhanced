(function (factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
}(function () {
    'use strict';
    const PREFIX = '--ete-page-cache-';
    const RENDERER = PREFIX + 'renderer=';
    function invalid() { throw new Error('Invalid isolated page cache test configuration.'); }
    function validate(value) {
        if (!value || Object.getPrototypeOf(value) !== Object.prototype ||
            !['enabled,maxBytes,maxEntries,ttlMs', 'enabled,homeFlow,maxBytes,maxEntries,ttlMs'].includes(Object.keys(value).sort().join(',')) || typeof value.enabled !== 'boolean') invalid();
        for (const [key, limit] of [['ttlMs', 300000], ['maxEntries', 1024], ['maxBytes', 33554432]]) {
            if (!Number.isSafeInteger(value[key]) || value[key] < 1 || value[key] > limit) invalid();
        }
        const result = {enabled: value.enabled, ttlMs: value.ttlMs, maxEntries: value.maxEntries, maxBytes: value.maxBytes};
        if (Object.hasOwn(value, 'homeFlow')) {
            if (!['baseline', 'retain', 'sections'].includes(value.homeFlow)) invalid();
            result.homeFlow = value.homeFlow;
        }
        return Object.freeze(result);
    }
    function parse(args) {
        if (!args.some(arg => typeof arg === 'string' && arg.startsWith(PREFIX))) return null;
        const names = ['test', 'ttl-ms', 'max-entries', 'max-bytes'], values = {};
        if (args.length !== names.length && args.length !== names.length + 1) invalid();
        for (const arg of args) {
            const match = /^--ete-page-cache-([a-z-]+)=([a-z0-9]+)$/.exec(arg);
            if (!match || !names.concat('home-flow').includes(match[1]) || Object.hasOwn(values, match[1])) invalid();
            values[match[1]] = match[2];
        }
        if (!['enabled', 'disabled'].includes(values.test)) invalid();
        for (const name of names.slice(1)) if (!/^[1-9][0-9]*$/.test(values[name])) invalid();
        return validate(Object.assign({enabled: values.test === 'enabled', ttlMs: Number(values['ttl-ms']),
            maxEntries: Number(values['max-entries']), maxBytes: Number(values['max-bytes'])},
            Object.hasOwn(values, 'home-flow') ? {homeFlow: values['home-flow']} : {}));
    }
    function install(window, args) {
        const selected = args.filter(arg => typeof arg === 'string' && arg.startsWith(RENDERER));
        if (!selected.length) return false;
        if (selected.length !== 1) invalid();
        let value;
        try { value = validate(JSON.parse(selected[0].slice(RENDERER.length))); } catch (_) { invalid(); }
        Object.defineProperty(window, '__etePageCacheTestOptions', {value, writable: false, configurable: false});
        return true;
    }
    return {parse, validate, install, rendererArgument: value => RENDERER + JSON.stringify(validate(value))};
}));
