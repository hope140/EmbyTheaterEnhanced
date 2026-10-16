'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const lifecycle = require('../tools/patch-item-lifecycle.cjs');

function fixture() {
    return [
        '  function startDataLoad(instance) {',
        '      onDataFetched.bind(instance),',
        '      function (err) {',
        '  function getItemWithMediaSource(instance, apiClient) {',
        '    })(instance, apiClient).then(function (item) {',
        '      var playbackMediaSourcesPromise',
        '    instance.dataPromise = Promise.all([getItemWithMediaSource(instance, apiClient), apiClient.getCurrentUser()]).then(',
        '  function onDataFetched(responses) {',
        '    var itemInfo',
        '      Promise.all(detailMainContainer).then(function () {',
        '        return (',
        '      BaseView.prototype.onBeginResume.apply(this, arguments), startDataLoad(this);',
        '      BaseView.prototype.onPause.apply(this, arguments);',
        '    (ItemPage.prototype.destroy = function () {',
        '      instance.dataPromise.then(function (responses) {',
        '    connectionManager',
        '      .getApiClient(item.ServerId)',
        '        renderTrackSelections(page, instance, item, user, forceReload);',
        '      });',
        '    var select = page.querySelector(".selectSource");',
        '      var renderAdminFields = user.Policy.IsAdministrator,',
        '          updateTrackSelectionsFocusState(instance, page));',
        '    });',
        '    );',
        '  }',
        '  function playCurrentItem(instance, mode) {'
    ].join('\n');
}

test('patches the minimum lifecycle contract and rejects missing or duplicate anchors', () => {
    const source = fixture();
    const output = lifecycle.patchItemLifecycle(source);
    assert.match(output, /function isCurrentDetail\(instance, epoch, view\)/);
    assert.match(output, /consumeDetailReload\(instance, reloadAllData\)/);
    assert.match(output, /this\._eteDetailActive = false/);
    assert.match(output, /instance\.dataPromise\.catch\(onPromiseFailure\)/);
    assert.equal(source.includes('isCurrentDetail'), false, 'input fixture remains unchanged');

    const missing = source.replace('    var select = page.querySelector(".selectSource");\n', '');
    assert.throws(() => lifecycle.patchItemLifecycle(missing), /Item lifecycle source contract mismatch/);

    const duplicate = source + '\n  function startDataLoad(instance) {';
    assert.throws(() => lifecycle.patchItemLifecycle(duplicate), /Item lifecycle source contract mismatch/);
    assert.ok(duplicate.endsWith('  function startDataLoad(instance) {'), 'duplicate fixture remains unchanged');
});
