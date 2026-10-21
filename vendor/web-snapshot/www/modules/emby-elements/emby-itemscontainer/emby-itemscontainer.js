define([
  "exports",
  "./../../browser.js",
  "./../../common/globalize.js",
  "./../../dom.js",
  "./../../layoutmanager.js",
  "./../../emby-apiclient/connectionmanager.js",
  "./../../emby-apiclient/events.js",
  "./../../loading/loading.js",
  "./../../imageloader/imageloader.js",
  "./../../virtual-scroller/virtual-scroller.js",
  "./../../shortcuts.js",
  "./../../common/itemhelper.js",
  "./../../common/inputmanager.js",
  "./../../focusmanager.js",
  "./../../common/itemsrefresher.js",
], function (
  _exports,
  _browser,
  _globalize,
  _dom,
  _layoutmanager,
  _connectionmanager,
  _events,
  _loading,
  _imageloader,
  _virtualScroller,
  _shortcuts,
  _itemhelper,
  _inputmanager,
  _focusmanager,
  _itemsrefresher
) {
  var MultiSelect, nativeContextMenuEventSupported, morphdom, touchTarget;
  function onClick(e) {
    var multiSelect = this.multiSelect;
    (multiSelect && !1 === multiSelect.onContainerClick.call(this, e)) || _shortcuts.default.onClick.call(this, e);
  }
  function onChange(e) {
    _shortcuts.default.onClick.call(this, e);
  }
  function onContextMenu(e) {
    !this._touchEventsBound ||
      ((detail = e.detail) && detail.customEvent) ||
      ((this._touchEventsBound = null),
      (nativeContextMenuEventSupported = !0),
      _dom.default.removeEventListener(this, "touchstart", onTouchStart, {passive: !0}),
      _dom.default.removeEventListener(this, "touchend", onTouchEnd, {}),
      _dom.default.removeEventListener(this, "touchcancel", onTouchEnd, {}),
      _dom.default.removeEventListener(this, "touchmove", onTouchMove, {passive: !0}));
    var detail = e.target,
      detail = this.getContextMenuElementFromChildNode(detail);
    if (
      detail &&
      !this.classList.contains("multi-select-active") &&
      _inputmanager.default.trigger("menu", {sourceElement: detail, originalEvent: e})
    )
      return e.preventDefault(), !1;
  }
  function onInit() {
    this.hasInit ||
      ((this.hasInit = !0),
      this.classList.add("itemsContainer"),
      this.refreshMonitor || (this.refreshMonitor = new _itemsrefresher.default({itemIds: [], itemsContainer: this})));
  }
  function getTouches(e) {
    return e.changedTouches || e.targetTouches || e.touches;
  }
  function clearTouchStartTimeout(elem) {
    elem.touchStartTimeout &&
      (clearTimeout(elem.touchStartTimeout), (elem.touchStartTimeout = null), (elem.touchStartTimeoutTime = null));
  }
  function clearTouchTarget(container) {
    touchTarget &&
      ((touchTarget = null), _dom.default.removeEventListener(container, "touchmove", onTouchMove, {passive: !0}));
  }
  function onTouchStart(e) {
    var e = getTouches(e)[0];
    clearTouchTarget(this),
      (this.touchStartX = 0),
      (this.touchStartY = 0),
      e &&
        ((this.touchStartX = e.clientX),
        (this.touchStartY = e.clientY),
        (e = e.target) &&
          (e = e.closest(this.getItemSelector())) &&
          (clearTouchStartTimeout(this),
          _dom.default.addEventListener(this, "touchmove", onTouchMove, {passive: !0}),
          (touchTarget = e),
          (this.touchStartTimeout = setTimeout(onTouchStartTimerFired, 550)),
          (this.touchStartTimeoutTime = Date.now())));
  }
  function onTouchMove(e) {
    var touchEndX;
    touchTarget &&
      ((e = (e = getTouches(e)[0])
        ? ((touchEndX = e.clientX || 0),
          (e = e.clientY || 0),
          (touchEndX = Math.abs(touchEndX - (this.touchStartX || 0))),
          Math.abs(e - (this.touchStartY || 0)))
        : (touchEndX = 100)),
      (5 <= touchEndX || 5 <= e) && (clearTouchStartTimeout(this), clearTouchTarget(this)));
  }
  function onTouchEnd(e) {
    var time;
    getTouches(e)[0] && (time = this.touchStartTimeoutTime) && 500 <= (time = Date.now() - time) && e.preventDefault(),
      clearTouchStartTimeout(this),
      clearTouchTarget(this);
  }
  function onTouchStartTimerFired() {
    var itemElement = touchTarget;
    itemElement &&
      (_focusmanager.default.focus(itemElement, {preventScroll: !0}),
      itemElement.dispatchEvent(
        new CustomEvent("contextmenu", {bubbles: !0, cancelable: !0, detail: {customEvent: !0}})
      ));
  }
  function onDroppedOntoFullTarget(itemsContainer, draggedElement, dropTarget, item) {
    var dropTarget = _shortcuts.default.getItemFromChildNode(dropTarget, null, itemsContainer),
      itemsContainer = dropTarget.Type,
      droppedItemId = dropTarget.Id,
      droppedItemServerId = dropTarget.ServerId;
    droppedItemId &&
      droppedItemServerId &&
      ((dropTarget = _connectionmanager.default.getApiClient(dropTarget)),
      ("Playlist" !== itemsContainer && "BoxSet" !== itemsContainer) ||
        (function (apiClient, list, ids) {
          _loading.default.show();
          var apiName = "BoxSet" === list.Type ? "Collections" : "Playlists",
            apiName = apiClient.getUrl(apiName + "/" + list.Id + "/Items", {
              Ids: ids,
              userId: apiClient.getCurrentUserId(),
            });
          apiClient.ajax({type: "POST", url: apiName}).then(function () {
            _loading.default.hide();
          });
        })(dropTarget, {Id: droppedItemId, ServerId: droppedItemServerId, Type: itemsContainer}, [item.Id]));
  }
  function onReorderedTo(itemsContainer, item, draggedElement, currentIndex, dropTarget, directionUp) {
    var newIndex;
    if (
      (draggedElement.classList.contains("virtualScrollItem")
        ? ((newIndex = itemsContainer.indexOfElement(dropTarget)),
          directionUp || newIndex++,
          currentIndex < newIndex && newIndex--)
        : (itemsContainer.insertBefore(draggedElement, directionUp ? dropTarget : dropTarget.nextSibling),
          (newIndex = Array.prototype.indexOf.call(itemsContainer.children, draggedElement))),
      newIndex !== currentIndex)
    )
      return "ItemImage" === item.Type
        ? (function (item, newIndex) {
            function onDone() {
              _loading.default.hide();
            }
            var apiClient = _connectionmanager.default.getApiClient(item);
            return (
              _loading.default.show(),
              apiClient
                .updateItemImageIndex(item.Id, item.ImageType, item.ImageIndex, newIndex)
                .then(onDone, function () {
                  return (
                    _loading.default.hide(),
                    require(["alert"]).then(function (responses) {
                      return (0, responses[0])(_globalize.default.translate("DefaultErrorMessage")).then(
                        onDone,
                        onDone
                      );
                    })
                  );
                })
            );
          })(item, newIndex)
        : "ChannelManagementInfo" === item.Type
        ? (function (item, newIndex) {
            function onDone() {
              _loading.default.hide();
            }
            var apiClient = _connectionmanager.default.getApiClient(item);
            return (
              _loading.default.show(),
              apiClient.setChannelSortIndex(item, newIndex).then(onDone, function () {
                return (
                  _loading.default.hide(),
                  require(["alert"]).then(function (responses) {
                    return (0, responses[0])(_globalize.default.translate("DefaultErrorMessage")).then(onDone, onDone);
                  })
                );
              })
            );
          })(item, newIndex)
        : (directionUp = item.PlaylistId)
        ? (function (item, itemsContainer, newIndex, playlistId) {
            var apiClient = _connectionmanager.default.getApiClient(item),
              item = item.PlaylistItemId;
            _loading.default.show(),
              apiClient
                .ajax({
                  url: apiClient.getUrl("Playlists/" + playlistId + "/Items/" + item + "/Move/" + newIndex),
                  type: "POST",
                })
                .then(
                  function () {
                    _loading.default.hide(), itemsContainer.refreshItems();
                  },
                  function () {
                    _loading.default.hide(), itemsContainer.refreshItems();
                  }
                );
          })(item, itemsContainer, newIndex, directionUp)
        : void draggedElement.dispatchEvent(
            new CustomEvent("itemdrop", {
              detail: {newIndex: newIndex, playlistItemId: item.PlaylistItemId},
              bubbles: !0,
              cancelable: !1,
            })
          );
  }
  function abortRequests(instance) {
    var currentAbortController = instance.currentAbortController;
    currentAbortController && (currentAbortController.abort(), (instance.currentAbortController = null));
  }
  function onGetItemsFailed() {}
  function updateVirtualElement(child, item, index) {
    for (
      var listOptions = this.currentListOptions,
        listItemOptions = listOptions.options,
        listOptions = listOptions.renderer,
        allItemParts = this.itemParts,
        allItemParts =
          allItemParts[index] || (allItemParts[index] = listOptions.getItemParts(item, index, listItemOptions)),
        attributes = allItemParts.attributes,
        i = 0,
        length = attributes.length;
      i < length;
      i++
    ) {
      var att = attributes[i];
      child.setAttribute(att.name, att.value);
    }
    this._enableDomDiff && 1 === (listOptions = child.childNodes).length && morphdom
      ? morphdom(listOptions[0], allItemParts.html)
      : (child.innerHTML = allItemParts.html);
    MultiSelect &&
      MultiSelect.isSelected(item) &&
      (listItemOptions = child.querySelector(".chkItemSelect")) &&
      ((listItemOptions.checked = !0), child.classList.add("item-multiselected"));
    listOptions = this.onUpdateElement;
    this.onUpdateElement && listOptions(child, item, index);
  }
  function getVirtualChunkSize(elem, listOptions) {
    var size = elem.virtualChunkSize;
    if (size) return size;
    size = (listOptions = !listOptions && elem.getListOptions ? elem.getListOptions([]) : listOptions)
      ? listOptions.virtualScrollLayout
      : elem.getAttribute("data-virtualscrolllayout");
    if (size) {
      if (size.includes("horizontal")) return 12;
      elem = listOptions ? listOptions.renderer : null;
      return (null == elem ? void 0 : elem.virtualChunkSize) || 30;
    }
    return null;
  }
  function onDataFetched(result) {
    this.onDataFetched && this.onDataFetched(result);
    var focusId,
      scrollPosition,
      hasActiveElement,
      focusIndex,
      isNewVirtualScroller,
      instance,
      items = result.Items || result,
      parentContainer =
        (null != result.TotalRecordCount &&
          this.maxTotalRecordCount &&
          (result.TotalRecordCount = Math.min(result.TotalRecordCount, this.maxTotalRecordCount)),
        this.parentContainer),
      sectionSeeAllButton =
        (parentContainer &&
          (items.length
            ? ((sectionSeeAllButton = parentContainer.querySelector(".sectionSeeAllButton")) &&
                (8 <= items.length || "true" === this.getAttribute("data-alwaysshowseeall")
                  ? sectionSeeAllButton.classList.remove("hide")
                  : sectionSeeAllButton.classList.add("hide")),
              parentContainer.classList.remove("hide"))
            : parentContainer.classList.add("hide")),
        document.activeElement),
      sectionSeeAllButton =
        (this.contains(sectionSeeAllButton) &&
          ((hasActiveElement = !0),
          (parentContainer = _shortcuts.default.getItemElementFromChildNode(sectionSeeAllButton, !0, this)),
          (focusId =
            (focusId =
              null != (focusIndex = parentContainer ? this.indexOfElement(parentContainer) : null) &&
              (parentContainer = this.getItem(focusIndex))
                ? parentContainer.Id
                : focusId) || sectionSeeAllButton.getAttribute("data-id")),
          _layoutmanager.default.tv ||
            ((parentContainer = this.virtualScroller ? this.closest(".emby-scroller") : null) &&
              (scrollPosition = parentContainer.getScrollPosition()))),
        0),
      parentContainer = this.getListOptions ? this.getListOptions(items) : null,
      listItemOptions = parentContainer ? parentContainer.options : null,
      itemParts = (this.setListClasses && parentContainer.renderer.setListClasses(this, listItemOptions || {}), []),
      itemParts =
        ((itemParts.length = result.TotalRecordCount || items.length),
        (this.itemParts = itemParts),
        null != (itemParts = listItemOptions.fields) &&
          itemParts.includes("ItemCheckbox") &&
          !this._onChangeListenerBound &&
          ((this._onChangeListenerBound = !0), this.addEventListener("change", onChange)),
        this.onUpdateElement ? 0 : 4);
    return (
      (this.virtualScroller ||
        items.length >= itemParts ||
        (null != parentContainer && parentContainer.renderer.renderHeader) ||
        items.length < (result.TotalRecordCount || 0)) &&
      this.hasAttribute("data-virtualscrolllayout")
        ? ((this._hasOtherInnerHtml || (this.items && !this.virtualScroller)) &&
            ((this.innerHTML = ""), (this._hasOtherInnerHtml = null)),
          this.classList.add("virtualItemsContainer"),
          parentContainer &&
            (parentContainer.virtualScrollLayout.includes("horizontal") && (parentContainer.options.horizontal = !0),
            (parentContainer.options.isVirtualList = !0),
            (parentContainer.options.lazy = 2),
            parentContainer.renderer.setListOptions(items, parentContainer.options)),
          (isNewVirtualScroller = null == (itemParts = this.virtualScroller)),
          (this.currentListOptions = parentContainer),
          (itemParts && itemParts.templateInnerHTML === parentContainer.options.templateInnerHTML) ||
            (this.setAttribute("data-minoverhang", parentContainer.minOverhang || 1),
            this.setAttribute("layout", parentContainer.virtualScrollLayout),
            ((itemParts = this).virtualChunkSize = getVirtualChunkSize(this, parentContainer)),
            (itemParts.templateInnerHTML = listItemOptions.templateInnerHTML),
            (itemParts.templateHTML =
              "<" +
              listItemOptions.tagName +
              ' class="virtualScrollItem ' +
              listItemOptions.className +
              '" ' +
              listItemOptions.fixedAttributes +
              ">" +
              listItemOptions.templateInnerHTML +
              "</" +
              listItemOptions.tagName +
              ">"),
            (itemParts.fetchItems = this.fetchData.bind(this)),
            (this.virtualScroller = itemParts),
            (instance = this),
            parentContainer.renderer,
            _layoutmanager.default.tv,
            instance.virtualScroller && instance.virtualScroller.classList.add("virtual-scroller-overflowvisible"),
            (itemParts.updateElement = updateVirtualElement.bind(this)),
            (itemParts.onRecycleElement = this.onRecycleElement),
            (itemParts.onItemsUpdated = this.onItemsUpdated),
            itemParts.addClasses(),
            isNewVirtualScroller || itemParts.resetAll()),
          (this.items = null),
          this.onRefreshing && this.onRefreshing(result),
          itemParts.setItemSource(items, result.TotalRecordCount),
          (sectionSeeAllButton = 50))
        : ((this._hasOtherInnerHtml = null),
          this.classList.remove("virtualItemsContainer"),
          (this.currentListOptions = parentContainer),
          this.onRefreshing && this.onRefreshing(result),
          parentContainer
            ? ((parentContainer.options.horizontal = null),
              (parentContainer.options.isVirtualList = null),
              (this.innerHTML = parentContainer.renderer.getItemsHtml(items, parentContainer.options)))
            : (this.innerHTML = this.getItemsHtml(items)),
          this.virtualScroller && this.virtualScroller.disconnectedCallback(),
          (this.virtualScroller = null),
          (this.items = items),
          (listItemOptions && !1 === listItemOptions.image) || _imageloader.default.lazyChildren(this)),
      this.enableContextMenu(listItemOptions && listItemOptions.contextMenu),
      this.enableMultiSelect(listItemOptions && listItemOptions.multiSelect),
      (sectionSeeAllButton
        ? (function (delay) {
            return new Promise(function (resolve, reject) {
              setTimeout(resolve, delay);
            });
          })(sectionSeeAllButton)
        : Promise.resolve()
      ).then(
        function () {
          hasActiveElement &&
            (null != scrollPosition
              ? this.closest(".emby-scroller").scrollToPosition({position: scrollPosition, behavior: "instant"})
              : (function (itemsContainer, focusId, focusIndex) {
                  if ((console.log("setFocus: focusId: " + focusId + ", focusIndex: " + focusIndex), focusId)) {
                    focusId = itemsContainer.indexOfItemId(focusId);
                    if (-1 !== focusId)
                      return (
                        console.log("setFocus: found item at index " + focusId),
                        itemsContainer.scrollToIndex(focusId, {}, !0)
                      );
                  }
                  if (
                    null != focusIndex &&
                    ((focusIndex = parseInt(focusIndex)),
                    0 <= (focusIndex = Math.min(focusIndex, itemsContainer.getItems().length - 1)))
                  )
                    return itemsContainer.scrollToIndex(focusIndex, {}, !0);
                  _layoutmanager.default.tv &&
                    (console.log("setFocus: auto-focusing into itemsContainer"),
                    _focusmanager.default.autoFocus(itemsContainer) ||
                      ((focusId = itemsContainer.closest(".focuscontainer,.view")) &&
                        (console.log("setFocus: auto-focusing into view"), _focusmanager.default.autoFocus(focusId))));
                })(this, focusId, focusIndex));
          var dataItemIds = this.getAttribute("data-monitorids");
          this.mergeRefreshOptions({
            refreshIntervalMs: parseInt(this.getAttribute("data-refreshinterval") || "0"),
            enableUserData: listItemOptions && listItemOptions.enableUserData,
            refreshOnItemUpdated: this.refreshOnItemUpdated,
            parentId: this.getAttribute("data-parentid") || null,
            itemIds: dataItemIds ? dataItemIds.split(",") : [],
          }),
            this.afterRefresh && this.afterRefresh(result);
        }.bind(this)
      )
    );
  }
  function onItemDragStart(e) {
    e.dataTransfer.effectAllowed = "copy";
    var itemsContainer,
      e = e.target.closest('[draggable="true"]');
    e &&
      (e.classList.add("dragging"),
      (itemsContainer = e.closest(".itemsContainer")),
      (window.CurrentDragInfo = {
        element: e,
        elementIndex: itemsContainer.indexOfElement(e),
        item: _shortcuts.default.getItemFromChildNode(e, null, itemsContainer),
      }),
      e.classList.contains("ordered-drop-target-y") &&
        document.documentElement.classList.add("drag-reorder-y-active", "drag-active"));
  }
  function onItemDragEnd(e) {
    var draggableElement = e.target.closest('[draggable="true"]');
    draggableElement && draggableElement.classList.remove("dragging"),
      e.preventDefault(),
      (window.CurrentDragInfo = null),
      document.documentElement.classList.remove("drag-reorder-y-active", "drag-active");
  }
  function supportsAddingToCollection(item) {
    var user = _connectionmanager.default.getApiClient(item).getCurrentUserCached();
    return user && _itemhelper.default.supportsAddingToCollection(item, user);
  }
  function onItemDragEnter(e) {
    var elem = e.target.closest(".drop-target");
    if (!elem || !elem.classList.contains("full-drop-target")) return onItemDragOver.call(this, e);
    var listType,
      data = window.CurrentDragInfo,
      data = data ? data.item : null;
    data &&
      (("Playlist" === (listType = _shortcuts.default.getItemFromChildNode(elem).Type) &&
        _itemhelper.default.supportsAddingToPlaylist(data)) ||
        ("BoxSet" === listType && supportsAddingToCollection(data))) &&
      (e.preventDefault(), elem.classList.add("dragging-over"));
  }
  function onItemDragOver(e) {
    var listType,
      data = window.CurrentDragInfo,
      draggingElement = data ? data.element : null,
      elem = e.target.closest(".drop-target");
    elem &&
      (elem.classList.contains("full-drop-target")
        ? (data = data ? data.item : null) &&
          (("Playlist" === (listType = _shortcuts.default.getItemFromChildNode(elem).Type) &&
            _itemhelper.default.supportsAddingToPlaylist(data)) ||
            ("BoxSet" === listType && supportsAddingToCollection(data))) &&
          (e.preventDefault(), (e.dataTransfer.dropEffect = "copy"), elem.classList.add("dragging-over"))
        : elem.classList.contains("ordered-drop-target-x") &&
          draggingElement.classList.contains("ordered-drop-target-x")
        ? (e.preventDefault(),
          (e.dataTransfer.dropEffect = "copy"),
          (listType = elem.classList),
          (data = (data = elem.getBoundingClientRect()).x + data.width / 2),
          e.clientX <= data
            ? (listType.remove("dragging-over-right"), listType.add("dragging-over", "dragging-over-left"))
            : (listType.remove("dragging-over-left"), listType.add("dragging-over", "dragging-over-right")))
        : elem.classList.contains("ordered-drop-target-y") &&
          draggingElement.classList.contains("ordered-drop-target-y") &&
          (e.preventDefault(),
          (e.dataTransfer.dropEffect = "copy"),
          (data = elem.classList),
          (draggingElement = (listType = elem.getBoundingClientRect()).y + listType.height / 2),
          e.clientY <= draggingElement
            ? (data.remove("dragging-over-bottom"), data.add("dragging-over", "dragging-over-top"))
            : (data.remove("dragging-over-top"), data.add("dragging-over", "dragging-over-bottom"))));
  }
  function onItemDragLeave(e) {
    var elem,
      listType,
      data = window.CurrentDragInfo,
      data = data ? data.item : null;
    data &&
      (elem = e.target.closest(".drop-target")) &&
      (elem.classList.contains("full-drop-target")
        ? (("Playlist" === (listType = _shortcuts.default.getItemFromChildNode(elem).Type) &&
            _itemhelper.default.supportsAddingToPlaylist(data)) ||
            ("BoxSet" === listType && supportsAddingToCollection(data))) &&
          (e.preventDefault(), elem.classList.remove("dragging-over"))
        : elem.classList.contains("ordered-drop-target-x")
        ? (e.preventDefault(), elem.classList.remove("dragging-over", "dragging-over-left", "dragging-over-right"))
        : elem.classList.contains("ordered-drop-target-y") &&
          (e.preventDefault(), elem.classList.remove("dragging-over", "dragging-over-top", "dragging-over-bottom")));
  }
  function onItemDrop(e) {
    e.preventDefault();
    var dragInfo = window.CurrentDragInfo,
      draggedElement = dragInfo.element,
      draggedElementIndex = dragInfo.elementIndex,
      dragInfo = dragInfo.item,
      elem = e.target.closest(".drop-target");
    elem &&
      (elem.classList.remove(
        "dragging-over",
        "dragging-over-top",
        "dragging-over-bottom",
        "dragging-over-left",
        "dragging-over-right"
      ),
      elem.classList.contains("full-drop-target")
        ? onDroppedOntoFullTarget(elem.closest(".itemsContainer"), 0, elem, dragInfo)
        : elem.classList.contains("ordered-drop-target-x")
        ? (function (e, itemsContainer, item, draggedElement, draggedElementIndex, dropTarget) {
            var directionLeft,
              rect = (rect = dropTarget.getBoundingClientRect()).x + rect.width / 2;
            onReorderedTo(
              itemsContainer,
              item,
              draggedElement,
              draggedElementIndex,
              dropTarget,
              (directionLeft = e.clientX <= rect ? !0 : directionLeft)
            );
          })(e, elem.closest(".itemsContainer"), dragInfo, draggedElement, draggedElementIndex, elem)
        : elem.classList.contains("ordered-drop-target-y") &&
          (function (e, itemsContainer, item, draggedElement, draggedElementIndex, dropTarget) {
            var directionUp,
              rect = (rect = dropTarget.getBoundingClientRect()).y + rect.height / 2;
            onReorderedTo(
              itemsContainer,
              item,
              draggedElement,
              draggedElementIndex,
              dropTarget,
              (directionUp = e.clientY <= rect ? !0 : directionUp)
            );
          })(e, elem.closest(".itemsContainer"), dragInfo, draggedElement, draggedElementIndex, elem));
  }
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    require(["css!modules/emby-elements/emby-itemscontainer/emby-itemscontainer.css"]);
  var EmbyItemsContainer = (function (_VirtualScroller) {
    babelHelpers.inherits(EmbyItemsContainer, _VirtualScroller);
    var _super = _createSuper(EmbyItemsContainer);
    function EmbyItemsContainer() {
      babelHelpers.classCallCheck(this, EmbyItemsContainer);
      var _this,
        self = (_this = _super.call(this));
      return onInit.call(self), (_this.paused = !0), babelHelpers.possibleConstructorReturn(_this, self);
    }
    return (
      babelHelpers.createClass(EmbyItemsContainer, [
        {
          key: "connectedCallback",
          value: function () {
            _virtualScroller.default.prototype.connectedCallback.apply(this, arguments),
              onInit.call(this),
              this.addEventListener("click", onClick),
              this.addEventListener("dragstart", onItemDragStart),
              this.addEventListener("dragend", onItemDragEnd),
              this.addEventListener("dragenter", onItemDragEnter),
              this.addEventListener("dragover", onItemDragOver),
              this.addEventListener("dragleave", onItemDragLeave),
              this.addEventListener("drop", onItemDrop),
              _layoutmanager.default.tv && this.classList.add("itemsContainer-tv"),
              this.hasAttribute("data-domdiff") &&
                ((this._enableDomDiff = !0),
                morphdom ||
                  require(["morphdom"]).then(function (responses) {
                    morphdom = responses[0];
                  })),
              _shortcuts.default.on(this, {click: !1}),
              !_layoutmanager.default.tv && "ontouchstart" in document && require(["dragDropTouch"]),
              this.hasAttribute("data-contextmenu") && this.enableContextMenu(!0),
              this.hasAttribute("data-multiselect") && this.enableMultiSelect(!0),
              this.dispatchEvent(new CustomEvent("upgraded", {cancelable: !1}));
          },
        },
        {
          key: "getEventsToMonitor",
          value: function () {
            var monitor = this.getAttribute("data-monitor");
            return monitor ? monitor.split(",") : [];
          },
        },
        {
          key: "disconnectedCallback",
          value: function () {
            var refreshMonitor = this.refreshMonitor;
            refreshMonitor && (refreshMonitor.destroy(), (this.refreshMonitor = null)),
              _virtualScroller.default.prototype.disconnectedCallback.apply(this, arguments),
              abortRequests(this),
              this.enableMultiSelect(!1),
              this.removeEventListener("click", onClick),
              this.removeEventListener("change", onChange),
              this.removeEventListener("contextmenu", onContextMenu, !0),
              _shortcuts.default.off(this, {click: !1}),
              (this.fetchData = null),
              (this.getItemsHtml = null),
              (this.parentContainer = null),
              (this.virtualScroller = null),
              (this.currentListOptions = null),
              (this.itemParts = null),
              (this.items = null),
              (this._touchEventsBound = null),
              (this._contextMenuEventsBound = !0);
          },
        },
        {
          key: "pause",
          value: function () {
            this.paused = !0;
            var refreshMonitor = this.refreshMonitor;
            refreshMonitor && refreshMonitor.pause(),
              this.virtualScroller &&
                babelHelpers.get(babelHelpers.getPrototypeOf(EmbyItemsContainer.prototype), "pause", this).call(this);
          },
        },
        {
          key: "resume",
          value: function (options) {
            this.paused = !1;
            this.virtualScroller &&
              babelHelpers
                .get(babelHelpers.getPrototypeOf(EmbyItemsContainer.prototype), "resume", this)
                .call(this, options);
            var refreshMonitor = this.refreshMonitor;
            return refreshMonitor
              ? refreshMonitor.resume(options)
              : !refreshMonitor && options && options.refresh
              ? this.refreshItems()
              : Promise.resolve();
          },
        },
        {
          key: "setOtherInnerHTML",
          value: function (html) {
            this.virtualScroller && this.virtualScroller.resetAll(),
              (this._hasOtherInnerHtml = !0),
              (this.innerHTML = html);
          },
        },
        {
          key: "getItemFromElement",
          value: function (element) {
            if (this.virtualScroller)
              return babelHelpers
                .get(babelHelpers.getPrototypeOf(EmbyItemsContainer.prototype), "getItemFromElement", this)
                .call(this, element);
            if (element.parentNode === this || !element.hasAttribute("data-type")) {
              element = this.indexOfElement(element);
              if (0 <= element) {
                element = this.getItem(element);
                if (element) return element;
              }
            }
            return null;
          },
        },
        {
          key: "getItem",
          value: function (index) {
            if (this.virtualScroller)
              return babelHelpers
                .get(babelHelpers.getPrototypeOf(EmbyItemsContainer.prototype), "getItem", this)
                .call(this, index);
            var items = this.items;
            return items ? items[index] : null;
          },
        },
        {
          key: "refreshItems",
          value: function () {
            var refreshMonitor = this.refreshMonitor;
            return refreshMonitor ? refreshMonitor.refreshItems() : this.refreshItemsInternal();
          },
        },
        {
          key: "refreshItemsInternal",
          value: function () {
            if (!this.fetchData) return Promise.resolve();
            if (this.paused) return this.notifyRefreshNeeded(!1), Promise.resolve();
            this.refreshMonitor && this.refreshMonitor.notifyIsRefreshing(), abortRequests(this);
            var abortController = new AbortController(),
              query = ((this.currentAbortController = abortController), {}),
              limit = getVirtualChunkSize(this);
            return (
              limit && (query.Limit = limit),
              this.fetchData(query, abortController.signal).then(onDataFetched.bind(this), onGetItemsFailed)
            );
          },
        },
        {
          key: "notifyRefreshNeeded",
          value: function (isInForeground) {
            if (this.refreshMonitor) return this.refreshMonitor.notifyRefreshNeeded(isInForeground);
          },
        },
        {
          key: "showMultiSelect",
          value: function (childElement, selected) {
            childElement = _shortcuts.default.getItemElementFromChildNode(childElement, !0, this);
            this.multiSelect.showSelections(childElement, selected);
          },
        },
        {
          key: "enableMultiSelect",
          value: function (enabled) {
            var self,
              current = this.multiSelect;
            enabled
              ? current ||
                ((self = this),
                require(["multiSelect"], function (multiSelect) {
                  (MultiSelect = multiSelect), (self.multiSelect = new MultiSelect({container: self}));
                }))
              : current && (this.multiSelect = null);
          },
        },
        {
          key: "enableContextMenu",
          value: function (enabled) {
            enabled &&
              !(enabled = this)._contextMenuEventsBound &&
              ((enabled._contextMenuEventsBound = !0),
              enabled.addEventListener("contextmenu", onContextMenu, !0),
              _layoutmanager.default.tv ||
                nativeContextMenuEventSupported ||
                ((_browser.default.iOS || _browser.default.osx) &&
                  ((enabled._touchEventsBound = !0),
                  _dom.default.addEventListener(enabled, "touchstart", onTouchStart, {passive: !0}),
                  _dom.default.addEventListener(enabled, "touchend", onTouchEnd, {}),
                  _dom.default.addEventListener(enabled, "touchcancel", onTouchEnd, {}))));
          },
        },
        {
          key: "getItemSelector",
          value: function () {
            var listOptions = this.currentListOptions;
            return listOptions ? listOptions.options.itemSelector : ".card,.listItem,.epgRow,.dataGridItem";
          },
        },
        {
          key: "getElement",
          value: function (index) {
            if (this.virtualScroller)
              return babelHelpers
                .get(babelHelpers.getPrototypeOf(EmbyItemsContainer.prototype), "getElement", this)
                .call(this, index);
            var items = this.querySelectorAll(this.getItemSelector());
            return items.length ? items[index] : void 0;
          },
        },
        {
          key: "scrollToIndex",
          value: function (index, scrollOptions, focus) {
            if (this.virtualScroller)
              return babelHelpers
                .get(babelHelpers.getPrototypeOf(EmbyItemsContainer.prototype), "scrollToIndex", this)
                .call(this, index, scrollOptions, focus);
            var items = this.querySelectorAll(this.getItemSelector());
            !items.length ||
              ((index = items[(index = Math.min(index, items.length - 1))] || items[items.length - 1]) &&
                (focus
                  ? _focusmanager.default.focus(index)
                  : (items = this.closest("[is=emby-scroller]")) && items.toStart(index, scrollOptions)));
          },
        },
        {
          key: "pageUp",
          value: function (activeElement) {
            this.getItems() &&
              ((activeElement =
                _shortcuts.default.getItemElementFromChildNode(activeElement, !0, this) || activeElement),
              (activeElement =
                -1 === (activeElement = this.indexOfElement(activeElement)) ? 0 : Math.max(0, activeElement - 12)),
              this.scrollToIndex(activeElement, {}, !0));
          },
        },
        {
          key: "pageDown",
          value: function (activeElement) {
            var items = this.getItems();
            items &&
              ((activeElement =
                _shortcuts.default.getItemElementFromChildNode(activeElement, !0, this) || activeElement),
              (items =
                -1 === (activeElement = this.indexOfElement(activeElement))
                  ? 0
                  : Math.min(items.length - 1, activeElement + 12)),
              this.scrollToIndex(items, {}, !0));
          },
        },
        {
          key: "indexOfElement",
          value: function (element) {
            return this.virtualScroller
              ? babelHelpers
                  .get(babelHelpers.getPrototypeOf(EmbyItemsContainer.prototype), "indexOfElement", this)
                  .call(this, element)
              : parseInt(element.getAttribute("data-index") || "-1");
          },
        },
        {
          key: "indexOfItemId",
          value: function (id) {
            if (this.virtualScroller)
              return babelHelpers
                .get(babelHelpers.getPrototypeOf(EmbyItemsContainer.prototype), "indexOfItemId", this)
                .call(this, id);
            id = this.querySelector('[data-id="' + id + '"]');
            return id ? this.indexOfElement(id) : -1;
          },
        },
        {
          key: "focusLast",
          value: function () {
            var items = this.getItems();
            items && this.scrollToIndex(items.length - 1, {}, !0);
          },
        },
        {
          key: "getItems",
          value: function () {
            var virtualScroller = this.virtualScroller;
            return virtualScroller ? virtualScroller._itemSource : this.items;
          },
        },
        {
          key: "onItemUpdated",
          value: function (index, item) {
            var child,
              itemParts = this.itemParts;
            if (itemParts) {
              if (((itemParts[index] = null), this.virtualScroller))
                return babelHelpers
                  .get(babelHelpers.getPrototypeOf(EmbyItemsContainer.prototype), "onItemUpdated", this)
                  .call(this, index, item);
              this.items &&
                ((itemParts = !1),
                (child = this.getElement(index)) &&
                  (updateVirtualElement.call(this, child, item, index), (itemParts = !0)),
                itemParts && _imageloader.default.lazyChildren(this));
            }
          },
        },
        {
          key: "getContextMenuElementFromChildNode",
          value: function (child) {
            return _shortcuts.default.getItemElementFromChildNode(child, !0, this);
          },
        },
        {
          key: "mergeRefreshOptions",
          value: function (options) {
            this.refreshMonitor.mergeOptions(options);
          },
        },
        {
          key: "getContextMenuOptions",
          value: function () {
            var _this$currentListOpti;
            return (
              (null == (_this$currentListOpti = this.currentListOptions)
                ? void 0
                : _this$currentListOpti.contextMenuOptions) || {}
            );
          },
        },
      ]),
      EmbyItemsContainer
    );
  })(_virtualScroller.default);
  customElements.define("emby-itemscontainer", EmbyItemsContainer, {extends: "div"}),
    (_exports.default = EmbyItemsContainer);
});
