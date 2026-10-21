define([
  "exports",
  "./dom.js",
  "./commandprocessor.js",
  "./common/servicelocator.js",
  "./common/globalize.js",
  "./emby-apiclient/connectionmanager.js",
  "./common/itemhelper.js",
  "./browser.js",
  "./layoutmanager.js",
  "./common/playback/playbackmanager.js",
], function (
  _exports,
  _dom,
  _commandprocessor,
  _servicelocator,
  _globalize,
  _connectionmanager,
  _itemhelper,
  _browser,
  _layoutmanager,
  _playbackmanager
) {
  function getCommands(options) {
    var text,
      commands = [],
      item = options.item,
      canPlay = _playbackmanager.default.canPlay(item),
      user = options.user,
      apiClient = _connectionmanager.default.getApiClient(item),
      restrictOptions =
        (_browser.default.web0s && "554ae9ea56b94c1c82cc628f6de52d85" === apiClient.serverId()) ||
        (self.tizen && !_browser.default.tizenSideload),
      canPlay =
        (canPlay &&
          "Photo" !== item.MediaType &&
          "Program" !== item.Type &&
          (!1 !== options.play &&
            commands.push({name: _globalize.default.translate("Play"), id: "resume", icon: "&#xe037;"}),
          options.playFromBeginning &&
            ("Series" === item.Type ||
              ("MusicAlbum" === item.Type && item.SupportsResume) ||
              (item.UserData && 0 < item.UserData.PlaybackPositionTicks)) &&
            commands.push({
              name: _globalize.default.translate("PlayFromBeginning"),
              id: "playfrombeginning",
              icon: "&#xe037;",
            }),
          options.playAllFromHere &&
            "Program" !== item.Type &&
            "Recording" !== item.Type &&
            "TvChannel" !== item.Type &&
            commands.push({
              name: _globalize.default.translate("PlayAllFromHere"),
              id: "playallfromhere",
              icon: "&#xe037;",
            })),
        /*_playbackmanager.default.canQueue(item) &&
          (!1 !== options.queue &&
            commands.push({name: _globalize.default.translate("HeaderAddToPlayQueue"), id: "queue", icon: "&#xe03b;"}),
          !1 !== options.queue &&
            commands.push({name: _globalize.default.translate("HeaderPlayNext"), id: "queuenext", icon: "&#xe03b;"})),*/
        (item.IsFolder || "MusicArtist" === item.Type || "MusicGenre" === item.Type) &&
          "livetv" !== item.CollectionType &&
          canPlay &&
          !1 !== options.shuffle &&
          commands.push({name: _globalize.default.translate("Shuffle"), id: "shuffle", icon: "&#xe043;"}),
        ("Audio" !== item.MediaType && "MusicAlbum" !== item.Type && "MusicArtist" !== item.Type) ||
          !1 === options.instantMix ||
          _itemhelper.default.isLocalItem(item) ||
          commands.push({name: _globalize.default.translate("HeaderInstantMix"), id: "instantmix", icon: "&#xe043;"}),
        commands.length && commands.push({divider: !0}),
        _itemhelper.default.supportsAddingToCollection(item, user));
    return (
      canPlay &&
        commands.push({
          name: _globalize.default.translate("HeaderAddToCollection"),
          id: "addtocollection",
          icon: "&#xe03b;",
        }),
      /*_itemhelper.default.supportsAddingToPlaylist(item) &&
        commands.push({
          name: _globalize.default.translate("HeaderAddToPlaylist"),
          id: "addtoplaylist",
          icon: "&#xe03b;",
        }),*/
      user &&
        /*!1 !== options.favorites &&*/
        _itemhelper.default.canRate(item) &&
        (item.UserData && item.UserData.IsFavorite
          ? commands.push({
              name: _globalize.default.translate("HeaderRemoveFromFavorites"),
              id: "unfavorite",
              icon: "&#xe87d;",
              iconClass: "icon_circle_strike",
            })
          : commands.push({
              name: _globalize.default.translate("HeaderAddToFavorites"),
              id: "favorite",
              icon: "&#xe87d;",
            })),
      user &&
        ("Timer" === item.Type &&
          user.Policy.EnableLiveTvManagement &&
          !1 !== options.cancelTimer &&
          commands.push({
            name: _globalize.default.translate("HeaderCancelRecording"),
            id: "canceltimer",
            icon: "&#xe061;",
          }),
        "SeriesTimer" === item.Type &&
          user.Policy.EnableLiveTvManagement &&
          !1 !== options.cancelTimer &&
          commands.push({
            name: _globalize.default.translate("HeaderCancelSeries"),
            id: "cancelseriestimer",
            icon: "&#xe3c9;",
          })),
      "VirtualFolder" === item.Type &&
        user.Policy.IsAdministrator &&
        "boxsets" !== item.CollectionType &&
        commands.push({
          name: _globalize.default.translate("ButtonChangeContentType"),
          id: "changelibrarycontenttype",
          icon: "&#xe2c7;",
        }),
      "Server" === item.Type &&
        commands.push({name: _globalize.default.translate("Connect"), id: "connecttoserver", icon: "&#xE63E;"}),
      "ApiKey" === item.Type &&
        navigator.clipboard &&
        navigator.clipboard.writeText &&
        commands.push({
          name: _globalize.default.translate("HeaderCopyToClipboard"),
          id: "copytoclipboard",
          icon: "content_copy",
        }),
      restrictOptions ||
        (!1 !== options.convert &&
          _itemhelper.default.canConvert(item, user, apiClient) &&
          commands.push({name: _globalize.default.translate("Convert"), id: "convert", icon: "sync"})),
      user &&
        (!1 !== options.createRecording &&
          user.Policy.EnableLiveTvManagement &&
          "TvChannel" === item.Type &&
          apiClient &&
          apiClient.isMinServerVersion("4.7.0.33") &&
          commands.push({name: _globalize.default.translate("HeaderCreateRecording"), id: "record", icon: "&#xe061;"}),
        user.Policy.IsAdministrator &&
          "User" === item.Type &&
          item.Id !== apiClient.getCurrentUserId() &&
          commands.push({name: _globalize.default.translate("Delete"), id: "delete", icon: "delete"}),
        user.Policy.IsAdministrator &&
          "Device" === item.Type &&
          item.Id !== apiClient.deviceId() &&
          commands.push({name: _globalize.default.translate("Delete"), id: "delete", icon: "delete"}),
        "MediaStream" === item.Type &&
          (user.Policy.EnableSubtitleManagement ||
            (null == user.Policy.EnableSubtitleManagement && user.Policy.IsAdministrator)) &&
          item.IsExternal &&
          commands.push({name: _globalize.default.translate("Delete"), id: "delete", icon: "delete"})),
      "Server" === item.Type &&
        commands.push({name: _globalize.default.translate("Delete"), id: "delete", icon: "delete"}),
      item.CanDelete &&
        !1 !== options.deleteItem &&
        ("Playlist" !== item.Type && item.Type,
        commands.push({name: _globalize.default.translate("Delete"), id: "delete", icon: "delete"})),
      item.CanDownload &&
        _servicelocator.appHost.supports("filedownload") &&
        commands.push({name: _globalize.default.translate("Download"), id: "download", icon: "download"}),
      "MediaStream" === item.Type &&
        item.IsExternal &&
        "Subtitle" === item.StreamType &&
        _servicelocator.appHost.supports("filedownload") &&
        commands.push({name: _globalize.default.translate("Download"), id: "download", icon: "download"}),
      _servicelocator.appHost.supports("sync") &&
        !1 !== options.syncLocal &&
        _itemhelper.default.canSync(user, item) &&
        commands.push({name: _globalize.default.translate("Download"), id: "synclocal", icon: "download"}),
      restrictOptions ||
        (!1 !== options.sync &&
          _itemhelper.default.canSync(user, item) &&
          commands.push({name: _globalize.default.translate("HeaderDownloadToDots"), id: "sync", icon: "download"}),
        _itemhelper.default.canEdit(user, item) &&
          !1 !== options.edit &&
          "SeriesTimer" !== item.Type &&
          ((text =
            "Timer" === item.Type ||
            "SeriesTimer" === item.Type ||
            "User" === item.Type ||
            "VirtualFolder" === item.Type ||
            "LiveTVTunerDevice" === item.Type ||
            "LiveTVGuideSource" === item.Type ||
            "ChannelManagementInfo" === item.Type
              ? _globalize.default.translate("Edit")
              : _globalize.default.translate("HeaderEditMetadata")),
          commands.push({name: text, id: "edit", icon: "edit"}))),
      _itemhelper.default.canEditImages(user, item) &&
        !1 !== options.editImages &&
        commands.push({name: _globalize.default.translate("HeaderEditImages"), id: "editimages", icon: "photo"}),
      !1 !== options.editSubtitles &&
        _itemhelper.default.canEditSubtitles(user, item) &&
        !1 !== options.editSubtitles &&
        "Audio" !== item.MediaType &&
        commands.push({
          name: _globalize.default.translate("HeaderEditSubtitles"),
          id: "editsubtitles",
          icon: "&#xe01c;",
        }),
      !1 !== options.identify &&
        _itemhelper.default.canIdentify(user, item) &&
        commands.push({name: _globalize.default.translate("Identify"), id: "identify", icon: "edit"}),
      user &&
        !1 !== options.played &&
        _itemhelper.default.canMarkPlayed(item) &&
        (item.UserData 
          ? commands.push({
              name: _globalize.default.translate("HeaderMarkUnplayed"),
              id: "markunplayed",
              icon: "check",
              iconClass: "icon_circle_strike",
            })
          : commands.push({name: _globalize.default.translate("HeaderMarkPlayed"), id: "markplayed", icon: "check"})),
      options.multiSelect &&
        !_layoutmanager.default.tv &&
        commands.push({
          name: _globalize.default.translate("MultiSelect"),
          id: "multiselect",
          icon: "select_all",
          hideWithFinePointer: !0,
        }),
      "MediaStream" === item.Type &&
        item.IsExternal &&
        "Subtitle" === item.StreamType &&
        !_layoutmanager.default.tv &&
        commands.push({name: _globalize.default.translate("Preview"), id: "preview", icon: "&#xe89e;"}),
      !1 !== options.refreshMetadata &&
        _itemhelper.default.canRefreshMetadata(item, user) &&
        commands.push({name: _globalize.default.translate("HeaderRefreshMetadata"), id: "refresh", icon: "refresh"}),
      item.PlaylistItemId &&
        item.PlaylistId &&
        commands.push({
          name: _globalize.default.translate("HeaderRemoveFromPlaylist"),
          id: "removefromplaylist",
          icon: "remove_circle",
        }),
      item.CollectionId &&
        canPlay &&
        commands.push({
          name: _globalize.default.translate("HeaderRemoveFromCollection"),
          id: "removefromcollection",
          icon: "remove_circle",
        }),
      user &&
        ("VirtualFolder" === item.Type &&
          user.Policy.IsAdministrator &&
          "boxsets" !== item.CollectionType &&
          ("boxsets" !== item.CollectionType &&
            commands.push({name: _globalize.default.translate("Remove"), id: "delete", icon: "remove_circle"}),
          commands.push({name: _globalize.default.translate("Rename"), id: "renamelibrary", icon: "edit"})),
        !1 !== options.refreshMetadata &&
          _itemhelper.default.canRefreshMetadata(item, user) &&
          "Playlist" !== item.Type &&
          "Genre" !== item.Type &&
          "MusicGenre" !== item.Type &&
          "GameGenre" !== item.Type &&
          "Channel" !== item.Type &&
          "MusicArtist" !== item.Type &&
          commands.push({name: _globalize.default.translate("HeaderScanLibraryFiles"), id: "scan", icon: "refresh"})),
      options.removeFromNextUp &&
        commands.push({
          name: _globalize.default.translate("HeaderRemoveFromNextUp"),
          id: "removefromnextup",
          icon: "remove_circle",
        }),
      options.removeFromResume &&
        commands.push({
          name: _globalize.default.translate("HeaderRemoveFromContinueWatching"),
          id: "removefromresume",
          icon: "remove_circle",
        }),
      "ItemImage" === item.Type &&
        ("Backdrop" === item.ImageType
          ? (item.ImageIndex &&
              commands.push({
                name: _globalize.default.translate("HeaderMoveUpInOrder"),
                id: "moveimageleft",
                icon: "arrow_upward",
              }),
            item.ImageIndex < item.TotalImages - 1 &&
              commands.push({
                name: _globalize.default.translate("HeaderDownUpInOrder"),
                id: "moveimageright",
                icon: "arrow_downward",
              }))
          : (item.ImageTag ||
              commands.push({
                name: _globalize.default.translate("HeaderAddImageFromUrl"),
                id: "addimagefromurl",
                icon: "link",
              }),
            item.Providers.length &&
              ((text = item.ImageTag
                ? _globalize.default.translate("HeaderSearchNewImage")
                : _globalize.default.translate("HeaderSearchForAnImage")),
              commands.push({name: text, id: "searchimageproviders", icon: "search"})),
            _servicelocator.appHost.supports("fileinput") &&
              commands.push({
                name: _globalize.default.translate("HeaderSelectImageFile"),
                id: "addimage",
                icon: "add_circle_outline",
              }),
            item.ImageTag &&
              commands.push({
                name: _globalize.default.translate("HeaderSetImageFromUrl"),
                id: "addimagefromurl",
                icon: "link",
              })),
        item.ImageTag &&
          commands.push({name: _globalize.default.translate("HeaderDeleteImage"), id: "delete", icon: "delete"})),
      "Plugin" === item.Type &&
        user.Policy.IsAdministrator &&
        item.ConfigPageUrl &&
        commands.push({name: _globalize.default.translate("Settings"), id: "open", icon: "settings"}),
      restrictOptions ||
        (!1 !== options.share &&
          _itemhelper.default.canShare(item, user) &&
          commands.push({name: _globalize.default.translate("Share"), id: "share", icon: "share"})),
      "Recording" === item.Type &&
        "InProgress" === item.Status &&
        user.Policy.EnableLiveTvManagement &&
        !1 !== options.cancelTimer &&
        commands.push({
          name: _globalize.default.translate("HeaderStopRecording"),
          id: "canceltimer",
          icon: "fiber_manual_record",
        }),
      "ChannelManagementInfo" === item.Type &&
        (item.SortIndexNumber &&
          commands.push({
            name: _globalize.default.translate("HeaderMoveUpInOrder"),
            id: "movechannelup",
            icon: "arrow_upward",
          }),
        commands.push({
          name: _globalize.default.translate("HeaderDownUpInOrder"),
          id: "movechanneldown",
          icon: "arrow_downward",
        })),
      ("LiveTVTunerDevice" !== item.Type && "LiveTVGuideSource" !== item.Type) ||
        !user.Policy.IsAdministrator ||
        commands.push({name: _globalize.default.translate("Delete"), id: "delete", icon: "delete"}),
      "Plugin" === item.Type &&
        user.Policy.IsAdministrator &&
        commands.push({name: _globalize.default.translate("Uninstall"), id: "delete", icon: "delete"}),
      !1 !== options.openAlbum &&
        item.AlbumId &&
        "Photo" !== item.MediaType &&
        commands.push({name: _globalize.default.translate("HeaderViewAlbum"), id: "album", icon: "&#xE019;"}),
      !1 !== options.openArtist &&
        item.ArtistItems &&
        item.ArtistItems.length &&
        commands.push({name: _globalize.default.translate("HeaderViewArtist"), id: "artist", icon: "&#xE7FD;"}),
      "Server" === item.Type &&
        commands.push({name: _globalize.default.translate("HeaderViewServerInfo"), id: "serverinfo", icon: "&#xE63E;"}),
      options.showSeason &&
        "Episode" === item.Type &&
        commands.push({name: _globalize.default.translate("HeaderViewSeason"), id: "season", icon: "&#xf1c8;"}),
      !options.showSeries ||
        ("Episode" !== item.Type && "Season" !== item.Type) ||
        commands.push({name: _globalize.default.translate("HeaderViewSeries"), id: "series", icon: "&#xf1c8;"}),
      "Server" === item.Type &&
        apiClient &&
        apiClient.supportsWakeOnLan() &&
        commands.push({name: _globalize.default.translate("HeaderWakeServer"), id: "wakeserver", icon: "&#xE63E;"}),
      commands
    );
  }
  function getResolveFn(id, changed, deleted) {
    return function (result) {
      return Promise.resolve({command: id, updated: changed, deleted: deleted, result: result});
    };
  }
  function executeCommand(item, id, options) {
    var itemId = item.Id,
      serverId = item.ServerId,
      apiClient = _connectionmanager.default.getApiClient(item);
    switch (id) {
      case "renamelibrary":
        return (function (apiClient, virtualFolder, button) {
          return require(["prompt"]).then(function (responses) {
            return (0, responses[0])({
              label: _globalize.default.translate("LabelNewName"),
              confirmText: _globalize.default.translate("ButtonRename"),
              value: virtualFolder.Name,
            }).then(function (newName) {
              var refreshAfterChange;
              if (newName && newName !== virtualFolder.Name)
                return (
                  (refreshAfterChange = "true" === button.closest(".page").getAttribute("data-refreshlibrary")),
                  apiClient.renameVirtualFolder(virtualFolder, newName, refreshAfterChange)
                );
            });
          });
        })(apiClient, item, options.positionTo).then(getResolveFn(id, !0));
      case "changelibrarycontenttype":
        return (
          options.positionTo,
          require(["alert"])
            .then(function (responses) {
              return (0,
              responses[0])({title: _globalize.default.translate("HeaderChangeFolderType"), text: _globalize.default.translate("HeaderChangeFolderTypeHelp")});
            })
            .then(getResolveFn(id))
        );
      case "canceltimer":
        return (function (item) {
          return require(["recordingHelper"]).then(function (responses) {
            var timerId = item.TimerId || item.Id;
            return responses[0].cancelTimerWithConfirmation(timerId, item.ServerId);
          });
        })(item).then(getResolveFn(id, !0, !0));
      case "cancelseriestimer":
        return (function (item) {
          return require(["recordingHelper"]).then(function (responses) {
            return responses[0].cancelSeriesTimerWithConfirmation(item.Id, item.ServerId);
          });
        })(item).then(getResolveFn(id, !0, !0));
      case "refresh":
        return (
          (function (item, mode) {
            require(["refreshDialog"], function (refreshDialog) {
              new refreshDialog({items: [item], mode: mode}).show();
            });
          })(item),
          getResolveFn(id)()
        );
      case "scan":
        return (
          (function (apiClient, item) {
            apiClient
              .refreshItem(item.Id, {
                Recursive: !0,
                ImageRefreshMode: "Default",
                MetadataRefreshMode: "Default",
                ReplaceAllImages: !1,
                ReplaceAllMetadata: !1,
              })
              .then(function () {
                var text;
                (text = _globalize.default.translate("ScanningLibraryFilesDots")),
                  require(["toast"], function (toast) {
                    toast(text);
                  });
              });
          })(apiClient, item),
          getResolveFn(id)()
        );
      case "share":
        var shareTitle = _itemhelper.default.getDisplayName(item),
          shareText = shareTitle;
        return (
          item.Overview && (shareText += " - " + item.Overview),
          navigator
            .share({
              title: shareTitle,
              text: shareText,
              url:
                "Photo" === item.Type
                  ? apiClient.getItemDownloadUrl(item.Id)
                  : apiClient.getUrl("share").replace("/share", ""),
            })
            .then(getResolveFn(id))
        );
      case "sync":
        return require(["syncDialog"])
          .then(function (responses) {
            return responses[0].showMenu({items: [item], serverId: serverId, mode: "sync"});
          })
          .then(getResolveFn(id));
      case "synclocal":
        return require(["syncDialog"])
          .then(function (responses) {
            return responses[0].showMenu({items: [item], serverId: serverId, mode: "download"});
          })
          .then(getResolveFn(id));
      case "convert":
        return require(["syncDialog"])
          .then(function (responses) {
            return responses[0].showMenu({items: [item], serverId: serverId, mode: "convert"});
          })
          .then(getResolveFn(id));
      case "editsubtitles":
        return require(["subtitleEditor"]).then(function (responses) {
          return responses[0]
            .show({
              item: item,
              mediaSource: (function (mediaSources, mediaSourceId) {
                for (var i = 0, length = mediaSources.length; i < length; i++)
                  if (mediaSources[i].Id === mediaSourceId) return mediaSources[i];
                return mediaSources[0];
              })(item.MediaSources, options.mediaSourceId),
            })
            .then(getResolveFn(id, !0));
        });
      case "editimages":
        return require(["imageEditor"]).then(function (responses) {
          return responses[0].show({itemId: itemId, serverId: serverId}).then(getResolveFn(id, !0));
        });
      case "removefromplaylist":
        return apiClient.removeItemsFromPlaylist(item.PlaylistId, [item]).then(getResolveFn(id));
      case "removefromcollection":
        return apiClient.removeItemsFromCollection(item.CollectionId, [item]).then(getResolveFn(id));
      case "multiselect":
      case "connecttoserver":
        return _commandprocessor.default.executeCommand(id, item, options), getResolveFn(id)();
      case "delete":
        return _commandprocessor.default.executeCommand(id, item, options).then(getResolveFn(id, !0, !0));
      case "edit":
      case "identify":
      case "removefromresume":
      case "removefromnextup":
        return _commandprocessor.default.executeCommand(id, item, options).then(getResolveFn(id, !0));
      default:
        return _commandprocessor.default.executeCommand(id, item, options).then(getResolveFn(id));
    }
  }
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    (_exports.default = {
      getCommands: getCommands,
      show: function (options) {
        var commands = getCommands(options);
        return commands.length
          ? require(["cardBuilder", "actionsheet"]).then(function (responses) {
              return responses[1]
                .show({
                  items: commands,
                  positionTo: options.positionTo,
                  positionY: options.positionY,
                  positionX: options.positionX,
                  positionClientY: options.positionClientY,
                  positionClientX: options.positionClientX,
                  transformOrigin: options.transformOrigin,
                  iconRight: !0,
                  item: options.item,
                  cardBuilder: responses[0],
                  resolveOnClick: ["share"],
                  hasItemIcon: !0,
                  autoTvLayout: options.autoTvLayout,
                })
                .then(function (id) {
                  return executeCommand(options.item, id, options);
                });
            })
          : Promise.reject();
      },
      supportsContextMenu: function (item) {
        var itemType = item.Type;
        return (
          "Program" !== itemType &&
          "AddServer" !== itemType &&
          "EmbyConnect" !== itemType &&
          ("MediaStream" === itemType
            ? !("Subtitle" !== item.StreamType || !item.IsExternal)
            : !(!item.Id && "Trailer" === item.Type))
        );
      },
    });
});
