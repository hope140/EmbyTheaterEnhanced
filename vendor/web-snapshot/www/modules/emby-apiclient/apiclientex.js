define(["exports", "./apiclient.js"], function (_exports, _apiclient) {
  Object.defineProperty(_exports, "__esModule", {value: !0}), (_exports.default = void 0);
  var localPrefix = "local:";
  function isLocalId(str) {
    return str && str.startsWith(localPrefix);
  }
  function isLocalViewId(str) {
    return str && str.startsWith("localview:");
  }
  function stripLocalPrefix(str) {
    str = stripStart(str, localPrefix);
    return stripStart(str, "localview:");
  }
  function stripStart(str, find) {
    return str && find && str.startsWith(find) ? str.substr(find.length) : str;
  }
  function createEmptyList() {
    return {Items: [], TotalRecordCount: 0};
  }
  function convertGuidToLocal(guid) {
    return guid ? (isLocalId(guid) ? guid : "local:" + guid) : null;
  }
  function syncNow() {
    require(["localsync"], function (localSync) {
      localSync.sync();
    });
  }
  function getLocalUrl(_ref) {
    var _ref = _ref.MediaSources;
    return _ref && _ref.length ? (_ref = _ref[0]).StreamUrl || _ref.Path : "";
  }
  function adjustGuidProperties(downloadedItem) {
    (downloadedItem.Id = convertGuidToLocal(downloadedItem.Id)),
      (downloadedItem.SeriesId = convertGuidToLocal(downloadedItem.SeriesId)),
      (downloadedItem.SeasonId = convertGuidToLocal(downloadedItem.SeasonId)),
      (downloadedItem.AlbumId = convertGuidToLocal(downloadedItem.AlbumId)),
      (downloadedItem.ParentId = convertGuidToLocal(downloadedItem.ParentId)),
      (downloadedItem.ParentThumbItemId = convertGuidToLocal(downloadedItem.ParentThumbItemId)),
      (downloadedItem.ParentPrimaryImageItemId = convertGuidToLocal(downloadedItem.ParentPrimaryImageItemId)),
      (downloadedItem.PrimaryImageItemId = convertGuidToLocal(downloadedItem.PrimaryImageItemId)),
      (downloadedItem.ParentLogoItemId = convertGuidToLocal(downloadedItem.ParentLogoItemId)),
      (downloadedItem.ParentBackdropItemId = convertGuidToLocal(downloadedItem.ParentBackdropItemId)),
      (downloadedItem.ParentBackdropImageTags = null);
  }
  function getLocalView(instance, serverId, userId) {
    return instance.getLocalFolders(serverId, userId).then(function (views) {
      var localView = null;
      return (
        0 < views.length &&
          (localView = {
            Name: instance.downloadsTitleText || "Downloads",
            ServerId: serverId,
            Id: "localview",
            Type: "localview",
            IsFolder: !0,
          }),
        Promise.resolve(localView)
      );
    });
  }
  _apiclient = (function (_ApiClient) {
    babelHelpers.inherits(ApiClientEx, _ApiClient);
    var _super = _createSuper(ApiClientEx);
    function ApiClientEx(
      appStorage,
      wakeOnLan,
      serverAddress,
      appName,
      appVersion,
      deviceName,
      deviceId,
      devicePixelRatio,
      localassetmanager,
      itemrepository,
      useractionrepository
    ) {
      return (
        babelHelpers.classCallCheck(this, ApiClientEx),
        ((appStorage = _super.call(
          this,
          appStorage,
          wakeOnLan,
          serverAddress,
          appName,
          appVersion,
          deviceName,
          deviceId,
          devicePixelRatio
        )).localassetmanager = localassetmanager),
        (appStorage.itemrepository = itemrepository),
        (appStorage.useractionrepository = useractionrepository),
        appStorage
      );
    }
    return (
      babelHelpers.createClass(ApiClientEx, [
        {
          key: "getPlaybackInfo",
          value: function (itemId, options, deviceProfile, signal) {
            var promises = [];
            return (
              isLocalId(itemId) || (options && isLocalId(options.MediaSourceId))
                ? promises.push(Promise.resolve({MediaSources: []}))
                : promises.push(
                    babelHelpers
                      .get(babelHelpers.getPrototypeOf(ApiClientEx.prototype), "getPlaybackInfo", this)
                      .apply(this, arguments)
                  ),
              options && options.MediaSourceId && !isLocalId(options.MediaSourceId)
                ? promises.push(Promise.resolve({MediaSources: []}))
                : promises.push(
                    this.itemrepository.getLibraryItem(this.serverId(), stripLocalPrefix(itemId)).then(function (item) {
                      return !item || (item.SyncStatus && "synced" !== item.SyncStatus)
                        ? {MediaSources: []}
                        : {
                            MediaSources: item.Item.MediaSources.map(function (m) {
                              return (
                                null != options.AudioStreamIndex &&
                                  (m.DefaultAudioStreamIndex = parseInt(options.AudioStreamIndex)),
                                null != options.SubtitleStreamIndex &&
                                  (m.DefaultSubtitleStreamIndex = parseInt(options.SubtitleStreamIndex)),
                                (m.SupportsDirectPlay = !0),
                                (m.SupportsDirectStream = !1),
                                (m.SupportsTranscoding = !1),
                                (m.IsLocal = !0),
                                (m.Name = "已下载的"),
                                (m.Id = localPrefix + m.Id),
                                m
                              );
                            }),
                          };
                    })
                  ),
              Promise.all(promises).then(function (results) {
                for (
                  var result = results[0], localResult = results[1], i = 0, length = localResult.MediaSources.length;
                  i < length;
                  i++
                )
                  result.MediaSources.unshift(localResult.MediaSources[i]);
                return result;
              })
            );
          },
        },
        {
          key: "getAudioStreamUrl",
          value: function (
            item,
            transcodingProfile,
            directPlayContainers,
            maxBitrate,
            maxAudioSampleRate,
            maxAudioBitDepth,
            startPosition,
            enableRemoteMedia
          ) {
            var mediaSource;
            if (isLocalId(item.Id) && item.MediaSources && item.MediaSources.length)
              return (mediaSource = item.MediaSources[0]).StreamUrl || mediaSource.Path;
            return babelHelpers
              .get(babelHelpers.getPrototypeOf(ApiClientEx.prototype), "getAudioStreamUrl", this)
              .call(
                this,
                item,
                transcodingProfile,
                directPlayContainers,
                maxBitrate,
                maxAudioSampleRate,
                maxAudioBitDepth,
                startPosition,
                enableRemoteMedia
              );
          },
        },
        {
          key: "getAudioStreamUrls",
          value: function (
            items,
            transcodingProfile,
            directPlayContainers,
            maxBitrate,
            maxAudioSampleRate,
            maxAudioBitDepth,
            startPosition,
            enableRemoteMedia
          ) {
            var _this2 = this;
            if (!items.length) return Promise.resolve([]);
            if (isLocalId(items[0].Id)) return Promise.resolve(items.map(getLocalUrl));
            var self = this,
              ids = items.map(function (_ref2) {
                return _ref2.Id;
              });
            return this.itemrepository.getLibraryItemPathsByIds(items[0].ServerId, ids).then(function (localItems) {
              var localItemMap = {},
                localUrls = localItems.map(function (libraryItem) {
                  return (localItemMap[libraryItem.ItemId] = libraryItem).LocalPath;
                });
              if (localUrls.length === items.length) return localUrls;
              if (localItems.length) {
                for (var streamUrls = [], i = 0; i < items.length; i++) {
                  var item = items[i],
                    streamUrl = void 0;
                  (streamUrl = localItemMap[item.Id]
                    ? localItemMap[item.Id].LocalPath
                    : babelHelpers
                        .get(babelHelpers.getPrototypeOf(ApiClientEx.prototype), "getAudioStreamUrl", _this2)
                        .call(
                          self,
                          item,
                          transcodingProfile,
                          directPlayContainers,
                          maxBitrate,
                          maxAudioSampleRate,
                          maxAudioBitDepth,
                          startPosition,
                          enableRemoteMedia
                        )),
                    streamUrls.push(streamUrl || "");
                }
                return streamUrls;
              }
              return babelHelpers
                .get(babelHelpers.getPrototypeOf(ApiClientEx.prototype), "getAudioStreamUrls", _this2)
                .call(
                  self,
                  items,
                  transcodingProfile,
                  directPlayContainers,
                  maxBitrate,
                  maxAudioSampleRate,
                  maxAudioBitDepth,
                  startPosition,
                  enableRemoteMedia
                );
            });
          },
        },
        {
          key: "getItems",
          value: function (userId, options) {
            var serverInfo = this.serverInfo();
            if (serverInfo && "localview" === options.ParentId)
              return this.getLocalFolders(serverInfo.Id, userId).then(function (items) {
                items = {Items: items, TotalRecordCount: items.length};
                return Promise.resolve(items);
              });
            if (
              serverInfo &&
              options &&
              (isLocalId(options.ParentId) ||
                isLocalId(options.SeriesId) ||
                isLocalId(options.SeasonId) ||
                isLocalViewId(options.ParentId) ||
                isLocalId(options.AlbumIds))
            )
              return this.itemrepository.getLibraryItems(serverInfo.Id, options).then(function (result) {
                return (
                  result.Items.forEach(function (item) {
                    adjustGuidProperties(item);
                  }),
                  Promise.resolve(result)
                );
              });
            if (options && options.ExcludeItemIds && options.ExcludeItemIds.length) {
              for (var exItems = options.ExcludeItemIds.split(","), i = 0; i < exItems.length; i++)
                if (isLocalId(exItems[i])) return Promise.resolve(createEmptyList());
            } else if (options && options.Ids && options.Ids.length) {
              var localIds,
                ids = options.Ids.split(","),
                hasLocal = !1;
              for (i = 0; i < ids.length; i++)
                if (isLocalId(ids[i])) {
                  hasLocal = !0;
                  break;
                }
              if (hasLocal)
                return (
                  (localIds = ids.map(stripLocalPrefix)),
                  this.itemrepository.getLibraryItemsByIds(serverInfo.Id, localIds).then(function (items) {
                    items.forEach(function (_ref3) {
                      adjustGuidProperties(_ref3.Item);
                    });
                    (items = items.map(function (_ref4) {
                      return _ref4.Item;
                    })),
                      (items = {Items: items, TotalRecordCount: items.length});
                    return Promise.resolve(items);
                  })
                );
            }
            return babelHelpers
              .get(babelHelpers.getPrototypeOf(ApiClientEx.prototype), "getItems", this)
              .call(this, userId, options);
          },
        },
        {
          key: "getUserViews",
          value: function (options, userId, signal) {
            var instance = this,
              basePromise =
                ((options = options || {}),
                babelHelpers
                  .get(babelHelpers.getPrototypeOf(ApiClientEx.prototype), "getUserViews", this)
                  .apply(instance, arguments));
            return options.enableLocalView
              ? basePromise.then(function (result) {
                  var serverInfo = instance.serverInfo();
                  return serverInfo
                    ? getLocalView(instance, serverInfo.Id, userId).then(function (localView) {
                        return (
                          localView && (result.Items.push(localView), result.TotalRecordCount++),
                          Promise.resolve(result)
                        );
                      })
                    : Promise.resolve(result);
                })
              : basePromise;
          },
        },
        {
          key: "getItem",
          value: function (userId, itemId, options) {
            if (itemId)
              return "localview" === (itemId = itemId && itemId.toString()) && (serverInfo = this.serverInfo())
                ? getLocalView(this, serverInfo.Id, userId)
                : isLocalViewId(itemId) && (serverInfo = this.serverInfo())
                ? this.getLocalFolders(serverInfo.Id, userId).then(function (items) {
                    items = items.filter(function (_ref5) {
                      return _ref5.Id === itemId;
                    });
                    return 0 < items.length ? Promise.resolve(items[0]) : Promise.reject();
                  })
                : isLocalId(itemId)
                ? (serverInfo = this.serverInfo())
                  ? this.itemrepository.getLibraryItem(serverInfo.Id, stripLocalPrefix(itemId)).then(function (item) {
                      return item ? (adjustGuidProperties(item.Item), Promise.resolve(item.Item)) : Promise.reject();
                    })
                  : Promise.reject()
                : babelHelpers
                    .get(babelHelpers.getPrototypeOf(ApiClientEx.prototype), "getItem", this)
                    .call(this, userId, itemId, options);
            var serverInfo;
            throw new Error("null itemId");
          },
        },
        {
          key: "getLocalFolders",
          value: function (userId) {
            var serverId,
              serverInfo = this.serverInfo();
            return (
              (userId = userId || serverInfo.UserId),
              (userId = this.itemrepository),
              (serverId = serverInfo.Id),
              userId
                .getLibarytemTypes(serverId)
                .then(function (types) {
                  var list = [];
                  return (
                    types.includes("Audio") &&
                      list.push({
                        Name: "音乐",
                        ServerId: serverId,
                        Id: "localview:MusicView",
                        Type: "MusicView",
                        CollectionType: "music",
                        IsFolder: !0,
                      }),
                    types.includes("Photo") &&
                      list.push({
                        Name: "图片",
                        ServerId: serverId,
                        Id: "localview:PhotosView",
                        Type: "PhotosView",
                        CollectionType: "photos",
                        IsFolder: !0,
                      }),
                    types.includes("Episode") &&
                      list.push({
                        Name: "节目",
                        ServerId: serverId,
                        Id: "localview:TVView",
                        Type: "TVView",
                        CollectionType: "tvshows",
                        IsFolder: !0,
                      }),
                    types.includes("Movie") &&
                      list.push({
                        Name: "电影",
                        ServerId: serverId,
                        Id: "localview:MoviesView",
                        Type: "MoviesView",
                        CollectionType: "movies",
                        IsFolder: !0,
                      }),
                    types.includes("Video") &&
                      list.push({
                        Name: "视频",
                        ServerId: serverId,
                        Id: "localview:VideosView",
                        Type: "VideosView",
                        IsFolder: !0,
                      }),
                    types.includes("MusicVideo") &&
                      list.push({
                        Name: "音乐视频",
                        ServerId: serverId,
                        Id: "localview:MusicVideosView",
                        Type: "MusicVideosView",
                        CollectionType: "musicvideos",
                        IsFolder: !0,
                      }),
                    types.includes("Trailer") &&
                      list.push({
                        Name: "预告片",
                        ServerId: serverId,
                        Id: "localview:TrailersView",
                        Type: "TrailersView",
                        IsFolder: !0,
                      }),
                    list
                  );
                })
                .catch(function () {
                  return [];
                })
            );
          },
        },
        {
          key: "getNextUpEpisodes",
          value: function (options) {
            return options.SeriesId && isLocalId(options.SeriesId)
              ? Promise.resolve(createEmptyList())
              : babelHelpers
                  .get(babelHelpers.getPrototypeOf(ApiClientEx.prototype), "getNextUpEpisodes", this)
                  .call(this, options);
          },
        },
        {
          key: "getSyncStatus",
          value: function (itemId) {
            return isLocalId(itemId)
              ? Promise.resolve({})
              : babelHelpers
                  .get(babelHelpers.getPrototypeOf(ApiClientEx.prototype), "getSyncStatus", this)
                  .call(this, itemId);
          },
        },
        {
          key: "getSeasons",
          value: function (itemId, options) {
            return isLocalId(itemId)
              ? ((options.SeriesId = itemId),
                (options.IncludeItemTypes = "Season"),
                options.Recursive
                  ? (options.SortBy = "ParentIndexNumber,IndexNumber")
                  : (options.SortBy = "IndexNumber"),
                this.getItems(this.getCurrentUserId(), options))
              : babelHelpers
                  .get(babelHelpers.getPrototypeOf(ApiClientEx.prototype), "getSeasons", this)
                  .call(this, itemId, options);
          },
        },
        {
          key: "getEpisodes",
          value: function (itemId, options) {
            return isLocalId(options.SeasonId) || isLocalId(options.seasonId) || isLocalId(itemId)
              ? ((options.SeriesId = itemId),
                (options.IncludeItemTypes = "Episode"),
                (options.SortBy = "ParentIndexNumber,IndexNumber,SortName"),
                this.getItems(this.getCurrentUserId(), options))
              : babelHelpers
                  .get(babelHelpers.getPrototypeOf(ApiClientEx.prototype), "getEpisodes", this)
                  .call(this, itemId, options);
          },
        },
        {
          key: "getLatestOfflineItems",
          value: function (options) {
            (options.SortBy = "DateCreated"), (options.SortOrder = "Descending"), (options.EnableTotalRecordCount = !1);
            var serverInfo = this.serverInfo();
            return serverInfo
              ? this.itemrepository.getLibraryItems(serverInfo.Id, options).then(function (_ref6) {
                  _ref6 = _ref6.Items;
                  return (
                    _ref6.forEach(function (item) {
                      adjustGuidProperties(item);
                    }),
                    Promise.resolve(_ref6)
                  );
                })
              : Promise.resolve([]);
          },
        },
        {
          key: "getThemeMedia",
          value: function (itemId, options) {
            return isLocalViewId(itemId) || isLocalId(itemId) || "localview" === itemId
              ? Promise.resolve({
                  ThemeVideosResult: {Items: [], TotalRecordCount: 0},
                  ThemeSongsResult: {Items: [], TotalRecordCount: 0},
                })
              : babelHelpers
                  .get(babelHelpers.getPrototypeOf(ApiClientEx.prototype), "getThemeMedia", this)
                  .call(this, itemId, options);
          },
        },
        {
          key: "getSpecialFeatures",
          value: function (userId, itemId) {
            return isLocalId(itemId)
              ? Promise.resolve([])
              : babelHelpers
                  .get(babelHelpers.getPrototypeOf(ApiClientEx.prototype), "getSpecialFeatures", this)
                  .call(this, userId, itemId);
          },
        },
        {
          key: "getSimilarItems",
          value: function (itemId, options) {
            return isLocalId(itemId)
              ? Promise.resolve(createEmptyList())
              : babelHelpers
                  .get(babelHelpers.getPrototypeOf(ApiClientEx.prototype), "getSimilarItems", this)
                  .call(this, itemId, options);
          },
        },
        {
          key: "updateFavoriteStatus",
          value: function (userId, itemId, isFavorite) {
            return isLocalId(itemId)
              ? Promise.resolve()
              : babelHelpers
                  .get(babelHelpers.getPrototypeOf(ApiClientEx.prototype), "updateFavoriteStatus", this)
                  .call(this, userId, itemId, isFavorite);
          },
        },
        {
          key: "getImageUrl",
          value: function (itemId, options) {
            var serverInfo, id;
            return isLocalId(itemId) || (options && options.itemid && isLocalId(options.itemid))
              ? ((serverInfo = this.serverInfo()),
                (id = stripLocalPrefix(itemId)),
                this.localassetmanager.getImageUrl(serverInfo.Id, id, options))
              : babelHelpers
                  .get(babelHelpers.getPrototypeOf(ApiClientEx.prototype), "getImageUrl", this)
                  .call(this, itemId, options);
          },
        },
        {
          key: "reportPlaybackStart",
          value: function (options) {
            if (options)
              return isLocalId(options.ItemId)
                ? Promise.resolve()
                : babelHelpers
                    .get(babelHelpers.getPrototypeOf(ApiClientEx.prototype), "reportPlaybackStart", this)
                    .call(this, options);
            throw new Error("null options");
          },
        },
        {
          key: "reportPlaybackProgress",
          value: function (options) {
            if (options)
              return isLocalId(options.ItemId)
                ? (serverInfo = this.serverInfo())
                  ? (instance = this).itemrepository
                      .getLibraryItem(serverInfo.Id, stripLocalPrefix(options.ItemId))
                      .then(function (item) {
                        var libraryItem = item.Item;
                        return "Video" === libraryItem.MediaType
                          ? ((libraryItem.UserData = libraryItem.UserData || {}),
                            (libraryItem.UserData.PlaybackPositionTicks = options.PositionTicks),
                            (libraryItem.UserData.PlayedPercentage = Math.min(
                              libraryItem.RunTimeTicks
                                ? ((options.PositionTicks || 0) / libraryItem.RunTimeTicks) * 100
                                : 0,
                              100
                            )),
                            libraryItem.UserData.PlaybackPositionTicks &&
                              libraryItem.RunTimeTicks &&
                              libraryItem.UserData.PlaybackPositionTicks >= 0.9 * libraryItem.RunTimeTicks &&
                              ((libraryItem.UserData.Played = !0),
                              (libraryItem.UserData.PlaybackPositionTicks = 0),
                              (libraryItem.UserData.PlayedPercentage = 0)),
                            instance.itemrepository.updateLibraryItem(item.ServerId, item.Id, item))
                          : Promise.resolve();
                      })
                  : Promise.resolve()
                : babelHelpers
                    .get(babelHelpers.getPrototypeOf(ApiClientEx.prototype), "reportPlaybackProgress", this)
                    .call(this, options);
            var serverInfo, instance;
            throw new Error("null options");
          },
        },
        {
          key: "reportPlaybackStopped",
          value: function (options) {
            if (options)
              return isLocalId(options.ItemId)
                ? (serverInfo = this.serverInfo())
                  ? (instance = this).itemrepository
                      .getLibraryItem(serverInfo.Id, stripLocalPrefix(options.ItemId))
                      .then(function (item) {
                        var libraryItem = item.Item;
                        if ("Video" === libraryItem.MediaType)
                          return (
                            (libraryItem.UserData = libraryItem.UserData || {}),
                            (libraryItem.UserData.PlaybackPositionTicks = options.PositionTicks),
                            (libraryItem.UserData.PlayedPercentage = Math.min(
                              libraryItem.RunTimeTicks
                                ? ((options.PositionTicks || 0) / libraryItem.RunTimeTicks) * 100
                                : 0,
                              100
                            )),
                            libraryItem.UserData.PlaybackPositionTicks &&
                              libraryItem.RunTimeTicks &&
                              libraryItem.UserData.PlaybackPositionTicks >= 0.9 * libraryItem.RunTimeTicks &&
                              ((libraryItem.UserData.Played = !0),
                              (libraryItem.UserData.PlaybackPositionTicks = 0),
                              (libraryItem.UserData.PlayedPercentage = 0)),
                            instance.itemrepository.updateLibraryItem(item.ServerId, item.Id, item).then(function () {
                              var d,
                                action = {
                                  Date: Date.now(),
                                  ItemId: stripLocalPrefix(options.ItemId),
                                  PositionTicks: options.PositionTicks,
                                  ServerId: serverInfo.Id,
                                  Type: 0,
                                  UserId: instance.getCurrentUserId(),
                                  Id:
                                    ((d = Date.now()),
                                    window.performance &&
                                      "function" == typeof window.performance.now &&
                                      (d += performance.now()),
                                    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
                                      var r = (d + 16 * Math.random()) % 16 | 0;
                                      return (d = Math.floor(d / 16)), ("x" === c ? r : (3 & r) | 8).toString(16);
                                    })),
                                };
                              return instance.useractionrepository.addUserAction(action.Id, action);
                            })
                          );
                      })
                  : Promise.resolve()
                : babelHelpers
                    .get(babelHelpers.getPrototypeOf(ApiClientEx.prototype), "reportPlaybackStopped", this)
                    .call(this, options);
            var serverInfo, instance;
            throw new Error("null options");
          },
        },
        {
          key: "getIntros",
          value: function (itemId) {
            return isLocalId(itemId)
              ? Promise.resolve({Items: [], TotalRecordCount: 0})
              : babelHelpers
                  .get(babelHelpers.getPrototypeOf(ApiClientEx.prototype), "getIntros", this)
                  .call(this, itemId);
          },
        },
        {
          key: "getInstantMixFromItem",
          value: function (itemId, options) {
            return isLocalId(itemId)
              ? Promise.resolve({Items: [], TotalRecordCount: 0})
              : babelHelpers
                  .get(babelHelpers.getPrototypeOf(ApiClientEx.prototype), "getInstantMixFromItem", this)
                  .call(this, itemId, options);
          },
        },
        {
          key: "getLiveTvPrograms",
          value: function () {
            var options = 0 < arguments.length && void 0 !== arguments[0] ? arguments[0] : {};
            return options && options.LibrarySeriesId && isLocalId(options.LibrarySeriesId)
              ? Promise.resolve({Items: [], TotalRecordCount: 0})
              : babelHelpers
                  .get(babelHelpers.getPrototypeOf(ApiClientEx.prototype), "getLiveTvPrograms", this)
                  .apply(this, arguments);
          },
        },
        {
          key: "getItemDownloadUrl",
          value: function (itemId) {
            var serverInfo;
            return isLocalId(itemId)
              ? (serverInfo = this.serverInfo())
                ? this.itemrepository.getLibraryItem(serverInfo.Id, stripLocalPrefix(itemId)).then(function (_ref7) {
                    _ref7 = _ref7.LocalPath;
                    return Promise.resolve(_ref7);
                  })
                : Promise.reject()
              : babelHelpers
                  .get(babelHelpers.getPrototypeOf(ApiClientEx.prototype), "getItemDownloadUrl", this)
                  .call(this, itemId);
          },
        },
        {
          key: "deleteItem",
          value: function (item) {
            var instance,
              itemId = item.Id;
            return isLocalId(itemId)
              ? (instance = this).itemrepository
                  .getLibraryItem(this.serverId(), stripLocalPrefix(itemId))
                  .then(function (item) {
                    return item ? instance.localassetmanager.removeLocalItem(item).then(syncNow) : Promise.resolve();
                  })
              : babelHelpers
                  .get(babelHelpers.getPrototypeOf(ApiClientEx.prototype), "deleteItem", this)
                  .call(this, item);
          },
        },
        {
          key: "getDeleteInfo",
          value: function (itemId, options) {
            return isLocalId(itemId)
              ? Promise.resolve({Paths: []})
              : babelHelpers
                  .get(babelHelpers.getPrototypeOf(ApiClientEx.prototype), "getDeleteInfo", this)
                  .apply(this, arguments);
          },
        },
        {
          key: "getPrefixes",
          value: function (userId, options) {
            return isLocalId(options.ParentId) ||
              isLocalId(options.GenreIds) ||
              isLocalId(options.ArtistIds) ||
              isLocalId(options.StudioIds)
              ? babelHelpers
                  .get(babelHelpers.getPrototypeOf(ApiClientEx.prototype), "getDeefaultPrefixes", this)
                  .call(this)
              : babelHelpers
                  .get(babelHelpers.getPrototypeOf(ApiClientEx.prototype), "getPrefixes", this)
                  .call(this, userId, options);
          },
        },
      ]),
      ApiClientEx
    );
  })(_apiclient.default);
  _exports.default = _apiclient;
});
