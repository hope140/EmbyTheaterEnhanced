'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const configIpc = require('../src/electronapp/enhanced/strm-config-ipc');
const configStore = require('../src/electronapp/enhanced/strm-config-store');
const mappingAssistant = require('../src/electronapp/resolvers/strm-mapping-assistant');

const settingsSource = fs.readFileSync(
    path.join(__dirname, '../src/electronapp/plugins/mpvplayer/strm.js'),
    'utf8'
);
const settingsHtml = fs.readFileSync(
    path.join(__dirname, '../src/electronapp/plugins/mpvplayer/strm.html'),
    'utf8'
);
const configIpcSource = fs.readFileSync(
    path.join(__dirname, '../src/electronapp/enhanced/strm-config-ipc.js'),
    'utf8'
);

function temporaryRoot(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function sourceSection(source, start, end) {
    const startIndex = source.indexOf(start);
    const endIndex = source.indexOf(end, startIndex + start.length);
    assert.notEqual(startIndex, -1, `missing source section start: ${start}`);
    assert.notEqual(endIndex, -1, `missing source section end: ${end}`);
    return source.slice(startIndex, endIndex);
}

function preview(status, confidence, overrides) {
    return Object.assign({
        status,
        confidence,
        matchedSuffixSegments: confidence === 'HIGH' ? 4 : 3,
        matchedParentSegments: confidence === 'HIGH' ? 3 : 2,
        reason: confidence === 'HIGH' ? 'unique_long_suffix' : 'unique_supported_suffix',
        sourcePrefix: 'D:\\Media\\Movies',
        cloudPrefix: '/115/Movies',
        mountProvided: false,
        mountPrefix: '',
        mountStatus: 'NOT_PROVIDED',
        mountConfidence: 'LOW',
        mountMatchedSuffixSegments: 0,
        mountMatchedParentSegments: 0,
        mountReason: 'not_provided'
    }, overrides || {});
}

test('preview IPC returns exact HIGH, MEDIUM, NO_MATCH, UNSAFE, invalid, and untrusted responses', async () => {
    const root = temporaryRoot('ete-strm-mapping-preview-');
    const store = configStore.createStore({
        rootDir: root,
        environment: {
            ETE_CD2_ENABLED: '1',
            ETE_CD2_ORIGIN: 'http://127.0.0.1:19798',
            ETE_CD2_TOKEN: 'fixture-secret-token',
            ETE_CD2_SOURCE_PREFIX: 'D:\\Existing',
            ETE_CD2_CLOUD_PREFIX: '/existing'
        }
    });
    const calls = {save: 0, applyDiscovery: 0, cd2: 0};
    const guardedStore = Object.assign({}, store, {
        save() {
            calls.save++;
            throw new Error('preview must not save');
        },
        applyDiscovery() {
            calls.applyDiscovery++;
            throw new Error('preview must not apply discovery');
        }
    });
    const handlers = {};
    const ipcMain = {
        handle(name, handler) { handlers[name] = handler; },
        removeHandler(name) { delete handlers[name]; }
    };
    const trusted = {};
    const paths = store.getConfigPaths();
    const beforePublic = store.getPublicConfig();
    const beforeConfig = fs.readFileSync(paths.configPath);
    const beforeSecrets = fs.readFileSync(paths.secretsPath);
    const unregister = configIpc.register({
        ipcMain,
        store: guardedStore,
        getWebContents: () => trusted,
        createTestService() {
            calls.cd2++;
            throw new Error('preview must not create a CD2 service');
        }
    });
    const invoke = request => handlers[configIpc.CHANNELS.PREVIEW_MAPPING]({sender: trusted}, request);

    try {
        assert.deepEqual(await invoke({
            sourcePath: 'D:\\Media\\Movies\\A\\B\\movie.mkv',
            cloudPath: '/115/Movies/A/B/movie.mkv'
        }), {
            status: 'MATCHED',
            confidence: 'HIGH',
            matchedSuffixSegments: 4,
            matchedParentSegments: 3,
            reason: 'unique_long_suffix',
            sourcePrefix: 'D:\\Media\\Movies',
            cloudPrefix: '/115/Movies',
            mountProvided: false,
            mountPrefix: '',
            mountStatus: 'NOT_PROVIDED',
            mountConfidence: 'LOW',
            mountMatchedSuffixSegments: 0,
            mountMatchedParentSegments: 0,
            mountReason: 'not_provided'
        });

        assert.deepEqual(await invoke({
            sourcePath: 'D:\\Media\\A\\B\\movie.mkv',
            cloudPath: '/115/A/B/movie.mkv'
        }), {
            status: 'MATCHED',
            confidence: 'MEDIUM',
            matchedSuffixSegments: 3,
            matchedParentSegments: 2,
            reason: 'unique_supported_suffix',
            sourcePrefix: 'D:\\Media\\A',
            cloudPrefix: '/115/A',
            mountProvided: false,
            mountPrefix: '',
            mountStatus: 'NOT_PROVIDED',
            mountConfidence: 'LOW',
            mountMatchedSuffixSegments: 0,
            mountMatchedParentSegments: 0,
            mountReason: 'not_provided'
        });

        assert.deepEqual(await invoke({
            sourcePath: 'D:\\Media\\A\\movie.mkv',
            cloudPath: '/115/A/movie.mkv'
        }), {
            status: 'NO_MATCH',
            confidence: 'LOW',
            matchedSuffixSegments: 2,
            matchedParentSegments: 1,
            reason: 'suffix_too_short',
            mountProvided: false,
            mountPrefix: '',
            mountStatus: 'NOT_PROVIDED',
            mountConfidence: 'LOW',
            mountMatchedSuffixSegments: 0,
            mountMatchedParentSegments: 0,
            mountReason: 'not_provided'
        });

        assert.deepEqual(await invoke({
            sourcePath: 'D:\\Media\\A\\B\\movie.mkv',
            cloudPath: 'X:\\Cloud\\A\\B\\movie.mkv'
        }), {
            status: 'UNSAFE',
            confidence: 'LOW',
            matchedSuffixSegments: 0,
            matchedParentSegments: 0,
            reason: 'invalid_cloud_candidate',
            mountProvided: false,
            mountPrefix: '',
            mountStatus: 'NOT_PROVIDED',
            mountConfidence: 'LOW',
            mountMatchedSuffixSegments: 0,
            mountMatchedParentSegments: 0,
            mountReason: 'not_provided'
        });

        assert.deepEqual(await invoke({sourcePath: 'D:\\Media\\movie.mkv'}), {
            status: 'UNSAFE',
            confidence: 'LOW',
            matchedSuffixSegments: 0,
            matchedParentSegments: 0,
            reason: 'invalid_request'
        });

        assert.deepEqual(await handlers[configIpc.CHANNELS.PREVIEW_MAPPING]({sender: {}}, {
            sourcePath: 'D:\\Media\\Movies\\A\\B\\movie.mkv',
            cloudPath: '/115/Movies/A/B/movie.mkv'
        }), {
            status: 'error',
            reason: 'untrusted_sender'
        });

        assert.deepEqual(store.getPublicConfig(), beforePublic);
        assert.deepEqual(fs.readFileSync(paths.configPath), beforeConfig);
        assert.deepEqual(fs.readFileSync(paths.secretsPath), beforeSecrets);
        assert.deepEqual(calls, {save: 0, applyDiscovery: 0, cd2: 0});
    } finally {
        unregister();
        fs.rmSync(root, {recursive: true, force: true});
    }
});

test('preview IPC response field sets are exact and never expose store secrets', async () => {
    const handlers = {};
    const trusted = {};
    const store = {
        getPublicConfig() { return {version: 1, enabled: true, cd2: {tokenConfigured: true}, rules: []}; },
        getRule() { return null; }
    };
    const unregister = configIpc.register({
        ipcMain: {
            handle(name, handler) { handlers[name] = handler; },
            removeHandler(name) { delete handlers[name]; }
        },
        store,
        getWebContents: () => trusted
    });
    try {
        const matched = await handlers[configIpc.CHANNELS.PREVIEW_MAPPING]({sender: trusted}, {
            sourcePath: 'D:\\Media\\Movies\\A\\B\\movie.mkv',
            cloudPath: '/115/Movies/A/B/movie.mkv',
            token: 'must-not-echo'
        });
        const noMatch = await handlers[configIpc.CHANNELS.PREVIEW_MAPPING]({sender: trusted}, {
            sourcePath: 'D:\\Media\\A\\movie.mkv',
            cloudPath: '/115/A/movie.mkv'
        });

        assert.deepEqual(Object.keys(matched).sort(), [
            'cloudPrefix',
            'confidence',
            'matchedParentSegments',
            'matchedSuffixSegments',
            'mountConfidence',
            'mountMatchedParentSegments',
            'mountMatchedSuffixSegments',
            'mountPrefix',
            'mountProvided',
            'mountReason',
            'mountStatus',
            'reason',
            'sourcePrefix',
            'status'
        ]);
        assert.deepEqual(Object.keys(noMatch).sort(), [
            'confidence',
            'matchedParentSegments',
            'matchedSuffixSegments',
            'mountConfidence',
            'mountMatchedParentSegments',
            'mountMatchedSuffixSegments',
            'mountPrefix',
            'mountProvided',
            'mountReason',
            'mountStatus',
            'reason',
            'status'
        ]);
        assert.doesNotMatch(JSON.stringify([matched, noMatch]), /must-not-echo|tokenConfigured/);
    } finally {
        unregister();
    }
});

test('preview combines CloudDrive2 HIGH with optional mount inference without weakening the cloud rule', async () => {
    const handlers = {};
    const trusted = {};
    const unregister = configIpc.register({
        ipcMain: {
            handle(name, handler) { handlers[name] = handler; },
            removeHandler(name) { delete handlers[name]; }
        },
        store: {getRule() { return null; }},
        getWebContents: () => trusted
    });
    const invoke = request => handlers[configIpc.CHANNELS.PREVIEW_MAPPING]({sender: trusted}, request);
    try {
        const sourcePath = 'X:\\115\\电影\\Alien\\Alien.mkv';
        const cloudPath = '/CloudNAS/CloudDrive/115open/115/电影/Alien/Alien.mkv';
        const withMount = await invoke({
            sourcePath,
            cloudPath,
            mountPath: 'Z:\\115\\电影\\Alien\\Alien.mkv'
        });
        const withoutMount = await invoke({sourcePath, cloudPath, mountPath: ''});
        const weakMount = await invoke({
            sourcePath,
            cloudPath,
            mountPath: 'Z:\\Other\\Alien\\Alien.mkv'
        });

        assert.equal(withMount.status, 'MATCHED');
        assert.equal(withMount.confidence, 'HIGH');
        assert.equal(withMount.sourcePrefix, 'X:\\115');
        assert.equal(withMount.cloudPrefix, '/CloudNAS/CloudDrive/115open/115');
        assert.equal(withMount.mountStatus, 'MATCHED');
        assert.equal(withMount.mountConfidence, 'HIGH');
        assert.equal(withMount.mountPrefix, 'Z:\\115');
        const mountedDraft = mappingAssistant.addDraftRule([], withMount, 'new-rule-smart-mounted');
        assert.equal(mountedDraft.status, 'added');
        assert.equal(mountedDraft.addedRule.sourcePrefix, 'X:\\115');
        assert.equal(mountedDraft.addedRule.cloudPrefix, '/CloudNAS/CloudDrive/115open/115');
        assert.equal(mountedDraft.addedRule.mountPrefix, 'Z:\\115');
        assert.equal(configStore.normalizeRule(mountedDraft.addedRule).mountPrefix, 'Z:\\115');

        assert.equal(withoutMount.status, 'MATCHED');
        assert.equal(withoutMount.confidence, 'HIGH');
        assert.equal(withoutMount.mountProvided, false);
        assert.equal(withoutMount.mountPrefix, '');

        assert.equal(weakMount.status, 'MATCHED');
        assert.equal(weakMount.confidence, 'HIGH');
        assert.equal(weakMount.sourcePrefix, 'X:\\115');
        assert.equal(weakMount.cloudPrefix, '/CloudNAS/CloudDrive/115open/115');
        assert.notEqual(weakMount.mountConfidence, 'HIGH');
        assert.equal(weakMount.mountPrefix, '');
        assert.equal(mappingAssistant.evaluatePreview(weakMount, []).canAdd, true);
    } finally {
        unregister();
    }
});

test('only a collision-free HIGH preview can be added', () => {
    const high = preview('MATCHED', 'HIGH');
    const medium = preview('MATCHED', 'MEDIUM');
    const low = preview('NO_MATCH', 'LOW', {sourcePrefix: undefined, cloudPrefix: undefined});
    const unsafe = preview('UNSAFE', 'LOW', {sourcePrefix: undefined, cloudPrefix: undefined});

    assert.deepEqual(mappingAssistant.evaluatePreview(high, []), {
        canAdd: true,
        collision: mappingAssistant.COLLISION.NONE
    });
    for (const value of [medium, low, unsafe]) {
        assert.deepEqual(mappingAssistant.evaluatePreview(value, []), {
            canAdd: false,
            collision: mappingAssistant.COLLISION.NONE
        });
    }
});

test('Windows drive and UNC equivalents are duplicates while a different cloud target conflicts', () => {
    const windowsPreview = preview('MATCHED', 'HIGH', {
        sourcePrefix: 'd:/MEDIA/Movies',
        cloudPrefix: '/115/Movies'
    });
    const windowsRule = {
        sourcePrefix: 'D:\\media\\movies',
        cloudPrefix: '/115/Movies'
    };
    const uncPreview = preview('MATCHED', 'HIGH', {
        sourcePrefix: '\\\\NAS-One\\Share\\Movies',
        cloudPrefix: '/115/Movies'
    });
    const uncRule = {
        sourcePrefix: '//nas-one/share/movies',
        cloudPrefix: '/115/Movies'
    };

    assert.equal(mappingAssistant.classifyCollision(windowsPreview, [windowsRule]), 'DUPLICATE');
    assert.equal(mappingAssistant.classifyCollision(uncPreview, [uncRule]), 'DUPLICATE');
    assert.deepEqual(mappingAssistant.evaluatePreview(windowsPreview, [{
        sourcePrefix: 'D:\\Media\\Movies',
        cloudPrefix: '/different/Movies'
    }]), {
        canAdd: false,
        collision: 'CONFLICT'
    });
});

test('accepting one eligible suggestion creates exactly one USER draft without mutating existing rules', () => {
    const existing = [{
        id: 'existing',
        sourcePrefix: 'D:\\Other',
        mountPrefix: '',
        cloudPrefix: '/other',
        storageType: 'cloud-mount',
        strategy: 'cloud-first',
        order: ['direct-url', 'cd2-http', 'mount', 'native'],
        originState: 'USER',
        enabled: true
    }];
    const before = structuredClone(existing);
    const result = mappingAssistant.addDraftRule(
        existing,
        preview('MATCHED', 'HIGH'),
        'new-rule-smart-fixture'
    );

    assert.equal(result.status, 'added');
    assert.deepEqual(existing, before);
    assert.equal(result.rules.length, 2);
    assert.deepEqual(result.addedRule, {
        id: 'new-rule-smart-fixture',
        sourcePrefix: 'D:\\Media\\Movies',
        mountPrefix: '',
        cloudPrefix: '/115/Movies',
        storageType: 'cloud-mount',
        strategy: 'cloud-first',
        order: ['direct-url', 'cd2-http', 'mount', 'native'],
        originState: 'USER',
        enabled: true
    });
    assert.deepEqual(result.rules[1], result.addedRule);

    assert.equal(mappingAssistant.addDraftRule(result.rules, preview('MATCHED', 'HIGH'), 'another-id').status, 'duplicate');
    assert.equal(mappingAssistant.addDraftRule(result.rules, preview('MATCHED', 'MEDIUM'), 'medium-id').status, 'ineligible');
});

test('an accepted draft reaches disk only through the existing explicit Save handler', async () => {
    const root = temporaryRoot('ete-strm-mapping-save-');
    const store = configStore.createStore({rootDir: root, environment: {}});
    const handlers = {};
    const trusted = {};
    const unregister = configIpc.register({
        ipcMain: {
            handle(name, handler) { handlers[name] = handler; },
            removeHandler(name) { delete handlers[name]; }
        },
        store,
        getWebContents: () => trusted
    });
    try {
        const paths = store.getConfigPaths();
        const beforePublic = store.getPublicConfig();
        const beforeExists = fs.existsSync(paths.configPath);
        const draft = mappingAssistant.addDraftRule(
            beforePublic.rules,
            preview('MATCHED', 'HIGH'),
            'new-rule-smart-explicit-save'
        );

        assert.equal(draft.status, 'added');
        assert.deepEqual(store.getPublicConfig(), beforePublic);
        assert.equal(fs.existsSync(paths.configPath), beforeExists);

        const next = structuredClone(beforePublic);
        next.rules = draft.rules;
        const response = await handlers[configIpc.CHANNELS.SAVE]({sender: trusted}, {config: next});

        assert.equal(response.status, 'saved');
        assert.equal(response.requiresRestart, true);
        assert.equal(response.config.rules.length, 1);
        assert.equal(response.config.rules[0].originState, 'USER');
        assert.equal(response.config.rules[0].sourcePrefix, 'D:\\Media\\Movies');
        assert.equal(response.config.rules[0].cloudPrefix, '/115/Movies');
        assert.equal(response.config.rules[0].mountPrefix, null);
        assert.deepEqual(Object.keys(response.config).sort(), ['cd2', 'enabled', 'rules', 'version']);
        assert.equal(response.config.smartMappings, undefined);
        assert.equal(response.config.autoMappings, undefined);
        assert.equal(response.config.learnedMappings, undefined);
        assert.equal(fs.existsSync(paths.configPath), true);
    } finally {
        unregister();
        fs.rmSync(root, {recursive: true, force: true});
    }
});

test('draft editing and removal stay local to copied arrays and objects', () => {
    const originalRules = [{id: 'existing', sourcePrefix: 'D:\\Existing', cloudPrefix: '/existing'}];
    const sourcePreview = preview('MATCHED', 'HIGH');
    const firstDraft = mappingAssistant.createDraftRule(sourcePreview, 'new-rule-smart-edit');
    const secondDraft = mappingAssistant.createDraftRule(sourcePreview, 'new-rule-smart-edit-2');
    const working = originalRules.concat(firstDraft);

    firstDraft.mountPrefix = 'X:\\Mounted';
    firstDraft.strategy = 'mount-first';
    firstDraft.order = ['mount', 'direct-url', 'cd2-http', 'native'];

    assert.deepEqual(originalRules, [{id: 'existing', sourcePrefix: 'D:\\Existing', cloudPrefix: '/existing'}]);
    assert.equal(sourcePreview.mountPrefix, '');
    assert.equal(secondDraft.mountPrefix, '');
    assert.equal(secondDraft.strategy, 'cloud-first');

    const removed = mappingAssistant.removeDraftRule(working, 'new-rule-smart-edit');
    assert.notEqual(removed, working);
    assert.deepEqual(removed, originalRules);
    assert.equal(working.length, 2);
    assert.equal(working[1].mountPrefix, 'X:\\Mounted');
});

test('preview and accepted diagnostics use exact allowlists and omit raw path, URL, and token values', () => {
    const raw = {
        status: 'MATCHED',
        confidence: 'HIGH',
        matchedSuffixSegments: 4,
        matchedParentSegments: 3,
        reason: 'unique_long_suffix',
        sourcePrefix: 'D:\\Private\\Movies',
        cloudPrefix: '/115/Private/Movies',
        url: 'https://example.test/file?token=raw-secret',
        token: 'raw-secret'
    };
    const previewRecord = mappingAssistant.diagnosticRecord('smart-path-mapping-preview', raw);
    const acceptedRecord = mappingAssistant.diagnosticRecord('smart-path-mapping-accepted', raw);

    assert.deepEqual(previewRecord, {
        schemaVersion: 1,
        level: 'info',
        category: 'resolver',
        event: 'smart-path-mapping-preview',
        details: {
            status: 'MATCHED',
            confidence: 'HIGH',
            matchedSuffixSegments: 4,
            reason: 'unique_long_suffix'
        }
    });
    assert.deepEqual(acceptedRecord, {
        schemaVersion: 1,
        level: 'info',
        category: 'resolver',
        event: 'smart-path-mapping-accepted',
        details: {
            confidence: 'HIGH',
            matchedSuffixSegments: 4
        }
    });
    assert.doesNotMatch(JSON.stringify([previewRecord, acceptedRecord]),
        /D:\\\\Private|\/115\/Private|example\.test|raw-secret|sourcePrefix|cloudPrefix|mountPrefix|token|url/);
});

test('settings UI statically wires preview, draft-only acceptance, diagnostics, and explicit save', () => {
    assert.match(settingsHtml, /class="ete-strm-assistant"/);
    assert.match(settingsHtml, />STRM 源文件路径<\/label>/);
    assert.match(settingsHtml, />CloudDrive2 文件路径<\/label>/);
    assert.match(settingsHtml, />本地挂载文件路径（可选）<\/label>/);
    assert.match(settingsHtml, /class="txtSmartSourcePath"/);
    assert.match(settingsHtml, /class="txtSmartCloudPath"/);
    assert.match(settingsHtml, /class="txtSmartMountPath"/);
    assert.match(settingsHtml, /aria-describedby="ete-smart-source-help"/);
    assert.match(settingsHtml, /aria-describedby="ete-smart-cloud-help"/);
    assert.match(settingsHtml, /aria-describedby="ete-smart-mount-help"/);
    assert.doesNotMatch(settingsHtml, />本地路径<\/label>|>云端路径<\/label>|本地前缀|云端前缀/);
    assert.match(settingsHtml, /class="btnAnalyzeMapping"/);
    assert.match(settingsHtml, /class="[^"\n]*btnAddSuggestedRule[^"\n]*"[^>]*disabled/);
    assert.match(settingsHtml, /type="submit"[^>]*class="[^"\n]*btnSave/);

    assert.match(settingsSource, /previewMapping:\s*'enhanced-strm-smart-mapping-preview'/);
    assert.match(settingsSource, /diagnostics:\s*'enhanced-diagnostics-log'/);
    assert.match(settingsSource, /sourcePath:\s*sourcePath/);
    assert.match(settingsSource, /cloudPath:\s*cloudPath/);
    assert.match(settingsSource, /mountPath:\s*mountPath/);
    assert.match(settingsSource, /'STRM 源路径'/);
    assert.match(settingsSource, /'本地挂载路径'/);
    assert.match(settingsSource, /requestSequence\s*!==\s*this\.mappingRequestSequence/);
    assert.match(settingsSource, /this\.draftRuleIds\[rule\.id\]\s*=\s*true/);
    assert.doesNotMatch(settingsSource, /\/\^new-rule-\/\.test/);
    assert.match(settingsSource, /\.textContent\s*=/);
    assert.doesNotMatch(settingsSource, /\.innerHTML\s*=/);

    const acceptSource = sourceSection(
        settingsSource,
        'SettingsView.prototype.acceptSuggestedRule = function ()',
        'SettingsView.prototype.testConnection = function ()'
    );
    assert.match(acceptSource, /mappingAssistant\.addDraftRule/);
    assert.match(acceptSource, /this\.config\s*=\s*next/);
    assert.match(acceptSource, /smart-path-mapping-accepted/);
    assert.doesNotMatch(acceptSource, /CHANNELS\.save|saveSettings\s*\(|request\s*\(/);

    const saveSource = sourceSection(
        settingsSource,
        'SettingsView.prototype.saveSettings = function ()',
        'SettingsView.prototype.setToken = function ()'
    );
    assert.match(saveSource, /request\(CHANNELS\.save,\s*\{config:\s*next\}\)/);

    const pauseSource = sourceSection(
        settingsSource,
        'SettingsView.prototype.onPause = function ()',
        'return SettingsView;'
    );
    assert.doesNotMatch(pauseSource, /CHANNELS\.save|saveSettings\s*\(|request\s*\(/);

    assert.match(configIpcSource, /SAVE:\s*'enhanced-strm-config-save'/);
    assert.match(configIpcSource, /PREVIEW_MAPPING:\s*'enhanced-strm-smart-mapping-preview'/);
});
