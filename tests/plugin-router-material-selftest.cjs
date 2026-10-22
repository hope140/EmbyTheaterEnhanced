'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {patchRouter} = require('../tools/patch-plugin-settings.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');
const ROUTER_MATERIAL = path.join(REPO_ROOT, 'vendor', 'web-snapshot', 'www', 'modules', 'approuter.js');
const hasMaterial = fs.existsSync(ROUTER_MATERIAL);

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

function deferred() {
    let resolve;
    let reject;
    let markStarted;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    const started = new Promise(resolveStarted => { markStarted = resolveStarted; });
    return {promise, resolve, reject, started, markStarted};
}

function makeRouterRuntime() {
    if (!hasMaterial) throw new Error(`Missing router material: ${ROUTER_MATERIAL}`);
    const frozen = fs.readFileSync(ROUTER_MATERIAL, 'utf8');
    const patched = patchRouter(frozen);
    const handleRoute = extractFunction(patched, 'function handleRoute(ctx, route)');
    const initRoute = extractFunction(patched, 'function initRoute(ctx, route, routeEpoch)');
    const validateUserAccessToRoute = extractFunction(patched, 'function validateUserAccessToRoute(route, user, loggedInUser)');
    const epochDeclaration = 'var eteRouteEpoch = 0;';
    if (!patched.includes(epochDeclaration)) throw new Error('Patched router epoch declaration is missing');
    const moduleQueues = new Map();
    const userQueue = [];
    const toastQueue = [];
    const imports = [];
    const contentLoads = [];
    const toastMessages = [];
    let loginAttempts = 0;
    let controllerCount = 0;
    let abortCount = 0;
    const currentApiClient = {
        isLoggedIn: () => true,
        getCurrentUser() {
            const entry = userQueue.shift();
            if (entry) {
                entry.markStarted();
                return entry.promise;
            }
            return Promise.resolve({Policy: {IsAdministrator: true, EnableUserPreferenceAccess: true}});
        }
    };
    const context = {
        currentViewLoadRequest: null,
        firstConnectionResult: null,
        isDummyBackToHome: false,
        baseRoute: '',
        console: {log() {}, error() {}},
        navigator: {},
        _connectionmanager: {default: {currentApiClient: () => currentApiClient}},
        _servicelocator: {default: {appHost: {supports: () => false}}},
        _layoutmanager: {default: {tv: false}},
        _skinmanager: {default: {loadUserSkin() {}}},
        getCurrentRouteInfo: () => null,
        hasConnectedToLocalServer: () => true,
        beginConnectionWizard() { loginAttempts++; },
        Emby: {
            importModule(url) {
                imports.push(url);
                const queue = moduleQueues.get(url) || [];
                const entry = queue.shift();
                if (queue.length) moduleQueues.set(url, queue);
                else moduleQueues.delete(url);
                if (entry) {
                    entry.markStarted();
                    return entry.promise;
                }
                return Promise.resolve(function Controller() {});
            }
        },
        loadContentUrl(ctx, request, signal) {
            contentLoads.push({ctx, request, signal});
            return Promise.resolve();
        },
        AbortController: class FakeAbortController {
            constructor() {
                controllerCount++;
                this.signal = {aborted: false};
            }

            abort() {
                abortCount++;
                this.signal.aborted = true;
            }
        },
        require(ids) {
            const toast = ids.includes('toast') ? toastQueue.shift() : null;
            if (toast) {
                toast.markStarted();
                return toast.promise;
            }
            return Promise.resolve(ids.map(id => id === 'toast' ? message => toastMessages.push(message) : {}));
        },
        _loading: {default: {hide() {}}}
    };
    const script = `${epochDeclaration}\n${validateUserAccessToRoute}\n${initRoute}\n${handleRoute}`;
    vm.runInNewContext(script, context, {filename: ROUTER_MATERIAL});

    return {
        context,
        currentApiClient,
        contentLoads,
        imports,
        toastMessages,
        deferUser() {
            const gate = deferred();
            userQueue.push(gate);
            return gate;
        },
        deferModule(url) {
            const gate = deferred();
            const queue = moduleQueues.get(url) || [];
            queue.push(gate);
            moduleQueues.set(url, queue);
            return gate;
        },
        deferToast() {
            const gate = deferred();
            toastQueue.push(gate);
            return gate;
        },
        handle(ctx, route) {
            return context.handleRoute(ctx, route);
        },
        snapshot() {
            return {
                currentRequest: context.currentViewLoadRequest,
                loginAttempts,
                controllerCount,
                abortCount
            };
        }
    };
}

function context(pathname, path) {
    return {pathname, path, isBack: false, state: {}, querystring: ''};
}

function moduleRoute(name, extra = {}) {
    return {
        path: `/${name}`,
        type: name,
        controller: `controllers/${name}.js`,
        controllerType: 'module',
        ...extra
    };
}

async function flush() {
    await new Promise(resolve => setImmediate(resolve));
}

test('router material exists in source checkouts that include frozen vendor', {skip: !hasMaterial}, () => {
    assert.equal(fs.existsSync(ROUTER_MATERIAL), true);
});

test('stale generic permission rejection cannot open login or create another route request', {skip: !hasMaterial}, async () => {
    const runtime = makeRouterRuntime();
    const permission = runtime.deferUser();
    runtime.handle(context('/genericui', '/genericui'), moduleRoute('genericui', {roles: 'admin', type: 'genericui'}));
    await permission.started;

    runtime.handle(context('/home', '/home'), {path: '/home', type: 'home'});
    await flush();
    const currentRequest = runtime.snapshot().currentRequest;
    const before = runtime.snapshot();
    permission.reject(new Error('synthetic denied permission details'));
    await flush();

    const after = runtime.snapshot();
    assert.equal(after.loginAttempts, 0);
    assert.equal(after.controllerCount, before.controllerCount);
    assert.equal(after.currentRequest, currentRequest);
    assert.equal(after.abortCount, before.abortCount);
    assert.equal(runtime.contentLoads.length, 1);
    assert.equal(runtime.contentLoads[0].request.route.type, 'home');
});

test('late generic controller resolution cannot replace a newer ordinary route request', {skip: !hasMaterial}, async () => {
    const runtime = makeRouterRuntime();
    const controller = runtime.deferModule('./controllers/genericui.js');
    runtime.handle(context('/genericui', '/genericui'), moduleRoute('genericui', {type: 'genericui'}));
    await controller.started;

    runtime.handle(context('/home', '/home'), {path: '/home', type: 'home'});
    await flush();
    const currentRequest = runtime.snapshot().currentRequest;
    const before = runtime.snapshot();
    controller.resolve(function StaleGenericController() {});
    await flush();

    const after = runtime.snapshot();
    assert.equal(runtime.contentLoads.length, 1);
    assert.equal(runtime.contentLoads[0].request.route.type, 'home');
    assert.equal(after.currentRequest, currentRequest);
    assert.equal(after.controllerCount, before.controllerCount);
    assert.equal(after.abortCount, before.abortCount);
    assert.equal(after.loginAttempts, 0);
});

test('late ordinary controller resolution cannot abort or replace a newer generic route request', {skip: !hasMaterial}, async () => {
    const runtime = makeRouterRuntime();
    const controller = runtime.deferModule('./controllers/home.js');
    runtime.handle(context('/home', '/home'), moduleRoute('home'));
    await controller.started;

    runtime.handle(context('/genericui', '/genericui'), moduleRoute('genericui', {roles: 'admin', type: 'genericui'}));
    await flush();
    const currentRequest = runtime.snapshot().currentRequest;
    const before = runtime.snapshot();
    assert.equal(runtime.contentLoads.length, 1);
    assert.equal(runtime.contentLoads[0].request.route.type, 'genericui');

    controller.resolve(function StaleHomeController() {});
    await flush();
    const after = runtime.snapshot();
    assert.equal(runtime.contentLoads.length, 1);
    assert.equal(after.currentRequest, currentRequest);
    assert.equal(after.controllerCount, before.controllerCount);
    assert.equal(after.abortCount, before.abortCount);
    assert.equal(after.loginAttempts, 0);
});

test('latest generic controller failure shows only static text', {skip: !hasMaterial}, async () => {
    const runtime = makeRouterRuntime();
    const controller = runtime.deferModule('./controllers/genericui.js');
    runtime.handle(context('/genericui', '/genericui'), moduleRoute('genericui', {roles: 'admin', type: 'genericui'}));
    await controller.started;
    controller.reject(new Error('api_key=synthetic https://private.invalid Cookie=synthetic password=synthetic'));
    await flush();

    assert.deepEqual(runtime.toastMessages, ['Plugin page could not be loaded.']);
    assert.equal(runtime.snapshot().loginAttempts, 0);
    assert.equal(runtime.snapshot().controllerCount, 0);
    assert.equal(runtime.contentLoads.length, 0);
});

for (const newerRoute of [
    {name: 'ordinary', context: context('/home', '/home'), route: {path: '/home', type: 'home'}},
    {name: 'genericui', context: context('/generic-next', '/generic-next'), route: moduleRoute('genericui', {path: '/generic-next', type: 'genericui'})}
]) {
    test(`late generic failure toast is suppressed after a newer ${newerRoute.name} route completes`, {skip: !hasMaterial}, async () => {
        const runtime = makeRouterRuntime();
        const controller = runtime.deferModule('./controllers/genericui.js');
        const lateToast = runtime.deferToast();
        runtime.handle(context('/genericui', '/genericui'), moduleRoute('genericui', {type: 'genericui'}));
        await controller.started;
        controller.reject(new Error('synthetic generic failure'));
        await lateToast.started;

        runtime.handle(newerRoute.context, newerRoute.route);
        await flush();
        assert.equal(runtime.contentLoads.at(-1).request.route.type, newerRoute.route.type);

        lateToast.resolve([message => runtime.toastMessages.push(message)]);
        await flush();
        assert.deepEqual(runtime.toastMessages, []);
        assert.equal(runtime.snapshot().loginAttempts, 0);
    });
}
