define(["exports", "./itemstab.js", "./../common/globalize.js"], function (_exports, _itemstab, _globalize) {
  function SeriesTab(view, params) {
    _itemstab.default.call(this, view, params);
  }
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    Object.assign(SeriesTab.prototype, _itemstab.default.prototype),
    (SeriesTab.prototype.supportsAlphaPicker = function () {
      return !0;
    }),
    (SeriesTab.prototype.getSettingsKey = function () {
      return _itemstab.default.prototype.getSettingsKey.call(this) + "-series";
    }),
    (SeriesTab.prototype.getVisibleViewSettings = function () {
      return {
        settings: ["imageType", "groupItemsIntoCollections"],
        fields: [
          "Name",
          "ProductionYear",
          "OfficialRating",
          "CommunityRating",
          "CriticRating",
          "PlayCount",
          "DateCreated",
          "PremiereDate",
          "DatePlayed",
          "Played",
          "IsFavorite",
          "Runtime",
          "Genres",
          "Studios",
          "Tags",
          "OriginalTitle",
          "SortName",
        ],
      };
    }),
    (SeriesTab.prototype.getVisibleFilters = function () {
      return [
        "Genres",
        "Studios",
        "Tags",
        "OfficialRatings",
        "Containers",
        "Years",
        "IsUnplayed",
        "IsPlayed",
        "IsFavorite",
        "SeriesStatus",
        "HasTrailer",
        "HasThemeSong",
        "HasThemeVideo",
        "HasOverview",
        "HasImdbId",
        "HasTmdbId",
        "HasTvdbId",
        "IsLocked",
      ];
    }),
    (SeriesTab.prototype.getItemTypes = function () {
      return ["Series"];
    }),
    (SeriesTab.prototype.getBaseQuery = function () {
      var query = _itemstab.default.prototype.getBaseQuery.call(this);
      return this.getViewSettings().fields.includes("ProductionYear") && (query.Fields += ",Status,EndDate"), query;
    }),
    /*(SeriesTab.prototype.getSortMenuOptions = function () {
      var sortBy = _itemstab.default.prototype.getSortMenuOptions.call(this);
      return (
        sortBy.push({
          name: _globalize.default.translate("LastEpisodeDateAdded"),
          value: "DateLastContentAdded,SortName",
          defaultSortOrder: "Descending",
        }),
        this.sortOptionsByName(sortBy),
        sortBy
      );
    }),*/
    (SeriesTab.prototype.loadTemplate = function () {
      return require(["text!modules/tabbedview/itemstab.template.html"]);
    }),
    (SeriesTab.prototype.getViewSettingDefaults = function (currentItem, listItems, allowedVisibleFields) {
      var defaults = _itemstab.default.prototype.getViewSettingDefaults.apply(this, arguments);
      return (defaults.fields = ["Name", "ProductionYear", "CommunityRating"]), defaults; 
    }),
    (_exports.default = SeriesTab);
});
