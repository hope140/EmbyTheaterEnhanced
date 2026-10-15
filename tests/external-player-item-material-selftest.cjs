'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const buildInputs = require('../tools/build-input-contract.cjs');
const overlays = require('../tools/prepare-web-overlays.cjs');
const residue = require('../tools/patch-externalplayer-residue.cjs');

const ROOT = path.resolve(__dirname, '..');
const MATERIAL = Object.freeze([
    Object.freeze({
        id: 'item-externalplayer-residue',
        sourcePath: 'vendor/carnival/electronapp/www/item/item.js',
        runtimePath: 'electronapp/www/item/item.js',
        sourceSha256: 'C8F51119365ECD2881B0A33F1F9E9DD6DA90E305572621188FB31A15FDCB4623',
        outputSha256: 'FBD8D1DB7906F2F5E9B742B956D25B2586DCDB097D5E34155998DB32410653C0',
        transform: residue.patchItemText
    }),
    Object.freeze({
        id: 'item-externalplayer-residue-template',
        sourcePath: 'vendor/carnival/electronapp/www/item/item.html',
        runtimePath: 'electronapp/www/item/item.html',
        sourceSha256: 'A11D00BB58F83A9F56A16F137342D5C3B62DF03AE83436527D426B56B160A6B5',
        outputSha256: '99C68FF278B71D26ED702A876C7C10312896A9BBED3D8928E7FC8B60917AE691',
        transform: residue.patchItemHtmlText
    })
]);
const PM_PATH = 'vendor/carnival/electronapp/www/modules/common/playback/playbackmanager.js';

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
}

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor/runtime-manifest.json'), 'utf8'));
for (const material of MATERIAL) {
    const sourceFile = path.join(ROOT, ...material.sourcePath.split('/'));
    if (!fs.existsSync(sourceFile) || !fs.statSync(sourceFile).isFile()) {
        throw new Error('Required fixed item material is missing: ' + material.sourcePath);
    }
    const source = fs.readFileSync(sourceFile);
    const sourceHash = sha256(source);
    assert.equal(sourceHash, material.sourceSha256, material.sourcePath + ' source hash changed');
    const manifestEntry = manifest.files.find(item => item.path === material.sourcePath.replace(/^vendor\/carnival\//, ''));
    assert.ok(manifestEntry, 'runtime manifest must include ' + material.runtimePath);
    assert.equal(manifestEntry.sha256.toUpperCase(), sourceHash);

    const transformed = Buffer.from(material.transform(source.toString('utf8')), 'utf8');
    assert.equal(sha256(transformed), material.outputSha256, material.runtimePath + ' output hash changed');
    const contract = overlays.WEB_OVERLAY_CONTRACT.find(item => item.id === material.id);
    assert.ok(contract, material.id + ' overlay contract must exist');
    assert.equal(contract.expectedBaseSha256, sourceHash);
    assert.equal(contract.expectedOutputSha256, material.outputSha256);
    if (material.runtimePath.endsWith('.js')) {
        new vm.Script(transformed.toString('utf8'), {filename: material.runtimePath});
    } else {
        assert.equal(transformed.toString('utf8').includes('btnAutoPlay'), false);
    }
}

const playbackSourceFile = path.join(ROOT, ...PM_PATH.split('/'));
if (!fs.existsSync(playbackSourceFile) || !fs.statSync(playbackSourceFile).isFile()) {
    throw new Error('Required PlayQueue source material is missing: ' + PM_PATH);
}
const playbackSource = fs.readFileSync(playbackSourceFile, 'utf8');
const playbackEntry = manifest.files.find(item => item.path === PM_PATH.replace(/^vendor\/carnival\//, ''));
assert.ok(playbackEntry, 'runtime manifest must include the playback manager');
assert.equal(sha256(Buffer.from(playbackSource)).toLowerCase(), playbackEntry.sha256.toLowerCase());
assert.ok(playbackSource.includes('EnableNextEpisodeAutoPlay'),
    'Emby next-episode preference must remain in the PlaybackManager-owned path');
assert.equal(overlays.WEB_OVERLAY_CONTRACT.some(item =>
    item.runtimePath === 'electronapp/www/modules/common/playback/playbackmanager.js'), false);
assert.ok(buildInputs.INPUT_PATHS.includes('tools/patch-externalplayer-residue.cjs'));

process.stdout.write('Fixed item material self-test passed: ' +
    MATERIAL.map(item => item.sourceSha256 + ' -> ' + item.outputSha256).join('; ') +
    '; normal next-episode owner remains in PlaybackManager.\n');
