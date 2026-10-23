'use strict';

const boundary = require('./renderer-boundary');
const {randomUUID, createHash} = require('crypto');
const fs = require('fs'), path = require('path');
const {performance} = require('perf_hooks');
const {createRecorder} = require('./bounded-diagnostics');
const {NATIVE_CHANNEL, NATIVE_SESSION_CHANNEL} = require('./windows-media-renderer');
const KEYS = ['version', 'playbackEpoch', 'active', 'paused', 'title', 'mediaKey', 'mediaType', 'duration', 'position', 'rate', 'sequence', 'sessionToken'];

function valid(value) {
    return !!value && Object.keys(value).length === KEYS.length && KEYS.every(key => Object.hasOwn(value, key)) &&
        value.version === 2 && Number.isSafeInteger(value.playbackEpoch) && value.playbackEpoch > 0 && typeof value.active === 'boolean' && typeof value.paused === 'boolean' &&
        typeof value.title === 'string' && value.title.length <= 512 && !/[\x00-\x1f\x7f]/.test(value.title) &&
        typeof value.mediaKey === 'string' && (value.active ? /^[a-f0-9]{64}$/.test(value.mediaKey) : value.mediaKey === '') &&
        (value.active ? ['Video', 'Audio'].includes(value.mediaType) : value.mediaType === '') &&
        Number.isFinite(value.duration) && value.duration >= 0 && value.duration <= 31622400 &&
        Number.isFinite(value.position) && value.position >= 0 && value.position <= value.duration &&
        Number.isFinite(value.rate) && value.rate > 0 && value.rate <= 64 &&
        Number.isSafeInteger(value.sequence) && value.sequence > 0 && (value.active || !value.paused) &&
        typeof value.sessionToken === 'string' && /^[a-f0-9-]{36}$/.test(value.sessionToken);
}

function attach(options) {
    const {window, ipcMain, nativeImage, getVideoWindow, sendCommand, createBindings, createSmtc, createDwm, attachThumbnail, koffi} = options;
    const bindings = createBindings(koffi), dwm = createDwm(koffi);
    const emit = createRecorder(options.log || function () {}, 'windows-media', 10);
    let disposed = false, latest = null, session = null, queue = Promise.resolve(), sequence = 0, epoch = 0, sessionToken = randomUUID(), sessionRequests = 0;
    const clock = options.clock || {now: () => performance.now(), setInterval, clearInterval};
    let fallbackImage = null, blankFirstFrames = 0, firstFrameAttempts = 0, firstFrameDeadline = null, captureAttemptEpoch = 0;
    const firstFrameLimit = 10, firstFrameBudgetMs = 15000;
    let image = null, imageEpoch = 0, timer = null, capturing = null, errors = 0, captured = 0, totalCaptureMs = 0;
    let artworkKey = null, appliedKey = null;
    let documentEpoch = 0, sessionDocumentEpoch = -1;
    let lastCaptureStarted = -Infinity;
    const thumbnail = attachThumbnail(window, dwm, previewImage, () => logFailure('thumbnail'), () => { captureFrame().catch(() => {}); });
    function previewImage() {
        if (disposed || !latest || !latest.active || latest.mediaType !== 'Video') return null;
        if (imageEpoch === epoch && image) return image;
        // A new media item may start while minimized, when PrintWindow is unsafe.
        // An opaque neutral image avoids both old-media leakage and transparent
        // shell fallback. It is never counted as a capture or used as artwork.
        if (!fallbackImage) {
            const pixels = Buffer.alloc(640 * 360 * 4);
            for (let offset = 3; offset < pixels.length; offset += 4) pixels[offset] = 255;
            fallbackImage = nativeImage.createFromBitmap(pixels, {width: 640, height: 360});
        }
        return fallbackImage;
    }
    function clearImage() {
        image = null; imageEpoch = 0; firstFrameAttempts = 0; firstFrameDeadline = null; captureAttemptEpoch++; thumbnail.clear();
        artworkKey = null; appliedKey = null;
        if (session && session.clearArtwork) { try { session.clearArtwork(); } catch (_) { logFailure('state'); } }
    }
    function firstFrameExhausted() {
        return !image && (firstFrameAttempts >= firstFrameLimit || firstFrameDeadline !== null && clock.now() >= firstFrameDeadline);
    }
    function restore() {
        if (disposed || !firstFrameExhausted()) return;
        firstFrameAttempts = 0; firstFrameDeadline = null; captureAttemptEpoch++;
    }
    function logFailure(stage) { errors++; emit('integration-unavailable', {stage}); }
    async function captureFrame() {
        if (disposed || capturing || firstFrameExhausted() || !latest || !latest.active || latest.mediaType !== 'Video') return;
        if (clock.now() - lastCaptureStarted < 950) return;
        if (image && imageEpoch === epoch && typeof thumbnail.requestedRecently === 'function' && !thumbnail.requestedRecently()) return;
        const video = getVideoWindow();
        if (!video || video === window || video.webContents === window.webContents || video.isDestroyed()) return;
        // Hidden/minimized native surfaces can return an all-black PrintWindow
        // image. Preserve the last owned frame rather than replacing it.
        if (typeof video.isVisible === 'function' && !video.isVisible() || typeof window.isMinimized === 'function' && window.isMinimized()) return;
        const ownedEpoch = epoch, ownedWindow = video, ownedAttemptEpoch = captureAttemptEpoch;
        let work;
        try {
            const hwnd = video.getNativeWindowHandle().readBigUInt64LE(), {width, height} = dwm.clientSize(hwnd);
            const started = Date.now();
            lastCaptureStarted = clock.now();
            if (!image) {
                if (firstFrameDeadline === null) firstFrameDeadline = clock.now() + firstFrameBudgetMs;
                firstFrameAttempts++;
            }
            const ownedDeadline = !image ? firstFrameDeadline : null;
            work = dwm.capture(hwnd, width, height, {pixelFormat: 'opaque-video-bgrx'}); capturing = work;
            const frame = await work;
            if (disposed || ownedAttemptEpoch !== captureAttemptEpoch || (ownedDeadline !== null && clock.now() >= ownedDeadline) || ownedEpoch !== epoch || ownedWindow !== getVideoWindow() || video.isDestroyed() || !frame.accepted ||
                typeof video.isVisible === 'function' && !video.isVisible() || typeof window.isMinimized === 'function' && window.isMinimized()) return;
            if (!Buffer.isBuffer(frame.pixels) || frame.pixels.length !== width * height * 4) throw Error('Invalid captured bitmap');
            // A successful PrintWindow with only zero BGR bytes cannot establish
            // a first video frame. Retry on the timer; legitimate black scenes
            // still display black via the fallback, and later black frames are kept.
            if (!image) {
                let hasColor = false;
                for (let offset = 0; offset < frame.pixels.length; offset += 4) {
                    if (frame.pixels[offset] || frame.pixels[offset + 1] || frame.pixels[offset + 2]) { hasColor = true; break; }
                }
                if (!hasColor) { blankFirstFrames++; return; }
            }
            image = nativeImage.createFromBitmap(frame.pixels, {width, height}).resize({width: 640});
            imageEpoch = ownedEpoch; captured++; totalCaptureMs += Date.now() - started;
            thumbnail.refresh();
        } catch (_) { if (!disposed && ownedEpoch === epoch) logFailure('capture'); }
        finally { if (capturing === work) capturing = null; }
    }
    function command(value, ownerDocument) {
        if (!disposed && documentEpoch === ownerDocument && latest && latest.active && ['play', 'pause', 'stop'].includes(value)) sendCommand(value);
    }
    function enqueue(snapshot) {
        latest = snapshot;
        queue = queue.catch(() => {}).then(async () => {
            if (disposed || latest !== snapshot) return;
            if (!snapshot.active) {
                if (session) { const old = session; session = null; await old.dispose(); }
                artworkKey = null; appliedKey = null;
                return;
            }
            const ownerDocument = documentEpoch;
            if (session && sessionDocumentEpoch !== ownerDocument) { const old = session; session = null; await old.dispose(); }
            if (disposed || latest !== snapshot) return;
            if (!session) {
                session = await createSmtc(bindings, window.getNativeWindowHandle().readBigUInt64LE(), {onCommand: value => command(value, ownerDocument)});
                sessionDocumentEpoch = ownerDocument;
            }
            if (disposed || latest !== snapshot) return;
            if (appliedKey && appliedKey !== epoch && session.clearArtwork) { session.clearArtwork(); artworkKey = null; }
            session.update(snapshot);
            appliedKey = epoch;
            await captureFrame();
            if (!disposed && latest === snapshot && artworkKey !== epoch && imageEpoch === epoch && image && options.artworkDirectory && session.setArtwork) {
                const ownedEpoch = epoch, ownedImage = image, key = createHash('sha256').update(sessionToken + ':' + epoch).digest('hex');
                await fs.promises.mkdir(options.artworkDirectory, {recursive: true});
                if (disposed || epoch !== ownedEpoch) return;
                const file = path.join(options.artworkDirectory, key + '.png');
                try { await fs.promises.writeFile(file, ownedImage.toPNG(), {flag: 'wx'}); } catch (error) { if (error.code !== 'EEXIST') throw error; }
                const stat = await fs.promises.lstat(file);
                if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2097152) throw Error('Artwork cache file invalid');
                await session.setArtwork(file, () => !disposed && epoch === ownedEpoch && latest && latest.playbackEpoch === snapshot.playbackEpoch);
                if (!disposed && epoch === ownedEpoch) artworkKey = ownedEpoch;
                const entries = await fs.promises.readdir(options.artworkDirectory, {withFileTypes: true});
                const files = [];
                for (const entry of entries) if (entry.isFile() && /^[a-f0-9]{64}\.png$/.test(entry.name) && entry.name !== key + '.png') {
                    const old = path.join(options.artworkDirectory, entry.name), value = await fs.promises.stat(old);
                    files.push({file: old, modified: value.mtimeMs});
                }
                files.sort((a, b) => b.modified - a.modified);
                for (const old of files.slice(15)) { try { await fs.promises.unlink(old.file); } catch (_) { } }
            }
        }).catch(() => { if (!disposed) logFailure('state'); });
    }
    function receive(event, snapshot) {
        if (disposed || !boundary.isTrusted(event, window.webContents) || !valid(snapshot) || snapshot.sessionToken !== sessionToken || snapshot.sequence <= sequence || latest && snapshot.playbackEpoch < latest.playbackEpoch) return;
        sequence = snapshot.sequence;
        const changed = !latest || latest.mediaKey !== snapshot.mediaKey || latest.active !== snapshot.active || latest.mediaType !== snapshot.mediaType || latest.playbackEpoch !== snapshot.playbackEpoch;
        if (changed) { epoch++; lastCaptureStarted = -Infinity; clearImage(); }
        enqueue({...snapshot});
        if (changed && snapshot.active && snapshot.mediaType === 'Video') {
            try { thumbnail.refresh(); } catch (_) { logFailure('thumbnail'); }
        }
    }
    function reset() {
        epoch++; documentEpoch++; sequence = 0; sessionToken = randomUUID(); clearImage();
        enqueue({active: false});
    }
    function navigation(_event, _url, isInPlace, isMainFrame) { if (isMainFrame && !isInPlace) reset(); }
    let cleanup = null;
    function dispose() {
        if (cleanup) return cleanup;
        disposed = true; epoch++; clock.clearInterval(timer); timer = null; clearImage();
        ipcMain.removeListener(NATIVE_CHANNEL, receive);
        ipcMain.removeHandler(NATIVE_SESSION_CHANNEL);
        window.webContents.removeListener('did-start-navigation', navigation);
        window.webContents.removeListener('render-process-gone', reset);
        window.removeListener('closed', close);
        window.removeListener('restore', restore);
        thumbnail.dispose();
        cleanup = (async () => {
            await queue.catch(() => {});
            if (capturing) await capturing.catch(() => {});
            if (session) { const old = session; session = null; await old.dispose(); }
        })();
        return cleanup;
    }
    function close() { dispose().catch(() => { logFailure('cleanup'); }); }
    ipcMain.on(NATIVE_CHANNEL, receive);
    ipcMain.handle(NATIVE_SESSION_CHANNEL, function(event) {
        if (disposed || !boundary.isTrusted(event, window.webContents)) return null;
        sessionRequests++; return {token: sessionToken};
    });
    window.webContents.on('did-start-navigation', navigation);
    window.webContents.on('render-process-gone', reset);
    window.once('closed', close);
    window.on('restore', restore);
    timer = clock.setInterval(() => { captureFrame().catch(() => {}); }, 1000);
    return {dispose, previewImage,
        status() { return {active: !!(latest && latest.active), ready: !!session,
        previewReady: !!image && imageEpoch === epoch, firstFrameAttempts, firstFrameExhausted: firstFrameExhausted(), blankFirstFrames, captured, submitted: thumbnail.submitted, averageCaptureMs: captured ? totalCaptureMs / captured : 0, errors, sessionRequests, sequence,
        artworkReady: !!artworkKey && artworkKey === epoch}; }};
}

module.exports = {valid, attach};
