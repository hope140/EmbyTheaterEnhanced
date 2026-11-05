'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {patchVideoOsd: patchLifecycle} = require('../tools/patch-videoosd-lifecycle.cjs');
const {patchVideoOsd: patchAppearance} = require('../tools/patch-subtitle-appearance.cjs');

const root = path.resolve(__dirname, '..');
const original = fs.readFileSync(path.join(root, 'vendor/web-snapshot/www/videoosd/videoosd.js'), 'utf8');
const result = patchAppearance(patchLifecycle(original));

test('source-bound VideoOSD renders only eligible local text subtitle appearance controls', () => {
  new vm.Script(result, {filename: 'videoosd.js'});
  const start = result.indexOf('  function canAdjustSubtitleAppearance(');
  const end = result.indexOf('  function destroySubtitleOffsetOverlay(', start);
  assert.ok(start > 0 && end > start);
  const eligible = vm.runInNewContext(result.slice(start, end) + '\ncanAdjustSubtitleAppearance');
  const local = {isLocalPlayer: true, applySubtitleAppearance() {}};
  assert.equal(eligible(local, {Codec: 'subrip', IsTextSubtitleStream: true}), true);
  assert.equal(eligible(local, {Codec: 'ass', IsTextSubtitleStream: true}), false);
  assert.equal(eligible(local, {Codec: 'hdmv_pgs_subtitle', IsTextSubtitleStream: false}), false);
  assert.equal(eligible({isLocalPlayer: false, applySubtitleAppearance() {}}, {Codec: 'subrip'}), false);
  assert.equal(eligible(local, null), false);
  assert.equal(result.includes('id: "subtitleappearance"'), true);
  assert.equal(result.includes('player !== self.currentPlayer'), true);
  const modulePath = path.resolve(root, 'src/electronapp/www/videoosd', '../../enhanced/subtitle-appearance-dialog.js');
  assert.equal(modulePath, path.join(root, 'src/electronapp/enhanced/subtitle-appearance-dialog.js'));
});

test('appearance OSD patcher refuses stale or duplicated transform anchors', () => {
  assert.throws(() => patchAppearance(result.replace('  function destroySubtitleOffsetOverlay(instance) {', '  function changedOffsetOverlay(instance) {')), /source contract mismatch/);
  assert.throws(() => patchAppearance(result), /source contract mismatch/);
});
