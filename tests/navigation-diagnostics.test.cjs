'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), os = require('node:os');
const root = path.resolve(__dirname, '..');
const patch = require('../tools/patch-playback-input-diagnostics.cjs');
const home = require('../tools/patch-server-home.cjs'), plugin = require('../tools/patch-plugin-settings.cjs');
const read = name => fs.readFileSync(path.join(root, 'vendor/web-snapshot/www', name), 'utf8');
const routerSource = patch.patchRouter(home.patchRouter(plugin.patchRouter(read('modules/approuter.js'))));
const viewSource = patch.patchViewManager(home.patchViewManager(plugin.patchViewManager(read('modules/viewmanager/viewmanager.js'))));
const osdSource = require('../tools/patch-videoosd-lifecycle.cjs').patchVideoOsd(read('videoosd/videoosd.js'));
const no = () => {}, clean = value => JSON.parse(JSON.stringify(value));
function extractFunction(source, prefix) {
    const start = source.indexOf(prefix);
    if (start < 0 || source.indexOf(prefix, start + prefix.length) >= 0) throw new Error(`Expected one function anchor: ${prefix}`);
    const open = source.indexOf('{', start + prefix.length);
    if (open < 0) throw new Error(`Missing function body: ${prefix}`);
    let depth = 0;
    let quote = null;
    let escaped = false;
    for (let index = open; index < source.length; index++) {
        const character = source[index];
        if (quote) {
            if (escaped) escaped = false;
            else if (character === '\\') escaped = true;
            else if (character === quote) quote = null;
            continue;
        }
        if (character === '"' || character === "'" || character === '`') {
            quote = character;
            continue;
        }
        if (character === '{') depth++;
        else if (character === '}' && --depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`Unclosed function body: ${prefix}`);
}

function fixture() {
    const records = [], stops = [], calls = [], views = [], listeners = {};
    const navigation = require('../src/electronapp/enhanced/navigation-diagnostics').create(r => records.push(r));
    const window = {__eteNavigationDiagnostics: navigation, addEventListener(name, fn) {listeners[name] = fn;}};
    const player = {streamInfo: {_etePlayRequestId: 1}};
    const manager = {getCurrentPlayer: () => player, isPlayingVideo: () => true,
        stop(p, control) {stops.push({player: p, control: clean(control)}); records.push({category: 'playback', event: 'stop-requested', details: {control, playbackRequestId: p.streamInfo._etePlayRequestId}});}};
    const classes = {classList: {remove: no}};
    const osd = {releaseRateKeys: no, headerElement: classes, backdropContainer: classes, backgroundContainer: classes,
        enableStopOnBack: true, currentPlayer: player, releaseCurrentPlayer: no};
    const pause = extractFunction(osdSource, 'VideoOsd.prototype.pause = function ()');
    const pauseContext = {VideoOsd: {prototype: {}}, window, document: {}, _playbackmanager: {default: manager},
        _dom: {default: {removeEventListener: no}}, _events: {default: {off: no}}, _inputmanager: {default: {off: no}},
        _mouse: {default: {releaseMouseListening: no}}, _backdrop: {default: {clear: no}}, clearBlurFromDocumentElement: no, stopOsdHideTimer: no};
    vm.runInNewContext(pause, pauseContext);
    const previousView = {getAttribute: () => 'videoosd', dispatchEvent(event) {if (event.type === 'viewbeforehide') pauseContext.VideoOsd.prototype.pause.call(osd);}};
    const context = {window, console: {log: no}, currentViewLoadRequest: null, firstConnectionResult: null, isDummyBackToHome: false,
        _viewmanager: {default: {tryRestoreView(request) {views.push(request); return Promise.resolve();}}},
        baseRoute: '', AbortController, _connectionmanager: {default: {currentApiClient: () => ({isLoggedIn: () => true})}},
        _servicelocator: {appHost: {supports: () => false}}, getCurrentRouteInfo: () => null, _loading: {default: {hide: no}},
        _layoutmanager: {default: {tv: false}}, _skinmanager: {default: {loadUserSkin: no}},
        loadContentUrl(ctx, request) {views.push(request); return Promise.resolve();},
        getViewEventDetail: () => ({detail: {}}), CustomEvent: class {constructor(type, options) {this.type = type; Object.assign(this, options);}},
        appRouter: {}, resolveOnNextShow: null, baseUrl: () => '', getHomeRoute: () => '/home'};
    let page;
    const history = {back(...args) {calls.push(['history.back', args]);}, forward: no, pushState: no, replaceState: no};
    vm.runInNewContext(read('modules/pagejs/page.js'), {define(_deps, factory) {const out = {}; factory(out, {default: {addEventListener: no}}); page = out.default;},
        window, document: {readyState: 'complete', title: ''}, history, location: {pathname: '/initial', hash: '', search: ''}});
    context._page = {default: page};
    vm.runInNewContext('var eteRouteEpoch=0;\n' + ['function initRoute(ctx, route, routeEpoch)', 'function handleRoute(ctx, route)', 'function show(path, options)',
        'appRouter.back = function ()', 'appRouter.goHome = function ()'].map(p => extractFunction(routerSource, p)).join(';\n') + ';\n' +
        ['function onBeforeChange(', 'function dispatchViewEvent('].map(p => extractFunction(viewSource, p)).join('\n'), context);
    page('/home', {type: 'home'}, context.handleRoute); page('/prior', {type: 'item'}, context.handleRoute); page.start();
    const router = {};
    for (const name of ['back', 'goHome']) router[name] = (...args) => {calls.push([name, args]); return context.appRouter[name](...args);};
    const scope = {tagName: 'DIV', dispatchEvent: () => !scope.cancelled};
    let input;
    vm.runInNewContext(patch.patchInputManager(read('modules/common/inputmanager.js')), {define(_deps, factory) {
        const out = {}; factory(out, {default: {}}, {default: router}, {default: manager}, {default: {getCurrentScope: () => scope}}, {appHost: {}}, {default: {on: no}}); input = out.default;
    }, window: {...window, addEventListener: no}, document: {activeElement: scope}, self: {}, CustomEvent: context.CustomEvent});
    const api = {serverInfo: () => ({Id: 'synthetic'}), getCurrentUserId: () => 'synthetic'}, handlers = [];
    vm.runInNewContext(patch.patchInputApi(read('modules/common/input/api.js')), {define(_deps, factory) {
        factory({}, {default: {on: (target, name, fn) => handlers.push({target, name, fn}), off: no, trigger: no}},
            {default: {getApiClients: () => [api]}}, {default: {htmlEncode: v => v}}, {default: manager}, {appHost: {supports: () => false}},
            {default: {}}, {default: input}, {default: {}});
    }, console: {log: no}});
    return {records, stops, calls, views, player, osd, navigation, scope,
        input: name => input.trigger(name),
        remote(name) {handlers.find(h => h.target === api && h.name === 'message').fn.call(api, {}, {MessageType: 'GeneralCommand', Data: {Name: name, Token: 'PRIVATE_CANARY'}});},
        pop() {listeners.popstate({state: {path: '/prior'}});},
        unrelated() {page.show('/prior');},
        leave(index = views.length - 1) {context.onBeforeChange(previousView, {initComplete: true, getAttribute: no, dispatchEvent: no}, false, false, views[index]);}
    };
}

for (const remote of [true, false]) for (const command of ['back', 'home']) {
    test(`actual generated navigation ${remote ? 'remote' : 'local'} ${command}`, async () => {
        const f = fixture();
        if (remote) f.remote(command === 'back' ? 'Back' : 'GoHome'); else f.input(command);
        assert.equal(f.calls.filter(c => c[0] === (command === 'back' ? 'back' : 'goHome')).length, 1);
        assert.ok(f.calls.every(c => c[1].length === 0), 'original router/history arguments stay unchanged');
        assert.equal(f.stops.length, 0);
        if (command === 'back') {assert.equal(f.views.length, 0); f.pop();}
        await Promise.resolve(); f.leave();
        assert.equal(f.stops.length, 1);
        assert.equal(f.stops[0].control.controlOrigin, command === 'back' ? 'unknown' : remote ? 'remote-general' : 'input');
        assert.equal(f.stops[0].control.navigationAssociation, command === 'back' ? 'unknown' : 'route-context');
        assert.equal(f.records[0].details.controlOrigin, remote ? 'remote-general' : 'input');
        assert.equal(f.records[0].details.navigationCommand, command);
        assert.equal(f.records[0].details.playbackRequestId, 1);
        assert.doesNotMatch(JSON.stringify(f.records), /PRIVATE_CANARY/);
    });
}
for (const boundary of ['cancelled', 'no-pop', 'new-play', 'abort', 'unrelated', 'multiple', 'eof']) test(`navigation causal boundary: ${boundary}`, async () => {
    const f = fixture();
    if (boundary === 'cancelled') {f.scope.cancelled = true; f.remote('GoHome'); assert.equal(f.calls.length, 0); f.scope.cancelled = false;}
    else if (boundary === 'no-pop') {f.remote('Back'); assert.equal(f.views.length, 0);}
    else f.remote('GoHome');
    if (boundary === 'new-play') f.player.streamInfo = {_etePlayRequestId: 2};
    if (boundary === 'abort') f.views[0].abortController.abort();
    if (['unrelated', 'cancelled', 'no-pop'].includes(boundary)) f.unrelated();
    if (boundary === 'multiple') {f.input('home'); f.leave(0); assert.equal(f.stops[0].control.controlOrigin, 'unknown'); f.osd.enableStopOnBack = true;}
    if (boundary === 'eof') f.osd.enableStopOnBack = false;
    await Promise.resolve(); f.leave();
    if (boundary === 'eof') assert.equal(f.stops.length, 0);
    else assert.equal(f.stops.at(-1).control.controlOrigin, boundary === 'multiple' ? 'input' : 'unknown');
});

test('navigation source and finite correlation survive actual logger disk/read/export', async t => {
    const f = fixture(); f.remote('GoHome'); f.leave();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-navigation-'));
    t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
    const logger = require('../src/electronapp/enhanced/diagnostics').createLogger(dir);
    for (const record of f.records) await logger(record);
    const rows = (await logger.readRecords()).records;
    assert.equal(rows.at(-1).details.control.navigationId, rows[0].details.navigationId);
    const report = await logger.exportReport({appVersion: '0.4.18'});
    for (const value of ['remote-general', 'navigation-1', 'route-context']) assert.ok(report.includes(value));
    assert.doesNotMatch(report, /PRIVATE_CANARY/);
});
