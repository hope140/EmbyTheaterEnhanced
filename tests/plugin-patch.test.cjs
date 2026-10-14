'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {patchApp, patchViewManager, patchRouter} = require('../tools/patch-plugin-settings.cjs');

function minimalAppSource() {
    return [
        'appRouter.addRoute({',
        '  path: "/configurationpage",',
        '  roles: "admin",',
        '});',
        'define("baseView", [], getDynamicImport("./modules/viewmanager/baseview.js")),'
    ].join('\n');
}

function minimalViewManagerSource(newline = '\n') {
    return [
        'function ViewManager(){}',
        'ViewManager.prototype.loadView=function(options,signal){return require(dependencies).then(function(){var splash;return setControllerClass(allPages[pageIndex]=view,options).then(function(){var controller;var controller=onBeforeChange(previousView,view,!1,options.isBack,options);return currentUrls;});});};',
        'ViewManager.prototype.tryRestoreView=function(options,signal){return setControllerClass(view,options).then(function(){console.log("restore");var controller=onBeforeChange(previousView,view,!0,options.isBack,options);return view.classList.remove("hide");});};',
        'function onViewChange(previousView,newView,options){return ((previousView?previousView.transitionPromise:null)||Promise.resolve()).then(function(){var eventDetail=getViewEventDetail(newView,options);return eventDetail;});}'
    ].join(newline);
}

function minimalRouterSource() {
    return [
        'function handleRoute(ctx, route) {',
        '  if (route.roles) return Promise.resolve().then(function() { initRoute(ctx, route); }, beginConnectionWizard);',
        '  initRoute(ctx, route);',
        '}',
        'function initRoute(ctx, route) {',
        '  function onInitComplete(controllerFactory) {}',
        '  (function(route) { return Promise.resolve(); })(route).then(onInitComplete);',
        '}'
    ].join('\n');
}

test('patchApp adds a narrow admin module route and local aliases while preserving baseView', () => {
    const output = patchApp(minimalAppSource());
    const route = output.slice(output.indexOf('path: "/genericui"'), output.indexOf('path: "/configurationpage"'));

    assert.match(route, /contentPath: "\.\.\/enhanced\/plugin-ui\/genericui\.html"/);
    assert.match(route, /controller: "\.\.\/enhanced\/plugin-ui\/genericui\.js"/);
    assert.match(route, /controllerType: "module", type: "genericui"/);
    assert.match(route, /roles: "admin"/);
    assert.equal(output.includes('define("responseHelper", [], getDynamicImport("./../enhanced/plugin-ui/responsehelper.js"))'), true);
    assert.equal(output.includes('define("emby-premierecontainer", [], getDynamicImport("./../enhanced/plugin-ui/premierecontainer.js"))'), true);
    assert.match(output, /define\("baseView", \[\], getDynamicImport\("\.\/modules\/viewmanager\/baseview\.js"\)\)/);
});

test('patchApp fails closed when route or alias anchors are absent or ambiguous', () => {
    assert.throws(() => patchApp('define("baseView", [], getDynamicImport("./modules/viewmanager/baseview.js")),'), /anchor mismatch/);
    assert.throws(() => patchApp(`${minimalAppSource()}\npath: "/configurationpage",`), /anchor mismatch/);
    assert.throws(() => patchApp(minimalAppSource().replace('define("baseView"', 'define("differentView"')), /anchor mismatch/);
});

test('patchViewManager emits the same canonical transform for LF and CRLF material', () => {
    const lf = patchViewManager(minimalViewManagerSource('\n'));
    const crlf = patchViewManager(minimalViewManagerSource('\r\n'));
    assert.equal(crlf.replace(/\r\n/g, '\n'), lf);
    assert.match(lf, /eteNavigationEpoch/);
    assert.match(lf, /AbortError/);
    assert.match(lf, /eteOrdinaryCheck\(epoch,signal,view,pageIndex\)/);
    assert.match(lf, /!currentViewInfo\|\|currentViewInfo\.view!==newView/);
    assert.match(lf, /eteDisposed/);
    assert.doesNotThrow(() => new vm.Script(lf));
});

test('patchRouter guards route epochs, stale controller completion, and permission fallback', () => {
    const output = patchRouter(minimalRouterSource());
    assert.match(output, /var eteRouteEpoch = 0;/);
    assert.match(output, /if \(currentViewLoadRequest\) currentViewLoadRequest\.abortController\.abort\(\)/);
    assert.match(output, /if \(routeEpoch !== eteRouteEpoch\) return;/);
    assert.match(output, /routeEpoch === eteRouteEpoch && initRoute\(ctx, route, routeEpoch\)/);
    assert.match(output, /if \(routeEpoch === eteRouteEpoch\) beginConnectionWizard\(\)/);
    assert.doesNotThrow(() => new vm.Script(output));

    assert.throws(() => patchRouter(minimalRouterSource().replace('function handleRoute', 'function routeHandler')), /anchor mismatch/);
    assert.throws(() => patchRouter(`${minimalRouterSource()}\nfunction handleRoute(ctx, route) {}`), /anchor mismatch/);
});
