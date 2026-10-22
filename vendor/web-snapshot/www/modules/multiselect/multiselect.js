define([
  "exports",
  "./../dom.js",
  "./../common/playback/playbackmanager.js",
  "./../emby-apiclient/connectionmanager.js",
  "./../common/globalize.js",
  "./../loading/loading.js",
  "./../common/itemhelper.js",
  "./../shortcuts.js",
  "./../common/servicelocator.js",
], function (
  _exports,
  _dom,
  _playbackmanager,
  _connectionmanager,
  _globalize,
  _loading,
  _itemhelper,
  _shortcuts,
  _servicelocator
) {
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    require(["css!modules/multiselect/multiselect.css"]);
  var rangeSelectionInfo,
    currentSelectionCommandsPanel,
    selectedItems = [],
    selectedItemsMap = {},
    header = document.querySelector(".skinHeader");
  function getSelectedItemsMap(serverId) {
    return selectedItemsMap[(serverId = serverId || "0")] || (selectedItemsMap[serverId] = {});
  }
  function hideSelections() {
    var selectionCommandsPanel = currentSelectionCommandsPanel;
    if (selectionCommandsPanel) {
      selectionCommandsPanel.parentNode.removeChild(selectionCommandsPanel),
        (selectedItems = []),
        (selectedItemsMap = {}),
        (rangeSelectionInfo = currentSelectionCommandsPanel = null);
      for (var elems = document.querySelectorAll(".multi-select-active"), i = 0, length = elems.length; i < length; i++)
        elems[i].classList.remove("multi-select-active"),
          elems[i].dispatchEvent(new CustomEvent("multiselectinactive", {bubbles: !0, cancelable: !1, detail: {}}));
      for (i = 0, length = (elems = document.querySelectorAll(".chkItemSelect:checked")).length; i < length; i++)
        elems[i].checked = !1;
      for (i = 0, length = (elems = document.querySelectorAll(".item-multiselected")).length; i < length; i++)
        elems[i].classList.remove("item-multiselected");
    }
    header.classList.remove("headroomDisabled");
  }
  function alertText(options) {
    return new Promise(function (resolve, reject) {
      require(["alert"], function (alert) {
        alert(options).then(resolve, resolve);
      });
    });
  }
  function separateItemsByServer(items) {
    for (var servers = [], serversMap = {}, i = 0, length = items.length; i < length; i++) {
      var serverId,
        server,
        item = items[i],
        apiClient = _connectionmanager.default.getApiClient(item);
      apiClient &&
        ((server = serversMap[(serverId = apiClient.serverId())]) ||
          ((serversMap[serverId] = server = {apiClient: apiClient, items: []}), servers.push(server)),
        server.items.push(item));
    }
    return servers;
  }
  function removeFromCollection(items, users) {
    for (var servers = separateItemsByServer(items), promises = [], i = 0, length = servers.length; i < length; i++) {
      var server = servers[i],
        apiClient = server.apiClient,
        server = (function (items, users) {
          for (var list = [], i = 0, length = items.length; i < length; i++) {
            var item = items[i],
              user = users[item.ServerId];
            _itemhelper.default.supportsAddingToCollection(item, user) && list.push(item);
          }
          return list;
        })(server.items, users);
      server.length && promises.push(apiClient.removeItemsFromCollection(server[0].CollectionId, server));
    }
    Promise.all(promises);
  }
  function removeFromPlaylist(items, users) {
    for (var servers = separateItemsByServer(items), promises = [], i = 0, length = servers.length; i < length; i++) {
      var server = servers[i],
        apiClient = server.apiClient,
        server = (function (items, users) {
          for (var list = [], i = 0, length = items.length; i < length; i++) {
            var item = items[i];
            users[item.ServerId];
            _itemhelper.default.supportsAddingToPlaylist(item) && list.push(item);
          }
          return list;
        })(server.items, users);
      server.length && promises.push(apiClient.removeItemsFromPlaylist(server[0].PlaylistId, server));
    }
    Promise.all(promises);
  }
  function deleteItems(items) {
    var msg = _globalize.default.translate("ConfirmDeleteItem"),
      title = _globalize.default.translate("HeaderDeleteItem");
    1 < items.length &&
      ((msg = _globalize.default.translate("ConfirmDeleteItems")),
      (title = _globalize.default.translate("HeaderDeleteItems"))),
      (msg += "\n\n" + _globalize.default.translate("AreYouSureToContinue")),
      require(["confirm"]).then(function (responses) {
        return responses[0]({
          title: title,
          text: msg,
          confirmText: _globalize.default.translate("Delete"),
          primary: "cancel",
        }).then(function () {
          for (
            var servers = separateItemsByServer(items), promises = [], i = 0, length = servers.length;
            i < length;
            i++
          ) {
            var server = servers[i],
              apiClient = server.apiClient,
              server = (function (items) {
                for (var list = [], i = 0, length = items.length; i < length; i++) {
                  var item = items[i];
                  item.CanDelete && list.push(item);
                }
                return list;
              })(server.items);
            server.length && promises.push(apiClient.deleteItems(server));
          }
          return promises.length
            ? Promise.all(promises).catch(function () {
                return alertText(_globalize.default.translate("ErrorDeletingItem"));
              })
            : showNoItemsMessage();
        });
      });
  }
  function filterItemsToOneServer(items) {
    if (!items.length) return items;
    var serverId = items[0].ServerId;
    if (!serverId) return [];
    for (var list = [], i = 0, length = items.length; i < length; i++) {
      var item = items[i];
      item.ServerId === serverId && list.push(item);
    }
    return list;
  }
  function showNoItemsMessage() {
    return alertText(_globalize.default.translate("NoSelectedItemsSupportOperation"));
  }
  function mapApiClientArrayToObject(responses) {
    for (var map = {}, i = 0, length = responses.length; i < length; i++) {
      var user = responses[i];
      map[user.ServerId] = user;
    }
    return map;
  }
  function syncItems(items, users, isLocalSync) {
    for (var list = [], i = 0, length = items.length; i < length; i++) {
      var item = items[i],
        user = users[item.ServerId];
      _itemhelper.default.canSync(user, item) && list.push(items[i]);
    }
    if (!(items = filterItemsToOneServer((items = list))).length) return showNoItemsMessage();
    var serverId = items[0].ServerId;
    require(["syncDialog"], function (syncDialog) {
      syncDialog.showMenu({items: items, isLocalSync: isLocalSync, serverId: serverId});
    });
  }
  function sendToast(text) {
    require(["toast"]).then(function (responses) {
      return (0, responses[0])(text), Promise.resolve();
    });
  }
  function showMenuForSelectedItems(e) {
    var items = selectedItems;
    return (function (items) {
      for (var promises = [], servers = {}, i = 0, length = items.length; i < length; i++) {
        var item = items[i],
          serverId = item.ServerId;
        serverId &&
          !servers[serverId] &&
          ((servers[serverId] = !0), promises.push(_connectionmanager.default.getApiClient(item).getCurrentUser()));
      }
      return Promise.all(promises).then(mapApiClientArrayToObject);
    })(items).then(function (users) {
      var menuItems = [];
      if (
        (!(function (items) {
          for (var i = 0, length = items.length; i < length; i++)
            if (_playbackmanager.default.canQueue(items[i])) return 1;
        })(items) ||
          (menuItems.push({name: _globalize.default.translate("HeaderAddToPlayQueue"), id: "queue", icon: "&#xe03b;"}),
          menuItems.push({name: _globalize.default.translate("HeaderPlayNext"), id: "queuenext", icon: "&#xe03b;"})),
        !(function (items, users) {
          for (var i = 0, length = items.length; i < length; i++) {
            var item = items[i],
              user = users[item.ServerId];
            if (_itemhelper.default.supportsAddingToCollection(item, user)) return 1;
          }
        })(items, users) ||
          menuItems.push({
            name: _globalize.default.translate("HeaderAddToCollection"),
            id: "addtocollection",
            icon: "&#xe03b;",
          }),
        !(function (items) {
          for (var i = 0, length = items.length; i < length; i++)
            if (_itemhelper.default.supportsAddingToPlaylist(items[i])) return 1;
        })/*(items) ||
          menuItems.push({
            name: _globalize.default.translate("HeaderAddToPlaylist"),
            id: "addtoplaylist",
            icon: "&#xe03b;",
          })*/,
        !(function (items, users) {
          for (var i = 0, length = items.length; i < length; i++) {
            var item = items[i],
              user = users[item.ServerId];
            if (_itemhelper.default.canConvert(item, user, _connectionmanager.default.getApiClient(item))) return 1;
          }
        })(items, users) ||
          menuItems.push({name: _globalize.default.translate("Convert"), id: "convert", icon: "sync"}),
        !(function (items) {
          for (var i = 0, length = items.length; i < length; i++) if (items[i].CanDelete) return 1;
        })(items) || menuItems.push({name: _globalize.default.translate("Delete"), id: "delete", icon: "delete"}),
        (function (items, users) {
          for (var i = 0, length = items.length; i < length; i++) {
            var item = items[i],
              user = users[item.ServerId];
            if (item.CanDownload && user.Policy.EnableContentDownloading) return 1;
          }
        })(items, users) &&
          _servicelocator.appHost.supports("filedownload") &&
          items.push({name: _globalize.default.translate("Download"), id: "download", icon: "file-download"}),
        !(function (items, users) {
          for (var i = 0, length = items.length; i < length; i++) {
            var item = items[i],
              user = users[item.ServerId];
            if (_itemhelper.default.canSync(user, item)) return 1;
          }
        })(items, users) ||
          (_servicelocator.appHost.supports("sync") &&
            menuItems.push({name: _globalize.default.translate("Download"), id: "synclocal", icon: "download"}),
          menuItems.push({name: _globalize.default.translate("HeaderDownloadToDots"), id: "sync", icon: "download"})),
        !(function (items, users) {
          for (var count = 0, i = 0, length = items.length; i < length; i++) {
            var item = items[i],
              user = users[item.ServerId];
            if (_itemhelper.default.canManageMultiVersionGrouping(item, user) && 1 < ++count) return 1;
          }
        })(items, users) ||
          menuItems.push({
            name: _globalize.default.translate("HeaderGroupVersions"),
            id: "groupvideos",
            icon: "call_merge",
          }),
        !(function (items) {
          for (var i = 0, length = items.length; i < length; i++)
            if (_itemhelper.default.canMarkPlayed(items[i])) return 1;
        })(items) ||
          (menuItems.push({name: _globalize.default.translate("HeaderMarkPlayed"), id: "markplayed", icon: "check"}),
          menuItems.push({
            name: _globalize.default.translate("HeaderMarkUnplayed"),
            id: "markunplayed",
            icon: "remove",
          })),
        !(function (items, users) {
          for (var i = 0, length = items.length; i < length; i++) {
            var item = items[i],
              user = users[item.ServerId];
            if (_itemhelper.default.canRefreshMetadata(item, user)) return 1;
          }
        })(items, users) ||
          menuItems.push({name: _globalize.default.translate("HeaderRefreshMetadata"), id: "refresh", icon: "refresh"}),
        !(function (items) {
          for (var i = 0, length = items.length; i < length; i++) if (items[i].PlaylistId) return 1;
        })(items) ||
          menuItems.push({
            name: _globalize.default.translate("HeaderRemoveFromPlaylist"),
            id: "removefromplaylist",
            icon: "remove_circle",
          }),
        !(function (items, users) {
          for (var i = 0, length = items.length; i < length; i++) {
            var item = items[i],
              user = users[item.ServerId];
            if (item.CollectionId && _itemhelper.default.supportsAddingToCollection(item, user)) return 1;
          }
        })(items, users) ||
          menuItems.push({
            name: _globalize.default.translate("HeaderRemoveFromCollection"),
            id: "removefromcollection",
            icon: "remove_circle",
          }),
        !menuItems.length)
      )
        return alertText(_globalize.default.translate("NoOperationsForSelectedItems"));
      require(["actionsheet"], function (actionsheet) {
        actionsheet.show({
          items: menuItems,
          hasItemIcon: !0,
          positionTo: e.target,
          callback: function (id) {
            switch (id) {
              case "addtocollection":
                !(function (items, users) {
                  for (var list = [], i = 0, length = items.length; i < length; i++) {
                    var item = items[i],
                      user = users[item.ServerId];
                    _itemhelper.default.supportsAddingToCollection(item, user) && list.push(item);
                  }
                  if (!(items = filterItemsToOneServer((items = list))).length) return showNoItemsMessage();
                  var serverId = items[0].ServerId;
                  require(["addToList"]).then(function (responses) {
                    return new responses[0]().show({items: items, serverId: serverId, type: "Collection"});
                  });
                })(items, users),
                  hideSelections();
                break;
              case "addtoplaylist":
                !(function (items) {
                  for (var list = [], i = 0, length = items.length; i < length; i++)
                    _itemhelper.default.supportsAddingToPlaylist(items[i]) && list.push(items[i]);
                  if (!(items = filterItemsToOneServer((items = list))).length) return showNoItemsMessage();
                  var serverId = items[0].ServerId;
                  require(["addToList"]).then(function (responses) {
                    return new responses[0]().show({items: items, serverId: serverId, type: "Playlist"});
                  });
                })(items),
                  hideSelections();
                break;
              case "convert":
                !(function (items, users) {
                  for (var list = [], i = 0, length = items.length; i < length; i++) {
                    var item = items[i],
                      user = users[item.ServerId];
                    _itemhelper.default.canConvert(item, user, _connectionmanager.default.getApiClient(item)) &&
                      list.push(items[i]);
                  }
                  if (!(items = filterItemsToOneServer((items = list))).length) return showNoItemsMessage();
                  var serverId = items[0].ServerId;
                  require(["syncDialog"], function (syncDialog) {
                    syncDialog.showMenu({items: items, serverId: serverId, mode: "convert"});
                  });
                })(items, users),
                  hideSelections();
                break;
              case "delete":
                deleteItems(items), hideSelections();
                break;
              case "groupvideos":
                !(function (items, users) {
                  for (var list = [], i = 0, length = items.length; i < length; i++) {
                    var item = items[i],
                      user = users[item.ServerId];
                    _itemhelper.default.canManageMultiVersionGrouping(item, user) && list.push(items[i]);
                  }
                  var serverId = (items = filterItemsToOneServer((items = list)))[0].ServerId;
                  if (items.length < 2) return alertText(_globalize.default.translate("PleaseSelectTwoItems"));
                  _loading.default.show(),
                    _connectionmanager.default
                      .getApiClient(serverId)
                      .mergeVersions(items)
                      .then(
                        function () {
                          _loading.default.hide(), hideSelections();
                        },
                        function () {
                          _loading.default.hide(), hideSelections();
                        }
                      );
                })(items, users);
                break;
              case "markplayed":
                !(function (items) {
                  for (var any = !1, i = 0, length = items.length; i < length; i++) {
                    var apiClient,
                      item = items[i];
                    !_itemhelper.default.canMarkPlayed(item) ||
                      ((apiClient = _connectionmanager.default.getApiClient(item)) &&
                        (apiClient.markPlayed(apiClient.getCurrentUserId(), item.Id), (any = !0)));
                  }
                  if (!any) return showNoItemsMessage();
                  Promise.resolve();
                })(items),
                  hideSelections();
                break;
              case "markunplayed":
                !(function (items) {
                  for (var any = !1, i = 0, length = items.length; i < length; i++) {
                    var apiClient,
                      item = items[i];
                    !_itemhelper.default.canMarkPlayed(item) ||
                      ((apiClient = _connectionmanager.default.getApiClient(item)) &&
                        (apiClient.markUnplayed(apiClient.getCurrentUserId(), item.Id), (any = !0)));
                  }
                  if (!any) return showNoItemsMessage();
                  Promise.resolve();
                })(items),
                  hideSelections();
                break;
              case "refresh":
                !(function (items, users) {
                  for (var list = [], i = 0, length = items.length; i < length; i++) {
                    var item = items[i],
                      user = users[item.ServerId];
                    _itemhelper.default.canRefreshMetadata(item, user) && list.push(items[i]);
                  }
                  if (!(items = filterItemsToOneServer((items = list))).length) return showNoItemsMessage();
                  require(["refreshDialog"]).then(function (responses) {
                    return new responses[0]({items: items}).show();
                  });
                })(items, users),
                  hideSelections();
                break;
              case "sync":
                syncItems(items, users, !1), hideSelections();
                break;
              case "synclocal":
                syncItems(items, users, !0), hideSelections();
                break;
              case "removefromplaylist":
                removeFromPlaylist(items, users), hideSelections();
                break;
              case "removefromcollection":
                removeFromCollection(items, users), hideSelections();
                break;
              case "queue":
                _playbackmanager.default.queue({items: items}),
                  hideSelections(),
                  sendToast({text: _globalize.default.translate("HeaderAddedToPlayQueue"), icon: "&#xe03b;"}),
                  Promise.resolve();
                break;
              case "queuenext":
                _playbackmanager.default.queueNext({items: items}),
                  hideSelections(),
                  sendToast({text: _globalize.default.translate("HeaderPlayingNext"), icon: "&#xe03b;"}),
                  Promise.resolve();
            }
          },
        });
      });
    });
  }
  function getSelectedItemIdentifier(item) {
    return item.PlaylistItemId || item.Id;
  }
  function addOrRemoveSelectedItem(item, itemElement, add) {
    var serverId = item.ServerId,
      id = getSelectedItemIdentifier(item);
    add
      ? (itemElement && itemElement.classList.add("item-multiselected"),
        selectedItems.filter(function (i) {
          return getSelectedItemIdentifier(i) === id && i.ServerId === serverId;
        }).length || (selectedItems.push(item), (getSelectedItemsMap(serverId)[id] = !0)))
      : (itemElement && itemElement.classList.remove("item-multiselected"),
        (selectedItems = selectedItems.filter(function (i) {
          return getSelectedItemIdentifier(i) !== id || i.ServerId !== serverId;
        })),
        (getSelectedItemsMap(serverId)[id] = null));
  }
  function showSelections(chkItemSelect, selected) {
    chkItemSelect.classList.contains("chkItemSelect") ||
      (chkItemSelect = chkItemSelect.querySelector(".chkItemSelect")),
      null == selected ? (selected = chkItemSelect.checked) : (chkItemSelect.checked = selected);
    var itemsContainer = chkItemSelect.closest("[is=emby-itemscontainer]"),
      chkItemSelect = _shortcuts.default.getItemElementFromChildNode(chkItemSelect, !0, itemsContainer);
    addOrRemoveSelectedItem(
      _shortcuts.default.getItemFromChildNode(chkItemSelect, null, itemsContainer),
      chkItemSelect,
      selected
    ),
      selectedItems.length
        ? (itemsContainer.classList.add("multi-select-active"),
          itemsContainer.dispatchEvent(new CustomEvent("multiselectactive", {bubbles: !0, cancelable: !1, detail: {}})),
          (chkItemSelect = currentSelectionCommandsPanel) ||
            ((chkItemSelect = document.createElement("div")).classList.add("selectionCommandsPanel"),
            document.querySelector(".headerTop").appendChild(chkItemSelect),
            header.classList.add("headroomDisabled"),
            (currentSelectionCommandsPanel = chkItemSelect),
            (selected = ""),
            (selected +=
              '<button is="paper-icon-button-light" class="btnCloseSelectionPanel autoSize"><i class="md-icon">close</i></button><h1 class="itemSelectionCount"></h1><div class="multiSelectActionsContainer">'),
            (itemsContainer = _globalize.default.translate("Play")),
            (chkItemSelect.innerHTML = selected =
              (selected +=
                '<button is="paper-icon-button-light" class="btnMultiSelectPlay autoSize md-icon autortl hide" title="' +
                itemsContainer +
                '" aria-label="' +
                itemsContainer +
                '">&#xe037;</button>') +
              '<button is="paper-icon-button-light" class="btnSelectionPanelOptions autoSize md-icon">&#xE5D3;</button>' +
              "</div>"),
            chkItemSelect.querySelector(".btnCloseSelectionPanel").addEventListener("click", hideSelections),
            chkItemSelect.querySelector(".btnMultiSelectPlay").addEventListener("click", MultiSelect.play),
            (itemsContainer = chkItemSelect.querySelector(".btnSelectionPanelOptions")),
            _dom.default.addEventListener(itemsContainer, "click", showMenuForSelectedItems, {passive: !0})),
          (selected = document.querySelector(".itemSelectionCount")) && (selected.innerHTML = selectedItems.length),
          (chkItemSelect = currentSelectionCommandsPanel) &&
            (MultiSelect.canPlay()
              ? chkItemSelect.querySelector(".btnMultiSelectPlay").classList.remove("hide")
              : chkItemSelect.querySelector(".btnMultiSelectPlay").classList.add("hide")))
        : hideSelections();
  }
  function onChange(e) {
    var target = e.target,
      chkItemSelect = target.closest(".chkItemSelect");
    if (chkItemSelect)
      if (_shortcuts.default.getItemElementFromChildNode(target, !0, this))
        return showSelections(chkItemSelect, chkItemSelect.checked), e.preventDefault(), e.stopPropagation(), !1;
  }
  var supportsTouchEvent = "ontouchstart" in document.documentElement;
  function setRangeSelectionInfo(e, itemsContainer, target) {
    var pointerType = (pointerType = e.pointerType) || (supportsTouchEvent ? "touch" : "mouse");
    if ("touch" !== pointerType) {
      var pointerType = _shortcuts.default.getItemElementFromChildNode(target, !0, itemsContainer);
      if (pointerType)
        return (
          (target = itemsContainer.indexOfElement(pointerType)),
          (pointerType = rangeSelectionInfo),
          e.shiftKey && pointerType
            ? void (
                pointerType.itemsContainer === itemsContainer &&
                (function (rangeInfo, endIndex) {
                  var previousEndIndex = rangeInfo.endIndex,
                    startIndex = ((rangeInfo.endIndex = endIndex), rangeInfo.startIndex),
                    newRangeMin = Math.min(startIndex, endIndex),
                    newRangeMax = Math.max(startIndex, endIndex),
                    minIndexForUpdates =
                      null == previousEndIndex
                        ? newRangeMin
                        : Math.min(startIndex, Math.min(endIndex, previousEndIndex)),
                    maxIndexForUpdates =
                      null == previousEndIndex
                        ? newRangeMax
                        : Math.max(startIndex, Math.max(endIndex, previousEndIndex)),
                    itemsContainer = rangeInfo.itemsContainer;
                  console.log(
                    "changeSelectionRange: minIndexForUpdates: " +
                      minIndexForUpdates +
                      ", maxIndexForUpdates: " +
                      maxIndexForUpdates +
                      ", newRangeMin: " +
                      newRangeMin +
                      ", newRangeMax: " +
                      newRangeMax
                  );
                  for (var i = minIndexForUpdates; i <= maxIndexForUpdates; i++) {
                    var itemElement,
                      newChecked,
                      item = itemsContainer.getItem(i);
                    item &&
                      ((newChecked = newRangeMin <= i && i <= newRangeMax),
                      ((itemElement =
                        null == (itemElement = itemsContainer.getElement(i))
                          ? void 0
                          : itemElement.querySelector(".chkItemSelect"))
                        ? itemElement.checked
                        : isSelected(item)) !== newChecked &&
                        (itemElement
                          ? ((itemElement.checked = newChecked),
                            itemElement.dispatchEvent(new CustomEvent("change", {bubbles: !0, cancelable: !1})))
                          : addOrRemoveSelectedItem(item, null, newChecked)));
                  }
                })(pointerType, target)
              )
            : ((rangeSelectionInfo = pointerType = {itemsContainer: itemsContainer, startIndex: target}),
              void console.log("new nangeInfo: " + target))
        );
    }
  }
  function MultiSelect(options) {
    options.container.addEventListener("change", onChange);
  }
  function isSelected(item) {
    var id = getSelectedItemIdentifier(item);
    return !!id && getSelectedItemsMap(item.ServerId)[id];
  }
  document.addEventListener("viewbeforehide", hideSelections),
    (MultiSelect.prototype.showSelections = showSelections),
    (MultiSelect.prototype.onContainerClick = function (e) {
      var target = e.target,
        chkItemSelectContainer = target.closest(".chkItemSelectContainer");
      if (chkItemSelectContainer) return setRangeSelectionInfo(e, this, target), !1;
      if (selectedItems.length) {
        var itemElement = _shortcuts.default.getItemElementFromChildNode(target, !0, this);
        if (itemElement)
          if (!chkItemSelectContainer)
            return (
              showSelections(
                (chkItemSelectContainer = itemElement.querySelector(".chkItemSelect")),
                !chkItemSelectContainer.checked
              ),
              setRangeSelectionInfo(e, this, target),
              e.preventDefault(),
              e.stopPropagation(),
              !1
            );
      }
    }),
    (MultiSelect.isSelected = isSelected),
    (MultiSelect.canPlay = function () {
      return 0 < selectedItems.length;
    }),
    (MultiSelect.play = function () {
      var promise = _playbackmanager.default.play({items: selectedItems.slice(0)});
      return hideSelections(), promise;
    }),
    (_exports.default = MultiSelect);
});
