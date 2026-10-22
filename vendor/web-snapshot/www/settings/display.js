define([
  "exports",
  "./../modules/viewmanager/baseview.js",
  "./../modules/loading/loading.js",
  "./../modules/common/globalize.js",
  "./../modules/emby-elements/emby-input/emby-input.js",
  "./../modules/emby-elements/emby-button/emby-button.js",
  "./../modules/emby-elements/emby-checkbox/emby-checkbox.js",
  "./../modules/emby-elements/emby-select/emby-select.js",
  "./../modules/emby-elements/emby-scroller/emby-scroller.js",
  "./../modules/common/datetime.js",
  "./../modules/common/appsettings.js",
  "./../modules/focusmanager.js",
  "./../modules/layoutmanager.js",
  "./../modules/common/usersettings/usersettings.js",
  "./../modules/common/usersettings/usersettingsbuilder.js",
  "./../modules/emby-apiclient/connectionmanager.js",
  "./../modules/common/pluginmanager.js",
  "./../modules/skinmanager.js",
  "./../modules/common/servicelocator.js",
], function (
  _exports,
  _baseview,
  _loading,
  _globalize,
  _embyInput,
  _embyButton,
  _embyCheckbox,
  _embySelect,
  _embyScroller,
  _datetime,
  _appsettings,
  _focusmanager,
  _layoutmanager,
  _usersettings,
  _usersettingsbuilder,
  _connectionmanager,
  _pluginmanager,
  _skinmanager,
  _servicelocator
) {
  Object.defineProperty(_exports, "__esModule", {value: !0}), (_exports.default = void 0);
  var supportsCssVariables = CSS.supports("color", "var(--fake-var)");
  function fillThemes(select, isSettings) {
    for (
      var mainThemeValue, themes = _skinmanager.default.getThemes(), defaultFound = !1, i = 0, length = themes.length;
      i < length;
      i++
    ) {
      var theme = themes[i],
        value = theme.id;
      ((theme.isDefault && !isSettings) || (theme.isSettingsDefault && isSettings)) && (defaultFound = !(value = "")),
        (theme.value = value);
    }
    isSettings &&
      ((mainThemeValue = isSettings && !defaultFound ? "" : "maintheme"),
      themes.unshift({
        name: _globalize.default.translate("SameAsMainTheme"),
        id: "maintheme",
        value: mainThemeValue,
        isSettingsDefault: _servicelocator.appHost.supports("multiserver"),
      })),
      (select.innerHTML = themes
        .map(function (t) {
          return '<option value="' + t.value + '">' + t.name + "</option>";
        })
        .join(""));
  }
  function loadForm(context, user, userSettings, apiClient) {
    apiClient.getCurrentUserId(), user.Id;
    _servicelocator.appHost.supports("displaymode")
      ? context.querySelector(".fldDisplayMode").classList.remove("hide")
      : context.querySelector(".fldDisplayMode").classList.add("hide"),
      _servicelocator.appHost.supports("externallinks") && _servicelocator.appHost.supports("externalappinfo")
        ? context.querySelector(".learnHowToContributeContainer").classList.remove("hide")
        : context.querySelector(".learnHowToContributeContainer").classList.add("hide"),
      _servicelocator.appHost.supports("runatstartup")
        ? context.querySelector(".fldAutorun").classList.remove("hide")
        : context.querySelector(".fldAutorun").classList.add("hide"),
      _servicelocator.appHost.supports("soundeffects") && _layoutmanager.default.tv
        ? context.querySelector(".fldSoundEffects").classList.remove("hide")
        : context.querySelector(".fldSoundEffects").classList.add("hide"),
      _servicelocator.appHost.supports("screensaver")
        ? context.querySelector(".selectScreensaverContainer").classList.remove("hide")
        : context.querySelector(".selectScreensaverContainer").classList.add("hide"),
      _datetime.default.supportsLocalization()
        ? context.querySelector(".fldDateTimeLocale").classList.remove("hide")
        : context.querySelector(".fldDateTimeLocale").classList.add("hide"),
      supportsCssVariables
        ? context.querySelector(".fldAccentColor").classList.remove("hide")
        : context.querySelector(".fldAccentColor").classList.add("hide"),
      "554ae9ea56b94c1c82cc628f6de52d85" !== apiClient.serverId()
        ? (context.querySelector(".fldBackdrops").classList.remove("hide"),
          context.querySelector(".fldThemeSong").classList.remove("hide"),
          context.querySelector(".fldThemeVideo").classList.remove("hide"))
        : (context.querySelector(".fldBackdrops").classList.add("hide"),
          context.querySelector(".fldThemeSong").classList.add("hide"),
          context.querySelector(".fldThemeVideo").classList.add("hide")),
      (context.querySelector(".chkRunAtStartup").checked = _appsettings.default.runAtStartup());
    var selectTheme = context.querySelector(".selectTheme"),
      selectSettingsTheme = context.querySelector(".selectSettingsTheme");
    fillThemes(selectTheme),
      fillThemes(selectSettingsTheme, !0),
      (function (context, userSettings) {
        var context = context.querySelector(".selectScreensaver"),
          options = _pluginmanager.default.ofType("screensaver").map(function (plugin) {
            return {name: plugin.name, value: plugin.id};
          });
        options.unshift({name: _globalize.default.translate("None"), value: "none"}),
          (context.innerHTML = options
            .map(function (o) {
              return '<option value="' + o.value + '">' + o.name + "</option>";
            })
            .join("")),
          (context.value = userSettings.screensaver()),
          context.value || (context.value = "none");
      })(context, userSettings),
      (function (context, userSettings) {
        var context = context.querySelector(".selectSoundEffects"),
          options = _pluginmanager.default.ofType("soundeffects").map(function (plugin) {
            return {name: plugin.name, value: plugin.id};
          });
        options.unshift({name: _globalize.default.translate("None"), value: "none"}),
          (context.innerHTML = options
            .map(function (o) {
              return '<option value="' + o.value + '">' + o.name + "</option>";
            })
            .join("")),
          (context.value = userSettings.soundEffects()),
          context.value || (context.value = "none");
      })(context, userSettings),
      (context.querySelector(".selectAccentColor").value = userSettings.accentColor() || "emby"),
      (context.querySelector(".chkDisplayMissingEpisodes").checked = user.Configuration.DisplayMissingEpisodes || !1),
      (context.querySelector(".chkThemeSong").checked = userSettings.enableThemeSongs()),
      (context.querySelector(".chkThemeVideo").checked = userSettings.enableThemeVideos()),
      (context.querySelector(".chkBackdrops").checked = userSettings.enableBackdrops()),
      (context.querySelector(".chkLogoImages").checked = userSettings.getEnableLogoAsTitle(
        _globalize.default.getCurrentLocale()
      )),
      (context.querySelector(".selectLanguage").value = userSettings.language() || ""),
      (context.querySelector(".selectDateTimeLocale").value = userSettings.dateTimeLocale() || ""),
      (selectSettingsTheme.value = userSettings.settingsTheme() || ""),
      (selectTheme.value = userSettings.theme() || ""),
      (context.querySelector(".selectLayout").value = _layoutmanager.default.getSavedLayout() || ""),
      (context.querySelector(".selectNowPlayingAudioBackground").value = userSettings.nowPlayingAudioBackgroundStyle()),
      (context.querySelector(".selectNowPlayingVideoBackground").value = userSettings.nowPlayingVideoBackgroundStyle()),
      (function (context, apiClient) {
        "554ae9ea56b94c1c82cc628f6de52d85" === apiClient.serverId()
          ? context.querySelector(".fldDisplayMissingEpisodes").classList.add("hide")
          : context.querySelector(".fldDisplayMissingEpisodes").classList.remove("hide");
      })(context, apiClient),
      _loading.default.hide();
  }
  function save(context, userId, userSettings, apiClient, enableSaveConfirmation) {
    _loading.default.show(),
      apiClient.getUser(userId).then(function (user) {
        !(function (context, user, userSettingsInstance, apiClient) {
          return (
            _appsettings.default.runAtStartup(context.querySelector(".chkRunAtStartup").checked),
            (user.Configuration.DisplayMissingEpisodes = context.querySelector(".chkDisplayMissingEpisodes").checked),
            userSettingsInstance.language(context.querySelector(".selectLanguage").value),
            userSettingsInstance.dateTimeLocale(context.querySelector(".selectDateTimeLocale").value),
            userSettingsInstance.enableThemeSongs(context.querySelector(".chkThemeSong").checked),
            userSettingsInstance.enableThemeVideos(context.querySelector(".chkThemeVideo").checked),
            userSettingsInstance.settingsTheme(context.querySelector(".selectSettingsTheme").value),
            userSettingsInstance.theme(context.querySelector(".selectTheme").value),
            userSettingsInstance.soundEffects(context.querySelector(".selectSoundEffects").value),
            userSettingsInstance.screensaver(context.querySelector(".selectScreensaver").value),
            userSettingsInstance.accentColor(context.querySelector(".selectAccentColor").value),
            userSettingsInstance.setEnableLogoAsTitle(context.querySelector(".chkLogoImages").checked),
            userSettingsInstance.enableBackdrops(context.querySelector(".chkBackdrops").checked),
            userSettingsInstance.nowPlayingAudioBackgroundStyle(
              context.querySelector(".selectNowPlayingAudioBackground").value
            ),
            userSettingsInstance.nowPlayingVideoBackgroundStyle(
              context.querySelector(".selectNowPlayingVideoBackground").value
            ),
            _layoutmanager.default.setLayout(context.querySelector(".selectLayout").value),
            apiClient.updateUserConfiguration(user.Id, user.Configuration)
          );
        })(context, user, userSettings, apiClient).then(
          function () {
            _loading.default.hide(),
              enableSaveConfirmation &&
                require(["toast"], function (toast) {
                  toast(_globalize.default.translate("SettingsSaved"));
                });
          },
          function () {
            _loading.default.hide();
          }
        );
      });
  }
  function onSubmit(e) {
    var options = this,
      apiClient = _connectionmanager.default.getApiClient(options.serverId),
      userId = options.userId,
      userSettings = options.userSettings;
    return (
      userSettings.setUserInfo(userId, apiClient).then(function () {
        var enableSaveConfirmation = options.enableSaveConfirmation;
        save(options.element, userId, userSettings, apiClient, enableSaveConfirmation);
      }),
      e && e.preventDefault(),
      !1
    );
  }
  function setPremiereText(elem, key) {
    _servicelocator.appHost.supports("externallinks") && _servicelocator.appHost.supports("externalpremium")
      ? (elem.innerHTML = _globalize.default.translate(
          key,
          '<a is="emby-linkbutton" href="https://emby.media/premiere" data-preset="premiereinfo" target="_blank" class="button-link">',
          "</a>"
        ))
      : (elem.innerHTML = _globalize.default.translate(key, "", ""));
  }
  function View(view, params) {
    _baseview.default.apply(this, arguments);
    for (
      var apiClient = _connectionmanager.default.getApiClient(params.serverId),
        userId = params.userId || apiClient.getCurrentUserId(),
        userSettings =
          userId === apiClient.getCurrentUserId() ? _usersettings.default : new _usersettingsbuilder.default(),
        apiClient = {
          serverId: apiClient.serverId(),
          userId: userId,
          element: view.querySelector(".settingsContainer"),
          userSettings: userSettings,
          enableSaveButton: !1,
          enableSaveConfirmation: !1,
          autoFocus: !0,
          autoSave: !0,
        },
        featurePremiereInfo =
          ((this.settingsOptions = apiClient).element
            .querySelector("form")
            .addEventListener("submit", onSubmit.bind(apiClient)),
          apiClient.enableSaveButton && apiClient.element.querySelector(".btnSave").classList.remove("hide"),
          apiClient.element.querySelectorAll(".featurePremiereInfo")),
        i = 0,
        length = featurePremiereInfo.length;
      i < length;
      i++
    )
      setPremiereText(featurePremiereInfo[i], "");
    !(function (view) {
      var displayModePremiere = view.querySelector(".displayModePremiere");
      setPremiereText(displayModePremiere, ""),
        _servicelocator.iapManager.isUnlockedByDefault("playback").then(
          function (result) {
            _servicelocator.iapManager.isUnlockedByDefault("playback-tv").then(
              function (result) {
                displayModePremiere.classList.add("hide");
              },
              function (result) {
                displayModePremiere.classList.remove("hide");
              }
            );
          },
          function (result) {
            displayModePremiere.classList.add("hide");
          }
        );
    })(view);
  }
  Object.assign(View.prototype, _baseview.default.prototype),
    (View.prototype.onResume = function (options) {
      _baseview.default.prototype.onResume.apply(this, arguments),
        options.refresh &&
          (function (options) {
            var context = options.element,
              userId = (_loading.default.show(), options.userId),
              apiClient = _connectionmanager.default.getApiClient(options.serverId),
              userSettings = options.userSettings;
            apiClient.getUser(userId).then(function (user) {
              (userId === apiClient.getCurrentUserId()
                ? Promise.resolve()
                : userSettings.setUserInfo(userId, apiClient)
              ).then(function () {
                loadForm(context, user, userSettings, apiClient), _focusmanager.default.autoFocus(context);
              });
            });
          })(this.settingsOptions);
    }),
    (View.prototype.onPause = function () {
      this.settingsOptions.autoSave && onSubmit.call(this.settingsOptions),
        _baseview.default.prototype.onPause.apply(this, arguments);
    }),
    (View.prototype.destroy = function () {
      _baseview.default.prototype.destroy.apply(this, arguments), (this.settingsOptions = null);
    }),
    (_exports.default = View);
});
