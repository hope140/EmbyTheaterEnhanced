define([
  "exports",
  "./commandprocessor.js",
  "./common/inputmanager.js",
  "./emby-apiclient/connectionmanager.js",
  "./common/playback/playbackmanager.js",
], function (_exports, _commandprocessor, _inputmanager, _connectionmanager, _playbackmanager) {
  function getItemElementFromChildNode(child, isMainElement, itemsContainer) {
    itemsContainer =
      (itemsContainer = null == itemsContainer ? void 0 : itemsContainer.getItemSelector()) ||
      ".card,.listItem,.epgRow,.dataGridItem";
    return isMainElement ? child.closest(itemsContainer) : child.closest("[data-type]," + itemsContainer);
  }
  function getItemFromElement(element, itemsContainer) {
    var item;
    return (item =
      (itemsContainer = itemsContainer || element.closest(".itemsContainer")) &&
      (item = itemsContainer.getItemFromElement(element))
        ? item
        : {
            Type: element.getAttribute("data-type"),
            Id: element.getAttribute("data-id"),
            ServerId: element.getAttribute("data-serverid"),
            IsFolder: "true" === element.getAttribute("data-isfolder"),
            Status: element.getAttribute("data-status") || null,
            MediaType: element.getAttribute("data-mediatype") || null,
            ChannelId: element.getAttribute("data-channelid") || null,
            TimerId: element.getAttribute("data-timerid") || null,
            SeriesTimerId: element.getAttribute("data-seriestimerid") || null,
          });
  }
  function notifyRefreshNeeded(childElement, itemsContainer) {
    (itemsContainer = itemsContainer || childElement.closest("[is=emby-itemscontainer]")) &&
      itemsContainer.notifyRefreshNeeded(!0);
  }
  function showContextMenu(itemElement, options) {
    var itemsContainer = options.itemsContainer || itemElement.closest(".itemsContainer");
    Promise.all([
      (function (button, itemsContainer) {
        var itemFromElement = getItemFromElement(
          (button = getItemElementFromChildNode(button, null, itemsContainer)),
          itemsContainer
        );
        if (
          "Plugin" === (button = itemFromElement.Type) ||
          "Device" === button ||
          "Server" === button ||
          "Log" === button ||
          "ApiKey" === button ||
          "ActivityLogEntry" === button ||
          "MediaStream" === button ||
          "ItemImage" === button ||
          "LiveTVTunerDevice" === button ||
          "LiveTVGuideSource" === button ||
          "ChannelManagementInfo" === button ||
          "ActiveSession" === button
        )
          return Promise.resolve(itemFromElement);
        if (!(itemsContainer = itemFromElement.Id)) return Promise.resolve(itemFromElement);
        var apiClient = _connectionmanager.default.getApiClient(itemFromElement);
        return "VirtualFolder" === button
          ? (function (apiClient, id) {
              return apiClient.getVirtualFolders().then(function (result) {
                return result.Items.filter(function (u) {
                  return u.ItemId === id;
                })[0];
              });
            })(apiClient, itemsContainer)
          : "User" === button
          ? apiClient.getUser(itemsContainer)
          : "Timer" === button
          ? apiClient.getLiveTvTimer(itemsContainer)
          : "SeriesTimer" === button
          ? apiClient.getLiveTvSeriesTimer(itemsContainer)
          : apiClient.getItem(apiClient.getCurrentUserId(), itemsContainer).then(function (fullItem) {
              return (
                (fullItem.PlaylistItemId = itemFromElement.PlaylistItemId),
                (fullItem.CollectionId = itemFromElement.CollectionId),
                (fullItem.PlaylistId = itemFromElement.PlaylistId),
                fullItem
              );
            });
      })(itemElement, itemsContainer),
      require(["itemContextMenu"]),
    ]).then(function (responses) {
      var item = responses[0];
      return (function (item) {
        return (item = item.ServerId) && (item = _connectionmanager.default.getApiClient(item)).getCurrentUserId()
          ? item.getCurrentUser()
          : Promise.resolve(null);
      })(item).then(function (user) {
        options.positionTo && !options.itemElement && (options.itemElement = itemElement);
        var contextMenuOptions = Object.assign({}, itemsContainer.getContextMenuOptions());
        return responses[1][0]
          .show(
            Object.assign(
              contextMenuOptions,
              {
                item: item,
                play: !0,
                queue: !0,
                playAllFromHere: !item.IsFolder,
                queueAllFromHere: !item.IsFolder,
                user: user,
                multiSelect: !!itemElement.querySelector(".chkItemSelectContainer"),
              },
              options
            )
          )
          .then(function (result) {
            if ("playallfromhere" === (result = result || {}).command || "queueallfromhere" === result.command)
              return executeAction(null, itemElement, itemsContainer, options.positionTo, result.command);
            (result.updated || result.deleted) && notifyRefreshNeeded(itemElement, itemsContainer);
          }, onRejected);
      });
    });
  }
  function onRejected() {}
  function executeAction(originalEvent, itemElement, itemsContainer, target, action) {
    target = target || itemElement;
    var options,
      item = getItemFromElement(
        (itemElement = getItemElementFromChildNode(itemElement, null, itemsContainer)),
        itemsContainer
      );
    item.ServerId, item.Type;
    if ("programdialog" === action)
      !(function (item) {
        require(["recordingCreator"], function (recordingCreator) {
          recordingCreator.show(item);
        });
      })(item);
    else {
      if ("custom" !== action)
        return (
          ((options = {}).positionTo = target),
          (options.itemElement = itemElement),
          (options.eventType = originalEvent.type),
          (options.eventTarget = originalEvent.target),
          "menu" === action || "info" === action
            ? (originalEvent && "click" === originalEvent.type
                ? ((options.positionY = "bottom"), (options.positionX = "right"))
                : originalEvent.detail.originalEvent &&
                  ((options.positionY = "bottom"),
                  (options.positionX = "right"),
                  (options.positionClientX = originalEvent.detail.originalEvent.clientX),
                  (options.positionClientY = originalEvent.detail.originalEvent.clientY)),
              showContextMenu(itemElement, options),
              Promise.resolve())
            : ("link" === action &&
                itemsContainer &&
                (options.context = ((itemsContainer.currentListOptions || {}).options || {}).context),
              _commandprocessor.default.executeCommand(action, item, options).then(
                (function (id, itemElement) {
                  return function () {
                    switch (id) {
                      case "canceltimer":
                      case "cancelseriestimer":
                      case "delete":
                        notifyRefreshNeeded(itemElement);
                    }
                    return Promise.resolve();
                  };
                })(action, itemElement),
                returnResolvedPromise
              ))
        );
      (originalEvent = target.getAttribute("data-customaction")),
        itemElement.dispatchEvent(
          new CustomEvent("action-" + originalEvent, {
            detail: {playlistItemId: item.PlaylistItemId, item: item},
            cancelable: !1,
            bubbles: !0,
          })
        );
    }
  }
  function returnResolvedPromise() {
    return Promise.resolve();
  }
  function onClick(e) {
    var target = e.target,
      itemElement = target.closest(".itemAction");
    if (itemElement) {
      var actionElement = itemElement,
        action = actionElement.getAttribute("data-action");
      if (
        (action ||
          ((actionElement = actionElement.closest("[data-action]")) &&
            (action = actionElement.getAttribute("data-action"))),
        action)
      )
        if (
          (executeAction(e, itemElement, target.closest(".itemsContainer"), actionElement, action),
          "multiselect" !== action &&
            "openlink" !== action &&
            "togglechanneldisabled" !== action &&
            "toggleitemselected" !== action)
        )
          return "default" !== action && e.preventDefault(), e.stopPropagation(), !1;
    }
  }
  function onCommand(e) {
    var target,
      itemsContainer,
      itemElement,
      scroller,
      cmd = e.detail.command;
    "play" === cmd || "playpause" === cmd
      ? ((itemsContainer = (target = e.target).closest(".itemsContainer")),
        !(itemElement = getItemElementFromChildNode(target, null, itemsContainer)) ||
          (itemsContainer && "true" === itemsContainer.getAttribute("data-skipplaycommands")) ||
          _playbackmanager.default.isPlayingMediaType(["Audio", "Video"]) ||
          (e.preventDefault(), e.stopPropagation(), executeAction(e, itemElement, itemsContainer, itemElement, cmd)))
      : "resume" === cmd || "record" === cmd || "menu" === cmd || "info" === cmd
      ? ((itemsContainer = (target = e.target).closest(".itemsContainer")),
        (itemElement = getItemElementFromChildNode(target, null, itemsContainer)) &&
          (e.preventDefault(), e.stopPropagation(), executeAction(e, itemElement, itemsContainer, itemElement, cmd)))
      : "pageup" === cmd
      ? (itemsContainer = (target = e.target).closest(".itemsContainer")) &&
        (scroller = itemsContainer.closest("[is=emby-scroller]")) &&
        "false" === scroller.getAttribute("data-horizontal") &&
        (itemsContainer.pageUp(target), e.preventDefault(), e.stopPropagation())
      : "pagedown" === cmd
      ? (itemsContainer = (target = e.target).closest(".itemsContainer")) &&
        (scroller = itemsContainer.closest("[is=emby-scroller]")) &&
        "false" === scroller.getAttribute("data-horizontal") &&
        (itemsContainer.pageDown(target), e.preventDefault(), e.stopPropagation())
      : "end" === cmd
      ? (itemsContainer = (target = e.target).closest(".itemsContainer")) &&
        (scroller = itemsContainer.closest("[is=emby-scroller]")) &&
        "false" === scroller.getAttribute("data-horizontal") &&
        (itemsContainer.focusLast(), e.preventDefault(), e.stopPropagation())
      : "select" === cmd &&
        "DIV" === (target = e.target).tagName &&
        !target.closest("a,button,.itemAction") &&
        ((itemsContainer = target.closest(".itemsContainer")),
        (itemElement = getItemElementFromChildNode(target, null, itemsContainer))) &&
        ((itemElement.querySelector(".itemAction") || itemElement).click(), e.preventDefault(), e.stopPropagation());
  }
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    (_exports.default = {
      on: function (context, options) {
        !1 !== (options = options || {}).click && context.addEventListener("click", onClick),
          !1 !== options.command && _inputmanager.default.on(context, onCommand);
      },
      off: function (context, options) {
        (options = options || {}),
          context.removeEventListener("click", onClick),
          !1 !== options.command && _inputmanager.default.off(context, onCommand);
      },
      onClick: onClick,
      getShortcutAttributesHtml: function (item, options) {
        var type,
          dataAttributes = "";
        return (
          options.isBoundListItem ||
            ((type = item.Type) && (dataAttributes += ' data-type="' + type + '"'),
            (type = item.ServerId || options.serverId) && (dataAttributes += ' data-serverid="' + type + '"'),
            (type = item.MediaType) && (dataAttributes += ' data-mediatype="' + type + '"'),
            (type = item.ChannelId) && (dataAttributes += ' data-channelid="' + type + '"')),
          options.isVirtualList || ((type = item.Id || item.ItemId) && (dataAttributes += ' data-id="' + type + '"')),
          dataAttributes
        );
      },
      getShortcutAttributes: function (item, options) {
        var type,
          dataAttributes = [];
        return (
          options.isBoundListItem ||
            ((type = item.Type) && dataAttributes.push({name: "data-type", value: type}),
            (type = item.ServerId || options.serverId) && dataAttributes.push({name: "data-serverid", value: type}),
            (type = item.MediaType) && dataAttributes.push({name: "data-mediatype", value: type}),
            (type = item.ChannelId) && dataAttributes.push({name: "data-channelid", value: type})),
          options.isVirtualList ||
            ((type = item.Id || item.ItemId) && dataAttributes.push({name: "data-id", value: type})),
          dataAttributes
        );
      },
      getItemElementFromChildNode: getItemElementFromChildNode,
      getItemFromChildNode: function (child, isMainElement, itemsContainer) {
        return getItemFromElement(getItemElementFromChildNode(child, isMainElement, itemsContainer), itemsContainer);
      },
      getItemFromElement: getItemFromElement,
    });
});
