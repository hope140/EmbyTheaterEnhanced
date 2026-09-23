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

function sample(season, episode, mountRoot = '') {
    const value = {
        sourcePath: `D:\\Library\\Anime\\Show\\${season}\\${episode}.mkv`,
        cloudPath: `/cloud/Anime/Show/${season}/${episode}.mkv`
    };
    if (mountRoot) value.mountPath = `${mountRoot}\\Show\\${season}\\${episode}.mkv`;
    return value;
}

function branchSamples(mountRoot = '') {
    return [
        sample('Season 1', 'Episode 01', mountRoot),
        sample('Season 2', 'Episode 01', mountRoot)
    ];
}

function rule(overrides = {}) {
    return Object.assign({
        id: 'existing',
        sourcePrefix: 'D:\\Library\\Anime\\Show',
        cloudPrefix: '/cloud/Anime/Show',
        mountPrefix: null,
        storageType: 'cloud-mount',
        strategy: 'cloud-first',
        order: ['direct-url', 'cd2-http', 'mount', 'native'],
        originState: 'USER',
        enabled: true
    }, overrides);
}

function preview(overrides = {}) {
    return Object.assign({
        coverage: {
            status: 'NOT_COVERED',
            mountStatus: 'UNAVAILABLE',
            ruleIds: [],
            reason: 'no_matching_rule'
        },
        fileMatch: {
            status: 'MATCHED',
            confidence: 'HIGH',
            matchedSuffixSegments: 4
        },
        boundary: {
            status: 'MATCHED',
            confidence: 'HIGH',
            reason: 'independent_branch_consensus',
            suggestion: null
        },
        mount: {
            status: 'MATCHED',
            confidence: 'HIGH',
            reason: 'mount_relative_suffix_consensus',
            mountPrefix: 'Z:\\Mounted\\Anime\\Show'
        },
        suggestion: {
            sourcePrefix: 'D:\\Library\\Anime\\Show',
            cloudPrefix: '/cloud/Anime/Show',
            mountPrefix: 'Z:\\Mounted\\Anime\\Show'
        }
    }, overrides);
}

function registerPreviewIpc(options = {}) {
    const handlers = {};
    const trusted = {};
    const root = temporaryRoot('ete-strm-assistant-ipc-');
    const store = options.store || configStore.createStore({rootDir: root, environment: {}});
    const unregister = configIpc.register(Object.assign({
        ipcMain: {
            handle(name, handler) { handlers[name] = handler; },
            removeHandler(name) { delete handlers[name]; }
        },
        store,
        getWebContents: () => trusted
    }, options));
    return {
        root,
        store,
        trusted,
        handlers,
        invoke(request) {
            return handlers[configIpc.CHANNELS.PREVIEW_MAPPING]({sender: trusted}, request);
        },
        invokeUntrusted(request) {
            return handlers[configIpc.CHANNELS.PREVIEW_MAPPING]({sender: {}}, request);
        },
        unregister() {
            unregister();
            fs.rmSync(root, {recursive: true, force: true});
        }
    };
}

test('preview IPC accepts multi-sample input and returns the new bounded response shape', async () => {
    const context = registerPreviewIpc();
    try {
        const response = await context.invoke({
            samples: branchSamples('Z:\\Mounted\\Anime'),
            rules: []
        });

        assert.equal(response.status, 'ok');
        assert.deepEqual(Object.keys(response.preview).sort(), [
            'boundary', 'coverage', 'fileMatch', 'mount', 'suggestion'
        ]);
        assert.equal(response.preview.coverage.status, 'NOT_COVERED');
        assert.equal(response.preview.fileMatch.confidence, 'HIGH');
        assert.equal(response.preview.boundary.status, 'MATCHED');
        assert.equal(response.preview.boundary.confidence, 'HIGH');
        assert.equal(response.preview.mount.status, 'MATCHED');
        assert.deepEqual(response.preview.suggestion, {
            sourcePrefix: 'D:\\Library\\Anime\\Show',
            cloudPrefix: '/cloud/Anime/Show',
            mountPrefix: 'Z:\\Mounted\\Anime\\Show'
        });
    } finally {
        context.unregister();
    }
});

test('preview IPC rejects the old flat request, malformed samples, and untrusted senders', async () => {
    const context = registerPreviewIpc();
    try {
        assert.deepEqual(await context.invoke({
            sourcePath: 'D:\\Library\\Anime\\Show\\Season 1\\Episode 01.mkv',
            cloudPath: '/cloud/Anime/Show/Season 1/Episode 01.mkv'
        }), {status: 'error', reason: 'invalid_request'});
        assert.deepEqual(await context.invoke({samples: [{sourcePath: 'relative', cloudPath: '/cloud/file.mkv'}]}), {
            status: 'ok',
            preview: {
                coverage: {status: 'CONFLICT', mountStatus: 'UNSAFE', ruleIds: [], reason: 'invalid_sample'},
                fileMatch: {status: 'UNSAFE', confidence: 'LOW', matchedSuffixSegments: 0},
                boundary: {status: 'UNRESOLVED', confidence: 'LOW', reason: 'invalid_sample'},
                suggestion: null,
                mount: {status: 'UNRESOLVED', confidence: 'LOW', reason: 'invalid_sample'}
            }
        });
        assert.deepEqual(await context.invokeUntrusted({samples: branchSamples(), rules: []}), {
            status: 'error', reason: 'untrusted_sender'
        });
    } finally {
        context.unregister();
    }
});

test('preview IPC is read-only and accepts only bounded draft rules', async () => {
    const calls = {save: 0, applyDiscovery: 0, cd2: 0};
    const root = temporaryRoot('ete-strm-assistant-readonly-');
    const baseStore = configStore.createStore({rootDir: root, environment: {}});
    const store = Object.assign({}, baseStore, {
        save() { calls.save++; throw new Error('preview must not save'); },
        applyDiscovery() { calls.applyDiscovery++; throw new Error('preview must not apply discovery'); }
    });
    const context = registerPreviewIpc({
        store,
        createTestService() {
            calls.cd2++;
            throw new Error('preview must not create CD2 service');
        }
    });
    try {
        const paths = baseStore.getConfigPaths();
        const beforePublic = baseStore.getPublicConfig();
        const beforeConfig = fs.existsSync(paths.configPath) ? fs.readFileSync(paths.configPath) : null;
        const beforeSecrets = fs.existsSync(paths.secretsPath) ? fs.readFileSync(paths.secretsPath) : null;
        const response = await context.invoke({
            samples: branchSamples(),
            rules: [rule()],
            token: 'must-not-echo'
        });

        assert.equal(response.status, 'ok');
        assert.equal(calls.save, 0);
        assert.equal(calls.applyDiscovery, 0);
        assert.equal(calls.cd2, 0);
        assert.deepEqual(baseStore.getPublicConfig(), beforePublic);
        assert.equal(fs.existsSync(paths.configPath), beforeConfig !== null);
        assert.equal(fs.existsSync(paths.secretsPath), beforeSecrets !== null);
        assert.doesNotMatch(JSON.stringify(response), /must-not-echo|token|secret|url/i);
        assert.deepEqual(await context.invoke({samples: branchSamples(), rules: 'not-an-array'}), {
            status: 'error', reason: 'invalid_request'
        });
    } finally {
        context.unregister();
        fs.rmSync(root, {recursive: true, force: true});
    }
});

test('only an uncovered multi-sample HIGH boundary can be added', () => {
    const high = preview();
    const singleSample = preview({
        boundary: {status: 'INSUFFICIENT_EVIDENCE', confidence: 'LOW', reason: 'second_sample_required'},
        suggestion: null
    });
    const existing = preview({
        coverage: {status: 'FULLY_COVERED', mountStatus: 'MATCHED', ruleIds: ['existing'], reason: 'existing_cloud_coverage'},
        suggestion: null
    });
    const medium = preview({
        fileMatch: {status: 'MATCHED', confidence: 'MEDIUM', matchedSuffixSegments: 3},
        boundary: {status: 'UNRESOLVED', confidence: 'LOW', reason: 'file_match_insufficient'},
        suggestion: null
    });

    assert.deepEqual(mappingAssistant.evaluatePreview(high, []), {
        canAdd: true,
        collision: mappingAssistant.COLLISION.NONE
    });
    for (const value of [singleSample, existing, medium]) {
        assert.deepEqual(mappingAssistant.evaluatePreview(value, []), {
            canAdd: false,
            collision: mappingAssistant.COLLISION.NONE
        });
    }
});

test('Windows fileMatch can be HIGH while a POSIX cloud case mismatch blocks Boundary HIGH', async () => {
    const context = registerPreviewIpc();
    try {
        const first = sample('Season 1', 'Episode 01');
        const second = sample('Season 2', 'Episode 01');
        first.cloudPath = '/cloud/Anime/Show/season 1/Episode 01.mkv';
        second.cloudPath = '/cloud/Anime/Show/season 2/Episode 01.mkv';
        const response = await context.invoke({
            samples: [first, second],
            rules: []
        });
        assert.equal(response.status, 'ok');
        assert.equal(response.preview.fileMatch.confidence, 'HIGH');
        assert.notEqual(response.preview.boundary.confidence, 'HIGH');
        assert.equal(response.preview.boundary.status, 'UNRESOLVED');
        assert.equal(response.preview.boundary.reason, 'relative_suffix_mismatch');
        assert.equal(response.preview.suggestion, null);
    } finally {
        context.unregister();
    }
});

test('accepting a multi-sample HIGH preview creates one USER draft without mutating input rules', () => {
    const existing = [rule({id: 'unrelated', sourcePrefix: 'D:\\Other', cloudPrefix: '/other'})];
    const before = structuredClone(existing);
    const result = mappingAssistant.addDraftRule(existing, preview(), 'new-rule-smart-fixture');

    assert.equal(result.status, 'added');
    assert.deepEqual(existing, before);
    assert.deepEqual(result.addedRule, {
        id: 'new-rule-smart-fixture',
        sourcePrefix: 'D:\\Library\\Anime\\Show',
        mountPrefix: 'Z:\\Mounted\\Anime\\Show',
        cloudPrefix: '/cloud/Anime/Show',
        storageType: 'cloud-mount',
        strategy: 'cloud-first',
        order: ['direct-url', 'cd2-http', 'mount', 'native'],
        originState: 'USER',
        enabled: true
    });
    assert.equal(mappingAssistant.addDraftRule(result.rules, preview(), 'another-id').status, 'duplicate');
});

test('existing FULL/CLOUD/CONFLICT coverage never becomes addable', () => {
    const full = preview({coverage: {status: 'FULLY_COVERED', mountStatus: 'MATCHED', ruleIds: ['full'], reason: 'existing_cloud_coverage'}, suggestion: null});
    const cloud = preview({coverage: {status: 'CLOUD_COVERED', mountStatus: 'MOUNT_NOT_CONFIGURED', ruleIds: ['cloud'], reason: 'existing_cloud_coverage'}, suggestion: null});
    const conflict = preview({coverage: {status: 'CONFLICT', mountStatus: 'CONFLICT', ruleIds: ['conflict'], reason: 'existing_mount_conflict'}, suggestion: null});

    for (const value of [full, cloud, conflict]) {
        assert.equal(mappingAssistant.isHighMatch(value), false);
        assert.equal(mappingAssistant.addDraftRule([], value, 'blocked').status, 'ineligible');
    }
});

test('explicit Save is the only persistence boundary for an accepted schema v1 draft', async () => {
    const root = temporaryRoot('ete-strm-assistant-save-');
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
        const before = store.getPublicConfig();
        const draft = mappingAssistant.addDraftRule(before.rules, preview(), 'new-rule-smart-save');
        assert.equal(draft.status, 'added');
        assert.deepEqual(store.getPublicConfig(), before);

        const response = await handlers[configIpc.CHANNELS.SAVE]({sender: trusted}, {
            config: Object.assign({}, before, {rules: draft.rules})
        });
        assert.equal(response.status, 'saved');
        assert.equal(response.requiresRestart, true);
        assert.deepEqual(Object.keys(response.config).sort(), ['cd2', 'enabled', 'rules', 'version']);
        assert.equal(response.config.version, 1);
        assert.equal(response.config.rules[0].originState, 'USER');
        assert.equal(response.config.rules[0].sourcePrefix, 'D:\\Library\\Anime\\Show');
        assert.equal(response.config.rules[0].cloudPrefix, '/cloud/Anime/Show');
        assert.equal(response.config.rules[0].mountPrefix, 'Z:\\Mounted\\Anime\\Show');
    } finally {
        unregister();
        fs.rmSync(root, {recursive: true, force: true});
    }
});

test('preview and accepted diagnostics use exact scalar allowlists only', () => {
    const raw = Object.assign(preview(), {
        sourcePath: 'D:\\Private\\Anime\\Show\\Season 1\\Episode 01.mkv',
        cloudPath: '/cloud/Private/Anime/Show/Season 1/Episode 01.mkv',
        token: 'raw-secret',
        url: 'https://example.test/file?token=raw-secret'
    });
    const previewRecord = mappingAssistant.diagnosticRecord('smart-path-mapping-preview', raw);
    const acceptedRecord = mappingAssistant.diagnosticRecord('smart-path-mapping-accepted', raw);

    assert.deepEqual(previewRecord, {
        schemaVersion: 1,
        level: 'info',
        category: 'resolver',
        event: 'smart-path-mapping-preview',
        details: {
            coverageStatus: 'NOT_COVERED',
            fileMatchConfidence: 'HIGH',
            boundaryStatus: 'MATCHED',
            boundaryConfidence: 'HIGH',
            matchedSuffixSegments: 4,
            reason: 'independent_branch_consensus'
        }
    });
    assert.deepEqual(acceptedRecord, {
        schemaVersion: 1,
        level: 'info',
        category: 'resolver',
        event: 'smart-path-mapping-accepted',
        details: {
            boundaryConfidence: 'HIGH',
            matchedSuffixSegments: 4
        }
    });
    assert.doesNotMatch(JSON.stringify([previewRecord, acceptedRecord]),
        /Private|example\.test|raw-secret|sourcePath|cloudPath|sourcePrefix|cloudPrefix|mountPrefix|token|url/);
});

test('settings UI wires multi-sample preview, draft rules, stale sequence guards, and explicit Save', () => {
    assert.match(settingsHtml, /class="smartSamples"/);
    assert.match(settingsHtml, /class="smartSample/);
    assert.match(settingsHtml, /class="btnAddSample"/);
    assert.match(settingsHtml, /class="btnAnalyzeMapping"/);
    assert.match(settingsHtml, /class="[^"\n]*btnAddSuggestedRule[^"\n]*"[^>]*disabled/);
    assert.match(settingsHtml, /type="submit"[^>]*class="[^"\n]*btnSave/);
    assert.match(settingsSource, /previewMapping:\s*'enhanced-strm-smart-mapping-preview'/);
    assert.match(settingsSource, /collectSamples\(view\)/);
    assert.match(settingsSource, /samples:\s*samples/);
    assert.match(settingsSource, /rules:\s*rules/);
    assert.match(settingsSource, /requestSequence\s*!==\s*this\.mappingRequestSequence/);
    assert.match(settingsSource, /this\.draftRuleIds\[result\.addedRule\.id\]\s*=\s*true/);
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
    assert.match(configIpcSource, /samples/);
    assert.match(configIpcSource, /rules/);
    assert.match(configIpcSource, /PREVIEW_MAPPING:\s*'enhanced-strm-smart-mapping-preview'/);
});
