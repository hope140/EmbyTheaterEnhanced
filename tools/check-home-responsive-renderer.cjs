'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium} = require('playwright');
const {sources, openTrial} = require('../tests/helpers/home-flow-renderer.cjs');
const {augment} = require('../tests/helpers/home-native-renderer.cjs');

async function main(executable = '/usr/bin/chromium') {
    const root = path.resolve(__dirname, '..');
    const browser = await chromium.launch({headless: true, executablePath: executable});
    const cases = [];
    try {
        for (const size of [700, 960, 1280, 1920]) {
            const page = await openTrial(browser, augment(root, sources(root)), 'baseline',
                {native: true, nativeItems: 4, sectionTypes: ['latestmedia', 'latestmedia'], viewport: {width: size, height: 900}});
            try {
                const result = await page.evaluate(async () => {
                    const original = trial.api.getJSON.bind(trial.api);
                    trial.api.getJSON = (request, signal) => original(request, signal).then(value => {
                        if (request.route.includes('/Sections/1/Items')) {
                            value.Items = value.Items.slice(0, 3); value.TotalRecordCount = 3;
                        }
                        return value;
                    });
                    await trial.controller.resume();
                    await new Promise(resolve => setTimeout(resolve, 160));
                    const measure = () => [...document.querySelectorAll('.verticalSection')].map(row => {
                        const container = row.querySelector('.itemsContainer'), card = container.querySelector('.card');
                        return {count: container.querySelectorAll('.card').length, virtual: !!container.virtualScroller,
                            shape: card?.classList.contains('backdropCard-horiz'), width: card?.getBoundingClientRect().width};
                    });
                    const before = measure();
                    return {before};
                });
                assert.deepEqual(result.before.map(row => row.count), [4, 3]);
                assert.ok(result.before.every(row => row.virtual && row.shape));
                assert.ok(Math.abs(result.before[0].width - result.before[1].width) < 1,
                    'short and long server sections must use the same responsive card width at ' + size);
                await page.setViewportSize({width: size === 700 ? 1280 : 700, height: 900});
                const after = await page.evaluate(() => [...document.querySelectorAll('.verticalSection')].map(row => {
                    const container = row.querySelector('.itemsContainer');
                    return {virtual: !!container.virtualScroller, width: container.querySelector('.card').getBoundingClientRect().width};
                }));
                assert.ok(after.every(row => row.virtual));
                assert.ok(Math.abs(after[0].width - after[1].width) < 1, 'resize keeps matching card width');
                cases.push({size, before: result.before, after});
            } finally { await page.close(); }
        }
        const page = await openTrial(browser, augment(root, sources(root)), 'baseline',
            {native: true, nativeItems: 3, viewport: {width: 960, height: 900}});
        try {
            const result = await page.evaluate(async () => {
                const original = trial.api.getJSON.bind(trial.api);
                trial.api.getJSON = (request, signal) => request.route.endsWith('/HomeSections')
                    ? Promise.resolve([{Id: 'unsupported', Name: 'Unsupported', SectionType: 'latestmedia', ViewType: 'list'}])
                    : original(request, signal);
                return {status: (await trial.controller.resume()).status, text: trial.owner.sectionsContainer.textContent,
                    serverRows: trial.owner.sectionsContainer.querySelectorAll('.itemsContainer').length};
            });
            assert.equal(result.status, 'legacy'); assert.match(result.text, /Synthetic legacy/); assert.equal(result.serverRows, 0);
            cases.push({name: 'unsupported-layout-fallback', result});
        } finally { await page.close(); }
        console.log(JSON.stringify({status: 'passed', cases}));
    } finally { await browser.close(); }
}
if (require.main === module) main(process.argv[2]).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = {main};
