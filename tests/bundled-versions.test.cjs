'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {readBundledVersions} = require('../src/electronapp/enhanced/bundled-versions');

const sourceCommit = 'a'.repeat(40);
const helperPath = 'electronapp/native-helper/ete-mpv-helper.exe';
const libmpvPath = 'electronapp/libmpv/x64/mpv-1.dll';

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function createFixture() {
    const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-bundled-versions-'));
    const helper = Buffer.from('test helper executable bytes');
    const libmpv = Buffer.from('test libmpv library bytes');
    for (const [relative, contents] of [[helperPath, helper], [libmpvPath, libmpv]]) {
        const file = path.join(runtimeRoot, relative);
        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.writeFileSync(file, contents);
    }
    const record = {
        schemaVersion: 1,
        protocolVersion: 1,
        sourceCommit,
        helper: {version: '0.2.5', runtimePath: helperPath, sha256: sha256(helper), testing: false},
        libmpv: {version: 'v0.41.0', runtimePath: libmpvPath, sha256: sha256(libmpv)}
    };
    const provenancePath = path.join(runtimeRoot, 'native-helper-provenance.json');
    const manifestPath = path.join(runtimeRoot, 'build-manifest.json');
    const fixture = {runtimeRoot, provenancePath, manifestPath, record, helper, libmpv};
    rewriteRecord(fixture);
    return fixture;
}

function rewriteRecord(fixture, updateManifest) {
    const bytes = Buffer.from(JSON.stringify(fixture.record));
    fs.writeFileSync(fixture.provenancePath, bytes);
    if (updateManifest === false) return;
    fs.writeFileSync(fixture.manifestPath, JSON.stringify({
        schemaVersion: 3,
        sourceCommit,
        files: [{path: 'native-helper-provenance.json', sha256: sha256(bytes)}]
    }));
}

test('bundled versions require matching provenance and hashes for fixed runtime files', t => {
    const fixture = createFixture();
    t.after(() => fs.rmSync(fixture.runtimeRoot, {recursive: true, force: true}));

    assert.deepEqual(readBundledVersions(fixture.runtimeRoot, sourceCommit), {
        helperVersion: '0.2.5',
        libmpvVersion: 'v0.41.0'
    });
    assert.equal(readBundledVersions(fixture.runtimeRoot, 'bad-commit'), null, 'invalid source commit is unknown');
    assert.equal(readBundledVersions(fixture.runtimeRoot, 'b'.repeat(40)), null, 'provenance from another commit is unknown');

    fs.rmSync(fixture.provenancePath);
    assert.equal(readBundledVersions(fixture.runtimeRoot, sourceCommit), null, 'missing provenance is unknown');
});

test('bundled versions require one source-bound provenance manifest hash', t => {
    const fixture = createFixture();
    t.after(() => fs.rmSync(fixture.runtimeRoot, {recursive: true, force: true}));

    fixture.record.helper.version = '0.2.6';
    rewriteRecord(fixture, false);
    assert.equal(readBundledVersions(fixture.runtimeRoot, sourceCommit), null,
        'a provenance version edit without a matching manifest hash is unknown');

    fixture.record.helper.version = '0.2.5';
    rewriteRecord(fixture);
    fs.rmSync(fixture.manifestPath);
    assert.equal(readBundledVersions(fixture.runtimeRoot, sourceCommit), null, 'missing build manifest is unknown');

    rewriteRecord(fixture);
    const manifest = JSON.parse(fs.readFileSync(fixture.manifestPath, 'utf8'));
    manifest.files.push(Object.assign({}, manifest.files[0]));
    fs.writeFileSync(fixture.manifestPath, JSON.stringify(manifest));
    assert.equal(readBundledVersions(fixture.runtimeRoot, sourceCommit), null, 'duplicate provenance manifest entries are unknown');

    rewriteRecord(fixture);
    const wrongCommitManifest = JSON.parse(fs.readFileSync(fixture.manifestPath, 'utf8'));
    wrongCommitManifest.sourceCommit = 'b'.repeat(40);
    fs.writeFileSync(fixture.manifestPath, JSON.stringify(wrongCommitManifest));
    assert.equal(readBundledVersions(fixture.runtimeRoot, sourceCommit), null, 'manifest from another source commit is unknown');
});

test('bundled versions return unknown for invalid provenance or runtime artifacts', t => {
    const cases = [
        ['unsupported schema', record => { record.schemaVersion = 2; }],
        ['testing helper build', record => { record.helper.testing = true; }],
        ['helper path outside the fixed runtime location', record => { record.helper.runtimePath = '../outside.exe'; }],
        ['libmpv path outside the fixed runtime location', record => { record.libmpv.runtimePath = 'other/mpv-1.dll'; }],
        ['malformed helper hash', record => { record.helper.sha256 = 'not-a-sha256'; }],
        ['tampered helper bytes', (_record, fixture) => fs.appendFileSync(path.join(fixture.runtimeRoot, helperPath), 'tampered')],
        ['tampered libmpv bytes', (_record, fixture) => fs.appendFileSync(path.join(fixture.runtimeRoot, libmpvPath), 'tampered')],
        ['invalid helper version', record => { record.helper.version = 'unknown'; }],
        ['invalid libmpv version', record => { record.libmpv.version = 'mpv'; }],
        ['missing libmpv artifact', (_record, fixture) => fs.rmSync(path.join(fixture.runtimeRoot, libmpvPath))]
    ];

    for (const [name, mutate] of cases) {
        const fixture = createFixture();
        try {
            mutate(fixture.record, fixture);
            rewriteRecord(fixture);
            assert.equal(readBundledVersions(fixture.runtimeRoot, sourceCommit), null, name);
        } finally {
            fs.rmSync(fixture.runtimeRoot, {recursive: true, force: true});
        }
    }
});
