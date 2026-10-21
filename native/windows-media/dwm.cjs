'use strict';
const {performance} = require('node:perf_hooks');

function createDwm(koffi) {
    const load = require('./system-libraries.cjs').systemLibraries(koffi);
    const dwm = load('dwmapi.dll'), gdi = load('gdi32.dll'), user = load('user32.dll'), memory = load('ntdll.dll');
    const setAttribute = dwm.func('int32_t DwmSetWindowAttribute(void *window, uint32_t attribute, void *value, uint32_t size)');
    const setThumbnail = dwm.func('int32_t DwmSetIconicThumbnail(void *window, void *bitmap, uint32_t flags)');
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
    function thumbnail(hwnd, image) {
        const {width, height} = image.getSize(), buffer = image.toBitmap(), dib = bitmap(width, height);
        try {
            if (buffer.length !== dib.length) throw Error('Bitmap byte count mismatch');
            copy(dib.bits, buffer, buffer.length);
            const code = setThumbnail(hwnd, dib.handle, 0);
            if (code < 0) throw Error('DwmSetIconicThumbnail:0x' + (code >>> 0).toString(16));
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
            const accepted = await new Promise((resolve, reject) => printWindow.async(hwnd, dc, 2, (error, value) => error ? reject(error) : resolve(!!value)));
            const pixels = Buffer.alloc(dib.length); copy(pixels, dib.bits, dib.length);
            return {accepted, pixels};
        } finally { if (previous) selectObject(dc, previous); deleteDc(dc); deleteObject(dib.handle); }
    }
    return {configure, thumbnail, invalidate, capture, clientSize};
}

function attachThumbnail(window, dwm, getImage, onError = function () {}, onRequest = function () {}) {
    const hwnd = window.getNativeWindowHandle().readBigUInt64LE();
    let enabled = false, disposed = false, submitted = 0, lastRequest = -Infinity;
    function message(_wparam, lparam) {
        if (disposed || !enabled) return;
        try {
        const packed = Number(lparam.readBigUInt64LE() & 0xffffffffn);
        const width = Math.min(1024, packed >>> 16), height = Math.min(1024, packed & 65535), image = getImage();
        if (!image || image.isEmpty() || width < 1 || height < 1) return;
        const size = image.getSize(), scale = Math.min(width / size.width, height / size.height);
        const resized = image.resize({width: Math.max(1, Math.floor(size.width * scale)), height: Math.max(1, Math.floor(size.height * scale))});
        dwm.thumbnail(hwnd, resized); submitted++;
        lastRequest = performance.now(); onRequest();
        } catch (_) { onError(); }
    }
    window.hookWindowMessage(0x323, message);
    return {refresh() { if (disposed || window.isDestroyed()) return; if (!enabled) { dwm.configure(hwnd, true); enabled = true; } dwm.invalidate(hwnd); },
        clear() { if (!disposed && enabled && !window.isDestroyed()) { try { dwm.configure(hwnd, false); enabled = false; dwm.invalidate(hwnd); } catch (_) { onError(); } } },
        get submitted() { return submitted; },
        requestedRecently() { return performance.now() - lastRequest < 2500; },
        dispose() { if (disposed) return; disposed = true; if (!window.isDestroyed()) { window.unhookWindowMessage(0x323); if (enabled) { try { dwm.configure(hwnd, false); } catch (_) { onError(); } } } }};
}

module.exports = {createDwm, attachThumbnail};
