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
    const page = await browser.newPage({viewport: {width: 960, height: 540}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<!doctype html><html lang="zh-CN"><body style="margin:0;background:linear-gradient(110deg,#182b36,#738b8a 45%,#23333e 65%,#111820);color:#fff;font:20px Arial,sans-serif;min-height:100vh"><div style="position:fixed;bottom:12px;left:16px;font-size:12px">隔离浏览器预览 · 合成背景 · 非 Windows 播放画面</div></body></html>');
        for (const relative of [
            'vendor/web-snapshot/www/modules/layout.css',
            'vendor/web-snapshot/www/modules/themes/dark/theme.css',
            'vendor/web-snapshot/www/modules/dialoghelper/dialoghelper.css',
            'vendor/web-snapshot/www/modules/formdialog.css',
            'vendor/web-snapshot/www/modules/emby-elements/emby-select/emby-select.css',
            'src/electronapp/enhanced/subtitle-appearance-dialog.css'
        ]) await page.addStyleTag({path: path.join(root, relative)});
        const iconFont = fs.readFileSync(path.join(root, 'vendor/web-snapshot/www/modules/fonts/material-icons/LDItaoyNOAY6Uewc665JcIzCKsKc_M9flwmP_3.woff2')).toString('base64');
        const iconCss = fs.readFileSync(path.join(root, 'vendor/web-snapshot/www/modules/fonts/material-icons/style.css'), 'utf8');
        await page.addStyleTag({content: iconCss.replace('LDItaoyNOAY6Uewc665JcIzCKsKc_M9flwmP_3.woff2', `data:font/woff2;base64,${iconFont}`)});
        await page.evaluate(({source, strings}) => {
            customElements.define('emby-select', class extends HTMLSelectElement {
                connectedCallback() {
                    this.classList.add('emby-select');
                    if (!this.previousElementSibling || !this.previousElementSibling.classList.contains('selectLabelText')) {
                        const label = document.createElement('label');
                        label.className = 'selectLabelText';
                        label.textContent = this.getAttribute('label');
                        this.parentNode.insertBefore(label, this);
                        this.parentNode.insertAdjacentHTML('beforeend', '<div class="selectArrowContainer"><div style="visibility:hidden">0</div><i class="selectArrow md-icon">&#xE313;</i></div>');
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
                    const host = document.createElement('div');
                    host.className = 'dialogContainer';
                    host.appendChild(dlg);
                    document.body.appendChild(host);
                    return new Promise(resolve => { dlg._resolve = resolve; });
                },
                close: dlg => { dlg.parentNode.remove(); dlg._resolve(); }
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
        assert.ok(bounds.width <= 768 && bounds.height <= 454, JSON.stringify(bounds));
        assert.ok(bounds.height > 200, JSON.stringify(bounds));
        // The global form stylesheet may finish loading after the dialog CSS.
        await page.addStyleTag({path: path.join(root, 'vendor/web-snapshot/www/modules/formdialog.css')});
        const afterLateStyle = await dlg.boundingBox();
        assert.deepEqual(afterLateStyle, bounds);
        const surface = await dlg.evaluate(el => {
            const style = getComputedStyle(el);
            const header = el.querySelector('.formDialogHeader');
            const title = header.querySelector('h3').getBoundingClientRect();
            const box = el.getBoundingClientRect();
            return {background: style.backgroundColor, blur: style.backdropFilter,
                header: getComputedStyle(header).backgroundColor,
                titleOffset: Math.abs((title.x + title.width / 2) - (box.x + box.width / 2))};
        });
        assert.match(surface.background, /0\.76\)/);
        assert.match(surface.blur, /blur\(/);
        assert.equal(surface.header, 'rgba(0, 0, 0, 0)');
        assert.ok(surface.titleOffset < 1, JSON.stringify(surface));
        assert.equal(await dlg.locator('[data-setting]').count(), 5);
        assert.equal(await dlg.locator('[data-setting="textColor"] option:checked').textContent(), '白色');
        assert.equal(await dlg.locator('[data-setting="textBackground"] option:checked').textContent(), '透明');
        assert.equal(await dlg.locator('[data-setting="dropShadow"] option:checked').textContent(), '标准描边');
        assert.equal(await dlg.locator('.selectLabelText').count(), 5);
        assert.match(await dlg.locator('.subtitleAppearanceHint').textContent(), /本地播放时，两种偏移阴影效果相同/);
        await page.evaluate(() => document.fonts.ready);
        if (process.env.ETE_SCREENSHOT_PATH) await page.screenshot({path: process.env.ETE_SCREENSHOT_PATH});
        await dlg.locator('[data-setting="textColor"]').selectOption('#FF0000');
        assert.equal(await page.evaluate(() => probe.data.textColor), '#FF0000');
        assert.equal(await page.evaluate(() => probe.calls.at(-1).textColor), '#FF0000');
        await dlg.locator('[data-setting="textBackground"]').selectOption('#000000');
        assert.equal(await dlg.locator('[data-setting="textBackgroundOpacity"]').isVisible(), true);
        await dlg.locator('[data-setting="textSize"]').focus();
        assert.equal(await dlg.locator('[data-setting="textSize"]').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        assert.notEqual(await page.evaluate(() => probe.data.textSize), '');
        await dlg.locator('[data-setting="textBackground"]').selectOption('transparent');
        assert.equal(await dlg.locator('[data-setting="textBackgroundOpacity"]').isVisible(), false);
        await page.setViewportSize({width: 360, height: 640});
        const narrow = await dlg.boundingBox();
        assert.ok(narrow.width <= 360 && narrow.height <= 640, JSON.stringify(narrow));
        await dlg.locator('[data-setting="textBackground"]').selectOption('#000000');
        await dlg.locator('[data-setting="textBackgroundOpacity"]').scrollIntoViewIfNeeded();
        await dlg.locator('[data-setting="textBackgroundOpacity"]').selectOption('.50');
        assert.equal(await page.evaluate(() => probe.calls.at(-1).textBackgroundOpacity), '.50');
        assert.equal(await dlg.evaluate(el => el.scrollWidth <= el.clientWidth), true);
        if (process.env.ETE_SCREENSHOT_PATH) await page.screenshot({path: process.env.ETE_SCREENSHOT_PATH.replace(/\.png$/, '-narrow.png')});
        await dlg.locator('.btnCancel').focus();
        assert.equal(await dlg.locator('.btnCancel').evaluate(el => el === document.activeElement), true);
        await page.keyboard.press('Enter');
        assert.equal(await dlg.count(), 0);
        await page.evaluate(() => { dialog.show(); });
        await page.locator('.subtitleAppearanceDialog .btnCancel').click();
        assert.equal(await dlg.count(), 0);
        assert.deepEqual(errors, []);
        process.stdout.write(JSON.stringify({status: 'passed', bounds, narrow, surface, savedChanges: await page.evaluate(() => probe.calls.length),
            scope: 'real dialog source and frozen theme CSS in isolated Chromium; synthetic host/player'}) + '\n');
    } finally {
        await browser.close();
    }
}

if (require.main === module) main().catch(error => {console.error(error); process.exitCode = 1;});
module.exports = {main};
