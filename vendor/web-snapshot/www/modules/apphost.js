define(["exports", "./browser.js", "./common/appsettings.js", "./emby-apiclient/events.js"], function (
  _exports,
  _browser,
  _appsettings,
  _events
) {
  function containsGreaseChar(value) {
    return (
      value.includes("\\") ||
      value.includes("/") ||
      value.includes(";") ||
      value.includes('"') ||
      value.toLowerCase().includes("brand")
    );
  }
  function isGenericBrand(value) {
    return !!(value = value.toLowerCase()).includes("chromium");
  }
  function compareBrands(a, b) {
    (a = a.brand || ""), (b = b.brand || "");
    return containsGreaseChar(a) && !containsGreaseChar(b)
      ? 1
      : !containsGreaseChar(a) && containsGreaseChar(b)
      ? -1
      : isGenericBrand(a) && !isGenericBrand(b)
      ? 1
      : (!isGenericBrand(a) && isGenericBrand(b)) || a < b
      ? -1
      : b < a
      ? 1
      : 0;
  }
  function map(i) {
    return i;
  }
  function getDeviceName() {
    if (_browser.default.tizen)
      return (
        (_deviceName = "Samsung Smart TV"),
        (_deviceName +=
          self.webapis && self.webapis.productinfo ? " (" + self.webapis.productinfo.getRealModel() + ")" : ""),
        Promise.resolve(_deviceName)
      );
    if (self.webos || self.PalmSystem)
      return new Promise(function (resolve) {
        require(["native/webos/webOSTV"], function () {
          webOS.deviceInfo(function (device) {
            var deviceName = "LG Smart TV";
            (deviceName += 0 < device.modelName.length ? " (" + device.modelName + ")" : ""), resolve(deviceName);
          });
        });
      });
    if (self.Windows)
      return Promise.resolve(
        (function () {
          try {
            var currentDeviceInfo = new Windows.Security.ExchangeActiveSyncProvisioning.EasClientDeviceInformation();
            if (currentDeviceInfo.friendlyName && currentDeviceInfo.friendlyName.length)
              return currentDeviceInfo.friendlyName;
          } catch (err) {}
          return "Windows.Xbox" !== Windows.System.Profile.AnalyticsInfo.versionInfo.deviceFamily
            ? "Windows"
            : "Xbox One";
        })()
      );
    if (_browser.default.operaTv) return Promise.resolve("Opera TV");
    var _deviceName = Array.prototype.map.call(navigator.userAgentData.brands || [], map).sort(compareBrands),
      deviceName = (deviceName = _deviceName.length ? _deviceName[0].brand : deviceName) || "Web Browser";
    return navigator.userAgentData.getHighEntropyValues(["platform"]).then(function (values) {
      return values.platform && (deviceName += " " + values.platform), Promise.resolve(deviceName);
    });
  }
  Object.defineProperty(_exports, "__esModule", {value: !0}), (_exports.default = void 0);
  (features = {}),
    navigator.share && (features.sharing = !0),
    "windows" === self.appMode || "winjs" === self.appMode || _browser.default.tv || (features.filedownload = !0),
    (_browser.default.operaTv || self.tizen || _browser.default.web0s) && (features.exit = !0),
    _browser.default.web0s || (features.exitmenu = !0),
    _browser.default.web0s || _browser.default.tizen || ((features.plugins = !0), (features.screensaver = !0)),
    _browser.default.operaTv ||
      _browser.default.tizen ||
      _browser.default.web0s ||
      _browser.default.playstation ||
      ((features.externallinks = !0), (features.externalpremium = !0)),
    _browser.default.operaTv || ((features.externallinkdisplay = !0), (features.externalappinfo = !0)),
    _browser.default.tv ||
      ((features.displaymode = !0),
      "windows" !== self.appMode && "winjs" !== self.appMode && (features.fullscreenmediaqueries = !0)),
    ("windows" !== self.appMode && "winjs" !== self.appMode) || _browser.default.xboxOne || (features.sync = !0),
    (function () {
      var element;
      if (!_browser.default.tv && "undefined" != typeof document)
        return (
          (element = document.documentElement).requestFullscreen ||
          element.mozRequestFullScreen ||
          element.webkitRequestFullscreen ||
          element.msRequestFullscreen ||
          !!document.createElement("video").webkitEnterFullscreen
        );
    })() && (features.fullscreenchange = !0),
    _browser.default.tizen ||
      _browser.default.edge ||
      _browser.default.operaTv ||
      _browser.default.web0s ||
      (navigator.hardwareConcurrency || 4) < 4 ||
      (navigator.deviceMemory || 0) < 2 ||
      !self.AudioContext ||
      !document.createElement("audio").canPlayType("audio/mp3").replace(/no/, "") ||
      (features.soundeffects = !0),
    ("winjs" === self.appMode ||
      "windows" === self.appMode ||
      _browser.default.operaTv ||
      self.tizen ||
      _browser.default.web0s ||
      0 === self.location.href.toLowerCase().indexOf("https")) &&
      (features.connectsignup = !0),
    (isLocalServer = !self.appMode) ||
      ((features.multiserver = !0),
      _browser.default.electron ||
        ("https:" === (self.location || {}).protocol && (features.rejectinsecureaddresses = !0))),
    _browser.default.tv && ((features.physicalvolumecontrol = !0), (features.nativevolumeosd = !0)),
    _browser.default.tv || (features.remotecontrol = !0),
    (features.otherapppromotions = !0),
    (features.targetblank = !0),
    (features.subtitleappearancesettings = !0),
    _browser.default.tv || (features.fileinput = !0),
    (self.Windows &&
      Windows.System &&
      "Windows.Xbox" === Windows.System.Profile.AnalyticsInfo.versionInfo.deviceFamily) ||
      (features.youtube = !0),
    _browser.default.chrome && (features.chromecast = !0),
    (function () {
      if (self.matchMedia)
        try {
          var isDarkMode = window.matchMedia("(prefers-color-scheme: dark)").matches,
            isLightMode = window.matchMedia("(prefers-color-scheme: light)").matches,
            isNotSpecified = window.matchMedia("(prefers-color-scheme: no-preference)").matches;
          return !(!isDarkMode && !isLightMode && !isNotSpecified);
        } catch (err) {
          return;
        }
    })() && (features.preferredtheme = !0),
    self.tizen ||
      self.webos ||
      self.PalmSystem ||
      "windows" === self.appMode ||
      "winjs" === self.appMode ||
      (features.premiereinheader = !0),
    _browser.default.tv || (features.keyboardsettings = !0),
    _browser.default.tv && (features.physicalbackbutton = !0),
    self.tizen || _browser.default.operaTv || _browser.default.web0s || (features.serversetup = !0),
    "standalone" !== self.appMode || _browser.default.tv || isLocalServer || (features.redirecttolocalserver = !0),
    self.SpeechRecognition && self.isSecureContext && (features.speechrecognition = !0);
  var features,
    deviceId,
    deviceName,
    supportedFeatures = features;
  function brandsContain(brands, txt) {
    for (var i = 0, length = brands.length; i < length; i++)
      if ((brands[i].brand || "").toLowerCase().includes(txt)) return 1;
  }
  var appVersion,
    appName = _browser.default.electron
      ? "Emby Theater"
      : _browser.default.web0s
      ? "Emby for LG"
      : _browser.default.tizen
      ? "Emby for Samsung"
      : "windows" === self.appMode || "winjs" === self.appMode
      ? "Emby for Windows"
      : "Emby Web",
    appHost = {
      getWindowState: function () {
        return document.windowState || "Normal";
      },
      setWindowState: function (state) {
        throw new Error("setWindowState is not supported and should not be called");
      },
      exit: function () {
        if ((_events.default.trigger(this, "beforeexit"), window.NetCastExit))
          try {
            window.NetCastExit();
          } catch (err) {
            console.log("error closing application: " + err);
          }
        else if (window.webOS)
          try {
            webOS.platformBack();
          } catch (err) {
            console.log("error closing application: " + err);
          }
        else if (window.tizen)
          try {
            tizen.application.getCurrentApplication().exit();
          } catch (err) {
            console.log("error closing application: " + err);
          }
        else window.close();
      },
      supports: function (command) {
        return supportedFeatures[command];
      },
      moreIcon: "dots-horiz",
      getSyncProfile: function () {
        return require(["browserdeviceprofile"]).then(function (responses) {
          return (0, responses[0])({maxStaticMusicBitrate: _appsettings.default.maxStaticMusicBitrate()});
        });
      },
      init: function () {
        return (function () {
          if (self.Windows && Windows.System) {
            try {
              var sysIdInfo = Windows.System.Profile.SystemIdentification.getSystemIdForPublisher();
              if (0 < sysIdInfo.id.length)
                return (
                  (sysIdString = (sysIdString = (sysIdString = (sysIdString =
                    Windows.Security.Cryptography.CryptographicBuffer.encodeToBase64String(sysIdInfo.id)).replaceAll(
                    "+",
                    ""
                  )).replaceAll("/", "")).replaceAll("=", "")),
                  Promise.resolve(sysIdString)
                );
            } catch (ex) {}
            sysIdInfo = new Windows.Security.ExchangeActiveSyncProvisioning.EasClientDeviceInformation();
            return Promise.resolve(sysIdInfo.id);
          }
          var sysIdString = "_deviceId2";
          return (
            (sysIdInfo = _appsettings.default.get(sysIdString)) ||
              ((sysIdInfo = crypto.randomUUID()), _appsettings.default.set(sysIdString, sysIdInfo)),
            Promise.resolve(sysIdInfo)
          );
        })().then(function (generatedDeviceId) {
          return getDeviceName().then(function (generatedDeviceName) {
            return (
              self.Windows && Windows.ApplicationModel
                ? ((version = Windows.ApplicationModel.Package.current.id.version),
                  Promise.resolve(version.major + "." + version.minor + "." + version.build + "." + version.revision))
                : self.tizen && self.tizen.application && tizen.application.getAppInfo
                ? Promise.resolve(tizen.application.getAppInfo().version)
                : self.curWidget && self.curWidget.version
                ? Promise.resolve(self.curWidget.version)
                : self.webOS && self.webOS.fetchAppInfo
                ? new Promise(function (resolve) {
                    self.webOS.fetchAppInfo(function (info) {
                      resolve(info.version);
                    });
                  })
                : Promise.resolve(self.dashboardVersion || "3.0.0")
            ).then(function (generatedAppVersion) {
              (deviceId = generatedDeviceId), (deviceName = generatedDeviceName), (appVersion = generatedAppVersion);
            });
            var version;
          });
        });
      },
      deviceName: function () {
        return deviceName;
      },
      deviceId: function () {
        return deviceId;
      },
      appName: function () {
        return appName;
      },
      appVersion: function () {
        return appVersion;
      },
      getPushTokenInfo: function () {
        return {};
      },
      setTheme: function (themeSettings) {
        var metaThemeColor = document.querySelector("meta[name=theme-color]");
        metaThemeColor && metaThemeColor.setAttribute("content", themeSettings.themeColor);
      },
      setUserScalable: function (scalable) {
        _browser.default.tv ||
          ((scalable = scalable
            ? "viewport-fit=cover, width=device-width, initial-scale=1, minimum-scale=1, user-scalable=yes"
            : "viewport-fit=cover, width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no"),
          document.querySelector("meta[name=viewport]").setAttribute("content", scalable));
      },
      deviceIconUrl: function () {
        var brands = navigator.userAgentData.brands || [];
        return _browser.default.xboxOne
          ? "https://github.com/MediaBrowser/Emby.Resources/raw/master/images/devices/xboxone.png"
          : "windows" === self.appMode || "winjs" === self.appMode
          ? "https://github.com/MediaBrowser/Emby.Resources/raw/master/images/devices/windowsrt.png"
          : _browser.default.opera || _browser.default.operaTv
          ? "https://github.com/MediaBrowser/Emby.Resources/raw/master/images/devices/opera.png"
          : _browser.default.tizen
          ? "https://github.com/MediaBrowser/Emby.Resources/raw/master/images/devices/samsungtv.png"
          : _browser.default.web0s || _browser.default.netcast
          ? "https://github.com/MediaBrowser/Emby.Resources/raw/master/images/devices/lgtv.png"
          : _browser.default.playstation
          ? "https://github.com/MediaBrowser/Emby.Resources/raw/master/images/devices/playstation.png"
          : _browser.default.chromecast
          ? "https://github.com/MediaBrowser/Emby.Resources/raw/master/images/devices/chromecast.png"
          : brandsContain(brands, "chrome")
          ? "https://github.com/MediaBrowser/Emby.Resources/raw/master/images/devices/chrome.png"
          : brandsContain(brands, "safari")
          ? "https://github.com/MediaBrowser/Emby.Resources/raw/master/images/devices/safari.png"
          : brandsContain(brands, "firefox")
          ? "https://github.com/MediaBrowser/Emby.Resources/raw/master/images/devices/firefox.png"
          : brandsContain(brands, "edge")
          ? "https://github.com/MediaBrowser/Emby.Resources/raw/master/images/devices/edge.png"
          : "https://github.com/MediaBrowser/Emby.Resources/raw/master/images/devices/html5.png";
      },
      getPreferredTheme: function () {
        try {
          if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
          if (window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
        } catch (err) {}
        return null;
      },
      getKeyOptions: function () {
        return {handleAltLeftBack: !!self.Windows, handleAltRightForward: !!self.Windows};
      },
      getDefaultLayout: function () {
        if (self.Windows && Windows.System)
          switch (Windows.System.Profile.AnalyticsInfo.versionInfo.deviceFamily) {
            case "Windows.Desktop":
              return Windows.UI.ViewManagement.UIViewSettings.getForCurrentView().userInteractionMode ===
                Windows.UI.ViewManagement.UserInteractionMode.touch
                ? "mobile"
                : "desktop";
            case "Windows.Mobile":
              return "mobile";
            case "Windows.Xbox":
              return "tv";
            default:
              return "mobile";
          }
        return null;
      },
      requestSpeechRecognitionPermission: function () {
        return Promise.resolve();
      },
    },
    isLocalServer = self.document,
    _isHidden = !1;
  function onAppVisible() {
    _isHidden && ((_isHidden = !1), _events.default.trigger(appHost, "resume"));
  }
  function onAppHidden() {
    _isHidden = _isHidden || !0;
  }
  isLocalServer &&
    isLocalServer.addEventListener("visibilitychange", function () {
      (document.hidden ? onAppHidden : onAppVisible)();
    }),
    self.addEventListener &&
      isLocalServer &&
      (self.addEventListener("focus", onAppVisible), self.addEventListener("blur", onAppHidden)),
    (_exports.default = appHost);
});
