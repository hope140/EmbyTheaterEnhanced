'use strict';

const crypto = require('node:crypto');

function once(source, before, after) {
    if (typeof source !== 'string' || source.split(before).length !== 2) {
        throw new Error('VideoOSD lifecycle source contract mismatch.');
    }
    return source.replace(before, after);
}

function patchThumbnailPreview(source) {
    const first = source.indexOf('    var lastPointerEvent = 0;');
    const end = source.indexOf('    function getThumbnailBubbleHtml(', first);
    if (first < 0 || end < first) throw new Error('VideoOSD thumbnail anchors mismatch.');
    let output = once(source, source.slice(first, end), `    var lastPointerEvent = 0;
    var thumbnailGeneration = 0, thumbnailOwner = null, thumbnailRequest = null;
    function thumbnailContext() {
      try {
        var player = self.currentPlayer, item = self.currentItem;
        if (self.paused || !player || !item || !item.Id) return null;
        var playing = _playbackmanager.default.currentItem(player);
        if (!playing || playing.Id !== item.Id || playing.ServerId !== item.ServerId) return null;
        var api = _connectionmanager.default.getApiClient(item.ServerId);
        if (!api || !api.getCurrentUserId()) return null;
        var media = _playbackmanager.default.currentMediaSource(player);
        return {player: player, itemId: item.Id, serverId: item.ServerId, api: api,
          userId: api.getCurrentUserId(), address: api.serverAddress(), epoch: api._identityEpoch || 0,
          mediaSourceId: media && media.Id,
          sessionId: _playbackmanager.default.playSessionId(player)};
      } catch (_) { return null; }
    }
    function sameThumbnailContext(a, b) {
      return !!a && !!b && a.player === b.player && a.itemId === b.itemId &&
        a.serverId === b.serverId && a.api === b.api && a.userId === b.userId &&
        a.address === b.address && a.epoch === b.epoch &&
        a.mediaSourceId === b.mediaSourceId && a.sessionId === b.sessionId;
    }
    function clearThumbnailImage() {
      var slider = self.nowPlayingPositionSlider;
      var bubble = slider && slider.getBubbleElement();
      if (!bubble) return;
      bubble.style.backgroundImage = "";
      bubble.classList.remove("chapterThumbImageContainer", "chapterThumbImageContainer-fourthree",
        "chapterThumbImageContainer-noimg", "chapterThumbImageContainer-tv");
    }
    self.clearThumbnailPreview = function () {
      thumbnailGeneration++;
      var request = thumbnailRequest;
      thumbnailRequest = thumbnailOwner = null;
      currentItemThumbnails = currentItemThumbnailsPromise = null;
      clearThumbnailImage();
      if (request) request.controller.abort();
    };
    self.validateThumbnailPreview = function () {
      if (thumbnailOwner && !sameThumbnailContext(thumbnailOwner, thumbnailContext())) self.clearThumbnailPreview();
    };
    function refreshThumbnailsIfNeeded(item, mediaSourceId, apiClient, maxThumbnailWidth) {
      var context = thumbnailContext();
      if (thumbnailOwner && !sameThumbnailContext(thumbnailOwner, context)) self.clearThumbnailPreview();
      if (!context || !mediaSourceId || "Audio" === item.MediaType) return;
      thumbnailOwner = context;
      if (currentItemThumbnails || currentItemThumbnailsPromise) return;
      var request = {controller: new AbortController(), generation: thumbnailGeneration};
      thumbnailRequest = request;
      function ownsRequest() {
        return thumbnailRequest === request && request.generation === thumbnailGeneration &&
          sameThumbnailContext(context, thumbnailContext());
      }
      function retireStaleRequest() {
        // An old completion must never clear the newer request's slot.
        if (thumbnailRequest === request) self.clearThumbnailPreview();
      }
      currentItemThumbnailsPromise = Promise.resolve().then(function () {
        if (!ownsRequest()) return;
        return apiClient.getThumbnails(item.Id, {MediaSourceId: mediaSourceId, Width: maxThumbnailWidth}, request.controller.signal);
      }).then(function (result) {
        if (!ownsRequest()) return retireStaleRequest();
        thumbnailRequest = null;
        currentItemThumbnailsPromise = null;
        currentItemThumbnails = result || {Thumbnails: []};
      }, function (error) {
        if (!ownsRequest()) return retireStaleRequest();
        thumbnailRequest = null;
        currentItemThumbnailsPromise = null;
        // Do not retry without a version: the server's default may be another edition.
        if (error && [400, 404, 405, 501].indexOf(error.status) !== -1) currentItemThumbnails = {Thumbnails: []};
      });
    }
`);
    output = once(output, '                    PositionTicks: thumbnail.PositionTicks,',
        '                    PositionTicks: thumbnail.PositionTicks,\n                    MediaSourceId: mediaSourceId,');
    output = once(output, '          (currentItemThumbnails = currentItemThumbnailsPromise = null),\n          itemInfo.displayItem || item);',
        '          itemInfo.displayItem || item);');
    output = once(output, '      if (((self.currentItem = item), (currentItemThumbnails = currentItemThumbnailsPromise = null), !item))',
        '      self.clearThumbnailPreview();\n      currentDisplayChapters = null;\n      var displayGeneration = thumbnailGeneration;\n      self.currentItem = item;\n      var displayContext = thumbnailContext();\n      if (!item)');
    output = once(output, '        })(item).then(updateDisplayItem),', `        })(item).then(function (info) {
          if (displayGeneration === thumbnailGeneration && sameThumbnailContext(displayContext, thumbnailContext())) updateDisplayItem(info);
        }, function () { /* Failed item metadata must not retain another item's chapters. */ }),`);
    output = once(output, '    function onTimeUpdate(e) {\n',
        '    function onTimeUpdate(e) {\n      if (self.validateThumbnailPreview) self.validateThumbnailPreview();\n');
    for (const event of ['onPlaybackStart', 'onPlaybackStopped']) {
        output = once(output, '    function ' + event + '(e, state) {\n',
            '    function ' + event + '(e, state) {\n      if (self.currentPlayer === this && self.clearThumbnailPreview) self.clearThumbnailPreview();\n');
    }
    output = once(output, '    function releaseCurrentPlayer() {\n',
        '    function releaseCurrentPlayer() {\n      if (self.clearThumbnailPreview) self.clearThumbnailPreview();\n');
    for (const prefix of [
        '(VideoOsd.prototype.pause = function () {\n      this.paused = !0;\n      this.releaseRateKeys();\n',
        '(VideoOsd.prototype.destroy = function () {\n      this._eteRateKeysDestroyed = true;\n      this.releaseRateKeys();\n'
    ]) output = once(output, prefix, prefix + '      if (this.clearThumbnailPreview) this.clearThumbnailPreview();\n');
    output = once(output, '      (self.nowPlayingPositionSlider.getBubbleHtml = function (value) {\n',
        '      (self.nowPlayingPositionSlider.getBubbleHtml = function (value) {\n        self.validateThumbnailPreview();\n');
    output = once(output, '          var apiClient = _connectionmanager.default.getApiClient(value.ServerId),\n            thumbnails = (refreshThumbnailsIfNeeded(value, "", apiClient, 400), currentItemThumbnails),\n            chapters = currentDisplayChapters || [];\n          if (chapters.length) {\n            apiClient = getThumbnailBubbleHtml(apiClient, value.Id, 0, thumbnails, chapters, ms, 400);',
        `          var context = thumbnailContext(),
            apiClient = context && context.api,
            mediaSourceId = context && context.mediaSourceId,
            thumbnails = (refreshThumbnailsIfNeeded(value, mediaSourceId, apiClient, 400), currentItemThumbnails),
            chapters = currentDisplayChapters || [];
          if (context && mediaSourceId && (chapters.length || (thumbnails && (thumbnails.Thumbnails || []).length))) {
            apiClient = getThumbnailBubbleHtml(apiClient, value.Id, mediaSourceId, thumbnails, chapters, ms, 400);`);
    return output;
}

function patchVideoOsd(source) {
    const start = '_dom.default.addEventListener(window, "keydown", function (event)';
    const end = '_dom.default.addEventListener(\n        view,\n        "dblclick"';
    if (typeof source !== 'string' || source.split(start).length !== 2 || source.split(end).length !== 2) {
        throw new Error('VideoOSD lifecycle keyboard anchors mismatch.');
    }
    const begin = source.indexOf(start);
    const finish = source.indexOf(end, begin);
    const block = source.slice(begin, finish);
    if (crypto.createHash('sha256').update(block).digest('hex') !==
        '87afaf30e3dcf0e2d1981b526b8bb122fc0d6efdde9d00d85fa276a8dec92b53') {
        throw new Error('VideoOSD lifecycle keyboard input hash mismatch.');
    }
    // Keep the frozen key table byte-for-byte. Only ownership and cleanup change.
    const keys = block.slice(block.indexOf('var keyMap = {'), block.indexOf('        var handleKeyDown'));
    const replacement = `(function () {
        ${keys.trim()}
        self.clearRateKey = function () {
          var owner = self._eteRateKey;
          self._eteRateKey = null;
          if (owner && owner.timer != null) clearTimeout(owner.timer);
        };
        self.boundRateKeyDown = function (event) {
          if (self.paused || event.repeat || self._eteRateKey || !self.currentPlayer ||
              self.nowPlayingPositionSlider.dragging || !Object.prototype.hasOwnProperty.call(keyMap, event.key)) return;
          var owner = {player: self.currentPlayer, key: event.key, timer: null};
          self._eteRateKey = owner;
          owner.timer = setTimeout(function () {
            owner.timer = null;
            if (self._eteRateKey !== owner || self.paused || self.currentPlayer !== owner.player) return;
            var setting = keyMap[owner.key];
            var noScrollYElement = document.querySelector(".noScrollY:root");
            if (noScrollYElement) noScrollYElement.style.width = "auto";
            _toast.default(setting.message);
            _playbackmanager.default.setPlaybackRate(setting.rate, owner.player);
          }, 500);
        };
        self.boundRateKeyUp = function (event) {
          if (self._eteRateKey && self._eteRateKey.key === event.key) self.clearRateKey();
        };
        self.bindRateKeys = function () {
          if (self._eteRateKeysBound || self._eteRateKeysDestroyed) return;
          self._eteRateKeysBound = true;
          _dom.default.addEventListener(window, "keydown", self.boundRateKeyDown);
          _dom.default.addEventListener(window, "keyup", self.boundRateKeyUp);
        };
        self.releaseRateKeys = function () {
          self.clearRateKey();
          if (!self._eteRateKeysBound) return;
          self._eteRateKeysBound = false;
          _dom.default.removeEventListener(window, "keydown", self.boundRateKeyDown);
          _dom.default.removeEventListener(window, "keyup", self.boundRateKeyUp);
        };
      })(),
      `;
    let output = source.slice(0, begin) + replacement + source.slice(finish);
    output = once(output, '    function onPlaybackStart(e, state) {\n',
        '    function onPlaybackStart(e, state) {\n      if (self.currentPlayer === this && self.clearRateKey) self.clearRateKey();\n');
    output = once(output, '    function onPlaybackStopped(e, state) {\n',
        '    function onPlaybackStopped(e, state) {\n      if (self.currentPlayer === this && self.clearRateKey) self.clearRateKey();\n');
    output = once(output, '    function releaseCurrentPlayer() {\n',
        '    function releaseCurrentPlayer() {\n      if (self.clearRateKey) self.clearRateKey();\n');
    output = once(output, '(VideoOsd.prototype.resume = function (options) {\n      this.paused = !1;',
        '(VideoOsd.prototype.resume = function (options) {\n      this.paused = !1;\n      this.bindRateKeys();');
    output = once(output, '(VideoOsd.prototype.pause = function () {\n      this.paused = !0;',
        '(VideoOsd.prototype.pause = function () {\n      this.paused = !0;\n      this.releaseRateKeys();');
    output = once(output, '(VideoOsd.prototype.destroy = function () {\n',
        '(VideoOsd.prototype.destroy = function () {\n      this._eteRateKeysDestroyed = true;\n      this.releaseRateKeys();\n');
    return patchThumbnailPreview(output);
}

module.exports = {patchVideoOsd};
