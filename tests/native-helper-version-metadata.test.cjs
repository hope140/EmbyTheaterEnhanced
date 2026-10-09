'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const {materialize} = require('../tools/materialize-native-helper-source.cjs');
const SOURCE_PATH = 'native/mpv-helper/ete-mpv-helper.cpp';

function git(root, args) {
    const result = spawnSync('git', ['-C', root, ...args], {encoding: 'utf8', windowsHide: true});
    assert.equal(result.status, 0, result.stderr || result.error && result.error.message);
    return result.stdout.trim();
}

function createRepository(t, source) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-helper-version-source-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    git(root, ['init', '-q']);
    git(root, ['config', 'user.name', 'Native Helper Metadata Test']);
    git(root, ['config', 'user.email', 'native-helper-test@example.invalid']);
    const file = path.join(root, ...SOURCE_PATH.split('/'));
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, source);
    git(root, ['add', SOURCE_PATH]);
    git(root, ['commit', '-q', '-m', 'fixture helper source']);
    return {root, commit: git(root, ['rev-parse', 'HEAD'])};
}

test('native helper source materialization extracts one committed version declaration', t => {
    const source = Buffer.from('#include <string>\nconstexpr const char* HELPER_VERSION = "1.2.3";\nint main() { return 0; }\n');
    const repository = createRepository(t, source);
    const output = path.join(repository.root, 'materialized', 'ete-mpv-helper.cpp');
    const result = materialize(repository.root, repository.commit, SOURCE_PATH, output);

    assert.equal(result.version, '1.2.3');
    assert.equal(result.size, source.length);
    assert.equal(result.sha256, crypto.createHash('sha256').update(source).digest('hex'));
    assert.match(result.objectId, /^[0-9a-f]{40,64}$/i);
    assert.deepEqual(fs.readFileSync(output), source);
});

test('native helper source materialization rejects missing or duplicate version declarations', t => {
    for (const source of [
        '#include <string>\nint main() { return 0; }\n',
        'constexpr const char* HELPER_VERSION = "1.2.3";\nconstexpr const char* HELPER_VERSION = "1.2.4";\n'
    ]) {
        const repository = createRepository(t, source);
        const output = path.join(repository.root, 'materialized', 'ete-mpv-helper.cpp');
        assert.throws(() => materialize(repository.root, repository.commit, SOURCE_PATH, output),
            /Native helper version declaration is missing or ambiguous\./);
        assert.equal(fs.existsSync(output), false, 'invalid source must not produce a materialized output');
    }
});
