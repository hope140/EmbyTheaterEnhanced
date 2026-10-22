define(["exports", "./itemstab.js", "./../common/globalize.js"], function (_exports, _itemstab, _globalize) {
  function FoldersTab(view, params) {
    _itemstab.default.call(this, view, params);
  }
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    Object.assign(FoldersTab.prototype, _itemstab.default.prototype),
    (FoldersTab.prototype.supportsAlphaPicker = function () {
      return !0;
    }),
    (FoldersTab.prototype.getBaseQuery = function () {
      var query = _itemstab.default.prototype.getBaseQuery.apply(this, arguments);
      return (query.ParentId = this.params.parentId), (query.Recursive = !1), query;
    }),
    (FoldersTab.prototype.getContext = function () {
      return "folders";
    }),
    (FoldersTab.prototype.getSettingsKey = function () {
      return _itemstab.default.prototype.getSettingsKey.call(this) + "-folders";
    }),
    (FoldersTab.prototype.getCardOptions = function (items, settings) {
      var options = _itemstab.default.prototype.getCardOptions.apply(this, arguments);
      return (options.typeIndicator = !0), options;
    }),
    (FoldersTab.prototype.getDefaultSortBy = function () {
      return this.getFileSortOption().value;
    }),
    (FoldersTab.prototype.getVisibleViewSettings = function () {
      return {
        settings: ["imageType", "groupItemsIntoCollections"],
        fields: ["Name", "CommunityRating", "CriticRating", "OfficialRating", "ProductionYear", "Runtime"],
      };
    }),
    (FoldersTab.prototype.getVisibleFilters = function () {
      return [];
    }),
    (FoldersTab.prototype.loadTemplate = function () {
      return require(["text!modules/tabbedview/itemstab.template.html"]);
    }),
    (_exports.default = FoldersTab);
});
