'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {verify} = require('../tools/verify-installer-runtime.cjs');
function fixture(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-installer-'));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    const source = 'a'.repeat(40), runtime = path.join(directory, 'runtime'), extracted = path.join(directory, 'extracted');
    fs.mkdirSync(runtime); fs.writeFileSync(path.join(runtime, 'build-manifest.json'), JSON.stringify({schemaVersion: 3, sourceCommit: source}));
    fs.writeFileSync(path.join(runtime, 'payload'), 'original');
    fs.cpSync(runtime, extracted, {recursive: true});
    return {runtime, extracted, source};
}
test('installer verifier includes the manifest and every payload byte', t => {
    const f = fixture(t); assert.equal(verify(f.runtime, f.extracted, f.source).fileCount, 2);
    fs.writeFileSync(path.join(f.extracted, 'payload'), 'modified');
    assert.throws(() => verify(f.runtime, f.extracted, f.source), /bytes differ/);
});
test('installer verifier rejects missing or extra payload paths', t => {
    const f = fixture(t); fs.writeFileSync(path.join(f.extracted, 'extra'), 'x');
    assert.throws(() => verify(f.runtime, f.extracted, f.source), /paths differ/);
    fs.unlinkSync(path.join(f.extracted, 'extra')); fs.unlinkSync(path.join(f.extracted, 'payload'));
    assert.throws(() => verify(f.runtime, f.extracted, f.source), /paths differ/);
});
test('installer verifier refuses a package bound to another source', t => {
    const f = fixture(t); assert.throws(() => verify(f.runtime, f.extracted, 'b'.repeat(40)), /source identity mismatch/);
    assert.throws(() => verify(f.runtime, f.extracted, 'main'), /Exact source/);
});
