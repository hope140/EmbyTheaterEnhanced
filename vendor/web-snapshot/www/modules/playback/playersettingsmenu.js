define([
  "exports",
  "./../common/globalize.js",
  "./../common/playback/playbackmanager.js",
  "./../emby-apiclient/connectionmanager.js",
  "./../actionsheet/actionsheet.js",
  "./../common/qualityoptions.js",
], function (_exports, _globalize, _playbackmanager, _connectionmanager, _actionsheet, _qualityoptions) {
  function numberToString(value) {
    try {
      return new Intl.NumberFormat(_globalize.default.getCurrentLocales(), {style: "decimal"}).format(value);
    } catch (err) {
      return console.log("Error in NumberFormat: " + err), value;
    }
  }
  function showWithUser(options, player, user) {
    var currentAspectRatioId,
      supportedCommands = _playbackmanager.default.getSupportedCommands(player),
      menuItems = [],
      currentAspectRatio =
        ("Video" === options.mediaType &&
          -1 !== supportedCommands.indexOf("SetAspectRatio") &&
          ((currentAspectRatioId = _playbackmanager.default.getAspectRatio(player)),
          (currentAspectRatio = _playbackmanager.default.getSupportedAspectRatios(player).filter(function (i) {
            return i.id === currentAspectRatioId;
          })[0]),
          menuItems.push({
            name: _globalize.default.translate("HeaderAspectRatio"),
            id: "aspectratio",
            asideText: currentAspectRatio ? currentAspectRatio.name : null,
          })),
        _playbackmanager.default.currentMediaSource(player));
    return (
      "Video" === options.mediaType &&
        user &&
        user.Policy.EnableVideoPlaybackTranscoding &&
        currentAspectRatio &&
        currentAspectRatio.SupportsTranscoding &&
        -1 !== supportedCommands.indexOf("SetMaxStreamingBitrate") &&
        ((user = (function (player) {
          var videoStream = (videoStream = _playbackmanager.default
            .currentMediaSource(player)
            .MediaStreams.filter(function (stream) {
              return "Video" === stream.Type;
            })[0])
            ? videoStream.Width
            : null;
          if (
            ((videoStream = _qualityoptions.default.getVideoQualityOptions({
              currentMaxBitrate: _playbackmanager.default.getMaxStreamingBitrate(player),
              isAutomaticBitrateEnabled: _playbackmanager.default.enableAutomaticBitrateDetection(player),
              videoWidth: videoStream,
              enableAuto: !0,
            })).map(function (o) {
              var opt = {name: o.name, id: o.bitrate, asideText: o.secondaryText};
              return o.selected && (opt.selected = !0), opt;
            }),
            !(videoStream = videoStream.filter(function (o) {
              return o.selected;
            })).length)
          )
            return null;
          var text = (videoStream = videoStream[0]).name;
          return (
            videoStream.autoText &&
              ((player = _playbackmanager.default.getPlayerState(player)).PlayState &&
              "Transcode" !== player.PlayState.PlayMethod
                ? (text += " - 媒体源直接传输")
                : (text += " " + videoStream.autoText)),
            text
          );
        })(player)),
        menuItems.push({name: _globalize.default.translate("Quality"), id: "quality", asideText: user})),
      "Video" === options.mediaType &&
        -1 !== supportedCommands.indexOf("SetRepeatMode") &&
        currentAspectRatio.RunTimeTicks &&
        ((user = _playbackmanager.default.getRepeatMode(player)),
        menuItems.push({
          name: _globalize.default.translate("HeaderRepeatMode"),
          id: "repeatmode",
          asideText:
            "RepeatNone" === user ? _globalize.default.translate("None") : _globalize.default.translate("" + user),
        })),
      -1 !== supportedCommands.indexOf("SetPlaybackRate") &&
        currentAspectRatio.RunTimeTicks &&
        ((user = _playbackmanager.default.getPlaybackRate(player)),
        menuItems.push({
          name: _globalize.default.translate("Speed"),
          id: "speed",
          asideText: 1 === user ? _globalize.default.translate("Normal") : numberToString(user),
        })),
      player.isLocalPlayer &&
        menuItems.push({name: _globalize.default.translate("StatsForNerds"), id: "stats", asideText: null}),
      /*1 < _playbackmanager.default.getCurrentPlaylistLength(player) &&
        menuItems.push({
          name: _globalize.default.translate("HeaderSavePlayQueueToPlaylist"),
          id: "saveplayqueue",
          asideText: null,
        }),*/
      "Video" !== options.mediaType ||
        -1 === supportedCommands.indexOf("SetSubtitleOffset") ||
        !(currentAspectRatio = _playbackmanager.default.getSubtitleStream(player)) ||
        ("External" !== currentAspectRatio.DeliveryMethod && "Hls" !== currentAspectRatio.DeliveryMethod) ||
        menuItems.push({
          name: _globalize.default.translate("HeaderSubtitleOffset"),
          id: "subtitleoffset",
          asideText: _playbackmanager.default.getSubtitleOffset(player) + " 毫秒",
        }),
      _actionsheet.default
        .show({
          items: menuItems,
          positionTo: options.positionTo,
          positionY: "above",
          transformOrigin: "center bottom",
          hasItemAsideText: !0,
          autoTvLayout: !1,
        })
        .then(function (id) {
          return (function (id, options, player) {
            switch (id) {
              case "quality":
                return (function (player, btn) {
                  var videoStream = (videoStream = _playbackmanager.default
                      .currentMediaSource(player)
                      .MediaStreams.filter(function (stream) {
                        return "Video" === stream.Type;
                      })[0])
                      ? videoStream.Width
                      : null,
                    menuItems = (videoStream = _qualityoptions.default.getVideoQualityOptions({
                      currentMaxBitrate: _playbackmanager.default.getMaxStreamingBitrate(player),
                      isAutomaticBitrateEnabled: _playbackmanager.default.enableAutomaticBitrateDetection(player),
                      videoWidth: videoStream,
                      enableAuto: !0,
                    })).map(function (o) {
                      var opt = {name: o.name, id: o.bitrate, asideText: o.secondaryText};
                      return o.selected && (opt.selected = !0), opt;
                    }),
                    selectedId = (selectedId = videoStream.filter(function (o) {
                      return o.selected;
                    })).length
                      ? selectedId[0].bitrate
                      : null;
                  return _actionsheet.default
                    .show({
                      items: menuItems,
                      positionTo: btn,
                      positionY: "above",
                      transformOrigin: "center bottom",
                      title: _globalize.default.translate("Quality"),
                      hasItemSelectionState: !0,
                      autoTvLayout: !1,
                    })
                    .then(function (id) {
                      id = parseInt(id);
                      id !== selectedId &&
                        _playbackmanager.default.setMaxStreamingBitrate(
                          {enableAutomaticBitrateDetection: !id, maxBitrate: id},
                          player
                        );
                    });
                })(player, options.positionTo);
              case "aspectratio":
                return (function (player, btn) {
                  var currentId = _playbackmanager.default.getAspectRatio(player),
                    menuItems = _playbackmanager.default.getSupportedAspectRatios(player).map(function (i) {
                      return {id: i.id, name: i.name, selected: i.id === currentId};
                    });
                  return _actionsheet.default
                    .show({
                      items: menuItems,
                      positionTo: btn,
                      positionY: "above",
                      transformOrigin: "center bottom",
                      title: _globalize.default.translate("HeaderAspectRatio"),
                      hasItemSelectionState: !0,
                      autoTvLayout: !1,
                    })
                    .then(function (id) {
                      return id
                        ? (_playbackmanager.default.setAspectRatio(id, player), Promise.resolve())
                        : Promise.reject();
                    });
                })(player, options.positionTo);
              case "repeatmode":
                return (function (player, btn) {
                  var menuItems = [],
                    currentValue = _playbackmanager.default.getRepeatMode(player);
                  return (
                    menuItems.push({
                      name: _globalize.default.translate("RepeatAll"),
                      id: "RepeatAll",
                      selected: "RepeatAll" === currentValue,
                    }),
                    menuItems.push({
                      name: _globalize.default.translate("RepeatOne"),
                      id: "RepeatOne",
                      selected: "RepeatOne" === currentValue,
                    }),
                    menuItems.push({
                      name: _globalize.default.translate("None"),
                      id: "RepeatNone",
                      selected: "RepeatNone" === currentValue,
                    }),
                    _actionsheet.default
                      .show({
                        items: menuItems,
                        positionTo: btn,
                        positionY: "above",
                        transformOrigin: "center bottom",
                        title: _globalize.default.translate("HeaderRepeatMode"),
                        hasItemSelectionState: !0,
                        autoTvLayout: !1,
                      })
                      .then(function (mode) {
                        mode && _playbackmanager.default.setRepeatMode(mode, player);
                      })
                  );
                })(player, options.positionTo);
              case "speed":
                return (function (player, btn) {
                  for (
                    var menuItems = [],
                      currentValue = _playbackmanager.default.getPlaybackRate(player),
                      values = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4],
                      i = 0,
                      length = values.length;
                    i < length;
                    i++
                  ) {
                    var value = values[i];
                    menuItems.push({
                      name: 1 === value ? _globalize.default.translate("Normal") + ("（1.0）") : numberToString(value),
                      id: value.toString(),
                      selected: currentValue === value,
                    });
                  }
                  return _actionsheet.default
                    .show({
                      items: menuItems,
                      positionTo: btn,
                      positionY: "above",
                      transformOrigin: "center bottom",
                      title: _globalize.default.translate("Speed"),
                      hasItemSelectionState: !0,
                      autoTvLayout: !1,
                    })
                    .then(function (result) {
                      result && _playbackmanager.default.setPlaybackRate(result, player);
                    });
                })(player, options.positionTo);
              case "saveplayqueue":
                return (function (player) {
                  return require(["addToList"]).then(function (responses) {
                    var AddToList = responses[0];
                    _playbackmanager.default.getPlaylist(player).then(function (result) {
                      var serverId,
                        result = result.Items.filter(isValidForPlaylist);
                      result.length &&
                        ((serverId = result[0].ServerId),
                        new AddToList().show({
                          items: result.map(function (i) {
                            return i.Id;
                          }),
                          serverId: serverId,
                          enableAddToPlayQueue: !1,
                          defaultValue: "new",
                          type: "Playlist",
                        }));
                    });
                  });
                })(player, options.positionTo);
              default:
                return options.onOption && options.onOption(id), Promise.resolve();
            }
            return Promise.reject();
          })(id, options, player);
        })
    );
  }
  function isValidForPlaylist(i) {
    return i.Id && i.ServerId;
  }
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    (_exports.default = {
      show: function (options) {
        var player = options.player,
          currentItem = _playbackmanager.default.currentItem(player);
        return currentItem && currentItem.ServerId
          ? _connectionmanager.default
              .getApiClient(currentItem.ServerId)
              .getCurrentUser()
              .then(function (user) {
                return showWithUser(options, player, user);
              })
          : showWithUser(options, player, null);
      },
    });
});
