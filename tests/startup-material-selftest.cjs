'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const preparation = require('../tools/prepare-web-overlays.cjs');
const {patchStartup} = require('../tools/patch-startup.cjs');

const repoRoot = path.resolve(__dirname, '..');

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
}

test('v2 startup input already has the fixed overlay identity and preserves DOM and loader bytes', () => {
    const contract = preparation.WEB_OVERLAY_CONTRACT.find(item => item.id === 'startup-index');
    assert.ok(contract, 'startup-index overlay contract must exist');

    const base = fs.readFileSync(path.join(repoRoot, contract.basePath));
    assert.equal(sha256(base), contract.expectedBaseSha256);
    const output = base;
    assert.equal(sha256(output),'18F777EE20F9829F3E7E4AB53A3442E7D4BD1532689E7ECE0B874281E0BB305D');
    assert.throws(()=>patchStartup(base.toString('utf8')),/Startup source contract mismatch/);
    assert.equal(sha256(output), contract.expectedOutputSha256);

    const baseText = base.toString('utf8');
    const outputText = output.toString('utf8');
    const styleEnd = '</style>';
    const baseStyleEnd = baseText.indexOf(styleEnd);
    const outputStyleEnd = outputText.indexOf(styleEnd);
    assert.notEqual(baseStyleEnd, -1);
    assert.notEqual(outputStyleEnd, -1);
    assert.equal(outputText.slice(outputStyleEnd), baseText.slice(baseStyleEnd));
    assert.equal(outputText.match(/<script\b[^>]*>/g)?.join('\n'),
        baseText.match(/<script\b[^>]*>/g)?.join('\n'));
    assert.equal(outputText.slice(outputStyleEnd).includes('<div class="app-splash"></div>'), true);
    assert.equal(outputText.slice(outputStyleEnd).includes('apploader.js'), true);
    assert.equal(output.includes(base.subarray(baseStyleEnd)), true);
});
