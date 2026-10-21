'use strict';

const boundary = require('./renderer-boundary');
const {randomUUID} = require('crypto');
const fs = require('fs'), path = require('path');
const {performance} = require('perf_hooks');
const {createRecorder} = require('./bounded-diagnostics');
const {NATIVE_CHANNEL, NATIVE_SESSION_CHANNEL} = require('./windows-media-renderer');
const KEYS = ['version', 'active', 'paused', 'title', 'mediaKey', 'mediaType', 'duration', 'position', 'rate', 'sequence', 'sessionToken'];

function valid(value) {
    return !!value && Object.keys(value).length === KEYS.length && KEYS.every(key => Object.hasOwn(value, key)) &&
        value.version === 1 && typeof value.active === 'boolean' && typeof value.paused === 'boolean' &&
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
    let image = null, imageEpoch = 0, timer = null, capturing = null, errors = 0, captured = 0, totalCaptureMs = 0;
    let artworkKey = null, appliedKey = null;
    let documentEpoch = 0, sessionDocumentEpoch = -1;
    let lastCaptureStarted = -Infinity;
    const thumbnail = attachThumbnail(window, dwm, () => imageEpoch === epoch ? image : null, () => logFailure('thumbnail'), () => { captureFrame().catch(() => {}); });
    function clearImage() { image = null; imageEpoch = 0; thumbnail.clear(); }
    function logFailure(stage) { errors++; emit('integration-unavailable', {stage}); }
    async function captureFrame() {
        if (disposed || capturing || !latest || !latest.active || latest.mediaType !== 'Video') return;
        if (performance.now() - lastCaptureStarted < 950) return;
        if (image && imageEpoch === epoch && artworkKey && typeof thumbnail.requestedRecently === 'function' && !thumbnail.requestedRecently()) return;
        const video = getVideoWindow();
        if (!video || video.isDestroyed()) return;
        // Hidden/minimized native surfaces can return an all-black PrintWindow
        // image. Preserve the last owned frame rather than replacing it.
        if (typeof video.isVisible === 'function' && !video.isVisible() || typeof window.isMinimized === 'function' && window.isMinimized()) return;
        const ownedEpoch = epoch, ownedWindow = video;
        let work;
        try {
            const hwnd = video.getNativeWindowHandle().readBigUInt64LE(), {width, height} = dwm.clientSize(hwnd);
            const started = Date.now();
            lastCaptureStarted = performance.now();
            work = dwm.capture(hwnd, width, height); capturing = work;
            const frame = await work;
            if (disposed || ownedEpoch !== epoch || ownedWindow !== getVideoWindow() || video.isDestroyed() || !frame.accepted ||
                typeof video.isVisible === 'function' && !video.isVisible() || typeof window.isMinimized === 'function' && window.isMinimized()) return;
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
            if (appliedKey && appliedKey !== snapshot.mediaKey && session.clearArtwork) { session.clearArtwork(); artworkKey = null; }
            session.update(snapshot);
            appliedKey = snapshot.mediaKey;
            await captureFrame();
            if (!disposed && latest === snapshot && artworkKey !== snapshot.mediaKey && imageEpoch === epoch && image && options.artworkDirectory && session.setArtwork) {
                const ownedEpoch = epoch, key = snapshot.mediaKey;
                await fs.promises.mkdir(options.artworkDirectory, {recursive: true});
                const file = path.join(options.artworkDirectory, key + '.png');
                try { await fs.promises.writeFile(file, image.toPNG(), {flag: 'wx'}); } catch (error) { if (error.code !== 'EEXIST') throw error; }
                const stat = await fs.promises.lstat(file);
                if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2097152) throw Error('Artwork cache file invalid');
                await session.setArtwork(file, () => !disposed && epoch === ownedEpoch && latest && latest.mediaKey === key);
                if (!disposed && epoch === ownedEpoch) artworkKey = key;
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
        if (disposed || !boundary.isTrusted(event, window.webContents) || !valid(snapshot) || snapshot.sessionToken !== sessionToken || snapshot.sequence <= sequence) return;
        sequence = snapshot.sequence;
        if (!latest || latest.mediaKey !== snapshot.mediaKey || latest.active !== snapshot.active) { epoch++; clearImage(); }
        enqueue({...snapshot});
    }
    function reset() {
        epoch++; documentEpoch++; sequence = 0; sessionToken = randomUUID(); clearImage();
        enqueue({active: false});
    }
    function navigation(_event, _url, isInPlace, isMainFrame) { if (isMainFrame && !isInPlace) reset(); }
    let cleanup = null;
    function dispose() {
        if (cleanup) return cleanup;
        disposed = true; epoch++; clearInterval(timer); timer = null; clearImage();
        ipcMain.removeListener(NATIVE_CHANNEL, receive);
        ipcMain.removeHandler(NATIVE_SESSION_CHANNEL);
        window.webContents.removeListener('did-start-navigation', navigation);
        window.webContents.removeListener('render-process-gone', reset);
        window.removeListener('closed', close);
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
    timer = setInterval(() => { captureFrame().catch(() => {}); }, 1000);
    return {dispose, previewImage() { return !disposed && latest && latest.active && imageEpoch === epoch ? image : null; },
        status() { return {active: !!(latest && latest.active), ready: !!session,
        captured, submitted: thumbnail.submitted, averageCaptureMs: captured ? totalCaptureMs / captured : 0, errors, sessionRequests, sequence,
        artworkReady: !!artworkKey && artworkKey === latest?.mediaKey}; }};
}

module.exports = {valid, attach};
