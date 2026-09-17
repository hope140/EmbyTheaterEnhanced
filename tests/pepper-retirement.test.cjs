'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const service = require('../src/electronapp/native-helper/service');
const runtimeExclusions = require('../tools/runtime-exclusions.cjs');

const mainSource = fs.readFileSync(path.join(__dirname, '../src/electronapp/main.js'), 'utf8');
const libmpvSource = fs.readFileSync(path.join(__dirname, '../src/electronapp/plugins/libmpv.js'), 'utf8');
const clientSource = fs.readFileSync(path.join(__dirname, '../src/electronapp/native-helper/client.js'), 'utf8');
const serviceSource = fs.readFileSync(path.join(__dirname, '../src/electronapp/native-helper/service.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../vendor/runtime-manifest.json'), 'utf8'));

test('Native Helper is the only production bridge entrypoint', () => {
    assert.match(mainSource, /resolveMode\(process\.env\.ETE_MPV_BRIDGE_MODE\)/);
    assert.doesNotMatch(mainSource, /register-pepper-plugins/);
    assert.doesNotMatch(mainSource, /application\/x-mpvjs/);
    assert.doesNotMatch(libmpvSource, /createElement\(['"]embed['"]\)/);
    assert.doesNotMatch(libmpvSource, /bridge\.mode\s*===\s*['"]pepper['"]|mode\s*===\s*['"]pepper['"]/);
    assert.doesNotMatch(clientSource, /mode:\s*['"]pepper['"]\s*,\s*endpoint/);
    assert.doesNotMatch(serviceSource, /mode\s*===\s*['"]pepper['"]\s*\)/);
});

test('default and explicit legacy bridge mode are deterministic', () => {
    assert.equal(service.resolveMode(undefined), 'native-helper');
    assert.equal(service.resolveMode('native-helper'), 'native-helper');
    assert.throws(() => service.resolveMode('pepper'), /legacy-mode-removed/);
    assert.throws(() => service.resolveMode('unsupported'), /unsupported-bridge-mode/);
});

test('retired Pepper binary is removed from a runtime payload', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-retirement-'));
    try {
        const retired = path.join(root, ...runtimeExclusions.RETIRED_RUNTIME_PATHS[0].split('/'));
        fs.mkdirSync(path.dirname(retired), {recursive: true});
        fs.writeFileSync(retired, 'retired-bridge-fixture');
        const result = runtimeExclusions.remove(root);
        assert.equal(result.status, 'passed');
        assert.equal(fs.existsSync(retired), false);
        assert.equal(runtimeExclusions.verify(root).status, 'passed');
    } finally {
        fs.rmSync(root, {recursive: true, force: true});
    }
});

test('vendor archive entry is historical input and has a runtime exclusion contract', () => {
    assert.deepEqual(manifest.runtimeExclusions, runtimeExclusions.RETIRED_RUNTIME_PATHS);
    const entry = manifest.files.find(value => value.path === runtimeExclusions.RETIRED_RUNTIME_PATHS[0]);
    assert.ok(entry);
    assert.equal(entry.plannedReplacement, undefined, 'file entries stay archival inventory only');
    const component = manifest.components.find(value => value.path === runtimeExclusions.RETIRED_RUNTIME_PATHS[0]);
    assert.equal(component.plannedReplacement, true);
});
