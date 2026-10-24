'use strict';

function patchItemLifecycle(value) {
    if (typeof value !== 'string') throw new TypeError('Item lifecycle source must be text.');
    const eol = value.includes('\r\n') ? '\r\n' : '\n';
    let output = value;
    function replace(before, after) {
        before = before.replace(/\n/g, eol);
        after = after.replace(/\n/g, eol);
        const index = output.indexOf(before);
        if (index < 0 || output.indexOf(before, index + before.length) >= 0) {
            throw new Error('Item lifecycle source contract mismatch: ' + before.slice(0, 75));
        }
        output = output.slice(0, index) + after + output.slice(index + before.length);
    }
    replace('  function startDataLoad(instance) {', `  // Only the current detail transaction may update UI or global focus/backdrop.
  function isCurrentDetail(instance, epoch, view) {
    return instance._eteDetailActive && instance._eteDetailEpoch === epoch &&
      instance.view === view && !!view;
  }
  function retiredDetail() {
    var error = new Error("Detail transaction retired");
    error.name = "AbortError";
    return error;
  }
  function startDataLoad(instance) {
    var epoch = instance._eteDetailEpoch = (instance._eteDetailEpoch || 0) + 1,
      view = instance.view;`);
    replace('      onDataFetched.bind(instance),\n      function (err) {', `      function (responses) {
        if (!isCurrentDetail(instance, epoch, view)) throw retiredDetail();
        return onDataFetched.call(instance, responses);
      },
      function (err) {
        if (!isCurrentDetail(instance, epoch, view)) throw retiredDetail();`);
    replace('  function getItemWithMediaSource(instance, apiClient) {',
        '  function getItemWithMediaSource(instance, apiClient, epoch, detailView) {');
    replace('    })(instance, apiClient).then(function (item) {\n      var playbackMediaSourcesPromise',
        '    })(instance, apiClient).then(function (item) {\n      if (!isCurrentDetail(instance, epoch, detailView)) throw retiredDetail();\n      var playbackMediaSourcesPromise');
    replace('getItemWithMediaSource(instance, apiClient), apiClient.getCurrentUser()',
        'getItemWithMediaSource(instance, apiClient, epoch, view), apiClient.getCurrentUser()');
    // Viewmanager starts loading before onResume; paused alone is not a valid guard.
    replace('      BaseView.prototype.onBeginResume.apply(this, arguments), startDataLoad(this);',
        '      this._eteDetailActive = true;\n      BaseView.prototype.onBeginResume.apply(this, arguments), startDataLoad(this);');
    replace('      BaseView.prototype.onPause.apply(this, arguments);',
        '      this._eteDetailActive = false;\n      this._eteDetailEpoch = (this._eteDetailEpoch || 0) + 1;\n      BaseView.prototype.onPause.apply(this, arguments);');
    replace('    (ItemPage.prototype.destroy = function () {',
        '    (ItemPage.prototype.destroy = function () {\n      this._eteDetailActive = false;\n      this._eteDetailEpoch = (this._eteDetailEpoch || 0) + 1;');
    replace('      instance.dataPromise.then(function (responses) {',
        '      consumeDetailReload(instance, reloadAllData);\n  }\n  function consumeDetailReload(instance, reloadAllData) {\n    var epoch = instance._eteDetailEpoch, detailView = instance.view;\n    instance.dataPromise.then(function (responses) {\n        if (!isCurrentDetail(instance, epoch, detailView)) return;');
    // The original continuation may finish after a pause or a newer refresh.
    replace('  function onDataFetched(responses) {\n    var itemInfo',
        '  function onDataFetched(responses) {\n    var detailOwner = this, detailEpoch = this._eteDetailEpoch, detailView = this.view;\n    var itemInfo');
    replace('      Promise.all(detailMainContainer).then(function () {\n        return (',
        '      Promise.all(detailMainContainer).then(function () {\n        if (!isCurrentDetail(detailOwner, detailEpoch, detailView)) throw retiredDetail();\n        return (');
    replace('    connectionManager\n      .getApiClient(item.ServerId)',
        '    var epoch = instance._eteDetailEpoch;\n    connectionManager\n      .getApiClient(item.ServerId)');
    replace('        renderTrackSelections(page, instance, item, user, forceReload);\n      });',
        '        if (isCurrentDetail(instance, epoch, page)) renderTrackSelections(page, instance, item, user, forceReload);\n      }, onPromiseFailure);');
    replace('    var select = page.querySelector(".selectSource");',
        '    var epoch = instance._eteDetailEpoch;\n    var select = page.querySelector(".selectSource");');
    replace('      var renderAdminFields = user.Policy.IsAdministrator,',
        '      if (!isCurrentDetail(instance, epoch, page)) return;\n      var renderAdminFields = user.Policy.IsAdministrator,');
    replace('          updateTrackSelectionsFocusState(instance, page));\n    });',
        '          updateTrackSelectionsFocusState(instance, page));\n    }, onPromiseFailure);');
    // Never leave the eager load rejection unobserved while view transitions run.
    replace('    );\n  }\n  function playCurrentItem(instance, mode) {',
        '    );\n    instance.dataPromise.catch(onPromiseFailure);\n  }\n  function playCurrentItem(instance, mode) {');
    return output;
}

// Applied after the existing lifecycle transform; the frozen input remains read-only.
function patchDetailCache(value) {
    const eol = value.includes('\r\n') ? '\r\n' : '\n';
    let output = value;
    function once(before, after) {
        before=before.replace(/\n/g,eol);after=after.replace(/\n/g,eol);
        if(output.split(before).length!==2)throw Error('Detail cache source anchor mismatch: '+before.slice(0,60));
        output=output.replace(before,after);
    }
    once('  "baseView",','  "baseView",\n  "ete-detail-page-cache",');
    once('  BaseView\n) {','  BaseView,\n  detailCache\n) {');
    once('    BaseView.apply(this, arguments),', `    BaseView.apply(this, arguments),
      (this.eteDetail = detailCache.default.create(this, {
        play: function(mode) { playCurrentItem(this, mode); }.bind(this),
        retry: function() { startDataLoad(this); consumeDetailReload(this, true); }.bind(this),
        canPlay: function(item) { return playbackManager.canPlay(item); },
        clearBackdrop: function() { backdrop.clear(); }
      })),`);
    once('instance.view === view && !!view;', 'instance.view === view && !!view && (!instance.eteDetail || instance.eteDetail.isCurrent());');
    once('    instance.dataPromise = Promise.all(', '    instance.eteDetail.begin(apiClient);\n    instance.dataPromise = Promise.all(');
    once('apiClient.getCurrentUser()]).then(', 'apiClient.getCurrentUser().then(function(user) { if (isCurrentDetail(instance, epoch, view)) instance.eteDetail.user(user); return user; })]).then(');
    once('    var detailOwner = this, detailEpoch = this._eteDetailEpoch, detailView = this.view;', '    var detailOwner = this, detailEpoch = this._eteDetailEpoch, detailView = this.view;\n    this.eteDetail.ownsBackground();');
    once('      return playbackMediaSourcesPromise.then(function (mediaSources) {', '      return playbackMediaSourcesPromise.then(function (mediaSources) {\n        if (!isCurrentDetail(instance, epoch, detailView)) throw retiredDetail();\n        instance.eteDetail.sources();');
    once('      var playbackMediaSourcesPromise', '      instance.eteDetail.item(item);\n      var playbackMediaSourcesPromise');
    once('      function (err) {\n        if (!isCurrentDetail(instance, epoch, view)) throw retiredDetail();',
        '      async function (err) {\n        if (!isCurrentDetail(instance, epoch, view)) throw retiredDetail();\n        if (await instance.eteDetail.error(err)) throw err;\n        if (!instance._eteDetailActive || instance._eteDetailEpoch !== epoch || instance.view !== view) throw retiredDetail();');
    once('        if (!isCurrentDetail(detailOwner, detailEpoch, detailView)) throw retiredDetail();',
        '        if (!isCurrentDetail(detailOwner, detailEpoch, detailView)) throw retiredDetail();\n        detailOwner.eteDetail.complete();');
    once('  function setNextUpButtonText(instance, page) {', '  function setNextUpButtonText(instance, page) {\n    var nextEpoch=instance._eteDetailEpoch,nextRevision=instance._eteNextUpRevision=(instance._eteNextUpRevision||0)+1;');
    once('      .then(function (result) {\n        var resumeName,', '      .then(function (result) {\n        if(!isCurrentDetail(instance,nextEpoch,page)||instance._eteNextUpRevision!==nextRevision)return;\n        var resumeName,');
    once('resumeInfo.classList.add("hide"));\n      });\n  }\n  function reloadPlayButtons', 'resumeInfo.classList.add("hide"));\n      }, onPromiseFailure);\n  }\n  function reloadPlayButtons');
    once('  function playCurrentItem(instance, mode) {', `  function playCurrentItem(instance, mode) {
    if (MultiSelect.canPlay()) { MultiSelect.play(); return; }
    if (instance.eteDetail && instance.eteDetail.requestPlay(mode, function(item, requestedMode) {
      playbackManager.play({items: [item], startPositionTicks: item.UserData && requestedMode === "resume" ? null : 0});
    })) return;`);
    once('      this._eteDetailActive = false;\n      this._eteDetailEpoch = (this._eteDetailEpoch || 0) + 1;\n      BaseView.prototype.onPause',
        '      this.eteDetail.pause();\n      this._eteDetailActive = false;\n      this._eteDetailEpoch = (this._eteDetailEpoch || 0) + 1;\n      BaseView.prototype.onPause');
    once('    (ItemPage.prototype.destroy = function () {', '    (ItemPage.prototype.destroy = function () {\n      this.eteDetail.dispose();');
    once('        onPlayerChangeFn ||\n          (renderTrackSelectionsWithoutUser', '        onPlayerChangeFn || !this.currentItem ||\n          (renderTrackSelectionsWithoutUser');
    return output;
}
module.exports = {patchItemLifecycle, patchDetailCache};
