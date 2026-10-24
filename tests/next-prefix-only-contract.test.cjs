'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const {temporaryRoot} = require('./helpers/range-fixture-root.cjs');
const {createCache} = require('../src/electronapp/enhanced/playback-range-cache');
const {createSession} = require('../src/electronapp/enhanced/playback-range-session');
const policy = require('../src/electronapp/enhanced/playback-range-policy');

test('ordinary next-only policy keeps all confirmed choices and defaults without resource prompts', () => {
    assert.deepEqual(policy.selection(), {progressPercent: 70, preloadMB: 300, prefetchBytes: 300000000});
    for (const progressPercent of [50, 60, 70, 80, 90]) for (const preloadMB of [100, 300, 500]) {
        assert.equal(policy.selection({progressPercent, preloadMB}).prefetchBytes, preloadMB * 1000000);
    }
    assert.throws(() => policy.selection({progressPercent: 75}));
    assert.throws(() => policy.selection({preloadMB: 200}));
});

test('a legacy persistence policy cannot create a store through the integrated next-only entry', async () => {
    const parent = temporaryRoot('ete-next-only-refusal-'), root = path.join(parent, 'must-not-create');
    try {
        const config = {kind: 'legacy-range-trial', root, maxBytes: 100000000, minFreeBytes: 0, timeoutMs: 1000};
        await assert.rejects(createCache(config), /next-prefix-required/);
        assert.throws(() => createSession({config}), /next-prefix-required/);
        assert.equal(fs.existsSync(root), false);
    } finally {fs.rmSync(parent, {recursive: true, force: true});}
});

test('integrated next-only root still rejects a real junction/symlink before writing owner or media', async () => {
    const parent = temporaryRoot('ete-next-only-alias-'), target = path.join(parent, 'physical'), alias = path.join(parent, 'alias');
    try {
        fs.mkdirSync(target);
        fs.symlinkSync(target, alias, process.platform === 'win32' ? 'junction' : 'dir');
        await assert.rejects(createCache({kind: 'next-prefix', root: alias, preloadMB: 300, timeoutMs: 1000}), /prefix-root-redirected/);
        assert.deepEqual(fs.readdirSync(target), []);
    } finally {fs.rmSync(parent, {recursive: true, force: true});}
});
