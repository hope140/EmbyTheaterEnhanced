'use strict';

// Supplemental local decoder/player evidence. Not the Windows libmpv/D3D11 runtime.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const cp = require('node:child_process');
const {createRuntime} = require('../src/electronapp/enhanced/playback-cache-runtime');
const {parseLaunch, activateProfile} = require('../src/electronapp/enhanced/playback-cache-launch');
const {capture} = require('../src/electronapp/enhanced/playback-cache-context');
const {harness, storage} = require('../tests/helpers/api-client-amd.cjs');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function argument(name) {
    const values = process.argv.slice(2).filter(v => v.startsWith('--' + name + '='));
    if (values.length !== 1) throw Error('required-smoke-argument'); return values[0].slice(name.length + 3);
}
async function main() {
    const out = path.resolve(argument('out'));
    if (fs.existsSync(out) && fs.readdirSync(out).length) throw Error('preserve-existing-evidence');
    fs.mkdirSync(out, {recursive: true, mode: 0o700});
    if (fs.realpathSync(out) !== out) throw Error('nonphysical-evidence-path');
    const ffmpeg = fs.realpathSync(argument('ffmpeg')), ffplay = fs.realpathSync(argument('ffplay')), policy = fs.realpathSync(argument('policy'));
    const profile = path.join(out, 'profile'); fs.mkdirSync(profile);
    const launch = parseLaunch(['--ete-cache-trial', '--ete-cache-trial-config=' + policy, '--ete-cache-trial-profile=' + profile]);
    if (!launch.enabled) throw Error('invalid-smoke-policy');
    const environment = {...process.env}; const appPaths = {};
    activateProfile({setPath: (name, value) => { appPaths[name] = value; }}, launch, environment);
    Object.assign(environment, {SDL_AUDIODRIVER: 'dummy', SDL_VIDEODRIVER: 'dummy', SDL_RENDER_DRIVER: 'software',
        XDG_CACHE_HOME: path.join(profile, 'local'), XDG_CONFIG_HOME: path.join(profile, 'local'), XDG_DATA_HOME: path.join(profile, 'local')});
    function execute(file, args) {
        const result = cp.spawnSync(file, args, {cwd: out, env: environment, encoding: 'utf8', timeout: 30000, maxBuffer: 1048576});
        if (result.error || result.status !== 0) throw Error('local-media-tool-failed'); return result.stdout;
    }
    const source = path.join(out, 'synthetic.mp4');
    execute(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=32x32:r=10:d=0.5', '-f', 'lavfi', '-i',
        'sine=frequency=1000:duration=0.5', '-c:v', 'mpeg4', '-c:a', 'aac', '-shortest', '-y', source]);
    const bytes = fs.readFileSync(source);
    let requests = 0, transferred = 0, authenticated = 0;
    const sockets = new Set();
    const server = http.createServer((request, response) => {
        const url = new URL(request.url, 'http://fixture'); requests++;
        if (url.searchParams.get('api_key') !== 'local-smoke-only') { response.writeHead(403); response.end(); return; }
        authenticated++;
        const range = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range || '');
        if (!range) { response.writeHead(416); response.end(); return; }
        const start = Number(range[1]), end = Number(range[2]);
        if (end >= bytes.length || start > end) { response.writeHead(416); response.end(); return; }
        const chunk = bytes.subarray(start, end + 1); transferred += chunk.length;
        response.writeHead(206, {'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': chunk.length,
            'Content-Type': 'video/mp4', ETag: '"' + sha(bytes) + '"'}); response.end(chunk);
    });
    server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
    let runtime = null, player = null, playerClosed = null, exitResolve = () => {};
    try {
        await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
        const origin = `http://127.0.0.1:${server.address().port}`;
        const api = new (harness().load('apiclient.js').default)(storage(), () => Promise.resolve(), origin, 'ETE', 'local-smoke', 'Synthetic', 'fixture-device', 1);
        api.serverInfo({Id: 'fixture-server', UserId: 'fixture-account', AccessToken: 'local-smoke-only'});
        const url = api.getUrl('Videos/synthetic/stream.mp4', {Static: true, mediaSourceId: 'source', deviceId: api.deviceId(), api_key: api.accessToken()});
        const actor = {currentGenerationId: 1, exitPromise: new Promise(resolve => { exitResolve = resolve; })};
        runtime = createRuntime(launch);
        if (!runtime.enabled) throw Error('smoke-store-unavailable');
        function metadata(session) { return capture({getApiClient: () => api}, {Id: 'synthetic', ServerId: api.serverId()},
            {Id: 'source', Container: 'mp4'}, {playMethod: 'DirectStream', playSessionId: session}, url)(); }
        if (!runtime.setContext(metadata('fixture-owner-session'), actor, 1)) throw Error('smoke-context-ineligible');
        const result = await runtime.downloadCurrent(actor, 1, runtime.confirmationOwner(actor, 1));
        if (result.state !== 'ready') throw Error('smoke-download-failed');
        actor.currentGenerationId = 2;
        runtime.setContext(metadata('fixture-next-play-session'), actor, 2);
        const selection = await runtime.select(url, actor, 2, () => actor.currentGenerationId === 2);
        if (!selection || !selection.canDispatch()) throw Error('smoke-cache-miss');
        const cached = fs.readFileSync(selection.source);
        if (sha(cached) !== sha(bytes)) throw Error('smoke-byte-mismatch');
        const originalFrames = execute(ffmpeg, ['-v', 'error', '-i', source, '-map', '0', '-f', 'framemd5', '-']);
        const cachedFrames = execute(ffmpeg, ['-v', 'error', '-i', selection.source, '-map', '0', '-f', 'framemd5', '-']);
        if (originalFrames !== cachedFrames) throw Error('smoke-decoded-frame-mismatch');
        const playerExit = await new Promise((resolve, reject) => {
            player = cp.spawn(ffplay, ['-autoexit', '-nodisp', '-loglevel', 'error', '-volume', '0', selection.source],
                {cwd: out, env: environment, stdio: ['ignore', 'ignore', 'pipe']});
            playerClosed = new Promise(done => player.once('close', done));
            const deadline = setTimeout(() => player.kill(), 15000);
            player.stderr.on('data', () => {});
            player.once('error', reject);
            player.once('close', (code, signal) => { clearTimeout(deadline); actor.exited = true; exitResolve(); resolve({code, signal}); });
        });
        player = null;
        if (playerExit.code !== 0) throw Error('local-player-failed');
        await runtime.close();
        const receipt = {status: 'passed', sourceCommit: cp.execFileSync('git', ['rev-parse', 'HEAD'], {cwd: path.resolve(__dirname, '..'), encoding: 'utf8'}).trim(),
            node: process.version, bodyBytes: bytes.length, transferredBytes: transferred, requests, authenticatedRequests: authenticated,
            originalSha256: sha(bytes), cachedSha256: sha(cached), decodedFrameMd5Sha256: sha(originalFrames), playerExit,
            player: 'independent existing FFplay; dummy SDL audio/video, no audible or visible output',
            ffmpeg: {sha256: sha(fs.readFileSync(ffmpeg)), version: execute(ffmpeg, ['-version']).split('\n')[0]},
            ffplay: {sha256: sha(fs.readFileSync(ffplay)), version: execute(ffplay, ['-version']).split('\n')[0]},
            appPaths, runtimeState: runtime.status(), fixedWindowsLibmpvVerified: false,
            boundary: 'Runtime cache and real authorized loopback bytes, independent real decoder/player; not Electron GUI or Windows Native Helper acceptance'};
        fs.writeFileSync(path.join(out, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
        fs.writeFileSync(path.join(out, 'decoded.framemd5'), originalFrames);
        process.stdout.write(JSON.stringify({status: receipt.status, bodyBytes: receipt.bodyBytes, transferredBytes: transferred, playerExit, fixedWindowsLibmpvVerified: false}) + '\n');
    } finally {
        if (player) { player.kill(); if (playerClosed) await playerClosed; }
        exitResolve();
        try { if (runtime) await runtime.close(); } catch { /* Retain evidence rather than forcing cache deletion. */ }
        const exits = [...sockets].map(socket => new Promise(resolve => socket.once('close', resolve)));
        const closing = server.listening ? new Promise(resolve => server.close(resolve)) : Promise.resolve();
        server.closeAllConnections(); await Promise.all([closing, ...exits]);
        if (sockets.size) throw Error('local-smoke-sockets-remain');
    }
}
main().catch(error => { process.stderr.write(String(error.message || 'local-smoke-failed') + '\n'); process.exitCode = 1; });
