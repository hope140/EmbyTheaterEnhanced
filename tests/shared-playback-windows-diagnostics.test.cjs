'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const tool = require('../tools/shared-playback-cache/windows-diagnostics.cjs');
function fixture(t, source) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-bounded-tap-')));
  t.after(() => fs.rmSync(root, {recursive: true, force: true})); fs.mkdirSync(path.join(root, 'tests'));
  fs.writeFileSync(path.join(root, 'tests/owned.test.cjs'), source);
  return {repo: root, file: 'tests/owned.test.cjs', output: path.join(root, 'owned.tap'), echo: false};
}
test('bounded diagnostics preserve an actual failed assertion and stack, with a nonzero result', async t => {
  const options = fixture(t, "const t=require('node:test'),a=require('node:assert/strict');t('owned',()=>a.equal(1,2,'first-real-stack'));\n");
  const result = await tool.runFile({...options, timeoutMs: 3000});
  const tap = fs.readFileSync(options.output, 'utf8');
  assert.equal(result.status, 'FAIL'); assert.equal(result.code, 1); assert.equal(result.timedOut, false);
  assert.match(tap, /first-real-stack/); assert.match(tap, /ERR_ASSERTION/); assert.match(tap, /stack:/);
});
test('a leaked event-loop handle remains a failure after the fixed owned deadline', async t => {
  const options = fixture(t, "const t=require('node:test');t('owned',()=>{});setInterval(()=>{},100);\n");
  const result = await tool.runFile({...options, timeoutMs: 300});
  assert.equal(result.status, 'FAIL'); assert.equal(result.timedOut, true); assert.equal(result.streamsClosed, true);
  assert.match(result.cleanupAssessment, /DESCENDANTS_NOT_INSPECTED/); assert.ok(result.elapsedMs < 2500);
});
test('clean file completion is required and foreign executable paths are refused', async t => {
  const options = fixture(t, "const t=require('node:test');t('owned',()=>{});\n");
  const result = await tool.runFile({...options, timeoutMs: 3000});
  assert.equal(result.status, 'PASS'); assert.equal(result.code, 0);
  await assert.rejects(tool.runFile({...options, file: '../foreign.cjs'}), /owned-path-required/);
});
