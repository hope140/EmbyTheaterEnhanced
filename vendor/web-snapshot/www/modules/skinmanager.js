define([
  "exports",
  "./emby-apiclient/connectionmanager.js",
  "./common/servicelocator.js",
  "./common/usersettings/usersettings.js",
  "./browser.js",
  "./emby-apiclient/events.js",
  "./backdrop/backdrop.js",
  "./common/appsettings.js",
], function (_exports, _connectionmanager, _servicelocator, _usersettings, _browser, _events, _backdrop, _appsettings) {
  var themeStyleElement, currentThemeId, currentThemeSettings;
  function tryRemove(elem) {
    try {
      elem.remove();
    } catch (err) {
      console.log("Error removing child node: " + err);
    }
  }
  Object.defineProperty(_exports, "__esModule", {value: !0}), (_exports.default = void 0);
  var supportsCssVariables = CSS.supports("color", "var(--fake-var)");
  var defaultSettingsThemeIsMainTheme = !supportsCssVariables || _servicelocator.appHost.supports("multiserver");
  var accentNode,
    skinManager = {
      loadSkin: function () {
        return skinManager.setTheme(_usersettings.default.theme());
      },
      loadUserSkin: function (options) {
        return skinManager.setTheme(_usersettings.default.theme()).then(function () {
          (options = options || {}).start ? Emby.Page.invokeShortcut(options.start) : Emby.Page.goHome();
        });
      },
      getThemes: function () {
        var defaultTheme = "blueradiance",
          themes = (supportsCssVariables && _browser.default.electron && (defaultTheme = "blueradiance"), []);
        return (
          supportsCssVariables &&
          themes.push({name: "默认主题", id: "blueradiance", isSettingsDefault: !defaultSettingsThemeIsMainTheme, baseThemeId: "darkgradient"}),
          themes.push({name: "苹果电视", id: "appletv", isDefault: "appletv" === defaultTheme}),
          themes.push({name: "黑色优雅", id: "black", isDefault: "black" === defaultTheme}),
          supportsCssVariables &&
          themes.push({name: "蓝色绚雅", id: "blueradiance", isDefault: "blueradiance" === defaultTheme, baseThemeId: "darkgradient"}),
          themes.push({name: "深色暗雅", id: "dark", isDefault: "dark" === defaultTheme}),
          supportsCssVariables &&
          themes.push({name: "浅色淡雅", id: "light", isDefault: "light" === defaultTheme}),
          themes.push({name: "万紫千红", id: "superman", isDefault: "superman" === defaultTheme, baseThemeId: "darkgradient"}),
          themes.push({name: "媒体中心", id: "wmc", isDefault: "wmc" === defaultTheme, baseThemeId: "darkgradient"}),
          themes
        );
      },
    };
  function onRegistrationSuccess() {
    _appsettings.default.set("appthemesregistered", "true");
  }
  function onRegistrationFailure() {
    _appsettings.default.set("appthemesregistered", "false");
  }
  function isRegistered() {
    return (
      require(["registrationServices"]).then(function (deps) {
        deps[0].validateFeature("themes", {showDialog: !1}).then(onRegistrationSuccess, onRegistrationFailure);
      }),
      "false" !== _appsettings.default.get("appthemesregistered")
    );
  }
  function setThemeOptionClassname(value, prefix) {
    for (
      var elem = document.documentElement, classesToRemove = [], i = 0, length = elem.classList.length;
      i < length;
      i++
    ) {
      var className = elem.classList[i];
      className.startsWith(prefix) && classesToRemove.push(className);
    }
    for (var _i = 0, _length = classesToRemove.length; _i < _length; _i++) elem.classList.remove(classesToRemove[_i]);
    elem.classList.add(prefix + value);
  }
  function loadAccentColor() {
    accentNode ||
      ((accentNode = (function () {
        for (
          var link = document.createElement("style"),
            list =
              ((link.type = "text/css"),
              (function () {
                var list = [];
                return (
                  list.push({
                    colorLightBg:
                      "hsl(var(--theme-primary-color-hue), var(--theme-primary-color-saturation), var(--theme-primary-color-lightness))",
                    colorDarkBg:
                      "hsl(var(--theme-primary-color-hue), var(--theme-primary-color-saturation), var(--theme-primary-color-lightness))",
                    primaryColorHue: "207",
                    primaryColorSaturation: "89.74%",
                    primaryColorLightness: "54.12%",
                    name: "blue",
                  }),
                  list.push({
                    colorLightBg:
                      "hsl(var(--theme-primary-color-hue), var(--theme-primary-color-saturation), var(--theme-primary-color-lightness))",
                    colorDarkBg: "hotpink",
                    primaryColorHue: "340",
                    primaryColorSaturation: "82.19%",
                    primaryColorLightness: "51.57%",
                    name: "pink",
                  }),
                  list.push({
                    colorLightBg:
                      "hsl(var(--theme-primary-color-hue), var(--theme-primary-color-saturation), var(--theme-primary-color-lightness))",
                    colorDarkBg: "mediumpurple",
                    primaryColorHue: "262",
                    primaryColorSaturation: "51.87%",
                    primaryColorLightness: "47.25%",
                    name: "purple",
                  }),
                  list.push({
                    colorLightBg:
                      "hsl(var(--theme-primary-color-hue), var(--theme-primary-color-saturation), var(--theme-primary-color-lightness))",
                    colorDarkBg: "red",
                    primaryColorHue: "0",
                    primaryColorSaturation: "60%",
                    primaryColorLightness: "50%",
                    name: "red",
                  }),
                  list.push({
                    colorLightBg: "orangered",
                    colorDarkBg: "orangered",
                    primaryColorHue: "16",
                    primaryColorSaturation: "100%",
                    primaryColorLightness: "50%",
                    name: "orangered",
                  }),
                  list.push({
                    colorLightBg: "green",
                    colorDarkBg: "#6CCF65",
                    primaryColorHue: "116",
                    primaryColorSaturation: "41.7%",
                    primaryColorLightness: "50.2%",
                    name: "emby",
                  }),
                  list
                );
              })()),
            html = "",
            i = 0,
            length = list.length;
          i < length;
          i++
        )
          var accent = list[i],
            html =
              (html =
                (html =
                  (html =
                    (html =
                      (html += " .accent-" + accent.name + ":root {") +
                      ("--theme-primary-color-hue: " + accent.primaryColorHue + ";")) +
                    ("--theme-primary-color-saturation: " + accent.primaryColorSaturation + ";")) +
                  ("--theme-primary-color-lightness: " + accent.primaryColorLightness + ";")) +
                ("--theme-accent-text-color-darkbg: " + accent.colorDarkBg + ";")) +
              ("--theme-accent-text-color-lightbg: " + accent.colorLightBg + ";") +
              "}";
        return (link.innerHTML = html), link;
      })()),
      (document.head || document.querySelector("head")).appendChild(accentNode));
    var accent = _usersettings.default.accentColor() || "emby";
    if ("emby" === accent || isRegistered()) {
      for (
        var elem = document.documentElement, classesToRemove = [], i = 0, length = elem.classList.length;
        i < length;
        i++
      ) {
        var className = elem.classList[i];
        className.startsWith("accent-") && classesToRemove.push(className);
      }
      for (var _i2 = 0, _length2 = classesToRemove.length; _i2 < _length2; _i2++)
        elem.classList.remove(classesToRemove[_i2]);
      setThemeOptionClassname(accent, "accent-");
    }
  }
  var currentThemeType,
    linkId = Date.now(),
    defaultLogoImageTypes =
      ((skinManager.setTheme = function (id, context) {
        return new Promise(function (resolve, reject) {
          var info,
            nextSibling,
            elementId,
            requiresRegistration = !0,
            isSettings = "settings" === context,
            updateLastTheme = !isSettings;
          "auto" === id &&
            _servicelocator.appHost.getPreferredTheme &&
            ((id = _servicelocator.appHost.getPreferredTheme() || "dark"), (requiresRegistration = !1)),
            currentThemeId && currentThemeId === id
              ? resolve()
              : ((info = (function (id, isSettings, requiresRegistration) {
                  id ||
                    isSettings ||
                    ((apiClient = _connectionmanager.default.currentApiClient()) && apiClient.getCurrentUserId()) ||
                    (id = _appsettings.default.get("lastTheme"));
                  for (
                    var defaultMainTheme,
                      defaultSettingsTheme,
                      themes = skinManager.getThemes(),
                      i = 0,
                      length = themes.length;
                    i < length;
                    i++
                  ) {
                    var theme = themes[i];
                    theme.isDefault
                      ? (defaultMainTheme = theme)
                      : theme.isSettingsDefault && (defaultSettingsTheme = theme),
                      id === theme.id && (selectedTheme = theme);
                  }
                  defaultSettingsThemeIsMainTheme && (defaultSettingsTheme = defaultMainTheme);
                  var selectedTheme,
                    apiClient = isSettings && "maintheme" !== id ? defaultSettingsTheme : defaultMainTheme;
                  return (
                    (selectedTheme = selectedTheme || apiClient).id !== apiClient.id &&
                      requiresRegistration &&
                      !isRegistered() &&
                      (selectedTheme = apiClient),
                    {
                      themeSettingsPath:
                        "text!" +
                        Emby.Page.baseUrl() +
                        "/modules/themes/" +
                        (selectedTheme.baseThemeId || selectedTheme.id) +
                        "/theme.json",
                      stylesheetPath:
                        Emby.Page.baseUrl() +
                        "/modules/themes/" +
                        (selectedTheme.baseThemeId || selectedTheme.id) +
                        "/theme.css",
                      themeId: selectedTheme.id,
                    }
                  );
                })(id, isSettings, requiresRegistration)),
                currentThemeId && currentThemeId === info.themeId
                  ? resolve()
                  : ((isSettings = info.stylesheetPath),
                    (requiresRegistration = themeStyleElement) &&
                      (supportsCssVariables ||
                        ((nextSibling = requiresRegistration.nextSibling) &&
                          nextSibling.getAttribute("data-cssvars-job") &&
                          tryRemove(nextSibling)),
                      tryRemove(requiresRegistration),
                      (currentThemeSettings = currentThemeId = themeStyleElement = null)),
                    (nextSibling = document.createElement("link")),
                    (elementId = "link_" + ++linkId),
                    (nextSibling.id = elementId),
                    nextSibling.setAttribute("rel", "stylesheet"),
                    nextSibling.setAttribute("type", "text/css"),
                    (nextSibling.onload = function () {
                      supportsCssVariables ||
                        !(function (elementId) {
                          require(["cssVars"], function (cssVars) {
                            cssVars({
                              watch: !1,
                              include: "#" + elementId,
                              onlyLegacy: !1,
                              preserveVars: !1,
                              shadowDOM: !1,
                            });
                          });
                        })(elementId),
                        (function (themeInfo, updateLastTheme, resolveFn) {
                          document.documentElement.classList.remove("preload"),
                            updateLastTheme && _appsettings.default.set("lastTheme", themeInfo.themeId),
                            require([themeInfo.themeSettingsPath], function (themeSettingsJson) {
                              currentThemeSettings = JSON.parse(themeSettingsJson);
                              try {
                                _servicelocator.appHost.setTheme(currentThemeSettings);
                              } catch (err) {
                                console.log("Error setting theme color: " + err);
                              }
                              loadAccentColor(), resolveFn();
                            });
                        })(info, updateLastTheme, resolve);
                    }),
                    nextSibling.setAttribute("href", isSettings),
                    document.head.appendChild(nextSibling),
                    (themeStyleElement = nextSibling),
                    setThemeOptionClassname((currentThemeId = info.themeId), "theme-")));
        });
      }),
      ["Logo"]);
  function changeTheme(viewType) {
    var context,
      mainTheme = _usersettings.default.theme();
    if (1 === viewType)
      return (
        (context = "settings"),
        (viewType = _usersettings.default.settingsTheme()),
        void skinManager.setTheme(
          (viewType =
            "maintheme" === (viewType = !viewType && defaultSettingsThemeIsMainTheme ? "maintheme" : viewType) &&
            mainTheme
              ? mainTheme
              : viewType),
          context
        )
      );
    skinManager.setTheme(mainTheme, context);
  }
  (skinManager.getPreferredLogoImageTypes = function () {
    return (currentThemeSettings && currentThemeSettings.preferredLogoImageTypes) || defaultLogoImageTypes;
  }),
    document.addEventListener("viewbeforeshow", function (e) {
      e = e.detail.settingsTheme ? 1 : 0;
      e !== currentThemeType && changeTheme((currentThemeType = e));
    }),
    _events.default.on(_usersettings.default, "change", function (e, name) {
      "appTheme" === name || "settingsTheme" === name
        ? changeTheme(currentThemeType)
        : "accentColor" === name && loadAccentColor();
    }),
    _events.default.on(_connectionmanager.default, "localusersignedin", function (e) {
      currentThemeType = null;
    }),
    (_exports.default = skinManager);
});
