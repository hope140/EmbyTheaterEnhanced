'use strict';

// Hidden Electron integration fixture for the plugin UI compatibility adapter.
// All browser traffic is served from this process over loopback.
const {app, BrowserWindow, session} = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outputRoot = path.join(root, '.work');
const runId = `${Date.now()}-${process.pid}`;
const outputDir = path.join(outputRoot, `plugin-hidden-${runId}`);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'vendor/electron-runtime-manifest.json'), 'utf8'));
const electronPath = path.resolve(root, manifest.runtime.preparedPath, manifest.runtime.electronPath);
const vendorModules = path.join(root, 'vendor/carnival/electronapp/www/modules');
const adapterDir = path.join(root, 'src/electronapp/enhanced/plugin-ui');
const counters = {requests: 0, moduleRequests: 0, apiView: 0, apiCommand: 0, commandDataValid: 0, missingModule: 0, missingModuleClasses: {}, blockedExternal: 0};
let finished = false;
let server;
let win;
let stage = 'startup';

function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function expectedDateIso() {
    const midnightUtc = Date.parse('2026-03-04T00:00:00Z');
    return new Date(midnightUtc + new Date(midnightUtc).getTimezoneOffset() * 60000).toISOString();
}
function send(res, status, body, type = 'application/javascript; charset=utf-8') {
    res.writeHead(status, {'content-type': type, 'cache-control': 'no-store'});
    res.end(body);
}
function moduleFile(urlPath) {
    if (urlPath.startsWith('/fixtures/enhanced/plugin-ui/')) urlPath = `/modules/enhanced/plugin-ui/${urlPath.slice('/fixtures/enhanced/plugin-ui/'.length)}`;
    if (urlPath.startsWith('/fixtures/modules/')) urlPath = urlPath.slice('/fixtures'.length);
    if (urlPath.startsWith('/fixtures/www/modules/')) urlPath = urlPath.slice('/fixtures'.length);
    if (!urlPath.startsWith('/modules/') && !urlPath.startsWith('/www/modules/')) return null;
    const adapter = /^\/modules\/enhanced\/plugin-ui\/(genericui|schema|responsehelper|premierecontainer)\.js$/.exec(urlPath);
    if (adapter) return path.join(adapterDir, `${adapter[1] === 'responsehelper' ? 'responsehelper' : adapter[1]}.js`);
    const carnival = urlPath.startsWith('/modules/') ? urlPath.slice('/modules/'.length) : urlPath.slice('/www/modules/'.length);
    const full = path.resolve(vendorModules, carnival);
    return full.startsWith(vendorModules + path.sep) ? full : null;
}

function serve(req, res) {
    counters.requests++;
    const requestUrl = new URL(req.url, 'http://127.0.0.1');
    const route = requestUrl.pathname;
    if (route === '/fixtures/plugin-ui-hidden.html') {
        const html = fs.readFileSync(path.join(__dirname, 'fixtures/plugin-ui-hidden.html'));
        return send(res, 200, html, 'text/html; charset=utf-8');
    }
    if (route === '/fixtures/plugin-ui-hidden.js') {
        const js = fs.readFileSync(path.join(__dirname, 'fixtures/plugin-ui-hidden.js'));
        return send(res, 200, js);
    }
    if (route === '/api/UI/View' && req.method === 'GET') {
        counters.apiView++;
        const pageId = requestUrl.searchParams.get('PageId') || 'synthetic';
        if (pageId === 'late') return setTimeout(() => send(res, 200, JSON.stringify(page('late'))), 400);
        return send(res, 200, JSON.stringify(page(pageId)), 'application/json; charset=utf-8');
    }
    if (route === '/api/UI/Command' && req.method === 'POST') {
        counters.apiCommand++;
        let body = '';
        req.setEncoding('utf8');
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const command = JSON.parse(body);
                const data = typeof command.Data === 'string' ? JSON.parse(command.Data) : null;
                if (command.PageId === 'synthetic' && command.CommandId === 'PageSave' && data &&
                    data.text === 'edited text' && data.numeric === '17' && data.enabled === true && data.single === 'two' &&
                    data.multiple === 'red,blue' && data.date === expectedDateIso()) counters.commandDataValid++;
                send(res, 200, JSON.stringify(page('synthetic')), 'application/json; charset=utf-8');
            }
            catch (_) { send(res, 400, '{}', 'application/json; charset=utf-8'); }
        });
        return;
    }
    const file = moduleFile(route);
    if (file && fs.existsSync(file)) {
        counters.moduleRequests++;
        return send(res, 200, fs.readFileSync(file), path.extname(file).toLowerCase() === '.css' ? 'text/css; charset=utf-8' : undefined);
    }
    if (route.endsWith('.js')) {
        counters.missingModule++;
        const category = route.includes('/enhanced/plugin-ui/') ? 'adapter_path' : route.includes('/www/modules/') ? 'vendor_www_path' : route.includes('/modules/') ? 'vendor_modules_path' : route.includes('/fixture_missing_dependency') ? 'intentional_missing_dependency' : 'other_module_path';
        const key = category;
        counters.missingModuleClasses[key] = (counters.missingModuleClasses[key] || 0) + 1;
    }
    return send(res, 404, '');
}

function page(pageId) {
    const unsafe = '<img src=x onerror="window.__fixture.injected=true">';
    return {
        PageId: pageId, ViewId: `view-${pageId}`, Caption: 'Synthetic settings', SubCaption: 'Loopback fixture',
        EditObjectContainer: {
            EditorRoot: {EditorType: 'Group', EditorItems: [
                {Id: 'text', EditorType: 'Text', DisplayName: 'Text field', AllowEmpty: true},
                {Id: 'numeric', EditorType: 'Numeric', DisplayName: 'Numeric field', AllowEmpty: true},
                {Id: 'enabled', EditorType: 'Boolean', DisplayName: 'Enabled'},
                {Id: 'single', EditorType: 'SelectSingle', DisplayName: 'Single choice', SelectOptions: [{Name: 'One', Value: 'one', IsEnabled: true}, {Name: 'Two', Value: 'two', IsEnabled: true}]},
                {Id: 'multiple', EditorType: 'SelectMultiple', DisplayName: 'Multiple choice', SelectOptions: [{Name: 'Red', Value: 'red', IsEnabled: true}, {Name: 'Blue', Value: 'blue', IsEnabled: true}]},
                {Id: 'date', EditorType: 'Date', DisplayName: 'Date field', AllowEmpty: true},
                {Id: 'status', EditorType: 'StatusItem', DisplayName: 'Status'},
                {Id: 'action', EditorType: 'ButtonItem', DisplayName: 'Action'},
                {Id: 'label', EditorType: 'LabelItem', DisplayName: 'Safe label'},
                {Id: 'items', EditorType: 'ItemList', DisplayName: 'Safe list'}
            ], PropertyConditions: []},
            Object: {
                text: 'before', numeric: 3, enabled: false, single: 'one', multiple: 'red', date: '2026-01-02T00:00:00Z',
                status: {Status: 'Succeeded', Caption: 'Ready', StatusText: 'Synthetic status'},
                action: {Caption: 'Run synthetic command', Icon: 'play_arrow', IsEnabled: true, IsVisible: true, Data1: 'RunSynthetic'},
                label: {Text: unsafe, HyperLink: 'javascript:window.__fixture.injected=true', IsVisible: true},
                items: [{PrimaryText: unsafe, SecondaryText: unsafe, Tag: {Text: unsafe}, Icon: unsafe, HasPercentage: true, PercentComplete: pageId === 'malicious-progress' ? unsafe : 42, HyperLink: 'javascript:window.__fixture.injected=true'}]
            }, DefaultObject: {}
        },
        TabPageInfos: [{PageId: pageId, DisplayName: 'Home', Href: `./genericui?PageId=${encodeURIComponent(pageId)}`},
            {PageId: 'unsafe', DisplayName: unsafe, Href: 'https://invalid.example/'}],
        Commands: [{CommandType: 'PageSave', Caption: 'Save', IsVisible: true, IsEnabled: true},
            {CommandType: 'RunSynthetic', Caption: 'Run', IsVisible: true, IsEnabled: true}]
    };
}

function writeStatus(ok, assertionCount, detailClass, observations = {}) {
    if (finished) return;
    finished = true;
    const scripts = [
        path.join(vendorModules, 'alameda/alameda.js'), path.join(vendorModules, 'babelhelpers.js'),
        path.join(vendorModules, 'genericedit/genericedit.js'), path.join(vendorModules, 'viewmanager/baseview.js'),
        path.join(vendorModules, 'emby-apiclient/events.js'), path.join(vendorModules, 'dom.js'),
        path.join(vendorModules, 'emby-elements/emby-input/emby-input.js'),
        path.join(vendorModules, 'emby-elements/emby-button/emby-button.js'),
        path.join(vendorModules, 'emby-elements/emby-checkbox/emby-checkbox.js'),
        path.join(vendorModules, 'emby-elements/emby-scroller/emby-scroller.js'),
        path.join(vendorModules, 'emby-elements/emby-select/emby-select.js'),
        path.join(adapterDir, 'genericui.js'), path.join(adapterDir, 'schema.js'),
        path.join(adapterDir, 'responsehelper.js'), path.join(adapterDir, 'premierecontainer.js'),
        path.join(__dirname, 'plugin-ui-hidden-runner.cjs'),
        path.join(__dirname, 'fixtures/plugin-ui-hidden.html'), path.join(__dirname, 'fixtures/plugin-ui-hidden.js')
    ];
    const result = {
        status: ok ? 'PASS' : 'FAIL', synthetic: true, foreground_actions: 'NONE', electron_version: process.versions.electron,
        electron_exe_sha256: sha256(electronPath), scripts_sha256: Object.fromEntries(scripts.map(file => [path.relative(root, file).replace(/\\/g, '/'), sha256(file)])),
        assertions: assertionCount, failure_class: ok ? null : detailClass,
        observations,
        fixture_stubs: ['loopback synthetic API client', 'layout/browser/service/dialog notification shells', 'Alameda CSS loading disabled', 'static app CSS alias modules'],
        counters: {...counters},
        note: 'Counts and classifications only; no response bodies or raw error messages are recorded.'
    };
    fs.writeFileSync(path.join(outputDir, 'status.json'), JSON.stringify(result, null, 2), 'utf8');
    try { win && win.destroy(); } catch (_) {}
    try { server && server.close(); } catch (_) {}
    app.exit(ok ? 0 : 1);
}

fs.mkdirSync(outputDir, {recursive: true});
app.setPath('userData', path.join(outputDir, 'profile'));
app.setPath('sessionData', path.join(outputDir, 'session'));

const timeout = setTimeout(() => writeStatus(false, 0, 'timeout_45s'), 45000);
server = http.createServer(serve);
app.whenReady().then(() => {
    stage = 'listen';
    server.listen(0, '127.0.0.1', async () => {
    try {
        stage = 'browser_window';
        const address = server.address();
        const part = `persist:plugin-hidden-${runId}`;
        const isolatedSession = session.fromPartition(part, {cache: false});
        isolatedSession.webRequest.onBeforeRequest((details, callback) => {
            const allowed = details.url.startsWith(`http://127.0.0.1:${address.port}/`);
            if (!allowed) counters.blockedExternal++;
            callback({cancel: !allowed});
        });
        win = new BrowserWindow({show: false, width: 1050, height: 780, webPreferences: {session: isolatedSession, contextIsolation: false, nodeIntegration: false, sandbox: true}});
        win.on('show', () => { counters.unexpectedShow = (counters.unexpectedShow || 0) + 1; });
        win.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
        win.webContents.on('console-message', () => {});
        stage = 'load_fixture';
        await win.loadURL(`http://127.0.0.1:${address.port}/fixtures/plugin-ui-hidden.html`);
        stage = 'await_renderer';
        const deadline = Date.now() + 42000;
        let outcome;
        while (Date.now() < deadline && !finished) {
            outcome = await win.webContents.executeJavaScript('window.__fixtureResult || null').catch(() => null);
            if (outcome) break;
            await new Promise(resolve => setTimeout(resolve, 30));
        }
        clearTimeout(timeout);
        if (!outcome) return writeStatus(false, 0, 'renderer_result_unavailable');
        const transportEvidence = counters.apiCommand === 1 && counters.commandDataValid === 1 && counters.missingModule >= 1 && counters.blockedExternal === 0 && !counters.unexpectedShow;
        writeStatus(outcome.ok === true && transportEvidence, outcome.assertions || 0,
            outcome.ok === true ? (transportEvidence ? null : 'transport_evidence_incomplete') : outcome.failureClass || 'assertion_failed', outcome.observations || {});
    } catch (_) {
        clearTimeout(timeout);
        writeStatus(false, 0, `runner_${stage}`);
    }
    });
}).catch(() => writeStatus(false, 0, 'runner_app_ready'));

function shutdownTimeout() { clearTimeout(timeout); }
app.on('before-quit', shutdownTimeout);
