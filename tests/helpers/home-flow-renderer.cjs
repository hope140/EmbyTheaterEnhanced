'use strict';
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const paths = {
    'enhanced/home/home-tab.js': 'src/electronapp/enhanced/home/home-tab.js',
    'enhanced/home/server-sections.js': 'src/electronapp/enhanced/home/server-sections.js',
    'enhanced/page-cache/home-layout-cache.js': 'src/electronapp/enhanced/page-cache/home-layout-cache.js',
    'enhanced/page-cache/page-data-cache.js': 'src/electronapp/enhanced/page-cache/page-data-cache.js',
    'modules/emby-apiclient/events.js': 'src/electronapp/www/modules/emby-apiclient/events.js'
};
function sources(root, revision) {
    if (revision && !/^[a-f0-9]{40}$/.test(revision)) throw Error('Exact source SHA required.');
    const result = Object.fromEntries(Object.entries(paths).map(([id, file]) => [id, revision
        ? cp.execFileSync('git', ['show', revision + ':' + file], {cwd: root, encoding: 'utf8'})
        : fs.readFileSync(path.join(root, file), 'utf8')]));
    const css = 'src/electronapp/enhanced/home/home-flow.css';
    const exists = !revision || cp.execFileSync('git', ['ls-tree', '--name-only', revision, '--', css], {cwd: root, encoding: 'utf8'}).trim();
    result.flowCss = exists ? revision ? cp.execFileSync('git', ['show', revision + ':' + css], {cwd: root, encoding: 'utf8'}) : fs.readFileSync(path.join(root, css), 'utf8') : '';
    return result;
}
async function openTrial(browser, input, mode = 'baseline', settings = {}) {
    const page = await browser.newPage({viewport: settings.viewport || {width: 1000, height: 700}});
    // The fixture has no external service, accounts, or asset requests.
    await page.route('**/*', route => settings.origin && route.request().url()===settings.origin ? route.fulfill({contentType:'text/html',body:'<!doctype html>'}) : route.abort());
    if(settings.origin) await page.goto(settings.origin);
    await page.setContent(`<!doctype html><style>${input.flowCss || ''}${settings.native ? input.nativeCss + '\nhtml{font-size:16px;background:#101820;color:#eee}body{margin:0}.view{height:100vh;overflow:auto}.hide{display:none!important}.emby-scroller{overflow:auto}.scrollSlider:not(.itemMainScrollSlider){display:flex}.itemsContainer{min-height:1px}' : `
        .hide {display:none!important} .view {height:380px;overflow:auto}
        .verticalSection {position:relative;min-height:240px} .itemsContainer {display:flex;gap:12px;overflow:auto}
        .card {flex:0 0 170px;height:180px} .homeFlowPlaceholder {height:180px}
        [data-home-flow-status] {min-height:24px}
    `}</style><div class="view"><div class="sections"></div></div>`);
    await page.evaluate(({input, mode, settings}) => {
        class Items extends HTMLDivElement {
            constructor() { super(); this.paused = true; this.sequence = 0; }
            pause() { this.paused = true; this.sequence++; }
            resume(options) { this.paused = false; return options && options.refresh ? this.refreshItems() : Promise.resolve(); }
            async refreshItems() {
                const sequence = ++this.sequence;
                let result;
                try { result = await this.fetchData({StartIndex: 0, Limit: 12}); }
                catch (_) { return; } // Match native refreshItemsInternal's consumed failure.
                if (this.paused || sequence !== this.sequence) return;
                if (this.eteHomeFlowOwns && !this.eteHomeFlowOwns(result)) return;
                this.replaceChildren(...result.Items.map(item => {
                    const card = document.createElement('button'); card.className = 'card';
                    card.dataset.id = item.Id; card.textContent = item.Name;
                    card.dataset.progress = String(item.UserData.PlaybackPositionTicks); return card;
                }));
                this.parentContainer.classList.toggle('hide', !result.Items.length);
                return result;
            }
        }
        if (!settings.native) customElements.define('emby-itemscontainer', Items, {extends: 'div'});
        const view = document.querySelector('.view'), root = view.querySelector('.sections');
        const config = Object.assign({layoutMs: 15, fastMs: 25, slowMs: 220, count: 2, ignoreAbort: false}, settings);
        const calls = [], held = [], modules = new Map(); let user = 'synthetic-user', generation = 1;
        const api = {serverId: () => 'synthetic-server', getCurrentUserId: () => user, isLoggedIn: () => !!user,
            serverVersion: () => '4.10.0.40', getCurrentLocale: () => 'zh-CN', _identityEpoch: 0,
            getUrl: (route, query) => ({route, query}), getCurrentUser: () => Promise.resolve({Id: user}),
            getJSON(request, signal) {
                const layout = request.route.endsWith('/HomeSections'), index = layout ? -1 : Number(request.route.split('/Sections/')[1].split('/')[0]);
                const ownedGeneration = generation;
                calls.push({kind: layout ? 'layout' : 'items', index, start: performance.now()});
                return new Promise((resolve, reject) => {
                    let settled = false, timer;
                    function finish() {
                        if (settled) return; settled = true;
                        signal?.removeEventListener('abort', cancel);
                        if (!layout && config.errorRow === index) return reject(Error('synthetic row failure'));
                        if (layout) return resolve(Array.from({length: config.count}, (_, i) => ({Id: String(i), Name: 'Section ' + i,
                            SectionType: config.sectionTypes?.[i] || (i === 1 ? 'resume' : 'latestmedia'), Monitor: ['videoplayback', 'markplayed']})));
                        resolve({Items: Array.from({length: config.native ? (config.nativeItems ?? 3) : 8}, (_, i) => ({Id: index + '-' + i, Name: 'Synthetic ' + index + '-' + i, ServerId: 'synthetic-server',
                            Type: 'Movie', MediaType: 'Video', PrimaryImageAspectRatio: 16/9, RunTimeTicks: 1000,
                            ImageUrl: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#386a83"/><circle cx="160" cy="90" r="35" fill="#cda76d"/></svg>'),
                            UserData: {PlaybackPositionTicks: ownedGeneration * (config.native ? 100 : 1), PlayedPercentage: ownedGeneration * 10}})), TotalRecordCount: config.native ? (config.nativeItems ?? 3) : 8});
                    }
                    function cancel() { if (config.ignoreAbort) return; if (settled) return; settled = true; clearTimeout(timer); reject(new DOMException('retired', 'AbortError')); }
                    signal?.addEventListener('abort', cancel, {once: true});
                    if (layout && config.holdLayout || !layout && (config.holdAllItems || config.holdRow === index)) held.push(finish);
                    else timer = setTimeout(finish, layout ? config.layoutMs : index === 0 ? config.fastMs : config.slowMs);
                });
            }};
        const connection = {currentApiClient: () => api};
        function load(id) {
            if (id.startsWith('css!')) return {};
            if (!modules.has(id) && !Object.hasOwn(input, id) && Object.hasOwn(input, id + '.js')) id += '.js';
            if (modules.has(id)) return modules.get(id);
            let result; const exports = {};
            window.define = (deps, factory) => { result = factory(...deps.map(dep => {
                if (dep === 'exports') return exports;
                if (dep.startsWith('.')) { const segments = id.split('/').slice(0, -1).concat(dep.split('/')), normalized = [];
                    for (const segment of segments) { if (segment === '..') normalized.pop(); else if (segment !== '.') normalized.push(segment); }
                    return load(normalized.join('/')); }
                return load(dep);
            })) || exports; };
            window.define.amd = {};
            (0, eval)(input[id] + '\n//# sourceURL=' + id);
            modules.set(id, result); return result;
        }
        for (const id of ['modules/cardbuilder/cardbuilder.js', 'modules/layoutmanager.js', 'modules/common/globalize.js',
            'modules/approuter.js', 'modules/emby-elements/emby-button/emby-button.js']) modules.set(id, {default: {}});
        const events = load('modules/emby-apiclient/events.js').default;
        if (settings.native) (0,eval)(input.nativeSetup)({modules,load,api,connection,input});
        const owner = {view, sectionsContainer: root, params: {tab: 'home'}, addFocusBehavior() {}};
        const controller = load('enhanced/home/home-tab.js').default.create(owner, {
            document, connection, events, layout: {tv: true}, cards: settings.native ? load('modules/cardbuilder/cardbuilder.js').default : {}, globalize: {getCurrentLocale: () => 'zh-CN'},
            homeFlowOptions: {mode},
            pageCacheOptions: settings.cache ? {enabled: true, ttlMs: 10000, maxEntries: 2, maxBytes: 1048576} : undefined,
            loading: {show() { root.dataset.loading = 'true'; }, hide() { root.dataset.loading = 'false'; }},
            focus: {focus: element => element.focus({preventScroll: true}), autoFocus() {}},
            legacy: {loadSections(stage) { stage.textContent = 'Synthetic legacy'; return Promise.resolve(); }}
        });
        delete window.define;
        function visible(card) { return !!card.getClientRects().length && getComputedStyle(card).visibility !== 'hidden'; }
        window.trial = {controller, owner, api, events, connection, config, calls,
            bump() { generation++; }, release() { held.splice(0).forEach(fn => fn()); },
            setUser(value) { user = value; api._identityEpoch++; events.trigger(connection, value ? 'localusersignedin' : 'localusersignedout'); },
            snapshot() { const cards = [...root.querySelectorAll('.itemsContainer .card')].filter(visible); return {
                cards: cards.length, readyRows: [...root.querySelectorAll('.itemsContainer')].filter(x => !x.inert && x.querySelector('.card') && visible(x.querySelector('.card'))).length,
                loading: root.dataset.loading, rows: root.querySelectorAll('.verticalSection').length,
                progress: cards.filter(x => !x.closest('[inert]')).map(x => x.dataset.progress), scroll: view.scrollTop, focused: document.activeElement?.dataset.id || null,
                pendingRows: root.querySelectorAll('[aria-busy="true"]').length
            }; },
            async measure(returning) {
                if (returning) { view.scrollTop = 140; root.querySelector('.itemsContainer .card')?.focus({preventScroll: true}); controller.pause(); }
                const before = root.firstChild, started = performance.now(), beforeCalls = calls.length;
                let firstVisible = null, firstInteractive = null, frames = 0, blankFrames = 0, keep = true;
                const tick = () => {
                    if (!keep) return; frames++;
                    const bounds = view.getBoundingClientRect();
                    const candidates = [...root.querySelectorAll('.itemsContainer .card')].filter(card => {
                        const box = card.getBoundingClientRect();
                        return visible(card) && box.bottom > bounds.top && box.top < bounds.bottom && box.right > bounds.left && box.left < bounds.right;
                    });
                    if (candidates.length) firstVisible ??= performance.now() - started; else blankFrames++;
                    if (candidates.some(card => !card.closest('[inert]'))) firstInteractive ??= performance.now() - started;
                    requestAnimationFrame(tick);
                };
                requestAnimationFrame(tick);
                const work = controller.resume({autoFocus: true});
                const immediate = this.snapshot();
                const result = await work, settledMs = performance.now() - started;
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                keep = false;
                return {status: result.status, firstVisibleMs: firstVisible, firstInteractiveMs: firstInteractive, settledMs,
                    frames, blankFrames, reusedStage: before !== null && before === root.firstChild, immediate,
                    final: this.snapshot(), requests: calls.slice(beforeCalls).map(x => ({kind: x.kind, index: x.index}))};
            }
        };
        window.trial.runtime = {load, modules, input, view, root, mode};
    }, {input, mode, settings});
    return page;
}
module.exports = {sources, openTrial};
