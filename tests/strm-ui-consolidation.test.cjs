'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pageRoot = path.join(__dirname, '../src/electronapp/plugins/mpvplayer');
const html = fs.readFileSync(path.join(pageRoot, 'strm.html'), 'utf8');
const css = fs.readFileSync(path.join(pageRoot, 'strm.css'), 'utf8');
const sharedCss = fs.readFileSync(path.join(pageRoot, 'enhanced-settings.css'), 'utf8');
const js = fs.readFileSync(path.join(pageRoot, 'strm.js'), 'utf8');

function controlClass(name) {
    return new RegExp('class="[^"\\n]*\\b' + name + '\\b[^"\\n]*"');
}

test('STRM form keeps its functional controls and explicit save wiring', () => {
    for (const name of [
        'chkEnabled', 'chkCd2Enabled', 'chkDirectUrlEnabled', 'txtCd2Origin',
        'txtCd2Token', 'btnSetToken', 'btnClearToken', 'btnTestConnection',
        'rulesList', 'btnAddRule', 'smartSamples', 'smartSample',
        'btnAddSample', 'btnAnalyzeMapping', 'btnAddSuggestedRule', 'btnSave'
    ]) {
        assert.match(html, controlClass(name), `missing ${name}`);
    }
    assert.match(html, /id="ete-cd2-origin"/);
    assert.match(html, /id="ete-smart-source-path"/);
    assert.match(html, /id="ete-smart-cloud-path"/);
    assert.match(html, /id="ete-smart-mount-path"/);
    assert.match(html, /type="submit"[^>]*class="[^"]*btnSave/);
    assert.match(js, /querySelector\('form'\)\.addEventListener\('submit'/);
    for (const name of [
        'btnSetToken', 'btnClearToken', 'btnTestConnection', 'btnAddRule',
        'btnAddSample', 'btnAnalyzeMapping', 'btnAddSuggestedRule'
    ]) {
        assert.match(js, new RegExp("querySelector\\('\\." + name + "'\\)\\.addEventListener\\('click'"));
    }
    for (const name of ['btnTestRule', 'btnRestoreAuto', 'btnDisableRule', 'btnRemoveSample']) {
        assert.match(js, new RegExp("classList\\.contains\\('" + name + "'\\)"));
    }
});

test('STRM labels, Emby controls, and scoped layout styles stay coherent', () => {
    for (const label of [
        'STRM 源路径', 'CloudDrive2 路径', '本地挂载路径',
        'STRM 源文件路径', 'CloudDrive2 文件路径', '本地挂载文件路径（可选）'
    ]) {
        assert.ok(html.includes(label) || js.includes(label), `missing ${label}`);
    }
    assert.match(html, /ete-settings-page strm-settings-page/);
    assert.match(js, /css!\.\/enhanced-settings/);
    assert.match(html, /<input\b[^>]*is="emby-input"/);
    assert.match(html, /<input\b[^>]*is="emby-checkbox"/);
    assert.match(html, /class="raised button-submit ete-settings-button ete-settings-button--primary btnSave"/);
    assert.match(js, /select\.setAttribute\('is', 'emby-select'\)/);
    assert.match(js, /remove\.setAttribute\('is', 'emby-button'\)/);
    assert.match(css, /\.strm-settings-page\s*>\s*form\.auto-center\s*\{[^}]*max-width:\s*100%;[^}]*width:\s*100%;/s,
        'STRM form overrides Emby auto-center width limits within the shared page width');
    assert.match(css, /\.ete-strm-status-row\b/);
    assert.match(html, /<section class="[^"]*ete-strm-assistant"/);
    for (const label of ['本地挂载', 'CloudDrive2', '路径规则']) {
        assert.match(js, new RegExp("createRuleStatusRow\\('" + label + "'"));
    }
    assert.match(js, /\.ete-strm-rule-connection/);
    assert.match(js, /\.ete-strm-rule-format/);
    assert.match(js, /\.ete-strm-rule-mount/);
    assert.match(css, /@media\s*\(max-width:\s*\d+px\)/);
    assert.match(sharedCss, /\.ete-settings-page\s*\{[^}]*max-width:\s*1240px;[^}]*width:\s*100%;/s);
    assert.match(sharedCss, /border:\s*1px solid var\(--line-background/);
    assert.doesNotMatch(sharedCss, /--ete-settings-[\w-]+\s*:|color-scheme\s*:\s*dark/i);
    assert.match(css, /overflow-wrap:\s*anywhere|word-break:\s*break-word/);
    assert.match(sharedCss, /:focus-visible/);
    assert.doesNotMatch(js, /\.innerHTML\s*=/);
});
