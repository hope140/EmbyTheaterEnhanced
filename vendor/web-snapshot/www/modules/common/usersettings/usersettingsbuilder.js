define(["exports", "./../appsettings.js", "./../../emby-apiclient/events.js"], function (
  _exports,
  _appsettings,
  _events
) {
  function UserSettings() {}
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    (UserSettings.prototype.setUserInfo = function (userId, apiClient) {
      if (
        (this.saveTimeout && clearTimeout(this.saveTimeout),
        (this.currentUserId = userId),
        (this.currentApiClient = apiClient),
        !userId)
      )
        return (this.displayPrefs = null), Promise.resolve();
      var self = this;
      return apiClient.getDisplayPreferences("usersettings", userId, "emby").then(function (result) {
        (result.CustomPrefs = result.CustomPrefs || {}),
          (self.displayPrefs = result),
          _events.default.trigger(self, "load");
      });
    }),
    (UserSettings.prototype.getData = function () {
      return this.displayPrefs;
    }),
    (UserSettings.prototype.importFrom = function (instance) {
      this.displayPrefs = instance.getData();
    }),
    (UserSettings.prototype.set = function (name, value, enableOnServer) {
      var userId = this.currentUserId;
      if (!userId) throw new Error("userId cannot be null");
      var currentValue = this.get(name, enableOnServer),
        userId = _appsettings.default.set(name, value, userId);
      return (
        !1 !== enableOnServer &&
          this.displayPrefs &&
          ((this.displayPrefs.CustomPrefs[name] = null == value ? value : value.toString()),
          (enableOnServer = this).saveTimeout && clearTimeout(enableOnServer.saveTimeout),
          (enableOnServer.saveTimeout = setTimeout(
            function () {
              (this.saveTimeout = null),
                this.currentApiClient.updateDisplayPreferences(
                  "usersettings",
                  this.displayPrefs,
                  this.currentUserId,
                  "emby"
                );
            }.bind(enableOnServer),
            50
          ))),
        currentValue !== value && _events.default.trigger(this, "change", [name, value]),
        userId
      );
    }),
    (UserSettings.prototype.remove = function (name, enableOnServer) {
      return this.set(name, null, enableOnServer);
    }),
    (UserSettings.prototype.get = function (name, enableOnServer) {
      var userId = this.currentUserId;
      return userId
        ? !1 !== enableOnServer && this.displayPrefs
          ? this.displayPrefs.CustomPrefs[name]
          : _appsettings.default.get(name, userId)
        : null;
    }),
    (UserSettings.prototype.serverConfig = function (config) {
      var apiClient = this.currentApiClient;
      return config
        ? apiClient.updateUserConfiguration(this.currentUserId, config)
        : apiClient.getUser(this.currentUserId).then(function (user) {
            return user.Configuration;
          });
    }),
    (UserSettings.prototype.enableCinemaMode = function (val) {
      return null != val
        ? this.set("enableCinemaMode", val.toString(), !1)
        : !(val = this.get("enableCinemaMode", !1)) || "false" !== val;
    }),
    (UserSettings.prototype.enableNextVideoInfoOverlay = function (val) {
      return null != val
        ? this.set("enableNextVideoInfoOverlay", val.toString())
        : "false" !== (val = this.get("enableNextVideoInfoOverlay"));
    }),
    (UserSettings.prototype.getEnableLogoAsTitle = function (displayLanguage) {
      var val = this.get("enableLogoAsTitle");
      return val ? "true" === val : displayLanguage && displayLanguage.toLowerCase().startsWith("en");
    }),
    (UserSettings.prototype.setEnableLogoAsTitle = function (val) {
      return this.set("enableLogoAsTitle", val.toString());
    }),
    (UserSettings.prototype.enableThemeSongs = function (val) {
      return null != val
        ? this.set("enableThemeSongs", val.toString(), !1)
        : "false" !== (val = this.get("enableThemeSongs", !1));
    }),
    (UserSettings.prototype.enableThemeVideos = function (val) {
      return null != val
        ? this.set("enableThemeVideos", val.toString(), !1)
        : "false" !== (val = this.get("enableThemeVideos", !1));
    }),
    (UserSettings.prototype.enableHomescreenFocusPreviews = function () {
      return !1;
    }),
    (UserSettings.prototype.enableBackdrops = function (val) {
      return null != val
        ? this.set("enableBackdrops", val.toString(), !1)
        : "false" !== (val = this.get("enableBackdrops", !1));
    }),
    (UserSettings.prototype.language = function (val) {
      return null != val ? this.set("language", val.toString(), !1) : this.get("language", !1);
    }),
    (UserSettings.prototype.dateTimeLocale = function (val) {
      return null != val ? this.set("datetimelocale", val.toString(), !1) : this.get("datetimelocale", !1);
    }),
    (UserSettings.prototype.skipBackLength = function (val) {
      return null != val ? this.set("skipBackLength", val.toString()) : parseInt(this.get("skipBackLength") || "5000");
    }),
    (UserSettings.prototype.skipForwardLength = function (val) {
      return null != val
        ? this.set("skipForwardLength", val.toString())
        : parseInt(this.get("skipForwardLength") || "5000");
    }),
    (UserSettings.prototype.settingsTheme = function (val) {
      return null != val ? this.set("settingsTheme", val, !1) : this.get("settingsTheme", !1);
    }),
    (UserSettings.prototype.theme = function (val) {
      return null != val ? this.set("appTheme", val, !1) : this.get("appTheme", !1) || null;
    }),
    (UserSettings.prototype.accentColor = function (val) {
      return null != val ? this.set("accentColor", val, !0) : this.get("accentColor", !0) || "emby";
    }),
    (UserSettings.prototype.screensaver = function (val) {
      return null != val ? this.set("screensaver", val, !1) : this.get("screensaver", !1) || null;
    }),
    (UserSettings.prototype.soundEffects = function (val) {
      return null != val ? this.set("soundeffects", val, !1) : this.get("soundeffects", !1) || "defaultsoundeffects";
    }),
    (UserSettings.prototype.osdContentSection = function (val) {
      return null != val ? this.set("osdcontentsection", val, !1) : this.get("osdcontentsection", !1);
    }),
    (UserSettings.prototype.drawerStyle = function (val) {
      return null != val ? this.set("drawerstyle", val, !1) : this.get("drawerstyle", !1);
    }),
    (UserSettings.prototype.settingsDrawerStyle = function (val) {
      return null != val ? this.set("settingsdrawerstyle", val, !1) : this.get("settingsdrawerstyle", !1) || "docked";
    }),
    (UserSettings.prototype.nowPlayingAudioBackgroundStyle = function (val) {
      return null != val
        ? this.set("nowPlayingAudioBackgroundStyle", val, !0)
        : this.get("nowPlayingAudioBackgroundStyle", !0) || "blur";
    }),
    (UserSettings.prototype.nowPlayingVideoBackgroundStyle = function (val) {
      return null != val
        ? this.set("nowPlayingVideoBackgroundStyle", val, !0)
        : this.get("nowPlayingVideoBackgroundStyle", !0) || "backdrop";
    }),
    (UserSettings.prototype.stillWatchingTimeMs = function (val) {
      return null != val
        ? this.set("stillwatchingms", val, !0)
        : parseInt(this.get("stillwatchingms", !0) || "14400000");
    }),
    (UserSettings.prototype.enableStillWatching = function (val) {
      return null != val ? this.stillWatchingTimeMs(val ? 144e5 : 0) : 0 < this.stillWatchingTimeMs();
    }),
    (UserSettings.prototype.getSubtitleAppearanceSettings = function (key) {
      key = key || "localplayersubtitleappearance3";
      key = JSON.parse(this.get(key, !1) || "{}");
      return (
        key.dropShadow || (key.dropShadow = "dropshadow"),
        key.textBackground || (key.textBackground = "transparent"),
        key.textBackgroundOpacity || (key.textBackgroundOpacity = "1"),
        key
      );
    }),
    (UserSettings.prototype.setSubtitleAppearanceSettings = function (value, key) {
      return this.set((key = key || "localplayersubtitleappearance3"), JSON.stringify(value), !1);
    }),
    (UserSettings.prototype.setFilter = function (key, value) {
      return this.set(key, value, !0);
    }),
    (UserSettings.prototype.getFilter = function (key) {
      return this.get(key, !0);
    }),
    (UserSettings.prototype.getDefaultHomeScreenSection = function (index) {
      switch (index) {
        case 0:
          return "smalllibrarytiles";
        case 1:
          return "resume";
        case 2:
          return "resumeaudio";
        case 3:
          return "livetv";
        case 4:
          return "none";
        case 5:
          return "latestmedia";
        default:
          return "none";
      }
    }),
    (UserSettings.prototype.getHomeScreenSections = function (includeBlanks) {
      for (var sections = [], i = 0; i < 7; i++) {
        var section = this.get("homesection" + i) || this.getDefaultHomeScreenSection(i);
        "folders" === section
          ? (section = this.getDefaultHomeScreenSection(0))
          : "onnow" === section
          ? (section = "livetv")
          : ("librarytiles" !== section &&
              "smalllibrarytiles-automobile" !== section &&
              "librarytiles-automobile" !== section) ||
            (section = "smalllibrarytiles"),
          ("none" === section && !includeBlanks) || sections.push(section);
      }
      return sections;
    }),
    (UserSettings.prototype.getLiveTvChannelSortSettingsKey = function () {
      return "livetv-channelorder";
    }),
    (UserSettings.prototype.getLiveTvChannelSortOrders = function (globalize) {
      for (
        var selectedOrder,
          sortBy = [],
          currentOrder =
            (sortBy.push({
              name: globalize.translate("HeaderDefaultChannelOrder"),
              value: "DefaultChannelOrder",
              defaultSortOrder: "Ascending",
              menuSortKey: "0",
            }),
            sortBy.push({
              name: globalize.translate("ChannelNumber"),
              value: "ChannelNumber,SortName",
              defaultSortOrder: "Ascending",
            }),
            sortBy.push({
              name: globalize.translate("DatePlayed"),
              value: "DatePlayed,ChannelNumber,SortName",
              defaultSortOrder: "Descending",
            }),
            sortBy.push({name: globalize.translate("Title"), value: "SortName", defaultSortOrder: "Ascending"}),
            sortBy.push({
              name: globalize.translate("HeaderFavoritesThenByDefault"),
              value: "IsFavorite,DefaultChannelOrder",
              defaultSortOrder: "Ascending",
            }),
            sortBy.push({
              name: globalize.translate("HeaderFavoritesThenByChannelNumber"),
              value: "IsFavorite,ChannelNumber,SortName",
              defaultSortOrder: "Ascending",
            }),
            sortBy.push({
              name: globalize.translate("HeaderFavoritesThenByTitle"),
              value: "IsFavorite,SortName",
              defaultSortOrder: "Ascending",
            }),
            this.getFilter(this.getLiveTvChannelSortSettingsKey(), !0)),
          i = 0,
          length = sortBy.length;
        i < length;
        i++
      ) {
        var order = sortBy[i];
        if (order.value === currentOrder) {
          selectedOrder = order;
          break;
        }
      }
      return ((selectedOrder = selectedOrder || sortBy[0]).selected = !0), sortBy;
    }),
    (UserSettings.prototype.addLiveTvChannelSortingToQuery = function (query, globalize) {
      for (
        var selectedOrder, orders = this.getLiveTvChannelSortOrders(globalize), i = 0, length = orders.length;
        i < length;
        i++
      ) {
        var order = orders[i];
        if (order.selected) {
          selectedOrder = order;
          break;
        }
      }
      (query.SortBy = selectedOrder.value), (query.SortOrder = selectedOrder.defaultSortOrder);
    }),
    (_exports.default = UserSettings);
});
