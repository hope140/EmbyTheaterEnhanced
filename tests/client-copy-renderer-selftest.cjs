'use strict';

// Explicit headless probe: actual maintained pages/controllers and frozen control CSS.
// IPC, server/account data and the player are synthetic; no ETE process is started.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const inputs = {};
function read(file) {
    const bytes = fs.readFileSync(path.join(root, file));
    inputs[file] = crypto.createHash('sha256').update(bytes).digest('hex');
    return bytes.toString('utf8');
}

async function main(executable = process.argv[2], output = process.argv[3]) {
    if (!executable || !path.isAbsolute(executable)) throw Error('Supply an absolute installed Chromium executable.');
    if (output) {
        output = path.resolve(output);
        const relative = path.relative(path.join(root, '.work'), output);
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || fs.existsSync(output)) throw Error('Output must be fresh and under this worktree .work.');
        fs.mkdirSync(output, {recursive: true});
    }
    const controls = ['button', 'input', 'select', 'checkbox'];
    const sharedCss = ['modules/flexstyles.css', 'modules/layout.css', 'modules/themes/dark/theme.css',
        ...controls.map(n => 'modules/emby-elements/emby-' + n + '/emby-' + n + '.css')]
        .map(f => read('vendor/web-snapshot/www/' + f)).join('\n') + read('src/electronapp/plugins/mpvplayer/enhanced-settings.css');
    const componentSources = [read('vendor/web-snapshot/www/modules/babelhelpers.js'),
        ...controls.map(n => read('vendor/web-snapshot/www/modules/emby-elements/emby-' + n + '/emby-' + n + '.js'))];
    const base = read('vendor/web-snapshot/www/modules/viewmanager/baseview.js');
    const browser = await require('playwright').chromium.launch({executablePath: executable, headless: true});
    const results = [];
    try {
        for (const name of ['diagnostics', 'downloads', 'strm', 'about', 'cache-management']) {
            const page = await browser.newPage({viewport: {width: 960, height: 720}}), errors = [];
            page.on('pageerror', e => errors.push(e.message));
            await page.route('**/*', route => route.abort());
            const html = read('src/electronapp/plugins/mpvplayer/' + name + '.html');
            const controller = read('src/electronapp/plugins/mpvplayer/' + name + '.js');
            const downloadSource = read('src/electronapp/enhanced/advance-download/renderer.js');
            await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');
            await page.addStyleTag({content: sharedCss + read('src/electronapp/plugins/mpvplayer/' + name + '.css') +
                '\nbody{margin:0;font:16px "Segoe UI",sans-serif;background:#181818;color:white}.view{height:auto}'});
            await page.evaluate(({html, controller, name, componentSources, base, downloadSource}) => {
                function amd(code, deps = {}) {
                    let result;
                    const exports = {}, noop = () => {}, fallback = new Proxy({}, {get: () => noop});
                    const dom = {allowBackdropFilter: () => false, supportsEventListenerOnce: () => false,
                        addEventListener: (n, ...args) => n.addEventListener(...args), removeEventListener: (n, ...args) => n.removeEventListener(...args)};
                    window.define = (names, factory) => {result = factory(...names.map(key => key === 'exports' ? exports :
                        deps[key] || (key.includes('layoutmanager') ? {default: {tv: false}} : key.includes('globalize') ? {default: {translate: k => k}} :
                        key.includes('dom.js') ? {default: dom} : {default: fallback}))) || exports;};
                    window.define.amd = {};
                    (0, eval)(code); return result;
                }
                window.require = () => Promise.resolve([]);
                componentSources.forEach(code => amd(code));
                document.body.innerHTML = html;
                // Cache behavior is covered by the existing real-owner renderer probe.
                if (name === 'cache-management') return;
                window.probe = {calls: [], failSave: false, confirms: []};
                window.confirm = text => {probe.confirms.push(text); return true;};
                window.ipc = {invoke: async (channel, payload) => {
                    probe.calls.push({channel, payload});
                    if (channel === 'enhanced-diagnostics-status') return {status: 'ok', enabled: true, diagnosticMode: 'normal', currentBytes: 512};
                    if (channel === 'enhanced-diagnostics-set-mode') return {status: probe.failSave ? 'error' : 'saved'};
                    if (channel === 'enhanced-diagnostics-clear') return {status: 'cleared'};
                    if (channel === 'enhanced-maintenance-download-update') return {status: 'installing', source: 'synthetic', fileName: 'synthetic.exe'};
                    return {status: 'ok'};
                }, on() {}, removeListener() {}};
                const Base = amd(base).default;
                const downloads = amd(downloadSource, {connectionManager: {}, events: {}, toast() {}});
                const View = amd(controller, {baseView: Base, loading: {show() {}, hide() {}}, '../../enhanced/advance-download/renderer.js': downloads});
                probe.view = new View(document.querySelector('.view'));
                if (name === 'strm') document.querySelector('.btnAddSample').click();
                if (name === 'downloads') {
                    probe.view.row({id: 'synthetic', title: '测试下载', state: 'complete', fileState: 'file-changed', total: 1048576});
                    probe.view.row({id: 'pending', title: '测试保存状态', state: 'failed', reason: 'publication-unconfirmed'});
                }
            }, {html, controller, name, componentSources, base, downloadSource});
            if (name === 'diagnostics') {
                await page.evaluate(async () => {await probe.view.loadStatus(); document.querySelector('.selectDiagnosticMode').value = 'detailed'; await probe.view.saveMode();});
                assert.match(await page.locator('.diagnosticsState').textContent(), /下一次播放生效.*必要错误/);
                await page.evaluate(async () => {probe.failSave = true; await probe.view.saveMode();});
                assert.match(await page.locator('.diagnosticsState').textContent(), /保存失败.*未更改/);
                assert.equal(await page.locator('.diagnosticsState').getAttribute('role'), 'alert');
                await page.evaluate(() => probe.view.clearLogs());
                assert.match((await page.evaluate(() => probe.confirms)).join(' '), /备份日志都将删除/);
            }
            if (name === 'downloads') assert.match(await page.locator('.downloadTasks').textContent(), /不会自动使用或删除.*尚未确认文件是否保存完成/);
            if (name === 'strm') {
                assert.equal(await page.locator('.smartSample').count(), 2);
                assert.match(await page.locator('.smartSample').last().textContent(), /本机可访问的路径，用于本地挂载播放/);
            }
            if (name === 'about') {
                await page.evaluate(async () => {document.querySelector('.about-update').hidden = false; await probe.view.downloadUpdate();});
                assert.match(await page.locator('.aboutUpdateState').textContent(), /退出客户端.*安装向导.*Windows 安全检查/);
                await page.evaluate(() => probe.view.renderKernelStatus({status: 'unavailable', reason: 'helper-identity-unavailable'}));
                assert.match(await page.locator('.aboutKernelState').textContent(), /来源或文件校验未通过/);
                await page.evaluate(() => {
                    probe.view.renderKernelStatus({status: 'ok', selectionState: 'valid', selectedCandidateId: null,
                        candidates: [{candidateId: 'a'.repeat(64), version: '测试内核', sizeBytes: 1024}], runtime: {activationState: 'baseline-lazy'}});
                    document.querySelector('.aboutKernelCandidates details').open = true;
                });
                assert.match(await page.locator('.aboutKernelCandidates').textContent(), /来源声明未独立核验.*NOT_ASSESSED.*UNKNOWN/);
            }
            for (const width of [960, 360]) {
                await page.setViewportSize({width, height: 720});
                const layout = await page.evaluate(() => ({scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
                    text: document.querySelector('.view').textContent}));
                assert.ok(layout.scrollWidth <= layout.clientWidth, name + ' overflows at ' + width);
                assert.doesNotMatch(layout.text, /\uFFFD/);
                if (output) await page.screenshot({path: path.join(output, name + '-' + width + '.png'), fullPage: true});
                const last = page.locator(({diagnostics: '.btnClearDiagnostics', downloads: '.downloadTaskReason', strm: '.btnSave',
                    about: '.aboutKernelCandidates details', 'cache-management': '.cacheSafetyNote'})[name]).last();
                await last.scrollIntoViewIfNeeded();
                const box = await last.boundingBox();
                assert.ok(box && box.y < 720 && box.y + box.height > 0, name + ' last guidance is unreachable');
                if (output) await page.screenshot({path: path.join(output, name + '-' + width + '-end.png'), fullPage: true});
                results.push({page: name, width, horizontalOverflow: false});
            }
            assert.deepEqual(errors, []);
            await page.close();
        }
        const report = {status: 'passed', browser: browser.version(), results, inputs,
            scope: 'headless maintained pages/controllers and frozen controls/CSS; synthetic IPC and data; no ETE, server, real download, playback or installation'};
        if (output) fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        console.log(JSON.stringify(report));
    } finally {await browser.close();}
}
if (require.main === module) main().catch(error => {console.error(error); process.exitCode = 1;});
module.exports = {main};
