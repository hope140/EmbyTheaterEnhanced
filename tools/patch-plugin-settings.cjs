'use strict';

// Narrow transforms of the hash-pinned Carnival Web input. Never edit vendor.
function replaceOnce(text, anchor, replacement) {
    if (text.split(anchor).length !== 2) throw new Error('Plugin compatibility anchor mismatch.');
    return text.replace(anchor, replacement);
}

function patchApp(text) {
    text = replaceOnce(text, 'path: "/configurationpage",',
        'path: "/genericui",\n' +
        '                    contentPath: "../enhanced/plugin-ui/genericui.html",\n' +
        '                    controller: "../enhanced/plugin-ui/genericui.js",\n' +
        '                    controllerType: "module", type: "genericui",\n' +
        '                    roles: "admin", enableCache: !1, settingsTheme: !0,\n' +
        '                    windowScroll: 3, requiresDynamicTitle: !0\n' +
        '                  }),\n' +
        '                  appRouter.addRoute({path: "/configurationpage",');
    return replaceOnce(text, 'define("baseView", [], getDynamicImport("./modules/viewmanager/baseview.js")),',
        'define("emby-dialogclosebutton", [], getDynamicImport("./../enhanced/plugin-ui/dialogclosebutton.js")),\n' +
        'define("responseHelper", [], getDynamicImport("./../enhanced/plugin-ui/responsehelper.js")),\n' +
        '      define("emby-premierecontainer", [], getDynamicImport("./../enhanced/plugin-ui/premierecontainer.js")),\n' +
        '      define("baseView", [], getDynamicImport("./modules/viewmanager/baseview.js")),');
}

// This executes inside the original manager closure; ordinary navigation only
// invalidates pending plugin work, and otherwise retains its original code.
function pluginNavigation() {
    var eteNavigationEpoch = 0;
    function etePlugin(options) { return options.isPluginPage || options.type === 'genericui'; }
    function eteAbort() { var e = new Error('Plugin navigation cancelled'); e.name = 'AbortError'; return e; }
    function eteCheck(epoch, signal) {
        if (epoch !== eteNavigationEpoch || signal && signal.aborted) throw eteAbort();
    }
    function eteDestroy(view) {
        if (view.eteDisposed) return;
        view.eteDisposed = true;
        eteUnwatchOrdinary(view);
        view.dispatchEvent(new CustomEvent('viewdestroy', {cancelable: false}));
        if (view.parentNode) view.parentNode.removeChild(view);
    }
    function eteUnwatchOrdinary(view) {
        if (view.eteAbortCleanup) { view.eteAbortCleanup(); view.eteAbortCleanup = null; }
    }
    function eteObserveOrdinary(view, pageIndex, signal) {
        if (!signal) return;
        var onAbort = function() {
            if (!currentViewInfo || currentViewInfo.view !== view) {
                eteDestroy(view);
                if (allPages[pageIndex] === view) { allPages[pageIndex] = null; currentUrls[pageIndex] = null; }
            }
        };
        view.eteAbortCleanup = function() { signal.removeEventListener('abort', onAbort); };
        signal.addEventListener('abort', onAbort, {once: true});
        if (signal.aborted) onAbort();
    }
    function eteResumeIfCurrent(view) {
        if (view && currentViewInfo && currentViewInfo.view === view) {
            view.classList.remove('hide');
            dispatchViewEvent(view, getViewEventDetail(view, currentViewInfo, true, false), 'viewshow');
        }
    }
    function eteOrdinaryCheck(epoch, signal, view, pageIndex, previousView) {
        try { eteCheck(epoch, signal); } catch (error) {
            if (view && (!currentViewInfo || currentViewInfo.view !== view)) {
                eteDestroy(view);
                if (allPages[pageIndex] === view) { allPages[pageIndex] = null; currentUrls[pageIndex] = null; }
            }
            eteResumeIfCurrent(previousView);
            throw error;
        }
    }
    function eteLoad(options, signal, epoch, restored) {
        var stage, normalized, previousView, pageIndex, currentPage, committed = false, previousNotified = false, phase = 'dependencies';
        var originalFactory = options.controllerFactory;
        return Promise.resolve().then(function() {
            eteCheck(epoch, signal);
            function etePrepareNewPage() {
                normalized = normalizeNewView(options, options.isPluginPage);
                stage = normalized.elem;
                if (!stage) throw new Error('Plugin page missing view');
                stage.etePluginPage = true;
                stage.classList.add('page', 'hide');
                var dependencies = stage.getAttribute('data-require');
                dependencies = dependencies ? dependencies.split(',') : [];
                if (options.isPluginPage) dependencies.push('legacy/dashboard', 'css!legacy/dashboard');
                if (normalized.hasjQuery) dependencies.push('jQuery');
                return require(dependencies);
            }
            if (restored) {
                pageIndex = currentUrls.indexOf(options.url);
                stage = pageIndex >= 0 ? allPages[pageIndex] : null;
                if (!stage || !stage.etePluginPage || stage.allowRestore === false) throw new Error('Plugin view not cached');
                return;
            }
            if (options.isPluginPage) {
                return require(['emby-dialogclosebutton']).then(function() {
                    eteCheck(epoch, signal);
                    return etePrepareNewPage();
                });
            }
            return etePrepareNewPage();
        }).then(function() {
            eteCheck(epoch, signal);
            if (!restored) {
                if (!mainAnimatedPages) {
                    mainAnimatedPages = document.querySelector('.mainAnimatedPages');
                    var splash = document.querySelector('.app-splash');
                    if (splash && splash.parentNode) splash.parentNode.removeChild(splash);
                }
                if (normalized.hasScript && window.$) stage = window.$(stage).appendTo(mainAnimatedPages)[0];
                else mainAnimatedPages.appendChild(stage);
                if (options.type) stage.setAttribute('data-type', options.type);
                eteObserveOrdinary(stage, null, signal);
            }
            phase = 'controller';
            return setControllerClass(stage, options);
        }).then(function() {
            eteCheck(epoch, signal);
            phase = 'initialize';
            // Construct before pausing the live page; the staged node is hidden
            // but attached for legacy controllers that query the document.
            if (!stage.initComplete && options.controllerFactory) {
                stage.controller = new options.controllerFactory(stage,
                    getViewEventDetail(stage, options, !!restored, options.isBack).detail.params);
                options.controllerFactory = null;
            }
            eteCheck(epoch, signal);
            previousView = currentViewInfo ? currentViewInfo.view : null;
            pageIndex = restored ? pageIndex : (selectedPageIndex + 1) % 3;
            currentPage = allPages[pageIndex];
            if (stage.controller) stage.controller.hidesPreviousView = false;
            if (!restored) {
                if (options.windowScroll === 3) {
                    options.windowScroll = !stage.classList.contains('scrollFrameY');
                    if (!options.windowScroll) options.adjustHeaderForEmbeddedScroll = true;
                }
                if (options.windowScroll === true) stage.classList.add('page-windowScroll');
            }
            phase = 'commit';
            previousNotified = !!previousView;
            onBeforeChange(previousView, stage, !!restored, options.isBack, options);
            eteCheck(epoch, signal);
            eteUnwatchOrdinary(stage);
            stage.classList.remove('hide');
            if (previousView && previousView !== stage) previousView.classList.add('hide');
            allPages[pageIndex] = stage;
            selectedPageIndex = pageIndex;
            currentUrls[pageIndex] = options.url;
            options.view = stage;
            currentViewInfo = options;
            committed = true;
            if (window.$) { window.$.mobile = window.$.mobile || {}; window.$.mobile.activePage = stage; }
            if (!restored && currentPage && currentPage !== stage && currentPage !== previousView) eteDestroy(currentPage);
            if (previousView && previousView !== stage) dispatchViewEvent(previousView, null, 'viewhide');
            // Synchronous commit: no late transition callback can announce an
            // old page after a newer navigation has committed.
            var detail = getViewEventDetail(stage, options, !!restored, options.isBack);
            stage.dispatchEvent(new CustomEvent('viewshow', detail));
            stage.dispatchEvent(new CustomEvent('pageshow', detail));
            return stage;
        }).catch(function(error) {
            if (!committed && stage && !restored) eteDestroy(stage);
            if (!committed && previousNotified) eteResumeIfCurrent(previousView);
            var cancelled = epoch !== eteNavigationEpoch || signal && signal.aborted || error && error.name === 'AbortError';
            if (!cancelled) {
                // Static text only: never display or log resource URLs, errors,
                // server payloads, authentication fields or user configuration.
                require(['toast']).then(function(result) {
                    if (epoch === eteNavigationEpoch && !(signal && signal.aborted)) result[0]('Plugin page could not be loaded.');
                }, function() {});
            }
            if (cancelled) throw eteAbort();
            var failure = new Error('Plugin page could not be loaded (' + phase + ').');
            failure.name = 'PluginPageError';
            failure.stage = phase;
            throw failure;
        }).finally(function() { options.controllerFactory = originalFactory; });
    }
}

function patchViewManager(text) {
    text = replaceOnce(text, 'function ViewManager(){}', pluginNavigation.toString().replace(/\r\n/g, '\n').replace(/^function pluginNavigation\(\) \{/, '').replace(/\}$/, '') + 'function ViewManager(){}');
    text = replaceOnce(text, 'ViewManager.prototype.loadView=function(options,signal){',
        'ViewManager.prototype.loadView=function(options,signal){if(signal&&signal.aborted)return Promise.reject(eteAbort());var epoch=++eteNavigationEpoch;if(etePlugin(options))return eteLoad(options,signal,epoch,false);');
    text = replaceOnce(text, 'ViewManager.prototype.tryRestoreView=function(options,signal){',
        'ViewManager.prototype.tryRestoreView=function(options,signal){if(signal&&signal.aborted)return Promise.reject(eteAbort());var epoch=++eteNavigationEpoch;if(etePlugin(options)||allPages[currentUrls.indexOf(options.url)]&&allPages[currentUrls.indexOf(options.url)].etePluginPage)return eteLoad(options,signal,epoch,true);');
    text = replaceOnce(text, 'require(dependencies).then(function(){var splash',
        'require(dependencies).then(function(){eteCheck(epoch,signal);var splash');
    text = replaceOnce(text, 'setControllerClass(allPages[pageIndex]=view,options).then(function(){var controller',
        'setControllerClass(allPages[pageIndex]=view,options).then(function(){eteOrdinaryCheck(epoch,signal,view,pageIndex);var controller');
    text = replaceOnce(text, 'var controller=onBeforeChange(previousView,view,!1,options.isBack,options);return currentUrls',
        'var controller=onBeforeChange(previousView,view,!1,options.isBack,options);eteOrdinaryCheck(epoch,signal,view,pageIndex,previousView);eteUnwatchOrdinary(view);return currentUrls');
    text = replaceOnce(text, 'setControllerClass(allPages[pageIndex]=view,options).then(',
        '(eteObserveOrdinary(view,pageIndex,signal),setControllerClass(allPages[pageIndex]=view,options)).then(');
    text = replaceOnce(text, 'return setControllerClass(view,options).then(function(){console.log',
        'return setControllerClass(view,options).then(function(){eteCheck(epoch,signal);console.log');
    text = replaceOnce(text, 'var controller=onBeforeChange(previousView,view,!0,options.isBack,options);return view.classList.remove',
        'var controller=onBeforeChange(previousView,view,!0,options.isBack,options);try{eteCheck(epoch,signal)}catch(error){eteResumeIfCurrent(previousView);throw error}return view.classList.remove');
    return replaceOnce(text, 'Promise.resolve()).then(function(){var eventDetail=getViewEventDetail(newView,options',
        'Promise.resolve()).then(function(){if(!currentViewInfo||currentViewInfo.view!==newView)throw eteAbort();var eventDetail=getViewEventDetail(newView,options');
}

function patchRouter(text) {
    text = replaceOnce(text, 'function handleRoute(ctx, route) {',
        'var eteRouteEpoch = 0;\n  function handleRoute(ctx, route) {\n    var routeEpoch = ++eteRouteEpoch;\n' +
        '    if (currentViewLoadRequest) currentViewLoadRequest.abortController.abort();');
    text = replaceOnce(text, 'function initRoute(ctx, route) {', 'function initRoute(ctx, route, routeEpoch) {');
    text = replaceOnce(text, 'function onInitComplete(controllerFactory) {',
        'function onInitComplete(controllerFactory) {\n      if (routeEpoch !== eteRouteEpoch) return;');
    if (text.split('initRoute(ctx, route);').length !== 3) throw new Error('Plugin routing call anchor mismatch.');
    text = text.replaceAll('initRoute(ctx, route);', 'routeEpoch === eteRouteEpoch && initRoute(ctx, route, routeEpoch);');
    text = replaceOnce(text, '})(route).then(onInitComplete)',
        '})(route).then(onInitComplete, function(error) {\n' +
        '          if (routeEpoch !== eteRouteEpoch) return;\n' +
        '          if (route.type !== "genericui") throw error;\n' +
        '          _loading.default.hide();\n' +
        '          return require(["toast"]).then(function(deps) { if (routeEpoch === eteRouteEpoch) deps[0]("Plugin page could not be loaded."); });\n' +
        '        })');
    return replaceOnce(text, '}, beginConnectionWizard);',
        '}, function() { if (routeEpoch === eteRouteEpoch) beginConnectionWizard(); });');
}

module.exports = {patchApp, patchViewManager, patchRouter};
