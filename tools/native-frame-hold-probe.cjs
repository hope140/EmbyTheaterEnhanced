'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {NativeHelperClient} = require('../src/electronapp/native-helper/controller');

const EXPECTED_LIBMPV_VERSION = 'mpv v0.41.0-920-gdd5d17d32';
const TOTAL_PROBE_MS = 40000;
const CLEANUP_RESERVE_MS = 5000;
const HOST_BOUNDS = Object.freeze({width: 960, height: 540});
const MPV_CONFIG = 'scale=bilinear\nsub-font=ETE-CONFIG-PROBE\nvo=gpu-next\ngpu-context=d3d11\nhwdec=no\ndemuxer-max-bytes=3072MiB\n';

function fail(code) {
    const error = new Error(code);
    error.code = code;
    throw error;
}

function parseArguments(argv) {
    const args = Array.isArray(argv) ? argv.slice() : [];
    let fullscreen = false;
    if (args[args.length - 1] === '--fullscreen') {
        fullscreen = true;
        args.pop();
    }
    if (args.length !== 5 || args.some(value => typeof value !== 'string' || !value || value.startsWith('--'))) {
        fail('usage');
    }

    const [helperPath, libmpvPath, mediaAPath, mediaBPath, outputPath] = args.map(value => path.resolve(value));
    for (const file of [helperPath, libmpvPath, mediaAPath, mediaBPath]) {
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) fail('input-file-missing');
    }
    if (mediaAPath.toLowerCase() === mediaBPath.toLowerCase()) fail('media-inputs-must-differ');
    if (fs.existsSync(outputPath)) fail('output-directory-exists');
    if (!fs.existsSync(path.dirname(outputPath)) || !fs.statSync(path.dirname(outputPath)).isDirectory()) {
        fail('output-parent-missing');
    }
    return {helperPath, libmpvPath, mediaAPath, mediaBPath, outputPath, fullscreen};
}

async function hashFile(filePath) {
    const hash = crypto.createHash('sha256');
    await new Promise((resolve, reject) => {
        const stream = fs.createReadStream(filePath);
        stream.on('data', chunk => hash.update(chunk));
        stream.once('error', reject);
        stream.once('end', resolve);
    });
    return hash.digest('hex');
}

function bounded(promise, milliseconds, label) {
    let timer;
    return Promise.race([
        Promise.resolve(promise),
        new Promise((_resolve, reject) => {
            timer = setTimeout(() => reject(Object.assign(new Error(label), {code: label})), milliseconds);
        })
    ]).finally(() => clearTimeout(timer));
}

function validateHoldResponse(response) {
    if (!response || typeof response !== 'object' || response.ready !== true ||
        response.status !== 'held' || response.painted !== true) fail('frame-hold-not-ready-or-painted');
    if (!Number.isSafeInteger(response.holdId) || response.holdId <= 0) fail('frame-hold-id-invalid');
    if (!Number.isInteger(response.w) || response.w <= 0 ||
        !Number.isInteger(response.h) || response.h <= 0 ||
        !Number.isSafeInteger(response.bytes) || response.bytes <= 0) fail('frame-hold-metadata-invalid');
    if (typeof response.captureMs !== 'number' || !Number.isFinite(response.captureMs) || response.captureMs < 0) {
        fail('frame-hold-metadata-invalid');
    }
    const rgb = response.meanRGB;
    if (!rgb || !['r', 'g', 'b'].every(channel => Number.isFinite(rgb[channel]) && rgb[channel] >= 0 && rgb[channel] <= 255)) {
        fail('frame-hold-metadata-invalid');
    }
    if (typeof response.hash !== 'string' || !response.hash || response.hash.length > 128) fail('frame-hold-metadata-invalid');
    return {
        holdId: response.holdId, width: response.w, height: response.h, bytes: response.bytes,
        captureMs: response.captureMs, meanRGB: {r: rgb.r, g: rgb.g, b: rgb.b}, hash: response.hash,
        ready: response.ready, painted: response.painted, status: response.status
    };
}

function validateHeldStatus(response, holdId) {
    if (!response || response.active !== true || response.holdId !== holdId ||
        !Number.isSafeInteger(response.bytes) || response.bytes <= 0 || response.painted !== true) {
        fail('frame-hold-status-mismatch');
    }
    const result = {active: true, holdId: response.holdId, bytes: response.bytes, painted: true};
    for (const name of ['lastPaintSucceeded','frameLayeredReady','hostExists','hostVisible','frameExists','frameVisible',
        'frameParentMatches','videoExists','videoVisible','videoParentMatches','frameAboveVideo','siblingOrderKnown']) {
        if (typeof response[name] === 'boolean') result[name] = response[name];
    }
    for (const name of ['hostClientSize','frameClientSize','videoClientSize']) {
        const size = response[name];
        if (size && Number.isInteger(size.w) && Number.isInteger(size.h)) result[name] = {w:size.w,h:size.h};
    }
    return result;
}

function validateReleaseResponse(response, holdId) {
    if (!response || response.released !== true || response.active !== false || response.bytes !== 0 || response.holdId !== holdId) {
        fail('frame-hold-release-mismatch');
    }
    return {released: true, active: false, bytes: 0, holdId: response.holdId};
}

function validateReleasedStatus(response, holdId) {
    if (!response || response.active !== false || response.bytes !== 0 || response.holdId !== null) {
        fail('frame-hold-release-status-mismatch');
    }
    return {active: false, bytes: 0, holdId: null, releasedHoldId: holdId};
}

function safeErrorCode(error) {
    const value = String(error && (error.code || error.message) || 'probe-failed');
    if (/^(?:timeout:)?[a-z0-9][a-z0-9._:-]{0,95}$/i.test(value)) return value;
    return 'probe-failed';
}

function delay(milliseconds) { return new Promise(resolve => setTimeout(resolve, milliseconds)); }

function rectEquals(a, b) {
    return !!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

async function runProbe(args, electron) {
    const {app, BrowserWindow, desktopCapturer, screen} = electron;
    const outputPath = args.outputPath;
    app.setName('ete-native-frame-hold-probe');
    const mpvHome = path.join(outputPath, 'mpv');

    const result = {
        schemaVersion: 1,
        status: 'running',
        evidenceClass: 'experimental-capability-only',
        productAcceptance: false,
        fullscreen: {requested: args.fullscreen, enteredEvent: false, boundsMatched: false, apiIsFullScreen: null},
        inputs: {},
        transitions: [],
        screenCapture: null,
        cleanup: {captureStopped: true, captureHandlerRestored: true, helperKilled: true, hostDestroyed: true}
    };
    let host = null;
    let client = null;
    let screenCapture = null;
    let deadlineAt = Date.now() + TOTAL_PROBE_MS;
    const events = [];
    const startAt = Date.now();
    const eventsSeen = message => {
        if (!message || !['core-idle', 'pause'].includes(message.name)) return;
        events.push({atMs: Date.now() - startAt, name: message.name, generationId: message.generationId, value: message.value});
        if (events.length > 128) events.shift();
    };

    function remainingMs() { return Math.max(0, deadlineAt - Date.now()); }
    function requireBudget(milliseconds, label) {
        if (remainingMs() < milliseconds + CLEANUP_RESERVE_MS) fail('probe-deadline-before-' + label);
    }
    function stage(promise, milliseconds, label) {
        const available = remainingMs() - CLEANUP_RESERVE_MS;
        if (available <= 0) fail('probe-deadline-before-' + label);
        return bounded(promise, Math.min(milliseconds, available), label);
    }
    async function waitFor(predicate, milliseconds, label) {
        const end = Math.min(Date.now() + milliseconds, deadlineAt - CLEANUP_RESERVE_MS);
        while (Date.now() < end) {
            if (await predicate()) return true;
            await delay(20);
        }
        fail('timeout-' + label);
    }
    async function captureCurrentColor() {
        const script = 'window.__eteTransitionScreenStream && window.__eteTransitionScreenStream.currentColor()';
        return stage(host.webContents.executeJavaScript(script), 750, 'screen-color-read');
    }
    async function waitForColor(expectedClass, label) {
        let color = null;
        try {
            await waitFor(async () => {
                color = await captureCurrentColor();
                return !!color && color.colorClass === expectedClass;
            }, 5000, label);
        } catch (error) {
            result.failedColorObservation = {stage:label,expected:expectedClass,lastColor:color};
            try { result.failedColorObservation.stream = await stage(host.webContents.executeJavaScript(
                'window.__eteTransitionScreenStream && window.__eteTransitionScreenStream.diagnostic()'), 500, 'capture-diagnostic'); } catch (_) { }
            throw error;
        }
        return color;
    }
    async function waitForCorePlaying(generationId, label) {
        return waitFor(() => events.some(event => event.generationId === generationId &&
            event.name === 'core-idle' && event.value === false), 6000, label);
    }
    async function loadMedia(label, mediaPath) {
        const generationId = client.beginGeneration(label, ['core-idle', 'time-pos', 'pause']);
        client.setProperty('volume', 0);
        client.setProperty('pause', false);
        const load = client.load(['loadfile', mediaPath]);
        await stage(load.promise, 5000, 'load-request');
        await waitForCorePlaying(generationId, 'core-playing');
        return generationId;
    }
    async function holdStopSwapRelease(action, fromName, fromPath, fromColor, toName, toPath, toColor) {
        const progress = {action,from:fromName,to:toName,phase:'old-video-precondition'};
        result.transitions.push(progress);
        const beforeColor = await waitForColor(fromColor, action + '-old-video-precondition');
        progress.oldVideoColor = beforeColor;
        const actionStartedAt = Date.now();
        if (!screenCapture.start(action)) fail('screen-capture-action-not-started');
        await stage(host.webContents.executeJavaScript('0'), 500, 'screen-capture-arm-barrier');

        const holdStartedAt = Date.now();
        const generationId = client.currentGenerationId;
        const holdResponse = await stage(client.request('test-frame-hold', {}, {
            generationId, mediaScoped: false, timeoutMs: 3000
        }), 3500, 'frame-hold-request');
        const holdRequestRoundTripMs = Date.now() - holdStartedAt;
        result.lastFrameAttempt = {ready:holdResponse && holdResponse.ready === true,
            painted:holdResponse && holdResponse.painted === true,
            reason:holdResponse && typeof holdResponse.reason === 'string' && /^[a-z-]+$/.test(holdResponse.reason) ? holdResponse.reason : null};
        const hold = validateHoldResponse(holdResponse);
        Object.assign(progress, {phase:'holding',hold,holdRequestRoundTripMs,generationId});
        const statusBeforeStop = validateHeldStatus(await stage(client.request('test-frame-status', {}, {
            generationId, mediaScoped: false, timeoutMs: 2000
        }), 2500, 'frame-hold-status'), hold.holdId);
        progress.holdStatusBeforeStop = statusBeforeStop;

        const stopStartedAt = Date.now();
        const stopResponse = await stage(client.stop(), 5500, 'real-stop');
        const realStop = client.state && client.state.status === 'stopped';
        const stopElapsedMs = Date.now() - stopStartedAt;
        if (!realStop) fail('real-stop-not-observed');
        const stopRequest = client.requestHistory.slice().reverse().find(entry => entry.method === 'stop');
        if (!stopRequest || stopRequest.state !== 'RESOLVED') fail('real-stop-request-not-resolved');
        progress.phase = 'stopped';
        progress.realStop = {completed:true,state:'stopped',requestState:stopRequest.state,elapsedMs:stopElapsedMs};
        progress.holdStatusAfterStop = validateHeldStatus(await stage(client.request('test-frame-status', {}, {
            mediaScoped:false,timeoutMs:2000}), 2500, 'frame-status-after-stop'), hold.holdId);
        await delay(300);
        progress.holdStatusAfterDelay = validateHeldStatus(await stage(client.request('test-frame-status', {}, {
            mediaScoped:false,timeoutMs:2000}), 2500, 'frame-status-after-delay'), hold.holdId);

        const heldColor = await waitForColor(fromColor, action + '-held-screen-color');

        const nextGeneration = await loadMedia('probe-' + action + '-' + toName, toPath);
        await delay(200); // Experiment control point only; never evidence of a production first-frame boundary.
        const releaseResponse = await stage(client.request('test-frame-release', {holdId: hold.holdId}, {
            generationId: nextGeneration, mediaScoped: false, timeoutMs: 3000
        }), 3500, 'frame-release-request');
        const released = validateReleaseResponse(releaseResponse, hold.holdId);
        const statusAfterRelease = validateReleasedStatus(await stage(client.request('test-frame-status', {}, {
            generationId: nextGeneration, mediaScoped: false, timeoutMs: 2000
        }), 2500, 'frame-status-after-release'), hold.holdId);
        const newColor = await waitForColor(toColor, action + '-new-video-color');
        await delay(Math.max(0, actionStartedAt + 2100 - Date.now()));

        return Object.assign(progress, {
            phase:'released',
            action, from: fromName, to: toName, generationId, nextGeneration,
            oldVideoColor: beforeColor, hold,
            holdRequestRoundTripMs,
            holdStatusBeforeStop: statusBeforeStop,
            realStop: {completed: true, state: 'stopped', requestState: stopRequest.state,
                elapsedMs: stopElapsedMs, responseType: typeof stopResponse},
            heldScreenColor: heldColor,
            release: released,
            releaseStatus: statusAfterRelease,
            newVideoColor: newColor
        });
    }

    try {
        const inputFiles = [args.helperPath, args.libmpvPath, args.mediaAPath, args.mediaBPath];
        for (const input of inputFiles) {
            result.inputs[path.basename(input)] = {sha256: await hashFile(input)};
        }
        result.harness = {
            probe: {path: 'tools/native-frame-hold-probe.cjs', sha256: await hashFile(__filename)},
            screenCapture: {path: 'tools/transition-stream-capture.cjs', sha256: await hashFile(path.join(__dirname, 'transition-stream-capture.cjs'))}
        };

        requireBudget(5000, 'electron-ready');
        await stage(app.whenReady(), 5000, 'electron-ready');
        host = new BrowserWindow({
            width: HOST_BOUNDS.width, height: HOST_BOUNDS.height, frame: false, show: false,
            backgroundColor: '#000000', transparent: false, title: 'ETE Native Frame Hold Probe',
            webPreferences: {nodeIntegration: false, contextIsolation: true, sandbox: true}
        });
        result.cleanup.hostDestroyed = false;
        const fullscreenEvents = {entered: false, boundsMatched: false};
        host.on('enter-full-screen', () => { fullscreenEvents.entered = true; });
        const probeDocument = path.join(outputPath, 'probe.html');
        fs.writeFileSync(probeDocument,
            '<!doctype html><html><head><meta charset="utf-8"><title>Native frame hold probe</title>' +
            '<style>html,body{margin:0;width:100%;height:100%;background:#000;overflow:hidden}</style></head><body></body></html>',
            {encoding:'utf8',flag:'wx'});
        await stage(host.loadFile(probeDocument), 5000, 'host-load');
        host.show();
        host.focus();
        result.startupWindow = {visible:host.isVisible(),focused:host.isFocused(),bounds:host.getBounds()};
        await waitFor(() => host.isVisible() && host.isFocused(), 15000, 'host-visible-focused');

        if (args.fullscreen) {
            const targetDisplay = screen.getDisplayMatching(host.getBounds());
            if (!targetDisplay || !targetDisplay.bounds) fail('fullscreen-display-unavailable');
            host.setFullScreen(true);
            await waitFor(() => {
                fullscreenEvents.boundsMatched = rectEquals(host.getBounds(), targetDisplay.bounds);
                return fullscreenEvents.entered && fullscreenEvents.boundsMatched;
            }, 5000, 'fullscreen-native-event-and-bounds');
            result.fullscreen = {
                requested: true, enteredEvent: fullscreenEvents.entered, boundsMatched: fullscreenEvents.boundsMatched,
                apiIsFullScreen: typeof host.isFullScreen === 'function' ? host.isFullScreen() : null
            };
        } else {
            result.fullscreen = {requested: false, enteredEvent: false, boundsMatched: false, apiIsFullScreen: false};
        }

        const electronMajor = Number.parseInt(String(process.versions.electron).split('.')[0], 10);
        screenCapture = require('./transition-stream-capture.cjs').createTransitionStreamCapture({
            desktopCapturer, screen, getApplicationWindow: () => host,
            legacyDesktopCapture: Number.isFinite(electronMajor) && electronMajor < 25
        });
        result.cleanup.captureStopped = false;
        result.cleanup.captureHandlerRestored = false;
        requireBudget(12500, 'screen-capture-prepare');
        const screenReady = await stage(screenCapture.prepare(host), 8000, 'screen-capture-prepare');
        result.screenPreparation = screenReady;
        if (!screenReady || screenReady.ready !== true) fail('screen-capture-not-ready');

        const nativeHelperService = require('../src/electronapp/native-helper/service');
        const clientEvents = events;
        client = new NativeHelperClient({
            helperPath: args.helperPath, libmpvPath: args.libmpvPath,
            parentWindowHandle: nativeHelperService.decimalWindowHandle(host),
            expectedLibmpvVersion: nativeHelperService.EXPECTED_LIBMPV_VERSION,
            readyTimeoutMs: 10000, requestTimeoutMs: 3000,
            onEvent: eventsSeen
        });
        result.cleanup.helperKilled = false;
        requireBudget(10000, 'helper-start');
        await stage(client.start(), 10500, 'helper-start');
        await loadMedia('probe-initial-A', args.mediaAPath);
        const initialA = await waitForColor('red', 'initial-A-red-precondition');
        result.initialFrame = {media: path.basename(args.mediaAPath), color: initialA};

        await holdStopSwapRelease('next', 'A', args.mediaAPath, 'red', 'B', args.mediaBPath, 'green');
        await holdStopSwapRelease('previous', 'B', args.mediaBPath, 'green', 'A', args.mediaAPath, 'red');
        result.screenCapture = await stage(screenCapture.waitForResults(), 5000, 'screen-capture-results');
        result.helper = {
            protocolVersion: client.handshake && client.handshake.protocolVersion,
            helperVersion: client.handshake && client.handshake.helperVersion,
            libmpvVersion: client.handshake && client.handshake.libmpvVersion,
            capabilities: client.handshake && client.handshake.capabilities,
            acceptedCoreEvents: clientEvents.length
        };
        result.elapsedMs = Date.now() - startAt;
        result.status = 'completed';
    } catch (error) {
        result.status = 'failed';
        result.errorCode = safeErrorCode(error);
    } finally {
        if (screenCapture) {
            if (!result.screenCapture) {
                try { result.screenCapture = await bounded(screenCapture.waitForResults(), 2200, 'capture-failure-summary'); } catch (_) { }
            }
            try {
                const stopped = await bounded(screenCapture.stop(), 1800, 'capture-stop-deadline');
                result.cleanup.captureStopped = stopped && stopped.rendererStopped === true;
                result.cleanup.captureHandlerRestored = stopped && stopped.handlerRestored === true;
            } catch (_) { result.cleanup.captureStopped = false; result.cleanup.captureHandlerRestored = false; }
        }
        if (client) {
            try { await bounded(client.kill(), 2500, 'helper-kill-deadline'); result.cleanup.helperKilled = true; }
            catch (_) { result.cleanup.helperKilled = !!(client.child && client.child.exitCode !== null); }
        }
        if (host && !host.isDestroyed()) {
            try { host.destroy(); result.cleanup.hostDestroyed = true; }
            catch (_) { result.cleanup.hostDestroyed = false; }
        }
        result.cleanup.elapsedMs = Date.now() - startAt;
        result.cleanup.complete = result.cleanup.captureStopped === true && result.cleanup.captureHandlerRestored === true &&
            result.cleanup.helperKilled === true && result.cleanup.hostDestroyed === true;
        if (!result.cleanup.complete && result.status === 'completed') {
            result.status = 'failed';
            result.errorCode = 'cleanup-incomplete';
        }
        try { fs.writeFileSync(path.join(outputPath, 'probe-result.json'), JSON.stringify(result, null, 2) + '\n', {encoding: 'utf8', flag: 'wx'}); }
        catch (_) { result.status = 'failed'; result.errorCode = result.errorCode || 'result-write-failed'; }
        app.exit(result.status === 'completed' ? 0 : 1);
    }
}

async function main(argv) {
    const args = parseArguments(argv);
    fs.mkdirSync(args.outputPath, {recursive: false});
    const userData = path.join(args.outputPath, 'userData');
    const appData = path.join(args.outputPath, 'appdata');
    const mpvHome = path.join(args.outputPath, 'mpv');
    const temp = path.join(args.outputPath, 'temp');
    fs.mkdirSync(userData, {recursive: true});
    fs.mkdirSync(appData, {recursive: true});
    fs.mkdirSync(mpvHome, {recursive: true});
    fs.mkdirSync(temp, {recursive: true});
    fs.writeFileSync(path.join(mpvHome, 'mpv.conf'), MPV_CONFIG, {encoding: 'ascii', flag: 'wx'});
    process.env.APPDATA = appData;
    process.env.LOCALAPPDATA = appData;
    process.env.MPV_HOME = mpvHome;
    process.env.TEMP = temp;
    process.env.TMP = temp;

    const electron = require('electron');
    try {
        electron.app.setPath('userData', userData);
        return await runProbe(args, electron);
    } catch (error) {
        const result = {
            schemaVersion: 1, status: 'failed', evidenceClass: 'experimental-capability-only',
            productAcceptance: false, errorCode: safeErrorCode(error),
            cleanup: {captureStopped: true, captureHandlerRestored: true, helperKilled: true, hostDestroyed: true, complete: true}
        };
        try { fs.writeFileSync(path.join(args.outputPath, 'probe-result.json'), JSON.stringify(result, null, 2) + '\n', {encoding: 'utf8', flag: 'wx'}); }
        catch (_) { }
        electron.app.exit(1);
    }
}

if (require.main === module || process.versions.electron && process.type === 'browser') {
    main(process.argv.slice(2)).catch(error => {
        const code = safeErrorCode(error);
        process.stderr.write(JSON.stringify({status: 'failed', errorCode: code}) + '\n');
        if (process.versions.electron && process.type === 'browser') require('electron').app.exit(1);
        else process.exitCode = 1;
    });
}

module.exports = {
    parseArguments,
    validateHoldResponse,
    validateHeldStatus,
    validateReleaseResponse,
    validateReleasedStatus,
    safeErrorCode
};
