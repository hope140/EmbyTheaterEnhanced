'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const maintenance = require('../src/electronapp/enhanced/maintenance');

async function withLocalServer(handler, callback) {
    const server = http.createServer(handler);
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    try {
        return await callback('http://127.0.0.1:' + server.address().port);
    } finally {
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
        await new Promise(resolve => server.close(() => resolve()));
    }
}

function withTestDeadline(promise, timeoutMs) {
    let timer;
    return Promise.race([
        promise,
        new Promise((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error('test-local deadline exceeded')), timeoutMs);
        })
    ]).finally(() => clearTimeout(timer));
}

test('update version ordering preserves numeric prerelease identifiers beyond safe integers', () => {
    assert.equal(maintenance.compareVersions('0.2.3-9007199254740992', '0.2.3-9007199254740993'), -1);
    assert.equal(maintenance.compareVersions('0.2.3-9007199254740993', '0.2.3-9007199254740992'), 1);
    assert.equal(maintenance.compareVersions('0.2.3-0002', '0.2.3-2'), 0);
});

test('release request enforces a total deadline while response bytes keep arriving', async () => {
    let dripTimer;
    let response;
    await withLocalServer((_request, outgoing) => {
        response = outgoing;
        outgoing.writeHead(200, {'content-type': 'application/json'});
        const body = Buffer.from(JSON.stringify({tag_name: '0.2.3'}));
        let index = 0;
        dripTimer = setInterval(() => {
            if (index >= body.length) {
                clearInterval(dripTimer);
                outgoing.end();
                return;
            }
            outgoing.write(body.subarray(index, index + 1));
            index++;
        }, 25);
    }, async baseUrl => {
        try {
            await withTestDeadline(
                assert.rejects(maintenance.requestLatestJson(baseUrl, {timeoutMs: 60}), /release-request-timeout/),
                1500
            );
        } finally {
            clearInterval(dripTimer);
            if (response && !response.destroyed) response.destroy();
        }
    });
});

test('release request rejects when a response closes before its body is complete', async () => {
    let closeTimer;
    let response;
    await withLocalServer((_request, outgoing) => {
        response = outgoing;
        outgoing.writeHead(200, {'content-type': 'application/json'});
        outgoing.write('{"tag_');
        closeTimer = setTimeout(() => outgoing.destroy(), 20);
    }, async baseUrl => {
        try {
            await withTestDeadline(
                assert.rejects(maintenance.requestLatestJson(baseUrl, {timeoutMs: 1000})),
                300
            );
        } finally {
            clearTimeout(closeTimer);
            if (response && !response.destroyed) response.destroy();
        }
    });
});

test('non-success release response rejects and closes a body that keeps arriving', async () => {
    let dripTimer;
    let response;
    let bodyChunksWritten = 0;
    let markResponseClosed;
    const responseClosed = new Promise(resolve => { markResponseClosed = resolve; });
    await withLocalServer((_request, outgoing) => {
        response = outgoing;
        outgoing.writeHead(503, {'content-type': 'application/json'});
        outgoing.on('close', () => {
            clearInterval(dripTimer);
            markResponseClosed();
        });
        dripTimer = setInterval(() => {
            if (outgoing.destroyed) {
                clearInterval(dripTimer);
                return;
            }
            outgoing.write('x');
            bodyChunksWritten++;
        }, 20);
    }, async baseUrl => {
        try {
            await assert.rejects(maintenance.requestLatestJson(baseUrl, {timeoutMs: 1000}), /release-http-503/);
            await withTestDeadline(responseClosed, 300);
            assert.ok(bodyChunksWritten < 15, 'the client stopped receiving the streamed error body');
        } finally {
            clearInterval(dripTimer);
            if (response && !response.destroyed) response.destroy();
        }
    });
});

test('release request clears its deadline when transport.get throws synchronously', async () => {
    const originalGet = http.get;
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    let deadlineTimer;
    let deadlineCleared = false;
    http.get = function () { throw new Error('synthetic synchronous transport failure'); };
    global.setTimeout = function (callback, timeoutMs) {
        const timer = originalSetTimeout(callback, timeoutMs);
        if (timeoutMs === 75) deadlineTimer = timer;
        return timer;
    };
    global.clearTimeout = function (timer) {
        if (timer === deadlineTimer) deadlineCleared = true;
        return originalClearTimeout(timer);
    };
    try {
        await assert.rejects(
            maintenance.requestLatestJson('http://127.0.0.1:1', {timeoutMs: 75}),
            /synthetic synchronous transport failure/
        );
        assert.ok(deadlineTimer, 'the request deadline timer was installed');
        assert.equal(deadlineCleared, true, 'settling a synchronous transport error clears the deadline timer');
    } finally {
        http.get = originalGet;
        global.setTimeout = originalSetTimeout;
        global.clearTimeout = originalClearTimeout;
        if (deadlineTimer) originalClearTimeout(deadlineTimer);
    }
});

test('Release URL allowlist rejects normalized traversal and keeps a valid tag URL', () => {
    const fallback = maintenance.RELEASES_URL;
    const unsafe = [
        'https://github.com/hope140/EmbyTheaterEnhanced/releases/../../../settings/profile',
        'https://github.com/hope140/EmbyTheaterEnhanced/releases/%2e%2e/%2e%2e/%2e%2e/settings/profile',
        'https://github.com/hope140/EmbyTheaterEnhanced/releases\\..\\..\\..\\settings\\profile'
    ];
    for (const url of unsafe) assert.equal(maintenance.safeReleaseUrl(url), fallback, url);
    assert.equal(
        maintenance.safeReleaseUrl('https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.3'),
        'https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.3'
    );
    assert.equal(
        maintenance.safeReleaseUrl('https://github.com/hope140/embytheaterenhanced/releases/tag/v0.2.3'),
        'https://github.com/hope140/embytheaterenhanced/releases/tag/v0.2.3'
    );
});
