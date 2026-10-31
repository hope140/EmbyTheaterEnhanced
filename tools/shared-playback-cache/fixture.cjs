'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const {performance} = require('node:perf_hooks');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
async function source({bytes = 2 * 1024 * 1024, firstDelay = 20, tailDelay = 100, paceMs = 0, chunkBytes = 65536, data: supplied, etag = false} = {}) {
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 4096 || chunkBytes > 1048576) throw Error('fixture-chunk-limit');
  let data = supplied || Buffer.allocUnsafe(bytes);
  if (!supplied) for (let n = 0; n < data.length; n++) data[n] = (n * 17 + (n >>> 9)) & 255;
  let allowed = true, modified = 'Wed, 21 Oct 2026 08:00:00 GMT', tag = '"fixture-v1"';
  const requests = [], sockets = new Set();
  const server = http.createServer(async (req, res) => {
    const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    const start = match ? Number(match[1]) : 0, end = match && match[2] ? Number(match[2]) : data.length - 1;
    const row = {start, end, createdAt: performance.now(), firstAt: null, tailAt: null, scheduled: 0, flushed: 0, closed: false}; requests.push(row);
    res.once('close', () => {row.closed = true;});
    if (!allowed) {res.writeHead(403); res.end(); return;}
    if (req.headers['if-match'] && req.headers['if-match'] !== tag) {res.writeHead(412); res.end(); return;}
    if (start < 0 || end < start || end >= data.length) {res.writeHead(416); res.end(); return;}
    const headers = {'Content-Length': end - start + 1, 'Content-Type': 'application/octet-stream', 'Last-Modified': modified};
    if (match) headers['Content-Range'] = `bytes ${start}-${end}/${data.length}`;
    if (etag) headers.ETag = tag;
    res.writeHead(match ? 206 : 200, headers);
    await delay(firstDelay);
    if (res.destroyed) return;
    const write = (from, to) => {if (res.destroyed) return; row.scheduled += to - from;
      res.write(data.subarray(from, to), error => {if (!error) row.flushed += to - from;});};
    const firstEnd = Math.min(start + 4096, end + 1); row.firstAt = performance.now(); write(start, firstEnd);
    await delay(tailDelay);
    if (res.destroyed) return;
    row.tailAt = performance.now();
    for (let offset = firstEnd; offset <= end; offset += chunkBytes) {
      if (res.destroyed) return;
      write(offset, Math.min(offset + chunkBytes, end + 1));
      if (paceMs) await delay(paceMs);
    }
    if (!res.destroyed) res.end();
  });
  server.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
  await new Promise((resolve, reject) => {
    const failed = error => {server.removeListener('listening', listening); reject(error);};
    const listening = () => {server.removeListener('error', failed); resolve();};
    server.once('error', failed); server.once('listening', listening); server.listen(0, '127.0.0.1');
  });
  const url = 'http://127.0.0.1:' + server.address().port + '/owned-binary';
  return {url, get data() {return data;}, requests,
    metadata: () => ({total: data.length, lastModified: modified, ...(etag ? {etag: tag} : {})}),
    grant: () => ({url, origin: new URL(url).origin, metadata: {total: data.length, lastModified: modified, ...(etag ? {etag: tag} : {})}}),
    allow(value) {allowed = value;}, mutate({sameMetadata = false} = {}) {data = Buffer.from(data); data[0] ^= 255;
      if (!sameMetadata) {tag = '"fixture-v2"'; modified = 'Thu, 22 Oct 2026 08:00:00 GMT';}},
    grow() {data = Buffer.concat([data, Buffer.alloc(65536)]);},
    close: async () => {for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve));}};
}
function get(url, start, length, {onFirst, signal, pauseAfterFirstMs = 0, openEnded = false} = {}) {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const request = http.get(url, {headers: {Range: `bytes=${start}-${openEnded ? '' : start + length - 1}`, Connection: 'close'}, agent: false, signal}, response => {
      let firstAt = null; const chunks = [];
      response.on('data', chunk => {if (firstAt === null) {firstAt = performance.now(); onFirst?.(firstAt);
        if (pauseAfterFirstMs) {response.pause(); setTimeout(() => response.resume(), pauseAfterFirstMs);}}
        chunks.push(chunk);});
      response.once('error', reject);
      response.once('end', () => {const ended = performance.now(), body = Buffer.concat(chunks);
        resolve({status: response.statusCode, body, firstAt, ttfbMs: firstAt === null ? null : firstAt - started,
          durationMs: ended - started, bytesPerSecond: body.length * 1000 / (ended - started), hash: hash(body)});});
    }); request.once('error', reject);
  });
}
const identity = (item = 'A', account = 'account-owned') => ({server: 'owned-loopback', account, item,
  mediaSource: 'version1', resource: 'owned-file-' + item, representation: 'static-file'});
module.exports = {source, get, identity, hash, delay};
