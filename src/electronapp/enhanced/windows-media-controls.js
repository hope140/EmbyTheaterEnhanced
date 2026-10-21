'use strict';

const boundary = require('./renderer-boundary');
const {CHANNEL} = require('./windows-media-renderer');
const {createRecorder} = require('./bounded-diagnostics');

function iconBitmap(name, dark) {
    const size = 32, data = Buffer.alloc(size * size * 4), ink = dark ? 255 : 0;
    for (let y = 7; y < 25; y++) for (let x = 7; x < 25; x++) {
        const filled = name === 'stop' ? x >= 9 && x < 23 && y >= 9 && y < 23 :
            name === 'pause' ? (x >= 9 && x < 14 || x >= 18 && x < 23) :
                x >= 10 && x <= 24 && Math.abs(y - 15.5) <= (24 - x) * 0.6;
        if (filled) { const i = (y * size + x) * 4; data[i] = data[i + 1] = data[i + 2] = ink; data[i + 3] = 255; }
    }
    return data;
}

function attach(options) {
    const {window, ipcMain, nativeImage, nativeTheme, sendCommand, app} = options;
    if (options.platform !== 'win32' || !window || typeof window.setThumbarButtons !== 'function' ||
        !ipcMain || !nativeImage || !nativeTheme || !app) return function () {};
    const emit = createRecorder(options.log || function () {}, 'windows-media', 10);
    const clock = options.clock || {setTimeout, clearTimeout};
    let disposed = false, state = {active: false, paused: false}, registered = false, applied = false;
    let shown = typeof window.isVisible !== 'function' || window.isVisible(), retry = null, retries = 0;
    function cancelRetry() { if (retry !== null) clock.clearTimeout(retry); retry = null; }
    function failed() {
        applied = false;
        emit('toolbar-unavailable', {stage: 'register'});
        if (!disposed && retry === null && retries < 3) {
            retries++;
            retry = clock.setTimeout(function () { retry = null; render(); }, 250);
            if (retry && typeof retry.unref === 'function') retry.unref();
        }
    }
    function render() {
        if (disposed || window.isDestroyed()) return;
        // Do not initialize an entirely hidden toolbar before Windows has a
        // taskbar button. The first submission must contain actual controls.
        if (!shown || !state.active && !registered) return;
        try {
            const dark = typeof nativeTheme.shouldUseDarkColorsForSystemIntegratedUI === 'boolean' ?
                nativeTheme.shouldUseDarkColorsForSystemIntegratedUI : !!nativeTheme.shouldUseDarkColors;
            const image = name => nativeImage.createFromBitmap(iconBitmap(name, dark), {width: 32, height: 32});
            const accepted = window.setThumbarButtons(state.active ? [
                {icon: image(state.paused ? 'play' : 'pause'), tooltip: state.paused ? '播放' : '暂停',
                    click() { if (!disposed && state.active) sendCommand('playpause'); }},
                {icon: image('stop'), tooltip: '停止',
                    click() { if (!disposed && state.active) sendCommand('stop'); }}
            ] : []);
            if (accepted !== true) return failed();
            registered = true; applied = true; retries = 0; cancelRetry();
        } catch (_) { failed(); }
    }
    function reset() { cancelRetry(); retries = 0; state = {active: false, paused: false}; render(); }
    function show() { shown = true; retries = 0; render(); }
    function navigation(_event, _url, isInPlace, isMainFrame) { if (isMainFrame && !isInPlace) reset(); }
    function receive(event, value) {
        if (disposed || !boundary.isTrusted(event, window.webContents) || !value ||
            typeof value.active !== 'boolean' || typeof value.paused !== 'boolean' ||
            Object.keys(value).length !== 2 || !value.active && value.paused) return;
        if (state.active === value.active && state.paused === value.paused) { if (!applied) render(); return; }
        cancelRetry(); retries = 0;
        state = {active: value.active, paused: value.paused};
        render();
    }
    function dispose() {
        if (disposed) return;
        reset();
        disposed = true;
        cancelRetry();
        ipcMain.removeListener(CHANNEL, receive);
        nativeTheme.removeListener('updated', render);
        window.webContents.removeListener('did-start-navigation', navigation);
        window.webContents.removeListener('render-process-gone', reset);
        window.removeListener('closed', dispose);
        window.removeListener('show', show);
        window.removeListener('restore', show);
        app.removeListener('before-quit', dispose);
    }
    ipcMain.on(CHANNEL, receive);
    nativeTheme.on('updated', render);
    window.webContents.on('did-start-navigation', navigation);
    window.webContents.on('render-process-gone', reset);
    window.once('closed', dispose);
    window.on('show', show);
    window.on('restore', show);
    app.once('before-quit', dispose);
    render();
    dispose.status = function () { return {active: state.active, registered, applied, retries}; };
    return dispose;
}

module.exports = {attach, iconBitmap};
