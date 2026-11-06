'use strict';
// Fixed-runtime offline check; all HTTP endpoints are owned loopback servers.
const {app, session, BrowserWindow} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {createHash} = require('node:crypto');
const {installExternalMediaCheck} = require('./external-media-check.cjs');
const {createExternalHeaderProbe} = require('./external-header-probe.cjs');
const index = process.argv.indexOf('--fixture-root');
const root = index < 0 ? undefined : process.argv[index + 1];
const caseIndex = process.argv.indexOf('--case');
const caseName = caseIndex < 0 ? undefined : process.argv[caseIndex + 1];
const entryId = 'ETE_FN_EXTERNAL_HEADER_FIXTURE_V2';
let trusted = false, sent = false, passed = false, stage = 'INPUT', timer, win, observer;
const checks = {}, observed = {}, servers = [];
function publish(kind, result) {
    if (!trusted || kind === 'result' && sent) return;
    const file = path.join(root, kind + '.json');
    if (fs.existsSync(file)) throw new Error('RECEIPT_EXISTS');
    fs.writeFileSync(file + '.tmp', JSON.stringify({entryId, runId: path.basename(root).slice('ete-fn-external-fixture-'.length), caseName, result, stage,
        sourceSha: createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
        electronVersion: process.versions.electron || 'UNKNOWN', checks, observed, realNAS: 'NOT_TESTED'}) + '\n', {flag: 'wx'});
    fs.renameSync(file + '.tmp', file);
    if (kind === 'result') sent = true;
}
async function listen(handle) {
    const server = http.createServer(handle); servers.push(server);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    return 'http://127.0.0.1:' + server.address().port;
}
function requireCheck(name, value) { checks[name] = value === true; if (!checks[name]) throw new Error('CHECK_FAILED'); }
try {
    if (!process.argv.includes('--fn-external-fixture') || !['redirect', 'direct', 'same-body'].includes(caseName) ||
        process.platform !== 'win32' || process.versions.electron !== require('./electron-input.json').version ||
        typeof root !== 'string' || !path.isAbsolute(root) || !/^ete-fn-external-fixture-[a-f0-9]{32}$/.test(path.basename(root)) ||
        fs.lstatSync(root).isSymbolicLink() || !fs.lstatSync(root).isDirectory()) throw new Error('INVALID');
    const marker = path.join(root, '.fixture-owner');
    if (fs.lstatSync(marker).isSymbolicLink() || !fs.lstatSync(marker).isFile() ||
        fs.readFileSync(marker, 'utf8') !== entryId + '\n') throw new Error('INVALID');
    trusted = true; publish('entry', 'ENTERED');
    const control = path.join(root, 'control'); fs.mkdirSync(control);
    app.setPath('userData', control); app.setPath('sessionData', control);
    app.on('window-all-closed', () => {});
    app.on('quit', () => publish('result', passed ? 'PASSED' : 'EARLY_QUIT'));
    timer = setTimeout(() => { publish('result', 'TIMEOUT'); app.exit(1); }, 20000);
    app.whenReady().then(async () => {
        stage = 'SERVERS';
        let externalCount = 0, browserExternalCount = 0, browserBodyEvents = 0, linkCount = 0, mediaCount = 0, embyCookie = false, expectedAgent;
        const external = await listen((req, res) => {
            externalCount++;
            observed.externalHttpRequestCount = externalCount;
            checks.signedSourcePreserved = req.url === '/signed?signature=synthetic-only';
            checks.onlyBoundedRange = req.method === 'GET' && req.headers.range === 'bytes=0-0';
            checks.actualAgentPreserved = req.headers['user-agent'] === expectedAgent;
            checks.noAuthentication = ['cookie', 'authorization', 'x-emby-token', 'x-emby-authorization', 'x-mediabrowser-token', 'referer', 'origin']
                .every(key => req.headers[key] === undefined);
            res.writeHead(206, {'Content-Type': 'video/mp4', 'Content-Length': '1', 'Content-Range': 'bytes 0-0/17'}); res.end('x');
        });
        servers[0].on('connection', () => { observed.externalConnectionCount = (observed.externalConnectionCount || 0) + 1; });
        const emby = await listen((req, res) => {
            embyCookie ||= req.headers.cookie === 'ete_fixture_auth=synthetic-only';
            if (req.url === '/Items/1/PlaybackInfo') {
                linkCount++; res.writeHead(200, {'Content-Type': 'application/json'}); res.end('{}');
            } else if (req.url === '/stream') {
                mediaCount++; observed.normalMediaCount = mediaCount;
                if (caseName === 'same-body') res.writeHead(200, {'Content-Type': 'video/mp4', 'Content-Length': '65536'});
                else res.writeHead(302, {Location: external + '/signed?signature=synthetic-only', 'Content-Type': 'video/mp4', 'Content-Length': '65536'});
                res.end(Buffer.alloc(65536, 120));
            } else {
                const source = caseName === 'direct' ? external + '/signed?signature=synthetic-only' : '/stream';
                res.writeHead(200, {'Content-Type': 'text/html', 'Content-Security-Policy': "default-src 'none'; script-src 'nonce-fn-fixture'; connect-src 'self'; media-src http://127.0.0.1:*"});
                res.end('<!doctype html><script nonce="fn-fixture">window.fixtureRetryAttempts=0;document.addEventListener("error",function(e){' +
                    'if(!(e.target instanceof HTMLVideoElement)||window.fixtureRetryAttempts>=2)return;window.fixtureRetryAttempts++;' +
                    'fetch("/Items/1/PlaybackInfo",{method:"POST"}).catch(function(){});var v=document.createElement("video");v.muted=true;v.preload="metadata";' +
                    'v.src=e.target.src;document.body.appendChild(v);},true);</script>' +
                    '<video src="' + source + '" preload="metadata" autoplay muted></video><video src="' + source + '" preload="metadata" muted></video>');
            }
        });
        stage = 'SESSION';
        const ses = session.fromPartition('ete-fn-external-offline-' + path.basename(root), {cache: false});
        await ses.cookies.set({url: emby, name: 'ete_fixture_auth', value: 'synthetic-only'});
        win = new BrowserWindow({show: false, webPreferences: {session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true}});
        win.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
        expectedAgent = win.webContents.getUserAgent().replace(/\s+Electron\/[^\s]+/gi, '').trim();
        win.webContents.setUserAgent(expectedAgent);
        ses.webRequest.onSendHeaders({urls: [external + '/*']}, () => { browserExternalCount++; observed.browserExternalHeaderCount = browserExternalCount; });
        ses.webRequest.onResponseStarted({urls: ['<all_urls>']}, details => {
            if (details.webContentsId === win?.webContents.id && details.resourceType === 'media') {
                browserBodyEvents++; observed.browserMediaBodyEvents = browserBodyEvents;
            }
        });
        const probe = createExternalHeaderProbe({enabled: true, mode: 'fixture', approvedOrigin: external,
            resolveProxy: address => ses.resolveProxy(address), environment: {}}); // Only this owned loopback fixture ignores environment proxy hints.
        let complete;
        const terminal = new Promise(resolve => { complete = resolve; });
        observer = installExternalMediaCheck(ses, emby + '/', {mode: 'fixture', approvedOrigin: external, ownerId: win.webContents.id, probe,
            onReport(value) {
                if (value.result === 'MEDIA_CHECK_UA_METADATA') {
                    observed.uaSource = value.uaSource; observed.uaMetadata = value.uaMetadata;
                }
                if (value.event === 'diagnostic' && /^[A-Z_]{2,60}$/.test(value.blockReason || '')) observed.lastBlockReason = value.blockReason;
                if (value.event === 'terminal') complete(value);
            }});
        await observer.ready;
        stage = 'MEDIA'; win.loadURL(emby + '/').catch(() => {});
        const outcome = await terminal;
        observed.terminalResult = outcome.result;
        if (/^[A-Z_]{2,60}$/.test(outcome.externalResult || '')) observed.externalResult = outcome.externalResult;
        if (Number.isInteger(outcome.external?.status)) observed.status = outcome.external.status;
        await observer.drain();
        await new Promise(resolve => setTimeout(resolve, 200));
        observed.retryAttempts = await win.webContents.executeJavaScript('window.fixtureRetryAttempts || 0');
        Object.assign(observed, {externalHttpRequestCount: externalCount, browserExternalHeaderCount: browserExternalCount,
            browserMediaBodyEvents: browserBodyEvents, normalMediaCount: mediaCount, extraLinkRequestCount: linkCount});
        requireCheck('expectedHeaderResult', caseName === 'same-body' ? outcome.result === 'MEDIA_CHECK_HEADERS_ONLY' && outcome.status === 200 &&
            outcome.externalResult === 'SAME_ORIGIN_MEDIA_STOPPED' && outcome.bodyRead === false :
            outcome.result === 'MEDIA_CHECK_PARTIAL_HEADERS_OBSERVED' && outcome.external?.status === 206 && outcome.bodyRead === false);
        requireCheck('uaProvenance', caseName === 'same-body' || outcome.uaSource === (caseName === 'direct' ? 'DIRECT_REQUEST_HEADER' : 'EMBY_MEDIA_REQUEST'));
        requireCheck('independentRequestBudget', externalCount === (caseName === 'same-body' ? 0 : 1));
        requireCheck('noBrowserExternalHeaders', browserExternalCount === 0);
        requireCheck('noBrowserMediaBodyEvent', browserBodyEvents === 0);
        requireCheck('normalMediaBudget', mediaCount === (caseName === 'direct' ? 0 : 1));
        requireCheck('recoveryWasExercised', observed.retryAttempts > 0 && observed.retryAttempts <= 2);
        requireCheck('noExtraLinkRequest', linkCount === 0);
        requireCheck('authenticationOnlyAtEmby', embyCookie && (caseName === 'same-body' || checks.noAuthentication));
        if (caseName !== 'same-body') for (const name of ['signedSourcePreserved', 'onlyBoundedRange', 'actualAgentPreserved']) requireCheck(name, checks[name]);
        stage = 'DRAIN'; observer.freeze();
        await new Promise(resolve => { win.once('closed', resolve); win.destroy(); }); win = null;
        await ses.closeAllConnections(); await ses.clearStorageData(); await ses.clearCache();
        await ses.cookies.flushStore(); observer.dispose();
        await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
        stage = 'DONE'; clearTimeout(timer); passed = true; app.quit();
    }).catch(() => { clearTimeout(timer); try { publish('result', 'FAILED'); } finally { app.exit(1); } });
} catch { clearTimeout(timer); try { publish('result', 'FAILED'); } finally { app.exit(2); } }
