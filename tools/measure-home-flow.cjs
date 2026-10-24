'use strict';
// Optional controlled renderer probe. Uses an already installed Playwright and
// browser; never installs a tool or contacts a server. Component doubles are
// explicit: these numbers do not measure the production CardBuilder/Electron.
const path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const {sources, openTrial} = require('../tests/helpers/home-flow-renderer.cjs');
async function main(args = process.argv.slice(2)) {
    const [executablePath, revision, mode = 'baseline', countText = '5'] = args;
    if (!path.isAbsolute(executablePath || '') || !['baseline', 'retain', 'sections'].includes(mode) || !/^[1-9]$/.test(countText)) throw Error('Usage: node tools/measure-home-flow.cjs <absolute browser> <40-char SHA|worktree> <baseline|retain|sections> <1-9>');
    const root = path.resolve(__dirname, '..'), source = sources(root, revision === 'worktree' ? undefined : revision);
    const browser = await require('playwright').chromium.launch({headless: true, executablePath});
    const samples = [];
    try {
        for (let i = 0; i < Number(countText); i++) {
            const page = await openTrial(browser, source, mode);
            const errors = []; page.on('pageerror', error => errors.push(error.name));
            const first = await page.evaluate(() => trial.measure(false));
            const returned = await page.evaluate(() => trial.measure(true));
            samples.push({first, returned, errors}); await page.close();
        }
        const median = values => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];
        console.log(JSON.stringify({schemaVersion: 1, sourceCommit: revision === 'worktree' ? null : revision,
            baseCommit: cp.execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(),
            controllerSha256: crypto.createHash('sha256').update(source['enhanced/home/home-tab.js']).digest('hex'),
            browser: browser.version(), mode, settings: {layoutMs: 15, fastMs: 25, slowMs: 220, count: 2},
            scope: 'Controlled rAF/viewport/DOM proxies and real controller/provider; synthetic API, Items/CardBuilder doubles; not Electron/NAS/production-component performance',
            medians: Object.fromEntries(['first', 'returned'].map(key => [key, {
                firstVisibleMs: median(samples.map(x => x[key].firstVisibleMs)), firstInteractiveMs: median(samples.map(x => x[key].firstInteractiveMs)), settledMs: median(samples.map(x => x[key].settledMs)),
                blankFrames: median(samples.map(x => x[key].blankFrames))}])), samples}, null, 2));
        if (samples.some(x => x.errors.length || ['first', 'returned'].some(key => x[key].status !== 'server' ||
            !Number.isFinite(x[key].firstVisibleMs) || !Number.isFinite(x[key].firstInteractiveMs)))) process.exitCode = 1;
    } finally { await browser.close(); }
}
module.exports = {main};
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
