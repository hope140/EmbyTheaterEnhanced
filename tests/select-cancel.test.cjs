'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const patcher = require('../tools/patch-select-cancel.cjs');

test('marks only the unique native single-select close rejection and consumes only that marker', () => {
    const actionSheet = 'head:Promise.reject()})})}).then(resolve,reject)tail';
    const select = 'head}(select,value)})}function getLabeltail';

    assert.equal(
        patcher.patchActionSheet(actionSheet),
        'head:Promise.reject({code:"ETE_ACTIONSHEET_CANCELLED"})})})}).then(resolve,reject)tail'
    );
    assert.equal(
        patcher.patchSelect(select),
        'head}(select,value)},function(error){if(!error||error.code!=="ETE_ACTIONSHEET_CANCELLED")throw error})}function getLabeltail'
    );
});

test('fails closed when either generator anchor is missing or duplicated', () => {
    const actionSheetAnchor = ':Promise.reject()})})}).then(resolve,reject)';
    const selectAnchor = '}(select,value)})}function getLabel';

    assert.throws(() => patcher.patchActionSheet('no close anchor'), /contract mismatch/);
    assert.throws(() => patcher.patchActionSheet(actionSheetAnchor + actionSheetAnchor), /contract mismatch/);
    assert.throws(() => patcher.patchSelect('no select anchor'), /contract mismatch/);
    assert.throws(() => patcher.patchSelect(selectAnchor + selectAnchor), /contract mismatch/);
});
