'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {patchStartup} = require('../tools/patch-startup.cjs');

const repoRoot = path.resolve(__dirname, '..');

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function fixture() {
    return '<!doctype html>\r\n' +
        '<html><head><style>\r\n' +
        '        .app-splash {\r\n' +
        '            background-image: url(modules/themes/logo.png);\r\n' +
        '            background-position: center top;\r\n' +
        '            background-repeat: no-repeat;\r\n' +
        '            background-size: contain;\r\n' +
        '            position: fixed;\r\n' +
        '            top: 30%;\r\n' +
        '            left: 30%;\r\n' +
        '            right: 30%;\r\n' +
        '            height: 20%;\r\n' +
        '            contain: strict;\r\n' +
        '            content-visibility: auto;\r\n' +
        '        }\r\n' +
        '        @media (orientation: landscape) {\r\n\r\n' +
        '            .app-splash {\r\n' +
        '                left: 37.5%;\r\n' +
        '                right: 37.5%;\r\n' +
        '            }\r\n' +
        '        }\r\n' +
        '        .hide { display: none !important; }\r\n' +
        '    </style></head>\r\n' +
        '<body class="mainAnimatedPages"><div class="app-splash"></div>\r\n' +
        '<script src="apploader.js" defer></script></body></html>\r\n';
}

test('startup transform changes only the frozen splash CSS anchors', () => {
    const base = fixture();
    const transformed = patchStartup(base);
    const expected = base
        .replace('background-image: url(modules/themes/logo.png);',
            'background-image: url(../enhanced/startup.svg);')
        .replace('left: 30%;\r\n            right: 30%;',
            'left: 50%;\r\n            width: 80%;\r\n            max-width: 560px;\r\n            transform: translateX(-50%);')
        .replace('        @media (orientation: landscape) {\r\n\r\n            .app-splash {\r\n                left: 37.5%;\r\n                right: 37.5%;\r\n            }\r\n        }\r\n', '');

    assert.equal(transformed, expected);
    assert.equal(transformed.includes('apploader.js'), true);
    assert.equal(transformed.includes('<div class="app-splash"></div>'), true);
    assert.equal(transformed.includes('orientation: landscape'), false);
    assert.equal(transformed.includes('right: 30%;'), false);
});

test('startup transform rejects absent or repeated source anchors', () => {
    const base = fixture();
    const cases = [
        base.replace('modules/themes/logo.png', 'unknown/logo.png'),
        base.replace('background-image: url(modules/themes/logo.png);',
            'background-image: url(modules/themes/logo.png);\r\n            background-image: url(modules/themes/logo.png);'),
        base.replace('left: 30%;\r\n            right: 30%;', 'left: 31%;\r\n            right: 30%;'),
        base.replace('left: 30%;\r\n            right: 30%;',
            'left: 30%;\r\n            right: 30%;\r\n            left: 30%;\r\n            right: 30%;'),
        base.replace('        @media (orientation: landscape) {',
            '        @media (orientation: landscape) {\r\n\r\n            .app-splash {\r\n                left: 37.5%;\r\n                right: 37.5%;\r\n            }\r\n        }\r\n        @media (orientation: landscape) {')
    ];
    for (const input of cases) assert.throws(() => patchStartup(input), /Startup source contract mismatch/);
});

test('startup transform rejects a second application', () => {
    const once = patchStartup(fixture());
    assert.throws(() => patchStartup(once), /Startup source contract mismatch/);
});

test('startup SVG embeds the exact original PNG and has no active or remote content', () => {
    const svg = fs.readFileSync(path.join(repoRoot, 'src/electronapp/enhanced/startup.svg'), 'utf8');
    const png = fs.readFileSync(path.join(repoRoot, 'src/electronapp/logowhite.png'));
    const embedded = svg.match(/<image\b[^>]*href="data:image\/png;base64,([A-Za-z0-9+/=]+)"\s*\/>/);

    assert.ok(embedded, 'SVG must contain one embedded PNG image');
    assert.deepEqual(Buffer.from(embedded[1], 'base64'), png);
    assert.match(svg, /<title[^>]*>Emby Theater Enhanced<\/title>/);
    assert.match(svg, />THEATER ENHANCED<\/text>/);
    assert.equal(sha256(Buffer.from(embedded[1], 'base64')), sha256(png));
    assert.doesNotMatch(svg, /<\s*script\b|<\s*foreignObject\b|\bon[a-z]+\s*=|javascript:|url\(\s*https?:\/\//i);
    assert.deepEqual([...svg.matchAll(/\b(?:xlink:)?href="([^"]+)"/g)].map(match => match[1]),
        [embedded[0].match(/href="([^"]+)"/)[1]]);
    assert.equal((svg.match(/data:image\/png;base64,/g) || []).length, 1);
});
