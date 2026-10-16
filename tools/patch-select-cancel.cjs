'use strict';

function once(text, before, after) {
    if (typeof text !== 'string' || text.split(before).length !== 2) {
        throw new Error('Select cancellation source contract mismatch.');
    }
    return text.replace(before, after);
}

function patchActionSheet(text) {
    // Mark only the native no-selection close branch. Fetch/render errors retain
    // their original rejection identity; multi-select close/commit stays native.
    return once(text, ':Promise.reject()})})}).then(resolve,reject)',
        ':Promise.reject({code:"ETE_ACTIONSHEET_CANCELLED"})})})}).then(resolve,reject)');
}

function patchSelect(text) {
    return once(text, '}(select,value)})}function getLabel',
        '}(select,value)},function(error){if(!error||error.code!=="ETE_ACTIONSHEET_CANCELLED")throw error})}function getLabel');
}

module.exports = {patchActionSheet, patchSelect};
