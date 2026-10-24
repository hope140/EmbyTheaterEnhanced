'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {createDwm, attachThumbnail} = require('../native/windows-media/dwm.cjs');

// Execute the real DIB/capture/submission code with explicit native memory and
// return values. This verifies pixel bytes and ownership, not Windows rendering.
function ffiFixture(options = {}) {
    const calls = [], bitmaps = [], dc = {}, prior = {}, hwnd = 4n;
    let selected;
    const functions = {
        GetSystemDirectoryW(buffer) { const value = 'C:\\Windows\\System32'; buffer.write(value, 'utf16le'); return value.length; },
        DwmSetWindowAttribute() { return 0; }, DwmInvalidateIconicBitmaps() { return 0; },
        CreateDIBSection(_dc, info, _usage, bits) {
            const width = info.readInt32LE(4), height = -info.readInt32LE(8);
            assert.equal(info.readUInt16LE(14), 32); assert.equal(info.readUInt32LE(16), 0);
            const dib = {pixels: Buffer.alloc(width * height * 4, 197)};
            bitmaps.push(dib); bits[0] = options.missingBits ? null : dib.pixels; return dib;
        },
        CreateCompatibleDC() { if (options.dcThrows) throw Error('fixture-dc'); return options.noDc ? null : dc; }, DeleteDC(value) { assert.equal(value, dc); calls.push('delete-dc'); },
        SelectObject(_dc, bitmap) { if (bitmap === prior) { calls.push('restore'); if (options.restoreThrows) throw Error('fixture-restore'); return selected; } selected = bitmap; return options.noSelection ? null : prior; },
        DeleteObject(bitmap) { assert.ok(bitmaps.includes(bitmap)); calls.push('delete-bitmap'); },
        RtlMoveMemory(destination, source, size) { source.copy(destination, 0, 0, size); },
        GetClientRect(_hwnd, rect) { rect.writeInt32LE(2, 8); rect.writeInt32LE(1, 12); return 1; },
        GetWindowThreadProcessId(_hwnd, pid) { pid[0] = options.foreign ? process.pid + 1 : process.pid; return 1; },
        DwmSetIconicThumbnail(target, bitmap, flags) {
            assert.equal(target, hwnd); assert.equal(flags, 0); calls.push(['thumbnail', Buffer.from(bitmap.pixels)]); return options.submitFailure ? -1 : 0;
        },
        DwmSetIconicLivePreviewBitmap(target, bitmap, offset, flags) {
            assert.equal(target, hwnd); assert.equal(offset, null); assert.equal(flags, 0);
            calls.push(['live-preview', Buffer.from(bitmap.pixels)]); return 0;
        },
        PrintWindow: {async(target, targetDc, flags, callback) {
            assert.equal(target, hwnd); assert.equal(targetDc, dc); assert.equal(flags, 2);
            if (!options.noPaint) selected.pixels.set([19, 67, 213, 0, 251, 127, 31, 13]);
            callback(options.failure ? Error('fixture') : null, options.rejected ? 0 : 1);
        }}
    };
    const koffi = {load: () => ({func(signature) {
        const name = signature.match(/(\w+)\(/)[1];
        assert.ok(functions[name], 'Unexpected FFI call: ' + name); return functions[name];
    }})};
    return {dwm: createDwm(koffi), calls, hwnd};
}

test('real capture path converts nonzero BGRX bytes to opaque BGRA without losing color', async () => {
    const f = ffiFixture(), frame = await f.dwm.capture(f.hwnd, 2, 1, {pixelFormat: 'opaque-video-bgrx'});
    assert.equal(frame.accepted, true);
    assert.deepEqual([...frame.pixels], [19, 67, 213, 255, 251, 127, 31, 255]);
    assert.deepEqual(f.calls, ['restore', 'delete-dc', 'delete-bitmap']);
});

test('successful PrintWindow without painting cannot leak uninitialized DIB memory', async () => {
    const f = ffiFixture({noPaint: true}), frame = await f.dwm.capture(f.hwnd, 2, 1, {pixelFormat: 'opaque-video-bgrx'});
    assert.deepEqual([...frame.pixels], [0, 0, 0, 255, 0, 0, 0, 255]);
});

test('rejected and failed native captures release every owned GDI resource', async () => {
    const rejected = ffiFixture({rejected: true});
    assert.equal((await rejected.dwm.capture(rejected.hwnd, 2, 1, {pixelFormat: 'opaque-video-bgrx'})).accepted, false);
    const failed = ffiFixture({failure: true});
    await assert.rejects(failed.dwm.capture(failed.hwnd, 2, 1, {pixelFormat: 'opaque-video-bgrx'}), /fixture/);
    for (const f of [rejected, failed]) assert.deepEqual(f.calls, ['restore', 'delete-dc', 'delete-bitmap']);
});

test('capture source ownership and bitmap dimensions remain bounded', () => {
    const f = ffiFixture({foreign: true}); assert.throws(() => f.dwm.clientSize(f.hwnd), /owned window/);
    return assert.rejects(f.dwm.capture(f.hwnd, 4097, 1, {pixelFormat: 'opaque-video-bgrx'}), /dimensions/);
});

test('thumbnail and Peek submission copy the real image bytes and free the DIB on failure', () => {
    const f = ffiFixture(), pixels = Buffer.from([19, 67, 213, 255, 251, 127, 31, 255]);
    const image = {getSize: () => ({width: 2, height: 1}), toBitmap: () => pixels};
    f.dwm.thumbnail(f.hwnd, image); f.dwm.livePreview(f.hwnd, image);
    assert.deepEqual(f.calls, [['thumbnail', pixels], 'delete-bitmap', ['live-preview', pixels], 'delete-bitmap']);
    const bad = ffiFixture({submitFailure: true}); assert.throws(() => bad.dwm.thumbnail(bad.hwnd, image), /submission failed/);
    assert.equal(bad.calls.at(-1), 'delete-bitmap');
});

function thumbnailFixture(options = {}) {
    const hooks = new Map(), calls = [], hwnd = Buffer.alloc(8); hwnd.writeBigUInt64LE(4n);
    let image = null, destroyed = false, resizes = 0;
    function makeImage(width, height) {
        return {isEmpty: () => false, getSize: () => ({width, height}), resize: size => {resizes++; if (options.onResize) options.onResize(); return makeImage(size.width, size.height); }};
    }
    const window = {getNativeWindowHandle: () => hwnd, isDestroyed: () => destroyed,
        hookWindowMessage: (id, callback) => { if (options.hookFails && id === 0x326) throw Error('fixture-hook'); hooks.set(id, callback); }, unhookWindowMessage: id => hooks.delete(id)};
    const dwm = {configure: (_hwnd, enabled) => calls.push(['configure', enabled]), invalidate: () => calls.push('invalidate'),
        clientSize: () => options.clientSize || ({width: 1200, height: 800}),
        thumbnail: (_hwnd, bitmap) => calls.push(['thumbnail', bitmap.getSize()]),
        livePreview: (_hwnd, bitmap) => calls.push(['peek', bitmap.getSize()])};
    const controller = attachThumbnail(window, dwm, () => image, () => calls.push('error'), () => calls.push('request'),{cacheEnabled:options.cacheEnabled});
    return {controller, hooks, calls, get resizes(){return resizes;}, destroy() {destroyed=true;}, setImage: () => { image = makeImage(640, 360); },
        thumbnail(width = 160, height = 100) { const size = Buffer.alloc(8); size.writeBigUInt64LE(BigInt(width << 16 | height)); hooks.get(0x323)(null, size); }};
}

test('missing first image still records DWM demand and requests a capture', () => {
    const f = thumbnailFixture(); f.controller.refresh(); f.thumbnail();
    assert.equal(f.controller.requestedRecently(), true); assert.equal(f.calls.at(-1), 'request'); assert.equal(f.controller.submitted, 0);
    f.setImage(); f.thumbnail();
    assert.deepEqual(f.calls.at(-2), ['thumbnail', {width: 160, height: 90}]); assert.equal(f.controller.submitted, 1);
    f.controller.dispose();
});

test('Peek uses its own message and client bounds, and clear/dispose retire both handlers', () => {
    const f = thumbnailFixture(); f.setImage(); f.controller.refresh(); f.hooks.get(0x326)();
    assert.deepEqual(f.calls.at(-2), ['peek', {width: 1200, height: 675}]);
    assert.equal(f.controller.submitted, 1);
    f.controller.clear(); const count = f.calls.length; f.thumbnail(); f.hooks.get(0x326)();
    assert.equal(f.calls.length, count);
    const old = f.hooks.get(0x326); f.controller.dispose(); assert.equal(f.hooks.size, 0); old();
    assert.equal(f.calls.length, count);
});


test('opaque conversion requires explicit BGRX input; premultiplied UI pixels are preserved on submission', async () => {
    const f = ffiFixture(); await assert.rejects(f.dwm.capture(f.hwnd, 2, 1), /Opaque video format required/);
    assert.deepEqual(f.calls, []);
    const pixels = Buffer.from([10, 20, 30, 128, 0, 0, 0, 0]);
    f.dwm.thumbnail(f.hwnd, {getSize: () => ({width: 2, height: 1}), toBitmap: () => pixels});
    assert.deepEqual(f.calls[0], ['thumbnail', pixels]);
});

test('partial GDI acquisition and restore failures still release all acquired resources', async () => {
    for (const options of [{missingBits: true}, {noDc: true}, {dcThrows: true}, {noSelection: true}, {restoreThrows: true}]) {
        const f = ffiFixture(options);
        await assert.rejects(f.dwm.capture(f.hwnd, 2, 1, {pixelFormat: 'opaque-video-bgrx'}));
        assert.equal(f.calls.filter(call => call === 'delete-bitmap').length, 1);
        assert.equal(f.calls.filter(call => call === 'delete-dc').length, options.noSelection || options.restoreThrows ? 1 : 0);
    }
});

test('window destruction or a reentrant clear prevents a bitmap from being submitted', () => {
    let f = thumbnailFixture({onResize: () => f.destroy()}); f.setImage(); f.controller.refresh(); f.thumbnail();
    assert.equal(f.controller.submitted, 0); f.controller.dispose();
    let g = thumbnailFixture({onResize: () => g.controller.clear()}); g.setImage(); g.controller.refresh(); g.thumbnail();
    assert.equal(g.controller.submitted, 0); g.controller.dispose();
});

test('failed second hook registration unwinds the first hook', () => {
    const hooks = new Map(), handle = Buffer.alloc(8);
    assert.throws(() => attachThumbnail({getNativeWindowHandle: () => handle, isDestroyed: () => false,
        hookWindowMessage(id, callback) { if (id === 0x326) throw Error('fixture-hook'); hooks.set(id, callback); },
        unhookWindowMessage: id => hooks.delete(id)}, {}, () => null), /fixture-hook/);
    assert.equal(hooks.size, 0);
});

test('repeated DWM requests reuse exact-size NativeImages while still answering every request',()=>{
    const f=thumbnailFixture();f.setImage();f.controller.refresh();
    for(let i=0;i<50;i++){f.thumbnail();f.hooks.get(0x326)();}
    assert.equal(f.resizes,2);assert.equal(f.controller.submitted,100);
    assert.deepEqual(f.controller.performance().cache,{hits:98,misses:2,bytes:160*90*4+1200*675*4,entries:2,limitBytes:8*1024*1024});
    f.setImage();f.thumbnail();assert.equal(f.resizes,3);assert.equal(f.controller.performance().cache.entries,1);
    f.controller.clear();assert.equal(f.controller.performance().cache.bytes,0);
    f.controller.refresh();f.thumbnail();assert.equal(f.resizes,4);f.controller.dispose();assert.equal(f.controller.performance().cache.bytes,0);
});

test('resize cache is bounded by both two entries and 8MiB; oversized Peek outputs are not retained',()=>{
    const dimensions={width:1920,height:1080},f=thumbnailFixture({clientSize:dimensions});f.setImage();f.controller.refresh();
    for(let i=0;i<30;i++)f.thumbnail(100+i,100+i);
    assert.ok(f.controller.performance().cache.entries<=2);assert.ok(f.controller.performance().cache.bytes<=8*1024*1024);
    f.hooks.get(0x326)();assert.ok(f.controller.performance().cache.bytes<=8*1024*1024);
    dimensions.width=4096;dimensions.height=2160;const before=f.resizes;
    f.hooks.get(0x326)();f.hooks.get(0x326)();assert.equal(f.resizes,before+2);
    assert.ok(f.controller.performance().cache.bytes<=8*1024*1024);f.controller.dispose();
});

test('reentrant retirement cannot retain a resized image in the cache',()=>{
    let f;f=thumbnailFixture({onResize(){f.controller.clear();}});f.setImage();f.controller.refresh();f.thumbnail();
    assert.equal(f.controller.submitted,0);assert.equal(f.controller.performance().cache.bytes,0);assert.equal(f.controller.performance().cache.entries,0);f.controller.dispose();
});

test('explicit diagnostic baseline disables resize caching without suppressing DWM replies',()=>{
    const f=thumbnailFixture({cacheEnabled:false});f.setImage();f.controller.refresh();
    for(let i=0;i<10;i++)f.thumbnail();assert.equal(f.resizes,10);assert.equal(f.controller.submitted,10);
    assert.equal(f.controller.performance().cache.bytes,0);f.controller.dispose();
});
