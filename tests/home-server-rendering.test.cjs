'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const bridge = require('../src/electronapp/enhanced/home/home-tab.js');
const provider = require('../src/electronapp/enhanced/home/server-sections.js');
class Element {
    constructor(document, tag = 'div') {
        this.ownerDocument = document; this.tag = tag; this.children = []; this.attributes = {}; this.className = ''; this.textContent = '';
        this.classList = {add: (...names) => { this.className = [...new Set(this.className.split(' ').concat(names))].join(' '); },
            remove: name => { this.className = this.className.split(' ').filter(value => value !== name).join(' '); },
            contains: name => this.className.split(' ').includes(name)};
    }
    appendChild(element) { element.parentElement = this; this.children.push(element); return element; }
    replaceChildren(...elements) { this.children.forEach(child => { child.parentElement = null; }); this.children = []; elements.forEach(element => this.appendChild(element)); }
    replaceChild(next, previous) { const index = this.children.indexOf(previous); assert.ok(index >= 0); this.children[index] = next; previous.parentElement = null; next.parentElement = this; }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name] || null; }
    contains(element) { return element === this || this.children.some(child => child.contains(element)); }
    addEventListener(name, fn) { (this.events ||= {})[name] = fn; }
    querySelectorAll(selector) {
        const matches = child => selector === 'h2' ? child.tag === 'h2' : selector === 'a' ? child.tag === 'a' : selector === '[data-id]' ? !!child.getAttribute('data-id') :
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
function fixture(handler) {
    const document = {activeElement: null, createElement(tag, options) { const element = new Element(document, tag); element.customType = options && options.is; if (element.customType) element.classList.add('native-constructor-class'); return element; }};
    const view = new Element(document), root = document.createElement('div'); root.className = 'sections'; view.appendChild(root);
    const cards = Object.freeze({id: 'original-cards'}), calls = [], legacy = [], focus = [], loading = [], routes = [];
    let version = '4.10.0.40', user = 'user-1', client;
    const api = {serverVersion: () => version, serverId: () => 'server-1', getCurrentUserId: () => user,
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
    const controller = bridge.create(owner, deps);
    return {owner, root, api, document, cards, calls, legacy, focus, loading, routes, deps, controller,
        version(value) { version = value; }, user(value) { user = value; }, switchClient() { client = {...api}; }};
}
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

test('title and native See All container block activation after pause, identity change or replacement', async () => {
    for (const action of ['pause', 'user', 'switchClient', 'refresh', 'dispose']) {
        const f = fixture(); f.deps.layout.tv = false;
        f.api.getJSON = request => Promise.resolve(request.route.endsWith('/HomeSections') ? [
            {Id: 'latest', SectionType: 'latestmedia', Name: 'Latest', ParentItem: {Id: 'movie-library', CollectionType: 'movies'}}
        ] : {Items: [{Id: 'one'}]});
        await f.controller.resume(); const title = f.root.querySelectorAll('a')[0].parentElement;
        function activate() { const event = {preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }}; title.events.click(event); return event; }
        assert.equal(activate().prevented, undefined);
        if (action === 'user') f.user('other'); else if (action === 'switchClient') f.switchClient(); else await f.controller[action]();
        const rejected = activate(); assert.equal(rejected.prevented, true); assert.equal(rejected.stopped, true);
        f.controller.dispose();
    }
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
test('transient identity lookup failures do not reject the HomeTab lifecycle Promise', async () => {
    const f = fixture(); f.api.serverId = () => { throw new Error('disconnected'); };
    assert.equal((await f.controller.resume()).status, 'cancelled'); f.controller.dispose();
});
