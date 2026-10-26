'use strict';
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const {sources, openTrial} = require('../tests/helpers/home-flow-renderer.cjs');
const {augment} = require('../tests/helpers/home-native-renderer.cjs');

async function main(args = process.argv.slice(2)) {
    if (args.length !== 3 || !path.isAbsolute(args[0]) || !path.isAbsolute(args[1]) || !/^[a-f0-9]{40}$/.test(args[2])) {
        throw Error('Usage: check-home-card-overlay-renderer.cjs <Chromium> <new evidence directory> <control commit>');
    }
    const root = path.resolve(__dirname, '..'), out = args[1], control = args[2];
    fs.mkdirSync(out, {recursive: false});
    const cssPath = 'src/electronapp/enhanced/home/home-flow.css';
    const candidateCss = fs.readFileSync(path.join(root, cssPath), 'utf8');
    const controlCss = cp.execFileSync('git', ['show', control + ':' + cssPath], {cwd: root, encoding: 'utf8'});
    const browser = await require('playwright').chromium.launch({headless: true, executablePath: args[0]});
    const cases = [], errors = [];
    try {
        for (const tv of [false, true]) {
            const input = augment(root, sources(root)); input.flowCss = '';
            const page = await openTrial(browser, input, 'baseline', {native: true, nativeItems: 0, count: 1, sectionTypes: ['resume'], viewport: {width: 1280, height: 900}});
            page.on('pageerror', error => errors.push(error.message));
            try {
                const result = await page.evaluate(async ({tv, controlCss, candidateCss}) => {
                    const {load} = trial.runtime;
                    document.documentElement.classList.toggle('layout-tv', tv);
                    load('modules/layoutmanager.js').default.tv = tv;
                    load('modules/common/itemhelper.js').default.canMarkPlayed = () => true;
                    trial.api.getImageUrl = () => 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#365d78"/></svg>');
                    const cards = load('modules/cardbuilder/cardbuilder.js').default;
                    trial.controller.dispose();
                    trial.controller = load('enhanced/home/home-tab.js').default.create(trial.owner, {
                        document, connection: trial.connection, events: trial.events,
                        layout: load('modules/layoutmanager.js').default, cards,
                        globalize: load('modules/common/globalize.js').default,
                        focus: load('modules/focusmanager.js').default,
                        loading: {show() {}, hide() {}},
                        legacy: {loadSections(stage) { stage.textContent = 'Synthetic legacy'; return Promise.resolve(); }}
                    });
                    const make = (id, type, year, extra) => Object.assign({Id: id, ServerId: 'synthetic-server', Name: 'Synthetic ' + id,
                        Type: type, MediaType: 'Video', ProductionYear: year, PrimaryImageAspectRatio: 2 / 3,
                        ImageTags: {Primary: 'synthetic'}, BackdropImageTags: ['synthetic'], RunTimeTicks: 900000000,
                        UserData: {PlaybackPositionTicks: 300000000, PlayedPercentage: 33}}, extra);
                    const items = [make('movie', 'Movie', 2019), make('series', 'Series', 2026, {UserData: {UnplayedItemCount: 7}}),
                        make('episode', 'Episode', 2024), make('played', 'Movie', 2020, {UserData: {Played: true}}),
                        make('timer', 'Program', 2025, {TimerId: 'synthetic-timer', Status: 'InProgress', IsLive: true})];
                    const options = {fields: ['Name', 'ProductionYear', 'ParentName'], preferThumb: true, shape: 'backdrop',
                        overlayText: false, lazy: true, centerText: true, cardLayout: false, context: 'home',
                        overlayPlayButton: true, showDetailsMenu: true, focusTransformTitleAdjust: true, lines: 2};
                    const style = document.createElement('style'); document.head.append(style);
                    function inspect(host) {
                        const box = host.querySelector('.card').getBoundingClientRect();
                        const text = selector => [...host.querySelectorAll(selector)].map(e => ({text: e.textContent.trim(), display: getComputedStyle(e).display,
                            visibility: getComputedStyle(e).visibility}));
                        const geometry = selector => [...host.querySelectorAll(selector)].map(e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e);
                            return {className: e.className, display: s.display, visibility: s.visibility, color: s.color,
                                left: +(r.left - box.left).toFixed(2), top: +(r.top - box.top).toFixed(2), width: +r.width.toFixed(2), height: +r.height.toFixed(2)}; });
                        return {inner: text('.innerCardFooter .cardText'), outer: [...host.querySelectorAll('.cardText')].filter(e => !e.closest('.innerCardFooter'))
                            .map(e => ({text: e.textContent.trim(), display: getComputedStyle(e).display, visibility: getComputedStyle(e).visibility})),
                            image: geometry('.cardImageContainer'), progress: geometry('.itemProgressBar'),
                            indicators: geometry('.playedIndicator,.countIndicator,.timerIndicator,.cardProgramIndicator'),
                            textSpacing: geometry('.cardText').filter((e, i) => ![...host.querySelectorAll('.cardText')][i].closest('.innerCardFooter'))};
                    }
                    const rows = [];
                    function render(name, item, opts, structure, css) {
                        style.textContent = css;
                        const host = document.createElement('div'); host.style.cssText = 'position:relative;width:1000px;';
                        host.className = structure === 'legacy' ? 'sections homeSectionsContainer' : structure === 'outside' ? 'otherPage' : 'sections';
                        const html = cards.getCardsHtml([item], {...opts});
                        host.innerHTML = structure === 'stage' ? '<div class="homeSectionsContainer">' + html + '</div>' : html;
                        document.body.append(host); const result = inspect(host); host.remove(); return result;
                    }
                    for (const item of items) {
                        const variants = {legacy: render(item.Id, item, options, 'legacy', controlCss),
                            before: render(item.Id, item, options, 'stage', controlCss), after: render(item.Id, item, options, 'stage', candidateCss)};
                        rows.push({name: item.Id + '-backdrop', variants});
                    }
                    for (const [name, opts, item] of [
                        ['thumb', options, {...items[0], ImageTags: {Primary: 'p', Thumb: 't'}}],
                        ['ordinary-poster', {...options, preferThumb: false, shape: 'portrait'}, items[0]]
                    ]) rows.push({name, variants: {legacy: render(name, item, opts, 'legacy', controlCss), before: render(name, item, opts, 'stage', controlCss), after: render(name, item, opts, 'stage', candidateCss)}});
                    rows.push({name: 'outside-home', variants: {legacy: render('', items[0], options, 'outside', controlCss),
                        before: render('', items[0], options, 'outside', controlCss), after: render('', items[0], options, 'outside', candidateCss)}});
                    // Actual maintained Home owner/provider/native items path, not a copied stage factory.
                    const getJSON = trial.api.getJSON.bind(trial.api);
                    trial.api.getJSON = (request, signal) => request.route.endsWith('/Items')
                        ? Promise.resolve({Items: items.slice(0, 3), TotalRecordCount: 3}) : getJSON(request, signal);
                    style.textContent = candidateCss;
                    await trial.controller.resume({refresh: true});
                    await new Promise(resolve => setTimeout(resolve, 150));
                    const stage = trial.owner.sectionsContainer.firstElementChild;
                    const live = {outerClass: trial.owner.sectionsContainer.className, stageClass: stage.className,
                        itemsTv: stage.querySelector('.itemsContainer').classList.contains('itemsContainer-tv'),
                        cardCount: stage.querySelectorAll('.card').length, inner: [...stage.querySelectorAll('.innerCardFooter .cardText')].map(e => ({text: e.textContent.trim(), display: getComputedStyle(e).display}))};
                    const hook = stage.querySelector('.card')?.closest('.homeSectionsContainer') === stage;
                    return {rows, live, hook};
                }, {tv, controlCss, candidateCss});
                for (const row of result.rows) {
                    const {legacy, before, after} = row.variants;
                    if (row.name.endsWith('-backdrop')) {
                        assert.ok(legacy.inner.some(x => /^20\d\d$/.test(x.text)), row.name + ': legacy year must exist');
                        assert.ok(legacy.inner.every(x => x.display === 'none'), row.name + ': legacy inner text must be hidden');
                        assert.ok(before.inner.some(x => /^20\d\d$/.test(x.text) && x.display !== 'none'), row.name + ': control must reproduce visible inner year');
                        if (JSON.stringify(after.inner) !== JSON.stringify(legacy.inner)) errors.push(row.name + ': inner text not restored');
                    }
                    for (const key of ['outer', 'image', 'progress', 'indicators', 'textSpacing']) assert.deepEqual(after[key], legacy[key], row.name + ': ' + key);
                    if (row.name === 'ordinary-poster') assert.ok(after.outer.some(x => x.text === '2019' && x.display !== 'none'));
                    if (row.name === 'outside-home') assert.deepEqual(after, before, 'unrelated page must retain inner text');
                    cases.push({tv, ...row});
                }
                assert.ok(result.live.outerClass.split(' ').includes('sections') && result.live.stageClass === 'homeSectionsContainer');
                assert.equal(result.live.cardCount, 3); assert.equal(result.hook, true);
                assert.equal(result.live.itemsTv, tv);
                assert.ok(result.live.inner.length >= 3 && result.live.inner.some(x => x.text === '2019'), 'actual Home must render the expected inner years');
                if (!result.live.inner.every(x => x.display === 'none')) errors.push('actual Home inner text not restored');
                cases.push({tv, name: 'actual-maintained-home', ...result.live, hook: result.hook});
                await page.screenshot({path: path.join(out, tv ? 'tv.png' : 'desktop.png')});
                await page.evaluate(() => trial.controller.dispose());
            } finally { await page.close(); }
        }
        const totals = {progress: 0, played: 0, count: 0, timer: 0, program: 0};
        for (const row of cases.filter(x => x.variants)) {
            totals.progress += row.variants.after.progress.length;
            for (const indicator of row.variants.after.indicators) for (const [key, cls] of Object.entries({played:'playedIndicator',count:'countIndicator',timer:'timerIndicator',program:'cardProgramIndicator'})) if (indicator.className.split(' ').includes(cls)) totals[key]++;
        }
        for (const [name, count] of Object.entries(totals)) assert.ok(count > 0, 'fixture must render actual native ' + name);
        const report = {status: errors.length ? 'failed' : 'passed', headCommit: cp.execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(), control,
            candidateCssSha256: crypto.createHash('sha256').update(candidateCss).digest('hex'), browser: browser.version(), cases, totals, errors,
            scope: 'actual frozen CardBuilder/native CSS and maintained Home owner with synthetic data and blocked network; no Windows/client/NAS acceptance'};
        fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
        console.log(JSON.stringify({status: report.status, scenarios: cases.length, totals, errors, evidence: out}));
        assert.equal(errors.length, 0, errors.join('; '));
    } finally { await browser.close(); }
}
if (require.main === module) main().catch(error => {console.error(error.stack || error.message); process.exitCode = 1;});
module.exports = {main};
