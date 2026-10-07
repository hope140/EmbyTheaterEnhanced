'use strict';
// Run with the frozen Electron, not the development Node. No server login is used.
const { app, desktopCapturer, screen, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const {createWindowOwnership} = require('./runtime-window-ownership.cjs');
const {createTransitionStreamCapture} = require('./transition-stream-capture.cjs');
const runtime = process.env.ETE_TEST_RUNTIME;
const evidence = process.env.ETE_TEST_EVIDENCE;
const testCd2Origin = process.env.ETE_CD2_ORIGIN || '';
const transitionTimelineMode = process.env.ETE_TEST_TRANSITION_TIMELINE === '1';
if (!runtime || !evidence) throw Error('ETE_TEST_RUNTIME and ETE_TEST_EVIDENCE are required');
const expectedApplicationPath = path.join(runtime, 'electronapp', 'www', 'index.html');
const windowOwnership = createWindowOwnership({expectedApplicationPath});
app.setName('emby-theater-enhanced-smoke');
let fixtureUrl;
let mediaAUrl;
let mediaBUrl;
let posterBaseUrl;
let fixtureServer;
let transitionCapture;
let transitionActionListener;
const mediaRequests = [];
const resolverEvents = [];
const nativeHelperEvents = [];
const nativeTimelineEvents = [];
const transitionServiceEvents = [];
const diagnosticEvents = [];
let fakeCd2Stats;
let applicationPipelineInjectionCount = 0;
let auxiliaryPipelineInjectionCount = 0;
function withSourceUrl(source, name) {
    return source + '\n//# sourceURL=' + name;
}
function safeStack(value) {
    return typeof value === 'string' ? value
        .replace(/file:\/\/\/[A-Za-z]:\/[^\r\n]*?\/electronapp\//gi, 'electronapp/')
        .replace(/[A-Za-z]:\\[^\r\n)]*/g, '[PATH]')
        .replace(/([?&](?:token|api_key|apikey|authorization|cookie)=)[^&#\s)]*/gi, '$1[REDACTED]')
        .slice(0, 12000) : null;
}
function errorEvidence(error, windowClassification) {
    const stack = safeStack(error && error.stack);
    const frame = stack && stack.match(/(?:at\s+[^\r\n]*?\()?([^\s()]+\.js):(\d+):(\d+)\)?/);
    return {
        name: error && error.name || null,
        message: error && error.message || String(error),
        stack,
        filename: frame ? frame[1] : null,
        line: frame ? Number(frame[2]) : null,
        column: frame ? Number(frame[3]) : null,
        windowClassification: windowClassification || null
    };
}
async function readRendererErrorEvidence(window) {
    if (!window || window.isDestroyed()) return null;
    return window.webContents.executeJavaScript(withSourceUrl('window.__eteSmokeErrorEvidence || null', 'ete-smoke-error-evidence.js')).catch(() => null);
}
if (process.env.ETE_TEST_PIPELINE || transitionTimelineMode) {
    if (transitionTimelineMode && (!process.env.ETE_TEST_MEDIA_B ||
        !(process.env.ETE_TEST_MEDIA_A || process.env.ETE_TEST_MEDIA))) {
        throw new Error('ETE_TEST_MEDIA_A (or ETE_TEST_MEDIA) and ETE_TEST_MEDIA_B are required');
    }
    const media = fs.readFileSync(transitionTimelineMode
        ? (process.env.ETE_TEST_MEDIA_A || process.env.ETE_TEST_MEDIA)
        : process.env.ETE_TEST_MEDIA);
    const mediaB = transitionTimelineMode ? fs.readFileSync(process.env.ETE_TEST_MEDIA_B) : null;
    const artworkDelayValue = transitionTimelineMode && process.env.ETE_TEST_ARTWORK_DELAY_MS !== undefined
        ? Number(process.env.ETE_TEST_ARTWORK_DELAY_MS) : 100;
    if (transitionTimelineMode && (!Number.isInteger(artworkDelayValue) || artworkDelayValue < 0 || artworkDelayValue > 500)) {
        throw new Error('ETE_TEST_ARTWORK_DELAY_MS must be an integer from 0 to 500');
    }
    fixtureServer = require('http').createServer((request,response) => {
        const parsedRequest = new URL(request.url, 'http://127.0.0.1');
        if (transitionTimelineMode && parsedRequest.pathname === '/poster.svg') {
            const poster = '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><rect width="960" height="540" fill="#d42eff"/></svg>';
            const sendPoster = () => {
                if (response.destroyed) return;
                response.writeHead(200, {'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store'});
                response.end(poster);
            };
            setTimeout(sendPoster, artworkDelayValue);
            return;
        }
        const directRequestId = process.env.ETE_TEST_CD2_MODE === 'direct'
            ? parsedRequest.searchParams.get('cd2')
            : null;
        const expectedDirectUa = directRequestId ? 'ETE-Direct-' + directRequestId : null;
        const observedUa = request.headers['user-agent'] || '';
        const directUaMatch = expectedDirectUa ? observedUa === expectedDirectUa : null;
        const directUaLeaked = !expectedDirectUa && observedUa.indexOf('ETE-Direct-') === 0;
        mediaRequests.push({
            method:request.method,
            range:request.headers.range || null,
            sourceKind:expectedDirectUa ? 'direct-url' : 'same-origin',
            directUaMatch:directUaMatch,
            directUaLeaked:directUaLeaked
        });
        if (parsedRequest.pathname !== '/fixture.y4m') { response.writeHead(404); return response.end(); }
        if ((expectedDirectUa && !directUaMatch) || directUaLeaked) { response.writeHead(403); return response.end(); }
        const selectedMedia = transitionTimelineMode && parsedRequest.searchParams.get('variant') === 'B' ? mediaB : media;
        const match = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || '');
        const start = match ? Number(match[1]) : 0;
        const end = match && match[2] ? Math.min(Number(match[2]),selectedMedia.length-1) : selectedMedia.length-1;
        if (start > end || start >= selectedMedia.length) { response.writeHead(416); return response.end(); }
        const headers = {'Content-Type':'application/octet-stream','Accept-Ranges':'bytes','Content-Length':end-start+1};
        if(match) headers['Content-Range'] = 'bytes '+start+'-'+end+'/'+selectedMedia.length;
        response.writeHead(match?206:200,headers);
        response.end(selectedMedia.subarray(start,end+1));
    });
    fixtureServer.listen(0,'127.0.0.1',()=> {
        fixtureUrl='http://127.0.0.1:'+fixtureServer.address().port+'/fixture.y4m';
        if (transitionTimelineMode) {
            mediaAUrl = fixtureUrl + '?variant=A';
            mediaBUrl = fixtureUrl + '?variant=B';
            posterBaseUrl = 'http://127.0.0.1:' + fixtureServer.address().port + '/poster.svg';
        } else {
            fs.writeFileSync(path.join(evidence,'fixture.strm'),fixtureUrl+'\n');
        }
    });
}
if (transitionTimelineMode) {
    transitionCapture = createTransitionStreamCapture({
        desktopCapturer,
        screen,
        getApplicationWindow: () => windowOwnership.getApplicationWindow(),
        evidence
    });
    transitionActionListener = (event, action) => {
        const owner = windowOwnership.getApplicationWindow();
        if (owner && !owner.isDestroyed() && event.sender === owner.webContents) transitionCapture.start(action);
    };
    ipcMain.on('ete-test-transition-timeline-action', transitionActionListener);
}
let completed = false;
function writeResultAndExit(result) {
    result.cd2EnvironmentCleared = ['ETE_CD2_ENABLED','ETE_CD2_ORIGIN','ETE_CD2_TOKEN','ETE_CD2_LOCAL_PREFIX','ETE_CD2_CLOUD_PREFIX','ETE_CD2_DIRECT_URL','ETE_CD2_SOURCE_PREFIX','ETE_CD2_MOUNT_PREFIX']
        .every(name => process.env[name] === undefined);
    if (!result.cd2EnvironmentCleared) result.ok = false;
    result.mediaRequestSummary = {
        count: mediaRequests.length,
        rangeCount: mediaRequests.filter(request => request.range).length,
        directCount: mediaRequests.filter(request => request.sourceKind === 'direct-url').length
    };
    if (process.env.ETE_TEST_CD2_MODE === 'direct') {
        result.directHeaderIsolation = {
            directRequestsObserved: mediaRequests.some(request => request.sourceKind === 'direct-url'),
            allDirectUserAgentsMatched: mediaRequests.filter(request => request.sourceKind === 'direct-url').every(request => request.directUaMatch === true),
            noDirectUserAgentLeak: mediaRequests.filter(request => request.sourceKind === 'same-origin').every(request => request.directUaLeaked === false)
        };
        if (!Object.values(result.directHeaderIsolation).every(Boolean)) result.ok = false;
    }
    result.resolverEvents = resolverEvents;
    result.nativeHelperEvents = nativeHelperEvents;
    if (transitionTimelineMode) {
        result.transitionServiceEvents = transitionServiceEvents;
        result.nativeTimelineEvents = nativeTimelineEvents;
    }
    result.diagnosticEvents = diagnosticEvents;
    result.windowOwnership = windowOwnership.snapshot();
    result.harnessInjection = {applicationPipelineInjectionCount, auxiliaryPipelineInjectionCount};
    if (fakeCd2Stats) {
        result.cd2Fake = {
            resolveCount: fakeCd2Stats.resolveCount,
            cancelCount: fakeCd2Stats.cancelCount,
            completedCount: fakeCd2Stats.completedCount,
            activeCount: fakeCd2Stats.active.size
        };
    }
    fs.writeFileSync(path.join(evidence, 'electron-smoke.json'), JSON.stringify(result, null, 2));
    if (transitionActionListener) {
        ipcMain.removeListener('ete-test-transition-timeline-action', transitionActionListener);
        transitionActionListener = null;
    }
    if (transitionTimelineMode && fixtureServer) {
        try { fixtureServer.closeAllConnections(); } catch (_) { }
        try { fixtureServer.close(); } catch (_) { }
    }
    app.exit(result.ok ? 0 : 1);
}
function finish(result) {
    if (completed) return;
    completed = true;
    if (!transitionTimelineMode) return writeResultAndExit(result);
    transitionCapture.waitForResults().then(async pixel => {
        result.pixel = pixel;
        const prerequisites = result.state && result.state.pipeline && result.state.pipeline.pixelPrerequisite;
        const initialReady = !!prerequisites && !!prerequisites.initialA &&
            prerequisites.initialA.status === 'COLOR_OBSERVED';
        const previousReady = !!prerequisites && !!prerequisites.beforePrevious &&
            prerequisites.beforePrevious.status === 'COLOR_OBSERVED';
        if (!initialReady || !previousReady) {
            result.pixel.classification = 'INCONCLUSIVE';
            result.pixel.reason = 'pixel-prerequisite-unavailable';
            (result.pixel.captures || []).forEach(capture => {
                if (capture.action === 'next' && !initialReady || capture.action === 'previous' && !previousReady) {
                    capture.classification = 'INCONCLUSIVE';
                    capture.reason = 'pixel-prerequisite-unavailable';
                }
            });
        }
        try { result.pixel.cleanup = await transitionCapture.stop(); }
        catch (_) { result.pixel.cleanup = {rendererStopped: false, handlerRestored: false}; }
        writeResultAndExit(result);
    }, async () => {
        result.pixel = {classification: 'INCONCLUSIVE', reason: 'capture-summary-failed', captures: []};
        try { result.pixel.cleanup = await transitionCapture.stop(); }
        catch (_) { result.pixel.cleanup = {rendererStopped: false, handlerRestored: false}; }
        writeResultAndExit(result);
    });
}
setTimeout(async () => {
    const applicationWindow = windowOwnership.getApplicationWindow();
    const trace = applicationWindow ? await applicationWindow.webContents.executeJavaScript(withSourceUrl('window.__pipelineTrace || []', 'ete-timeout-trace.js')).catch(()=>[]) : [];
    let sourceState = null;
    if (applicationWindow) {
        const expectedOrigin = testCd2Origin;
        const expectedOriginLiteral = JSON.stringify(expectedOrigin);
        sourceState = await applicationWindow.webContents.executeJavaScript(withSourceUrl(`new Promise(function(resolve) {
            require(['pluginManager'], function(pm) {
                var player = pm.ofType('mediaplayer').find(function(p) { return p.id === 'libmpvmediaplayer'; });
                var source = player && player.currentSrc && player.currentSrc();
                var kind = typeof source === 'string' && /^https?:/i.test(source) ? 'http' : typeof source === 'string' ? 'local' : 'absent';
                try { if (${expectedOriginLiteral} && new URL(source).origin === new URL(${expectedOriginLiteral}).origin) kind = 'cd2'; } catch (_) {}
                resolve({kind:kind, present:typeof source === 'string' && source.length > 0});
            });
        })`, 'ete-timeout-inspection.js')).catch(()=>null);
    }
    finish({ok:false, error:'UI smoke timeout', trace, sourceState, mediaRequests});
}, process.env.ETE_TEST_CD2_EXPECT === 'real' ? 45000 : 25000);
app.on('browser-window-created', (_, win) => {
    win.webContents.on('console-message', (event, level, message) => {
        if (typeof message === 'string' && message.indexOf('STRM resolver:') === 0) resolverEvents.push(message);
    });
    if (!transitionTimelineMode) {
        try { win.setAlwaysOnTop(false); } catch (_) { }
    }
    if (!process.env.ETE_TEST_VISIBLE) {
        try { win.hide(); } catch (_) { }
        win.on('show', () => win.hide());
    }
    win.webContents.on('did-fail-load', (_, code, description) => {
        const classification = windowOwnership.classifyWindow(win);
        if (classification.role === 'application' || windowOwnership.getApplicationWindow() === win) {
            finish({ok:false, code, description, windowClassification: classification});
        }
    });
    win.webContents.on('did-finish-load', () => {
        const ownership = windowOwnership.handleLoaded(win);
        if (ownership.role !== 'application' || !ownership.shouldStartProbe) return;
        setTimeout(async () => {
            try {
                const state = await win.webContents.executeJavaScript(withSourceUrl(String.raw`(function () {
                    window.__eteSmokeErrorEvidence = window.__eteSmokeErrorEvidence || {errors:[], unhandledRejections:[], pipelineStage:'startup-probe'};
                    if (!window.__eteSmokeErrorEvidence.listenersInstalled) {
                        window.__eteSmokeErrorEvidence.listenersInstalled = true;
                        function safeSource(value) {
                            var text = typeof value === 'string' ? value.split(/[?#]/)[0] : '';
                            var marker = text.toLowerCase().lastIndexOf('/electronapp/');
                            if (marker >= 0) return text.slice(marker + 1);
                            return text.replace(/^.*[\\/]/, '');
                        }
                        function safeStack(value) {
                            return typeof value === 'string' ? value
                                .replace(/file:\/\/\/[A-Za-z]:\/[^\r\n]*?\/electronapp\//gi, 'electronapp/')
                                .replace(/[A-Za-z]:\\[^\r\n)]*/g, '[PATH]')
                                .replace(/([?&](?:token|api_key|apikey|authorization|cookie)=)[^&#\s)]*/gi, '$1[REDACTED]')
                                .slice(0,12000) : null;
                        }
                        function safeError(error) {
                            return {
                                name:error && error.name || null,
                                message:error && error.message || String(error),
                                stack:safeStack(error && error.stack)
                            };
                        }
                        window.addEventListener('error', function (event) {
                            if (window.__eteSmokeErrorEvidence.errors.length >= 32) return;
                            window.__eteSmokeErrorEvidence.errors.push({
                                name:event && event.error && event.error.name || null,
                                message:event && event.message || null,
                                stack:safeStack(event && event.error && event.error.stack),
                                filename:safeSource(event && event.filename),
                                line:event && event.lineno || null,
                                column:event && event.colno || null,
                                pipelineStage:window.__eteSmokeErrorEvidence.pipelineStage
                            });
                        });
                        window.addEventListener('unhandledrejection', function (event) {
                            if (window.__eteSmokeErrorEvidence.unhandledRejections.length >= 32) return;
                            var record = safeError(event && event.reason);
                            record.pipelineStage = window.__eteSmokeErrorEvidence.pipelineStage;
                            window.__eteSmokeErrorEvidence.unhandledRejections.push(record);
                        });
                    }
                    return new Promise(function(resolve, reject) {
                        var amd = {
                            require:typeof window.require,
                            requirejs:typeof window.requirejs,
                            define:typeof window.define,
                            defineAmd:!!(window.define && window.define.amd)
                        };
                        if (amd.require !== 'function' || amd.requirejs !== 'function' || amd.define !== 'function' || !amd.defineAmd) {
                            var error = new Error('application-amd-unavailable');
                            error.amd = amd;
                            reject(error);
                            return;
                        }
                    require(['pluginManager'], function(pm) {
                        resolve({ title: document.title, ready: !!(window.Emby && window.Emby.App),
                            textLength: document.body.innerText.length,
                            players: pm.ofType('mediaplayer').map(function(p) {return {id:p.id, name:p.name};}), amd:amd });
                    });
                    });
                })()`, 'ete-smoke-startup-probe.js'));
                state.screenshotAvailable = false;
                state.screenshotStatus = 'NOT_RUN_HIDDEN';
                if (process.env.ETE_TEST_VISIBLE && !transitionTimelineMode) {
                    const screenshot = await win.webContents.capturePage();
                    state.screenshotAvailable = !screenshot.isEmpty();
                    state.screenshotStatus = screenshot.isEmpty() ? 'EMPTY' : 'CAPTURED';
                    if (!screenshot.isEmpty()) fs.writeFileSync(path.join(evidence, 'startup.png'), screenshot.toPNG());
                }
                if (transitionTimelineMode) {
                    applicationPipelineInjectionCount++;
                    state.transitionWindowMode = win.isFullScreen() ? 'fullscreen' : 'windowed';
                    if (state.transitionWindowMode !== 'windowed') {
                        return finish({ok:false,error:'Windowed transition requires a non-fullscreen application window',state});
                    }
                    state.streamCapturePreparation = await transitionCapture.prepare(win);
                    const timelineSource = fs.readFileSync(path.join(__dirname,'../tests/transition-timeline-browser.js'),'utf8');
                    const pipelineSource = fs.readFileSync(path.join(__dirname,'../tests/pipeline-browser.js'),'utf8');
                    const timelineOptions = {mediaAUrl, mediaBUrl, posterBaseUrl};
                    state.pipeline = await win.webContents.executeJavaScript(withSourceUrl(
                        timelineSource + '\n' + pipelineSource + '\nrunPipelineFixture(' +
                        JSON.stringify(mediaAUrl) + ', null, null, null, false, ' + JSON.stringify(timelineOptions) + ')',
                        'ete-windowed-transition-fixture.js'));
                    const checks = state.pipeline && state.pipeline.logicalChecks;
                    const requiredChecks = ['nextItemB', 'previousItemA', 'nextOverlay', 'previousOverlay',
                        'nextArtworkLoaded', 'previousArtworkLoaded', 'nextCorePlaying', 'previousCorePlaying'];
                    if (state.pipeline && state.pipeline.status === 'failed') {
                        return finish({ok:false,error:'Windowed transition observation fixture incomplete',state});
                    }
                    if (!state.pipeline || state.pipeline.kind !== 'windowed-transition-timeline' ||
                        !checks || requiredChecks.some(name => checks[name] !== true)) {
                        return finish({ok:false,error:'Windowed transition logical assertion failed',state});
                    }
                } else if (process.env.ETE_TEST_PIPELINE) {
                    applicationPipelineInjectionCount++;
                    const generationObserverSource = fs.readFileSync(path.join(__dirname,'../tests/generation-fixture-observer.js'),'utf8');
                    state.generationObserverLoaded = await win.webContents.executeJavaScript(withSourceUrl(generationObserverSource + '\n!!globalThis.eteGenerationFixtureObserver', 'ete-generation-fixture-observer.js'));
                    if (!state.generationObserverLoaded) throw new Error('generation-fixture-observer-unavailable');
                    const source = fs.readFileSync(path.join(__dirname,'../tests/pipeline-browser.js'),'utf8');
                    state.pipeline = await win.webContents.executeJavaScript(withSourceUrl(source + '\nrunPipelineFixture(' + JSON.stringify(fixtureUrl) + ', ' + JSON.stringify(process.env.ETE_TEST_MOUNT_SIDECAR || null) + ', ' + JSON.stringify(process.env.ETE_TEST_CD2_EXPECT || process.env.ETE_TEST_CD2_MODE || null) + ', ' + JSON.stringify(testCd2Origin || null) + ', ' + JSON.stringify(process.env.ETE_TEST_STOP_BEFORE_PLAYER === '1') + ')', 'ete-pipeline-fixture.js'));
                    if (process.env.ETE_TEST_STOP_BEFORE_PLAYER === '1') {
                        if (!state.pipeline.stopBeforePlayer || !Object.values(state.pipeline.stopBeforePlayer).every(Boolean)) {
                            return finish({ok:false,error:'Stop-before-player assertion failed',state});
                        }
                        return finish({ok:true,versions:process.versions,state});
                    }
                    if (!Object.values(state.pipeline.next).every(Boolean) || !state.pipeline.results.every(result => result.playerId==='libmpvmediaplayer' && Object.entries(result).filter(([k])=>!['kind','playerId'].includes(k)).every(([,v])=>v===true)) ||
                        (state.pipeline.generation && !Object.values(state.pipeline.generation).every(Boolean)) ||
                        ((process.env.ETE_TEST_CD2_MODE === 'hit' || process.env.ETE_TEST_CD2_MODE === 'direct') && fakeCd2Stats.cancelCount < 2)) {
                        return finish({ok:false,error:'Playback pipeline assertion failed',state});
                    }
                } else if (process.env.ETE_TEST_MEDIA) {
                    const fixture = JSON.stringify(process.env.ETE_TEST_MEDIA);
                    const playback = await win.webContents.executeJavaScript(withSourceUrl(`new Promise(function(resolve, reject) {
                        require(['pluginManager'], async function(pm) {
                            try {
                                const registered = pm.ofType('mediaplayer').find(p => p.id === 'libmpvmediaplayer');
                                // A separate instance avoids invoking server-session listeners without a server.
                                const p = new registered.constructor();
                                const item = {Id:'local-test-fixture', Name:'Synthetic local fixture', MediaType:'Video', Type:'Movie'};
                                const source = {Id:'fixture-source', Path:${fixture}, Container:'y4m', MediaStreams:[], RunTimeTicks:50000000};
                                await p.play({item:item, mediaSource:source, url:${fixture}, mediaType:'Video', fullscreen:false, playMethod:'DirectPlay'});
                                await new Promise(r=>setTimeout(r,900));
                                 const advanced = p.currentTime() > 0;
                                 const stats = await p.getStats();
                                 const statsOk = !!(stats && Array.isArray(stats.categories) && stats.categories.length > 0);
                                 p.pause();
                                await new Promise(r=>setTimeout(r,200));
                                const paused = p.paused();
                                p.currentTime(2000);
                                await new Promise(r=>setTimeout(r,250));
                                const sought = p.currentTime() >= 1800;
                                p.unpause();
                                await new Promise(r=>setTimeout(r,300));
                                const resumed = !p.paused();
                                let stopped = false;
                                require(['events'], function(events) { events.on(p, 'stopped', function() { stopped = true; }); });
                                await new Promise(r=>setTimeout(r,100));
                                await p.stop();
                                 resolve({advanced:advanced, statsOk:statsOk, paused:paused, sought:sought, resumed:resumed, stopped:stopped});
                            } catch(e) { reject(e); }
                        });
                     })`, 'ete-local-media-fixture.js'));
                     state.playback = playback;
                    if (!Object.values(playback).every(Boolean)) return finish({ok:false, versions:process.versions, state});
                }
                finish({ok:state.ready && state.players.some(p=>p.id==='libmpvmediaplayer') && !state.players.some(p=>p.id==='externalplayer'), versions:process.versions, state});
            } catch(error) {
                const rendererErrorEvidence = await readRendererErrorEvidence(win);
                const pipelineTrace = await win.webContents.executeJavaScript(withSourceUrl('window.__pipelineTrace || []', 'ete-failure-trace.js')).catch(() => []);
                finish({ok:false, error:errorEvidence(error, ownership.classification), rendererErrorEvidence, pipelineTrace});
            }
        }, 6500);
    });
});

if (process.env.ETE_TEST_CD2_MODE) {
    fakeCd2Stats = {resolveCount: 0, cancelCount: 0, completedCount: 0, active: new Map()};
    const serviceModule = require(path.join(runtime, 'electronapp/enhanced/cd2-service.js'));
    serviceModule.createService = function () {
        return {
            resolve(request) {
                fakeCd2Stats.resolveCount++;
                return new Promise(resolve => {
                    const timer = setTimeout(() => {
                        fakeCd2Stats.active.delete(request.requestId);
                        fakeCd2Stats.completedCount++;
                        if (process.env.ETE_TEST_CD2_MODE === 'hit') {
                            resolve({status:'hit',type:'url',source:fixtureUrl+'?cd2='+encodeURIComponent(request.requestId)});
                        } else if (process.env.ETE_TEST_CD2_MODE === 'direct') {
                            resolve({
                                status:'hit',type:'url',sourceKind:'direct-url',reason:'direct_hit',
                                source:fixtureUrl+'?cd2='+encodeURIComponent(request.requestId),
                                requestOptions:{userAgent:'ETE-Direct-'+request.requestId}
                            });
                        } else {
                            resolve({status:'miss',reason:'unavailable'});
                        }
                    }, 400);
                    fakeCd2Stats.active.set(request.requestId, {timer, resolve});
                });
            },
            cancel(requestId) {
                const entry = fakeCd2Stats.active.get(requestId);
                if (!entry) return false;
                fakeCd2Stats.cancelCount++;
                clearTimeout(entry.timer);
                fakeCd2Stats.active.delete(requestId);
                entry.resolve({status:'cancelled',reason:'cancelled'});
                return true;
            },
            close() {
                for (const requestId of Array.from(fakeCd2Stats.active.keys())) this.cancel(requestId);
            }
        };
    };
}
const nativeHelperServiceModule = require(path.join(runtime, 'electronapp/native-helper/service.js'));
const createNativeHelperService = nativeHelperServiceModule.createService;
const TimelineClientBase = transitionTimelineMode
    ? require(path.join(runtime, 'electronapp/native-helper/controller.js')).NativeHelperClient : null;
nativeHelperServiceModule.createService = function (options) {
    const originalLogger = options && options.logger;
    const serviceOptions = Object.assign({}, options, {
        logger(record) {
            const details = record && record.details || {};
            if (transitionTimelineMode && record && record.event === 'surface-sync' && transitionServiceEvents.length < 128) {
                transitionServiceEvents.push({atMs: Date.now(), event: 'surface-sync',
                    reason: details.reason || null, visible: details.visible === true});
            }
            if (nativeHelperEvents.length < 128) nativeHelperEvents.push({
                event: record && record.event || null,
                reason: details.reason || null,
                visible: typeof details.visible === 'boolean' ? details.visible : null,
                applied: typeof details.applied === 'boolean' ? details.applied : null,
                property: details.property || null,
                protocolVersion: details.protocolVersion || null,
                helperVersion: details.helperVersion || null,
                libmpvVersion: details.libmpvVersion || null,
                failureCode: details.failure && details.failure.code || null
            });
            if (typeof originalLogger === 'function') originalLogger(record);
        }
    });
    if (transitionTimelineMode) {
        const BaseClient = options && options.NativeHelperClient || TimelineClientBase;
        serviceOptions.NativeHelperClient = class TimelineNativeHelperClient extends BaseClient {
            constructor(clientOptions) {
                const originalOnEvent = clientOptions.onEvent;
                super(Object.assign({}, clientOptions, {
                    onEvent(message) {
                        const name = message && message.name;
                        if (nativeTimelineEvents.length < 128 &&
                            ['start-file', 'file-loaded', 'end-file', 'core-idle'].includes(name)) {
                            const entry = {
                                atMs: Date.now(),
                                name,
                                generationId: Number.isSafeInteger(message.generationId) ? message.generationId : null,
                                mediaIdentity: Number.isSafeInteger(message.mediaIdentity) ? message.mediaIdentity : null
                            };
                            if (name === 'core-idle' && typeof message.value === 'boolean') entry.coreIdle = message.value;
                            if (name === 'end-file' && message.value &&
                                Number.isSafeInteger(message.value.reason)) entry.endReason = message.value.reason;
                            nativeTimelineEvents.push(entry);
                        }
                        return originalOnEvent.call(this, message);
                    }
                }));
            }
        };
    }
    const service = createNativeHelperService(serviceOptions);
    if (!transitionTimelineMode) return service;
    const originalCall = service.call;
    const originalNotify = service.notify;
    function recordVisibility(event, operation, visible) {
        if (transitionServiceEvents.length >= 128) return;
        transitionServiceEvents.push({atMs: Date.now(), event, operation, visible,
            surfaceVisible: service.status().surfaceVisible});
    }
    service.call = async function (operation, payload, endpointId) {
        const command = payload && payload.data;
        const tracked = operation === 'set-visible' ||
            (operation === 'command' && (command === 'stop' || Array.isArray(command) && command[0] === 'stop'));
        const visible = operation === 'set-visible' ? payload && payload.visible === true : false;
        if (tracked) recordVisibility('main-call-start', operation, visible);
        try {
            const result = await originalCall.call(service, operation, payload, endpointId);
            if (tracked) recordVisibility('main-call-complete', operation, visible);
            return result;
        } catch (error) {
            if (tracked) recordVisibility('main-call-error', operation, visible);
            throw error;
        }
    };
    service.notify = function (operation, payload, endpointId) {
        const tracked = operation === 'set-visible';
        if (tracked) recordVisibility('main-notify-start', operation, payload && payload.visible === true);
        try {
            return originalNotify.call(service, operation, payload, endpointId);
        } finally {
            if (tracked) recordVisibility('main-notify-complete', operation, payload && payload.visible === true);
        }
    };
    return service;
};
const diagnosticsModule = require(path.join(runtime, 'electronapp/enhanced/diagnostics.js'));
const createDiagnosticsLogger = diagnosticsModule.createLogger;
diagnosticsModule.createLogger = function () {
    const logger = createDiagnosticsLogger.apply(this, arguments);
    return function (record) {
        const details = record && record.details || {};
        if (diagnosticEvents.length < 128) diagnosticEvents.push({
            category: record && record.category || null,
            event: record && record.event || null,
            stage: details.stage || null,
            name: details.name || null,
            reason: details.reason || null,
            route: details.route || null,
            sourceKind: details.sourceKind || null
        });
        return logger(record);
    };
};
require(path.join(runtime, 'electronapp/main.js'));
