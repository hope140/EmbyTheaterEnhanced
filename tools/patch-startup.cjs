'use strict';

function once(text, before, after) {
    if (typeof text !== 'string' || text.split(before).length !== 2) {
        throw new Error('Startup source contract mismatch.');
    }
    return text.replace(before, after);
}

function patchStartup(text) {
    let output = once(text,
        'background-image: url(modules/themes/logo.png);',
        'background-image: url(../enhanced/startup.svg);');
    output = once(output,
        'left: 30%;\r\n            right: 30%;',
        'left: 50%;\r\n            width: 80%;\r\n            max-width: 560px;\r\n            transform: translateX(-50%);');
    // This media rule only changes the former logo width. The bounded width above
    // now covers portrait and landscape without touching loader/ready ownership.
    return once(output,
        '        @media (orientation: landscape) {\r\n\r\n            .app-splash {\r\n                left: 37.5%;\r\n                right: 37.5%;\r\n            }\r\n        }\r\n', '');
}

module.exports = {patchStartup};
