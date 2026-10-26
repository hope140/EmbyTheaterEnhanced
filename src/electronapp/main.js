(function () {

    var electron = require('electron');
    var app = electron.app;  // Module to control application life.
    var BrowserWindow = electron.BrowserWindow;  // Module to create native browser window.
    electron.protocol.registerSchemesAsPrivileged([
        'electronapphost',
        'electronfs',
        'electronserverdiscovery',
        'electronwakeonlan',
        'electronrefreshrate'
    ].map(function (scheme) {
        return { scheme: scheme, privileges: { standard: true, supportFetchAPI: true, corsEnabled: true } };
    }));
    var powerSaveBlocker = electron.powerSaveBlocker
    var nativeImage = electron.nativeImage;
    var productIdentity = require('./product-identity');
    var appHostCommand = require('./apphost-command');
    var externalUrl = require('./enhanced/external-url');
    var productMetadata = require('./package.json');
    productIdentity.setAppName(app, productMetadata);
    var path = require('path');
    var appBootstrap = require('./enhanced/bootstrap');
    var deviceIdentity = require('./device-identity');
    var enhancedDiagnostics = require('./enhanced/diagnostics');
    var maintenanceIpc = require('./enhanced/maintenance-ipc');
    var rendererBoundary = require('./enhanced/renderer-boundary');
    var windowsNativeMedia = null;
    var disposeWindowsNativeMedia = function () { return Promise.resolve(); };
    var bundledVersions = require('./enhanced/bundled-versions');

    // Explicit trial CLI is validated and isolated before bootstrap/identity/log writes.
    var pageCacheTest = require('./enhanced/page-cache/test-session').prepare({
        app: app, argv: process.argv, execPath: process.execPath, platform: process.platform,
        environment: process.env, runtimeRoot: path.resolve(__dirname, '..')
    });

    var appBootstrapState = appBootstrap.bootstrap({
        appDataPath: app.getPath('appData'),
        runtimeRoot: path.resolve(__dirname, '..')
    });
    var persistentDeviceId = deviceIdentity.getOrCreateDeviceId(
        path.join(appBootstrapState.configDirectory, 'device-identity.json')
    );

    var enhancedLog = enhancedDiagnostics.createLogger(appBootstrapState.profileRoot);
    function getBuildCommit() {
        var fs = require('fs');
        var candidates = [
            path.join(__dirname, '..', 'runtime-provenance.json'),
            path.join(__dirname, '..', '..', 'runtime-provenance.json'),
            path.join(__dirname, 'runtime-provenance.json')
        ];
        for (var index = 0; index < candidates.length; index++) {
            try {
                var manifest = JSON.parse(fs.readFileSync(candidates[index], 'utf8'));
                if (manifest && /^[0-9a-f]{40}$/i.test(String(manifest.sourceCommit || ''))) return String(manifest.sourceCommit).toLowerCase();
            } catch (_) { }
        }
        return 'UNKNOWN';
    }
    function getAppVersion() {
        try { return app.getVersion(); } catch (_) { return 'UNKNOWN'; }
    }
    var diagnosticsAppInfo = {
        appVersion: getAppVersion(),
        buildCommit: getBuildCommit(),
        platform: process.platform,
        arch: process.arch,
        electron: process.versions.electron,
        chromium: process.versions.chrome,
        node: process.versions.node,
        deviceIdHash: enhancedDiagnostics.hashIdentifier(persistentDeviceId)
    };
    var mpvConfigEvidence = enhancedDiagnostics.configEvidence({
        appData: process.env.APPDATA,
        knownFolder: app.getPath('appData'),
        executableDir: path.dirname(process.execPath),
        mpvHome: process.env.MPV_HOME
    });
    enhancedLog({category: 'app', event: 'start', details: {
        appVersion: diagnosticsAppInfo.appVersion,
        buildCommit: diagnosticsAppInfo.buildCommit,
        platform: diagnosticsAppInfo.platform,
        arch: diagnosticsAppInfo.arch,
        electron: diagnosticsAppInfo.electron,
        chromium: diagnosticsAppInfo.chromium,
        node: diagnosticsAppInfo.node,
        deviceIdHash: diagnosticsAppInfo.deviceIdHash,
        mpvConfig: mpvConfigEvidence
    }});

    // Keep a global reference of the window object, if you don't, the window will
    // be closed automatically when the JavaScript object is garbage collected.
    var mainWindow = null;
    var hasAppLoaded = false;

    var enableDevTools = false;
    var enableDevToolsOnStartup = false;
    var initialShowEventsComplete = false;
    var previousBounds;
    var playbackPowerOwner = require('./enhanced/playback-power-owner').createOwner(powerSaveBlocker);
    var { ipcMain } = require('electron')
    // Quit when all windows are closed.
    app.on('window-all-closed', function () {
        // On OS X it is common for applications and their menu bar
        // to stay active until the user quits explicitly with Cmd + Q
        if (process.platform != 'darwin' && !appIsShuttingDown) {
            app.quit();
        }
    });

    function getWebContents() {
        var win = mainWindow;
        if (win) {
            return win.webContents;
        }

        return null;
    }

    var cd2Service;
    var strmConfigStore;
    var unregisterCd2Ipc = function () {};
    var unregisterStrmConfigIpc = function () {};
    var unregisterDiagnosticsIpc = function () {};
    var unregisterMaintenanceIpc = function () {};
    var unregisterCacheManagementIpc = function () { return Promise.resolve(); };
    var detailCacheCloseOwner = null;
    var unregisterRefreshRate = function () { return Promise.resolve(); };
    var unregisterNativeHelperIpc = function () { return Promise.resolve(); };
    var unregisterMpvKernelIpc = function () {
        var pendingStore = mpvKernelStore;
        return pendingStore && typeof pendingStore.close === 'function'
            ? Promise.resolve().then(function () { return pendingStore.close(); })
            : Promise.resolve();
    };
    var nativeHelperService;
    var mpvKernelStore = null;
    var appIsShuttingDown = false;
    var readyStartupPromise = Promise.resolve();

    var readCurrentBundledVersions = bundledVersions.createBundledVersionReader(path.resolve(__dirname, '..'), diagnosticsAppInfo.buildCommit);
    async function getCurrentEnhancedAppInfo() {
        var currentBundledVersions = await readCurrentBundledVersions();
        return Object.assign({}, diagnosticsAppInfo, {
            bundledVersions: currentBundledVersions,
            nativeHelper: nativeHelperService && typeof nativeHelperService.status === 'function' ? nativeHelperService.status() : null
        });
    }

    function getPlatformInfo() {
        var version = 'UNKNOWN';
        try {
            if (process.platform === 'win32') {
                version = typeof process.getSystemVersion === 'function' ? process.getSystemVersion() : require('os').release();
            }
        } catch (_) { }
        return {windows: process.platform === 'win32' ? 'Windows ' + version : process.platform};
    }

    function getDisplayInfo() {
        try {
            var screen = electron.screen;
            if (!screen || typeof screen.getPrimaryDisplay !== 'function') return {};
            var display = screen.getPrimaryDisplay();
            var scaleFactor = Number(display && display.scaleFactor);
            if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) return {};
            return {summary: Math.round(scaleFactor * 100) + '%'};
        } catch (_) {
            return {};
        }
    }

    function onWindowMoved() {

        sendJavascript('window.dispatchEvent(new CustomEvent("move", {}));');
    }

    var currentWindowState = 'Normal';
    var restoreWindowState;
    var fullscreenActive = false;
    var fullscreenTransition = false;
    var normalWindowInteraction;

    function setWindowState(state) {

        var previousState = currentWindowState;

        if (state == 'Maximized') {
            state = 'Fullscreen';
        }

        if (state == 'Minimized') {

            restoreWindowState = previousState;
            mainWindow.minimize();
        }
        else if (state == 'Fullscreen') {

            if (previousState == "Minimized") {
                mainWindow.restore();
            }

            // On Windows transparent windows use Electron's bounds-only fullscreen
            // path. Re-entering it overwrites Electron's saved normal bounds.
            if (!fullscreenActive) {
                fullscreenTransition = true;
                try { mainWindow.setFullScreen(true); }
                finally { fullscreenTransition = false; }
            }

        } else {

            // Explicit Normal supersedes the state saved for a later OS restore.
            // A delayed restore event must not re-enter fullscreen after this exit.
            restoreWindowState = null;
            if (previousState == "Minimized") {
                mainWindow.restore();
            }

            if (fullscreenActive) {
                fullscreenTransition = true;
                try { mainWindow.setFullScreen(false); }
                finally { fullscreenTransition = false; }
            }

            else if (previousState == "Maximized") {
                mainWindow.unmaximize();
            }
        }
    }

    function onWindowStateChanged(state) {

        currentWindowState = state;
        sendJavascript('document.windowState="' + state + '";document.dispatchEvent(new CustomEvent("windowstatechanged", {detail:{windowState:"' + state + '"}}));');
    }

    function onMinimize() {
        if (currentWindowState != 'Minimized') restoreWindowState = currentWindowState;
        onWindowStateChanged('Minimized');
    }

    function onRestore() {

        var restoreState = restoreWindowState;
        restoreWindowState = null;
        if (fullscreenActive) {
            // Minimize does not leave Electron's transparent fullscreen path.
            // Calling setFullScreen(true) again would save the display as normal.
            onWindowStateChanged('Fullscreen');
            onWindowGeometryChanged();
        } else if (restoreState && restoreState != 'Normal' && restoreState != 'Minimized') {
            setWindowState(restoreState);
        } else {
            onWindowStateChanged('Normal');
        }
    }

    function onMaximize() {
        onWindowStateChanged('Maximized');
    }

    function onEnterFullscreen() {
        if (!fullscreenActive) {
            previousBounds = mainWindow.getBounds();
            if (process.platform == 'win32') {
                normalWindowInteraction = {resizable: mainWindow.isResizable(), movable: mainWindow.isMovable()};
                mainWindow.setResizable(false);
                mainWindow.setMovable(false);
            }
        }
        fullscreenActive = true;
        onWindowStateChanged('Fullscreen');

        if (initialShowEventsComplete) {
            mainWindow.focus();
        }
    }

    function onLeaveFullscreen() {
        fullscreenActive = false;
        if (normalWindowInteraction) {
            mainWindow.setResizable(normalWindowInteraction.resizable);
            mainWindow.setMovable(normalWindowInteraction.movable);
            normalWindowInteraction = null;
        }
        onWindowStateChanged('Normal');
    }

    function onWindowGeometryChanged() {
        if (process.platform != 'win32' || !fullscreenActive || fullscreenTransition || mainWindow.isMinimized()) return;
        var bounds = mainWindow.getBounds();
        var displayBounds = electron.screen.getDisplayMatching(bounds).bounds;
        // The native fullscreen API is false on this pinned transparent path.
        // If an external bounds change escapes the interaction lock, exit through
        // the normal transition so the renderer cannot retain stale fullscreen.
        if (['x', 'y', 'width', 'height'].some(function (key) { return Math.abs(bounds[key] - displayBounds[key]) > 1; })) {
            setWindowState('Normal');
        }
    }

    function onUnMaximize() {
        onWindowStateChanged('Normal');
    }

    var customFileProtocol = 'electronfile';

    function addPathIntercepts() {

        var protocol = electron.protocol;
        var path = require('path');

        protocol.registerFileProtocol(customFileProtocol, function (request, callback) {

            // Add 3 to account for ://
            var url = request.url.substr(customFileProtocol.length + 3);
            url = __dirname + '/' + url;
            url = url.split('?')[0];

            callback({
                path: path.normalize(url)
            });
        });

        //protocol.interceptHttpProtocol('https', function (request, callback) {

        //    alert(request.url);
        //    callback({ 'url': request.url, 'referrer': request.referrer, session: null });
        //});
    }

    var windowStateOnLoad;
    function registerAppHost() {

        var protocol = electron.protocol;
        var customProtocol = 'electronapphost';

        protocol.registerStringProtocol(customProtocol, function (request, callback) {

            var parsedRequest = appHostCommand.parse(request.url, customProtocol);
            var command = parsedRequest.command;
            if (!appHostCommand.isKnown(command)) {
                callback("");
                return;
            }

            switch (command) {

                case 'windowstate-normal':

                    setWindowState('Normal');

                    break;
                case 'windowstate-maximized':
                    setWindowState('Maximized');
                    break;
                case 'windowstate-fullscreen':
                    setWindowState('Fullscreen');
                    break;
                case 'windowstate-minimized':
                    setWindowState('Minimized');
                    break;
                case 'exit':
                    closeWindow(mainWindow);
                    break;
                case 'openurl':
                    externalUrl.openExternalUrl(electron.shell, appHostCommand.getOpenUrlTarget(parsedRequest));
                    break;
                case 'video-on':
                    if (!appIsShuttingDown) playbackPowerOwner.setActive('video', true);
                    break;
                case 'video-off':
                    playbackPowerOwner.setActive('video', false);
                    break;
                case 'audio-on':
                    if (!appIsShuttingDown) playbackPowerOwner.setActive('audio', true);
                    break;
                case 'audio-off':
                    playbackPowerOwner.setActive('audio', false);
                    break;
                case 'loaded':
                    if (windowStateOnLoad) {
                        setWindowState(windowStateOnLoad);
                    }
                    mainWindow.focus();
                    hasAppLoaded = true;
                    onLoaded();
                    break;
            }
            callback("");
        });
    }

    function onLoaded() {
        var mainWindow = electron.BrowserWindow.getAllWindows()[0];
        sendJavascript('window.PlayerWindowId="' + getWindowId(mainWindow) + '";');
        sendJavascript(`window.platform="${process.platform}";`);
      }

    function registerFileSystem() {

        var protocol = electron.protocol;
        var customProtocol = 'electronfs';

        protocol.registerStringProtocol(customProtocol, function (request, callback) {

            // Add 3 to account for ://
            var url = request.url.substr(customProtocol.length + 3).split('?')[0];
            var fs = require('fs');

            switch (url) {

                case 'fileexists':
                case 'directoryexists':

                    try {
                        var path = request.url.split('=')[1];

                        fs.access(path, (err) => {
                            if (err) {
                                console.error('fs access result for path: ' + err);

                                callback('false');
                            } else {
                                callback('true');
                            }
                        });
                    }
                    catch (err) {
                        callback('false');
                    }
                    break;
                default:
                    callback("");
                    break;
            }
        });
    }

    function registerServerdiscovery() {

        var protocol = electron.protocol;
        var customProtocol = 'electronserverdiscovery';
        var serverdiscovery = require('./serverdiscovery/serverdiscovery-native');

        protocol.registerStringProtocol(customProtocol, function (request, callback) {

            // Add 3 to account for ://
            var url = request.url.substr(customProtocol.length + 3).split('?')[0];

            switch (url) {

                case 'findservers':
                    var timeoutMs = request.url.split('=')[1];
                    serverdiscovery.findServers(timeoutMs, callback);
                    break;
                default:
                    callback("");
                    break;
            }
        });
    }

    function registerWakeOnLan() {

        var protocol = electron.protocol;
        var customProtocol = 'electronwakeonlan';
        var wakeonlan = require('./wakeonlan/wakeonlan-native');

        protocol.registerStringProtocol(customProtocol, function (request, callback) {

            // Add 3 to account for ://
            var url = request.url.substr(customProtocol.length + 3).split('?')[0];

            switch (url) {

                case 'wakeserver':
                    var mac = request.url.split('=')[1].split('&')[0];
                    var options = {
                        address: request.url.split('=')[2].split('&')[0],
                        port: request.url.split('=')[3].split('&')[0]
                    };
                    wakeonlan.wake(mac, options, callback);
                    break;
                default:
                    callback("");
                    break;
            }
        });
    }

    function registerFreshRate() {

        var protocol = electron.protocol;
        var customProtocol = 'electronrefreshrate';
        var owners = new Set();
        var pendingOwners = [];
        var runningOwner = null;
        var pumping = false;
        var accepting = true;
        var shutdownPromise;

        function release(owner) {
            if (owner.completed && owner.exited) {
                owners.delete(owner);
                if (runningOwner === owner) runningOwner = null;
            }
        }

        function quarantined() {
            return Array.from(owners).some(function (owner) { return owner.terminating && !owner.exited; });
        }

        function confirmExit(owner) {
            owner.exited = true;
            if (owner.reapTimer != null) {
                clearTimeout(owner.reapTimer);
                owner.reapTimer = null;
            }
            owner.settleCleanup(true);
            release(owner);
            pump();
        }

        function terminate(owner) {
            if (owner.exited || owner.terminating) return;
            owner.terminating = true;
            owner.reapTimer = setTimeout(function () {
                owner.reapTimer = null;
                // Keep the owner and safe exit/error listeners. A kill request
                // does not prove that the process, or its side effect, ended.
                owner.settleCleanup(false);
            }, 1000);
            try { owner.child.kill(); } catch (_) { /* Still quarantined until an observed exit. */ }
        }

        function complete(owner, value, stopChild) {
            if (owner.completed) return;
            owner.completed = true;
            if (owner.deadlineTimer != null) {
                clearTimeout(owner.deadlineTimer);
                owner.deadlineTimer = null;
            }
            var queuedIndex = pendingOwners.indexOf(owner);
            if (queuedIndex >= 0) pendingOwners.splice(queuedIndex, 1);
            if (!owner.child) {
                owner.exited = true;
                owner.settleCleanup(true);
            } else if (stopChild) terminate(owner);
            var callbackError;
            try { owner.callback(value); } catch (error) { callbackError = error; }
            release(owner);
            try { pump(); } catch (error) { if (!callbackError) callbackError = error; }
            if (callbackError) throw callbackError;
        }

        function start(owner) {
            // Receiving, queuing and execution share the original deadline.
            if (Date.now() >= owner.deadline) { complete(owner, "", false); return; }
            runningOwner = owner;
            var child;
            try { child = owner.spawn(owner.file, owner.args); }
            catch (_) {
                confirmExit(owner);
                complete(owner, "", false);
                return;
            }
            owner.child = child;
            var output = '';
            child.stdout.on('data', function (data) {
                if (!owner.completed) output += data.toString();
            });
            child.on('exit', function () { confirmExit(owner); });
            child.on('close', function () {
                confirmExit(owner);
                complete(owner, Date.now() >= owner.deadline ? "" : output, false);
            });
            child.on('error', function () {
                if (child.pid == null) confirmExit(owner);
                complete(owner, "", !owner.exited);
            });
        }

        function pump() {
            if (pumping) return;
            pumping = true;
            var firstError;
            try {
                while (accepting && !runningOwner && !quarantined() && pendingOwners.length) {
                    var owner = pendingOwners.shift();
                    if (owner.completed) continue;
                    try { start(owner); }
                    catch (error) { if (!firstError) firstError = error; }
                }
            } finally { pumping = false; }
            if (firstError) throw firstError;
        }

        protocol.registerStringProtocol(customProtocol, function (request, callback) {
            var deadline = Date.now() + 5000;
            // Add 3 to account for ://
            var url = request.url.substr(customProtocol.length + 3).split('?')[0];
            var args = []
            if (!accepting || quarantined()) {
                callback("");
                return;
            }
            switch (url) {
                case 'list_possible':
                    args.push(url)
                    args.push("\\\\.\\DISPLAY1")
                    break;
                case 'current':
                    args.push(url)
                    args.push("\\\\.\\DISPLAY1")
                    break;
                case 'change':
                    args.push(url)
                    args.push("\\\\.\\DISPLAY1")
                    args.push(request.url.split('=')[1])
                    break;
                default:
                    callback("");
                    return;
            }

            var { spawn } = require('child_process');
            var path = require('path');

            if (process.platform !== 'win32' || Date.now() >= deadline) {
                callback("");
                return;
            }
            var owner = {child: null, callback: callback, completed: false, exited: false,
                terminating: false, deadlineTimer: null, reapTimer: null, deadline: deadline,
                spawn: spawn, file: path.join(__dirname, 'libmpv', process.arch, 'refreshrate.exe'), args: args};
            owner.cleanup = new Promise(function (resolve) { owner.settleCleanup = resolve; });
            owners.add(owner);
            pendingOwners.push(owner);
            owner.deadlineTimer = setTimeout(function () {
                complete(owner, "", true);
            }, Math.max(0, deadline - Date.now()));
            pump();
        });

        return function () {
            if (shutdownPromise) return shutdownPromise;
            accepting = false;
            var resolveShutdown, rejectShutdown;
            shutdownPromise = new Promise(function (resolve, reject) {
                resolveShutdown = resolve;
                rejectShutdown = reject;
            });
            var pending = Array.from(owners);
            var errors = [];
            pending.forEach(function (owner) {
                try { complete(owner, "", true); }
                catch (error) { errors.push(error); }
                if (!owner.exited) terminate(owner);
            });
            Promise.all(pending.map(function (owner) { return owner.cleanup; })).then(function () {
                if (errors.length) rejectShutdown(errors[0]);
                else resolveShutdown();
            });
            return shutdownPromise;
        };
    }

    function registerFile() {

        var protocol = electron.protocol;

        protocol.registerFileProtocol('file', function (request, callback) {
            const pathname = decodeURI(request.url.replace('file:///', ''));
            const parts = pathname.split('?');
            callback(parts[0]);
        });
    }

    function alert(text) {
        electron.dialog.showMessageBox(mainWindow, {
            message: text.toString(),
            buttons: ['ok']
        });
    }

    function replaceAll(str, find, replace) {

        return str.split(find).join(replace);
    }

    function getAppBaseUrl() {

        var url = 'https://tv.emby.media';

        //url = 'http://localhost:8088';
        return url;
    }

    function getAppUrl() {

        var url = getAppBaseUrl() + '/index.html?autostart=false';
        //url += '?v=' + new Date().getTime();
        return url;
    }

    var startInfoJson;
    function loadStartInfo() {

        return new Promise(function (resolve, reject) {

            var os = require("os");

            var path = require('path');
            var fs = require('fs');

            var topDirectory = path.normalize(__dirname);
            var pluginDirectory = path.normalize(__dirname + '/plugins');
            var scriptsDirectory = path.normalize(__dirname + '/scripts');

            fs.readdir(pluginDirectory, function (err, pluginFiles) {

                fs.readdir(scriptsDirectory, function (err, scriptFiles) {

                    pluginFiles = pluginFiles || [];
                    scriptFiles = scriptFiles || [];

                    var startInfo = {
                        paths: {
                            apphost: customFileProtocol + '://apphost',
                            shell: customFileProtocol + '://shell',
                            wakeonlan: customFileProtocol + '://wakeonlan/wakeonlan',
                            serverdiscovery: customFileProtocol + '://serverdiscovery/serverdiscovery',
                            fullscreenmanager: 'file://' + replaceAll(path.normalize(topDirectory + '/fullscreenmanager.js'), '\\', '/'),
                            filesystem: customFileProtocol + '://filesystem'
                        },
                        name: app.name,
                        version: app.getVersion(),
                        deviceName: os.hostname(),
                        deviceId: persistentDeviceId,
                        plugins: pluginFiles.filter(function (f) {
                            // Ignore the retired plugin if an older install left it behind.
                            return f.toLowerCase() !== 'cec.js' && f.indexOf('.js') != -1;

                        }).map(function (f) {

                            return 'file://' + replaceAll(path.normalize(pluginDirectory + '/' + f), '\\', '/');
                        }),
                        scripts: scriptFiles.map(function (f) {

                            return 'file://' + replaceAll(path.normalize(scriptsDirectory + '/' + f), '\\', '/');
                        })
                    };

                    startInfoJson = JSON.stringify(startInfo);
                    resolve();
                });
            });
        });
    }

    function setStartInfo() {

        var script = 'function startWhenReady(){if (self.Emby && self.Emby.App){self.appStartInfo=' + startInfoJson + ';Emby.App.start(appStartInfo);} else {setTimeout(startWhenReady, 50);}} startWhenReady();';
        sendJavascript(script);
        //sendJavascript('var appStartInfo=' + startInfoJson + ';');
    }

    function sendCommand(cmd) {

        var script = "require(['inputmanager'], function(inputmanager){inputmanager.trigger('" + cmd + "');});";
        sendJavascript(script);
    }

    function sendJavascript(script) {

        // Add some null checks to handle attempts to send JS when the process is closing or has closed
        try {
            var web = getWebContents();
            if (web) {
                web.executeJavaScript(script);
            }
        }
        catch (err) {
            console.log('error sending javascript: ' + err);
        }
    }

    function onAppCommand(e, cmd) {

        //switch (command_id) {
        //    case APPCOMMAND_BROWSER_BACKWARD       : return "browser-backward";
        //    case APPCOMMAND_BROWSER_FORWARD        : return "browser-forward";
        //    case APPCOMMAND_BROWSER_REFRESH        : return "browser-refresh";
        //    case APPCOMMAND_BROWSER_STOP           : return "browser-stop";
        //    case APPCOMMAND_BROWSER_SEARCH         : return "browser-search";
        //    case APPCOMMAND_BROWSER_FAVORITES      : return "browser-favorites";
        //    case APPCOMMAND_BROWSER_HOME           : return "browser-home";
        //    case APPCOMMAND_VOLUME_MUTE            : return "volume-mute";
        //    case APPCOMMAND_VOLUME_DOWN            : return "volume-down";
        //    case APPCOMMAND_VOLUME_UP              : return "volume-up";
        //    case APPCOMMAND_MEDIA_NEXTTRACK        : return "media-nexttrack";
        //    case APPCOMMAND_MEDIA_PREVIOUSTRACK    : return "media-previoustrack";
        //    case APPCOMMAND_MEDIA_STOP             : return "media-stop";
        //    case APPCOMMAND_MEDIA_PLAY_PAUSE       : return "media-play-pause";
        //    case APPCOMMAND_LAUNCH_MAIL            : return "launch-mail";
        //    case APPCOMMAND_LAUNCH_MEDIA_SELECT    : return "launch-media-select";
        //    case APPCOMMAND_LAUNCH_APP1            : return "launch-app1";
        //    case APPCOMMAND_LAUNCH_APP2            : return "launch-app2";
        //    case APPCOMMAND_BASS_DOWN              : return "bass-down";
        //    case APPCOMMAND_BASS_BOOST             : return "bass-boost";
        //    case APPCOMMAND_BASS_UP                : return "bass-up";
        //    case APPCOMMAND_TREBLE_DOWN            : return "treble-down";
        //    case APPCOMMAND_TREBLE_UP              : return "treble-up";
        //    case APPCOMMAND_MICROPHONE_VOLUME_MUTE : return "microphone-volume-mute";
        //    case APPCOMMAND_MICROPHONE_VOLUME_DOWN : return "microphone-volume-down";
        //    case APPCOMMAND_MICROPHONE_VOLUME_UP   : return "microphone-volume-up";
        //    case APPCOMMAND_HELP                   : return "help";
        //    case APPCOMMAND_FIND                   : return "find";
        //    case APPCOMMAND_NEW                    : return "new";
        //    case APPCOMMAND_OPEN                   : return "open";
        //    case APPCOMMAND_CLOSE                  : return "close";
        //    case APPCOMMAND_SAVE                   : return "save";
        //    case APPCOMMAND_PRINT                  : return "print";
        //    case APPCOMMAND_UNDO                   : return "undo";
        //    case APPCOMMAND_REDO                   : return "redo";
        //    case APPCOMMAND_COPY                   : return "copy";
        //    case APPCOMMAND_CUT                    : return "cut";
        //    case APPCOMMAND_PASTE                  : return "paste";
        //    case APPCOMMAND_REPLY_TO_MAIL          : return "reply-to-mail";
        //    case APPCOMMAND_FORWARD_MAIL           : return "forward-mail";
        //    case APPCOMMAND_SEND_MAIL              : return "send-mail";
        //    case APPCOMMAND_SPELL_CHECK            : return "spell-check";
        //    case APPCOMMAND_MIC_ON_OFF_TOGGLE      : return "mic-on-off-toggle";
        //    case APPCOMMAND_CORRECTION_LIST        : return "correction-list";
        //    case APPCOMMAND_MEDIA_PLAY             : return "media-play";
        //    case APPCOMMAND_MEDIA_PAUSE            : return "media-pause";
        //    case APPCOMMAND_MEDIA_RECORD           : return "media-record";
        //    case APPCOMMAND_MEDIA_FAST_FORWARD     : return "media-fast-forward";
        //    case APPCOMMAND_MEDIA_REWIND           : return "media-rewind";
        //    case APPCOMMAND_MEDIA_CHANNEL_UP       : return "media-channel-up";
        //    case APPCOMMAND_MEDIA_CHANNEL_DOWN     : return "media-channel-down";
        //    case APPCOMMAND_DELETE                 : return "delete";
        //    case APPCOMMAND_DICTATE_OR_COMMAND_CONTROL_TOGGLE:
        //        return "dictate-or-command-control-toggle";
        //    default:
        //        return "unknown";

        if (cmd != 'Unknown') {
            //alert(cmd);
        }

        switch (cmd) {

            case 'browser-backward':
                sendCommand("back");
                break;
            case 'browser-forward':
                sendCommand("forward");
                break;
            case 'browser-stop':
                sendCommand("stop");
                break;
            case 'browser-search':
                sendCommand("search");
                break;
            case 'browser-favorites':
                sendCommand("favorites");
                break;
            case 'browser-home':
                sendCommand("home");
                break;
            case 'browser-refresh':
                sendCommand("refresh");
                break;
            case 'find':
                sendCommand("search");
                break;
            case 'volume-mute':
                sendCommand("togglemute");
                break;
            case 'volume-down':
                sendCommand("volumedown");
                break;
            case 'volume-up':
                sendCommand("volumeup");
                break;
            case 'media-nexttrack':
                sendCommand("next");
                break;
            case 'media-previoustrack':
                sendCommand("previous");
                break;
            case 'media-stop':
                sendCommand("stop");
                break;
            case 'media-play':
                sendCommand("play");
                break;
            case 'media-pause':
                sendCommand("pause");
                break;
            case 'media-record':
                sendCommand("record");
                break;
            case 'media-fast-forward':
                sendCommand("fastforward");
                break;
            case 'media-rewind':
                sendCommand("rewind");
                break;
            case 'media-play-pause':
                sendCommand("playpause");
                break;
            case 'media-channel-up':
                sendCommand("channelup");
                break;
            case 'media-channel-down':
                sendCommand("channeldown");
                break;
            case 'menu':
                sendCommand("menu");
                break;
            case 'info':
                sendCommand("info");
                break;
        }
    }

    function setCommandLineSwitches() {

        var isLinux = require('is-linux');
        app.commandLine.appendSwitch("ignore-gpu-blacklist");
        app.commandLine.appendSwitch('no-sandbox');
        app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors')
        app.commandLine.appendSwitch('disable-site-isolation-trials')
        app.commandLine.appendSwitch('disable-features', 'BlockInsecurePrivateNetworkRequests')

        if (isLinux()) {
            app.commandLine.appendSwitch('enable-transparent-visuals');
            //app.disableHardwareAcceleration();
        }

        else if (process.platform === 'win32') {
            //app.disableHardwareAcceleration();

            //app.commandLine.appendSwitch('high-dpi-support', 'true');
            //app.commandLine.appendSwitch('force-device-scale-factor', '1');
        }
    }

    function getWindowStateDataPath() {

        var path = require("path");
        return path.join(app.getPath('userData'), "windowstate.json");
    }

    function closeWindow(win) {

        try {
            win.close();
        } catch (err) {
            console.log('Error closing window. It may have already been closed. ' + err);
        }
    }

    function onWindowClose(event) {
        var closingWindow = mainWindow;
        if (detailCacheCloseOwner && detailCacheCloseOwner.beforeClose(event, function (status) {
            enhancedLog({level: status === 'flushed' ? 'info' : 'warn', category: 'app', event: 'detail-cache-flush', details: {status: status}});
            if (closingWindow && !closingWindow.isDestroyed()) closingWindow.close();
        })) return;

        if (hasAppLoaded) {
            var data = previousBounds
            if (!fullscreenActive) {
                data = mainWindow.getBounds();
            }
            data.state = currentWindowState;
            var windowStatePath = getWindowStateDataPath();
            require("fs").writeFileSync(windowStatePath, JSON.stringify(data));
        }


        // Unregister all shortcuts.
        electron.globalShortcut.unregisterAll();

    }

    function parseCommandLine() {

        var isWindows = require('is-windows');
        var fs = require('fs');
        var isRpi = require('detect-rpi');
        var path = require('path');

        var result = {};
        var commandLineArguments = process.argv.slice(2);

        var index = 0;

        if (isWindows()) {
            result.userDataPath = commandLineArguments[index];
            index++;
        }

        return result;
    }

    var commandLineOptions = parseCommandLine();

    var userDataPath = pageCacheTest ? pageCacheTest.userDataPath : commandLineOptions.userDataPath;
    if (userDataPath) {
        app.setPath('userData', userDataPath);
    }

    var strmConfigStoreModule = require('./enhanced/strm-config-store');
    var cd2ServiceModule = require('./enhanced/cd2-service');
    var nativeHelperServiceModule = require('./native-helper/service');
    var nativeHelperMode = nativeHelperServiceModule.resolveMode(process.env.ETE_MPV_BRIDGE_MODE);
    var mpvKernelStoreModule = require('./enhanced/mpv-kernel-store');
    var mpvKernelIpc = require('./enhanced/mpv-kernel-ipc');
    var mpvKernelBootstrap = require('./enhanced/mpv-kernel-bootstrap');
    strmConfigStore = strmConfigStoreModule.createStore({
        rootDir: require('path').join(app.getPath('userData'), 'config'),
        environment: Object.assign({}, process.env)
    });
    cd2Service = cd2ServiceModule.createService({config: strmConfigStore.getRuntimeConfig(), onDiagnostic: enhancedLog});
    unregisterCd2Ipc = require('./enhanced/cd2-ipc').register({
        ipcMain: ipcMain,
        service: cd2Service,
        getWebContents: getWebContents
    });
    unregisterStrmConfigIpc = require('./enhanced/strm-config-ipc').register({
        ipcMain: ipcMain,
        store: strmConfigStore,
        service: cd2Service,
        getWebContents: getWebContents,
        createTestService: function () {
            return cd2ServiceModule.createService({config: strmConfigStore.getRuntimeConfig()});
        }
    });
    unregisterDiagnosticsIpc = require('./enhanced/diagnostics-ipc').register({
        ipcMain: ipcMain,
        logger: enhancedLog,
        getWebContents: getWebContents,
        getBrowserWindow: function () { return mainWindow; },
        getAppInfo: getCurrentEnhancedAppInfo,
        getNativeHelperStatus: function () {
            return nativeHelperService && typeof nativeHelperService.status === 'function' ? nativeHelperService.status() : null;
        },
        app: app,
        dialog: electron.dialog,
        shell: electron.shell
    });
    detailCacheCloseOwner = require('./enhanced/detail-cache/close-owner').register({ipcMain: ipcMain, getWebContents: getWebContents});
    app.once('will-quit', function () { detailCacheCloseOwner.dispose(); });
    unregisterCacheManagementIpc = require('./enhanced/cache-management-ipc').register({
        ipcMain: ipcMain, getWebContents: getWebContents
    });
    unregisterMaintenanceIpc = maintenanceIpc.register({
        updateCache: (function () {
            var store = require('./enhanced/update-install-cache').createStore({
                profileRoot: appBootstrapState.profileRoot, executable: process.execPath,
                handoff: require('./enhanced/update-install-handoff').createHandoff()
            });
            // Local-only reconciliation never checks for releases or starts an installer.
            var reconciled = Promise.resolve().then(function () { return store.reconcile(getAppVersion()); })
                .catch(function () { enhancedLog({category: 'app', event: 'update-cache-retained'}); });
            return {
                download: async function (installer, options) { await reconciled; return store.download(installer, options); },
                prepare: function (record, signal) { return store.prepare(record, signal); },
                recovery: async function () { await reconciled; return store.recovery(getAppVersion()); },
                close: function () { return reconciled; }
            };
        })(),
        quitForUpdate: function () { setImmediate(function () { app.quit(); }); },
        preferences: require('./enhanced/app-update-preferences').createStore(appBootstrapState.configDirectory),
        ipcMain: ipcMain,
        getWebContents: getWebContents,
        getBrowserWindow: function () { return mainWindow; },
        getAppInfo: getCurrentEnhancedAppInfo,
        getPlatformInfo: getPlatformInfo,
        getDisplayInfo: getDisplayInfo,
        clipboard: electron.clipboard,
        shell: electron.shell
    });
    async function initializeNativeHelperForStartup() {
        var prepared = await mpvKernelBootstrap.prepare({
            readBundledVersions: readCurrentBundledVersions,
            profileRoot: appBootstrapState.profileRoot,
            createStore: function (options) { return mpvKernelStoreModule.createStore(options); },
            shouldCancel: function () { return appIsShuttingDown; },
            onStoreCreated: function (store) {
                mpvKernelStore = store;
                if (appIsShuttingDown && typeof store.close === 'function') store.close();
            }
        });
        if (appIsShuttingDown) {
            if (prepared.store && typeof prepared.store.close === 'function') await prepared.store.close();
            return null;
        }
        mpvKernelStore = prepared.store;
        var startupSelection = prepared.startupSelection;
        var kernelStoreUnavailableReason = prepared.identityState !== 'verified'
            ? 'package-identity-unavailable'
            : (mpvKernelStore ? null : 'store-unavailable');
        if (prepared.identityState !== 'verified') {
            enhancedLog({category: 'native-helper', event: 'kernel-package-identity-unavailable', details: {}});
        } else if (!mpvKernelStore) {
            enhancedLog({category: 'native-helper', event: 'kernel-store-unavailable', details: {reason: 'store-unavailable'}});
        }

        nativeHelperService = nativeHelperServiceModule.createService({
            electron: electron,
            getMainWindow: function () { return mainWindow; },
            getWebContents: getWebContents,
            logger: enhancedLog,
            runtimeRoot: path.resolve(__dirname, '..'),
            mode: nativeHelperMode,
            kernelStore: mpvKernelStore,
            startupKernelSelection: startupSelection
        });
        unregisterNativeHelperIpc = nativeHelperServiceModule.register({
            ipcMain: ipcMain,
            service: nativeHelperService,
            getWebContents: getWebContents
        });
        unregisterMpvKernelIpc = mpvKernelIpc.register({
            ipcMain: ipcMain,
            dialog: electron.dialog,
            getBrowserWindow: function () { return mainWindow; },
            getWebContents: getWebContents,
            service: nativeHelperService,
            store: mpvKernelStore,
            unavailableReason: kernelStoreUnavailableReason
        });
        return startupSelection;
    }
    ['ETE_CD2_ENABLED', 'ETE_CD2_ORIGIN', 'ETE_CD2_TOKEN', 'ETE_CD2_LOCAL_PREFIX', 'ETE_CD2_CLOUD_PREFIX', 'ETE_CD2_DIRECT_URL', 'ETE_CD2_SOURCE_PREFIX', 'ETE_CD2_MOUNT_PREFIX', 'ETE_MPV_BRIDGE_MODE'].forEach(function (name) {
        delete process.env[name];
    });
    app.once('before-quit', function (event) {
        event.preventDefault();
        appIsShuttingDown = true;
        try {
            playbackPowerOwner.shutdown();
        } catch (error) {
            enhancedLog({category: 'app', event: 'power-cleanup-failed', details: {message: error.message}});
        }
        enhancedLog({category: 'app', event: 'shutdown', details: {reason: 'before-quit'}});
        function runCleanup(step, cleanup) {
            var completion;
            try { completion = cleanup(); }
            catch (error) { completion = Promise.reject(error); }
            return Promise.resolve(completion).catch(function () {
                enhancedLog({level: 'warn', category: 'app', event: 'shutdown-cleanup-failed', details: {step: step}});
            });
        }
        // A failed owner must not let quit outrun the other pending cleanups.
        Promise.allSettled([
            runCleanup('diagnostics', function () { return unregisterDiagnosticsIpc(); }),
            runCleanup('maintenance', function () { return unregisterMaintenanceIpc(); }),
            runCleanup('http-cache', function () { return unregisterCacheManagementIpc(); }),
            runCleanup('strm-config', function () { return unregisterStrmConfigIpc(); }),
            runCleanup('cd2', function () { return unregisterCd2Ipc(); }),
            runCleanup('refresh-rate', function () { return unregisterRefreshRate(); }),
            runCleanup('native-helper', function () { return unregisterNativeHelperIpc(); }),
            runCleanup('mpv-kernel', function () { return unregisterMpvKernelIpc(); }),
            runCleanup('windows-media', function () { if (typeof disposeWindowsNativeMedia === 'function') return disposeWindowsNativeMedia(); }),
            runCleanup('startup', function () { return readyStartupPromise; })
        ]).then(function () { app.quit(); });
    });
    ipcMain.on('enhanced-diagnostics', function (event, snapshot) {
        if (rendererBoundary.isTrusted(event, getWebContents())) {
            enhancedLog({category: 'mpv', event: 'snapshot', details: enhancedDiagnostics.sanitize(snapshot)});
        }
    });

    function getWindowId(win) {

        var Long = require("long");
        var os = require("os");
        var handle = win.getNativeWindowHandle();

        if (os.endianness() == "LE") {

            if (handle.length == 4) {
                handle.swap32();
            } else if (handle.length == 8) {
                handle.swap64();
            } else {
                console.log("Unknown Native Window Handle Format.");
            }
        }
        var longVal = Long.fromString(handle.toString('hex'), unsigned = true, radix = 16);

        return longVal.toString();
    }

    setCommandLineSwitches();

    function onWindowShow() {

        mainWindow.focus();
        initialShowEventsComplete = true;
    }

    //app.on('quit', function () {
    //    closeWindow(mainWindow);
    //});

    // This method will be called when Electron has finished
    // initialization and is ready to create browser windows.
    app.on('ready', function () {

        var windowStatePath = getWindowStateDataPath();

        var previousWindowInfo;
        try {
            previousWindowInfo = JSON.parse(require("fs").readFileSync(windowStatePath, 'utf8'));
        }
        catch (e) {
            previousWindowInfo = {};
        }
        windowStateOnLoad = require('detect-rpi')() ? 'Fullscreen' : previousWindowInfo.state;

        var path = require('path')
        var icon = require('is-windows') ? 'icon.ico' : 'icon.png'

        var windowOptions = {
            transparent: true,
            frame: false,
            title: 'Emby Theater',
            minWidth: 640,
            minHeight: 360,
            //alwaysOnTop: true,
            //skipTaskbar: isWindows() ? false : true,

            //show: false,
            backgroundColor: '#00000000',
            center: true,
            show: false,

            webPreferences: {
                webSecurity: false,
                webgl: false,
                nodeIntegration: false,
                nodeIntegrationInWorker: false,
                plugins: true,
                webaudio: true,
                java: false,
                allowDisplayingInsecureContent: true,
                allowRunningInsecureContent: true,
                experimentalFeatures: false,
                devTools: enableDevTools,
                contextIsolation: false,
                enableRemoteModule: false,
                sandbox: false,
                preload: path.join(__dirname, 'preload.js')
            },

            icon: nativeImage.createFromPath(path.join(__dirname, icon))
        };

        if (pageCacheTest) windowOptions.webPreferences.additionalArguments = [pageCacheTest.rendererArgument];

        windowOptions.width = previousWindowInfo.width || 1280;
        windowOptions.height = previousWindowInfo.height || 720;
        if (previousWindowInfo.x != null && previousWindowInfo.y != null) {
            windowOptions.x = previousWindowInfo.x;
            windowOptions.y = previousWindowInfo.y;
        }

        // Create the browser window.

        readyStartupPromise = initializeNativeHelperForStartup().then(function () {
            if (appIsShuttingDown || !nativeHelperService) return null;
            return loadStartInfo();
        }).then(async function () {
            if (appIsShuttingDown || !nativeHelperService) return;

            mainWindow = new BrowserWindow(windowOptions);
            if (process.platform === 'win32') {
                try {
                    var nativeMediaPath = path.join(__dirname, 'enhanced', 'native-media');
                    var winrtMedia = require(path.join(nativeMediaPath, 'winrt.cjs'));
                    var dwmMedia = require(path.join(nativeMediaPath, 'dwm.cjs'));
                    windowsNativeMedia = require('./enhanced/windows-native-media').attach({
                        window: mainWindow, ipcMain: ipcMain, nativeImage: nativeImage,
                        capturePreview: function (owner) { return nativeHelperService ? nativeHelperService.capturePreview(owner) : Promise.resolve(null); },
                        isPreviewOwner: function (owner) { return !!nativeHelperService && nativeHelperService.isPreviewOwner(owner); },
                        sendCommand: function (packet) {
                            if (appIsShuttingDown || !mainWindow || mainWindow.isDestroyed()) return;
                            mainWindow.webContents.send('enhanced-windows-native-media-command', packet);
                        },
                        koffi: require(path.join(nativeMediaPath, 'node_modules', 'koffi')),
                        createBindings: winrtMedia.createBindings, createSmtc: winrtMedia.createSmtc,
                        createDwm: dwmMedia.createDwm, attachThumbnail: dwmMedia.attachThumbnail, log: enhancedLog,
                        artworkDirectory: path.join(app.getPath('userData'), 'windows-media-artwork')
                    });
                    disposeWindowsNativeMedia = windowsNativeMedia.dispose;
                } catch (_) { enhancedLog({category: 'windows-media', event: 'integration-unavailable', details: {stage: 'startup'}}); }
            }

            if (enableDevToolsOnStartup) {
                mainWindow.openDevTools();
            }

            getWebContents().on('dom-ready', setStartInfo);
            rendererBoundary.restrictNavigation(getWebContents());

            getWebContents().setWindowOpenHandler(function (details) {
                externalUrl.openExternalUrl(electron.shell, details.url);
                return { action: 'deny' };
            });

            var url = getAppUrl();

            addPathIntercepts();

            registerAppHost();
            registerFileSystem();
            registerServerdiscovery();
            registerWakeOnLan();
            unregisterRefreshRate = registerFreshRate();
            registerFile();

            var kernelPrewarm = await nativeHelperService.prewarm();
            if (appIsShuttingDown) return;
            if (kernelPrewarm && kernelPrewarm.status === 'failed') {
                enhancedLog({category: 'native-helper', event: 'kernel-startup-resolution-failed', details: {
                    state: kernelPrewarm.kernel,
                    reason: kernelPrewarm.reasonCode
                }});
            }

            // and load the index.html of the app.
            mainWindow.loadURL(`file://${__dirname}/www/index.html?autostart=false`);
            mainWindow.setMenu(null);
            mainWindow.on('move', onWindowMoved);
            mainWindow.on('move', onWindowGeometryChanged);
            mainWindow.on('resize', onWindowGeometryChanged);
            mainWindow.on('app-command', onAppCommand);
            // A hidden native video carrier must not keep a closed UI alive.
            // Run only after the existing cache close/flush has allowed closed.
            mainWindow.once('closed', function () {
                if (process.platform === 'win32' && !appIsShuttingDown) app.quit();
            });
            mainWindow.on("close", onWindowClose);
            mainWindow.on("minimize", onMinimize);
            mainWindow.on("maximize", onMaximize);
            mainWindow.on("enter-full-screen", onEnterFullscreen);
            mainWindow.on("leave-full-screen", onLeaveFullscreen);
            mainWindow.on("restore", onRestore);
            mainWindow.on("unmaximize", onUnMaximize);
            mainWindow.on("show", onWindowShow);
            mainWindow.show();
        }).catch(function () {
            enhancedLog({category: 'native-helper', event: 'app-startup-initialization-failed', details: {reason: 'startup-initialization-failed'}});
        });
    });
})();
/* Modified for Emby Theater Enhanced on 2026-09-12/13. Distributed under GPL-2.0-only; see LICENSE. */
