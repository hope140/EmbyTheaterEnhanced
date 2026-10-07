'use strict';

const ACTION_MS = 2000;
const MAX_FRAMES = 120;

function delay(milliseconds) { return new Promise(resolve => setTimeout(resolve, milliseconds)); }

function withDeadline(promise, milliseconds, label) {
    let timer;
    return Promise.race([
        promise,
        new Promise((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error(label)), milliseconds);
        })
    ]).finally(() => clearTimeout(timer));
}

function contains(outer, inner) {
    return inner.x >= outer.x && inner.y >= outer.y &&
        inner.x + inner.width <= outer.x + outer.width &&
        inner.y + inner.height <= outer.y + outer.height;
}

function classifyMeanColor(metrics) {
    const {r, g, b} = metrics.meanRGB;
    if (metrics.blackFraction >= 0.9) return 'black';
    if (r > g * 1.35 && b > g * 1.35 && Math.abs(r - b) <= Math.max(r, b) * 0.35) return 'purple';
    if (r > g * 1.35 && r > b * 1.35) return 'red';
    if (g > r * 1.35 && g > b * 1.35) return 'green';
    if (b > r * 1.35 && b > g * 1.35) return 'blue';
    return 'mixed';
}

// Serialized into the isolated application renderer. It never retains screen pixels.
async function rendererStreamCapture(config, colorClass) {
    const actionMs = 2000;
    const maxFrames = 120;
    let stream = null;
    let frameReader = null;
    let initialFrame = null;
    let accessExpired = false;
    let accessTimer;

    function bounded(promise, milliseconds, label) {
        let timer;
        return Promise.race([
            promise,
            new Promise((_resolve, reject) => {
                timer = setTimeout(() => reject(new Error(label)), milliseconds);
            })
        ]).finally(() => clearTimeout(timer));
    }

    function frameMetrics(data) {
        let red = 0, green = 0, blue = 0, black = 0, count = 0;
        let hash = 2166136261;
        for (let index = 0; index < data.length; index += 4) {
            const r = data[index], g = data[index + 1], b = data[index + 2];
            const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            red += r; green += g; blue += b;
            if (luma < 24) black++;
            count++;
            hash = Math.imul(hash ^ r, 16777619);
            hash = Math.imul(hash ^ g, 16777619);
            hash = Math.imul(hash ^ b, 16777619);
        }
        const metrics = {
            hash: (hash >>> 0).toString(16).padStart(8, '0'),
            meanRGB: {r: Math.round(red / count), g: Math.round(green / count), b: Math.round(blue / count)},
            meanLuma: Math.round((0.2126 * red + 0.7152 * green + 0.0722 * blue) / count),
            blackFraction: Math.round(1000 * black / count) / 1000
        };
        metrics.colorClass = colorClass(metrics);
        return metrics;
    }

    function stopStream() {
        if (controller) controller.running = false;
        if (frameReader) frameReader.cancel().catch(() => {});
        if (initialFrame) { initialFrame.close(); initialFrame = null; }
        if (stream) stream.getTracks().forEach(track => track.stop());
    }

    let controller = null;
    try {
        if (!navigator.mediaDevices || (config.legacySourceId
            ? typeof navigator.mediaDevices.getUserMedia !== 'function'
            : typeof navigator.mediaDevices.getDisplayMedia !== 'function')) {
            throw new Error('display-media-unavailable');
        }
        const pending = config.legacySourceId
            ? navigator.mediaDevices.getUserMedia({audio:false, video:{mandatory:{
                chromeMediaSource:'desktop', chromeMediaSourceId:config.legacySourceId,
                maxFrameRate:60,maxWidth:1280,maxHeight:720}}})
            : navigator.mediaDevices.getDisplayMedia({audio: false, video: {
                frameRate:{ideal:60,max:60},width:{ideal:1280,max:1280},height:{ideal:720,max:720}}});
        pending.then(lateStream => {
            if (accessExpired) lateStream.getTracks().forEach(track => track.stop());
        }, () => {});
        stream = await Promise.race([
            pending,
            new Promise((_resolve, reject) => {
                accessTimer = setTimeout(() => {
                    accessExpired = true;
                    reject(new Error('display-media-deadline'));
                }, 4000);
            })
        ]);
        clearTimeout(accessTimer);
        if (typeof MediaStreamTrackProcessor !== 'function') {
            throw new Error('track-processor-unavailable');
        }
        const processor = new MediaStreamTrackProcessor({track:stream.getVideoTracks()[0], maxBufferSize:1});
        frameReader = processor.readable.getReader();
        const firstRead = frameReader.read();
        firstRead.then(packet => { if (accessExpired && packet.value) packet.value.close(); }, () => {});
        const firstPacket = await bounded(firstRead, 2000, 'first-capture-frame-deadline');
        if (firstPacket.done || !firstPacket.value) throw new Error('screen-stream-ended');
        initialFrame = firstPacket.value;
        const videoSize = {width:initialFrame.displayWidth, height:initialFrame.displayHeight};
        const scaleX = videoSize.width / config.display.width;
        const scaleY = videoSize.height / config.display.height;
        const source = {
            x: Math.round((config.window.x - config.display.x + config.window.width * 0.2) * scaleX),
            y: Math.round((config.window.y - config.display.y + config.window.height * 0.15) * scaleY),
            width: Math.round(config.window.width * 0.6 * scaleX),
            height: Math.round(config.window.height * 0.55 * scaleY)
        };
        if (source.x < 0 || source.y < 0 || source.width < 1 || source.height < 1 ||
            source.x + source.width > videoSize.width || source.y + source.height > videoSize.height) {
            throw new Error('video-roi-outside-stream');
        }
        const canvas = document.createElement('canvas');
        canvas.width = 96;
        canvas.height = 54;
        const context = canvas.getContext('2d', {willReadFrequently: true});
        if (!context) throw new Error('canvas-unavailable');
        const rendererBounds = {x: window.screenX, y: window.screenY,
            width: window.innerWidth, height: window.innerHeight};
        function rendererStable() {
            return document.hasFocus() && window.screenX === rendererBounds.x &&
                window.screenY === rendererBounds.y && window.innerWidth === rendererBounds.width &&
                window.innerHeight === rendererBounds.height;
        }
        controller = {running: true, actions: {}, active: null, failure: null, lastFrame: null};
        function invalidateCapture(reason) {
            if (!controller.running) return;
            controller.failure = reason;
            controller.active = null;
            controller.lastFrame = null;
            stopStream();
        }
        function onFrame(frame) {
            if (!controller.running) return;
            const atMs = Date.now();
            if (controller.actions.previous && atMs > controller.actions.previous.endedAtMs) {
                stopStream();
                return;
            }
            if (!rendererStable()) {
                invalidateCapture('renderer-focus-or-bounds-changed');
                return;
            }
            const action = controller.active;
            try {
                if (frame.displayWidth !== videoSize.width || frame.displayHeight !== videoSize.height) {
                    invalidateCapture('screen-stream-size-changed');
                    return;
                }
                context.drawImage(frame, source.x, source.y, source.width, source.height,
                    0, 0, canvas.width, canvas.height);
                const metrics = frameMetrics(context.getImageData(0, 0, canvas.width, canvas.height).data);
                controller.lastFrame = {atMs, ...metrics};
                if (action && atMs >= action.startedAtMs && atMs <= action.endedAtMs &&
                    action.frames.length < maxFrames) {
                    action.frames.push({atMs, ...metrics});
                }
            } catch (_) {
                invalidateCapture('canvas-roi-read-failed');
                return;
            }
        }
        // Consume capture frames independently of the application's paint cycle.
        // A native video window can leave the transparent renderer hidden while
        // the composed desktop video remains visible.
        async function pumpFrames() {
            const reader = frameReader;
            let frame = initialFrame;
            initialFrame = null;
            try {
                while (frame) {
                    try { onFrame(frame); } finally { frame.close(); frame = null; }
                    if (!controller.running) break;
                    const packet = await reader.read();
                    if (packet.done) { if (controller.running) invalidateCapture('screen-stream-ended'); break; }
                    frame = packet.value;
                }
            } catch (_) {
                if (controller.running) invalidateCapture('screen-stream-read-failed');
            } finally {
                if (frame) frame.close();
                reader.releaseLock();
                if (frameReader === reader) frameReader = null;
            }
        }
        pumpFrames();
        if (!controller.running) throw new Error('renderer-focus-or-bounds-changed');
        window.__eteTransitionScreenStream = {
            start(action, startedAtMs) {
                if (!controller.running || (action !== 'next' && action !== 'previous')) return {ready: false};
                const existing = controller.actions[action];
                if (existing) return existing.startedAtMs === startedAtMs
                    ? {ready:true,armedAtMs:existing.armedAtMs} : {ready:false};
                const entry = {startedAtMs, endedAtMs: startedAtMs + actionMs, armedAtMs: Date.now(), frames: []};
                controller.actions[action] = entry;
                controller.active = entry;
                return {ready: true, armedAtMs: entry.armedAtMs};
            },
            results() {
                return {failure: controller.failure, actions: controller.actions,
                    videoSize};
            },
            currentColor() {
                const last = controller.lastFrame;
                if (!controller.running || !rendererStable() || !last || Date.now() - last.atMs > 150) return null;
                return {atMs: last.atMs, colorClass: last.colorClass, hash: last.hash,
                    meanRGB: last.meanRGB, meanLuma: last.meanLuma};
            },
            diagnostic() {
                const last = controller.lastFrame;
                return {running:controller.running, failure:controller.failure,
                    visibility:document.visibilityState, stable:rendererStable(),
                    lastFrameAgeMs:last ? Math.max(0, Date.now() - last.atMs) : null,
                    lastColor:last ? last.colorClass : null};
            },
            invalidate() {
                invalidateCapture('main-window-invalidated');
                return true;
            },
            stop() {
                stopStream();
                delete window.__eteTransitionScreenStream;
                return true;
            }
        };
        return {ready: true, videoSize, frameSource:'MediaStreamTrackProcessor'};
    } catch (error) {
        accessExpired = true;
        clearTimeout(accessTimer);
        stopStream();
        const known = new Set(['display-media-unavailable', 'display-media-deadline',
            'track-processor-unavailable', 'screen-stream-ended', 'video-roi-outside-stream',
            'canvas-unavailable', 'first-capture-frame-deadline',
            'renderer-focus-or-bounds-changed']);
        return {ready: false, reason: error && known.has(error.message)
            ? error.message : 'screen-stream-unavailable'};
    }
}

function createTransitionStreamCapture(options) {
    const {desktopCapturer, screen, getApplicationWindow} = options;
    const observations = new Map();
    let window = null;
    let session = null;
    let handlerInstalled = false;
    let displayId = null;
    let bounds = null;
    let preparation = {ready: false, reason: 'not-prepared'};
    let globalMonitor = null;
    let globalInvalidReason = null;

    function windowProblem() {
        const current = getApplicationWindow();
        if (!window || current !== window || window.isDestroyed() || !window.isVisible() ||
            !window.isFocused() || window.isMinimized()) return 'application-window-not-visible-and-focused';
        const now = window.getBounds();
        if (now.x !== bounds.x || now.y !== bounds.y || now.width !== bounds.width || now.height !== bounds.height) {
            return 'application-window-bounds-changed';
        }
        const display = screen.getDisplayMatching(now);
        if (!display || String(display.id) !== displayId || !contains(display.bounds, now)) {
            return 'application-window-display-changed';
        }
        return null;
    }

    function invalidateAll(reason) {
        if (globalInvalidReason) return;
        globalInvalidReason = reason;
        observations.forEach(entry => {
            if (Date.now() <= entry.endedAtMs && !entry.invalidReason) entry.invalidReason = reason;
        });
        if (window && !window.isDestroyed()) {
            try {
                window.webContents.executeJavaScript(
                    'window.__eteTransitionScreenStream && window.__eteTransitionScreenStream.invalidate()').catch(() => {});
            } catch (_) { }
        }
        if (globalMonitor) clearInterval(globalMonitor);
        globalMonitor = null;
    }

    async function prepare(applicationWindow) {
        window = applicationWindow;
        if (!window || window.isDestroyed() || !window.isVisible() || !window.isFocused() || window.isMinimized()) {
            return preparation = {ready: false, reason: 'application-window-not-visible-and-focused'};
        }
        bounds = window.getBounds();
        const display = screen.getDisplayMatching(bounds);
        if (!display || !contains(display.bounds, bounds)) {
            return preparation = {ready: false, reason: 'application-window-display-ambiguous'};
        }
        displayId = String(display.id);
        let sources;
        try {
            sources = await withDeadline(desktopCapturer.getSources({
                types: ['screen'], thumbnailSize: {width: 0, height: 0}, fetchWindowIcons: false
            }), 2000, 'screen-source-deadline');
        } catch (_) {
            return preparation = {ready: false, reason: 'screen-source-unavailable'};
        }
        const source = sources.find(item => String(item.display_id) === displayId);
        if (!source || windowProblem()) {
            return preparation = {ready: false, reason: 'matching-screen-source-unavailable'};
        }
        session = window.webContents && window.webContents.session;
        const legacyCapture = options.legacyDesktopCapture === true;
        if (legacyCapture && typeof source.id !== 'string') {
            return preparation = {ready:false, reason:'matching-screen-source-unavailable'};
        }
        if (!legacyCapture && (!session || typeof session.setDisplayMediaRequestHandler !== 'function')) {
            return preparation = {ready: false, reason: 'display-media-handler-unavailable'};
        }
        try {
            if (!legacyCapture) {
            session.setDisplayMediaRequestHandler((request, callback) => {
                const owner = getApplicationWindow();
                if (owner !== window || window.isDestroyed() || !request.videoRequested || request.audioRequested ||
                    !request.frame || request.frame !== window.webContents.mainFrame) {
                    callback({});
                    return;
                }
                callback({video: source});
            }, {useSystemPicker: false});
            handlerInstalled = true;
            }
        } catch (_) {
            return preparation = {ready: false, reason: 'display-media-handler-rejected'};
        }
        try {
            preparation = await withDeadline(window.webContents.executeJavaScript(
                '(' + rendererStreamCapture.toString() + ')(' + JSON.stringify({
                    display: display.bounds, window: bounds,
                    legacySourceId:legacyCapture ? source.id : null
                }) + ',' + classifyMeanColor.toString() + ')', true), 7500, 'screen-stream-prepare-deadline');
        } catch (_) {
            preparation = {ready: false, reason: 'screen-stream-prepare-failed'};
        }
        if (!preparation || preparation.ready !== true) {
            if (handlerInstalled) {
                try { session.setDisplayMediaRequestHandler(null); } catch (_) { }
            }
            handlerInstalled = false;
            preparation = {ready: false, reason: preparation && preparation.reason || 'screen-stream-unavailable'};
        } else {
            const problem = windowProblem();
            if (problem) invalidateAll(problem);
            else globalMonitor = setInterval(() => {
                const previous = observations.get('previous');
                if (previous && Date.now() > previous.endedAtMs) {
                    clearInterval(globalMonitor);
                    globalMonitor = null;
                    return;
                }
                const currentProblem = windowProblem();
                if (currentProblem) invalidateAll(currentProblem);
            }, 50);
        }
        return preparation;
    }

    function start(action, rendererStartedAtMs) {
        if ((action !== 'next' && action !== 'previous') || observations.has(action)) return false;
        const now = Date.now();
        if (rendererStartedAtMs !== undefined && (!Number.isFinite(rendererStartedAtMs) ||
            rendererStartedAtMs > now + 10 || now - rendererStartedAtMs > 100)) return false;
        const startedAtMs = rendererStartedAtMs === undefined ? now : rendererStartedAtMs;
        const entry = {action, startedAtMs, endedAtMs: startedAtMs + ACTION_MS,
            invalidReason: globalInvalidReason || (preparation.ready ? windowProblem() : preparation.reason),
            armedAtMs: null, monitor: null, armPromise: null};
        observations.set(action, entry);
        if (entry.invalidReason) return true;
        entry.monitor = setInterval(() => {
            if (Date.now() >= entry.endedAtMs) {
                clearInterval(entry.monitor);
                return;
            }
            const problem = windowProblem();
            if (problem) invalidateAll(problem);
        }, 50);
        try {
            entry.armPromise = withDeadline(window.webContents.executeJavaScript(
                'window.__eteTransitionScreenStream && window.__eteTransitionScreenStream.start(' +
                JSON.stringify(action) + ',' + JSON.stringify(startedAtMs) + ')'),
            1000, 'stream-action-arm-deadline').then(result => {
                if (!result || result.ready !== true) entry.invalidReason = 'stream-action-arm-failed';
                else entry.armedAtMs = result.armedAtMs;
            }, () => { entry.invalidReason = 'stream-action-arm-failed'; });
        } catch (_) {
            entry.invalidReason = 'stream-action-arm-failed';
        }
        return true;
    }

    async function waitForResults() {
        const entries = Array.from(observations.values());
        await Promise.all(entries.map(entry => entry.armPromise).filter(Boolean));
        const latestEnd = Math.max(0, ...entries.map(entry => entry.endedAtMs));
        if (latestEnd > Date.now()) await delay(latestEnd - Date.now());
        entries.forEach(entry => { if (entry.monitor) clearInterval(entry.monitor); });
        let renderer = {failure: preparation.reason, actions: {}};
        if (preparation.ready && window && !window.isDestroyed()) {
            try {
                renderer = await withDeadline(window.webContents.executeJavaScript(
                    'window.__eteTransitionScreenStream && window.__eteTransitionScreenStream.results()'),
                2000, 'stream-results-deadline');
            } catch (_) {
                renderer = {failure: 'stream-results-unavailable', actions: {}};
            }
        }
        const captures = entries.map(entry => {
            const raw = renderer && renderer.actions && renderer.actions[entry.action];
            const invalidWindow = entry.invalidReason || globalInvalidReason || renderer && renderer.failure;
            const samples = !invalidWindow && raw && Array.isArray(raw.frames) ? raw.frames.slice(0, MAX_FRAMES)
                .filter(frame => frame.atMs >= entry.startedAtMs && frame.atMs <= entry.endedAtMs) : [];
            const intervalsMs = samples.slice(1).map((frame, index) => frame.atMs - samples[index].atMs);
            const uniqueHashes = new Set(samples.map(frame => frame.hash)).size;
            const repeatedFrames = samples.slice(1).filter((frame, index) => frame.hash === samples[index].hash).length;
            const maxIntervalMs = intervalsMs.length ? Math.max(...intervalsMs) : null;
            const observedClasses = Object.fromEntries(['black', 'purple', 'red', 'green', 'blue', 'mixed']
                .map(name => [name, samples.filter(frame => frame.colorClass === name).length]));
            const oldColor = entry.action === 'next' ? 'red' : 'green';
            const newColor = entry.action === 'next' ? 'green' : 'red';
            const invalidReason = invalidWindow ||
                (!raw ? 'stream-action-missing' : null) ||
                (entry.armedAtMs === null || entry.armedAtMs - entry.startedAtMs > 100 ? 'stream-action-arm-late' : null);
            const cadenceUsable = samples.length >= 30 && uniqueHashes >= 3 && maxIntervalMs <= 100;
            const classification = invalidReason || !cadenceUsable ? 'INCONCLUSIVE'
                : observedClasses.black > 0 ? 'OBSERVED_BLACK_INTERVAL'
                : observedClasses[oldColor] > 0 && observedClasses[newColor] > 0
                    ? 'OBSERVED_VIDEO_TRANSITION' : 'INCONCLUSIVE';
            return {
                action: entry.action, startedAtMs: entry.startedAtMs, endedAtMs: entry.endedAtMs,
                classification,
                reason: invalidReason || (classification === 'INCONCLUSIVE' ? 'stream-cadence-or-video-colors-insufficient' : null),
                scope: 'composited-screen-video-roi',
                note: 'Absence of a sampled black frame does not prove no transient black frame or first presented video frame.',
                armLatencyMs: entry.armedAtMs === null ? null : entry.armedAtMs - entry.startedAtMs,
                sampleCount: samples.length, uniqueHashes, repeatedFrames, maxIntervalMs, observedClasses,
                samples
            };
        });
        return {
            classification: captures.length !== 2 || captures.some(item => item.classification === 'INCONCLUSIVE')
                ? 'INCONCLUSIVE' : captures.some(item => item.classification === 'OBSERVED_BLACK_INTERVAL')
                    ? 'OBSERVED_BLACK_INTERVAL' : 'OBSERVED_VIDEO_TRANSITION',
            reason: captures.length === 2 ? null : 'missing-track-action',
            captureMode: 'continuous-screen-track-processor',
            preparation: preparation.ready ? {ready: true} : preparation,
            captures
        };
    }

    async function stop() {
        let rendererStopped = !preparation.ready;
        let handlerRestored = !handlerInstalled;
        if (globalMonitor) clearInterval(globalMonitor);
        globalMonitor = null;
        observations.forEach(entry => { if (entry.monitor) clearInterval(entry.monitor); });
        if (window && !window.isDestroyed()) {
            try {
                const stopped = await withDeadline(window.webContents.executeJavaScript(
                    'window.__eteTransitionScreenStream && window.__eteTransitionScreenStream.stop()'),
                1500, 'stream-stop-deadline');
                rendererStopped = stopped === true || (!preparation.ready && !stopped);
            } catch (_) { }
        }
        if (handlerInstalled && session) {
            try { session.setDisplayMediaRequestHandler(null); handlerRestored = true; } catch (_) { }
        }
        handlerInstalled = false;
        return {rendererStopped, handlerRestored};
    }

    return {prepare, start, waitForResults, stop};
}

module.exports = {createTransitionStreamCapture, classifyMeanColor, rendererStreamCapture};
