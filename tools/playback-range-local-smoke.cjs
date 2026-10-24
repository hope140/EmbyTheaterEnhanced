'use strict';
// Offline only: all media is generated here; all HTTP stays on this process's loopback server.
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const run = promisify(execFile);
const {createCache} = require('../src/electronapp/enhanced/playback-range-cache');
async function main() {
    const args = Object.fromEntries(process.argv.slice(2).map(arg => {const n = arg.indexOf('='); if (n < 0) throw Error('explicit-arguments-required'); return [arg.slice(0, n), arg.slice(n + 1)];}));
    if (Object.keys(args).some(k => !['--ffmpeg', '--ffplay', '--out'].includes(k)) || !['--ffmpeg', '--ffplay', '--out'].every(k => args[k] && path.isAbsolute(args[k]))) throw Error('absolute-tool-and-new-output-paths-required');
    const root = path.resolve(__dirname, '..'), out = args['--out'];
    const dirty = await run('git', ['status', '--porcelain=v1'], {cwd: root}); if (dirty.stdout.trim()) throw Error('committed-clean-source-required');
    await fs.mkdir(out, {mode: 0o700}); // Never overwrite an earlier receipt.
    const profile = path.join(out, 'profile'); await fs.mkdir(profile);
    const env = {...process.env, APPDATA: profile, LOCALAPPDATA: profile, MPV_HOME: profile,
        XDG_CONFIG_HOME: profile, XDG_DATA_HOME: profile, XDG_CACHE_HOME: profile, SDL_VIDEODRIVER: 'dummy', SDL_AUDIODRIVER: 'dummy'};
    const source = path.join(out, 'synthetic.mp4');
    await run(args['--ffmpeg'], ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24', '-t', '2', '-an', '-c:v', 'libx264', '-threads', '1', '-crf', '18', '-pix_fmt', 'yuv420p', source], {env, timeout: 20000});
    const body = await fs.readFile(source), tag = '"' + crypto.createHash('sha256').update(body).digest('hex') + '"';
    const transfers = [];
    const server = http.createServer((req, res) => {
        const match = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || '');
        if (!match) {res.writeHead(400); res.end(); return;}
        const start = +match[1], end = +match[2]; transfers.push({start, end});
        res.writeHead(206, {ETag: tag, 'Content-Range': `bytes ${start}-${end}/${body.length}`, 'Content-Length': end - start + 1}); res.end(body.subarray(start, end + 1));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port, cache = await createCache({root: path.join(profile, 'ranges'), blockBytes: 4096, maxBytes: 65536, minFreeBytes: 0, timeoutMs: 2000});
    let handle;
    try {
        handle = await cache.open({source: origin + '/generated.mp4', identity: {serverId: 'offline-server', serverOrigin: origin, accountId: 'offline-fixture', itemId: 'generated', mediaSourceId: 'generated-version', representation: 'static-mp4'}, isCurrent: () => true});
        const decode = input => run(args['--ffmpeg'], ['-nostdin', '-v', 'error', '-i', input, '-map', '0:v:0', '-f', 'framemd5', '-threads', '1', '-'], {env, timeout: 20000, maxBuffer: 1024 * 1024});
        const direct = await decode(source), proxy = await decode(handle.source);
        if (direct.stdout !== proxy.stdout) throw Error('decoded-frame-mismatch');
        await handle.markPlaying();
        await run(args['--ffplay'], ['-loglevel', 'error', '-autoexit', '-an', '-threads', '1', handle.source], {env, timeout: 20000, maxBuffer: 1024 * 1024});
        const occupancy = cache.status(); if (occupancy.bytes > 65536 || occupancy.bytes >= body.length) throw Error('partial-cache-bound-not-exercised');
        await handle.stop(); handle = null; await cache.close();
        const sourceCommit = (await run('git', ['rev-parse', 'HEAD'], {cwd: root})).stdout.trim();
        const toolHashes = {}; for (const key of ['--ffmpeg', '--ffplay']) toolHashes[key.slice(2)] = crypto.createHash('sha256').update(await fs.readFile(args[key])).digest('hex');
        const receipt = {sourceCommit, evidence: 'real local FFmpeg decode and FFplay consumption through the shared range source',
            syntheticMediaBytes: body.length, cachedBytes: occupancy.bytes, cacheLimitBytes: 65536, originRequests: transfers.length,
            originBodyBytes: transfers.reduce((n, row) => n + row.end - row.start + 1, 0), frameMD5Sha256: crypto.createHash('sha256').update(proxy.stdout).digest('hex'),
            decoderMatch: true, playerExit: 0, activeUpstreamAfterClose: cache.status().upstream, toolHashes,
            fixedWindowsHelper: 'NOT_VERIFIED', visibleFramesAndAudio: 'NOT_VERIFIED', realServerOrNAS: 'NOT_ACCESSED'};
        await fs.writeFile(path.join(out, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx'});
        process.stdout.write(JSON.stringify(receipt, null, 2) + '\n');
    } finally {if (handle) await handle.stop(); await cache.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));}
}
main().catch(error => {process.stderr.write('Offline range smoke failed: ' + error.message + '\n'); process.exitCode = 1;});
