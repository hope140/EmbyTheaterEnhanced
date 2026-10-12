'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {EventEmitter} = require('node:events');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const cd2Service = require('../src/electronapp/enhanced/cd2-service');
const cd2Resolver = require('../src/electronapp/resolvers/cd2-resolver');
const strmResolver = require('../src/electronapp/resolvers/strm-resolver');

const TARGET = '/cloud/media/show/season/episode.mkv';
const LOCAL_TARGET = 'X:\\Media\\show\\season\\episode.mkv';
const RPC_STATUS = {
    OK: 0,
    CANCELLED: 1,
    DEADLINE_EXCEEDED: 4,
    NOT_FOUND: 5,
    PERMISSION_DENIED: 7,
    UNAUTHENTICATED: 16,
    UNAVAILABLE: 14
};

function createClock(start) {
    let current = start || 0;
    let sequence = 0;
    const timers = [];

    return {
        now: () => current,
        setTimeout(callback, delay) {
            const timer = {at: current + Math.max(0, Number(delay) || 0), callback, sequence: sequence++, cancelled: false};
            timers.push(timer);
            return timer;
        },
        clearTimeout(timer) {
            if (timer) timer.cancelled = true;
        },
        advance(milliseconds) {
            current += milliseconds;
            while (true) {
                const next = timers.filter(timer => !timer.cancelled && timer.at <= current)
                    .sort((left, right) => left.at - right.at || left.sequence - right.sequence)[0];
                if (!next) return;
                next.cancelled = true;
                next.callback();
            }
        }
    };
}

class FakeClientStream extends EventEmitter {
    constructor() {
        super();
        this.cancelled = false;
    }

    cancel() {
        this.cancelled = true;
    }
}

function fileResponse(filePath, options) {
    return Object.assign({fullPathName: filePath, size: '10', fileType: 'File', isDirectory: false}, options || {});
}

function rpcError(code, message) {
    return Object.assign(new Error(message || 'synthetic grpc error'), {code});
}

function createHarness(options) {
    const settings = options || {};
    const clock = settings.clock || createClock(1000);
    const calls = [];
    const streams = [];
    const diagnostics = [];
    const deferredFinds = [];
    const find = settings.find || (() => ({response: fileResponse(TARGET)}));
    const streamFactory = settings.streamFactory || (() => new FakeClientStream());
    const download = settings.download || (() => ({response: {downloadUrlPath: '/api/static/episode.mkv'}}));
    let clientClosed = false;

    const client = {
        waitForReady(deadline, callback) {
            calls.push({method: 'waitForReady', deadline});
            callback(null);
        },
        FindFileByPath(request, metadata, callOptions, callback) {
            calls.push({method: 'FindFileByPath', request, metadata, options: callOptions});
            const pathIndex = calls.filter(call => call.method === 'FindFileByPath' && call.request.path === request.path).length;
            const planned = find(request.path, calls.filter(call => call.method === 'FindFileByPath').length, request);
            if (typeof settings.deferFind === 'function' && settings.deferFind(request.path, pathIndex)) {
                const deferred = {
                    path: request.path,
                    cancelled: false,
                    deliver(error, response) { callback(error || null, response); }
                };
                deferredFinds.push(deferred);
                return {cancel() { deferred.cancelled = true; calls.push({method: 'find-cancel', path: request.path}); }};
            }
            callback(planned && planned.error || null, planned && planned.response);
            return {cancel() { calls.push({method: 'find-cancel', path: request.path}); }};
        },
        GetSubFiles(request, metadata, callOptions) {
            const stream = streamFactory(request.path);
            calls.push({method: 'GetSubFiles', request, metadata, options: callOptions, stream});
            streams.push(stream);
            return stream;
        },
        GetDownloadUrlPath(request, metadata, callOptions, callback) {
            calls.push({method: 'GetDownloadUrlPath', request, metadata, options: callOptions});
            const callIndex = calls.filter(call => call.method === 'GetDownloadUrlPath').length;
            if (typeof settings.deferDownload === 'function' && settings.deferDownload(request, callIndex)) {
                return {cancel() { calls.push({method: 'download-cancel'}); }};
            }
            const planned = download(request, callIndex);
            callback(planned && planned.error || null, planned && planned.response);
            return {cancel() { calls.push({method: 'download-cancel'}); }};
        },
        close() {
            clientClosed = true;
        }
    };

    const transport = {client, metadata: {}, status: RPC_STATUS};
    const service = cd2Service.createService({
        config: settings.config || {
            enabled: true,
            origin: cd2Service.parseOrigin('http://127.0.0.1:19798'),
            token: 'synthetic-test-token',
            rules: [{id: 'rule-1', enabled: true, originState: 'USER', sourcePrefix: 'X:\\Media', cloudPrefix: '/cloud/media'}],
            directUrlEnabled: true,
            totalBudgetMs: 1200
        },
        now: clock.now,
        setTimeout: clock.setTimeout,
        clearTimeout: clock.clearTimeout,
        onDiagnostic: record => diagnostics.push(record),
        transportFactory: () => transport
    });

    return {
        calls,
        client,
        clock,
        diagnostics,
        deferredFinds,
        get clientClosed() { return clientClosed; },
        service,
        streams,
        transport: {
            resolve: request => service.resolve(request),
            cancel: requestId => service.cancel(requestId)
        }
    };
}

function request(mode, requestId, clock, options) {
    const startedAt = clock.now();
    const value = Object.assign({
        requestId,
        candidates: [LOCAL_TARGET],
        ruleId: 'rule-1',
        mode,
        deadlineAt: startedAt + 1200,
        refreshDeadlineAt: startedAt + 3000
    }, options || {});
    if (!mode) delete value.mode;
    return value;
}

function emitSuccessfulStream(stream, statusFirst) {
    stream.emit('data', {subFiles: [{name: 'ignored synthetic listing entry'}]});
    if (statusFirst) {
        stream.emit('status', {code: RPC_STATUS.OK, details: 'OK'});
        stream.emit('end');
    } else {
        stream.emit('end');
        stream.emit('status', {code: RPC_STATUS.OK, details: 'OK'});
    }
}

async function waitFor(predicate, message) {
    for (let attempt = 0; attempt < 40; attempt++) {
        if (predicate()) return;
        await new Promise(resolve => setImmediate(resolve));
    }
    assert.fail(message || 'condition was not reached');
}

function methodCalls(harness, method) {
    return harness.calls.filter(call => call.method === method);
}

function targetFinds(harness) {
    return methodCalls(harness, 'FindFileByPath').filter(call => call.request.path === TARGET);
}

function foundThenRefreshHarness(options) {
    const settings = Object.assign({}, options || {});
    const previousFind = settings.find;
    const targetCounts = new Map();
    settings.find = (findPath, index, requestValue) => {
        if (previousFind) return previousFind(findPath, index, requestValue);
        if (findPath.toLowerCase().endsWith('.mkv')) {
            const count = (targetCounts.get(findPath) || 0) + 1;
            targetCounts.set(findPath, count);
            if (count === 1) return {error: rpcError(RPC_STATUS.NOT_FOUND)};
            return {response: fileResponse(findPath)};
        }
        return {response: fileResponse(findPath, {fileType: 'Directory', isDirectory: true})};
    };
    return createHarness(settings);
}

test('new missing file refreshes bounded parents, consumes stream to successful completion, rechecks once, then hits', {timeout: 10000}, async () => {
    const harness = foundThenRefreshHarness();
    const pending = harness.service.resolve(request('same-origin', 'refresh-hit', harness.clock));
    await waitFor(() => harness.streams.length === 1, 'refresh stream did not start');

    const refresh = methodCalls(harness, 'GetSubFiles')[0];
    assert.equal(refresh.request.path, '/cloud/media/show/season');
    assert.equal(refresh.request.forceRefresh, true);
    assert.equal(refresh.request.checkExpires, true);
    emitSuccessfulStream(harness.streams[0]);

    const result = await pending;
    assert.equal(result.status, 'hit');
    assert.equal(result.sourceKind, 'cd2-url');
    assert.equal(targetFinds(harness).length, 2);
    assert.equal(methodCalls(harness, 'GetDownloadUrlPath').length, 1);
    assert.equal(harness.streams[0].cancelled, false);
    harness.service.close();
});

test('loopback grpc server verifies proto fields and real server-stream EOF/status behavior', {timeout: 10000}, async () => {
    const protoPath = path.join(__dirname, '..', 'src', 'electronapp', 'enhanced', 'proto', 'clouddrive-v1.proto');
    const definition = protoLoader.loadSync(protoPath, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
    });
    const api = grpc.loadPackageDefinition(definition).clouddrive;
    const server = new grpc.Server();
    const events = [];
    let targetLookups = 0;

    server.addService(api.CloudDriveFileSrv.service, {
        FindFileByPath(call, callback) {
            const requestedPath = call.request.path;
            events.push({method: 'FindFileByPath', path: requestedPath});
            if (requestedPath === TARGET && targetLookups++ === 0) {
                callback({code: grpc.status.NOT_FOUND, details: 'synthetic new file'});
                return;
            }
            callback(null, fileResponse(requestedPath, requestedPath.endsWith('.mkv')
                ? {fileType: 'File'}
                : {fileType: 'Directory'}));
        },
        GetSubFiles(call) {
            events.push({method: 'GetSubFiles', path: call.request.path,
                forceRefresh: call.request.forceRefresh, checkExpires: call.request.checkExpires});
            call.write({subFiles: [{fullPathName: call.request.path + '/synthetic-entry.mkv', fileType: 'File'}]});
            call.end();
        },
        GetDownloadUrlPath(call, callback) {
            events.push({method: 'GetDownloadUrlPath', request: call.request});
            callback(null, {downloadUrlPath: '/api/static/episode.mkv'});
        }
    });

    const port = await new Promise((resolve, reject) => {
        server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (error, boundPort) => {
            if (error) reject(error);
            else resolve(boundPort);
        });
    });
    const service = cd2Service.createService({
        config: {
            enabled: true,
            origin: cd2Service.parseOrigin('http://127.0.0.1:' + port),
            token: 'synthetic-loopback-token',
            rules: [{id: 'rule-1', enabled: true, originState: 'USER', sourcePrefix: 'X:\\Media', cloudPrefix: '/cloud/media'}],
            directUrlEnabled: false,
            totalBudgetMs: 1200
        }
    });

    try {
        const startedAt = Date.now();
        const result = await service.resolve({
            requestId: 'loopback-stream', ruleId: 'rule-1', mode: 'same-origin', candidates: [LOCAL_TARGET],
            deadlineAt: startedAt + 1200, refreshDeadlineAt: startedAt + 3000
        });
        assert.equal(result.status, 'hit');
        assert.equal(result.source, 'http://127.0.0.1:' + port + '/api/static/episode.mkv');
        const refresh = events.find(event => event.method === 'GetSubFiles');
        assert.deepEqual(refresh, {
            method: 'GetSubFiles', path: '/cloud/media/show/season', forceRefresh: true, checkExpires: true
        });
        assert.equal(events.filter(event => event.method === 'FindFileByPath' && event.path === TARGET).length, 2);
        assert.deepEqual(events.filter(event => event.method === 'FindFileByPath').map(event => event.path), [
            TARGET, '/cloud/media/show/season', TARGET
        ]);
        assert.equal(events.filter(event => event.method === 'GetDownloadUrlPath').length, 1);
    } finally {
        service.close();
        await new Promise(resolve => server.tryShutdown(resolve));
    }
});

test('already indexed file takes the unchanged 1200ms hit path with no refresh', {timeout: 10000}, async () => {
    const harness = createHarness();
    const result = await harness.service.resolve(request('same-origin', 'warm-hit', harness.clock));

    assert.equal(result.status, 'hit');
    assert.equal(methodCalls(harness, 'GetSubFiles').length, 0);
    assert.equal(targetFinds(harness).length, 1);
    assert.equal(methodCalls(harness, 'waitForReady')[0].deadline.getTime(), 1200);
    assert.equal(methodCalls(harness, 'FindFileByPath')[0].options.deadline.getTime(), 1350);
    assert.equal(methodCalls(harness, 'GetDownloadUrlPath')[0].options.deadline.getTime(), 1500);
    harness.service.close();
});

test('direct timeout and same-origin fallback share one recovery deadline capped at normal plus 1800ms', {timeout: 10000}, async () => {
    const targetCalls = new Map();
    const clock = createClock(1000);
    const harness = foundThenRefreshHarness({
        clock,
        find(findPath) {
            if (findPath === TARGET) {
                const count = (targetCalls.get(findPath) || 0) + 1;
                targetCalls.set(findPath, count);
                return count === 1
                    ? {error: rpcError(RPC_STATUS.NOT_FOUND)}
                    : {response: fileResponse(TARGET)};
            }
            return {response: fileResponse(findPath, {fileType: 'Directory', isDirectory: true})};
        },
        deferFind(findPath, pathIndex) {
            return findPath === TARGET && pathIndex === 2;
        },
        download(requestValue) {
            if (requestValue.get_direct_url) return null;
            return {response: {downloadUrlPath: '/api/static/episode.mkv'}};
        },
        deferDownload(requestValue) {
            return requestValue.get_direct_url === true;
        }
    });
    const initialTime = clock.now();
    const directRequest = request('direct', 'one-budget', clock, {
        refreshDeadlineAt: Number.MAX_SAFE_INTEGER
    });
    const directPending = harness.service.resolve(directRequest);
    await waitFor(() => harness.streams.length === 1);
    const refreshCall = methodCalls(harness, 'GetSubFiles')[0];
    assert.equal(refreshCall.options.deadline.getTime(), initialTime + 1800);

    clock.advance(1790);
    emitSuccessfulStream(harness.streams[0]);
    await waitFor(() => harness.deferredFinds.length === 1, 'post-refresh target recheck did not start');
    assert.equal(targetFinds(harness).length, 2);
    assert.equal(targetFinds(harness)[1].options.deadline.getTime(), initialTime + 2140);
    clock.advance(349);
    harness.deferredFinds[0].deliver(null, fileResponse(TARGET));
    await waitFor(() => methodCalls(harness, 'GetDownloadUrlPath').length === 1, 'DirectUrl RPC did not start');
    assert.equal(methodCalls(harness, 'GetDownloadUrlPath')[0].options.deadline.getTime(), initialTime + 2500);

    clock.advance(361);
    const direct = await directPending;
    assert.equal(clock.now(), initialTime + 2500);
    assert.equal(direct.status, 'miss');
    assert.equal(direct.reason, 'timeout');

    const sameOrigin = await harness.service.resolve(request('same-origin', 'one-budget', clock, {
        deadlineAt: initialTime + 1200,
        refreshDeadlineAt: Number.MAX_SAFE_INTEGER
    }));
    assert.equal(sameOrigin.status, 'hit');
    assert.equal(sameOrigin.sourceKind, 'cd2-url');
    assert.equal(methodCalls(harness, 'GetSubFiles').length, 1);
    assert.equal(targetFinds(harness).length, 2);
    assert.equal(methodCalls(harness, 'GetDownloadUrlPath').length, 2);
    assert.equal(methodCalls(harness, 'GetDownloadUrlPath')[1].options.deadline.getTime(), initialTime + 3000);
    assert.ok(methodCalls(harness, 'GetDownloadUrlPath')[1].options.deadline.getTime() <= initialTime + 3000);
    harness.service.close();
});

test('cancel during delayed parent probe ignores its late unary callback', {timeout: 10000}, async () => {
    const parent = '/cloud/media/show/season';
    const harness = foundThenRefreshHarness({
        find(findPath) {
            if (findPath === TARGET) return {error: rpcError(RPC_STATUS.NOT_FOUND)};
            return {response: fileResponse(findPath, {fileType: 'Directory', isDirectory: true})};
        },
        deferFind(findPath) {
            return findPath === parent;
        }
    });
    const pending = harness.service.resolve(request('same-origin', 'cancel-parent-probe', harness.clock));
    await waitFor(() => harness.deferredFinds.length === 1, 'parent unary probe did not become pending');
    assert.equal(harness.deferredFinds[0].path, parent);

    assert.equal(harness.service.cancel('cancel-parent-probe'), true);
    const result = await pending;
    assert.equal(result.status, 'cancelled');
    assert.equal(harness.deferredFinds[0].cancelled, true);
    harness.deferredFinds[0].deliver(null, fileResponse(parent, {fileType: 'Directory', isDirectory: true}));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(targetFinds(harness).length, 1);
    assert.equal(methodCalls(harness, 'GetSubFiles').length, 0);
    assert.equal(methodCalls(harness, 'GetDownloadUrlPath').length, 0);
    harness.service.close();
});

test('missing parents probe no more than three levels and never cross cloudPrefix or refresh root', {timeout: 10000}, async () => {
    const harness = createHarness({
        find(findPath) {
            return {error: rpcError(RPC_STATUS.NOT_FOUND)};
        }
    });
    const result = await harness.service.resolve(request('same-origin', 'missing-parents', harness.clock));
    const probed = methodCalls(harness, 'FindFileByPath').map(call => call.request.path);

    assert.equal(result.status, 'miss');
    assert.deepEqual(probed, [
        TARGET,
        '/cloud/media/show/season',
        '/cloud/media/show',
        '/cloud/media'
    ]);
    assert.equal(methodCalls(harness, 'GetSubFiles').length, 0);
    assert.ok(probed.every(value => value.startsWith('/cloud/media')));
    assert.ok(!probed.includes('/') && !probed.includes('/cloud'));
    harness.service.close();
});

test('mapping miss, empty/invalid response, auth failures, timeout and other RPC errors never refresh', {timeout: 10000}, async t => {
    const cases = [
        {name: 'mapping miss', expected: 'mapping_miss', setup: () => ({config: {
            enabled: true,
            origin: cd2Service.parseOrigin('http://127.0.0.1:19798'),
            token: 'synthetic-test-token',
            rules: [{id: 'rule-1', enabled: true, originState: 'USER', sourcePrefix: 'Z:\\Other', cloudPrefix: '/cloud/media'}],
            totalBudgetMs: 1200
        }})},
        {name: 'empty response', expected: 'invalid_file', setup: () => ({find: () => ({response: {}})})},
        {name: 'directory response', expected: 'invalid_file', setup: () => ({find: () => ({response: fileResponse(TARGET, {fileType: 'Directory', isDirectory: true})})})},
        {name: 'unauthenticated', expected: 'auth_failed', setup: () => ({find: () => ({error: rpcError(RPC_STATUS.UNAUTHENTICATED)})})},
        {name: 'permission denied', expected: 'auth_failed', setup: () => ({find: () => ({error: rpcError(RPC_STATUS.PERMISSION_DENIED)})})},
        {name: 'deadline exceeded', expected: 'timeout', setup: () => ({find: () => ({error: rpcError(RPC_STATUS.DEADLINE_EXCEEDED)})})},
        {name: 'unavailable', expected: 'unavailable', setup: () => ({find: () => ({error: rpcError(RPC_STATUS.UNAVAILABLE)})})}
    ];

    for (const value of cases) {
        await t.test(value.name, async () => {
            const harness = createHarness(value.setup());
            const result = await harness.service.resolve(request('same-origin', 'no-refresh-' + value.name.replace(/\W/g, ''), harness.clock));
            assert.equal(result.status, 'miss');
            assert.equal(result.reason, value.expected);
            assert.equal(methodCalls(harness, 'GetSubFiles').length, 0);
            harness.service.close();
        });
    }
});

test('target is not rechecked until both stream end and successful OK status arrive', {timeout: 10000}, async t => {
    for (const statusFirst of [false, true]) {
        await t.test(statusFirst ? 'status before end' : 'end before status', async () => {
            const harness = foundThenRefreshHarness();
            const pending = harness.service.resolve(request('same-origin', 'eof-status-' + statusFirst, harness.clock));
            await waitFor(() => harness.streams.length === 1);
            const stream = harness.streams[0];

            stream.emit('data', {subFiles: [{name: 'discarded'}]});
            if (statusFirst) stream.emit('status', {code: RPC_STATUS.OK});
            else stream.emit('end');
            await new Promise(resolve => setImmediate(resolve));
            assert.equal(targetFinds(harness).length, 1);

            if (statusFirst) stream.emit('end');
            else stream.emit('status', {code: RPC_STATUS.OK});
            await waitFor(() => targetFinds(harness).length === 2, 'target was not rechecked after complete successful stream');
            const result = await pending;
            assert.equal(result.status, 'hit');
            harness.service.close();
        });
    }
});

test('stream RPC error or refresh deadline fails soft without target recheck or download', {timeout: 10000}, async t => {
    await t.test('stream status error', async () => {
        const harness = foundThenRefreshHarness();
        const pending = harness.service.resolve(request('same-origin', 'stream-error', harness.clock));
        await waitFor(() => harness.streams.length === 1);
        harness.streams[0].emit('status', {code: RPC_STATUS.UNAVAILABLE});
        harness.streams[0].emit('end');
        const result = await pending;
        assert.equal(result.status, 'miss');
        assert.equal(harness.streams[0].cancelled, true, 'failed server stream should be cancelled');
        assert.equal(targetFinds(harness).length, 1);
        assert.equal(methodCalls(harness, 'GetDownloadUrlPath').length, 0);
        harness.service.close();
    });

    await t.test('refresh deadline cancels stream', async () => {
        const harness = foundThenRefreshHarness();
        const pending = harness.service.resolve(request('same-origin', 'stream-timeout', harness.clock));
        await waitFor(() => harness.streams.length === 1);
        harness.clock.advance(1800);
        const result = await pending;
        assert.equal(result.status, 'miss');
        assert.equal(harness.streams[0].cancelled, true);
        assert.equal(targetFinds(harness).length, 1);
        harness.streams[0].emit('data', {subFiles: [{name: 'late'}]});
        harness.streams[0].emit('end');
        harness.streams[0].emit('status', {code: RPC_STATUS.OK});
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(targetFinds(harness).length, 1);
        assert.equal(methodCalls(harness, 'GetDownloadUrlPath').length, 0);
        harness.service.close();
    });
});

test('refresh lock and per-parent cooldown suppress duplicate work and expire after 30 seconds', {timeout: 10000}, async () => {
    const replies = [
        {error: rpcError(RPC_STATUS.NOT_FOUND)}, {error: rpcError(RPC_STATUS.NOT_FOUND)},
        {response: fileResponse(TARGET)}, {error: rpcError(RPC_STATUS.NOT_FOUND)},
        {error: rpcError(RPC_STATUS.NOT_FOUND)}, {response: fileResponse(TARGET)}
    ];
    const harness = foundThenRefreshHarness({find(findPath) {
        if (findPath === TARGET) return replies.shift();
        return {response: fileResponse(findPath, {fileType: 'Directory', isDirectory: true})};
    }});
    const first = harness.service.resolve(request('same-origin', 'lock-first', harness.clock));
    await waitFor(() => harness.streams.length === 1);
    const second = await harness.service.resolve(request('same-origin', 'lock-second', harness.clock));
    assert.equal(second.status, 'miss');
    assert.equal(second.reason, 'not_found');
    assert.equal(methodCalls(harness, 'GetSubFiles').length, 1);

    emitSuccessfulStream(harness.streams[0]);
    assert.equal((await first).status, 'hit');
    const cooled = await harness.service.resolve(request('same-origin', 'cooldown', harness.clock));
    assert.equal(cooled.status, 'miss');
    assert.equal(cooled.reason, 'not_found');
    assert.equal(methodCalls(harness, 'GetSubFiles').length, 1);
    assert.ok(harness.diagnostics.some(record => record.event === 'refresh-end' && record.details.reason === 'refresh_cooldown'));

    harness.clock.advance(30000);
    const afterCooldown = harness.service.resolve(request('same-origin', 'after-cooldown', harness.clock));
    await waitFor(() => harness.streams.length === 2);
    emitSuccessfulStream(harness.streams[1]);
    assert.equal((await afterCooldown).status, 'hit');
    assert.equal(methodCalls(harness, 'GetSubFiles').length, 2);
    harness.service.close();
});

test('refresh cooldown index stays bounded at 64 target parents', {timeout: 10000}, async () => {
    const harness = createHarness({find: () => ({error: rpcError(RPC_STATUS.NOT_FOUND)})});
    for (let index = 0; index < 65; index++) {
        const candidate = 'X:\\Media\\parent-' + index + '\\episode.mkv';
        const result = await harness.service.resolve(request('same-origin', 'capacity-' + index, harness.clock, {
            candidates: [candidate]
        }));
        assert.equal(result.status, 'miss');
        assert.equal(result.reason, 'not_found');
    }
    assert.equal(methodCalls(harness, 'GetSubFiles').length, 0);
    assert.ok(harness.diagnostics.some(record => record.event === 'refresh-end' && record.details.reason === 'refresh_capacity'));
    harness.service.close();
});

test('actual cd2Resolver AbortSignal cancels the refresh stream for Stop and Next and ignores late events', {timeout: 10000}, async () => {
    const harness = foundThenRefreshHarness();
    const stopController = new AbortController();
    const stopPending = cd2Resolver.resolve({}, {
        requestId: 'stop-refresh',
        candidates: [LOCAL_TARGET],
        ruleId: 'rule-1',
        mode: 'same-origin',
        deadlineAt: harness.clock.now() + 1200,
        refreshDeadlineAt: harness.clock.now() + 3000,
        signal: stopController.signal,
        cd2Transport: harness.transport
    });
    await waitFor(() => harness.streams.length === 1);
    stopController.abort();
    await assert.rejects(stopPending, error => error && error.name === 'AbortError');
    assert.equal(harness.streams[0].cancelled, true);

    const nextController = new AbortController();
    const nextPending = cd2Resolver.resolve({}, {
        requestId: 'next-refresh-a', candidates: ['X:\\Media\\next\\episode.mkv'], ruleId: 'rule-1', mode: 'same-origin',
        deadlineAt: harness.clock.now() + 1200, refreshDeadlineAt: harness.clock.now() + 3000,
        signal: nextController.signal, cd2Transport: harness.transport
    });
    await waitFor(() => harness.streams.length === 2);
    nextController.abort();
    await assert.rejects(nextPending, error => error && error.name === 'AbortError');
    const nextBPending = cd2Resolver.resolve({}, {
        requestId: 'next-refresh-b', candidates: ['X:\\Media\\other\\episode.mkv'], ruleId: 'rule-1', mode: 'same-origin',
        deadlineAt: harness.clock.now() + 1200, refreshDeadlineAt: harness.clock.now() + 3000,
        cd2Transport: harness.transport
    });
    await waitFor(() => harness.streams.length === 3, 'Next B did not start its independent refresh');
    emitSuccessfulStream(harness.streams[2]);
    const nextB = await nextBPending;
    assert.equal(nextB.type, 'url');
    for (const stream of harness.streams.slice(0, 2)) {
        stream.emit('data', {subFiles: [{name: 'late'}]});
        stream.emit('end');
        stream.emit('status', {code: RPC_STATUS.OK});
    }
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(methodCalls(harness, 'GetDownloadUrlPath').length, 1);
    assert.equal(targetFinds(harness).length, 1);
    assert.equal(methodCalls(harness, 'FindFileByPath').filter(call => call.request.path === '/cloud/media/next/episode.mkv').length, 1);
    harness.service.close();
});

test('service close cancels an active refresh stream and prevents late lookup work', {timeout: 10000}, async () => {
    const harness = foundThenRefreshHarness();
    const pending = harness.service.resolve(request('same-origin', 'close-refresh', harness.clock));
    await waitFor(() => harness.streams.length === 1);
    harness.service.close();
    const result = await pending;
    assert.equal(result.status, 'cancelled');
    assert.equal(harness.streams[0].cancelled, true);
    assert.equal(harness.clientClosed, true);
    harness.streams[0].emit('end');
    harness.streams[0].emit('status', {code: RPC_STATUS.OK});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(targetFinds(harness).length, 1);
    assert.equal(methodCalls(harness, 'GetDownloadUrlPath').length, 0);
});

test('direct unsafe-header miss reuses refresh/recheck result for same-origin without repeating recovery', {timeout: 10000}, async () => {
    const harness = foundThenRefreshHarness({download: requestValue => ({response: {
        downloadUrlPath: '/api/static/episode.mkv',
        directUrl: 'https://cdn.example.test/episode.mkv',
        additionalHeaders: {'X-Synthetic': 'blocked'}
    }})});
    const directPending = harness.service.resolve(request('direct', 'shared-recovery', harness.clock));
    await waitFor(() => harness.streams.length === 1);
    emitSuccessfulStream(harness.streams[0]);
    const direct = await directPending;
    assert.equal(direct.status, 'miss');
    assert.equal(direct.reason, 'unsupported_headers');
    assert.equal(methodCalls(harness, 'GetSubFiles').length, 1);
    assert.equal(targetFinds(harness).length, 2);

    const sameOrigin = await harness.service.resolve(request('same-origin', 'shared-recovery', harness.clock));
    assert.equal(sameOrigin.status, 'hit');
    assert.equal(sameOrigin.sourceKind, 'cd2-url');
    assert.equal(methodCalls(harness, 'GetSubFiles').length, 1);
    assert.equal(targetFinds(harness).length, 2);
    harness.service.close();
});

test('refresh failure continues through actual STRM Mount then Native fallback', {timeout: 10000}, async () => {
    const makeFixture = (hasMount) => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-cd2-refresh-'));
        const sidecarPath = path.join(directory, 'Episode.mkv.strm');
        const localMediaPath = path.join(directory, 'Episode.mkv');
        if (hasMount) fs.writeFileSync(localMediaPath, 'synthetic media fixture');
        return {directory, sidecarPath, localMediaPath, cleanup: () => fs.rmSync(directory, {recursive: true, force: true})};
    };

    for (const hasMount of [true, false]) {
        const fixture = makeFixture(hasMount);
        const harness = createHarness({
            config: {
                enabled: true,
                origin: cd2Service.parseOrigin('http://127.0.0.1:19798'),
                token: 'synthetic-test-token',
                localPrefix: cd2Service.normalizeMappingPrefix(fixture.directory),
                cloudPrefix: cd2Service.normalizeCloudPath('/cloud/media'),
                directUrlEnabled: true,
                totalBudgetMs: 1200
            },
            find(findPath) {
                if (findPath.endsWith('.mkv')) return {error: rpcError(RPC_STATUS.NOT_FOUND)};
                return {error: rpcError(RPC_STATUS.NOT_FOUND)};
            }
        });
        try {
            const result = await strmResolver.resolveAsync({
                item: {Path: fixture.sidecarPath},
                mediaSource: {Path: 'https://media.example.test/Episode.mkv', Container: 'strm'},
                url: 'https://emby.example.test/native',
                playMethod: 'DirectPlay'
            }, {fs, requestId: 'fallback-' + hasMount, cd2Transport: harness.transport});
            assert.equal(result.type, hasMount ? 'local' : 'native');
            assert.equal(result.source, hasMount ? fixture.localMediaPath : 'https://emby.example.test/native');
            assert.equal(result.cd2Reason, 'not_found');
            assert.equal(methodCalls(harness, 'GetSubFiles').length, 0);
        } finally {
            harness.service.close();
            fixture.cleanup();
        }
    }
});
