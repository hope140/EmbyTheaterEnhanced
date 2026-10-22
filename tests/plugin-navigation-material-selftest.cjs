'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
    FROZEN_VIEW_MANAGER,
    makeRuntime,
    loadPatchTransform
} = require('./helpers/plugin-dom.cjs');

const patchTransform = loadPatchTransform();

function registerBasicControllers(runtime, names) {
    for (const name of names) runtime.registerController(`controller:${name}`, class Controller {});
}

function pluginOptions(runtime, name, options = {}) {
    return {
        url: `/${name}`,
        view: runtime.page(name, {
            dependencies: options.dependencies || '',
            controller: options.controller || `controller:${name}`,
            classes: options.classes || ''
        }),
        isPluginPage: true,
        type: options.type || 'plugin',
        windowScroll: options.windowScroll
    };
}

async function load(runtime, name, options) {
    return runtime.manager.loadView(pluginOptions(runtime, name, options), options && options.signal);
}

function ordinaryOptions(runtime, name, options = {}) {
    return {
        url: `/${name}`,
        view: runtime.page(name, {
            dependencies: options.dependencies || '',
            controller: options.controller || `controller:${name}`
        }),
        type: options.type || 'home'
    };
}

function countEvent(element, eventName) {
    let count = 0;
    const dispatchEvent = element.dispatchEvent.bind(element);
    element.dispatchEvent = event => {
        if (event.type === eventName) count++;
        return dispatchEvent(event);
    };
    return () => count;
}

async function startFirstPage(runtime, name = 'A') {
    registerBasicControllers(runtime, [name]);
    await load(runtime, name);
}

function visibleNames(runtime) {
    return runtime.visiblePages().map(page => page.getAttribute('data-name'));
}

async function assertPluginPageError(promise, stage) {
    const error = await promise.then(
        () => assert.fail('expected plugin navigation to reject'),
        rejection => rejection
    );
    assert.equal(error && error.name, 'PluginPageError');
    assert.equal(error.stage, stage);
    assert.equal(error.message, `Plugin page could not be loaded (${stage}).`);
    assert.equal(Object.hasOwn(error, 'cause'), false);
    return error;
}

async function assertStaticAbortError(promise) {
    const error = await promise.then(
        () => assert.fail('expected plugin navigation to reject'),
        rejection => rejection
    );
    assert.equal(error && error.name, 'AbortError');
    assert.equal(error.message, 'Plugin navigation cancelled');
    assert.equal(Object.hasOwn(error, 'cause'), false);
    return error;
}

async function flushToastQueue() {
    await new Promise(resolve => setImmediate(resolve));
}

function makeCandidateRuntime() {
    return makeRuntime({transform: patchTransform});
}

test('navigation material is the validated independent Web snapshot', () => {
    const snapshot = require('../tools/web-snapshot-input.cjs');
    assert.equal(snapshot.validate(require('node:path').resolve(__dirname, '..')).status, 'passed');
    assert.equal(fs.existsSync(FROZEN_VIEW_MANAGER), true);
});

test('frozen RED: controller reject leaves the new plugin page beside the current page', async () => {
    const runtime = makeRuntime();
    await startFirstPage(runtime, 'A');
    const missingController = runtime.deferNext('controller:B');
    const navigation = load(runtime, 'B');
    missingController.reject(new Error('controller module 404'));

    await assert.rejects(navigation, /controller module 404/);
    assert.equal(runtime.currentName(), 'A');
    assert.deepEqual(visibleNames(runtime), ['A', 'B']);
});

test('frozen RED: an aborted dependency load can replace a later successful plugin page', async () => {
    const runtime = makeRuntime();
    registerBasicControllers(runtime, ['A', 'B']);
    const gate = runtime.deferNext('delayed-dependency');
    const controller = new AbortController();
    const oldNavigation = runtime.manager.loadView(
        pluginOptions(runtime, 'A', {dependencies: 'delayed-dependency'}),
        controller.signal
    );

    await gate.started;
    await load(runtime, 'B');
    controller.abort();
    gate.resolve({});
    await oldNavigation;

    assert.equal(runtime.currentName(), 'A');
    assert.deepEqual(visibleNames(runtime), ['A']);
});

test('candidate GREEN: dependency rejection leaves the current page intact', async () => {
    const runtime = makeCandidateRuntime();
    await startFirstPage(runtime, 'A');
    const failedDependency = runtime.deferNext('broken-dependency');
    const navigation = load(runtime, 'B', {dependencies: 'broken-dependency'});
    failedDependency.reject(new Error('dependency 404'));

    await assertPluginPageError(navigation, 'dependencies');
    assert.equal(runtime.currentName(), 'A');
    assert.deepEqual(visibleNames(runtime), ['A']);
});

test('candidate GREEN: failed plugin dependencies expose only static errors and toasts', async () => {
    const runtime = makeCandidateRuntime();
    await startFirstPage(runtime, 'A');
    const rejected = runtime.deferNext('sensitive-dependency');
    const navigation = load(runtime, 'B', {dependencies: 'sensitive-dependency'});
    await rejected.started;
    const rawMessage = 'api_key=synthetic-key https://private.invalid/path?token=synthetic Cookie=synthetic-cookie password=synthetic-password';
    rejected.reject(new Error(rawMessage));

    const error = await assertPluginPageError(navigation, 'dependencies');
    await flushToastQueue();
    for (const secret of ['synthetic-key', 'private.invalid', 'synthetic-cookie', 'synthetic-password']) {
        assert.equal(error.message.includes(secret), false);
        assert.equal(JSON.stringify(error).includes(secret), false);
        assert.equal(runtime.toastMessages.join('\n').includes(secret), false);
    }
    assert.deepEqual(runtime.toastMessages, ['Plugin page could not be loaded.']);
    assert.equal(runtime.currentName(), 'A');
    assert.deepEqual(visibleNames(runtime), ['A']);
});

test('candidate GREEN: a failed plugin toast is suppressed after a newer page succeeds', async () => {
    const runtime = makeCandidateRuntime();
    await startFirstPage(runtime, 'home');
    registerBasicControllers(runtime, ['B']);
    const failedDependency = runtime.deferNext('broken-A-dependency');
    const lateToast = runtime.deferNext('toast');
    const navigation = load(runtime, 'A', {dependencies: 'broken-A-dependency'});
    await failedDependency.started;
    failedDependency.reject(new Error('A failed'));
    await assertPluginPageError(navigation, 'dependencies');
    await lateToast.started;

    await load(runtime, 'B');
    lateToast.resolve(message => runtime.toastMessages.push(message));
    await flushToastQueue();

    assert.equal(runtime.currentName(), 'B');
    assert.deepEqual(runtime.toastMessages, []);
});

test('candidate GREEN: an aborted failed plugin toast is suppressed without a newer navigation', async () => {
    const runtime = makeCandidateRuntime();
    await startFirstPage(runtime, 'A');
    const controller = new AbortController();
    const failedDependency = runtime.deferNext('broken-B-dependency');
    const lateToast = runtime.deferNext('toast');
    const navigation = runtime.manager.loadView(
        pluginOptions(runtime, 'B', {dependencies: 'broken-B-dependency'}),
        controller.signal
    );
    await failedDependency.started;
    failedDependency.reject(new Error('B failed'));
    await assertPluginPageError(navigation, 'dependencies');
    await lateToast.started;

    controller.abort();
    lateToast.resolve(message => runtime.toastMessages.push(message));
    await flushToastQueue();

    assert.equal(runtime.currentName(), 'A');
    assert.deepEqual(runtime.toastMessages, []);
});

test('candidate GREEN: null and string rejections become static errors with accurate stages', async () => {
    const runtime = makeCandidateRuntime();
    await startFirstPage(runtime, 'A');
    const nullGate = runtime.deferNext('null-dependency');
    const nullNavigation = load(runtime, 'B', {dependencies: 'null-dependency'});
    await nullGate.started;
    nullGate.reject(null);
    await assertPluginPageError(nullNavigation, 'dependencies');

    const stringGate = runtime.deferNext('controller:B');
    const stringNavigation = load(runtime, 'B');
    await stringGate.started;
    stringGate.reject('Cookie=synthetic; password=synthetic');
    const error = await assertPluginPageError(stringNavigation, 'controller');
    assert.equal(error.message.includes('synthetic'), false);
    await flushToastQueue();
    assert.deepEqual(runtime.toastMessages, ['Plugin page could not be loaded.', 'Plugin page could not be loaded.']);
    assert.deepEqual(visibleNames(runtime), ['A']);
});

test('candidate GREEN: first-page failure leaves no staged or visible page behind', async () => {
    const runtime = makeCandidateRuntime();
    const missingController = runtime.deferNext('controller:first');
    const navigation = runtime.manager.loadView(pluginOptions(runtime, 'first', {controller: 'controller:first'}));
    await missingController.started;
    missingController.reject(new Error('synthetic first page failure'));

    await assertPluginPageError(navigation, 'controller');
    assert.equal(runtime.manager.currentView(), null);
    assert.deepEqual(runtime.visiblePages(), []);
    assert.deepEqual(runtime.document.main.children, []);
});

test('candidate GREEN: controller 404 removes only its failed plugin stage', async () => {
    const runtime = makeCandidateRuntime();
    await startFirstPage(runtime, 'A');
    const missingController = runtime.deferNext('controller:B');
    const navigation = load(runtime, 'B');
    missingController.reject(new Error('controller module 404'));

    await assertPluginPageError(navigation, 'controller');
    assert.equal(runtime.currentName(), 'A');
    assert.deepEqual(visibleNames(runtime), ['A']);
});

test('candidate GREEN: a throwing controller constructor cleans its stage and remains retryable', async () => {
    const runtime = makeCandidateRuntime();
    await startFirstPage(runtime, 'A');
    runtime.registerController('controller:B', class BrokenController {
        constructor() {
            throw new Error('constructor failed');
        }
    });

    await assertPluginPageError(load(runtime, 'B'), 'initialize');
    assert.equal(runtime.currentName(), 'A');
    assert.deepEqual(visibleNames(runtime), ['A']);

    registerBasicControllers(runtime, ['B']);
    await load(runtime, 'B');
    assert.equal(runtime.currentName(), 'B');
    assert.deepEqual(visibleNames(runtime), ['B']);
});

test('candidate GREEN: A-B-C navigation keeps a single visible page', async () => {
    const runtime = makeCandidateRuntime();
    registerBasicControllers(runtime, ['A', 'B', 'C']);

    await load(runtime, 'A');
    await load(runtime, 'B');
    await load(runtime, 'C');

    assert.equal(runtime.currentName(), 'C');
    assert.deepEqual(visibleNames(runtime), ['C']);
});

test('candidate GREEN: back restore reveals the cached page and hides the page being left', async () => {
    const runtime = makeCandidateRuntime();
    registerBasicControllers(runtime, ['A', 'B']);
    await load(runtime, 'A');
    await load(runtime, 'B');

    await runtime.manager.tryRestoreView({url: '/A', isBack: true});
    assert.equal(runtime.currentName(), 'A');
    assert.deepEqual(visibleNames(runtime), ['A']);
});

test('candidate GREEN: failed restore keeps the current page and cached target retryable', async () => {
    const runtime = makeCandidateRuntime();
    registerBasicControllers(runtime, ['A', 'B']);
    await load(runtime, 'A');
    const cachedA = runtime.manager.currentView();
    await load(runtime, 'B');

    cachedA.controller = null;
    cachedA.initComplete = false;
    const missingController = runtime.deferNext('controller:A');
    const failedModuleLoad = runtime.manager.tryRestoreView({url: '/A', isBack: true});
    missingController.reject(new Error('restore controller 404'));
    await assertPluginPageError(failedModuleLoad, 'controller');
    assert.equal(runtime.currentName(), 'B');
    assert.deepEqual(visibleNames(runtime), ['B']);

    runtime.registerController('controller:A', class BrokenController {
        constructor() {
            throw new Error('restore constructor failed');
        }
    });
    await assertPluginPageError(runtime.manager.tryRestoreView({url: '/A', isBack: true}), 'initialize');
    assert.equal(runtime.currentName(), 'B');
    assert.equal(runtime.document.contains(cachedA), true);
    assert.deepEqual(visibleNames(runtime), ['B']);

    registerBasicControllers(runtime, ['A']);
    await runtime.manager.tryRestoreView({url: '/A', isBack: true});
    assert.equal(runtime.currentName(), 'A');
    assert.deepEqual(visibleNames(runtime), ['A']);
});

test('candidate GREEN: cancelling an in-flight restore preserves the current page and cached target', async () => {
    const runtime = makeCandidateRuntime();
    registerBasicControllers(runtime, ['A', 'B']);
    await load(runtime, 'A');
    const cachedA = runtime.manager.currentView();
    await load(runtime, 'B');
    cachedA.controller = null;
    cachedA.initComplete = false;

    const lateController = runtime.deferNext('controller:A');
    const controller = new AbortController();
    const restore = runtime.manager.tryRestoreView({url: '/A', isBack: true}, controller.signal);
    await lateController.started;
    controller.abort();
    lateController.resolve(class Controller {});

    await assertStaticAbortError(restore);
    assert.equal(runtime.currentName(), 'B');
    assert.equal(runtime.document.contains(cachedA), true);
    assert.deepEqual(visibleNames(runtime), ['B']);

    registerBasicControllers(runtime, ['A']);
    await runtime.manager.tryRestoreView({url: '/A', isBack: true});
    assert.equal(runtime.currentName(), 'A');
    assert.deepEqual(visibleNames(runtime), ['A']);
});

test('candidate GREEN: abort before dependency resolution rejects without mutating the current page', async () => {
    const runtime = makeCandidateRuntime();
    await startFirstPage(runtime, 'A');
    const gate = runtime.deferNext('slow-dependency');
    const controller = new AbortController();
    const navigation = runtime.manager.loadView(
        pluginOptions(runtime, 'B', {dependencies: 'slow-dependency'}),
        controller.signal
    );

    await gate.started;
    controller.abort();
    gate.resolve({});
    await assertStaticAbortError(navigation);
    assert.equal(runtime.currentName(), 'A');
    assert.deepEqual(visibleNames(runtime), ['A']);
});

test('candidate GREEN: late controller resolution cannot replace a newer successful page', async () => {
    const runtime = makeCandidateRuntime();
    registerBasicControllers(runtime, ['B']);
    const lateController = runtime.deferNext('controller:A');
    const controller = new AbortController();
    const oldNavigation = runtime.manager.loadView(pluginOptions(runtime, 'A'), controller.signal);

    await lateController.started;
    await load(runtime, 'B');
    controller.abort();
    lateController.resolve(class Controller {});

    const oldResult = await Promise.allSettled([oldNavigation]);
    assert.equal(oldResult[0].status, 'rejected');
    assert.equal(oldResult[0].reason.name, 'AbortError');
    assert.equal(oldResult[0].reason.message, 'Plugin navigation cancelled');
    assert.equal(Object.hasOwn(oldResult[0].reason, 'cause'), false);
    assert.equal(runtime.currentName(), 'B');
    assert.deepEqual(visibleNames(runtime), ['B']);
});

test('candidate GREEN: repeat navigation and stage destruction preserve the active page', async () => {
    const runtime = makeCandidateRuntime();
    registerBasicControllers(runtime, ['A', 'B']);
    await load(runtime, 'A');

    const controllerGate = runtime.deferNext('controller:B');
    const failedNavigation = load(runtime, 'B');
    controllerGate.reject(new Error('temporary failure'));
    await assertPluginPageError(failedNavigation, 'controller');
    assert.equal(runtime.document.contains(runtime.manager.currentView()), true);
    assert.equal(runtime.currentName(), 'A');
    assert.deepEqual(visibleNames(runtime), ['A']);

    await load(runtime, 'B');
    assert.equal(runtime.currentName(), 'B');
    assert.deepEqual(visibleNames(runtime), ['B']);
});

test('candidate GREEN: genericui takes the plugin transaction path while ordinary routes remain outside it', async () => {
    const runtime = makeCandidateRuntime();
    registerBasicControllers(runtime, ['generic', 'ordinary']);
    const genericOptions = pluginOptions(runtime, 'generic', {type: 'genericui'});
    await runtime.manager.loadView(genericOptions);
    assert.equal(runtime.currentName(), 'generic');

    const ordinary = {
        url: '/ordinary',
        view: runtime.page('ordinary'),
        type: 'home'
    };
    await runtime.manager.loadView(ordinary);
    assert.equal(runtime.currentName(), 'ordinary');
    assert.deepEqual(visibleNames(runtime), ['ordinary']);
});

test('candidate GREEN: script-bearing page loads jQuery and appends its hidden stage through the script path', async () => {
    const runtime = makeCandidateRuntime();
    await startFirstPage(runtime, 'A');
    const controllerGate = runtime.deferNext('controller:inline');
    const options = {
        url: '/inline',
        isPluginPage: true,
        type: 'plugin',
        view: '<div class="view" data-name="inline" data-controller="controller:inline"><script>$(".view");</script></div>'
    };
    const navigation = runtime.manager.loadView(options);
    await controllerGate.started;

    assert.equal(runtime.requireCalls.some(ids => ids.includes('jQuery')), true);
    assert.equal(runtime.jqueryStats.appendCalls, 1);
    assert.equal(runtime.jqueryStats.scriptAppendCalls, 1);
    assert.deepEqual(runtime.jqueryStats.hiddenOnAppend, [true]);
    assert.deepEqual(visibleNames(runtime), ['A']);
    assert.equal(runtime.document.main.children.some(page => page.getAttribute('data-name') === 'inline' && page.classList.contains('hide')), true);

    controllerGate.resolve(class Controller {});
    await navigation;
    assert.equal(runtime.currentName(), 'inline');
    assert.deepEqual(visibleNames(runtime), ['inline']);
});

test('candidate GREEN: an initially aborted plugin request never inserts a stage', async () => {
    const runtime = makeCandidateRuntime();
    await startFirstPage(runtime, 'A');
    const controller = new AbortController();
    controller.abort();

    await assertStaticAbortError(load(runtime, 'B', {signal: controller.signal}));
    assert.equal(runtime.document.main.children.length, 1);
    assert.equal(runtime.currentName(), 'A');
    assert.deepEqual(visibleNames(runtime), ['A']);
});

test('candidate GREEN: navigation started synchronously by a controller constructor supersedes its stage', async () => {
    const runtime = makeCandidateRuntime();
    let reentrantNavigation;
    runtime.registerController('controller:B', class Controller {});
    runtime.registerController('controller:A', class ReentrantController {
        constructor() {
            reentrantNavigation = runtime.manager.loadView(pluginOptions(runtime, 'B'));
        }
    });

    const firstNavigation = load(runtime, 'A');
    await assertStaticAbortError(firstNavigation);
    await reentrantNavigation;
    assert.equal(runtime.currentName(), 'B');
    assert.deepEqual(visibleNames(runtime), ['B']);
});

test('candidate GREEN: A-B-C-D rotates the three-page cache and destroys evicted A once', async () => {
    const runtime = makeCandidateRuntime();
    registerBasicControllers(runtime, ['A', 'B', 'C', 'D']);
    await load(runtime, 'A');
    const pageA = runtime.manager.currentView();
    let destroyCount = 0;
    const dispatchEvent = pageA.dispatchEvent.bind(pageA);
    pageA.dispatchEvent = event => {
        if (event.type === 'viewdestroy') destroyCount++;
        return dispatchEvent(event);
    };
    await load(runtime, 'B');
    await load(runtime, 'C');
    await load(runtime, 'D');

    assert.equal(destroyCount, 1);
    assert.equal(pageA.parentNode, null);
    assert.equal(runtime.document.main.children.length, 3);
    assert.equal(runtime.currentName(), 'D');
    assert.deepEqual(visibleNames(runtime), ['D']);
});

test('candidate GREEN: ordinary page controller rejection retains the frozen failure behavior', async () => {
    const runtime = makeCandidateRuntime();
    runtime.registerController('controller:ordinary-A', class Controller {});
    await runtime.manager.loadView({
        url: '/ordinary-A',
        view: runtime.page('ordinary-A', {controller: 'controller:ordinary-A'}),
        type: 'home'
    });

    const missingController = runtime.deferNext('controller:ordinary-B');
    const navigation = runtime.manager.loadView({
        url: '/ordinary-B',
        view: runtime.page('ordinary-B', {controller: 'controller:ordinary-B'}),
        type: 'home'
    });
    await missingController.started;
    missingController.reject(new Error('ordinary controller 404'));

    await assert.rejects(navigation, /ordinary controller 404/);
    assert.equal(runtime.currentName(), 'ordinary-A');
    assert.deepEqual(visibleNames(runtime), ['ordinary-A', 'ordinary-B']);
});

test('candidate GREEN: an ordinary dependency response arriving after a plugin commit cannot insert an old page', async () => {
    const runtime = makeCandidateRuntime();
    runtime.registerController('controller:ordinary-A', class Controller {});
    await runtime.manager.loadView(ordinaryOptions(runtime, 'ordinary-A'));

    const oldDependency = runtime.deferNext('ordinary-old-dependency');
    const oldNavigation = runtime.manager.loadView(ordinaryOptions(runtime, 'ordinary-old', {dependencies: 'ordinary-old-dependency'}));
    await oldDependency.started;

    registerBasicControllers(runtime, ['new-plugin']);
    await load(runtime, 'new-plugin');
    const currentPage = runtime.manager.currentView();
    const destroyCurrent = countEvent(currentPage, 'viewdestroy');
    const showCurrent = countEvent(currentPage, 'viewshow');
    oldDependency.resolve({});

    await assertStaticAbortError(oldNavigation);
    assert.equal(runtime.manager.currentView(), currentPage);
    assert.equal(runtime.currentInfo().url, '/new-plugin');
    assert.equal(runtime.findPage('ordinary-old'), null);
    assert.equal(destroyCurrent(), 0);
    assert.equal(showCurrent(), 0);
    assert.deepEqual(visibleNames(runtime), ['new-plugin']);
});

test('candidate GREEN: an ordinary controller response after a plugin commit cleans only its owned page', async () => {
    const runtime = makeCandidateRuntime();
    runtime.registerController('controller:ordinary-A', class Controller {});
    await runtime.manager.loadView(ordinaryOptions(runtime, 'ordinary-A'));

    const oldController = runtime.deferNext('controller:ordinary-old');
    const oldNavigation = runtime.manager.loadView(ordinaryOptions(runtime, 'ordinary-old'));
    await oldController.started;
    const oldPage = runtime.findPage('ordinary-old');
    assert.ok(oldPage);
    const destroyOld = countEvent(oldPage, 'viewdestroy');
    const showOld = countEvent(oldPage, 'viewshow');

    registerBasicControllers(runtime, ['new-plugin']);
    await load(runtime, 'new-plugin');
    const currentPage = runtime.manager.currentView();
    const destroyCurrent = countEvent(currentPage, 'viewdestroy');
    const showCurrent = countEvent(currentPage, 'viewshow');
    assert.equal(oldPage.parentNode, null);
    assert.equal(destroyOld(), 1);

    oldController.resolve(class OldController {});
    await assertStaticAbortError(oldNavigation);
    assert.equal(runtime.manager.currentView(), currentPage);
    assert.equal(runtime.currentInfo().url, '/new-plugin');
    assert.equal(destroyOld(), 1);
    assert.equal(showOld(), 0);
    assert.equal(destroyCurrent(), 0);
    assert.equal(showCurrent(), 0);
    assert.deepEqual(visibleNames(runtime), ['new-plugin']);
});

test('candidate GREEN: an older ordinary transition completion cannot emit viewshow after a plugin commit', async () => {
    const runtime = makeCandidateRuntime();
    runtime.registerController('controller:ordinary-A', class Controller {});
    await runtime.manager.loadView(ordinaryOptions(runtime, 'ordinary-A'));

    let resolveTransition;
    const transitionPromise = new Promise(resolve => { resolveTransition = resolve; });
    let markConstructed;
    const constructed = new Promise(resolve => { markConstructed = resolve; });
    runtime.registerController('controller:ordinary-old', class DelayedTransitionController {
        constructor() {
            this.transitionPromise = transitionPromise;
            markConstructed();
        }
    });
    const oldNavigation = runtime.manager.loadView(ordinaryOptions(runtime, 'ordinary-old'));
    await constructed;
    await new Promise(resolve => setImmediate(resolve));
    const oldPage = runtime.findPage('ordinary-old');
    assert.ok(oldPage);
    const showOld = countEvent(oldPage, 'viewshow');

    registerBasicControllers(runtime, ['new-plugin']);
    await load(runtime, 'new-plugin');
    const currentPage = runtime.manager.currentView();
    const destroyCurrent = countEvent(currentPage, 'viewdestroy');
    const showCurrent = countEvent(currentPage, 'viewshow');
    assert.equal(runtime.currentInfo().url, '/new-plugin');

    resolveTransition();
    await assertStaticAbortError(oldNavigation);
    assert.equal(runtime.manager.currentView(), currentPage);
    assert.equal(runtime.currentInfo().url, '/new-plugin');
    assert.equal(showOld(), 0);
    assert.equal(destroyCurrent(), 0);
    assert.equal(showCurrent(), 0);
    assert.deepEqual(visibleNames(runtime), ['new-plugin']);
});

test('candidate GREEN: an ordinary restore resolving after a plugin commit cannot revive or destroy either page', async () => {
    const runtime = makeCandidateRuntime();
    registerBasicControllers(runtime, ['ordinary-A', 'ordinary-B']);
    await runtime.manager.loadView(ordinaryOptions(runtime, 'ordinary-A'));
    const cachedA = runtime.manager.currentView();
    await runtime.manager.loadView(ordinaryOptions(runtime, 'ordinary-B'));
    const showCachedA = countEvent(cachedA, 'viewshow');

    const oldController = runtime.deferNext('controller:ordinary-A');
    const oldRestore = runtime.manager.tryRestoreView({url: '/ordinary-A', isBack: true});
    await oldController.started;
    registerBasicControllers(runtime, ['new-plugin']);
    await load(runtime, 'new-plugin');
    const currentPage = runtime.manager.currentView();
    const destroyCurrent = countEvent(currentPage, 'viewdestroy');
    const showCurrent = countEvent(currentPage, 'viewshow');

    oldController.resolve(class RestoredController {});
    await assertStaticAbortError(oldRestore);
    assert.equal(runtime.manager.currentView(), currentPage);
    assert.equal(runtime.currentInfo().url, '/new-plugin');
    assert.equal(runtime.document.contains(cachedA), true);
    assert.equal(showCachedA(), 0);
    assert.equal(destroyCurrent(), 0);
    assert.equal(showCurrent(), 0);
    assert.deepEqual(visibleNames(runtime), ['new-plugin']);
});

test('candidate GREEN: a failed plugin load does not invalidate the current ordinary transition owner', async () => {
    const runtime = makeCandidateRuntime();
    runtime.registerController('controller:ordinary-A', class Controller {});
    await runtime.manager.loadView(ordinaryOptions(runtime, 'ordinary-A'));

    let resolveTransition;
    const transitionPromise = new Promise(resolve => { resolveTransition = resolve; });
    let markConstructed;
    const constructed = new Promise(resolve => { markConstructed = resolve; });
    runtime.registerController('controller:ordinary-B', class DelayedTransitionController {
        constructor() {
            this.transitionPromise = transitionPromise;
            markConstructed();
        }
    });
    const ordinaryNavigation = runtime.manager.loadView(ordinaryOptions(runtime, 'ordinary-B'));
    await constructed;
    await new Promise(resolve => setImmediate(resolve));
    const currentOwner = runtime.findPage('ordinary-B');
    const showOwner = countEvent(currentOwner, 'viewshow');
    assert.equal(runtime.currentInfo().url, '/ordinary-B');

    const failedDependency = runtime.deferNext('failed-plugin-dependency');
    const pluginNavigation = load(runtime, 'failed-plugin', {dependencies: 'failed-plugin-dependency'});
    await failedDependency.started;
    failedDependency.reject(new Error('synthetic plugin dependency failure'));
    await assertPluginPageError(pluginNavigation, 'dependencies');

    resolveTransition();
    await ordinaryNavigation;
    assert.equal(runtime.manager.currentView(), currentOwner);
    assert.equal(runtime.currentInfo().url, '/ordinary-B');
    assert.equal(showOwner(), 1);
    assert.deepEqual(visibleNames(runtime), ['ordinary-B']);
});

test('candidate GREEN: reentrant plugin failure during plugin beforeShow resumes the current A page', async () => {
    await assertReentrantPluginFailure('plugin');
});

test('candidate GREEN: reentrant plugin failure during ordinary beforeShow resumes the current A page', async () => {
    await assertReentrantPluginFailure('ordinary');
});

async function assertReentrantPluginFailure(bKind) {
    const runtime = makeCandidateRuntime();
    runtime.registerController('controller:A', class Controller {});
    await runtime.manager.loadView(ordinaryOptions(runtime, 'A'));
    const currentA = runtime.manager.currentView();
    const showA = countEvent(currentA, 'viewshow');
    const bController = runtime.deferNext('controller:B');
    const cDependency = runtime.deferNext('reentrant-C-dependency');
    let cNavigation;
    const bOptions = bKind === 'plugin' ? pluginOptions(runtime, 'B') : ordinaryOptions(runtime, 'B');
    const bNavigation = runtime.manager.loadView(bOptions);
    await bController.started;
    const pageB = runtime.findPage('B');
    assert.ok(pageB);
    const destroyB = countEvent(pageB, 'viewdestroy');
    pageB.addEventListener('viewbeforeshow', () => {
        cNavigation = runtime.manager.loadView(pluginOptions(runtime, 'C', {dependencies: 'reentrant-C-dependency'}));
    });

    bController.resolve(class Controller {});
    await assertStaticAbortError(bNavigation);
    await cDependency.started;
    cDependency.reject(new Error('synthetic reentrant C dependency failure'));
    await assertPluginPageError(cNavigation, 'dependencies');

    assert.equal(runtime.manager.currentView(), currentA);
    assert.equal(runtime.currentInfo().url, '/A');
    assert.equal(runtime.document.contains(currentA), true);
    assert.equal(runtime.document.contains(pageB), false);
    assert.equal(destroyB(), 1);
    assert.equal(showA(), 1);
    assert.deepEqual(visibleNames(runtime), ['A']);
}

test('candidate GREEN: the first successful plugin removes splash and normalizes windowScroll=3', async () => {
    const runtime = makeCandidateRuntime();
    registerBasicControllers(runtime, ['first-plugin']);
    const options = {
        url: '/first-plugin',
        view: runtime.page('first-plugin'),
        isPluginPage: true,
        type: 'plugin',
        windowScroll: 3
    };
    assert.equal(runtime.document.splash.parentNode, runtime.document.body);
    await runtime.manager.loadView(options);

    const page = runtime.manager.currentView();
    assert.equal(runtime.document.splash.parentNode, null);
    assert.equal(options.windowScroll, true);
    assert.equal(page.classList.contains('page-windowScroll'), true);
    assert.deepEqual(visibleNames(runtime), ['first-plugin']);
});

test('candidate GREEN: scrollFrameY keeps embedded scroll and adjusts the header for windowScroll=3', async () => {
    const runtime = makeCandidateRuntime();
    registerBasicControllers(runtime, ['embedded-scroll']);
    const options = {
        url: '/embedded-scroll',
        view: runtime.page('embedded-scroll', {classes: 'scrollFrameY'}),
        isPluginPage: true,
        type: 'plugin',
        windowScroll: 3
    };
    await runtime.manager.loadView(options);

    const page = runtime.manager.currentView();
    assert.equal(options.windowScroll, false);
    assert.equal(options.adjustHeaderForEmbeddedScroll, true);
    assert.equal(page.classList.contains('page-windowScroll'), false);
    assert.deepEqual(visibleNames(runtime), ['embedded-scroll']);
});

test('candidate GREEN: aborting an unsettled plugin dependency leaves the current page intact', async () => {
    const runtime = makeCandidateRuntime();
    await startFirstPage(runtime, 'A');
    const gate = runtime.deferNext('never-plugin-dependency');
    const controller = new AbortController();
    const navigation = load(runtime, 'B', {dependencies: 'never-plugin-dependency', signal: controller.signal});
    await gate.started;
    controller.abort();

    assert.equal(runtime.findPage('B'), null);
    assert.equal(runtime.currentInfo().url, '/A');
    assert.equal(runtime.document.contains(runtime.manager.currentView()), true);
    assert.deepEqual(visibleNames(runtime), ['A']);
    void navigation;
});

test('candidate GREEN: aborting an unsettled plugin controller immediately removes only its hidden stage', async () => {
    const runtime = makeCandidateRuntime();
    await startFirstPage(runtime, 'A');
    const gate = runtime.deferNext('controller:B');
    const controller = new AbortController();
    const navigation = load(runtime, 'B', {signal: controller.signal});
    await gate.started;
    const stage = runtime.findPage('B');
    assert.ok(stage);
    const destroyStage = countEvent(stage, 'viewdestroy');
    assert.equal(stage.classList.contains('hide'), true);
    controller.abort();

    assert.equal(stage.parentNode, null);
    assert.equal(destroyStage(), 1);
    assert.equal(runtime.currentName(), 'A');
    assert.equal(runtime.currentInfo().url, '/A');
    assert.equal(runtime.document.contains(runtime.manager.currentView()), true);
    assert.deepEqual(visibleNames(runtime), ['A']);
    void navigation;
});

test('candidate GREEN: aborting an unsettled ordinary dependency leaves no page stage', async () => {
    const runtime = makeCandidateRuntime();
    runtime.registerController('controller:A', class Controller {});
    await runtime.manager.loadView(ordinaryOptions(runtime, 'A'));
    const gate = runtime.deferNext('never-ordinary-dependency');
    const controller = new AbortController();
    const navigation = runtime.manager.loadView(ordinaryOptions(runtime, 'B', {dependencies: 'never-ordinary-dependency'}), controller.signal);
    await gate.started;
    controller.abort();

    assert.equal(runtime.findPage('B'), null);
    assert.equal(runtime.currentInfo().url, '/A');
    assert.equal(runtime.document.contains(runtime.manager.currentView()), true);
    assert.deepEqual(visibleNames(runtime), ['A']);
    void navigation;
});

test('candidate GREEN: aborting an unsettled ordinary controller immediately removes only its owned stage', async () => {
    const runtime = makeCandidateRuntime();
    runtime.registerController('controller:A', class Controller {});
    await runtime.manager.loadView(ordinaryOptions(runtime, 'A'));
    const gate = runtime.deferNext('controller:B');
    const controller = new AbortController();
    const navigation = runtime.manager.loadView(ordinaryOptions(runtime, 'B'), controller.signal);
    await gate.started;
    const stage = runtime.findPage('B');
    assert.ok(stage);
    const destroyStage = countEvent(stage, 'viewdestroy');
    controller.abort();

    assert.equal(stage.parentNode, null);
    assert.equal(destroyStage(), 1);
    assert.equal(runtime.manager.currentView().getAttribute('data-name'), 'A');
    assert.equal(runtime.currentInfo().url, '/A');
    assert.equal(runtime.document.contains(runtime.manager.currentView()), true);
    assert.deepEqual(visibleNames(runtime), ['A']);
    void navigation;
});

for (const staleEntry of ['load', 'restore']) {
    test('candidate GREEN: aborted late content ' + staleEntry + ' cannot retire the newer pending navigation', async () => {
        const runtime = makeCandidateRuntime();
        registerBasicControllers(runtime, ['A', 'B']);
        await load(runtime, 'A');
        const gate = runtime.deferNext('latest-dependency');
        const latest = load(runtime, 'B', {dependencies: 'latest-dependency'});
        await gate.started;
        const old = new AbortController(); old.abort();
        const stale = staleEntry === 'load' ? runtime.manager.loadView(pluginOptions(runtime, 'old'), old.signal) : runtime.manager.tryRestoreView({url: '/A', isBack: true}, old.signal);
        await assert.rejects(stale, {name: 'AbortError'});
        gate.resolve({}); await latest;
        assert.equal(runtime.currentName(), 'B'); assert.deepEqual(visibleNames(runtime), ['B']);
    });
}
