'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const scanner = require('../tools/ci-secret-scan.cjs');

function withFixture(callback) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-ci-secret-scan-'));
    try { callback(root); } finally { fs.rmSync(root, {recursive: true, force: true}); }
}

test('finite credential scanner detects a private key marker and reports only path and rule', () => {
    withFixture(root => {
        const secret = 'BEGIN ' + 'PRIVATE KEY';
        fs.mkdirSync(path.join(root, 'src'), {recursive: true});
        fs.writeFileSync(path.join(root, 'src', 'fixture.js'), '-----' + secret + '-----\n' + 'UNIQUE_CANARY_CONTENT_9128');
        const findings = scanner.scanFiles(root, ['src/fixture.js']);
        assert.deepEqual(findings, [{path: 'src/fixture.js', rule: 'private-key-pem'}]);
        assert.equal(JSON.stringify(findings).includes('UNIQUE_CANARY_CONTENT_9128'), false);
    });
});

test('finite credential scanner accepts ordinary source text', () => {
    withFixture(root => {
        fs.mkdirSync(path.join(root, 'tools'), {recursive: true});
        fs.writeFileSync(path.join(root, 'tools', 'safe.cjs'), "const authorization = 'Bearer example';\n");
        assert.deepEqual(scanner.scanFiles(root, ['tools/safe.cjs']), []);
    });
});
