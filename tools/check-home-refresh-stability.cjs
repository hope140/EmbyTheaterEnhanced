'use strict';
// Optional native-renderer regression. Requires an existing Playwright/Chromium.
// Uses only synthetic data and blocks all network requests; not client acceptance.
const assert = require('node:assert/strict'), path = require('node:path');
const {sources, openTrial} = require('../tests/helpers/home-flow-renderer.cjs');
const {augment} = require('../tests/helpers/home-native-renderer.cjs');
async function main(executable) {
    if (!path.isAbsolute(executable || '')) throw Error('Supply an absolute installed Chromium path.');
    const root = path.resolve(__dirname, '..');
    const browser = await require('playwright').chromium.launch({headless: true, executablePath: executable});
    const results = [];
    try {
        for (const kind of ['return', 'UserDataChanged', 'LibraryChanged']) {
            const page = await openTrial(browser, augment(root, sources(root)), 'baseline', {
                native: true, nativeItems: 8, count: 6, viewport: {width: 1280, height: 600},
                sectionTypes: ['resume', 'latestmedia', 'latestmedia', 'latestmedia', 'latestmedia', 'latestmedia']
            });
            const errors = []; page.on('pageerror', error => errors.push(error.message));
            try {
                const result = await page.evaluate(async kind => {
                    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
                    await trial.controller.resume(); await frame(); await frame();
                    const rows = [...document.querySelectorAll('.verticalSection')], view = trial.owner.view;
                    if (rows.some(row => !row.querySelector('.itemsContainer').virtualScroller)) throw Error('native renderer absent');
                    view.scrollTop = 450;
                    const before = {scroll: view.scrollTop, height: rows[0].getBoundingClientRect().height};
                    trial.config.holdLayout = true;
                    if (kind === 'return') { trial.controller.pause(); trial.pending = trial.controller.resume(); }
                    else trial.events.trigger(trial.api, 'message', [{MessageType: kind}]);
                    await frame(); await frame();
                    const pending = {scroll: view.scrollTop, height: rows[0].getBoundingClientRect().height,
                        cards: rows[0].querySelectorAll('.card').length, minHeight: rows[0].style.minHeight};
                    const samples = []; let recording = true;
                    const sample = () => { if (!recording) return; samples.push({scroll: view.scrollTop, height: rows[0].getBoundingClientRect().height,
                        cards: rows[0].querySelectorAll('.card').length}); requestAnimationFrame(sample); };
                    requestAnimationFrame(sample);
                    trial.config.holdLayout = false; trial.release();
                    if (trial.pending) await trial.pending;
                    while (trial.owner.sectionsContainer.dataset.loading === 'true') await frame();
                    await frame(); await frame(); recording = false;
                    const after = {scroll: view.scrollTop, minHeight: rows[0].style.minHeight};
                    trial.controller.dispose(); return {before, pending, after, samples};
                }, kind);
                assert.ok(result.before.scroll > 0, 'fixture must scroll');
                assert.ok(result.pending.cards > 0, 'retain rendered Continue Watching while pending');
                assert.ok(parseFloat(result.pending.minHeight) > 0);
                assert.equal(result.pending.scroll, result.before.scroll);
                assert.equal(result.after.scroll, result.before.scroll);
                assert.equal(result.after.minHeight, '');
                assert.ok(result.samples.every(sample => sample.cards > 0 && sample.height > 0), 'no missing rail during native refresh');
                assert.deepEqual(errors, []); results.push({kind, ...result});
            } finally { await page.close(); }
        }
        console.log(JSON.stringify({status: 'passed', scope: 'native frozen renderer with synthetic API; not Windows acceptance', results}));
    } finally { await browser.close(); }
}
if (require.main === module) main(process.argv[2]).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = {main};
