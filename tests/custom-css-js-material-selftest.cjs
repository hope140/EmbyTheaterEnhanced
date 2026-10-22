'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const patcher = require('../tools/patch-custom-css-js.cjs');
const buildInputs = require('../tools/build-input-contract.cjs');
const overlays = require('../tools/prepare-web-overlays.cjs');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_PATH = 'vendor/web-snapshot/www/modules/CustomCssJS.js';
const GENERATOR_PATH = 'tools/patch-custom-css-js.cjs';
const EXPECTED_SOURCE_SHA256 = '2177DE28DCC4E715F07C63329DC361C5B4DDD37EB7E59F273830B22ACEA37912';
const EXPECTED_OUTPUT_SHA256 = 'B9F6268F3E3126426F189F38F1E57FF4CD03D8F9A213305157E1F6842F251103';

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
}

const sourceFile = path.join(ROOT, ...SOURCE_PATH.split('/'));
if (!fs.existsSync(sourceFile) || !fs.statSync(sourceFile).isFile()) {
    throw new Error('Required locked CustomCssJS source material is missing: ' + SOURCE_PATH);
}
const source = fs.readFileSync(sourceFile);
const sourceHash = sha256(source);
assert.equal(sourceHash, EXPECTED_SOURCE_SHA256, 'CustomCssJS source hash changed');

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor/web-snapshot-manifest.json'), 'utf8'));
const manifestEntry = manifest.files.find(item => item.path === 'www/modules/CustomCssJS.js');
assert.ok(manifestEntry, 'runtime manifest must include CustomCssJS.js');
assert.equal(manifestEntry.sha256.toUpperCase(), sourceHash);

const transformed = Buffer.from(patcher.patchText(source.toString('utf8')), 'utf8');
const outputHash = sha256(transformed);
assert.equal(outputHash, EXPECTED_OUTPUT_SHA256, 'generated CustomCssJS overlay hash changed');
assert.equal(/\b(?:new\s+Function|eval)\s*\(/.test(transformed.toString('utf8')), false);
assert.ok(transformed.toString('utf8').includes('loadCode(customcssServer, "css", "Server");'));
assert.ok(transformed.toString('utf8').includes('loadCode(customcssLocal, "css", "Local");'));

const overlay = overlays.WEB_OVERLAY_CONTRACT.find(item => item.id === 'custom-css-js');
assert.ok(overlay, 'CustomCssJS overlay contract must exist');
assert.equal(overlay.expectedBaseSha256, sourceHash);
assert.equal(overlay.expectedOutputSha256, outputHash);
assert.ok(overlay.generatorPaths.includes(GENERATOR_PATH));
assert.ok(buildInputs.INPUT_PATHS.includes(GENERATOR_PATH));

process.stdout.write('Fixed CustomCssJS material self-test passed: ' + sourceHash + ' -> ' + outputHash + '\n');
