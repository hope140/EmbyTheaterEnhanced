'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {Readable} = require('node:stream');
const {installMediaCheck} = require('../prototypes/fn-connect/client/media-check.cjs');
const {createController} = require('../prototypes/fn-connect/client/controller.cjs');
const {createElectronIO} = require('../prototypes/fn-connect/client/electron-io.cjs');
function setup({closeFailure, base = 'https://media.example.test/emby/'} = {}) {
    const handlers = {}, reports = [];
    let closed = 0, deadline, active = true;
    const session = {webRequest: {}, closeAllConnections() {
        closed++;
        if (closeFailure === 'throw') throw new Error('SYNTHETIC_CLOSE_FAILED');
        return closeFailure === 'reject' ? Promise.reject(new Error('SYNTHETIC_CLOSE_FAILED')) : Promise.resolve();
    }};
    for (const name of ['onBeforeRequest', 'onHeadersReceived']) session.webRequest[name] = (filter, callback) => { handlers[name] = filter === null ? null : callback; };
    const observer = installMediaCheck(session, base, {onReport: value => reports.push(value),
        schedule(callback) { deadline = callback; return {unref() {}}; }, unschedule() { active = false; }});
    function call(name, details) {
        let result, calls = 0;
        handlers[name](details, value => { result = value; calls++; });
        assert.equal(calls, 1); return result;
    }
    return {handlers, reports, observer, call, closed: () => closed, timerActive: () => active,
        timeout: () => { if (active) deadline(); }};
}
test('guard allows only the configured target and never reads login payload, tokens or request headers', () => {
    const x = setup();
    const details = {url: 'https://media.example.test/emby/Users/AuthenticateByName?api_key=private-canary', resourceType: 'xhr'};
    for (const key of ['uploadData', 'requestHeaders']) Object.defineProperty(details, key, {get() { throw new Error('PRIVATE_DATA_READ'); }});
    assert.deepEqual(x.call('onBeforeRequest', details), {cancel: false});
    for (const value of ['https://outside.example.test/media?api_key=private-canary', 'http://media.example.test/emby/file',
        'https://media.example.test/other/file', 'https://user:password@media.example.test/emby/file', 'file:///private-canary']) {
        assert.deepEqual(x.call('onBeforeRequest', {url: value}), {cancel: true});
    }
    assert.equal(JSON.stringify(x.reports).includes('private-canary'), false);
    assert.equal(JSON.stringify(x.reports).includes('password'), false);
});
test('same-origin 302 remains gated and its external next hop is blocked before headers are sent', () => {
    const x = setup();
    assert.deepEqual(x.call('onHeadersReceived', {url: 'https://media.example.test/emby/stream?api_key=private-canary', statusCode: 302,
        resourceType: 'media', responseHeaders: {Location: ['https://outside.example.test/signed?token=private-canary']}}), {cancel: false});
    assert.deepEqual(x.call('onBeforeRequest', {url: 'https://outside.example.test/signed?token=private-canary'}), {cancel: true});
    assert.deepEqual(x.reports.at(-1), {event: 'diagnostic', result: 'MEDIA_CHECK_EXTERNAL_BLOCKED', scheme: 'HTTPS',
        resourceType: 'other', blockReason: 'ORIGIN_MISMATCH', origin: 'https://outside.example.test'});
    assert.equal(/private-canary|signed/.test(JSON.stringify(x.reports)), false);
});
test('a single 206 yields only validated numeric metadata, cancels before body and latches all requests closed', () => {
    const x = setup();
    const headers = {'Content-Type': ['video/mp4; private-canary=hidden'], 'Content-Range': ['bytes 17-80/1000'], 'Content-Length': ['64']};
    Object.defineProperty(headers, 'Set-Cookie', {enumerable: true, get() { throw new Error('COOKIE_READ'); }});
    Object.defineProperty(headers, 'X-Emby-Token', {enumerable: true, get() { throw new Error('TOKEN_READ'); }});
    assert.deepEqual(x.call('onHeadersReceived', {url: 'https://media.example.test/emby/secret-path?api_key=private-canary',
        statusCode: 206, resourceType: 'media', responseHeaders: headers}), {cancel: true});
    const report = x.reports[0];
    assert.equal(report.event, 'terminal');
    assert.deepEqual(report.range, {start: 17, end: 80, total: 1000});
    assert.equal(report.partial, true); assert.equal(report.bodyRead, false); assert.equal(report.seek, 'NOT_PROVEN');
    assert.equal(report.nativePlayback, 'NOT_TESTED'); assert.equal(x.closed(), 1);
    assert.equal(/private-canary|secret-path|Set-Cookie|X-Emby/.test(JSON.stringify(x.reports)), false);
    assert.deepEqual(x.call('onBeforeRequest', {url: 'https://media.example.test/emby/retry'}), {cancel: true});
    assert.deepEqual(x.call('onHeadersReceived', {url: 'https://media.example.test/emby/retry'}), {cancel: true});
    assert.equal(x.reports.length, 1);
});
test('ordinary login HTML/JSON continues without body or credential inspection', () => {
    const x = setup();
    for (const type of ['text/html', 'application/json']) assert.deepEqual(x.call('onHeadersReceived', {
        url: 'https://media.example.test/emby/login', statusCode: 200, resourceType: 'xhr', responseHeaders: {'content-type': type}
    }), {cancel: false});
    assert.equal(x.closed(), 0); assert.deepEqual(x.reports, []);
});
for (const [status, type, range, length] of [
    [200, 'video/mp4', '', '1000'], [206, 'video/mp4', 'bytes 0-63/1000', '65'],
    [206, 'video/mp4', 'bytes 80-17/1000', '64'], [206, 'text/html', 'secret-canary', 'secret-canary'],
    [206, 'text/html', 'bytes 0-63/1000', '64'],
    [401, 'application/json', '', ''], [416, 'application/octet-stream', 'bytes */1000', ''],
    [200, 'application/vnd.apple.mpegurl', '', '']
]) test('status/MIME metadata does not claim unsupported playback or an invalid range: ' + status + '/' + type + '/' + length, () => {
    const x = setup();
    assert.deepEqual(x.call('onHeadersReceived', {url: 'https://media.example.test/emby/stream', resourceType: 'media', statusCode: status,
        responseHeaders: {'content-type': type, 'content-range': range, 'content-length': length}}), {cancel: true});
    assert.equal(x.reports[0].partial, false);
    assert.equal(x.reports[0].bodyRead, false);
    assert.equal(x.reports[0].nativePlayback, 'NOT_TESTED');
    assert.equal(JSON.stringify(x.reports).includes('secret-canary'), false);
});
test('timeout bounds the check and disposal removes only the owned session hooks', () => {
    const x = setup(); x.timeout();
    assert.deepEqual(x.reports, [{event: 'terminal', result: 'MEDIA_CHECK_TIMEOUT'}]); assert.equal(x.closed(), 1);
    assert.deepEqual(x.call('onBeforeRequest', {url: 'https://media.example.test/emby/file'}), {cancel: true});
    x.observer.dispose();
    assert.equal(x.handlers.onBeforeRequest, null); assert.equal(x.handlers.onHeadersReceived, null);
});

// Synthetic callback inputs exercise policy only. They do not establish which
// schemes Chromium actually dispatches through Session.webRequest.
for (const [scheme, url] of [
    ['CHROME_EXTENSION', 'chrome-extension://synthetic-canary/entry?token=private-canary'],
    ['CHROME_INTERNAL', 'chrome://synthetic-canary/'], ['CHROME_ERROR', 'chrome-error://synthetic-canary/'],
    ['DEVTOOLS', 'devtools://synthetic-canary/'], ['FILE', 'file:///private-canary'],
    ['FILESYSTEM', 'filesystem:https://media.example.test/temporary/private-canary'],
    ['JAVASCRIPT', 'javascript:void(0)'], ['OTHER', 'private-canary-scheme:private-canary'],
    ['HTTP', 'http://media.example.test/emby/stream'], ['WS', 'ws://media.example.test/socket'],
    ['WSS', 'wss://outside.example.test/socket']
]) test('blocked diagnostic contains finite categories only: ' + scheme, () => {
    const x = setup();
    const details = {url, resourceType: 'media'};
    for (const key of ['uploadData', 'requestHeaders', 'responseHeaders', 'referrer', 'initiatorOrigin']) {
        Object.defineProperty(details, key, {get() { throw new Error('PRIVATE_DATA_READ'); }});
    }
    assert.deepEqual(x.call('onBeforeRequest', details), {cancel: true});
    assert.deepEqual(x.reports, [{event: 'diagnostic', result: 'MEDIA_CHECK_EXTERNAL_BLOCKED', scheme, resourceType: 'media',
        blockReason: ['HTTP', 'WS', 'WSS'].includes(scheme) ? 'ORIGIN_MISMATCH' : 'SCHEME_UNSUPPORTED',
        ...(scheme === 'HTTP' ? {origin: 'http://media.example.test'} : {})}]);
    assert.equal(/private-canary|synthetic-canary/i.test(JSON.stringify(x.reports)), false);
    assert.equal(x.timerActive(), true); assert.equal(x.closed(), 0);
    x.observer.dispose();
});
test('invalid URL and unknown resourceType are redacted without ending the check', () => {
    const x = setup();
    assert.deepEqual(x.call('onBeforeRequest', {url: 'private-canary', resourceType: 'private-canary'}), {cancel: true});
    assert.deepEqual(x.reports, [{event: 'diagnostic', result: 'MEDIA_CHECK_INVALID_TARGET', scheme: 'INVALID',
        resourceType: 'other', blockReason: 'INVALID_URL'}]);
    assert.equal(x.timerActive(), true); x.observer.dispose();
});
for (const [url, blockReason, origin] of [
    ['https://outside.example.test/private-canary?signature=private-canary#private-canary', 'ORIGIN_MISMATCH', 'https://outside.example.test'],
    ['https://media.example.test/emby/private-canary%2Fpart?token=private-canary', 'PATH_ENCODING_INVALID', 'https://media.example.test'],
    ['https://media.example.test/other/private-canary?token=private-canary', 'PATH_OUT_OF_SCOPE', 'https://media.example.test'],
    ['https://private-canary:private-canary@media.example.test/emby/private-canary?token=private-canary', 'URL_CREDENTIALS', 'https://media.example.test']
]) test('HTTP(S) diagnostic separates a blocked authority from path/credential failures: ' + blockReason, () => {
    const x = setup();
    assert.deepEqual(x.call('onBeforeRequest', {url, resourceType: 'media'}), {cancel: true});
    assert.deepEqual(x.reports[0], {event: 'diagnostic', result: 'MEDIA_CHECK_EXTERNAL_BLOCKED', scheme: 'HTTPS',
        resourceType: 'media', blockReason, origin});
    assert.equal(JSON.stringify(x.reports).includes('private-canary'), false);
    assert.equal(x.timerActive(), true); assert.equal(x.closed(), 0); x.observer.dispose();
});
test('a legal same-origin redirect still proceeds; only the subsequent external hop is diagnosed and blocked', () => {
    const x = setup();
    const responseHeaders = {};
    Object.defineProperty(responseHeaders, 'Location', {get() { throw new Error('LOCATION_READ'); }});
    assert.deepEqual(x.call('onHeadersReceived', {url: 'https://media.example.test/emby/start', statusCode: 302,
        resourceType: 'media', responseHeaders}), {cancel: false});
    assert.deepEqual(x.call('onBeforeRequest', {url: 'https://media.example.test/emby/next?token=private-canary', resourceType: 'media'}), {cancel: false});
    assert.deepEqual(x.reports, []);
    assert.deepEqual(x.call('onBeforeRequest', {url: 'https://outside.example.test/signed?signature=private-canary', resourceType: 'media'}), {cancel: true});
    assert.equal(x.reports[0].origin, 'https://outside.example.test');
    assert.equal(x.reports[0].blockReason, 'ORIGIN_MISMATCH');
    assert.equal(x.reports[0].event, 'diagnostic'); x.observer.dispose();
});
test('diagnostic refactoring keeps the existing allow/deny boundary for synthetic protocol/path combinations', () => {
    for (const base of ['https://media.example.test/', 'https://media.example.test/emby/']) {
        const x = setup({base}), target = new URL(base);
        function previousAllows(value) {
            try {
                const u = new URL(value);
                if (['data:', 'blob:', 'about:'].includes(u.protocol)) return true;
                if (u.protocol === 'wss:') u.protocol = 'https:';
                else if (u.protocol === 'ws:') u.protocol = 'http:';
                return !u.username && !u.password && u.origin === target.origin &&
                    u.pathname.startsWith(target.pathname) && !/%(?:2f|5c|2e)/i.test(u.pathname);
            } catch { return false; }
        }
        const urls = ['data:text/plain,synthetic', 'blob:https://outside.example.test/synthetic', 'about:blank', 'invalid', 'synthetic:opaque'];
        for (const scheme of ['https', 'http', 'wss', 'ws', 'file']) for (const host of ['media.example.test', 'outside.example.test']) {
            for (const path of ['/emby/stream', '/emby/x%2Fy', '/emby/x%5Cy', '/other/stream']) urls.push(scheme + '://' + host + path);
        }
        for (const url of urls) assert.equal(x.call('onBeforeRequest', {url}).cancel, !previousAllows(url));
        x.observer.dispose();
    }
});
test('local representation and same-origin WebSocket allowances are unchanged', () => {
    const x = setup();
    for (const url of ['data:text/plain,private-canary', 'blob:https://media.example.test/private-canary', 'about:blank',
        'wss://media.example.test/emby/socket']) assert.deepEqual(x.call('onBeforeRequest', {url}), {cancel: false});
    assert.deepEqual(x.reports, []); x.observer.dispose();
});
test('blocked diagnostics leave the deadline alive and cannot replace timeout', async () => {
    const x = setup();
    x.call('onBeforeRequest', {url: 'synthetic-canary:private-canary', resourceType: 'other'});
    assert.equal(x.closed(), 0); assert.equal(x.timerActive(), true);
    x.timeout(); await Promise.resolve();
    assert.deepEqual(x.reports.map(value => [value.event, value.result]), [
        ['diagnostic', 'MEDIA_CHECK_EXTERNAL_BLOCKED'], ['terminal', 'MEDIA_CHECK_TIMEOUT'], ['cleanup', 'MEDIA_CHECK_CONNECTIONS_CLOSED']
    ]);
    x.call('onBeforeRequest', {url: 'synthetic-canary:private-canary'}); x.timeout();
    assert.equal(x.reports.length, 3); x.observer.dispose();
});
test('blocked diagnostic can be followed by a genuine media header terminal', () => {
    const x = setup();
    x.call('onBeforeRequest', {url: 'synthetic-canary:private-canary'});
    x.call('onHeadersReceived', {url: 'https://media.example.test/emby/stream', statusCode: 206, resourceType: 'media',
        responseHeaders: {'content-type': 'video/mp4', 'content-range': 'bytes 0-63/1000', 'content-length': '64'}});
    assert.deepEqual(x.reports.map(value => [value.event, value.result]), [
        ['diagnostic', 'MEDIA_CHECK_EXTERNAL_BLOCKED'], ['terminal', 'MEDIA_CHECK_PARTIAL_HEADERS_OBSERVED']
    ]);
    assert.equal(x.timerActive(), false); assert.equal(x.closed(), 1); x.observer.dispose();
});
test('executor removal before terminal cancels the deadline without inventing timeout or user cancellation', () => {
    const x = setup();
    x.call('onBeforeRequest', {url: 'synthetic-canary:private-canary'});
    x.observer.dispose(); x.timeout();
    assert.equal(x.reports.length, 1); assert.equal(x.reports[0].event, 'diagnostic');
    assert.equal(x.timerActive(), false); assert.equal(x.closed(), 0);
});
for (const closeFailure of ['throw', 'reject']) test('connection cleanup failure has its own event: ' + closeFailure, async () => {
    const x = setup({closeFailure}); x.timeout(); await Promise.resolve();
    assert.deepEqual(x.reports, [{event: 'terminal', result: 'MEDIA_CHECK_TIMEOUT'},
        {event: 'cleanup', result: 'MEDIA_CHECK_CLOSE_UNCONFIRMED'}]);
    assert.equal(x.closed(), 1); x.observer.dispose();
});
test('a failed terminal connection-close prevents preparing or rearming without relaxing the guard', async () => {
    const x = setup({closeFailure: 'reject'}); x.timeout();
    await assert.rejects(x.observer.prepare(), error => error.code === 'MEDIA_CHECK_CLOSE_UNCONFIRMED');
    assert.throws(() => x.observer.rearm(() => {}), error => error.code === 'MEDIA_CHECK_NOT_PREPARED');
    assert.deepEqual(x.call('onBeforeRequest', {url: 'https://media.example.test/emby/'}), {cancel: true});
    x.observer.dispose();
});

test('controller requires ready, retains auth state, and retires late reports with its connection', async () => {
    const session = {}, seen = []; let report;
    const io = {createSession: () => session, async openLogin() { return {close() {}, showTarget() {}}; },
        cookieValues: async () => [], clearSession: async () => {},
        async request() { return {statusCode: 200, headers: {'content-type': 'application/json'}, body: Readable.from([Buffer.from('{"Id":"synthetic","Version":"4.10"}')])}; },
        armMediaCheck(ses, profile, {onReport}) { assert.equal(ses, session); assert.equal(profile.emby.origin, 'https://media.example.test'); report = onReport; }};
    const controller = createController({enabled: true, io});
    const id = controller.add({bootstrapUrl: 'https://nas.example.test', embyUrl: 'https://media.example.test'});
    assert.throws(() => controller.armMediaCheck(id), error => error.code === 'FN_AUTH_NOT_READY');
    await controller.start(id); await controller.verify(id);
    controller.armMediaCheck(id, {onReport: value => seen.push(value)});
    report({result: 'MEDIA_CHECK_HEADERS_ONLY'});
    assert.equal(controller.snapshot(id).state, 'ready'); assert.equal(seen.length, 1);
    await controller.close(id); report({result: 'late'});
    assert.equal(seen.length, 1);
});

test('Electron cleanup clears storage but retains a frozen guard against late background requests', async () => {
    const order = [], handlers = {}, session = {webRequest: {onBeforeRequest: (filter, fn) => { handlers.request = fn; },
        onHeadersReceived: (filter, fn) => { handlers.response = fn; }},
        async closeAllConnections() { order.push('connections'); }, async clearStorageData() { order.push('storage'); }};
    const io = createElectronIO({});
    io.armMediaCheck(session, {emby: new URL('https://media.example.test/')}, {onReport() {}, webContentsId: 1});
    assert.throws(() => io.armMediaCheck(session, {emby: new URL('https://media.example.test/')}, {onReport() {}, webContentsId: 1}), error => error.code === 'MEDIA_CHECK_ALREADY_ARMED');
    await io.clearSession(session);
    assert.deepEqual(order, ['connections', 'storage']);
    handlers.request({url: 'https://media.example.test/'}, result => assert.equal(result.cancel, true));
    handlers.response({url: 'https://media.example.test/'}, result => assert.equal(result.cancel, true));
});
