// Executed only by the local integration harness in an isolated Electron profile.
// Real PlaybackManager + ApiClient report serializers + message dispatcher;
// API responses and delivery are in memory, not a real Emby server/session.
async function runPipelineFixture(fixture, mountSidecar, cd2Mode, cd2Origin, stopBeforePlayerOnly) {
    const trace = window.__pipelineTrace = [];
    const stages = [];
    function markStage(name) {
        stages.push(name);
        trace.push('stage ' + name);
        if (window.__eteSmokeErrorEvidence) window.__eteSmokeErrorEvidence.pipelineStage = name;
    }
    const cd2AsyncHit = cd2Mode === 'hit' || cd2Mode === 'direct';
    window.addEventListener('unhandledrejection', event=>trace.push('rejection: '+String(event.reason)));
    const deps = await new Promise((resolve,reject) => require([
        'playbackManager','connectionManager','events','pluginManager',
        'modules/emby-apiclient/apiclient','modules/common/input/api','embyRouter'
    ], (...args)=>resolve(args), reject));
    const [manager, connections, events, plugins, ApiClientModule] = deps;
    markStage('modules-loaded');
    // No authenticated navigation exists in this fixture. Keep the real playback
    // context fullscreen (and reportable), while replacing only OSD navigation.
    deps[6].showVideoOsd = () => Promise.resolve();
    const embedded = plugins.ofType('mediaplayer').find(p=>p.id==='libmpvmediaplayer');
    const originalPlay = embedded.play;
    let embeddedPlayCount = 0;
    embedded.play = function(options) { embeddedPlayCount++; trace.push('embedded.play source-match='+String(options.url===fixture)+' method='+options.playMethod); return originalPlay.call(this,options); };
    trace.push('modules loaded');
    const ApiClient = ApiClientModule.default || ApiClientModule;
    const api = new ApiClient(window.localStorage, null, 'http://127.0.0.1:1', 'Enhanced fixture', '0.1.0', 'Fixture', 'fixture-device', 1);
    const records = [];
    const calls = [];
    const items = new Map();
    let activeItem;
    let pendingPlaybackId;
    let releasePendingPlayback;
    api.serverInfo = () => ({Id:'fixture-server'});
    api.serverId = () => 'fixture-server';
    api.getCurrentUserId = () => 'fixture-user';
    api.getCurrentUser = () => Promise.resolve({Id:'fixture-user',Configuration:{},Policy:{EnableMediaPlayback:true}});
    api.getSavedEndpointInfo = () => ({IsInNetwork:true,IsLocal:true});
    api.getEndpointInfo = () => Promise.resolve({IsInNetwork:true,IsLocal:true});
    api.detectBitrate = () => Promise.resolve(200000000);
    api.getIntros = () => Promise.resolve({Items:[]});
    api.ensureWebSocket = () => { calls.push('ensureWebSocket'); };
    api.getPlaybackInfo = (id) => {
        trace.push('PlaybackInfo');
        calls.push('PlaybackInfo');
        const selected = items.get(id) || activeItem;
        const response = {PlaySessionId:'play-'+selected.Id,MediaSources:[{
            Id:'source-'+selected.Id,Path:fixture,Protocol:'Http',IsRemote:false,Container:'y4m',
            MediaStreams:[],RunTimeTicks:50000000,SupportsDirectPlay:true,
            SupportsDirectStream:true,SupportsTranscoding:false,RequiredHttpHeaders:[]
        }]};
        if (id === pendingPlaybackId) {
            return new Promise(resolve => { releasePendingPlayback = () => resolve(response); });
        }
        return Promise.resolve(response);
    };
    api.getItem = (user,id) => Promise.resolve(items.get(id) || activeItem);
    api.getItems = () => Promise.resolve({Items:[activeItem],TotalRecordCount:1});
    api.ajax = request => {
        trace.push('ajax: '+new URL(request.url).pathname);
        if (request.url.includes('/Sessions/Playing')) {
            records.push({endpoint:new URL(request.url).pathname,body:JSON.parse(request.data)});
            return Promise.resolve();
        }
        return Promise.reject(Error('Unexpected fixture API request: '+new URL(request.url).pathname));
    };
    api.stopActiveEncodings = () => Promise.resolve();
    connections.getApiClient = () => api;
    connections.currentApiClient = () => api;
    connections.getApiClients = () => [api];
    events.trigger(connections, 'apiclientcreated', [api]);
    const sleep = ms => new Promise(r=>setTimeout(r,ms));
    const send = (command, extra) => events.trigger(api, 'message', [{MessageType:'Playstate',Data:Object.assign({Command:command},extra)}]);
    let stopBeforePlayer = null;
    if (stopBeforePlayerOnly) {
        const pendingItem = {Id:'fixture-stop-before-player',ServerId:'fixture-server',Name:'Pending stop',
            MediaType:'Video',Type:'Movie',Path:fixture,RunTimeTicks:50000000,UserData:{},MediaStreams:[]};
        items.set(pendingItem.Id,pendingItem);
        activeItem=pendingItem;
        pendingPlaybackId=pendingItem.Id;
        const playCallsBeforePending = embeddedPlayCount;
        const pendingPlay = manager.play({items:[pendingItem],fullscreen:true,startPositionTicks:0});
        for(let i=0;i<30 && !releasePendingPlayback;i++) await sleep(10);
        const reachedPendingStage = typeof releasePendingPlayback === 'function';
        await manager.stop();
        if (releasePendingPlayback) releasePendingPlayback();
        const pendingSettled = await Promise.allSettled([pendingPlay]);
        await sleep(100);
        stopBeforePlayer = {
            reachedPendingStage,
            requestSettled:pendingSettled[0].status==='fulfilled',
            playerPlayNotCalled:embeddedPlayCount===playCallsBeforePending,
            noPlayingReport:!records.some(record=>record.body.ItemId===pendingItem.Id && record.endpoint.endsWith('/Playing'))
        };
        return {stopBeforePlayer,results:[],next:null,generation:null,records,calls,stages};
    }
    const results = [];
    for (const kind of (cd2Mode === 'direct' ? ['strm','video'] : ['video','strm'])) {
        const stagePrefix = kind === 'video' ? 'ordinary' : 'strm';
        markStage(stagePrefix + '-play');
        trace.push('starting '+kind);
        activeItem = {Id:'fixture-'+kind,ServerId:'fixture-server',Name:'Synthetic '+kind,
            MediaType:'Video',Type:'Movie',Path:kind==='strm'?(mountSidecar || 'fixture-sidecar.strm'):fixture,
            RunTimeTicks:50000000,UserData:{},MediaStreams:[]};
        items.set(activeItem.Id,activeItem);
        await manager.play({items:[activeItem],fullscreen:true,startPositionTicks:0});
        markStage(stagePrefix + '-core-playing');
        trace.push('playing '+kind);
        await sleep(600);
        const player = manager._currentPlayer;
        const state = manager.getPlayerState();
        send('Pause'); await sleep(150); const paused=player.paused();
        send('Seek',{SeekPositionTicks:20000000}); await sleep(200); const sought=player.currentTime()>=1800;
        send('Unpause'); await sleep(200); const resumed=!player.paused();
        const expectedMount = typeof mountSidecar === 'string' && /\.strm$/i.test(mountSidecar)
            ? mountSidecar.slice(0, -5)
            : null;
        const sourceUsed = embedded.currentSrc();
        const playerStats = await player.getStats();
        markStage(stagePrefix + '-getstats');
        const enhancedCategory = (playerStats.categories || []).find(category => category && category.type === 'enhanced');
        const enhancedValues = Object.fromEntries((enhancedCategory && enhancedCategory.stats || []).map(stat => [stat.label, stat.value]));
        const expectedRouteSource = kind === 'strm' && cd2Mode === 'direct'
            ? 'CD2 DirectUrl'
            : kind === 'strm' && cd2AsyncHit
            ? 'CD2 HTTP'
            : kind === 'strm' && mountSidecar
            ? '本地挂载'
            : 'Emby 原生';
        send('Stop'); await sleep(250);
        markStage(stagePrefix + '-stop');
        const itemRecords=records.filter(r=>r.body.ItemId===activeItem.Id);
        const start=itemRecords.find(r=>r.endpoint.endsWith('/Playing'));
        const progress=itemRecords.filter(r=>r.endpoint.endsWith('/Progress'));
        const stop=itemRecords.find(r=>r.endpoint.endsWith('/Stopped'));
        let mountCandidateExists = !expectedMount;
        if (expectedMount) {
            try {
                mountCandidateExists = !!(window.fs && typeof window.fs.existsSync === 'function' && window.fs.existsSync(expectedMount));
            } catch (error) {
                mountCandidateExists = false;
            }
        }
        const expectedSource = kind === 'strm' && cd2AsyncHit
            ? sourceUsed.indexOf(fixture + '?cd2=') === 0
            : kind === 'strm' && cd2Mode === 'real'
            ? typeof sourceUsed === 'string' && new URL(sourceUsed).origin === new URL(cd2Origin).origin
            : (kind==='strm' && mountSidecar) ? sourceUsed===expectedMount : sourceUsed===fixture;
        results.push({kind,playerId:player.id,paused,sought,resumed,
            itemSidecarPreserved:state.NowPlayingItem.Path===activeItem.Path,
            sourcePreserved:state.MediaSource.Path===fixture,
            mountSourceUsed:expectedSource,
            mountCandidateExists:mountCandidateExists,
            sessionPreserved:!!start && !!stop && itemRecords.every(r=>r.body.PlaySessionId==='play-'+activeItem.Id && r.body.MediaSourceId==='source-'+activeItem.Id),
            hasStart:!!start,hasProgress:progress.length>0,hasStop:!!stop,
            pauseReported:progress.some(r=>r.body.IsPaused===true),
            seekReported:progress.some(r=>r.body.PositionTicks>=18000000),
            enhancedCategoryPresent:!!enhancedCategory,
            enhancedStatsMatch:enhancedValues['播放源:']===expectedRouteSource &&
                enhancedValues['STRM:']===(kind==='strm' ? '是' : '否') &&
                (kind!=='strm' || typeof enhancedValues['Fallback:']==='string')});
    }
    const queueSidecar = mountSidecar || 'X:\\Media\\queue.y4m.strm';
    const queue = ['a','b','c'].map(suffix=>({Id:'fixture-next-'+suffix,ServerId:'fixture-server',Name:'Queue '+suffix,MediaType:'Video',Type:'Movie',
        Path:cd2AsyncHit?queueSidecar.replace(/[^\\/]+$/, 'queue-'+suffix+'.y4m.strm'):fixture,
        RunTimeTicks:50000000,UserData:{},MediaStreams:[]}));
    queue.forEach(item=>items.set(item.Id,item));
    activeItem=queue[0];
    markStage('queue-play');
    await manager.play({items:queue,fullscreen:true,startPositionTicks:0});
    const sourceBeforeNext = embedded.currentSrc();
    markStage('nexttrack-1');
    const nextOne = manager.nextTrack();
    await sleep(cd2AsyncHit?150:25);
    markStage('nexttrack-2');
    const nextTwo = manager.nextTrack();
    const nextSettled = await Promise.allSettled([nextOne,nextTwo]);
    for(let i=0;i<30 && !(records.some(r=>r.endpoint.endsWith('/Playing') && r.body.ItemId===queue[1].Id));i++) await sleep(100);
    const sourceAfterNext = embedded.currentSrc();
    function requestNumber(source) {
        try {
            const value = new URL(source).searchParams.get('cd2') || '';
            const match = /play-(\d+)-/.exec(value);
            return match ? Number(match[1]) : 0;
        } catch (_) { return 0; }
    }
    const next={selected:manager.currentItem().Id===queue[1].Id,
        priorStopped:records.some(r=>r.endpoint.endsWith('/Stopped') && r.body.ItemId===queue[0].Id),
        nextStarted:records.some(r=>r.endpoint.endsWith('/Playing') && r.body.PlaySessionId==='play-'+queue[1].Id),
        rapidNextSettled:nextSettled.every(value=>value.status==='fulfilled'),
        rapidNewestLoaded:cd2AsyncHit ? requestNumber(sourceAfterNext)>requestNumber(sourceBeforeNext) : true};
    send('Stop'); await sleep(200);
    let generation = null;
    if (cd2AsyncHit) {
        markStage('generation-tests');
        const generationObserver = eteGenerationFixtureObserver.create({target:window,timeoutMs:3000,now:function(){return performance.now();}});
        const originalEnhancedDiagnostics = window.enhancedDiagnostics;
        window.enhancedDiagnostics = function (bridge, stage) {
            if (stage === 'ready') generationObserver.attachBridge(bridge);
            return originalEnhancedDiagnostics.apply(this, arguments);
        };
        const currentReadinessBridge = window.__etePepperReadiness && (window.__etePepperReadiness.playingBridge || window.__etePepperReadiness.readyBridge);
        if (currentReadinessBridge) generationObserver.attachBridge(currentReadinessBridge);
        const sidecarBase = mountSidecar || 'X:\\Media\\fixture.y4m.strm';
        const directOptions = (name, requestId) => ({
            item:{Id:'generation-'+name,ServerId:'fixture-server',Name:'Generation '+name,MediaType:'Video',Type:'Movie',Path:sidecarBase.replace(/[^\\/]+$/,name+'.y4m.strm')},
            mediaSource:{Id:'generation-source-'+name,Path:fixture,Container:'strm',MediaStreams:[],RunTimeTicks:50000000},
            url:fixture,mediaType:'Video',fullscreen:false,playMethod:'DirectPlay',_etePlayRequestId:requestId
        });
        generationObserver.registerFixture('fixturePlay#1',9001);
        const first = embedded.play(directOptions('a', 9001));
        first.then(function(){generationObserver.markPromiseSettled('fixturePlay#1','fulfilled');},function(error){generationObserver.markPromiseSettled('fixturePlay#1','rejected',error);});
        const firstGate = await generationObserver.waitForOverlapGate('fixturePlay#1');
        generationObserver.registerFixture('fixturePlay#2',9002);
        generationObserver.markTakeover('fixturePlay#1','fixturePlay#2');
        const second = embedded.play(directOptions('b', 9002));
        second.then(function(){generationObserver.markPromiseSettled('fixturePlay#2','fulfilled');},function(error){generationObserver.markPromiseSettled('fixturePlay#2','rejected',error);});
        const rapid = await Promise.allSettled([first, second]);
        const newestSource = embedded.currentSrc();
        const beforeStop = newestSource;
        generationObserver.registerFixture('fixtureStop#1-play',9003);
        const stoppedPending = embedded.play(directOptions('stop', 9003));
        stoppedPending.then(function(){generationObserver.markPromiseSettled('fixtureStop#1-play','fulfilled');},function(error){generationObserver.markPromiseSettled('fixtureStop#1-play','rejected',error);});
        await generationObserver.waitForCd2PendingGate('fixtureStop#1-play');
        generationObserver.cancelUnusedGates('fixtureStop#1-play');
        await embedded.stop();
        const stopped = await Promise.allSettled([stoppedPending]);
        await sleep(220);
        const observerSnapshot = generationObserver.snapshot();
        const firstObservation = observerSnapshot.fixtures.find(value=>value.fixtureId==='fixturePlay#1');
        const secondObservation = observerSnapshot.fixtures.find(value=>value.fixtureId==='fixturePlay#2');
        const takeover = observerSnapshot.takeovers.find(value=>value.oldFixtureId==='fixturePlay#1' && value.newFixtureId==='fixturePlay#2');
        const firstRetirement = observerSnapshot.retirements.find(value=>value.generationId===firstObservation.nativeGenerationId && value.reason==='upper-play-invalidated');
        generation = {
            firstSuperseded:firstGate.pending===true && takeover && takeover.activeRequestBefore===firstObservation.requestId && !!firstRetirement && rapid[0].status==='rejected' && rapid[0].reason && rapid[0].reason.playbackSuperseded===true,
            secondPlayed:rapid[1].status==='fulfilled' && newestSource.indexOf('play-9002-')>=0,
            oldCoreListenerIgnored:firstObservation.listenerRemoved===true && firstObservation.callbackCountAfterTakeover===0 && secondObservation.promiseSettlement==='fulfilled',
            stopSuperseded:stopped[0].status==='rejected' && stopped[0].reason && stopped[0].reason.playbackSuperseded===true,
            stopPreventedLateLoad:embedded.currentSrc()===beforeStop,
            noUnhandledRejection:!trace.some(value=>value.indexOf('rejection:')===0),
            observer:observerSnapshot
        };
        generationObserver.restore();
        window.enhancedDiagnostics = originalEnhancedDiagnostics;
    }
    markStage('pipeline-complete');
    return {stopBeforePlayer,results,next,generation,records,calls,stages};
}
