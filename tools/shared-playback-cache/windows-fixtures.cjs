'use strict';

// Deterministic, local-only AVI and service fixtures for Windows playback trials.
// No encoder, downloaded media, NAS, or application preference is involved.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const {fixtureServer} = require('../../tests/helpers/next-prefix-alameda.cjs');

const WIDTH = 320, HEIGHT = 180, FPS = 12;
const FPS_BY_ID = Object.freeze({A: 12, B: 24, C: 24});
const DURATIONS = Object.freeze({A: 16, B: 8, C: 8});
const USER_AGENT = 'Synthetic-CD2';
const PROTO = path.join(__dirname, '../../src/electronapp/enhanced/proto/clouddrive-v1.proto');
const need = (value, code) => {if (!value) throw Error(code);};

function chunk(tag, body) {
    const header = Buffer.alloc(8); header.write(tag, 0, 4, 'ascii'); header.writeUInt32LE(body.length, 4);
    return [header, body, body.length % 2 ? Buffer.alloc(1) : null].filter(Boolean);
}
function list(tag, parts) {
    const bodyLength = 4 + parts.reduce((sum, part) => sum + part.reduce((n, b) => n + b.length, 0), 0);
    const header = Buffer.alloc(12); header.write('LIST'); header.writeUInt32LE(bodyLength, 4); header.write(tag, 8, 4, 'ascii');
    return [header, ...parts.flat()];
}
function mainHeader(frames, frameBytes, fps) {
    const body = Buffer.alloc(56);
    [Math.round(1e6 / fps), frameBytes * fps, 0, 16, frames, 0, 1, frameBytes, WIDTH, HEIGHT].forEach((value, index) => body.writeUInt32LE(value, index * 4));
    return chunk('avih', body);
}
function streamHeader(frames, frameBytes, fps) {
    const body = Buffer.alloc(56); body.write('vidsDIB '); body.writeUInt32LE(1, 20); body.writeUInt32LE(fps, 24);
    body.writeUInt32LE(frames, 32); body.writeUInt32LE(frameBytes, 36); body.writeUInt32LE(0xffffffff, 40);
    body.writeInt16LE(WIDTH, 52); body.writeInt16LE(HEIGHT, 54);
    return chunk('strh', body);
}
function formatHeader(frameBytes) {
    const body = Buffer.alloc(40 + 256 * 4); body.writeUInt32LE(40, 0); body.writeInt32LE(WIDTH, 4); body.writeInt32LE(HEIGHT, 8);
    body.writeUInt16LE(1, 12); body.writeUInt16LE(8, 14); body.writeUInt32LE(0, 16); body.writeUInt32LE(frameBytes, 20);
    body.writeUInt32LE(256, 32); body.writeUInt32LE(256, 36);
    for (let i = 0; i < 256; i++) {const at = 40 + i * 4; body[at] = i; body[at + 1] = (i * 3) & 255; body[at + 2] = (i * 7) & 255;}
    return chunk('strf', body);
}
function frameBytes() {return WIDTH * HEIGHT;}
function makeFrame(index, variant) {
    const data = Buffer.alloc(frameBytes());
    // Bottom-up, 8-bit palette indices with item/frame/position variation.
    const salt = variant.charCodeAt(0);
    for (let p = 0; p < data.length; p++) data[p] = (index * 19 + (p % WIDTH) + Math.floor(p / WIDTH) * 11 + salt) & 255;
    return data;
}
async function writeAll(handle, buffer, position) {
    let offset = 0;
    while (offset < buffer.length) {
        const {bytesWritten} = await handle.write(buffer, offset, buffer.length - offset, position + offset);
        if (!bytesWritten) throw Error('fixture-short-write');
        offset += bytesWritten;
    }
}
async function hashFile(file) {
    const hash = crypto.createHash('sha256');
    for await (const part of fs.createReadStream(file)) hash.update(part);
    return hash.digest('hex');
}
async function writeAvi(root, id) {
    const fps = FPS_BY_ID[id], file = path.join(root, id + '.avi'), frames = DURATIONS[id] * fps, bytes = frameBytes();
    // Build the small RIFF header and index in memory; media frames are written one at a time.
    const avih = mainHeader(frames, bytes, fps), strl = list('strl', [streamHeader(frames, bytes, fps), formatHeader(bytes)]),
        hdrl = list('hdrl', [avih, strl]);
    const mediaChunkBytes = 8 + bytes + (bytes % 2), moviBodyBytes = 4 + frames * mediaChunkBytes;
    const indexBody = Buffer.alloc(frames * 16);
    for (let i = 0; i < frames; i++) {
        const row = i * 16; indexBody.write('00db', row); indexBody.writeUInt32LE(0x10, row + 4);
        indexBody.writeUInt32LE(4 + i * mediaChunkBytes, row + 8); indexBody.writeUInt32LE(bytes, row + 12);
    }
    const index = chunk('idx1', indexBody);
    const riffSize = 4 + hdrl.reduce((n, b) => n + b.length, 0) + 8 + moviBodyBytes + index.reduce((n, b) => n + b.length, 0);
    const riff = Buffer.alloc(12); riff.write('RIFF'); riff.writeUInt32LE(riffSize, 4); riff.write('AVI ', 8);
    const movi = Buffer.alloc(12); movi.write('LIST'); movi.writeUInt32LE(moviBodyBytes, 4); movi.write('movi', 8);
    const handle = await fsp.open(file, 'wx', 0o600);
    try {
        let position = 0;
        for (const buffer of [riff, ...hdrl, movi]) {await writeAll(handle, buffer, position); position += buffer.length;}
        for (let i = 0; i < frames; i++) {
            const data = makeFrame(i, id), prefix = Buffer.alloc(8); prefix.write('00db'); prefix.writeUInt32LE(data.length, 4);
            await writeAll(handle, prefix, position); position += prefix.length;
            await writeAll(handle, data, position); position += data.length;
            if (data.length % 2) {await writeAll(handle, Buffer.alloc(1), position); position++;}
        }
        for (const buffer of index) {await writeAll(handle, buffer, position); position += buffer.length;}
        await handle.sync();
    } catch (error) {
        await handle.close().catch(() => {}); await fsp.unlink(file).catch(() => {}); throw error;
    }
    await handle.close();
    const stat = await fsp.stat(file), sha256 = await hashFile(file);
    need(stat.isFile() && stat.size === riffSize + 8 && stat.size < 20 * 1048576, 'fixture-avi-size');
    return {id, file: id + '.avi', size: stat.size, sha256, etag: '"' + sha256 + '"', durationSeconds: DURATIONS[id],
        dataStart: 12 + hdrl.reduce((n, b) => n + b.length, 0) + 12, frameStride: mediaChunkBytes, frames,
        width: WIDTH, height: HEIGHT, fps, audio: 'none', encoding: 'uncompressed-dib-paletted-8bit'};
}

async function listen(server) {
    await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
    return 'http://127.0.0.1:' + server.address().port;
}
function closeHttp(server, sockets) {
    const closing = [...sockets].map(socket => new Promise(resolve => {
        if (socket.destroyed) {resolve(); return;}
        socket.once('close', resolve);
    }));
    const stopped = new Promise(resolve => server.close(resolve));
    for (const socket of sockets) socket.destroy();
    return Promise.all([stopped, ...closing]);
}
async function createMediaServer(root, files, expectedAgent, record, pacing) {
    if (pacing) need(pacing.chunkBytes === 16384 && pacing.chunkDelayMs === 8 && pacing.firstByteDelayMs === 20 && pacing.prefixBytes === 2097152 && pacing.gapBytes === 262144, 'fixture-pacing-contract');
    const sockets = new Set(), active = new Set(), held = new Set(), closedHeld = [];
    let holdNextItem = null, requestSequence = 0, openedRequests = 0;
    const snapshot = () => ({activeMediaResponses: active.size, mediaSockets: sockets.size, heldRequests: held.size, openedRequests});
    const rememberClosedHold = state => {
        if (closedHeld.length >= 16) closedHeld.shift();
        closedHeld.push(state);
    };
    const server = http.createServer((req, res) => {
        const match = /^\/Videos\/([ABC])\/stream\.avi$/.exec(new URL(req.url, 'http://127.0.0.1').pathname), file = match && files[match[1]];
        if (req.method !== 'GET' || !file || req.headers['user-agent'] !== expectedAgent) {res.writeHead(403).end(); return;}
        const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || ''), start = range ? Number(range[1]) : 0,
            end = range && range[2] ? Number(range[2]) : file.size - 1;
        if (req.headers.range && !range || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || end >= file.size) {res.writeHead(416).end(); return;}
        const headers = {'Content-Type': 'video/x-msvideo', 'Content-Length': end - start + 1, ETag: file.etag, 'Accept-Ranges': 'bytes'};
        if (range) headers['Content-Range'] = `bytes ${start}-${end}/${file.size}`;
        const requestId = ++requestSequence; openedRequests++;
        const state = {requestId, item: match[1], start, end, streamReadBytes: 0, held: false, closed: false, response: res};
        record('media-open', {requestId, item: match[1], start, end, range: !!range});
        active.add(res);
        res.once('close', () => {
            if (state.closed) return;
            state.closed = true; active.delete(res); held.delete(state);
            if (state.held) rememberClosedHold(state);
            record('media-close', {requestId, item: match[1], start, end, actualResponseClosed: true,
                complete: res.writableEnded, streamReadBytes: state.streamReadBytes});
        });
        res.writeHead(range ? 206 : 200, headers);
        if (holdNextItem === match[1] && range && end > start) {
            holdNextItem = null;
            const byte = Buffer.alloc(1), fd = fs.openSync(path.join(root, file.file), 'r');
            try {need(fs.readSync(fd, byte, 0, 1, start) === 1, 'fixture-held-byte-read');} finally {fs.closeSync(fd);}
            state.streamReadBytes = 1; state.held = true; held.add(state);
            res.write(byte);
            record('media-held', {requestId, item: match[1], start, end, firstByteSent: true});
            return;
        }
        const stream = fs.createReadStream(path.join(root, file.file), {start, end, ...(pacing ? {highWaterMark: pacing.chunkBytes} : {})});
        stream.on('data', part => {const at = start + state.streamReadBytes; state.streamReadBytes += part.length;
            record('media-bytes', {requestId, item: match[1], start: at, length: part.length});});
        stream.on('error', () => res.destroy()); res.once('close', () => stream.destroy());
        if (!pacing) stream.pipe(res);
        else {stream.pause(); (async () => {
            let timer; const closed = new Promise(resolve => res.once('close', resolve));
            const wait = ms => Promise.race([new Promise(resolve => {timer = setTimeout(resolve, ms);}), closed]).finally(() => clearTimeout(timer));
            await wait(pacing.firstByteDelayMs);
            for await (const part of stream) {
                if (res.destroyed) break;
                // Keep the initial forward stream bounded while allowing a real
                // later Range/seek to request the missing body. Closing it aborts this wait.
                if (start + state.streamReadBytes > (start < pacing.prefixBytes ? start + pacing.prefixBytes : start + pacing.gapBytes)) {await closed; break;}
                if (!res.write(part)) await Promise.race([new Promise(resolve => res.once('drain', resolve)), closed]);
                await wait(pacing.chunkDelayMs);
            }
            if (!res.destroyed) res.end();
        })().catch(() => res.destroy());}

    });
    server.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
    return {origin: await listen(server), setHoldNext(item) {
        need(item === null || ['A', 'B', 'C'].includes(item), 'fixture-hold-item'); holdNextItem = item;
    }, snapshot,
    async releaseHeld() {
        let released = 0;
        for (const state of [...held]) {
            const response = state.response;
            if (!response || response.destroyed || response.writableEnded || state.closed) {
                held.delete(state); record('media-late-release-attempt', {requestId: state.requestId, item: state.item,
                    actualResponseClosed: true, latewriteacceptedbytes: 0}); continue;
            }
            held.delete(state); state.held = false; released++;
            const stream = fs.createReadStream(path.join(root, files[state.item].file), {start: state.start + 1, end: state.end});
            stream.on('data', part => {state.streamReadBytes += part.length;});
            stream.on('error', () => response.destroy());
            await new Promise(resolve => {response.once('close', resolve); stream.pipe(response);});
            record('media-held-released', {requestId: state.requestId, item: state.item, actualResponseClosed: state.closed});
        }
        while (closedHeld.length) {
            const state = closedHeld.shift();
            record('media-late-release-attempt', {requestId: state.requestId, item: state.item,
                actualResponseClosed: true, latewriteacceptedbytes: 0});
        }
        return released;
    }, async close() {await closeHttp(server, sockets); need(active.size === 0 && held.size === 0, 'fixture-live-media-response'); return snapshot();}};
}
async function createGrpcServer(mediaOrigin, files, token, record) {
    const definition = protoLoader.loadSync(PROTO, {keepCase: true, longs: String, enums: String, defaults: true, oneofs: true});
    const CloudDriveFileSrv = grpc.loadPackageDefinition(definition).clouddrive.CloudDriveFileSrv;
    const server = new grpc.Server();
    server.addService(CloudDriveFileSrv.service, {
        FindFileByPath(call, callback) {
            if (call.metadata.get('authorization')[0] !== 'Bearer ' + token) {callback({code: grpc.status.UNAUTHENTICATED}); return;}
            if (call.request.path === '/') {callback({code: grpc.status.NOT_FOUND}); return;}
            const match = /\/([ABC])\.avi$/.exec(call.request.path), file = match && files[match[1]];
            if (!file) {callback({code: grpc.status.NOT_FOUND}); return;}
            record('cd2-rpc', {method: 'FindFileByPath', item: match[1]});
            callback(null, {fullPathName: call.request.path, size: String(file.size), fileType: 'File', isDirectory: false});
        },
        GetDownloadUrlPath(call, callback) {
            if (call.metadata.get('authorization')[0] !== 'Bearer ' + token) {callback({code: grpc.status.UNAUTHENTICATED}); return;}
            const match = /\/([ABC])\.avi$/.exec(call.request.path), file = match && files[match[1]];
            if (!call.request.get_direct_url || !file) {callback({code: grpc.status.NOT_FOUND}); return;}
            record('cd2-rpc', {method: 'GetDownloadUrlPath', item: match[1], direct: true});
            callback(null, {directUrl: mediaOrigin + '/Videos/' + match[1] + '/stream.avi?fixture=synthetic', userAgent: USER_AGENT,
                expiresIn: '600', additionalHeaders: {}});
        },
        GetSubFiles(call) {call.end();}
    });
    const port = await new Promise((resolve, reject) => server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (error, value) => error ? reject(error) : resolve(value)));
    return {endpoint: 'http://127.0.0.1:' + port, close: () => new Promise((resolve, reject) => {
        const timer = setTimeout(() => {server.forceShutdown(); reject(Error('fixture-grpc-close-timeout'));}, 3000);
        server.tryShutdown(error => {clearTimeout(timer); if (error) reject(Error('fixture-grpc-close-failed')); else resolve();});
    })};
}

async function generateFixtures(root) {
    need(typeof root === 'string' && path.isAbsolute(root), 'fixture-absolute-root-required');
    const realRoot = await fsp.realpath(root), entries = await fsp.readdir(realRoot);
    need(entries.length === 0 && (await fsp.stat(realRoot)).isDirectory(), 'fixture-fresh-root-required');
    const files = Object.create(null);
    for (const id of ['A', 'B', 'C']) files[id] = await writeAvi(realRoot, id);
    return {schema: 1, out: realRoot, autoPlay: true, fixtures: ['A', 'B', 'C'].map(id => files[id]), media: files,
        mediaMetadata: Object.fromEntries(['A', 'B', 'C'].map(id => [id, {durationSeconds: DURATIONS[id], aviFps: FPS_BY_ID[id],
            embyReportedRealFrameRate: id === 'A' ? 12 : 24, audio: 'none'}]))};
}
async function verifyPlan(plan) {
    need(plan?.schema === 1 && typeof plan.out === 'string' && path.isAbsolute(plan.out) && Array.isArray(plan.fixtures) && plan.fixtures.length === 3, 'fixture-plan-invalid');
    const root = await fsp.realpath(plan.out); need(root === plan.out, 'fixture-root-redirected');
    const files = Object.create(null);
    for (const row of plan.fixtures) {
        need(row && ['A', 'B', 'C'].includes(row.id) && row.file === row.id + '.avi' && /^[a-f0-9]{64}$/.test(row.sha256) &&
            Number.isSafeInteger(row.size) && row.size > 0 && row.size < 20 * 1048576, 'fixture-row-invalid');
        const file = path.join(root, row.file), stat = await fsp.lstat(file);
        need(stat.isFile() && !stat.isSymbolicLink() && await fsp.realpath(file) === file && stat.size === row.size && await hashFile(file) === row.sha256, 'fixture-file-identity');
        files[row.id] = row;
    }
    need(Object.keys(files).length === 3 && plan.mediaMetadata?.A?.durationSeconds === 16 && plan.mediaMetadata?.B?.durationSeconds === 8 &&
        plan.mediaMetadata?.C?.durationSeconds === 8 && plan.mediaMetadata?.A?.aviFps === 12 && plan.mediaMetadata?.B?.aviFps === 24 &&
        plan.mediaMetadata?.C?.aviFps === 24, 'fixture-metadata-invalid');
    return {root, files};
}
async function startWindowsSources({plan, requireUserAgent = USER_AGENT, record = () => {}, createEmby, pacing} = {}) {
    need(requireUserAgent === USER_AGENT && typeof record === 'function', 'fixture-agent-fixed');
    const verified = await verifyPlan(plan), files = verified.files, root = verified.root;
    let emby = null, media = null, grpcServer = null, closed = false;
    try {
        emby = createEmby ? await createEmby({plan, record}) : await fixtureServer(plan, record, {trustedCd2: true});
        media = await createMediaServer(root, files, requireUserAgent, record, pacing);
        grpcServer = await createGrpcServer(media.origin, files, 'synthetic-only-token', record);
        return {origin: emby.origin, mediaOrigin: media.origin, cd2Endpoint: grpcServer.endpoint,
            setHoldNext: item => media.setHoldNext(item), snapshot: () => media.snapshot(), releaseHeld: () => media.releaseHeld(),
            async close() {
                if (closed) return; closed = true;
                const results = await Promise.allSettled([emby.close(), media.close(), grpcServer.close()]);
                if (results.some(item => item.status === 'rejected')) throw Error('fixture-server-close');
                return {...results[1].value, grpcStopped: true};
            }};
    } catch (error) {
        await Promise.allSettled([emby?.close(), media?.close(), grpcServer?.close()]); throw error;
    }
}
async function createWindowsFixtures(options = {}) {
    const plan = await generateFixtures(options.root), sources = await startWindowsSources({...options, plan});
    return {plan, files: plan.media, ...sources};
}

module.exports = {WIDTH, HEIGHT, FPS, DURATIONS, USER_AGENT, generateFixtures, startWindowsSources, createWindowsFixtures};
