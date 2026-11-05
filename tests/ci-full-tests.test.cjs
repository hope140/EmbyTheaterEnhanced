'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const runner = require('../tools/ci-full-tests.cjs');
const {summarize} = require('../tools/ci-test-timing-summary.cjs');

test('full discovery is an exact partition, with only reviewed suites parallel and new suites serial', () => {
    const files = fs.readdirSync(path.join(__dirname)).filter(f => f.endsWith('.test.cjs')).sort().map(f => 'tests/' + f);
    for (const mode of ['serial','isolated']) {
        const groups = runner.plan(files,mode);
        assert.deepEqual(groups.flatMap(g => g.files).sort(), files);
        assert.deepEqual(groups.filter(g => g.concurrency > 1).flatMap(g => g.files), mode === 'serial' ? [] : runner.ISOLATED);
        assert.ok(groups.find(g => g.concurrency === 1).files.includes('tests/ci-full-tests.test.cjs'));
    }
    assert.throws(() => runner.plan(files,'typo'));
    assert.throws(() => runner.plan([...files,files[0]],'isolated'));
    assert.throws(() => runner.plan(files.filter(f => f !== runner.ISOLATED[0]),'serial'));
    assert.throws(() => runner.plan([],'serial'));
});
function tap(failed = false) {
    return `TAP version 13\n# Subtest: synthetic\n${failed ? 'not ok' : 'ok'} 1 - synthetic\n  ---\n  duration_ms: 2\n  ...\n1..1\n# tests 1\n# suites 0\n# pass ${failed ? 0 : 1}\n# fail ${failed ? 1 : 0}\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 3\n`;
}
test('combined TAP keeps cases, failures and one complete summary without accepting incomplete logs', () => {
    const output = runner.combine([tap(),tap(true)]);
    const result = summarize(output);
    assert.equal(result.totals.tests,2);
    assert.equal(result.totals.pass,1);
    assert.equal(result.totals.fail,1);
    assert.equal(result.topLevelCases,2);
    assert.match(output,/not ok 2 - synthetic/);
    assert.match(output,/1\.\.2/);
    assert.equal((output.match(/^# tests /gm)||[]).length,1);
    assert.throws(() => runner.combine([tap(), 'TAP version 13\n']));
    assert.throws(() => runner.combine([tap()+'# tests 1\n']));
});
test('real child failures remain failures and all groups run, with exact aggregated counts and exclusive logs', async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(),'ete-full-runner-'));
    t.after(() => fs.rmSync(root,{recursive:true,force:true}));
    fs.mkdirSync(path.join(root,'tests'));
    for (const f of runner.ISOLATED) fs.writeFileSync(path.join(root,f), "require('node:test')('isolated fixture',()=>{});\n");
    fs.writeFileSync(path.join(root,runner.ISOLATED[0]), "require('node:test')('expected fixture failure',()=>{throw Error('synthetic');});\n");
    fs.writeFileSync(path.join(root,'tests/extra.test.cjs'), "require('node:test')('serial still runs',()=>{});\n");
    const output = path.join(root,'combined.tap');
    const code = await runner.main(root,'isolated',output);
    assert.notEqual(code,0);
    const totals = summarize(fs.readFileSync(output,'utf8')).totals;
    assert.equal(totals.tests,5);assert.equal(totals.pass,4);assert.equal(totals.fail,1);
    const receipt = JSON.parse(fs.readFileSync(output+'.plan.json'));
    assert.equal(receipt.files,5);assert.match(receipt.selectionSha256,/^[a-f0-9]{64}$/);
    await assert.rejects(runner.main(root,'isolated',output),/Preserve existing/);
    const success = path.join(root,'success.tap');
    fs.writeFileSync(path.join(root,runner.ISOLATED[0]), "require('node:test')('fixed fixture',()=>{});\n");
    assert.equal(await runner.main(root,'serial',success),0);
    assert.equal(summarize(fs.readFileSync(success,'utf8')).totals.pass,5);
});
