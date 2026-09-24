'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/electronapp/plugins/mpvplayer/strm.js'), 'utf8');

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return {promise, resolve, reject};
}

function statusNode() {
    return {
        textContent: '',
        role: '',
        setAttribute(name, value) {
            if (name === 'role') this.role = value;
        }
    };
}

function loadView(invoke) {
    let View;
    function BaseView() {}
    vm.runInNewContext(source, {
        define(_dependencies, factory) {
            View = factory({}, BaseView, null, null, null, null, null, {});
        },
        document: {createElement(tagName) { return {tagName, textContent: ''}; }},
        window: {ipc: {invoke}}
    }, {filename: 'strm.js'});
    return View;
}

function savePage(invoke) {
    const View = loadView(invoke);
    const saveState = statusNode();
    const enabled = {checked: true, disabled: false};
    const cd2Enabled = {checked: true, disabled: false};
    const directUrlEnabled = {checked: true, disabled: false};
    const origin = {value: 'http://127.0.0.1:19799', disabled: false};
    const saveButton = {disabled: false};
    const previouslyDisabled = {disabled: true};
    const analyzeButton = {disabled: false};
    const addSuggestedButton = {disabled: false};
    const controls = [enabled, cd2Enabled, directUrlEnabled, origin, saveButton,
        previouslyDisabled, analyzeButton, addSuggestedButton];
    const list = {
        children: [],
        get firstChild() { return this.children[0] || null; },
        appendChild(node) { this.children.push(node); },
        removeChild(node) { this.children.splice(this.children.indexOf(node), 1); }
    };
    const nodes = {
        '.chkEnabled': enabled,
        '.chkCd2Enabled': cd2Enabled,
        '.chkDirectUrlEnabled': directUrlEnabled,
        '.txtCd2Origin': origin,
        '.btnSave': saveButton,
        '.saveState': saveState,
        '.rulesList': list,
        '.txtCd2Token': {value: ''},
        '.tokenState': statusNode(),
        '.btnTestConnection': {disabled: false},
        '.connectionState': statusNode(),
        '.ete-strm-assistant-preview': {hidden: false},
        '.ete-strm-assistant-suggestion': {hidden: false},
        '.btnAddSuggestedRule': addSuggestedButton,
        '.btnAnalyzeMapping': analyzeButton,
        '.smartMappingState': statusNode()
    };
    const view = {
        querySelector(selector) {
            if (!nodes[selector]) throw new Error('unexpected selector: ' + selector);
            return nodes[selector];
        },
        querySelectorAll(selector) {
            if (selector === '.ete-strm-rule-card') return [];
            if (selector === '.ete-strm-rule-connection') return [];
            if (selector === 'input, select, button, textarea') return controls;
            throw new Error('unexpected selector: ' + selector);
        }
    };
    const page = Object.create(View.prototype);
    page.view = view;
    page.config = {
        version: 1,
        enabled: true,
        cd2: {enabled: true, origin: 'http://127.0.0.1:19798', directUrlEnabled: true},
        rules: []
    };
    page.draftRuleIds = Object.assign(Object.create(null), {'draft-one': true});
    page.mappingRequestSequence = 0;
    page.connectionStatus = 'unknown';
    page.connectionRevision = -1;
    page.connectionRequestSequence = 0;
    return {page, saveState, origin, controls, saveButton, previouslyDisabled,
        analyzeButton, addSuggestedButton, list};
}

function connectionPage(invoke) {
    const View = loadView(invoke);
    const connection = statusNode();
    const cards = Array.from({length: 2}, statusNode);
    const testButton = {disabled: false};
    const testResult = statusNode();
    const ruleCard = {
        querySelector(selector) {
            if (selector === '.ete-strm-rule-test') return testResult;
            throw new Error('unexpected selector: ' + selector);
        }
    };
    const view = {
        querySelector(selector) {
            if (selector === '.connectionState') return connection;
            if (selector === '.btnTestConnection') return testButton;
            throw new Error('unexpected selector: ' + selector);
        },
        querySelectorAll(selector) {
            if (selector === '.ete-strm-rule-connection') return cards;
            throw new Error('unexpected selector: ' + selector);
        }
    };
    const page = Object.create(View.prototype);
    page.view = view;
    page.connectionStatus = 'unknown';
    page.connectionRevision = -1;
    page.connectionRequestSequence = 0;
    return {page, cards, connection, testButton, ruleCard, testResult};
}

function previewPage(invoke) {
    const View = loadView(invoke);
    const analyzeButton = {disabled: false};
    const addButton = {disabled: true};
    const preview = {hidden: true};
    const suggestion = {hidden: true};
    const state = statusNode();
    const sampleValues = [
        {'.txtSmartSourcePath': 'X:\\Media\\Series\\A\\a.mkv',
            '.txtSmartCloudPath': '/115/Series/A/a.mkv', '.txtSmartMountPath': ''},
        {'.txtSmartSourcePath': 'X:\\Media\\Series\\B\\b.mkv',
            '.txtSmartCloudPath': '/115/Series/B/b.mkv', '.txtSmartMountPath': ''}
    ];
    const samples = sampleValues.map(values => ({
        querySelector(selector) {
            if (!(selector in values)) throw new Error('unexpected selector: ' + selector);
            return {value: values[selector]};
        }
    }));
    const nodes = {
        '.btnAnalyzeMapping': analyzeButton,
        '.btnAddSuggestedRule': addButton,
        '.ete-strm-assistant-preview': preview,
        '.ete-strm-assistant-suggestion': suggestion,
        '.smartMappingState': state
    };
    const view = {
        querySelector(selector) {
            if (!nodes[selector]) throw new Error('stale preview rendered: ' + selector);
            return nodes[selector];
        },
        querySelectorAll(selector) {
            if (selector === '.smartSample') return samples;
            if (selector === '.ete-strm-rule-card') return [];
            throw new Error('unexpected selector: ' + selector);
        }
    };
    const page = Object.create(View.prototype);
    page.view = view;
    page.config = null;
    page.assistantPreview = null;
    page.mappingRequestSequence = 0;
    return {page, samples, sampleValues, analyzeButton, addButton, preview, suggestion, state};
}

test('Save locks current form controls, rejects a second submission, and retains draft after failure', async () => {
    const pending = deferred();
    const requests = [];
    const {page, origin, controls, saveButton, previouslyDisabled, saveState} = savePage((channel, payload) => {
        requests.push({channel, payload});
        return pending.promise;
    });

    const first = page.saveSettings();
    const second = page.saveSettings();
    await Promise.resolve();
    assert.equal(requests.length, 1, 'two submit events must not issue concurrent saves');
    assert.equal(requests[0].channel, 'enhanced-strm-config-save');
    assert.equal(requests[0].payload.config.cd2.origin, 'http://127.0.0.1:19799');
    assert.ok(controls.every(control => control.disabled), 'form controls must be locked while Save is pending');

    pending.resolve({status: 'error', reason: 'invalid_config'});
    await Promise.all([first, second]);
    assert.equal(origin.value, 'http://127.0.0.1:19799', 'failed Save must keep the visible draft');
    assert.equal(page.config.cd2.origin, 'http://127.0.0.1:19798', 'failed Save must not adopt unsaved config');
    assert.equal(saveState.role, 'alert');
    assert.equal(saveButton.disabled, false);
    assert.equal(previouslyDisabled.disabled, true, 'a previously disabled control must stay disabled');
    assert.ok(controls.filter(control => control !== previouslyDisabled).every(control => !control.disabled));
});

test('successful Save clears draft tracking and invalidates the old assistant preview', async () => {
    const pending = deferred();
    const {page, origin, saveState, analyzeButton, addSuggestedButton, list} = savePage(() => pending.promise);
    page.assistantPreview = {suggestion: {sourcePrefix: 'X:\\Media', cloudPrefix: '/115'}};
    const saved = page.saveSettings();
    pending.resolve({status: 'saved', requiresRestart: true, connectionStatus: 'unknown', connectionRevision: 1,
        config: {version: 1, enabled: true,
            cd2: {enabled: true, origin: origin.value, directUrlEnabled: true, tokenConfigured: false}, rules: []}});
    await saved;
    assert.equal(page.config.cd2.origin, 'http://127.0.0.1:19799');
    assert.equal(Object.keys(page.draftRuleIds).length, 0);
    assert.equal(page.assistantPreview, null);
    assert.equal(addSuggestedButton.disabled, true);
    assert.equal(analyzeButton.disabled, false);
    assert.equal(list.children.length, 1);
    assert.match(saveState.textContent, /已保存/);
});

test('terminal connection status cannot regress to checking at the same revision', () => {
    const {page, cards, connection} = connectionPage(async () => null);
    assert.equal(page.applyConnectionSnapshot({connectionStatus: 'connected', connectionRevision: 7}), true);
    assert.equal(page.applyConnectionSnapshot({connectionStatus: 'checking', connectionRevision: 7}), false);
    assert.equal(connection.textContent, 'CloudDrive2 最近测试：已连接');
    assert.ok(cards.every(card => card.textContent === 'CloudDrive2 最近测试：已连接'));

    assert.equal(page.applyConnectionSnapshot({connectionStatus: 'failed', connectionRevision: 8}), true);
    assert.equal(page.applyConnectionSnapshot({connectionStatus: 'checking', connectionRevision: 8}), false);
    assert.equal(connection.textContent, 'CloudDrive2 最近测试：连接失败');
    assert.ok(cards.every(card => card.textContent === 'CloudDrive2 最近测试：连接失败'));
});

test('a delayed rule check cannot replace a completed connection result with checking', async () => {
    const pending = deferred();
    const {page, cards, connection, ruleCard} = connectionPage(() => pending.promise);
    const ruleCheck = page.testRule('saved-rule', ruleCard);
    page.applyConnectionSnapshot({connectionStatus: 'connected', connectionRevision: 3});
    pending.resolve({status: 'ok', ruleId: 'saved-rule', mount: 'not_configured', cloud: 'mapped',
        connectionStatus: 'checking', connectionRevision: 3});
    await ruleCheck;
    assert.equal(connection.textContent, 'CloudDrive2 最近测试：已连接');
    assert.ok(cards.every(card => card.textContent === 'CloudDrive2 最近测试：已连接'));
});

test('a late connection test result cannot replace a newer completed attempt', async () => {
    const old = deferred();
    const current = deferred();
    const responses = [old.promise, current.promise];
    const {page, cards, connection, testButton} = connectionPage(() => responses.shift());
    const first = page.testConnection();
    const second = page.testConnection();

    current.resolve({status: 'connection_failed', reason: 'connection_failed',
        connectionStatus: 'failed', connectionRevision: 2});
    await second;
    assert.equal(connection.textContent, 'CloudDrive2 最近测试：连接失败');
    assert.equal(testButton.disabled, false);

    old.resolve({status: 'stale', reason: 'superseded',
        connectionStatus: 'checking', connectionRevision: 2});
    await first;
    assert.equal(connection.textContent, 'CloudDrive2 最近测试：连接失败');
    assert.ok(cards.every(card => card.textContent === 'CloudDrive2 最近测试：连接失败'));
});

test('input or sample invalidation makes an in-flight preview unable to re-enable Add', async () => {
    for (const change of ['input changed', 'sample removed', 'samples reordered']) {
        const pending = deferred();
        const {page, samples, sampleValues, analyzeButton, addButton, preview, suggestion} = previewPage(() => pending.promise);
        const analysis = page.analyzeMapping();
        if (change === 'input changed') sampleValues[0]['.txtSmartSourcePath'] = 'X:\\Media\\Series\\A\\changed.mkv';
        if (change === 'sample removed') samples.pop();
        if (change === 'samples reordered') samples.reverse();
        page.invalidateAssistant();
        pending.resolve({status: 'ok', preview: {
            coverage: {status: 'NOT_COVERED'},
            fileMatch: {status: 'MATCHED', confidence: 'HIGH'},
            boundary: {status: 'MATCHED', confidence: 'HIGH'},
            suggestion: {sourcePrefix: 'X:\\Media', cloudPrefix: '/115'}
        }});
        await analysis;
        assert.equal(page.assistantPreview, null, change);
        assert.equal(addButton.disabled, true, change);
        assert.equal(preview.hidden, true, change);
        assert.equal(suggestion.hidden, true, change);
        assert.equal(analyzeButton.disabled, false, change);
    }
});

test('an older preview cannot enable Analyze while a newer preview remains pending', async () => {
    const old = deferred();
    const current = deferred();
    const responses = [old.promise, current.promise];
    const {page, analyzeButton, addButton} = previewPage(() => responses.shift());
    const first = page.analyzeMapping();
    const second = page.analyzeMapping();

    old.resolve({status: 'error', reason: 'preview_failed'});
    await first;
    assert.equal(analyzeButton.disabled, true, 'older completion must not unlock a newer request');
    assert.equal(addButton.disabled, true);

    current.resolve({status: 'error', reason: 'preview_failed'});
    await second;
    assert.equal(analyzeButton.disabled, false);
    assert.equal(addButton.disabled, true);
});
