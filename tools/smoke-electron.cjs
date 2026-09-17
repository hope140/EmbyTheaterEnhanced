'use strict';
// Run with the frozen Electron, not the development Node. No server login is used.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const {createWindowOwnership} = require('./runtime-window-ownership.cjs');
const runtime = process.env.ETE_TEST_RUNTIME;
const evidence = process.env.ETE_TEST_EVIDENCE;
const testCd2Origin = process.env.ETE_CD2_ORIGIN || '';
if (!runtime || !evidence) throw Error('ETE_TEST_RUNTIME and ETE_TEST_EVIDENCE are required');
const expectedApplicationPath = path.join(runtime, 'electronapp', 'www', 'index.html');
const windowOwnership = createWindowOwnership({expectedApplicationPath});
app.setName('emby-theater-enhanced-smoke');
let fixtureUrl;
const mediaRequests = [];
const resolverEvents = [];
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
if (process.env.ETE_TEST_PIPELINE) {
    const media = fs.readFileSync(process.env.ETE_TEST_MEDIA);
    const server = require('http').createServer((request,response) => {
        const parsedRequest = new URL(request.url, 'http://127.0.0.1');
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
        const match = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || '');
        const start = match ? Number(match[1]) : 0;
        const end = match && match[2] ? Math.min(Number(match[2]),media.length-1) : media.length-1;
        if (start > end || start >= media.length) { response.writeHead(416); return response.end(); }
        const headers = {'Content-Type':'application/octet-stream','Accept-Ranges':'bytes','Content-Length':end-start+1};
        if(match) headers['Content-Range'] = 'bytes '+start+'-'+end+'/'+media.length;
        response.writeHead(match?206:200,headers);
        response.end(media.subarray(start,end+1));
    });
    server.listen(0,'127.0.0.1',()=> {
        fixtureUrl='http://127.0.0.1:'+server.address().port+'/fixture.y4m';
        fs.writeFileSync(path.join(evidence,'fixture.strm'),fixtureUrl+'\n');
    });
}
let completed = false;
function finish(result) {
    if (completed) return;
    completed = true;
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
    app.exit(result.ok ? 0 : 1);
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
    win.webContents.on('console-message', (_, level, message) => {
        if (typeof message === 'string' && message.indexOf('STRM resolver:') === 0) resolverEvents.push(message);
    });
    try { win.setAlwaysOnTop(false); } catch (_) { }
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
                const screenshot = await win.webContents.capturePage();
                state.screenshotAvailable = !screenshot.isEmpty();
                if (!screenshot.isEmpty()) fs.writeFileSync(path.join(evidence, 'startup.png'), screenshot.toPNG());
                if (process.env.ETE_TEST_PIPELINE) {
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
                finish({ok:false, error:errorEvidence(error, ownership.classification), rendererErrorEvidence});
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
require(path.join(runtime, 'electronapp/main.js'));
