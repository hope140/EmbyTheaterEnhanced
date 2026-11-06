'use strict';

// Read-only browser-session probe for an ALREADY REGISTERED gateway mapping.
// No FNID discovery, authentication, cookie extraction, or service registration.
(function (root) {
    function fail(code) { const error = new Error(code); error.code = code; return error; }

    async function probe({enabled = false, apiBasePath, expectedServerId, signal,
        pageUrl = root.location?.href, request = root.fetch?.bind(root)} = {}) {
        if (!enabled) throw fail('PROBE_DISABLED');
        let page;
        try { page = new URL(pageUrl); } catch { throw fail('INVALID_PAGE'); }
        if (page.protocol !== 'https:' || page.username || page.password) throw fail('HTTPS_PAGE_REQUIRED');
        if (root.location && page.origin !== new URL(root.location.href).origin) throw fail('SAME_ORIGIN_REQUIRED');
        // A concrete registered app path must be supplied; do not guess a path
        // from an FNID or rewrite an arbitrary server address.
        if (typeof apiBasePath !== 'string' || !/^\/app\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(apiBasePath)) {
            throw fail('REGISTERED_APP_PATH_REQUIRED');
        }
        if (typeof request !== 'function') throw fail('FETCH_UNAVAILABLE');
        if (signal?.aborted) throw fail('PROBE_ABORTED');
        const controller = new AbortController();
        let timedOut = false;
        const abort = () => controller.abort();
        signal?.addEventListener('abort', abort, {once: true});
        const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 5000);
        let reader;
        let response;
        try {
            const target = new URL(apiBasePath + '/System/Info/Public', page.origin);
            response = await request(target.href, {method: 'GET', credentials: 'same-origin',
                redirect: 'manual', headers: {Accept: 'application/json'}, signal: controller.signal});
            if (controller.signal.aborted) throw fail('PROBE_ABORTED');
            const report = {status: response.status,
                gatewayAccess: response.type === 'opaqueredirect' || response.status >= 300 && response.status < 400
                    ? 'LOGIN_OR_REDIRECT_REQUIRED' : [401, 403].includes(response.status) ? 'ACCESS_DENIED' : 'UNKNOWN',
                embyInfoShape: false, expectedServerMatch: 'NOT_CHECKED',
                range: 'NOT_TESTED', media: 'NOT_TESTED', websocket: 'NOT_TESTED'};
            if (response.status !== 200 || response.redirected ||
                !(response.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) return report;
            if (!response.body) return report;
            reader = response.body.getReader();
            const parts = [];
            let bytes = 0;
            while (true) {
                const part = await reader.read();
                if (controller.signal.aborted) throw fail('PROBE_ABORTED');
                if (part.done) break;
                bytes += part.value.byteLength;
                if (bytes > 65536) throw fail('RESPONSE_TOO_LARGE');
                parts.push(part.value);
            }
            const body = new Uint8Array(bytes);
            let offset = 0;
            for (const part of parts) { body.set(part, offset); offset += part.byteLength; }
            let info;
            try { info = JSON.parse(new TextDecoder().decode(body)); } catch { throw fail('INVALID_JSON'); }
            report.embyInfoShape = typeof info?.Id === 'string' && info.Id.length > 0 &&
                typeof info?.Version === 'string' && /^\d+\.\d+/.test(info.Version);
            if (report.embyInfoShape) {
                report.gatewayAccess = 'INFO_REACHABLE';
                if (typeof expectedServerId === 'string' && expectedServerId) report.expectedServerMatch = info.Id === expectedServerId;
            }
            return report;
        } catch (error) {
            if (controller.signal.aborted) throw fail(timedOut ? 'PROBE_TIMEOUT' : 'PROBE_ABORTED');
            throw fail(['RESPONSE_TOO_LARGE', 'INVALID_JSON'].includes(error?.code) ? error.code : 'PROBE_FAILED');
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
            if (reader) await reader.cancel().catch(() => {});
            else if (response?.body) await response.body.cancel().catch(() => {});
            controller.abort();
        }
    }

    if (typeof module === 'object' && module.exports) module.exports = {probe};
    else root.ETE_FN_MAPPED_EMBY_PROBE = Object.freeze({probe});
})(globalThis);
