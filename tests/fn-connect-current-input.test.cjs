'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const input = require('../prototypes/fn-connect/client/electron-input.json');
const product = require('../vendor/electron-runtime-manifest.json');
const policy = require('../prototypes/fn-connect/client/policy.cjs');
test('FN current fixture uses the product pinned runtime rather than the recovered historical runtime', () => {
    assert.equal(input.version, product.version); assert.equal(input.asset, product.archive.name);
    assert.equal(input.url, product.archive.sourceUrl); assert.equal(input.sha256, product.archive.sha256);
    assert.equal(input.checksumSource, product.archive.shasumsUrl); assert.equal(input.executableSha256, product.runtime.electronExeSha256);
    assert.equal(require('../prototypes/fn-connect/client/smoke-report.cjs').expectedVersion, product.version);
});
test('Web entry never silently becomes an API base; an explicitly configured API mount retains its prefix', () => {
    for (const page of ['https://media.example.test/web/index.html', 'https://media.example.test/emby/web/index.html/']) {
        assert.throws(() => policy.config({bootstrapUrl: 'https://nas.example.test/', embyUrl: page}, 'live'),
            error => error.code === 'API_BASE_REQUIRES_REVIEW');
    }
    const p = policy.config({bootstrapUrl: 'https://nas.example.test/', embyUrl: 'https://media.example.test/emby/'}, 'live');
    assert.equal(policy.target(p, p.probePath, 'live').href, 'https://media.example.test/emby/System/Info/Public');
});
