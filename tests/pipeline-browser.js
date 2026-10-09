// Executed only by the local integration harness in an isolated Electron profile.
// Real PlaybackManager + ApiClient report serializers + message dispatcher;
// API responses and delivery are in memory, not a real Emby server/session.
function buildPipelineSessionChecks(records, groups) {
    const sourceGroups = groups && typeof groups === 'object' ? groups : {};
    const groupNames = ['ordinary', 'strm', 'queue'];
    const requiredItems = {};
    groupNames.forEach(name => {
        requiredItems[name] = Array.isArray(sourceGroups[name]) ? sourceGroups[name].slice() : [];
    });
    const parseIdentity = body => {
        if (!body || typeof body !== 'object') return null;
        const itemId = body.ItemId;
        const playSessionId = body.PlaySessionId;
        const mediaSourceId = body.MediaSourceId;
        if ([itemId, playSessionId, mediaSourceId].some(value => typeof value !== 'string' || value.length === 0)) return null;
        return {itemId,playSessionId,mediaSourceId,
            key:itemId+'\u001f'+playSessionId+'\u001f'+mediaSourceId};
    };
    const starts = [];
    const stops = [];
    (Array.isArray(records) ? records : []).forEach((record, index) => {
        const endpoint = record && typeof record.endpoint === 'string' ? record.endpoint : '';
        const type = endpoint.endsWith('/Playing') ? 'started' : endpoint.endsWith('/Stopped') ? 'stopped' : null;
        if (!type) return;
        const value = {index,identity:parseIdentity(record && record.body)};
        if (type === 'started') starts.push(value);
        else stops.push(value);
    });
    const countDuplicateKeys = values => {
        const counts = new Map();
        values.forEach(value => {
            if (!value.identity) return;
            counts.set(value.identity.key, (counts.get(value.identity.key) || 0) + 1);
        });
        let duplicates = 0;
        counts.forEach(count => { if (count > 1) duplicates += count - 1; });
        return duplicates;
    };
    const usedStarts = new Set();
    const pairs = [];
    let pendingStopped = 0;
    let unmatchedStopped = 0;
    let mismatchedStopped = 0;
    stops.forEach(stop => {
        const prior = stop.identity
            ? starts.filter(start => start.identity && start.identity.key === stop.identity.key && start.index < stop.index)
            : [];
        if (prior.length === 0) pendingStopped++;
        const candidate = prior.find(start => !usedStarts.has(start.index));
        if (!candidate) {
            unmatchedStopped++;
            if (stop.identity && starts.some(start => start.identity && start.identity.itemId === stop.identity.itemId)) {
                mismatchedStopped++;
            }
            return;
        }
        usedStarts.add(candidate.index);
        pairs.push({startIndex:candidate.index,stopIndex:stop.index,key:stop.identity.key});
    });
    const requiredItemResults = {};
    const groupChecks = {};
    groupNames.forEach(name => {
        const itemIds = requiredItems[name];
        const validList = itemIds.length > 0 && itemIds.every(value => typeof value === 'string' && value.length > 0) && new Set(itemIds).size === itemIds.length;
        const items = itemIds.map(itemId => {
            const itemStarts = starts.filter(value => value.identity && value.identity.itemId === itemId);
            const itemStops = stops.filter(value => value.identity && value.identity.itemId === itemId);
            const paired = itemStarts.length === 1 && itemStops.length === 1 &&
                itemStarts[0].identity.key === itemStops[0].identity.key && itemStarts[0].index < itemStops[0].index;
            return {itemId,started:itemStarts.length > 0,stopped:itemStops.length > 0,
                oneToOne:itemStarts.length === 1 && itemStops.length === 1,paired};
        });
        const passed = validList && items.length > 0 && items.every(value => value.paired);
        requiredItemResults[name] = {itemIds:itemIds.slice(),items,passed};
        groupChecks[name] = passed;
    });
    const incompleteStarted = starts.filter(value => !value.identity).length;
    const incompleteStopped = stops.filter(value => !value.identity).length;
    const duplicateStarted = countDuplicateKeys(starts);
    const duplicateStopped = countDuplicateKeys(stops);
    const unpairedStarted = starts.filter(value => !usedStarts.has(value.index)).length;
    const unpairedStopped = unmatchedStopped;
    const startedStoppedOneToOne = incompleteStarted === 0 && incompleteStopped === 0 &&
        pendingStopped === 0 && unmatchedStopped === 0 && mismatchedStopped === 0 &&
        duplicateStarted === 0 && duplicateStopped === 0 && unpairedStarted === 0 &&
        unpairedStopped === 0 && starts.length === stops.length && pairs.length === starts.length;
    const requiredStartedStopped = groupNames.every(name => groupChecks[name]);
    return {
        requiredItems,
        requiredItemResults,
        startedCount:starts.length,
        stoppedCount:stops.length,
        pairedCount:pairs.length,
        pendingStopped,
        unmatchedStopped,
        incompleteStarted,
        incompleteStopped,
        duplicateStarted,
        duplicateStopped,
        unpairedStarted,
        unpairedStopped,
        mismatchedStopped,
        startedStoppedOneToOne,
        ordinaryStartedStopped:groupChecks.ordinary,
        strmStartedStopped:groupChecks.strm,
        queueStartedStopped:groupChecks.queue,
        requiredStartedStopped,
        passed:startedStoppedOneToOne && requiredStartedStopped
    };
}

async function runPipelineFixture(fixture, mountSidecar, cd2Mode, cd2Origin, stopBeforePlayerOnly, timelineOptions, fixtureOptions) {
    const trace = window.__pipelineTrace = [];
    const stages = [];
    const observations = window.__pipelineObservations = {stages: [], waits: []};
    function markStage(name) {
        stages.push(name);
        observations.stages.push({name, atMs: performance.now(), hidden: document.hidden});
        trace.push('stage ' + name);
        if (!timelineOptions && cd2Mode !== 'real') window.ipc.send('ete-test-pipeline-stage', name);
        if (window.__eteSmokeErrorEvidence) window.__eteSmokeErrorEvidence.pipelineStage = name;
    }
    const cd2AsyncHit = cd2Mode === 'hit' || cd2Mode === 'direct';
    const durationTicks = timelineOptions ? 300000000 : ((fixtureOptions && fixtureOptions.seconds) || 5) * 10000000;
    const fixtureControl = command => window.ipc.invoke('ete-test-cd2-fixture-control', command);
    const gateEvidence = {};
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
    events.on(embedded, 'stopped', function () { trace.push('embedded-event stopped'); });
    events.on(embedded, 'error', function (_event, error) { trace.push('embedded-event error ' + String(error && error.name || 'unknown')); });
    window.addEventListener('native-helper-ready', function () { trace.push('window-event native-helper-ready'); });
    window.addEventListener('native-helper-error', function (event) { trace.push('window-event native-helper-error ' + String(event && event.detail && event.detail.reason || 'unknown')); });
    window.addEventListener('core-playing', function () { trace.push('window-event core-playing'); });
    const originalPlay = embedded.play;
    let embeddedPlayCount = 0;
    embedded.play = function(options) {
        embeddedPlayCount++;
        trace.push('embedded.play source-match='+String(options.url===fixture)+' method='+options.playMethod);
        return Promise.resolve(originalPlay.call(this,options)).catch(function (error) {
            var message = String(error && error.message || error || 'unknown')
                .replace(/https?:\/\/[^\s)]+/gi, '[URL]')
                .replace(/[A-Za-z]:\\[^\r\n)]*/g, '[PATH]')
                .slice(0, 256);
            trace.push('embedded.play rejected name=' + String(error && error.name || 'unknown') + ' message=' + message);
            throw error;
        });
    };
    trace.push('modules loaded');
    const ApiClient = ApiClientModule.default || ApiClientModule;
    const api = new ApiClient(window.localStorage, null, 'http://127.0.0.1:1', 'Enhanced fixture', '0.1.0', 'Fixture', 'fixture-device', 1);
    const records = [];
    const calls = [];
    const items = new Map();
    let activeItem;
    let pendingPlaybackId;
    let releasePendingPlayback;
    let holdPlaybackOnce = false;
    let sync;
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
            Id:'source-'+selected.Id,Path:selected.fixtureUrl || fixture,Protocol:'Http',IsRemote:false,Container:'y4m',
            MediaStreams:[],RunTimeTicks:durationTicks,SupportsDirectPlay:true,
            SupportsDirectStream:true,SupportsTranscoding:false,RequiredHttpHeaders:[]
        }]};
        if (id === pendingPlaybackId) {
            if (holdPlaybackOnce) pendingPlaybackId = null;
            return new Promise(resolve => {
                releasePendingPlayback = () => resolve(response);
                if (sync) sync.notify();
            });
        }
        return Promise.resolve(response);
    };
    api.getItem = (user,id) => Promise.resolve(items.get(id) || activeItem);
    api.getItems = () => Promise.resolve({Items:[activeItem],TotalRecordCount:1});
    api.ajax = request => {
        trace.push('ajax: '+new URL(request.url).pathname);
        if (request.url.includes('/Sessions/Playing')) {
            records.push({endpoint:new URL(request.url).pathname,body:JSON.parse(request.data)});
            if (sync) sync.notify();
            return Promise.resolve();
        }
        return Promise.reject(Error('Unexpected fixture API request: '+new URL(request.url).pathname));
    };
    api.stopActiveEncodings = () => Promise.resolve();
    connections.getApiClient = () => api;
    connections.currentApiClient = () => api;
    connections.getApiClients = () => [api];
    events.trigger(connections, 'apiclientcreated', [api]);
    const sleep = ms => new Promise(resolve => {
        const started = performance.now();
        const stage = stages[stages.length - 1];
        setTimeout(() => {
            if (observations.waits.length < 128) observations.waits.push({stage, requestedMs: ms, elapsedMs: performance.now() - started});
            resolve();
        }, ms);
    });
    const send = (command, extra) => events.trigger(api, 'message', [{MessageType:'Playstate',Data:Object.assign({Command:command},extra)}]);
    if (timelineOptions) {
        if (typeof window.runTransitionTimelineFixture !== 'function') {
            throw new Error('transition-timeline-browser-fixture-unavailable');
        }
        return window.runTransitionTimelineFixture({
            manager:manager,
            embedded:embedded,
            api:api,
            items:items,
            records:records,
            events:events,
            fixture:fixture,
            options:timelineOptions
        });
    }
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
    const sessionGroups = {ordinary:[],strm:[],queue:[]};
    sync = etePipelineCondition.create({timeoutMs:7000, now:()=>performance.now()});
    const eventCounts = {seek:0,timeupdate:0};
    const notify = event => {
        if (Object.hasOwn(eventCounts, event.type)) eventCounts[event.type]++;
        sync.notify(); queueMicrotask(() => sync.notify());
    };
    const observedEvents = ['pause','unpause','seek','timeupdate','stopped','playing'];
    observedEvents.forEach(name => events.on(embedded, name, notify));
    const reported = (itemId, suffix, predicate) => records.some(r => r.body.ItemId === itemId && r.endpoint.endsWith(suffix) && (!predicate || predicate(r.body)));
    let lastRemoteStopAt = 0;
    const stopCurrent = async itemId => {
        // The frozen inputmanager intentionally drops Stop commands within 1 s
        // of the previous Stop, even across different items. Respect that input
        // contract; completion still requires the actual report and cleared item.
        const stopCooldownMs = Math.min(1100, 1001 - (Date.now()-lastRemoteStopAt));
        if (stopCooldownMs > 0) await sleep(stopCooldownMs);
        const done = sync.wait('stopped-report', () => reported(itemId, '/Stopped') && !manager.currentItem());
        lastRemoteStopAt = Date.now();
        send('Stop');
        await done;
    };
    try {
    if (fixtureOptions && fixtureOptions.normalClose) {
        const scenario = fixtureOptions.normalClose;
        if (!['idle','playing','stopped'].includes(scenario)) throw new Error('normal-close-scenario-invalid');
        if (scenario !== 'idle') {
            markStage('ordinary-play');
            activeItem = {Id:'fixture-close',ServerId:'fixture-server',Name:'Synthetic close',
                MediaType:'Video',Type:'Movie',Path:fixture,RunTimeTicks:durationTicks,UserData:{},MediaStreams:[]};
            items.set(activeItem.Id,activeItem);
            await manager.play({items:[activeItem],fullscreen:true,startPositionTicks:0});
            markStage('ordinary-core-playing');
            await sync.wait('playing-report', () => reported(activeItem.Id, '/Playing'));
            if (scenario === 'stopped') { await stopCurrent(activeItem.Id); markStage('ordinary-stop'); }
        }
        const started = records.filter(r => r.endpoint.endsWith('/Playing'));
        const stopped = records.filter(r => r.endpoint.endsWith('/Stopped'));
        const complete = row => row.body.ItemId === 'fixture-close' && row.body.PlaySessionId === 'play-fixture-close' && row.body.MediaSourceId === 'source-fixture-close';
        const current = manager.currentItem();
        const preconditionsPassed = document.hidden && (scenario === 'idle'
            ? !current && started.length === 0 && stopped.length === 0
            : scenario === 'playing'
            ? current && current.Id === 'fixture-close' && started.length === 1 && started.every(complete) && stopped.length === 0 && embeddedPlayCount === 1
            : !current && started.length === 1 && stopped.length === 1 && started.every(complete) && stopped.every(complete) && embeddedPlayCount === 1);
        return {normalClose:{scenario,preconditionsPassed:!!preconditionsPassed,hidden:document.hidden,
            currentItemId:current && current.Id || null,embeddedPlayCount},records,stages,observations};
    }
    for (const kind of (cd2Mode === 'direct' ? ['strm','video'] : ['video','strm'])) {
        const stagePrefix = kind === 'video' ? 'ordinary' : 'strm';
        markStage(stagePrefix + '-play');
        trace.push('starting '+kind);
        activeItem = {Id:'fixture-'+kind,ServerId:'fixture-server',Name:'Synthetic '+kind,
            MediaType:'Video',Type:'Movie',Path:kind==='strm'?(mountSidecar || 'fixture-sidecar.strm'):fixture,
            RunTimeTicks:durationTicks,UserData:{},MediaStreams:[]};
        items.set(activeItem.Id,activeItem);
        sessionGroups[kind === 'video' ? 'ordinary' : 'strm'].push(activeItem.Id);
        await manager.play({items:[activeItem],fullscreen:true,startPositionTicks:0});
        markStage(stagePrefix + '-core-playing');
        trace.push('playing '+kind);
        await sync.wait('playing-report', () => reported(activeItem.Id, '/Playing'));
        const player = manager._currentPlayer;
        const state = manager.getPlayerState();
        const pauseDone = sync.wait('pause-report', () => player.paused() && reported(activeItem.Id, '/Progress', body => body.IsPaused === true));
        send('Pause'); await pauseDone; const paused=player.paused();
        const seekTargetMs = Math.abs(player.currentTime()-2000) < 1000 ? 4000 : 2000;
        const seekEventsBefore = {...eventCounts};
        const seekRecordsFrom = records.length;
        const nearSeekTarget = value => Math.abs(value-seekTargetMs) <= 500;
        const seekDone = sync.wait('seek-position', () => eventCounts.seek > seekEventsBefore.seek && eventCounts.timeupdate > seekEventsBefore.timeupdate && nearSeekTarget(player.currentTime()));
        send('Seek',{SeekPositionTicks:seekTargetMs*10000}); await seekDone;
        const sought=nearSeekTarget(player.currentTime());
        const resumeDone = sync.wait('resume-report', () => !player.paused() && records.slice(seekRecordsFrom).some(r => r.body.ItemId===activeItem.Id && r.endpoint.endsWith('/Progress') && r.body.IsPaused === false && nearSeekTarget(r.body.PositionTicks/10000)));
        send('Unpause'); await resumeDone; const resumed=!player.paused();
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
        await stopCurrent(activeItem.Id);
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
            seekReported:records.slice(seekRecordsFrom).some(r=>r.body.ItemId===activeItem.Id && r.endpoint.endsWith('/Progress') && nearSeekTarget(r.body.PositionTicks/10000)),
            enhancedCategoryPresent:!!enhancedCategory,
            enhancedStatsMatch:enhancedValues['播放源:']===expectedRouteSource &&
                enhancedValues['STRM:']===(kind==='strm' ? '是' : '否') &&
                (kind!=='strm' || typeof enhancedValues['Fallback:']==='string')});
    }
    const queueSidecar = mountSidecar || 'X:\\Media\\queue.y4m.strm';
    const queue = ['a','b','c'].map(suffix=>({Id:'fixture-next-'+suffix,ServerId:'fixture-server',Name:'Queue '+suffix,MediaType:'Video',Type:'Movie',
        Path:cd2AsyncHit?queueSidecar.replace(/[^\\/]+$/, 'queue-'+suffix+'.y4m.strm'):fixture,
        fixtureUrl:fixture+'?queue='+suffix,
        RunTimeTicks:durationTicks,UserData:{},MediaStreams:[]}));
    queue.forEach(item=>items.set(item.Id,item));
    sessionGroups.queue = queue.map(item => item.Id);
    activeItem=queue[0];
    markStage('queue-play');
    await manager.play({items:queue,fullscreen:true,startPositionTicks:0});
    const sourceBeforeNext = embedded.currentSrc();
    markStage('nexttrack-1');
    let rapidArm;
    if (cd2AsyncHit) rapidArm = (await fixtureControl({action:'arm-next',label:'rapid-next'})).armId;
    else { pendingPlaybackId = queue[1].Id; releasePendingPlayback = null; holdPlaybackOnce = true; }
    let firstSettled = false;
    const nextOne = manager.nextTrack();
    nextOne.then(() => {firstSettled=true;}, () => {firstSettled=true;});
    if (cd2AsyncHit) gateEvidence.rapidPending = await fixtureControl({action:'wait-pending',armId:rapidArm});
    else await sync.wait('next-playback-info-pending', () => !!releasePendingPlayback);
    const overlapEstablished = !firstSettled && manager._playQueueManager.getCurrentPlaylistIndex() === 0;
    markStage('nexttrack-2');
    const nextTwo = manager.nextTrack();
    let playsBeforeStaleRelease;
    if (cd2AsyncHit) gateEvidence.rapidCancelled = await fixtureControl({action:'wait-cancelled',armId:rapidArm});
    else { await nextTwo; playsBeforeStaleRelease = embeddedPlayCount; releasePendingPlayback(); }
    const nextSettled = await Promise.allSettled([nextOne,nextTwo]);
    await sync.wait('next-playing-report', () => reported(queue[1].Id, '/Playing'));
    const sourceAfterNext = embedded.currentSrc();
    function requestNumber(source) {
        try {
            const value = new URL(source).searchParams.get('cd2') || '';
            const match = /play-(\d+)-/.exec(value);
            return match ? Number(match[1]) : 0;
        } catch (_) { return 0; }
    }
    const next={selected:manager.currentItem().Id===queue[1].Id,
        overlapEstablished,
        staleMetadataIgnored:cd2AsyncHit || embeddedPlayCount === playsBeforeStaleRelease,
        exactPendingCancelled:!cd2AsyncHit || (gateEvidence.rapidPending.pending === true && gateEvidence.rapidCancelled.cancelled === true && gateEvidence.rapidPending.requestId === gateEvidence.rapidCancelled.requestId),
        priorStopped:records.some(r=>r.endpoint.endsWith('/Stopped') && r.body.ItemId===queue[0].Id),
        nextStarted:records.some(r=>r.endpoint.endsWith('/Playing') && r.body.PlaySessionId==='play-'+queue[1].Id),
        rapidNextSettled:nextSettled.every(value=>value.status==='fulfilled'),
        rapidNewestLoaded:cd2AsyncHit ? requestNumber(sourceAfterNext)>requestNumber(sourceBeforeNext) && !sourceAfterNext.endsWith('?cd2='+gateEvidence.rapidPending.requestId) : true};
    markStage('nexttrack-serial');
    await manager.nextTrack();
    await sync.wait('serial-next-playing-report', () => reported(queue[2].Id, '/Playing'));
    next.serialSelected = manager.currentItem().Id === queue[2].Id;
    next.serialPriorStopped = reported(queue[1].Id, '/Stopped');
    next.serialSourceLoaded = cd2AsyncHit ? requestNumber(embedded.currentSrc()) > requestNumber(sourceAfterNext) : embedded.currentSrc() === queue[2].fixtureUrl;
    await stopCurrent(queue[2].Id);
    next.serialSessionPreserved = reported(queue[2].Id, '/Playing') && reported(queue[2].Id, '/Stopped') && records.filter(r => r.body.ItemId === queue[2].Id).every(r => r.body.PlaySessionId === 'play-'+queue[2].Id && r.body.MediaSourceId === 'source-'+queue[2].Id);
    let generation = null;
    if (cd2AsyncHit) {
        markStage('generation-tests');
        const generationObserver = eteGenerationFixtureObserver.create({target:window,timeoutMs:3000,now:function(){return performance.now();}});
        const originalEnhancedDiagnostics = window.enhancedDiagnostics;
        window.enhancedDiagnostics = function (bridge, stage) {
            if (stage === 'ready') generationObserver.attachBridge(bridge);
            return originalEnhancedDiagnostics.apply(this, arguments);
        };
        const currentReadinessBridge = window.__eteBridgeReadiness && (window.__eteBridgeReadiness.playingBridge || window.__eteBridgeReadiness.readyBridge);
        if (currentReadinessBridge) generationObserver.attachBridge(currentReadinessBridge);
        const sidecarBase = mountSidecar || 'X:\\Media\\fixture.y4m.strm';
        const directOptions = (name, requestId) => ({
            item:{Id:'generation-'+name,ServerId:'fixture-server',Name:'Generation '+name,MediaType:'Video',Type:'Movie',Path:sidecarBase.replace(/[^\\/]+$/,name+'.y4m.strm')},
            mediaSource:{Id:'generation-source-'+name,Path:fixture,Container:'strm',MediaStreams:[],RunTimeTicks:durationTicks},
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
        const stopArm = (await fixtureControl({action:'arm-next',label:'stop-before-load'})).armId;
        const stoppedPending = embedded.play(directOptions('stop', 9003));
        stoppedPending.then(function(){generationObserver.markPromiseSettled('fixtureStop#1-play','fulfilled');},function(error){generationObserver.markPromiseSettled('fixtureStop#1-play','rejected',error);});
        await generationObserver.waitForCd2PendingGate('fixtureStop#1-play');
        gateEvidence.stopPending = await fixtureControl({action:'wait-pending',armId:stopArm});
        generationObserver.cancelUnusedGates('fixtureStop#1-play');
        await embedded.stop();
        gateEvidence.stopCancelled = await fixtureControl({action:'wait-cancelled',armId:stopArm});
        const stopped = await Promise.allSettled([stoppedPending]);
        await sleep(220);
        const observerSnapshot = generationObserver.snapshot();
        const firstObservation = observerSnapshot.fixtures.find(value=>value.fixtureId==='fixturePlay#1');
        const secondObservation = observerSnapshot.fixtures.find(value=>value.fixtureId==='fixturePlay#2');
        const stopObservation = observerSnapshot.fixtures.find(value=>value.fixtureId==='fixtureStop#1-play');
        const takeover = observerSnapshot.takeovers.find(value=>value.oldFixtureId==='fixturePlay#1' && value.newFixtureId==='fixturePlay#2');
        const firstRetirement = observerSnapshot.retirements.find(value=>value.generationId===firstObservation.nativeGenerationId && value.reason==='upper-play-invalidated');
        generation = {
            firstSuperseded:firstGate.pending===true && takeover && takeover.activeRequestBefore===firstObservation.requestId && !!firstRetirement && rapid[0].status==='rejected' && rapid[0].reason && rapid[0].reason.playbackSuperseded===true,
            secondPlayed:rapid[1].status==='fulfilled' && newestSource.indexOf('play-9002-')>=0,
            oldCoreListenerIgnored:firstObservation.listenerRemoved===true && firstObservation.callbackCountAfterTakeover===0 && secondObservation.promiseSettlement==='fulfilled',
            stopSuperseded:stopped[0].status==='rejected' && stopped[0].reason && stopped[0].reason.playbackSuperseded===true,
            stopPreventedLateLoad:embedded.currentSrc()===beforeStop,
            exactStopPendingCancelled:gateEvidence.stopPending.pending === true && gateEvidence.stopCancelled.cancelled === true && gateEvidence.stopPending.requestId === gateEvidence.stopCancelled.requestId && gateEvidence.stopPending.requestId === stopObservation.cd2RequestId && stopObservation.cd2PendingAtGate === true && stopObservation.cd2CancelSent === true,
            noUnhandledRejection:!trace.some(value=>value.indexOf('rejection:')===0),
            observer:observerSnapshot
        };
        generationObserver.restore();
        window.enhancedDiagnostics = originalEnhancedDiagnostics;
    }
    markStage('pipeline-complete');
    const sessionChecks = buildPipelineSessionChecks(records, sessionGroups);
    const normalClose = fixtureOptions && fixtureOptions.productCloseAfterPipeline ? {
        scenario:'pipeline',cd2Mode,hidden:document.hidden,
        currentItemId:manager.currentItem() && manager.currentItem().Id || null,
        preconditionsPassed:document.hidden && !manager.currentItem()
    } : null;
    return {stopBeforePlayer,results,next,generation,records,calls,stages,observations,gateEvidence,conditions:sync.snapshot(),sessionChecks,normalClose};
    } finally {
        observedEvents.forEach(name => events.off(embedded, name, notify));
        sync.dispose();
    }
}

if (typeof module === 'object' && module && module.exports) {
    module.exports = {buildPipelineSessionChecks};
}
