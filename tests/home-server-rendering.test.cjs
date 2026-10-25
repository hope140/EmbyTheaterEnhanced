'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const bridge = require('../src/electronapp/enhanced/home/home-tab.js');
const provider = require('../src/electronapp/enhanced/home/server-sections.js');
class Element {
    constructor(document, tag = 'div') {
        this.ownerDocument = document; this.tag = tag; this.children = []; this.attributes = {}; this.className = ''; this.textContent = ''; this.style = {};
        this.classList = {add: (...names) => { this.className = [...new Set(this.className.split(' ').concat(names))].join(' '); },
            remove: name => { this.className = this.className.split(' ').filter(value => value !== name).join(' '); },
            contains: name => this.className.split(' ').includes(name)};
    }
    appendChild(element) { element.parentElement = this; this.children.push(element); return element; }
    replaceChildren(...elements) { this.children.forEach(child => { child.parentElement = null; }); this.children = []; elements.forEach(element => this.appendChild(element)); }
    replaceChild(next, previous) { const index = this.children.indexOf(previous); assert.ok(index >= 0); this.children[index] = next; previous.parentElement = null; next.parentElement = this; }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name] || null; }
    getBoundingClientRect() { return {height: 240}; }
    contains(element) { return element === this || this.children.some(child => child.contains(element)); }
    closest(selector) { if (selector === '[data-ete-home-title]' && this.getAttribute('data-ete-home-title') || selector === '.sectionSeeAllButton' && this.classList.contains('sectionSeeAllButton')) return this; return this.parentElement ? this.parentElement.closest(selector) : null; }
    addEventListener(name, fn) { (this.events ||= {})[name] = fn; }
    removeEventListener(name, fn) { if (this.events && this.events[name] === fn) delete this.events[name]; }
    querySelectorAll(selector) {
        const matches = child => selector === 'h2' ? child.tag === 'h2' : selector === 'button' ? child.tag === 'button' : selector === 'a' ? child.tag === 'a' : selector === '[data-id]' ? !!child.getAttribute('data-id') :
            selector === '[data-ete-home-title]' ? !!child.getAttribute('data-ete-home-title') : selector === '.sectionTitleTextButton' ? child.classList.contains('sectionTitleTextButton') :
            selector === '.sectionSeeAllButton' ? child.classList.contains('sectionSeeAllButton') :
            selector === '.sections' ? child.classList.contains('sections') : selector === '.itemsContainer' ? child instanceof Items : false;
        return this.children.flatMap(child => (matches(child) ? [child] : []).concat(child.querySelectorAll(selector)));
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    set innerHTML(value) {
        this.replaceChildren();
        if (!value) return;
        assert.ok(value.startsWith('<h2 class="sectionTitle'));
        this.appendChild(new Element(this.ownerDocument, 'h2'));
        this.appendChild(new Items(this.ownerDocument));
    }
}
class Items extends Element {
    constructor(document) { super(document); this.className = 'itemsContainer'; this.paused = true; }
    pause() { this.paused = true; }
    resume(options) { this.paused = false; return options && options.refresh ? this.refreshItems() : Promise.resolve(); }
    async refreshItems() {
        if (this.paused) return;
        const data = await this.fetchData({Limit: 12});
        this.options = this.getListOptions(data.Items);
        this.result = data;
        this.replaceChildren(...data.Items.map(item => { const card = new Element(this.ownerDocument); card.setAttribute('data-id', item.Id); return card; }));
        if (data.Items.length) this.parentContainer.classList.remove('hide');
        return data;
    }
}
function sections() { return [{Id: 'first', SectionType: 'resume', Name: '<unsafe>', Monitor: ['videoplayback', 'markplayed']},
    {Id: 'second', SectionType: 'latestmedia', Name: 'Recent', CollectionType: 'movies'}]; }
function fixture(handler, identityClock, cacheOptions, rendererWindow, actualBridge = bridge, flowMode) {
    const document = {activeElement: null, createElement(tag, options) { const element = new Element(document, tag); element.customType = options && options.is; if (element.customType) element.classList.add('native-constructor-class'); return element; }};
    const view = new Element(document), root = document.createElement('div'); root.className = 'sections'; view.appendChild(root);
    const cards = Object.freeze({id: 'original-cards'}), calls = [], legacy = [], focus = [], loading = [], routes = [];
    let version = '4.10.0.40', user = 'user-1', client;
    const api = {serverVersion: () => version, serverId: () => 'server-1', getCurrentUserId: () => user,
        isLoggedIn: () => !!user, getCurrentLocale: () => 'zh-CN', _identityEpoch: 0,
        getCurrentUser: () => Promise.resolve({Id: user}), getUrl(route, query) { return {route, query}; },
        getJSON(request, signal) { calls.push({request, signal});
            if (handler) return handler(request, signal, calls.length);
            return Promise.resolve(request.route.endsWith('/HomeSections') ? sections() : {Items: [{Id: 'item-' + request.route.split('/').at(-2)}]}); }};
    client = api;
    const owner = {view, sectionsContainer: root, addFocusBehavior: item => focus.push(item)};
    const deps = {document, cards, layout: {tv: true}, globalize: {getCurrentLocale: () => 'zh-CN'},
        router: {getRouteUrl(parent, options) { routes.push({parent, options}); return (parent.CollectionType === 'movies' ? '/videos?' : '/tv?') + 'serverId=' + options.serverId + '&parentId=' + parent.Id + '&tab=suggestions'; }},
        legacy: {loadSections(stage, actual, currentUser) { legacy.push({stage, client: actual, user: currentUser}); return Promise.resolve(); }},
        loading: {show: () => loading.push('show'), hide: () => loading.push('hide')},
        focus: {autoFocus: () => focus.push('auto'), focus: element => focus.push(element)},
        connection: {currentApiClient: () => client}};
    if (identityClock) deps.identityClock = identityClock;
    if (cacheOptions || rendererWindow || flowMode) {
        if (cacheOptions) deps.pageCacheOptions = cacheOptions;
        deps.events = require('./helpers/api-client-amd.cjs').harness().load('events.js').default;
    }
    if (flowMode) deps.homeFlowOptions = {mode: flowMode};
    let controller;
    const previousWindow = global.window;
    try {
        if (rendererWindow) global.window = rendererWindow;
        controller = actualBridge.create(owner, deps);
    } finally {
        if (previousWindow === undefined) delete global.window; else global.window = previousWindow;
    }
    return {owner, root, api, document, cards, calls, legacy, focus, loading, routes, deps, controller,
        version(value) { version = value; }, user(value) { user = value; }, switchClient() { client = {...api}; }};
}

test('cold identity startup and cancellation use Window timers with their valid receiver', async () => {
    const vm = require('node:vm'), fs = require('node:fs');
    const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
    const module = {exports: {}};
    const context = vm.createContext({module, AbortController, require(name) {
        if (name === './server-sections.js') return provider;
        if (name === '../page-cache/home-layout-cache.js') return require('../src/electronapp/enhanced/page-cache/home-layout-cache.js');
        throw new Error('Unexpected test dependency');
    }});
    vm.runInContext(`
        let now = 1000, next = 0; const timers = new Map(); Date.now = () => now;
        function receiver(value) { if (value !== undefined && value !== null && value !== globalThis) throw new TypeError('Illegal invocation'); }
        globalThis.setTimeout = function(fn, ms) { 'use strict'; receiver(this); timers.set(++next, {fn, at: now + ms}); return next; };
        globalThis.clearTimeout = function(id) { 'use strict'; receiver(this); timers.delete(id); };
        globalThis.advance = ms => { now += ms; for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.fn(); } };
        globalThis.timerCount = () => timers.size;
    `, context);
    vm.runInContext(fs.readFileSync(require.resolve('../src/electronapp/enhanced/home/home-tab.js'), 'utf8'), context);
    const run = code => vm.runInContext(code, context);
    const f = fixture(undefined, undefined, undefined, undefined, module.exports);
    f.user(null); const initial = f.controller.resume(); await flush();
    assert.equal(run('timerCount()'), 1); assert.equal(f.calls.length, 0);
    f.user('user-1'); run('advance(100)');
    assert.equal((await initial).status, 'server'); assert.equal(run('timerCount()'), 0);
    f.controller.pause(); f.user(null);
    const cancelled = f.controller.resume(); await flush();
    assert.equal(run('timerCount()'), 1);
    f.controller.pause(); assert.equal((await cancelled).status, 'cancelled');
    assert.equal(run('timerCount()'), 0); f.controller.dispose();
});
test('server layout renders ordered safe headings with original cards and no new playback owner', async () => {
    const f = fixture(); assert.equal((await f.controller.resume({autoFocus: true})).status, 'server');
    const stage = f.root.children[0];
    assert.equal(stage.getAttribute('data-ete-home-source'), 'server');
    assert.deepEqual(stage.querySelectorAll('h2').map(h => h.textContent), ['<unsafe>', 'Recent']);
    assert.equal(stage.children.length, sections().length);
    assert.ok(stage.children.every(child => child.classList.contains('verticalSection')));
    const items = stage.querySelectorAll('.itemsContainer');
    assert.ok(items.every(item => item.options.renderer === f.cards));
    assert.deepEqual(items[0].options.contextMenuOptions, {removeFromResume: true});
    assert.equal(items[0].options.options.lines, 2);
    const live = bridge.listOptions({SectionType: 'onnow'}, f.cards);
    assert.equal(live.options.shape, 'autooverflow'); assert.equal(live.options.action, 'programlink');
    assert.deepEqual(live.contextMenuOptions, {createRecording: false});
    assert.equal(items[0].getAttribute('data-monitor'), 'videoplayback,markplayed');
    assert.equal(f.calls.length, 3); assert.equal(f.legacy.length, 0); assert.ok(f.focus.includes('auto'));
    f.controller.dispose();
});

test('desktop latest library titles use the native section-title anchor, safe text and current server', async () => {
    const f = fixture(); f.deps.layout.tv = false;
    f.api.getJSON = request => Promise.resolve(request.route.endsWith('/HomeSections') ? [
        {Id: 'section-not-library', SectionType: 'latestmedia', Name: '<img src=x onerror=alert(1)>',
            ParentItem: {Id: 'movie-library', CollectionType: 'movies', Path: 'never-forwarded'}},
        {Id: 'tv-section', SectionType: 'latestmedia', Name: 'Television', ParentItem: {Id: 'tv-library', CollectionType: 'tvshows'}}
    ] : {Items: [{Id: 'one'}]});
    assert.equal((await f.controller.resume()).status, 'server');
    const links = f.root.querySelectorAll('a'); assert.equal(links.length, 2);
    assert.equal(links[0].customType, 'emby-sectiontitle');
    assert.equal(links[0].getAttribute('href'), './videos?serverId=server-1&parentId=movie-library&tab=suggestions');
    assert.equal(links[1].getAttribute('href'), './tv?serverId=server-1&parentId=tv-library&tab=suggestions');
    assert.ok(links[0].classList.contains('native-constructor-class'));
    assert.ok(links[0].classList.contains('sectionTitleTextButton'));
    assert.equal(links[0].querySelector('h2').textContent, '<img src=x onerror=alert(1)>');
    assert.deepEqual(f.routes[0].options, {section: 'latest', serverId: 'server-1'});
    assert.deepEqual(Object.keys(f.routes[0].parent).sort(), ['CollectionType', 'Id', 'ServerId']);
    f.controller.dispose();
});

test('TV, missing/unsupported parent and non-latest sections keep ordinary headings', async () => {
    for (const tv of [false, true]) {
        const f = fixture(); f.deps.layout.tv = tv;
        const parent = {Id: 'movie-library', CollectionType: 'movies'};
        f.api.getJSON = request => Promise.resolve(request.route.endsWith('/HomeSections') ? [
            {Id: 'latest', SectionType: 'latestmedia', Name: 'Latest', ParentItem: tv ? parent : {...parent, ServerId: 'other'}},
            {Id: 'missing', SectionType: 'latestmedia', Name: 'Missing'},
            {Id: 'resume', SectionType: 'resume', Name: 'Resume', ParentItem: parent}
        ] : {Items: [{Id: 'one'}]});
        assert.equal((await f.controller.resume()).status, 'server');
        assert.equal(f.root.querySelectorAll('a').length, 0); assert.equal(f.routes.length, 0);
        assert.deepEqual(f.root.querySelectorAll('h2').map(x => x.textContent), ['Latest', 'Missing', 'Resume']);
        f.controller.dispose();
    }
});

test('default Home return retains its native title while freshly reading layout and items', async () => {
    const f = fixture(); f.deps.layout.tv = false;
    let reads = 0;
    f.api.getJSON = request => Promise.resolve(request.route.endsWith('/HomeSections') && ++reads ? [
        {Id: 'latest', SectionType: 'latestmedia', Name: 'Latest', ParentItem: {Id: 'movie-library', CollectionType: 'movies'}}
    ] : {Items: [{Id: 'one'}]});
    await f.controller.resume(); const previous = f.root.querySelectorAll('a')[0];
    f.document.activeElement = previous; f.controller.pause(); await f.controller.resume({autoFocus: false});
    const current = f.root.querySelectorAll('a')[0];
    assert.equal(previous, current); assert.equal(f.focus.at(-1), current);
    assert.equal(reads, 2);
    f.controller.dispose();
});

test('title and native See All container block activation after pause, identity change or replacement', async () => {
    for (const action of ['pause', 'user', 'switchClient', 'refresh', 'dispose']) {
        const f = fixture(); f.deps.layout.tv = false;
        f.api.getJSON = request => Promise.resolve(request.route.endsWith('/HomeSections') ? [
            {Id: 'latest', SectionType: 'latestmedia', Name: 'Latest', ParentItem: {Id: 'movie-library', CollectionType: 'movies'}}
        ] : {Items: [{Id: 'one'}]});
        await f.controller.resume(); const title = f.root.querySelectorAll('a')[0].parentElement;
        function activate() { const event = {preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }}; title.events.click(event); return event; }
        assert.equal(activate().prevented, undefined);
        if (action === 'user') f.user('other'); else if (action === 'switchClient') f.switchClient(); else if (action === 'refresh') { f.api.getJSON = () => new Promise(() => {}); f.controller.refresh(); } else await f.controller[action]();
        const rejected = activate(); assert.equal(rejected.prevented, true); assert.equal(rejected.stopped, true);
        f.controller.dispose();
    }
});

test('a See All target hidden by refreshed content restores focus to the visible section title', async () => {
    const f = fixture(); f.deps.layout.tv = false; let hide = false;
    const create = f.document.createElement;
    f.document.createElement = function(tag, options) {
        const element = create(tag, options), append = element.appendChild;
        element.appendChild = function(child) {
            const result = append.call(this, child);
            if (this.getAttribute('data-ete-home-title') && child.customType === 'emby-sectiontitle') {
                const seeAll = create('a'); seeAll.classList.add('sectionSeeAllButton'); if (hide) seeAll.classList.add('hide');
                append.call(this, seeAll);
            }
            return result;
        };
        return element;
    };
    f.api.getJSON = request => Promise.resolve(request.route.endsWith('/HomeSections') ? [
        {Id: 'latest', SectionType: 'latestmedia', Name: 'Latest', ParentItem: {Id: 'movie-library', CollectionType: 'movies'}}
    ] : {Items: [{Id: 'one'}]});
    await f.controller.resume(); f.document.activeElement = f.root.querySelector('.sectionSeeAllButton');
    f.controller.pause(); hide = true; f.root.querySelector('.sectionSeeAllButton').classList.add('hide'); await f.controller.resume({autoFocus: false});
    assert.equal(f.focus.at(-1), f.root.querySelector('.sectionTitleTextButton')); f.controller.dispose();
});
test('old server uses complete legacy renderer and old user without new HomeSections request', async () => {
    const f = fixture(); f.version('4.9.0.0');
    assert.equal((await f.controller.resume()).status, 'legacy'); assert.equal(f.calls.length, 0);
    assert.equal(f.legacy.length, 1); assert.equal(f.legacy[0].client, f.api); assert.equal(f.legacy[0].user.Id, 'user-1');
    assert.equal(f.root.children[0].getAttribute('data-ete-home-source'), 'legacy'); f.controller.dispose();
});
test('unsupported layout, HTTP error and bad item payload use whole-page fallback', async () => {
    const inputs = [() => Promise.resolve([{...sections()[0], ViewType: 'spotlight'}]),
        () => Promise.resolve([{...sections()[0], ScrollDirection: 'Vertical'}]),
        () => Promise.resolve([{...sections()[0], CardSizeOffset: -1}]),
        () => Promise.resolve([{...sections()[0], ImageType: 'Backdrop'}]),
        () => Promise.reject(new Error('private request token')),
        request => Promise.resolve(request.route.endsWith('/HomeSections') ? sections() : {Items: [{}]})];
    for (const handler of inputs) { const f = fixture(handler); assert.equal((await f.controller.resume()).status, 'legacy');
        assert.equal(f.legacy.length, 1); assert.equal(f.root.children[0].getAttribute('data-ete-home-source'), 'legacy'); f.controller.dispose(); }
});
test('explicit empty server homepage is empty and does not reinsert legacy sections', async () => {
    const f = fixture(() => Promise.resolve([])); assert.equal((await f.controller.resume()).status, 'server');
    assert.equal(f.root.children[0].children.length, 0);
    assert.equal(f.root.querySelectorAll('.itemsContainer').length, 0); assert.equal(f.legacy.length, 0); f.controller.dispose();
});
test('pause/destroy cancel pending reads, and late server data cannot render or focus', async () => {
    for (const method of ['pause', 'dispose']) {
        let resolve;
        const f = fixture(() => new Promise(done => { resolve = done; }));
        const pending = f.controller.resume({autoFocus: true}); await Promise.resolve();
        f.controller[method](); resolve(sections());
        assert.equal((await pending).status, 'cancelled'); assert.equal(f.root.children.length, 0); assert.equal(f.focus.length, 0);
        assert.ok(f.calls[0].signal.aborted);
        if (method === 'dispose') assert.equal((await f.controller.resume()).status, 'cancelled');
    }
});
test('server/user/client changes discard old response without invoking old fallback', async () => {
    for (const change of ['user', 'switchClient']) {
        let resolve; const f = fixture(() => new Promise(done => { resolve = done; }));
        const pending = f.controller.resume(); await Promise.resolve(); f[change]('new-user'); resolve(sections());
        assert.equal((await pending).status, 'cancelled'); assert.equal(f.legacy.length, 0); assert.equal(f.root.children.length, 0); f.controller.dispose();
    }
});
test('new refresh wins even if the older request ignores AbortSignal and resolves later', async () => {
    let resolveOld;
    const f = fixture((request, signal, count) => count === 1 ? new Promise(resolve => { resolveOld = resolve; }) :
        Promise.resolve(request.route.endsWith('/HomeSections') ? sections() : {Items: [{Id: 'new'}]}));
    const old = f.controller.resume(); await Promise.resolve();
    assert.equal((await f.controller.refresh({})).status, 'server'); const current = f.root.children[0];
    resolveOld([{...sections()[0], Name: 'late'}]); assert.equal((await old).status, 'cancelled');
    assert.equal(f.root.children[0], current); assert.equal(current.querySelector('h2').textContent, '<unsafe>'); f.controller.dispose();
});
test('resume after pause refreshes server configuration and restores existing card focus', async () => {
    const f = fixture(); await f.controller.resume();
    f.document.activeElement = f.root.querySelectorAll('[data-id]')[0];
    const id = f.document.activeElement.getAttribute('data-id'); f.controller.pause();
    await f.controller.resume();
    assert.ok(f.focus.some(value => value && value.getAttribute && value.getAttribute('data-id') === id)); f.controller.dispose();
});
test('a failed subsequent section refresh switches once to complete legacy layout', async () => {
    let fail = false;
    const f = fixture(request => Promise.resolve(request.route.endsWith('/HomeSections') ? sections() : fail ? {Items: [{}]} : {Items: [{Id: 'one'}]}));
    await f.controller.resume(); const items = f.root.querySelectorAll('.itemsContainer')[0]; fail = true;
    await assert.rejects(items.fetchData({Limit: 12}), error => error.name === 'AbortError');
    assert.equal(f.legacy.length, 1); assert.equal(f.root.children[0].getAttribute('data-ete-home-source'), 'legacy'); f.controller.dispose();
});
test('card rendering exceptions fall back, and legacy errors remain generic and retryable', async () => {
    const f = fixture(); const create = f.document.createElement;
    f.document.createElement = function(tag) { const element = create(tag); if (tag === 'div') Object.defineProperty(element, 'innerHTML', {set() { throw Error('render failure'); }}); return element; };
    assert.equal((await f.controller.resume()).status, 'legacy'); f.controller.dispose();
    const g = fixture(); g.version('4.9.0.0'); g.api.getCurrentUser = () => Promise.reject(new Error('private token url'));
    assert.equal((await g.controller.resume()).status, 'error'); assert.equal(g.owner.sectionsRendered, false);
    assert.ok(!JSON.stringify(g.root.children[0].children[0].textContent).includes('token')); g.controller.dispose();
});
test('pause settles pending legacy user or renderer work without waiting for an ignored signal', async () => {
    for (const target of ['user', 'legacy']) {
        const f = fixture(); f.version('4.9.0.0');
        if (target === 'user') f.api.getCurrentUser = () => new Promise(() => {});
        else f.deps.legacy.loadSections = () => new Promise(() => {});
        const pending = f.controller.resume();
        for (let index = 0; index < 10; index++) await Promise.resolve();
        f.controller.pause(); assert.equal((await pending).status, 'cancelled'); f.controller.dispose();
    }
});
test('refresh clears old visible data before fetching a changed user layout', async () => {
    const f = fixture(); await f.controller.resume(); assert.equal(f.root.children.length, 1);
    f.api.getJSON = () => new Promise(() => {}); f.user('different-user');
    const pending = f.controller.refresh(); assert.equal(f.root.children.length, 0);
    f.controller.pause(); assert.equal((await pending).status, 'cancelled'); f.controller.dispose();
});
function startupClock() {
    let now = 0, next = 0;
    const timers = new Map();
    return {now: () => now,
        setTimeout(fn, delay) { const id = ++next; timers.set(id, {fn, at: now + delay}); return id; },
        clearTimeout(id) { timers.delete(id); },
        advance(ms) { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); } },
        get size() { return timers.size; }};
}

test('cold startup waits for complete identity without making requests and then loads once', async () => {
    const clock = startupClock(), f = fixture(null, clock);
    let ready = false;
    f.deps.connection.currentApiClient = () => ready ? f.api : null;
    const first = f.controller.resume();
    assert.equal(f.controller.resume(), first);
    assert.equal(f.calls.length, 0);
    ready = true; f.user(''); clock.advance(100);
    assert.equal(f.calls.length, 0);
    f.user('user-1'); clock.advance(100);
    assert.equal((await first).status, 'server');
    assert.equal(f.calls.length, 3);
    assert.equal(clock.size, 0);
    assert.equal((await f.controller.resume()).status, 'server');
    assert.equal(f.calls.length, 3);
    f.controller.dispose();
});

test('transient identity exceptions recover within the same cold startup attempt', async () => {
    const clock = startupClock(), f = fixture(null, clock), server = f.api.serverId;
    f.api.serverId = () => { throw new Error('private identity failure'); };
    const first = f.controller.resume();
    assert.equal(f.calls.length, 0);
    f.api.serverId = server; clock.advance(100);
    assert.equal((await first).status, 'server');
    assert.equal(f.calls.length, 3);
    f.controller.dispose();
});

test('identity deadline shows a generic retryable error and ordinary resume starts new work', async () => {
    const clock = startupClock(), f = fixture(null, clock), server = f.api.serverId;
    f.api.serverId = () => { throw new Error('private identity failure'); };
    const first = f.controller.resume();
    clock.advance(2999);
    assert.equal(f.root.children.length, 0);
    clock.advance(1);
    assert.equal((await first).status, 'error');
    assert.equal(f.loading.at(-1), 'hide');
    assert.equal(f.root.children[0].getAttribute('data-ete-home-source'), 'error');
    assert.equal(f.root.children[0].children.length, 1, 'error stage only contains its existing message');
    assert.equal(f.root.children[0].children[0].tag, 'p');
    assert.ok(!f.root.children[0].children[0].textContent.includes('private'));
    assert.equal(clock.size, 0);
    f.api.serverId = server;
    assert.equal((await f.controller.resume()).status, 'server');
    f.controller.dispose();
});

test('pause clear and dispose cancel identity waits and prevent late requests', async () => {
    for (const action of ['pause', 'clear', 'dispose']) {
        const clock = startupClock(), f = fixture(null, clock);
        f.user(''); const first = f.controller.resume();
        f.controller[action]();
        assert.equal((await first).status, 'cancelled');
        assert.equal(clock.size, 0);
        f.user('user-1'); clock.advance(4000);
        assert.equal(f.calls.length, 0);
        assert.equal(f.root.children.length, 0);
        assert.equal((await f.controller.resume()).status, action === 'dispose' ? 'cancelled' : 'server');
        f.controller.dispose();
    }
});

test('a new refresh owns pending cleanup when it replaces a startup wait', async () => {
    const clock = startupClock(), f = fixture(null, clock);
    f.user(''); const old = f.controller.resume();
    const replacement = f.controller.refresh();
    assert.equal((await old).status, 'cancelled');
    assert.equal(f.controller.resume(), replacement);
    f.user('user-1'); clock.advance(100);
    assert.equal((await replacement).status, 'server');
    assert.equal(f.calls.length, 3);
    assert.equal(clock.size, 0);
    f.controller.dispose();
});

test('slow synchronous identity probes cannot commit after the absolute startup deadline', async () => {
    for (const slowProbe of [1, 2, 3]) {
        const clock = startupClock(), f = fixture(null, clock), server = f.api.serverId;
        let calls = 0;
        f.api.serverId = () => { if (++calls === slowProbe) clock.advance(3000); return server(); };
        assert.equal((await f.controller.resume()).status, 'error');
        assert.equal(f.calls.length, 0);
        assert.equal(clock.size, 0);
        f.controller.dispose();
    }
});

test('a transient identity revalidation exception still recovers during startup', async () => {
    const clock = startupClock(), f = fixture(null, clock), server = f.api.serverId;
    let calls = 0;
    f.api.serverId = () => { if (++calls === 2) throw Error('temporary validation failure'); return server(); };
    const work = f.controller.resume();
    clock.advance(100);
    assert.equal((await work).status, 'server');
    assert.equal(f.calls.length, 3);
    f.controller.dispose();
});


test('opt-in HomeTab return reuses layout while rereading card data; explicit refresh and clear invalidate', async () => {
    const f = fixture(null, null, {enabled: true, ttlMs: 10000});
    const count = () => f.calls.filter(c => c.request.route.endsWith('/HomeSections')).length;
    assert.equal((await f.controller.resume()).status, 'server'); assert.equal(count(), 1);
    const firstItems = f.root.querySelectorAll('.itemsContainer')[0].result;
    f.controller.pause(); assert.equal((await f.controller.resume({refresh: false})).status, 'server');
    assert.equal(count(), 1); assert.notEqual(f.root.querySelectorAll('.itemsContainer')[0].result, firstItems);
    assert.equal(f.calls.length, 5, 'layout hit retains two fresh section-content GETs on return');
    await f.controller.refresh(); assert.equal(count(), 2);
    f.controller.pause(); await f.controller.resume({refresh: true}); assert.equal(count(), 3);
    f.controller.clear(); await f.controller.refresh(); assert.equal(count(), 4); f.controller.dispose();
});
test('opt-in HomeTab pause while loading rejects old response and allows a new navigation stage', async () => {
    let resolveOld;
    const f = fixture((request, signal, count) => request.route.endsWith('/HomeSections') && count === 1 ?
        new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve(request.route.endsWith('/HomeSections') ?
            [{Id: 'new', Name: 'New navigation', SectionType: 'latestmedia'}] : {Items: []}), null, {enabled: true, ttlMs: 10000});
    const old = f.controller.resume(); for (let i = 0; i < 20; i++) await Promise.resolve();
    assert.equal(typeof resolveOld, 'function'); f.controller.pause();
    assert.equal((await f.controller.resume()).status, 'server');
    resolveOld([{Id: 'old', Name: 'Retired navigation', SectionType: 'latestmedia'}]);
    assert.equal((await old).status, 'cancelled');
    assert.equal(f.root.querySelectorAll('h2')[0].textContent, 'New navigation');
    f.controller.pause(); await f.controller.resume();
    assert.equal(f.calls.filter(c => c.request.route.endsWith('/HomeSections')).length, 2); f.controller.dispose();
});
test('opt-in HomeTab current stage guard rejects same-user reauthentication and user/client replacement', async () => {
    const f = fixture(null, null, {enabled: true, ttlMs: 10000}); await f.controller.resume();
    f.api._identityEpoch++; await f.controller.resume();
    assert.equal(f.calls.filter(c => c.request.route.endsWith('/HomeSections')).length, 2);
    f.user('other-user'); await f.controller.resume();
    assert.equal(f.calls.filter(c => c.request.route.endsWith('/HomeSections')).length, 3);
    f.switchClient(); await f.controller.resume();
    assert.equal(f.calls.filter(c => c.request.route.endsWith('/HomeSections')).length, 4); f.controller.dispose();
});
test('opt-in HomeTab post-write UserDataChanged listener invalidates layout before return', async () => {
    const f = fixture(null, null, {enabled: true, ttlMs: 10000}); await f.controller.resume();
    f.controller.pause(); f.deps.events.trigger(f.api, 'message', [{MessageType: 'UserDataChanged', Data: {}}]);
    await f.controller.resume();
    assert.equal(f.calls.filter(c => c.request.route.endsWith('/HomeSections')).length, 2); f.controller.dispose();
    assert.equal(f.api._callbacks.message.length, 0); assert.equal(f.deps.connection._callbacks.localusersignedout.length, 0);
});


test('expired cached layout starts a fresh read; its late result cannot replace the next navigation', async () => {
    const clock = startupClock(); let layouts = 0, resolveExpired;
    const f = fixture(request => {
        if (!request.route.endsWith('/HomeSections')) return Promise.resolve({Items: []});
        layouts++;
        if (layouts === 2) return new Promise(resolve => { resolveExpired = resolve; });
        return Promise.resolve([{Id: 'layout-' + layouts, Name: 'Navigation ' + layouts, SectionType: 'latestmedia'}]);
    }, null, {enabled: true, ttlMs: 100, clock});
    await f.controller.resume(); f.controller.pause(); clock.advance(100);
    const expired = f.controller.resume(); for (let i = 0; i < 20; i++) await Promise.resolve();
    assert.equal(typeof resolveExpired, 'function'); f.controller.pause();
    await f.controller.resume(); resolveExpired([{Id: 'expired', Name: 'Expired navigation', SectionType: 'latestmedia'}]);
    assert.equal((await expired).status, 'cancelled');
    assert.equal(f.root.querySelectorAll('h2')[0].textContent, 'Navigation 3'); assert.equal(layouts, 3);
    f.controller.dispose();
});


test('opt-in active HomeTab does not reuse a committed stage across locale/version changes', async () => {
    const f = fixture(null, null, {enabled: true, ttlMs: 10000}); await f.controller.resume();
    f.api.getCurrentLocale = () => 'en-US'; await f.controller.resume();
    f.version('4.10.0.41'); await f.controller.resume();
    assert.equal(f.calls.filter(c => c.request.route.endsWith('/HomeSections')).length, 3);
    f.controller.dispose();
});


test('test preload options reach the real Home factory with no injected cache dependency option', async () => {
    const options = require('../src/electronapp/enhanced/page-cache/test-options');
    for (const enabled of [true, false]) {
        const window = {};
        options.install(window, [options.rendererArgument({enabled, ttlMs: 10000, maxEntries: 2, maxBytes: 4096})]);
        const f = fixture(null, null, null, window);
        assert.equal(f.deps.pageCacheOptions, undefined);
        await f.controller.resume(); f.controller.pause(); await f.controller.resume();
        assert.equal(f.calls.filter(c => c.request.route.endsWith('/HomeSections')).length, enabled ? 1 : 2);
        if (enabled) {
            f.user('new-user'); await f.controller.resume();
            assert.equal(f.calls.filter(c => c.request.route.endsWith('/HomeSections')).length, 2, 'test entry rejects the prior account');
        }
        f.controller.dispose();
    }
});
test('two test renderer sessions never share layout data even with identical account/server strings', async () => {
    const options = require('../src/electronapp/enhanced/page-cache/test-options');
    function start() {
        const window = {}; options.install(window, [options.rendererArgument({enabled: true, ttlMs: 10000, maxEntries: 2, maxBytes: 4096})]);
        return fixture(null, null, null, window);
    }
    const a = start(), b = start(); await a.controller.resume(); await b.controller.resume();
    a.controller.pause(); await a.controller.resume(); b.controller.pause(); await b.controller.resume();
    assert.equal(a.calls.filter(c => c.request.route.endsWith('/HomeSections')).length, 1);
    assert.equal(b.calls.filter(c => c.request.route.endsWith('/HomeSections')).length, 1);
    a.user('other-user'); await a.controller.resume();
    b.controller.pause(); await b.controller.resume();
    assert.equal(a.calls.filter(c => c.request.route.endsWith('/HomeSections')).length, 2);
    assert.equal(b.calls.filter(c => c.request.route.endsWith('/HomeSections')).length, 1);
    a.controller.dispose(); b.controller.dispose();
});

function controlledFlow(handler, mode = 'sections') { return fixture(handler, undefined, undefined, undefined, bridge, mode); }
async function flowFlush() { for (let i = 0; i < 40; i++) await Promise.resolve(); }
function flowGate() { let resolve; const promise = new Promise(value => { resolve = value; }); return {promise, resolve}; }
const flowRows = () => [{Id: 'first', SectionType: 'latestmedia', Name: 'First'}, {Id: 'second', SectionType: 'resume', Name: 'Second'}];
const flowData = value => ({Items: [{Id: 'same-item', UserData: {PlaybackPositionTicks: value}}]});

test('sections mode shows a ready row while another stalls, isolates its error and retries only that row', async () => {
    const slow = flowGate(); let retry = false;
    const f = controlledFlow(request => request.route.endsWith('/HomeSections') ? Promise.resolve(flowRows()) :
        request.route.includes('/first/') || retry ? Promise.resolve(flowData(1)) : slow.promise);
    const pending = f.controller.resume({autoFocus: true}); await flowFlush();
    const stage = f.root.children[0], rows = stage.children;
    assert.equal(rows.length, 2); assert.equal(rows[0].querySelector('.itemsContainer').result.Items.length, 1);
    assert.equal(rows[1].getAttribute('aria-busy'), 'true'); assert.equal(f.loading.at(-1), 'hide');
    slow.resolve({Items: [{}]}); const result = await pending;
    assert.equal(result.status, 'server'); assert.equal(result.failedSections, 1); assert.equal(f.legacy.length, 0);
    assert.equal(f.root.children[0], stage); assert.ok(rows[1].querySelector('button'));
    const before = f.calls.length; retry = true;
    rows[1].querySelector('button').events.click(); await flowFlush();
    assert.equal(f.calls.length, before + 1); assert.equal(rows[1].getAttribute('aria-busy'), 'false');
    f.controller.dispose();
});

test('retained Home revalidates all data, keeps stage/scroll/focus and masks old progress until fresh', async () => {
    const layout = flowGate(); let returning = false, generation = 1;
    const f = controlledFlow(request => request.route.endsWith('/HomeSections') ? returning ? layout.promise : Promise.resolve(flowRows()) : Promise.resolve(flowData(generation)), 'retain');
    await f.controller.resume(); const stage = f.root.children[0], rows = stage.children;
    const currentItems = rows[0].querySelector('.itemsContainer'), oldResult = currentItems.result;
    f.document.activeElement = currentItems.children[0]; f.owner.view.scrollTop = 120; rows[0].scrollLeft = 48;
    assert.equal(currentItems.eteHomeFlowOwns(oldResult), true);
    f.controller.pause(); assert.equal(currentItems.eteHomeFlowOwns(oldResult), false);
    returning = true; generation = 2; const pending = f.controller.resume({autoFocus: true}); await flowFlush();
    assert.equal(f.root.children[0], stage); assert.equal(f.owner.view.scrollTop, 120);
    assert.equal(rows[1].querySelector('.itemsContainer').style.visibility, '');
    assert.equal(rows[1].querySelector('.itemsContainer').classList.contains('eteHomeFlowPending'), true);
    assert.equal(rows[1].querySelector('.itemsContainer').inert, true);
    assert.equal(currentItems.inert, true); assert.equal(currentItems.eteHomeFlowOwns(oldResult), false);
    layout.resolve(flowRows()); await pending;
    assert.equal(f.root.children[0], stage); assert.equal(rows[0].scrollLeft, 48);
    assert.equal(currentItems.result.Items[0].UserData.PlaybackPositionTicks, 2);
    assert.equal(currentItems.eteHomeFlowOwns(currentItems.result), true);
    assert.ok(f.focus.some(value => value && value.getAttribute && value.getAttribute('data-id') === 'same-item'));
    assert.equal(f.calls.filter(call => call.request.route.endsWith('/HomeSections')).length, 2);
    assert.equal(f.calls.filter(call => call.request.route.includes('/Sections/')).length, 4);
    f.controller.dispose();
});

for (const change of ['user', 'auth', 'server', 'client', 'locale', 'version', 'display', 'query']) test('Home flow refuses retained content after scope change: ' + change, async () => {
    const f = controlledFlow(); await f.controller.resume(); const old = f.root.children[0]; f.controller.pause();
    if (change === 'user') f.user('other-user');
    if (change === 'auth') f.api._identityEpoch++;
    if (change === 'server') f.api.serverId = () => 'other-server';
    if (change === 'client') f.switchClient();
    if (change === 'locale') f.api.getCurrentLocale = () => 'en-US';
    if (change === 'version') f.version('4.10.0.41');
    if (change === 'display') f.deps.layout.tv = false;
    if (change === 'query') f.owner.params = {tab: 'changed'};
    const pending = f.controller.resume(); assert.equal(f.root.children.length, 0);
    await pending; assert.notEqual(f.root.children[0], old); f.controller.dispose();
});

test('Home flow logout clears even a paused stage and unhooks the previous API', async () => {
    const f = controlledFlow(); await f.controller.resume(); f.controller.pause();
    f.user(null); f.api._identityEpoch++;
    f.deps.events.trigger(f.deps.connection, 'localusersignedout');
    assert.equal(f.root.children.length, 0); assert.equal(f.api._callbacks.message.length, 0);
    f.controller.dispose();
    for (const name of ['localusersignedin', 'localusersignedout', 'connected']) assert.equal(f.deps.connection._callbacks[name].length, 0);
    for (const name of ['pointerdown', 'wheel', 'touchstart', 'keydown']) assert.equal(f.owner.view.events[name], undefined);
});

test('flow invalidation coalesces events and stale requests cannot replace refreshed rows', async () => {
    const late = flowGate(); let generation = 1;
    const f = controlledFlow(request => request.route.endsWith('/HomeSections') ? Promise.resolve(flowRows()) :
        generation === 1 ? late.promise : Promise.resolve(flowData(generation)));
    const original = f.controller.resume(); await flowFlush(); generation = 2;
    const notification = {MessageType: 'UserDataChanged'};
    Object.defineProperty(notification, 'Data', {get() { throw Error('must not read notification data'); }});
    f.deps.events.trigger(f.api, 'message', [notification]);
    f.deps.events.trigger(f.api, 'message', [notification]); await flowFlush();
    assert.equal((await original).status, 'cancelled');
    assert.equal(f.calls.filter(call => call.request.route.endsWith('/HomeSections')).length, 2);
    late.resolve(flowData(1)); await flowFlush();
    for (const items of f.root.querySelectorAll('.itemsContainer')) assert.equal(items.result.Items[0].UserData.PlaybackPositionTicks, 2);
    f.controller.dispose();
});

test('flow pause settles ignored transport cancellation and a new navigation keeps its own rows', async () => {
    const late = flowGate(); let generation = 1;
    const f = controlledFlow(request => request.route.endsWith('/HomeSections') ? Promise.resolve(flowRows()) :
        generation === 1 ? late.promise : Promise.resolve(flowData(generation)));
    const old = f.controller.resume(); await flowFlush(); f.controller.pause();
    assert.equal((await old).status, 'cancelled'); generation = 2; await f.controller.resume();
    const stage = f.root.children[0]; late.resolve(flowData(1)); await flowFlush();
    assert.equal(f.root.children[0], stage);
    for (const items of f.root.querySelectorAll('.itemsContainer')) assert.equal(items.result.Items[0].UserData.PlaybackPositionTicks, 2);
    f.controller.dispose();
});

test('late section completion does not reclaim user focus or scroll', async () => {
    const late = flowGate(); let returning = false;
    const f = controlledFlow(request => request.route.endsWith('/HomeSections') ? Promise.resolve(flowRows()) :
        returning && request.route.includes('/second/') ? late.promise : Promise.resolve(flowData(1)));
    await f.controller.resume(); f.owner.view.scrollTop = 120; f.controller.pause(); returning = true;
    const pending = f.controller.resume({autoFocus: true}); await flowFlush();
    f.owner.view.events.wheel(); f.owner.view.scrollTop = 310; const focused = f.focus.length;
    late.resolve(flowData(2)); await pending;
    assert.equal(f.owner.view.scrollTop, 310); assert.equal(f.focus.length, focused); f.controller.dispose();
});

test('unsupported Home flow layout preserves whole legacy fallback, not a partial mixed schema', async () => {
    const f = controlledFlow(request => Promise.resolve(request.route.endsWith('/HomeSections') ? [{...flowRows()[0], ViewType: 'spotlight'}] : flowData(1)));
    assert.equal((await f.controller.resume()).status, 'legacy'); assert.equal(f.legacy.length, 1); f.controller.dispose();
});

test('Home flow treats swallowed native fetch errors as a failed row and keeps stale content masked', async () => {
    const fs = require('node:fs'), vm = require('node:vm'); let fail = false;
    const f = controlledFlow(request => request.route.endsWith('/HomeSections') ? Promise.resolve(flowRows()) :
        fail && request.route.includes('/second/') ? Promise.reject(Error('synthetic failure')) : Promise.resolve(flowData(1)));
    await f.controller.resume();
    const source = fs.readFileSync(require('node:path').join(__dirname, '../vendor/web-snapshot/www/modules/emby-elements/emby-itemscontainer/emby-itemscontainer.js'), 'utf8');
    const start = source.indexOf('value: function () {', source.indexOf('key: "refreshItemsInternal",')) + 'value: '.length;
    const end = source.indexOf('\n          },', start) + '\n          }'.length;
    const refresh = vm.runInNewContext('(' + source.slice(start, end) + ')', {AbortController,
        abortRequests(instance) { instance.currentAbortController?.abort(); }, getVirtualChunkSize: () => 12,
        onGetItemsFailed() {}, onDataFetched() { throw Error('failure case must not enter DOM'); }});
    const row = f.root.children[0].children[1], items = row.querySelector('.itemsContainer');
    items.resume = function() { this.paused = false; return refresh.call(this); };
    fail = true; const outcome = await f.controller.refresh();
    assert.equal(outcome.failedSections, 1); assert.equal(items.style.visibility, ''); assert.equal(items.inert, true);
    assert.equal(items.classList.contains('eteHomeFlowPending'), true);
    assert.ok(row.querySelector('button')); f.controller.dispose();
});

test('validated preload Home flow selects sections mode while data caching remains disabled', async () => {
    const config = require('../src/electronapp/enhanced/page-cache/test-options');
    const target = {}; config.install(target, [config.rendererArgument({enabled: false, ttlMs: 10000, maxEntries: 2, maxBytes: 1048576, homeFlow: 'sections'})]);
    const f = fixture(undefined, undefined, undefined, target);
    assert.equal((await f.controller.resume()).status, 'server');
    const items = f.root.querySelector('.itemsContainer'); assert.equal(typeof items.eteHomeFlowOwns, 'function');
    assert.equal(f.deps.connection._callbacks.localusersignedout.length, 1, 'only flow owns the listener when the layout cache is disabled');
    f.controller.dispose();
});

test('flow cold identity timeout is bounded, hides loading and leaves a retryable error', async () => {
    const time = startupClock(), f = fixture(undefined, time, undefined, undefined, bridge, 'sections');
    f.user(null); const pending = f.controller.resume(); time.advance(3000);
    assert.equal((await pending).status, 'error'); assert.equal(f.loading.at(-1), 'hide');
    assert.equal(f.root.children[0].getAttribute('data-ete-home-source'), 'error');
    f.user('user-1'); assert.equal((await f.controller.resume()).status, 'server'); f.controller.dispose();
});
test('unknown route parameters disable retention, and a changed layout replaces the stage', async () => {
    let label = 'One';
    const f = controlledFlow(request => Promise.resolve(request.route.endsWith('/HomeSections') ? [{...flowRows()[0], Name: label}] : flowData(1)));
    f.owner.params = {unknown: 'synthetic'}; await f.controller.resume(); let prior = f.root.children[0];
    f.controller.pause(); await f.controller.resume(); assert.notEqual(f.root.children[0], prior);
    f.owner.params = {tab: 'home'}; f.controller.pause(); await f.controller.resume(); prior = f.root.children[0];
    f.controller.pause(); label = 'Two'; await f.controller.resume();
    assert.notEqual(f.root.children[0], prior); assert.equal(f.root.children[0].querySelector('h2').textContent, 'Two');
    f.controller.dispose();
});
test('user input retires delayed native focus without retiring the accepted data', async () => {
    const f = controlledFlow(); await f.controller.resume();
    const items = f.root.querySelector('.itemsContainer'), result = items.result;
    assert.equal(items.eteHomeFlowOwns(result), true); assert.equal(items.eteHomeFlowCanRestore(result), true);
    f.owner.view.events.wheel();
    assert.equal(items.eteHomeFlowOwns(result), true); assert.equal(items.eteHomeFlowCanRestore(result), false); f.controller.dispose();
});

test('input during layout revalidation also suppresses later native restoration in that same batch', async () => {
    const layout = flowGate(); let returning = false; const restored = [];
    const f = controlledFlow(request => request.route.endsWith('/HomeSections') ? returning ? layout.promise : Promise.resolve(flowRows()) : Promise.resolve(flowData(1)));
    await f.controller.resume(); f.controller.pause();
    for (const items of f.root.querySelectorAll('.itemsContainer')) {
        const resume = items.resume;
        items.resume = function(options) { return resume.call(this, options).then(result => { restored.push(this.eteHomeFlowCanRestore(this.result)); return result; }); };
    }
    returning = true; const pending = f.controller.resume(); f.owner.view.events.wheel(); layout.resolve(flowRows());
    await pending; assert.deepEqual(restored, [false, false]); f.controller.dispose();
});

test('policy invalidation immediately retires retained content and supersedes an already queued ordinary notification', async () => {
    const f = controlledFlow(request => Promise.resolve(request.route.endsWith('/HomeSections') ? flowRows() : flowData(1)));
    await f.controller.resume();
    f.deps.events.trigger(f.api, 'message', [{MessageType: 'UserDataChanged'}]);
    f.deps.events.trigger(f.api, 'message', [{MessageType: 'UserPolicyUpdated'}]);
    assert.equal(f.root.children.length, 0);
    await flowFlush();
    assert.equal(f.root.children.length, 1); assert.equal(f.root.children[0].getAttribute('data-ete-home-source'), 'server');
    f.controller.dispose();
});

test('default Home keeps resident cards during fresh reads and reuses the native row on completion', async () => {
    const f = fixture(); await f.controller.resume();
    const stage = f.root.children[0], row = f.root.querySelector('.itemsContainer');
    f.controller.pause(); assert.equal(f.controller.canRestore(), true);
    let release, sectionReads = 0, itemReads = 0;
    f.api.getJSON = request => {
        if (request.route.endsWith('/HomeSections')) { sectionReads++; return Promise.resolve(sections()); }
        itemReads++; return new Promise(resolve => { (release ||= []).push(() => resolve({Items: [{Id: 'fresh'}]})); });
    };
    const pending = f.controller.resume();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    assert.equal(f.root.children[0], stage); assert.equal(row.children.length, 1); assert.equal(row.inert, true);
    assert.equal(release.length, 2); release.forEach(done => done()); await pending;
    assert.equal(f.root.children[0], stage); assert.equal(f.root.querySelector('.itemsContainer'), row);
    assert.equal(row.children[0].getAttribute('data-id'), 'fresh'); assert.equal(row.inert, false);
    assert.equal(sectionReads, 1); assert.equal(itemReads, 2);
    f.controller.dispose();
});
for (const change of ['auth', 'locale', 'version', 'query']) test('default Home restore retires a resident stage after '+change+' changes', async () => {
    const f = fixture(); await f.controller.resume(); const stage = f.root.children[0]; f.controller.pause();
    if (change === 'auth') f.api._identityEpoch++;
    if (change === 'locale') f.api.getCurrentLocale = () => 'en-US';
    if (change === 'version') f.version('4.11.0.0');
    if (change === 'query') f.owner.params = {context: 'changed'};
    assert.equal(f.controller.canRestore(), false);
    f.api.getJSON = () => new Promise(() => {}); const pending = f.controller.resume();
    assert.equal(f.root.contains(stage), false); f.controller.pause(); await pending; f.controller.dispose();
});
test('default Home data and policy invalidations retire a paused resident stage', async () => {
    for (const name of ['UserDataChanged', 'LibraryChanged', 'UserPolicyUpdated']) {
        const f = fixture(null, null, {enabled: false}); await f.controller.resume(); f.controller.pause();
        f.deps.events.trigger(f.api, 'message', [{MessageType: name}]);
        assert.equal(f.root.children.length, 0); assert.equal(f.controller.canRestore(), false); f.controller.dispose();
    }
});
for (const change of ['auth', 'logout', 'locale', 'version', 'query']) test('default retained Home rejects an in-flight '+change+' change without waiting for an identity event', async () => {
    const f = fixture(); await f.controller.resume(); const stage = f.root.children[0]; f.controller.pause();
    const held = []; f.api.getJSON = request => request.route.endsWith('/HomeSections') ? Promise.resolve(sections()) : new Promise(resolve => held.push(resolve));
    const pending = f.controller.resume(); for (let i = 0; i < 20; i++) await Promise.resolve();
    assert.equal(f.root.children[0], stage);
    if (change === 'auth') f.api._identityEpoch++;
    if (change === 'logout') f.api.isLoggedIn = () => false;
    if (change === 'locale') f.api.getCurrentLocale = () => 'en-US';
    if (change === 'version') f.version('4.11.0.0');
    if (change === 'query') f.owner.params = {context: 'changed'};
    held.forEach(resolve => resolve({Items: [{Id: 'retired'}]})); await pending;
    assert.equal(f.root.children.length, 0); assert.equal(f.controller.canRestore(), false); f.controller.dispose();
});

for (const type of ['onnow', 'activerecordings']) test('default retained Home masks stale '+type+' program metadata until fresh delivery', async () => {
    const f = fixture(); let held;
    f.api.getJSON = request => Promise.resolve(request.route.endsWith('/HomeSections') ? [{Id: 'live', SectionType: type, Name: 'Live'}] : {Items: [{Id: 'old-program'}]});
    await f.controller.resume(); const row = f.root.querySelector('.itemsContainer'); f.controller.pause();
    f.api.getJSON = request => request.route.endsWith('/HomeSections') ? Promise.resolve([{Id: 'live', SectionType: type, Name: 'Live'}]) : new Promise(resolve => { held = resolve; });
    const pending = f.controller.resume(); for (let i = 0; i < 20; i++) await Promise.resolve();
    assert.equal(f.root.querySelector('.itemsContainer'), row);
    assert.equal(row.classList.contains('eteHomeFlowProgramPending'), true);
    held({Items: [{Id: 'fresh-program'}]}); await pending;
    assert.equal(row.classList.contains('eteHomeFlowProgramPending'), false);
    assert.equal(row.children[0].getAttribute('data-id'), 'fresh-program'); f.controller.dispose();
});
