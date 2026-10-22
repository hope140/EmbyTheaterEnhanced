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

test('retired startup PNG has only its replaced index consumer; dynamic themes use their own CSS', () => {
    const web = require('../tools/web-snapshot-input.cjs');
    const manifest = web.load(repoRoot), hits = [];
    for (const entry of manifest.files.filter(item => /\.(?:js|css|html|json)$/.test(item.path))) {
        const text = fs.readFileSync(path.join(repoRoot,web.INPUT_ROOT,entry.path),'utf8');
        const references = text.match(/\blogo\.png\b/g) || [];
        if (references.length) hits.push({path:entry.path,count:references.length});
    }
    assert.deepEqual(hits,[{path:'www/index.html',count:1}]);
    const image = fs.readFileSync(path.join(repoRoot,web.INPUT_ROOT,'www/modules/themes/logo.png'));
    assert.equal(image.length,32892);
    assert.equal(sha256(image),'624aa2425d6bee862fd5469e191a2dad928931425e45ee31d006d6e71906c064');
    assert.equal(image.readUInt32BE(16),1238); assert.equal(image.readUInt32BE(20),377);
    assert.equal(image[25],6,'archived PNG uses RGBA');
    const skin = fs.readFileSync(path.join(repoRoot,web.INPUT_ROOT,'www/modules/skinmanager.js'),'utf8');
    assert.ok(skin.includes('(selectedTheme.baseThemeId || selectedTheme.id)'));
    assert.ok(skin.includes('"/theme.css"')); assert.ok(skin.includes('"/theme.json"'));
    assert.doesNotMatch(skin,/logo\.png/);
});

test('clean generated startup resolves the existing transparent ETE SVG and preserves screensaver PNG', t => {
    const web = require('../tools/web-snapshot-input.cjs');
    const overlays = require('../tools/prepare-web-overlays.cjs');
    fs.mkdirSync(path.join(repoRoot,'dist'),{recursive:true});
    const runtime = fs.mkdtempSync(path.join(repoRoot,'dist','retired-startup-logo-'));
    t.after(()=>fs.rmSync(runtime,{recursive:true}));
    const report = web.assemble(repoRoot,runtime);
    assert.equal(report.fileCount,720); assert.equal(report.runtimeFileCount,718);
    overlays.apply(repoRoot,runtime);
    const svgPath=path.join(runtime,'electronapp/enhanced/startup.svg');
    fs.mkdirSync(path.dirname(svgPath),{recursive:true});
    fs.copyFileSync(path.join(repoRoot,'src/electronapp/enhanced/startup.svg'),svgPath);
    const indexPath=path.join(runtime,'electronapp/www/index.html'),html=fs.readFileSync(indexPath,'utf8');
    assert.doesNotMatch(html,/modules\/themes\/logo\.png/);
    const target=html.match(/background-image:\s*url\((\.\.\/enhanced\/startup\.svg)\)/);
    assert.ok(target); assert.equal(path.resolve(path.dirname(indexPath),target[1]),svgPath);
    assert.equal(fs.existsSync(svgPath),true);
    assert.equal(fs.existsSync(path.join(runtime,'electronapp/www/modules/themes/logo.png')),false);
    for(const value of ['background-size: contain;','background-position: center top;','width: 80%;','max-width: 560px;','height: 20%;','transform: translateX(-50%);']) assert.ok(html.includes(value),value);
    const svg=fs.readFileSync(svgPath,'utf8');
    assert.match(svg,/viewBox="0 0 1238 377"/);
    assert.doesNotMatch(svg,/<rect\b|background(?:-color)?\s*:/);
    const png=fs.readFileSync(path.join(repoRoot,'src/electronapp/logowhite.png'));
    let transparent=false;
    for(let at=8;at<png.length;) {
        const size=png.readUInt32BE(at),type=png.subarray(at+4,at+8).toString('ascii');
        if(type==='tRNS') transparent=png.subarray(at+8,at+8+size).includes(0);
        at+=size+12;
    }
    assert.equal(transparent,true,'existing embedded logo retains transparent pixels');
    const screensaver=fs.readFileSync(path.join(runtime,'electronapp/www/modules/logoscreensaver/logowhite.png'));
    assert.equal(sha256(screensaver),'1bb70b932f1055b7f0fb5c7423539c4a7824126623ac725e1101c9691e6dc113');
    const screenModule=fs.readFileSync(path.join(runtime,'electronapp/www/modules/logoscreensaver/plugin.js'),'utf8');
    assert.ok(screenModule.includes('"logowhite.png"'));
});
