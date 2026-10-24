'use strict';
const assert = require('node:assert/strict'), path = require('node:path');
const {sources, openTrial} = require('../tests/helpers/home-flow-renderer.cjs');
async function main(args = process.argv.slice(2)) {
    const [executablePath] = args;
    if (!path.isAbsolute(executablePath || '') || args.length !== 1) throw Error('Usage: node tools/check-home-flow-renderer.cjs <absolute installed Chromium executable>');
    const root = path.resolve(__dirname, '..'), input = sources(root);
    const browser = await require('playwright').chromium.launch({headless: true, executablePath});
    const passed = [];
    async function check(name, settings, run) {
        const page = await openTrial(browser, input, 'sections', settings), errors = [];
        page.on('pageerror', error => errors.push(error.name));
        try { await run(page); assert.deepEqual(errors, []); passed.push(name); }
        finally { await page.evaluate(() => trial.controller.dispose()).catch(() => {}); await page.close(); }
    }
    try {
        await check('fast section visible while slow section is pending; failure stays local and retry is local', {holdRow: 1}, async page => {
            await page.evaluate(() => { trial.pending = trial.controller.resume(); });
            await page.waitForFunction(() => trial.snapshot().readyRows === 1);
            assert.equal(await page.evaluate(() => trial.snapshot().loading), 'false');
            await page.evaluate(() => { trial.config.errorRow = 1; trial.release(); });
            assert.equal((await page.evaluate(() => trial.pending)).failedSections, 1);
            assert.equal(await page.evaluate(() => trial.snapshot().readyRows), 1);
            const before = await page.evaluate(() => trial.calls.length);
            await page.evaluate(() => { delete trial.config.errorRow; delete trial.config.holdRow; });
            await page.locator('[data-home-flow-status] button').click();
            await page.waitForFunction(() => trial.snapshot().readyRows === 2);
            assert.equal(await page.evaluate(() => trial.calls.length), before + 1);
        });
        await check('return retains stage, scroll and item focus; progress is re-read', {}, async page => {
            await page.evaluate(() => trial.controller.resume());
            await page.evaluate(() => trial.bump());
            const value = await page.evaluate(() => trial.measure(true));
            assert.equal(value.reusedStage, true); assert.equal(value.immediate.cards, 8);
            assert.ok(value.immediate.scroll > 0); assert.equal(value.final.scroll, value.immediate.scroll);
            assert.equal(value.final.focused, '0-0'); assert.ok(value.final.progress.every(x => x === '2'));
            assert.equal(value.requests.filter(x => x.kind === 'items').length, 2);
        });
        for (const transition of ['logout', 'user', 'server', 'auth', 'locale', 'version', 'query']) await check('scope change: ' + transition, {}, async page => {
            await page.evaluate(() => trial.controller.resume());
            const immediate = await page.evaluate(transition => {
                trial.controller.pause();
                if (transition === 'logout' || transition === 'user') trial.setUser(transition === 'logout' ? null : 'other-synthetic-user');
                else if (transition === 'auth') trial.api._identityEpoch++;
                else if (transition === 'server') trial.api.serverId = () => 'other-synthetic-server';
                else if (transition === 'locale') trial.api.getCurrentLocale = () => 'en-US';
                else if (transition === 'version') trial.api.serverVersion = () => '4.10.0.41';
                else trial.owner.params = {tab: 'different'};
                if (transition !== 'logout') trial.pending = trial.controller.resume();
                return trial.snapshot();
            }, transition);
            assert.equal(immediate.cards, 0);
            if (transition !== 'logout') assert.equal((await page.evaluate(() => trial.pending)).status, 'server');
        });
        await check('pause cancels held reads and late data cannot change the next navigation', {holdRow: 1, ignoreAbort: true}, async page => {
            await page.evaluate(() => { trial.old = trial.controller.resume(); });
            await page.waitForFunction(() => trial.snapshot().readyRows === 1);
            await page.evaluate(() => { trial.controller.pause(); trial.bump(); delete trial.config.holdRow; trial.next = trial.controller.resume(); });
            assert.equal((await page.evaluate(() => trial.old)).status, 'cancelled');
            assert.equal((await page.evaluate(() => trial.next)).status, 'server');
            await page.evaluate(() => trial.release());
            assert.ok((await page.evaluate(() => trial.snapshot().progress)).every(x => x === '2'));
        });
        await check('notifications coalesce, mask stale data and do not inspect payload data', {}, async page => {
            await page.evaluate(() => trial.controller.resume());
            const visible = await page.evaluate(() => {
                trial.bump(); const message = {MessageType: 'UserDataChanged'};
                Object.defineProperty(message, 'Data', {get() { throw Error('must not inspect data'); }});
                trial.events.trigger(trial.api, 'message', [message]); trial.events.trigger(trial.api, 'message', [message]);
                return trial.snapshot().cards;
            });
            assert.equal(visible, 0);
            await page.waitForFunction(() => trial.snapshot().readyRows === 2 && trial.snapshot().progress.every(x => x === '2'));
            assert.equal(await page.evaluate(() => trial.calls.filter(x => x.kind === 'layout').length), 2);
        });
        await check('cache enabled with real Window timers survives websocketclose invalidation', {cache: true}, async page => {
            await page.evaluate(() => trial.controller.resume());
            await page.evaluate(() => { trial.bump(); trial.events.trigger(trial.api, 'websocketclose'); });
            await page.waitForFunction(() => trial.snapshot().readyRows === 2 && trial.snapshot().progress.every(x => x === '2'));
            assert.equal(await page.evaluate(() => trial.snapshot().loading), 'false');
        });
        await check('late ready row cannot reclaim scroll after user input', {slowMs: 400}, async page => {
            await page.evaluate(() => trial.controller.resume());
            await page.evaluate(() => { trial.controller.pause(); trial.next = trial.controller.resume({autoFocus: true}); });
            await page.waitForFunction(() => trial.snapshot().readyRows === 1);
            const value = await page.evaluate(async () => {
                const view = trial.owner.view; view.dispatchEvent(new WheelEvent('wheel', {bubbles: true})); view.scrollTop = 60;
                const position = view.scrollTop; await trial.next; return {position, after: view.scrollTop};
            });
            assert.equal(value.after, value.position);
        });
        await check('dispose retires callbacks, timers and a late held row', {holdRow: 1, ignoreAbort: true}, async page => {
            await page.evaluate(() => { trial.next = trial.controller.resume(); });
            await page.waitForFunction(() => trial.snapshot().readyRows === 1);
            const value = await page.evaluate(async () => {
                trial.controller.dispose(); trial.release(); await trial.next;
                return {cards: trial.snapshot().cards, api: Object.values(trial.api._callbacks).reduce((sum, list) => sum + list.length, 0),
                    connection: Object.values(trial.connection._callbacks).reduce((sum, list) => sum + list.length, 0)};
            });
            assert.deepEqual(value, {cards: 0, api: 0, connection: 0});
        });
        await check('unsupported capability uses the complete legacy fallback', {}, async page => {
            const value = await page.evaluate(async () => {
                trial.api.serverVersion = () => '4.9.0.0';
                return {outcome: await trial.controller.resume(), items: trial.calls.filter(x => x.kind === 'items').length};
            });
            assert.equal(value.outcome.status, 'legacy'); assert.equal(value.items, 0);
        });
        await check('explicit empty layout settles without loading or phantom content', {count: 0}, async page => {
            assert.equal((await page.evaluate(() => trial.controller.resume())).status, 'server');
            const value = await page.evaluate(() => trial.snapshot());
            assert.equal(value.cards, 0); assert.equal(value.loading, 'false');
        });
        console.log(JSON.stringify({schemaVersion: 1, browser: browser.version(), passed,
            scope: 'Headless Chromium actual controller/provider/Events/cache; synthetic API and Items/CardBuilder doubles; no foreground/Electron/NAS'}, null, 2));
    } finally { await browser.close(); }
}
module.exports = {main};
if (require.main === module) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
