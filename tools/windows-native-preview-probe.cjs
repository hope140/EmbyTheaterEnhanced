'use strict';

// Standalone synthetic-window probe. Does not load ETE, contact a server,
// assemble Koffi, capture the desktop, or modify a product profile/shortcut.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const PLAN = Object.freeze({version: 1, syntheticOnly: true, electron: '44.4.2', koffi: '3.3.3',
    durationMs: 30000, maximumSamples: 30, messages: [0x323, 0x326],
    proves: ['BGRX conversion bytes', 'DWM submission return values', 'owned GDI resource counts'],
    doesNotProve: ['Native Helper/D3D media identity', 'product taskbar or two-button behavior', 'Windows visible acceptance']});
function validateRuntime(platform, arch, versions) {
    if (platform !== 'win32' || arch !== 'x64' || versions.electron !== PLAN.electron) throw Error('Pinned Windows Electron runtime required');
}
async function run(ffiRoot, output, sourceCommit) {
    validateRuntime(process.platform, process.arch, process.versions);
    if (!ffiRoot || !output || !/^[a-f0-9]{40}$/.test(sourceCommit || '')) throw Error('Probe arguments invalid');
    // Require pre-existing fixed dependencies; never run npm or a product build.
    const ffiDirectory = path.resolve(ffiRoot), outputDirectory = path.resolve(output);
    const metadata = JSON.parse(fs.readFileSync(path.join(ffiDirectory, 'node_modules/koffi/package.json'), 'utf8'));
    if (metadata.version !== PLAN.koffi) throw Error('Pinned Koffi input required');
    const koffi = require(path.join(ffiDirectory, 'node_modules/koffi'));
    fs.mkdirSync(outputDirectory); // exclusive: no reuse/overwrite of an earlier run
    const logFile = path.join(outputDirectory, 'probe.jsonl');
    const log = value => fs.appendFileSync(logFile, JSON.stringify(value) + '\n');
    const {app, BrowserWindow, nativeImage} = require('electron');
    for (const name of ['appData', 'userData', 'sessionData']) {
        const location = path.join(outputDirectory, name); fs.mkdirSync(location); app.setPath(name, location);
    }
    const modulePath = path.join(__dirname, '../native/windows-media/dwm.cjs');
    log({event: 'begin', ...PLAN, sourceCommit,
        scriptSha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
        dwmSha256: crypto.createHash('sha256').update(fs.readFileSync(modulePath)).digest('hex')});
    await app.whenReady();
    const dwm = require(modulePath).createDwm(koffi);
    const load = require('../native/windows-media/system-libraries.cjs').systemLibraries(koffi);
    const processHandle = koffi.load('kernel32.dll').func('void *GetCurrentProcess()')();
    const guiResources = load('user32.dll').func('uint32_t GetGuiResources(void *process, uint32_t flags)');
    const options = {width: 640, height: 360, webPreferences: {sandbox: true, contextIsolation: true, nodeIntegration: false}};
    const main = new BrowserWindow({...options, frame: false, transparent: true, backgroundColor: '#00000000'});
    const video = new BrowserWindow({...options, frame: false, transparent: false, backgroundColor: '#c02030', skipTaskbar: true, focusable: false});
    let image = null, pending = null, closing = false, samples = 0, errors = 0, timer, deadline;
    const colors = ['#c02030', '#20a040', '#2040c0'];
    const thumbnail = require(modulePath).attachThumbnail(main, dwm, () => image,
        () => {errors++; log({event: 'failure', stage: 'dwm'});});
    const gdiBefore = guiResources(processHandle, 0);
    async function capture() {
        if (closing || pending || samples >= PLAN.maximumSamples || main.isDestroyed() || video.isDestroyed() || main.isMinimized()) return;
        const work = (async () => {
            try {
                const color = colors[Math.floor(samples / 5) % colors.length];
                await video.webContents.executeJavaScript('document.body.style.backgroundColor=' + JSON.stringify(color));
                if (closing || video.isDestroyed() || main.isDestroyed() || main.isMinimized()) return;
                const hwnd = video.getNativeWindowHandle().readBigUInt64LE(), size = dwm.clientSize(hwnd);
                const frame = await dwm.capture(hwnd, size.width, size.height, {pixelFormat: 'opaque-video-bgrx'});
                if (closing || video.isDestroyed() || main.isDestroyed() || main.isMinimized()) return;
                let opaque = true;
                for (let offset = 3; offset < frame.pixels.length; offset += 4) if (frame.pixels[offset] !== 255) {opaque = false; break;}
                if (frame.accepted && opaque) {
                    image = nativeImage.createFromBitmap(frame.pixels, size).resize({width: 640}); thumbnail.refresh();
                }
                log({event: 'capture', sample: ++samples, accepted: frame.accepted, opaque, expectedSyntheticColor: color,
                    firstPixelBgr: [...frame.pixels.subarray(0, 3)],
                    bitmapSha256: crypto.createHash('sha256').update(frame.pixels).digest('hex'),
                    gdi: guiResources(processHandle, 0), submitted: thumbnail.submitted});
            } catch (_) {errors++; log({event: 'failure', stage: 'capture'});}
        })();
        pending = work;
        try {await work;} finally {if (pending === work) pending = null;}
    }
    let cleanup;
    function stop() {
        if (cleanup) return cleanup;
        closing = true; clearInterval(timer); clearTimeout(deadline);
        cleanup = (async () => {
            // PrintWindow cannot be physically canceled safely; drain before
            // destroying its HWND/DC. No timeout is labeled a successful release.
            log({event: 'drain', pending: !!pending});
            if (pending) await pending;
            thumbnail.dispose(); image = null;
            log({event: 'end', samples, submitted: thumbnail.submitted, errors,
                gdiBefore, gdiAfter: guiResources(processHandle, 0), visualAcceptance: 'NOT_ASSESSED'});
            for (const window of [main, video]) if (!window.isDestroyed()) window.destroy();
            app.quit();
        })();
        return cleanup;
    }
    for (const window of [main, video]) window.on('close', event => {if (!closing) {event.preventDefault(); stop().catch(() => {});}});
    main.on('minimize', () => {if (!video.isDestroyed()) video.hide();});
    main.on('restore', () => {if (!video.isDestroyed()) video.showInactive();});
    app.on('before-quit', event => {if (!closing) {event.preventDefault(); stop().catch(() => {});}});
    await Promise.all([main.loadURL('data:text/html,<body style="color:white;font:18px sans-serif;background:transparent">Synthetic DWM probe. Hover taskbar thumbnail / Peek, minimize and restore. Closes in 30 seconds. No ETE media or account data.</body>'),
        video.loadURL('data:text/html,<body style="margin:0;background:%23c02030"></body>')]);
    video.setBounds(main.getBounds()); main.focus();
    timer = setInterval(() => {capture().catch(() => {});}, 1000);
    deadline = setTimeout(() => {stop().catch(() => {});}, PLAN.durationMs);
    await capture();
}
module.exports = {PLAN, validateRuntime};
if (require.main === module) {
    if (process.argv[2] === '--describe') process.stdout.write(JSON.stringify(PLAN, null, 2) + '\n');
    else run(...process.argv.slice(2)).catch(() => {process.stderr.write('Synthetic preview probe failed; no product acceptance inferred.\n'); process.exitCode = 1; if (process.versions.electron) require('electron').app.quit();});
}
