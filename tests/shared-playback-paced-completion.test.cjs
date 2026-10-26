'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const http = require('node:http');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const {Readable} = require('node:stream');

const sourcePath = path.resolve(__dirname, '../tools/shared-playback-cache/windows-fixtures.cjs');
const gateKey = '__ete_paced_completion_8ms_gate';
const pacing = {chunkBytes: 16384, chunkDelayMs: 8, firstByteDelayMs: 20, prefixBytes: 2097152, gapBytes: 262144};

function loadFixtures(sourceBytes, gateChunkDelay = false) {
    let source = Buffer.isBuffer(sourceBytes) ? sourceBytes.toString('utf8') : String(sourceBytes);
    assert.match(source, /record\('media-finish'/, 'the actual fixture must emit its own finish evidence');
    let gated = false;
    const delayAnchor = 'await wait(pacing.chunkDelayMs);';
    if (gateChunkDelay) {
        assert.equal(source.split(delayAnchor).length-1,1,'only the inter-chunk wait is controlled');
        source = source.replace(delayAnchor, `await globalThis.${gateKey}();`);
        gated = true;
    }
    const compiled = new Module(sourcePath, module);
    compiled.filename = sourcePath;
    compiled.paths = Module._nodeModulePaths(path.dirname(sourcePath));
    compiled._compile(source, sourcePath);
    return {fixtures: compiled.exports, gated};
}

function deferred() {
    let resolve;
    const promise = new Promise(done => {resolve = done;});
    return {promise, resolve};
}

async function until(predicate, signal, timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
        assert.equal(signal.aborted, false, 'test timeout signal aborted');
        assert(Date.now() < deadline, 'bounded wait expired');
        await new Promise(resolve => setTimeout(resolve, 2));
    }
}

async function startServer(owned, fixtures, root, bytes, record, readStream) {
    const rows = [];
    const server = await fixtures.__testOnlyCreateMediaServer(root,
        {A: {file: 'A.bin', size: bytes.length, etag: '"completion-test"'}}, fixtures.USER_AGENT,
        (type, row) => {const event = {type, ...row}; rows.push(event); record?.(event);}, pacing, readStream);
    owned.push(server);
    return {server, rows};
}

function request(server, range) {
    let req;
    const response = new Promise((resolve, reject) => {
        req = http.get(server.origin + '/Videos/A/stream.avi', {headers: {
            'User-Agent': 'Synthetic-CD2', Range: range, Connection: 'close'
        }, agent: false}, resolve);
        req.once('error', reject);
    });
    return {req, response};
}

async function consume(response, onData = () => {}) {
    const chunks = [];
    let ended = false, closed = false, error = null;
    response.on('data', part => {chunks.push(Buffer.from(part)); onData(part);});
    response.on('error', value => {error = value;});
    response.once('end', () => {ended = true; response.socket?.destroy();});
    response.once('close', () => {closed = true;});
    return {chunks, get body() {return Buffer.concat(chunks);}, get ended() {return ended;}, get closed() {return closed;}, get error() {return error;}};
}

test('paced short ranges finish fully; partial disconnects never report completion', {timeout: 10000}, async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ete-paced-completion-'));
    const owned = [];
    t.after(async () => {
        const settled = await Promise.allSettled(owned.map(server=>server.close()));
        settled.push(...await Promise.allSettled([fs.rm(root,{recursive:true,force:true})]));
        const errors = settled.filter(row=>row.status==='rejected').map(row=>row.reason);
        if(errors.length)throw new AggregateError(errors,'owned-completion-fixture-cleanup-failed');
    });
    const bytes = Buffer.alloc(1000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37 + 11) & 255;
    await fs.writeFile(path.join(root, 'A.bin'), bytes);
    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    const sourceBytes = await fs.readFile(sourcePath);
    const normal = loadFixtures(sourceBytes);
    const normalRun = await startServer(owned, normal.fixtures, root, bytes);

    for (let iteration = 0; iteration < 4; iteration++) {
        const {response: pendingResponse} = request(normalRun.server, 'bytes=0-999');
        const response = await pendingResponse;
        const client = await consume(response);
        await until(() => client.ended && client.closed, t.signal);
        assert.equal(response.statusCode, 206); assert.equal(client.error, null);
        assert.deepEqual(client.body, bytes);
        assert.equal(crypto.createHash('sha256').update(client.body).digest('hex'), digest);
        await until(() => normalRun.rows.some(row => row.type === 'media-close' && row.requestId === iteration + 1), t.signal);
        const closed = normalRun.rows.find(row => row.type === 'media-close' && row.requestId === iteration + 1);
        assert.equal(closed.complete, true);
        assert.equal(closed.finished, true);
        assert.equal(closed.streamReadBytes, 1000);
        t.diagnostic(JSON.stringify({type:'paced-completion-repeat',mode:'normal',iteration,bodyBytes:client.body.length,endCalled:closed.complete,finished:closed.finished}));
        assert.equal(normalRun.rows.filter(row => row.type === 'media-finish' && row.requestId === iteration + 1).length, 1,
            JSON.stringify(normalRun.rows.filter(row => row.requestId === iteration + 1)));
    }
    const normalStopped = await normalRun.server.close();
    assert.equal(normalStopped.activeMediaResponses, 0);
    assert.equal(normalStopped.mediaSockets, 0);
    assert.equal(normalStopped.heldRequests, 0);
    assert.equal(normalStopped.openedRequests, 4);

    const gated = loadFixtures(sourceBytes, true);
    assert.equal(gated.gated,true);
    const gatedRun = await startServer(owned, gated.fixtures, root, bytes);
    for (let iteration = 0; iteration < 4; iteration++) {
        const gate = deferred();
        let invocations = 0;
        globalThis[gateKey] = () => {invocations++; return gate.promise;};
        try {
            const {response: pendingResponse} = request(gatedRun.server, 'bytes=0-999');
            const response = await pendingResponse;
            const client = await consume(response);
            await until(() => client.ended && client.closed, t.signal);
            assert.deepEqual(client.body, bytes);
            assert.equal(client.error, null);
            assert.equal(crypto.createHash('sha256').update(client.body).digest('hex'), digest);
            await until(() => gatedRun.rows.some(row => row.type === 'media-close' && row.requestId === iteration + 1), t.signal);
            const closed = gatedRun.rows.find(row => row.type === 'media-close' && row.requestId === iteration + 1);
            assert.equal(closed.complete, true, 'actual end must precede client close even if a post-body delay would remain blocked');
            assert.equal(closed.finished, true);
            assert.equal(closed.streamReadBytes, 1000);
            t.diagnostic(JSON.stringify({type:'paced-completion-repeat',mode:'gated-final-wait',iteration,bodyBytes:client.body.length,endCalled:closed.complete,finished:closed.finished,chunkWaits:invocations}));
            assert.equal(invocations, 0, 'an exact final body does not enter an inter-chunk wait');
            assert.equal(gatedRun.rows.filter(row => row.type === 'media-finish' && row.requestId === iteration + 1).length, 1);
        } finally {
            gate.resolve(); delete globalThis[gateKey];
        }
    }
    const gatedStopped = await gatedRun.server.close();
    assert.equal(gatedStopped.activeMediaResponses, 0);
    assert.equal(gatedStopped.mediaSockets, 0);
    assert.equal(gatedStopped.heldRequests, 0);

    const partialReadGate = deferred();
    let partialSource;
    const partialStream = () => partialSource = Readable.from((async function* () {
        yield bytes.subarray(0, 400);
        await partialReadGate.promise;
        yield bytes.subarray(400);
    })(), {objectMode: false, highWaterMark: 16384});
    const partialRun = await startServer(owned, normal.fixtures, root, bytes, null, partialStream);
    const partialRequest = request(partialRun.server, 'bytes=0-999');
    try {
        const response = await partialRequest.response;
        const client = await consume(response);
        await until(() => client.body.length >= 400, t.signal);
        assert.equal(client.body.length, 400);
        response.destroy(); partialRequest.req.destroy();
        await until(() => client.closed, t.signal);
        await until(() => partialRun.rows.some(row => row.type === 'media-close'), t.signal);
        partialReadGate.resolve();
        await until(() => partialSource.closed, t.signal);
        assert.equal(partialSource.destroyed,true);
        const closed = partialRun.rows.find(row => row.type === 'media-close');
        assert.equal(client.ended, false);
        assert.equal(closed.complete, false);
        assert.equal(closed.finished, false);
        assert.equal(partialRun.rows.some(row => row.type === 'media-finish'), false);
        assert.equal(client.body.length, 400, 'no bytes arrive after the client disconnects');
        assert.equal(closed.streamReadBytes, 400);
        t.diagnostic(JSON.stringify({type:'paced-completion-partial',bodyBytes:client.body.length,endCalled:closed.complete,finished:closed.finished,clientEnded:client.ended,lateBodyBytes:client.body.length-400}));
    } finally {
        partialReadGate.resolve();
    }
    const partialStopped = await partialRun.server.close();
    assert.equal(partialStopped.activeMediaResponses, 0);
    assert.equal(partialStopped.mediaSockets, 0);
    assert.equal(partialStopped.heldRequests, 0);
});
