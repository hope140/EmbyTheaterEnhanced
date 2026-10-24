'use strict';
const {temporaryRoot} = require('./helpers/range-fixture-root.cjs');
const test = require('node:test'), assert = require('node:assert/strict'), http = require('node:http');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const {createCache} = require('../src/electronapp/enhanced/playback-range-cache');
function deferred() {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve};}
async function fixture(t) {
    const root = temporaryRoot('ete-range-weak-', ['']), body = Buffer.from('abcdefghijklmnopqrstuvwxyz012345');
    const rows = [], sockets = new Set(), handles = [], controls = [], entered = deferred(); let activeBackground = 0, peakBackground = 0, sequence = 0;
    const server = http.createServer((req, res) => {
        const match = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || ''), start = +(match && match[1]), end = +(match && match[2]);
        if (!match || end >= body.length) {res.writeHead(416); res.end(); return;}
        const background = req.url.startsWith('/next') && end > start, row = {path: req.url, start, end, order: ++sequence, closed: false, lateBytes: 0}; rows.push(row);
        if (background) {activeBackground++; peakBackground = Math.max(peakBackground, activeBackground);}
        res.once('close', () => {row.closed = true; row.closeOrder = ++sequence; if (background) activeBackground--;});
        res.writeHead(206, {ETag: '"fixed"', 'Content-Range': `bytes ${start}-${end}/${body.length}`, 'Content-Length': end - start + 1});
        if (background) {
            // Tiny controlled weak source: the remainder is withheld, never a real media download.
            res.write(body.subarray(start, start + 1));
            row.release = () => {if (!row.closed && !res.destroyed) {row.lateBytes += end - start; res.end(body.subarray(start + 1, end + 1));}};
            entered.resolve(row);
        } else res.end(body.subarray(start, end + 1));
    });
    server.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
    let cache;
    t.after(async () => {
        for (const controller of controls) controller.abort();
        await Promise.allSettled(handles.map(handle => handle.stop()));
        try {if (cache) await cache.close();} finally {
            const closing = [...sockets].map(socket => new Promise(r => {socket.once('close', r); socket.destroy();}));
            await new Promise(r => server.close(r)); await Promise.all(closing); await fs.rm(root, {recursive: true, force: true});
        }
    });
    await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
    const origin = 'http://127.0.0.1:' + server.address().port;
    cache = await createCache({root, maxBytes: 128, minFreeBytes: 0, blockBytes: 4, timeoutMs: 1000});
    return {cache, rows, entered, body, origin, peak: () => peakBackground,
        control() {const c = new AbortController(); controls.push(c); return c;},
        async open(name, role) {
            const identity = {serverId: 's', serverOrigin: origin, accountId: 'a', itemId: name, mediaSourceId: name, representation: 'r'};
            const handle = await cache.open({source: origin + '/' + name, identity, isCurrent: () => true, role}); handles.push(handle); return handle;
        }};
}
test('automatic background has one request and foreground misses physically preempt a slow response', {timeout: 5000}, async t => {
    const f = await fixture(t), current = await f.open('current'), a = await f.open('next-a', 'next'), b = await f.open('next-b', 'next');
    const ca = f.control(), cb = f.control();
    const first = a.prefetch({maxBytes: 25, signal: ca.signal}); first.catch(() => {}); const held = await f.entered.promise;
    const second = b.prefetch({maxBytes: 25, signal: cb.signal}); second.catch(() => {});
    const response = await fetch(current.source, {headers: {Range: 'bytes=8-11'}}); assert.deepEqual(Buffer.from(await response.arrayBuffer()), f.body.subarray(8, 12));
    const foreground = f.rows.find(row => row.path === '/current' && row.start === 8);
    assert(held.closed); assert(held.closeOrder < foreground.order); assert.equal(f.peak(), 1);
    ca.abort(); cb.abort(); await Promise.allSettled([first, second]); held.release(); assert.equal(held.lateBytes, 0);
    await current.stop(); await a.stop(); await b.stop(); assert.equal(f.cache.status().upstream, 0); assert.equal(f.cache.status().leases, 0);
});
test('cancel while awaiting observed background close sends no foreground origin request', {timeout: 5000}, async t => {
    const f = await fixture(t), current = await f.open('current'), next = await f.open('next-a', 'next');
    const originalRequest = http.request, closeObserved = deferred(), releaseClose = deferred(); let heldOnce = false;
    // Retain the real HTTP socket/body; delay only delivery of its close evidence.
    http.request = function (url, options) {
        const request = originalRequest.apply(this, arguments), emit = request.emit;
        if (new URL(url).pathname === '/next-a' && options.headers.Range !== 'bytes=0-0') {
            request.emit = function (event, ...args) {
                if (event === 'close' && !heldOnce) {heldOnce = true; closeObserved.resolve(); releaseClose.promise.then(() => emit.call(request, event, ...args)); return true;}
                return emit.call(request, event, ...args);
            };
        }
        return request;
    };
    const warming = f.control(), seeking = f.control(); let warm, foreground;
    try {
        warm = next.prefetch({maxBytes: 25, signal: warming.signal}); warm.catch(() => {}); await f.entered.promise;
        foreground = fetch(current.source, {headers: {Range: 'bytes=8-11'}, signal: seeking.signal}); foreground.catch(() => {});
        await closeObserved.promise;
        assert.equal(f.rows.some(row => row.path === '/current' && row.start === 8), false, 'foreground waits for close evidence');
        seeking.abort(); warming.abort(); releaseClose.resolve();
        await assert.rejects(foreground); await Promise.allSettled([warm]);
        assert.equal(f.rows.some(row => row.path === '/current' && row.start === 8), false, 'cancelled foreground never reaches the source');
        await current.stop(); await next.stop(); assert.equal(f.cache.status().upstream, 0); assert.equal(f.cache.status().leases, 0);
    } finally {releaseClose.resolve(); http.request = originalRequest; warming.abort(); seeking.abort(); await Promise.allSettled([warm, foreground].filter(Boolean));}
});
