'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const patcher = require('../tools/patch-custom-css-js.cjs');

function sourceFixture(lineEnding) {
    return [
        'define([',
        '  "events",',
        '  "connectionManager",',
        '], function (',
        '  events,',
        '  connectionManager,',
        '  ) {',
        '    "use strict";',
        '    function loadJS(name, content, source) {',
        '      new Function(content)();',
        '    }',
        '    function loadCode(custom, type, source) {',
        '      if (type === "css") {',
        '        custom.forEach(item => loadCss(item.name, item.content, source));',
        '      } else if (type === "js") {',
        '        custom.forEach(item => loadJS(item.name, item.content, source));',
        '      }',
        '    }',
        '    function getCustom(type, config) {',
        '      let customServerConfig = localStorage.getItem("customjsServerConfig_" + serverId);',
        '      let customLocal = localStorage.getItem("customjsLocal");',
        '      return [customServer, customLocal];',
        '    }',
        '    function loadConfiguration() {',
        '      if (!window.isCustomCssJSLoad) {',
        '          let [customjsServer, customjsLocal] = getCustom("js", config);',
        '          let [customcssServer, customcssLocal] = getCustom("css", config);',
        '          loadCode(customcssServer, "css", "Server");',
        '          loadCode(customcssLocal, "css", "Local");',
        '          loadCode(customjsServer, "js", "Server");',
        '          loadCode(customjsLocal, "js", "Local");',
        '      }',
        '    }',
        '    function reload() {',
        '    }',
        '  });'
    ].join(lineEnding);
}

test('blocks JavaScript execution while preserving CSS and stored selections', () => {
    const output = patcher.patchText(sourceFixture('\n'));

    assert.doesNotMatch(output, /\b(?:new\s+Function|eval)\s*\(/);
    assert.match(output, /"toast"/);
    assert.match(output, /Saved scripts remain inactive/);
    assert.match(output, /localStorage\.getItem\("customjsServerConfig_"/);
    assert.match(output, /loadCode\(customcssServer, "css", "Server"\);/);
    assert.match(output, /loadCode\(customcssLocal, "css", "Local"\);/);
    assert.match(output, /loadCode\(customjsServer, "js", "Server"\);/);
});

test('preserves CRLF input and isolates malformed JavaScript preferences from CSS loading', () => {
    const output = patcher.patchText(sourceFixture('\r\n'));

    assert.equal(output.includes('\r\n'), true);
    assert.equal(output.replace(/\r\n/g, '').includes('\n'), false);
    const jsError = output.indexOf('Custom JavaScript preferences could not be read; existing values were retained.');
    const cssLoad = output.indexOf('loadCode(customcssServer, "css", "Server");');
    assert.notEqual(jsError, -1);
    assert.ok(cssLoad > jsError);
    assert.ok(output.indexOf('window.isCustomCssJSLoad = true;') > cssLoad);
    assert.match(output, /showCustomJavaScriptDisabledNotice\(\);/);
});

test('fails closed when the locked source structure is ambiguous', () => {
    const missingDependency = sourceFixture('\n').replace('"connectionManager",', '"other",');
    const duplicateJsFunction = sourceFixture('\n').replace(
        '    function loadCode(custom, type, source) {',
        '    function loadJS(name, content, source) {\n    }\n    function loadCode(custom, type, source) {'
    );

    assert.throws(() => patcher.patchText(missingDependency), /toast dependency/);
    assert.throws(() => patcher.patchText(duplicateJsFunction), /JavaScript execution function/);
});
