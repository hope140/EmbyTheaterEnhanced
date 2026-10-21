define([
  "exports",
  "./../dom.js",
  "./../browser.js",
  "./../focusmanager.js",
  "./../common/globalize.js",
  "./../common/usersettings/usersettings.js",
  "./../layoutmanager.js",
  "./../cardbuilder/cardbuilder.js",
  "./../listview/listview.js",
  "./../loading/loading.js",
  "./basetab.js",
  "./../multiselect/multiselect.js",
  "./../alphapicker/alphapicker.js",
  "./../common/playback/playbackmanager.js",
  "./../emby-apiclient/connectionmanager.js",
  "./../datagrid/datagrid.js",
], function (
  _exports,
  _dom,
  _browser,
  _focusmanager,
  _globalize,
  _usersettings,
  _layoutmanager,
  _cardbuilder,
  _listview,
  _loading,
  _basetab,
  _multiselect,
  _alphapicker,
  _playbackmanager,
  _connectionmanager,
  _datagrid
) {
  function getApiClient(instance) {
    if (instance.apiClient) return instance.apiClient;
    instance = instance.params.serverId;
    return instance ? _connectionmanager.default.getApiClient(instance) : _connectionmanager.default.currentApiClient();
  }
  function trySelectValue(instance, scroller, view, value, focus) {
    var sortValues = instance.getSortValues();
    !value || ("#" === value && "Ascending" === sortValues.sortOrder)
      ? instance.itemsContainer.scrollToIndex(0, {}, focus)
      : instance.getItems({Limit: 0}).then(function (totalResult) {
          var sortBy, query;
          totalResult.TotalRecordCount <= 1
            ? instance.itemsContainer.scrollToIndex(0, {}, focus)
            : "#" === value && "Descending" === sortValues.sortOrder
            ? instance.itemsContainer.scrollToIndex(totalResult.TotalRecordCount - 1, {}, focus)
            : ((query = {Limit: 0}),
              (sortBy = sortValues.sortBy || "").startsWith("AlbumArtist")
                ? (query.AlbumArtistStartsWithOrGreater = value)
                : sortBy.startsWith("Artist")
                ? (query.ArtistStartsWithOrGreater = value)
                : (query.NameStartsWithOrGreater = value),
              instance.getItems(query).then(function (result) {
                result =
                  "Descending" === sortValues.sortOrder
                    ? result.TotalRecordCount
                    : Math.max(totalResult.TotalRecordCount - result.TotalRecordCount, 0);
                instance.itemsContainer.scrollToIndex(result, {}, focus);
              }));
        });
  }
  function refreshAfterSettingsChange(instance) {
    instance.itemsContainer.refreshItems();
  }
  function showViewSettingsMenu() {
    var instance = this;
    require(["viewSettings"], function (ViewSettings) {
      var isGrid = "datagrid" === instance.getViewSettings().imageType,
        visibleSettings = instance.getVisibleViewSettings();
      new ViewSettings()
        .show({
          settingsKey: instance.getSettingsKey(),
          settings: instance.getViewSettings(),
          visibleSettings: visibleSettings,
          columns: instance.getDataGridOptions([], visibleSettings).columns,
          viewOptions: instance.getAvailableViewOptions(),
        })
        .then(function () {
          var defaultSortBy, defaultSortOrder;
          isGrid &&
            "datagrid" !== instance.getViewSettings().imageType &&
            ((defaultSortBy = instance.getDefaultSortBy()),
            (defaultSortOrder = getDefaultSortOrder(instance.getSortMenuOptions(), defaultSortBy)),
            instance.setSortValueInternal(defaultSortBy, defaultSortOrder)),
            refreshAfterSettingsChange(instance);
        });
    });
  }
  function getDefaultSortOrder(sortMenuOptions, sortBy) {
    if (sortBy) {
      sortMenuOptions = (function (sortMenuOptions, sortBy) {
        for (var i = 0, length = sortMenuOptions.length; i < length; i++) {
          var option = sortMenuOptions[i];
          if (option.value === sortBy) return option;
        }
        return null;
      })(sortMenuOptions, sortBy);
      if (sortMenuOptions && sortMenuOptions.value === sortBy && sortMenuOptions.defaultSortOrder)
        return sortMenuOptions.defaultSortOrder;
      if (
        (sortBy = sortBy.toLowerCase()).startsWith("sortname") ||
        sortBy.startsWith("runtime") ||
        sortBy.startsWith("album") ||
        sortBy.startsWith("isfolder") ||
        sortBy.startsWith("channelnumber")
      )
        return "Ascending";
    }
    return "Descending";
  }
  function compareByName(a, b) {
    (a = a.menuSortKey || a.name), (b = b.menuSortKey || b.name);
    return a < b ? -1 : b < a ? 1 : 0;
  }
  function setSelectedSortOption(instance, options) {
    for (var currentValues = instance.getSortValues(options), i = 0, length = options.length; i < length; i++) {
      var opt = options[i];
      if (((opt.selected = opt.value === currentValues.sortBy), opt.selected)) {
        var icon = "Descending" === currentValues.sortOrder ? "&#xE5DB;" : "&#xE5D8;";
        opt.asideIcon = icon;
        break;
      }
    }
  }
  function showSortMenu(e) {
    var instance = this;
    require(["actionsheet"], function (actionsheet) {
      var options = instance.getSortMenuOptions();
      setSelectedSortOption(instance, options),
        options.sort(compareByName),
        actionsheet
          .show({
            items: options,
            positionTo: e.target.closest("button"),
            title: _globalize.default.translate("LabelSortBy"),
            positionY: "bottom",
            hideTitleWhenNotFullscreen: !0,
            offsetTop: 2,
            hasItemAsideIcon: !0,
            hasItemSelectionState: !0,
          })
          .then(function (value) {
            instance.setSortValue(value);
          });
    });
  }
  function ListController(view, params) {
    (this.view = view),
      (this.params = params).serverId && (this.apiClient = _connectionmanager.default.getApiClient(params.serverId));
  }
  function onDataFetched(result) {
    var values = this.getSortValues(),
      values = this.enableAlphaPicker(values.sortBy, values.sortOrder);
    this.itemsContainer.onItemsUpdated = values
      ? function (startIndex, endIndex, previousStartIndex) {
          var offset,
            itemsContainer = this.itemsContainer,
            alphaPicker = this.alphaPicker;
          alphaPicker &&
            (previousStartIndex < startIndex
              ? (this._lastOffset = offset = 0.8)
              : startIndex < previousStartIndex
              ? (this._lastOffset = offset = 0.2)
              : (offset = this._lastOffset),
            (endIndex =
              (previousStartIndex = startIndex + Math.floor((endIndex - startIndex) * offset)) < 0
                ? null
                : itemsContainer.getItem(previousStartIndex)) && alphaPicker.setCurrentFromItem(endIndex));
        }.bind(this)
      : null;
  }
  function bindAll(elems, eventName, fn) {
    for (var i = 0, length = elems.length; i < length; i++) elems[i].addEventListener(eventName, fn);
  }
  function mapPrefix(i) {
    return i.Name;
  }
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    (ListController.prototype.initItemsContainer = function () {
      var view = this.view;
      (this.itemsContainer = view.querySelector(".itemsContainer")),
        (this.itemsContainer.setListClasses = !0),
        (this.itemsContainer.fetchData = this.getItems.bind(this)),
        (this.itemsContainer.virtualChunkSize = this.virtualChunkSize()),
        (this.itemsContainer.getListOptions = this.getListOptions.bind(this)),
        (this.itemsContainer.onDataFetched = onDataFetched.bind(this)),
        (this.itemsContainer.onRefreshing = this.onRefreshing.bind(this)),
        (this.itemsContainer.afterRefresh = this.afterItemsRefreshed.bind(this)),
        (this.itemsContainer.showColumnSelector = this.showColumnSelector.bind(this)),
        (this.itemsContainer.setSortValue = this.setSortValue.bind(this)),
        this.itemsContainer.addEventListener(
          "multiselectactive",
          function (e) {
            var itemsContainer = this.itemsContainer,
              _itemsContainer$curre =
                null == (_itemsContainer$curre = itemsContainer.currentListOptions)
                  ? void 0
                  : _itemsContainer$curre.renderer;
            _itemsContainer$curre &&
              _itemsContainer$curre.onMultiSelectActive &&
              _itemsContainer$curre.onMultiSelectActive(itemsContainer, this._headerElement);
          }.bind(this)
        ),
        this.itemsContainer.addEventListener(
          "multiselectinactive",
          function (e) {
            var itemsContainer = this.itemsContainer,
              _itemsContainer$curre2 =
                null == (_itemsContainer$curre2 = itemsContainer.currentListOptions)
                  ? void 0
                  : _itemsContainer$curre2.renderer;
            _itemsContainer$curre2 &&
              _itemsContainer$curre2.onMultiSelectInactive &&
              _itemsContainer$curre2.onMultiSelectInactive(itemsContainer, this._headerElement);
          }.bind(this)
        );
    }),
    (ListController.prototype.initButtons = function () {
      for (
        var hasAnyViewSettings,
          view = this.view,
          btnViewSettings = view.querySelectorAll(".btnViewSettings"),
          supportsViewSettings = !1 !== this.supportsViewSettings,
          i = 0,
          length = btnViewSettings.length;
        i < length;
        i++
      )
        btnViewSettings[i].addEventListener("click", showViewSettingsMenu.bind(this)),
          supportsViewSettings && ((hasAnyViewSettings = !0), btnViewSettings[i].classList.remove("hide"));
      var filterButtons = view.querySelectorAll(".btnFilter"),
        hasVisibleFilters = ((this.filterButtons = filterButtons), this.getVisibleFilters().length);
      for (i = 0, length = filterButtons.length; i < length; i++) {
        var btnFilter = filterButtons[i];
        btnFilter.addEventListener("click", this.showFilterMenu.bind(this)),
          hasVisibleFilters
            ? ((hasAnyViewSettings = !0), btnFilter.classList.remove("hide"))
            : btnFilter.classList.add("hide");
      }
      var sortButtons = view.querySelectorAll(".btnSort"),
        supportsSorting = ((this.sortButtons = sortButtons), this.supportsSorting());
      for (i = 0, length = sortButtons.length; i < length; i++) {
        var sortButton = sortButtons[i];
        sortButton.addEventListener("click", showSortMenu.bind(this)),
          supportsSorting
            ? ((hasAnyViewSettings = !0), sortButton.classList.remove("hide"))
            : sortButton.classList.add("hide");
      }
      (this.btnSortText = view.querySelector(".btnSortText")),
        (this.btnSortIcon = view.querySelector(".btnSortIcon")),
        null == this.enableAlphaNumericShortcuts &&
          (this.enableAlphaNumericShortcuts =
            "true" === this.itemsContainer.getAttribute("data-alphanumericshortcuts") && this.enableVirtualData());
      var btnPlay = view.querySelectorAll(".btnPlay"),
        btnShuffle = view.querySelectorAll(".btnShuffle"),
        btnQueue = view.querySelectorAll(".btnQueue"),
        btnPlay =
          (bindAll(btnPlay, "click", this.play.bind(this)),
          bindAll(btnShuffle, "click", this.shuffle.bind(this)),
          bindAll(btnQueue, "click", this.queue.bind(this)),
          this.supportsPlay() && btnPlay.length && (hasAnyViewSettings = !0),
          this.supportsShuffle() && btnShuffle.length && (hasAnyViewSettings = !0),
          this.supportsQueue() && btnQueue.length && (hasAnyViewSettings = !0),
          view.querySelector(".itemsViewSettingsContainer"));
      (this.itemsViewSettingsContainer = btnPlay) &&
        (hasAnyViewSettings || !1 !== this.enableTotalRecordCountDisplay
          ? btnPlay.classList.remove("hide")
          : btnPlay.classList.add("hide"),
        hasAnyViewSettings
          ? (btnPlay.classList.add("focusable"), btnPlay.setAttribute("data-focusabletype", "autofocus"))
          : (btnPlay.classList.remove("focusable"), btnPlay.removeAttribute("data-focusabletype")));
    }),
    (ListController.prototype.saveSortingOnServer = function () {
      return !1;
    }),
    (ListController.prototype.setSortValueInternal = function (value, sortOrder) {
      var options = this.getSortMenuOptions(),
        currentValues =
          (setSelectedSortOption(this, options), options.sort(compareByName), this.getSortValues(options)),
        currentValues =
          (sortOrder ||
            ((sortOrder = currentValues.sortOrder),
            (sortOrder =
              currentValues.sortBy === value
                ? "Ascending" === sortOrder
                  ? "Descending"
                  : "Ascending"
                : getDefaultSortOrder(options, value))),
          this.getSettingsKey()),
        options = this.saveSortingOnServer();
      _usersettings.default.setFilter(this.getSortBySettingsKey(), value, options),
        _usersettings.default.setFilter(currentValues + "-sortorder", sortOrder, options),
        this.updateSortText();
    }),
    (ListController.prototype.setSortValue = function (value) {
      this.setSortValueInternal(value), refreshAfterSettingsChange(this);
    }),
    (ListController.prototype.getPlayAction = function () {
      return null;
    }),
    (ListController.prototype.refreshPrefixes = function () {
      var instance = this;
      this.getPrefixes().then(function (prefixes) {
        instance.alphaPicker.setPrefixes(prefixes);
      });
    }),
    (ListController.prototype.getPrefixes = function () {
      if ("search" === this.params.type) return Promise.resolve([]);
      var queryInfo = this.getQueryInfo(!1),
        apiClient = this.apiClient,
        queryInfo = queryInfo.query,
        methodName =
          ((queryInfo.SortBy = null),
          (queryInfo.StartIndex = null),
          (queryInfo.Limit = null),
          (queryInfo.Fields = null),
          (queryInfo.EnableImageTypes = null),
          (queryInfo.ImageTypeLimit = null),
          (queryInfo.NameStartsWithOrGreater = null),
          (queryInfo.ArtistStartsWithOrGreater = null),
          (queryInfo.AlbumArtistStartsWithOrGreater = null),
          (queryInfo.IncludeItemTypes = this.getPrefixQueryIncludeItemTypes().join(",") || null),
          this.getPrefixesApiClientMethodName()),
        sortBy = this.getSortValues().sortBy || "";
      return (
        sortBy.startsWith("AlbumArtist")
          ? ((methodName = "getArtistPrefixes"), (queryInfo.ArtistType = "AlbumArtist"))
          : sortBy.startsWith("Artist") && ((methodName = "getArtistPrefixes"), (queryInfo.ArtistType = "Artist")),
        ("getUserPrefixes" === methodName || "getLiveTvChannelTagPrefixes" === methodName
          ? apiClient[methodName](queryInfo)
          : apiClient[methodName](apiClient.getCurrentUserId(), queryInfo)
        ).then(function (result) {
          return result.map(mapPrefix);
        })
      );
    }),
    (ListController.prototype.getContextMenuOptions = function () {
      return {};
    });
  var defaultColumnOrder = [
    "SeriesName",
    "ParentIndexNumber",
    "IndexNumber",
    "EpisodeNumber",
    "Number",
    "Name",
    "OriginalTitle",
    "SortName",
    "Filename",
    "Artist",
    "AlbumArtist",
    "Composer",
    "Album",
    "CommunityRating",
    "CriticRating",
    "OfficialRating",
    "ProductionYear",
    "PremiereDate",
    "Runtime",
    "Genres",
    "Studios",
    "Tags",
    "Container",
    "Resolution",
    "Video3DFormat",
    "Bitrate",
    "Size",
    "DatePlayed",
    "PlayCount",
    "DateCreated",
    "Played",
    "IsFavorite",
  ];
  function compareColumns(a, b) {
    (a = defaultColumnOrder.indexOf(a.id)), (b = defaultColumnOrder.indexOf(b.id));
    return (a = a < 0 ? 1e3 : a) < (b = b < 0 ? 1e3 : b) ? -1 : b < a ? 1 : 0;
  }
  function getColumnTitle(id) {
    switch (id) {
      case "SeriesName":
        return _globalize.default.translate("Series");
      case "Filename":
        return _globalize.default.translate("FileName");
      case "ParentIndexNumber":
        return _globalize.default.translate("Disc");
      case "IndexNumber":
        return _globalize.default.translate("Track");
      case "EpisodeNumber":
        return _globalize.default.translate("Number");
      case "Name":
        return _globalize.default.translate("Title");
      case "OfficialRating":
        return _globalize.default.translate("ParentalRating");
      case "ProductionYear":
        return _globalize.default.translate("Year");
      case "PremiereDate":
        return _globalize.default.translate("ReleaseDate");
      case "PlayCount":
        return _globalize.default.translate("Plays");
      case "Played":
        return _globalize.default.translate("Played");
      case "IsFavorite":
        return _globalize.default.translate("Favorite");
      case "DateCreated":
        return _globalize.default.translate("DateAdded");
      case "Video3DFormat":
        return "3D";
      default:
        return _globalize.default.translate(id);
    }
  }
  function getColumn(instance, field) {
    return {
      id: field,
      name: getColumnTitle(field),
      gridDisplayName: (function (id) {
        switch (id) {
          case "Played":
            return '<i class="md-icon dataGridHeaderIcon">&#xe92d;</i>';
          case "IsFavorite":
            return '<i class="md-icon dataGridHeaderIcon autortl">&#xe87d;</i>';
          default:
            return getColumnTitle(id);
        }
      })(field),
      type: "IsFavorite" === field || "Played" === field ? "button" : null,
      size: (function (id) {
        switch (id) {
          case "IndexNumber":
          case "ParentIndexNumber":
          case "Video3DFormat":
            return 3;
          case "ProductionYear":
          case "PlayCount":
          case "Played":
          case "IsFavorite":
            return 4;
          case "CommunityRating":
          case "CriticRating":
          case "Number":
            return 6;
          case "EpisodeNumber":
          case "Runtime":
            return 10;
          case "PremiereDate":
          case "DateCreated":
          case "DatePlayed":
          case "Bitrate":
          case "Size":
          case "Resolution":
          case "Container":
            return 12;
          case "Artist":
          case "AlbumArtist":
          case "Composer":
          case "SeriesName":
          case "Album":
          case "Genres":
            return 30;
          case "Studios":
          case "Name":
          case "OriginalTitle":
          case "SortName":
          case "Filename":
            return 40;
          default:
            return 15;
        }
      })(field),
      sortValue: (function (instance, id) {
        var _instance$getNameSort;
        switch (id) {
          case "Name":
          case "SortName":
            return null == (_instance$getNameSort = instance.getNameSortOption())
              ? void 0
              : _instance$getNameSort.value;
          case "Filename":
            return null == (_instance$getNameSort = instance.getFileSortOption())
              ? void 0
              : _instance$getNameSort.value;
          case "CriticRating":
            return null == (_instance$getNameSort = instance.getCriticRatingSortOption())
              ? void 0
              : _instance$getNameSort.value;
          case "DateCreated":
            return null == (_instance$getNameSort = instance.getDateAddedSortOption())
              ? void 0
              : _instance$getNameSort.value;
          case "PlayCount":
            return null == (_instance$getNameSort = instance.getPlayCountSortOption())
              ? void 0
              : _instance$getNameSort.value;
          case "DatePlayed":
            return null == (_instance$getNameSort = instance.getDatePlayedSortOption())
              ? void 0
              : _instance$getNameSort.value;
          case "Runtime":
            return null == (_instance$getNameSort = instance.getRuntimeSortOption())
              ? void 0
              : _instance$getNameSort.value;
          case "PremiereDate":
            return null == (_instance$getNameSort = instance.getReleaseDateSortOption())
              ? void 0
              : _instance$getNameSort.value;
          case "OfficialRating":
            return null == (_instance$getNameSort = instance.getParentalRatingSortOption())
              ? void 0
              : _instance$getNameSort.value;
          case "CommunityRating":
            return null == (_instance$getNameSort = instance.getCommunityRatingSortOption())
              ? void 0
              : _instance$getNameSort.value;
          case "ProductionYear":
            return null == (_instance$getNameSort = instance.getProductionYearSortOption())
              ? void 0
              : _instance$getNameSort.value;
          case "Container":
            return null == (_instance$getNameSort = instance.getContainerSortOption())
              ? void 0
              : _instance$getNameSort.value;
          case "OriginalTitle":
            return null == (_instance$getNameSort = instance.getOriginalTitleSortOption())
              ? void 0
              : _instance$getNameSort.value;
          case "Size":
            return null == (_instance$getNameSort = instance.getSizeSortOption())
              ? void 0
              : _instance$getNameSort.value;
          case "Resolution":
            return null == (_instance$getNameSort = instance.getResolutionSortOption())
              ? void 0
              : _instance$getNameSort.value;
          case "Bitrate":
            return null == (_instance$getNameSort = instance.getBitrateSortOption())
              ? void 0
              : _instance$getNameSort.value;
          case "Album":
            return null == (_instance$getNameSort = instance.getAlbumSortOption())
              ? void 0
              : _instance$getNameSort.value;
          case "AlbumArtist":
            return null == (_instance$getNameSort = instance.getAlbumArtistSortOption())
              ? void 0
              : _instance$getNameSort.value;
          case "Artist":
            return null == (_instance$getNameSort = instance.getArtistSortOption())
              ? void 0
              : _instance$getNameSort.value;
          case "Composer":
            return null == (_instance$getNameSort = instance.getComposerSortOption())
              ? void 0
              : _instance$getNameSort.value;
          case "SeriesName":
            return null == (_instance$getNameSort = instance.getSeriesSortOption())
              ? void 0
              : _instance$getNameSort.value;
          default:
            return null;
        }
      })(instance, field),
    };
  }
  function hideOrShowAll(elems, hide) {
    for (var i = 0, length = elems.length; i < length; i++)
      hide ? elems[i].classList.add("hide") : elems[i].classList.remove("hide");
  }
  function destroyHeader(instance) {
    var elem = instance._headerElement;
    if (elem) {
      try {
        elem.remove();
      } catch (err) {}
      instance._headerElement = null;
    }
  }
  function ensureHeader(instance) {
    var itemsContainer,
      elem = instance._headerElement;
    return (
      elem ||
        ((instance._headerElement = elem = document.createElement("div")),
        (elem.className = "itemsContainer_header"),
        (itemsContainer = instance.itemsContainer).parentNode.insertBefore(elem, itemsContainer),
        elem.addEventListener(
          "contextmenu",
          function (e) {
            e.preventDefault(), this.showColumnSelector(e);
          }.bind(instance)
        ),
        elem.addEventListener(
          "click",
          function (e) {
            e.target.closest(".btnConfigureGridColumns")
              ? this.showColumnSelector(e)
              : (e = e.target.closest(".btnGridHeaderColumnSort")) &&
                this.setSortValue(e.getAttribute("data-sortvalue"));
          }.bind(instance)
        )),
      elem
    );
  }
  function removeScrollListener(instance) {
    var scroller;
    instance.boundOnScroll &&
      ((scroller = instance.scroller) && scroller.removeEventListener("scroll", instance.boundOnScroll),
      (instance.boundOnScroll = null));
  }
  (ListController.prototype.getDataGridOptions = function (items, settings) {
    for (
      var _options$sortValues,
        visibleFields = settings.fields || [],
        columns = [],
        i = 0,
        length = visibleFields.length;
      i < length;
      i++
    ) {
      var id = visibleFields[i];
      columns.push(getColumn(this, id));
    }
    columns.sort(compareColumns);
    for (
      var settings = {columns: columns, action: _layoutmanager.default.tv ? null : "none"},
        _i =
          ((settings.context = this.getContext()),
          (settings.sortValues = this.getSortValues()),
          null == (_options$sortValues = settings.sortValues) || _options$sortValues.sortBy,
          0),
        _length = columns.length;
      _i < _length;
      _i++
    ) {
      var column = columns[_i],
        titleSize = Math.ceil(
          0.8 *
            (function (column) {
              var _column$name;
              switch (column.id) {
                case "Played":
                case "IsFavorite":
                  return 3;
                default:
                  return (null == (_column$name = column.name) ? void 0 : _column$name.length) || 0;
              }
            })(column)
        );
      column.titleSize = titleSize;
    }
    return settings;
  }),
    (ListController.prototype.getAvailableViewOptions = function () {
      var list = [];
      return (
        list.push("primary"),
        list.push("banner"),
        list.push("disc"),
        list.push("logo"),
        list.push("thumb"),
        list.push("list"),
        this.supportsViewType("datagrid") && list.push("datagrid"),
        list
      );
    }),
    (ListController.prototype.supportsViewType = function (type) {
      return "datagrid" !== type || this.supportsSorting();
    }),
    (ListController.prototype.getListOptions = function (items) {
      var settings = this.getViewSettings(items);
      return "datagrid" === settings.imageType
        ? {
            renderer: _datagrid.default,
            options: this.getDataGridOptions(items, settings),
            virtualScrollLayout: "vertical",
            contextMenuOptions: this.getContextMenuOptions(),
          }
        : "list" === settings.imageType
        ? {
            renderer: _listview.default,
            options: this.getListViewOptions(items, settings),
            virtualScrollLayout: "vertical",
            contextMenuOptions: this.getContextMenuOptions(),
          }
        : {
            renderer: _cardbuilder.default,
            options: this.getCardOptions(items, settings),
            virtualScrollLayout: "vertical-grid",
            contextMenuOptions: this.getContextMenuOptions(),
          };
    }),
    (ListController.prototype.getVisibleViewSettings = function () {
      var params = this.params;
      if ("downloads" === params.parentId) return {};
      if ("search" === params.type) return {};
      var apiClient,
        item = this.currentItem,
        fields = ["Name"],
        settings = [];
      return (
        "Person" !== params.type &&
          "MusicArtist" !== params.type &&
          "nextup" !== params.type &&
          "Program" !== params.type &&
          "TvChannel" !== params.type &&
          "OnNow" !== params.type &&
          ((item &&
            (item.CollectionType ||
              "CollectionFolder" === item.Type ||
              "UserView" === item.Type ||
              "Channel" === item.Type)) ||
            (fields.push("Number"),
            fields.push("ProductionYear"),
            fields.push("CommunityRating"),
            fields.push("CriticRating"),
            fields.push("OfficialRating"),
            fields.push("PlayCount"),
            fields.push("DateCreated"),
            fields.push("PremiereDate"),
            fields.push("DatePlayed"),
            fields.push("Container"),
            fields.push("Resolution"),
            fields.push("Played"),
            fields.push("IsFavorite"),
            fields.push("Video3DFormat"),
            fields.push("Tags"),
            fields.push("Genres"),
            fields.push("Studios"),
            fields.push("Runtime"),
            fields.push("OriginalTitle"),
            fields.push("SortName"),
            fields.push("Artist"),
            fields.push("AlbumArtist"),
            fields.push("Composer"),
            fields.push("Album")),
          (apiClient = getApiClient(this)) &&
            apiClient.isMinServerVersion("4.7.3") &&
            (fields.push("Filename"), fields.push("Size"), fields.push("Bitrate"))),
        "Program" === params.type && params.IsMovie && fields.push("ProductionYear"),
        (item && ("PhotoAlbum" === item.Type || "ChannelFolderItem" === item.Type)) || settings.push("imageType"),
        {settings: settings, fields: fields}
      );
    }),
    (ListController.prototype.showColumnSelector = function (originalEvent) {
      var visibleSettings = this.getVisibleViewSettings(),
        columns = this.getDataGridOptions([], visibleSettings).columns,
        instance = this;
      require(["actionsheet"], function (actionsheet) {
        var options = {
          items: columns,
          positionTo: originalEvent.target,
          positionX: "right",
          positionY: "bottom",
          positionClientY: originalEvent.clientY,
          positionClientX: originalEvent.clientX,
          offsetTop: 2,
          hasItemSelectionState: !1,
          multiple: !0,
          emptyValueSetEqualsAll: !0,
          selectedValues: instance.getViewSettings([]).fields,
        };
        actionsheet.show(options).then(function (fields) {
          _usersettings.default.set(instance.getSettingsKey() + "-fields", fields.join(","), !1),
            refreshAfterSettingsChange(instance);
        });
      });
    }),
    (ListController.prototype.getViewSettings = function (items) {
      items = items || this.itemsContainer.getItems();
      var basekey = this.getSettingsKey(),
        visibleFields = this.getVisibleViewSettings().fields || [],
        item = this.currentItem,
        item = this.getViewSettingDefaults(item, items, visibleFields),
        items = (this.params, _usersettings.default.get(basekey + "-imageType", !1) || item.imageType),
        userConfiguredFields = _usersettings.default.get(basekey + "-fields", !1),
        item =
          ((userConfiguredFields =
            (userConfiguredFields =
              "None" === userConfiguredFields && "datagrid" === items ? null : userConfiguredFields) &&
            (function (visibleFields, userConfiguredFields) {
              for (var list = [], i = 0, length = userConfiguredFields.length; i < length; i++)
                visibleFields.includes(userConfiguredFields[i]) && list.push(userConfiguredFields[i]);
              return list;
            })(visibleFields, (userConfiguredFields = userConfiguredFields.split(",")))),
          item.fields.slice(0)),
        tableDefaultFields = item.slice(0);
      return (
        visibleFields.includes("CommunityRating") &&
          !tableDefaultFields.includes("CommunityRating") &&
          tableDefaultFields.push("CommunityRating"),
        visibleFields.includes("OfficialRating") &&
          !tableDefaultFields.includes("OfficialRating") &&
          tableDefaultFields.push("OfficialRating"),
        visibleFields.includes("ProductionYear") &&
          !tableDefaultFields.includes("ProductionYear") &&
          tableDefaultFields.push("ProductionYear"),
        visibleFields.includes("PremiereDate") &&
          !tableDefaultFields.includes("PremiereDate") &&
          tableDefaultFields.push("PremiereDate"),
        visibleFields.includes("CriticRating") &&
          !tableDefaultFields.includes("CriticRating") &&
          tableDefaultFields.push("CriticRating"),
        visibleFields.includes("Album") && !tableDefaultFields.includes("Album") && tableDefaultFields.push("Album"),
        visibleFields.includes("Artist") && !tableDefaultFields.includes("Artist") && tableDefaultFields.push("Artist"),
        visibleFields.includes("AlbumArtist") &&
          !tableDefaultFields.includes("AlbumArtist") &&
          tableDefaultFields.push("AlbumArtist"),
        visibleFields.includes("Composer") &&
          !tableDefaultFields.includes("Composer") &&
          tableDefaultFields.push("Composer"),
        visibleFields.includes("Played") && !tableDefaultFields.includes("Played") && tableDefaultFields.push("Played"),
        visibleFields.includes("IsFavorite") &&
          !tableDefaultFields.includes("IsFavorite") &&
          tableDefaultFields.push("IsFavorite"),
        visibleFields.includes("Runtime") &&
          !tableDefaultFields.includes("Runtime") &&
          tableDefaultFields.push("Runtime"),
        visibleFields.includes("SeriesName") &&
          !tableDefaultFields.includes("SeriesName") &&
          tableDefaultFields.push("SeriesName"),
        visibleFields.includes("EpisodeNumber") &&
          !tableDefaultFields.includes("EpisodeNumber") &&
          tableDefaultFields.push("EpisodeNumber"),
        {
          fields: (userConfiguredFields =
            userConfiguredFields && (userConfiguredFields.length || "datagrid" !== items)
              ? userConfiguredFields
              : ("datagrid" === items ? tableDefaultFields : item).slice(0)),
          groupItemsIntoTags: "true" === _usersettings.default.get(basekey + "-groupItemsIntoTags", !0),
          groupItemsIntoCollections: "true" === _usersettings.default.get(basekey + "-groupItemsIntoCollections", !0),
          imageType: items,
          defaultFields: item,
          tableDefaultFields: tableDefaultFields,
        }
      );
    }),
    (ListController.prototype.autoFocus = function () {
      var viewSettingsContainer;
      !_focusmanager.default.autoFocus(this.itemsContainer) &&
        this.view &&
        (viewSettingsContainer = this.itemsViewSettingsContainer) &&
        _focusmanager.default.autoFocus(viewSettingsContainer);
    }),
    (ListController.prototype.play = function () {
      if (_multiselect.default.canPlay()) _multiselect.default.play();
      else {
        var currentItem = this.currentItem,
          params = this.params;
        if (currentItem && !this.getQueryInfo(!0).hasFilters && !params.type)
          if ("SortName" === this.getSortValues().sortBy)
            return _playbackmanager.default.play({items: [currentItem], parentId: params.parentId});
        this.getItems({Limit: 300, Recursive: !0, IsFolder: !1}).then(function (result) {
          _playbackmanager.default.play({items: result.Items});
        });
      }
    }),
    (ListController.prototype.shuffle = function () {
      var currentItem = this.currentItem,
        params = this.params;
      currentItem && !this.getQueryInfo(!0).hasFilters
        ? _playbackmanager.default.shuffle(currentItem, null, {parentId: params.parentId})
        : this.getItems({SortBy: "Random", Limit: 300}).then(function (result) {
            _playbackmanager.default.play({items: result.Items});
          });
    }),
    (ListController.prototype.queue = function () {
      this.currentItem, this.params;
      this.getItems({Limit: 300, Recursive: !0, IsFolder: !1}).then(function (result) {
        _playbackmanager.default.queue({items: result.Items});
      });
    }),
    (ListController.prototype.isGlobalQuery = function () {
      return !1;
    }),
    (ListController.prototype.virtualChunkSize = function () {
      return null;
    }),
    (ListController.prototype.enableVirtualData = function () {
      return this.itemsContainer.hasAttribute("data-virtualscrolllayout");
    }),
    (ListController.prototype.getItemCountText = function (numItems) {
      return 1 === numItems
        ? _globalize.default.translate("ValueOneItem")
        : _globalize.default.translate("ItemCount", numItems);
    }),
    (ListController.prototype.getPrefixesApiClientMethodName = function () {
      return "getPrefixes";
    }),
    (ListController.prototype.getApiClientQueryMethodName = function () {
      return "getItems";
    }),
    (ListController.prototype.getPrefixQueryIncludeItemTypes = function () {
      return this.getQueryIncludeItemTypes();
    }),
    (ListController.prototype.getQueryIncludeItemTypes = function () {
      return this.getItemTypes();
    }),
    (ListController.prototype.getContext = function () {
      return null;
    }),
    (ListController.prototype.getSortBySettingsKey = function (sortMenuOptions) {
      return this.getSettingsKey() + "-sortby";
    }),
    (ListController.prototype.getSortByValue = function () {
      var saveSortingOnServer = this.saveSortingOnServer();
      return _usersettings.default.getFilter(this.getSortBySettingsKey(), saveSortingOnServer);
    }),
    (ListController.prototype.getVisibleFilters = function () {
      return [];
    }),
    (ListController.prototype.getDefaultSortBy = function () {
      return ("Episode" === this.getDisplayPreset() ? this.getSeriesSortOption() : this.getNameSortOption()).value;
    }),
    (ListController.prototype.getFilterMenuOptions = function () {
      return {};
    }),
    (ListController.prototype.getItemTypes = function () {
      return [];
    }),
    (ListController.prototype.supportsPlay = function () {
      return !0;
    }),
    (ListController.prototype.supportsShuffle = function () {
      return this.supportsPlay();
    }),
    (ListController.prototype.supportsQueue = function () {
      return this.supportsPlay();
    }),
    (ListController.prototype.supportsAlphaPicker = function () {
      return !1;
    }),
    (ListController.prototype.enableAlphaPicker = function (sortBy, sortOrder) {
      if (this.supportsAlphaPicker()) {
        var params = this.params;
        if ("search" !== params.type) {
          if ("SortName" === (sortBy = sortBy || "")) return !0;
          if (sortBy.startsWith("AlbumArtist") || sortBy.startsWith("Artist")) {
            params = getApiClient(this);
            if (params && params.isMinServerVersion("4.7.0.19")) return !0;
          }
        }
      }
      return !1;
    }),
    (ListController.prototype.initAlphaPicker = function () {
      var alphaPickerElement;
      this.alphaPicker ||
        ((this.alphaPickerElement = this.view.querySelector(".alphaPicker")),
        (alphaPickerElement = this.alphaPickerElement) &&
          (_layoutmanager.default.tv
            ? (alphaPickerElement.classList.add("alphaPicker-fixed-left", "focuscontainer-left"),
              alphaPickerElement.classList.remove("alphaPicker-fixed-right"))
            : (alphaPickerElement.classList.add("alphaPicker-fixed-right", "focuscontainer-right"),
              alphaPickerElement.classList.remove("alphaPicker-fixed-left")),
          (this.alphaPicker = new _alphapicker.default({
            element: alphaPickerElement,
            itemsContainer: this.itemsContainer,
            prefixes: [],
            setValueOnFocus: !0,
          })),
          this.alphaPicker.on(
            "alphavaluechanged",
            function (e) {
              (e = e.detail.value), trySelectValue(this, this.scroller, this.itemsContainer, e);
            }.bind(this)
          )));
    }),
    (ListController.prototype.getItems = function (initialQuery, signal) {
      var params = this.params,
        apiClient = (this.currentItem, getApiClient(this)),
        queryInfo = this.getQueryInfo(!0),
        initialQuery =
          (this.setFilterStatus(queryInfo.hasFilters),
          initialQuery && (queryInfo.query = Object.assign(queryInfo.query, initialQuery)),
          this.getApiClientQueryMethodName());
      return "getActivityLog" === initialQuery
        ? ((queryInfo.query.HasUserId = !1), apiClient.getActivityLog(queryInfo.query))
        : "getUserActivityLog" === initialQuery
        ? ((queryInfo.query.HasUserId = !0), apiClient.getActivityLog(queryInfo.query))
        : "getLogs" === initialQuery ||
          "getLogLines" === initialQuery ||
          "getApiKeys" === initialQuery ||
          "getLiveTvChannelsForManagement" === initialQuery
        ? apiClient[initialQuery](queryInfo.query)
        : "getNextUpEpisodes" === initialQuery
        ? ((queryInfo.query.UserId = apiClient.getCurrentUserId()),
          (queryInfo.query.EnableTotalRecordCount = !1),
          (queryInfo.query.LegacyNextUp = !0),
          apiClient[initialQuery](queryInfo.query, signal))
        : "getLiveTvChannels" === initialQuery ||
          "getLiveTvRecordings" === initialQuery ||
          "getLiveTvChannelTags" === initialQuery
        ? ((queryInfo.query.UserId = apiClient.getCurrentUserId()), apiClient[initialQuery](queryInfo.query, signal))
        : "search" === params.type
        ? (this.view.querySelector(".emby-searchable-tab-button.emby-tab-button-active") &&
            (queryInfo.query.IncludeSearchTypes = !1),
          apiClient.getSearchResults(queryInfo.query).then(
            function (result) {
              return result.ItemTypes && this.refreshSearchTabs(result.ItemTypes), result;
            }.bind(this)
          ))
        : apiClient[initialQuery](apiClient.getCurrentUserId(), queryInfo.query);
    }),
    (ListController.prototype.onRefreshing = function (result) {
      var instance,
        alphaPicker,
        values,
        listOptions = this.itemsContainer.currentListOptions,
        listOptions =
          (listOptions.renderer.renderHeader
            ? listOptions.renderer.renderHeader(this, ensureHeader(this), listOptions.options)
            : destroyHeader(this),
          this.configureScrollingForView(),
          result.Items || result),
        result = result.TotalRecordCount || listOptions.length;
      this.fillDisplayTotalRecordCount(result),
        (listOptions = result),
        (values = (instance = this).getSortValues()),
        (values = instance.enableAlphaPicker(values.sortBy, values.sortOrder))
          ? instance.initAlphaNumericShortcuts()
          : instance.destroyAlphaNumericShortcuts(),
        instance.alphaPicker &&
          (alphaPicker = instance.alphaPickerElement) &&
          (values && 30 < listOptions
            ? (alphaPicker.classList.remove("hide"), instance.refreshPrefixes())
            : alphaPicker.classList.add("hide")),
        hideOrShowAll(this.view.querySelectorAll(".btnPlay"), !(result && this.supportsPlay())),
        hideOrShowAll(this.view.querySelectorAll(".btnShuffle"), !(result && this.supportsShuffle())),
        hideOrShowAll(this.view.querySelectorAll(".btnQueue"), !(result && this.supportsQueue()));
    }),
    (ListController.prototype.afterItemsRefreshed = function (result) {
      var items = result.Items || result;
      result.TotalRecordCount || items.length || this.setEmptyListState();
    }),
    (ListController.prototype.configureScrollingForView = function () {
      var itemsContainer = this.itemsContainer,
        headerElement = this._headerElement,
        currentListOptions = itemsContainer.currentListOptions,
        hasFixedPositionListHeader =
          null != headerElement &&
          (null == currentListOptions ? void 0 : currentListOptions.options.enableFixedPositionHeader) &&
          !_browser.default.iOS,
        itemsViewSettingsContainer = this.itemsViewSettingsContainer,
        itemsViewSettingsContainer =
          (itemsViewSettingsContainer &&
            (null != headerElement && hasFixedPositionListHeader
              ? itemsViewSettingsContainer.classList.add("itemsViewSettingsContainer-fixed")
              : itemsViewSettingsContainer.classList.remove("itemsViewSettingsContainer-fixed")),
          headerElement &&
            (hasFixedPositionListHeader
              ? headerElement.classList.add("itemsContainer_header_fixed")
              : headerElement.classList.remove("itemsContainer_header_fixed")),
          this.scroller);
      itemsViewSettingsContainer &&
        (itemsViewSettingsContainer.setHeaderBindingEnabled(!hasFixedPositionListHeader),
        (headerElement =
          (headerElement = this.paddedTopPageElem) ||
          (this.paddedTopPageElem = itemsContainer.closest(".padded-top-page"))),
        hasFixedPositionListHeader
          ? (itemsViewSettingsContainer.classList.add(
              "margin-top-page",
              "margin-top-page-listheader",
              "dataGrid-mainscroller-scrollX"
            ),
            headerElement &&
              headerElement !== itemsViewSettingsContainer &&
              headerElement.classList.remove("padded-top-page"),
            this.boundOnScroll ||
              (this.boundOnScroll = function (e) {
                var headerElement,
                  scroller = this.scroller;
                scroller && (headerElement = this._headerElement) && (headerElement.scrollLeft = scroller.scrollLeft);
              }.bind(this)),
            itemsViewSettingsContainer.addEventListener("scroll", this.boundOnScroll))
          : (removeScrollListener(this),
            itemsViewSettingsContainer.classList.remove(
              "margin-top-page",
              "margin-top-page-listheader",
              "dataGrid-mainscroller-scrollX"
            ),
            headerElement &&
              headerElement !== itemsViewSettingsContainer &&
              headerElement.classList.add("padded-top-page")),
        (hasFixedPositionListHeader = itemsContainer.closest(".scrollSlider")) &&
          ((itemsViewSettingsContainer = null == currentListOptions ? void 0 : currentListOptions.options.scrollXWidth),
          (hasFixedPositionListHeader.style.width = itemsViewSettingsContainer
            ? itemsViewSettingsContainer + "ch"
            : null)));
    }),
    (ListController.prototype.fillDisplayTotalRecordCount = function (totalRecordCount) {
      var elem = this.view.querySelector(".listTotalRecordCount");
      elem &&
        (!1 === this.enableTotalRecordCountDisplay
          ? elem.classList.add("hide")
          : (elem.innerHTML = this.getItemCountText(totalRecordCount)));
    }),
    (ListController.prototype.getEmptyListMessage = function () {
      if ("search" !== this.params.type)
        return this.getQueryInfo(!0).hasFilters
          ? ((html =
              (html =
                "<div>" +
                _globalize.default.translate("NoItemsMatchingFound") +
                '</div><button style="margin-top:2em;" type="button" is="emby-button" class="raised btnClearFilters"><i class="md-icon button-icon button-icon-left">&#xe0b8;</i>') +
              "<span>" +
              _globalize.default.translate("HeaderClearFilters") +
              "</span></button>"),
            Promise.resolve(html))
          : Promise.resolve(_globalize.default.translate("NoItemsFound"));
      if (this.searchFields) {
        var html = this.lastSearchTerm;
        if (!html) return Promise.resolve("");
        if (html.length < 2) return Promise.resolve(_globalize.default.translate("TwoSearchCharsRequired"));
      }
      return Promise.resolve(_globalize.default.translate("NoItemsMatchingFound"));
    }),
    (ListController.prototype.setEmptyListState = function () {
      this.getEmptyListMessage().then(
        function (html) {
          (html =
            '<div class="flex padded-top align-items-center justify-content-center flex-grow flex-direction-column">' +
            html),
            this.itemsContainer.setOtherInnerHTML((html += "</div>")),
            destroyHeader(this),
            (html = this.itemsContainer.querySelector(".btnClearFilters")) &&
              _dom.default.addEventListener(html, "click", this.clearFilters.bind(this), {});
        }.bind(this)
      );
    }),
    (ListController.prototype.initAlphaNumericShortcuts = function () {
      var instance;
      this.enableAlphaNumericShortcuts &&
        !this.alphaNumericShortcuts &&
        ((instance = this),
        require(["alphaNumericShortcuts"], function (AlphaNumericShortcuts) {
          (instance.alphaNumericShortcuts = new AlphaNumericShortcuts({itemsContainer: instance.itemsContainer})),
            (instance.alphaNumericShortcuts.onAlphaNumericValueEntered = function (value) {
              trySelectValue(this, this.scroller, this.view, value, !0);
            }.bind(instance));
        }));
    }),
    (ListController.prototype.supportsSorting = function () {
      return 0 < this.getSortMenuOptions().length;
    }),
    (ListController.prototype.sortOptionsByName = function (options) {
      options.sort(compareByName);
    }),
    (ListController.prototype.getSortValues = function (sortMenuOptions) {
      var saveSortingOnServer,
        basekey = this.getSettingsKey(),
        sortBy = this.getSortByValue();
      return (
        sortBy
          ? ((saveSortingOnServer = this.saveSortingOnServer()),
            (saveSortingOnServer =
              "Descending" === _usersettings.default.getFilter(basekey + "-sortorder", saveSortingOnServer)
                ? "Descending"
                : "Ascending"))
          : (sortBy = this.getDefaultSortBy()) &&
            (saveSortingOnServer = getDefaultSortOrder(
              (sortMenuOptions = sortMenuOptions || this.getSortMenuOptions()),
              sortBy
            )),
        {sortBy: sortBy, sortOrder: saveSortingOnServer}
      );
    }),
    (ListController.prototype.updateSortText = function () {
      var btnSortText = this.btnSortText;
      if (btnSortText) {
        for (
          var options = this.getSortMenuOptions(),
            values = this.getSortValues(options),
            sortBy = values.sortBy,
            i = 0,
            length = options.length;
          i < length;
          i++
        )
          if (sortBy === options[i].value) {
            btnSortText.innerHTML = _globalize.default.translate("SortByValue", options[i].name);
            break;
          }
        var btnSortIcon = this.btnSortIcon;
        btnSortIcon && (btnSortIcon.innerHTML = "Descending" === values.sortOrder ? "&#xE5DB;" : "&#xE5D8;");
      }
    }),
    (ListController.prototype.showFilterMenu = function () {
      var instance = this;
      require(["filterMenu"], function (FilterMenu) {
        new FilterMenu()
          .show({
            settingsKey: instance.getSettingsKey(),
            settings: instance.getFilters(),
            visibleSettings: instance.getVisibleFilters(),
            onChange: instance.itemsContainer.refreshItems.bind(instance.itemsContainer),
            parentId: instance.isGlobalQuery() ? null : instance.params.parentId,
            itemTypes: instance.getItemTypes ? instance.getItemTypes() : [],
            serverId: instance.apiClient.serverId(),
            filterMenuOptions: instance.getFilterMenuOptions(),
          })
          .then(function () {
            refreshAfterSettingsChange(instance);
          });
      });
    }),
    (ListController.prototype.setFilterStatus = function (hasFilters) {
      var filterButtons = this.filterButtons;
      if (filterButtons.length)
        for (var i = 0, length = filterButtons.length; i < length; i++) {
          var btnFilter = filterButtons[i];
          hasFilters ? btnFilter.classList.add("filter-active") : btnFilter.classList.remove("filter-active");
        }
    }),
    (ListController.prototype.getFilters = function () {
      var basekey = this.getSettingsKey();
      return {
        IsPlayed: "true" === _usersettings.default.getFilter(basekey + "-filter-IsPlayed"),
        IsUnplayed: "true" === _usersettings.default.getFilter(basekey + "-filter-IsUnplayed"),
        IsFavorite: "true" === _usersettings.default.getFilter(basekey + "-filter-IsFavorite"),
        IsResumable: "true" === _usersettings.default.getFilter(basekey + "-filter-IsResumable"),
        Is4K: "true" === _usersettings.default.getFilter(basekey + "-filter-Is4K"),
        IsHD: "true" === _usersettings.default.getFilter(basekey + "-filter-IsHD"),
        IsSD: "true" === _usersettings.default.getFilter(basekey + "-filter-IsSD"),
        Is3D: "true" === _usersettings.default.getFilter(basekey + "-filter-Is3D"),
        VideoTypes: _usersettings.default.getFilter(basekey + "-filter-VideoTypes"),
        SeriesStatus: _usersettings.default.getFilter(basekey + "-filter-SeriesStatus"),
        HasSubtitles: _usersettings.default.getFilter(basekey + "-filter-HasSubtitles"),
        ChannelMappingStatus: _usersettings.default.getFilter(basekey + "-filter-ChannelMappingStatus"),
        HasTrailer: _usersettings.default.getFilter(basekey + "-filter-HasTrailer"),
        HasSpecialFeature: _usersettings.default.getFilter(basekey + "-filter-HasSpecialFeature"),
        HasThemeSong: _usersettings.default.getFilter(basekey + "-filter-HasThemeSong"),
        HasThemeVideo: _usersettings.default.getFilter(basekey + "-filter-HasThemeVideo"),
        HasOverview: _usersettings.default.getFilter(basekey + "-filter-HasOverview"),
        HasImdbId: _usersettings.default.getFilter(basekey + "-filter-HasImdbId"),
        HasTvdbId: _usersettings.default.getFilter(basekey + "-filter-HasTvdbId"),
        HasTmdbId: _usersettings.default.getFilter(basekey + "-filter-HasTmdbId"),
        IsLocked: _usersettings.default.getFilter(basekey + "-filter-IsLocked"),
        GenreIds: _usersettings.default.getFilter(basekey + "-filter-GenreIds"),
        StudioIds: _usersettings.default.getFilter(basekey + "-filter-StudioIds"),
        TagIds: _usersettings.default.getFilter(basekey + "-filter-TagIds"),
        OfficialRatings: _usersettings.default.getFilter(basekey + "-filter-OfficialRatings"),
        Containers: _usersettings.default.getFilter(basekey + "-filter-Containers"),
        AudioCodecs: _usersettings.default.getFilter(basekey + "-filter-AudioCodecs"),
        AudioLanguages: _usersettings.default.getFilter(basekey + "-filter-AudioLanguages"),
        SubtitleLanguages: _usersettings.default.getFilter(basekey + "-filter-SubtitleLanguages"),
        VideoCodecs: _usersettings.default.getFilter(basekey + "-filter-VideoCodecs"),
        SubtitleCodecs: _usersettings.default.getFilter(basekey + "-filter-SubtitleCodecs"),
        Years: _usersettings.default.getFilter(basekey + "-filter-Years"),
      };
    }),
    (ListController.prototype.getSortMenuOptions = function () {
      var sortBy = [],
        option = this.getNameSortOption();
      return (
        option && sortBy.push(option),
        (option = this.getAlbumSortOption()) && sortBy.push(option),
        (option = this.getAlbumArtistSortOption()) && sortBy.push(option),
        (option = this.getArtistSortOption()) && sortBy.push(option),
        (option = this.getAirDateSortOption()) && sortBy.push(option),
        (option = this.getFileSortOption()) && sortBy.push(option),
        (option = this.getBitrateSortOption()) && sortBy.push(option),
        (option = this.getCommunityRatingSortOption()) && sortBy.push(option),
        (option = this.getComposerSortOption()) && sortBy.push(option),
        (option = this.getContainerSortOption()) && sortBy.push(option),
        (option = this.getCriticRatingSortOption()) && sortBy.push(option),
        (option = this.getDateAddedSortOption()) && sortBy.push(option),
        (option = this.getDatePlayedSortOption()) && sortBy.push(option),
        (option = this.getFavoritesSortOption()) && sortBy.push(option),
        (option = this.getParentalRatingSortOption()) && sortBy.push(option),
        (option = this.getPlayCountSortOption()) && sortBy.push(option),
        (option = this.getProductionYearSortOption()) && sortBy.push(option),
        (option = this.getReleaseDateSortOption()) && sortBy.push(option),
        (option = this.getResolutionSortOption()) && sortBy.push(option),
        (option = this.getRuntimeSortOption()) && sortBy.push(option),
        (option = this.getSeriesSortOption()) && sortBy.push(option),
        (option = this.getSizeSortOption()) && sortBy.push(option),
        (option = this.getNumberSortOption()) && sortBy.push(option),
        this.sortOptionsByName(sortBy),
        sortBy
      );
    }),
    (ListController.prototype.getDisplayPreset = function () {
      var types = this.getItemTypes(),
        itemType = types.length ? types[0] : null;
      return (itemType = itemType || ((types = this.getQueryIncludeItemTypes()).length ? types[0] : null));
    }),
    (ListController.prototype.getNumberSortOption = function () {
      switch (this.getDisplayPreset()) {
        case "Movie":
        case "Video":
        case "Trailer":
        case "MusicVideo":
        case "Game":
        case "GameSystem":
        case "Studio":
        case "Genre":
        case "Tag":
        case "Photo":
        case "MusicArtist":
        case "MusicAlbum":
        case "Series":
        case "Program":
        case "Playlist":
        case "BoxSet":
          return null;
        case "TvChannel":
          return {
            name: _globalize.default.translate("ChannelNumber"),
            value: "ChannelNumber,SortName",
            defaultSortOrder: "Ascending",
          };
      }
      return {
        name: _globalize.default.translate("顺序编号"),
        value: "ParentIndexNumber,IndexNumber,SortName",
        defaultSortOrder: "Ascending",
      };
    }),
    (ListController.prototype.getAirDateSortOption = function () {
      return null;
    }),
    (ListController.prototype.getFavoritesSortOption = function () {
      return null;
    }),
    (ListController.prototype.getFileSortOption = function () {
      switch (this.getDisplayPreset()) {
        case "Trailer":
        case "GameSystem":
        case "Studio":
        case "Genre":
        case "Tag":
        case "MusicArtist":
        case "MusicAlbum":
        case "Series":
        case "TvChannel":
        case "Program":
        case "Playlist":
        case "BoxSet":
          return null;
      }
      return {name: _globalize.default.translate("FileName"), value: "IsFolder,Filename"};
    }),
    (ListController.prototype.getDateAddedSortOption = function () {
      return {
        name: _globalize.default.translate("DateAdded"),
        value: "DateCreated,SortName",
        defaultSortOrder: "Descending",
      };
    }),
    (ListController.prototype.getAirDateSortOption = function () {
      return {
        name: _globalize.default.translate("LastEpisodeDateAdded"),
        value: "DateLastContentAdded,SortName",
        defaultSortOrder: "Descending",
      };
    }),
    (ListController.prototype.getDatePlayedSortOption = function () {
      switch (this.getDisplayPreset()) {
        case "Series":
          return {
            name: _globalize.default.translate("DatePlayed"),
            value: "SeriesDatePlayed,SortName",
            defaultSortOrder: "Descending",
          };
        case "Playlist":
        case "BoxSet":
        case "GameSystem":
          return null;
      }
      return {
        name: _globalize.default.translate("DatePlayed"),
        value: "DatePlayed,SortName",
        defaultSortOrder: "Descending",
      };
    }),
    (ListController.prototype.getCriticRatingSortOption = function () {
      switch (this.getDisplayPreset()) {
        case "Studio":
        case "Genre":
        case "Tag":
        case "Photo":
        case "MusicArtist":
        case "TvChannel":
        case "Playlist":
        case "BoxSet":
        case "MusicAlbum":
        case "Audio":
        case "GameSystem":
          return null;
      }
      return {
        name: _globalize.default.translate("CriticRating"),
        value: "CriticRating,SortName",
        defaultSortOrder: "Descending",
      };
    }),
    (ListController.prototype.getPlayCountSortOption = function () {
      switch (this.getDisplayPreset()) {
        case "Studio":
        case "Genre":
        case "Tag":
        case "Series":
        case "Program":
        case "Playlist":
        case "BoxSet":
        case "GameSystem":
          return null;
      }
      return {name: _globalize.default.translate("Plays"), value: "PlayCount,SortName", defaultSortOrder: "Descending"};
    }),
    (ListController.prototype.getRuntimeSortOption = function () {
      switch (this.getDisplayPreset()) {
        case "Studio":
        case "Genre":
        case "Tag":
        case "Photo":
        case "Game":
        case "GameSystem":
        case "MusicArtist":
        case "TvChannel":
          return null;
      }
      return {name: _globalize.default.translate("Runtime"), value: "Runtime,SortName", defaultSortOrder: "Ascending"};
    }),
    (ListController.prototype.getSeriesSortOption = function () {
      return "Episode" !== this.getDisplayPreset()
        ? null
        : {
            name: _globalize.default.translate("节目名称"),
            value: "SeriesSortName,ParentIndexNumber,IndexNumber,SortName",
            defaultSortOrder: "Ascending",
          };
    }),
    (ListController.prototype.getNameSortOption = function () {
      return {name: _globalize.default.translate("Title"), value: "SortName", defaultSortOrder: "Ascending"};
    }),
    (ListController.prototype.getParentalRatingSortOption = function () {
      switch (this.getDisplayPreset()) {
        case "Studio":
        case "Genre":
        case "Tag":
        case "GameSystem":
          return null;
      }
      return {
        name: _globalize.default.translate("ParentalRating"),
        value: "OfficialRating,SortName",
        defaultSortOrder: "Descending",
      };
    }),
    (ListController.prototype.getProductionYearSortOption = function () {
      switch (this.getDisplayPreset()) {
        case "Studio":
        case "Genre":
        case "Tag":
        case "MusicArtist":
        case "TvChannel":
        case "Playlist":
        case "BoxSet":
        case "GameSystem":
          return null;
      }
      return {
        name: _globalize.default.translate("Year"),
        value: "ProductionYear,SortName",
        defaultSortOrder: "Descending",
      };
    }),
    (ListController.prototype.getOriginalTitleSortOption = function () {
      switch (this.getDisplayPreset()) {
        case "GameSystem":
        case "Genre":
        case "Studio":
        case "Tag":
        case "Photo":
        case "MusicArtist":
        case "TvChannel":
        case "Program":
        case "Playlist":
        case "BoxSet":
        case "MusicAlbum":
          return null;
      }
      return {
        name: _globalize.default.translate("OriginalTitle"),
        value: "OriginalTitle,SortName",
        defaultSortOrder: "Descending",
      };
    }),
    (ListController.prototype.getContainerSortOption = function () {
      switch (this.getDisplayPreset()) {
        case "GameSystem":
        case "Genre":
        case "Studio":
        case "Tag":
        case "MusicArtist":
        case "Series":
        case "TvChannel":
        case "Program":
        case "Playlist":
        case "BoxSet":
        case "MusicAlbum":
          return null;
      }
      return {
        name: _globalize.default.translate("Container"),
        value: "Container,SortName",
        defaultSortOrder: "Descending",
      };
    }),
    (ListController.prototype.getSizeSortOption = function () {
      switch (this.getDisplayPreset()) {
        case "GameSystem":
        case "Genre":
        case "Studio":
        case "Tag":
        case "MusicArtist":
        case "Series":
        case "TvChannel":
        case "Program":
        case "Playlist":
        case "BoxSet":
        case "MusicAlbum":
          return null;
      }
      return {name: _globalize.default.translate("Size"), value: "Size,SortName", defaultSortOrder: "Descending"};
    }),
    (ListController.prototype.getBitrateSortOption = function () {
      switch (this.getDisplayPreset()) {
        case "Game":
        case "GameSystem":
        case "Genre":
        case "Studio":
        case "Tag":
        case "Photo":
        case "MusicArtist":
        case "Series":
        case "TvChannel":
        case "Program":
        case "Playlist":
        case "BoxSet":
        case "MusicAlbum":
          return null;
      }
      return {
        name: _globalize.default.translate("Bitrate"),
        value: "TotalBitrate,SortName",
        defaultSortOrder: "Descending",
      };
    }),
    (ListController.prototype.getResolutionSortOption = function () {
      switch (this.getDisplayPreset()) {
        case "Game":
        case "GameSystem":
        case "Genre":
        case "Studio":
        case "Tag":
        case "MusicArtist":
        case "Series":
        case "TvChannel":
        case "Playlist":
        case "BoxSet":
        case "MusicAlbum":
        case "Audio":
          return null;
      }
      var apiClient = getApiClient(this);
      return apiClient && apiClient.isMinServerVersion("4.7.3")
        ? {
            name: _globalize.default.translate("Resolution"),
            value: "Resolution,SortName",
            defaultSortOrder: "Descending",
          }
        : null;
    }),
    (ListController.prototype.getReleaseDateSortOption = function () {
      switch (this.getDisplayPreset()) {
        case "Studio":
        case "Genre":
        case "Tag":
        case "MusicArtist":
        case "TvChannel":
        case "Playlist":
        case "BoxSet":
        case "GameSystem":
          return null;
      }
      return {
        name: _globalize.default.translate("ReleaseDate"),
        value: "ProductionYear,PremiereDate,SortName",
        defaultSortOrder: "Descending",
      };
    }),
    (ListController.prototype.getCommunityRatingSortOption = function () {
      switch (this.getDisplayPreset()) {
        case "Studio":
        case "Tag":
        case "Photo":
        case "TvChannel":
        case "BoxSet":
        case "GameSystem":
          return null;
      }
      return {
        name: this.getCommunityRatingOptionName(),
        value: "CommunityRating,SortName",
        defaultSortOrder: "Descending",
      };
    }),
    (ListController.prototype.getAlbumSortOption = function () {
      switch (this.getDisplayPreset()) {
        case "Movie":
        case "Episode":
        case "Video":
        case "Trailer":
        case "MusicVideo":
        case "Game":
        case "GameSystem":
        case "Genre":
        case "Studio":
        case "Tag":
        case "Photo":
        case "MusicArtist":
        case "Series":
        case "TvChannel":
        case "Program":
        case "Playlist":
        case "BoxSet":
        case "MusicAlbum":
          return null;
      }
      return {name: _globalize.default.translate("Album"), value: "Album,ParentIndexNumber,IndexNumber"};
    }),
    (ListController.prototype.getArtistSortOption = function () {
      switch (this.getDisplayPreset()) {
        case "Movie":
        case "Episode":
        case "Video":
        case "Trailer":
        case "Game":
        case "GameSystem":
        case "Genre":
        case "Studio":
        case "Tag":
        case "Photo":
        case "MusicArtist":
        case "Series":
        case "TvChannel":
        case "Program":
        case "Playlist":
        case "BoxSet":
          return null;
      }
      return {name: _globalize.default.translate("Artist"), value: this.getArtistSortValue()};
    }),
    (ListController.prototype.getArtistSortValue = function () {
      return "Audio" === this.getDisplayPreset() ? "Artist,Album,ParentIndexNumber,IndexNumber" : "Artist,SortName";
    }),
    (ListController.prototype.getComposerSortOption = function () {
      switch (this.getDisplayPreset()) {
        case "Movie":
        case "Episode":
        case "Video":
        case "Trailer":
        case "Game":
        case "GameSystem":
        case "Genre":
        case "Studio":
        case "Tag":
        case "Photo":
        case "MusicArtist":
        case "Series":
        case "TvChannel":
        case "Program":
        case "Playlist":
        case "BoxSet":
          return null;
      }
      var apiClient = getApiClient(this);
      return apiClient && apiClient.isMinServerVersion("4.7.3")
        ? {
            name: _globalize.default.translate("Composer"),
            value: this.getArtistSortValue().replace("Artist", "Composer"),
          }
        : null;
    }),
    (ListController.prototype.getAlbumArtistSortOption = function () {
      switch (this.getDisplayPreset()) {
        case "Movie":
        case "Episode":
        case "Video":
        case "Trailer":
        case "MusicVideo":
        case "Game":
        case "GameSystem":
        case "Genre":
        case "Studio":
        case "Tag":
        case "Photo":
        case "MusicArtist":
        case "Series":
        case "TvChannel":
        case "Program":
        case "Playlist":
        case "BoxSet":
          return null;
      }
      return {name: _globalize.default.translate("AlbumArtist"), value: this.getAlbumArtistSortValue()};
    }),
    (ListController.prototype.getAlbumArtistSortValue = function () {
      return this.getArtistSortValue().replace("Artist", "AlbumArtist");
    }),
    (ListController.prototype.getCommunityRatingOptionName = function () {
      switch (this.getDisplayPreset()) {
        case "Movie":
        case "Trailer":
        case "Series":
          return _globalize.default.translate("ImdbRating");
      }
      return _globalize.default.translate("CommunityRating");
    }),
    (ListController.prototype.clearFilters = function () {
      var basekey = this.getSettingsKey();
      _usersettings.default.remove(basekey + "-filter-IsPlayed"),
        _usersettings.default.remove(basekey + "-filter-IsUnplayed"),
        _usersettings.default.remove(basekey + "-filter-IsFavorite"),
        _usersettings.default.remove(basekey + "-filter-IsResumable"),
        _usersettings.default.remove(basekey + "-filter-Is4K"),
        _usersettings.default.remove(basekey + "-filter-IsHD"),
        _usersettings.default.remove(basekey + "-filter-IsSD"),
        _usersettings.default.remove(basekey + "-filter-Is3D"),
        _usersettings.default.remove(basekey + "-filter-SeriesStatus"),
        _usersettings.default.remove(basekey + "-filter-HasSubtitles"),
        _usersettings.default.remove(basekey + "-filter-ChannelMappingStatus"),
        _usersettings.default.remove(basekey + "-filter-HasTrailer"),
        _usersettings.default.remove(basekey + "-filter-HasSpecialFeature"),
        _usersettings.default.remove(basekey + "-filter-HasThemeSong"),
        _usersettings.default.remove(basekey + "-filter-HasThemeVideo"),
        _usersettings.default.remove(basekey + "-filter-HasOverview"),
        _usersettings.default.remove(basekey + "-filter-HasImdbId"),
        _usersettings.default.remove(basekey + "-filter-HasTvdbId"),
        _usersettings.default.remove(basekey + "-filter-HasTmdbId"),
        _usersettings.default.remove(basekey + "-filter-IsLocked"),
        _usersettings.default.remove(basekey + "-filter-GenreIds"),
        _usersettings.default.remove(basekey + "-filter-StudioIds"),
        _usersettings.default.remove(basekey + "-filter-TagIds"),
        _usersettings.default.remove(basekey + "-filter-OfficialRatings"),
        _usersettings.default.remove(basekey + "-filter-Containers"),
        _usersettings.default.remove(basekey + "-filter-AudioCodecs"),
        _usersettings.default.remove(basekey + "-filter-AudioLanguages"),
        _usersettings.default.remove(basekey + "-filter-SubtitleLanguages"),
        _usersettings.default.remove(basekey + "-filter-VideoCodecs"),
        _usersettings.default.remove(basekey + "-filter-SubtitleCodecs"),
        _usersettings.default.remove(basekey + "-filter-Years"),
        this.itemsContainer.refreshItems();
    }),
    (ListController.prototype.destroyAlphaNumericShortcuts = function () {
      var alphaNumericShortcuts = this.alphaNumericShortcuts;
      alphaNumericShortcuts && (alphaNumericShortcuts.destroy(), (this.alphaNumericShortcuts = null));
    }),
    (ListController.prototype.resume = function (options) {
      options.refresh || this.configureScrollingForView();
    }),
    (ListController.prototype.pause = function () {
      var itemsContainer = this.itemsContainer,
        itemsContainer = (itemsContainer && itemsContainer.pause && itemsContainer.pause(), this.alphaNumericShortcuts);
      itemsContainer && itemsContainer.pause();
    }),
    (ListController.prototype.destroy = function () {
      this.destroyAlphaNumericShortcuts(),
        (this.filterButtons = null),
        this.alphaPicker && (this.alphaPicker.destroy(), (this.alphaPicker = null)),
        removeScrollListener(this),
        destroyHeader(this),
        (this.sortButtons = null),
        (this.btnSortText = null),
        (this.btnSortIcon = null),
        (this.alphaPickerElement = null),
        (this.itemsViewSettingsContainer = null),
        (this.paddedTopPageElem = null),
        (this.view = null),
        (this.itemsContainer = null),
        (this.params = null);
    }),
    (_exports.default = ListController);
});
