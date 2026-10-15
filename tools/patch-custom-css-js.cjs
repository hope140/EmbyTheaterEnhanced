'use strict';

function replaceUnique(source, original, replacement, label) {
    const index = source.indexOf(original);
    if (index === -1 || source.indexOf(original, index + original.length) !== -1) {
        throw new Error('CustomCssJS source contract mismatch: ' + label);
    }
    return source.slice(0, index) + replacement + source.slice(index + original.length);
}

function replaceFunction(source, startToken, endToken, replacement, label) {
    const startIndex = source.indexOf(startToken);
    const endIndex = startIndex === -1 ? -1 : source.indexOf(endToken, startIndex + startToken.length);
    if (startIndex === -1 || endIndex === -1 ||
        source.indexOf(startToken, startIndex + startToken.length) !== -1 ||
        source.indexOf(endToken, endIndex + endToken.length) !== -1) {
        throw new Error('CustomCssJS source contract mismatch: ' + label);
    }
    const lineEnding = source.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
    return source.slice(0, startIndex) + replacement + lineEnding + source.slice(endIndex);
}

function patchText(value) {
    if (typeof value !== 'string') {
        throw new TypeError('CustomCssJS source must be text.');
    }
    const lineEnding = value.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
    let output = value;
    output = replaceUnique(
        output,
        ['  "connectionManager",', '], function ('].join(lineEnding),
        ['  "connectionManager",', '  "toast",', '], function ('].join(lineEnding),
        'toast dependency'
    );
    output = replaceUnique(
        output,
        ['  connectionManager,', '  ) {'].join(lineEnding),
        ['  connectionManager,', '  toast,', '  ) {'].join(lineEnding),
        'toast argument'
    );

    const disabledJavaScriptFunctions = [
        '    function showCustomJavaScriptDisabledNotice() {',
        '      if (window.isCustomJavaScriptDisabledNoticeShown) return;',
        '      window.isCustomJavaScriptDisabledNoticeShown = true;',
        '      try {',
        '        const notification = toast("Custom JavaScript is disabled for security. Saved scripts remain inactive; CSS customization still works. 自定义 JavaScript 已停用，原有脚本配置保留但不会执行，CSS 定制仍可用。");',
        '        if (notification && typeof notification.catch === "function") {',
        '          notification.catch(function () {});',
        '        }',
        '      } catch (_error) {',
        '        // The notice is best-effort; JavaScript remains disabled.',
        '      }',
        '    }',
        '',
        '    function loadJS() {',
        '      showCustomJavaScriptDisabledNotice();',
        '      console.warn("Custom JavaScript remains stored but inactive.");',
        '    }'
    ].join(lineEnding);
    output = replaceFunction(
        output,
        '    function loadJS(name, content, source) {',
        '    function loadCode(custom, type, source) {',
        disabledJavaScriptFunctions,
        'JavaScript execution function'
    );

    const isolatedConfiguration = [
        '    function loadConfiguration() {',
        '      ApiClient.getJSON(ApiClient.getUrl("CustomCssJS/Scripts", {})).then((config) => {',
        '        if (!window.isCustomCssJSLoad) {',
        '          try {',
        '            let customjsServer = [];',
        '            let customjsLocal = [];',
        '            try {',
        '              [customjsServer, customjsLocal] = getCustom("js", config);',
        '            } catch (_error) {',
        '              console.error("Custom JavaScript preferences could not be read; existing values were retained.");',
        '              showCustomJavaScriptDisabledNotice();',
        '            }',
        '            let [customcssServer, customcssLocal] = getCustom("css", config);',
        '            loadCode(customcssServer, "css", "Server");',
        '            loadCode(customcssLocal, "css", "Local");',
        '            loadCode(customjsServer, "js", "Server");',
        '            loadCode(customjsLocal, "js", "Local");',
        '            window.isCustomCssJSLoad = true;',
        '          } catch (_error) {',
        '            window.isCustomCssJSLoad = false;',
        '            console.error("CustomCssJS configuration could not be loaded.");',
        '          }',
        '        }',
        '      }, () => {',
        '        if (window.isCustomCssJSLoad) {',
        '          reload();',
        '        }',
        '      });',
        '    }'
    ].join(lineEnding);
    output = replaceFunction(
        output,
        '    function loadConfiguration() {',
        '    function reload() {',
        isolatedConfiguration,
        'configuration load isolation'
    );

    if (/\b(?:new\s+Function|eval)\s*\(/.test(output)) {
        throw new Error('CustomCssJS output still contains a dynamic JavaScript execution sink.');
    }
    for (const cssCall of [
        'loadCode(customcssServer, "css", "Server");',
        'loadCode(customcssLocal, "css", "Local");'
    ]) {
        if (!output.includes(cssCall)) {
            throw new Error('CustomCssJS output lost CSS customization.');
        }
    }
    return output;
}

module.exports = {patchText};
