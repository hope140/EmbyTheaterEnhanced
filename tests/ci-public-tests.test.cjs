'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const runner = require('../tools/ci-public-tests.cjs');

test('public test set discovers every test file and excludes only the six material-required files', () => {
    const discovered = runner.discoverTests();
    const selected = runner.selectTests(discovered);
    assert.equal(discovered.length, selected.length + 6);
    assert.deepEqual(discovered.filter(file => !selected.includes(file)), runner.MATERIAL_REQUIRED.slice().sort());
    assert.ok(selected.includes('tests/ci-public-tests.test.cjs'));
    assert.ok(selected.includes('tests/ci-secret-scan.test.cjs'));
});
