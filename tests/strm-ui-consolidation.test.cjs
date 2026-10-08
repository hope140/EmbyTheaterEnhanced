'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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
    assert.match(js, /document\.createElement\(tag, \{is: customName\}\)/);
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

test('generated rule and assistant controls are born as Emby customized elements', () => {
    class FakeNode {
        constructor(tagName, customName) {
            this.tagName = tagName;
            this.customName = customName;
            this.children = [];
            this.dataset = {};
            this.attributes = {};
            this.className = '';
            this.classList = {
                add: name => { this.className = (this.className + ' ' + name).trim(); },
                remove: name => { this.className = this.className.split(/\s+/).filter(value => value !== name).join(' '); }
            };
        }
        appendChild(child) { this.children.push(child); return child; }
        setAttribute(name, value) { this.attributes[name] = value; }
        querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
        querySelectorAll(selector) {
            const found = [];
            const className = selector.replace(/^\./, '');
            const visit = node => node.children.forEach(child => {
                if (child.className.split(/\s+/).includes(className)) found.push(child);
                visit(child);
            });
            visit(this);
            return found;
        }
    }

    let View;
    const instrumented = js.replace('return SettingsView;',
        'SettingsView.__renderRule = renderRule; SettingsView.__createAssistantSample = createAssistantSample; return SettingsView;');
    assert.notEqual(instrumented, js, 'test hooks target the current renderer module');
    vm.runInNewContext(instrumented, {
        define(_dependencies, factory) {
            View = factory({}, function BaseView() {}, null, null, null, null, null, {});
        },
        document: {createElement(tagName, options) { return new FakeNode(tagName, options && options.is); }}
    }, {filename: 'strm.js'});

    const rule = View.__renderRule({
        id: 'rule-1', sourcePrefix: 'X:\\Media', cloudPrefix: '/Media', mountPrefix: '',
        storageType: 'cloud-mount', strategy: 'cloud-first', originState: 'USER',
        order: ['direct-url', 'cd2-http', 'mount', 'native']
    }, false, 'unknown');
    const sample = View.__createAssistantSample(2);
    function controls(root) {
        const found = [];
        const visit = node => node.children.forEach(child => {
            if (['input', 'select', 'button'].includes(child.tagName)) found.push(child);
            visit(child);
        });
        visit(root);
        return found;
    }
    const ruleControls = controls(rule);
    const sampleControls = controls(sample);
    assert.equal(ruleControls.length, 8);
    assert.equal(sampleControls.length, 4);
    for (const control of ruleControls.concat(sampleControls)) {
        assert.equal(control.customName, 'emby-' + control.tagName,
            control.tagName + ' must be created with its is option, before attributes are set');
    }
});
