'use strict';
// Optional offline renderer regression; install nothing and use no personal profile.
// node tools/check-home-fallback-refresh.cjs <absolute Chrome path> [--compare <40-char baseline SHA>] [--output <directory>]
// Requires existing playwright (or NODE_PATH), tracked web snapshot, and local baseline Git objects.
// --compare expects the known pre-fix failures, then requires the current source to pass.
// Real ItemsContainer, ItemsRefresher, homesections and focusmanager; synthetic API,
// simplified horizontal Scroller, direct menu event sequence, no full app routing.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), cp = require('node:child_process'), crypto = require('node:crypto');
const {sources, openTrial} = require('../tests/helpers/home-flow-renderer.cjs');
const {augment} = require('../tests/helpers/home-native-renderer.cjs');
const root = path.resolve(__dirname, '..');
const legacyCases = ['local-true', 'local-false', 'sequence-true', 'sequence-false', 'server-only', 'pending-fetch', 'pending-postrender', 'return-websocket'];
const serverCases = ['local-true', 'local-false', 'sequence-true', 'sequence-false', 'remove-last-item', 'remove-section', 'seed-only', 'return-websocket'];

async function scenario(browser, input, legacy, kind, output) {
    const page = await openTrial(browser, input, 'baseline', {
        native: true, nativeLegacy: legacy, realFocus: true, nativeItems: kind === 'remove-last-item' ? 1 : 8,
        count: 6, viewport: {width: 1280, height: 600}, sectionTypes: Array(6).fill('latestmedia')
    });
    const errors = [];
    page.on('pageerror', error => errors.push({message: error.message, stack: error.stack}));
    try {
        const initial = await page.evaluate(async () => {
            const result = await trial.controller.resume();
            // Legacy loadSections awaits the first rail only. Wait for all synthetic rails.
            await new Promise(resolve => setTimeout(resolve, 600));
            return result.status;
        });
        assert.equal(initial, legacy ? 'legacy' : 'server', 'fixture must enter the intended real renderer');
        const result = await page.evaluate(async kind => {
            const t = trial, view = t.owner.view, wait = ms => new Promise(resolve => setTimeout(resolve, ms));
            const inputApi = t.runtime.modules.get('modules/common/input/api.js').default;
            const rows = () => [...document.querySelectorAll('.verticalSection')].filter(row => row.querySelector('.itemsContainer'));
            const selected = rows()[2].querySelector('.card'), oldItem = rows()[2].querySelector('.itemsContainer');
            // Only initial positioning suppresses scrolling. Runtime focus uses frozen focusmanager.
            selected.focus({preventScroll: true}); view.scrollTop = 450;
            const get = t.api.getJSON.bind(t.api), queries = [];
            t.api.getJSON = (request, signal) => {
                queries.push({layout: request.route.endsWith('/HomeSections'), seed: request.query?.RandomSeed ?? null});
                return get(request, signal).then(data => {
                    if (request.route.endsWith('/HomeSections')) {
                        if (t.changeSeed) data.forEach(section => { section.RandomSeed = 123; });
                        if (t.removeSection) data = data.filter(section => section.Id !== '2');
                    } else if (t.removeLast && request.route.includes('/Sections/2/')) { data.Items = []; data.TotalRecordCount = 0; }
                    return data;
                });
            };
            const samples = [], events = [], start = performance.now(); let recording = true;
            const snap = () => ({at: Math.round(performance.now() - start), scroll: view.scrollTop, height: view.scrollHeight,
                rows: rows().length, cards: document.querySelectorAll('.card').length,
                loading: t.owner.sectionsContainer.dataset.loading, focused: document.activeElement?.dataset.id || null});
            const tick = () => { if (recording) { samples.push(snap()); requestAnimationFrame(tick); } }; tick();
            const mark = name => events.push({name, ...snap()});
            const local = flag => {
                mark('input.LibraryChanged ' + flag);
                t.events.trigger(inputApi, 'LibraryChanged', [t.api, {ItemsRemoved: ['2-0'], IsLocalEvent: flag}]);
            };
            const server = () => { mark('api.message LibraryChanged'); t.events.trigger(t.api, 'message', [{MessageType: 'LibraryChanged', Data: {ItemsRemoved: ['2-0']}}]); };
            const before = snap();
            if (kind === 'local-true' || kind === 'local-false') local(kind === 'local-true');
            else if (kind.startsWith('sequence')) {
                local(kind === 'sequence-true'); await wait(5); server(); await wait(5);
                mark('items.notifyRefreshNeeded(true)'); oldItem.notifyRefreshNeeded(true);
            } else if (kind === 'server-only') server();
            else if (kind === 'pending-fetch') { local(true); await wait(5); server(); }
            else if (kind === 'pending-postrender') { t.config.slowMs = 5; local(true); await wait(20); server(); }
            else if (kind === 'remove-last-item') { t.removeLast = true; local(true); server(); }
            else if (kind === 'remove-section') { t.removeSection = true; local(true); server(); }
            else if (kind === 'seed-only') { t.changeSeed = true; server(); }
            else {
                t.controller.pause(); mark('paused-route-eligible=' + t.controller.canRestore());
                await t.controller.resume(); await wait(100);
                mark('websocketclose'); t.events.trigger(t.api, 'websocketclose');
                await wait(30); mark('websocketopen'); t.events.trigger(t.api, 'websocketopen');
            }
            // Includes ItemsRefresher's real 3000ms non-local debounce.
            await wait(3600); recording = false;
            return {kind, before, after: snap(), events, samples, queries,
                minScroll: Math.min(...samples.map(sample => sample.scroll)), oldDisconnected: !oldItem.isConnected,
                remainingHold: t.owner.sectionsContainer.style.minHeight};
        }, kind);
        result.legacy = legacy; result.initial = initial; result.errors = errors;
        await page.screenshot({path: path.join(output, (legacy ? 'legacy-' : 'server-') + kind + '.png')});
        return result;
    } finally { await page.close(); }
}

function check(result, old) {
    const {legacy, kind, before, after, samples, errors} = result;
    assert.equal(before.scroll, 450, 'fixture must have sufficient scroll range');
    if (old && legacy && !kind.startsWith('local-')) {
        assert.equal(after.scroll, 0, 'old legacy ownership must reproduce persistent reset');
        assert.equal(result.oldDisconnected, true);
        if (['sequence-true', 'pending-fetch'].includes(kind)) assert.ok(errors.some(error => error.message.includes("reading 'bind'") && error.stack.includes(':347:52') && error.stack.includes(':708:38')));
        if (kind === 'pending-postrender') assert.ok(errors.some(error => error.message.includes("reading 'mergeOptions'") && error.stack.includes(':876:33') && error.stack.includes(':413:16')));
        return;
    }
    assert.deepEqual(errors, [], 'no renderer exception');
    assert.equal(after.scroll, before.scroll, 'retain final scroll');
    if (old && ['remove-section', 'seed-only'].includes(kind)) assert.equal(result.minScroll, 0, 'old layout swap must reproduce transient reset');
    else assert.ok(samples.every(sample => sample.scroll === before.scroll), 'retain scroll in every sampled frame');
    if (!old) {
        const since = result.events.find(event => event.name === 'websocketclose')?.at ?? result.events[0].at;
        assert.ok(samples.filter(sample => sample.at > since).every(sample => sample.loading !== 'true'), 'background notifications must not show global loading');
        assert.equal(result.remainingHold, '', 'release temporary outer geometry');
        if (legacy || kind === 'seed-only') assert.equal(result.oldDisconnected, false, 'retain existing native nodes');
        if (kind === 'return-websocket') {
            assert.ok(result.events.some(event => event.name === 'paused-route-eligible=true'), 'native route restore contract must allow the retained page');
            assert.ok(result.queries.some(query => !query.layout), 'ordinary return must refresh native data');
        }
    }
    if (kind === 'seed-only') assert.ok(result.queries.some(query => !query.layout && query.seed === 123), 'use fresh seed in item GET despite DOM reuse');
}

async function main(args = process.argv.slice(2)) {
    const executable = args.shift();
    if (!path.isAbsolute(executable || '') || !fs.statSync(executable).isFile()) throw Error('Supply an absolute installed Chrome/Chromium executable.');
    let compare, output;
    while (args.length) {
        const flag = args.shift(), value = args.shift();
        if (flag === '--compare' && /^[a-f0-9]{40}$/.test(value || '')) compare = value;
        else if (flag === '--output' && value) output = path.resolve(value);
        else throw Error('Expected --compare <full SHA> or --output <directory>.');
    }
    output ||= fs.mkdtempSync(path.join(os.tmpdir(), 'ete-home-refresh-'));
    fs.mkdirSync(output, {recursive: true});
    const current = cp.execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
    if (compare) {
        const changed = cp.execFileSync('git', ['diff', '--name-only', compare, 'HEAD', '--',
            'tools/patch-movie-browser.cjs', 'tools/patch-search-ui.cjs', 'tools/patch-server-home.cjs', 'vendor/web-snapshot'], {cwd: root, encoding: 'utf8'}).trim();
        assert.equal(changed, '', 'comparison requires identical frozen native inputs and transforms');
    }
    const report = {current, compare: compare || null, scope: 'offline frozen native components, synthetic API, simplified horizontal Scroller; not installed-client acceptance', results: []};
    const browser = await require('playwright').chromium.launch({headless: true, executablePath: executable});
    try {
        for (const revision of compare ? [compare, null] : [null]) {
            const stage = path.join(output, revision ? 'baseline' : 'candidate'); fs.mkdirSync(stage, {recursive: true});
            const input = augment(root, sources(root, revision));
            report.sourceHashes ||= {};
            report.sourceHashes[revision || current] = Object.fromEntries(Object.entries(input).map(([id, source]) =>
                [id, crypto.createHash('sha256').update(source).digest('hex')]));
            for (const legacy of [true, false]) for (const kind of legacy ? legacyCases : serverCases) {
                let result;
                try { result = await scenario(browser, input, legacy, kind, stage); check(result, !!revision); result.passed = true; }
                catch (error) { result ||= {legacy, kind}; result.passed = false; result.failure = error.message; }
                result.revision = revision || current; report.results.push(result);
                fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
                console.log(JSON.stringify({revision: result.revision, legacy, kind, passed: result.passed, minScroll: result.minScroll, finalScroll: result.after?.scroll, errors: result.errors?.map(error => error.message), failure: result.failure}));
            }
        }
    } finally { await browser.close(); }
    assert.ok(report.results.every(result => result.passed), 'Home refresh regression failed; inspect report.json');
    return report;
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = {main};
