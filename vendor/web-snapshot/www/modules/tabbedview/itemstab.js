define([
  "exports",
  "./../loading/loading.js",
  "./basetab.js",
  "./../emby-apiclient/connectionmanager.js",
  "./listcontroller.js",
], function (_exports, _loading, _basetab, _connectionmanager, _listcontroller) {
  function ItemsTab(view, params) {
    _basetab.default.apply(this, arguments),
      _listcontroller.default.apply(this, arguments),
      (this.view = view),
      (this.params = params).serverId && (this.apiClient = _connectionmanager.default.getApiClient(params.serverId));
  }
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    Object.assign(ItemsTab.prototype, _basetab.default.prototype),
    Object.assign(ItemsTab.prototype, _listcontroller.default.prototype),
    (ItemsTab.prototype.onTemplateLoaded = function () {
      _basetab.default.prototype.onTemplateLoaded.apply(this, arguments);
      this.view;
      var params = this.params;
      this.initItemsContainer(),
        this.addFocusBehavior(this.itemsContainer),
        params.parentId && !this.isGlobalQuery() && this.itemsContainer.setAttribute("data-parentid", params.parentId),
        this.initButtons();
    }),
    (ItemsTab.prototype.getListViewOptions = function (items, settings) {
      var options = {fields: [], multiSelect: !0};
      return (options.context = this.getContext()), options;
    }),
    (ItemsTab.prototype.getCardOptions = function (items, settings) {
      "banner" === settings.imageType
        ? (shape = "banner")
        : "disc" === settings.imageType
        ? ((shape = "square"), (preferDisc = !0))
        : "logo" === settings.imageType
        ? ((shape = "backdrop"), (preferLogo = !0))
        : "thumb" === settings.imageType
        ? ((shape = "backdrop"), (preferThumb = !0))
        : (shape = "auto");
      var preferThumb,
        preferDisc,
        preferLogo,
        settings = settings.fields,
        shape = {
          shape: shape,
          preferThumb: preferThumb,
          preferDisc: preferDisc,
          preferLogo: preferLogo,
          fields: settings,
          overlayText: 0 === settings.length || "None" === settings[0],
          context: this.getContext(),
          parentId: this.isGlobalQuery() ? null : this.params.parentId,
          playAction: this.getPlayAction(),
        };
      return (shape.centerText = !shape.overlayText), (shape.multiSelect = !0), shape;
    }),
    (ItemsTab.prototype.getBaseQuery = function () {
      var sortMenuOptions = this.getSortMenuOptions(),
        sortValues = this.getSortValues(sortMenuOptions),
        fields = this.requestedItemFields,
        settings = this.getViewSettings(),
        visibleFields =
          (("primary" !== settings.imageType && "list" !== settings.imageType) ||
            (fields += ",PrimaryImageAspectRatio"),
          settings.fields),
        visibleFields =
          ((!visibleFields.includes("ProductionYear") && "list" !== settings.imageType) ||
            (fields += ",ProductionYear"),
          (!visibleFields.includes("CommunityRating") && "list" !== settings.imageType) ||
            (fields += ",CommunityRating"),
          (!visibleFields.includes("OfficialRating") && "list" !== settings.imageType) || (fields += ",OfficialRating"),
          (!visibleFields.includes("CriticRating") && "list" !== settings.imageType) || (fields += ",CriticRating"),
          visibleFields.includes("PremiereDate") && (fields += ",PremiereDate"),
          visibleFields.includes("DateCreated") && (fields += ",DateCreated"),
          visibleFields.includes("Resolution") && (fields += ",Width,Height"),
          visibleFields.includes("Bitrate") && (fields += ",Bitrate"),
          visibleFields.includes("Size") && (fields += ",Size"),
          visibleFields.includes("Container") && (fields += ",Container"),
          visibleFields.includes("Video3DFormat") && (fields += ",Video3DFormat"),
          visibleFields.includes("Genres") && (fields += ",Genres"),
          visibleFields.includes("Studios") && (fields += ",Studios"),
          visibleFields.includes("Tags") && (fields += ",Tags"),
          visibleFields.includes("Filename") && (fields += ",Filename"),
          visibleFields.includes("Overview") && (fields += ",Overview"),
          visibleFields.includes("OriginalTitle") && (fields += ",OriginalTitle"),
          visibleFields.includes("SortName") && (fields += ",SortName"),
          this.enableAlphaPicker(sortValues.sortBy, sortValues.sortOrder) && (fields += ",Prefix"),
          "Primary,Backdrop,Thumb"),
        sortOrder =
          ("banner" === settings.imageType
            ? (visibleFields += ",Banner")
            : "disc" === settings.imageType
            ? (visibleFields += ",Disc")
            : "logo" === settings.imageType && (visibleFields += ",Logo"),
          sortValues.sortOrder),
        sortMenuOptions =
          (sortValues.sortBy &&
            sortOrder &&
            (sortMenuOptions = (function (sortMenuOptions, sortBy) {
              for (var i = 0, length = sortMenuOptions.length; i < length; i++) {
                var option = sortMenuOptions[i];
                if (option.value === sortBy) return option;
              }
              return null;
            })(sortMenuOptions, sortValues.sortBy)) &&
            sortMenuOptions["sortOrder" + sortOrder] &&
            (sortOrder = sortMenuOptions["sortOrder" + sortOrder]),
          {
            SortBy: sortValues.sortBy,
            SortOrder: sortOrder,
            IncludeItemTypes: this.getQueryIncludeItemTypes().join(","),
            Recursive: !0,
            Fields: fields,
            StartIndex: 0,
            ParentId: this.isGlobalQuery() ? null : this.params.parentId,
          });
      return (
        "datagrid" === settings.imageType
          ? ((sortMenuOptions.EnableImages = !1), (sortMenuOptions.ImageTypeLimit = 0))
          : ((sortMenuOptions.EnableImageTypes = visibleFields), (sortMenuOptions.ImageTypeLimit = 1)),
        sortMenuOptions
      );
    }),
    (ItemsTab.prototype.getQueryInfo = function (enableFilters) {
      var hasFilters,
        query = this.getBaseQuery(),
        queryFilters = [],
        enableFilters =
          (this.options && "favorites" === this.options.mode && queryFilters.push("IsFavorite"),
          !1 !== enableFilters &&
            ((enableFilters = this.getFilters()).SeriesStatus &&
              ((query.SeriesStatus = enableFilters.SeriesStatus), (hasFilters = !0)),
            enableFilters.IsPlayed && (queryFilters.push("IsPlayed"), (hasFilters = !0)),
            enableFilters.IsUnplayed && (queryFilters.push("IsUnplayed"), (hasFilters = !0)),
            enableFilters.IsFavorite && (queryFilters.push("IsFavorite"), (hasFilters = !0)),
            enableFilters.IsResumable && (queryFilters.push("IsResumable"), (hasFilters = !0)),
            enableFilters.Containers && ((hasFilters = !0), (query.Containers = enableFilters.Containers)),
            enableFilters.AudioCodecs && ((hasFilters = !0), (query.AudioCodecs = enableFilters.AudioCodecs)),
            enableFilters.AudioLanguages && ((hasFilters = !0), (query.AudioLanguages = enableFilters.AudioLanguages)),
            enableFilters.VideoCodecs && ((hasFilters = !0), (query.VideoCodecs = enableFilters.VideoCodecs)),
            enableFilters.SubtitleCodecs && ((hasFilters = !0), (query.SubtitleCodecs = enableFilters.SubtitleCodecs)),
            enableFilters.SubtitleLanguages &&
              ((hasFilters = !0), (query.SubtitleLanguages = enableFilters.SubtitleLanguages)),
            enableFilters.GenreIds && ((hasFilters = !0), (query.GenreIds = enableFilters.GenreIds)),
            enableFilters.OfficialRatings &&
              ((hasFilters = !0), (query.OfficialRatings = enableFilters.OfficialRatings)),
            enableFilters.StudioIds && ((hasFilters = !0), (query.StudioIds = enableFilters.StudioIds)),
            enableFilters.TagIds && ((hasFilters = !0), (query.TagIds = enableFilters.TagIds)),
            enableFilters.Years && ((hasFilters = !0), (query.Years = enableFilters.Years)),
            enableFilters.Is4K && (hasFilters = query.Is4K = !0),
            enableFilters.IsHD && (hasFilters = query.IsHD = !0),
            enableFilters.IsSD && (hasFilters = !(query.IsHD = !1)),
            enableFilters.Is3D && (hasFilters = query.Is3D = !0),
            null != enableFilters.HasSubtitles &&
              ((query.HasSubtitles = enableFilters.HasSubtitles), (hasFilters = !0)),
            null != enableFilters.ChannelMappingStatus &&
              ((query.ChannelMappingStatus = enableFilters.ChannelMappingStatus), (hasFilters = !0)),
            null != enableFilters.HasTrailer && ((query.HasTrailer = enableFilters.HasTrailer), (hasFilters = !0)),
            null != enableFilters.HasSpecialFeature &&
              ((query.HasSpecialFeature = enableFilters.HasSpecialFeature), (hasFilters = !0)),
            null != enableFilters.HasThemeSong &&
              ((query.HasThemeSong = enableFilters.HasThemeSong), (hasFilters = !0)),
            null != enableFilters.HasThemeVideo &&
              ((query.HasThemeVideo = enableFilters.HasThemeVideo), (hasFilters = !0)),
            null != enableFilters.HasOverview && ((query.HasOverview = enableFilters.HasOverview), (hasFilters = !0)),
            null != enableFilters.HasImdbId && ((query.HasImdbId = enableFilters.HasImdbId), (hasFilters = !0)),
            null != enableFilters.HasTvdbId && ((query.HasTvdbId = enableFilters.HasTvdbId), (hasFilters = !0)),
            null != enableFilters.HasTmdbId && ((query.HasTmdbId = enableFilters.HasTmdbId), (hasFilters = !0)),
            null != enableFilters.IsLocked && ((query.IsLocked = enableFilters.IsLocked), (hasFilters = !0))),
          (query.Filters = queryFilters.length ? queryFilters.join(",") : null),
          this.getViewSettings());
      return (
        enableFilters.groupItemsIntoCollections
          ? (query.GroupItemsIntoCollections = !0)
          : enableFilters.groupItemsIntoTags && (query.GroupItemsInto = "Tags"),
        {query: query, hasFilters: hasFilters}
      );
    }),
    (ItemsTab.prototype.getViewSettingDefaults = function (currentItem, listItems, allowedVisibleFields) {
      var defaults = {imageType: "primary", fields: []};
      (currentItem && "PhotoAlbum" === currentItem.Type) || defaults.fields.push("Name", "ProductionYear", "CommunityRating"), this.params;
      return (
        allowedVisibleFields.includes("ProductionYear") &&
          defaults.fields.includes("Name") &&
          defaults.fields.push("ProductionYear"),
        defaults
      );
    }),
    (ItemsTab.prototype.getSettingsKey = function () {
      return this.params.parentId + "-1";
    }),
    (ItemsTab.prototype.onResume = function (options) {
      _basetab.default.prototype.onResume.apply(this, arguments),
        _listcontroller.default.prototype.resume.apply(this, arguments),
        options && options.refresh && (this.updateSortText(), _loading.default.show());
      this.view;
      this.supportsAlphaPicker() && this.initAlphaPicker();
      var alphaNumericShortcuts = this.alphaNumericShortcuts,
        instance = (alphaNumericShortcuts && alphaNumericShortcuts.resume(), this),
        autoFocus = options.autoFocus;
      this.itemsContainer.resume(options).then(function (result) {
        _loading.default.hide(), autoFocus && instance.autoFocus();
      });
    }),
    (ItemsTab.prototype.supportsAlphaPicker = function () {
      return !1;
    }),
    (ItemsTab.prototype.refresh = function (options) {
      _loading.default.show();
      var instance = this,
        autoFocus = options.autoFocus;
      this.itemsContainer.refreshItems(options).then(function (result) {
        _loading.default.hide(), autoFocus && instance.autoFocus();
      });
    }),
    (ItemsTab.prototype.onPause = function () {
      _basetab.default.prototype.onPause.apply(this, arguments),
        _listcontroller.default.prototype.pause.apply(this, arguments);
    }),
    (ItemsTab.prototype.destroy = function () {
      _basetab.default.prototype.destroy.apply(this, arguments),
        _listcontroller.default.prototype.destroy.apply(this, arguments),
        (this.view = null),
        (this.params = null),
        (this.apiClient = null);
    }),
    (_exports.default = ItemsTab);
});
