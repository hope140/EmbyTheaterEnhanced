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
    '    function playInternal(item, playOptions, onPlaybackStartedFn) {\n' +
    '      // Queue items reuse options; each async request must retain its own identity.\n' +
    '      playOptions = Object.assign({}, playOptions);\n' +
    '      self._etePlayRequestSequence = (self._etePlayRequestSequence || 0) + 1;\n' +
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

fs.writeFileSync(file, source, 'utf8');
