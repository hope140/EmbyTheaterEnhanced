'use strict';
const {temporaryRoot} = require('./helpers/range-fixture-root.cjs');
// Integration evidence only: real Alameda/PM/queue/adapter/service/HTTP/store,
// with an explicitly synthetic helper clock and document. No native decode claim.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const {EventEmitter} = require('node:events'), {execFileSync} = require('node:child_process');
const tool = require('./helpers/next-prefix-alameda.cjs');
const rendererBoot = process.env.ETE_NEXT_PREFIX_RENDERER_BOOT_SOURCE ?
    require(path.resolve(process.env.ETE_NEXT_PREFIX_RENDERER_BOOT_SOURCE)).rendererBoot : tool.rendererBoot;
const {createService} = require('../src/electronapp/native-helper/service');
const repo = path.resolve(__dirname, '..');
const waitFor = async (predicate, detail) => {
    const deadline = Date.now() + 4000;
    while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert(predicate(), detail());
};
async function automaticCase(t, scenario) {
    const root = temporaryRoot('ete-alameda-next-', ['prefix', 'next-episode-prefix-v1', 'shared-byte-cache']), trace = [], timers = new Set(), documentTimers = new Set();
    let origin, mediaOrigin, restoreRequests, service, window, authority, unregisterCd2;
    let sharedStoreModule, sharedStoreOriginal, preparedSharedStore, releaseSharedStoreFactory, sharedStoreTransferred = false, sharedStoreFactoryCalls = 0;
    // Own cleanup before server/settings setup: one failed path check must not
    // leave HTTP/timers alive or hide the first error behind a later hook.
    t.after(async () => {
        const failures = [];
        const settle = async action => {try {await action();} catch (error) {failures.push(error);}};
        for (const timer of [...timers, ...documentTimers]) clearInterval(timer);
        releaseSharedStoreFactory?.();
        if (window?.prefixStop && scenario !== 'hold-exit') await settle(() => window.prefixStop());
        if (service) await settle(() => service.destroy());
        if (preparedSharedStore && !sharedStoreTransferred) await settle(() => preparedSharedStore.close());
        if (unregisterCd2) await settle(() => unregisterCd2());
        if (authority) await settle(() => authority.close());
        if (restoreRequests) restoreRequests();
        if (mediaOrigin && mediaOrigin !== origin) await settle(() => mediaOrigin.close());
        if (origin) await settle(() => origin.close());
        const payload = path.join(root, scenario === 'settings-next-play' ? 'next-episode-prefix-v1' : 'prefix');
        if (fs.existsSync(payload)) await settle(() => assert.deepEqual(fs.readdirSync(payload), ['owner']));
        await settle(() => fs.rmSync(root, {recursive: true, force: true}));
        if (failures.length) throw new AggregateError(failures, 'owned Alameda fixture cleanup failed');
    });
    const record = (type, data = {}) => trace.push({seq: trace.length, atMs: performance.now(), type, ...data});
    const fixtures = ['A', 'B'].map(id => {const file = id + '.avi'; fs.writeFileSync(path.join(root, file), Buffer.from(id.repeat(40))); return {file, size: 40, etag: '"synthetic-' + id + '"'};});
    const sourceAware = ['source-aware-natural', 'trusted-cd2-shared-ordinary'].includes(scenario);
    const trustedCd2 = scenario.startsWith('trusted-cd2'), sharedCase = ['trusted-cd2-shared', 'trusted-cd2-shared-ordinary'].includes(scenario),
        sharedColdCase = scenario === 'trusted-cd2-shared-cold-fallback', sharedMode = sharedCase || sharedColdCase,
        dateValidator = scenario === 'trusted-cd2-date-unproven', noValidator = scenario === 'trusted-cd2-no-validator';
    const unsupported = scenario === 'unsupported' || scenario === 'trusted-cd2-unsupported' || noValidator || dateValidator;
    const unsupportedReason = dateValidator ? 'date-capability-unproven' : noValidator ? 'etag-missing' : 'etag-weak';
    const holding = scenario.startsWith('hold-'), orderedNatural = ['natural', 'source-aware-natural', 'explicit-queue-autoplay-off', 'trusted-cd2'].includes(scenario), pendingNatural = scenario === 'hold-natural-eof';
    const plan = {out: root, fixtures, autoPlay: !['autoplay-off', 'explicit-queue-autoplay-off'].includes(scenario)};
    origin = await tool.fixtureServer(plan, record, {holdNext: holding || orderedNatural, holdStart: 8, unsupported, trustedCd2});
    mediaOrigin = trustedCd2 ? await tool.fixtureServer(plan, record, {holdNext: orderedNatural, holdStart: 8, requireUserAgent: 'Synthetic-CD2', unsupported, dateValidator, noValidator}) : origin;
    restoreRequests = holding || orderedNatural || sharedMode ? tool.observeOriginRequests(mediaOrigin.origin, record, {includeStringInputs: sharedMode}) : null;
    if (sharedMode) {
        // Observe real metadata ownership without replacing results, auth, or IO.
        sharedStoreModule = require('../src/electronapp/enhanced/shared-playback-cache/store');
        sharedStoreOriginal = sharedStoreModule.createStore;
        const observeStore = store => ({...store, async open(...args) {
                const item = args[0]?.item, started = performance.now();
                record('shared-store-open-start', {item});
                try {const key = await store.open(...args); record('shared-store-open-end', {item, elapsedMs: performance.now() - started}); return key;}
                catch (error) {record('shared-store-open-rejected', {item, elapsedMs: performance.now() - started}); throw error;}
            }});
        let observed;
        const expected = {root: path.join(root, 'shared-byte-cache'), currentBytes: 300 * 1024 * 1024,
                nextBytes: 100 * 1024 * 1024, maxPendingBytes: 2 * 1024 * 1024, recoveryMode: 'on-demand'};
        preparedSharedStore = await sharedStoreOriginal(expected);
        let gate = Promise.resolve();
        if (sharedColdCase) gate = new Promise(resolve => {releaseSharedStoreFactory = resolve;});
        record('fixture-ready-backend', {empty: preparedSharedStore.status().committed === 0,
                currentBytes: expected.currentBytes, nextBytes: expected.nextBytes, recoveryMode: expected.recoveryMode});
        observed = async options => {
            sharedStoreFactoryCalls++;
            assert.equal(sharedStoreFactoryCalls, 1, 'one adapter writer factory owns the prepared backend');
            assert.equal(options.root, expected.root);
            assert.equal(options.currentBytes, expected.currentBytes, 'factory budget must come from the actual M read');
            assert.equal(options.nextBytes, expected.nextBytes, 'factory P budget must match the selected 100 MiB policy');
            assert.equal(options.maxPendingBytes, expected.maxPendingBytes);
            assert.equal(options.recoveryMode, expected.recoveryMode);
            record('shared-backend-factory-enter', {currentBytes: options.currentBytes, nextBytes: options.nextBytes, held: sharedColdCase});
            await gate;
            sharedStoreTransferred = true;
            record('shared-backend-factory-transfer', {uniqueWriter: true});
            return observeStore(preparedSharedStore);
        };
        sharedStoreModule.createStore = observed;
        t.after(() => {if (sharedStoreModule.createStore === observed) sharedStoreModule.createStore = sharedStoreOriginal;});
    }
    const managerFile = path.join(root, 'playbackmanager.js');
    fs.copyFileSync(path.join(repo, 'vendor/web-snapshot/www/modules/common/playback/playbackmanager.js'), managerFile);
    execFileSync(process.execPath, [path.join(repo, 'tools/patch-playbackmanager.cjs'), managerFile]);
    let listener, generation = 0;
    const contexts = new Map(), clients = [], settingsHandlers = new Map(), ipcListeners = new Map();
    const settingsCase = scenario === 'settings-next-play';
    const settings = require('../src/electronapp/enhanced/playback-range-user-settings');
    const preferences = settingsCase ? settings.createStore({profileRoot: root}) : null;
    class Window extends EventEmitter {
        constructor() {super(); this.webContents = Object.assign(new EventEmitter(), {isDestroyed: () => false, send: (_channel, value) => listener?.(value)}); this.destroyed = false;}
        getBounds() {return {x: 0, y: 0, width: 320, height: 180};} setBounds() {} setMenu() {} loadURL() {return Promise.resolve();}
        getNativeWindowHandle() {const value = Buffer.alloc(8); value.writeBigUInt64LE(1n); return value;}
        isDestroyed() {return this.destroyed;} isVisible() {return false;} isMinimized() {return false;} hide() {} showInactive() {} moveTop() {}
        destroy() {this.destroyed = true; this.emit('closed');}
    }
    class SyntheticClient {
        constructor(options) {this.options = options; this.currentGenerationId = null; this.exited = false; this.handshake = {helperVersion: 'SYNTHETIC', libmpvVersion: 'SYNTHETIC', capabilities: ['preview-snapshot-v1']}; this.properties = {}; clients.push(this);}
        async start() {return this;}
        beginGeneration() {this.currentGenerationId = ++generation; return generation;}
        allocateGenerationId() {return ++generation;}
        retireGeneration() {clearInterval(this.clock); this.currentGenerationId = null;}
        command() {}
        submitCommand(args) {
            if (sharedMode && Array.isArray(args) && args.length === 4 && args[0] === 'expand-properties' && args[1] === 'set' &&
                args[2] === 'user-data/emby-theater-enhanced/diagnostics/cache-bytes' && args[3] === '${=demuxer-max-bytes}') {
                const value = String(300 * 1024 * 1024);
                this.properties[args[2]] = value;
                record('synthetic-M-source', {source: 'SyntheticClient.submitCommand/getProperty', bytes: Number(value),
                    command: 'expand-properties/set/user-data/emby-theater-enhanced/diagnostics/cache-bytes/${=demuxer-max-bytes}'});
            }
        }
        setProperty(name, value) {this.properties[name] = value;}
        async getProperty(name) {
            if (sharedMode && name === 'demuxer-max-bytes') {
                // Native's MPV_FORMAT_NODE/INT64 path returns a JSON number.
                const bytes = Number(this.properties[name]);
                record('synthetic-M-source', {source: 'SyntheticClient.getProperty/Native-NODE', bytes, command: 'get/demuxer-max-bytes'});
                return bytes;
            }
            return this.properties[name] ?? false;
        }
        async request(method) {
            if (method !== 'preview-snapshot') return {attached: true};
            const frame = {ready: true, generationId: this.currentGenerationId, format: 'bgr24', width: 1, height: 1, pixels: Buffer.from([11, 22, 33]).toString('base64')};
            if (!this.deferPreview) return frame;
            return new Promise(resolve => {this.completePreview = () => resolve(frame);});
        }
        emit(name, value) {this.properties[name] = value; const event = {generationId: this.currentGenerationId, name, value}; record('synthetic-property', event); this.options.onEvent(event);}
        load(args) {
            const id = contexts.get(this.currentGenerationId) || /\/Videos\/([ABC])\//.exec(new URL(args[1]).pathname)?.[1], gen = this.currentGenerationId;
            const sharedProxyLoad = sharedMode && new URL(args[1]).origin !== mediaOrigin.origin;
            record('load', {item: id, generation: gen, source: args[1], ...(sharedMode ? {cacheDecision: {state: service.rangeStatus().current.state, diagnostic: service.rangeStatus().current.diagnostic || null}} : {}), ...(trustedCd2 ? {fileLocalOptions: args.slice(2)} : {})});
            const promise = (async () => {
                if (sharedMode && id === 'A' && sharedProxyLoad) {
                    // Lifecycle fixture only: product select/URL choice already
                    // completed. A's first original read starts after its real
                    // metadata key, so best-effort cold taps are not assumed.
                    await waitFor(() => trace.some(row => row.type === 'shared-store-open-end' && row.item === 'A'),
                        () => JSON.stringify({boundary: 'A-key-before-first-fixture-read', decision: service.rangeStatus().current.diagnostic || null}));
                    record('synthetic-fixture-boundary', {condition: 'A-key-before-first-fixture-read'});
                }
                if (sharedColdCase && id === 'A') {
                    assert.equal(new URL(args[1]).origin, mediaOrigin.origin, 'cold preparation timeout must keep A on its original CD2 URL');
                    record('synthetic-fixture-boundary', {condition: 'A-original-source-after-shared-prepare-timeout'});
                }
                const before = trace.length;
                const headers = {Range: 'bytes=0-7'};
                if (trustedCd2) {
                    // Model only the validated file-local UA from the original
                    // Native loadfile call, including its unproxied fallback.
                    assert.equal(args.length, 5); assert.equal(args[4], 'user-agent=Synthetic-CD2');
                    headers['User-Agent'] = args[4].slice('user-agent='.length);
                }
                const response = await fetch(args[1], {headers});
                if (sharedColdCase && id === 'A') assert.equal(response.status, 206);
                if (dateValidator) {
                    assert.equal(response.status, 206); assert.equal(response.headers.get('etag'), null);
                    assert.equal(response.headers.get('last-modified'), 'Wed, 01 Jan 2020 00:00:00 GMT');
                    record('synthetic-date-response', {item: id, etagAbsent: true, lastModifiedPresent: true});
                }
                assert.equal(Buffer.from(await response.arrayBuffer()).toString(), id.repeat(8));
                record('synthetic-read', {item: id, before});
                if (sharedColdCase && id === 'A') {
                    assert.equal(sharedStoreFactoryCalls, 1, 'cold cache factory started before original A playback read');
                    releaseSharedStoreFactory();
                    record('synthetic-fixture-boundary', {condition: 'A-original-read-before-backend-transfer'});
                }
                if (id === 'B' && pendingNatural) {
                    assert.equal(Buffer.from(await (await fetch(args[1], {headers: {Range: 'bytes=8-15'}})).arrayBuffer()).toString(), id.repeat(8));
                    record('synthetic-miss-read', {item: id, start: 8, end: 15});
                }
                this.emit('duration', 8); this.emit('time-pos', 0); this.emit('core-idle', false);
                if (id === 'B') return;
                let position = 0, aBufferConfirmed = false;
                this.clock = setInterval(() => {
                    if (this.currentGenerationId !== gen) {clearInterval(this.clock); return;}
                    if (trustedCd2) record('trusted-cache-occupancy', {bytes: service.rangeStatus().diskBytes});
                    if (sharedMode) record('shared-cache-occupancy', {bytes: service.rangeStatus().diskBytes});
                    if (sharedMode && sharedProxyLoad && position >= 5.4 && !aBufferConfirmed) {
                        if (service.rangeStatus().diskBytes !== 8) return;
                        aBufferConfirmed = true;
                        record('synthetic-fixture-boundary', {condition: 'A-buffer-confirmed-before-70-percent', bytes: 8});
                    }
                    if (sharedMode && position >= 7.6 && !trace.some(row => row.type === 'preload-result' && row.state === 'ready')) return;
                    if ((orderedNatural || pendingNatural) && position >= 7.6) {
                        // Synthetic clock precondition only; actual renderer/service/HTTP
                        // must still discover and warm the original queue candidate.
                        if (!mediaOrigin.held) return;
                        if (orderedNatural) {
                            if (!mediaOrigin.held.completed) {record('synthetic-clock-boundary', {condition: 'complete-origin-before-eof'}); mediaOrigin.completeHeld();}
                            if (!trace.some(row => row.type === 'preload-result' && row.state === 'ready')) return;
                        }
                    }
                    position = Math.min(orderedNatural || pendingNatural || sharedMode || scenario === 'autoplay-off' ? 8 : 7.6, position + 0.2); this.emit('time-pos', position);
                    if (position >= 8) {clearInterval(this.clock); this.emit('eof-reached', true);}
                }, 10); timers.add(this.clock);
            })();
            return {generationId: gen, promise};
        }
        async stop() {clearInterval(this.clock); this.currentGenerationId = null;}
        async kill() {await this.stop(); this.exited = true;}
    }
    const main = new Window();
    if (trustedCd2) authority = require('../src/electronapp/enhanced/preload-source-authority').createAuthority();
    service = createService({electron: {BrowserWindow: Window}, NativeHelperClient: SyntheticClient, fs: {existsSync: () => true},
        sourceAuthority: authority,
        logger: value => {if (sharedMode && value.category === 'preload') record('service-preload-diagnostic', require('../src/electronapp/enhanced/playback-range-diagnostics').snapshot(value.details));},
        getMainWindow: () => main, getWebContents: () => main.webContents, execFile: (_file, _args, _options, callback) => {callback(null); return {kill() {}};},
        runtimeRoot: root, getRangeCacheConfig: settingsCase ? () => preferences.runtimeConfig() : undefined,
        rangeCache: settingsCase ? undefined : sourceAware ? {kind: 'source-aware', root: path.join(root, 'prefix'), sharedRoot: path.join(root, 'shared-byte-cache'),
            progressPercent: 70, preloadMB: 100, timeoutMs: 1000, ...(sharedMode ? {} : {blockBytes: 8, onPrefixRead: value => record('prefix-read', value)})} : sharedMode ? {kind: 'shared-byte-trial', root: path.join(root, 'shared-byte-cache'),
            progressPercent: 70, preloadMB: 100, timeoutMs: 1000} : {...tool.CONFIG, blockBytes: 8, root: path.join(root, 'prefix'), onPrefixRead: value => record('prefix-read', value)}});
    const trusted = require('./helpers/trusted-renderer.cjs');
    main.webContents.mainFrame = {url: trusted.appUrl};
    if (trustedCd2) {
        const cd2 = require('../src/electronapp/enhanced/cd2-service'), cd2Ipc = require('../src/electronapp/enhanced/cd2-ipc');
        const rule = {id: 'synthetic-cloud', sourcePrefix: 'X:\\Media', mountPrefix: 'X:\\Media', cloudPrefix: '/cloud/media',
            storageType: 'cloud-mount', strategy: 'cloud-first', order: ['direct-url', 'cd2-http', 'mount', 'native'], originState: 'USER', enabled: true};
        const transport = {metadata: {}, status: {CANCELLED: 1, NOT_FOUND: 5, DEADLINE_EXCEEDED: 4, UNAVAILABLE: 14}, client: {
            waitForReady(_deadline, callback) {callback(null);}, close() {record('synthetic-cd2-close');},
            FindFileByPath(request, _metadata, _options, callback) {
                const item = /([ABC])\.avi$/.exec(request.path)?.[1];
                record('synthetic-cd2-rpc', {method: 'FindFileByPath', item});
                assert(item, 'original CD2 mapping must retain the real AVI source path');
                callback(null, {fullPathName: request.path, size: '40', fileType: 'File', isDirectory: false}); return {cancel() {}};
            },
            GetDownloadUrlPath(request, _metadata, _options, callback) {
                const item = /([ABC])\.avi$/.exec(request.path)?.[1];
                record('synthetic-cd2-rpc', {method: 'GetDownloadUrlPath', item, direct: request.get_direct_url});
                callback(null, {directUrl: mediaOrigin.origin + '/Videos/' + item + '/stream.avi?sig=synthetic', userAgent: 'Synthetic-CD2', expiresIn: '60'});
                return {cancel() {}};
            }
        }};
        const cd2Service = cd2.createService({sourceAuthority: authority, transportFactory: () => transport,
            config: {enabled: true, origin: mediaOrigin.origin, token: 'synthetic-memory-only', rules: [rule], directUrlEnabled: true}});
        unregisterCd2 = cd2Ipc.register({sourceAuthority: authority, service: cd2Service, getWebContents: () => main.webContents,
            ipcMain: {handle: (name, fn) => settingsHandlers.set(name, fn), on: (name, fn) => ipcListeners.set(name, fn),
                removeHandler: name => settingsHandlers.delete(name), removeAllListeners: name => ipcListeners.delete(name)}});
        settingsHandlers.set('enhanced-strm-config-get', () => {
            record('resolver-config', {strategy: 'cloud-first'});
            return {version: 1, enabled: true, cd2: {enabled: true, origin: mediaOrigin.origin, tokenConfigured: true, directUrlEnabled: true}, rules: [rule]};
        });
    }
    if (settingsCase) settings.register({ipcMain: {handle: (name, fn) => settingsHandlers.set(name, fn), removeHandler: name => settingsHandlers.delete(name)},
        store: preferences, getWebContents: () => main.webContents, getRuntimeStatus: () => service.rangeStatus(), applyRuntimeSettings: () => service.applyRangeSettings()});
    const eventTarget = new EventTarget();
    const body = {insertBefore(element) {element.parentNode = body;}, removeChild(element) {element.parentNode = null;}, firstChild: null};
    const document = {body, querySelector: () => null};
    window = {document, console: {log() {}, warn() {}, error() {}}, URL, AbortController, TextDecoder, Event, CustomEvent,
        setTimeout, clearTimeout, setInterval(callback, ms) {const timer = setInterval(callback, ms === 500 ? 20 : ms); documentTimers.add(timer); return timer;}, clearInterval,
        addEventListener: eventTarget.addEventListener.bind(eventTarget), removeEventListener: eventTarget.removeEventListener.bind(eventTarget), dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget), localStorage: {getItem: () => null, setItem() {}},
        innerWidth: 320, innerHeight: 180, MutationObserver: class {observe() {} disconnect() {}}, screen: {width: 640, height: 480}, fetch,
        prefixHarness: {report: row => record(row.type, row), source(member) {
            if (member === 'www/modules/common/playback/playbackmanager.js') return fs.readFileSync(managerFile, 'utf8');
            return fs.readFileSync(path.join(repo, member.startsWith('www/') ? 'vendor/web-snapshot' : 'src/electronapp', member), 'utf8');
        }, async invoke(_channel, request) {
            if (_channel === 'enhanced-download-lookup') return {status: 'miss'};
            if (settingsHandlers.has(_channel)) {
                if (_channel === 'enhanced-cd2-resolve') record('cd2-resolve-ipc', {requestId: request.requestId, mode: request.mode});
                const result = await settingsHandlers.get(_channel)(trusted.eventFor(main.webContents), request);
                if (_channel === settings.CHANNELS.SAVE) record('range-settings-saved', {status: result.status, applyMode: result.applyMode, applyError: result.applyError || null});
                if (_channel === 'enhanced-cd2-resolve') record('cd2-resolve-result', {status: result.status, sourceKind: result.sourceKind, privateProof: typeof result.sourceProof === 'string'});
                return result;
            }
            record('ipc', {operation: request.operation});
            if (request.operation === 'range-context' && request.payload.context) contexts.set(request.payload.generationId, request.payload.context.itemId);
            if (sharedMode && request.operation === 'command' && request.payload?.data?.[0] === 'loadfile') record('shared-select-start', {item: contexts.get(request.payload.generationId)});
            const result = await service.call(request.operation, request.payload, request.endpointId);
            if (request.operation === 'range-preload') record('preload-result', result.value);
            return result;
        }, send(channel, request) {
            if (ipcListeners.has(channel)) ipcListeners.get(channel)(trusted.eventFor(main.webContents), request);
            if (channel === 'enhanced-native-helper-notify') service.notify(request.operation, request.payload, request.endpointId);
            if (channel === 'enhanced-diagnostics-log' && request.category === 'preload') record('preload-diagnostic', request.details);
        }, listen(callback) {listener = callback;}, unlisten() {listener = null;}}};
    window.window = window; vm.createContext(window);
    document.createElement = name => {
        if (name !== 'script') return {style: {}, classList: {add() {}, remove() {}}, parentNode: null};
        const listeners = new Map();
        return {addEventListener(name, callback) {listeners.set(name, [...(listeners.get(name) || []), callback]);}, fire(name) {for (const callback of listeners.get(name) || []) callback();}};
    };
    document.head = {appendChild(script) {
        script.src = new URL(script.src, 'file:///fixture/electronapp/www/').href;
        const member = new URL(script.src).pathname.split('/electronapp/')[1];
        queueMicrotask(() => {try {vm.runInContext(window.prefixHarness.source(member), window, {filename: member}); script.fire('load');} catch (error) {record('script-error', {member, error: error.message}); script.fire('error');}});
    }};
    await vm.runInContext('(' + rendererBoot.toString() + ')(' + JSON.stringify({origin: origin.origin, windowId: '1', singleItem: scenario === 'autoplay-off', moduleBaseUrl: 'file:///fixture/electronapp/www/',
        ...(sharedMode ? {cacheBytes: 300 * 1024 * 1024} : {})}) + ')', window);
    const details = () => JSON.stringify(trace.slice(-30));
    assert(!trace.some(row => row.type === 'renderer-failure'), details());
    if (scenario === 'trusted-cd2-stop-report') {
        await waitFor(() => trace.some(row => row.type === 'synthetic-property' && row.name === 'core-idle' && row.value === false), details);
        await waitFor(() => trace.some(row => row.type === 'server-report' && row.method === 'start' && row.item === 'A'),
            () => 'normal-play-start-report-missing: ' + details());
        const managerStart = trace.find(row => row.type === 'stop-stage' && row.operation === 'manager-start');
        assert.equal(managerStart, undefined, details());
        await window.prefixStop();
        const stopRequested = trace.find(row => row.type === 'stop-stage' && row.operation === 'manager-start');
        const starts = trace.filter(row => row.type === 'server-report' && row.method === 'start' && row.item === 'A');
        const stops = trace.filter(row => row.type === 'server-report' && row.method === 'stop' && row.item === 'A');
        assert.equal(starts.length, 1, details());
        assert.equal(stops.length, 1, details());
        assert(stopRequested && stops[0].seq > stopRequested.seq, details());
        for (const report of [...starts, ...stops]) {
            assert.equal(report.session, 'synthetic-session-A');
            assert.equal(report.mediaSource, 'A-avi');
        }
        assert(!trace.some(row => row.type === 'synthetic-property' && row.name === 'eof-reached'), details());
        assert(!trace.some(row => row.type === 'manager-next-track'), details());
        assert.equal(trace.filter(row => row.type === 'load' && row.item === 'A').length, 1);
        assert.equal(trace.filter(row => row.type === 'load' && row.item === 'B').length, 0);
        return;
    }
    if (settingsCase) {
        window.navigator = {hardwareConcurrency: 4, deviceMemory: 1}; window.CSS = {supports: () => false};
        for (const id of ['modules/dom.js', 'modules/layoutmanager.js', 'modules/browser.js']) window.define(id, [], () => ({default: {tv: false}}));
        window.define('loading', [], () => ({hide() {}}));
        window.define('baseView', [], () => window.require(['modules/viewmanager/baseview.js']).then(values => values[0].default));
        for (const id of ['emby-select', 'emby-checkbox', 'emby-input', 'emby-button', 'emby-scroller']) window.define(id, [], () => ({}));
        const Controller = (await window.require(['../plugins/mpvplayer/video.js']))[0];
        class Node extends EventTarget {
            constructor() {super(); this.value = ''; this.checked = false; this.disabled = false; this.textContent = ''; this.classList = {toggle() {}, add() {}, remove() {}};}
            closest() {return {classList: this.classList};}
        }
        const html = fs.readFileSync(path.join(repo, 'src/electronapp/plugins/mpvplayer/video.html'), 'utf8');
        const selectors = ['form', ...[...html.matchAll(/class="([^"]+)"/g)].map(match => '.' + match[1].split(/\s+/)[0])];
        const nodes = Object.fromEntries(selectors.map(name => [name, new Node()]));
        const view = new Node(); view.getAttribute = () => null;
        view.querySelector = name => nodes[name] || null; view.querySelectorAll = () => [nodes['.chkRangeEnabled'], nodes['.chkRetainPlayback'], nodes['.selectRangeProgress'], nodes['.selectRangePreload']];
        const page = new Controller(view); await page.onResume({refresh: true});
        await waitFor(() => !nodes['.chkRangeEnabled'].disabled, details);
        assert.equal(nodes['.selectRangeProgress'].value, '70'); assert.equal(nodes['.selectRangePreload'].value, '300'); assert.equal(nodes['.chkRangeEnabled'].checked, false);
        assert(trace.some(row => row.type === 'synthetic-property' && row.name === 'core-idle' && row.value === false), details());
        const before = clients[0].currentGenerationId, userBefore = await (await fetch(origin.origin + '/Users/anonymous')).json();
        nodes['.chkRangeEnabled'].checked = true; nodes['.chkRangeEnabled'].dispatchEvent(new Event('change'));
        await waitFor(() => trace.some(row => row.type === 'range-settings-saved' && row.status === 'saved'), details);
        const saved = trace.find(row => row.type === 'range-settings-saved');
        assert.equal(saved.applyMode,'next-play'); assert.equal(saved.applyError,null);
        assert.deepEqual(preferences.get(), {schema: 1, enabled: true, retainPlayback: false, progressPercent: 70, preloadMB: 300});
        assert.equal(service.rangeStatus().enabled, false); assert.equal(clients[0].currentGenerationId, before, 'Save does not retire the active native generation'); assert.equal(clients.length, 1); assert.equal(clients[0].exited, false);
        const manager = (await window.require(['playbackManager']))[0];
        await manager.stop(); record('manual-next-play');
        const items = await Promise.all(['A', 'B'].map(id => fetch(origin.origin + '/Users/anonymous/Items/' + id).then(response => response.json())));
        await manager.play({items, startIndex: 0, startPositionTicks: 0, fullscreen: false});
        assert.equal(service.rangeStatus().enabled, true); assert.equal(service.rangeStatus().maxBytes, (300 * 1024 * 1024));
        assert.equal(service.rangeStatus().preloadMB, 300); assert.equal(service.rangeStatus().progressPercent, 70);
        assert.notEqual(clients.at(-1).currentGenerationId, before);
        const userAfter = await (await fetch(origin.origin + '/Users/anonymous')).json();
        assert.equal(userAfter.Configuration.EnableNextEpisodeAutoPlay, userBefore.Configuration.EnableNextEpisodeAutoPlay);
        assert.deepEqual(fs.readdirSync(path.join(root, 'config')), ['playback-range.json']);
        assert(trace.some(row => row.type === 'module-loaded' && row.member === 'electronapp/www/modules/viewmanager/baseview.js'));
        page.onPause(); page.destroy(); return;
    }
    if (holding && !pendingNatural) {
        await waitFor(() => !!origin.held, details);
        assert.equal(service.rangeStatus().diskBytes, 8, 'the preceding block commits before a held partial second block');
        if (scenario === 'hold-replace') {
            await window.prefixAction('replace');
            await waitFor(() => service.rangeStatus().next.state === 'ready' && origin.held.response.destroyed, details);
            assert.equal(service.rangeStatus().diskBytes, 40);
            const closed = trace.find(row => row.type === 'origin-client-closed' && row.requestId === origin.held.requestId);
            assert(trace.some(row => row.type === 'origin-client-open' && row.item === 'C' && row.seq > closed.seq), details());
        } else if (scenario === 'hold-preempt') {
            const a = trace.find(row => row.type === 'load' && row.item === 'A');
            const response = await fetch(a.source, {headers: {Range: 'bytes=16-23'}}); assert.equal(await response.text(), 'A'.repeat(8));
            await waitFor(() => origin.held.response.destroyed, details);
            const closed = trace.find(row => row.type === 'origin-client-closed' && row.requestId === origin.held.requestId);
            assert(trace.some(row => row.type === 'origin-client-open' && row.item === 'A' && row.seq > closed.seq), details());
            await window.prefixAction('cancel');
        } else if (scenario === 'hold-exit') {
            const manager = (await window.require(['playbackManager']))[0];
            const owner = manager.getCurrentPlayer().getNativePreviewOwner({Id: 'A', ServerId: 'prefix-server'});
            assert(owner && service.isPreviewOwner(owner));
            const frame = await service.capturePreview(owner);
            assert.deepEqual([...frame.pixels], [11, 22, 33, 255], 'current 043 preview stays available while B warming is held');
            clients[0].deferPreview = true;
            const capture = service.capturePreview(owner); let exited = false;
            const closing = service.destroy().then(() => {exited = true;});
            await new Promise(resolve => setImmediate(resolve));
            assert.equal(exited, false, 'exit still waits for 043 owned preview work');
            await waitFor(() => origin.held.response.destroyed, details);
            clients[0].completePreview(); assert.equal(await capture, null, 'no preview pixels publish after destruction');
            await closing; assert.equal(exited, true);
        }
        else await window.prefixAction('cancel');
        await waitFor(() => origin.held.response.destroyed, details);
        assert.equal(origin.releaseHeld(), 0);
        assert(trace.filter(row => row.type === 'origin-client-open' && row.item !== 'A').every(row => row.backgroundActive <= 1), details());
        assert.equal(trace.filter(row => row.type === 'load').length, 1);
        assert(!trace.some(row => row.type === 'manager-next-track'), details());
        return;
    }
    if (unsupported) {
        await waitFor(() => trace.some(row => row.type === 'preload-diagnostic' && row.stage === 'current-probe' && row.reason === unsupportedReason), details);
        assert(trace.some(row => row.type === 'synthetic-property' && row.name === 'time-pos' && row.value >= 5.6), details());
        const load = trace.find(row => row.type === 'load' && row.item === 'A');
        assert(load.source.startsWith(mediaOrigin.origin + '/Videos/A/'));
        assert.equal(service.rangeStatus().current.state, 'original'); assert.equal(service.rangeStatus().diskBytes, 0);
        assert(!trace.some(row => row.type === 'origin-media' && row.item === 'B'), details());
        if (trustedCd2) {
            assert.equal(load.source, mediaOrigin.origin + '/Videos/A/stream.avi?sig=synthetic');
            assert.deepEqual(Array.from(load.fileLocalOptions), ['replace', '-1', 'user-agent=Synthetic-CD2']);
            assert(trace.some(row => row.type === 'synthetic-read' && row.item === 'A'), details());
            const threshold = trace.find(row => row.type === 'synthetic-property' && row.name === 'time-pos' && row.value >= 5.6);
            const decision = trace.find(row => row.type === 'preload-diagnostic' && row.stage === 'current-probe' && row.reason === unsupportedReason);
            assert(threshold.seq < decision.seq, details());
            const headers = trace.filter(row => row.type === 'trusted-origin-headers');
            assert(headers.length >= 2 && headers.every(row => row.validUserAgent && row.anonymous), details());
            assert(!trace.some(row => row.type === 'unexpected-emby-media' || row.type === 'next-playback-info' || row.type === 'ipc' && row.operation === 'range-preload'), details());
            assert.equal(trace.filter(row => row.type === 'load').length, 1);
            assert(!trace.some(row => row.type === 'manager-next-track'), details());
            console.log(JSON.stringify({type: 'next-prefix-node-chain-result', scenario, syntheticHelper: true, originalSourceAndUA: true, initialRead: true, reason: 'current-probe/' + unsupportedReason, nextOriginRequests: 0, diskBytes: 0}));
        }
        return;
    }
    if (scenario === 'autoplay-off') {
        await waitFor(() => trace.some(row => row.type === 'synthetic-property' && row.name === 'eof-reached'), details);
        await new Promise(resolve => setImmediate(resolve));
        assert(!trace.some(row => row.type === 'preload-result'), details());
        assert.equal(trace.filter(row => row.type === 'load').length, 1);
        assert(!trace.some(row => row.type === 'manager-next-track'), details());
        return;
    }
    if (sharedMode) {
        await waitFor(() => trace.some(row => row.type === 'synthetic-read' && row.item === 'B'), details);
        if (sourceAware) {assert.equal(service.rangeStatus().routing, 'source-aware'); assert.equal(service.rangeStatus().kind, 'shared-byte-trial');}
        const threshold = trace.find(row => row.type === 'synthetic-property' && row.name === 'time-pos' && row.value >= 5.6);
        const preload = trace.find(row => row.type === 'ipc' && row.operation === 'range-preload');
        const ready = trace.find(row => row.type === 'preload-result' && row.state === 'ready');
        const preloadResult = trace.find(row => row.type === 'preload-result');
        const eof = trace.find(row => row.type === 'synthetic-property' && row.name === 'eof-reached');
        const next = trace.find(row => row.type === 'manager-next-track');
        const loads = trace.filter(row => row.type === 'load'), bLoad = loads.find(row => row.item === 'B');
        const sharedStages = trace.filter(row => ['shared-backend-factory-enter', 'shared-backend-factory-transfer', 'load', 'synthetic-read',
            'ipc', 'preload-result', 'preload-diagnostic', 'synthetic-property', 'manager-next-track'].includes(row.type) &&
            (row.type !== 'synthetic-property' || row.name === 'time-pos' && row.value >= 5.6 || row.name === 'eof-reached') &&
            (row.type !== 'ipc' || row.operation === 'range-preload')).map(({seq, type, item, operation, state, bytes, diagnostic, details, stage, reason, name, value}) => ({seq, type, item, operation, state, bytes, diagnostic, details, stage, reason, name, value}));
        assert(threshold && eof && next && bLoad, JSON.stringify(sharedStages));
        assert(preload && ready, JSON.stringify(sharedStages));
        assert(threshold.seq < preload.seq && preload.seq < ready.seq && ready.seq < eof.seq && eof.seq < next.seq && next.seq < bLoad.seq, details());
        assert.equal(ready.bytes, 40);
        assert.equal(loads.length, 2);
        for (const load of loads) assert.deepEqual(Array.from(load.fileLocalOptions), ['replace', '-1', 'user-agent=Synthetic-CD2']);
        if (sharedCase) {
            for (const load of loads) {
                const routed = new URL(load.source);
                assert.equal(routed.hostname, '127.0.0.1');
                assert.notEqual(routed.origin, mediaOrigin.origin, 'strict shared case keeps both A and B on the authorized local proxy');
            }
        } else {
            const aLoad = loads.find(row => row.item === 'A');
            assert(aLoad && aLoad.source === mediaOrigin.origin + '/Videos/A/stream.avi?sig=synthetic', details());
            assert.equal(aLoad.cacheDecision.state, 'original');
            assert.deepEqual(aLoad.cacheDecision.diagnostic, {stage: 'current-probe', reason: 'timeout'});
            const factory = trace.find(row => row.type === 'shared-backend-factory-enter');
            const transfer = trace.find(row => row.type === 'shared-backend-factory-transfer');
            const aRead = trace.find(row => row.type === 'synthetic-read' && row.item === 'A');
            assert(factory && transfer && aRead && factory.seq < aLoad.seq && aLoad.seq < aRead.seq && aRead.seq < transfer.seq, details());
            assert.equal(sharedStoreFactoryCalls, 1);
            assert.equal(sharedStoreTransferred, true);
            assert.equal(trace.filter(row => row.type === 'shared-store-open-end' && row.item === 'A').length, 0,
                'cold A is explicitly not counted as a retained cache entry');
            assert(!trace.some(row => row.type === 'shared-cache-occupancy' && row.bytes === 48), details());
        }
        const mReads = trace.filter(row => row.type === 'synthetic-M-source');
        assert(mReads.length >= 2 && mReads.every(row => row.bytes === 300 * 1024 * 1024 &&
            row.source === 'SyntheticClient.getProperty/Native-NODE' &&
            row.command === 'get/demuxer-max-bytes'), details());
        const overlap = trace.find(row => row.type === 'shared-cache-occupancy' && row.seq > (ready?.seq ?? 0) && row.seq < eof.seq && row.bytes === 48);
        if (sharedCase) assert(overlap, 'the 8-byte A read and fully prepared 40-byte B coexist before ordinary EOF: ' + details());
        else assert.equal(overlap, undefined, 'cold A fallback does not claim an A cache hit or 48-byte overlap');
        const resolvedB = trace.find(row => row.type === 'synthetic-cd2-rpc' && row.item === 'B' && row.method === 'GetDownloadUrlPath');
        const negotiation = trace.find(row => row.type === 'next-playback-info' && row.item === 'B');
        assert(threshold.seq < negotiation.seq && negotiation.seq < resolvedB.seq && resolvedB.seq < preload.seq, details());
        assert(trace.filter(row => row.type === 'cd2-resolve-result').every(row => row.status === 'hit' && row.sourceKind === 'direct-url' && row.privateProof), details());
        assert(trace.filter(row => row.type === 'trusted-origin-headers').every(row => row.validUserAgent && row.anonymous), details());
        const freshB = trace.filter(row => row.type === 'origin-media' && row.item === 'B' && row.seq > eof.seq);
        assert(freshB.length > 0 && freshB.every(row => row.start === 0 && row.end === 0), details());
        assert(!trace.some(row => row.type === 'origin-media' && row.item === 'B' && row.seq > eof.seq && !(row.start === 0 && row.end === 0)), details());
        assert(!trace.some(row => row.type === 'prefix-read'), details());
        assert.equal(trace.filter(row => row.type === 'manager-next-track').length, 1);
        const persistedBytes = 40;
        await waitFor(() => service.rangeStatus().diskBytes === persistedBytes, details);
        await service.destroy();
        const recovered = await sharedStoreOriginal({root: path.join(root, 'shared-byte-cache'),
            currentBytes: 300 * 1024 * 1024, nextBytes: (100 * 1024 * 1024), recoveryMode: 'on-demand'});
        try {
            assert.equal(recovered.status().current, persistedBytes);
            assert.equal(recovered.status().next, 0);
            const data = await recovered.read(recovered.status().currentKey, 0, persistedBytes);
            assert.equal(data.toString(), 'B'.repeat(persistedBytes), 'destroy/reopen retains only naturally played B bytes');
        } finally {await recovered.close();}
        const selections = loads.map(load => {
            const start = trace.filter(row => row.type === 'shared-select-start' && row.item === load.item && row.seq < load.seq).at(-1);
            return {item: load.item, elapsedMs: start ? load.atMs - start.atMs : null, state: load.cacheDecision.state, diagnostic: load.cacheDecision.diagnostic};
        });
        const warmBStoreOpenMs = trace.filter(row => row.type === 'shared-store-open-end' && row.item === 'B' && row.seq > eof.seq).map(row => row.elapsedMs);
        const warmBProbeMs = trace.filter(row => row.type === 'origin-client-open' && row.item === 'B' && row.start === 0 && row.end === 0 && row.seq > eof.seq).map(open => {
            const close = trace.find(row => row.type === 'origin-client-closed' && row.clientRequest === open.clientRequest); return close ? close.atMs - open.atMs : null;
        });
        console.log(JSON.stringify({type: 'shared-byte-alameda-natural-result', scenario, syntheticHelper: true,
            nativeDll: false, exactSyntheticCurrentBytes: 300 * 1024 * 1024, preloadBytes: ready.bytes,
            ...(sharedCase ? {overlapDiskBytes: overlap.bytes} : {coldAFallback: true, nextPreloadRecovered: true, currentRouteRemainsOriginal: true, retainedABytes: 0}),
            freshActualBOriginRequests: freshB.length, persistedCurrentBytes: persistedBytes, nextBytesAfterReopen: 0,
            selectionMs: selections.find(value => value.item === 'B')?.elapsedMs ?? null,
            probeMs: warmBProbeMs[0] ?? null, storeOpenMs: warmBStoreOpenMs[0] ?? null,
            selections, warmBStoreOpenMs, warmBProbeMs}));
        return;
    }
    if (!orderedNatural && !pendingNatural) {
        await waitFor(() => trace.some(row => row.type === 'preload-result' && row.state === 'ready'), details);
        assert.equal(service.rangeStatus().diskBytes, 40);
        if (scenario === 'remove-candidate') {
            const manager = (await window.require(['playbackManager']))[0], queue = manager._playQueueManager;
            queue.removeFromPlaylist([queue.getNextItemInfo().item.PlaylistItemId]);
            await waitFor(() => service.rangeStatus().diskBytes === 0, details);
            assert(!trace.some(row => row.type === 'manager-next-track'), details());
        } else {
            await window.prefixStop(); await service.destroy();
            assert.equal(service.rangeStatus().diskBytes, 0);
            assert.deepEqual(fs.readdirSync(path.join(root, 'prefix')), ['owner']);
        }
        assert.equal(trace.filter(row => row.type === 'manager-play-invocation').length, 1);
        assert.equal(trace.filter(row => row.type === 'load').length, 1);
        return;
    }
    await waitFor(() => trace.some(row => row.type === 'synthetic-read' && row.item === 'B'), details);
    if (sourceAware) {assert.equal(service.rangeStatus().routing, 'source-aware'); assert.equal(service.rangeStatus().kind, 'next-prefix'); assert.equal(fs.existsSync(path.join(root, 'shared-byte-cache')), false);}
    assert.equal(trace.filter(row => row.type === 'manager-play-invocation').length, 1);
    const preload = trace.find(row => row.type === 'ipc' && row.operation === 'range-preload'), ready = trace.find(row => row.type === 'preload-result');
    const threshold = trace.find(row => row.type === 'synthetic-property' && row.name === 'time-pos' && row.value >= 5.6);
    const eof = trace.find(row => row.type === 'synthetic-property' && row.name === 'eof-reached'), next = trace.find(row => row.type === 'manager-next-track');
    const b = trace.find(row => row.type === 'load' && row.item === 'B');
    assert(threshold && preload && ready && eof && next && b, JSON.stringify(trace));
    if (pendingNatural) {
        await waitFor(() => trace.some(row => row.type === 'synthetic-miss-read' && row.item === 'B') && origin.held.response.destroyed, details);
        const held = trace.find(row => row.type === 'matrix-held'), closed = trace.find(row => row.type === 'origin-client-closed' && row.requestId === held.requestId);
        assert(threshold.seq < preload.seq && preload.seq < held.seq && held.seq < eof.seq && eof.seq < next.seq && next.seq < b.seq, details());
        assert.equal(ready.state, 'cancelled'); assert(ready.seq > eof.seq, details());
        assert(closed && closed.seq > eof.seq, details());
        assert(!trace.some(row => row.type === 'preload-result' && row.state === 'ready'), details());
        assert.equal(origin.releaseHeld(), 0);
        assert(trace.some(row => row.type === 'prefix-read' && row.itemId === 'B' && row.start === 0 && row.seq > b.seq), details());
        assert(trace.some(row => row.type === 'origin-media' && row.item === 'B' && row.start === 8 && row.end === 15 && row.seq > b.seq), details());
        assert(!trace.some(row => row.type === 'origin-media' && row.item === 'B' && row.start === 0 && row.end === 7 && row.seq > eof.seq), details());
        assert.equal(service.rangeStatus().diskBytes, 8, 'fallback misses do not accumulate current media');
        assert.equal(clients.at(-1).currentGenerationId, b.generation);
        assert(trace.filter(row => row.type === 'origin-client-open' && row.item !== 'A').every(row => row.backgroundActive <= 1), details());
        console.log(JSON.stringify({type: 'next-prefix-node-chain-result', scenario, syntheticHelper: true, heldBeforeEOF: true, cancelledAfterEOF: true, partialHit: true, missPassthrough: true, lateBytes: 0, currentBytes: 8}));
        return;
    }
    assert(threshold.seq < preload.seq && preload.seq < ready.seq && ready.seq < eof.seq && eof.seq < next.seq && next.seq < b.seq, details());
    assert.equal(ready.state, 'ready'); assert.equal(ready.bytes, 40);
    assert(trace.some(row => row.type === 'prefix-read' && row.itemId === 'B' && row.start === 0 && row.seq > b.seq), details());
    const fresh = trace.filter(row => row.type === 'origin-media' && row.item === 'B' && row.seq > eof.seq);
    assert(fresh.length > 0 && fresh.every(row => row.start === 0 && row.end === 0), details());
    assert(service.rangeStatus().diskBytes <= (100 * 1024 * 1024));
    if (trustedCd2) {
        const negotiation = trace.find(row => row.type === 'next-playback-info' && row.item === 'B');
        const resolvedB = trace.find(row => row.type === 'synthetic-cd2-rpc' && row.item === 'B' && row.method === 'GetDownloadUrlPath');
        assert(threshold.seq < negotiation.seq && negotiation.seq < resolvedB.seq && resolvedB.seq < preload.seq, details());
        assert(trace.some(row => row.type === 'resolver-config' && row.strategy === 'cloud-first'), details());
        assert(trace.filter(row => row.type === 'cd2-resolve-result').every(row => row.status === 'hit' && row.sourceKind === 'direct-url' && row.privateProof), details());
        assert(trace.filter(row => row.type === 'synthetic-cd2-rpc' && row.method === 'GetDownloadUrlPath').every(row => row.direct), details());
        for (const load of trace.filter(row => row.type === 'load')) {
            assert.deepEqual(Array.from(load.fileLocalOptions), ['replace', '-1', 'user-agent=Synthetic-CD2']);
            assert.match(new URL(load.source).pathname, /^\/range\//, 'both original Native loads use the authorized cache proxy');
        }
        const headers = trace.filter(row => row.type === 'trusted-origin-headers');
        assert(headers.length > 0 && headers.every(row => row.validUserAgent && row.anonymous), details());
        assert(!trace.some(row => row.type === 'unexpected-emby-media'), details());
        assert(trace.filter(row => row.type === 'origin-client-open' && row.item !== 'A').every(row => row.backgroundActive <= 1), details());
        assert(trace.filter(row => row.type === 'trusted-cache-occupancy').every(row => row.bytes >= 0 && row.bytes <= (100 * 1024 * 1024)), details());
        assert.equal(trace.filter(row => row.type === 'load').length, 2);
        assert.equal(trace.filter(row => row.type === 'manager-next-track').length, 1);

    }
    console.log(JSON.stringify({type: 'next-prefix-node-chain-result', scenario, syntheticHelper: true, threshold: threshold.seq, preload: preload.seq, ready: ready.seq, eof: eof.seq, next: next.seq, bLoad: b.seq, bytes: ready.bytes}));
}
for (const scenario of ['natural', 'source-aware-natural', 'hold-natural-eof', 'remove-candidate', 'app-exit-before-next', 'hold-cancel', 'hold-preempt', 'hold-replace', 'hold-exit', 'unsupported', 'autoplay-off', 'explicit-queue-autoplay-off', 'settings-next-play', 'trusted-cd2', 'trusted-cd2-unsupported', 'trusted-cd2-date-unproven', 'trusted-cd2-no-validator', 'trusted-cd2-shared', 'trusted-cd2-shared-ordinary', 'trusted-cd2-shared-cold-fallback', 'trusted-cd2-stop-report']) test('real Alameda automatic next-prefix with synthetic helper/document: ' + scenario, {timeout: 8000}, t => automaticCase(t, scenario));
