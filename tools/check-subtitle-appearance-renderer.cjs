'use strict';

// Isolated Chromium probe for the actual dialog source and frozen theme CSS.
// The player and dialog host are synthetic; this does not exercise Windows mpv.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function main(executable = process.argv[2]) {
    if (!executable || !path.isAbsolute(executable)) throw new Error('Usage: node tools/check-subtitle-appearance-renderer.cjs <absolute Chromium executable>');
    const root = path.resolve(__dirname, '..');
    const source = fs.readFileSync(path.join(root, 'src/electronapp/enhanced/subtitle-appearance-dialog.js'), 'utf8');
    const strings = JSON.parse(fs.readFileSync(path.join(root, 'vendor/web-snapshot/www/modules/common/strings/zh-CN.json'), 'utf8').replace(/^\uFEFF/, ''));
    const browser = await require('playwright').chromium.launch({headless: true, executablePath: executable});
    const page = await browser.newPage({viewport: {width: 1600, height: 980}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<!doctype html><html lang="zh-CN"><body style="margin:0;background:#08090b;color:#fff;font:20px Arial,sans-serif"></body></html>');
        for (const relative of [
            'vendor/web-snapshot/www/modules/layout.css',
            'vendor/web-snapshot/www/modules/themes/dark/theme.css',
            'vendor/web-snapshot/www/modules/dialoghelper/dialoghelper.css',
            'vendor/web-snapshot/www/modules/formdialog.css',
            'vendor/web-snapshot/www/modules/emby-elements/emby-select/emby-select.css',
            'src/electronapp/enhanced/subtitle-appearance-dialog.css'
        ]) await page.addStyleTag({path: path.join(root, relative)});
        await page.evaluate(({source, strings}) => {
            customElements.define('emby-select', class extends HTMLSelectElement {
                connectedCallback() {
                    this.classList.add('emby-select');
                    if (!this.previousElementSibling || !this.previousElementSibling.classList.contains('selectLabelText')) {
                        const label = document.createElement('label');
                        label.className = 'selectLabelText';
                        label.textContent = this.getAttribute('label');
                        this.parentNode.insertBefore(label, this);
                    }
                }
            }, {extends: 'select'});
            customElements.define('paper-icon-button-light', class extends HTMLButtonElement {}, {extends: 'button'});
            customElements.define('emby-scroller', class extends HTMLDivElement {}, {extends: 'div'});
            window.require = () => Promise.resolve([]);
            const data = {textSize: '', textColor: '#ffffff', dropShadow: 'dropshadow',
                textBackground: 'transparent', textBackgroundOpacity: '1'};
            const calls = [];
            const userSettings = {
                getSubtitleAppearanceSettings: () => ({...data}),
                setSubtitleAppearanceSettings: value => Object.assign(data, value)
            };
            const dialogHelper = {
                createDialog: () => {
                    const dlg = document.createElement('div');
                    dlg.classList.add('dialog');
                    return dlg;
                },
                open: dlg => {
                    document.body.appendChild(dlg);
                    return new Promise(resolve => { dlg._resolve = resolve; });
                },
                close: dlg => { dlg.remove(); dlg._resolve(); }
            };
            window.define = (deps, factory) => {
                window.Dialog = factory(...deps.map(name => ({
                    dialogHelper, globalize: {translate: key => strings[key] || key, getCurrentLocales: () => ['zh-CN']},
                    userSettings
                })[name]));
            };
            window.define.amd = {};
            (0, eval)(source);
            window.probe = {data, calls};
            window.dialog = new Dialog({player: {applySubtitleAppearance: value => {calls.push({...value}); return Promise.resolve(true);}}});
            window.dialog.show();
        }, {source, strings});
        const dlg = page.locator('.subtitleAppearanceDialog');
        assert.equal(await dlg.isVisible(), true);
        const bounds = await dlg.boundingBox();
        assert.ok(bounds.width <= 510 && bounds.height <= 680, JSON.stringify(bounds));
        assert.ok(bounds.height > 200, JSON.stringify(bounds));
        // The global form stylesheet may finish loading after the dialog CSS.
        await page.addStyleTag({path: path.join(root, 'vendor/web-snapshot/www/modules/formdialog.css')});
        const afterLateStyle = await dlg.boundingBox();
        assert.ok(afterLateStyle.width <= 510 && afterLateStyle.height <= 680, JSON.stringify(afterLateStyle));
        assert.equal(await dlg.locator('[data-setting]').count(), 5);
        assert.equal(await dlg.locator('[data-setting="textColor"] option:checked').textContent(), '白色');
        assert.equal(await dlg.locator('[data-setting="textBackground"] option:checked').textContent(), '透明');
        assert.equal(await dlg.locator('[data-setting="dropShadow"] option:checked').textContent(), '标准描边');
        assert.equal(await dlg.locator('.selectLabelText').count(), 5);
        assert.match(await dlg.locator('.subtitleAppearanceHint').textContent(), /相同的近似效果/);
        if (process.env.ETE_SCREENSHOT_PATH) await page.screenshot({path: process.env.ETE_SCREENSHOT_PATH});
        await dlg.locator('[data-setting="textColor"]').selectOption('#FF0000');
        assert.equal(await page.evaluate(() => probe.data.textColor), '#FF0000');
        assert.equal(await page.evaluate(() => probe.calls.at(-1).textColor), '#FF0000');
        await dlg.locator('[data-setting="textBackground"]').selectOption('#000000');
        assert.equal(await dlg.locator('[data-setting="textBackgroundOpacity"]').isVisible(), true);
        await dlg.locator('[data-setting="textSize"]').focus();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        assert.notEqual(await page.evaluate(() => probe.data.textSize), '');
        await dlg.locator('[data-setting="textBackground"]').selectOption('transparent');
        assert.equal(await dlg.locator('[data-setting="textBackgroundOpacity"]').isVisible(), false);
        await page.setViewportSize({width: 360, height: 640});
        const narrow = await dlg.boundingBox();
        assert.ok(narrow.width <= 360 && narrow.height <= 640, JSON.stringify(narrow));
        await dlg.locator('.btnCancel').click();
        assert.equal(await dlg.count(), 0);
        assert.deepEqual(errors, []);
        process.stdout.write(JSON.stringify({status: 'passed', bounds, savedChanges: await page.evaluate(() => probe.calls.length),
            scope: 'real dialog source and frozen theme CSS in isolated Chromium; synthetic host/player'}) + '\n');
    } finally {
        await browser.close();
    }
}

if (require.main === module) main().catch(error => {console.error(error); process.exitCode = 1;});
module.exports = {main};
