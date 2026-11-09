'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('diagnostic and download guidance retains timing, privacy and destructive-action boundaries', () => {
    const diagnostics = read('src/electronapp/plugins/mpvplayer/diagnostics.html');
    assert.match(diagnostics, /普通模式保留必要错误/);
    assert.match(diagnostics, /最多 15 秒/);
    assert.match(diagnostics, /保存后下一次播放生效，不影响当前播放/);
    assert.match(diagnostics, /仍可能包含服务器地址、媒体文件路径和错误信息/);
    assert.match(diagnostics, /分享前请检查内容/);
    assert.doesNotMatch(diagnostics, /永不丢失|彻底脱敏|修复.*EOF/i);
    const downloads = read('src/electronapp/plugins/mpvplayer/downloads.html');
    assert.match(downloads, /更改目录仅影响新任务/);
    assert.match(downloads, /退出后停止下载，下次登录后继续/);
    assert.match(downloads, /默认只删除记录、保留文件/);
    assert.match(downloads, /确认时可选择永久删除任务文件/);
});

test('download failures explain preserved files and unknown completion without claiming success', () => {
    let downloads;
    vm.runInNewContext(read('src/electronapp/enhanced/advance-download/renderer.js'), {
        define(_deps, factory) { downloads = factory({}, {}, () => {}); }
    });
    assert.match(downloads.message('temporary-changed'), /已停止操作，未覆盖或删除文件/);
    assert.match(downloads.message('publication-unconfirmed'), /尚未确认.*任务和文件已保留/);
    assert.match(downloads.message('publication-unconfirmed'), /继续.*核验/);
    assert.match(downloads.message('user-paused'), /重开客户端后仍保持暂停/);
    assert.match(downloads.message('file-changed'), /未使用或删除.*仅删除记录/);
    assert.match(downloads.message('collection-user-data-unavailable'), /本次未添加.*选择下载全部/);
});

for (const [locale, expected] of [
    ['zh-CN', '本地播放时，两种偏移阴影效果相同。'],
    ['zh-TW', '本地播放時，兩種偏移陰影效果相同。'],
    ['en-US', 'Both offset shadows look the same in the local player.']
]) test('subtitle limitation is readable in ' + locale + ' without changing stored choices', () => {
    const nodes = [];
    function node() {
        const value = {children: [], attributes: {}, className: '',
            classList: {add() {}, toggle() {}}, setAttribute(k, v) {this.attributes[k] = v;},
            appendChild(child) {child.parentNode = this; this.children.push(child);}, addEventListener() {},
            querySelector(selector) {return nodes.find(n => '[data-setting="' + n.attributes['data-setting'] + '"]' === selector);}};
        nodes.push(value); return value;
    }
    let Dialog;
    vm.runInNewContext(read('src/electronapp/enhanced/subtitle-appearance-dialog.js'), {
        document: {createElement: node}, require() {},
        define(_deps, factory) { Dialog = factory({createDialog: node, open: () => new Promise(() => {})},
            {getCurrentLocales: () => [locale], translate: key => key}, {getSubtitleAppearanceSettings: () => ({})}); }
    });
    new Dialog({}).show();
    const hint = nodes.find(n => n.className === 'fieldDescription subtitleAppearanceHint');
    assert.equal(hint.textContent, expected);
    assert.doesNotMatch(hint.textContent, /\uFFFD/);
    const choices = nodes.find(n => n.attributes['data-setting'] === 'dropShadow');
    assert.deepEqual(Array.from(choices.children, n => n.value), ['none', 'raised', 'depressed', 'uniform', 'dropshadow']);
});
