'use strict';

const boundary = require('./renderer-boundary');
const {randomUUID} = require('crypto');
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
    const {window, ipcMain, nativeImage, sendCommand, createBindings, createSmtc, createDwm, attachThumbnail, koffi} = options;
    const bindings = createBindings(koffi), dwm = createDwm(koffi);
    const emit = createRecorder(options.log || function () {}, 'windows-media', 10);
    let disposed = false, latest = null, session = null, queue = Promise.resolve(), sequence = 0, sessionToken = randomUUID(), sessionRequests = 0;
    let fallbackImage = null;
    let errors = 0;
    let documentEpoch = 0, sessionDocumentEpoch = -1;
    // PrintWindow success, nonzero color and renderer playbackEpoch do not bind
    // pixels to the helper's presented media generation. Fail closed: this
    // adapter has no raw capture path, polling timer or experimental bypass.
    const thumbnail = attachThumbnail(window, dwm, previewImage, () => logFailure('thumbnail'));
    function previewImage() {
        if (disposed || !latest || !latest.active || latest.mediaType !== 'Video') return null;
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
    function clearPreview() { thumbnail.clear(); clearArtwork(); }
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
        const changed = !latest || latest.mediaKey !== snapshot.mediaKey || latest.active !== snapshot.active || latest.mediaType !== snapshot.mediaType || latest.playbackEpoch !== snapshot.playbackEpoch;
        if (changed) clearPreview();
        enqueue({...snapshot});
        if (changed && snapshot.active && snapshot.mediaType === 'Video') {
            try { thumbnail.refresh(); } catch (_) { logFailure('thumbnail'); }
        }
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
        thumbnail.dispose();
        cleanup = (async () => {
            await queue.catch(() => {});
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
    return {dispose, previewImage,
        status() { return {active: !disposed && !!(latest && latest.active), ready: !disposed && !!session,
        previewMode: !disposed && latest && latest.active && latest.mediaType === 'Video' ? 'neutral-unverified' : 'inactive',
        captureBlockedReason: 'native-frame-ownership-unproven',
        previewReady: false, firstFrameAttempts: 0, firstFrameExhausted: false, blankFirstFrames: 0,
        captured: 0, submitted: thumbnail.submitted, averageCaptureMs: 0, errors, sessionRequests, sequence,
        artworkReady: false}; }};
}

module.exports = {valid, attach};
