'use strict';

// Experimental desktop SMTC adapter. The caller supplies the pinned FFI addon;
// it owns no player, network connection or media source.
function guid(text) {
    const parts = text.split('-');
    const bytes = Buffer.alloc(16);
    bytes.writeUInt32LE(parseInt(parts[0], 16), 0);
    bytes.writeUInt16LE(parseInt(parts[1], 16), 4);
    bytes.writeUInt16LE(parseInt(parts[2], 16), 6);
    Buffer.from(parts[3] + parts[4], 'hex').copy(bytes, 8);
    return bytes;
}

const bindingCache = new WeakMap();
function createBindings(koffi) {
    if (bindingCache.has(koffi)) return bindingCache.get(koffi);
    const combase = require('./system-libraries.cjs').systemLibraries(koffi)('combase.dll');
    const stringCreate = combase.func('int32_t WindowsCreateString(str16 value, uint32_t length, _Out_ void **result)');
    const stringDelete = combase.func('int32_t WindowsDeleteString(void *value)');
    const activationFactory = combase.func('int32_t RoGetActivationFactory(void *name, void *iid, _Out_ void **result)');
    const activateInstance = combase.func('int32_t RoActivateInstance(void *name, _Out_ void **result)');
    const initialize = combase.func('int32_t RoInitialize(uint32_t mode)');
    const uninitialize = combase.func('void RoUninitialize()');
    const types = new Map();
    function invoke(pointer, index, result, args, values) {
        const key = result + ':' + args.join(',');
        let type = types.get(key);
        if (!type) { type = koffi.proto('WmMethod' + types.size, result, ['void *', ...args]); types.set(key, type); }
        const table = koffi.decode(pointer, 'void *');
        const fn = koffi.decode(table, index * 8, 'void *');
        return koffi.call(fn, type, pointer, ...values);
    }
    function check(code, stage) {
        if (code < 0) { const error = new Error(stage + ':0x' + (code >>> 0).toString(16)); error.code = code >>> 0; throw error; }
        return code;
    }
    function release(pointer) { if (pointer) invoke(pointer, 2, 'uint32_t', [], []); }
    function query(pointer, iid) {
        const out = [null]; check(invoke(pointer, 0, 'int32_t', ['void *', '_Out_ void **'], [guid(iid), out]), 'QueryInterface'); return out[0];
    }
    function hstring(text, operation) {
        const out = [null]; check(stringCreate(text, text.length, out), 'WindowsCreateString');
        try { return operation(out[0]); } finally { stringDelete(out[0]); }
    }
    function getFactory(name, iid) {
        return hstring(name, value => { const out = [null]; check(activationFactory(value, guid(iid), out), 'RoGetActivationFactory'); return out[0]; });
    }
    function activate(name, iid) {
        return hstring(name, value => {
            const out = [null]; check(activateInstance(value, out), 'RoActivateInstance');
            try { return query(out[0], iid); } finally { release(out[0]); }
        });
    }
    async function storageFile(filePath) {
        const factory = getFactory('Windows.Storage.StorageFile', '5984c710-daf2-43c8-8bb4-a4d3eacfd03f');
        let operation, info, completed = false;
        try {
            const out = [null];
            hstring(filePath, value => check(invoke(factory, 6, 'int32_t', ['void *', '_Out_ void **'], [value, out]), 'StorageFile.FromPath'));
            operation = out[0]; info = query(operation, '00000036-0000-0000-c000-000000000046');
            const deadline = Date.now() + 2000, status = [0];
            while (Date.now() < deadline) {
                check(invoke(info, 7, 'int32_t', ['_Out_ int32_t *'], [status]), 'StorageFile.AsyncStatus');
                if (status[0] === 1) { completed = true; check(invoke(operation, 8, 'int32_t', ['_Out_ void **'], [out]), 'StorageFile.Result'); return out[0]; }
                if (status[0] !== 0) throw new Error('StorageFile operation did not complete');
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            throw new Error('StorageFile operation timeout');
        } finally {
            if (info) { try { invoke(info, completed ? 10 : 9, 'int32_t', [], []); } catch (_) { } }
            for (const pointer of [info, operation, factory]) release(pointer);
        }
    }
    const queryCallback = koffi.proto('WmQueryCallback', 'int32_t', ['void *', 'void *', 'void *']);
    const refCallback = koffi.proto('WmRefCallback', 'uint32_t', ['void *']);
    const invokeCallback = koffi.proto('WmButtonCallback', 'int32_t', ['void *', 'void *', 'void *']);
    function buttonHandler(onButton) {
        const supported = ['00000000-0000-0000-c000-000000000046', '94ea2b94-e9cc-49e0-c0ff-ee64ca8f5b90',
            '0557e996-7b23-5bae-aa81-ea0d671143a4'].map(guid);
        let references = 1, inCallback = 0, retired = false;
        const table = koffi.alloc('void *', 4), object = koffi.alloc('void *', 1);
        const callbacks = [
            koffi.register((_self, iid, result) => {
                try {
                    const value = Buffer.from(koffi.decode(iid, 'uint8_t', 16));
                    if (!supported.some(id => id.equals(value))) { koffi.encode(result, 'void *', null); return -2147467262; }
                    references++; koffi.encode(result, 'void *', object); return 0;
                } catch (_) { return -2147467259; }
            }, koffi.pointer(queryCallback)),
            koffi.register(() => ++references, koffi.pointer(refCallback)),
            koffi.register(() => { references--; return Math.max(0, references); }, koffi.pointer(refCallback)),
            koffi.register((_self, _sender, args) => {
                inCallback++;
                try {
                    if (!retired) { const value = [0]; check(invoke(args, 6, 'int32_t', ['_Out_ int32_t *'], [value]), 'SMTC.Button'); onButton(value[0]); }
                    return 0;
                } catch (_) { return -2147467259; }
                finally { inCallback--; }
            }, koffi.pointer(invokeCallback))
        ];
        koffi.encode(table, koffi.array('void *', 4), callbacks);
        koffi.encode(object, 'void *', table);
        return {object, retire() { retired = true; },
            async dispose() {
                retired = true;
                const deadline = Date.now() + 2000;
                while ((references !== 1 || inCallback) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
                if (references !== 1 || inCallback) throw new Error('SMTC delegate still owned');
                references = 0;
                for (const callback of callbacks) koffi.unregister(callback);
                koffi.free(object); koffi.free(table);
            }};
    }
    const bindings = {koffi, invoke, check, release, query, hstring, getFactory, initialize, uninitialize, buttonHandler, activate, storageFile};
    bindingCache.set(koffi, bindings);
    return bindings;
}

async function createSmtc(bindings, hwnd, options = {}) {
    const {invoke, check, release, hstring, getFactory, initialize, uninitialize} = bindings;
    const initialized = initialize(1);
    if (initialized < 0 && (initialized >>> 0) !== 0x80010106) check(initialized, 'RoInitialize');
    let factory, controls, updater, video, controls2, timeline, disposed = false, listener, buttonToken, lastTitle = null, displayType = 2;
    let enabledCommands = new Set();
    try {
        factory = getFactory('Windows.Media.SystemMediaTransportControls', 'ddb0472d-c911-4a1f-86d9-dc3d71a95f5a');
        const out = [null];
        check(invoke(factory, 6, 'int32_t', ['void *', 'void *', '_Out_ void **'],
            [hwnd, guid('99fa3ff4-1742-42a6-902e-087d41f965ec'), out]), 'SMTC.GetForWindow');
        controls = out[0];
        check(invoke(controls, 8, 'int32_t', ['_Out_ void **'], [out]), 'SMTC.DisplayUpdater');
        updater = out[0];
        check(invoke(updater, 16, 'int32_t', [], []), 'SMTC.ClearPreviousMetadata');
        check(invoke(updater, 7, 'int32_t', ['int32_t'], [2]), 'SMTC.MediaType');
        check(invoke(updater, 13, 'int32_t', ['_Out_ void **'], [out]), 'SMTC.VideoProperties');
        video = out[0];
        controls2 = bindings.query(controls, 'ea98d2f6-7f3c-4af2-a586-72889808efb1');
        timeline = bindings.activate('Windows.Media.SystemMediaTransportControlsTimelineProperties', '5125316a-c3a2-475b-8507-93534dc88f15');
        for (const index of [13, 15, 17, 19, 21, 23, 25, 27, 29, 31]) check(invoke(controls, index, 'int32_t', ['uint8_t'], [0]), 'SMTC.DisableButton');
        check(invoke(controls, 11, 'int32_t', ['uint8_t'], [1]), 'SMTC.Enabled');
        if (typeof options.onCommand === 'function') {
            listener = bindings.buttonHandler(button => {
                const command = {0: 'play', 1: 'pause', 2: 'stop', 6: 'next', 7: 'previous'}[button];
                if (command && !disposed && enabledCommands.has(command)) options.onCommand(command);
            });
            const token = [0n];
            check(invoke(controls, 32, 'int32_t', ['void *', '_Out_ int64_t *'], [listener.object, token]), 'SMTC.AddButtonPressed');
            buttonToken = token[0];
        }
    } catch (error) {
        if (listener) listener.retire();
        for (const pointer of [timeline, controls2, video, updater, controls, factory]) release(pointer);
        if (listener) await listener.dispose();
        if (initialized >= 0) uninitialize();
        throw error;
    }
    return {
        controls,
        clearArtwork() {
            if (disposed) return;
            check(invoke(updater, 11, 'int32_t', ['void *'], [null]), 'SMTC.ClearThumbnail');
            check(invoke(updater, 17, 'int32_t', [], []), 'SMTC.Update');
        },
        async setArtwork(filePath, isCurrent) {
            if (disposed) return;
            let file, factory, reference;
            try {
                file = await bindings.storageFile(filePath);
                if (disposed || !isCurrent()) return;
                factory = getFactory('Windows.Storage.Streams.RandomAccessStreamReference', '857309dc-3fbf-4e7d-986f-ef3b1a07a964');
                const out = [null]; check(invoke(factory, 6, 'int32_t', ['void *', '_Out_ void **'], [file, out]), 'SMTC.ThumbnailReference'); reference = out[0];
                check(invoke(updater, 11, 'int32_t', ['void *'], [reference]), 'SMTC.Thumbnail');
                check(invoke(updater, 17, 'int32_t', [], []), 'SMTC.Update');
            } finally { for (const pointer of [reference, factory, file]) release(pointer); }
        },
        update(state) {
            if (disposed) return;
            enabledCommands = new Set();
            for (const [index, name, enabled] of [[13,'play',state.active && state.paused], [15,'stop',state.active],
                [17,'pause',state.active && !state.paused], [25,'previous',state.active && state.canPrevious], [27,'next',state.active && state.canNext]]) {
                check(invoke(controls, index, 'int32_t', ['uint8_t'], [enabled ? 1 : 0]), 'SMTC.ButtonState');
                if (enabled) enabledCommands.add(name);
            }
            const title = String(state.title || '').slice(0, 512), type = state.mediaType === 'Audio' ? 1 : 2;
            if (type !== displayType) {
                check(invoke(updater, 7, 'int32_t', ['int32_t'], [type]), 'SMTC.MediaType');
                const out = [null]; check(invoke(updater, type === 1 ? 12 : 13, 'int32_t', ['_Out_ void **'], [out]), 'SMTC.DisplayProperties');
                release(video); video = out[0]; displayType = type; lastTitle = null;
            }
            if (title !== lastTitle) {
                hstring(title, value => check(invoke(video, 7, 'int32_t', ['void *'], [value]), 'SMTC.Title'));
                check(invoke(updater, 17, 'int32_t', [], []), 'SMTC.Update'); lastTitle = title;
            }
            const duration = Number.isFinite(state.duration) && state.duration > 0 ? Math.min(state.duration, 31622400) : 0;
            const position = Number.isFinite(state.position) ? Math.max(0, Math.min(duration, state.position)) : 0;
            for (const [index, seconds] of [[7, 0], [9, duration], [11, 0], [13, duration], [15, position]]) {
                check(invoke(timeline, index, 'int32_t', ['int64_t'], [BigInt(Math.floor(seconds * 10000000))]), 'SMTC.Timeline');
            }
            check(invoke(controls2, 12, 'int32_t', ['void *'], [timeline]), 'SMTC.UpdateTimeline');
            check(invoke(controls2, 11, 'int32_t', ['double'], [Number.isFinite(state.rate) && state.rate > 0 ? state.rate : 1]), 'SMTC.PlaybackRate');
            check(invoke(controls, 7, 'int32_t', ['int32_t'], [state.active ? state.paused ? 4 : 3 : 2]), 'SMTC.PlaybackStatus');
        },
        async dispose() {
            if (disposed) return;
            disposed = true;
            enabledCommands.clear();
            const failures = [];
            if (listener) {
                listener.retire();
                try { check(invoke(controls, 33, 'int32_t', ['int64_t'], [buttonToken]), 'SMTC.RemoveButtonPressed'); }
                catch (error) { failures.push(error); }
            }
            try { invoke(controls, 11, 'int32_t', ['uint8_t'], [0]); } catch (_) { }
            for (const pointer of [timeline, controls2, video, updater, controls, factory]) {
                try { release(pointer); } catch (error) { failures.push(error); }
            }
            if (listener) { try { await listener.dispose(); } catch (error) { failures.push(error); } }
            if (initialized >= 0) uninitialize();
            if (failures.length) throw new Error('SMTC cleanup failed');
        }
    };
}

module.exports = {guid, createBindings, createSmtc};
