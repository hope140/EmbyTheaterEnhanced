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

test('frozen startup index produces the fixed overlay while retaining its DOM and loader bytes', () => {
    const contract = preparation.WEB_OVERLAY_CONTRACT.find(item => item.id === 'startup-index');
    assert.ok(contract, 'startup-index overlay contract must exist');

    const base = fs.readFileSync(path.join(repoRoot, contract.basePath));
    assert.equal(sha256(base), contract.expectedBaseSha256);
    const output = Buffer.from(patchStartup(base.toString('utf8')), 'utf8');
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
