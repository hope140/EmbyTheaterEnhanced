'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

function fail(code) {
    const error = new Error(code);
    error.code = code;
    throw error;
}

function safeReason(value) {
    return typeof value === 'string' && /^[a-z][a-z0-9-]{0,79}$/.test(value) ? value : null;
}

function configureLoopbackProxyBypass(environment) {
    if (!environment || typeof environment !== 'object') fail('boundary-environment-unavailable');
    for (const key of Object.keys(environment)) {
        if (/^(?:http_proxy|https_proxy|all_proxy)$/i.test(key)) delete environment[key];
    }
    environment.NO_PROXY = '127.0.0.1,localhost';
    environment.no_proxy = '127.0.0.1,localhost';
    return environment;
}

function assertUnavailable(response) {
    if (!response || response.ready !== false || response.status !== 'unavailable' || safeReason(response.reason) === null) {
        fail('boundary-expected-unavailable');
    }
    return {ready:false,status:'unavailable',reason:response.reason};
}

function assertHeld(response, holdId) {
    if (!response || response.active !== true || response.holdId !== holdId ||
        !Number.isSafeInteger(response.bytes) || response.bytes <= 0 || response.painted !== true) {
        fail('boundary-held-frame-not-preserved');
    }
    return {active:true,holdId,bytes:response.bytes,painted:true};
}

function assertArmed(response, generationId, holdId) {
    if (!response || response.armed !== true || response.autoState !== 'armed' ||
        response.targetGen !== generationId || response.holdId !== holdId) fail('boundary-auto-arm-mismatch');
    return {armed:true,autoState:'armed',targetGen:generationId,holdId};
}

function assertCancelled(status, targetGen, holdId) {
    if (status.autoState !== 'cancelled' || status.targetGen !== targetGen || status.autoHoldId !== holdId ||
        status.active !== true || status.holdId !== holdId || status.bytes <= 0 || status.painted !== true) {
        fail('boundary-retired-lease-not-cancelled-or-hold-lost');
    }
    return status;
}

function normalizeGateDelivery(result) {
    if (result && result.released === true && result.transportCancelled === false && result.lateBodyDelivered === true &&
        Number.isSafeInteger(result.bodyBytes) && result.bodyBytes > 0) {
        return {transportCancelled:false,lateBodyDelivered:true,bodyBytes:result.bodyBytes};
    }
    if (result && result.released === false && result.transportCancelled === true && result.lateBodyDelivered === false &&
        ['client-closed-before-body','client-closed-during-body'].includes(result.reason)) {
        return {transportCancelled:true,lateBodyDelivered:false,reason:result.reason};
    }
    fail('boundary-http-delivery-state-invalid');
}

async function runCase(ctx, name, callback) {
    const entry = {name,status:'running'};
    ctx.result.boundaries.push(entry);
    ctx.activeBoundary = entry;
    ctx.boundaryLastRequest = null;
    ctx.boundaryLastStatus = null;
    try {
        Object.assign(entry, await callback(entry));
        entry.status = 'passed';
        return entry;
    } catch (error) {
        entry.status = 'failed';
        entry.errorCode = safeReason(error && (error.code || error.message)) || 'boundary-case-failed';
        if (ctx.boundaryLastRequest) entry.lastRequest = ctx.boundaryLastRequest;
        if (ctx.boundaryLastStatus) entry.lastAutoStatus = ctx.boundaryLastStatus;
        if (error && error.autoStatus) {
            entry.autoState = safeReason(error.autoStatus.autoState);
            entry.autoReason = safeReason(error.autoStatus.autoReason);
            entry.autoTargetMatched = typeof error.autoStatus.targetGen === 'number';
        }
        if (error && error.boundaryObservation) entry.observation = error.boundaryObservation;
        throw error;
    }
}

async function request(ctx, method, params, generationId, timeoutMs = 1800) {
    ctx.boundaryLastRequest = method;
    return ctx.stage(ctx.client.request(method, params || {}, {
        generationId,mediaScoped:false,timeoutMs
    }), timeoutMs + 300, 'boundary-' + method);
}

async function currentStatus(ctx, generationId) {
    const status = ctx.validateAutoStatus(await request(ctx, 'test-frame-status', {}, generationId, 1200));
    recordLastStatus(ctx, status);
    return status;
}

function recordLastStatus(ctx, status) {
    ctx.boundaryLastStatus = {
        autoState:safeReason(status.autoState), autoReason:safeReason(status.autoReason),
        targetGenerationPresent:Number.isSafeInteger(status.targetGen), holdPresent:status.holdId !== null,
        active:status.active, bytes:status.bytes, fence:safeReason(status.fence)
    };
}

async function waitForAuto(ctx, generationId, holdId, expectedColor, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    let last = null;
    while (Date.now() < deadline) {
        const remaining = Math.max(1, deadline - Date.now());
        const raw = await request(ctx, 'test-frame-status', {}, generationId, Math.min(1000, remaining));
        last = ctx.validateAutoStatus(raw);
        recordLastStatus(ctx, last);
        if (last.autoState === 'unavailable' || last.autoState === 'cancelled') {
            const error = new Error('boundary-auto-' + last.autoState);
            error.code = error.message;
            error.autoStatus = last;
            throw error;
        }
        if (last.autoState === 'released') {
            const released = ctx.validateAutoReleasedStatus(raw, generationId, holdId, expectedColor);
            return released;
        }
        if (!['armed','capture-pending','release-pending'].includes(last.autoState) ||
            last.targetGen !== generationId || last.autoHoldId !== holdId) fail('boundary-auto-state-mismatch');
        await ctx.delay(Math.min(80, Math.max(0, deadline - Date.now())));
    }
    const error = new Error('boundary-auto-timeout');
    error.code = error.message;
    error.autoStatus = last;
    throw error;
}

async function waitForState(ctx, generationId, predicate, timeoutMs, label) {
    const deadline = Date.now() + timeoutMs;
    let last = null;
    while (Date.now() < deadline) {
        last = await currentStatus(ctx, generationId);
        if (predicate(last)) return last;
        if (last.autoState === 'unavailable' || last.autoState === 'cancelled') return last;
        await ctx.delay(Math.min(80, Math.max(0, deadline - Date.now())));
    }
    if (last) return last;
    fail('boundary-timeout-' + label);
}

async function waitForPromiseResult(ctx, promise, timeoutMs, label) {
    const settled = Promise.resolve(promise).then(value => ({state:'fulfilled',value}), error => ({
        state:error && error.state || 'rejected', code:safeReason(error && (error.state || error.code || error.message)) || 'request-failed'
    }));
    return ctx.stage(settled, timeoutMs, 'boundary-' + label).catch(error => {
        if (error && String(error.code || '').includes('deadline')) return {state:'pending'};
        if (error && String(error.code || '').startsWith('boundary-')) return {state:'pending'};
        throw error;
    });
}

async function makeHttpGate(ctx, mediaPath) {
    let heldResponse = null;
    let requestResolve;
    let requestReject;
    let released = false;
    let transportCancelled = false;
    const received = new Promise((resolve, reject) => { requestResolve = resolve; requestReject = reject; });
    const server = http.createServer((request, response) => {
        if (request.method !== 'GET' || request.url !== '/gate/' + path.basename(mediaPath)) {
            response.statusCode = 404;
            response.end();
            return;
        }
        heldResponse = response;
        response.once('close', () => {
            if (!response.writableFinished) transportCancelled = true;
        });
        requestResolve({received:true,loopback:true,method:'GET'});
    });
    await ctx.stage(new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    }), 1500, 'boundary-http-listen');
    const address = server.address();
    if (!address || address.address !== '127.0.0.1' || !Number.isInteger(address.port)) fail('boundary-http-not-loopback');
    return {
        url:'http://127.0.0.1:' + address.port + '/gate/' + path.basename(mediaPath),
        received:ctx.stage(received, 6000, 'boundary-http-request').catch(error => {
            requestReject(error);
            throw error;
        }),
        async release() {
            if (!heldResponse) fail('boundary-http-gate-not-releasable');
            if (transportCancelled || heldResponse.destroyed || heldResponse.closed) {
                return {released:false,transportCancelled:true,lateBodyDelivered:false,reason:'client-closed-before-body'};
            }
            if (released) fail('boundary-http-gate-already-released');
            released = true;
            const stats = fs.statSync(mediaPath);
            heldResponse.statusCode = 200;
            heldResponse.setHeader('content-type', 'video/x-yuv4mpeg');
            heldResponse.setHeader('content-length', stats.size);
            const finished = new Promise(resolve => {
                heldResponse.once('finish', () => resolve('finished'));
                heldResponse.once('close', () => resolve(heldResponse.writableFinished ? 'finished' : 'closed'));
            });
            const stream = fs.createReadStream(mediaPath);
            stream.on('error', error => heldResponse.destroy(error));
            stream.pipe(heldResponse);
            const finishState = await ctx.stage(finished, 5000, 'boundary-http-response-finish');
            if (finishState !== 'finished') {
                return {released:false,transportCancelled:true,lateBodyDelivered:false,reason:'client-closed-during-body'};
            }
            return {released:true,transportCancelled:false,lateBodyDelivered:true,bodyBytes:stats.size};
        },
        async close() {
            if (heldResponse && !heldResponse.writableEnded) heldResponse.destroy();
            if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
            if (server.listening) await Promise.race([
                new Promise(resolve => server.close(resolve)),
                new Promise(resolve => setTimeout(resolve, 1000))
            ]);
        }
    };
}

async function runBoundaryCases(ctx) {
    ctx.result.boundaries = [];
    const client = ctx.client;
    const args = ctx.args;

    await runCase(ctx, 'retired-hold-rejection-and-wrong-release-preserves-id1', async () => {
        const generationA = client.currentGenerationId;
        const initialColor = await ctx.waitForColor('red', 'boundary-A-precondition');
        const holdResponse = await request(ctx, 'test-frame-hold', {}, generationA, 2500);
        const hold = ctx.validateHoldResponse(holdResponse);
        const retiredGeneration = client.beginGeneration('boundary-retire-A', ['core-idle','time-pos','pause']);
        const staleHold = assertUnavailable(await request(ctx, 'test-frame-hold', {}, generationA, 1500));
        const preserved = assertHeld(await request(ctx, 'test-frame-status', {}, retiredGeneration, 1500), hold.holdId);
        const wrongRelease = assertUnavailable(await request(ctx, 'test-frame-release', {holdId:hold.holdId + 1000}, retiredGeneration, 1500));
        const preservedAfterWrongRelease = assertHeld(await request(ctx, 'test-frame-status', {}, retiredGeneration, 1500), hold.holdId);
        await ctx.stage(client.stop(), 5000, 'boundary-stop-between-A-and-B');
        const generationB = client.beginGeneration('boundary-B-after-real-stop', ['core-idle','time-pos','pause']);
        const preservedAfterStop = assertHeld(await request(ctx, 'test-frame-status', {}, generationB, 1500), hold.holdId);
        return {generationA,retiredGeneration,generationB,holdId:hold.holdId,initialColor,staleHold,preserved,
            wrongRelease,preservedAfterWrongRelease,preservedAfterStop};
    });

    await runCase(ctx, 'first-auto-release-and-seek-does-not-recapture', async () => {
        const {generationB,holdId} = ctx.result.boundaries[0];
        const arm = assertArmed(await request(ctx, 'test-frame-arm-next', {holdId}, generationB), generationB, holdId);
        const repeatedArm = assertUnavailable(await request(ctx, 'test-frame-arm-next', {holdId}, generationB));
        await ctx.loadInGeneration(generationB, args.mediaBPath);
        const autoRelease = await waitForAuto(ctx, generationB, holdId, 'green');
        const greenColor = await ctx.waitForColor('green', 'boundary-B-after-auto-release');
        const beforeSeek = await currentStatus(ctx, generationB);
        const eventCountBeforeSeek = ctx.events.length;
        client.submitCommand(['seek','1','absolute','exact']);
        const seekAdvanced = () => {
            const positions = ctx.events.slice(eventCountBeforeSeek).filter(event => event.generationId === generationB &&
                event.name === 'time-pos').map(event => Number(event.value)).filter(Number.isFinite);
            return positions.some((value, index) => index > 0 && value >= 1 && value > positions[index - 1]);
        };
        await ctx.waitFor(seekAdvanced, 3500, 'boundary-seek-time-pos-advanced');
        const afterSeek = await currentStatus(ctx, generationB);
        if (afterSeek.autoState !== 'released' || afterSeek.targetGen !== generationB || afterSeek.autoHoldId !== holdId ||
            JSON.stringify(afterSeek.captureMetadata) !== JSON.stringify(beforeSeek.captureMetadata)) fail('boundary-seek-recaptured-or-changed-metadata');
        return {
            generationB,holdId,arm,repeatedArm,autoRelease,
            seekObserved:true,timePosAdvancedAfterSeek:true,metadataStableAfterSeek:true,postReleaseColor:greenColor
        };
    });

    await runCase(ctx, 'late-release-cannot-clear-new-hold', async () => {
        const generationB = client.currentGenerationId;
        const hold2 = ctx.validateHoldResponse(await request(ctx, 'test-frame-hold', {}, generationB, 2500));
        const firstHoldId = ctx.result.boundaries[0].holdId;
        if (!Number.isSafeInteger(firstHoldId) || hold2.holdId === firstHoldId) fail('boundary-hold-id-not-advanced');
        const lateRelease = assertUnavailable(await request(ctx, 'test-frame-release', {holdId:firstHoldId}, generationB, 1500));
        const preserved = assertHeld(await request(ctx, 'test-frame-status', {}, generationB, 1500), hold2.holdId);
        return {generationB,oldHoldId:firstHoldId,newHoldId:hold2.holdId,lateRelease,preserved};
    });

    await runCase(ctx, 'retired-pending-http-generation-cannot-affect-current-generation', async () => {
        const hold2 = ctx.result.boundaries[2].newHoldId;
        await ctx.stage(client.stop(), 5000, 'boundary-stop-before-T');
        const generationT = client.beginGeneration('boundary-T-http-gate', ['core-idle','time-pos','pause']);
        const armT = assertArmed(await request(ctx, 'test-frame-arm-next', {holdId:hold2}, generationT), generationT, hold2);
        const gate = await makeHttpGate(ctx, args.mediaBPath);
        try {
            client.setProperty('volume',0);
            client.setProperty('pause',false);
            const tLoad = client.load(['loadfile',gate.url]);
            tLoad.promise.catch(() => {});
            const gateRequest = await gate.received;
            const beforeRetireStatus = await currentStatus(ctx, generationT);
            if (beforeRetireStatus.autoState !== 'armed' || beforeRetireStatus.targetGen !== generationT ||
                beforeRetireStatus.autoHoldId !== hold2 || beforeRetireStatus.active !== true || beforeRetireStatus.holdId !== hold2) {
                fail('boundary-T-not-armed-before-supersede');
            }
            if (client.state.fileLoaded || client.state.playing) fail('boundary-T-loaded-before-body-release');
            const loadWasPending = client.pending.has(tLoad.promise.requestId);
            const loadHistoryBeforeRetire = client.requestHistory.find(item => item.requestId === tLoad.promise.requestId);
            const loadAckStateBeforeRetire = loadWasPending ? 'pending' : loadHistoryBeforeRetire && loadHistoryBeforeRetire.state || 'unknown';
            const generationC = client.beginGeneration('boundary-C-supersedes-T', ['core-idle','time-pos','pause']);
            const tLoadOutcome = await waitForPromiseResult(ctx, tLoad.promise, 700, 'T-load-retirement-outcome');
            if (loadWasPending && tLoadOutcome.state !== 'GENERATION_RETIRED') fail('boundary-pending-T-load-not-retired');
            const cancelledStatus = await waitForState(ctx, generationC,
                status => status.autoState === 'cancelled', 1800, 'T-auto-cancel');
            const cancelled = assertCancelled(cancelledStatus, generationT, hold2);
            const preservedAfterCancel = assertHeld(cancelledStatus, hold2);
            const armC = assertArmed(await request(ctx, 'test-frame-arm-next', {holdId:hold2}, generationC), generationC, hold2);
            await ctx.loadInGeneration(generationC, args.mediaAPath);
            const autoReleaseC = await waitForAuto(ctx, generationC, hold2, 'red');
            const redColor = await ctx.waitForColor('red', 'boundary-C-after-auto-release');
            const gateRelease = await gate.release();
            const gateDelivery = normalizeGateDelivery(gateRelease);
            await ctx.delay(700);
            const afterLateBody = await currentStatus(ctx, generationC);
            const stableAuto = ctx.validateAutoReleasedStatus({
                ...afterLateBody,
                captureMetadata:afterLateBody.captureMetadata && {
                    w:afterLateBody.captureMetadata.width,h:afterLateBody.captureMetadata.height,
                    bytes:afterLateBody.captureMetadata.bytes,captureMs:afterLateBody.captureMetadata.captureMs,
                    meanRGB:afterLateBody.captureMetadata.meanRGB,hash:afterLateBody.captureMetadata.hash
                }
            }, generationC, hold2, 'red');
            const stillRed = await ctx.waitForColor('red', 'boundary-C-after-late-http-body');
            if (client.currentGenerationId !== generationC || !client.state.fileLoaded || !client.state.playing) {
                fail('boundary-late-T-completion-changed-current-client-state');
            }
            return {
                generationT,generationC,holdId:hold2,armT,gateRequest,
                tFileLoadedBeforeSupersede:false,tCorePlayingBeforeSupersede:false,
                loadAckStateBeforeRetire,tLoadOutcome,cancelled,preservedAfterCancel,armC,autoReleaseC,
                gateDelivery,transportCancelled:gateDelivery.transportCancelled,
                lateBodyDelivered:gateDelivery.lateBodyDelivered,
                stableAutoAfterLateBody:gateDelivery.lateBodyDelivered,
                stableAutoAfterTransportCancel:gateDelivery.transportCancelled,
                currentGenerationUnaffected:true,
                postReleaseColor:redColor,postLateBodyColor:stillRed
            };
        } finally {
            await gate.close();
        }
    });

    await runCase(ctx, 'failed-load-clears-auto-lease', async () => {
        const generationC = client.currentGenerationId;
        const hold3 = ctx.validateHoldResponse(await request(ctx, 'test-frame-hold', {}, generationC, 2500));
        await ctx.stage(client.stop(), 5000, 'boundary-stop-before-failed-load');
        const failureGeneration = client.beginGeneration('boundary-failed-local-load', ['core-idle','time-pos','pause']);
        const arm = assertArmed(await request(ctx, 'test-frame-arm-next', {holdId:hold3.holdId}, failureGeneration),
            failureGeneration, hold3.holdId);
        const missingPath = path.join(args.outputPath, 'missing-boundary-media.mp4');
        if (fs.existsSync(missingPath)) fail('boundary-missing-fixture-already-exists');
        client.setProperty('volume',0);
        client.setProperty('pause',false);
        const missingLoad = client.load(['loadfile',missingPath]);
        missingLoad.promise.catch(() => {});
        const loadResult = await waitForPromiseResult(ctx, missingLoad.promise, 2500, 'missing-load-result');
        let failureObserved = false;
        let failureObservationError = null;
        try {
            failureObserved = await ctx.waitFor(() => client.state.status === 'ended' || ctx.events.some(event =>
                event.generationId === failureGeneration && event.name === 'end-file'), 3500, 'missing-load-end-file');
        } catch (error) { failureObservationError = safeReason(error && (error.code || error.message)); }
        const status = await currentStatus(ctx, failureGeneration);
        const contractMet = ['unavailable','cancelled'].includes(status.autoState) && status.active === false &&
            status.bytes === 0 && status.holdId === null && status.targetGen === failureGeneration &&
            status.autoHoldId === hold3.holdId && failureObserved;
        if (!contractMet) {
            const error = new Error(failureObserved ? 'boundary-auto-lease-not-cleared-on-load-failure' : 'boundary-missing-load-failure-not-observed');
            error.code = error.message;
            error.boundaryObservation = {autoState:status.autoState,active:status.active,bytes:status.bytes,
                holdPresent:status.holdId !== null,targetMatched:status.targetGen === failureGeneration,
                autoHoldMatched:status.autoHoldId === hold3.holdId,failureObserved,
                failureObservationError};
            Object.assign(ctx.result.boundaries[ctx.result.boundaries.length - 1], {
                generationC,failureGeneration,holdId:hold3.holdId,arm,missingLoadState:loadResult.state,
                failureObserved,observation:error.boundaryObservation,contractMet:false
            });
            throw error;
        }
        return {generationC,failureGeneration,holdId:hold3.holdId,arm,missingLoadState:loadResult.state,
            failureObserved,observation:{autoState:status.autoState,active:status.active,bytes:status.bytes},contractMet:true};
    });

    await runCase(ctx, 'preparation-cancellation-is-exact-and-production-response-is-minimal', async () => {
        const sourceGeneration = client.beginGeneration('boundary-prepare-source', ['core-idle','time-pos','pause']);
        await ctx.loadInGeneration(sourceGeneration, args.mediaAPath);
        await ctx.waitForColor('red', 'boundary-prepare-source-red');
        client.retireGeneration('boundary-prepare-retired-source');
        const firstControl = client.allocateGenerationId();
        const first = await request(ctx, 'presentation-prepare', {sourceGenerationId:sourceGeneration}, firstControl, 2500);
        if (first.ready !== true || first.painted !== true || !Number.isSafeInteger(first.holdId) ||
            Object.keys(first).sort().join(',') !== 'holdId,painted,ready,status') fail('boundary-production-response-not-minimal');
        const secondControl = client.allocateGenerationId();
        const second = ctx.validateHoldResponse(await request(ctx, 'test-frame-prepare-retired',
            {sourceGenerationId:sourceGeneration}, secondControl, 2500));
        if (first.holdId === second.holdId) fail('boundary-reused-hold-id-not-advanced');
        await request(ctx, 'presentation-cancel-preparation', {preparationGenerationId:firstControl}, client.allocateGenerationId());
        const afterOldCancel = assertHeld(await request(ctx, 'test-frame-status', {}, client.allocateGenerationId()), second.holdId);
        await request(ctx, 'presentation-cancel-preparation', {preparationGenerationId:secondControl}, client.allocateGenerationId());
        const afterOwnCancel = await currentStatus(ctx, client.allocateGenerationId());
        if (afterOwnCancel.active || afterOwnCancel.bytes !== 0 || afterOwnCancel.holdId !== null) fail('boundary-own-preparation-not-cleared');
        const tombstone = client.allocateGenerationId();
        await request(ctx, 'presentation-cancel-preparation', {preparationGenerationId:tombstone}, client.allocateGenerationId());
        const cancelledBeforePrepare = assertUnavailable(await request(ctx, 'presentation-prepare',
            {sourceGenerationId:sourceGeneration}, tombstone, 2500));
        return {sourceGeneration,firstControl,secondControl,firstHold:first.holdId,secondHold:second.holdId,
            minimalProductResponse:true,afterOldCancel,ownPreparationCleared:true,cancelledBeforePrepare};
    });

    return {completed:true,caseCount:ctx.result.boundaries.length};
}

module.exports = {runBoundaryCases,safeReason,configureLoopbackProxyBypass,assertUnavailable,assertHeld,assertArmed,
    assertCancelled,normalizeGateDelivery};
