'use strict';
const {performance} = require('node:perf_hooks');

function createDwm(koffi) {
    const load = require('./system-libraries.cjs').systemLibraries(koffi);
    const dwm = load('dwmapi.dll'), gdi = load('gdi32.dll'), user = load('user32.dll'), memory = load('ntdll.dll');
    const setAttribute = dwm.func('int32_t DwmSetWindowAttribute(void *window, uint32_t attribute, void *value, uint32_t size)');
    const setThumbnail = dwm.func('int32_t DwmSetIconicThumbnail(void *window, void *bitmap, uint32_t flags)');
    const setLivePreview = dwm.func('int32_t DwmSetIconicLivePreviewBitmap(void *window, void *bitmap, void *offset, uint32_t flags)');
    const invalidate = dwm.func('int32_t DwmInvalidateIconicBitmaps(void *window)');
    const createBitmap = gdi.func('void *CreateDIBSection(void *dc, void *info, uint32_t usage, _Out_ void **bits, void *section, uint32_t offset)');
    const deleteObject = gdi.func('int DeleteObject(void *object)');
    const createDc = gdi.func('void *CreateCompatibleDC(void *dc)');
    const deleteDc = gdi.func('int DeleteDC(void *dc)');
    const selectObject = gdi.func('void *SelectObject(void *dc, void *object)');
    const printWindow = user.func('int PrintWindow(void *window, void *dc, uint32_t flags)');
    const getClientRect = user.func('int GetClientRect(void *window, void *rect)');
    const getWindowThreadProcessId = user.func('uint32_t GetWindowThreadProcessId(void *window, _Out_ uint32_t *pid)');
    const copy = memory.func('void RtlMoveMemory(void *destination, void *source, size_t size)');
    function bitmap(width, height) {
        if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 4096 || height > 2160) throw Error('Bitmap dimensions invalid');
        const info = Buffer.alloc(44); info.writeUInt32LE(40); info.writeInt32LE(width, 4); info.writeInt32LE(-height, 8);
        info.writeUInt16LE(1, 12); info.writeUInt16LE(32, 14);
        const bits = [null], handle = createBitmap(null, info, 0, bits, null, 0);
        if (!handle || !bits[0]) throw Error('CreateDIBSection failed');
        return {handle, bits: bits[0], length: width * height * 4};
    }
    function configure(hwnd, enabled) {
        const value = Buffer.alloc(4); value.writeInt32LE(enabled ? 1 : 0);
        for (const attribute of [7, 10]) { const code = setAttribute(hwnd, attribute, value, 4); if (code < 0) throw Error('DwmSetWindowAttribute:0x' + (code >>> 0).toString(16)); }
    }
    function submitBitmap(hwnd, image, submit) {
        const {width, height} = image.getSize(), buffer = image.toBitmap(), dib = bitmap(width, height);
        try {
            if (buffer.length !== dib.length) throw Error('Bitmap byte count mismatch');
            copy(dib.bits, buffer, buffer.length);
            const code = submit(hwnd, dib.handle);
            if (code < 0) throw Error('DWM bitmap submission failed');
        } finally { deleteObject(dib.handle); }
    }
    function clientSize(hwnd) {
        const rect = Buffer.alloc(16), pid = [0];
        if (!getClientRect(hwnd, rect) || !getWindowThreadProcessId(hwnd, pid) || pid[0] !== process.pid) throw Error('Capture source is not an owned window');
        return {width: rect.readInt32LE(8), height: rect.readInt32LE(12)};
    }
    async function capture(hwnd, width, height) {
        const dib = bitmap(width, height), dc = createDc(null);
        if (!dc) { deleteObject(dib.handle); throw Error('CreateCompatibleDC failed'); }
        let previous;
        try {
            previous = selectObject(dc, dib.handle);
            // PrintWindow may succeed without painting every pixel. Never expose
            // uninitialized DIB memory to Electron, DWM or the artwork cache.
            copy(dib.bits, Buffer.alloc(dib.length), dib.length);
            const accepted = await new Promise((resolve, reject) => printWindow.async(hwnd, dc, 2, (error, value) => error ? reject(error) : resolve(!!value)));
            const pixels = Buffer.alloc(dib.length); copy(pixels, dib.bits, dib.length);
            // BI_RGB's fourth byte is reserved, not premultiplied alpha. Native
            // video is opaque; preserve BGR and define alpha before NativeImage.
            for (let offset = 3; offset < pixels.length; offset += 4) pixels[offset] = 255;
            return {accepted, pixels};
        } finally { if (previous) selectObject(dc, previous); deleteDc(dc); deleteObject(dib.handle); }
    }
    return {configure, invalidate, capture, clientSize,
        thumbnail(hwnd, image) { submitBitmap(hwnd, image, (target, handle) => setThumbnail(target, handle, 0)); },
        livePreview(hwnd, image) { submitBitmap(hwnd, image, (target, handle) => setLivePreview(target, handle, null, 0)); }};
}

function attachThumbnail(window, dwm, getImage, onError = function () {}, onRequest = function () {}) {
    const hwnd = window.getNativeWindowHandle().readBigUInt64LE();
    let enabled = false, disposed = false, submitted = 0, lastRequest = -Infinity;
    function request(size, submit) {
        if (disposed || !enabled) return;
        // Record demand even before a usable frame exists. Refresh/capture can
        // then satisfy the next DWM request instead of losing first-frame demand.
        lastRequest = performance.now();
        try {
            const {width, height} = size(), image = getImage();
            if (!image || image.isEmpty() || width < 1 || height < 1) return;
            const source = image.getSize(), scale = Math.min(width / source.width, height / source.height);
            const resized = image.resize({width: Math.max(1, Math.floor(source.width * scale)), height: Math.max(1, Math.floor(source.height * scale))});
            submit(hwnd, resized); submitted++;
        } catch (_) { onError(); }
        finally { onRequest(); }
    }
    function thumbnailMessage(_wparam, lparam) {
        request(() => {
            const packed = Number(lparam.readBigUInt64LE() & 0xffffffffn);
            return {width: Math.min(1024, packed >>> 16), height: Math.min(1024, packed & 65535)};
        }, dwm.thumbnail);
    }
    function livePreviewMessage() {
        request(() => {
            const size = dwm.clientSize(hwnd);
            return {width: Math.min(4096, size.width), height: Math.min(2160, size.height)};
        }, dwm.livePreview);
    }
    window.hookWindowMessage(0x323, thumbnailMessage);
    window.hookWindowMessage(0x326, livePreviewMessage);
    return {refresh() { if (disposed || window.isDestroyed()) return; if (!enabled) { dwm.configure(hwnd, true); enabled = true; } dwm.invalidate(hwnd); },
        clear() { if (!disposed && enabled && !window.isDestroyed()) { try { dwm.configure(hwnd, false); enabled = false; dwm.invalidate(hwnd); } catch (_) { onError(); } } },
        get submitted() { return submitted; },
        requestedRecently() { return performance.now() - lastRequest < 2500; },
        dispose() { if (disposed) return; disposed = true; if (!window.isDestroyed()) { window.unhookWindowMessage(0x323); window.unhookWindowMessage(0x326); if (enabled) { try { dwm.configure(hwnd, false); } catch (_) { onError(); } } } }};
}

module.exports = {createDwm, attachThumbnail};
