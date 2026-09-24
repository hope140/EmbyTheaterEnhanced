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

class FakeNode {
    constructor(tagName) {
        this.tagName = tagName;
        this.children = [];
        this.dataset = {};
        this.attributes = Object.create(null);
        this.textContent = '';
        this.value = '';
        this.checked = false;
        this.disabled = false;
        this.hidden = false;
        this.className = '';
        this.classList = {
            add: name => { if (!this.className.split(/\s+/).includes(name)) this.className = (this.className + ' ' + name).trim(); },
            remove: name => { this.className = this.className.split(/\s+/).filter(value => value !== name).join(' '); },
            contains: name => this.className.split(/\s+/).includes(name)
        };
    }
    appendChild(node) { this.children.push(node); node.parentNode = this; return node; }
    removeChild(node) { this.children.splice(this.children.indexOf(node), 1); node.parentNode = null; return node; }
    get firstChild() { return this.children[0] || null; }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener() {}
    focus() {}
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    querySelectorAll(selector) {
        const classes = selector.split(',').map(value => value.trim().replace(/^\./, ''));
        const found = [];
        const visit = node => node.children.forEach(child => {
            if (classes.some(name => child.classList && child.classList.contains(name))) found.push(child);
            visit(child);
        });
        visit(this);
        return found;
    }
    closest(selector) {
        const name = selector.replace(/^\./, '');
        for (let node = this; node; node = node.parentNode) {
            if (node.classList && node.classList.contains(name)) return node;
        }
        return null;
    }
}

function loadView(invoke) {
    let View;
    function BaseView() {}
    vm.runInNewContext(source, {
        define(_dependencies, factory) {
            View = factory({}, BaseView, null, null, null, null, null, {
                removeDraftRule(rules, id) { return rules.filter(rule => rule.id !== id); }
            });
        },
        document: {createElement(tagName) { return new FakeNode(tagName); }},
        window: {ipc: {invoke}, confirm() { return true; }}
    }, {filename: 'strm.js'});
    return View;
}

function tokenDraftPage(invoke, config) {
    const View = loadView(invoke);
    const nodes = {
        'form': new FakeNode('form'),
        '.chkEnabled': new FakeNode('input'),
        '.chkCd2Enabled': new FakeNode('input'),
        '.chkDirectUrlEnabled': new FakeNode('input'),
        '.txtCd2Origin': new FakeNode('input'),
        '.txtCd2Token': new FakeNode('input'),
        '.tokenState': statusNode(),
        '.btnSave': new FakeNode('button'),
        '.saveState': statusNode(),
        '.rulesList': new FakeNode('div'),
        '.btnTestConnection': new FakeNode('button'),
        '.connectionState': statusNode(),
        '.ete-strm-assistant-preview': new FakeNode('div'),
        '.ete-strm-assistant-suggestion': new FakeNode('div'),
        '.btnAddSuggestedRule': new FakeNode('button'),
        '.btnAnalyzeMapping': new FakeNode('button'),
        '.smartMappingState': statusNode()
    };
    const controls = Object.values(nodes).filter(node => node && 'disabled' in node);
    const view = {
        querySelector(selector) {
            if (!nodes[selector]) throw new Error('unexpected selector: ' + selector);
            return nodes[selector];
        },
        querySelectorAll(selector) {
            if (selector === '.ete-strm-rule-card') return nodes['.rulesList'].children.filter(node => node.classList.contains('ete-strm-rule-card'));
            if (selector === '.ete-strm-rule-connection') return nodes['.rulesList'].querySelectorAll(selector);
            if (selector === 'input, select, button, textarea') return controls;
            return nodes['.rulesList'].querySelectorAll(selector);
        },
        addEventListener() {}
    };
    const page = Object.create(View.prototype);
    page.view = view;
    page.config = structuredClone(config);
    page.draftRuleIds = Object.create(null);
    page.mappingRequestSequence = 0;
    page.assistantPreview = null;
    page.connectionStatus = 'connected';
    page.connectionRevision = 7;
    page.connectionRequestSequence = 1;
    page.tokenOperationSequence = 0;
    page.saveInFlight = null;
    return {page, nodes, view};
}

function basicConfig(rules = []) {
    return {version: 1, enabled: true,
        cd2: {enabled: true, origin: 'https://persisted.example', directUrlEnabled: true, tokenConfigured: true}, rules};
}

function autoRule(id, originState = 'AUTO', enabled = true) {
    return {id, sourcePrefix: 'X:\\Media', mountPrefix: '', cloudPrefix: '/Cloud/Media',
        storageType: 'cloud-mount', strategy: 'cloud-first',
        order: ['direct-url', 'cd2-http', 'mount', 'native'], originState, enabled};
}

function fakeRuleCard(rule) {
    const card = new FakeNode('article');
    card.className = 'ete-strm-rule-card';
    card.dataset.ruleId = rule.id;
    const input = (field, value) => { const node = new FakeNode('input'); node.className = 'rule-' + field; node.value = value || ''; card.appendChild(node); return node; };
    input('sourcePrefix', rule.sourcePrefix);
    input('cloudPrefix', rule.cloudPrefix);
    input('mountPrefix', rule.mountPrefix);
    const storage = new FakeNode('select'); storage.className = 'rule-storageType'; storage.value = rule.storageType; card.appendChild(storage);
    const strategy = new FakeNode('select'); strategy.className = 'rule-strategy'; strategy.value = rule.strategy; card.appendChild(strategy);
    const order = new FakeNode('span'); order.className = 'ete-strm-order-value'; card.appendChild(order);
    return card;
}

function installDraftRules(nodes, rules) {
    const list = nodes['.rulesList'];
    list.children = rules.map(fakeRuleCard);
    list.children.forEach(node => { node.parentNode = list; });
}

function editRule(card, values) {
    Object.keys(values).forEach(field => { card.querySelector('.rule-' + field).value = values[field]; });
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

function tokenSavedResponse(config, tokenConfigured, status = 'unknown', revision = 8) {
    const snapshot = structuredClone(config);
    snapshot.cd2.tokenConfigured = tokenConfigured;
    return {status: 'saved', config: snapshot, connectionStatus: status, connectionRevision: revision};
}

test('AUTO disable draft survives immediate Token persistence and is posted by Save', async () => {
    const persisted = basicConfig([autoRule('auto-one')]);
    persisted.cd2.tokenConfigured = false;
    let savePayload;
    const {page, nodes} = tokenDraftPage((channel, payload) => {
        if (channel === 'enhanced-strm-token-set') return Promise.resolve(tokenSavedResponse(persisted, true));
        if (channel === 'enhanced-strm-config-save') {
            savePayload = payload.config;
            return Promise.resolve({status: 'saved', config: payload.config, connectionStatus: 'unknown', connectionRevision: 9});
        }
        throw new Error('unexpected IPC: ' + channel);
    }, persisted);
    installDraftRules(nodes, persisted.rules);
    page.disableRule('auto-one');
    nodes['.txtCd2Token'].value = 'replacement-token';
    page.setToken();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(page.config.rules[0].originState, 'DISABLED');
    assert.equal(page.config.rules[0].enabled, false);
    assert.equal(page.config.cd2.tokenConfigured, true);
    assert.match(nodes['.tokenState'].textContent, /已配置/);
    await page.saveSettings();
    assert.equal(savePayload.rules[0].originState, 'DISABLED');
    assert.equal(savePayload.rules[0].enabled, false);
});

test('AUTO restore draft survives immediate Token clearing and is posted by Save', async () => {
    const persisted = basicConfig([autoRule('auto-one', 'DISABLED', false)]);
    let savePayload;
    const {page, nodes} = tokenDraftPage((channel, payload) => {
        if (channel === 'enhanced-strm-token-clear') return Promise.resolve(tokenSavedResponse(persisted, false));
        if (channel === 'enhanced-strm-config-save') {
            savePayload = payload.config;
            return Promise.resolve({status: 'saved', config: payload.config, connectionStatus: 'unknown', connectionRevision: 9});
        }
        throw new Error('unexpected IPC: ' + channel);
    }, persisted);
    installDraftRules(nodes, persisted.rules);
    page.restoreAuto('auto-one');
    page.clearToken();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(page.config.rules[0].originState, 'AUTO');
    assert.equal(page.config.rules[0].enabled, true);
    assert.equal(page.config.cd2.tokenConfigured, false);
    assert.equal(nodes['.tokenState'].textContent, '未配置');
    await page.saveSettings();
    assert.equal(savePayload.rules[0].originState, 'AUTO');
    assert.equal(savePayload.rules[0].enabled, true);
});

test('new USER rule and ordinary settings draft survive Token set and Save', async () => {
    const persisted = basicConfig([]);
    persisted.cd2.tokenConfigured = false;
    let savePayload;
    const {page, nodes} = tokenDraftPage((channel, payload) => {
        if (channel === 'enhanced-strm-token-set') return Promise.resolve(tokenSavedResponse(persisted, true));
        if (channel === 'enhanced-strm-config-save') {
            savePayload = payload.config;
            return Promise.resolve({status: 'saved', config: payload.config, connectionStatus: 'unknown', connectionRevision: 9});
        }
        throw new Error('unexpected IPC: ' + channel);
    }, persisted);
    nodes['.chkEnabled'].checked = false;
    nodes['.chkCd2Enabled'].checked = false;
    nodes['.txtCd2Origin'].value = 'https://draft.example';
    const added = autoRule('new-user', 'USER', true);
    added.sourcePrefix = 'X:\\Draft';
    page.config.rules.push(added);
    page.draftRuleIds[added.id] = true;
    installDraftRules(nodes, page.config.rules);
    nodes['.txtCd2Token'].value = 'new-token';
    page.setToken();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(page.config.rules.length, 1);
    await page.saveSettings();
    assert.equal(savePayload.enabled, false);
    assert.equal(savePayload.cd2.enabled, false);
    assert.equal(savePayload.cd2.origin, 'https://draft.example');
    assert.equal(savePayload.rules[0].sourcePrefix, 'X:\\Draft');
    assert.equal(savePayload.rules[0].originState, 'USER');
});

test('edited USER rule survives Token clearing and draft deletion does not resurrect', async () => {
    const persisted = basicConfig([autoRule('user-one', 'USER', true)]);
    let savePayload;
    const {page, nodes} = tokenDraftPage((channel, payload) => {
        if (channel === 'enhanced-strm-token-clear') return Promise.resolve(tokenSavedResponse(persisted, false));
        if (channel === 'enhanced-strm-config-save') {
            savePayload = payload.config;
            return Promise.resolve({status: 'saved', config: payload.config, connectionStatus: 'unknown', connectionRevision: 9});
        }
        throw new Error('unexpected IPC: ' + channel);
    }, persisted);
    installDraftRules(nodes, persisted.rules);
    editRule(nodes['.rulesList'].children[0], {sourcePrefix: 'X:\\Edited', cloudPrefix: '/Cloud/Edited', mountPrefix: 'M:\\Edited'});
    page.clearToken();
    await new Promise(resolve => setImmediate(resolve));
    await page.saveSettings();
    assert.deepEqual([savePayload.rules[0].sourcePrefix, savePayload.rules[0].cloudPrefix, savePayload.rules[0].mountPrefix],
        ['X:\\Edited', '/Cloud/Edited', 'M:\\Edited']);

    const deleteHarness = tokenDraftPage((channel, payload) => {
        if (channel === 'enhanced-strm-token-set') return Promise.resolve(tokenSavedResponse(persisted, true));
        if (channel === 'enhanced-strm-config-save') {
            savePayload = payload.config;
            return Promise.resolve({status: 'saved', config: payload.config, connectionStatus: 'unknown', connectionRevision: 9});
        }
        throw new Error('unexpected IPC: ' + channel);
    }, persisted);
    deleteHarness.page.draftRuleIds['user-one'] = true;
    installDraftRules(deleteHarness.nodes, persisted.rules);
    deleteHarness.page.disableRule('user-one');
    deleteHarness.nodes['.txtCd2Token'].value = 'new-token';
    deleteHarness.page.setToken();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(deleteHarness.page.config.rules.length, 0);
    await deleteHarness.page.saveSettings();
    assert.equal(savePayload.rules.length, 0);
});

test('failed and late Token responses preserve current draft, and success invalidates CD2 snapshot', async () => {
    const persisted = basicConfig([autoRule('auto-one')]);
    const pending = deferred();
    let savePayload;
    const {page, nodes} = tokenDraftPage((channel, payload) => {
        if (channel === 'enhanced-strm-token-set') return pending.promise;
        if (channel === 'enhanced-strm-config-save') {
            savePayload = payload.config;
            return Promise.resolve({status: 'saved', config: payload.config, connectionStatus: 'unknown', connectionRevision: 9});
        }
        throw new Error('unexpected IPC: ' + channel);
    }, persisted);
    installDraftRules(nodes, persisted.rules);
    nodes['.txtCd2Token'].value = 'pending-token';
    page.setToken();
    page.disableRule('auto-one');
    nodes['.chkEnabled'].checked = false;
    nodes['.txtCd2Origin'].value = 'https://late-edit.example';
    pending.resolve(tokenSavedResponse(persisted, true, 'unknown', 8));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(page.config.rules[0].originState, 'DISABLED');
    assert.equal(page.config.rules[0].enabled, false);
    assert.equal(page.connectionStatus, 'unknown');
    assert.equal(page.connectionRevision, 8);
    assert.equal(page.connectionRequestSequence, 2, 'Token success must invalidate an older CD2 request');
    await page.saveSettings();
    assert.equal(savePayload.enabled, false);
    assert.equal(savePayload.cd2.origin, 'https://late-edit.example');
    assert.equal(savePayload.rules[0].originState, 'DISABLED');

    const failed = deferred();
    const failureHarness = tokenDraftPage(channel => {
        if (channel === 'enhanced-strm-token-set') return failed.promise;
        throw new Error('unexpected IPC: ' + channel);
    }, persisted);
    installDraftRules(failureHarness.nodes, persisted.rules);
    failureHarness.page.disableRule('auto-one');
    failureHarness.nodes['.txtCd2Origin'].value = 'https://still-draft.example';
    failureHarness.nodes['.txtCd2Token'].value = 'bad-token';
    failureHarness.page.setToken();
    failed.reject(new Error('write failed'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(failureHarness.page.config.rules[0].originState, 'DISABLED');
    assert.equal(failureHarness.nodes['.txtCd2Origin'].value, 'https://still-draft.example');
});

test('set then clear reverse completion leaves the latest Token state and sequence authoritative', async () => {
    const persisted = basicConfig([]);
    const set = deferred();
    const clear = deferred();
    const {page, nodes} = tokenDraftPage(channel => {
        if (channel === 'enhanced-strm-token-set') return set.promise;
        if (channel === 'enhanced-strm-token-clear') return clear.promise;
        throw new Error('unexpected IPC: ' + channel);
    }, persisted);

    nodes['.txtCd2Token'].value = 'token-A';
    page.setToken();
    page.clearToken();

    clear.resolve(tokenSavedResponse(persisted, false, 'unknown', 8));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(page.config.cd2.tokenConfigured, false);
    assert.equal(nodes['.tokenState'].textContent, '未配置');
    assert.equal(nodes['.txtCd2Token'].disabled, false, 'latest clear completion releases the input lock');
    const afterCurrentResponse = {
        sequence: page.connectionRequestSequence,
        status: page.connectionStatus,
        revision: page.connectionRevision,
        connectionText: nodes['.connectionState'].textContent,
        saveText: nodes['.saveState'].textContent,
        tokenText: nodes['.tokenState'].textContent,
        inputValue: nodes['.txtCd2Token'].value
    };

    set.resolve(tokenSavedResponse(persisted, true, 'connected', 9));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual({
        sequence: page.connectionRequestSequence,
        status: page.connectionStatus,
        revision: page.connectionRevision,
        connectionText: nodes['.connectionState'].textContent,
        saveText: nodes['.saveState'].textContent,
        tokenText: nodes['.tokenState'].textContent,
        inputValue: nodes['.txtCd2Token'].value
    }, afterCurrentResponse, 'stale set success must be a renderer-state no-op');
    assert.equal(page.config.cd2.tokenConfigured, false);
});

test('clear then set reverse completion leaves the latest Token state authoritative', async () => {
    const persisted = basicConfig([]);
    const clear = deferred();
    const set = deferred();
    const {page, nodes} = tokenDraftPage(channel => {
        if (channel === 'enhanced-strm-token-clear') return clear.promise;
        if (channel === 'enhanced-strm-token-set') return set.promise;
        throw new Error('unexpected IPC: ' + channel);
    }, persisted);

    page.clearToken();
    nodes['.txtCd2Token'].value = 'token-B';
    page.setToken();
    set.resolve(tokenSavedResponse(persisted, true, 'unknown', 8));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(page.config.cd2.tokenConfigured, true);
    assert.match(nodes['.tokenState'].textContent, /已配置/);
    assert.equal(nodes['.txtCd2Token'].disabled, false, 'latest set completion releases the input lock');
    const tokenText = nodes['.tokenState'].textContent;
    const saveText = nodes['.saveState'].textContent;
    const sequence = page.connectionRequestSequence;

    clear.resolve(tokenSavedResponse(persisted, false, 'failed', 9));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(page.config.cd2.tokenConfigured, true);
    assert.equal(nodes['.tokenState'].textContent, tokenText);
    assert.equal(nodes['.saveState'].textContent, saveText);
    assert.equal(page.connectionStatus, 'unknown');
    assert.equal(page.connectionRevision, 8);
    assert.equal(page.connectionRequestSequence, sequence);
});

test('a Token test started after the latest Token intent remains applicable after a stale response', async () => {
    const persisted = basicConfig([]);
    const oldSet = deferred();
    const currentClear = deferred();
    const connectionTest = deferred();
    const {page, nodes} = tokenDraftPage(channel => {
        if (channel === 'enhanced-strm-token-set') return oldSet.promise;
        if (channel === 'enhanced-strm-token-clear') return currentClear.promise;
        if (channel === 'enhanced-strm-cd2-test-connection') return connectionTest.promise;
        throw new Error('unexpected IPC: ' + channel);
    }, persisted);

    nodes['.txtCd2Token'].value = 'token-A';
    page.setToken();
    page.clearToken();
    const testPromise = page.testConnection();
    const testSequence = page.connectionRequestSequence;

    currentClear.resolve(tokenSavedResponse(persisted, false, 'unknown', 8));
    await new Promise(resolve => setImmediate(resolve));
    connectionTest.resolve({status: 'ok', connectionStatus: 'connected', connectionRevision: 9});
    await testPromise;
    assert.equal(page.connectionStatus, 'connected');
    assert.equal(page.connectionRevision, 9);
    assert.match(nodes['.connectionState'].textContent, /已连接/);
    const completedConnection = {
        sequence: page.connectionRequestSequence,
        status: page.connectionStatus,
        revision: page.connectionRevision,
        text: nodes['.connectionState'].textContent
    };

    oldSet.resolve(tokenSavedResponse(persisted, true, 'failed', 10));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual({
        sequence: page.connectionRequestSequence,
        status: page.connectionStatus,
        revision: page.connectionRevision,
        text: nodes['.connectionState'].textContent
    }, completedConnection, 'stale Token completion cannot invalidate or replace the completed test');
    assert.equal(page.connectionRequestSequence, testSequence);
    assert.equal(page.config.cd2.tokenConfigured, false);
});

test('three overlapping Token operations apply only the final user operation', async () => {
    const persisted = basicConfig([]);
    const firstSet = deferred();
    const middleClear = deferred();
    const finalSet = deferred();
    const setResponses = [firstSet, finalSet];
    const {page, nodes} = tokenDraftPage(channel => {
        if (channel === 'enhanced-strm-token-set') return setResponses.shift().promise;
        if (channel === 'enhanced-strm-token-clear') return middleClear.promise;
        throw new Error('unexpected IPC: ' + channel);
    }, persisted);

    nodes['.txtCd2Token'].value = 'first-token';
    page.setToken();
    page.clearToken();
    nodes['.txtCd2Token'].value = 'final-token';
    page.setToken();

    finalSet.resolve(tokenSavedResponse(persisted, true, 'unknown', 8));
    await new Promise(resolve => setImmediate(resolve));
    const finalState = {
        token: page.config.cd2.tokenConfigured,
        tokenText: nodes['.tokenState'].textContent,
        saveText: nodes['.saveState'].textContent,
        sequence: page.connectionRequestSequence
    };
    assert.equal(finalState.token, true);
    assert.match(finalState.tokenText, /已配置/);
    assert.equal(nodes['.txtCd2Token'].disabled, false);

    middleClear.resolve(tokenSavedResponse(persisted, false, 'failed', 9));
    await new Promise(resolve => setImmediate(resolve));
    firstSet.resolve(tokenSavedResponse(persisted, true, 'connected', 10));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual({
        token: page.config.cd2.tokenConfigured,
        tokenText: nodes['.tokenState'].textContent,
        saveText: nodes['.saveState'].textContent,
        sequence: page.connectionRequestSequence
    }, finalState);
    assert.equal(page.connectionStatus, 'unknown');
    assert.equal(page.connectionRevision, 8);
    assert.equal(nodes['.txtCd2Token'].value, '', 'stale set completion cannot clear or replace later input');
});

test('a stale Token failure cannot replace a newer success or alter connection state', async () => {
    const persisted = basicConfig([]);
    const oldSet = deferred();
    const currentClear = deferred();
    const {page, nodes} = tokenDraftPage(channel => {
        if (channel === 'enhanced-strm-token-set') return oldSet.promise;
        if (channel === 'enhanced-strm-token-clear') return currentClear.promise;
        throw new Error('unexpected IPC: ' + channel);
    }, persisted);

    nodes['.txtCd2Token'].value = 'bad-old-token';
    page.setToken();
    page.clearToken();
    currentClear.resolve(tokenSavedResponse(persisted, false, 'connected', 8));
    await new Promise(resolve => setImmediate(resolve));
    const current = {
        token: page.config.cd2.tokenConfigured,
        tokenText: nodes['.tokenState'].textContent,
        saveText: nodes['.saveState'].textContent,
        connectionStatus: page.connectionStatus,
        connectionRevision: page.connectionRevision,
        connectionText: nodes['.connectionState'].textContent,
        sequence: page.connectionRequestSequence,
        inputDisabled: nodes['.txtCd2Token'].disabled
    };

    oldSet.reject(new Error('old write failed'));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual({
        token: page.config.cd2.tokenConfigured,
        tokenText: nodes['.tokenState'].textContent,
        saveText: nodes['.saveState'].textContent,
        connectionStatus: page.connectionStatus,
        connectionRevision: page.connectionRevision,
        connectionText: nodes['.connectionState'].textContent,
        sequence: page.connectionRequestSequence,
        inputDisabled: nodes['.txtCd2Token'].disabled
    }, current, 'stale failure must not change success text, input lock, or connection state');
    assert.equal(nodes['.txtCd2Token'].disabled, false);
});

test('a failed latest Token operation reconciles an earlier successful write without accepting its late reply', async () => {
    const persisted = basicConfig([]);
    persisted.cd2.tokenConfigured = false;
    const oldSet = deferred();
    const currentClear = deferred();
    const {page, nodes} = tokenDraftPage(channel => {
        if (channel === 'enhanced-strm-token-set') return oldSet.promise;
        if (channel === 'enhanced-strm-token-clear') return currentClear.promise;
        if (channel === 'enhanced-strm-config-get') return Promise.resolve({
            ...persisted, cd2: {...persisted.cd2, tokenConfigured: true}
        });
        if (channel === 'enhanced-strm-cd2-connection-status') {
            return Promise.resolve({connectionStatus: 'unknown', connectionRevision: 8});
        }
        throw new Error('unexpected IPC: ' + channel);
    }, persisted);

    nodes['.txtCd2Token'].value = 'first-token';
    page.setToken();
    page.clearToken();
    currentClear.resolve({status: 'error', reason: 'invalid_config'});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(page.config.cd2.tokenConfigured, true, 'the successful earlier write is now persisted');
    assert.match(nodes['.tokenState'].textContent, /已配置/);
    assert.equal(page.connectionStatus, 'unknown');
    assert.equal(page.connectionRevision, 8);
    assert.equal(nodes['.txtCd2Token'].disabled, false);
    const currentText = nodes['.saveState'].textContent;

    oldSet.resolve(tokenSavedResponse(persisted, true, 'unknown', 8));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(page.config.cd2.tokenConfigured, true);
    assert.equal(nodes['.saveState'].textContent, currentText);
    assert.equal(page.connectionRevision, 8);
});
