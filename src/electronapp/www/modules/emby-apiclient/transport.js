define([], function() {
'use strict';

/* Copyright (c) Emby https://emby.media
 * Independent contract adaptations, 2026. MIT; see ./LICENSE.md. */
function abortError() {
    return new DOMException('The operation was aborted.', 'AbortError');
}
const networkErrors = new WeakSet();

function request(request, signal) {
    signal = signal || request.signal;
    if (signal?.aborted) return Promise.reject(abortError());
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = request.timeout ? setTimeout(abort, request.timeout) : null;
    const headers = { ...request.headers };
    if (request.dataType === 'json') headers.accept = 'application/json';
    let body = request.data;
    let contentType = request.contentType;
    if (body && typeof body !== 'string') {
        body = Object.entries(body).filter(([, v]) => v !== null && v !== undefined && v !== '')
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
        contentType ||= 'application/x-www-form-urlencoded; charset=UTF-8';
    }
    if (contentType) headers['Content-Type'] = contentType;
    const cleanup = () => {
        if (timer !== null) clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
    };
    // Keep the bridge alive through response-body consumption as well as headers.
    return Promise.resolve().then(() => {
        if (controller.signal.aborted) throw abortError();
        return fetch(request.url, { headers, method: request.type, credentials: 'same-origin',
            ...(body ? { body } : {}), signal: controller.signal });
    }).then(response => {
        if (controller.signal.aborted) { cleanup(); throw abortError(); }
        return { response, cleanup, signal: controller.signal };
    }, error => {
        cleanup();
        if (error && typeof error === 'object') networkErrors.add(error);
        throw error;
    });
}

function decode(request, response) {
    if (response.status >= 400) return Promise.reject(response);
    if (request.dataType === 'json' || request.headers?.accept === 'application/json') return response.json();
    if (response.status === 204 || request.dataType === 'text' ||
        (response.headers.get('Content-Type') || '').toLowerCase().startsWith('text/')) return response.text();
    return response;
}

function send(requestOptions, signal) {
    return request(requestOptions, signal).then(async ({ response, cleanup, signal: activeSignal }) => {
        try {
            const value = await decode(requestOptions, response);
            if (activeSignal.aborted) throw abortError();
            return value;
        } finally { cleanup(); }
    });
}

function addresses(server, rejectInsecure) {
    const manual = server.ManualAddress;
    let localManual = false;
    try { localManual = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(manual).hostname.toLowerCase()); } catch {}
    const choices = server.ManualAddressOnly || server.manualAddressOnly ? [[manual, 2]] :
        (localManual ? [[manual, 2], [server.LocalAddress, 0], [server.RemoteAddress, 1]] :
            [[server.LocalAddress, 0], [manual, 2], [server.RemoteAddress, 1]]);
    const seen = new Set();
    return choices.filter(([url]) => {
        if (!url || (rejectInsecure && !url.toLowerCase().startsWith('https:'))) return false;
        const key = url.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key); return true;
    }).map(([url, connectionMode]) => ({ url, connectionMode }));
}

function probe(server, makeUrl, rejectInsecure, signal) {
    if (signal?.aborted) return Promise.reject(abortError());
    const entries = addresses(server, rejectInsecure);
    if (!entries.length) return Promise.reject(new Error('No usable server addresses'));
    return new Promise((resolve, reject) => {
        let done = false, failed = 0;
        const jobs = [];
        const retire = () => {
            signal?.removeEventListener('abort', cancel);
            for (const job of jobs) { clearTimeout(job.timer); job.controller.abort(); }
        };
        const cancel = () => {
            if (done) return;
            done = true; retire(); reject(abortError());
        };
        signal?.addEventListener('abort', cancel, { once: true });
        entries.forEach((entry, index) => {
            const controller = new AbortController();
            const job = { controller, timer: null }; jobs.push(job);
            job.timer = setTimeout(() => {
                if (done) return;
                send({ type: 'GET', url: makeUrl(entry.url), dataType: 'json', timeout: 5000 }, controller.signal)
                    .then(data => {
                        if (done) return;
                        done = true; retire(); resolve({ ...entry, data });
                    }, error => {
                        if (done) return;
                        if (++failed === entries.length) { done = true; retire(); reject(error); }
                    });
            }, index * 200);
        });
    });
}

function delay(milliseconds, signal) {
    if (signal?.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
        const finish = () => { signal?.removeEventListener('abort', abort); resolve(); };
        const timer = setTimeout(finish, milliseconds);
        const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(abortError()); };
        signal?.addEventListener('abort', abort, { once: true });
    });
}


const result = { request, decode, send, probe, addresses, abortError, delay,
    isNetworkError: error => !error || (typeof error === 'object' && networkErrors.has(error)) };
Object.defineProperty(result, '__esModule', { value: true });
Object.defineProperty(result, 'default', { value: result });
return result;
});
