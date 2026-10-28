'use strict';

const assert = require('node:assert/strict');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {sources, openTrial} = require('../tests/helpers/home-flow-renderer.cjs');
const native = require('../tests/helpers/home-native-renderer.cjs');
const routes = require('../tests/helpers/home-route-renderer.cjs');

async function main(args = process.argv.slice(2)) {
    if (args.length !== 3 || !args.slice(0, 2).every(path.isAbsolute) || !/^[a-f0-9]{40}$/.test(args[2])) {
        throw Error('Usage: node tools/check-home-repeat-navigation-renderer.cjs <Chromium absolute path> <new evidence directory> <control commit>');
    }
    const root = path.resolve(__dirname, '..'), out = args[1], control = args[2];
    const controlModule = {exports: {}};
    vm.runInNewContext(cp.execFileSync('git', ['show', control + ':tools/patch-server-home.cjs'], {cwd: root, encoding: 'utf8'}), {module: controlModule});
    const frozen = fs.readFileSync(path.join(root, 'vendor/web-snapshot/www/modules/viewmanager/viewmanager.js'), 'utf8');
    const plugin = require('./patch-plugin-settings.cjs'), candidateHome = require('./patch-server-home.cjs');
    const controlManager = controlModule.exports.patchViewManager(plugin.patchViewManager(frozen));
    const candidateManager = candidateHome.patchViewManager(plugin.patchViewManager(frozen));
    fs.mkdirSync(out);
    const browser = await require('playwright').chromium.launch({headless: true, executablePath: args[0]});
    const cases = [];
    try {
        for (const candidate of [false, true]) for (const mode of ['baseline', 'retain', 'sections']) {
            const input = routes.augment(root, native.augment(root, sources(root)), true);
            input['modules/viewmanager/viewmanager.js'] = candidate ? candidateManager : controlManager;
            const page = await openTrial(browser, input, mode, {native: true, nativeItems: 8,
                origin: 'http://synthetic.invalid/', viewport: {width: 1920, height: 1080}});
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            try {
                await page.evaluate(() => (0, eval)(trial.runtime.input.routeSetup)(trial));
                await page.evaluate(() => trial.route.navigate('home'));
                await page.evaluate(() => trial.route.settleHome());
                await page.evaluate(async () => {
                    trial.route.original = trial.route.manager.currentView();
                    trial.route.originalStage = trial.route.homeTab().sectionsContainer.firstChild;
                    const router = trial.runtime.load('modules/approuter.js').default, show = router.show;
                    router.show = target => show(target === '/home' ? 'home' : target);
                    const drawer = trial.runtime.load('modules/navdrawer/navdrawercontent.js').default;
                    const user = await trial.api.getCurrentUser();
                    const options = {apiClient: trial.api, user, loggedInUser: user, home: true, header: false,
                        collapsible: false, itemClass: 'repeatHomeDrawerItem'};
                    const element = document.createElement('aside');
                    element.style.cssText = 'position:fixed;right:0;top:0;width:280px;z-index:10;background:#222';
                    document.body.appendChild(element);
                    element.innerHTML = await drawer.getSettingsDrawerHtml(options);
                    await drawer.initItemsContainers(element, options);
                });
                const home = page.locator('.repeatHomeDrawerItem').filter({hasText: 'Home'});
                await home.waitFor();
                const snapshots = [];
                for (let turn = 0; turn < 3; turn++) {
                    await home.click();
                    await page.evaluate(async () => { await trial.route.clickedNavigation; await trial.route.settleHome(); });
                    snapshots.push(await page.evaluate(() => ({...trial.route.state(), visual: trial.route.visual(),
                        visible: [...document.querySelectorAll('.mainAnimatedPages>.page')].filter(e => e.getClientRects().length > 0).length,
                        sameView: trial.route.original === trial.route.manager.currentView(),
                        sameStage: trial.route.originalStage === trial.route.homeTab().sectionsContainer.firstChild})));
                }
                for (const state of snapshots) {
                    assert.equal(state.created, 1); assert.equal(state.sameView, true); assert.equal(state.sameStage, true);
                    assert.equal(state.cards, 16); assert.equal(state.visible, candidate ? 1 : 0);
                    assert.equal(state.visual.rows.length, 2);
                    assert.ok(state.visual.rows.every(row => candidate ? row.cards > 0 : row.cards === 0));
                }
                const name = (candidate ? 'candidate' : 'control') + '-' + mode;
                await page.screenshot({path: path.join(out, name + '-repeated-click.png')});
                if (candidate) {
                    await page.evaluate(() => trial.route.navigate('settings'));
                    await page.evaluate(() => { trial.bump(); trial.route.heldStart = trial.calls.length; trial.config.ignoreAbort = true; trial.config.holdAllItems = true; return trial.route.navigate('home'); });
                    await page.waitForFunction(() => trial.calls.slice(trial.route.heldStart).filter(call => call.kind === 'items').length === 2);
                    // Repeat native drawer clicks while the resident owner's new data is held.
                    for (let turn = 0; turn < 3; turn++) { await home.click(); await page.evaluate(() => trial.route.clickedNavigation); }
                    const pending = await page.evaluate(() => ({...trial.route.state(), visual: trial.route.visual()}));
                    assert.equal(pending.created, 1); assert.equal(pending.cards, 16);
                    assert.equal(pending.visual.rows.length, 2);
                    assert.ok(pending.visual.rows.every(row => row.cards > 0));
                    await page.evaluate(() => { trial.config.holdAllItems = false; trial.release(); });
                    await page.evaluate(() => trial.route.settleHome());
                    const final = await page.evaluate(() => ({...trial.route.state(), visual: trial.route.visual(),
                        progress: [...trial.route.manager.currentView().querySelectorAll('.itemProgressBarForeground')].map(e => e.style.width)}));
                    assert.equal(final.cards, 16); assert.equal(final.visual.rows.length, 2);
                    assert.ok(final.visual.rows.every(row => row.cards > 0));
                    assert.equal(final.progress.length, 16); assert.ok(final.progress.every(width => width === '20%'));
                    snapshots.push({pending, final});
                }
                assert.deepEqual(errors, []);
                cases.push({name, snapshots});
            } finally { await page.close(); }
        }
        const hash = value => crypto.createHash('sha256').update(value).digest('hex');
        const report = {status: 'passed', sourceBaseCommit: cp.execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(),
            control, controlManagerSha256: hash(controlManager), candidateManagerSha256: hash(candidateManager), browser: browser.version(), cases,
            scope: 'native drawer Home item click, router init/content functions, composed viewmanager, Home/BaseView/TabbedView and native cards; synthetic API/module loader/platform boundaries; control swaps only the composed viewmanager; not Windows or real service acceptance'};
        fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
        console.log(JSON.stringify({status: report.status, cases: cases.length, evidence: out, scope: report.scope}));
    } finally { await browser.close(); }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = {main};
