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

test('generated rule and assistant controls preserve Emby classes, hooks, and state', () => {
    const constructorClasses = {
        'emby-button': ['emby-button','emby-button-focusscale','emby-button-tv'],
        'emby-input': [],
        'emby-select': ['emby-select-backdropfilter','emby-select-focusscale','emby-select-tv']
    };
    const connectedClasses = {
        'emby-button': [],
        'emby-input': ['emby-input'],
        'emby-select': ['emby-select']
    };
    class FakeNode {
        constructor(tagName, customName) {
            this.tagName = tagName;
            this.customName = customName;
            this.children = [];
            this.dataset = {};
            this.attributes = {};
            this._classNames = new Set();
            Object.defineProperty(this, 'className', {
                get: () => Array.from(this._classNames).join(' '),
                set: value => { this._classNames = new Set(String(value || '').split(/\s+/).filter(Boolean)); }
            });
            this.classList = {
                add: (...names) => names.forEach(name => this._classNames.add(name)),
                remove: (...names) => names.forEach(name => this._classNames.delete(name)),
                contains: name => this._classNames.has(name)
            };
            this.disabled = false;
            this.value = '';
            this.hasInit = customName === 'emby-button';
            if (customName) (constructorClasses[customName] || []).forEach(name => this.classList.add(name));
        }
        connectedCallback() {
            // Button initialization is constructor-guarded. Inputs require a parent to initialize,
            // while selects add their base class during connection after their constructor setup.
            if (this.customName === 'emby-button' && this.hasInit) return;
            if (this.customName === 'emby-input' && !this.parentNode) return;
            (connectedClasses[this.customName] || []).forEach(name => this.classList.add(name));
        }
        appendChild(child) { this.children.push(child); child.parentNode = this; child.connectedCallback(); return child; }
        setAttribute(name, value) { this.attributes[name] = value; }
        querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
        querySelectorAll(selector) {
            const found = [];
            const selectors = selector.split(',').map(value => value.trim());
            const visit = node => node.children.forEach(child => {
                const matches = selectors.some(value => value.charAt(0) === '.'
                    ? child.classList.contains(value.slice(1)) : child.tagName === value.toLowerCase());
                if (matches) found.push(child);
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

    function renderRule(id, originState, isDraftRule) {
        return View.__renderRule({
            id, sourcePrefix: 'X:\\Media', cloudPrefix: '/Media', mountPrefix: '',
            storageType: 'cloud-mount', strategy: 'cloud-first', originState,
            order: ['direct-url', 'cd2-http', 'mount', 'native']
        }, isDraftRule, 'unknown');
    }
    const savedUser = renderRule('rule-user', 'USER', false);
    const savedAuto = renderRule('rule-auto', 'AUTO', false);
    const savedDisabled = renderRule('rule-disabled', 'DISABLED', false);
    const draft = renderRule('rule-draft', 'USER', true);
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
    const sampleControls = controls(sample);
    assert.equal(sampleControls.length, 4);

    function assertInitialized(control, label) {
        const expectedClasses = constructorClasses[control.customName];
        assert.ok(expectedClasses, label + ' is constructed as an Emby custom element');
        for (const className of expectedClasses) {
            assert.equal(control.classList.contains(className), true,
                label + ' preserves Emby constructor class ' + className);
        }
        for (const className of connectedClasses[control.customName]) {
            assert.equal(control.classList.contains(className), true,
                label + ' preserves Emby connected class ' + className);
        }
    }
    function button(root, hook) {
        return controls(root).find(control => control.tagName === 'button' && control.classList.contains(hook));
    }
    function assertRuleClasses(root, label) {
        const dynamicControls = controls(root);
        assert.ok(dynamicControls.length > 0, label + ' renders dynamic controls');
        dynamicControls.forEach(control => {
            assert.equal(control.customName, 'emby-' + control.tagName,
                label + ' constructs ' + control.tagName + ' with its is option');
            assertInitialized(control, label + ' ' + control.tagName);
        });
        assert.ok(dynamicControls.some(control => control.tagName === 'input' && control.classList.contains('rule-sourcePrefix')),
            label + ' retains input selector hooks');
        assert.ok(dynamicControls.some(control => control.tagName === 'select' && control.classList.contains('rule-strategy')),
            label + ' retains select selector hooks');
    }

    for (const [root, label] of [[savedUser,'saved USER'],[savedAuto,'saved AUTO'],[savedDisabled,'saved DISABLED'],[draft,'draft']]) {
        assertRuleClasses(root, label);
        assert.ok(button(root, 'btnTestRule'), label + ' keeps the test action hook');
        assert.ok(button(root, 'btnDisableRule'), label + ' keeps the disable action hook');
    }
    assert.ok(button(savedUser, 'btnRestoreAuto'), 'saved USER keeps restore action');
    assert.equal(button(savedAuto, 'btnRestoreAuto'), undefined, 'saved AUTO hides its restore action');
    assert.ok(button(savedDisabled, 'btnRestoreAuto'), 'saved DISABLED keeps restore action');
    assert.ok(button(draft, 'btnRestoreAuto'), 'draft keeps restore action');

    assert.equal(button(savedUser, 'btnTestRule').disabled, false);
    assert.equal(button(draft, 'btnTestRule').disabled, true);
    assert.equal(button(savedDisabled, 'btnDisableRule').disabled, true);
    assert.equal(button(savedDisabled, 'btnRestoreAuto').disabled, false);
    assert.ok(button(savedUser, 'btnDisableRule').classList.contains('ete-settings-button--danger'),
        'user-owned destructive action retains danger styling');
    assert.ok(button(savedAuto, 'btnDisableRule').classList.contains('ete-settings-button--text'),
        'automatic rule action retains its non-danger styling');
    assert.ok(button(draft, 'btnDisableRule').classList.contains('ete-settings-button--danger'),
        'draft removal retains danger semantics');

    sampleControls.forEach(control => assertInitialized(control, 'assistant sample ' + control.tagName));
    const sampleInputs = sampleControls.filter(control => control.tagName === 'input');
    assert.equal(sampleInputs.length, 3);
    assert.ok(sampleInputs.every(control => control.type === 'text' && control.attributes.autocomplete === 'off'),
        'assistant sample inputs retain their text-entry behavior');
    const removeSample = button(sample, 'btnRemoveSample');
    assert.ok(removeSample, 'assistant sample remove action keeps its delegated hook');
    assert.equal(removeSample.disabled, false);
});
