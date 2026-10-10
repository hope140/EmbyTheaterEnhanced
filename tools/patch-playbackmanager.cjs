'use strict';

const fs = require('fs');

const file = process.argv[2];
if (!file) throw new Error('PlaybackManager path is required.');
let source = fs.readFileSync(file, 'utf8');

function replaceOnce(name, before, after) {
    const first = source.indexOf(before);
    if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
        throw new Error(name + ' anchor count mismatch.');
    }
    source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
    'request sequence',
    '    function playInternal(item, playOptions, onPlaybackStartedFn) {\n      return "disc" === item.Container',
    '    function isCurrentEnhancedPlayRequest(playOptions) {\n' +
    '      return !playOptions || !playOptions._etePlayRequestId || playOptions._etePlayRequestId === self._etePlayRequestSequence;\n' +
    '    }\n' +
    '    function playInternal(item, playOptions, onPlaybackStartedFn, capturedRequestId) {\n' +
    '      if (capturedRequestId && capturedRequestId !== self._etePlayRequestSequence) return Promise.resolve();\n' +
    '      // Queue items reuse options; each async request must retain its own identity.\n' +
    '      playOptions = Object.assign({}, playOptions);\n' +
    '      if (!capturedRequestId) self._etePlayRequestSequence = (self._etePlayRequestSequence || 0) + 1;\n' +
    '      playOptions._etePlayRequestId = self._etePlayRequestSequence;\n' +
    '      item.playOptions = playOptions;\n' +
    '      return "disc" === item.Container'
);

replaceOnce(
    'preplay generation check',
    '            .then(function () {\n              playOptions.fullscreen && _loading.default.show();',
    '            .then(function () {\n' +
    '              if (!isCurrentEnhancedPlayRequest(playOptions)) return;\n' +
    '              playOptions.fullscreen && _loading.default.show();'
);

replaceOnce(
    'play failure generation check',
    '            }, onInterceptorRejection)\n            .catch(onUnhandledPlaybackFailure));',
    '            }, onInterceptorRejection)\n' +
    '            .catch(function (error) {\n' +
    '              if (!isCurrentEnhancedPlayRequest(playOptions)) return;\n' +
    '              return onUnhandledPlaybackFailure(error);\n' +
    '            }));'
);

replaceOnce(
    'playAfter generation check',
    '    function playAfterBitrateDetect(maxBitrate, item, playOptions, onPlaybackStartedFn) {\n      var startPosition = playOptions.startPositionTicks,',
    '    function playAfterBitrateDetect(maxBitrate, item, playOptions, onPlaybackStartedFn) {\n' +
    '      if (!isCurrentEnhancedPlayRequest(playOptions)) return Promise.resolve();\n' +
    '      if (self._eteTerminalStop) return self._eteTerminalStop.then(function () {\n' +
    '        return playAfterBitrateDetect(maxBitrate, item, playOptions, onPlaybackStartedFn);\n' +
    '      });\n' +
    '      var startPosition = playOptions.startPositionTicks,'
);

replaceOnce(
    'device profile generation check',
    '          : Promise.all([promise, player.getDeviceProfile(item)]).then(function (responses) {\n              onPlaybackRequested(player, streamInfo);',
    '          : Promise.all([promise, player.getDeviceProfile(item)]).then(function (responses) {\n' +
    '              if (!isCurrentEnhancedPlayRequest(playOptions)) return;\n' +
    '              onPlaybackRequested(player, streamInfo);'
);

replaceOnce(
    'resolved media generation check',
    '                  ).then(function (mediaSourceInfo) {\n                    var mediaSource = mediaSourceInfo.mediaSource,',
    '                  ).then(function (mediaSourceInfo) {\n' +
    '                    if (!isCurrentEnhancedPlayRequest(playOptions)) return;\n' +
    '                    var mediaSource = mediaSourceInfo.mediaSource,'
);

replaceOnce(
    'local generation check',
    '        : promise.then(function () {\n            var streamInfo = (function (item) {',
    '        : promise.then(function () {\n' +
    '            if (!isCurrentEnhancedPlayRequest(playOptions)) return;\n' +
    '            var streamInfo = (function (item) {'
);

replaceOnce(
    'stream request id',
    '      return mediaSourceContainer && (prefix.backdropUrl = mediaSourceContainer), prefix;\n',
    '      item && item.playOptions && item.playOptions._etePlayRequestId &&\n' +
    '        (prefix._etePlayRequestId = item.playOptions._etePlayRequestId);\n' +
    '      return mediaSourceContainer && (prefix.backdropUrl = mediaSourceContainer), prefix;\n'
);

replaceOnce(
    'stream change superseded',
    '          function (err) {\n            console.log("setSrcIntoPlayer error: " + err),\n              previousPlaySessionId && apiClient.stopActiveEncodings(previousPlaySessionId);\n            var playerData = getPlayerData(player);',
    '          function (err) {\n' +
    '            if (err && err.playbackSuperseded) {\n' +
    '              previousPlaySessionId && apiClient.stopActiveEncodings(previousPlaySessionId);\n' +
    '              return;\n' +
    '            }\n' +
    '            console.log("setSrcIntoPlayer error: " + err),\n' +
    '              previousPlaySessionId && apiClient.stopActiveEncodings(previousPlaySessionId);\n' +
    '            var playerData = getPlayerData(player);'
);

replaceOnce(
    'initial play superseded',
    '                        function (err) {\n                          return (\n                            console.log("player.play error: " + err),',
    '                        function (err) {\n' +
    '                          if (err && err.playbackSuperseded) return;\n' +
    '                          return (\n' +
    '                            console.log("player.play error: " + err),'
);

replaceOnce(
    'local play superseded',
    '                function () {\n                  _loading.default.hide(), self.stop(player);\n                }',
    '                function (err) {\n' +
    '                  if (err && err.playbackSuperseded) return;\n' +
    '                  _loading.default.hide(), self.stop(player);\n' +
    '                }'
);

replaceOnce(
    'pending playback marker',
    '    function onPlaybackRequested(player, streamInfo) {\n      setCurrentPlayerInternal(player);',
    '    function onPlaybackRequested(player, streamInfo) {\n' +
    '      // This provisional item has no started playback session to stop-report.\n' +
    '      streamInfo._etePendingPlayback = true;\n' +
    '      setCurrentPlayerInternal(player);'
);

replaceOnce(
    'started playback marker',
    '      ((playerData.streamInfo = streamInfo).playbackStartTimeTicks = 1e4 * Date.now()),',
    '      streamInfo._etePendingPlayback = false;\n' +
    '      ((playerData.streamInfo = streamInfo).playbackStartTimeTicks = 1e4 * Date.now()),'
);

replaceOnce(
    'replacement stop coordinator',
    '    function playAfterBitrateDetect(maxBitrate, item, playOptions, onPlaybackStartedFn) {',
    `    function stopForEnhancedReplacement(activePlayer, newPlayer, newItem, playOptions) {
      var playerData = getPlayerData(activePlayer),
        streamInfo = playerData.streamInfo,
        owner = playerData._eteReplacementStop;
      if (!owner || owner.closed || owner.streamInfo !== streamInfo) {
        var state = self.getPlayerState(activePlayer);
        owner = {streamInfo: streamInfo, tail: Promise.resolve(), stopped: false, terminal: false, closed: false};
        playerData._eteReplacementStop = owner;
        stopPlaybackProgressTimer(activePlayer);
        _events.default.off(activePlayer, "stopped", onPlaybackStopped);
        function drain() {
          var tail = owner.tail;
          return tail.then(function () {
            if (tail !== owner.tail) return drain();
            if (owner.closed) return owner.completion;
            owner.closed = true;
            if (playerData._eteReplacementStop === owner) delete playerData._eteReplacementStop;
            bindStopped(activePlayer);
            try {
              // A stale request must still finish A, but must never clear B.
              if (!owner.stopped || (streamInfo && streamInfo._eteStopHandled)) return;
              if (owner.terminal && playerData.streamInfo === streamInfo) {
                owner.completion = Promise.resolve(onPlaybackStopped.call(activePlayer, null, {playNext: false}));
              } else {
                if (streamInfo) streamInfo._eteStopHandled = true;
                if (playerData.streamInfo === streamInfo) playerData.streamInfo = null;
                var nextMediaType = owner.terminal ? null : owner.nextMediaType;
                _events.default.trigger(self, "playbackstop", [{player: activePlayer, state: state, nextMediaType: nextMediaType}]);
                if (enableLocalPlaylistManagement(activePlayer) &&
                    !(streamInfo && streamInfo._etePendingPlayback) && state.NowPlayingItem) {
                  state.NextMediaType = nextMediaType;
                  if (activePlayer.id !== "externalplayer")
                    owner.completion = reportPlayback(self, state, 0, !0, state.NowPlayingItem.ServerId, "reportPlaybackStopped");
                }
              }
            } catch (error) { owner.completion = Promise.reject(error); }
            return owner.completion;
          });
        }
        owner.enqueue = function (destroyPlayer, terminal, requestOptions) {
          // A later Next waits for terminal teardown; it cannot Stop a destroyed endpoint.
          if (owner.terminal) return owner.terminalResult;
          if (terminal) owner.terminal = true;
          // Preserve every current Stop's presentation preparation. Untagged
          // stopped events stay detached until no old physical Stop can arrive.
          var operation = owner.tail.then(function () {
            if (!terminal && !isCurrentEnhancedPlayRequest(requestOptions)) return;
            return (terminal ? activePlayer.stop(!0, !0) : activePlayer.stop(destroyPlayer)).then(function () {
              owner.stopped = true;
            });
          });
          owner.tail = operation.then(function () {}, function () {});
          var result = operation.then(drain, function (error) {
            return drain().then(function () { throw error; });
          });
          if (terminal) owner.terminalResult = result;
          return result;
        };
      }
      owner.nextMediaType = newItem.MediaType;
      return owner.enqueue(activePlayer !== newPlayer, false, playOptions);
    }
    function playAfterBitrateDetect(maxBitrate, item, playOptions, onPlaybackStartedFn) {`
);

const originalReplacementStop = `            (function (activePlayer, newPlayer, newItem) {
              var state = self.getPlayerState(activePlayer);
              stopPlaybackProgressTimer(activePlayer),
                (function (player) {
                  _events.default.off(player, "stopped", onPlaybackStopped);
                })(activePlayer),
                (newPlayer = activePlayer === newPlayer ? activePlayer.stop(!1) : activePlayer.stop(!0));
              return newPlayer.then(function () {
                (getPlayerData(activePlayer).streamInfo = null), bindStopped(activePlayer);
                var serverId,
                  nextMediaType = newItem.MediaType;
                if (
                  (_events.default.trigger(self, "playbackstop", [
                    {player: activePlayer, state: state, nextMediaType: nextMediaType},
                  ]),
                  enableLocalPlaylistManagement(activePlayer) && state.NowPlayingItem)
                )
                  return (
                    (serverId = state.NowPlayingItem.ServerId),
                    (state.NextMediaType = nextMediaType),
                    activePlayer.id !== "externalplayer" &&
                    reportPlayback(self, state, 0, !0, serverId, "reportPlaybackStopped")
                  );
              });
            })(activePlayer, player, item))`;
replaceOnce(
    'replacement stop ownership boundary',
    originalReplacementStop,
    '            (enableLocalPlaylistManagement(activePlayer)\n' +
    '              ? stopForEnhancedReplacement(activePlayer, player, item, playOptions)\n' +
    '              : ' + originalReplacementStop.trim().slice(0, -1) + '))'
);

replaceOnce(
    'terminal stream cleanup claim',
    '      if (!playerData.isChangingStream) {\n        stopPlaybackProgressTimer(this);',
    '      if (!playerData.isChangingStream) {\n' +
    '        if (playerData.streamInfo && playerData.streamInfo._eteStopHandled) return;\n' +
    '        if (playerData.streamInfo) playerData.streamInfo._eteStopHandled = true;\n' +
    '        stopPlaybackProgressTimer(this);'
);

replaceOnce(
    'terminal stop joins replacement drain',
    '        ? (enableLocalPlaylistManagement(player) && (this._playNextAfterEnded = !1), player.stop(!0, !0))',
    '        ? (enableLocalPlaylistManagement(player) && (this._playNextAfterEnded = !1),\n' +
    '          player._eteReplacementStop && !player._eteReplacementStop.closed\n' +
    '            ? player._eteReplacementStop.enqueue(true, true) : player.stop(!0, !0))'
);

replaceOnce(
    'terminal pending stop report',
    '            streamInfo &&\n              streamInfo.item.Id &&',
    '            streamInfo &&\n              !streamInfo._etePendingPlayback &&\n              streamInfo.item.Id &&'
);

replaceOnce(
    'terminal stop invalidation',
    '    (PlaybackManager.prototype.stop = function (player) {\n      return (player = player || this._currentPlayer)',
    '    (PlaybackManager.prototype.stop = function (player) {\n' +
    '      this._etePlayRequestSequence = (this._etePlayRequestSequence || 0) + 1;\n' +
    '      return (player = player || this._currentPlayer)'
);

// Public Play has asynchronous item/user/intro work before playInternal. Capture
// admission here so a pre-Stop intent cannot acquire a fresh identity afterwards.
replaceOnce('public play admission',
    '        if (options.items)\n          return translateItemsForPlayback(options.items, options, !0).then(function (items) {',
    `        options = Object.assign({}, options);
        self._etePlayRequestSequence = (self._etePlayRequestSequence || 0) + 1;
        options._etePlayRequestId = self._etePlayRequestSequence;
        if (options.items)
          return translateItemsForPlayback(options.items, options, !0).then(function (items) {`);
replaceOnce('public item lookup continuation',
    'getItemsForPlayback(options.serverId, {Ids: options.ids.join(",")}).then(function (result) {\n              return translateItemsForPlayback(result.Items, options).then(function (items) {',
    'getItemsForPlayback(options.serverId, {Ids: options.ids.join(",")}).then(function (result) {\n' +
    '              if (!isCurrentEnhancedPlayRequest(options)) return;\n              return translateItemsForPlayback(result.Items, options).then(function (items) {');
replaceOnce('intro entry ownership',
    '    function playWithIntros(items, options) {',
    '    function playWithIntros(items, options) {\n      if (!isCurrentEnhancedPlayRequest(options)) return Promise.resolve();');
replaceOnce('user continuation ownership',
    '      return firstItemApiClient.getCurrentUser().then(function (user) {',
    '      return firstItemApiClient.getCurrentUser().then(function (user) {\n        if (!isCurrentEnhancedPlayRequest(options)) return;');
replaceOnce('intro continuation ownership',
    '      })(firstItem, firstItemApiClient, options).then(function (introsResult) {',
    '      })(firstItem, firstItemApiClient, options).then(function (introsResult) {\n        if (!isCurrentEnhancedPlayRequest(options)) return;');
replaceOnce('public play reuses captured admission',
    '              _loading.default.hide();\n          })\n        );\n      });\n    }\n    function playWithIntros',
    '              _loading.default.hide();\n          }, options._etePlayRequestId)\n        );\n      });\n    }\n    function playWithIntros');

// Stream changes remain part of the started session: same request ID is valid,
// but each continuation must own both that request and the captured stream.
replaceOnce('stream change owner',
    '    function changeStream(player, ticks, params, progressEventName) {',
    `    function isCurrentEnhancedStreamChange(owner) {
      return owner && owner.player._eteStreamChange === owner &&
        owner.sequence === self._etePlayRequestSequence &&
        owner.player.streamInfo === owner.streamInfo && !owner.streamInfo._eteStopHandled &&
        isCurrentEnhancedPlayRequest(owner.streamInfo);
    }
    function finishEnhancedStreamChange(owner) {
      if (owner.player._eteStreamChange === owner) {
        owner.player._eteStreamChange = null;
        owner.player.isChangingStream = false;
      }
    }
    function changeStream(player, ticks, params, progressEventName) {`);
replaceOnce('capture stream change before profile',
    '      params = params || {};\n      var liveStreamId = getPlayerData(player).streamInfo.liveStreamId,',
    `      params = params || {};
      var owner = {player: player, streamInfo: getPlayerData(player).streamInfo,
        sequence: self._etePlayRequestSequence};
      player._eteStreamChange = owner;
      if (!owner.streamInfo || !isCurrentEnhancedStreamChange(owner)) {
        finishEnhancedStreamChange(owner);
        return Promise.resolve();
      }
      var requestId = owner.streamInfo._etePlayRequestId,
        currentPlayOptions = Object.assign({}, owner.streamInfo.item.playOptions),
        liveStreamId = owner.streamInfo.liveStreamId,`);
replaceOnce('stream profile continuation',
    '      return player\n        .getDeviceProfile(currentItem, {isRetry: !1 === params.EnableDirectPlay})\n        .then(function (deviceProfile) {',
    '      var changing = player\n        .getDeviceProfile(currentItem, {isRetry: !1 === params.EnableDirectPlay})\n        .then(function (deviceProfile) {\n' +
    '          if (!isCurrentEnhancedStreamChange(owner)) return;');
replaceOnce('retain stream options snapshot',
    '              ((ticks = ticks && parseInt(ticks)), params.MaxStreamingBitrate || self.getMaxStreamingBitrate(player)),\n            currentPlayOptions = currentItem.playOptions || {};',
    '              ((ticks = ticks && parseInt(ticks)), params.MaxStreamingBitrate || self.getMaxStreamingBitrate(player));');
replaceOnce('stream info continuation',
    '          ).then(function (result) {\n            if (result.ErrorCode)',
    '          ).then(function (result) {\n            if (!isCurrentEnhancedStreamChange(owner)) return;\n            if (result.ErrorCode)');
replaceOnce('candidate keeps captured request',
    '              (result.fullscreen = currentPlayOptions.fullscreen),',
    '              (result._etePlayRequestId = requestId),\n              (result.fullscreen = currentPlayOptions.fullscreen),');
replaceOnce('encoding completion ownership',
    '                            return setSrcIntoPlayer(apiClient, player, streamInfo, progressEventName, playSessionId);',
    '                            return setSrcIntoPlayer(apiClient, player, streamInfo, progressEventName, playSessionId, owner);');
replaceOnce('stream source direct ownership',
    '                        : setSrcIntoPlayer(apiClient, player, streamInfo, progressEventName)',
    '                        : setSrcIntoPlayer(apiClient, player, streamInfo, progressEventName, null, owner)');
replaceOnce('stream change settlement ownership',
    '        });\n    }\n    function setSrcIntoPlayer(apiClient, player, streamInfo, progressEventName, previousPlaySessionId) {',
    `        });
      return changing.then(function (result) {
        finishEnhancedStreamChange(owner);
        return result;
      }, function (error) {
        var current = isCurrentEnhancedStreamChange(owner);
        finishEnhancedStreamChange(owner);
        // Once handed to setSrc, its guarded callbacks (including a legitimate
        // error-recovery retry) own the outcome; the old stream may have changed.
        if (owner.sourceAdmitted || current) throw error;
      });
    }
    function setSrcIntoPlayer(apiClient, player, streamInfo, progressEventName, previousPlaySessionId, owner) {
      if (!isCurrentEnhancedStreamChange(owner)) return Promise.resolve();
      owner.sourceAdmitted = true;`);
replaceOnce('stream play success ownership',
    '          function () {\n            var playerData = getPlayerData(player);\n            (playerData.isChangingStream = !1),',
    '          function () {\n            if (!isCurrentEnhancedStreamChange(owner)) return;\n' +
    '            var playerData = getPlayerData(player);\n            (playerData.isChangingStream = !1),');
replaceOnce('stream play failure ownership',
    '          function (err) {\n            if (err && err.playbackSuperseded) {',
    '          function (err) {\n            if (!isCurrentEnhancedStreamChange(owner)) return;\n' +
    '            if (err && err.playbackSuperseded) {');

// UI actions may await profile/bitrate before entering changeStream itself.
replaceOnce('audio action capture',
    '      (self.setAudioStreamIndex = function (index, player) {',
    `      (self.setAudioStreamIndex = function (index, player) {
        var enhancedPlayer = player || self._currentPlayer,
          enhancedStream = enhancedPlayer && enhancedPlayer.streamInfo,
          enhancedSequence = self._etePlayRequestSequence;`);
replaceOnce('audio action continuation',
    '          ? player.getDeviceProfile(self.currentItem(player)).then(function (profile) {',
    '          ? player.getDeviceProfile(self.currentItem(player)).then(function (profile) {\n' +
    '              if (enhancedSequence !== self._etePlayRequestSequence || player.streamInfo !== enhancedStream) return;');
replaceOnce('quality action capture and endpoint continuation',
    '        var apiClient = _connectionmanager.default.getApiClient(self.currentItem(player).ServerId);\n        return apiClient.getEndpointInfo().then(function (endpointInfo) {',
    `        var enhancedStream = player.streamInfo, enhancedSequence = self._etePlayRequestSequence;
        var apiClient = _connectionmanager.default.getApiClient(self.currentItem(player).ServerId);
        return apiClient.getEndpointInfo().then(function (endpointInfo) {
          if (enhancedSequence !== self._etePlayRequestSequence || player.streamInfo !== enhancedStream) return;`);
replaceOnce('quality detection continuation',
    '          return playerData.then(function (bitrate) {',
    '          return playerData.then(function (bitrate) {\n' +
    '            if (enhancedSequence !== self._etePlayRequestSequence || player.streamInfo !== enhancedStream) return;');

// A player promise is not proof that the manager still owns the intent.
replaceOnce('initial play success ownership',
    '                        function () {\n                          _loading.default.hide(),',
    '                        function () {\n                          if (!isCurrentEnhancedPlayRequest(playOptions)) return;\n                          _loading.default.hide(),');
replaceOnce('initial play failure ownership',
    '                          if (err && err.playbackSuperseded) return;',
    '                          if (!isCurrentEnhancedPlayRequest(playOptions) || (err && err.playbackSuperseded)) return;');
replaceOnce('local play success ownership',
    '                  _loading.default.hide(), onPlaybackStartedFn(), onPlaybackStarted(player, playOptions, streamInfo);',
    '                  if (!isCurrentEnhancedPlayRequest(playOptions)) return;\n' +
    '                  _loading.default.hide(), onPlaybackStartedFn(), onPlaybackStarted(player, playOptions, streamInfo);');
replaceOnce('local play failure ownership',
    '                  if (err && err.playbackSuperseded) return;',
    '                  if (!isCurrentEnhancedPlayRequest(playOptions) || (err && err.playbackSuperseded)) return;');

// Keep the physical Stop synchronous, but make a post-Stop Play wait for its
// completion. Reuse the existing replacement coordinator and reporting path.
replaceOnce('terminal stop completion fence',
    `      return (player = player || this._currentPlayer)
        ? (enableLocalPlaylistManagement(player) && (this._playNextAfterEnded = !1),
          player._eteReplacementStop && !player._eteReplacementStop.closed
            ? player._eteReplacementStop.enqueue(true, true) : player.stop(!0, !0))
        : Promise.resolve();`,
    `      if (this._eteTerminalStop) return this._eteTerminalStop;
      player = player || this._currentPlayer;
      if (!player) return Promise.resolve();
      if (!enableLocalPlaylistManagement(player)) return player.stop(!0, !0);
      this._playNextAfterEnded = false;
      if (player._eteStreamChange) {
        player._eteStreamChange = null;
        player.isChangingStream = false;
      }
      var manager = this,
        stopping = player._eteReplacementStop && !player._eteReplacementStop.closed
          ? player._eteReplacementStop.enqueue(true, true) : player.stop(!0, !0),
        completion = Promise.resolve(stopping).then(function (result) {
          if (manager._eteTerminalStop === completion) manager._eteTerminalStop = null;
          return result;
        }, function (error) {
          if (manager._eteTerminalStop === completion) manager._eteTerminalStop = null;
          throw error;
        });
      this._eteTerminalStop = completion;
      return completion;`);

fs.writeFileSync(file, source, 'utf8');
