'use strict';

const boundary = require('./renderer-boundary');
const {randomUUID} = require('crypto');
const previewSnapshot = require('../native-helper/preview-snapshot');
const {performance} = require('perf_hooks');
const {createRecorder} = require('./bounded-diagnostics');
const {NATIVE_CHANNEL, NATIVE_SESSION_CHANNEL} = require('./windows-media-renderer');
const KEYS = ['version', 'nativeOwner', 'playbackEpoch', 'active', 'paused', 'title', 'mediaKey', 'mediaType', 'duration', 'position', 'rate', 'sequence', 'sessionToken'];

function valid(value) {
    return !!value && Object.keys(value).length === KEYS.length && KEYS.every(key => Object.hasOwn(value, key)) &&
        value.version === 3 && (value.nativeOwner === null || previewSnapshot.validOwner(value.nativeOwner)) && Number.isSafeInteger(value.playbackEpoch) && value.playbackEpoch > 0 && typeof value.active === 'boolean' && typeof value.paused === 'boolean' &&
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
    const {window, ipcMain, nativeImage, sendCommand, createBindings, createSmtc, createDwm, attachThumbnail, koffi} = options;
    const bindings = createBindings(koffi), dwm = createDwm(koffi);
    const emit = createRecorder(options.log || function () {}, 'windows-media', 10);
    let disposed = false, latest = null, session = null, queue = Promise.resolve(), sequence = 0, sessionToken = randomUUID(), sessionRequests = 0;
    let fallbackImage = null, frameImage = null, frameOwner = null, frameWork = null, timer = null;
    let captured = 0, frameAttempts = 0, frameRevision = 0, lastFrameStarted = -Infinity;
    const clock = options.clock || {now: () => performance.now(), setInterval, clearInterval};
    let errors = 0;
    let documentEpoch = 0, sessionDocumentEpoch = -1;
    const thumbnail = attachThumbnail(window, dwm, previewImage, () => logFailure('thumbnail'), () => { requestFrame().catch(() => {}); });
    function current(owner) {
        try { return !disposed && latest && latest.active && latest.mediaType === 'Video' &&
            previewSnapshot.sameOwner(owner, latest.nativeOwner) && typeof options.isPreviewOwner === 'function' && options.isPreviewOwner(owner); }
        catch (_) { return false; }
    }
    function hasFrame() { return !!frameImage && current(frameOwner); }
    function previewImage() {
        if (disposed || !latest || !latest.active || latest.mediaType !== 'Video') return null;
        if (hasFrame()) return frameImage;
        frameImage = null; frameOwner = null;
        // Neutral content has no media identity and can safely survive minimize
        // or same-item replay. It is never counted as a capture or artwork.
        if (!fallbackImage) {
            const pixels = Buffer.alloc(640 * 360 * 4);
            for (let offset = 3; offset < pixels.length; offset += 4) pixels[offset] = 255;
            fallbackImage = nativeImage.createFromBitmap(pixels, {width: 640, height: 360});
        }
        return fallbackImage;
    }
    function clearArtwork() {
        if (session && session.clearArtwork) { try { session.clearArtwork(); } catch (_) { logFailure('state'); } }
    }
    function clearPreview() {
        if (frameImage) emit('preview-frame-retired', {stage:'owner-snapshot'});
        frameRevision++; frameImage = null; frameOwner = null; frameAttempts = 0; lastFrameStarted = -Infinity;
        if (timer) clock.clearInterval(timer); timer = null;
        thumbnail.clear(); clearArtwork();
    }
    function visible() { return !window.isDestroyed() && !window.isMinimized() && (typeof window.isVisible !== 'function' || window.isVisible()); }
    async function requestFrame() {
        if (frameWork || !latest || !current(latest.nativeOwner) || typeof options.capturePreview !== 'function' ||
            !visible() || !frameImage && frameAttempts >= 10 || clock.now() - lastFrameStarted < 950) return;
        if (hasFrame() && typeof thumbnail.requestedRecently === 'function' && !thumbnail.requestedRecently()) return;
        const owner = {...latest.nativeOwner}, revision = frameRevision, record = {};
        frameWork = record; lastFrameStarted = clock.now(); if (!hasFrame()) frameAttempts++;
        record.promise = (async () => {
            try {
                const frame = await options.capturePreview(owner);
                if (revision !== frameRevision || !current(owner) || !visible() || !frame ||
                    !previewSnapshot.sameOwner(frame.owner, owner) || !Number.isInteger(frame.width) || !Number.isInteger(frame.height) ||
                    frame.width < 1 || frame.width > 160 || frame.height < 1 || frame.height > 90 ||
                    !Buffer.isBuffer(frame.pixels) || frame.pixels.length !== frame.width * frame.height * 4) return;
                const firstFrame = !frameImage || !previewSnapshot.sameOwner(frameOwner, owner);
                frameImage = nativeImage.createFromBitmap(frame.pixels, {width:frame.width, height:frame.height});
                frameOwner = owner; captured++;
                if (firstFrame) emit('preview-frame-ready', {width:frame.width, height:frame.height});
                thumbnail.refresh();
            } catch (_) { if (revision === frameRevision && !disposed) logFailure('capture'); }
            finally { if (frameWork === record) frameWork = null; }
        })();
        await record.promise;
    }
    function restore() { if (!disposed) {frameAttempts = 0; frameRevision++;} }
    function ensureFrameTimer() {
        if (timer || typeof options.capturePreview !== 'function' || !latest || !current(latest.nativeOwner)) return;
        timer = clock.setInterval(() => {requestFrame().catch(() => {});}, 1000);
        requestFrame().catch(() => {});
    }
    function logFailure(stage) { errors++; emit('integration-unavailable', {stage}); }
    function command(value, ownerDocument) {
        if (!disposed && documentEpoch === ownerDocument && latest && latest.active && ['play', 'pause', 'stop'].includes(value)) sendCommand(value);
    }
    function enqueue(snapshot) {
        latest = snapshot;
        queue = queue.catch(() => {}).then(async () => {
            if (disposed || latest !== snapshot) return;
            if (!snapshot.active) {
                if (session) { const old = session; session = null; await old.dispose(); }
                return;
            }
            const ownerDocument = documentEpoch;
            if (session && sessionDocumentEpoch !== ownerDocument) { const old = session; session = null; await old.dispose(); }
            if (disposed || latest !== snapshot) return;
            if (!session) {
                session = await createSmtc(bindings, window.getNativeWindowHandle().readBigUInt64LE(), {onCommand: value => command(value, ownerDocument)});
                sessionDocumentEpoch = ownerDocument;
                clearArtwork();
            }
            if (disposed || latest !== snapshot) return;
            session.update(snapshot);
        }).catch(() => { if (!disposed) logFailure('state'); });
    }
    function receive(event, snapshot) {
        if (disposed || !boundary.isTrusted(event, window.webContents) || !valid(snapshot) || snapshot.sessionToken !== sessionToken || snapshot.sequence <= sequence || latest && snapshot.playbackEpoch < latest.playbackEpoch) return;
        sequence = snapshot.sequence;
        const changed = !latest || latest.mediaKey !== snapshot.mediaKey || latest.active !== snapshot.active || latest.mediaType !== snapshot.mediaType || latest.playbackEpoch !== snapshot.playbackEpoch || JSON.stringify(latest.nativeOwner) !== JSON.stringify(snapshot.nativeOwner);
        if (changed) clearPreview();
        enqueue({...snapshot});
        if (changed && snapshot.active && snapshot.mediaType === 'Video') {
            try { thumbnail.refresh(); } catch (_) { logFailure('thumbnail'); }
        }
        ensureFrameTimer();
    }
    function reset() {
        documentEpoch++; sequence = 0; sessionToken = randomUUID(); clearPreview();
        enqueue({active: false});
    }
    function navigation(_event, _url, isInPlace, isMainFrame) { if (isMainFrame && !isInPlace) reset(); }
    let cleanup = null;
    function dispose() {
        if (cleanup) return cleanup;
        disposed = true; clearPreview();
        ipcMain.removeListener(NATIVE_CHANNEL, receive);
        ipcMain.removeHandler(NATIVE_SESSION_CHANNEL);
        window.webContents.removeListener('did-start-navigation', navigation);
        window.webContents.removeListener('render-process-gone', reset);
        window.removeListener('closed', close);
        window.removeListener('restore', restore);
        thumbnail.dispose();
        cleanup = (async () => {
            await queue.catch(() => {});
            if (frameWork) await frameWork.promise;
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
    return {dispose, previewImage,
        status() { return {active: !disposed && !!(latest && latest.active), ready: !disposed && !!session,
        previewMode: !disposed && latest && latest.active && latest.mediaType === 'Video' ? (hasFrame() ? 'owner-frame' : 'neutral-unverified') : 'inactive',
        captureBlockedReason: hasFrame() ? null : 'native-frame-ownership-unproven',
        previewReady: hasFrame(), firstFrameAttempts: frameAttempts, firstFrameExhausted: !hasFrame() && frameAttempts >= 10, blankFirstFrames: 0,
        captured, submitted: thumbnail.submitted, averageCaptureMs: 0, errors, sessionRequests, sequence,
        artworkReady: false}; }};
}

module.exports = {valid, attach};
