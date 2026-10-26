'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const buildInputs = require('../tools/build-input-contract.cjs');
const overlays = require('../tools/prepare-web-overlays.cjs');
const residue = require('../tools/patch-externalplayer-residue.cjs');
const lifecycle = require('../tools/patch-item-lifecycle.cjs');
const itemControls = require('../tools/patch-item-controls.cjs');

const ROOT = path.resolve(__dirname, '..');
const MATERIAL = Object.freeze([
    Object.freeze({
        id: 'item-externalplayer-residue',
        sourcePath: 'vendor/web-snapshot/www/item/item.js',
        runtimePath: 'electronapp/www/item/item.js',
        sourceSha256: 'C8F51119365ECD2881B0A33F1F9E9DD6DA90E305572621188FB31A15FDCB4623',
        outputSha256: '9336D92E4B2A7A9150F296E181651E3DC6EA8104C715333E52933FC2913FDA69',
        transform: value => lifecycle.patchDetailCache(lifecycle.patchItemLifecycle(residue.patchItemText(value)))
    }),
    Object.freeze({
        id: 'item-externalplayer-residue-template',
        sourcePath: 'vendor/web-snapshot/www/item/item.html',
        runtimePath: 'electronapp/www/item/item.html',
        sourceSha256: 'A11D00BB58F83A9F56A16F137342D5C3B62DF03AE83436527D426B56B160A6B5',
        outputSha256: '03A897B7266A59B687E2B74A8253BE9A46FC9997FAD18BC4E956E5A5ADFA1E33',
        transform: value => itemControls.patchItemHtmlText(residue.patchItemHtmlText(value))
    })
]);
const PM_PATH = 'vendor/web-snapshot/www/modules/common/playback/playbackmanager.js';

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
}

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor/web-snapshot-manifest.json'), 'utf8'));
for (const material of MATERIAL) {
    const sourceFile = path.join(ROOT, ...material.sourcePath.split('/'));
    if (!fs.existsSync(sourceFile) || !fs.statSync(sourceFile).isFile()) {
        throw new Error('Required fixed item material is missing: ' + material.sourcePath);
    }
    const source = fs.readFileSync(sourceFile);
    const sourceHash = sha256(source);
    assert.equal(sourceHash, material.sourceSha256, material.sourcePath + ' source hash changed');
    const manifestEntry = manifest.files.find(item => item.path === material.sourcePath.replace(/^vendor\/web-snapshot\//, ''));
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
const playbackEntry = manifest.files.find(item => item.path === PM_PATH.replace(/^vendor\/web-snapshot\//, ''));
assert.ok(playbackEntry, 'runtime manifest must include the playback manager');
assert.equal(sha256(Buffer.from(playbackSource)).toLowerCase(), playbackEntry.sha256.toLowerCase());
assert.ok(playbackSource.includes('EnableNextEpisodeAutoPlay'),
    'Emby next-episode preference must remain in the PlaybackManager-owned path');
assert.equal(overlays.WEB_OVERLAY_CONTRACT.some(item =>
    item.runtimePath === 'electronapp/www/modules/common/playback/playbackmanager.js'), false);
assert.ok(buildInputs.INPUT_PATHS.includes('tools/patch-externalplayer-residue.cjs'));
assert.ok(buildInputs.INPUT_PATHS.includes('tools/patch-item-controls.cjs'));

process.stdout.write('Fixed item material self-test passed: ' +
    MATERIAL.map(item => item.sourceSha256 + ' -> ' + item.outputSha256).join('; ') +
    '; normal next-episode owner remains in PlaybackManager.\n');
