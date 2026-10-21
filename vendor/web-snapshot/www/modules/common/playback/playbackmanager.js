define([
  "exports",
  "./../../emby-apiclient/events.js",
  "./../appsettings.js",
  "./../itemhelper.js",
  "./../pluginmanager.js",
  "./playqueuemanager.js",
  "./../usersettings/usersettings.js",
  "./../globalize.js",
  "./../../emby-apiclient/connectionmanager.js",
  "./../servicelocator.js",
  "./../../loading/loading.js",
], function (
  _exports,
  _events,
  _appsettings,
  _itemhelper,
  _pluginmanager,
  _playqueuemanager,
  _usersettings,
  _globalize,
  _connectionmanager,
  _servicelocator,
  _loading
) {
  function enableLocalPlaylistManagement(player) {
    return !player.getPlaylist && !!player.isLocalPlayer;
  }
  function returnResolve() {
    return Promise.resolve();
  }
  function addPlaylistItemsToPlaybackReport(info, playlist, serverId) {
    for (var list = [], i = 0, length = playlist.length; i < length; i++) {
      var playlistItem = playlist[i],
        itemInfo = {Id: playlistItem.Id, PlaylistItemId: playlistItem.PlaylistItemId};
      playlistItem.ServerId !== serverId && (itemInfo.ServerId = playlistItem.ServerId), list.push(itemInfo);
    }
    info.NowPlayingQueue = list;
  }
  function reportPlayback(
    playbackManagerInstance,
    state,
    player,
    reportPlaylist,
    serverId,
    method,
    progressEventName,
    additionalData
  ) {
    if (!serverId) return Promise.resolve();
    if (state.IsBackgroundPlayback) return Promise.resolve();
    var info = Object.assign({}, state.PlayState);
    if (
      (((info = additionalData ? Object.assign(info, additionalData) : info).ItemId = state.NowPlayingItem.Id),
      !info.ItemId)
    )
      return Promise.resolve();
    progressEventName && (info.EventName = progressEventName),
      (info.PlaylistIndex = state.PlaylistIndex),
      (info.PlaylistLength = state.PlaylistLength),
      (info.NextMediaType = state.NextMediaType);
    var apiClient = _connectionmanager.default.getApiClient(serverId);
    return reportPlaylist
      ? "reportPlaybackStopped" === method
        ? (addPlaylistItemsToPlaybackReport(
            info,
            playbackManagerInstance._playQueueManager.getPlaylistResult({}).Items,
            serverId
          ),
          apiClient[method](info).catch(returnResolve))
        : (function (playbackManagerInstance, info, serverId) {
            return playbackManagerInstance.getPlaylist().then(function (playlistResult) {
              addPlaylistItemsToPlaybackReport(info, playlistResult.Items, serverId);
            });
          })(playbackManagerInstance, info, serverId).then(function () {
            return apiClient[method](info).catch(returnResolve);
          })
      : apiClient[method](info).catch(returnResolve);
  }
  function normalizeName(t) {
    return t.toLowerCase().replace(" ", "");
  }
  Object.defineProperty(_exports, "__esModule", {value: !0}), (_exports.default = void 0);
  var PlaybackItemFields = "Chapters,ProductionYear,PremiereDate,Container";
  function getItemsForPlayback(serverId, query) {
    var itemId,
      serverId = _connectionmanager.default.getApiClient(serverId);
    return query.Ids && 1 === query.Ids.split(",").length
      ? ((itemId = query.Ids.split(",")),
        serverId.getItem(serverId.getCurrentUserId(), itemId).then(function (item) {
          return {Items: [item], TotalRecordCount: 1};
        }))
      : ((query.Limit = query.Limit || 300),
        (query.Fields = PlaybackItemFields),
        (query.ExcludeLocationTypes = "Virtual"),
        (query.EnableTotalRecordCount = !1),
        (query.CollapseBoxSetItems = !1),
        serverId.getItems(serverId.getCurrentUserId(), query));
  }
  function mergePlaybackQueries(obj1, obj2) {
    (obj1 = Object.assign(obj1, obj2)), (obj2 = obj1.Filters ? obj1.Filters.split(",") : []);
    return obj2.includes("IsNotFolder") || obj2.push("IsNotFolder"), (obj1.Filters = obj2.join(",")), obj1;
  }
  function getMimeType(type, container) {
    if (((container = (container || "").toLowerCase()), "audio" === type)) {
      if ("opus" === container) return "audio/ogg";
      if ("webma" === container) return "audio/webm";
      if ("m4a" === container) return "audio/mp4";
    } else if ("video" === type) {
      if ("mkv" === container) return "video/x-matroska";
      if ("m4v" === container) return "video/mp4";
      if ("mov" === container) return "video/quicktime";
      if ("mpg" === container) return "video/mpeg";
      if ("flv" === container) return "video/x-flv";
    }
    return type + "/" + container;
  }
  function isAutomaticPlayer(player) {
    return !!player.isLocalPlayer;
  }
  function getDefaultIntros() {
    return Promise.resolve({Items: []});
  }
  function getAudioMaxValues(deviceProfile) {
    var maxAudioSampleRate = null,
      maxAudioBitDepth = null,
      maxAudioBitrate = null;
    return (
      deviceProfile.CodecProfiles.map(function (codecProfile) {
        "Audio" === codecProfile.Type &&
          (codecProfile.Conditions || []).map(function (condition) {
            "LessThanEqual" === condition.Condition &&
              "AudioBitDepth" === condition.Property &&
              (maxAudioBitDepth = condition.Value),
              "LessThanEqual" === condition.Condition &&
                "AudioSampleRate" === condition.Property &&
                (maxAudioSampleRate = condition.Value),
              "LessThanEqual" === condition.Condition &&
                "AudioBitrate" === condition.Property &&
                (maxAudioBitrate = condition.Value);
          });
      }),
      {maxAudioSampleRate: maxAudioSampleRate, maxAudioBitDepth: maxAudioBitDepth, maxAudioBitrate: maxAudioBitrate}
    );
  }
  function createAudioMediaSourceFromItem(item) {
    return {
      Id: item.Id,
      MediaStreams: [],
      RunTimeTicks: item.RunTimeTicks,
      Container: item.Container,
      Bitrate: item.Bitrate,
    };
  }
  function setStreamUrls(items, deviceProfile, maxBitrate, apiClient, startPosition) {
    return (function (items, deviceProfile, maxBitrate, apiClient, startPosition) {
      var audioTranscodingProfile = deviceProfile.TranscodingProfiles.filter(function (p) {
          return "Audio" === p.Type && "Streaming" === p.Context;
        })[0],
        audioDirectPlayContainers = "",
        deviceProfile =
          (deviceProfile.DirectPlayProfiles.map(function (p) {
            "Audio" === p.Type &&
              (audioDirectPlayContainers
                ? (audioDirectPlayContainers += "," + p.Container)
                : (audioDirectPlayContainers = p.Container),
              p.AudioCodec && (audioDirectPlayContainers += "|" + p.AudioCodec));
          }),
          getAudioMaxValues(deviceProfile)),
        enableRemoteMedia = _servicelocator.appHost.supports("remoteaudio");
      return apiClient.getAudioStreamUrls(
        items,
        audioTranscodingProfile,
        audioDirectPlayContainers,
        deviceProfile.maxAudioBitrate || maxBitrate,
        deviceProfile.maxAudioSampleRate,
        deviceProfile.maxAudioBitDepth,
        startPosition,
        enableRemoteMedia
      );
    })(items, deviceProfile, maxBitrate, apiClient, startPosition).then(function (streamUrls) {
      for (var i = 0, length = items.length; i < length; i++) {
        var item = items[i],
          streamUrl = streamUrls[i];
        streamUrl &&
          (item.MediaSources || (item.MediaSources = []),
          item.MediaSources.length || item.MediaSources.push(createAudioMediaSourceFromItem(item)),
          (function (mediaSources, streamUrl) {
            for (var i = 0, length = mediaSources.length; i < length; i++) mediaSources[i].StreamUrl = streamUrl;
          })(item.MediaSources, streamUrl));
      }
    });
  }
  function getParam(name, url) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    name = new RegExp("[\\?&]" + name + "=([^&#]*)", "i").exec(url);
    return null == name ? "" : decodeURIComponent(name[1].replace(/\+/g, " "));
  }
  function getPlaybackInfo(
    player,
    apiClient,
    item,
    deviceProfile,
    maxBitrate,
    startPosition,
    isPlayback,
    mediaSourceId,
    audioStreamIndex,
    subtitleStreamIndex,
    currentPlaySessionId,
    liveStreamId,
    enableDirectPlay,
    enableDirectStream,
    allowVideoStreamCopy,
    allowAudioStreamCopy
  ) {
    if ("Audio" === item.MediaType)
      return (
        ((mediaSource = createAudioMediaSourceFromItem(item)).StreamUrl = (function (
          item,
          deviceProfile,
          maxBitrate,
          apiClient,
          startPosition
        ) {
          for (
            var transcodingProfile = deviceProfile.TranscodingProfiles.filter(function (p) {
                return "Audio" === p.Type && "Streaming" === p.Context;
              })[0],
              directPlayContainers = [],
              directPlayProfileIndex = 0,
              directPlayProfilesLength = deviceProfile.DirectPlayProfiles.length;
            directPlayProfileIndex < directPlayProfilesLength;
            directPlayProfileIndex++
          ) {
            var p = deviceProfile.DirectPlayProfiles[directPlayProfileIndex];
            if ("Audio" === p.Type) {
              var audioCodecs = p.AudioCodec ? p.AudioCodec.split(",") : [];
              if (audioCodecs.length)
                for (var j = 0, length2 = audioCodecs.length; j < length2; j++)
                  directPlayContainers.push(p.Container + "|" + audioCodecs[j]);
              else directPlayContainers.push(p.Container);
            }
          }
          var directPlayContainers = directPlayContainers.join(","),
            maxValues = getAudioMaxValues(deviceProfile),
            enableRemoteMedia = _servicelocator.appHost.supports("remoteaudio");
          return apiClient.getAudioStreamUrl(
            item,
            transcodingProfile,
            directPlayContainers,
            maxValues.maxAudioBitrate || maxBitrate,
            maxValues.maxAudioSampleRate,
            maxValues.maxAudioBitDepth,
            startPosition,
            enableRemoteMedia
          );
        })(item, deviceProfile, maxBitrate, apiClient, startPosition)),
        Promise.resolve({MediaSources: [mediaSource], PlaySessionId: getParam("playSessionId", mediaSource.StreamUrl)})
      );
    if (item.MediaSources && item.MediaSources.length && item.MediaSources[0].StreamUrl)
      return Promise.resolve({
        MediaSources: item.MediaSources,
        PlaySessionId: getParam("playSessionId", item.MediaSources[0].StreamUrl),
      });
    var mediaSource = item.Id,
      startPosition = {UserId: apiClient.getCurrentUserId(), StartTimeTicks: startPosition || 0};
    return (
      isPlayback
        ? ((startPosition.IsPlayback = !0), (startPosition.AutoOpenLiveStream = !0))
        : ((startPosition.IsPlayback = !1), (startPosition.AutoOpenLiveStream = !1)),
      null != audioStreamIndex && (startPosition.AudioStreamIndex = audioStreamIndex),
      null != subtitleStreamIndex && (startPosition.SubtitleStreamIndex = subtitleStreamIndex),
      null != enableDirectPlay && (startPosition.EnableDirectPlay = enableDirectPlay),
      null != enableDirectStream && (startPosition.EnableDirectStream = enableDirectStream),
      null != allowVideoStreamCopy && (startPosition.AllowVideoStreamCopy = allowVideoStreamCopy),
      null != allowAudioStreamCopy && (startPosition.AllowAudioStreamCopy = allowAudioStreamCopy),
      mediaSourceId && (startPosition.MediaSourceId = mediaSourceId),
      liveStreamId && (startPosition.LiveStreamId = liveStreamId),
      maxBitrate && (startPosition.MaxStreamingBitrate = maxBitrate),
      player.enableMediaProbe && !player.enableMediaProbe(item) && (startPosition.EnableMediaProbe = !1),
      currentPlaySessionId && (startPosition.CurrentPlaySessionId = currentPlaySessionId),
      player.getDirectPlayProtocols && (startPosition.DirectPlayProtocols = player.getDirectPlayProtocols()),
      apiClient.getPlaybackInfo(mediaSource, startPosition, deviceProfile)
    );
  }
  function supportsDirectPlay(apiClient, item, mediaSource) {
    var isFolderRip =
      "BluRay" === mediaSource.VideoType ||
      "Dvd" === mediaSource.VideoType ||
      "bluray" === mediaSource.Container ||
      "dvd" === mediaSource.Container;
    if (mediaSource.SupportsDirectPlay || isFolderRip) {
      if (mediaSource.IsRemote && !_servicelocator.appHost.supports("remotevideo")) return Promise.resolve(!1);
      if ("Http" === mediaSource.Protocol && !mediaSource.RequiredHttpHeaders.length)
        return mediaSource.SupportsDirectStream || mediaSource.SupportsTranscoding
          ? (function (mediaSource, apiClient) {
              return mediaSource.IsRemote
                ? Promise.resolve(!0)
                : apiClient.getEndpointInfo().then(function (endpointInfo) {
                    if (endpointInfo.IsInNetwork) {
                      if (!endpointInfo.IsLocal) {
                        endpointInfo = (mediaSource.Path || "").toLowerCase();
                        if (endpointInfo.includes("localhost") || endpointInfo.includes("127.0.0.1"))
                          return Promise.resolve(!1);
                      }
                      return Promise.resolve(!0);
                    }
                    return Promise.resolve(!1);
                  });
            })(mediaSource, apiClient)
          : Promise.resolve(!0);
      if ("File" === mediaSource.Protocol)
        return new Promise(function (resolve, reject) {
          require(["filesystem"], resolve);
        }).then(function (filesystem) {
          return filesystem[isFolderRip ? "directoryExists" : "fileExists"](mediaSource.Path).then(
            function () {
              return !0;
            },
            function () {
              return !1;
            }
          );
        });
    }
    return Promise.resolve(!1);
  }
  function afterPlaybackErrorMessage(instance, errorCode, playNextTrack) {
    "RateLimitExceeded" === errorCode ? instance.stop() : playNextTrack && instance.nextTrack();
  }
  function showPlaybackInfoErrorMessage(instance, errorCode, fullscreen, playNextTrack) {
    if (!fullscreen) return afterPlaybackErrorMessage(instance, errorCode, playNextTrack);
    var options;
    _loading.default.hide(),
      (options = {
        text: _globalize.default.translate(
          "RateLimitExceeded" === errorCode ? "RateLimitExceeded" : "PlaybackError" + errorCode
        ),
        title: _globalize.default.translate("HeaderPlaybackError"),
      }),
      new Promise(function (resolve, reject) {
        require(["alert"], function (alert) {
          alert(options).then(resolve, reject);
        });
      }).then(function () {
        return afterPlaybackErrorMessage(instance, errorCode, playNextTrack);
      });
  }
  function normalizePlayOptions(playOptions) {
    playOptions.fullscreen = !1 !== playOptions.fullscreen;
  }
  function displayPlayerIndividually(player) {
    return !player.isLocalPlayer;
  }
  function createTarget(instance, player) {
    for (
      var allMediaTypes = ["Audio", "Video", "Game", "Photo", "Book"],
        mediaTypes = [],
        i = 0,
        length = allMediaTypes.length;
      i < length;
      i++
    ) {
      var mediaType = allMediaTypes[i];
      player.canPlayMediaType(mediaType) && mediaTypes.push(mediaType);
    }
    return {
      name: player.name,
      id: player.id,
      playerName: player.name,
      playableMediaTypes: mediaTypes,
      isLocalPlayer: player.isLocalPlayer,
      supportedCommands: instance.getSupportedCommands(player),
    };
  }
  function getPlayerTargets(player) {
    return player.getTargets ? player.getTargets() : Promise.resolve([createTarget(player)]);
  }
  function sortPlayerTargets(a, b) {
    var aVal = a.isLocalPlayer ? 0 : 1,
      bVal = b.isLocalPlayer ? 0 : 1,
      aVal = aVal.toString() + a.name,
      bVal = bVal.toString() + b.name;
    return aVal.localeCompare(bVal);
  }
  function PlaybackManager() {
    var currentTargetInfo,
      self = this,
      players = [],
      currentPairingId = null,
      playerStates = ((this._playNextAfterEnded = !0), {});
    function getSubtitleStream(player, index) {
      return self.subtitleTracks(player).filter(function (s) {
        return "Subtitle" === s.Type && s.Index === index;
      })[0];
    }
    function removeCurrentPlayer(player) {
      var previousPlayer = self._currentPlayer;
      (previousPlayer && player.id !== previousPlayer.id) || setCurrentPlayerInternal(null);
    }
    function setCurrentPlayerInternal(player, targetInfo) {
      var previousPlayer = self._currentPlayer,
        previousTargetInfo = currentTargetInfo;
      if (
        (player && !targetInfo && player.isLocalPlayer && (targetInfo = createTarget(self, player)),
        player && !targetInfo)
      )
        throw new Error("targetInfo cannot be null");
      (currentPairingId = null),
        (self._currentPlayer = player),
        (currentTargetInfo = targetInfo) && console.log("Active player: " + JSON.stringify(targetInfo)),
        player && player.isLocalPlayer && 0,
        previousPlayer && self.endPlayerUpdates(previousPlayer),
        player && self.beginPlayerUpdates(player),
        (function (playbackManagerInstance, newPlayer, newTarget, previousPlayer, previousTargetInfo) {
          (!newPlayer && !previousPlayer) ||
            (newTarget && previousTargetInfo && newTarget.id === previousTargetInfo.id) ||
            _events.default.trigger(playbackManagerInstance, "playerchange", [newPlayer, newTarget, previousPlayer]);
        })(self, player, targetInfo, previousPlayer, previousTargetInfo);
    }
    function formatIncludesValue(format, value) {
      if (format.startsWith("-")) {
        if ((format = format.substring(1)).toLowerCase().split(",").includes(value)) return;
      } else if (!format.toLowerCase().split(",").includes(value)) return;
      return 1;
    }
    function getSavedMaxStreamingBitrate(apiClient, mediaType) {
      apiClient = (apiClient = apiClient || _connectionmanager.default.currentApiClient()).getSavedEndpointInfo() || {};
      return _appsettings.default.maxStreamingBitrate(apiClient.IsInNetwork, mediaType);
    }
    function getDeliveryMethod(subtitleStream) {
      return subtitleStream.DeliveryMethod || (subtitleStream.IsExternal ? "External" : "Embed");
    }
    function canPlayerSeek(player) {
      if (!player) throw new Error("player cannot be null");
      var streamInfo = getPlayerData(player).streamInfo;
      if (streamInfo && (streamInfo.url || "").toLowerCase().includes(".m3u8")) return !0;
      return player.seekable ? player.seekable() : "Transcode" !== self.playMethod(player) && player.duration();
    }
    function changeStream(player, ticks, params, progressEventName) {
      if (canPlayerSeek(player) && null == params) return player.currentTime(parseInt(ticks / 1e4)), Promise.resolve();
      params = params || {};
      var liveStreamId = getPlayerData(player).streamInfo.liveStreamId,
        lastMediaInfoQuery = getPlayerData(player).streamInfo.lastMediaInfoQuery,
        playSessionId = self.playSessionId(player),
        currentItem = self.currentItem(player);
      return player
        .getDeviceProfile(currentItem, {isRetry: !1 === params.EnableDirectPlay})
        .then(function (deviceProfile) {
          var audioStreamIndex =
              null == params.AudioStreamIndex ? getPlayerData(player).audioStreamIndex : params.AudioStreamIndex,
            subtitleStreamIndex =
              null == params.SubtitleStreamIndex
                ? getPlayerData(player).subtitleStreamIndex
                : params.SubtitleStreamIndex,
            currentMediaSource = self.currentMediaSource(player),
            apiClient = _connectionmanager.default.getApiClient(currentItem.ServerId),
            maxBitrate =
              ((ticks = ticks && parseInt(ticks)), params.MaxStreamingBitrate || self.getMaxStreamingBitrate(player)),
            currentPlayOptions = currentItem.playOptions || {};
          return getPlaybackInfo(
            player,
            apiClient,
            currentItem,
            deviceProfile,
            maxBitrate,
            ticks,
            !0,
            currentMediaSource.Id,
            audioStreamIndex,
            subtitleStreamIndex,
            playSessionId,
            liveStreamId,
            params.EnableDirectPlay,
            params.EnableDirectStream,
            params.AllowVideoStreamCopy,
            params.AllowAudioStreamCopy
          ).then(function (result) {
            if (result.ErrorCode) return Promise.reject({errorCode: result.ErrorCode});
            currentMediaSource = result.MediaSources[0];
            result = createStreamInfo(
              apiClient,
              currentItem.MediaType,
              currentItem,
              currentMediaSource,
              result.PlaySessionId,
              ticks
            );
            return (
              (result.fullscreen = currentPlayOptions.fullscreen),
              (result.lastMediaInfoQuery = lastMediaInfoQuery),
              result.url
                ? ((getPlayerData(player).subtitleStreamIndex = subtitleStreamIndex),
                  (getPlayerData(player).audioStreamIndex = audioStreamIndex),
                  (getPlayerData(player).maxStreamingBitrate = maxBitrate),
                  (function (apiClient, player, playSessionId, streamInfo, progressEventName) {
                    var playerData = getPlayerData(player);
                    return (
                      (playerData.isChangingStream = !0),
                      playerData.streamInfo && playSessionId
                        ? apiClient.stopActiveEncodings(playSessionId).then(function () {
                            return setSrcIntoPlayer(apiClient, player, streamInfo, progressEventName, playSessionId);
                          })
                        : setSrcIntoPlayer(apiClient, player, streamInfo, progressEventName)
                    );
                  })(apiClient, player, playSessionId, result, progressEventName))
                : Promise.reject({errorCode: "NoCompatibleStream", skipToNextItem: !0})
            );
          });
        });
    }
    function setSrcIntoPlayer(apiClient, player, streamInfo, progressEventName, previousPlaySessionId) {
      return (
        normalizePlayOptions(streamInfo),
        player.play(streamInfo).then(
          function () {
            var playerData = getPlayerData(player);
            (playerData.isChangingStream = !1),
              ((playerData.streamInfo = streamInfo).started = !0),
              "subtitletrackchange" === progressEventName || "audiotrackchange" === progressEventName
                ? _events.default.trigger(player, progressEventName)
                : sendProgressUpdate(player, progressEventName || "timeupdate"),
              previousPlaySessionId && apiClient.stopActiveEncodings(previousPlaySessionId);
          },
          function (err) {
            console.log("setSrcIntoPlayer error: " + err),
              previousPlaySessionId && apiClient.stopActiveEncodings(previousPlaySessionId);
            var playerData = getPlayerData(player);
            return (
              (playerData.isChangingStream = !1),
              ((playerData.streamInfo = streamInfo).started = !1),
              onPlaybackError.call(player, err, {
                type: err && err.name ? err.name : "mediadecodeerror",
                streamInfo: streamInfo,
                returnPromise: !0,
              })
            );
          }
        )
      );
    }
    function updateResultSetStartingPoint(result, firstItem, options, isQueueing) {
      for (var startIndex = -1, i = 0, length = result.Items.length; i < length; i++)
        if (
          result.Items[i].Id === firstItem.Id &&
          result.Items[i].IndexNumber === firstItem.IndexNumber &&
          result.Items[i].ParentIndexNumber === firstItem.ParentIndexNumber
        ) {
          startIndex = i;
          break;
        }
      return (
        -1 !== startIndex &&
          (isQueueing
            ? ((result.Items = result.Items.slice(startIndex)), (result.TotalRecordCount = result.Items.length))
            : (options.startIndex = startIndex)),
        result
      );
    }
    function translateItemsForPlayback(items, options, showLoading, isQueueing) {
      var promise,
        _apiClient,
        firstItem = items[options.startIndex || 0],
        serverId = firstItem.ServerId,
        queryOptions = options.queryOptions || {};
      return (
        "Program" === firstItem.Type
          ? (promise = getItemsForPlayback(serverId, {Ids: firstItem.ChannelId}))
          : "Playlist" === firstItem.Type
          ? (promise = getItemsForPlayback(serverId, {
              ParentId: firstItem.Id,
              SortBy: options.shuffle ? "Random" : null,
            }))
          : "MusicArtist" === firstItem.Type
          ? (promise = getItemsForPlayback(serverId, {
              ArtistIds: firstItem.Id,
              Filters: "IsNotFolder",
              Recursive: !0,
              SortBy: options.shuffle ? "Random" : "Album,ParentIndexNumber,IndexNumber",
              MediaTypes: "Audio",
            }))
          : "Photo" === firstItem.MediaType && 1 === items.length && firstItem.ParentId
          ? (promise = getItemsForPlayback(serverId, {
              ParentId: firstItem.ParentId,
              Filters: "IsNotFolder",
              Recursive: !1,
              SortBy: options.shuffle ? "Random" : "SortName",
              MediaTypes: "Photo,Video",
              Limit: 5e3,
            }).then(function (result) {
              var index = result.Items.map(function (i) {
                return i.Id;
              }).indexOf(firstItem.Id);
              return (options.startIndex = index = -1 === index ? 0 : index), Promise.resolve(result);
            }))
          : "PhotoAlbum" === firstItem.Type
          ? (promise = getItemsForPlayback(serverId, {
              ParentId: firstItem.Id,
              Filters: "IsNotFolder",
              Recursive: !1,
              SortBy: options.shuffle ? "Random" : "SortName",
              Limit: 5e3,
            }))
          : "MusicGenre" === firstItem.Type
          ? (promise = getItemsForPlayback(serverId, {
              GenreIds: firstItem.Id,
              Filters: "IsNotFolder",
              Recursive: !0,
              SortBy: options.shuffle ? "Random" : "Album,ParentIndexNumber,IndexNumber",
              ParentId: options.parentId,
            }))
          : "Genre" === firstItem.Type
          ? (promise = getItemsForPlayback(serverId, {
              GenreIds: firstItem.Id,
              Filters: "IsNotFolder",
              Recursive: !0,
              SortBy: options.shuffle ? "Random" : "SortName",
              MediaTypes: "Video",
              ParentId: options.parentId,
            }))
          : "Studio" === firstItem.Type
          ? (promise = getItemsForPlayback(serverId, {
              StudioIds: firstItem.Id,
              Filters: "IsNotFolder",
              Recursive: !0,
              SortBy: options.shuffle ? "Random" : "SortName",
              MediaTypes: "Video",
              ParentId: options.parentId,
            }))
          : "MusicAlbum" !== firstItem.Type ||
            !firstItem.SupportsResume ||
            options.shuffle ||
            0 === options.startPositionTicks ||
            (queryOptions && queryOptions.Filters)
          ? "MusicAlbum" === firstItem.Type
            ? (promise = getItemsForPlayback(
                serverId,
                mergePlaybackQueries(
                  {
                    ParentId: firstItem.Id,
                    Filters: "IsNotFolder",
                    Recursive: !0,
                    SortBy: options.shuffle ? "Random" : null,
                  },
                  queryOptions
                )
              ))
            : "Series" !== firstItem.Type ||
              options.shuffle ||
              0 === options.startPositionTicks ||
              (queryOptions && queryOptions.Filters)
            ? firstItem.IsFolder
              ? (promise = getItemsForPlayback(
                  serverId,
                  mergePlaybackQueries(
                    {
                      ParentId: firstItem.Id,
                      Filters: "IsNotFolder",
                      Recursive: !0,
                      SortBy: options.shuffle ? "Random" : null,
                    },
                    queryOptions
                  )
                ))
              : "Audio" === firstItem.Type &&
                firstItem.AlbumId &&
                firstItem.SupportsResume &&
                1 === items.length &&
                !1 !== getPlayer(firstItem, options).supportsProgress
              ? (promise = (serverId = _connectionmanager.default.getApiClient(firstItem.ServerId))
                  .getItems(serverId.getCurrentUserId(), {
                    Fields: PlaybackItemFields,
                    ParentId: firstItem.AlbumId,
                    Recursive: !0,
                    IncludeItemTypes: "Audio",
                  })
                  .then(function (episodesResult) {
                    return updateResultSetStartingPoint(episodesResult, firstItem, options, isQueueing);
                  }))
              : "Episode" === firstItem.Type &&
                1 === items.length &&
                !1 !== getPlayer(firstItem, options).supportsProgress &&
                (promise = (_apiClient = _connectionmanager.default.getApiClient(firstItem.ServerId))
                  .getCurrentUser()
                  .then(function (user) {
                    return user.Configuration.EnableNextEpisodeAutoPlay && firstItem.SeriesId
                      ? _apiClient
                          .getEpisodes(firstItem.SeriesId, {
                            IsVirtualUnaired: !1,
                            IsMissing: !1,
                            UserId: _apiClient.getCurrentUserId(),
                            Fields: PlaybackItemFields,
                          })
                          .then(function (episodesResult) {
                            return updateResultSetStartingPoint(episodesResult, firstItem, options, isQueueing);
                          })
                      : Promise.resolve(null);
                  }))
            : (promise = (function (item) {
                var apiClient = _connectionmanager.default.getApiClient(item);
                return apiClient
                  .getNextUpEpisodes({
                    SeriesId: item.Id,
                    UserId: apiClient.getCurrentUserId(),
                    EnableTotalRecordCount: !1,
                    ExcludeLocationTypes: "Virtual",
                    Fields: PlaybackItemFields,
                  })
                  .then(function (result) {
                    return result.Items.length
                      ? result
                      : getItemsForPlayback(item.ServerId, {ParentId: item.Id, Filters: "IsNotFolder", Recursive: !0});
                  });
              })(firstItem))
          : (promise = (function (item) {
              var apiClient = _connectionmanager.default.getApiClient(item);
              return apiClient
                .getNextUpAudioBookItems({
                  AlbumId: item.Id,
                  UserId: apiClient.getCurrentUserId(),
                  EnableTotalRecordCount: !1,
                  ExcludeLocationTypes: "Virtual",
                  Fields: PlaybackItemFields,
                })
                .then(function (result) {
                  return result.Items.length
                    ? result
                    : getItemsForPlayback(item.ServerId, {ParentId: item.Id, Filters: "IsNotFolder", Recursive: !0});
                });
            })(firstItem)),
        promise
          ? (options.fullscreen && showLoading && _loading.default.show(),
            promise.then(function (result) {
              return result ? result.Items : items;
            }))
          : Promise.resolve(items)
      );
    }
    function getPlayerData(player) {
      if (!player) throw new Error("player cannot be null");
      if (player.name)
        return playerStates[player.name] || ((playerStates[player.name] = {}), playerStates[player.name]), player;
      throw new Error("player name cannot be null");
    }
    function getCurrentTicks(player) {
      if (!player) throw new Error("player cannot be null");
      var playerTime = player.isLocalPlayer
          ? Math.floor(1e4 * (player.currentTime() || 0))
          : Math.floor(player.currentTime() || 0),
        player = getPlayerData(player).streamInfo;
      return player && (playerTime += player.transcodingOffsetTicks || 0), playerTime;
    }
    function playWithIntrosInternal(items, firstItem, firstItemApiClient, playStartIndex, options) {
      return (function (firstItem, apiClient, options) {
        return options.startPositionTicks ||
          options.startIndex ||
          !1 === options.fullscreen ||
          "Video" !== (options = firstItem).MediaType ||
          "TvChannel" === options.Type ||
          "InProgress" === options.Status ||
          !options.Id ||
          !_usersettings.default.enableCinemaMode()
          ? getDefaultIntros()
          : (_loading.default.show(), apiClient.getIntros(firstItem.Id).catch(getDefaultIntros));
      })(firstItem, firstItemApiClient, options).then(function (introsResult) {
        var introPlayOptions,
          introsResult = introsResult.Items;
        (firstItem.playOptions = {
          fullscreen: options.fullscreen,
          mediaSourceId: options.mediaSourceId,
          audioStreamIndex: options.audioStreamIndex,
          subtitleStreamIndex: options.subtitleStreamIndex,
          startPositionTicks: options.startPositionTicks,
        }),
          (introPlayOptions = introsResult.length
            ? {fullscreen: firstItem.playOptions.fullscreen}
            : firstItem.playOptions),
          (self._isBackgroundPlaybackHack = !1 === introPlayOptions.fullscreen);
        for (var i = 0, length = (items = introsResult.concat(items)).length; i < length; i++)
          items[i].playOptions || (items[i].playOptions = {fullscreen: options.fullscreen});
        return (
          (introPlayOptions.items = items),
          (introPlayOptions.startIndex = playStartIndex),
          (introPlayOptions.command = "play"),
          playInternal(items[playStartIndex], introPlayOptions, function () {
            self._playQueueManager.setPlaylist(items),
              setPlaylistState(items[playStartIndex].PlaylistItemId, playStartIndex),
              _loading.default.hide();
          })
        );
      });
    }
    function playWithIntros(items, options) {
      var playStartIndex = options.startIndex || 0,
        firstItem = items[playStartIndex];
      if (!(firstItem = firstItem || items[(playStartIndex = 0)]))
        return showPlaybackInfoErrorMessage(self, "NoPlayableItems", !0, !1), Promise.reject();
      var firstItemApiClient = _connectionmanager.default.getApiClient(firstItem.ServerId);
      return firstItemApiClient.getCurrentUser().then(function (user) {
        return (
          null == options.startPositionTicks &&
            ((options.startPositionTicks = (firstItem.UserData && firstItem.UserData.PlaybackPositionTicks) || 0),
            options.startPositionTicks &&
              ((user = 1e7 * (user.Configuration.ResumeRewindSeconds || 0)),
              (options.startPositionTicks = Math.max(0, options.startPositionTicks - user)))),
          playWithIntrosInternal(items, firstItem, firstItemApiClient, playStartIndex, options)
        );
      });
    }
    function setPlaylistState(playlistItemId, index) {
      isNaN(index) || self._playQueueManager.setPlaylistState(playlistItemId, index);
    }
    function playInternal(item, playOptions, onPlaybackStartedFn) {
      return "disc" === item.Container
        ? (_loading.default.hide(), showPlaybackInfoErrorMessage(self, "PlaceHolder", !0, !0), Promise.reject())
        : (normalizePlayOptions(playOptions),
          (function (item, playOptions) {
            return new Promise(function (resolve, reject) {
              var options,
                interceptors = _pluginmanager.default.ofType("preplayintercept");
              interceptors.sort(function (a, b) {
                return (a.order || 0) - (b.order || 0);
              }),
                interceptors.length
                  ? (_loading.default.hide(),
                    ((options = Object.assign({}, playOptions)).mediaType = item.MediaType),
                    (options.item = item),
                    (function runNextPrePlay(interceptors, index, options, resolve, reject) {
                      if (index >= interceptors.length) return void resolve();
                      var interceptor = interceptors[index];
                      interceptor.intercept(options).then(function () {
                        runNextPrePlay(interceptors, index + 1, options, resolve, reject);
                      }, reject);
                    })(interceptors, 0, options, resolve, reject))
                  : resolve();
            });
          })(item, playOptions)
            .then(function () {
              playOptions.fullscreen && _loading.default.show();
              var mediaType = item.MediaType;
              return !item.Id || _itemhelper.default.isLocalItem(item)
                ? playAfterBitrateDetect(
                    getSavedMaxStreamingBitrate(_connectionmanager.default.getApiClient(item), mediaType),
                    item,
                    playOptions,
                    onPlaybackStartedFn
                  )
                : (function (apiClient, mediaType) {
                    return apiClient.getEndpointInfo().then(
                      function (endpointInfo) {
                        return ("Video" !== mediaType && "Audio" !== mediaType) ||
                          !_appsettings.default.enableAutomaticBitrateDetection(endpointInfo.IsInNetwork, mediaType)
                          ? Promise.resolve(getSavedMaxStreamingBitrate(apiClient, mediaType))
                          : apiClient.detectBitrate().then(function (bitrate) {
                              return (
                                _appsettings.default.maxStreamingBitrate(endpointInfo.IsInNetwork, mediaType, bitrate),
                                Promise.resolve(bitrate)
                              );
                            });
                      },
                      function () {
                        return Promise.resolve(getSavedMaxStreamingBitrate(apiClient, mediaType));
                      }
                    );
                  })(_connectionmanager.default.getApiClient(item), mediaType).then(function (bitrate) {
                    return playAfterBitrateDetect(bitrate, item, playOptions, onPlaybackStartedFn);
                  });
            }, onInterceptorRejection)
            .catch(onUnhandledPlaybackFailure));
    }
    function onUnhandledPlaybackFailure(err) {
      var errorCode = (err = err || {}).errorCode || "NoCompatibleStream";
      return (
        _loading.default.hide(),
        "intercept-cancel" !== errorCode && showPlaybackInfoErrorMessage(self, errorCode, !0, err.skipToNextItem),
        _events.default.trigger(self, "playbackcancelled"),
        Promise.reject()
      );
    }
    function onInterceptorRejection() {
      return Promise.reject({errorCode: "intercept-cancel"});
    }
    function playAfterBitrateDetect(maxBitrate, item, playOptions, onPlaybackStartedFn) {
      var startPosition = playOptions.startPositionTicks,
        player = getPlayer(item, playOptions),
        apiClient = item.Id ? _connectionmanager.default.getApiClient(item) : null,
        streamInfo = createStreamInfo(apiClient, item.MediaType, item, null, null, startPosition),
        activePlayer = self._currentPlayer,
        promise = activePlayer
          ? ((self._playNextAfterEnded = !1),
            (function (activePlayer, newPlayer, newItem) {
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
            })(activePlayer, player, item))
          : Promise.resolve();
      return item.Id
        ? "Photo" === item.MediaType
          ? (function (options, setAsCurrentPlayer) {
              var playStartIndex = options.startIndex || 0,
                startItem = options.items[playStartIndex],
                player = getPlayer(startItem, options);
              return (
                _loading.default.hide(),
                player.play(options).then(function () {
                  onPlaybackStarted(player, options, {item: startItem}, null, !1, setAsCurrentPlayer);
                })
              );
            })(playOptions, null == activePlayer)
          : "Game" === item.MediaType || "Book" === item.MediaType
          ? (function (options) {
              var playStartIndex = options.startIndex || 0,
                player = getPlayer((playStartIndex = options.items[playStartIndex]), options),
                playOptions = (_loading.default.hide(), {item: playStartIndex, mediaType: playStartIndex.MediaType});
              return player.play(playOptions).then(function () {
                onPlaybackStarted(player, options, playOptions, null, !1);
              });
            })(playOptions)
          : Promise.all([promise, player.getDeviceProfile(item)]).then(function (responses) {
              onPlaybackRequested(player, streamInfo);
              var responses = responses[1],
                apiClient = _connectionmanager.default.getApiClient(item),
                mediaSourceId = playOptions.mediaSourceId,
                audioStreamIndex = playOptions.audioStreamIndex,
                subtitleStreamIndex = playOptions.subtitleStreamIndex;
              return player && !enableLocalPlaylistManagement(player)
                ? (function (
                    player,
                    items,
                    deviceProfile,
                    maxBitrate,
                    apiClient,
                    startPositionTicks,
                    mediaSourceId,
                    audioStreamIndex,
                    subtitleStreamIndex,
                    startIndex
                  ) {
                    return setStreamUrls(items, deviceProfile, maxBitrate, apiClient, startPositionTicks).then(
                      function () {
                        return (
                          _loading.default.hide(),
                          player
                            .play({
                              items: items,
                              startPositionTicks: startPositionTicks || 0,
                              mediaSourceId: mediaSourceId,
                              audioStreamIndex: audioStreamIndex,
                              subtitleStreamIndex: subtitleStreamIndex,
                              startIndex: startIndex,
                            })
                            .then(function () {
                              onPlayQueueStartedFromSelfManagingPlayer.call(player, {});
                            })
                        );
                      }
                    );
                  })(
                    player,
                    playOptions.items,
                    responses,
                    maxBitrate,
                    apiClient,
                    startPosition,
                    mediaSourceId,
                    audioStreamIndex,
                    subtitleStreamIndex,
                    playOptions.startIndex
                  )
                : ((playOptions.items = null),
                  (function (
                    player,
                    apiClient,
                    deviceProfile,
                    maxBitrate,
                    item,
                    startPosition,
                    mediaSourceId,
                    audioStreamIndex,
                    subtitleStreamIndex
                  ) {
                    return getPlaybackInfo(
                      player,
                      apiClient,
                      item,
                      deviceProfile,
                      maxBitrate,
                      startPosition,
                      !0,
                      mediaSourceId,
                      audioStreamIndex,
                      subtitleStreamIndex,
                      null,
                      null
                    ).then(function (playbackInfoResult) {
                      return playbackInfoResult.ErrorCode
                        ? Promise.reject({errorCode: playbackInfoResult.ErrorCode})
                        : (function (apiClient, item, versions) {
                            var lastVersionSelected = window.localStorage.getItem("lastVersionSelected");
                            if (versions && versions.length && lastVersionSelected) {
                              for (var i = 0; i < versions.length; ++i) {
                                if (
                                  versions[i].Name &&
                                  versions[i].Name.toLowerCase().replace(" ", "").replace("-", "") ===
                                    lastVersionSelected.toLowerCase().replace(" ", "").replace("-", "")
                                ) {
                                  var tmp = versions[0];
                                  versions[0] = versions[i];
                                  versions[i] = tmp;
                                  break;
                                } else if (i == versions.length - 1) {
                                  if (versions && versions.length && versions[0].Name)
                                    window.localStorage.setItem("lastVersionSelected", versions[0].Name);
                                }
                              }
                            }
                            var promises = versions.map(function (v) {
                              return supportsDirectPlay(apiClient, 0, v);
                            });
                            return promises.length
                              ? Promise.all(promises).then(function (results) {
                                  for (var i = 0, length = versions.length; i < length; i++)
                                    versions[i].enableDirectPlay = results[i] || !1;
                                  var optimalVersion = versions.filter(function (v) {
                                    return v.enableDirectPlay;
                                  })[0];
                                  return (
                                    (optimalVersion =
                                      (optimalVersion =
                                        optimalVersion ||
                                        versions.filter(function (v) {
                                          return v.SupportsDirectStream;
                                        })[0]) ||
                                      versions.filter(function (s) {
                                        return s.SupportsTranscoding;
                                      })[0]) || versions[0]
                                  );
                                })
                              : Promise.reject();
                          })(apiClient, item, playbackInfoResult.MediaSources).then(function (mediaSource) {
                            return mediaSource
                              ? mediaSource.RequiresOpening && !mediaSource.LiveStreamId
                                ? (function (
                                    apiClient,
                                    item,
                                    playSessionId,
                                    deviceProfile,
                                    maxBitrate,
                                    startPosition,
                                    mediaSource,
                                    audioStreamIndex,
                                    subtitleStreamIndex
                                  ) {
                                    return (
                                      (deviceProfile = {
                                        DeviceProfile: deviceProfile,
                                        OpenToken: mediaSource.OpenToken,
                                      }),
                                      (mediaSource = {
                                        UserId: apiClient.getCurrentUserId(),
                                        StartTimeTicks: startPosition || 0,
                                        ItemId: item.Id,
                                        PlaySessionId: playSessionId,
                                      }),
                                      maxBitrate && (mediaSource.MaxStreamingBitrate = maxBitrate),
                                      null != audioStreamIndex && (mediaSource.AudioStreamIndex = audioStreamIndex),
                                      null != subtitleStreamIndex &&
                                        (mediaSource.SubtitleStreamIndex = subtitleStreamIndex),
                                      apiClient.ajax({
                                        url: apiClient.getUrl("LiveStreams/Open", mediaSource),
                                        type: "POST",
                                        data: JSON.stringify(deviceProfile),
                                        contentType: "application/json",
                                        dataType: "json",
                                      })
                                    );
                                  })(
                                    apiClient,
                                    item,
                                    playbackInfoResult.PlaySessionId,
                                    deviceProfile,
                                    maxBitrate,
                                    startPosition,
                                    mediaSource,
                                    null,
                                    null
                                  ).then(function (openLiveStreamResult) {
                                    return supportsDirectPlay(apiClient, 0, openLiveStreamResult.MediaSource).then(
                                      function (result) {
                                        return (
                                          (openLiveStreamResult.MediaSource.enableDirectPlay = result),
                                          {
                                            mediaSource: openLiveStreamResult.MediaSource,
                                            playSessionId: playbackInfoResult.PlaySessionId,
                                          }
                                        );
                                      }
                                    );
                                  })
                                : {mediaSource: mediaSource, playSessionId: playbackInfoResult.PlaySessionId}
                              : Promise.reject({errorCode: "NoCompatibleStream"});
                          });
                    });
                  })(
                    player,
                    apiClient,
                    responses,
                    maxBitrate,
                    item,
                    startPosition,
                    mediaSourceId,
                    audioStreamIndex,
                    subtitleStreamIndex
                  ).then(function (mediaSourceInfo) {
                    var mediaSource = mediaSourceInfo.mediaSource,
                      streamInfo = createStreamInfo(
                        apiClient,
                        item.MediaType,
                        item,
                        mediaSource,
                        mediaSourceInfo.playSessionId,
                        startPosition
                      ),
                      mediaSourceInfo = ((streamInfo.fullscreen = playOptions.fullscreen), getPlayerData(player));
                    return (
                      (mediaSourceInfo.isChangingStream = !1),
                      (mediaSourceInfo.maxStreamingBitrate = maxBitrate),
                      player.play(streamInfo).then(
                        function () {
                          _loading.default.hide(),
                            onPlaybackStartedFn(),
                            onPlaybackStarted(player, playOptions, streamInfo, mediaSource);
                        },
                        function (err) {
                          return (
                            console.log("player.play error: " + err),
                            onPlaybackStartedFn(),
                            onPlaybackStarted(player, playOptions, streamInfo, mediaSource),
                            onPlaybackError.call(player, err, {
                              type: err && err.name ? err.name : "mediadecodeerror",
                              streamInfo: streamInfo,
                              returnPromise: !0,
                            })
                          );
                        }
                      )
                    );
                  }));
            })
        : promise.then(function () {
            var streamInfo = (function (item) {
              return {
                url: item.Url || item.Path,
                playMethod: "DirectPlay",
                item: item,
                textTracks: [],
                mediaType: item.MediaType,
              };
            })(item);
            return (
              (streamInfo.fullscreen = playOptions.fullscreen),
              (getPlayerData(player).isChangingStream = !1),
              player.play(streamInfo).then(
                function () {
                  _loading.default.hide(), onPlaybackStartedFn(), onPlaybackStarted(player, playOptions, streamInfo);
                },
                function () {
                  _loading.default.hide(), self.stop(player);
                }
              )
            );
          });
    }
    function createStreamInfo(apiClient, type, item, mediaSource, playSessionId, startPosition) {
      if (item && !item.Id)
        return (function (item) {
          return {
            url: item.Url || item.Path,
            playMethod: "DirectPlay",
            item: item,
            textTracks: [],
            mediaType: item.MediaType,
          };
        })(item);
      var directOptions,
        mediaUrl,
        contentType,
        transcodingOffsetTicks = 0,
        playerStartPositionTicks = startPosition,
        liveStreamId = (mediaSource = mediaSource || {MediaStreams: []}).LiveStreamId,
        playMethod = "Transcode",
        mediaSourceContainer = (mediaSource.Container || "").toLowerCase(),
        prefix =
          ("Video" === type || "Audio" === type
            ? ((contentType = getMimeType(type.toLowerCase(), mediaSourceContainer)),
              mediaSource.enableDirectPlay
                ? ((mediaUrl = mediaSource.Path), (playMethod = "DirectPlay"))
                : mediaSource.StreamUrl
                ? ((playMethod = "Transcode"), (mediaUrl = mediaSource.StreamUrl))
                : mediaSource.SupportsDirectStream
                ? ((mediaUrl = mediaSource.DirectStreamUrl
                    ? apiClient.getUrl(mediaSource.DirectStreamUrl)
                    : ((directOptions = {
                        Static: !0,
                        mediaSourceId: mediaSource.Id,
                        deviceId: apiClient.deviceId(),
                        api_key: apiClient.accessToken(),
                      }),
                      mediaSource.ETag && (directOptions.Tag = mediaSource.ETag),
                      mediaSource.LiveStreamId && (directOptions.LiveStreamId = mediaSource.LiveStreamId),
                      (prefix = "Video" === type ? "Videos" : "Audio"),
                      (mediaSourceContainer = mediaSourceContainer.toLowerCase().replace("m4v", "mp4")),
                      apiClient.getUrl(prefix + "/" + item.Id + "/stream." + mediaSourceContainer, directOptions))),
                  (playMethod = "DirectStream"))
                : mediaSource.SupportsTranscoding &&
                  ((mediaUrl = apiClient.getUrl(mediaSource.TranscodingUrl)),
                  "hls" === mediaSource.TranscodingSubProtocol
                    ? (contentType = "application/x-mpegURL")
                    : ((playerStartPositionTicks = null),
                      (contentType = getMimeType(type.toLowerCase(), mediaSource.TranscodingContainer)),
                      mediaUrl.toLowerCase().includes("copytimestamps=true") ||
                        (transcodingOffsetTicks = startPosition || 0))))
            : ((mediaUrl = mediaSource.Path), (playMethod = "DirectPlay")),
          !mediaUrl && mediaSource.SupportsDirectPlay && ((mediaUrl = mediaSource.Path), (playMethod = "DirectPlay")),
          {
            url: mediaUrl,
            mimeType: contentType,
            transcodingOffsetTicks: transcodingOffsetTicks,
            playMethod: playMethod,
            playerStartPositionTicks: playerStartPositionTicks,
            item: item,
            mediaSource: mediaSource,
            textTracks: getTextTracks(apiClient, item, mediaSource),
            tracks: getTextTracks(apiClient, item, mediaSource),
            mediaType: type,
            liveStreamId: liveStreamId,
            playSessionId: playSessionId,
            title: item.Name,
          }),
        mediaSourceContainer = (function (apiClient, item, options) {
          return (
            ((options = options || {}).type = options.type || "Backdrop"),
            item.BackdropImageTags && item.BackdropImageTags.length
              ? ((options.tag = item.BackdropImageTags[0]), apiClient.getImageUrl(item.Id, options))
              : item.ParentBackdropImageTags && item.ParentBackdropImageTags.length
              ? ((options.tag = item.ParentBackdropImageTags[0]),
                apiClient.getImageUrl(item.ParentBackdropItemId, options))
              : null
          );
        })(apiClient, item, {});
      return mediaSourceContainer && (prefix.backdropUrl = mediaSourceContainer), prefix;
    }
    function getTextTracks(apiClient, item, mediaSource) {
      for (
        var textStreams = mediaSource.MediaStreams.filter(function (s) {
            return "Subtitle" === s.Type;
          }).filter(function (s) {
            return "External" === s.DeliveryMethod;
          }),
          tracks = [],
          i = 0,
          length = textStreams.length;
        i < length;
        i++
      ) {
        var textStream = textStreams[i],
          textStreamUrl = void 0,
          textStreamUrl =
            _itemhelper.default.isLocalItem(item) || mediaSource.IsLocal
              ? textStream.Path
              : textStream.IsExternalUrl
              ? textStream.DeliveryUrl
              : apiClient.getUrl(textStream.DeliveryUrl);
        tracks.push({
          url: textStreamUrl,
          title: textStream.DisplayTitle,
          language: textStream.Language,
          isDefault: textStream.Index === mediaSource.DefaultSubtitleStreamIndex,
          index: textStream.Index,
          format: textStream.Codec,
        });
      }
      return tracks;
    }
    function getPlayer(item, playOptions, forceLocalPlayers) {
      var serverItem = !!item.Id;
      return (function (instance, forceLocalPlayer) {
        if (!forceLocalPlayer) {
          forceLocalPlayer = instance._currentPlayer;
          if (forceLocalPlayer && !forceLocalPlayer.isLocalPlayer) return [forceLocalPlayer];
        }
        return instance.getPlayers().filter(isAutomaticPlayer);
      })(self, forceLocalPlayers).filter(function (p) {
        if (p.canPlayMediaType(item.MediaType)) {
          if (serverItem) return !p.canPlayItem || p.canPlayItem(item, playOptions);
          if (item.Url && p.canPlayUrl) return p.canPlayUrl(item.Url);
        }
        return !1;
      })[0];
    }
    function queue(options, mode, player) {
      if (!(player = player || self._currentPlayer)) return self.play(options);
      if (options.items)
        return translateItemsForPlayback(options.items, options, null, !0).then(function (items) {
          return queueAll(items, mode, player);
        });
      if (options.serverId)
        return getItemsForPlayback(options.serverId, {Ids: options.ids.join(",")}).then(function (result) {
          return translateItemsForPlayback(result.Items, options, null, !0).then(function (items) {
            return queueAll(items, mode, player);
          });
        });
      throw new Error("serverId required!");
    }
    function queueAll(items, mode, player) {
      if (items.length) {
        if (!player.isLocalPlayer)
          return "next" === mode ? player.queueNext({items: items}) : player.queue({items: items});
        var apiClient;
        if (player && !enableLocalPlaylistManagement(player))
          return (
            (apiClient = _connectionmanager.default.getApiClient(items[0].ServerId)),
            player.getDeviceProfile(items[0]).then(function (profile) {
              return setStreamUrls(items, profile, self.getMaxStreamingBitrate(player), apiClient, 0).then(function () {
                return "next" === mode ? player.queueNext(items) : player.queue(items);
              });
            })
          );
        "next" === mode ? self._playQueueManager.queueNext(items) : self._playQueueManager.queue(items),
          _events.default.trigger(player, "playlistitemadd");
      }
      return Promise.resolve();
    }
    function startPlaybackProgressTimer(player) {
      stopPlaybackProgressTimer(player),
        (player._progressInterval = setInterval(
          function () {
            sendProgressUpdate(this, "timeupdate");
          }.bind(player),
          1e4
        ));
    }
    function stopPlaybackProgressTimer(player) {
      player._progressInterval && (clearInterval(player._progressInterval), (player._progressInterval = null));
    }
    function onPlaybackRequested(player, streamInfo) {
      setCurrentPlayerInternal(player);
      setCurrentPlayer = getPlayerData(player);
      setCurrentPlayer.streamInfo = streamInfo;
      var mutation = new MutationObserver(function () {
        var volumeOsdElement = document.querySelector(".volumeOsd:not(.hide)");
        if (volumeOsdElement) {
          setTimeout(function () {
            volumeOsdElement.classList.add("hide");
          }, 50);
          mutation.disconnect();
        }
      });
      mutation.observe(document.body, {childList: true, characterData: true, subtree: true});
    }
    function onPlaybackStarted(player, playOptions, streamInfo, mediaSource, enableProgressTimer, setCurrentPlayer) {
      if (!player) throw new Error("player cannot be null");
      !1 !== setCurrentPlayer && setCurrentPlayerInternal(player);
      var playerData = getPlayerData(player);
      ((playerData.streamInfo = streamInfo).playbackStartTimeTicks = 1e4 * Date.now()),
        mediaSource
          ? ((playerData.audioStreamIndex = mediaSource.DefaultAudioStreamIndex),
            (playerData.subtitleStreamIndex = mediaSource.DefaultSubtitleStreamIndex),
            null == playerData.subtitleStreamIndex && (playerData.subtitleStreamIndex = -1))
          : ((playerData.audioStreamIndex = null), (playerData.subtitleStreamIndex = null)),
        (self._playNextAfterEnded = !0);
      var isFirstItem = "play" === playOptions.command,
        state = self.getPlayerState(player, streamInfo.item, streamInfo.mediaSource);
      window.state = Object.assign(
        {
          IsMuted: false,
          ItemId: state.NowPlayingItem.Id,
          PlaylistIndex: state.PlaylistIndex,
          PlaylistLength: state.PlaylistLength,
          NextMediaType: null,
          NowPlayingQueue: [],
        },
        state.PlayState
      );
      window.id = streamInfo.item.Id;
      !1 !== enableProgressTimer &&
        reportPlayback(self, state, 0, isFirstItem, state.NowPlayingItem.ServerId, "reportPlaybackStart"),
        isFirstItem && _events.default.trigger(self, "playqueuestart", [player, state]),
        _events.default.trigger(player, "playbackstart", [state]),
        _events.default.trigger(self, "playbackstart", [player, state]),
        !(streamInfo.started = !0) !== enableProgressTimer &&
          player.id !== "externalplayer" &&
          startPlaybackProgressTimer(player);
    }
    function onPlayQueueStartedFromSelfManagingPlayer(e, item, mediaSource) {
      item = self.getPlayerState(this, item, mediaSource);
      _events.default.trigger(self, "playqueuestart", [this, item]);
    }
    function onPlaybackStartedFromSelfManagingPlayer(e, item, mediaSource) {
      setCurrentPlayerInternal(this);
      item = self.getPlayerState(this, item, mediaSource);
      _events.default.trigger(this, "playbackstart", [item]),
        _events.default.trigger(self, "playbackstart", [this, item]);
    }
    function onPlaybackStoppedFromSelfManagingPlayer(e, playerStopInfo) {
      stopPlaybackProgressTimer(this);
      var state = self.getPlayerState(this, playerStopInfo.item, playerStopInfo.mediaSource),
        nextMediaType = playerStopInfo.nextMediaType,
        playbackStopInfo = {player: this, state: state, nextMediaType: nextMediaType};
      (state.NextMediaType = nextMediaType),
        (getPlayerData(this).streamInfo = null),
        playerStopInfo.item.Id && (state.PlayState.PositionTicks = 1e4 * (playerStopInfo.positionMs || 0)),
        _events.default.trigger(this, "playbackstop", [state]),
        _events.default.trigger(self, "playbackstop", [playbackStopInfo]),
        nextMediaType || (this.destroy(), removeCurrentPlayer(this));
    }
    function onPlaybackError(e, error) {
      var errorType = error.type,
        errorType =
          (console.log("playbackmanager playback error type: " + (errorType || "")),
          error.streamInfo || getPlayerData(this).streamInfo);
      if (errorType) {
        var error = errorType.url.toLowerCase().includes("allowvideostreamcopy=false"),
          currentlyPreventsAudioStreamCopy = errorType.url.toLowerCase().includes("allowaudiostreamcopy=false");
        if (
          (function (streamInfo, currentlyPreventsVideoStreamCopy, currentlyPreventsAudioStreamCopy) {
            return !(
              !streamInfo.mediaSource.SupportsTranscoding ||
              (currentlyPreventsVideoStreamCopy && currentlyPreventsAudioStreamCopy)
            );
          })(errorType, error, currentlyPreventsAudioStreamCopy)
        )
          return changeStream(this, getCurrentTicks(this) || errorType.playerStartPositionTicks, {
            EnableDirectPlay: !1,
            EnableDirectStream: !1,
            AllowVideoStreamCopy: "Transcode" !== errorType.playMethod && null,
            AllowAudioStreamCopy: !currentlyPreventsAudioStreamCopy && !error && null,
          });
      }
      return onPlaybackStopped.call(this, e, {errorCode: "NoCompatibleStream"});
    }
    function onPlaybackStopped(e, playerStopInfo) {
      var playerData = getPlayerData(this);
      if (!playerData.isChangingStream) {
        stopPlaybackProgressTimer(this);
        var state = self.getPlayerState(this),
          streamInfo = playerData.streamInfo,
          playerData =
            ((playerData.streamInfo = null),
            (playerStopInfo = playerStopInfo || {}),
            self._playNextAfterEnded && !1 !== playerStopInfo.playNext
              ? self._playQueueManager.getNextItemInfo()
              : null),
          nextMediaType = playerData ? playerData.item.MediaType : null,
          playbackStopInfo = {player: this, state: state, nextMediaType: nextMediaType},
          nextMediaType =
            ((state.NextMediaType = nextMediaType),
            playerData || self._playQueueManager.reset(),
            streamInfo &&
              streamInfo.item.Id &&
              (!1 === this.supportsProgress &&
                state.PlayState &&
                !state.PlayState.PositionTicks &&
                (state.PlayState.PositionTicks = streamInfo.item.RunTimeTicks),
              reportPlayback(self, state, 0, !playerData, streamInfo.item.ServerId, "reportPlaybackStopped")),
            _events.default.trigger(this, "playbackstop", [state]),
            _events.default.trigger(self, "playbackstop", [playbackStopInfo]),
            (playerData && playerData.item.playOptions) || {fullscreen: !0});
        if (
          ((playerData ? getPlayer(playerData.item, nextMediaType) : null) !== this &&
            (this.destroy(), removeCurrentPlayer(this)),
          playerStopInfo.errorCode)
        )
          return playerStopInfo.returnPromise
            ? Promise.reject(playerStopInfo)
            : void showPlaybackInfoErrorMessage(
                self,
                playerStopInfo.errorCode,
                !streamInfo || streamInfo.fullscreen,
                playerData
              );
        playerData
          ? self.nextTrack()
          : self._playNextAfterEnded &&
            streamInfo &&
            streamInfo.item.Id &&
            "TvChannel" === streamInfo.item.Type &&
            (playbackStopInfo = (streamInfo.mediaSource || {}).RunTimeTicks) &&
            (state.PlayState.PositionTicks || 0) >= playbackStopInfo &&
            self.play({ids: [streamInfo.item.Id], serverId: streamInfo.item.ServerId});
      }
    }
    function bindStopped(player) {
      enableLocalPlaylistManagement(player) &&
        (_events.default.off(player, "stopped", onPlaybackStopped),
        _events.default.on(player, "stopped", onPlaybackStopped));
    }
    function onPlaybackTimeUpdate(e) {
      sendProgressUpdate(this, "timeupdate");
    }
    function onAudioTrackChange(e) {
      sendProgressUpdate(this, "audiotrackchange");
    }
    function onSubtitleTrackChange(e) {
      sendProgressUpdate(this, "subtitletrackchange");
    }
    function onPlaybackPause(e) {
      sendProgressUpdate(this, "pause");
    }
    function onPlaybackUnpause(e) {
      sendProgressUpdate(this, "unpause");
    }
    function onPlaybackVolumeChange(e) {
      sendProgressUpdate(this, "volumechange");
    }
    function onRepeatModeChange(e) {
      sendProgressUpdate(this, "repeatmodechange");
    }
    function onSubtitleOffsetChange(e) {
      sendProgressUpdate(this, "subtitleoffsetchange");
    }
    function onPlaybackRateChange(e) {
      sendProgressUpdate(this, "playbackratechange");
    }
    function onPlaylistItemMove(e) {
      sendProgressUpdate(this, "playlistitemmove", !0);
    }
    function onPlaylistItemRemove(e, info) {
      sendProgressUpdate(this, "playlistitemremove", !0, {PlaylistItemIds: info ? info.PlaylistItemIds : null});
    }
    function onPlaylistItemAdd(e) {
      sendProgressUpdate(this, "playlistitemadd", !0);
    }
    function onPlayerShutdown(e) {
      removeCurrentPlayer(this);
    }
    function initMediaPlayer(player) {
      players.push(player),
        players.sort(function (a, b) {
          return (a.priority || 0) - (b.priority || 0);
        }),
        !1 !== player.isLocalPlayer && (player.isLocalPlayer = !0),
        (player.currentState = {}),
        (player.getVolume && player.setVolume) ||
          (function (player) {
            (player.getVolume = function () {
              return player.volume();
            }),
              (player.setVolume = function (val) {
                return player.volume(val);
              });
          })(player),
        enableLocalPlaylistManagement(player)
          ? (_events.default.on(player, "error", onPlaybackError),
            _events.default.on(player, "timeupdate", onPlaybackTimeUpdate),
            _events.default.on(player, "audiotrackchange", onAudioTrackChange),
            _events.default.on(player, "subtitletrackchange", onSubtitleTrackChange),
            _events.default.on(player, "pause", onPlaybackPause),
            _events.default.on(player, "unpause", onPlaybackUnpause),
            _events.default.on(player, "volumechange", onPlaybackVolumeChange),
            _events.default.on(player, "repeatmodechange", onRepeatModeChange),
            _events.default.on(player, "subtitleoffsetchange", onSubtitleOffsetChange),
            _events.default.on(player, "playbackratechange", onPlaybackRateChange),
            _events.default.on(player, "playlistitemmove", onPlaylistItemMove),
            _events.default.on(player, "playlistitemremove", onPlaylistItemRemove),
            _events.default.on(player, "playlistitemadd", onPlaylistItemAdd))
          : player.isLocalPlayer &&
            (_events.default.on(player, "itemstarted", onPlaybackStartedFromSelfManagingPlayer),
            _events.default.on(player, "itemstopped", onPlaybackStoppedFromSelfManagingPlayer),
            _events.default.on(player, "playqueuestarted", onPlayQueueStartedFromSelfManagingPlayer),
            _events.default.on(player, "audiotrackchange", onAudioTrackChange),
            _events.default.on(player, "subtitletrackchange", onSubtitleTrackChange),
            _events.default.on(player, "subtitleoffsetchange", onSubtitleOffsetChange),
            _events.default.on(player, "playbackratechange", onPlaybackRateChange),
            _events.default.on(player, "playlistitemmove", onPlaylistItemMove),
            _events.default.on(player, "playlistitemremove", onPlaylistItemRemove),
            _events.default.on(player, "playlistitemadd", onPlaylistItemAdd),
            _events.default.on(player, "shutdown", onPlayerShutdown)),
        player.isLocalPlayer &&
          (function (player) {
            _events.default.on(_servicelocator.fullscreenManager, "fullscreenchange", function () {
              _events.default.trigger(player, "fullscreenchange");
            });
          })(player),
        bindStopped(player);
    }
    function sendProgressUpdate(player, progressEventName, reportPlaylist, additionalData) {
      if (!player) throw new Error("player cannot be null");
      var state,
        serverId,
        playerData = getPlayerData(player);
      playerData.isChangingStream ||
        ((state = self.getPlayerState(player)).NowPlayingItem &&
          ((serverId = state.NowPlayingItem.ServerId),
          (((playerData = playerData.streamInfo) && playerData.started) || !enableLocalPlaylistManagement(player)) &&
            reportPlayback(
              self,
              state,
              0,
              reportPlaylist,
              serverId,
              "reportPlaybackProgress",
              progressEventName,
              additionalData
            ),
          playerData &&
            playerData.liveStreamId &&
            6e5 <= Date.now() - (playerData.lastMediaInfoQuery || 0) &&
            (function (player, streamInfo, mediaSource, liveStreamId, serverId) {
              console.log("getLiveStreamMediaInfo"), (streamInfo.lastMediaInfoQuery = Date.now());
              streamInfo = _connectionmanager.default.getApiClient(serverId);
              if (!streamInfo.isMinServerVersion("4.7.0.19"))
                _connectionmanager.default
                  .getApiClient(serverId)
                  .getLiveStreamMediaInfo(liveStreamId)
                  .then(
                    function (info) {
                      console.log("current mediastreams: " + JSON.stringify(mediaSource.MediaStreams)),
                        console.log("new mediastreams: " + JSON.stringify(info.MediaStreams)),
                        (mediaSource.MediaStreams = info.MediaStreams),
                        _events.default.trigger(player, "mediastreamschange");
                    },
                    function () {}
                  );
            })(player, playerData, self.currentMediaSource(player), playerData.liveStreamId, serverId)));
    }
    (this._playQueueManager = new _playqueuemanager.default()),
      (self.currentItem = function (player) {
        if (!(player = player || self._currentPlayer)) return null;
        if (player.currentItem) return player.currentItem();
        player = getPlayerData(player);
        return player.streamInfo ? player.streamInfo.item : null;
      }),
      (self.currentMediaSource = function (player) {
        if (!player) throw new Error("player cannot be null");
        if (player.currentMediaSource) return player.currentMediaSource();
        player = getPlayerData(player);
        return player.streamInfo ? player.streamInfo.mediaSource : null;
      }),
      (self.playMethod = function (player) {
        if (!player) throw new Error("player cannot be null");
        if (player.playMethod) return player.playMethod();
        player = getPlayerData(player);
        return player.streamInfo ? player.streamInfo.playMethod : null;
      }),
      (self.playSessionId = function (player) {
        if (!player) throw new Error("player cannot be null");
        if (player.playSessionId) return player.playSessionId();
        player = getPlayerData(player);
        return player.streamInfo ? player.streamInfo.playSessionId : null;
      }),
      (self.getPlayerInfo = function (player) {
        if (!(player = player || self._currentPlayer)) return null;
        var target = currentTargetInfo || {};
        return {
          name: player.name,
          isLocalPlayer: player.isLocalPlayer,
          id: target.id,
          playerName: target.playerName,
          deviceName: target.deviceName,
          playableMediaTypes: target.playableMediaTypes,
          supportedCommands: target.supportedCommands,
        };
      }),
      (self.setActivePlayer = function (player, targetInfo) {
        if ("localplayer" === player || "localplayer" === player.name)
          (self._currentPlayer && self._currentPlayer.isLocalPlayer) || setCurrentPlayerInternal(null, null);
        else {
          if (
            !(player =
              "string" == typeof player
                ? players.filter(function (p) {
                    return p.name === player;
                  })[0]
                : player)
          )
            throw new Error("null player");
          setCurrentPlayerInternal(player, targetInfo);
        }
      }),
      (self.isPairing = function () {
        return self._isPairing;
      }),
      (self.trySetActivePlayer = function (player, targetInfo) {
        if ("localplayer" === player || "localplayer" === player.name)
          return self._currentPlayer && self._currentPlayer.isLocalPlayer, void (self._isPairing = !1);
        if (
          !(player =
            "string" == typeof player
              ? players.filter(function (p) {
                  return p.name === player;
                })[0]
              : player)
        )
          throw new Error("null player");
        var promise;
        currentPairingId === targetInfo.id
          ? (self._isPairing = !1)
          : ((currentPairingId = targetInfo.id),
            (promise = player.tryPair ? player.tryPair(targetInfo) : Promise.resolve()),
            (self._isPairing = !0),
            _events.default.trigger(self, "pairing"),
            promise.then(
              function () {
                (self._isPairing = !1),
                  _events.default.trigger(self, "paired"),
                  setCurrentPlayerInternal(player, targetInfo);
              },
              function () {
                (self._isPairing = !1),
                  _events.default.trigger(self, "pairerror"),
                  currentPairingId === targetInfo.id && (currentPairingId = null);
              }
            ));
      }),
      (self.getTargets = function () {
        var promises = players.filter(displayPlayerIndividually).map(getPlayerTargets);
        return Promise.all(promises).then(function (responses) {
          for (var targets = [], i = 0; i < responses.length; i++)
            for (var subTargets = responses[i], j = 0; j < subTargets.length; j++) targets.push(subTargets[j]);
          return (targets = targets.sort(sortPlayerTargets));
        });
      }),
      (self.getPlaylist = function (options, player) {
        return (player = player || self._currentPlayer) && !enableLocalPlaylistManagement(player)
          ? player.getPlaylist(options)
          : Promise.resolve(self._playQueueManager.getPlaylistResult(options));
      }),
      (self.isPlaying = function (player) {
        return (player = player || self._currentPlayer) && player.isPlaying
          ? player.isPlaying()
          : null != player && null != player.currentSrc();
      }),
      (self.isPlayingMediaType = function (mediaTypes, player) {
        return (
          (player = player || self._currentPlayer),
          Array.isArray(mediaTypes) || (mediaTypes = [mediaTypes]),
          player && player.isPlaying
            ? 0 <
              mediaTypes.filter(function (mediaType) {
                return player.isPlaying(mediaType);
              }).length
            : !!self.isPlaying(player) &&
              (streamInfo = (streamInfo = getPlayerData(player).streamInfo) ? streamInfo.mediaType : null) &&
              mediaTypes.includes(streamInfo)
        );
        var streamInfo;
      }),
      (self.getCurrentMediaType = function (player) {
        player = getPlayerData((player = player || self._currentPlayer)).streamInfo;
        return player ? player.mediaType : null;
      }),
      (self.isPlayingLocally = function (mediaTypes, player) {
        return (
          !(!(player = player || self._currentPlayer) || !player.isLocalPlayer) &&
          self.isPlayingMediaType(mediaTypes, player)
        );
      }),
      (self.isPlayingVideo = function (player) {
        return self.isPlayingMediaType(["Video"], player);
      }),
      (self.isPlayingAudio = function (player) {
        return self.isPlayingMediaType(["Audio"], player);
      }),
      (self.getPlayers = function () {
        return players;
      }),
      (self.canPlay = function (item) {
        var itemType = item.Type;
        if (
          "PhotoAlbum" === itemType ||
          "MusicGenre" === itemType ||
          "Season" === itemType ||
          "Series" === itemType ||
          "BoxSet" === itemType ||
          "MusicAlbum" === itemType ||
          "MusicArtist" === itemType ||
          "Playlist" === itemType ||
          "CollectionFolder" === itemType
        )
          return !0;
        if ("playlists" === item.CollectionType) return !0;
        if ("Virtual" === item.LocationType && "Program" !== itemType) return !1;
        if ("Program" === itemType) {
          if (!item.EndDate || !item.StartDate) return !1;
          if (Date.now() > Date.parse(item.EndDate) || Date.now() < Date.parse(item.StartDate)) return !1;
        }
        return null != getPlayer(item, {fullscreen: !0});
      }),
      (self.toggleAspectRatio = function (player) {
        if ((player = player || self._currentPlayer)) {
          for (
            var current = self.getAspectRatio(player),
              supported = self.getSupportedAspectRatios(player),
              index = -1,
              i = 0,
              length = supported.length;
            i < length;
            i++
          )
            if (supported[i].id === current) {
              index = i;
              break;
            }
          ++index >= supported.length && (index = 0), self.setAspectRatio(supported[index].id, player);
        }
      }),
      (self.setAspectRatio = function (val, player) {
        (player = player || self._currentPlayer) && player.setAspectRatio && player.setAspectRatio(val);
      }),
      (self.getSupportedAspectRatios = function (player) {
        return (player = player || self._currentPlayer) && player.getSupportedAspectRatios
          ? player.getSupportedAspectRatios()
          : [];
      }),
      (self.getAspectRatio = function (player) {
        if ((player = player || self._currentPlayer) && player.getAspectRatio) return player.getAspectRatio();
      }),
      (self.setBrightness = function (val, player) {
        (player = player || self._currentPlayer) && player.setBrightness(val);
      }),
      (self.getBrightness = function (player) {
        if ((player = player || self._currentPlayer)) return player.getBrightness();
      }),
      (self.setVolume = function (val, player) {
        (player = player || self._currentPlayer) && player.setVolume(val);
      }),
      (self.getVolume = function (player) {
        if ((player = player || self._currentPlayer)) return player.getVolume();
      }),
      (self.volumeUp = function (player) {
        (player = player || self._currentPlayer) && player.volumeUp();
      }),
      (self.volumeDown = function (player) {
        (player = player || self._currentPlayer) && player.volumeDown();
      }),
      (self.changeAudioStream = function (player) {
        if ((player = player || self._currentPlayer) && !enableLocalPlaylistManagement(player))
          return player.changeAudioStream();
        if (!player) return Promise.resolve();
        for (
          var currentMediaSource = self.currentMediaSource(player),
            mediaStreams = [],
            i = 0,
            length = currentMediaSource.MediaStreams.length;
          i < length;
          i++
        )
          "Audio" === currentMediaSource.MediaStreams[i].Type && mediaStreams.push(currentMediaSource.MediaStreams[i]);
        if (mediaStreams.length <= 1) return Promise.resolve();
        var currentStreamIndex = self.getAudioStreamIndex(player),
          indexInList = -1;
        for (i = 0, length = mediaStreams.length; i < length; i++)
          if (mediaStreams[i].Index === currentStreamIndex) {
            indexInList = i;
            break;
          }
        var nextIndex =
          -1 === (nextIndex = (nextIndex = indexInList + 1) >= mediaStreams.length ? 0 : nextIndex)
            ? -1
            : mediaStreams[nextIndex].Index;
        return self.setAudioStreamIndex(nextIndex, player);
      }),
      (self.changeSubtitleStream = function (player) {
        if (!(player = player || self._currentPlayer)) return Promise.resolve();
        for (
          var currentMediaSource = self.currentMediaSource(player),
            mediaStreams = [],
            i = 0,
            length = currentMediaSource.MediaStreams.length;
          i < length;
          i++
        )
          "Subtitle" === currentMediaSource.MediaStreams[i].Type &&
            mediaStreams.push(currentMediaSource.MediaStreams[i]);
        if (!mediaStreams.length) return Promise.resolve();
        var currentStreamIndex = self.getSubtitleStreamIndex(player),
          indexInList = -1;
        for (i = 0, length = mediaStreams.length; i < length; i++)
          if (mediaStreams[i].Index === currentStreamIndex) {
            indexInList = i;
            break;
          }
        var nextIndex =
          -1 === (nextIndex = (nextIndex = indexInList + 1) >= mediaStreams.length ? -1 : nextIndex)
            ? -1
            : mediaStreams[nextIndex].Index;
        return self.setSubtitleStreamIndex(nextIndex, player);
      }),
      (self.getAudioStreamIndex = function (player) {
        return (player = player || self._currentPlayer) && !enableLocalPlaylistManagement(player)
          ? player.getAudioStreamIndex()
          : getPlayerData(player).audioStreamIndex;
      }),
      (self.isAudioStreamSupported = function (stream, mediaSource, deviceProfile) {
        var audioCodec = (stream.Codec || "").toLowerCase(),
          container = (mediaSource.Container || "").toLowerCase();
        return (
          !deviceProfile ||
          0 <
            (deviceProfile.DirectPlayProfiles || []).filter(function (p) {
              return (
                "Video" === p.Type &&
                !(p.Container && !formatIncludesValue(p.Container, container)) &&
                !(p.AudioCodec && !formatIncludesValue(p.AudioCodec, audioCodec))
              );
            }).length
        );
      }),
      (self.setAudioStreamIndex = function (index, player) {
        return (player = player || self._currentPlayer) && !player.isLocalPlayer
          ? player.setAudioStreamIndex(index)
          : "Transcode" !== self.playMethod(player) && player.canSetAudioStreamIndex()
          ? player.getDeviceProfile(self.currentItem(player)).then(function (profile) {
              if (
                !(function (mediaSource, index, deviceProfile) {
                  for (
                    var mediaStream, mediaStreams = mediaSource.MediaStreams, i = 0, length = mediaStreams.length;
                    i < length;
                    i++
                  )
                    if ("Audio" === mediaStreams[i].Type && mediaStreams[i].Index === index) {
                      mediaStream = mediaStreams[i];
                      break;
                    }
                  return mediaStream && self.isAudioStreamSupported(mediaStream, mediaSource, deviceProfile);
                })(self.currentMediaSource(player), index, profile)
              )
                return changeStream(player, getCurrentTicks(player), {AudioStreamIndex: index}, "audiotrackchange");
              player.setAudioStreamIndex(index),
                (getPlayerData(player).audioStreamIndex = index),
                _events.default.trigger(player, "audiotrackchange");
            })
          : changeStream(player, getCurrentTicks(player), {AudioStreamIndex: index}, "audiotrackchange");
      }),
      (self.getMaxStreamingBitrate = function (player) {
        if ((player = player || self._currentPlayer) && player.getMaxStreamingBitrate)
          return player.getMaxStreamingBitrate();
        var playerData = getPlayerData(player);
        if (playerData.maxStreamingBitrate) return playerData.maxStreamingBitrate;
        (playerData = playerData.streamInfo ? playerData.streamInfo.mediaType : null),
          (player = self.currentItem(player));
        return getSavedMaxStreamingBitrate(
          player
            ? _connectionmanager.default.getApiClient(player.ServerId)
            : _connectionmanager.default.currentApiClient(),
          playerData
        );
      }),
      (self.enableAutomaticBitrateDetection = function (player) {
        if ((player = player || self._currentPlayer) && player.enableAutomaticBitrateDetection)
          return player.enableAutomaticBitrateDetection();
        var playerData = getPlayerData(player),
          playerData = playerData.streamInfo ? playerData.streamInfo.mediaType : null,
          player = self.currentItem(player),
          player =
            (player
              ? _connectionmanager.default.getApiClient(player.ServerId)
              : _connectionmanager.default.currentApiClient()
            ).getSavedEndpointInfo() || {};
        return _appsettings.default.enableAutomaticBitrateDetection(player.IsInNetwork, playerData);
      }),
      (self.setMaxStreamingBitrate = function (options, player) {
        if ((player = player || self._currentPlayer) && player.setMaxStreamingBitrate)
          return player.setMaxStreamingBitrate(options);
        var apiClient = _connectionmanager.default.getApiClient(self.currentItem(player).ServerId);
        return apiClient.getEndpointInfo().then(function (endpointInfo) {
          var playerData = getPlayerData(player),
            mediaType = playerData.streamInfo ? playerData.streamInfo.mediaType : null,
            playerData = options.enableAutomaticBitrateDetection
              ? (_appsettings.default.enableAutomaticBitrateDetection(endpointInfo.IsInNetwork, mediaType, !0),
                apiClient.detectBitrate(!0))
              : (_appsettings.default.enableAutomaticBitrateDetection(endpointInfo.IsInNetwork, mediaType, !1),
                Promise.resolve(options.maxBitrate));
          return playerData.then(function (bitrate) {
            return (
              _appsettings.default.maxStreamingBitrate(endpointInfo.IsInNetwork, mediaType, bitrate),
              changeStream(player, getCurrentTicks(player), {MaxStreamingBitrate: bitrate}, "qualitychange")
            );
          });
        });
      }),
      (self.isFullscreen = function (player) {
        return !(player = player || self._currentPlayer).isLocalPlayer || player.isFullscreen
          ? player.isFullscreen()
          : _servicelocator.fullscreenManager.isFullScreen();
      }),
      (self.toggleFullscreen = function (player) {
        if (!(player = player || self._currentPlayer).isLocalPlayer || player.toggleFulscreen)
          return player.toggleFulscreen();
        _servicelocator.fullscreenManager.isFullScreen()
          ? _servicelocator.fullscreenManager.exitFullscreen()
          : _servicelocator.fullscreenManager.requestFullscreen();
      }),
      (self.togglePictureInPicture = function (player) {
        return (player = player || self._currentPlayer).togglePictureInPicture();
      }),
      (self.getSubtitleStreamIndex = function (player) {
        if ((player = player || self._currentPlayer) && !enableLocalPlaylistManagement(player))
          return player.getSubtitleStreamIndex();
        if (player) return getPlayerData(player).subtitleStreamIndex;
        throw new Error("player cannot be null");
      }),
      (self.getSubtitleStream = function (player) {
        player = player || self._currentPlayer;
        var index = self.getSubtitleStreamIndex(player);
        return null == index || -1 === index ? null : getSubtitleStream(player, index);
      }),
      (self.setSubtitleStreamIndex = function (index, player, refreshMediaSource) {
        if ((player = player || self._currentPlayer) && !player.isLocalPlayer)
          return player.setSubtitleStreamIndex(index, refreshMediaSource);
        var currentStream = self.getSubtitleStream(player),
          newStream = getSubtitleStream(player, index);
        if (currentStream || newStream || refreshMediaSource) {
          var selectedTrackElementIndex = -1,
            currentPlayMethod = self.playMethod(player);
          if (refreshMediaSource)
            return changeStream(player, getCurrentTicks(player), {SubtitleStreamIndex: index}, "subtitletrackchange");
          if (currentStream && !newStream) {
            if (
              "Encode" === getDeliveryMethod(currentStream) ||
              ("Embed" === getDeliveryMethod(currentStream) && "Transcode" === currentPlayMethod)
            )
              return changeStream(player, getCurrentTicks(player), {SubtitleStreamIndex: -1}, "subtitletrackchange");
          } else if (!currentStream && newStream)
            if ("External" === getDeliveryMethod(newStream) || "Hls" === getDeliveryMethod(newStream))
              selectedTrackElementIndex = index;
            else if ("VideoSideData" === getDeliveryMethod(newStream)) selectedTrackElementIndex = index;
            else {
              if ("Embed" !== getDeliveryMethod(newStream) || "Transcode" === currentPlayMethod)
                return changeStream(
                  player,
                  getCurrentTicks(player),
                  {SubtitleStreamIndex: index},
                  "subtitletrackchange"
                );
              selectedTrackElementIndex = index;
            }
          else if (currentStream && newStream) {
            if (
              "External" !== getDeliveryMethod(newStream) &&
              "Hls" !== getDeliveryMethod(newStream) &&
              "VideoSideData" !== getDeliveryMethod(newStream) &&
              ("Embed" !== getDeliveryMethod(newStream) || "Transcode" === currentPlayMethod)
            )
              return changeStream(player, getCurrentTicks(player), {SubtitleStreamIndex: index}, "subtitletrackchange");
            if (
              ((selectedTrackElementIndex = index),
              "External" !== getDeliveryMethod(currentStream) &&
                "Hls" !== getDeliveryMethod(currentStream) &&
                "Embed" !== getDeliveryMethod(currentStream) &&
                "VideoSideData" !== getDeliveryMethod(currentStream))
            )
              return changeStream(player, getCurrentTicks(player), {SubtitleStreamIndex: -1}, "subtitletrackchange");
          }
          refreshMediaSource = player.setSubtitleStreamIndex(selectedTrackElementIndex);
          return (
            (getPlayerData(player).subtitleStreamIndex = index),
            _events.default.trigger(player, "subtitletrackchange"),
            refreshMediaSource
          );
        }
      }),
      (self.seek = function (ticks, player) {
        return (
          (ticks = Math.max(0, ticks)),
          (player = player || self._currentPlayer) && !enableLocalPlaylistManagement(player)
            ? player.isLocalPlayer
              ? player.seek((ticks || 0) / 1e4)
              : player.seek(ticks)
            : changeStream(player, ticks)
        );
      }),
      (self.seekRelative = function (offsetTicks, player) {
        if (
          (player = player || self._currentPlayer) &&
          player.seekRelative &&
          (!enableLocalPlaylistManagement(player) || (player.isLocalPlayer && canPlayerSeek(player)))
        )
          return player.isLocalPlayer
            ? player.seekRelative((offsetTicks || 0) / 1e4)
            : player.seekRelative(offsetTicks);
        offsetTicks = getCurrentTicks(player) + offsetTicks;
        return this.seek(offsetTicks, player);
      }),
      (self.play = function (options) {
        if ((normalizePlayOptions(options), self._currentPlayer)) {
          if (!1 === options.enableRemotePlayers && !self._currentPlayer.isLocalPlayer) return Promise.reject();
          if (!self._currentPlayer.isLocalPlayer) return self._currentPlayer.play(options);
        }
        if (options.items)
          return translateItemsForPlayback(options.items, options, !0).then(function (items) {
            return playWithIntros(items, options);
          });
        if (options.serverId)
          return (
            options.fullscreen && _loading.default.show(),
            getItemsForPlayback(options.serverId, {Ids: options.ids.join(",")}).then(function (result) {
              return translateItemsForPlayback(result.Items, options).then(function (items) {
                return playWithIntros(items, options);
              });
            })
          );
        throw new Error("serverId required!");
      }),
      (self.getPlayerState = function (player, item, mediaSource) {
        if (!(player = player || self._currentPlayer)) throw new Error("player cannot be null");
        if (!enableLocalPlaylistManagement(player) && player.getPlayerState) return player.getPlayerState();
        (item = item || self.currentItem(player)), (mediaSource = mediaSource || self.currentMediaSource(player));
        var state = {PlayState: {}},
          currentPlayOptions = item ? item.playOptions : null;
        return (
          (state.IsBackgroundPlayback = currentPlayOptions
            ? !1 === currentPlayOptions.fullscreen
            : self._isBackgroundPlaybackHack),
          player &&
            ((state.PlayState.VolumeLevel = player.getVolume()),
            (state.PlayState.IsMuted = player.isMuted()),
            (state.PlayState.IsPaused = player.paused()),
            (state.PlayState.RepeatMode = self.getRepeatMode(player)),
            (state.PlayState.SubtitleOffset = self.getSubtitleOffset(player)),
            (state.PlayState.PlaybackRate = self.getPlaybackRate(player)),
            (state.PlayState.MaxStreamingBitrate = self.getMaxStreamingBitrate(player)),
            (state.PlayState.PositionTicks = getCurrentTicks(player)),
            (state.PlayState.PlaybackStartTimeTicks = self.playbackStartTime(player)),
            (state.PlayState.SubtitleStreamIndex = self.getSubtitleStreamIndex(player)),
            (state.PlayState.AudioStreamIndex = self.getAudioStreamIndex(player)),
            (state.PlayState.BufferedRanges = self.getBufferedRanges(player)),
            (state.PlayState.PlayMethod = self.playMethod(player)),
            mediaSource && (state.PlayState.LiveStreamId = mediaSource.LiveStreamId),
            (state.PlayState.PlaySessionId = self.playSessionId(player)),
            (state.PlaylistItemId = self.getCurrentPlaylistItemId(player)),
            (state.PlaylistIndex = self.getCurrentPlaylistIndex(player)),
            (state.PlaylistLength = self.getCurrentPlaylistLength(player))),
          mediaSource &&
            ((state.PlayState.MediaSourceId = mediaSource.Id),
            (state.NowPlayingItem = {
              RunTimeTicks: mediaSource.RunTimeTicks,
              Container: mediaSource.Container,
              Bitrate: mediaSource.Bitrate,
            }),
            (state.PlayState.CanSeek = 0 < (mediaSource.RunTimeTicks || 0) || canPlayerSeek(player))),
          item &&
            (state.NowPlayingItem = (function (player, item, mediaSource) {
              return (
                ((item = Object.assign({}, item)).playOptions = null),
                delete item.playOptions,
                mediaSource &&
                  ((item.RunTimeTicks = mediaSource.RunTimeTicks),
                  (item.MediaStreams = mediaSource.MediaStreams),
                  (item.Container = mediaSource.Container),
                  (item.Bitrate = mediaSource.Bitrate),
                  (item.MediaSources = null),
                  delete item.MediaSources),
                item.RunTimeTicks || ((mediaSource = player.duration()) && (item.RunTimeTicks = 1e4 * mediaSource)),
                item
              );
            })(player, item, mediaSource)),
          (state.MediaSource = mediaSource),
          state
        );
      }),
      (self.duration = function (player) {
        if ((player = player || self._currentPlayer) && !enableLocalPlaylistManagement(player) && !player.isLocalPlayer)
          return player.duration();
        if (!player) throw new Error("player cannot be null");
        var mediaSource = self.currentMediaSource(player);
        if (mediaSource && mediaSource.RunTimeTicks) return mediaSource.RunTimeTicks;
        mediaSource = player.duration();
        return mediaSource && (mediaSource *= 1e4), mediaSource;
      }),
      (self.getCurrentTicks = getCurrentTicks),
      (self.getPlaybackMediaSources = function (item, options) {
        var startPosition = (options = options || {}).startPositionTicks || 0,
          mediaType = options.mediaType || item.MediaType,
          player = getPlayer(item, options, !0),
          apiClient = _connectionmanager.default.getApiClient(item),
          options = _itemhelper.default.isLocalItem(item) ? Promise.resolve() : apiClient.getEndpointInfo();
        return Promise.all([options, player.getDeviceProfile(item)]).then(function (responses) {
          var responses = responses[1],
            maxBitrate = getSavedMaxStreamingBitrate(_connectionmanager.default.getApiClient(item), mediaType);
          return getPlaybackInfo(
            player,
            apiClient,
            item,
            responses,
            maxBitrate,
            startPosition,
            !1,
            null,
            null,
            null,
            null,
            null
          ).then(function (playbackInfoResult) {
            return playbackInfoResult.MediaSources;
          });
        });
      }),
      (self.setCurrentPlaylistItem = function (playlistItemId, player) {
        if ((player = player || self._currentPlayer) && !enableLocalPlaylistManagement(player))
          return player.setCurrentPlaylistItem(playlistItemId);
        for (
          var newItem, newItemIndex, playlist = self._playQueueManager.getPlaylist(), i = 0, length = playlist.length;
          i < length;
          i++
        )
          if (playlist[i].PlaylistItemId === playlistItemId) {
            (newItem = playlist[i]), (newItemIndex = i);
            break;
          }
        return newItem
          ? (((player = newItem.playOptions || {}).command = "setCurrentPlaylistItem"),
            playInternal(newItem, player, function () {
              setPlaylistState(newItem.PlaylistItemId, newItemIndex);
            }))
          : Promise.reject();
      }),
      (self.removeFromPlaylist = function (playlistItemIds, player) {
        if (!playlistItemIds) throw new Error("Invalid playlistItemIds");
        if ((player = player || self._currentPlayer) && !enableLocalPlaylistManagement(player))
          return player.removeFromPlaylist(playlistItemIds);
        var removeResult = self._playQueueManager.removeFromPlaylist(playlistItemIds);
        if ("empty" === removeResult.result) return self.stop(player);
        removeResult = removeResult.isCurrentIndex;
        return (
          _events.default.trigger(player, "playlistitemremove", [{PlaylistItemIds: playlistItemIds}]),
          removeResult
            ? self.setCurrentPlaylistItem(self._playQueueManager.getPlaylist()[0].PlaylistItemId, player)
            : Promise.resolve()
        );
      }),
      (self.movePlaylistItem = function (playlistItemId, newIndex, player) {
        if ((player = player || self._currentPlayer) && !enableLocalPlaylistManagement(player))
          return player.movePlaylistItem(playlistItemId, newIndex);
        playlistItemId = self._playQueueManager.movePlaylistItem(playlistItemId, newIndex);
        return (
          "noop" !== playlistItemId.result &&
            _events.default.trigger(player, "playlistitemmove", [
              {playlistItemId: playlistItemId.playlistItemId, newIndex: playlistItemId.newIndex},
            ]),
          Promise.resolve()
        );
      }),
      (self.getCurrentPlaylistIndex = function (player) {
        return (
          (player = player || self._currentPlayer) && !enableLocalPlaylistManagement(player)
            ? player
            : self._playQueueManager
        ).getCurrentPlaylistIndex();
      }),
      (self.getCurrentPlaylistLength = function (player) {
        return (
          (player = player || self._currentPlayer) && !enableLocalPlaylistManagement(player)
            ? player
            : self._playQueueManager
        ).getCurrentPlaylistLength();
      }),
      (self.getCurrentPlaylistItemId = function (player) {
        return (
          (player = player || self._currentPlayer) && !enableLocalPlaylistManagement(player)
            ? player
            : self._playQueueManager
        ).getCurrentPlaylistItemId();
      }),
      (self.channelUp = function (player) {
        return (player = player || self._currentPlayer), self.nextTrack(player);
      }),
      (self.channelDown = function (player) {
        return (player = player || self._currentPlayer), self.previousTrack(player);
      }),
      (self.nextTrack = function (player) {
        if ((player = player || self._currentPlayer) && !enableLocalPlaylistManagement(player))
          return player.nextTrack();
        var newItemInfo = self._playQueueManager.getNextItemInfo();
        return newItemInfo
          ? (console.log("playing next track"),
            ((player = newItemInfo.item.playOptions || {}).startPositionTicks = 0),
            (player.command = "nextTrack"),
            playInternal(newItemInfo.item, player, function () {
              setPlaylistState(newItemInfo.item.PlaylistItemId, newItemInfo.index);
            }))
          : Promise.resolve();
      }),
      (self.previousTrack = function (player) {
        if ((player = player || self._currentPlayer) && !enableLocalPlaylistManagement(player))
          return player.previousTrack();
        var newIndex = self.getCurrentPlaylistIndex(player) - 1;
        if (0 <= newIndex) {
          var newItem = self._playQueueManager.getPlaylist()[newIndex];
          if (newItem)
            return (
              ((player = newItem.playOptions || {}).startPositionTicks = 0),
              (player.command = "previousTrack"),
              playInternal(newItem, player, function () {
                setPlaylistState(newItem.PlaylistItemId, newIndex);
              })
            );
        }
        return Promise.resolve();
      }),
      (self.queue = function (options, player) {
        return queue(options, "", player);
      }),
      (self.queueNext = function (options, player) {
        return queue(options, "next", player);
      }),
      _events.default.on(_pluginmanager.default, "registered", function (e, plugin) {
        "mediaplayer" === plugin.type && initMediaPlayer(plugin);
      }),
      _pluginmanager.default.ofType("mediaplayer").map(initMediaPlayer),
      (self.onAppClose = function () {
        var player = this._currentPlayer;
        player &&
          player.isLocalPlayer &&
          enableLocalPlaylistManagement(player) &&
          this.isPlaying(player) &&
          ((this._playNextAfterEnded = !1), onPlaybackStopped.call(player));
      }),
      (self.playbackStartTime = function (player) {
        if ((player = player || this._currentPlayer) && !enableLocalPlaylistManagement(player))
          return player.playbackStartTime ? player.playbackStartTime() : null;
        player = getPlayerData(player).streamInfo;
        return player ? player.playbackStartTimeTicks : null;
      }),
      (self.onControllingAppConnected = function () {
        var player = this._currentPlayer;
        player && self.isPlaying(player) && sendProgressUpdate(player, "controllerconnected", !0);
      }),
      _servicelocator.appHost.supports("remotecontrol") &&
        require(["serverNotifications"], function (serverNotifications) {
          _events.default.on(serverNotifications, "ServerShuttingDown", self.setDefaultPlayerActive.bind(self)),
            _events.default.on(serverNotifications, "ServerRestarting", self.setDefaultPlayerActive.bind(self));
        });
  }
  (PlaybackManager.prototype.getCurrentPlayer = function () {
    return this._currentPlayer;
  }),
    (PlaybackManager.prototype.currentTime = function (player) {
      return !(player = player || this._currentPlayer) || enableLocalPlaylistManagement(player) || player.isLocalPlayer
        ? this.getCurrentTicks(player)
        : player.currentTime();
    }),
    (PlaybackManager.prototype.nextItem = function (player) {
      if ((player = player || this._currentPlayer) && !enableLocalPlaylistManagement(player)) return player.nextItem();
      player = this._playQueueManager.getNextItemInfo();
      if (!player || !player.item) return Promise.reject();
      var apiClient = _connectionmanager.default.getApiClient(player.item.ServerId);
      return apiClient.getItem(apiClient.getCurrentUserId(), player.item.Id);
    }),
    (PlaybackManager.prototype.canQueue = function (item) {
      return "MusicAlbum" === item.Type || "MusicArtist" === item.Type || "MusicGenre" === item.Type
        ? this.canQueueMediaType("Audio")
        : this.canQueueMediaType(item.MediaType);
    }),
    (PlaybackManager.prototype.canQueueMediaType = function (mediaType) {
      return !!this._currentPlayer && this._currentPlayer.canPlayMediaType(mediaType);
    }),
    (PlaybackManager.prototype.isMuted = function (player) {
      return !!(player = player || this._currentPlayer) && player.isMuted();
    }),
    (PlaybackManager.prototype.setMute = function (mute, player) {
      (player = player || this._currentPlayer) && player.setMute(mute);
    }),
    (PlaybackManager.prototype.toggleMute = function (mute, player) {
      (player = player || this._currentPlayer) &&
        (player.toggleMute ? player.toggleMute() : player.setMute(!player.isMuted()));
    }),
    (PlaybackManager.prototype.nextChapter = function (player) {
      player = player || this._currentPlayer;
      var item = this.currentItem(player),
        ticks = this.getCurrentTicks(player),
        item = (item.Chapters || []).filter(function (i) {
          return i.StartPositionTicks > ticks;
        })[0];
      item ? this.seek(item.StartPositionTicks, player) : this.nextTrack(player);
    }),
    (PlaybackManager.prototype.previousChapter = function (player) {
      player = player || this._currentPlayer;
      var item = this.currentItem(player),
        ticks = this.getCurrentTicks(player),
        item =
          ((ticks -= 1e8),
          0 === this.getCurrentPlaylistIndex(player) && (ticks = Math.max(ticks, 0)),
          (item.Chapters || []).filter(function (i) {
            return i.StartPositionTicks <= ticks;
          }));
      item.length ? this.seek(item[item.length - 1].StartPositionTicks, player) : this.previousTrack(player);
    }),
    (PlaybackManager.prototype.fastForward = function (player) {
      player = player || this._currentPlayer;
      var offsetTicks = 1e4 * _usersettings.default.skipForwardLength();
      this.seekRelative(offsetTicks, player);
    }),
    (PlaybackManager.prototype.rewind = function (player) {
      player = player || this._currentPlayer;
      var offsetTicks = 0 - 1e4 * _usersettings.default.skipBackLength();
      this.seekRelative(offsetTicks, player);
    }),
    (PlaybackManager.prototype.seekPercent = function (percent, player) {
      player = player || this._currentPlayer;
      var ticks = this.duration(player) || 0;
      (ticks *= percent /= 100), this.seek(parseInt(ticks), player);
    }),
    (PlaybackManager.prototype.playTrailers = function (item) {
      var player = this._currentPlayer;
      if (player && player.playTrailers) return player.playTrailers(item);
      var player = _connectionmanager.default.getApiClient(item),
        instance = this;
      return player
        .getAllTrailers(
          {LocalTrailers: 0 < (item.LocalTrailerCount || 0), RemoteTrailers: 0 === (item.LocalTrailerCount || 0)},
          item
        )
        .then(function (result) {
          return instance.play({items: result.Items});
        });
    }),
    (PlaybackManager.prototype.getSubtitleUrl = function (textStream, serverId) {
      serverId = _connectionmanager.default.getApiClient(serverId);
      return textStream.IsExternalUrl ? textStream.DeliveryUrl : serverId.getUrl(textStream.DeliveryUrl);
    }),
    (PlaybackManager.prototype.stop = function (player) {
      return (player = player || this._currentPlayer)
        ? (enableLocalPlaylistManagement(player) && (this._playNextAfterEnded = !1), player.stop(!0, !0))
        : Promise.resolve();
    }),
    (PlaybackManager.prototype.getBufferedRanges = function (player) {
      return (player = player || this._currentPlayer) && player.getBufferedRanges ? player.getBufferedRanges() : [];
    }),
    (PlaybackManager.prototype.playPause = function (player) {
      if ((player = player || this._currentPlayer))
        return player.playPause ? player.playPause() : player.paused() ? this.unpause(player) : this.pause(player);
    }),
    (PlaybackManager.prototype.paused = function (player) {
      if ((player = player || this._currentPlayer)) return player.paused();
    }),
    (PlaybackManager.prototype.pause = function (player) {
      (player = player || this._currentPlayer) && player.pause();
    }),
    (PlaybackManager.prototype.unpause = function (player) {
      (player = player || this._currentPlayer) && player.unpause();
    }),
    (PlaybackManager.prototype.instantMix = function (item, player) {
      if ((player = player || this._currentPlayer) && player.instantMix) return player.instantMix(item);
      var player = _connectionmanager.default.getApiClient(item),
        options = {},
        instance = ((options.UserId = player.getCurrentUserId()), (options.Limit = 500), this);
      return player.getInstantMixFromItem(item.Id, options).then(function (result) {
        return instance.play({items: result.Items});
      });
    }),
    (PlaybackManager.prototype.shuffle = function (shuffleItem, player, queryOptions) {
      return (player = player || this._currentPlayer) && player.shuffle
        ? player.shuffle(shuffleItem)
        : (((queryOptions = queryOptions || {}).items = [shuffleItem]),
          (queryOptions.shuffle = !0),
          this.play(queryOptions));
    }),
    (PlaybackManager.prototype.audioTracks = function (player) {
      if ((player = player || this._currentPlayer).audioTracks) {
        var result = player.audioTracks();
        if (result) return result;
      }
      return ((this.currentMediaSource(player) || {}).MediaStreams || []).filter(function (s) {
        return "Audio" === s.Type;
      });
    }),
    (PlaybackManager.prototype.subtitleTracks = function (player) {
      if ((player = player || this._currentPlayer).subtitleTracks) {
        var result = player.subtitleTracks();
        if (result) return result;
      }
      return ((this.currentMediaSource(player) || {}).MediaStreams || []).filter(function (s) {
        return "Subtitle" === s.Type;
      });
    }),
    (PlaybackManager.prototype.getSupportedCommands = function (player) {
      if (!(player = player || this._currentPlayer) || player.isLocalPlayer)
        return (
          (list = [
            "GoHome",
            "GoToSettings",
            "VolumeUp",
            "VolumeDown",
            "Mute",
            "Unmute",
            "ToggleMute",
            "SetVolume",
            "SetAudioStreamIndex",
            "SetSubtitleStreamIndex",
            "RefreshMediaSource",
            "SetMaxStreamingBitrate",
            "DisplayContent",
            "GoToSearch",
            "DisplayMessage",
            "SetRepeatMode",
            "PlayMediaSource",
            "PlayTrailers",
          ]),
          _servicelocator.appHost.supports("fullscreenchange") && list.push("ToggleFullscreen"),
          player &&
            player.supports &&
            (player.supports("PictureInPicture") && list.push("PictureInPicture"),
            player.supports("SetBrightness") && list.push("SetBrightness"),
            player.supports("SetAspectRatio") && list.push("SetAspectRatio"),
            player.supports("SetSubtitleOffset") && list.push("SetSubtitleOffset"),
            player.supports("SetPlaybackRate") && list.push("SetPlaybackRate")),
          list
        );
      var list = this.getPlayerInfo(player);
      return list ? list.supportedCommands : [];
    }),
    (PlaybackManager.prototype.toggleRepeatMode = function (player) {
      switch (((player = player || this._currentPlayer), this.getRepeatMode(player))) {
        case "RepeatNone":
          this.setRepeatMode("RepeatAll", player);
          break;
        case "RepeatAll":
          this.setRepeatMode("RepeatOne", player);
          break;
        case "RepeatOne":
          this.setRepeatMode("RepeatNone", player);
      }
    }),
    (PlaybackManager.prototype.setRepeatMode = function (value, player) {
      if ((player = player || this._currentPlayer) && !enableLocalPlaylistManagement(player))
        return player.setRepeatMode(value);
      this._playQueueManager.setRepeatMode(value), _events.default.trigger(player, "repeatmodechange");
    }),
    (PlaybackManager.prototype.getRepeatMode = function (player) {
      return (
        (player = player || this._currentPlayer) && !enableLocalPlaylistManagement(player)
          ? player
          : this._playQueueManager
      ).getRepeatMode();
    }),
    (PlaybackManager.prototype.setSubtitleOffset = function (value, player) {
      (player = player || this._currentPlayer).setSubtitleOffset && player.setSubtitleOffset(value),
        _events.default.trigger(player, "subtitleoffsetchange");
    }),
    (PlaybackManager.prototype.incrementSubtitleOffset = function (value, player) {
      (player = player || this._currentPlayer).incrementSubtitleOffset &&
        (player.incrementSubtitleOffset(value), _events.default.trigger(player, "subtitleoffsetchange"));
    }),
    (PlaybackManager.prototype.getSubtitleOffset = function (player) {
      return (player = player || this._currentPlayer).getSubtitleOffset ? player.getSubtitleOffset() : 0;
    }),
    (PlaybackManager.prototype.getPlaybackRate = function (player) {
      return (player = player || this._currentPlayer).getPlaybackRate ? player.getPlaybackRate() : 1;
    }),
    (PlaybackManager.prototype.setPlaybackRate = function (value, player) {
      (player = player || this._currentPlayer).setPlaybackRate && player.setPlaybackRate(value);
    }),
    (PlaybackManager.prototype.trySetActiveDeviceName = function (name) {
      name = normalizeName(name);
      var instance = this;
      instance.getTargets().then(function (result) {
        result = result.filter(function (p) {
          return normalizeName(p.name) === name;
        })[0];
        result && instance.trySetActivePlayer(result.playerName, result);
      });
    }),
    (PlaybackManager.prototype.displayContent = function (options, player) {
      (player = player || this._currentPlayer) && player.displayContent && player.displayContent(options);
    }),
    (PlaybackManager.prototype.beginPlayerUpdates = function (player) {
      player.beginPlayerUpdates && player.beginPlayerUpdates();
    }),
    (PlaybackManager.prototype.endPlayerUpdates = function (player) {
      player.endPlayerUpdates && player.endPlayerUpdates();
    }),
    (PlaybackManager.prototype.setDefaultPlayerActive = function () {
      this.setActivePlayer("localplayer");
    }),
    (PlaybackManager.prototype.removeActivePlayer = function (name) {
      var playerInfo = this.getPlayerInfo();
      playerInfo && playerInfo.playerName === name && this.setDefaultPlayerActive();
    }),
    (PlaybackManager.prototype.removeActiveTarget = function (id) {
      var playerInfo = this.getPlayerInfo();
      playerInfo && playerInfo.id === id && this.setDefaultPlayerActive();
    }),
    (PlaybackManager.prototype.sendCommand = function (cmd, player) {
      switch ((console.log("MediaController received command: " + cmd.Name), cmd.Name)) {
        case "SetPlaybackRate":
          this.setPlaybackRate(cmd.Arguments.PlaybackRate, player);
          break;
        case "SetSubtitleOffset":
          this.setSubtitleOffset(cmd.Arguments.SubtitleOffset, player);
          break;
        case "IncrementSubtitleOffset":
          this.incrementSubtitleOffset(cmd.Arguments.Increment, player);
          break;
        case "SetRepeatMode":
          this.setRepeatMode(cmd.Arguments.RepeatMode, player);
          break;
        case "VolumeUp":
          this.volumeUp(player);
          break;
        case "VolumeDown":
          this.volumeDown(player);
          break;
        case "Mute":
          this.setMute(!0, player);
          break;
        case "Unmute":
          this.setMute(!1, player);
          break;
        case "ToggleMute":
          this.toggleMute(player);
          break;
        case "SetVolume":
          this.setVolume(cmd.Arguments.Volume, player);
          break;
        case "SetAspectRatio":
          this.setAspectRatio(cmd.Arguments.AspectRatio, player);
          break;
        case "SetBrightness":
          this.setBrightness(cmd.Arguments.Brightness, player);
          break;
        case "SetAudioStreamIndex":
          this.setAudioStreamIndex(parseInt(cmd.Arguments.Index), player);
          break;
        case "SetSubtitleStreamIndex":
          this.setSubtitleStreamIndex(parseInt(cmd.Arguments.Index), player, cmd.Arguments.RefreshMediaSource);
          break;
        case "SetMaxStreamingBitrate":
          break;
        case "ToggleFullscreen":
          this.toggleFullscreen(player);
          break;
        default:
          player.sendCommand && player.sendCommand(cmd);
      }
    });
  var _default = new PlaybackManager();
  _exports.default = _default;
});
