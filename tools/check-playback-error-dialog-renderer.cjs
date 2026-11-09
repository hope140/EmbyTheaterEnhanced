'use strict';

// Explicit material/browser regression. No product runtime, media, server or
// personal profile is started. Router/focus/service dependencies are synthetic;
// alert, dialog, dialogHelper, DOM, input manager and OSD functions are frozen
// sources. History traversal is Chromium's real asynchronous History API.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function between(source, start, end) {
    const begin = source.indexOf(start), finish = source.indexOf(end, begin + start.length);
    assert.ok(begin >= 0 && finish > begin, 'source anchors: ' + start);
    return source.slice(begin, finish);
}
function material() {
    const names = {dialog: 'modules/dialog/dialog.js', helper: 'modules/dialoghelper/dialoghelper.js',
        alert: 'modules/common/dialogs/alert.js', dom: 'modules/dom.js', input: 'modules/common/inputmanager.js',
        template: 'modules/dialog/dialog.template.html', osd: 'videoosd/videoosd.js', managerBase: 'modules/common/playback/playbackmanager.js'};
    const manifest = JSON.parse(read('vendor/runtime-manifest.json'));
    const sources = {}, provenance = {};
    for (const [key, name] of Object.entries(names)) {
        const source = read('vendor/web-snapshot/www/' + name), digest = hash(source);
        const row = manifest.files.find(item => item.path === 'electronapp/www/' + name);
        assert.ok(row, 'frozen manifest entry: ' + name);
        assert.equal(digest.toUpperCase(), row.sha256.toUpperCase(), 'frozen source hash: ' + name);
        sources[key] = source; provenance[name] = digest;
    }
    const ref = process.argv.find(arg => arg.startsWith('--patch-ref='))?.slice(12);
    const patcher = ref ? cp.execFileSync('git', ['show', ref + ':tools/patch-playbackmanager.cjs'], {cwd: root, encoding: 'utf8'}) : read('tools/patch-playbackmanager.cjs');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-error-dialog-'));
    try {
        fs.writeFileSync(path.join(temp, 'patch.cjs'), patcher);
        fs.copyFileSync(path.join(root, 'vendor/web-snapshot/www/modules/common/playback/playbackmanager.js'), path.join(temp, 'manager.js'));
        cp.execFileSync(process.execPath, [path.join(temp, 'patch.cjs'), path.join(temp, 'manager.js')]);
        sources.manager = fs.readFileSync(path.join(temp, 'manager.js'), 'utf8');
    } finally { fs.rmSync(temp, {recursive: true, force: true}); }
    provenance.patcher = hash(patcher); provenance.manager = hash(sources.manager);
    const dedicated = path.join(root, 'src/electronapp/enhanced/playback-error-dialog.js');
    if (fs.existsSync(dedicated)) { sources.dedicated = fs.readFileSync(dedicated, 'utf8'); provenance.dedicated = hash(sources.dedicated); }
    sources.show = between(sources.manager, '  function showPlaybackInfoErrorMessage(', '  function normalizePlayOptions(');
    sources.after = between(sources.manager, '  function afterPlaybackErrorMessage(', '  function showPlaybackInfoErrorMessage(');
    sources.stopped = between(sources.osd, '    function onPlaybackStopped(e, state) {', '    function onMediaStreamsChanged(');
    sources.exit = between(sources.osd, 'VideoOsd.prototype.exit = function () {', '    (VideoOsd.prototype.resume').replace(/\),\s*$/, ';');
    return {sources, provenance, ref: ref || cp.execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim()};
}

async function open(browser, sources, animations = false) {
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://ete-dialog.invalid/**', route => route.fulfill({contentType: 'text/html', body: '<!doctype html><html><body><button id="prior">Prior focus</button></body></html>'}));
    await page.goto('http://ete-dialog.invalid/root');
    // Actual frozen close animation, shortened only for deterministic test speed.
    await page.addStyleTag({content: '.hide{display:none}.dialog-animated{animation:appear 10ms}.dialog-animated.dialog-close{animation:disappear 80ms}@keyframes appear{from{opacity:0}to{opacity:1}}@keyframes disappear{from{opacity:1}to{opacity:0}}'});
    await page.evaluate(({s, animations}) => {
        const t = window.trial = {backs: [], pushes: [], pops: [], closes: 0, closing: 0, exits: 0, next: 0, stops: 0, scopes: 0, manager: {_etePlayRequestSequence: 1}};
        history.replaceState({page: 'root'}, '', '/root');
        for (const name of ['home', 'detail', 'videoosd']) history.pushState({page: name}, '', '/' + name);
        const router = {pushState(state, title, url) {t.pushes.push(url); history.pushState(state, title, url);}, back() {t.backs.push(location.href); if (location.pathname === '/root') t.exits++; else history.back();}, show() {throw new Error('Unexpected link navigation');}};
        window.addEventListener('popstate', () => t.pops.push(location.href));
        const focus = {focus: el => el.isConnected && el.focus(), pushScope() {t.scopes++;}, popScope() {t.scopes--;}, autoFocus: el => el.querySelector('button')?.focus(), getCurrentScope: () => document.querySelector('.dialog:not(.hide)') || document.body};
        function load(source, dependencies) {
            let value;
            window.define = (names, factory) => {const out = {}; const result = factory(...names.map(name => name === 'exports' ? out : dependencies[name])); value = result === undefined ? out : result;};
            (0, eval)(source); return value;
        }
        window.require = () => Promise.resolve([]);
        const dom = load(s.dom, {'./common/textencoding.js': {default: {htmlEncode: x => x}}, './browser.js': {default: {}}}).default;
        // Disable only the animation capability for the no-animation matrix.
        if (!animations) dom.supportsEventListenerOnce = () => false;
        const manager = t.manager;
        manager.stop = () => t.stops++; manager.nextTrack = () => t.next++;
        const input = load(s.input, {'./../dom.js': {default: dom}, './../approuter.js': {default: router}, './playback/playbackmanager.js': {default: manager}, './../focusmanager.js': {default: focus}, './servicelocator.js': {appHost: {}}, './../emby-apiclient/events.js': {default: {on() {}}}}).default;
        const layout = {tv: false}, globalize = {translate: key => key, translateHtml: html => html};
        const helper = load(s.helper, {'./../approuter.js': {default: router}, './../dom.js': {default: dom}, './../focusmanager.js': {default: focus}, './../common/inputmanager.js': {default: input}, '../layoutmanager.js': {default: layout}}).default;
        const createDialog = helper.createDialog;
        helper.createDialog = options => {const dlg = createDialog(options); t.dialog = dlg; dlg.addEventListener('closing', () => t.closing++); dlg.addEventListener('close', () => t.closes++); return dlg;};
        window.require = () => Promise.resolve([s.template]);
        const dialog = load(s.dialog, {'./../layoutmanager.js': {default: layout}, './../common/globalize.js': {default: globalize}, './../approuter.js': {default: router}, './../dialoghelper/dialoghelper.js': {default: helper}, './../dom.js': {default: dom}, './../common/inputmanager.js': {default: input}}).default;
        const alert = load(s.alert, {'./../globalize.js': {default: globalize}, './../../dialog/dialog.js': {default: dialog}}).default;
        const dedicated = s.dedicated && load(s.dedicated, {dialogHelper: helper, globalize, layoutManager: layout, focusManager: focus, inputManager: input, 'text!modules/dialog/dialog.template.html': s.template});
        window.require = (names, callback) => {
            if (!callback) return Promise.resolve([s.template]);
            const deliver = () => callback(names[0] === 'alert' ? alert : dedicated);
            if (t.delayLoader) t.deliver = deliver; else deliver();
        };
        window._loading = {default: {hide() {}}}; window._globalize = {default: globalize};
        (0, eval)(s.after + '\n' + s.show);
        window._approuter = {default: router}; window.VideoOsd = function () {};
        (0, eval)(s.exit);
        const self = {enableBackOnStop: true, exit: () => VideoOsd.prototype.exit()};
        const noop = () => {};
        t.osdStop = new Function('self', 'resetUpNextDialog', 'resetRatingText', 'showHideSkipIntro', s.stopped + '; return onPlaybackStopped;')(self, noop, noop, noop);
        t.fail = () => showPlaybackInfoErrorMessage(manager, 'NoCompatibleStream', true, false);
        t.plain = () => alert({text: 'ordinary alert', title: 'ordinary'}).catch(() => {});
        t.command = () => input.handle('back', {sourceElement: t.dialog});
        t.back = () => input.handle('back', {sourceElement: document.body});
        t.confirm = () => t.dialog.querySelector('button').click();
        // Only the dialog owner is modeled here; admission itself is covered by
        // the full generated-manager tests, not by this browser harness.
        t.retire = () => {manager._etePlayRequestSequence++; retireEnhancedPlaybackErrorDialog(manager);};
    }, {s: sources, animations});
    return {page, errors};
}

async function main(executable = process.argv[2]) {
    if (!executable || !path.isAbsolute(executable)) throw new Error('Usage: node tools/check-playback-error-dialog-renderer.cjs <absolute Chromium executable> [--expect=regression] [--patch-ref=SHA]');
    const {sources, provenance, ref} = material();
    const browser = await require('playwright').chromium.launch({headless: true, executablePath: executable});
    const rows = [], checks = [];
    try {
        for (const order of ['early', 'late']) {
            const {page, errors} = await open(browser, sources);
            try {
                if (order === 'early') {
                    await page.evaluate(() => trial.osdStop({type: 'playbackstop'}, {}));
                    await page.waitForFunction(() => location.pathname === '/detail');
                    await page.evaluate(() => trial.fail());
                } else {
                    await page.evaluate(() => {trial.osdStop({type: 'playbackstop'}, {}); trial.fail();});
                    await page.waitForFunction(() => trial.pops.length === 1);
                }
                await page.waitForFunction(() => !!trial.dialog);
                await page.waitForTimeout(120); // Frozen helper installs backdrop listeners at 100ms.
                const before = await page.evaluate(() => ({url: location.href, original: trial.dialog.getAttribute('data-history'), open: !trial.dialog.classList.contains('hide'), pops: trial.pops.slice()}));
                for (let i = 0; i < 3; i++) {
                    await page.evaluate(() => trial.confirm());
                    await page.waitForTimeout(80);
                }
                const result = await page.evaluate(() => ({url: location.href, backs: trial.backs.length, closes: trial.closes, exits: trial.exits, open: !trial.dialog.classList.contains('hide'), next: trial.next}));
                rows.push({order, before, ...result});
                assert.deepEqual(errors, []);
            } finally { await page.close(); }
        }
        if (process.argv.includes('--expect=regression')) {
            assert.equal(rows[0].closes, 1, 'early return closes ordinary alert');
            assert.equal(rows[1].open, true, 'late traversal leaves the history alert open');
            assert.ok(rows[1].backs > 2, 'repeat confirmations traverse unrelated pages');
        } else {
            for (const row of rows) {assert.equal(row.backs, 1); assert.equal(row.closes, 1); assert.equal(row.open, false); assert.equal(row.url, 'http://ete-dialog.invalid/detail'); assert.equal(row.next, 0);}
            for (const animations of [false, true]) {
                for (const dismissal of ['burst-confirm', 'Escape', 'back', 'backdrop', 'retire']) {
                    const {page, errors} = await open(browser, sources, animations);
                    try {
                        // Deliberately close before the frozen helper's 100ms
                        // backdrop timer: the dedicated surface must own cleanup.
                        await page.evaluate(() => trial.fail());
                        await page.waitForFunction(() => !!trial.dialog);
                        if (dismissal === 'Escape') await page.keyboard.press('Escape');
                        else await page.evaluate(action => {
                            if (action === 'back') {trial.command(); return;}
                            if (action === 'backdrop') {trial.dialog.parentNode.click(); return;}
                            if (action === 'retire') {trial.retire(); return;}
                            const button = trial.dialog.querySelector('button');
                            const close = trial.manager._etePlaybackErrorDialog.close;
                            for (let i = 0; i < 12; i++) {button.click(); close();}
                        }, dismissal);
                        await page.waitForTimeout(150);
                        const result = await page.evaluate(() => ({backs: trial.backs.length, pushes: trial.pushes.length,
                            closes: trial.closes, closing: trial.closing, scopes: trial.scopes, next: trial.next, stops: trial.stops,
                            containers: document.querySelectorAll('.dialogContainer').length,
                            lock: document.documentElement.classList.contains('withDialogOpen'),
                            owner: !!trial.manager._etePlaybackErrorDialog, url: location.href}));
                        assert.deepEqual(result, {backs: 0, pushes: 0, closes: 1, closing: 1, scopes: 0, next: 0, stops: 0, containers: 0, lock: false, owner: false, url: 'http://ete-dialog.invalid/videoosd'});
                        assert.deepEqual(errors, []);
                        checks.push({animations, dismissal, result: 'pass'});
                    } finally {await page.close();}
                }
            }
            for (const timing of ['loader', 'open']) {
                const {page, errors} = await open(browser, sources);
                try {
                    await page.evaluate(delay => {trial.delayLoader = delay; trial.fail();}, timing === 'loader');
                    await page.evaluate(() => {trial.retire(); trial.deliver?.(); trial.deliver?.();});
                    await page.waitForTimeout(150);
                    assert.equal(await page.locator('.dialogContainer').count(), 0);
                    // A fresh request can still report its own failure after the
                    // old loader/close callback has been delivered twice.
                    await page.evaluate(() => {trial.delayLoader = false; trial.fail(); trial.deliver?.();});
                    await page.waitForFunction(() => document.querySelector('.etePlaybackErrorDialog'));
                    await page.evaluate(() => trial.confirm());
                    await page.waitForTimeout(150);
                    assert.deepEqual(await page.evaluate(() => ({backs: trial.backs.length, next: trial.next, stops: trial.stops, dialogs: document.querySelectorAll('.dialogContainer').length})), {backs: 0, next: 0, stops: 0, dialogs: 0});
                    assert.deepEqual(errors, []);
                    checks.push({retirement: timing, result: 'pass'});
                } finally {await page.close();}
            }
            for (const dismissal of ['confirm', 'back']) {
                const {page, errors} = await open(browser, sources, true);
                try {
                    await page.evaluate(() => {trial.plain();});
                    await page.waitForFunction(() => location.hash.startsWith('#dlg'));
                    await page.waitForTimeout(120);
                    assert.equal(await page.evaluate(() => trial.dialog.getAttribute('data-history')), 'true');
                    if (dismissal === 'confirm') await page.evaluate(() => trial.confirm());
                    else await page.evaluate(() => trial.command());
                    await page.waitForFunction(() => trial.closes === 1);
                    assert.deepEqual(await page.evaluate(() => ({url: location.href, backs: trial.backs.length, pushes: trial.pushes.length, closes: trial.closes})), {url: 'http://ete-dialog.invalid/videoosd', backs: 1, pushes: 1, closes: 1});
                    assert.deepEqual(errors, []);
                    checks.push({ordinaryDialog: dismissal, result: 'pass'});
                } finally {await page.close();}
            }
            {
                const {page, errors} = await open(browser, sources, true);
                try {
                    await page.evaluate(() => {trial.plain();});
                    await page.waitForFunction(() => location.hash.startsWith('#dlg'));
                    await page.waitForTimeout(120);
                    await page.evaluate(() => {trial.ordinary = trial.dialog; trial.fail();});
                    await page.waitForFunction(() => !!document.querySelector('.etePlaybackErrorDialog'));
                    await page.evaluate(() => trial.confirm());
                    assert.equal(await page.evaluate(() => location.hash.startsWith('#dlg')), true);
                    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('withDialogOpen')), true);
                    await page.evaluate(() => {trial.dialog = trial.ordinary; trial.command();});
                    await page.waitForFunction(() => trial.closes === 2);
                    assert.deepEqual(await page.evaluate(() => ({backs: trial.backs.length, pushes: trial.pushes.length, scopes: trial.scopes, lock: document.documentElement.classList.contains('withDialogOpen')})), {backs: 1, pushes: 1, scopes: 0, lock: false});
                    assert.deepEqual(errors, []);
                    checks.push({errorOverOrdinaryDialog: 'pass'});
                } finally {await page.close();}
            }
            {
                const {page, errors} = await open(browser, sources);
                try {
                    await page.evaluate(() => {trial.osdStop({type: 'playbackstop'}, {}); trial.fail();});
                    await page.waitForFunction(() => location.pathname === '/detail');
                    await page.evaluate(() => trial.command());
                    for (const name of ['home', 'root']) {
                        await page.evaluate(() => trial.back());
                        await page.waitForFunction(name => location.pathname === '/' + name, name);
                    }
                    await page.evaluate(() => trial.back());
                    assert.equal(await page.evaluate(() => trial.exits), 1, 'normal root Back still reaches the router exit adapter');
                    assert.deepEqual(errors, []);
                    checks.push({normalBackAndExitAdapter: 'pass'});
                } finally {await page.close();}
            }
        }
        process.stdout.write(JSON.stringify({patchSourceRef: ref,
            worktreeStatus: cp.execFileSync('git', ['status', '--porcelain'], {cwd: root, encoding: 'utf8'}).trim(),
            provenance, browser: browser.version(), expectation: process.argv.includes('--expect=regression') ? 'regression' : 'fixed', rows, checks}, null, 2) + '\n');
    } finally { await browser.close(); }
}
if (require.main === module) main().catch(error => {console.error(error); process.exitCode = 1;});
module.exports = {material, open, main};
