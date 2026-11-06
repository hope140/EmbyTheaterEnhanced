(() => {
    'use strict';
    // Metadata-only manual snapshot; no network, DOM content or console history.
    const types = new Set(['script', 'css', 'img', 'fetch', 'xmlhttprequest', 'link', 'other']);
    const number = value => Number.isFinite(value) && value >= 0 ? Math.min(Math.round(value), 1000000000) : null;
    const status = value => Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
    const mime = value => {
        const type = typeof value === 'string' ? value.split(';', 1)[0].trim().toLowerCase() : '';
        return type === 'text/html' ? 'HTML' : type === 'application/json' ? 'JSON' :
            ['application/javascript', 'text/javascript'].includes(type) ? 'SCRIPT' : 'OTHER';
    };
    const navigation = performance.getEntriesByType('navigation')[0];
    const recentResources = performance.getEntriesByType('resource').slice(-32).map(entry => {
        let source = 'OTHER_ORIGIN';
        try { const u = new URL(entry.name); if (u.origin === location.origin) source = 'SAME_ORIGIN'; } catch {}
        return {source, resourceType: types.has(entry.initiatorType) ? entry.initiatorType : 'other', status: status(entry.responseStatus),
            mime: mime(entry.contentType), transferSize: number(entry.transferSize), encodedBodySize: number(entry.encodedBodySize), duration: number(entry.duration)};
    });
    return 'FN_SPA_SAFE_SNAPSHOT ' + JSON.stringify({documentState: ['loading', 'interactive', 'complete'].includes(document.readyState) ? document.readyState : 'UNKNOWN',
        secureContext: typeof isSecureContext === 'boolean' ? isSecureContext : null,
        navigation: {status: status(navigation?.responseStatus), domContentLoaded: number(navigation?.domContentLoadedEventEnd), loaded: number(navigation?.loadEventEnd)},
        recentResources, notes: ['NO_NETWORK_REQUEST', 'NO_PRIVATE_DOM_READ', 'NO_COOKIE_READ', 'NO_CONSOLE_HISTORY_READ']});
})()
